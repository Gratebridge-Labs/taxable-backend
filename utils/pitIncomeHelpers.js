/**
 * Helpers for Individual PIT income-data blob shape used by the web UI.
 * Blob format is stored inside IncomeData monthly/annual Mixed entries.
 */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const INCOME_KEYS = [
  'salaryTakeHome',
  'businessRevenue',
  'businessExpenses',
  'freelanceInvoiced',
  'freelanceWHT',
  'investmentIncome',
  'rentalIncome',
  'digitalGains'
];

const DEDUCTION_KEYS = [
  'rent',
  'healthInsurance',
  'pension',
  'mortgageInterest'
];

const DOCUMENT_KEYS = [
  'salaryUrl',
  'freelanceUrl',
  'rentalUrl',
  'rentUrl',
  'healthUrl',
  'pensionUrl',
  'mortgageUrl',
  'businessUrl',
  'investmentUrl',
  'cryptoUrl'
];

const DEDUCTION_TYPE_MAP = {
  rent: 'rent_relief',
  healthInsurance: 'insurance',
  pension: 'pension',
  mortgageInterest: 'mortgage'
};

function toNum(v) {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pickNumberFields(source, keys) {
  const out = {};
  if (!source || typeof source !== 'object') return out;
  for (const key of keys) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== '') {
      out[key] = toNum(source[key]);
    }
  }
  return out;
}

function pickDocumentFields(source) {
  const out = {};
  if (!source || typeof source !== 'object') return out;
  for (const key of DOCUMENT_KEYS) {
    if (source[key] !== undefined) {
      out[key] = source[key] || null;
    }
  }
  return out;
}

function computeFromBlob(income = {}, deductions = {}) {
  const businessNet = Math.max(0, toNum(income.businessRevenue) - toNum(income.businessExpenses));
  const freelanceNet = Math.max(0, toNum(income.freelanceInvoiced) - toNum(income.freelanceWHT));
  const grossIncome =
    toNum(income.salaryTakeHome) +
    businessNet +
    freelanceNet +
    toNum(income.investmentIncome) +
    toNum(income.rentalIncome) +
    toNum(income.digitalGains);

  const totalDeductions =
    toNum(deductions.rent) +
    toNum(deductions.healthInsurance) +
    toNum(deductions.pension) +
    toNum(deductions.mortgageInterest);

  return {
    businessNet,
    freelanceNet,
    grossIncome,
    totalDeductions
  };
}

function isPitBlob(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  if (entry.format === 'pit_v1') return true;
  return entry.income != null && typeof entry.income === 'object';
}

function normalizePitBlob({ income, deductions, documents, markRecorded, recorded }) {
  const normalizedIncome = pickNumberFields(income, INCOME_KEYS);
  const normalizedDeductions = pickNumberFields(deductions, DEDUCTION_KEYS);
  const normalizedDocuments = pickDocumentFields(documents);
  const computed = computeFromBlob(normalizedIncome, normalizedDeductions);

  return {
    format: 'pit_v1',
    recorded: markRecorded !== undefined ? !!markRecorded : recorded !== undefined ? !!recorded : true,
    income: normalizedIncome,
    deductions: normalizedDeductions,
    documents: normalizedDocuments,
    computed
  };
}

/**
 * Month map value may be a pit blob object or a legacy array of income items.
 */
function extractPitBlob(monthValue) {
  if (isPitBlob(monthValue)) return monthValue;
  if (Array.isArray(monthValue)) {
    const blob = monthValue.find(isPitBlob);
    return blob || null;
  }
  return null;
}

function wrapBlobForStorage(blob) {
  // Keep array storage for schema compatibility (Map of Mixed arrays).
  return [blob];
}

function getMonthEntries(monthlyMap, month) {
  if (!monthlyMap) return [];
  const key = String(month);
  if (monthlyMap instanceof Map) return monthlyMap.get(key) || [];
  return monthlyMap[key] || [];
}

function sumBlobFields(blobs, path) {
  return blobs.reduce((sum, blob) => {
    if (!blob) return sum;
    const [root, key] = path.split('.');
    const section = blob[root] || {};
    return sum + toNum(section[key]);
  }, 0);
}

function aggregateAnnualFromMonthly(monthBlobs) {
  const income = {};
  const deductions = {};
  for (const key of INCOME_KEYS) {
    income[key] = sumBlobFields(monthBlobs, `income.${key}`);
  }
  for (const key of DEDUCTION_KEYS) {
    deductions[key] = sumBlobFields(monthBlobs, `deductions.${key}`);
  }
  const computed = computeFromBlob(income, deductions);
  return { income, deductions, computed };
}

function formatMonthResponse(month, blob) {
  return {
    month,
    monthName: MONTH_NAMES[month - 1],
    recorded: !!(blob && blob.recorded),
    income: blob?.income || {},
    deductions: blob?.deductions || {},
    documents: blob?.documents || {},
    computed: blob?.computed || computeFromBlob(blob?.income || {}, blob?.deductions || {})
  };
}

module.exports = {
  MONTH_NAMES,
  INCOME_KEYS,
  DEDUCTION_KEYS,
  DOCUMENT_KEYS,
  DEDUCTION_TYPE_MAP,
  toNum,
  computeFromBlob,
  isPitBlob,
  normalizePitBlob,
  extractPitBlob,
  wrapBlobForStorage,
  getMonthEntries,
  aggregateAnnualFromMonthly,
  formatMonthResponse,
  pickNumberFields,
  pickDocumentFields
};
