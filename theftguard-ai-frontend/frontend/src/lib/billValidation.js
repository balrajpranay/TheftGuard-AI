/**
 * Electricity Bill Validation & Sufficiency Module
 * Designed for Indian household electricity bills (Telangana TSSPDCL/TSNPDCL, etc.)
 */

export const MAX_BILL_FILE_BYTES = 10 * 1024 * 1024 // 10 MB

export const ACCEPTED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.pdf']

export const ACCEPTED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'application/pdf',
]

export const INITIAL_BILL_FIELDS = {
  consumerNumber: '',
  discom: '',
  billingPeriod: '',
  billDate: '',
  previousReading: '',
  currentReading: '',
  unitsConsumed: '',
  billingDays: '',
  amountPayable: '',
}

export const DEMO_TELANGANA_BILL = {
  consumerNumber: '100458921',
  discom: 'TSSPDCL (Hyderabad Central)',
  billingPeriod: 'July 2026',
  billDate: '2026-08-02',
  previousReading: '14280',
  currentReading: '14525',
  unitsConsumed: '245',
  billingDays: '31',
  amountPayable: '1725',
  tariffCategory: 'LT-1(B) Domestic',
  contractedLoadKw: '3.0 kW',
}

/**
 * Validates an uploaded bill file for format and size constraints.
 * Safe for client-side execution; no remote uploads or data leakage.
 */
export function validateBillFile(file) {
  if (!file) {
    return { ok: false, error: 'No file was selected.' }
  }

  const name = file.name || ''
  const dotIndex = name.lastIndexOf('.')
  const ext = dotIndex !== -1 ? name.slice(dotIndex).toLowerCase() : ''

  const isAcceptedExt = ACCEPTED_EXTENSIONS.includes(ext)
  const isAcceptedMime = file.type ? ACCEPTED_MIME_TYPES.includes(file.type) : isAcceptedExt

  if (!isAcceptedExt && !isAcceptedMime) {
    return {
      ok: false,
      error: `Unsupported file format (${ext || 'unknown'}). Please upload a JPG, PNG, or PDF electricity bill.`,
    }
  }

  if (file.size > MAX_BILL_FILE_BYTES) {
    const sizeMb = (file.size / (1024 * 1024)).toFixed(1)
    return {
      ok: false,
      error: `File is too large (${sizeMb} MB). Maximum allowed size is 10 MB.`,
    }
  }

  const isPdf = ext === '.pdf' || file.type === 'application/pdf'
  const isImage = !isPdf

  return {
    ok: true,
    fileInfo: {
      name: file.name,
      size: file.size,
      type: file.type || (isPdf ? 'application/pdf' : 'image/jpeg'),
      isPdf,
      isImage,
    },
  }
}

/**
 * Assesses whether the extracted / entered bill information is sufficient
 * to compute the 13 Random Forest features required by TheftGuard AI.
 */
export function assessDataSufficiency(confirmedData = {}) {
  const hasBasicFields = Boolean(
    confirmedData.unitsConsumed !== '' ||
    (confirmedData.previousReading !== '' && confirmedData.currentReading !== '')
  )

  // A single monthly bill only provides one aggregate consumption value over ~30 days.
  // The TheftGuard AI model strictly requires 13 statistical distribution features
  // (mean, std, zero-consumption days, positive %, etc.) derived from multi-day interval series.
  return {
    isSufficient: false,
    status: 'More consumption history required',
    tone: 'warn',
    headline: 'Single monthly bill insufficient for ML screening',
    reasons: [
      'A monthly electricity bill provides only 1 aggregate consumption figure (e.g., 245 kWh across 30 days).',
      'The TheftGuard AI Random Forest model requires 13 statistical features calculated across daily consumption distributions (such as daily standard deviation, zero-consumption days, and positive-consumption percentages).',
      'At least 6 to 12 months of consecutive billing cycles or interval meter readings are required before feature preparation can begin.',
    ],
    recommendation:
      'Do not pass single bill values directly to the ML prediction endpoint. A separate, validated feature preparation step is necessary once sufficient historical meter readings are collected.',
  }
}
