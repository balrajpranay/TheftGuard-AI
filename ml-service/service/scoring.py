"""Model loading and batch scoring for the /v1 service. No web framework is imported here."""

import hashlib
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from . import validation_config as C


class ServiceLoadError(Exception):
    """Raised at startup; the code is safe to log but is never sent to clients."""


def sha256_file(path, chunk=1 << 20):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(chunk), b""):
            h.update(block)
    return h.hexdigest()


def load_model(path, expected_sha256):
    """Verify the file's SHA-256, then load it. Returns (model, sha256). The file is only read."""
    p = Path(path)
    if not p.is_file():
        raise ServiceLoadError("model_file_not_found")
    sha = sha256_file(p)
    if sha != expected_sha256:
        raise ServiceLoadError("model_hash_mismatch")
    model = joblib.load(p)
    names = getattr(model, "feature_names_in_", None)
    if names is None or tuple(names) != C.FEATURES:
        raise ServiceLoadError("model_feature_schema_mismatch")
    if sorted(int(c) for c in model.classes_) != [0, 1]:
        raise ServiceLoadError("model_classes_mismatch")
    return model, sha


def score_rows(model, rows):
    """Score validated rows (dicts of the 13 values, None for empty) in one pass.

    Returns a list of (predicted_label, model_score) in the same order. The score is the
    Random Forest vote fraction for class 1 (uncalibrated).
    """
    if not rows:
        return []
    df = pd.DataFrame(rows, columns=list(C.FEATURES)).astype("float64")
    proba = model.predict_proba(df)
    classes = list(model.classes_)
    one = classes.index(1)
    labels = np.asarray(model.classes_)[proba.argmax(axis=1)]
    return [(int(labels[i]), float(proba[i, one])) for i in range(len(rows))]
