"""Shared helpers for tests that need the project's files. Paths come from environment variables
(set by the run command); tests skip cleanly when they are not set. Read-only."""
import csv
import os
import unittest
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split

ENV = {"model": "THEFTGUARD_MODEL_PATH", "features": "THEFTGUARD_FEATURES_CSV",
       "predictions": "THEFTGUARD_PREDICTIONS_CSV"}


def path(key):
    v = os.environ.get(ENV[key])
    return Path(v) if v and Path(v).is_file() else None


def require(*keys):
    missing = [ENV[k] for k in keys if path(k) is None]
    if missing:
        raise unittest.SkipTest("Set " + ", ".join(missing) + " to a file path to run this test.")


def read_table(csv_path):
    """Rows of the feature table as dicts with float or None values (standard library csv)."""
    rows, labels = [], []
    with open(csv_path, newline="", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            labels.append(int(float(r.pop("FLAG"))))
            rows.append({k: (None if v == "" else float(v)) for k, v in r.items()})
    return rows, labels


def heldout(features_csv, predictions_csv):
    """Re-create the Step 7 split (stratified 80/20, seed 2026); return test rows with saved results."""
    df = pd.read_csv(features_csv, low_memory=False)
    y = df["FLAG"].astype(int)
    X = df.drop(columns=["FLAG"]).apply(pd.to_numeric, errors="coerce").replace([np.inf, -np.inf], np.nan)
    _, Xt, _, yt = train_test_split(X, y, test_size=0.20, random_state=2026, stratify=y)
    pred = pd.read_csv(predictions_csv)
    assert (yt.to_numpy() == pred["actual_FLAG"].to_numpy()).all(), "split does not match saved predictions"
    rows = [{c: (None if pd.isna(v) else float(v)) for c, v in r.items()} for r in Xt.to_dict("records")]
    return rows, pred["predicted_FLAG"].tolist(), pred["predicted_probability_FLAG_1"].tolist()
