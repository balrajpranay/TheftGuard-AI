"""Unit and integration tests for TheftGuard AI Phase 2 Persistence Authentication & Ownership.

Tests:
1. Missing credentials:
   - Unauthenticated requests to persistence endpoints return HTTP 401 with WWW-Authenticate header.
2. Invalid & expired credentials:
   - Malformed, expired, and wrong-signature tokens return HTTP 401.
3. Multi-tenant isolation:
   - User A's records are completely invisible to User B.
   - User B receives HTTP 404 (not 403) when attempting to read, update, or delete User A's resources.
   - User B cannot attach an investigation to User A's batch or screening record (HTTP 404).
   - User B cannot link a bill extraction to User A's investigation (HTTP 404).
4. Strict server-side ownership:
   - Client-supplied `created_by` values in payloads are ignored; owner is always authenticated user UUID.
5. Legacy unowned records:
   - Legacy records with created_by=NULL are never exposed to authenticated user queries.
6. Public endpoints:
   - Genuinely stateless endpoints (/v1/health, /v1/model-metadata) remain public without credentials.
"""

from __future__ import annotations

import asyncio
import json
import os
import time
import unittest
import urllib.parse
import uuid
from typing import Any, Dict, List, Optional, Tuple

import jwt
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from service.auth import (
    ENV_SUPABASE_JWT_AUDIENCE,
    ENV_SUPABASE_JWT_ISSUER,
    ENV_SUPABASE_JWT_SECRET,
    get_auth_config,
    get_current_user,
)
from service.db.models import Base, BillExtraction, Investigation, ScreeningBatch, ScreeningRecord
from service.main import app
from service.persistence_routes import get_db

# Isolated in-memory SQLite engine for auth tests
test_auth_engine = create_engine(
    "sqlite:///:memory:",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


@event.listens_for(test_auth_engine, "connect")
def set_sqlite_pragma(dbapi_connection, connection_record):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()


TestAuthSessionLocal = sessionmaker(bind=test_auth_engine, expire_on_commit=False)


def override_get_db():
    session = TestAuthSessionLocal()
    try:
        yield session
    finally:
        session.close()


# Setup JWT signing environment for test suite
TEST_SECRET = "super-secret-supabase-jwt-token-signing-key-for-testing"
TEST_ISSUER = "https://test-project.supabase.co/auth/v1"
TEST_AUDIENCE = "authenticated"

USER_A_ID = uuid.UUID("11111111-1111-1111-1111-111111111111")
USER_B_ID = uuid.UUID("22222222-2222-2222-2222-222222222222")


def mint_token(
    user_id: uuid.UUID,
    secret: str = TEST_SECRET,
    expires_in: int = 3600,
    issuer: str = TEST_ISSUER,
    audience: str = TEST_AUDIENCE,
    role: str = "authenticated",
) -> str:
    now = int(time.time())
    payload = {
        "sub": str(user_id),
        "aud": audience,
        "iss": issuer,
        "iat": now,
        "exp": now + expires_in,
        "role": role,
        "email": f"user-{user_id.hex[:6]}@example.com",
    }
    return jwt.encode(payload, secret, algorithm="HS256")


def request_app(
    method: str,
    path: str,
    body: Optional[Any] = None,
    params: Optional[Dict[str, Any]] = None,
    token: Optional[str] = None,
) -> Tuple[int, Dict[str, Any], Dict[str, str]]:
    """Helper to dispatch ASGI requests directly through FastAPI app capturing response headers."""
    qs = urllib.parse.urlencode(params or {}).encode()
    raw_body = json.dumps(body).encode() if body is not None else b""

    headers = [
        [b"content-type", b"application/json"],
        [b"content-length", str(len(raw_body)).encode()],
    ]
    if token:
        headers.append([b"authorization", f"Bearer {token}".encode()])

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": method.upper(),
        "path": path,
        "raw_path": path.encode(),
        "query_string": qs,
        "headers": headers,
        "client": ("127.0.0.1", 12345),
        "server": ("127.0.0.1", 80),
    }

    sent = False

    async def receive():
        nonlocal sent
        if not sent:
            sent = True
            return {"type": "http.request", "body": raw_body, "more_body": False}
        return {"type": "http.disconnect"}

    resp = {}
    resp_headers = {}
    chunks = []

    async def send(msg):
        if msg["type"] == "http.response.start":
            resp["status"] = msg["status"]
            for k, v in msg.get("headers", []):
                resp_headers[k.decode("latin1").lower()] = v.decode("latin1")
        elif msg["type"] == "http.response.body":
            chunks.append(msg.get("body", b""))

    asyncio.run(app(scope, receive, send))
    text_data = b"".join(chunks).decode("utf-8")
    data = json.loads(text_data) if text_data else {}
    return resp["status"], data, resp_headers


class PersistenceAuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        Base.metadata.create_all(test_auth_engine)
        os.environ[ENV_SUPABASE_JWT_SECRET] = TEST_SECRET
        os.environ[ENV_SUPABASE_JWT_ISSUER] = TEST_ISSUER
        os.environ[ENV_SUPABASE_JWT_AUDIENCE] = TEST_AUDIENCE
        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides.pop(get_current_user, None)

    @classmethod
    def tearDownClass(cls):
        app.dependency_overrides.clear()
        test_auth_engine.dispose()
        os.environ.pop(ENV_SUPABASE_JWT_SECRET, None)
        os.environ.pop(ENV_SUPABASE_JWT_ISSUER, None)
        os.environ.pop(ENV_SUPABASE_JWT_AUDIENCE, None)

    def setUp(self):
        # Override db dependency only; do NOT override get_current_user to test real auth
        app.dependency_overrides[get_db] = override_get_db
        app.dependency_overrides.pop(get_current_user, None)

    def tearDown(self):
        with test_auth_engine.connect() as conn:
            conn.execute(Base.metadata.tables["bill_extractions"].delete())
            conn.execute(Base.metadata.tables["investigations"].delete())
            conn.execute(Base.metadata.tables["screening_records"].delete())
            conn.execute(Base.metadata.tables["screening_batches"].delete())
            conn.commit()

    # ==========================================================================
    # 1. Unauthenticated Requests Return 401 with WWW-Authenticate
    # ==========================================================================

    def test_missing_credentials_all_endpoints(self):
        """Verify unauthenticated requests to all persistence endpoints return 401."""
        endpoints = [
            ("POST", "/v1/batches", {"file_name": "test.csv", "model_sha256": "dummy"}),
            ("GET", "/v1/batches", None),
            ("GET", f"/v1/batches/{uuid.uuid4()}", None),
            ("DELETE", f"/v1/batches/{uuid.uuid4()}", None),
            ("POST", "/v1/investigations", {"ticket_code": "INV-X", "customer_ref": "C", "origin": "screening", "basis": "B"}),
            ("GET", "/v1/investigations", None),
            ("GET", f"/v1/investigations/{uuid.uuid4()}", None),
            ("GET", "/v1/investigations/by-ticket/INV-NONE", None),
            ("PATCH", f"/v1/investigations/{uuid.uuid4()}", {"notes": "test"}),
            ("DELETE", f"/v1/investigations/{uuid.uuid4()}", None),
            ("POST", "/v1/bill-extractions", {"consumer_number": "123", "discom": "T"}),
            ("GET", "/v1/bill-extractions", None),
            ("GET", "/v1/bill-extractions/by-consumer/123", None),
            ("GET", f"/v1/bill-extractions/{uuid.uuid4()}", None),
        ]

        for method, path, body in endpoints:
            with self.subTest(method=method, path=path):
                status_code, data, headers = request_app(method, path, body=body, token=None)
                self.assertEqual(status_code, 401, f"{method} {path} should return 401")
                self.assertEqual(data.get("error", {}).get("code"), "unauthorized")
                self.assertIn("www-authenticate", headers)
                self.assertTrue(headers["www-authenticate"].startswith("Bearer"))

    def test_invalid_and_expired_tokens(self):
        """Verify malformed, expired, and wrong-secret tokens return 401."""
        # 1. Malformed token
        status_code, data, headers = request_app("GET", "/v1/batches", token="not-a-valid-jwt")
        self.assertEqual(status_code, 401)
        self.assertEqual(data.get("error", {}).get("code"), "invalid_token")

        # 2. Expired token
        expired_token = mint_token(USER_A_ID, expires_in=-10)
        status_code, data, headers = request_app("GET", "/v1/batches", token=expired_token)
        self.assertEqual(status_code, 401)
        self.assertEqual(data.get("error", {}).get("code"), "token_expired")

        # 3. Wrong secret (signature verification failure)
        wrong_sig_token = mint_token(USER_A_ID, secret="wrong-secret-key-1234567890123456")
        status_code, data, headers = request_app("GET", "/v1/batches", token=wrong_sig_token)
        self.assertEqual(status_code, 401)
        self.assertEqual(data.get("error", {}).get("code"), "invalid_token")

    # ==========================================================================
    # 2. Multi-Tenant Record Ownership and Isolation
    # ==========================================================================

    def test_user_batch_isolation(self):
        """Verify User A's batches are completely hidden and inaccessible to User B."""
        token_a = mint_token(USER_A_ID)
        token_b = mint_token(USER_B_ID)

        # 1. User A creates a batch
        payload_a = {
            "file_name": "user_a_batch.csv",
            "model_sha256": "dummy_sha256",
            "records": [
                {
                    "row_index": 0,
                    "customer_ref": "CUST-A-1",
                    "status": "scored",
                    "model_score": 0.85,
                }
            ],
        }
        st, data_a, _ = request_app("POST", "/v1/batches", body=payload_a, token=token_a)
        self.assertEqual(st, 201)
        batch_a_id = data_a["id"]
        self.assertEqual(data_a["created_by"], str(USER_A_ID))

        # 2. User B lists batches -> User A's batch must NOT be present
        st, list_b, _ = request_app("GET", "/v1/batches", token=token_b)
        self.assertEqual(st, 200)
        self.assertEqual(len(list_b), 0)

        # 3. User B tries to GET User A's batch -> 404 (not 403, no info leak)
        st, get_b, _ = request_app("GET", f"/v1/batches/{batch_a_id}", token=token_b)
        self.assertEqual(st, 404)
        self.assertEqual(get_b.get("error", {}).get("code"), "not_found")

        # 4. User B tries to DELETE User A's batch -> 404
        st, del_b, _ = request_app("DELETE", f"/v1/batches/{batch_a_id}", token=token_b)
        self.assertEqual(st, 404)

        # 5. User A can still retrieve and delete their own batch
        st, get_a, _ = request_app("GET", f"/v1/batches/{batch_a_id}", token=token_a)
        self.assertEqual(st, 200)
        self.assertEqual(get_a["id"], batch_a_id)

        st, del_a, _ = request_app("DELETE", f"/v1/batches/{batch_a_id}", token=token_a)
        self.assertEqual(st, 200)

    def test_user_investigation_isolation(self):
        """Verify User A's investigations are isolated and cannot be accessed or linked by User B."""
        token_a = mint_token(USER_A_ID)
        token_b = mint_token(USER_B_ID)

        # 1. User A creates a batch
        batch_payload = {
            "file_name": "inv_test_batch.csv",
            "model_sha256": "dummy",
            "records": [
                {
                    "row_index": 0,
                    "customer_ref": "CUST-INV-1",
                    "status": "scored",
                    "model_score": 0.90,
                }
            ],
        }
        st, batch_data, _ = request_app("POST", "/v1/batches", body=batch_payload, token=token_a)
        self.assertEqual(st, 201)
        batch_id = batch_data["id"]
        rec_id = batch_data["records"][0]["id"]

        # 2. User A creates an investigation
        inv_payload = {
            "ticket_code": "INV-USER-A-001",
            "customer_ref": "CUST-INV-1",
            "origin": "screening",
            "basis": "Suspected bypass",
            "batch_id": batch_id,
            "screening_record_id": rec_id,
        }
        st, inv_a, _ = request_app("POST", "/v1/investigations", body=inv_payload, token=token_a)
        self.assertEqual(st, 201)
        inv_id = inv_a["id"]
        self.assertEqual(inv_a["created_by"], str(USER_A_ID))

        # 3. User B cannot list User A's investigation
        st, list_b, _ = request_app("GET", "/v1/investigations", token=token_b)
        self.assertEqual(st, 200)
        self.assertEqual(len(list_b), 0)

        # 4. User B cannot GET User A's investigation by ID or ticket code (404)
        st, _, _ = request_app("GET", f"/v1/investigations/{inv_id}", token=token_b)
        self.assertEqual(st, 404)

        st, _, _ = request_app("GET", "/v1/investigations/by-ticket/INV-USER-A-001", token=token_b)
        self.assertEqual(st, 404)

        # 5. User B cannot PATCH or DELETE User A's investigation
        st, _, _ = request_app("PATCH", f"/v1/investigations/{inv_id}", body={"notes": "Hacked"}, token=token_b)
        self.assertEqual(st, 404)

        st, _, _ = request_app("DELETE", f"/v1/investigations/{inv_id}", token=token_b)
        self.assertEqual(st, 404)

        # 6. User B cannot create an investigation referencing User A's batch or screening record
        st, err_batch, _ = request_app(
            "POST",
            "/v1/investigations",
            body={"customer_ref": "X", "origin": "screening", "basis": "test", "batch_id": batch_id},
            token=token_b,
        )
        self.assertEqual(st, 404)

        st, err_rec, _ = request_app(
            "POST",
            "/v1/investigations",
            body={"customer_ref": "X", "origin": "screening", "basis": "test", "screening_record_id": rec_id},
            token=token_b,
        )
        self.assertEqual(st, 404)

    def test_user_bill_extraction_isolation(self):
        """Verify bill extractions are strictly isolated by owner."""
        token_a = mint_token(USER_A_ID)
        token_b = mint_token(USER_B_ID)

        # 1. User A creates investigation and bill extraction
        st, inv_a, _ = request_app(
            "POST",
            "/v1/investigations",
            body={"customer_ref": "CUST-BILL-1", "origin": "screening", "basis": "Audit"},
            token=token_a,
        )
        self.assertEqual(st, 201)
        inv_id = inv_a["id"]

        ext_payload = {
            "consumer_number": "CON-987654",
            "discom": "TSSPDCL",
            "investigation_id": inv_id,
            "units_consumed": "350.00",
        }
        st, ext_a, _ = request_app("POST", "/v1/bill-extractions", body=ext_payload, token=token_a)
        self.assertEqual(st, 201)
        ext_id = ext_a["id"]
        self.assertEqual(ext_a["created_by"], str(USER_A_ID))

        # 2. User B cannot list User A's extraction
        st, list_b, _ = request_app("GET", "/v1/bill-extractions", token=token_b)
        self.assertEqual(st, 200)
        self.assertEqual(len(list_b), 0)

        # 3. User B cannot GET User A's extraction by ID (404)
        st, _, _ = request_app("GET", f"/v1/bill-extractions/{ext_id}", token=token_b)
        self.assertEqual(st, 404)

        # 4. User B cannot list by consumer
        st, consumer_b, _ = request_app(
            "GET", "/v1/bill-extractions/by-consumer/CON-987654", token=token_b
        )
        self.assertEqual(st, 200)
        self.assertEqual(len(consumer_b), 0)

        # 5. User B cannot link a bill extraction to User A's investigation
        st, bad_ext, _ = request_app(
            "POST",
            "/v1/bill-extractions",
            body={"consumer_number": "CON-FAKE", "discom": "T", "investigation_id": inv_id},
            token=token_b,
        )
        self.assertEqual(st, 404)

    # ==========================================================================
    # 3. Server-Side Ownership Enforcement (Client-Supplied created_by Ignored)
    # ==========================================================================

    def test_client_supplied_created_by_is_ignored(self):
        """Verify client cannot spoof record ownership by supplying created_by in payload."""
        token_a = mint_token(USER_A_ID)

        # Client attempts to set created_by to User B
        spoofed_batch_payload = {
            "file_name": "spoof_test.csv",
            "model_sha256": "dummy",
            "created_by": str(USER_B_ID),
        }
        st, data, _ = request_app("POST", "/v1/batches", body=spoofed_batch_payload, token=token_a)
        self.assertEqual(st, 201)
        # Server must override created_by to USER_A_ID
        self.assertEqual(data["created_by"], str(USER_A_ID))

        # Same for bill extraction
        spoofed_ext_payload = {
            "consumer_number": "CON-SPOOF",
            "discom": "TSSPDCL",
            "created_by": str(USER_B_ID),
        }
        st, ext_data, _ = request_app(
            "POST", "/v1/bill-extractions", body=spoofed_ext_payload, token=token_a
        )
        self.assertEqual(st, 201)
        self.assertEqual(ext_data["created_by"], str(USER_A_ID))

    # ==========================================================================
    # 4. Legacy Unowned Records (created_by IS NULL) Are Isolated
    # ==========================================================================

    def test_legacy_unowned_records_are_not_exposed(self):
        """Verify legacy records where created_by IS NULL are not returned in user queries."""
        session = TestAuthSessionLocal()
        try:
            legacy_batch = ScreeningBatch(
                file_name="legacy_batch.csv",
                model_sha256="legacy_model_sha",
                status="completed",
                created_by=None,
            )
            session.add(legacy_batch)
            session.commit()
            session.refresh(legacy_batch)
            legacy_batch_id = legacy_batch.id

            legacy_inv = Investigation(
                ticket_code="INV-LEGACY-001",
                customer_ref="CUST-LEGACY",
                origin="screening",
                basis="Legacy audit basis",
                status="New",
                created_by=None,
            )
            session.add(legacy_inv)
            session.commit()

            legacy_ext = BillExtraction(
                consumer_number="CON-LEGACY",
                discom="TSSPDCL",
                created_by=None,
            )
            session.add(legacy_ext)
            session.commit()
        finally:
            session.close()

        token_a = mint_token(USER_A_ID)

        # User A listing must NOT include legacy unowned records
        st, batches, _ = request_app("GET", "/v1/batches", token=token_a)
        self.assertEqual(st, 200)
        self.assertEqual(len(batches), 0)

        st, invs, _ = request_app("GET", "/v1/investigations", token=token_a)
        self.assertEqual(st, 200)
        self.assertEqual(len(invs), 0)

        st, exts, _ = request_app("GET", "/v1/bill-extractions", token=token_a)
        self.assertEqual(st, 200)
        self.assertEqual(len(exts), 0)

        # Direct ID lookup of legacy record returns 404
        st, _, _ = request_app("GET", f"/v1/batches/{legacy_batch_id}", token=token_a)
        self.assertEqual(st, 404)

    # ==========================================================================
    # 5. Public Stateless Endpoints Remain Accessible Without Auth
    # ==========================================================================

    def test_public_stateless_endpoints_remain_unauthenticated(self):
        """Verify /v1/health and /v1/model-metadata remain accessible without token."""
        st, data, _ = request_app("GET", "/v1/health", token=None)
        self.assertIn(st, (200, 503))

        st, data, _ = request_app("GET", "/v1/model-metadata", token=None)
        self.assertIn(st, (200, 503))


if __name__ == "__main__":
    unittest.main()
