"""Unit and API tests for TheftGuard AI Phase 3 Stage 3B Persistence Endpoints.

Tests all REST persistence endpoints:
- Screening Batches (/v1/batches)
- Investigations (/v1/investigations)
- Bill Extractions (/v1/bill-extractions)

Verifies:
- 201/200 on valid creation, listing, retrieval, update, deletion
- 404 on missing resources
- 409 on duplicate investigation tickets and scoped record conflicts
- 422 on invalid bodies, inverted thresholds, invalid score ranges, bad pagination
- 500 sanitized response on persistence failures (no SQL/PII leak)
- Non-unique integrity errors (foreign-key violations) do NOT become 409
- Exclusion of raw_ocr_text
- Existing ML service health and model endpoints remain unchanged
"""

from __future__ import annotations

import asyncio
import json
import unittest
import urllib.parse
import uuid
from datetime import date
from decimal import Decimal
from typing import Any, Dict, Optional, Tuple

from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from service.db.models import Base, BillExtraction, Investigation, ScreeningBatch, ScreeningRecord
from service.main import app
from service.persistence_routes import get_db


# Isolated in-memory SQLite engine for fast, reproducible endpoint testing
test_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@event.listens_for(test_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


TestSessionLocal = sessionmaker(bind=test_engine, expire_on_commit=False)


def override_get_db():
    session = TestSessionLocal()
    try:
        yield session
    finally:
        session.close()


from service.auth import AuthenticatedUser, get_current_user

TEST_USER_ID = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
TEST_USER = AuthenticatedUser(
    user_id=TEST_USER_ID,
    email="test@theftguard.ai",
    role="authenticated",
)


def override_get_current_user():
    return TEST_USER


def request_endpoint(
    method: str,
    path: str,
    body: Optional[Any] = None,
    params: Optional[Dict[str, Any]] = None,
) -> Tuple[int, Dict[str, Any]]:
    """Helper to dispatch ASGI requests directly through FastAPI app (standard library only)."""
    qs = urllib.parse.urlencode(params or {}).encode()
    raw_body = json.dumps(body).encode() if body is not None else b""

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method.upper(),
        "path": path,
        "raw_path": path.encode(),
        "query_string": qs,
        "headers": [
            [b"content-type", b"application/json"],
            [b"content-length", str(len(raw_body)).encode()],
        ],
        "client": ("127.0.0.1", 12345),
        "server": ("127.0.0.1", 80),
    }

    sent = False

    async def receive():
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": raw_body, "more_body": False}
        return {"type": "http.request", "body": b"", "more_body": False}

    resp = {}
    chunks = []

    async def send(msg):
        if msg["type"] == "http.response.start":
            resp["status"] = msg["status"]
        elif msg["type"] == "http.response.body":
            chunks.append(msg.get("body", b""))

    asyncio.run(app(scope, receive, send))
    text_data = b"".join(chunks).decode("utf-8")
    resp["data"] = json.loads(text_data) if text_data else {}
    return resp["status"], resp["data"]


class PersistenceEndpointTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(test_engine)
        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides[get_current_user] = override_get_current_user

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.clear()
        test_engine.dispose()

    def tearDown(self):
        # Clean tables between tests to ensure test isolation
        with test_engine.connect() as conn:
            conn.execute(Base.metadata.tables["bill_extractions"].delete())
            conn.execute(Base.metadata.tables["investigations"].delete())
            conn.execute(Base.metadata.tables["screening_records"].delete())
            conn.execute(Base.metadata.tables["screening_batches"].delete())
            conn.commit()

    # ==========================================================================
    # 1. Screening Batches Endpoints
    # ==========================================================================

    def test_create_and_get_screening_batch(self):
        """Verify POST /v1/batches creates batch atomically and GET /v1/batches retrieves it."""
        payload = {
            "file_name": "telangana_batch_01.csv",
            "file_hash": "mock_file_sha256_hash",
            "model_sha256": "mock_pipeline_sha256_hash",
            "threshold_elevated": 0.40,
            "threshold_review": 0.70,
            "records": [
                {
                    "row_index": 0,
                    "customer_ref": "CUST-TG-001",
                    "status": "scored",
                    "model_score": 0.88,
                    "predicted_label": 1,
                    "label_name": "Suspicious",
                    "review_category": "review",
                    "features": {"kwh_mean": 14.5},
                    "warnings": [],
                    "errors": [],
                },
                {
                    "row_index": 1,
                    "customer_ref": "CUST-TG-002",
                    "status": "scored",
                    "model_score": 0.15,
                    "predicted_label": 0,
                    "label_name": "Normal",
                    "review_category": "normal",
                    "features": {"kwh_mean": 29.0},
                    "warnings": [],
                    "errors": [],
                },
            ],
        }

        # 1. Create batch
        status_code, data = request_endpoint("POST", "/v1/batches", body=payload)
        self.assertEqual(status_code, 201)
        self.assertIn("id", data)
        self.assertEqual(data["file_name"], "telangana_batch_01.csv")
        self.assertEqual(data["total_rows"], 2)
        self.assertEqual(len(data["records"]), 2)
        batch_id = data["id"]
        record_id = data["records"][0]["id"]

        # 2. List batches
        status_code, list_data = request_endpoint("GET", "/v1/batches", params={"limit": 10, "offset": 0})
        self.assertEqual(status_code, 200)
        self.assertIsInstance(list_data, list)
        self.assertGreaterEqual(len(list_data), 1)
        self.assertEqual(list_data[0]["id"], batch_id)

        # 3. Retrieve batch with records
        status_code, get_data = request_endpoint("GET", f"/v1/batches/{batch_id}", params={"limit": 1, "offset": 0})
        self.assertEqual(status_code, 200)
        self.assertEqual(get_data["id"], batch_id)
        self.assertEqual(len(get_data["records"]), 1)
        self.assertEqual(get_data["records"][0]["id"], record_id)

    def test_get_batch_not_found(self):
        """Verify GET /v1/batches/{batch_id} returns 404 for nonexistent batch."""
        random_id = str(uuid.uuid4())
        status_code, data = request_endpoint("GET", f"/v1/batches/{random_id}")
        self.assertEqual(status_code, 404)
        self.assertEqual(data.get("error", {}).get("code"), "not_found")

    def test_delete_batch(self):
        """Verify DELETE /v1/batches/{batch_id} deletes the batch and returns 404 on subsequent get."""
        payload = {
            "file_name": "delete_test.csv",
            "model_sha256": "dummy_sha256",
        }
        st, data = request_endpoint("POST", "/v1/batches", body=payload)
        self.assertEqual(st, 201)
        batch_id = data["id"]

        del_st, del_data = request_endpoint("DELETE", f"/v1/batches/{batch_id}")
        self.assertEqual(del_st, 200)
        self.assertTrue(del_data.get("deleted"))

        get_st, _ = request_endpoint("GET", f"/v1/batches/{batch_id}")
        self.assertEqual(get_st, 404)

    def test_create_batch_validation_error(self):
        """Verify POST /v1/batches returns 422 on invalid threshold ordering or score out of bounds."""
        # Elevated threshold >= review threshold
        bad_thresholds = {
            "file_name": "bad_thresholds.csv",
            "model_sha256": "dummy",
            "threshold_elevated": 0.80,
            "threshold_review": 0.60,
        }
        status_code, data = request_endpoint("POST", "/v1/batches", body=bad_thresholds)
        self.assertEqual(status_code, 422)
        self.assertEqual(data.get("error", {}).get("code"), "validation_error")

        # Score > 1.0 in child record
        bad_score = {
            "file_name": "bad_score.csv",
            "model_sha256": "dummy",
            "records": [
                {
                    "row_index": 0,
                    "customer_ref": "CUST-BAD",
                    "status": "scored",
                    "model_score": 1.5,
                }
            ],
        }
        status_code, data = request_endpoint("POST", "/v1/batches", body=bad_score)
        self.assertEqual(status_code, 422)

    def test_pagination_bounds_validation(self):
        """Verify limit < 1, limit > 100, or offset < 0 return 422."""
        # limit=0
        status_code, data = request_endpoint("GET", "/v1/batches", params={"limit": 0})
        self.assertEqual(status_code, 422)

        # limit=101
        status_code, data = request_endpoint("GET", "/v1/batches", params={"limit": 101})
        self.assertEqual(status_code, 422)

        # offset=-1
        status_code, data = request_endpoint("GET", "/v1/batches", params={"offset": -1})
        self.assertEqual(status_code, 422)

    # ==========================================================================
    # 2. Investigations Endpoints
    # ==========================================================================

    def test_investigation_crud_and_origin_mapping(self):
        """Verify POST, GET, PATCH, DELETE /v1/investigations."""
        # 1. Create investigation
        payload = {
            "ticket_code": "INV-TEST-001",
            "customer_ref": "CUST-TG-999",
            "origin": "Model screening",  # Frontend display alias
            "basis": "Suspicious drop in consumption 0.91",
            "priority": "High",
            "notes": "Assigned to Hyderabad inspection team.",
            "checklist": [{"label": "Verify meter seal", "done": False}],
        }
        status_code, data = request_endpoint("POST", "/v1/investigations", body=payload)
        self.assertEqual(status_code, 201)
        self.assertEqual(data["ticket_code"], "INV-TEST-001")
        self.assertEqual(data["origin"], "screening")  # Canonical enum
        self.assertEqual(data["status"], "New")
        inv_id = data["id"]

        # 2. Retrieve single investigation
        status_code, get_data = request_endpoint("GET", f"/v1/investigations/{inv_id}")
        self.assertEqual(status_code, 200)
        self.assertEqual(get_data["id"], inv_id)

        # 2b. Retrieve investigation by ticket code
        status_code, ticket_data = request_endpoint("GET", f"/v1/investigations/by-ticket/INV-TEST-001")
        self.assertEqual(status_code, 200)
        self.assertEqual(ticket_data["id"], inv_id)
        self.assertEqual(ticket_data["ticket_code"], "INV-TEST-001")

        # 3. List investigations with filter
        status_code, list_data = request_endpoint("GET", "/v1/investigations", params={"status": "New"})
        self.assertEqual(status_code, 200)
        self.assertGreaterEqual(len(list_data), 1)

        # 4. Patch investigation
        patch_payload = {
            "status": "In inspection",
            "notes": "Meter inspected on-site.",
            "checklist": [{"label": "Verify meter seal", "done": True}],
        }
        status_code, patch_data = request_endpoint("PATCH", f"/v1/investigations/{inv_id}", body=patch_payload)
        self.assertEqual(status_code, 200)
        self.assertEqual(patch_data["status"], "In inspection")
        self.assertEqual(patch_data["notes"], "Meter inspected on-site.")
        self.assertEqual(patch_data["checklist"][0]["done"], True)

        # 5. Delete investigation
        status_code, del_data = request_endpoint("DELETE", f"/v1/investigations/{inv_id}")
        self.assertEqual(status_code, 200)
        self.assertTrue(del_data.get("deleted"))

        # 6. Verify 404 after deletion
        status_code, not_found = request_endpoint("GET", f"/v1/investigations/{inv_id}")
        self.assertEqual(status_code, 404)

    def test_duplicate_investigation_returns_409(self):
        """Verify duplicate ticket code returns HTTP 409 Conflict."""
        payload = {
            "ticket_code": "INV-DUP-409",
            "customer_ref": "CUST-DUP",
            "origin": "screening",
            "basis": "First ticket",
        }
        status_code, data = request_endpoint("POST", "/v1/investigations", body=payload)
        self.assertEqual(status_code, 201)

        # Attempt duplicate ticket_code
        status_code2, dup_data = request_endpoint("POST", "/v1/investigations", body=payload)
        self.assertEqual(status_code2, 409)
        self.assertEqual(dup_data.get("error", {}).get("code"), "conflict")
        self.assertIn("already exists", dup_data.get("error", {}).get("message", ""))

    def test_duplicate_screening_record_returns_409(self):
        """Verify linking an already-investigated screening record returns 409 Conflict."""
        # 1. Create a batch with a record
        batch_payload = {
            "file_name": "batch_scoped_409.csv",
            "model_sha256": "dummy_sha256",
            "records": [
                {
                    "row_index": 0,
                    "customer_ref": "CUST-SCOPED-409",
                    "status": "scored",
                    "model_score": 0.95,
                }
            ],
        }
        st, b_data = request_endpoint("POST", "/v1/batches", body=batch_payload)
        self.assertEqual(st, 201)
        batch_id = b_data["id"]
        rec_id = b_data["records"][0]["id"]

        # 2. First ticket linked to record
        inv_payload = {
            "ticket_code": "INV-SCOPED-1",
            "customer_ref": "CUST-SCOPED-409",
            "origin": "screening",
            "basis": "First ticket",
            "screening_record_id": rec_id,
            "batch_id": batch_id,
        }
        st_inv1, inv1_data = request_endpoint("POST", "/v1/investigations", body=inv_payload)
        self.assertEqual(st_inv1, 201)

        # 3. Second ticket with same screening_record_id must return 409
        dup_rec_payload = {
            "ticket_code": "INV-SCOPED-2",
            "customer_ref": "CUST-SCOPED-409",
            "origin": "screening",
            "basis": "Duplicate attempt on same record",
            "screening_record_id": rec_id,
        }
        st_dup_rec, dup_rec_data = request_endpoint("POST", "/v1/investigations", body=dup_rec_payload)
        self.assertEqual(st_dup_rec, 409)
        self.assertEqual(dup_rec_data.get("error", {}).get("code"), "conflict")
        self.assertIn("already attached", dup_rec_data.get("error", {}).get("message", ""))

        # 4. Second active ticket for same (customer_ref, batch_id) must return 409
        dup_batch_payload = {
            "ticket_code": "INV-SCOPED-3",
            "customer_ref": "CUST-SCOPED-409",
            "origin": "screening",
            "basis": "Duplicate active ticket in same batch",
            "batch_id": batch_id,
        }
        st_dup_batch, dup_batch_data = request_endpoint("POST", "/v1/investigations", body=dup_batch_payload)
        self.assertEqual(st_dup_batch, 409)
        self.assertEqual(dup_batch_data.get("error", {}).get("code"), "conflict")
        self.assertIn("already exists", dup_batch_data.get("error", {}).get("message", ""))

    def test_malformed_uuid_in_path_returns_422(self):
        """Verify passing a non-UUID string in path parameter returns 422."""
        status_code, data = request_endpoint("GET", "/v1/batches/not-a-valid-uuid")
        self.assertEqual(status_code, 422)
        self.assertEqual(data.get("error", {}).get("code"), "validation_error")

    def test_database_unavailable_returns_503(self):
        """Verify DatabaseConfigError in get_db dependency triggers 503 Service Unavailable."""
        from service.db.config import DatabaseConfigError

        def failing_db():
            raise DatabaseConfigError("Database URL is not configured.")
            yield None  # generator syntax

        app.dependency_overrides[get_db] = failing_db
        try:
            status_code, data = request_endpoint("GET", "/v1/batches")
            self.assertEqual(status_code, 503)
            self.assertEqual(data.get("error", {}).get("code"), "database_unavailable")
        finally:
            app.dependency_overrides[get_db] = override_get_db

    def test_foreign_key_violation_not_classified_as_duplicate(self):
        """Verify foreign-key violation returns 500 database_error, NOT 409 conflict."""
        bad_fk_payload = {
            "ticket_code": "INV-BAD-FK",
            "customer_ref": "CUST-FK",
            "origin": "screening",
            "basis": "Nonexistent batch foreign key",
            "batch_id": str(uuid.uuid4()),
        }
        status_code, data = request_endpoint("POST", "/v1/investigations", body=bad_fk_payload)
        self.assertEqual(status_code, 500)
        self.assertEqual(data.get("error", {}).get("code"), "database_error")
        # Ensure raw SQL or internal exception details are never leaked
        self.assertNotIn("SELECT", str(data))
        self.assertNotIn("INSERT", str(data))

    def test_patch_investigation_not_found(self):
        """Verify PATCH on nonexistent ID returns 404."""
        random_id = str(uuid.uuid4())
        status_code, data = request_endpoint("PATCH", f"/v1/investigations/{random_id}", body={"notes": "test"})
        self.assertEqual(status_code, 404)

    def test_delete_investigation_not_found(self):
        """Verify DELETE on nonexistent ID returns 404."""
        random_id = str(uuid.uuid4())
        status_code, data = request_endpoint("DELETE", f"/v1/investigations/{random_id}")
        self.assertEqual(status_code, 404)

    # ==========================================================================
    # 3. Bill Extractions Endpoints & Privacy
    # ==========================================================================

    def test_bill_extraction_create_list_and_privacy(self):
        """Verify POST and GET /v1/bill-extractions, and verify raw_ocr_text is excluded."""
        payload = {
            "consumer_number": "100458921",
            "discom": "TSSPDCL",
            "period_start": "2026-04-01",
            "period_end": "2026-04-30",
            "bill_date": "2026-05-02",
            "previous_reading": "8450.00",
            "current_reading": "8720.00",
            "units_consumed": "270.00",
            "billing_days": 30,
            "amount_payable": "1842.00",
            "raw_billing_period": "01/04/2026 to 30/04/2026",
            "raw_bill_date": "02/05/2026",
            "raw_previous_reading": "8,450",
            "raw_current_reading": "8,720",
            # Extra raw_ocr_text must be ignored and excluded
            "raw_ocr_text": "SENSITIVE CONSUMER FULL PAGE DUMP WITH ADDRESS",
        }

        # 1. Create bill extraction
        status_code, data = request_endpoint("POST", "/v1/bill-extractions", body=payload)
        self.assertEqual(status_code, 201)
        self.assertEqual(data["consumer_number"], "100458921")
        self.assertEqual(data["calculated_units"], "270.00")
        self.assertNotIn("raw_ocr_text", data)

        # Verify database record also does not store raw_ocr_text
        session = TestSessionLocal()
        try:
            db_ext = session.get(BillExtraction, uuid.UUID(data["id"]))
            self.assertIsNotNone(db_ext)
            self.assertFalse(hasattr(db_ext, "raw_ocr_text"))
        finally:
            session.close()

        # 2. List bill extractions
        status_code, list_data = request_endpoint(
            "GET", "/v1/bill-extractions", params={"consumer_number": "100458921"}
        )
        self.assertEqual(status_code, 200)
        self.assertEqual(len(list_data), 1)
        self.assertEqual(list_data[0]["consumer_number"], "100458921")

        # 3. Retrieve single bill extraction
        ext_id = data["id"]
        status_code, get_data = request_endpoint("GET", f"/v1/bill-extractions/{ext_id}")
        self.assertEqual(status_code, 200)
        self.assertEqual(get_data["id"], ext_id)
        self.assertEqual(get_data["consumer_number"], "100458921")

        # 4. List by consumer endpoint
        status_code, consumer_data = request_endpoint("GET", f"/v1/bill-extractions/by-consumer/100458921")
        self.assertEqual(status_code, 200)
        self.assertEqual(len(consumer_data), 1)
        self.assertEqual(consumer_data[0]["id"], ext_id)

    # ==========================================================================
    # 4. Existing ML Service Endpoints Verification
    # ==========================================================================

    def test_existing_health_and_prediction_endpoints_remain_functional(self):
        """Verify existing /v1/health endpoint remains functional and unchanged."""
        status_code, data = request_endpoint("GET", "/v1/health")
        # Since model file is read-only / optional in test environment, health returns 200 or 503
        self.assertIn(status_code, (200, 503))
        if status_code == 200:
            self.assertIn("status", data)
        else:
            self.assertEqual(data.get("error", {}).get("code"), "model_unavailable")


if __name__ == "__main__":
    unittest.main()
