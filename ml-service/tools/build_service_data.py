#!/usr/bin/env python
"""Read-only generator for service/training_ranges.json and service/model_metadata.json.

Reads the review feature table, the reported metrics JSON and the CV comparison CSV, and writes
two NEW aggregate files into service/. No dataset rows are copied. Nothing is modified or retrained.
Refuses to overwrite existing output files.
"""
import argparse, csv, datetime as dt, hashlib, json, sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from service import validation_config as C  # noqa: E402


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--features-csv", required=True)
    ap.add_argument("--metrics-json", required=True)
    ap.add_argument("--cv-csv", required=True)
    ap.add_argument("--out-dir", default=str(Path(__file__).resolve().parents[1] / "service"))
    a = ap.parse_args()
    out = Path(a.out_dir)
    ranges_path, meta_path = out / "training_ranges.json", out / "model_metadata.json"
    for p in (ranges_path, meta_path):
        if p.exists():
            sys.exit(f"Refusing to overwrite existing file: {p}")

    mins, maxs, nulls, rows = {}, {}, {}, 0
    with open(a.features_csv, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        cols = [c for c in reader.fieldnames if c != "FLAG"]
        if tuple(cols) != C.FEATURES:
            sys.exit("Feature table columns do not match the expected 13 names and order.")
        for r in reader:
            rows += 1
            for c in cols:
                s = r[c]
                if s == "":
                    nulls[c] = nulls.get(c, 0) + 1
                    continue
                x = float(s)
                mins[c] = x if c not in mins or x < mins[c] else mins[c]
                maxs[c] = x if c not in maxs or x > maxs[c] else maxs[c]
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    ranges = {
        "generated_utc": now,
        "source_table": {"file": Path(a.features_csv).name, "sha256": sha256(a.features_csv), "rows": rows},
        "scope_note": "Per-feature minimum and maximum of the project's feature table (development and test "
                      "splits together). Used only for warning W1. Aggregate values; no rows are stored.",
        "features": {c: {"min": mins.get(c), "max": maxs.get(c), "null_rows": nulls.get(c, 0)} for c in cols},
    }
    m = json.load(open(a.metrics_json, encoding="utf-8"))
    cv = list(csv.DictReader(open(a.cv_csv, newline="", encoding="utf-8")))
    metrics_keys = ["final_test_accuracy", "final_test_balanced_accuracy", "final_test_precision_FLAG_1",
                    "final_test_recall_FLAG_1", "final_test_f1_FLAG_1", "final_test_roc_auc",
                    "final_test_average_precision_PR_AUC", "final_test_rows"]
    meta = {
        "generated_utc": now,
        "model": {"name": "validated_candidate_pipeline",
                  "type": "scikit-learn Pipeline: median SimpleImputer with missing-value indicators, then RandomForestClassifier (250 trees)",
                  "expected_sha256": C.EXPECTED_MODEL_SHA256, "features": list(C.FEATURES), "model_inputs": 21},
        "labels": {"1": C.LABEL_NAMES[1], "0": C.LABEL_NAMES[0]},
        "score": {"name": "model_score", "note": C.SCORE_NOTE, "default_threshold": 0.5},
        "evaluation": {
            "source": "final_test_metrics.json, reproduced by the Phase 1 verification harness (checks V07 and V09)",
            "selected_model": m["selected_model_by_development_cv_f1"],
            "metrics": {k: m[k] for k in metrics_keys},
            "confusion_matrix": {k: m[k] for k in ("TN", "FP", "FN", "TP")},
            "development_cv_mean_f1": [{"model": r["model"], "mean_f1": float(r["development_cv_mean_f1_FLAG_1"])} for r in cv],
            "evaluation_caveat": m["evaluation_caveat"], "data_caveat": m["data_caveat"],
            "interpretation_warning": m["interpretation_warning"],
        },
        "input_assumptions": {"window_dates": C.WINDOW_DATES, "window_status": "inferred from the feature formulas; not confirmed"},
        "limitations": [
            "A positive prediction is a pattern similar to records labelled FLAG = 1. It is not proof of electricity theft.",
            "Results come from one random split and are not external validation.",
            "Precision and recall are modest; most flagged customers carry FLAG = 0 and most FLAG = 1 customers are not flagged at the default threshold.",
            "The score is uncalibrated and is not a probability.",
            "Dataset source, licence, FLAG meaning and consumption units are unconfirmed.",
            "The seven raw-derived features are unverified against raw readings.",
            "The model uses whole-period summaries and cannot compare previous and current consumption.",
            "Decision Tree and SVM were not evaluated.",
        ],
    }
    ranges_path.write_text(json.dumps(ranges, indent=2), encoding="utf-8")
    meta_path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print(f"Wrote {ranges_path} and {meta_path} ({rows} rows summarised).")


if __name__ == "__main__":
    main()
