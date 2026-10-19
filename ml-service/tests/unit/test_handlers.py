"""Tests for scoring and the framework-free /v1 handlers, using the real model (read-only).

Needs THEFTGUARD_MODEL_PATH, THEFTGUARD_FEATURES_CSV and THEFTGUARD_PREDICTIONS_CSV; skips otherwise.
"""
import json
import re
import sys
import time
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import _data  # noqa: E402
from service import validation_config as C  # noqa: E402
from service.scoring import ServiceLoadError, score_rows  # noqa: E402
from service.v1_handlers import Service  # noqa: E402

LEAK = re.compile(r"Traceback|\.joblib|[A-Za-z]:\\|/home/|/mnt/|/usr/|Error\b|Exception\b")


def body(obj):
    return json.dumps(obj).encode("utf-8")


class HandlerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        _data.require("model", "features", "predictions")
        cls.svc = Service.load(_data.path("model"))
        cls.rows, cls.labels, cls.scores = _data.heldout(_data.path("features"), _data.path("predictions"))

    def test_load_checks_the_hash_and_the_file(self):
        with self.assertRaises(ServiceLoadError) as a:
            Service.load(_data.path("model"), expected_sha256="0" * 64)
        self.assertEqual(str(a.exception), "model_hash_mismatch")
        with self.assertRaises(ServiceLoadError) as b:
            Service.load("does-not-exist.joblib")
        self.assertEqual(str(b.exception), "model_file_not_found")

    def test_score_rows_reproduces_all_saved_predictions(self):
        t = time.perf_counter()
        out = score_rows(self.svc.model, self.rows)
        elapsed = time.perf_counter() - t
        self.assertEqual(len(out), len(self.rows))
        self.assertEqual([o[0] for o in out], self.labels)
        self.assertLessEqual(max(abs(o[1] - s) for o, s in zip(out, self.scores)), 1e-9)
        print(f"\n[info] scored {len(out)} held-out rows in one pass in {elapsed:.2f}s")

    def test_predict_single_matches_saved(self):
        for i in list(range(40)) + [i for i, r in enumerate(self.rows) if None in r.values()][:15]:
            status, out = self.svc.predict(body({"features": self.rows[i]}))
            self.assertEqual(status, 200, out)
            self.assertEqual(out["predicted_label"], self.labels[i])
            self.assertAlmostEqual(out["model_score"], self.scores[i], places=9)
            self.assertEqual(out["label_name"], C.LABEL_NAMES[out["predicted_label"]])
            self.assertEqual(out["model_sha256"], self.svc.sha256)
            self.assertEqual(set(out), {"predicted_label", "label_name", "model_score", "score_note",
                                        "warnings", "model_sha256", "interpretation"})

    def test_batch_matches_saved_in_chunks(self):
        n = 0
        for start in range(0, len(self.rows), C.MAX_BATCH_ROWS):
            chunk = range(start, min(start + C.MAX_BATCH_ROWS, len(self.rows)))
            status, out = self.svc.predict_batch(body({"rows": [{"ref": f"r{i}", "features": self.rows[i]} for i in chunk]}))
            self.assertEqual(status, 200)
            self.assertEqual((out["total"], out["scored"], out["rejected"]), (len(chunk), len(chunk), 0))
            for i, r in zip(chunk, out["results"]):
                self.assertTrue(r["ok"])
                self.assertEqual((r["index"], r["ref"], r["predicted_label"]), (i - start, f"r{i}", self.labels[i]))
                self.assertAlmostEqual(r["model_score"], self.scores[i], places=9)
                n += 1
        self.assertEqual(n, len(self.rows))

    def test_mixed_batch_gives_partial_results_in_order(self):
        good, bad_neg, bad_str = self.rows[0], {**self.rows[1], "valid_readings": -5.0}, {**self.rows[2], "max_observed": "x"}
        rows = [{"features": good}, {"features": bad_neg}, {"ref": "ok", "features": self.rows[3]},
                {"features": bad_str}, {"features": {**self.rows[4], "CONS_NO": 1}}, {"ref": "x" * 100, "features": good},
                "not an object", {"features": self.rows[5], "extra": 1}]
        status, out = self.svc.predict_batch(body({"rows": rows}))
        self.assertEqual(status, 200)
        self.assertEqual([r["ok"] for r in out["results"]], [True, False, True, False, False, False, False, False])
        self.assertEqual((out["total"], out["scored"], out["rejected"]), (8, 2, 6))
        self.assertEqual([r["index"] for r in out["results"]], list(range(8)))
        self.assertIn("negative_value", {e["code"] for e in out["results"][1]["errors"]})
        self.assertIn("invalid_type", {e["code"] for e in out["results"][3]["errors"]})
        self.assertIn("unexpected_features", {e["code"] for e in out["results"][4]["errors"]})
        self.assertEqual(out["results"][5]["errors"][0]["code"], "invalid_ref")
        self.assertEqual(out["results"][2]["ref"], "ok")

    def test_request_level_errors(self):
        cases = [(b"", "invalid_json"), (b"   ", "invalid_json"), (b"{", "invalid_json"), (b"\xff\xfe", "invalid_json"),
                 (b'{"features": ' + b"9" * 5000 + b"}", "invalid_json")]
        for raw, code in cases:
            with self.subTest(raw[:20]):
                for fn in (self.svc.predict, self.svc.predict_batch):
                    status, out = fn(raw)
                    self.assertEqual((status, out["error"]["code"]), (422, code))
        self.assertEqual(self.svc.predict_batch(body({"rows": []}))[1]["error"]["code"], "batch_size_invalid")
        self.assertEqual(self.svc.predict_batch(body({"rows": [{}] * (C.MAX_BATCH_ROWS + 1)}))[1]["error"]["code"], "batch_size_invalid")
        self.assertEqual(self.svc.predict_batch(body({"rows": 5}))[1]["error"]["code"], "invalid_request_shape")
        self.assertEqual(self.svc.predict_batch(body({"rows": [], "x": 1}))[1]["error"]["code"], "invalid_request_shape")
        status, out = self.svc.predict(body({"features": {}}))
        self.assertEqual((status, out["error"]["code"]), (422, "validation_failed"))

    def test_legacy_bad_inputs_are_all_rejected_not_scored(self):
        base = next(r for r in self.rows if None not in r.values())
        probes = {"negative": {**base, "valid_readings": -5.0}, "pct500": {**base, "missing_percent": 500.0},
                  "null": {**base, "mean_observed": None}, "text": {**base, "mean_observed": "abc"},
                  "bool": {**base, "zero_count": True}, "numtext": {**base, "zero_count": "5"},
                  "huge": {**base, "max_observed": 1e308}, "allnull": {k: None for k in C.FEATURES}}
        for name, feats in probes.items():
            with self.subTest(name):
                status, out = self.svc.predict(body({"features": feats}))
                self.assertEqual(status, 422)
        for token in ("NaN", "Infinity", "-Infinity"):
            raw = ('{"features": ' + json.dumps({**base, "mean_observed": "__TOKEN__"}).replace('"__TOKEN__"', token) + "}").encode()
            status, out = self.svc.predict(raw)
            self.assertEqual((status, out["error"]["issues"][0]["code"]), (422, "non_finite_number"), token)

    def test_no_response_leaks_paths_or_exception_text(self):
        responses = [self.svc.health(), self.svc.model_metadata(), self.svc.predict(b"{"),
                     self.svc.predict(body({"features": {"x": "C:\\secret\\p"}})),
                     self.svc.predict_batch(body({"rows": [{"features": {"a": 1}}]})),
                     self.svc.predict(body({"features": {**self.rows[0], "max_observed": "boom"}}))]
        for status, out in responses:
            text = json.dumps(out)
            self.assertIsNone(LEAK.search(text), text[:200])

    def test_health_and_metadata(self):
        self.assertEqual(self.svc.health(), (200, {"status": "ok", "model_loaded": True, "model_sha256_verified": True}))
        status, meta = self.svc.model_metadata()
        self.assertEqual(status, 200)
        self.assertEqual(meta["model_sha256"], C.EXPECTED_MODEL_SHA256)
        self.assertEqual(meta["model"]["features"], list(C.FEATURES))
        self.assertTrue(meta["limitations"])
        self.assertEqual(meta["input_assumptions"]["window_status"], "inferred from the feature formulas; not confirmed")
        self.assertIn("evaluation_caveat", meta["evaluation"])


if __name__ == "__main__":
    unittest.main()
