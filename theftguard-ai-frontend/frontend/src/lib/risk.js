// Review bands are a display aid. The saved model's own default threshold is 0.50.
// The lower band (Elevated) is not produced by the model.
export const MODEL_DEFAULT_THRESHOLD = 0.5
export const DEFAULT_THRESHOLDS = { elevated: 0.3, review: 0.5 }

export const CATEGORIES = {
  review: { key: 'review', label: 'Review Recommended', detail: 'Potentially Suspicious' },
  elevated: { key: 'elevated', label: 'Elevated', detail: 'Below the review threshold' },
  none: { key: 'none', label: 'No flag', detail: 'Not flagged by the model' },
  unscored: { key: 'unscored', label: 'Not scored', detail: 'No Model Score available' },
}

export function classify(score, thresholds = DEFAULT_THRESHOLDS) {
  if (score === null || score === undefined) return 'unscored'
  if (score >= thresholds.review) return 'review'
  if (score >= thresholds.elevated) return 'elevated'
  return 'none'
}
