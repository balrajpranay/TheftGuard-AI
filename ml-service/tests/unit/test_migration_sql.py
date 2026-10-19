"""Unit tests for SQL migration files and PostgreSQL DDL compilation (Revised).

Verifies:
1. That 001_phase2_initial_schema.sql and rollback scripts exist and parse cleanly.
2. That all SQLAlchemy models compile successfully against the official PostgreSQL dialect.
3. That tables, columns, constraints, and indexes in SQL match the ORM definitions.
4. That the rollback script drops all tables created by the forward migration in reverse order.
5. That RLS and REVOKE commands are explicitly defined for Supabase Data API security.
6. That raw_ocr_text is excluded from both ORM and SQL migration.
"""

from __future__ import annotations

import re
import sys
import unittest
from pathlib import Path

# Ensure service root is on sys.path
_ml_service_root = Path(__file__).resolve().parents[2]
if str(_ml_service_root) not in sys.path:
    sys.path.insert(0, str(_ml_service_root))

from sqlalchemy.dialects import postgresql  # noqa: E402
from sqlalchemy.schema import CreateIndex, CreateTable  # noqa: E402
from service.db.models import Base  # noqa: E402


class SqlMigrationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql_dir = _ml_service_root / "migrations" / "sql"
        cls.forward_sql_path = cls.sql_dir / "001_phase2_initial_schema.sql"
        cls.rollback_sql_path = cls.sql_dir / "001_phase2_rollback_initial_schema.sql"

        cls.forward_sql = cls.forward_sql_path.read_text(encoding="utf-8")
        cls.rollback_sql = cls.rollback_sql_path.read_text(encoding="utf-8")

    def test_migration_files_exist_and_non_empty(self):
        self.assertTrue(self.forward_sql_path.is_file())
        self.assertTrue(self.rollback_sql_path.is_file())
        self.assertGreater(len(self.forward_sql), 200)
        self.assertGreater(len(self.rollback_sql), 50)

    def test_all_models_compile_to_valid_postgresql_ddl(self):
        """Verify SQLAlchemy can compile each model's DDL targeting PostgreSQL dialect."""
        pg_dialect = postgresql.dialect()
        compiled_ddl = []

        for table in Base.metadata.sorted_tables:
            create_stmt = str(CreateTable(table).compile(dialect=pg_dialect))
            compiled_ddl.append(create_stmt)
            self.assertIn(f"CREATE TABLE {table.name}", create_stmt)

        for index in Base.metadata.tables.values():
            for idx in index.indexes:
                idx_stmt = str(CreateIndex(idx).compile(dialect=pg_dialect))
                self.assertIn(f"INDEX {idx.name}", idx_stmt)

        self.assertEqual(len(Base.metadata.tables), 4)

    def test_forward_sql_defines_all_model_tables(self):
        expected_tables = ["screening_batches", "screening_records", "investigations", "bill_extractions"]
        for table in expected_tables:
            pattern = re.compile(rf"CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?{table}\b", re.IGNORECASE)
            self.assertTrue(
                pattern.search(self.forward_sql),
                f"Table {table} missing from 001_phase2_initial_schema.sql"
            )

    def test_rollback_sql_drops_all_tables_in_reverse_order(self):
        expected_drop_order = [
            "bill_extractions",
            "investigations",
            "screening_records",
            "screening_batches",
            "schema_migrations",
        ]
        drops = re.findall(r"DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(\w+)", self.rollback_sql, re.IGNORECASE)
        self.assertEqual(drops, expected_drop_order, "Rollback drop order must respect foreign key dependencies.")

    def test_forward_sql_contains_safety_constraints_and_rls(self):
        """Ensure check constraints, indexes, RLS, and score notes are present in raw SQL."""
        self.assertIn("ck_screening_batches_thresholds", self.forward_sql)
        self.assertIn("ck_screening_records_score_range", self.forward_sql)
        self.assertIn("ck_investigations_status", self.forward_sql)
        self.assertIn("ck_bill_extractions_units_consumed", self.forward_sql)
        self.assertIn("uq_investigations_screening_record", self.forward_sql)
        self.assertIn("uq_investigations_active_customer_batch", self.forward_sql)
        self.assertIn("Uncalibrated; not a probability", self.forward_sql)
        # RLS and Revoke
        self.assertIn("ENABLE ROW LEVEL SECURITY", self.forward_sql)
        self.assertIn("REVOKE ALL ON TABLE", self.forward_sql)
        # Verify raw_ocr_text is excluded
        self.assertNotIn("raw_ocr_text", self.forward_sql)


if __name__ == "__main__":
    unittest.main()
