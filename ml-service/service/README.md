# /v1 ML service (new files; the existing app.py is untouched)

Run from the `ml-service` folder:

```bat
set "THEFTGUARD_MODEL_PATH=<path to validated_candidate_pipeline.joblib>"
python -m uvicorn service.main:app --host 127.0.0.1 --port 8000
```

| Endpoint | Purpose |
| --- | --- |
| `GET /v1/health` | `{status, model_loaded, model_sha256_verified}`; 503 `model_unavailable` if the model failed its hash check or is missing |
| `GET /v1/model-metadata` | Model facts, verified metrics, limitations and assumptions, with the runtime model hash |
| `POST /v1/predict` | Body `{"features": {13 values}}` returns `predicted_label`, `label_name`, `model_score`, `score_note`, `warnings`, `model_sha256`, `interpretation`; 422 with `error.issues` when invalid |
| `POST /v1/predict-batch` | Body `{"rows": [{"ref": "optional", "features": {...}}]}`, 1 to 5,000 rows; per-row `ok`, results or `errors`, in order |

Rules and error codes: `docs/PHASE2B_VALIDATION_SPEC.md` (R01 to R19 reject, W1 and W2 warn). Out-of-range values are scored with warning W1.

Environment: `THEFTGUARD_MODEL_PATH` (required), `THEFTGUARD_MODEL_SHA256` (optional), `THEFTGUARD_ENABLE_DOCS=1` (docs are off by default), `THEFTGUARD_MAX_BODY_BYTES` (default 20 MiB).

Not included yet (Stage S6): service-to-service API key and CORS. Bind the service to 127.0.0.1 and let only Express call it.

Regenerate `training_ranges.json` and `model_metadata.json` with `tools/build_service_data.py` (it refuses to overwrite).
