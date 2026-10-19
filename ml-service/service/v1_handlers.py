"""Framework-free request handlers for the /v1 service.

Each handler takes raw request bytes and returns (http_status, json_dict). main.py only
wires these to FastAPI, so the logic can be tested without a web framework.
No handler ever returns a file path, a stack trace or exception text.
"""

import json
from pathlib import Path

from . import validation_config as C
from .scoring import load_model, score_rows
from .validation import load_ranges, validate, validate_features

_DATA_DIR = Path(__file__).parent


def error_body(code, message, issues=None, truncated=False):
    err = {"code": code, "message": message}
    if issues is not None:
        err["issues"] = issues
        err["issues_truncated"] = bool(truncated)
    return {"error": err}


def _parse_json(body):
    if not body or not body.strip():
        return None, error_body("invalid_json", "The request body must be valid JSON.")
    try:
        return json.loads(body.decode("utf-8")), None
    except (UnicodeDecodeError, ValueError, RecursionError):
        return None, error_body("invalid_json", "The request body must be valid JSON.")


class Service:
    def __init__(self, model, model_sha256, ranges, metadata):
        self.model, self.sha256, self.ranges, self.metadata = model, model_sha256, ranges, metadata

    @classmethod
    def load(cls, model_path, expected_sha256=C.EXPECTED_MODEL_SHA256, data_dir=_DATA_DIR):
        from .scoring import ServiceLoadError
        model, sha = load_model(model_path, expected_sha256)
        ranges = load_ranges(Path(data_dir) / "training_ranges.json")
        try:
            metadata = json.loads((Path(data_dir) / "model_metadata.json").read_text(encoding="utf-8"))
        except (OSError, ValueError):
            raise ServiceLoadError("service_data_missing") from None
        if ranges is None:
            raise ServiceLoadError("service_data_missing")
        return cls(model, sha, ranges, metadata)

    # ------------------------------------------------------------------ GET handlers
    def health(self):
        return 200, {"status": "ok", "model_loaded": True, "model_sha256_verified": True}

    def model_metadata(self):
        out = dict(self.metadata)
        out["model_sha256"] = self.sha256
        return 200, out

    # ------------------------------------------------------------------ POST handlers
    def _result_fields(self, label, score):
        return {"predicted_label": label, "label_name": C.LABEL_NAMES[label], "model_score": score}

    def predict(self, body):
        payload, err = _parse_json(body)
        if err:
            return 422, err
        res = validate(payload, self.ranges)
        if not res.ok:
            return 422, error_body("validation_failed", "The request failed validation.", res.errors, res.truncated)
        (label, score), = score_rows(self.model, [res.features])
        out = self._result_fields(label, score)
        out.update({"score_note": C.SCORE_NOTE, "warnings": res.warnings, "model_sha256": self.sha256,
                    "interpretation": C.INTERPRETATION})
        return 200, out

    def predict_batch(self, body):
        payload, err = _parse_json(body)
        if err:
            return 422, err
        if not isinstance(payload, dict) or set(payload) != {"rows"} or not isinstance(payload["rows"], list):
            return 422, error_body("invalid_request_shape", "The body must be an object with a single 'rows' list.")
        rows = payload["rows"]
        n = len(rows)
        if n == 0 or n > C.MAX_BATCH_ROWS:
            return 422, error_body("batch_size_invalid", f"'rows' must contain 1 to {C.MAX_BATCH_ROWS} items.")

        results, to_score, positions = [None] * n, [], []
        for i, item in enumerate(rows):
            ref = None
            problems, truncated, warns = None, False, []
            if not isinstance(item, dict) or "features" not in item or not set(item) <= {"ref", "features"}:
                problems = [{"rule": "R01", "code": "invalid_request_shape", "field": None,
                             "message": "Each row must be an object with 'features' and an optional 'ref'."}]
            else:
                ref = item.get("ref")
                if ref is not None and not (isinstance(ref, str) and 1 <= len(ref) <= C.MAX_REF_LENGTH
                                            and ref.isprintable()):
                    problems, ref = [{"rule": "R01", "code": "invalid_ref", "field": "ref",
                                      "message": f"'ref' must be printable text of 1 to {C.MAX_REF_LENGTH} characters."}], None
                else:
                    v = validate_features(item["features"], self.ranges)
                    if v.ok:
                        to_score.append(v.features)
                        positions.append((i, ref, v.warnings[:C.MAX_ROW_ISSUES]))
                    else:
                        problems, truncated = v.errors[:C.MAX_ROW_ISSUES], v.truncated or len(v.errors) > C.MAX_ROW_ISSUES
            if problems is not None:
                results[i] = {"index": i, "ref": ref, "ok": False, "errors": problems, "errors_truncated": bool(truncated)}

        for (i, ref, warns), (label, score) in zip(positions, score_rows(self.model, to_score)):
            row = {"index": i, "ref": ref, "ok": True}
            row.update(self._result_fields(label, score))
            row["warnings"] = warns
            results[i] = row
        return 200, {"model_sha256": self.sha256, "total": n, "scored": len(positions),
                     "rejected": n - len(positions), "score_note": C.SCORE_NOTE, "results": results}
