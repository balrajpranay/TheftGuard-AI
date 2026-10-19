import { test, describe } from 'node:test'
import assert from 'node:assert'
import { toCsv } from '../src/lib/exportCsv.js'
import { FEATURE_NAMES } from '../src/data/features.js'

describe('CSV export formatting and safety', () => {
  test('cell escaping handles commas, quotes, formula triggers and em dashes', () => {
    const columns = [
      { key: 'col1', label: 'Simple' },
      { key: 'col2', label: 'With, Comma' },
      { key: 'col3', label: 'With "Quotes"' },
      { key: 'col4', label: 'Formula Trigger' },
      { key: 'col5', label: 'Negative Number' },
      { key: 'col6', label: 'Em Dash Placeholder' },
    ]

    const rows = [
      {
        col1: 'Normal text',
        col2: 'Hello, World',
        col3: 'He said "Hello"',
        col4: '=SUM(A1:A10)',
        col5: -42.5,
        col6: '—',
      },
    ]

    const csv = toCsv(columns, rows)
    const lines = csv.split('\r\n')

    assert.strictEqual(lines.length, 2)
    assert.strictEqual(lines[0], 'Simple,"With, Comma","With ""Quotes""",Formula Trigger,Negative Number,Em Dash Placeholder')
    // Check row output:
    // col2 quoted, col3 double-quoted, col4 single-quoted to neutralize formula, col5 numeric, col6 empty string
    assert.strictEqual(lines[1], "Normal text,\"Hello, World\",\"He said \"\"Hello\"\"\",'=SUM(A1:A10),-42.5,")
  })

  test('all 13 model feature columns are exported in exact order with positive_percent_of_all_dates', () => {
    assert.strictEqual(FEATURE_NAMES.length, 13)
    assert.strictEqual(FEATURE_NAMES[12], 'positive_percent_of_all_dates')

    const cols = [
      { key: 'customer_ref', label: 'customer_ref' },
      { key: 'group', label: 'group' },
      { key: 'model_score', label: 'model_score' },
      { key: 'model_label', label: 'model_label' },
      { key: 'review_category', label: 'review_category' },
      { key: 'status', label: 'status' },
      { key: 'warnings_count', label: 'warnings_count' },
      ...FEATURE_NAMES.map((n) => ({ key: n, label: n })),
    ]

    assert.strictEqual(cols.length, 20)
    assert.strictEqual(cols[19].key, 'positive_percent_of_all_dates')
    assert.strictEqual(cols[19].label, 'positive_percent_of_all_dates')

    // Create a row mimicking Results.jsx
    const sampleFeatures = {
      valid_readings: 1030,
      missing_percent: 0.387,
      zero_count: 862,
      zero_percent_of_observed: 83.689,
      mean_observed: 0.948,
      median_observed: 0.0,
      std_observed: 3.102,
      min_observed: 0.0,
      max_observed: 18.29,
      mean_positive: 5.811,
      median_positive: 3.67,
      positive_readings: 168,
      positive_percent_of_all_dates: 16.248,
    }

    const rowObj = {
      customer_ref: 'Row 1',
      group: '', // Clean empty string
      model_score: 0.8522,
      model_label: 'Potentially Suspicious',
      review_category: 'Review Recommended',
      status: 'scored',
      warnings_count: 0,
      ...sampleFeatures,
    }

    const csv = toCsv(cols, [rowObj])
    const lines = csv.split('\r\n')
    const headerParts = lines[0].split(',')
    const rowParts = lines[1].split(',')

    assert.strictEqual(headerParts.length, 20)
    assert.strictEqual(rowParts.length, 20)

    // Check each feature name matches
    FEATURE_NAMES.forEach((name, i) => {
      const colIndex = 7 + i
      assert.strictEqual(headerParts[colIndex], name)
      assert.strictEqual(Number(rowParts[colIndex]), sampleFeatures[name])
    })

    // Specifically verify positive_percent_of_all_dates
    assert.strictEqual(headerParts[19], 'positive_percent_of_all_dates')
    assert.strictEqual(rowParts[19], '16.248')
  })
})
