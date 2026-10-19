"""FastAPI wiring for the TheftGuard AI /v1 service.

Run from the ml-service folder (the existing app.py and model are never modified):

    set THEFTGUARD_MODEL_PATH=<path to validated_candidate_pipeline.joblib>
    python -m uvicorn service.main:app --host 127.0.0.1 --port 8000

Environment variables
    THEFTGUARD_MODEL_PATH       required; the model file (only ever read)
    THEFTGUARD_MODEL_SHA256     optional; defaults to the recorded value; a mismatch refuses to serve
    THEFTGUARD_ENABLE_DOCS      set to 1 to enable /docs and /openapi.json (off by default)
    THEFTGUARD_MAX_BODY_BYTES   optional request size limit (default 20 MiB)

All request logic lives in v1_handlers.py (tested without a web framework). This file only wires it.
Error bodies never contain paths, stack traces or exception text.
"""

import os
import sys

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.concurrency import run_in_threadpool
from starlette.exceptions import HTTPException as StarletteHTTPException

from . import validation_config as C
from .db import DatabaseConfigError
from .persistence_routes import persistence_router
from .scoring import ServiceLoadError
from .v1_handlers import Service, error_body

_docs = os.getenv("THEFTGUARD_ENABLE_DOCS") == "1"
app = FastAPI(title="TheftGuard AI /v1 service", version="1.0.0",
              docs_url="/docs" if _docs else None, redoc_url=None,
              openapi_url="/openapi.json" if _docs else None)

app.include_router(persistence_router)

MAX_BODY = int(os.getenv("THEFTGUARD_MAX_BODY_BYTES", C.DEFAULT_MAX_BODY_BYTES))

service = None
try:
    _path = os.getenv("THEFTGUARD_MODEL_PATH")
    if not _path:
        raise ServiceLoadError("model_path_not_set")
    service = Service.load(_path, os.getenv("THEFTGUARD_MODEL_SHA256", C.EXPECTED_MODEL_SHA256))
except ServiceLoadError as exc:
    print(f"[theftguard-v1] model unavailable: {exc}", file=sys.stderr)
except Exception as exc:  # noqa: BLE001
    print(f"[theftguard-v1] model unavailable: {type(exc).__name__}", file=sys.stderr)


def _json(status, body):
    return JSONResponse(body, status_code=status)


def _unavailable():
    return _json(503, error_body("model_unavailable", "The scoring service is not available."))


async def _read_body(request):
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_BODY:
        return None
    body = await request.body()
    return None if len(body) > MAX_BODY else body


@app.get("/v1/health")
def health():
    if service is None:
        return _unavailable()
    return _json(*service.health())


@app.get("/v1/model-metadata")
def model_metadata():
    if service is None:
        return _unavailable()
    return _json(*service.model_metadata())


@app.post("/v1/predict")
async def predict(request: Request):
    if service is None:
        return _unavailable()
    body = await _read_body(request)
    if body is None:
        return _json(413, error_body("payload_too_large", "The request body is too large."))
    return _json(*await run_in_threadpool(service.predict, body))


@app.post("/v1/predict-batch")
async def predict_batch(request: Request):
    if service is None:
        return _unavailable()
    body = await _read_body(request)
    if body is None:
        return _json(413, error_body("payload_too_large", "The request body is too large."))
    return _json(*await run_in_threadpool(service.predict_batch, body))


_HTTP_CODES = {404: ("not_found", "Not found."), 405: ("method_not_allowed", "Method not allowed.")}


@app.exception_handler(RequestValidationError)
async def _validation_error(request: Request, exc: RequestValidationError):
    issues = []
    for err in exc.errors():
        loc = [str(x) for x in err.get("loc", []) if x != "body"]
        field = ".".join(loc) if loc else "body"
        issues.append({"field": field, "message": err.get("msg", "Invalid value"), "type": err.get("type", "value_error")})
    return _json(422, error_body("validation_error", "Request validation failed.", issues=issues))


@app.exception_handler(StarletteHTTPException)
async def _http_error(request, exc):
    if isinstance(exc.detail, dict) and "error" in exc.detail:
        return _json(exc.status_code, exc.detail)
    default_code, default_msg = _HTTP_CODES.get(exc.status_code, ("http_error", "The request could not be processed."))
    code = default_code
    message = exc.detail if isinstance(exc.detail, str) and exc.detail and exc.status_code not in _HTTP_CODES else default_msg
    return _json(exc.status_code, error_body(code, message))


@app.exception_handler(DatabaseConfigError)
async def _db_config_error(request: Request, exc: DatabaseConfigError):
    return _json(503, error_body("database_unavailable", "Database service is not configured or available."))


@app.exception_handler(Exception)
async def _unhandled(request, exc):
    return _json(500, error_body("internal_error", "An internal error occurred."))
