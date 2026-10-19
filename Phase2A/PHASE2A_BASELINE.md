# PHASE2A_BASELINE.md: baseline characterization of the existing FastAPI service

Phase 2a document, 17 October 2026. It is a new file; no Phase 1 document was edited. It covers what the owner's Phase 1 verification report shows, how that compares with `API_CONTRACTS.md`, and the HTTP baseline that comes next.

## 1. Owner decisions for Phase 2

| # | Decision |
| --- | --- |
| 1 | Validation goes in new versioned `/v1` files. `app.py` stays untouched. |
| 2 | Out-of-range values are accepted with a warning in the response. A warning is not a statement that the value is valid or meaningful. |
| 3 | Service-to-service API key, CORS and the health-path disclosure are deferred to Phase 4 with Express. |
| 4 | The batch endpoint is deferred to Phase 3 with the feature builder. |
| 5 | Tests use the Python standard library only. Nothing is installed. |
| 6 | Phase 2 produces new documents only. Phase 1 documents are not edited yet. |

## 2. Evidence ledger: what ran where

| Evidence | Where it ran | Status |
| --- | --- | --- |
| Phase 1 harness, 17 PASS, 0 FAIL, 4 INFO, 0 NOT_PERFORMED, including V17 | **Owner's Windows machine** (Python 3.13.16, scikit-learn 1.9.1, FastAPI 0.143.3, pydantic 2.14.1), report `verification_report_20261017T140855Z` | Report received and read. The terminal output and exit code were not part of what was received. |
| Hashes in that report compared with the copies supplied to Claude | Claude's sandbox | All 9 match: model, `app.py`, feature table, predictions, metrics JSON, text report, CV comparison, Step 7 script and environment file. The service tested on the owner's machine is the same `app.py` Claude has read. |
| Earlier Phase 1 harness run | Claude's sandbox (Python 3.12.3, scikit-learn 1.8.0), V17 not performed | Superseded for V17 by the owner's run |
| HTTP baseline runner, self-test | Claude's sandbox, against a **stand-in** server (not FastAPI) that runs the real `app.py` logic behind a bare HTTP socket | Confirms the runner's plumbing works. It says nothing about how the real FastAPI service behaves over HTTP, and no result from it is used below. |
| HTTP baseline of the real service | **Owner's Windows machine** | **Not yet run** |

## 3. V17b reconciliation: do the real findings agree with `API_CONTRACTS.md`?

**Yes, on every point.** `API_CONTRACTS.md` recorded these probes as "Observed (stand-in)", meaning direct calls with stand-in `fastapi` and `pydantic` modules in Claude's sandbox. The owner's run reproduced them on the real stack, still as direct function calls:

| Probe | `API_CONTRACTS.md` (Phase 1) | Owner's real stack, direct call (V17b) | Agree |
| --- | --- | --- | --- |
| Negative `valid_readings` | 200 | 200 | Yes (gap G3) |
| `missing_percent` = 500 | 200 | 200 | Yes (gap G3) |
| Null `mean_observed` | 200 | 200 | Yes (gap G5) |
| Text `mean_observed` | 500 | 500 | Yes (gap G4) |
| Infinite `std_observed` | 500 | 500 | Yes (gap G4) |

The five V17 contract checks also held on the real stack: health reports `ok` with the model loaded, `/features` lists the 13 names in order, a valid row returns the documented keys with a score equal to the model's, a missing feature returns 422 with a `missing` list, and an identifier-like extra key returns 422 with `unexpected`.

**What this does not cover.** V17 and V17b called the endpoint functions directly. They did not pass through HTTP, JSON parsing, pydantic body validation or FastAPI's own error handling. Questions such as what the real service returns for malformed JSON, a body without `features`, a wrong content type, or the JSON tokens `Infinity` and `NaN` remain unanswered until the HTTP baseline runs. The evidence label for G3 to G5 in the next contract revision is therefore **Observed (real stack, direct call)**, and it becomes **Observed (real stack, over HTTP)** only if the baseline confirms it. The gaps recorded from code reading (G1, G2, G6 to G12) are unchanged.

## 4. The baseline test

`ml-service/tests/baseline/http_baseline.py` sends real HTTP requests to the unchanged service, started by the owner with `python -m uvicorn app:app` on `127.0.0.1:8765`. It installs nothing, touches no existing file, and writes only a new timestamped report.

| IDs | What it checks | Result type |
| --- | --- | --- |
| S01 | `app.py` and the model hashes equal the Phase 1 values | PASS or FAIL |
| A01 to A06 | The documented contract of `/`, `/health`, `/features` and `/predict` | PASS or FAIL |
| A07 | 200 held-out rows plus up to 25 null-pattern rows sent over HTTP; labels equal and scores within 1e-9 of the saved predictions | PASS or FAIL |
| B01 to B12 | Malformed JSON, empty body, missing or wrongly typed `features`, wrong content type, wrong methods, unknown path, `/openapi.json`, a 2 MB body, cross-origin requests | OBSERVED |
| C01 to C10 | Known-gap probes: negative, out-of-range, null, text, `Infinity`, `NaN`, boolean, numeric-text, 1e308 and all-null values, each with leak indicators on the response body | OBSERVED |
| D01, D02 | Latency and five parallel clients (informational) | OBSERVED |
| I01, I02 | Inputs and the service folder are unchanged after the run | PASS or FAIL |

**OBSERVED** means the behaviour is recorded and no claim is made that it is right or wrong. Only code-derived contract expectations can PASS or FAIL.

## 5. Proposed commands

The exact two-window Command Prompt commands are in `ml-service/tests/baseline/README.md`. In outline:

1. Copy the `tests` folder from the download into your `ml-service` folder (new files only).
2. **Window 1:** activate the environment, set `PYTHONDONTWRITEBYTECODE=1`, and start `python -m uvicorn app:app --host 127.0.0.1 --port 8765` from the FastAPI folder. No `--reload`.
3. **Window 2:** set the same paths as for the Phase 1 harness, run an existence check, confirm `/health` answers, then run `python tests\baseline\http_baseline.py` with the arguments shown in the README.
4. Share the full terminal output and the report that was written, then stop the service with `Ctrl+C`.

## 6. Expected files

| File | Created by | Notes |
| --- | --- | --- |
| `ml-service\tests\baseline\http_baseline.py` and `README.md` | This download | New; copy into `ml-service` |
| `docs\PHASE2A_BASELINE.md` | This download | New; this document |
| `ml-service\phase2a_results\http_baseline_report_<UTC time>.md` and `.json` | Running the baseline | New; timestamped; never overwritten |

Nothing is created in the FastAPI folder. `PYTHONDONTWRITEBYTECODE=1` prevents a `__pycache__` file, and checks I01 and I02 detect any change.

## 7. Not touched in Phase 2a

`app.py`, the model, the datasets, the predictions, `requirements.txt`, the Phase 1 documents and harness, and the existing `.venv`. No model is retrained and no package is installed.

## 8. Limits of the baseline

- It describes this service version on this machine at this time.
- The default sample is 200 held-out rows plus up to 25 null-pattern rows. `--full` sends all 8,475.
- Latency figures are informational and not a performance claim.
- An I02 failure caused by a file-sync client such as OneDrive touching files would be reported as a failure with the changed paths listed, so it can be judged.

## 9. Next gate

Phase 2b (the validation rules and unit tests) does not start until the baseline results are shared and approved.
