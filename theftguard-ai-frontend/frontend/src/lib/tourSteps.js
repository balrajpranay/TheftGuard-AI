/**
 * TheftGuard AI — Interactive Guided Product Tour Steps
 *
 * Defines the 8 sequential workspace steps guiding users through real application features:
 * 1. Welcome to TheftGuard AI — Core application purpose and screening principles
 * 2. Dashboard — Live KPI metrics, customer counts, and review categories
 * 3. Consumption Data — Time-series CSV upload and dataset management
 * 4. ML Screening — Random Forest scoring model and held-out evaluation
 * 5. Bill Comparison — Household electricity bill cross-verification via OCR
 * 6. Investigation / Results — Risk-categorized screening results and site inspection tickets
 * 7. Reports — Structured compliance audit builder and CSV/PDF export
 * 8. AI Chat — Local assistant guidance, tariff explanations, and triage support
 */

export const TOUR_STEPS = [
  {
    id: 'welcome',
    index: 0,
    route: '/app/dashboard',
    selector: null,
    translationKey: 'onboarding.steps.welcome',
    icon: 'sparkles',
  },
  {
    id: 'dashboard',
    index: 1,
    route: '/app/dashboard',
    selector: '[data-tour="nav-overview"]',
    pageSelector: '[data-tour="dashboard-summary"]',
    translationKey: 'onboarding.steps.overview',
    icon: 'overview',
  },
  {
    id: 'consumptionData',
    index: 2,
    route: '/app/screening',
    selector: '[data-tour="nav-screening"]',
    pageSelector: '[data-tour="screening-upload"]',
    translationKey: 'onboarding.steps.screening',
    icon: 'upload',
  },
  {
    id: 'mlScreening',
    index: 3,
    route: '/app/model',
    selector: '[data-tour="nav-model"]',
    pageSelector: '[data-tour="model-metrics"]',
    translationKey: 'onboarding.steps.model',
    icon: 'model',
  },
  {
    id: 'billComparison',
    index: 4,
    route: '/app/bill-comparison',
    selector: '[data-tour="nav-bill-comparison"]',
    pageSelector: '[data-tour="bill-comparison-slots"]',
    translationKey: 'onboarding.steps.billComparison',
    icon: 'bill',
  },
  {
    id: 'investigationResults',
    index: 5,
    route: '/app/results',
    selector: '[data-tour="nav-results"]',
    pageSelector: '[data-tour="results-table"]',
    translationKey: 'onboarding.steps.results',
    icon: 'clipboard',
  },
  {
    id: 'reports',
    index: 6,
    route: '/app/reports',
    selector: '[data-tour="nav-reports"]',
    pageSelector: '[data-tour="reports-builder"]',
    translationKey: 'onboarding.steps.reports',
    icon: 'report',
  },
  {
    id: 'chat',
    index: 7,
    route: '/app/chat',
    selector: '[data-tour="nav-chat"]',
    pageSelector: '[data-tour="chat-workspace"]',
    translationKey: 'onboarding.steps.chat',
    icon: 'chat',
    isFinal: true,
  },
]
