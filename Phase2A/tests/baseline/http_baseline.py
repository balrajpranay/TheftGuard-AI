#!/usr/bin/env python
"""
TheftGuard AI - Phase 2a: HTTP baseline characterization of the EXISTING service.

What this is
------------
A client that sends real HTTP requests to a locally running, UNCHANGED copy of the
current FastAPI service (app.py) and records what it actually returns. It tests
nothing new: no /v1 route exists yet. Its purpose is to measure the current behaviour
before any change, including the known gaps documented in docs/API_CONTRACTS.md.

Guarantees
----------
* Read-only. It never writes to the service folder, the model, or any input file.
  It hashes the inputs and snapshots the service folder before and after the run.
* Standard library only for HTTP (http.client). Data preparation reuses numpy, pandas
  and scikit-learn, which the FastAPI environment already contains. Nothing is installed.
* Loopback only. --base-url must point at 127.0.0.1 or localhost.
* Writes only a new timestamped report in --out-dir and refuses to overwrite.

Status vocabulary
-----------------
PASS          a contract expectation read from app.py held
FAIL          a contract expectation did not hold
OBSERVED      a behaviour was recorded; no pass/fail is claimed (gap probes, framework
              behaviour, latency)
NOT_PERFORMED the check could not be run (reason given)
"""

import argparse
import datetime as dt
import hashlib
import http.client
import json
import os
import platform
import re
import statistics
import sys
import threading
import time
import urllib.parse
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

EXPECTED_FEATURES = [
    "valid_readings", "missing_percent", "zero_count", "zero_percent_of_observed",
    "mean_observed", "median_observed", "std_observed", "min_observed",
    "max_observed", "mean_positive", "median_positive", "positive_readings",
    "positive_percent_of_all_dates",
]
# Hashes recorded in the Phase 1 verification run (owner's Windows machine, 2026-10-17).
EXPECTED_APP_SHA256 = "3c4b23c55d07196bf4625d67d27d04356dfc82d85e90b2a6a1a15e7337d70035"
EXPECTED_MODEL_SHA256 = "442981aa7f24885d89363bfd6bc9123c2d05dbc13c59e58644d82e6773a5a2a5"
RANDOM_STATE, TEST_SIZE = 2026, 0.20
ID_NAMES = {"cons_no", "customer_id", "customerid", "id"}
RESPONSE_KEYS = {"predicted_label", "predicted_label_name", "probability_flag_1", "interpretation"}

RESULTS = []


def record(cid, title, status, detail, evidence=None):
    RESULTS.append({"id": cid, "title": title, "status": status,
                    "detail": detail, "evidence": evidence or {}})


def guarded(cid, title, fn):
    try:
        fn()
    except Exception as exc:  # noqa: BLE001 - report and continue
        record(cid, title, "FAIL", f"Unexpected error in the test itself: {type(exc).__name__}: {exc}")


def sha256_of(path, chunk=1 << 20):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(chunk), b""):
            h.update(block)
    return h.hexdigest()


def snapshot_dir(root):
    """Name, size and mtime of every file under root (the .venv and .git folders are skipped)."""
    snap = {}
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in (".venv", ".git")]
        for name in filenames:
            p = Path(dirpath) / name
            try:
                st = p.stat()
                snap[str(p.relative_to(root))] = (st.st_size, st.st_mtime_ns)
            except OSError:
                pass
    return snap


class Client:
    def __init__(self, base_url, timeout=60):
        u = urllib.parse.urlparse(base_url)
        if u.hostname not in ("127.0.0.1", "localhost"):
            sys.exit("Refusing to run: --base-url must point at 127.0.0.1 or localhost.")
        self.host, self.port, self.timeout = u.hostname, u.port or 80, timeout

    def request(self, method, path, body=None, headers=None):
        """Send one HTTP request. body may be bytes, str, or a JSON-serialisable object."""
        hdrs = dict(headers or {})
        if body is not None and not isinstance(body, (bytes, str)):
            body = json.dumps(body)  # allow_nan stays True so Infinity/NaN tokens can be sent
            hdrs.setdefault("Content-Type", "application/json")
        if isinstance(body, str):
            body = body.encode("utf-8")
        conn = http.client.HTTPConnection(self.host, self.port, timeout=self.timeout)
        t0 = time.perf_counter()
        try:
            conn.request(method, path, body=body, headers=hdrs)
            resp = conn.getresponse()
            raw = resp.read()
            ms = (time.perf_counter() - t0) * 1000
            text = raw.decode("utf-8", errors="replace")
            try:
                parsed = json.loads(text)
            except ValueError:
                parsed = None
            return {"status": resp.status, "headers": {k.lower(): v for k, v in resp.getheaders()},
                    "text": text, "json": parsed, "ms": ms}
        finally:
            conn.close()


def leak_indicators(text):
    return {
        "traceback": "Traceback" in text,
        "windows_or_unix_path": bool(re.search(r"[A-Za-z]:\\|/home/|/mnt/|/usr/|/var/", text)),
        "mentions_joblib": ".joblib" in text,
        "exception_class_name": bool(re.search(r"\b[A-Za-z]+Error\b|\bException\b", text)),
    }


def short(text, n=300):
    return text if len(text) <= n else text[:n] + "...[truncated]"


def load_sample(features_csv, predictions_csv, n, full):
    """Re-create the Step 7 split and return rows of the held-out test set with their saved results."""
    df = pd.read_csv(features_csv, low_memory=False)
    labels = pd.to_numeric(df["FLAG"], errors="coerce")
    valid = labels.isin([0, 1])
    df, y = df.loc[valid].copy(), labels.loc[valid].astype(int)
    id_cols = [c for c in df.columns if c.strip().lower() in ID_NAMES]
    X = df.drop(columns=["FLAG"] + id_cols, errors="ignore")
    X = X.apply(pd.to_numeric, errors="coerce").replace([np.inf, -np.inf], np.nan)
    X = X.drop(columns=[c for c in X.columns if X[c].isna().all()])
    X = X.drop(columns=[c for c in X.columns if X[c].nunique(dropna=True) <= 1])
    _, Xt, _, yt = train_test_split(X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=y)
    pred = pd.read_csv(predictions_csv)
    if list(X.columns) != EXPECTED_FEATURES:
        raise RuntimeError("Feature table columns differ from the expected 13 names.")
    if len(pred) != len(Xt) or not (yt.to_numpy() == pred["actual_FLAG"].to_numpy()).all():
        raise RuntimeError("Reproduced test split does not line up with the saved predictions file.")
    idx = list(range(len(Xt))) if full else list(range(min(n, len(Xt))))
    if not full:
        nan_rows = [i for i in range(len(Xt)) if Xt.iloc[i].isna().any() and i not in set(idx)][:25]
        idx += nan_rows
    rows = []
    for i in idx:
        r = Xt.iloc[i]
        feats = {c: (None if pd.isna(r[c]) else float(r[c])) for c in EXPECTED_FEATURES}
        rows.append({"i": i, "features": feats, "has_null": any(v is None for v in feats.values()),
                     "label": int(pred["predicted_FLAG"].iloc[i]),
                     "score": float(pred["predicted_probability_FLAG_1"].iloc[i])})
    return rows


def main():
    ap = argparse.ArgumentParser(description="Phase 2a HTTP baseline characterization (read-only)")
    ap.add_argument("--base-url", default="http://127.0.0.1:8765")
    ap.add_argument("--features-csv", required=True)
    ap.add_argument("--predictions", required=True)
    ap.add_argument("--model", required=True, help="model file, hashed before and after only")
    ap.add_argument("--app-path", required=True, help="app.py, hashed before and after only")
    ap.add_argument("--watch-dir", required=True, help="service folder, snapshotted before and after")
    ap.add_argument("--sample-size", type=int, default=200)
    ap.add_argument("--full", action="store_true", help="send all 8,475 held-out rows (slower)")
    ap.add_argument("--out-dir", default="phase2a_results")
    args = ap.parse_args()

    started = dt.datetime.now(dt.timezone.utc)
    stamp = started.strftime("%Y%m%dT%H%M%SZ")
    watched = {"model": Path(args.model), "app_path": Path(args.app_path),
               "features_csv": Path(args.features_csv), "predictions": Path(args.predictions)}
    for k, v in watched.items():
        if not v.is_file():
            sys.exit(f"Not found: --{k.replace('_', '-')} {v}")
    if not Path(args.watch_dir).is_dir():
        sys.exit(f"Not a folder: --watch-dir {args.watch_dir}")
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    md_path, json_path = out_dir / f"http_baseline_report_{stamp}.md", out_dir / f"http_baseline_report_{stamp}.json"
    if md_path.exists() or json_path.exists():
        sys.exit("Refusing to overwrite an existing report.")

    hashes_before = {k: sha256_of(v) for k, v in watched.items()}
    snap_before = snapshot_dir(args.watch_dir)
    c = Client(args.base_url)

    # Pre-flight: the service must already be running (started by the owner in another window).
    ok = False
    for _ in range(10):
        try:
            if c.request("GET", "/health")["status"]:
                ok = True
                break
        except OSError:
            time.sleep(1)
    if not ok:
        sys.exit(f"No service answered at {args.base_url}. Start the unchanged service first "
                 "(see ml-service/tests/baseline/README.md), then run this again.")

    # ------------------------------------------------------------------ S: source integrity
    def s01():
        a_ok = hashes_before["app_path"] == EXPECTED_APP_SHA256
        m_ok = hashes_before["model"] == EXPECTED_MODEL_SHA256
        record("S01", "Service source and model are the ones recorded in Phase 1",
               "PASS" if (a_ok and m_ok) else "FAIL",
               f"app.py hash matches: {a_ok}; model hash matches: {m_ok}.",
               {"app_sha256": hashes_before["app_path"], "model_sha256": hashes_before["model"]})
    guarded("S01", "Source integrity", s01)

    # ------------------------------------------------------------------ A: contract (read from app.py)
    def a01():
        r = c.request("GET", "/")
        j = r["json"] or {}
        ok = r["status"] == 200 and set(j) >= {"service", "status", "docs", "warning"} and j.get("status") == "ready"
        record("A01", "GET / returns the banner and status 'ready'", "PASS" if ok else "FAIL",
               f"HTTP {r['status']}; keys {sorted(j)}; status={j.get('status')!r}.", {"body": j})
    guarded("A01", "Root", a01)

    def a02():
        r = c.request("GET", "/health")
        j = r["json"] or {}
        ok = (r["status"] == 200 and set(j) == {"status", "model_loaded", "model_path", "error"}
              and j.get("status") == "ok" and j.get("model_loaded") is True)
        record("A02", "GET /health returns ok with the documented keys", "PASS" if ok else "FAIL",
               f"HTTP {r['status']}; status={j.get('status')!r}; model_loaded={j.get('model_loaded')!r}.",
               {"keys": sorted(j)})
        mp = str(j.get("model_path", ""))
        record("A02b", "GET /health discloses the model file location (gap G9)", "OBSERVED",
               f"model_path is returned; absolute path: {os.path.isabs(mp) or bool(re.match(r'^[A-Za-z]:', mp))}.",
               {"model_path_value": mp})
    guarded("A02", "Health", a02)

    def a03():
        r = c.request("GET", "/features")
        j = r["json"] or {}
        ok = r["status"] == 200 and j.get("required_features") == EXPECTED_FEATURES and j.get("count") == 13
        record("A03", "GET /features lists the 13 names in model order", "PASS" if ok else "FAIL",
               f"HTTP {r['status']}; names equal expected list and order: {j.get('required_features') == EXPECTED_FEATURES}.")
    guarded("A03", "Features", a03)

    try:
        sample = load_sample(args.features_csv, args.predictions, args.sample_size, args.full)
        sample_err = None
    except Exception as exc:  # noqa: BLE001
        sample, sample_err = [], f"{type(exc).__name__}: {exc}"
    good = next((s["features"] for s in sample if not s["has_null"]), None)

    def a04():
        if good is None:
            record("A04", "POST /predict with a valid training-table row", "NOT_PERFORMED",
                   f"No valid sample row available ({sample_err}).")
            return
        r = c.request("POST", "/predict", {"features": good})
        j = r["json"] or {}
        ok = (r["status"] == 200 and set(j) == RESPONSE_KEYS and j["predicted_label"] in (0, 1)
              and j["predicted_label_name"] == ("Potentially Suspicious" if j["predicted_label"] == 1
                                                else "No Suspicious Pattern Flagged")
              and 0.0 <= j["probability_flag_1"] <= 1.0)
        record("A04", "POST /predict returns the documented response shape", "PASS" if ok else "FAIL",
               f"HTTP {r['status']}; keys {sorted(j)}.", {"body": j, "content_type": r["headers"].get("content-type")})
    guarded("A04", "Predict shape", a04)

    def a05():
        if good is None:
            record("A05", "Missing feature returns 422 with a 'missing' list", "NOT_PERFORMED", "No valid sample row.")
            return
        miss = {k: v for k, v in good.items() if k != EXPECTED_FEATURES[0]}
        r = c.request("POST", "/predict", {"features": miss})
        d = (r["json"] or {}).get("detail")
        ok = r["status"] == 422 and isinstance(d, dict) and d.get("missing") == [EXPECTED_FEATURES[0]]
        record("A05", "Missing feature returns 422 with a 'missing' list", "PASS" if ok else "FAIL",
               f"HTTP {r['status']}; detail type {type(d).__name__}.", {"detail": d})
        r2 = c.request("POST", "/predict", {"features": {**good, "CONS_NO": 1}})
        d2 = (r2["json"] or {}).get("detail")
        ok2 = r2["status"] == 422 and isinstance(d2, dict) and d2.get("unexpected") == ["CONS_NO"]
        record("A06", "An identifier-like extra key is rejected with 422 'unexpected'", "PASS" if ok2 else "FAIL",
               f"HTTP {r2['status']}; detail type {type(d2).__name__}.", {"detail": d2})
    guarded("A05", "Missing/extra", a05)

    def a07():
        if sample_err:
            record("A07", "Saved held-out predictions reproduced over HTTP", "NOT_PERFORMED", sample_err)
            return
        mism, maxd, bad_status, n = 0, 0.0, 0, 0
        for s in sample:
            r = c.request("POST", "/predict", {"features": s["features"]})
            n += 1
            if r["status"] != 200:
                bad_status += 1
                continue
            j = r["json"]
            if j["predicted_label"] != s["label"]:
                mism += 1
            maxd = max(maxd, abs(j["probability_flag_1"] - s["score"]))
        nulls = sum(1 for s in sample if s["has_null"])
        ok = bad_status == 0 and mism == 0 and maxd <= 1e-9
        record("A07", "Saved held-out predictions reproduced over HTTP", "PASS" if ok else "FAIL",
               f"{n} rows sent ({nulls} with null values); non-200: {bad_status}; label mismatches: {mism}; "
               f"largest score difference: {maxd:.3g} (tolerance 1e-9).",
               {"rows": n, "rows_with_nulls": nulls, "full_test_set": bool(args.full)})
    guarded("A07", "Reproduction", a07)

    # ------------------------------------------------------------------ B: framework behaviour (observed)
    def obs(cid, title, method, path, body=None, headers=None):
        r = c.request(method, path, body, headers)
        j = r["json"]
        record(cid, title, "OBSERVED", f"HTTP {r['status']}.",
               {"status": r["status"], "content_type": r["headers"].get("content-type"),
                "json_top_level_keys": sorted(j) if isinstance(j, dict) else None,
                "body_start": short(r["text"]), "leak_indicators": leak_indicators(r["text"])})
        return r

    guarded("B01", "Malformed JSON", lambda: obs("B01", "Malformed JSON body", "POST", "/predict", b'{"features": {', {"Content-Type": "application/json"}))
    guarded("B02", "Empty body", lambda: obs("B02", "Empty body", "POST", "/predict", b"", {"Content-Type": "application/json"}))
    guarded("B03", "No features key", lambda: obs("B03", "Body without a 'features' key", "POST", "/predict", {}))
    guarded("B04", "features is a list", lambda: obs("B04", "'features' is a list", "POST", "/predict", {"features": [1, 2, 3]}))
    guarded("B05", "features is null", lambda: obs("B05", "'features' is null", "POST", "/predict", {"features": None}))
    if good is not None:
        guarded("B06", "Wrong content type", lambda: obs("B06", "Valid JSON sent as text/plain", "POST", "/predict", json.dumps({"features": good}), {"Content-Type": "text/plain"}))
    guarded("B07", "GET predict", lambda: obs("B07", "GET /predict (wrong method)", "GET", "/predict"))
    guarded("B08", "POST health", lambda: obs("B08", "POST /health (wrong method)", "POST", "/health", {}))
    guarded("B09", "Unknown path", lambda: obs("B09", "Unknown path", "GET", "/does-not-exist"))
    guarded("B10", "OpenAPI", lambda: obs("B10", "GET /openapi.json (interactive docs are enabled by default)", "GET", "/openapi.json"))

    def b11():
        if good is None:
            return
        big = {**good, "padding": "x" * 2_000_000}
        r = obs("B11", "About 2 MB request body with one extra key (no size limit expected; gap G2)", "POST", "/predict", big)
        RESULTS[-1]["evidence"]["elapsed_ms"] = round(r["ms"], 1)
    guarded("B11", "Large body", b11)

    def b12():
        r1 = c.request("OPTIONS", "/predict", headers={"Origin": "http://localhost:3000",
                                                      "Access-Control-Request-Method": "POST"})
        r2 = c.request("GET", "/health", headers={"Origin": "http://localhost:3000"})
        record("B12", "Cross-origin requests (no CORS configuration expected; gap G2)", "OBSERVED",
               f"Preflight HTTP {r1['status']}; Access-Control-Allow-Origin on preflight: "
               f"{'access-control-allow-origin' in r1['headers']}; on GET: {'access-control-allow-origin' in r2['headers']}.",
               {"preflight_status": r1["status"], "server_header": r2["headers"].get("server")})
    guarded("B12", "CORS", b12)

    # ------------------------------------------------------------------ C: known-gap probes (observed)
    if good is not None:
        probes = [
            ("C01", "Negative valid_readings", {**good, "valid_readings": -5}),
            ("C02", "missing_percent = 500", {**good, "missing_percent": 500}),
            ("C03", "null mean_observed", {**good, "mean_observed": None}),
            ("C04", "String mean_observed", {**good, "mean_observed": "abc"}),
            ("C05", "Infinity std_observed (JSON token Infinity)", {**good, "std_observed": float("inf")}),
            ("C06", "NaN mean_observed (JSON token NaN)", {**good, "mean_observed": float("nan")}),
            ("C07", "Boolean zero_count", {**good, "zero_count": True}),
            ("C08", "Numeric string zero_count '5'", {**good, "zero_count": "5"}),
            ("C09", "Huge magnitude 1e308 in max_observed", {**good, "max_observed": 1e308}),
            ("C10", "All 13 values null", {k: None for k in EXPECTED_FEATURES}),
        ]
        for cid, title, feats in probes:
            guarded(cid, title, lambda cid=cid, title=title, feats=feats: obs(cid, title, "POST", "/predict", {"features": feats}))

    # ------------------------------------------------------------------ D: smoke (observed)
    def d01():
        lat = [c.request("GET", "/health")["ms"] for _ in range(20)]
        record("D01", "20 sequential GET /health requests", "OBSERVED",
               f"median {statistics.median(lat):.1f} ms; max {max(lat):.1f} ms.", {"unit": "milliseconds"})
    guarded("D01", "Health latency", d01)

    def d02():
        if good is None:
            return
        out, lock = [], threading.Lock()

        def worker():
            for _ in range(4):
                r = c.request("POST", "/predict", {"features": good})
                with lock:
                    out.append((r["status"], r["ms"]))
        ts = [threading.Thread(target=worker) for _ in range(5)]
        [t.start() for t in ts]
        [t.join() for t in ts]
        record("D02", "5 parallel clients, 4 predictions each", "OBSERVED",
               f"{len(out)} requests; statuses {sorted({s for s, _ in out})}; "
               f"median {statistics.median([m for _, m in out]):.1f} ms; max {max(m for _, m in out):.1f} ms.",
               {"unit": "milliseconds"})
    guarded("D02", "Parallel", d02)

    # ------------------------------------------------------------------ finish
    hashes_after = {k: sha256_of(v) for k, v in watched.items()}
    snap_after = snapshot_dir(args.watch_dir)
    changed = sorted(k for k in set(snap_before) | set(snap_after) if snap_before.get(k) != snap_after.get(k))
    record("I01", "Inputs, including the model and app.py, were not modified during the run",
           "PASS" if hashes_before == hashes_after else "FAIL",
           "SHA-256 of every watched file is identical before and after the run."
           if hashes_before == hashes_after else "At least one watched file changed.",
           {"sha256": hashes_after})
    record("I02", "The service folder gained or changed no files during the run",
           "PASS" if not changed else "FAIL",
           "No file in the service folder (excluding .venv and .git) was added, removed or changed between the "
           "start and end of this run." if not changed else
           f"Changed during the run: {changed}. A new __pycache__ file means the service was started without "
           "PYTHONDONTWRITEBYTECODE=1; a sync client such as OneDrive can also touch files.",
           {"changed_paths": changed})
    RESULTS.sort(key=lambda r: (r["id"][0], r["id"]))

    import sklearn
    env = {"python": platform.python_version(), "platform": platform.platform(),
           "pandas": pd.__version__, "numpy": np.__version__, "scikit-learn": sklearn.__version__}
    counts = {s: sum(1 for r in RESULTS if r["status"] == s) for s in ("PASS", "FAIL", "OBSERVED", "NOT_PERFORMED")}
    finished = dt.datetime.now(dt.timezone.utc)
    payload = {"run_started_utc": started.isoformat(), "run_finished_utc": finished.isoformat(),
               "service_under_test": args.base_url, "environment_of_this_run": env, "sample_error": sample_err,
               "summary": counts, "results": RESULTS,
               "scope_note": "Phase 2a baseline of the unchanged service over real HTTP. It describes this run on this "
                             "machine only and tests no new code."}
    json_path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    lines = ["# TheftGuard AI Phase 2a HTTP baseline report", "",
             f"Run started (UTC): {started.isoformat()}  ", f"Service under test: {args.base_url}  ",
             f"Run on: Python {env['python']} on {env['platform']}; pandas {env['pandas']}, numpy {env['numpy']}, "
             f"scikit-learn {env['scikit-learn']}  ", "",
             "Baseline of the unchanged service over real HTTP. It describes this run only.", "",
             f"**Summary:** {counts['PASS']} PASS, {counts['FAIL']} FAIL, {counts['OBSERVED']} OBSERVED, "
             f"{counts['NOT_PERFORMED']} NOT_PERFORMED", "",
             "| ID | Check | Status | Detail |", "| --- | --- | --- | --- |"]
    for r in RESULTS:
        lines.append(f"| {r['id']} | {r['title']} | {r['status']} | {r['detail'].replace('|', '/')} |")
    lines += ["", "## Evidence", ""]
    for r in RESULTS:
        if r["evidence"]:
            lines += [f"### {r['id']}", "", "```json", json.dumps(r["evidence"], indent=2, default=str), "```", ""]
    md_path.write_text("\n".join(lines), encoding="utf-8")

    print("\nTheftGuard AI Phase 2a HTTP baseline (read-only)")
    for r in RESULTS:
        print(f"[{r['status']:13}] {r['id']:5} {r['title']}\n                {r['detail']}")
    print(f"\nSummary: {counts}\nReports written: {md_path} ; {json_path}")
    sys.exit(1 if counts["FAIL"] else 0)


if __name__ == "__main__":
    main()
