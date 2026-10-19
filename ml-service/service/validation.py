"""Pure-Python request validation for the TheftGuard AI /v1 service.

Implements docs/PHASE2B_VALIDATION_SPEC.md. Standard library only. validate() and
validate_features() never raise, whatever they are given. Messages never echo the
offending value; they name the field, the rule and the expected constraint.
"""

import json
import math
import re
from dataclasses import dataclass, field
from pathlib import Path

from . import validation_config as C

_RULES = [f"R{n:02d}" for n in range(1, 20)] + ["W1", "W2"]
_RULE_ORDER = {r: i for i, r in enumerate(_RULES)}
_SAFE_NAME = re.compile(r"^[A-Za-z0-9_]{1,40}$")
_USE_DEFAULT = object()
_default_ranges_cache = {}


@dataclass
class ValidationResult:
    ok: bool
    features: dict = None          # the 13 values in model order (floats or None) when ok
    errors: list = field(default_factory=list)
    warnings: list = field(default_factory=list)
    truncated: bool = False        # True when errors or warnings were cut at MAX_ISSUES


def load_ranges(path):
    """Read training_ranges.json and return {feature: {"min": x, "max": y}} or None."""
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        return {k: {"min": v["min"], "max": v["max"]} for k, v in data["features"].items()
                if v.get("min") is not None and v.get("max") is not None}
    except Exception:  # noqa: BLE001 - a missing file simply disables warning W1
        return None


def default_ranges():
    if "r" not in _default_ranges_cache:
        _default_ranges_cache["r"] = load_ranges(Path(__file__).with_name("training_ranges.json"))
    return _default_ranges_cache["r"]


def _issue(rule, code, name, message, **extra):
    out = {"rule": rule, "code": code, "field": name, "message": message}
    out.update(extra)
    return out


def _safe_name(name):
    return name if isinstance(name, str) and _SAFE_NAME.match(name) else None


def _sort_key(issue):
    return (_RULE_ORDER.get(issue["rule"], 99), C.FEATURE_INDEX.get(issue["field"], 999),
            str(issue.get("field")), issue["code"])


def _tol(a, b):
    return C.FLOAT_REL_TOL * max(1.0, abs(a), abs(b))


def validate(payload, ranges=_USE_DEFAULT):
    """Validate a whole request body of the form {"features": {...13 values...}}."""
    try:
        if not isinstance(payload, dict):
            return _fail([_issue("R01", "invalid_request_shape", None, "The request body must be a JSON object.")])
        errs = []
        if "features" not in payload:
            errs.append(_issue("R01", "invalid_request_shape", "features", "The 'features' object is required."))
        if any(k != "features" for k in payload):
            errs.append(_issue("R01", "invalid_request_shape", None, "Only the 'features' key is allowed in the request."))
        if errs:
            return _fail(errs)
        return validate_features(payload["features"], ranges)
    except Exception:  # noqa: BLE001 - defensive: never raise
        return _fail([_issue("R01", "invalid_request_shape", None, "The request could not be validated.")])


def validate_features(obj, ranges=_USE_DEFAULT):
    """Validate the inner features object (also used for each row of a batch)."""
    try:
        return _validate_features(obj, default_ranges() if ranges is _USE_DEFAULT else ranges)
    except Exception:  # noqa: BLE001 - defensive: never raise
        return _fail([_issue("R01", "invalid_request_shape", "features", "The features could not be validated.")])


def _fail(errors, warnings=None):
    errors = sorted(errors, key=_sort_key)
    truncated = len(errors) > C.MAX_ISSUES
    return ValidationResult(False, None, errors[:C.MAX_ISSUES], warnings or [], truncated)


def _validate_features(obj, ranges):
    if not isinstance(obj, dict):
        return _fail([_issue("R01", "invalid_request_shape", "features", "'features' must be a JSON object.")])

    errors, warnings = [], []
    for name in C.FEATURES:
        if name not in obj:
            errors.append(_issue("R02", "missing_features", name, "Required feature is missing."))
    for key in obj:
        if key not in C.FEATURE_INDEX:
            errors.append(_issue("R03", "unexpected_features", _safe_name(key), "Not a model feature."))

    num, bad = {}, set()
    for name in C.FEATURES:
        if name not in obj:
            bad.add(name)
            continue
        v = obj[name]
        if v is None:
            if name in C.NEVER_NULL:
                errors.append(_issue("R06", "null_not_allowed", name, "Null is not allowed for this feature."))
                bad.add(name)
            else:
                num[name] = None
            continue
        if isinstance(v, bool) or not isinstance(v, (int, float)):
            errors.append(_issue("R04", "invalid_type", name, "Must be a number (or null where allowed)."))
            bad.add(name)
            continue
        try:
            x = float(v)
        except OverflowError:
            errors.append(_issue("R09", "value_too_large", name, "Value is too large for the model."))
            bad.add(name)
            continue
        if not math.isfinite(x):
            errors.append(_issue("R05", "non_finite_number", name, "Must be a finite number."))
            bad.add(name)
            continue
        if abs(x) > C.FLOAT32_MAX:
            errors.append(_issue("R09", "value_too_large", name, "Value is too large for the model."))
            bad.add(name)
            continue
        if x < 0:
            errors.append(_issue("R07", "negative_value", name, "Must be 0 or greater."))
            bad.add(name)
        elif name in C.COUNT_FEATURES and x != math.floor(x):
            errors.append(_issue("R08", "not_whole_number", name, "Must be a whole number."))
            bad.add(name)
        if name not in bad:
            num[name] = 0.0 if x == 0 else x

    def have(*names):
        return all(n in num for n in names)

    def val(n):
        return num[n]

    W = C.WINDOW_DATES
    valid = val("valid_readings") if have("valid_readings") else None
    zero = val("zero_count") if have("zero_count") else None
    pos = val("positive_readings") if have("positive_readings") else None
    out_of_window = False

    if valid is not None and valid > W:
        out_of_window = True
        errors.append(_issue("R10", "valid_readings_out_of_window", "valid_readings",
                             f"Must not exceed the {W}-date window."))
    if valid is not None and zero is not None and pos is not None and valid != zero + pos:
        errors.append(_issue("R11", "count_identity_mismatch", "valid_readings",
                             "Must equal zero_count + positive_readings."))
    if valid is not None and have("missing_percent") and not out_of_window:
        if abs((W - valid) / W * 100 - val("missing_percent")) > C.PCT_ABS_TOL:
            errors.append(_issue("R12", "missing_percent_mismatch", "missing_percent",
                                 "Must equal (window - valid_readings) / window x 100 (3 decimals)."))
    if (valid is not None and valid > 0 and zero is not None and have("zero_percent_of_observed")
            and val("zero_percent_of_observed") is not None):
        if abs(zero / valid * 100 - val("zero_percent_of_observed")) > C.PCT_ABS_TOL:
            errors.append(_issue("R13", "zero_percent_mismatch", "zero_percent_of_observed",
                                 "Must equal zero_count / valid_readings x 100 (3 decimals)."))
    if pos is not None and have("positive_percent_of_all_dates"):
        if abs(pos / W * 100 - val("positive_percent_of_all_dates")) > C.PCT_ABS_TOL:
            errors.append(_issue("R14", "positive_percent_mismatch", "positive_percent_of_all_dates",
                                 "Must equal positive_readings / window x 100 (3 decimals)."))
    if valid is not None:
        for name in C.OBSERVED_STATS:
            if name in num:
                if valid == 0 and num[name] is not None:
                    errors.append(_issue("R15", "observed_null_pattern", name,
                                         "Must be null when valid_readings is 0."))
                elif valid > 0 and num[name] is None:
                    errors.append(_issue("R15", "observed_null_pattern", name,
                                         "Must not be null when valid_readings is above 0."))
    if pos is not None:
        for name in C.POSITIVE_STATS:
            if name in num:
                if pos == 0 and num[name] is not None:
                    errors.append(_issue("R16", "positive_null_pattern", name,
                                         "Must be null when positive_readings is 0."))
                elif pos > 0 and num[name] is None:
                    errors.append(_issue("R16", "positive_null_pattern", name,
                                         "Must not be null when positive_readings is above 0."))

    mn, md, mx, mean = (num.get("min_observed"), num.get("median_observed"),
                        num.get("max_observed"), num.get("mean_observed"))
    if mn is not None and md is not None and mx is not None:
        if mn - md > _tol(mn, md) or md - mx > _tol(md, mx):
            errors.append(_issue("R17", "order_violation", "median_observed",
                                 "Must satisfy min_observed <= median_observed <= max_observed."))
    if mn is not None and mx is not None and mean is not None:
        if mn - mean > _tol(mn, mean) or mean - mx > _tol(mean, mx):
            errors.append(_issue("R18", "mean_outside_range", "mean_observed",
                                 "Must lie between min_observed and max_observed."))
    if valid is not None and valid > 0 and zero is not None and mn is not None:
        if (zero > 0) != (mn == 0.0):
            errors.append(_issue("R19", "zero_min_inconsistency", "min_observed",
                                 "min_observed must be 0 exactly when zero_count is above 0."))

    if errors:
        return _fail(errors)

    # Warnings: the request is valid and will be scored.
    if ranges:
        for name in C.FEATURES:
            v = num.get(name)
            r = ranges.get(name)
            if v is not None and r and (v < r["min"] or v > r["max"]):
                warnings.append(_issue("W1", "outside_dataset_range", name, C.W1_MESSAGE,
                                       dataset_min=r["min"], dataset_max=r["max"]))
    if (valid and pos and num.get("mean_observed") is not None and num.get("mean_positive") is not None):
        s1, s2 = num["mean_observed"] * valid, num["mean_positive"] * pos
        if abs(s1 - s2) > C.SUM_REL_TOL * max(1e-9, abs(s1), abs(s2)):
            warnings.append(_issue("W2", "sum_identity_mismatch", "mean_positive",
                                   "mean_observed x valid_readings and mean_positive x positive_readings "
                                   "should agree; rounded means can cause a small difference."))
    warnings.sort(key=_sort_key)
    truncated = len(warnings) > C.MAX_ISSUES
    return ValidationResult(True, {n: num[n] for n in C.FEATURES}, [], warnings[:C.MAX_ISSUES], truncated)
