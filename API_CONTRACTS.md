# API_CONTRACTS.md: TheftGuard AI service contracts

Phase 1 document, 17 October 2026. Part A records the **current** FastAPI service exactly as `app.py` implements it; it is unchanged. Part B lists verified input rules. Part C lists known gaps. Part D lists **proposals that are not implemented** and need approval.

**Evidence labels**

| Label | Meaning |
| --- | --- |
| Code | Read directly from `app.py` |
| Observed (stand-in) | Observed by calling `app.py`'s endpoint functions directly in a harness self-test, with stand-in `fastapi` and `pydantic` modules because neither is installed in Claude's sandbox. The real `app.py` logic and the real model ran; the HTTP and pydantic layers did not. |
| Harness V17 | To be confirmed by running the harness inside the owner's FastAPI environment. **Not yet performed there.** |

## Part A. Current FastAPI service (unchanged)

Service title: "TheftGuard AI ML API", version 0.1.0. The model path comes from `THEFTGUARD_MODEL_PATH` and defaults to `validated_candidate_pipeline.joblib` in the working directory. The model is loaded once at import.

| Method and path | Purpose | Success response | Failure responses |
| --- | --- | --- | --- |
| `GET /` | Service banner | `service`, `status` (`ready` or `model_not_loaded`), `docs`, `warning` | None |
| `GET /health` | Health | `status` (`ok` or `model_not_loaded`), `model_loaded`, `model_path`, `error` | None |
| `GET /features` | Required feature names | `required_features` (list), `count`, `note` | 503 if the model is not loaded; 500 if names cannot be inferred |
| `POST /predict` | One prediction | See below | 503 model not loaded; 500 names not inferable or prediction failed; 422 missing or unexpected features, or a malformed body |

**`POST /predict` request**

```json
{ "features": { "valid_readings": 1000, "missing_percent": 3.0, "...": "all 13 names required" } }
```

Exactly the 13 names below must be present, with no others. Extra keys, including `CONS_NO` or `FLAG`, are rejected with 422 (Code; extra-key rejection also observed with stand-ins).

| # | Feature | Type | Null in training data |
| --- | --- | --- | --- |
| 1 | `valid_readings` | number | No |
| 2 | `missing_percent` | number | No |
| 3 | `zero_count` | number | No |
| 4 | `zero_percent_of_observed` | number | Yes (5 rows) |
| 5 | `mean_observed` | number | Yes (5 rows) |
| 6 | `median_observed` | number | Yes (5 rows) |
| 7 | `std_observed` | number | Yes (5 rows) |
| 8 | `min_observed` | number | Yes (5 rows) |
| 9 | `max_observed` | number | Yes (5 rows) |
| 10 | `mean_positive` | number | Yes (2,114 rows) |
| 11 | `median_positive` | number | Yes (2,114 rows) |
| 12 | `positive_readings` | number | No |
| 13 | `positive_percent_of_all_dates` | number | No |

The example row in `app.py` contains exactly these 13 names. Its values are illustrative, not real customer data.

**`POST /predict` success response (200)**

```json
{
  "predicted_label": 0,
  "predicted_label_name": "Potentially Suspicious" | "No Suspicious Pattern Flagged",
  "probability_flag_1": 0.0207,
  "interpretation": "This is a model prediction of the source dataset's FLAG label, not confirmation of electricity theft. ..."
}
```

`predicted_label` is 1 for "Potentially Suspicious" and 0 otherwise. `probability_flag_1` is the Random Forest vote fraction for class 1 and is uncalibrated (see `MODEL_CARD.md`). The label and score match the model's own output (Observed (stand-in); Harness V17).

**Error shapes (Code).** A missing or unexpected feature returns 422 with `detail` as an object: `{"message": "...", "missing": [...]}` or `{"message": "...", "unexpected": [...]}`. 503 and 500 return `detail` as a string.

## Part B. Verified input rules (from the 42,372-row training table)

These hold on every training row (harness V12). They are **candidate validation rules for a future version**, not behaviour of the current service. The 1,034-date window is inferred, and no rule has been checked against raw readings.

| Rule | Basis |
| --- | --- |
| All 13 values are finite numbers, or null for the eight features that can be null | Training table; imputer indicators |
| No negative values | Verified on all rows |
| `valid_readings` is between 0 and 1,034 and equals `zero_count` + `positive_readings` | Verified on all rows (window inferred) |
| `missing_percent` = (1,034 − `valid_readings`) / 1,034 × 100, to three decimals | Verified (window inferred) |
| `zero_percent_of_observed` = `zero_count` / `valid_readings` × 100, null when `valid_readings` is 0 | Verified |
| `positive_percent_of_all_dates` = `positive_readings` / 1,034 × 100 | Verified (window inferred) |
| The six observed-statistics features are null exactly when `valid_readings` is 0 | Verified |
| `mean_positive` and `median_positive` are null exactly when `positive_readings` is 0 | Verified |
| `min_observed` ≤ `median_observed` ≤ `max_observed`; the mean lies between the minimum and maximum | Verified |
| `min_observed` is 0 exactly when `zero_count` is above 0 | Verified |

Values outside what the training table contains, such as 800,003.32, are plausible data errors and need a policy decision before any validation limits are set.

## Part C. Known gaps in the current service

These are recorded, not fixed. Phase 1 did not change `app.py`.

| # | Gap | Evidence |
| --- | --- | --- |
| G1 | No authentication and no rate limiting | Code |
| G2 | No CORS configuration and no request size limit | Code |
| G3 | No range validation: negative `valid_readings` and `missing_percent` = 500 were scored with status 200 | Observed (stand-in) |
| G4 | Text and infinite values return 500 instead of a 422 validation error | Observed (stand-in); Code (catch-all) |
| G5 | Null values are accepted and silently imputed, including for features that were never null in training | Observed (stand-in) |
| G6 | The score field is named `probability_flag_1` although it is uncalibrated | Code; `MODEL_CARD.md` |
| G7 | The negative label reads "No Suspicious Pattern Flagged", while the blueprint requires "Normal" | Code; blueprint |
| G8 | One row per call; no batch endpoint | Code |
| G9 | `/health` returns the model's absolute file path and raw load-error text | Code |
| G10 | Inconsistent error bodies: object `detail` for 422, string for 503 and 500 | Code |
| G11 | Model path defaults to the working directory; the model loads at import and failure is only visible through 503 responses | Code |
| G12 | No model hash or version in any response | Code |

## Part D. Proposed, not implemented (each needs approval)

**D1. Display labels.** Express maps `predicted_label` 1 to "Potentially Suspicious" and 0 to "Normal", as the blueprint requires, and always shows the "not proof of theft" disclaimer. "Normal" is defined as "not flagged by the model". The label wording at the service stays unchanged unless the owner approves editing `app.py`.

**D2. Score naming.** Express exposes the score as `model_score` with a fixed note that it is uncalibrated and not a probability.

**D3. Keep the two tracks separate.** Model screening (Track A) and historical-versus-current comparison (Track B) are separate objects, never merged into one score:

```json
{
  "customer_ref": "<pseudonymised id>",
  "screening": { "label": "Potentially Suspicious", "model_score": 0.62,
                 "score_note": "Uncalibrated; not a probability",
                 "model_sha256": "442981aa…a5" },
  "comparison": { "historical_avg_kwh": null, "current_avg_kwh": null, "change_percent": null },
  "disclaimer": "Screening result, not proof of theft."
}
```

The unit label "kWh" is applied only to values the user's own upload declares in kWh. Nothing from the training dataset is presented as kWh or ₹. This shape is a sketch, not a final contract.

**D4. Compatibility errors.** If an upload cannot be converted into the 13 features under the training definitions (for example, a series that is not the inferred 1,034-date window), Express returns a clear incompatibility error and still offers Track B where the data allow it.

**D5. Possible future service endpoints** (no code until approved): `POST /predict-batch`, `GET /model-metadata` (reading only the verified metrics file and the model hash), strict range and type validation based on Part B, an API-key check between Express and FastAPI, and removing the path and error text from `/health`.

**D6. Express endpoints from the blueprint** (listed only; not designed here): `GET /api/health`, `POST /api/analyses/upload`, `POST /api/analyses`, `GET /api/analyses`, `GET /api/analyses/:analysisId`, `GET /api/predictions`, `GET /api/models`, `GET /api/reports/:analysisId`. Authentication uses Supabase Auth, and Row Level Security applies to stored results.

## Decisions needed before Phase 2

1. Keep `app.py` untouched, with Express adapting its output (D1 and D2), or approve small edits to it.
2. Confirm the compatibility rule for Track A (D4), once the feature code and raw sample are available.
3. Approve a development dependency list (for example `httpx` and `pytest`) before any HTTP-level tests are added. None is needed for the Phase 1 harness, and nothing has been installed.
