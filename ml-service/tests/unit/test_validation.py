"""Unit tests for service/validation.py. Standard library only; no model, dataset or web framework needed.

Run from the ml-service folder:  python -m unittest discover -s tests/unit -v
"""
import copy
import json
import math
import random
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from service import validation_config as C  # noqa: E402
from service.validation import ValidationResult, validate, validate_features  # noqa: E402

W = C.WINDOW_DATES
RANGES = {n: {"min": 0.0, "max": 1e6} for n in C.FEATURES}
RANGES["max_observed"] = {"min": 0.0, "max": 800003.32}


def make_row(valid, zero, mean_obs=5.2, median=4.8, mx=18.0, mn=None, std=1.7, median_pos=4.9):
    """Build an internally consistent feature row (percentages rounded to 3 decimals, as in the table)."""
    pos = valid - zero
    row = {
        "valid_readings": float(valid), "missing_percent": round((W - valid) / W * 100, 3),
        "zero_count": float(zero),
        "zero_percent_of_observed": round(zero / valid * 100, 3) if valid else None,
        "mean_observed": mean_obs if valid else None, "median_observed": median if valid else None,
        "std_observed": std if valid else None,
        "min_observed": (0.0 if zero > 0 else (mn if mn is not None else 0.5)) if valid else None,
        "max_observed": mx if valid else None,
        "mean_positive": (mean_obs * valid / pos) if pos else None,
        "median_positive": median_pos if pos else None,
        "positive_readings": float(pos), "positive_percent_of_all_dates": round(pos / W * 100, 3),
    }
    return row


TYPICAL = make_row(1000, 20)
EMPTY = make_row(0, 0)
ALL_ZERO = make_row(500, 500, mean_obs=0.0, median=0.0, mx=0.0, std=0.0)
SINGLE = make_row(1, 0, mean_obs=5.0, median=5.0, mx=5.0, mn=5.0, std=0.0, median_pos=5.0)
FULL = make_row(1034, 0, mean_obs=5.0, median=4.0, mx=20.0, mn=0.5)
ARCHETYPES = {"typical": TYPICAL, "empty": EMPTY, "all_zero": ALL_ZERO, "single": SINGLE, "full_window": FULL}


def with_(row, **changes):
    r = copy.deepcopy(row)
    r.update(changes)
    return r


def codes(res):
    return {e["code"] for e in res.errors}


def check(row, ranges=None):
    return validate({"features": row}, ranges)


class ArchetypeTests(unittest.TestCase):
    def test_archetypes_are_valid_and_normalised(self):
        for name, row in ARCHETYPES.items():
            with self.subTest(name):
                res = check(row)
                self.assertTrue(res.ok, res.errors)
                self.assertEqual(list(res.features), list(C.FEATURES))
                self.assertEqual(res.errors, [])
                for k, v in res.features.items():
                    self.assertTrue(v is None or type(v) is float)

    def test_integers_are_accepted_for_counts(self):
        res = check(with_(TYPICAL, valid_readings=1000, zero_count=20, positive_readings=980))
        self.assertTrue(res.ok, res.errors)


class StructureTests(unittest.TestCase):
    def test_non_object_bodies(self):
        for body in (None, [], "x", 5, 1.5, True):
            with self.subTest(repr(body)):
                res = validate(body, None)
                self.assertFalse(res.ok)
                self.assertEqual(codes(res), {"invalid_request_shape"})

    def test_features_key_rules(self):
        self.assertEqual(codes(validate({}, None)), {"invalid_request_shape"})
        self.assertEqual(codes(validate({"features": TYPICAL, "extra": 1}, None)), {"invalid_request_shape"})
        for bad in ([], "x", None, 5):
            with self.subTest(repr(bad)):
                self.assertEqual(codes(validate({"features": bad}, None)), {"invalid_request_shape"})

    def test_each_feature_missing_in_turn(self):
        for name in C.FEATURES:
            with self.subTest(name):
                row = {k: v for k, v in TYPICAL.items() if k != name}
                res = check(row)
                self.assertFalse(res.ok)
                self.assertEqual([(e["rule"], e["field"]) for e in res.errors], [("R02", name)])

    def test_unexpected_names_including_identifiers(self):
        for extra in ("CONS_NO", "FLAG", "x"):
            with self.subTest(extra):
                res = check({**TYPICAL, extra: 1})
                self.assertEqual([(e["rule"], e["field"]) for e in res.errors], [("R03", extra)])
        res = check({**TYPICAL, "C:\\very\\secret\\path": 1})
        self.assertEqual(codes(res), {"unexpected_features"})
        self.assertNotIn("secret", json.dumps(res.errors))
        self.assertIsNone(res.errors[0]["field"])

    def test_missing_and_unexpected_both_reported(self):
        row = {k: v for k, v in TYPICAL.items() if k != "zero_count"}
        res = check({**row, "FLAG": 1})
        self.assertEqual(codes(res), {"missing_features", "unexpected_features"})


class TypeTests(unittest.TestCase):
    def test_bad_types_on_every_field(self):
        for name in C.FEATURES:
            for bad in ("5", "abc", True, False, [1], {"a": 1}):
                with self.subTest(name=name, bad=repr(bad)):
                    res = check(with_(TYPICAL, **{name: bad}))
                    self.assertEqual([(e["rule"], e["field"]) for e in res.errors], [("R04", name)])

    def test_non_finite_on_every_field(self):
        for name in C.FEATURES:
            for bad in (float("nan"), float("inf"), float("-inf")):
                with self.subTest(name=name, bad=repr(bad)):
                    res = check(with_(TYPICAL, **{name: bad}))
                    self.assertEqual([(e["rule"], e["field"]) for e in res.errors], [("R05", name)])

    def test_negative_values(self):
        for name in C.FEATURES:
            for bad in (-1, -1e-12):
                with self.subTest(name=name, bad=bad):
                    res = check(with_(TYPICAL, **{name: bad}))
                    self.assertEqual([(e["rule"], e["field"]) for e in res.errors], [("R07", name)])

    def test_negative_zero_is_accepted_and_normalised(self):
        res = check(with_(EMPTY, zero_count=-0.0))
        self.assertTrue(res.ok, res.errors)
        self.assertEqual(math.copysign(1.0, res.features["zero_count"]), 1.0)

    def test_counts_must_be_whole(self):
        for name in C.COUNT_FEATURES:
            with self.subTest(name):
                res = check(with_(TYPICAL, **{name: 10.5}))
                self.assertEqual([(e["rule"], e["field"]) for e in res.errors], [("R08", name)])

    def test_too_large_values(self):
        for bad in (3.5e38, 1e308, 10 ** 400, 4e38):
            with self.subTest(repr(bad)):
                res = check(with_(TYPICAL, max_observed=bad))
                self.assertEqual([(e["rule"], e["field"]) for e in res.errors], [("R09", "max_observed")])

    def test_large_but_scoreable_value_is_accepted(self):
        res = check(with_(TYPICAL, max_observed=3.4e38))
        self.assertTrue(res.ok, res.errors)

    def test_no_cascade_from_a_bad_field(self):
        res = check(with_(TYPICAL, valid_readings="abc"))
        self.assertEqual(codes(res), {"invalid_type"})


class NullTests(unittest.TestCase):
    def test_null_rejected_for_never_null_features(self):
        for name in sorted(C.NEVER_NULL):
            with self.subTest(name):
                res = check(with_(TYPICAL, **{name: None}))
                self.assertEqual([(e["rule"], e["field"]) for e in res.errors], [("R06", name)])

    def test_null_in_a_typical_row_breaks_the_null_pattern(self):
        for name in C.OBSERVED_STATS:
            with self.subTest(name):
                res = check(with_(TYPICAL, **{name: None}))
                self.assertEqual([(e["rule"], e["field"]) for e in res.errors], [("R15", name)])
        for name in C.POSITIVE_STATS:
            with self.subTest(name):
                res = check(with_(TYPICAL, **{name: None}))
                self.assertEqual([(e["rule"], e["field"]) for e in res.errors], [("R16", name)])

    def test_empty_customer_nulls_are_required(self):
        self.assertTrue(check(EMPTY).ok)
        for name in C.OBSERVED_STATS:
            with self.subTest(name):
                res = check(with_(EMPTY, **{name: 1.0}))
                self.assertIn(("R15", name), [(e["rule"], e["field"]) for e in res.errors])

    def test_no_positive_readings_requires_null_positive_stats(self):
        self.assertTrue(check(ALL_ZERO).ok)
        res = check(with_(ALL_ZERO, mean_positive=1.0))
        self.assertEqual([(e["rule"], e["field"]) for e in res.errors], [("R16", "mean_positive")])

    def test_all_null_is_rejected(self):
        res = check({k: None for k in C.FEATURES})
        self.assertFalse(res.ok)
        self.assertEqual({e["field"] for e in res.errors if e["rule"] == "R06"}, set(C.NEVER_NULL))


class ConsistencyTests(unittest.TestCase):
    def only(self, row, rule, code):
        res = check(row)
        self.assertFalse(res.ok)
        self.assertEqual({(e["rule"], e["code"]) for e in res.errors}, {(rule, code)}, res.errors)

    def test_r10_out_of_window(self):
        self.only(with_(make_row(1035, 20), missing_percent=0.0), "R10", "valid_readings_out_of_window")

    def test_r11_count_identity(self):
        self.only(with_(TYPICAL, zero_count=21.0, zero_percent_of_observed=2.1), "R11", "count_identity_mismatch")

    def test_r12_missing_percent(self):
        self.only(with_(TYPICAL, missing_percent=500.0), "R12", "missing_percent_mismatch")

    def test_r13_zero_percent(self):
        self.only(with_(TYPICAL, zero_percent_of_observed=5.0), "R13", "zero_percent_mismatch")

    def test_r14_positive_percent(self):
        self.only(with_(TYPICAL, positive_percent_of_all_dates=50.0), "R14", "positive_percent_mismatch")

    def test_r17_order(self):
        self.only(with_(TYPICAL, median_observed=20.0), "R17", "order_violation")
        self.only(with_(FULL, median_observed=0.4), "R17", "order_violation")

    def test_r18_mean_outside(self):
        self.only(with_(TYPICAL, mean_observed=25.0), "R18", "mean_outside_range")

    def test_r19_zero_min(self):
        self.only(with_(TYPICAL, min_observed=1.0), "R19", "zero_min_inconsistency")
        self.only(with_(FULL, min_observed=0.0), "R19", "zero_min_inconsistency")

    def test_errors_are_collected_and_ordered_by_rule(self):
        res = check(with_(TYPICAL, std_observed=-1.0, missing_percent=500.0))
        self.assertEqual([e["rule"] for e in res.errors], ["R07", "R12"])


class BoundaryTests(unittest.TestCase):
    def test_window_limits(self):
        self.assertTrue(check(EMPTY).ok)
        self.assertTrue(check(FULL).ok)
        self.assertFalse(check(make_row(1035, 0)).ok)

    def test_percent_tolerance_edges(self):
        e = (W - 1000) / W * 100
        self.assertTrue(check(with_(TYPICAL, missing_percent=e + 0.0005)).ok)
        self.assertEqual(codes(check(with_(TYPICAL, missing_percent=e + 0.0006))), {"missing_percent_mismatch"})

    def test_equal_order_statistics(self):
        self.assertTrue(check(SINGLE).ok)
        self.assertTrue(check(ALL_ZERO).ok)

    def test_mean_equal_to_max_and_tiny_drift(self):
        self.assertTrue(check(with_(TYPICAL, mean_observed=18.0, mean_positive=18.0 * 1000 / 980)).ok)
        self.assertTrue(check(with_(TYPICAL, mean_observed=18.0 * (1 + 1e-10), mean_positive=18.0 * 1000 / 980)).ok)
        self.assertEqual(codes(check(with_(TYPICAL, mean_observed=18.0 * (1 + 1e-6)))), {"mean_outside_range"})


class WarningTests(unittest.TestCase):
    def test_typical_row_has_no_warnings(self):
        res = check(TYPICAL, RANGES)
        self.assertTrue(res.ok)
        self.assertEqual(res.warnings, [])

    def test_w1_outside_dataset_range(self):
        res = check(with_(TYPICAL, max_observed=900000.0), RANGES)
        self.assertTrue(res.ok)
        w = [x for x in res.warnings if x["rule"] == "W1"]
        self.assertEqual([x["field"] for x in w], ["max_observed"])
        self.assertEqual(w[0]["dataset_max"], 800003.32)
        self.assertEqual(w[0]["message"], C.W1_MESSAGE)

    def test_w2_sum_identity(self):
        res = check(with_(TYPICAL, mean_positive=5.0), RANGES)
        self.assertTrue(res.ok)
        self.assertEqual([x["rule"] for x in res.warnings], ["W2"])
        self.assertEqual(check(ALL_ZERO, RANGES).warnings, [])

    def test_warnings_do_not_change_values(self):
        with_warning = check(with_(TYPICAL, max_observed=900000.0), RANGES)
        without = check(with_(TYPICAL, max_observed=900000.0), None)
        self.assertEqual(with_warning.features, without.features)
        self.assertEqual(without.warnings, [])


class ContractTests(unittest.TestCase):
    def test_deterministic(self):
        bad = with_(TYPICAL, std_observed=-1.0, missing_percent=500.0)
        self.assertEqual(check(bad), check(bad))

    def test_input_is_not_modified(self):
        for row in (TYPICAL, with_(TYPICAL, std_observed=-1.0)):
            payload = {"features": copy.deepcopy(row)}
            before = copy.deepcopy(payload)
            validate(payload, RANGES)
            self.assertEqual(payload, before)

    def test_messages_never_echo_values(self):
        for bad in ("C:\\very\\secret", "Traceback secret", "x" * 500):
            res = check(with_(TYPICAL, max_observed=bad))
            self.assertNotIn("secret", json.dumps(res.errors))
            self.assertNotIn("xxxx", json.dumps(res.errors))

    def test_issue_cap(self):
        row = {**TYPICAL, **{f"extra_{i}": 1 for i in range(120)}}
        res = check(row)
        self.assertEqual(len(res.errors), C.MAX_ISSUES)
        self.assertTrue(res.truncated)

    def test_issue_shape(self):
        res = check(with_(TYPICAL, missing_percent=500.0))
        self.assertEqual(set(res.errors[0]), {"rule", "code", "field", "message"})


class FuzzTests(unittest.TestCase):
    @staticmethod
    def rand_value(rng, depth=0):
        kinds = ["none", "bool", "int", "float", "str", "nan", "inf", "bigint", "list", "dict"]
        k = rng.choice(kinds if depth < 3 else kinds[:8])
        if k == "none": return None
        if k == "bool": return rng.random() < 0.5
        if k == "int": return rng.randint(-10 ** 6, 10 ** 6)
        if k == "float": return rng.uniform(-1e6, 1e6)
        if k == "str": return "".join(rng.choice("abc\\:/ 0123") for _ in range(rng.randint(0, 12)))
        if k == "nan": return float("nan")
        if k == "inf": return rng.choice([float("inf"), float("-inf")])
        if k == "bigint": return rng.choice([10 ** 400, -10 ** 400, 2 ** 200])
        if k == "list": return [FuzzTests.rand_value(rng, depth + 1) for _ in range(rng.randint(0, 3))]
        return {str(rng.random()): FuzzTests.rand_value(rng, depth + 1) for _ in range(rng.randint(0, 3))}

    def test_random_payloads_never_raise_and_are_rejected(self):
        rng = random.Random(2026)
        for _ in range(3000):
            payload = self.rand_value(rng)
            res = validate(payload, RANGES)
            self.assertIsInstance(res, ValidationResult)
            self.assertFalse(res.ok)

    def test_random_feature_objects_never_raise(self):
        rng = random.Random(7)
        for _ in range(3000):
            obj = {name: self.rand_value(rng) for name in C.FEATURES if rng.random() < 0.9}
            if rng.random() < 0.3:
                obj["junk"] = self.rand_value(rng)
            res = validate_features(obj, RANGES)
            self.assertIsInstance(res, ValidationResult)

    def test_single_field_corruption_never_raises(self):
        rng = random.Random(11)
        for _ in range(3000):
            row = copy.deepcopy(rng.choice(list(ARCHETYPES.values())))
            row[rng.choice(C.FEATURES)] = self.rand_value(rng)
            res = check(row, RANGES)
            self.assertIsInstance(res, ValidationResult)
            if res.ok:
                self.assertEqual(list(res.features), list(C.FEATURES))


if __name__ == "__main__":
    unittest.main()
