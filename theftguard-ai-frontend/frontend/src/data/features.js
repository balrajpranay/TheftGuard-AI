// The 13 model inputs, in the order the saved pipeline requires.
// "check" records what the project's verification actually established (see docs/DATASET.md).
export const FEATURES = [
  { name: 'valid_readings', nullable: false, check: 'identity', note: 'Count of readings present' },
  { name: 'missing_percent', nullable: false, check: 'identity', note: '(window − valid readings) / window × 100' },
  { name: 'zero_count', nullable: false, check: 'identity', note: 'Count of zero readings' },
  { name: 'zero_percent_of_observed', nullable: true, check: 'identity', note: 'Zero readings / valid readings × 100' },
  { name: 'mean_observed', nullable: true, check: 'unconfirmed', note: 'Mean of observed readings' },
  { name: 'median_observed', nullable: true, check: 'unconfirmed', note: 'Median of observed readings' },
  { name: 'std_observed', nullable: true, check: 'unconfirmed', note: 'Spread of observed readings' },
  { name: 'min_observed', nullable: true, check: 'unconfirmed', note: 'Smallest observed reading' },
  { name: 'max_observed', nullable: true, check: 'unconfirmed', note: 'Largest observed reading' },
  { name: 'mean_positive', nullable: true, check: 'unconfirmed', note: 'Mean of readings above zero' },
  { name: 'median_positive', nullable: true, check: 'unconfirmed', note: 'Median of readings above zero' },
  { name: 'positive_readings', nullable: false, check: 'identity', note: 'Count of readings above zero' },
  { name: 'positive_percent_of_all_dates', nullable: false, check: 'identity', note: 'Positive readings / window × 100' },
]

export const FEATURE_NAMES = FEATURES.map((f) => f.name)
export const NEVER_NULL = FEATURES.filter((f) => !f.nullable).map((f) => f.name)

export const CHECK_LABELS = {
  identity: 'Cross-checked against other features',
  unconfirmed: 'Unconfirmed against raw readings',
}
