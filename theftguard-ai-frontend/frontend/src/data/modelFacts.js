// Documented results only. Source: final_test_metrics.json, reproduced by the Phase 1 verification
// harness (checks V07 and V09) and recorded in docs/MODEL_CARD.md. Nothing here is estimated.
export const MODEL_FACTS = {
  name: 'validated_candidate_pipeline',
  description:
    'A median imputer with missing-value indicators, then a 250-tree Random Forest trained on 13 customer-level summary features.',
  sha256: '442981aa7f24885d89363bfd6bc9123c2d05dbc13c59e58644d82e6773a5a2a5',
  storedSklearn: '1.9.1',
  testRows: 8475,
  testPositives: 723,
  baseRate: 0.0853,
  threshold: 0.5,
  metrics: [
    { key: 'precision', label: 'Precision (FLAG = 1)', value: 0.292, hint: 'Of customers flagged, the share carrying FLAG = 1' },
    { key: 'recall', label: 'Recall (FLAG = 1)', value: 0.365, hint: 'Of FLAG = 1 customers, the share flagged' },
    { key: 'f1', label: 'F1 (FLAG = 1)', value: 0.325, hint: 'Balance of precision and recall' },
    { key: 'roc', label: 'ROC-AUC', value: 0.741, hint: 'Ranking quality across all thresholds' },
    { key: 'pr', label: 'PR-AUC', value: 0.274, hint: 'Compare with the FLAG = 1 rate of 0.085' },
    { key: 'acc', label: 'Accuracy', value: 0.87, hint: 'Dominated by the much larger FLAG = 0 group' },
    { key: 'bal', label: 'Balanced accuracy', value: 0.641, hint: 'Average of recall on each class' },
  ],
  confusion: { TN: 7113, FP: 639, FN: 459, TP: 264 },
  cv: [
    { model: 'Random Forest balanced', f1: 0.317, selected: true },
    { model: 'Logistic Regression balanced', f1: 0.249 },
    { model: 'Random Forest baseline', f1: 0.109 },
    { model: 'Logistic Regression baseline', f1: 0.067 },
  ],
  limitations: [
    'A positive prediction is a pattern similar to records labelled FLAG = 1. It is not proof of electricity theft.',
    'Results come from one random split after earlier experiments. They are not external validation.',
    'Precision and recall are modest: most flagged customers carry FLAG = 0, and most FLAG = 1 customers are not flagged at the default threshold.',
    'The Model Score is the Random Forest vote fraction for FLAG = 1. It is uncalibrated and is not a probability.',
    'The dataset source, licence, FLAG meaning and consumption units are unconfirmed. The data are described as a foreign dataset and have not been validated on Indian consumption data.',
    'Seven of the 13 features could not be checked against raw readings, and the 1,034-date window is inferred.',
    'The model uses whole-period summaries. It cannot compare previous and current consumption.',
    'Decision Tree and SVM models were not evaluated.',
  ],
  unconfirmed: [
    { item: 'Dataset source', status: 'Unconfirmed' },
    { item: 'Licence and terms', status: 'Unconfirmed' },
    { item: 'Meaning of FLAG', status: 'Unconfirmed' },
    { item: 'Consumption units', status: 'Unconfirmed' },
    { item: 'Reading frequency and date range', status: 'Unconfirmed (daily readings and a 1,034-date window are inferred)' },
  ],
}
