"""Every row of the project's feature table must pass validation with no errors and no warnings,
and each rule must catch a deliberate violation. Needs THEFTGUARD_FEATURES_CSV; skips otherwise."""
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _data  # noqa: E402
from service import validation_config as C  # noqa: E402
from service.validation import default_ranges, validate_features  # noqa: E402


class DatasetConformance(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _data.require("features")
        cls.rows, cls.labels = _data.read_table(_data.path("features"))
        cls.ranges = default_ranges()

    def test_ranges_file_is_present_and_describes_this_table(self):
        self.assertIsNotNone(self.ranges)
        self.assertEqual(set(self.ranges), set(C.FEATURES))

    def test_every_row_passes_with_no_errors_and_no_warnings(self):
        failures = []
        for i, row in enumerate(self.rows):
            res = validate_features(row, self.ranges)
            if not res.ok or res.warnings:
                failures.append((i, [e["code"] for e in res.errors], [w["code"] for w in res.warnings]))
            else:
                self.assertEqual(res.features, row)
        print(f"\n[info] validated {len(self.rows)} table rows; failures: {len(failures)}")
        self.assertEqual(failures[:5], [])
        self.assertEqual(len(failures), 0)
        self.assertEqual(len(self.rows), 42372)

    def test_each_rule_catches_its_violation_on_real_rows(self):
        rng = random.Random(2026)
        mutations = {
            "negative_value": lambda r: {**r, "valid_readings": -1.0},
            "missing_percent_mismatch": lambda r: {**r, "missing_percent": r["missing_percent"] + 1.0},
            "invalid_type": lambda r: {**r, "max_observed": "x"},
            "null_not_allowed": lambda r: {**r, "zero_count": None},
            "count_identity_mismatch": lambda r: {**r, "zero_count": r["zero_count"] + 1.0},
            "positive_percent_mismatch": lambda r: {**r, "positive_percent_of_all_dates": r["positive_percent_of_all_dates"] + 1.0},
            "value_too_large": lambda r: {**r, "std_observed": 1e308},
            "non_finite_number": lambda r: {**r, "std_observed": float("inf")},
            "unexpected_features": lambda r: {**r, "CONS_NO": 1},
            "missing_features": lambda r: {k: v for k, v in r.items() if k != "min_observed"},
        }
        sample = rng.sample(self.rows, 300)
        for code, mutate in mutations.items():
            missed = [i for i, r in enumerate(sample) if code not in {e["code"] for e in validate_features(mutate(r), self.ranges).errors}]
            self.assertEqual(missed, [], code)
        with_stats = [r for r in sample if r["valid_readings"] > 0]
        for r in with_stats:
            res = validate_features({**r, "mean_observed": None}, self.ranges)
            self.assertIn("observed_null_pattern", {e["code"] for e in res.errors})
        empties = [r for r in self.rows if r["valid_readings"] == 0]
        self.assertEqual(len(empties), 5)
        for r in empties:
            res = validate_features({**r, "mean_observed": 1.0}, self.ranges)
            self.assertIn("observed_null_pattern", {e["code"] for e in res.errors})


if __name__ == "__main__":
    unittest.main()
