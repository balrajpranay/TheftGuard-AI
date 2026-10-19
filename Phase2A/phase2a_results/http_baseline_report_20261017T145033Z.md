# TheftGuard AI Phase 2a HTTP baseline report

Run started (UTC): 2026-10-17T14:50:33.951876+00:00  
Service under test: http://127.0.0.1:8765  
Run on: Python 3.13.16 on Windows-11-10.0.26200-SP0; pandas 3.0.6, numpy 2.5.4, scikit-learn 1.9.1  

Baseline of the unchanged service over real HTTP. It describes this run only.

**Summary:** 10 PASS, 0 FAIL, 25 OBSERVED, 0 NOT_PERFORMED

| ID | Check | Status | Detail |
| --- | --- | --- | --- |
| A01 | GET / returns the banner and status 'ready' | PASS | HTTP 200; keys ['docs', 'service', 'status', 'warning']; status='ready'. |
| A02 | GET /health returns ok with the documented keys | PASS | HTTP 200; status='ok'; model_loaded=True. |
| A02b | GET /health discloses the model file location (gap G9) | OBSERVED | model_path is returned; absolute path: False. |
| A03 | GET /features lists the 13 names in model order | PASS | HTTP 200; names equal expected list and order: True. |
| A04 | POST /predict returns the documented response shape | PASS | HTTP 200; keys ['interpretation', 'predicted_label', 'predicted_label_name', 'probability_flag_1']. |
| A05 | Missing feature returns 422 with a 'missing' list | PASS | HTTP 422; detail type dict. |
| A06 | An identifier-like extra key is rejected with 422 'unexpected' | PASS | HTTP 422; detail type dict. |
| A07 | Saved held-out predictions reproduced over HTTP | PASS | 225 rows sent (38 with null values); non-200: 0; label mismatches: 0; largest score difference: 2.22e-16 (tolerance 1e-9). |
| B01 | Malformed JSON body | OBSERVED | HTTP 422. |
| B02 | Empty body | OBSERVED | HTTP 422. |
| B03 | Body without a 'features' key | OBSERVED | HTTP 422. |
| B04 | 'features' is a list | OBSERVED | HTTP 422. |
| B05 | 'features' is null | OBSERVED | HTTP 422. |
| B06 | Valid JSON sent as text/plain | OBSERVED | HTTP 422. |
| B07 | GET /predict (wrong method) | OBSERVED | HTTP 405. |
| B08 | POST /health (wrong method) | OBSERVED | HTTP 405. |
| B09 | Unknown path | OBSERVED | HTTP 404. |
| B10 | GET /openapi.json (interactive docs are enabled by default) | OBSERVED | HTTP 200. |
| B11 | About 2 MB request body with one extra key (no size limit expected; gap G2) | OBSERVED | HTTP 422. |
| B12 | Cross-origin requests (no CORS configuration expected; gap G2) | OBSERVED | Preflight HTTP 405; Access-Control-Allow-Origin on preflight: False; on GET: False. |
| C01 | Negative valid_readings | OBSERVED | HTTP 200. |
| C02 | missing_percent = 500 | OBSERVED | HTTP 200. |
| C03 | null mean_observed | OBSERVED | HTTP 200. |
| C04 | String mean_observed | OBSERVED | HTTP 500. |
| C05 | Infinity std_observed (JSON token Infinity) | OBSERVED | HTTP 500. |
| C06 | NaN mean_observed (JSON token NaN) | OBSERVED | HTTP 200. |
| C07 | Boolean zero_count | OBSERVED | HTTP 200. |
| C08 | Numeric string zero_count '5' | OBSERVED | HTTP 200. |
| C09 | Huge magnitude 1e308 in max_observed | OBSERVED | HTTP 500. |
| C10 | All 13 values null | OBSERVED | HTTP 200. |
| D01 | 20 sequential GET /health requests | OBSERVED | median 1.1 ms; max 1.3 ms. |
| D02 | 5 parallel clients, 4 predictions each | OBSERVED | 20 requests; statuses [200]; median 464.3 ms; max 515.5 ms. |
| I01 | Inputs, including the model and app.py, were not modified during the run | PASS | SHA-256 of every watched file is identical before and after the run. |
| I02 | The service folder gained or changed no files during the run | PASS | No file in the service folder (excluding .venv and .git) was added, removed or changed between the start and end of this run. |
| S01 | Service source and model are the ones recorded in Phase 1 | PASS | app.py hash matches: True; model hash matches: True. |

## Evidence

### A01

```json
{
  "body": {
    "service": "TheftGuard AI ML API",
    "status": "ready",
    "docs": "/docs",
    "warning": "Predictions indicate similarity to dataset labels; they do not prove theft."
  }
}
```

### A02

```json
{
  "keys": [
    "error",
    "model_loaded",
    "model_path",
    "status"
  ]
}
```

### A02b

```json
{
  "model_path_value": "validated_candidate_pipeline.joblib"
}
```

### A04

```json
{
  "body": {
    "predicted_label": 0,
    "predicted_label_name": "No Suspicious Pattern Flagged",
    "probability_flag_1": 0.13196218623813116,
    "interpretation": "This is a model prediction of the source dataset's FLAG label, not confirmation of electricity theft. A qualified utility investigation and verified local data are required."
  },
  "content_type": "application/json"
}
```

### A05

```json
{
  "detail": {
    "message": "Missing required features",
    "missing": [
      "valid_readings"
    ]
  }
}
```

### A06

```json
{
  "detail": {
    "message": "Unexpected features supplied",
    "unexpected": [
      "CONS_NO"
    ]
  }
}
```

### A07

```json
{
  "rows": 225,
  "rows_with_nulls": 38,
  "full_test_set": false
}
```

### B01

```json
{
  "status": 422,
  "content_type": "application/json",
  "json_top_level_keys": [
    "detail"
  ],
  "body_start": "{\"detail\":[{\"type\":\"json_invalid\",\"loc\":[\"body\",14],\"msg\":\"JSON decode error\",\"input\":{},\"ctx\":{\"error\":\"Expecting property name enclosed in double quotes\"}}]}",
  "leak_indicators": {
    "traceback": false,
    "windows_or_unix_path": false,
    "mentions_joblib": false,
    "exception_class_name": false
  }
}
```

### B02

```json
{
  "status": 422,
  "content_type": "application/json",
  "json_top_level_keys": [
    "detail"
  ],
  "body_start": "{\"detail\":[{\"type\":\"missing\",\"loc\":[\"body\"],\"msg\":\"Field required\",\"input\":null}]}",
  "leak_indicators": {
    "traceback": false,
    "windows_or_unix_path": false,
    "mentions_joblib": false,
    "exception_class_name": false
  }
}
```

### B03

```json
{
  "status": 422,
  "content_type": "application/json",
  "json_top_level_keys": [
    "detail"
  ],
  "body_start": "{\"detail\":[{\"type\":\"missing\",\"loc\":[\"body\",\"features\"],\"msg\":\"Field required\",\"input\":{}}]}",
  "leak_indicators": {
    "traceback": false,
    "windows_or_unix_path": false,
    "mentions_joblib": false,
    "exception_class_name": false
  }
}
```

### B04

```json
{
  "status": 422,
  "content_type": "application/json",
  "json_top_level_keys": [
    "detail"
  ],
  "body_start": "{\"detail\":[{\"type\":\"dict_type\",\"loc\":[\"body\",\"features\"],\"msg\":\"Input should be a valid dictionary\",\"input\":[1,2,3]}]}",
  "leak_indicators": {
    "traceback": false,
    "windows_or_unix_path": false,
    "mentions_joblib": false,
    "exception_class_name": false
  }
}
```

### B05

```json
{
  "status": 422,
  "content_type": "application/json",
  "json_top_level_keys": [
    "detail"
  ],
  "body_start": "{\"detail\":[{\"type\":\"dict_type\",\"loc\":[\"body\",\"features\"],\"msg\":\"Input should be a valid dictionary\",\"input\":null}]}",
  "leak_indicators": {
    "traceback": false,
    "windows_or_unix_path": false,
    "mentions_joblib": false,
    "exception_class_name": false
  }
}
```

### B06

```json
{
  "status": 422,
  "content_type": "application/json",
  "json_top_level_keys": [
    "detail"
  ],
  "body_start": "{\"detail\":[{\"type\":\"model_attributes_type\",\"loc\":[\"body\"],\"msg\":\"Input should be a valid dictionary or object to extract fields from\",\"input\":\"{\\\"features\\\": {\\\"valid_readings\\\": 923.0, \\\"missing_percent\\\": 10.735, \\\"zero_count\\\": 0.0, \\\"zero_percent_of_observed\\\": 0.0, \\\"mean_observed\\\": 7.00180931...[truncated]",
  "leak_indicators": {
    "traceback": false,
    "windows_or_unix_path": false,
    "mentions_joblib": false,
    "exception_class_name": false
  }
}
```

### B07

```json
{
  "status": 405,
  "content_type": "application/json",
  "json_top_level_keys": [
    "detail"
  ],
  "body_start": "{\"detail\":\"Method Not Allowed\"}",
  "leak_indicators": {
    "traceback": false,
    "windows_or_unix_path": false,
    "mentions_joblib": false,
    "exception_class_name": false
  }
}
```

### B08

```json
{
  "status": 405,
  "content_type": "application/json",
  "json_top_level_keys": [
    "detail"
  ],
  "body_start": "{\"detail\":\"Method Not Allowed\"}",
  "leak_indicators": {
    "traceback": false,
    "windows_or_unix_path": false,
    "mentions_joblib": false,
    "exception_class_name": false
  }
}
```

### B09

```json
{
  "status": 404,
  "content_type": "application/json",
  "json_top_level_keys": [
    "detail"
  ],
  "body_start": "{\"detail\":\"Not Found\"}",
  "leak_indicators": {
    "traceback": false,
    "windows_or_unix_path": false,
    "mentions_joblib": false,
    "exception_class_name": false
  }
}
```

### B10

```json
{
  "status": 200,
  "content_type": "application/json",
  "json_top_level_keys": [
    "components",
    "info",
    "openapi",
    "paths"
  ],
  "body_start": "{\"openapi\":\"3.1.0\",\"info\":{\"title\":\"TheftGuard AI ML API\",\"description\":\"Inference API for the TheftGuard AI experimental ML pipeline. A positive prediction is a dataset-label prediction, not proof of electricity theft.\",\"version\":\"0.1.0\"},\"paths\":{\"/\":{\"get\":{\"summary\":\"Root\",\"operationId\":\"root__g...[truncated]",
  "leak_indicators": {
    "traceback": false,
    "windows_or_unix_path": false,
    "mentions_joblib": false,
    "exception_class_name": true
  }
}
```

### B11

```json
{
  "status": 422,
  "content_type": "application/json",
  "json_top_level_keys": [
    "detail"
  ],
  "body_start": "{\"detail\":[{\"type\":\"missing\",\"loc\":[\"body\",\"features\"],\"msg\":\"Field required\",\"input\":{\"valid_readings\":923.0,\"missing_percent\":10.735,\"zero_count\":0.0,\"zero_percent_of_observed\":0.0,\"mean_observed\":7.00180931744312,\"median_observed\":6.74,\"std_observed\":1.8300765362300369,\"min_observed\":1.3,\"max_obs...[truncated]",
  "leak_indicators": {
    "traceback": false,
    "windows_or_unix_path": false,
    "mentions_joblib": false,
    "exception_class_name": false
  },
  "elapsed_ms": 32.1
}
```

### B12

```json
{
  "preflight_status": 405,
  "server_header": "uvicorn"
}
```

### C01

```json
{
  "status": 200,
  "content_type": "application/json",
  "json_top_level_keys": [
    "interpretation",
    "predicted_label",
    "predicted_label_name",
    "probability_flag_1"
  ],
  "body_start": "{\"predicted_label\":0,\"predicted_label_name\":\"No Suspicious Pattern Flagged\",\"probability_flag_1\":0.18319913030287513,\"interpretation\":\"This is a model prediction of the source dataset's FLAG label, not confirmation of electricity theft. A qualified utility investigation and verified local data are r...[truncated]",
  "leak_indicators": {
    "traceback": false,
    "windows_or_unix_path": false,
    "mentions_joblib": false,
    "exception_class_name": false
  }
}
```

### C02

```json
{
  "status": 200,
  "content_type": "application/json",
  "json_top_level_keys": [
    "interpretation",
    "predicted_label",
    "predicted_label_name",
    "probability_flag_1"
  ],
  "body_start": "{\"predicted_label\":0,\"predicted_label_name\":\"No Suspicious Pattern Flagged\",\"probability_flag_1\":0.17635525613120098,\"interpretation\":\"This is a model prediction of the source dataset's FLAG label, not confirmation of electricity theft. A qualified utility investigation and verified local data are r...[truncated]",
  "leak_indicators": {
    "traceback": false,
    "windows_or_unix_path": false,
    "mentions_joblib": false,
    "exception_class_name": false
  }
}
```

### C03

```json
{
  "status": 200,
  "content_type": "application/json",
  "json_top_level_keys": [
    "interpretation",
    "predicted_label",
    "predicted_label_name",
    "probability_flag_1"
  ],
  "body_start": "{\"predicted_label\":0,\"predicted_label_name\":\"No Suspicious Pattern Flagged\",\"probability_flag_1\":0.1286580376089825,\"interpretation\":\"This is a model prediction of the source dataset's FLAG label, not confirmation of electricity theft. A qualified utility investigation and verified local data are re...[truncated]",
  "leak_indicators": {
    "traceback": false,
    "windows_or_unix_path": false,
    "mentions_joblib": false,
    "exception_class_name": false
  }
}
```

### C04

```json
{
  "status": 500,
  "content_type": "application/json",
  "json_top_level_keys": [
    "detail"
  ],
  "body_start": "{\"detail\":\"Prediction failed: ValueError: Cannot use median strategy with non-numeric data:\\ncould not convert string to float: 'abc'\"}",
  "leak_indicators": {
    "traceback": false,
    "windows_or_unix_path": true,
    "mentions_joblib": false,
    "exception_class_name": true
  }
}
```

### C05

```json
{
  "status": 500,
  "content_type": "application/json",
  "json_top_level_keys": [
    "detail"
  ],
  "body_start": "{\"detail\":\"Prediction failed: ValueError: Input X contains infinity or a value too large for dtype('float64').\"}",
  "leak_indicators": {
    "traceback": false,
    "windows_or_unix_path": false,
    "mentions_joblib": false,
    "exception_class_name": true
  }
}
```

### C06

```json
{
  "status": 200,
  "content_type": "application/json",
  "json_top_level_keys": [
    "interpretation",
    "predicted_label",
    "predicted_label_name",
    "probability_flag_1"
  ],
  "body_start": "{\"predicted_label\":0,\"predicted_label_name\":\"No Suspicious Pattern Flagged\",\"probability_flag_1\":0.1286580376089825,\"interpretation\":\"This is a model prediction of the source dataset's FLAG label, not confirmation of electricity theft. A qualified utility investigation and verified local data are re...[truncated]",
  "leak_indicators": {
    "traceback": false,
    "windows_or_unix_path": false,
    "mentions_joblib": false,
    "exception_class_name": false
  }
}
```

### C07

```json
{
  "status": 200,
  "content_type": "application/json",
  "json_top_level_keys": [
    "interpretation",
    "predicted_label",
    "predicted_label_name",
    "probability_flag_1"
  ],
  "body_start": "{\"predicted_label\":0,\"predicted_label_name\":\"No Suspicious Pattern Flagged\",\"probability_flag_1\":0.1318132684892134,\"interpretation\":\"This is a model prediction of the source dataset's FLAG label, not confirmation of electricity theft. A qualified utility investigation and verified local data are re...[truncated]",
  "leak_indicators": {
    "traceback": false,
    "windows_or_unix_path": false,
    "mentions_joblib": false,
    "exception_class_name": false
  }
}
```

### C08

```json
{
  "status": 200,
  "content_type": "application/json",
  "json_top_level_keys": [
    "interpretation",
    "predicted_label",
    "predicted_label_name",
    "probability_flag_1"
  ],
  "body_start": "{\"predicted_label\":0,\"predicted_label_name\":\"No Suspicious Pattern Flagged\",\"probability_flag_1\":0.14134227281821773,\"interpretation\":\"This is a model prediction of the source dataset's FLAG label, not confirmation of electricity theft. A qualified utility investigation and verified local data are r...[truncated]",
  "leak_indicators": {
    "traceback": false,
    "windows_or_unix_path": false,
    "mentions_joblib": false,
    "exception_class_name": false
  }
}
```

### C09

```json
{
  "status": 500,
  "content_type": "application/json",
  "json_top_level_keys": [
    "detail"
  ],
  "body_start": "{\"detail\":\"Prediction failed: ValueError: Input X contains infinity or a value too large for dtype('float32').\"}",
  "leak_indicators": {
    "traceback": false,
    "windows_or_unix_path": false,
    "mentions_joblib": false,
    "exception_class_name": true
  }
}
```

### C10

```json
{
  "status": 200,
  "content_type": "application/json",
  "json_top_level_keys": [
    "interpretation",
    "predicted_label",
    "predicted_label_name",
    "probability_flag_1"
  ],
  "body_start": "{\"predicted_label\":0,\"predicted_label_name\":\"No Suspicious Pattern Flagged\",\"probability_flag_1\":0.28693423483623065,\"interpretation\":\"This is a model prediction of the source dataset's FLAG label, not confirmation of electricity theft. A qualified utility investigation and verified local data are r...[truncated]",
  "leak_indicators": {
    "traceback": false,
    "windows_or_unix_path": false,
    "mentions_joblib": false,
    "exception_class_name": false
  }
}
```

### D01

```json
{
  "unit": "milliseconds"
}
```

### D02

```json
{
  "unit": "milliseconds"
}
```

### I01

```json
{
  "sha256": {
    "model": "442981aa7f24885d89363bfd6bc9123c2d05dbc13c59e58644d82e6773a5a2a5",
    "app_path": "3c4b23c55d07196bf4625d67d27d04356dfc82d85e90b2a6a1a15e7337d70035",
    "features_csv": "2344186ff500132a3684745b7b96ca266235bc1aa7865401fa96ea370205395a",
    "predictions": "ba97db39972059f8b551d6df2f10c86791067387ad302abdb62988e7f8f2ff39"
  }
}
```

### I02

```json
{
  "changed_paths": []
}
```

### S01

```json
{
  "app_sha256": "3c4b23c55d07196bf4625d67d27d04356dfc82d85e90b2a6a1a15e7337d70035",
  "model_sha256": "442981aa7f24885d89363bfd6bc9123c2d05dbc13c59e58644d82e6773a5a2a5"
}
```
