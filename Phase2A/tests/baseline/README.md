# Phase 2a HTTP baseline (read-only)

`http_baseline.py` sends real HTTP requests to your **unchanged** FastAPI service and records what it returns. It tests no new code. Its purpose is to measure the current behaviour, including the known gaps in `docs/API_CONTRACTS.md`, before anything is changed.

## Guarantees

- Nothing is installed. HTTP uses only Python's standard library; data preparation uses numpy, pandas and scikit-learn, which the FastAPI environment already has.
- It does not modify `app.py`, the model, the datasets, the predictions, `requirements.txt` or any Phase 1 file. It hashes the model, `app.py` and the two data files before and after the run, and snapshots the service folder before and after (checks I01 and I02).
- It only talks to `127.0.0.1` or `localhost`.
- It writes one new timestamped report into `--out-dir` and refuses to overwrite.

## Setup

Copy the `tests` folder from this download into your `ml-service` folder. This adds new files only. Nothing is overwritten.

## Commands (Windows Command Prompt, two windows)

Use the same values you used for the Phase 1 harness. The two values in angle brackets are not known to this document.

**Window 1: start the unchanged service and leave it running**

```bat
set "FASTAPI_DIR=C:\Users\shush\OneDrive\Desktop\TheftGuard AI datasets\All Zip File 2-8\theftguard_step8_fastapi_package\theftguard_step8_fastapi"
set "VENV_ACTIVATE=<same activate.bat path you used for the harness>"
cd /d "%FASTAPI_DIR%"
call "%VENV_ACTIVATE%"
set PYTHONDONTWRITEBYTECODE=1
python -m uvicorn app:app --host 127.0.0.1 --port 8765
```

`PYTHONDONTWRITEBYTECODE=1` stops Python from creating a `__pycache__` file beside `app.py`. Do not add `--reload`. If port 8765 is busy, use another port in both windows.

**Window 2: run the baseline**

```bat
set "FASTAPI_DIR=C:\Users\shush\OneDrive\Desktop\TheftGuard AI datasets\All Zip File 2-8\theftguard_step8_fastapi_package\theftguard_step8_fastapi"
set "DATA_DIR=C:\Users\shush\OneDrive\Desktop\TheftGuard AI datasets\theftguard_data_preparation_starter\theftguard_data_preparation_starter"
set "MODEL=%FASTAPI_DIR%\validated_candidate_pipeline.joblib"
set "APP=%FASTAPI_DIR%\app.py"
set "FEATURES=%DATA_DIR%\outputs_step4\customer_features_for_review.csv"
set "PRED=%DATA_DIR%\outputs_step7\final_test_predictions.csv"
set "VENV_ACTIVATE=<same activate.bat path you used for the harness>"
set "ML_SERVICE_DIR=<same ml-service folder you used for the harness>"
for %F in ("%MODEL%" "%APP%" "%FEATURES%" "%PRED%" "%VENV_ACTIVATE%" "%ML_SERVICE_DIR%\tests\baseline\http_baseline.py") do @if not exist %F echo MISSING: %~F
call "%VENV_ACTIVATE%"
set PYTHONDONTWRITEBYTECODE=1
cd /d "%ML_SERVICE_DIR%"
python -c "import urllib.request; print(urllib.request.urlopen('http://127.0.0.1:8765/health').read().decode())"
python tests\baseline\http_baseline.py ^
  --base-url http://127.0.0.1:8765 ^
  --features-csv "%FEATURES%" ^
  --predictions "%PRED%" ^
  --model "%MODEL%" ^
  --app-path "%APP%" ^
  --watch-dir "%FASTAPI_DIR%" ^
  --out-dir phase2a_results
echo Exit code: %errorlevel%
```

If a `MISSING:` line appears, stop and report it. When finished, press `Ctrl+C` in Window 1 to stop the service.

Add `--full` to send all 8,475 held-out rows instead of the default 200 plus up to 25 null-pattern rows. It takes longer.

## Expected files

Created by running, all new: `ml-service\phase2a_results\http_baseline_report_<UTC time>.md` and `.json`. Nothing is created in the FastAPI folder.

## Status vocabulary

| Status | Meaning |
| --- | --- |
| PASS or FAIL | A contract expectation read from `app.py` held or did not hold |
| OBSERVED | A behaviour was recorded with no pass or fail claimed: framework handling, known-gap probes, latency |
| NOT_PERFORMED | The check could not run, with the reason |

## What is covered

| IDs | Covers |
| --- | --- |
| S01 | `app.py` and the model are the files recorded in Phase 1 |
| A01 to A06 | Documented contract of `/`, `/health`, `/features` and `/predict`, over real HTTP |
| A07 | Saved held-out predictions reproduced over HTTP |
| B01 to B12 | Malformed and unusual requests, wrong methods, unknown paths, interactive docs, a 2 MB body and cross-origin behaviour |
| C01 to C10 | Known-gap probes: negative, out-of-range, null, text, infinite, NaN, boolean, numeric-string, huge and all-null values |
| D01, D02 | Latency and a small parallel run (informational) |
| I01, I02 | Nothing was modified during the run |
