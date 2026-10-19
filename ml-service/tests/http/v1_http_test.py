#!/usr/bin/env python
"""TheftGuard AI /v1 real-HTTP integration test (standard library only; one command).

It starts the NEW /v1 service itself (python -m uvicorn service.main:app on 127.0.0.1 and a free
port), sends real HTTP requests, then stops the server. It also starts two short-lived extra
servers to test the failure modes (wrong model hash, missing model file).

Read-only: it never writes to the model, app.py, datasets or predictions (all hashed before and
after). The only files it creates are a new timestamped report and server log in --out-dir.
Nothing is installed. Loopback only.

Status words: PASS, FAIL, OBSERVED (recorded only), NOT_PERFORMED.
"""
import argparse
import datetime as dt
import hashlib
import http.client
import json
import os
import platform
import re
import shlex
import socket
import statistics
import subprocess
import sys
import threading
import time
from pathlib import Path

ML_DIR = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ML_DIR))
sys.path.insert(0, str(ML_DIR / "tests" / "unit"))
from service import validation_config as C  # noqa: E402
import _data  # noqa: E402

LEAK = re.compile(r"Traceback|\.joblib|[A-Za-z]:\\|/home/|/mnt/|/usr/|\b[A-Za-z]+Error\b|\bException\b")
RESULTS = []


def record(cid, title, status, detail, evidence=None):
    RESULTS.append({"id": cid, "title": title, "status": status, "detail": detail, "evidence": evidence or {}})


def guarded(cid, title, fn):
    try:
        fn()
    except Exception as exc:  # noqa: BLE001
        record(cid, title, "FAIL", f"Unexpected error in the test itself: {type(exc).__name__}: {exc}")


def expect(cid, title, cond, detail, evidence=None):
    record(cid, title, "PASS" if cond else "FAIL", detail, evidence)


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def free_port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


class Client:
    def __init__(self, port, timeout=120):
        self.port, self.timeout = port, timeout

    def call(self, method, path, body=None, headers=None):
        hdrs = dict(headers or {})
        if body is not None and not isinstance(body, (bytes, str)):
            body = json.dumps(body)
            hdrs.setdefault("Content-Type", "application/json")
        if isinstance(body, str):
            body = body.encode("utf-8")
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=self.timeout)
        t0 = time.perf_counter()
        try:
            conn.request(method, path, body=body, headers=hdrs)
            r = conn.getresponse()
            raw = r.read()
            text = raw.decode("utf-8", errors="replace")
            try:
                j = json.loads(text)
            except ValueError:
                j = None
            return {"status": r.status, "text": text, "json": j, "ms": (time.perf_counter() - t0) * 1000,
                    "headers": {k.lower(): v for k, v in r.getheaders()}}
        finally:
            conn.close()


class Server:
    """Starts the service as a child process and stops it afterwards."""

    def __init__(self, cmd, env, log_path):
        self.log = open(log_path, "wb")
        self.proc = subprocess.Popen(cmd, cwd=str(ML_DIR), env=env, stdout=self.log, stderr=subprocess.STDOUT)

    def wait_ready(self, port, timeout=90):
        end = time.time() + timeout
        while time.time() < end:
            if self.proc.poll() is not None:
                return False
            try:
                http.client.HTTPConnection("127.0.0.1", port, timeout=2).request("GET", "/v1/health")
                return True
            except OSError:
                time.sleep(0.5)
        return False

    def stop(self):
        if self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=15)
            except subprocess.TimeoutExpired:
                self.proc.kill()
        self.log.close()


def main():
    ap = argparse.ArgumentParser(description="TheftGuard AI /v1 real-HTTP integration test")
    ap.add_argument("--model", required=True)
    ap.add_argument("--features-csv", required=True)
    ap.add_argument("--predictions", required=True)
    ap.add_argument("--app-path", required=True, help="existing app.py; hashed before and after only")
    ap.add_argument("--sample-size", type=int, default=200)
    ap.add_argument("--full", action="store_true", help="send all 8,475 held-out rows (batches of 5000)")
    ap.add_argument("--out-dir", default="v1_http_results")
    ap.add_argument("--server-cmd", help="advanced: command template with {port}; default starts uvicorn")
    a = ap.parse_args()

    started = dt.datetime.now(dt.timezone.utc)
    stamp = started.strftime("%Y%m%dT%H%M%SZ")
    watched = {"model": Path(a.model), "app_path": Path(a.app_path), "features_csv": Path(a.features_csv),
               "predictions": Path(a.predictions)}
    for k, v in watched.items():
        if not v.is_file():
            sys.exit(f"Not found: --{k.replace('_', '-')} {v}")
    out_dir = Path(a.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    md_path, json_path = out_dir / f"v1_http_report_{stamp}.md", out_dir / f"v1_http_report_{stamp}.json"
    if md_path.exists() or json_path.exists():
        sys.exit("Refusing to overwrite an existing report.")
    before = {k: sha256_of(v) for k, v in watched.items()}

    def cmd_for(port):
        if a.server_cmd:
            return shlex.split(a.server_cmd.replace("{port}", str(port)), posix=(os.name != "nt"))
        return [sys.executable, "-m", "uvicorn", "service.main:app", "--host", "127.0.0.1", "--port", str(port)]

    def env_for(**extra):
        e = dict(os.environ)
        e.update({"THEFTGUARD_MODEL_PATH": str(Path(a.model).resolve()), "PYTHONDONTWRITEBYTECODE": "1",
                  "THEFTGUARD_MAX_BODY_BYTES": "1000000"})
        e.pop("THEFTGUARD_MODEL_SHA256", None)
        e.pop("THEFTGUARD_ENABLE_DOCS", None)
        e.update(extra)
        return e

    # ------------------------------------------------------------ data for the tests (read-only)
    sample_err = None
    try:
        rows, labels, scores = _data.heldout(Path(a.features_csv), Path(a.predictions))
        idx = list(range(len(rows))) if a.full else list(range(min(a.sample_size, len(rows))))
        if not a.full:
            idx += [i for i, r in enumerate(rows) if None in r.values() and i not in set(idx)][:25]
    except Exception as exc:  # noqa: BLE001
        rows = labels = scores = idx = []
        sample_err = f"{type(exc).__name__}: {exc}"
    good = next((r for r in rows if None not in r.values()), None)

    # ------------------------------------------------------------ main server
    port = free_port()
    srv = Server(cmd_for(port), env_for(), out_dir / f"v1_server_{stamp}.log")
    try:
        if not srv.wait_ready(port):
            srv.stop()
            sys.exit("The /v1 server did not start. See the server log: " + str(out_dir / f"v1_server_{stamp}.log"))
        c = Client(port)
        run_main_tests(c, rows, labels, scores, idx, good, sample_err, a)
    finally:
        srv.stop()

    # ------------------------------------------------------------ failure-mode servers
    def failure_server(cid, title, extra_env, label):
        p = free_port()
        s = Server(cmd_for(p), env_for(**extra_env), out_dir / f"v1_server_{label}_{stamp}.log")
        try:
            if not s.wait_ready(p, timeout=60):
                record(cid, title, "FAIL", "The server did not start at all (expected: it starts and answers 503).")
                return
            cl = Client(p)
            h = cl.call("GET", "/v1/health")
            pr = cl.call("POST", "/v1/predict", {"features": good or {}})
            codes = [(h["json"] or {}).get("error", {}).get("code"), (pr["json"] or {}).get("error", {}).get("code")]
            ok = h["status"] == 503 and pr["status"] == 503 and codes == ["model_unavailable"] * 2 \
                and not LEAK.search(h["text"] + pr["text"])
            expect(cid, title, ok, f"/v1/health HTTP {h['status']}, /v1/predict HTTP {pr['status']}; codes {codes}.")
        finally:
            s.stop()

    guarded("F01", "Wrong model hash", lambda: failure_server(
        "F01", "A wrong model hash refuses to serve (503, no details)", {"THEFTGUARD_MODEL_SHA256": "0" * 64}, "hash"))
    guarded("F02", "Missing model", lambda: failure_server(
        "F02", "A missing model file refuses to serve (503, no details)",
        {"THEFTGUARD_MODEL_PATH": str(Path(a.model).resolve().with_name("does_not_exist.joblib"))}, "missing"))

    # ------------------------------------------------------------ integrity + report
    after = {k: sha256_of(v) for k, v in watched.items()}
    expect("I01", "The model, app.py and both data files were not modified during the run", before == after,
           "SHA-256 of every watched file is identical before and after." if before == after else "A watched file changed.",
           {"sha256": after})
    RESULTS.sort(key=lambda r: (r["id"][0], r["id"]))
    counts = {s: sum(1 for r in RESULTS if r["status"] == s) for s in ("PASS", "FAIL", "OBSERVED", "NOT_PERFORMED")}
    env = {"python": platform.python_version(), "platform": platform.platform()}
    for mod in ("fastapi", "pydantic", "uvicorn", "sklearn", "pandas", "numpy"):
        try:
            env[mod] = __import__(mod).__version__
        except Exception:  # noqa: BLE001
            env[mod] = "not importable"
    payload = {"run_started_utc": started.isoformat(), "run_finished_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
               "environment_of_this_run": env, "server_command": "custom (--server-cmd)" if a.server_cmd else "python -m uvicorn service.main:app",
               "summary": counts, "results": RESULTS, "scope_note": "Real-HTTP test of the new /v1 service on this machine only."}
    json_path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    lines = ["# TheftGuard AI /v1 real-HTTP integration report", "", f"Run started (UTC): {started.isoformat()}  ",
             f"Run on: Python {env['python']} on {env['platform']}; fastapi {env['fastapi']}, pydantic {env['pydantic']}, "
             f"uvicorn {env['uvicorn']}  ", "", f"**Summary:** {counts['PASS']} PASS, {counts['FAIL']} FAIL, "
             f"{counts['OBSERVED']} OBSERVED, {counts['NOT_PERFORMED']} NOT_PERFORMED", "",
             "| ID | Check | Status | Detail |", "| --- | --- | --- | --- |"]
    lines += [f"| {r['id']} | {r['title']} | {r['status']} | {r['detail'].replace('|', '/')} |" for r in RESULTS]
    lines += ["", "## Evidence", ""]
    for r in RESULTS:
        if r["evidence"]:
            lines += [f"### {r['id']}", "", "```json", json.dumps(r["evidence"], indent=2, default=str), "```", ""]
    md_path.write_text("\n".join(lines), encoding="utf-8")
    print("\nTheftGuard AI /v1 real-HTTP integration test")
    for r in RESULTS:
        print(f"[{r['status']:13}] {r['id']:5} {r['title']}\n                {r['detail']}")
    print(f"\nSummary: {counts}\nReports written: {md_path} ; {json_path}")
    sys.exit(1 if counts["FAIL"] else 0)


def run_main_tests(c, rows, labels, scores, idx, good, sample_err, a):
    def h01():
        r = c.call("GET", "/v1/health")
        expect("H01", "GET /v1/health returns ok and exposes no path", r["status"] == 200 and r["json"] == {
            "status": "ok", "model_loaded": True, "model_sha256_verified": True} and not LEAK.search(r["text"]),
            f"HTTP {r['status']}; body {r['json']}.")
    guarded("H01", "health", h01)

    def h02():
        r = c.call("GET", "/v1/model-metadata")
        j = r["json"] or {}
        ok = (r["status"] == 200 and j.get("model_sha256") == C.EXPECTED_MODEL_SHA256
              and j.get("model", {}).get("features") == list(C.FEATURES) and j.get("limitations")
              and "evaluation" in j and not LEAK.search(r["text"]))
        expect("H02", "GET /v1/model-metadata returns the verified model facts and limitations", ok,
               f"HTTP {r['status']}; sha256 matches: {j.get('model_sha256') == C.EXPECTED_MODEL_SHA256}.")
    guarded("H02", "metadata", h02)

    def h03():
        if sample_err or good is None:
            record("H03", "Saved predictions reproduced by POST /v1/predict", "NOT_PERFORMED", sample_err or "no sample")
            return
        mism, maxd, bad = 0, 0.0, 0
        for i in idx[:225]:
            r = c.call("POST", "/v1/predict", {"features": rows[i]})
            if r["status"] != 200:
                bad += 1
                continue
            mism += r["json"]["predicted_label"] != labels[i]
            maxd = max(maxd, abs(r["json"]["model_score"] - scores[i]))
        n = min(len(idx), 225)
        expect("H03", "Saved predictions reproduced by POST /v1/predict", bad == 0 and mism == 0 and maxd <= 1e-9,
               f"{n} rows; non-200: {bad}; label mismatches: {mism}; largest score difference: {maxd:.3g}.")
    guarded("H03", "single reproduction", h03)

    def h04():
        if sample_err:
            record("H04", "Saved predictions reproduced by POST /v1/predict-batch", "NOT_PERFORMED", sample_err)
            return
        total_ms, mism, maxd, bad, sent = 0.0, 0, 0.0, 0, 0
        for s in range(0, len(idx), C.MAX_BATCH_ROWS):
            chunk = idx[s:s + C.MAX_BATCH_ROWS]
            body = {"rows": [{"ref": f"r{i}", "features": rows[i]} for i in chunk]}
            if len(json.dumps(body)) > 900000:  # test server limit is 1 MB; use smaller batches
                parts = [chunk[k:k + 1000] for k in range(0, len(chunk), 1000)]
            else:
                parts = [chunk]
            for part in parts:
                r = c.call("POST", "/v1/predict-batch", {"rows": [{"ref": f"r{i}", "features": rows[i]} for i in part]})
                total_ms += r["ms"]
                if r["status"] != 200 or r["json"]["scored"] != len(part):
                    bad += 1
                    continue
                for i, res in zip(part, r["json"]["results"]):
                    mism += res["predicted_label"] != labels[i]
                    maxd = max(maxd, abs(res["model_score"] - scores[i]))
                    sent += 1
        expect("H04", "Saved predictions reproduced by POST /v1/predict-batch", bad == 0 and mism == 0 and maxd <= 1e-9 and sent == len(idx),
               f"{sent} rows scored; failed requests: {bad}; label mismatches: {mism}; largest score difference: {maxd:.3g}.")
        record("H04b", "Batch throughput (informational)", "OBSERVED",
               f"{sent} rows in {total_ms / 1000:.2f}s of request time ({sent / max(total_ms / 1000, 1e-9):.0f} rows per second).")
    guarded("H04", "batch reproduction", h04)

    def h05():
        if good is None:
            return
        rows_in = [{"features": good}, {"features": {**good, "valid_readings": -5.0}}, {"ref": "keep", "features": rows[3]},
                   {"features": {**good, "max_observed": "x"}}, {"features": {**good, "CONS_NO": 1}}]
        r = c.call("POST", "/v1/predict-batch", {"rows": rows_in})
        j = r["json"] or {}
        oks = [x["ok"] for x in j.get("results", [])]
        expect("H05", "A mixed batch returns partial results in order", r["status"] == 200 and oks == [True, False, True, False, False]
               and (j["total"], j["scored"], j["rejected"]) == (5, 2, 3) and j["results"][2]["ref"] == "keep",
               f"HTTP {r['status']}; ok flags {oks}.")
    guarded("H05", "mixed batch", h05)

    def h06():
        if good is None:
            return
        raw = lambda feats: json.dumps({"features": feats})
        cases = [
            ("negative valid_readings", {"features": {**good, "valid_readings": -5.0}}, "negative_value"),
            ("missing_percent 500", {"features": {**good, "missing_percent": 500.0}}, "missing_percent_mismatch"),
            ("null mean_observed", {"features": {**good, "mean_observed": None}}, "observed_null_pattern"),
            ("text mean_observed", {"features": {**good, "mean_observed": "abc"}}, "invalid_type"),
            ("boolean zero_count", {"features": {**good, "zero_count": True}}, "invalid_type"),
            ("numeric text zero_count", {"features": {**good, "zero_count": "5"}}, "invalid_type"),
            ("1e308 max_observed", {"features": {**good, "max_observed": 1e308}}, "value_too_large"),
            ("all null", {"features": {k: None for k in C.FEATURES}}, "null_not_allowed"),
            ("CONS_NO added", {"features": {**good, "CONS_NO": 1}}, "unexpected_features"),
            ("feature missing", {"features": {k: v for k, v in good.items() if k != "zero_count"}}, "missing_features"),
            ("count not whole", {"features": {**good, "zero_count": 2.5}}, "not_whole_number"),
            ("count identity", {"features": {**good, "zero_count": good["zero_count"] + 1}}, "count_identity_mismatch"),
        ]
        cases += [("Infinity token", raw({**good, "std_observed": "__T__"}).replace('"__T__"', "Infinity"), "non_finite_number"),
                  ("NaN token", raw({**good, "std_observed": "__T__"}).replace('"__T__"', "NaN"), "non_finite_number"),
                  ("1e400 literal", raw({**good, "std_observed": "__T__"}).replace('"__T__"', "1e400"), "non_finite_number")]
        failures = []
        for name, body, code in cases:
            r = c.call("POST", "/v1/predict", body)
            found = {i["code"] for i in ((r["json"] or {}).get("error", {}).get("issues") or [])}
            if r["status"] != 422 or code not in found or LEAK.search(r["text"]):
                failures.append((name, r["status"], sorted(found)))
        expect("H06", "Every legacy-gap input is now rejected with 422 and the expected code (no 500s, no leaks)",
               not failures, f"{len(cases)} cases; failures: {failures}.")
    guarded("H06", "gap inputs", h06)

    def h07():
        cases = [("malformed JSON", b'{"features": {', "invalid_json"), ("empty body", b"", "invalid_json"),
                 ("not an object", b"[1,2]", "invalid_request_shape"), ("no features key", b"{}", "invalid_request_shape"),
                 ("features is a list", b'{"features": [1]}', "invalid_request_shape"),
                 ("features is null", b'{"features": null}', "invalid_request_shape"),
                 ("extra top-level key", json.dumps({"features": good or {}, "x": 1}).encode(), "invalid_request_shape")]
        failures = []
        for name, body, code in cases:
            for path in ("/v1/predict",):
                r = c.call("POST", path, body, {"Content-Type": "application/json"})
                got = (r["json"] or {}).get("error", {}).get("code") or ""
                issue_codes = {i["code"] for i in ((r["json"] or {}).get("error", {}).get("issues") or [])}
                if r["status"] != 422 or (code != got and code not in issue_codes) or LEAK.search(r["text"]):
                    failures.append((name, r["status"], got))
        r = c.call("POST", "/v1/predict", json.dumps({"features": good or {}}), {"Content-Type": "text/plain"})
        record("H07b", "Valid JSON sent as text/plain (observation)", "OBSERVED", f"HTTP {r['status']}.")
        expect("H07", "Malformed and mis-shaped bodies return 422 with a standard error and no leaks", not failures,
               f"{len(cases)} cases; failures: {failures}.")
    guarded("H07", "bad bodies", h07)

    def h08():
        checks = {
            "GET /v1/predict": c.call("GET", "/v1/predict")["status"], "POST /v1/health": c.call("POST", "/v1/health", {})["status"],
            "unknown path": c.call("GET", "/nope")["status"], "/docs": c.call("GET", "/docs")["status"],
            "/openapi.json": c.call("GET", "/openapi.json")["status"], "legacy /predict absent": c.call("POST", "/predict", {})["status"]}
        r404 = c.call("GET", "/nope")
        shape_ok = (r404["json"] or {}).get("error", {}).get("code") == "not_found"
        expect("H08", "Wrong methods and unknown paths use the standard error; interactive docs are off",
               checks["GET /v1/predict"] == 405 and checks["POST /v1/health"] == 405 and checks["unknown path"] == 404
               and checks["/docs"] == 404 and checks["/openapi.json"] == 404 and shape_ok, f"Statuses: {checks}.")
    guarded("H08", "routing", h08)

    def h09():
        r = c.call("POST", "/v1/predict-batch", {"rows": [{"features": {}}] * (C.MAX_BATCH_ROWS + 1)})
        r2 = c.call("POST", "/v1/predict-batch", {"rows": []})
        r3 = c.call("POST", "/v1/predict", {"features": good or {}, "padding": "x" * 1_500_000})
        expect("H09", "Batch size limits and the request-size limit are enforced",
               r["status"] == 422 and (r["json"] or {}).get("error", {}).get("code") == "batch_size_invalid"
               and r2["status"] == 422 and r3["status"] == 413 and (r3["json"] or {}).get("error", {}).get("code") == "payload_too_large",
               f"5001 rows: HTTP {r['status']}; empty rows: HTTP {r2['status']}; 1.5 MB body (limit 1 MB in this test): HTTP {r3['status']}.")
    guarded("H09", "limits", h09)

    def h10():
        if good is None:
            return
        feats = {**good, "max_observed": 900000.0}
        feats["mean_observed"] = min(feats["mean_observed"], 900000.0)
        r = c.call("POST", "/v1/predict", {"features": feats})
        w = [x for x in (r["json"] or {}).get("warnings", []) if x["rule"] == "W1"]
        expect("H10", "A value outside the dataset range is scored with warning W1, not rejected",
               r["status"] == 200 and [x["field"] for x in w] == ["max_observed"] and "model_score" in r["json"],
               f"HTTP {r['status']}; warnings {[x['code'] for x in (r['json'] or {}).get('warnings', [])]}.")
    guarded("H10", "warning", h10)

    def h11():
        if good is None:
            return
        out, lock = [], threading.Lock()

        def worker():
            for _ in range(3):
                r = c.call("POST", "/v1/predict-batch", {"rows": [{"features": good}] * 50})
                with lock:
                    out.append((r["status"], r["ms"]))
        ts = [threading.Thread(target=worker) for _ in range(5)]
        [t.start() for t in ts]
        [t.join() for t in ts]
        record("H11", "5 parallel clients x 3 batches of 50 rows (informational)", "OBSERVED",
               f"statuses {sorted({s for s, _ in out})}; median {statistics.median(m for _, m in out):.0f} ms; max {max(m for _, m in out):.0f} ms.")
    guarded("H11", "parallel", h11)


if __name__ == "__main__":
    main()
