"""Unit tests for service.db configuration, URL normalization, and lazy engine behavior.

Does not require a live database. Tests safe configuration handling.
"""

from __future__ import annotations

import os
import sys
import unittest
from pathlib import Path

# Ensure service root is on sys.path
_ml_service_root = Path(__file__).resolve().parents[2]
if str(_ml_service_root) not in sys.path:
    sys.path.insert(0, str(_ml_service_root))

from service.db import (
    DatabaseConfigError,
    get_engine,
    get_raw_database_url,
    is_database_configured,
    mask_database_url,
    normalize_database_url,
    reset_engine,
)


class DatabaseConfigTests(unittest.TestCase):
    def setUp(self):
        reset_engine()
        self._orig_env = os.environ.get("THEFTGUARD_DATABASE_URL")

    def tearDown(self):
        reset_engine()
        if self._orig_env is not None:
            os.environ["THEFTGUARD_DATABASE_URL"] = self._orig_env
        else:
            os.environ.pop("THEFTGUARD_DATABASE_URL", None)

    def test_missing_env_behavior(self):
        os.environ.pop("THEFTGUARD_DATABASE_URL", None)
        self.assertIsNone(get_raw_database_url())
        self.assertFalse(is_database_configured())
        with self.assertRaises(DatabaseConfigError) as ctx:
            get_engine()
        self.assertIn("THEFTGUARD_DATABASE_URL is not configured", str(ctx.exception))

    def test_normalize_driver_for_psycopg3(self):
        raw = "postgresql://user:secret@localhost:5432/postgres"
        norm = normalize_database_url(raw)
        self.assertTrue(norm.startswith("postgresql+psycopg://"))
        self.assertIn("user:secret@localhost:5432/postgres", norm)

        # Test postgres:// shorthand
        raw_short = "postgres://user:secret@localhost:5432/postgres"
        norm_short = normalize_database_url(raw_short)
        self.assertTrue(norm_short.startswith("postgresql+psycopg://"))

        # Test already correct dialect
        raw_correct = "postgresql+psycopg://user:secret@localhost:5432/postgres"
        norm_correct = normalize_database_url(raw_correct)
        self.assertEqual(raw_correct, norm_correct)

    def test_normalize_supabase_adds_sslmode(self):
        raw = "postgresql://postgres.myproject:secret@aws-0-ap-south-1.pooler.supabase.com:5432/postgres"
        norm = normalize_database_url(raw)
        self.assertTrue(norm.startswith("postgresql+psycopg://"))
        self.assertIn("sslmode=require", norm)

    def test_mask_database_url_masks_password(self):
        url = "postgresql+psycopg://postgres.myproject:my_secret_pass_123@aws-0-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"
        masked = mask_database_url(url)
        self.assertNotIn("my_secret_pass_123", masked)
        self.assertIn("postgres.myproject:***@aws-0-ap-south-1.pooler.supabase.com:5432/postgres", masked)

    def test_mask_database_url_handles_none_or_empty(self):
        self.assertEqual(mask_database_url(None), "[NOT SET]")
        self.assertEqual(mask_database_url(""), "[NOT SET]")

    def test_empty_string_raises_database_config_error(self):
        with self.assertRaises(DatabaseConfigError):
            normalize_database_url("")
        with self.assertRaises(DatabaseConfigError):
            normalize_database_url("   ")


if __name__ == "__main__":
    unittest.main()
