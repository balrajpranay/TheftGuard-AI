"""Constants for the TheftGuard AI /v1 validation (see docs/PHASE2B_VALIDATION_SPEC.md).

Every value here is either verified against the project's 42,372-row feature table or
labelled as inferred. Change a value here and nowhere else.
"""

# The 13 model inputs, in the order the saved pipeline requires (verified, harness V03).
FEATURES = (
    "valid_readings", "missing_percent", "zero_count", "zero_percent_of_observed",
    "mean_observed", "median_observed", "std_observed", "min_observed",
    "max_observed", "mean_positive", "median_positive", "positive_readings",
    "positive_percent_of_all_dates",
)
FEATURE_INDEX = {name: i for i, name in enumerate(FEATURES)}

# Features that were empty in the training table (8). All others were never empty (5).
NULLABLE = frozenset({
    "zero_percent_of_observed", "mean_observed", "median_observed", "std_observed",
    "min_observed", "max_observed", "mean_positive", "median_positive",
})
NEVER_NULL = frozenset(FEATURES) - NULLABLE

COUNT_FEATURES = ("valid_readings", "zero_count", "positive_readings")
OBSERVED_STATS = ("zero_percent_of_observed", "mean_observed", "median_observed",
                  "std_observed", "min_observed", "max_observed")
POSITIVE_STATS = ("mean_positive", "median_positive")

# INFERRED, not confirmed by raw data or feature code: the percentage features follow
# formulas that use a window of 1,034 dates.
WINDOW_DATES = 1034

PCT_ABS_TOL = 5.1e-4       # the table's percentages are rounded to 3 decimals
FLOAT_REL_TOL = 1e-9       # order and mean-range checks
SUM_REL_TOL = 1e-6         # warning W2 only
FLOAT32_MAX = 3.4028234663852886e38   # the pipeline fails above this (sandbox-observed)

MAX_ISSUES = 50            # per request
MAX_ROW_ISSUES = 10        # per row inside a batch response
MAX_BATCH_ROWS = 5000
DEFAULT_MAX_BODY_BYTES = 20 * 1024 * 1024
MAX_REF_LENGTH = 64

EXPECTED_MODEL_SHA256 = "442981aa7f24885d89363bfd6bc9123c2d05dbc13c59e58644d82e6773a5a2a5"

LABEL_NAMES = {1: "Potentially Suspicious", 0: "No Suspicious Pattern Flagged"}
SCORE_NOTE = ("Random Forest vote fraction for class 1. It is uncalibrated and is not a probability.")
INTERPRETATION = ("This is a model prediction of the source dataset's FLAG label, not confirmation of "
                  "electricity theft. Verified local data and a qualified utility investigation are required.")
W1_MESSAGE = ("This value is outside the range seen in the project's dataset table. The model may be "
              "unreliable for it. This does not mean the value is correct, and it does not mean it is wrong.")
