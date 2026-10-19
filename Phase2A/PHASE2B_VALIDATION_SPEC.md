# PHASE2B_VALIDATION_SPEC.md: DRAFT validation specification and unit-test plan

Phase 2b document, 17 October 2026. **Status: draft for owner approval. No code has been written.** It is a new file; no Phase 1 document was edited. Evidence labels (Verified, Owner-reported, Inferred, Unconfirmed) follow `DATASET.md`.

## 1. Scope

A pure-Python validation module for the future `/v1/predict` request, plus the unit tests that prove it. It uses no FastAPI, pydantic, pandas or third-party package, so it runs identically in Claude's sandbox and on the owner's machine. It does not change `app.py`, the model, the datasets or the predictions. Authentication, CORS, the `/health` path disclosure and the batch endpoint are out of scope, per the owner's decisions.

## 2. What the Phase 2a baseline means for the specification

The owner has reported the Phase 2a result: 10 PASS, 0 FAIL, 25 OBSERVED, 0 NOT_PERFORMED. **The two report files had not reached this project when this draft was written**, so everything below that rests on the baseline is an owner-reported summary, to be reconciled against the reports when they arrive. The rules themselves come from the verified table invariants (harness check V12) and do not depend on the baseline.

| Owner-reported legacy behaviour | Proposed `/v1` behaviour | Rule |
| --- | --- | --- |
| Negative `valid_readings` returns 200 | Rejected with 422 | R07 |
| `missing_percent` = 500 returns 200 | Rejected with 422 | R12 (and R10 where relevant) |
| Boolean value returns 200 | Rejected | R04 |
| Numeric-text value ("5") returns 200 | Rejected | R04 |
| `NaN` returns 200 | Rejected; null is the only missing-value marker | R05 |
| All-null input returns 200 | Rejected | R06 |
| Text value returns 500 | Rejected with 422 | R04 |
| `Infinity` returns 500 | Rejected with 422 | R05 |
| Huge magnitude returns 500 | Rejected with 422 | R09 |
| `/health` discloses the model path | Out of scope (deferred to Phase 4); `/v1` error bodies never contain paths | none |

**R09 basis (sandbox observation, scikit-learn 1.8.0):** the model scored 3e38 normally and raised "Input X contains infinity or a value too large for dtype('float32')" at 4e38, 1e39 and 1e308. The pipeline therefore cannot score values above the float32 maximum, 3.4028235e38. The same sandbox run showed a Python integer of 10**400 fails with an `OverflowError`.

## 3. Interface

`validate(payload) -> ValidationResult`

| Field | Meaning |
| --- | --- |
| `ok` | True when there are no errors |
| `features` | When `ok`: the 13 values in model order as floats or null (`-0.0` becomes `0.0`). Otherwise null. |
| `errors` | Ordered list of issues; each has `rule`, `code`, `field` and `message` |
| `warnings` | Ordered list of issues in the same shape; never change `ok` or `features` |

- `payload` is whatever the JSON parser produced; the function must never raise, whatever it receives.
- All errors are collected, not only the first, in rule order then feature order, up to 50 issues.
- Messages never echo the offending value, only the field, the rule and the expected constraint. This prevents user text from reaching logs or responses.
- Consistency rules (R10 to R19) run only on groups of fields that passed R04 to R09, so one bad value does not cause a cascade of secondary errors.

## 4. Rule catalogue

**Per-request and per-field rules (reject)**

| Rule | Code | Rejects when |
| --- | --- | --- |
| R01 | `invalid_request_shape` | The body is not an object, `features` is missing or not an object, or the body has any key other than `features` |
| R02 | `missing_features` | Any of the 13 names is absent (all missing names are listed) |
| R03 | `unexpected_features` | Any other name is present, including `CONS_NO` and `FLAG` |
| R04 | `invalid_type` | A value is not a number or null: booleans, text, lists and objects are rejected, and numeric text is not coerced |
| R05 | `non_finite_number` | A value is NaN or ±Infinity (including `1e400`, which parses to infinity) |
| R06 | `null_not_allowed` | A value is null for one of the 5 features that were never null in the dataset table: `valid_readings`, `missing_percent`, `zero_count`, `positive_readings`, `positive_percent_of_all_dates` |
| R07 | `negative_value` | A value is below 0 |
| R08 | `not_whole_number` | `valid_readings`, `zero_count` or `positive_readings` is not a whole number (`1000.0` is accepted) |
| R09 | `value_too_large` | Absolute value exceeds 3.4028234663852886e38, or an integer too large to convert to a float |

**Consistency rules (reject)**

| Rule | Code | Rejects when |
| --- | --- | --- |
| R10 | `valid_readings_out_of_window` | `valid_readings` is above the window (1,034, inferred and configurable) |
| R11 | `count_identity_mismatch` | `valid_readings` ≠ `zero_count` + `positive_readings` |
| R12 | `missing_percent_mismatch` | `missing_percent` differs from (window − `valid_readings`) / window × 100 by more than 5.1e-4 |
| R13 | `zero_percent_mismatch` | When `valid_readings` > 0, `zero_percent_of_observed` differs from `zero_count` / `valid_readings` × 100 by more than 5.1e-4 |
| R14 | `positive_percent_mismatch` | `positive_percent_of_all_dates` differs from `positive_readings` / window × 100 by more than 5.1e-4 |
| R15 | `observed_null_pattern` | The six observed-statistics features (`zero_percent_of_observed`, `mean_observed`, `median_observed`, `std_observed`, `min_observed`, `max_observed`) are not null exactly when `valid_readings` is 0 |
| R16 | `positive_null_pattern` | `mean_positive` and `median_positive` are not null exactly when `positive_readings` is 0 |
| R17 | `order_violation` | `min_observed` ≤ `median_observed` ≤ `max_observed` fails beyond a relative tolerance of 1e-9 |
| R18 | `mean_outside_range` | `mean_observed` lies outside `min_observed` to `max_observed` beyond a relative tolerance of 1e-9 |
| R19 | `zero_min_inconsistency` | When `valid_readings` > 0, `zero_count` > 0 is not equivalent to `min_observed` = 0 |

The 5.1e-4 tolerance matches the table's three-decimal rounding. Clients must therefore send percentages to at least three decimals.

**Warnings (accepted; response still scored)**

| Rule | Code | Raised when |
| --- | --- | --- |
| W1 | `outside_dataset_range` | A value is below the minimum or above the maximum seen in the project's 42,372-row feature table. It carries the table's minimum and maximum for that feature. |
| W2 | `sum_identity_mismatch` | `mean_observed` × `valid_readings` and `mean_positive` × `positive_readings` differ by more than a relative 1e-6, which is expected when a client rounds the means. Skipped when `positive_readings` is 0. |

**Required W1 wording:** "This value is outside the range seen in the project's dataset table. The model may be unreliable for it. This does not mean the value is correct, and it does not mean it is wrong." A warning is never evidence that a value is valid or meaningful.

**Basis of the rules:** R07, R10 to R19 and W2's identity hold on every one of the 42,372 table rows (Verified, V12). They are consistency rules, not checks against raw readings. The seven raw-derived features remain unconfirmed, and the window is inferred.

## 5. Error and warning shapes (for Phase 2c)

```json
{ "error": { "code": "validation_failed", "message": "The request failed validation.",
             "issues": [ { "rule": "R07", "code": "negative_value", "field": "valid_readings",
                           "message": "Must be 0 or greater." } ] } }
```

HTTP 422 for validation failures. Warnings use the same issue shape, plus `dataset_min` and `dataset_max` for W1. No error body contains a file path, a stack trace or exception text.

## 6. Proposed new files (none created yet)

```text
ml-service/
  service/
    validation_config.py     feature order, nullable and count sets, window, tolerances, limits
    validation.py            the pure validate() function and the rules
    training_ranges.json     per-feature dataset min and max, with the source table's hash and row count
  tools/
    make_training_ranges.py  read-only script that writes training_ranges.json from the review CSV
  tests/unit/
    test_validation.py       rule, boundary, contract and fuzz tests
    test_dataset_conformance.py   optional; runs only when THEFTGUARD_FEATURES_CSV is set
docs/
  VALIDATION_RULES.md        final rule document after approval
  PHASE2B_REPORT.md          actual test results, generated after the run
```

`training_ranges.json` holds aggregate values only; no dataset rows are copied. Nothing existing is modified. Tests use Python's `unittest` and are run with `python -m unittest discover -s tests\unit -v`.

## 7. Unit-test plan

| Group | What it proves |
| --- | --- |
| Structure (R01 to R03) | Non-object bodies, missing or non-object `features`, extra top-level keys, each of the 13 names missing in turn, `CONS_NO`, `FLAG` and arbitrary extra names |
| Types (R04 to R09) | For all 13 fields: booleans, text, numeric text, lists, objects, NaN, ±Infinity, `1e400`, negatives, `-0.0` (accepted, normalised), non-whole counts, 3.5e38 rejected, 3.4e38 accepted with W1, `10**400` rejected |
| Nulls (R06, R15, R16) | Null rejected for each of the 5 never-null fields; null accepted for the 8 nullable fields only in the verified patterns; the all-null input rejected |
| Consistency (R10 to R19) | From several valid archetypes (typical customer, no valid readings, no positive readings, a single reading, a full window), each rule is violated by one controlled mutation and must produce that rule's code and no unrelated secondary error |
| Boundaries | `valid_readings` at 0 and at the window and one above; percent error just inside and outside 5.1e-4; equal minimum, median and maximum; mean equal to maximum; 1e-10 relative drift accepted |
| Warnings (W1, W2) | Warnings never change `ok` or the normalised values; a typical row yields none; thresholds fire at the stated limits |
| Contract | Result shape; deterministic ordering; the input object is not modified; offending text such as a fake path never appears in any message; the 50-issue cap; normalised output is in model order as floats |
| Fuzz (seeded, standard library) | Thousands of random JSON-like payloads and single-field corruptions of valid rows: `validate()` never raises, and anything invalid is rejected |
| Dataset conformance (optional) | All 42,372 table rows pass with zero errors and zero warnings, and the normalised values equal the file's. A rejection means a rule is too strict. A mutation sweep over a seeded sample of rows confirms each rule catches its violation. |

**Where they run:** the pure unit tests and the dataset conformance test can run in Claude's sandbox and on the owner's Windows machine, and the two sets of results will be reported separately. Nothing in Phase 2b needs FastAPI, so nothing here is "HTTP tested"; that is Phase 2c.

## 8. Decisions requested

| # | Question | Recommendation |
| --- | --- | --- |
| 1 | Reject unknown top-level keys beside `features` (R01)? | Yes: strict, so typos are not ignored; additions come with a new API version |
| 2 | Treat the sum identity (W2) as a warning and not a rejection? | Warning: client rounding breaks it, and the model can still score the row |
| 3 | Require percentages to three decimals (5.1e-4 tolerance)? | Yes, matching the table |
| 4 | Accept whole-number floats such as `1000.0` for counts? | Yes |
| 5 | Is the W1 range the full 42,372-row table (development and test splits together), described as "the project's dataset table"? | Yes, worded exactly that way |
| 6 | Keep the window at 1,034, labelled inferred and set in one config constant? | Yes; revisit with the Phase 3 feature code |

## 9. Limits

- The rules check internal consistency, not agreement with raw readings.
- The range warning is coarse: the table's maximum (800,003.32) is far above typical values, so only extreme values trigger it.
- Passing validation does not make a prediction reliable, and the model's documented limitations still apply.

## 10. Next gate

Phase 2c (the `/v1` service and real HTTP tests) does not start until this specification and the unit-test results are approved.
