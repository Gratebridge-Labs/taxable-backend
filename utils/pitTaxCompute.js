/**
 * Shared Individual PIT tax computation from IncomeData blobs + Deduction rows.
 * Uses NTA 2025 bands via taxCalculator.js
 */

const IncomeData = require('../models/IncomeData');
const Deduction = require('../models/Deduction');
const {
  extractPitBlob,
  getMonthEntries,
  aggregateAnnualFromMonthly,
  computeFromBlob,
  toNum
} = require('./pitIncomeHelpers');
const { calculateIndividualTax, calculateRentRelief, TAX_BRACKETS } = require('./taxCalculator');

function formatBands(taxableIncome) {
  const result = calculateIndividualTax(taxableIncome);
  // Spec shape: { from: 0, to: 800000, rate, tax }, { from: 800000, to: 3000000, ... }
  return TAX_BRACKETS.map((bracket, i) => {
    const calc = result.brackets.find((b) => b.bracket === i + 1);
    const from = i === 0 ? 0 : TAX_BRACKETS[i - 1].max;
    return {
      from,
      to: bracket.max,
      rate: bracket.rate,
      tax: calc ? Math.round(calc.tax * 100) / 100 : 0
    };
  });
}

function collectMonthBlobs(incomeData) {
  const blobs = [];
  for (let m = 1; m <= 12; m++) {
    const blob = extractPitBlob(getMonthEntries(incomeData.monthlyIncomes, m));
    if (blob) blobs.push({ month: m, blob });
  }
  return blobs;
}

/**
 * Resolve annual income/deduction totals from PIT blobs (preferred) or legacy arrays.
 */
function resolveAnnualTotals(incomeData, filingPreference, requestedMonth) {
  const monthBlobs = collectMonthBlobs(incomeData);
  let annualBlob = extractPitBlob(incomeData.annualIncomes);

  if (!annualBlob && monthBlobs.length) {
    annualBlob = {
      format: 'pit_v1',
      ...aggregateAnnualFromMonthly(monthBlobs.map((m) => m.blob))
    };
  }

  // Period-specific blob for monthly display
  let periodBlob = null;
  if (filingPreference === 'monthly' && requestedMonth) {
    periodBlob = monthBlobs.find((m) => m.month === requestedMonth)?.blob || null;
  } else if (filingPreference === 'annual') {
    periodBlob = annualBlob;
  }

  if (annualBlob) {
    return {
      source: 'pit_blob',
      annual: annualBlob,
      period: periodBlob,
      monthBlobs
    };
  }

  // Legacy: typed income arrays
  const toLegacyAmount = (items) => {
    if (!Array.isArray(items)) return 0;
    return items.reduce((sum, item) => {
      const type = String(item?.type || '').toLowerCase();
      if (type === 'employment') {
        return sum + toNum(item.grossSalary) + toNum(item.bonuses) + toNum(item.commissions);
      }
      if (type === 'digital_assets' || type === 'freelance') {
        return sum + toNum(item.value);
      }
      return sum + toNum(item.value || item.amount || item.grossSalary);
    }, 0);
  };

  let periodIncomeItems = [];
  if (filingPreference === 'annual') {
    periodIncomeItems = Array.isArray(incomeData.annualIncomes) ? incomeData.annualIncomes : [];
  } else {
    periodIncomeItems = getMonthEntries(incomeData.monthlyIncomes, requestedMonth);
    if (!Array.isArray(periodIncomeItems)) periodIncomeItems = [];
  }

  return {
    source: 'legacy',
    periodIncomeAmount: toLegacyAmount(periodIncomeItems),
    periodIncomeItems,
    monthBlobs: []
  };
}

function computeReliefFromDeductions(deductions, filingPreference) {
  return deductions.reduce((sum, d) => {
    const type = String(d?.deductionType || '').toLowerCase();
    if (type === 'rent_relief') {
      const annualRelief = calculateRentRelief(toNum(d.amount) * (d.frequency === 'monthly' ? 12 : 1));
      // If amount already looks annual (frequency annual), use amount as annual rent
      const rentAnnual = d.frequency === 'monthly' ? toNum(d.amount) * 12 : toNum(d.amount);
      const relief = calculateRentRelief(rentAnnual);
      return sum + (filingPreference === 'monthly' ? relief / 12 : relief);
    }
    const amount = toNum(d.amount);
    if (filingPreference === 'monthly' && d.frequency === 'annual') return sum + amount / 12;
    return sum + amount;
  }, 0);
}

/**
 * Compute full PIT tax summary for a profile.
 */
async function computePitTaxSummary(profile, { month } = {}) {
  const filingPreference = profile.filingPreference;
  if (!['monthly', 'annual'].includes(filingPreference)) {
    const err = new Error('Insufficient data: filingPreference must be monthly or annual');
    err.statusCode = 400;
    throw err;
  }

  const requestedMonth = month != null ? Number(month) : null;
  if (filingPreference === 'monthly' && (!requestedMonth || requestedMonth < 1 || requestedMonth > 12)) {
    const err = new Error('For monthly filing, provide a valid month (1-12)');
    err.statusCode = 400;
    throw err;
  }

  const incomeData = await IncomeData.findOne({
    profileId: profile._id,
    year: profile.year
  }).lean();

  if (!incomeData) {
    const err = new Error('Insufficient data: income data not found');
    err.statusCode = 400;
    throw err;
  }

  const resolved = resolveAnnualTotals(incomeData, filingPreference, requestedMonth);

  let grossIncomeAnnual = 0;
  let totalDeductionsRawAnnual = 0; // rent + health + pension + mortgage (raw, before rent relief rule)
  let rentAnnual = 0;
  let healthAnnual = 0;
  let pensionAnnual = 0;
  let mortgageAnnual = 0;

  if (resolved.source === 'pit_blob' && resolved.annual) {
    const income = resolved.annual.income || {};
    const deductions = resolved.annual.deductions || {};
    const computed = resolved.annual.computed || computeFromBlob(income, deductions);
    grossIncomeAnnual = computed.grossIncome;
    rentAnnual = toNum(deductions.rent);
    healthAnnual = toNum(deductions.healthInsurance);
    pensionAnnual = toNum(deductions.pension);
    mortgageAnnual = toNum(deductions.mortgageInterest);
    totalDeductionsRawAnnual = rentAnnual + healthAnnual + pensionAnnual + mortgageAnnual;

    if (filingPreference === 'monthly' && !resolved.period) {
      const err = new Error('Insufficient data: no income data found for requested period');
      err.statusCode = 400;
      throw err;
    }
    if (grossIncomeAnnual <= 0 && totalDeductionsRawAnnual <= 0) {
      const err = new Error('Insufficient data: no income data found for requested period');
      err.statusCode = 400;
      throw err;
    }
  } else {
    // Legacy path: income from arrays; deductions from Deduction collection
    const allDeductions = await Deduction.find({
      profileId: profile._id,
      'period.year': profile.year
    }).lean();

    if (!allDeductions.length) {
      const err = new Error('Insufficient data: deductions data not found');
      err.statusCode = 400;
      throw err;
    }

    if (filingPreference === 'monthly') {
      grossIncomeAnnual = resolved.periodIncomeAmount * 12;
    } else {
      grossIncomeAnnual = resolved.periodIncomeAmount;
    }

    // Aggregate deduction amounts to annual
    for (const d of allDeductions) {
      const type = String(d.deductionType || '').toLowerCase();
      let annualAmt = toNum(d.amount);
      if (d.frequency === 'monthly') annualAmt = annualAmt * 12;
      if (type === 'rent_relief') rentAnnual += annualAmt;
      else if (type === 'insurance') healthAnnual += annualAmt;
      else if (type === 'pension') pensionAnnual += annualAmt;
      else if (type === 'mortgage') mortgageAnnual += annualAmt;
    }
    totalDeductionsRawAnnual = rentAnnual + healthAnnual + pensionAnnual + mortgageAnnual;
  }

  const rentReliefApplied = calculateRentRelief(rentAnnual);
  const deductibleAmounts = healthAnnual + pensionAnnual + mortgageAnnual + rentReliefApplied;
  const taxableIncome = Math.max(0, grossIncomeAnnual - deductibleAmounts);
  const taxResult = calculateIndividualTax(taxableIncome);
  const annualTax = taxResult.totalTax;
  const monthlyTax = annualTax / 12;

  // Period view (for monthly request, also expose period gross)
  let periodGross = grossIncomeAnnual;
  let periodDeductions = totalDeductionsRawAnnual;
  if (filingPreference === 'monthly' && resolved.period) {
    periodGross = resolved.period.computed?.grossIncome ?? computeFromBlob(resolved.period.income, resolved.period.deductions).grossIncome;
    periodDeductions = resolved.period.computed?.totalDeductions ?? 0;
  } else if (filingPreference === 'monthly' && resolved.source === 'legacy') {
    periodGross = resolved.periodIncomeAmount;
    periodDeductions = totalDeductionsRawAnnual / 12;
  }

  return {
    profileId: profile.profileId,
    year: profile.year,
    filingPreference,
    month: filingPreference === 'monthly' ? requestedMonth : null,
    grossIncome: Math.round(grossIncomeAnnual * 100) / 100,
    totalDeductions: Math.round(totalDeductionsRawAnnual * 100) / 100,
    rentReliefApplied: Math.round(rentReliefApplied * 100) / 100,
    taxableIncome: Math.round(taxableIncome * 100) / 100,
    annualTax: Math.round(annualTax * 100) / 100,
    monthlyTax: Math.round(monthlyTax * 100) / 100,
    bands: formatBands(taxableIncome),
    // Backward-compatible nested summary used by older clients / paystack
    taxSummary: {
      totalIncome: filingPreference === 'monthly' ? periodGross : grossIncomeAnnual,
      totalCalculatedRelief: deductibleAmounts / (filingPreference === 'monthly' ? 12 : 1),
      taxableIncome: filingPreference === 'monthly' ? taxableIncome / 12 : taxableIncome,
      totalTaxAmount: filingPreference === 'monthly' ? monthlyTax : annualTax,
      monthlyTax
    },
    period: {
      grossIncome: periodGross,
      totalDeductions: periodDeductions
    }
  };
}

module.exports = {
  computePitTaxSummary,
  formatBands,
  resolveAnnualTotals
};
