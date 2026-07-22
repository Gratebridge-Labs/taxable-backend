/**
 * CIT Controller
 * Handles Company Income Tax: quarterly assessments, financials, adjustments, computation, filing
 */
const CITReturn = require('../models/CITReturn');
const WHTCredit = require('../models/WHTCredit');
const { CIT_RATE } = require('../config/constants');

const EDU_TAX_RATE = 0.03; // 3% Tertiary Education Tax (on assessable profit)

const QUARTER_LABELS = ['Q1', 'Q2', 'Q3', 'Q4'];

/** Quarterly CIT due dates for a given year. */
function quarterDueDates(year) {
  return [
    new Date(year, 2, 31),  // Q1: March 31
    new Date(year, 5, 30),  // Q2: June 30
    new Date(year, 8, 30),  // Q3: September 30
    new Date(year, 11, 31)  // Q4: December 31
  ];
}

/**
 * Build the full quarterly-assessment view: estimates, installments (with
 * display statuses), and payment totals — everything the screen needs.
 */
function buildQuarterlyView(cit, year) {
  const estimatedGrossRevenue = cit.estimatedGrossRevenue || 0;
  const estimatedProfitMargin = cit.estimatedProfitMargin || 0;

  // Prefer revenue x margin; fall back to a directly-set estimatedAnnualProfit
  const derivedProfit = Math.round(estimatedGrossRevenue * (estimatedProfitMargin / 100));
  const estimatedAnnualProfit = derivedProfit > 0 ? derivedProfit : (cit.estimatedAnnualProfit || 0);

  const estimatedAnnualCit = Math.round(estimatedAnnualProfit * CIT_RATE);
  const perQuarter = Math.round(estimatedAnnualCit / 4);

  const installments = (cit.quarterlyAssessments && cit.quarterlyAssessments.length === 4)
    ? cit.quarterlyAssessments
    : quarterDueDates(year).map((dueDate, i) => ({ quarter: i + 1, dueDate, amount: perQuarter, status: 'pending' }));

  // Display status: paid/deferred as stored; otherwise the earliest unpaid = "pending", the rest "upcoming"
  let firstUnpaidSeen = false;
  const rows = installments.map((inst, i) => {
    let displayStatus;
    if (inst.status === 'paid') displayStatus = 'paid';
    else if (inst.status === 'deferred') displayStatus = 'deferred';
    else if (!firstUnpaidSeen) { displayStatus = 'pending'; firstUnpaidSeen = true; }
    else displayStatus = 'upcoming';

    return {
      quarter: inst.quarter,
      label: `${QUARTER_LABELS[inst.quarter - 1]} ${year}`,
      dueDate: inst.dueDate,
      amount: inst.amount || perQuarter,
      status: displayStatus,
      paidAt: inst.paidAt || null,
      deferredAt: inst.deferredAt || null
    };
  });

  const totalPaid = installments.filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount || 0), 0);
  const remaining = Math.max(0, estimatedAnnualCit - totalPaid);
  const percentPaid = estimatedAnnualCit > 0 ? Math.round((totalPaid / estimatedAnnualCit) * 100) : 0;

  return {
    year,
    estimates: {
      estimatedAnnualRevenue: estimatedGrossRevenue,
      profitMargin: estimatedProfitMargin,
      estimatedAnnualProfit,
      citRatePercent: Math.round(CIT_RATE * 100),
      estimatedAnnualCit,
      perQuarter
    },
    installments: rows,
    totals: { totalPaid, remaining, percentPaid },
    payCitQuarterly: cit.payCitQuarterly || false,
    reconciliationNote: `When you file your annual CIT in June ${year + 1}, we'll reconcile based on your actual profit. You may owe more or get a refund.`
  };
}

/**
 * Helper: get or create CIT return for a profile+year
 */
async function getOrCreateCit(profileId, year) {
  let cit = await CITReturn.findOne({ profileId, year });
  if (!cit) {
    cit = await CITReturn.create({ profileId, year });
  }
  return cit;
}

/**
 * Helper: generate quarterly installments from estimated profit
 */
function generateInstallments(estimatedAnnualProfit, year, existing) {
  const estimatedCIT = Math.round(estimatedAnnualProfit * CIT_RATE);
  const quarterlyAmount = Math.round(estimatedCIT / 4);
  const dueDates = [
    new Date(year, 2, 31),  // Q1: March 31
    new Date(year, 5, 30),  // Q2: June 30
    new Date(year, 8, 30),  // Q3: September 30
    new Date(year, 11, 31)  // Q4: December 31
  ];

  const installments = [];
  for (let q = 1; q <= 4; q++) {
    const prev = (existing || []).find(i => i.quarter === q);
    installments.push({
      quarter: q,
      dueDate: dueDates[q - 1],
      amount: quarterlyAmount,
      status: prev ? prev.status : 'pending',
      paidAt: prev ? prev.paidAt : undefined,
      deferredAt: prev ? prev.deferredAt : undefined
    });
  }
  return { estimatedCIT, installments };
}

/**
 * Helper: compute CIT from financials + adjustments + credits
 */
function computeCit(cit, whtCreditsTotal) {
  const f = cit.financials || {};
  const totalRevenue = (f.revenue || 0) + (f.otherIncome || 0);
  const totalExpenses = (f.costOfSales || 0) + (f.operatingExpenses || 0) + (f.depreciation || 0) + (f.interestPaid || 0) + (f.otherExpenses || 0);
  const accountingProfit = totalRevenue - totalExpenses;

  const adj = cit.taxAdjustments || {};
  const totalDisallowable = (adj.disallowableExpenses || []).reduce((s, e) => s + (e.amount || 0), 0);
  const totalCapitalAllowances = (adj.capitalAllowances || []).reduce((s, e) => s + (e.amount || 0), 0);
  const pioneerRelief = adj.pioneerRelief || 0;
  const otherDeductions = adj.otherDeductions || 0;

  const adjustedTaxableProfit = Math.max(0, accountingProfit + totalDisallowable - totalCapitalAllowances - pioneerRelief - otherDeductions);

  const grossCitOwed = Math.round(adjustedTaxableProfit * CIT_RATE);
  const tertiaryEducationTax = Math.round(adjustedTaxableProfit * EDU_TAX_RATE);

  const quarterlyInstallmentsPaid = (cit.quarterlyAssessments || [])
    .filter(i => i.status === 'paid')
    .reduce((s, i) => s + (i.amount || 0), 0);

  const netCitPayable = Math.max(0, grossCitOwed + tertiaryEducationTax - whtCreditsTotal - quarterlyInstallmentsPaid);

  return {
    accountingProfit,
    totalDisallowable,
    totalCapitalAllowances,
    adjustedTaxableProfit,
    citTaxRate: CIT_RATE * 100,
    grossCitOwed,
    tertiaryEducationTax,
    totalWhtCreditsApplied: whtCreditsTotal,
    quarterlyInstallmentsPaid,
    netCitPayable,
    // Extra breakdown for frontend
    totalRevenue,
    totalExpenses
  };
}

/**
 * Get CIT records (full state)
 * GET /api/taxableprofile/business/:profileId/cit
 */
const getCitRecords = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const year = parseInt(req.query.year) || profile.year;

    const cit = await CITReturn.findOne({ profileId: profile._id, year }).lean();

    if (!cit) {
      return res.status(200).json({
        success: true,
        message: 'No CIT records found for this year',
        data: { profileId: profile._id, year, financials: null, adjustments: null, computation: null, quarterlyAssessments: null, status: 'not_started', filed: false }
      });
    }

    const whtCredits = await WHTCredit.find({ profileId: profile._id, year }).lean();
    const whtCreditsTotal = whtCredits.reduce((s, c) => s + (c.whtAmount || 0), 0);
    const computation = computeCit(cit, whtCreditsTotal);

    return res.status(200).json({
      success: true,
      message: 'CIT records retrieved',
      data: {
        profileId: profile._id,
        year,
        financials: cit.financials,
        taxAdjustments: cit.taxAdjustments,
        computation,
        quarterlyAssessments: cit.quarterlyAssessments,
        estimatedAnnualProfit: cit.estimatedAnnualProfit,
        payCitQuarterly: cit.payCitQuarterly,
        status: cit.status,
        filed: cit.filed,
        filedAt: cit.filedAt,
        filingId: cit.filingId
      }
    });
  } catch (error) {
    console.error('[CIT] getCitRecords error:', error);
    return res.status(500).json({ success: false, message: 'Error retrieving CIT records' });
  }
};

/**
 * Get quarterly assessment status
 * GET /api/taxableprofile/business/:profileId/cit/assessments
 */
const getQuarterlyAssessments = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const year = parseInt(req.query.year) || profile.year;

    const cit = await getOrCreateCit(profile._id, year);

    // Derive the estimated profit (revenue x margin, or a directly-set value)
    const derivedProfit = Math.round((cit.estimatedGrossRevenue || 0) * ((cit.estimatedProfitMargin || 0) / 100));
    const estimatedAnnualProfit = derivedProfit > 0 ? derivedProfit : (cit.estimatedAnnualProfit || 0);

    // Lay out the 4 installments if not present (or amounts are stale)
    if (estimatedAnnualProfit > 0) {
      const { installments } = generateInstallments(estimatedAnnualProfit, year, cit.quarterlyAssessments);
      cit.quarterlyAssessments = installments;
      cit.estimatedAnnualProfit = estimatedAnnualProfit;
      await cit.save();
    }

    return res.status(200).json({
      success: true,
      message: 'CIT quarterly assessments retrieved',
      data: { profileId: profile._id, ...buildQuarterlyView(cit, year) }
    });
  } catch (error) {
    console.error('[CIT] getQuarterlyAssessments error:', error);
    return res.status(500).json({ success: false, message: 'Error retrieving quarterly assessments' });
  }
};

/**
 * Update quarterly assessment (change estimated profit, regenerate installments)
 * PUT /api/taxableprofile/business/:profileId/cit/quarterly
 */
const updateQuarterlyAssessment = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const { estimatedGrossRevenue, estimatedProfitMargin, estimatedAnnualProfit, payCitQuarterly } = req.body;

    const year = profile.year;
    const cit = await getOrCreateCit(profile._id, year);

    // Accept either revenue + margin (preferred, from "Edit Estimates") or a direct profit
    if (estimatedGrossRevenue !== undefined) {
      if (typeof estimatedGrossRevenue !== 'number' || estimatedGrossRevenue < 0) {
        return res.status(400).json({ success: false, message: 'estimatedGrossRevenue must be a non-negative number' });
      }
      cit.estimatedGrossRevenue = estimatedGrossRevenue;
    }
    if (estimatedProfitMargin !== undefined) {
      if (typeof estimatedProfitMargin !== 'number' || estimatedProfitMargin < 0 || estimatedProfitMargin > 100) {
        return res.status(400).json({ success: false, message: 'estimatedProfitMargin must be between 0 and 100' });
      }
      cit.estimatedProfitMargin = estimatedProfitMargin;
    }
    if (estimatedAnnualProfit !== undefined) {
      if (typeof estimatedAnnualProfit !== 'number' || estimatedAnnualProfit < 0) {
        return res.status(400).json({ success: false, message: 'estimatedAnnualProfit must be a non-negative number' });
      }
    }
    if (payCitQuarterly !== undefined) cit.payCitQuarterly = payCitQuarterly;

    // Recompute the profit used for installments
    const derivedProfit = Math.round((cit.estimatedGrossRevenue || 0) * ((cit.estimatedProfitMargin || 0) / 100));
    const profitForInstallments = derivedProfit > 0 ? derivedProfit : (estimatedAnnualProfit ?? cit.estimatedAnnualProfit ?? 0);
    cit.estimatedAnnualProfit = profitForInstallments;

    const { installments } = generateInstallments(profitForInstallments, year, cit.quarterlyAssessments);
    cit.quarterlyAssessments = installments;
    await cit.save();

    return res.status(200).json({
      success: true,
      message: 'Quarterly CIT assessment updated',
      data: { profileId: profile._id, ...buildQuarterlyView(cit, year) }
    });
  } catch (error) {
    console.error('[CIT] updateQuarterlyAssessment error:', error);
    return res.status(500).json({ success: false, message: 'Error updating quarterly assessment' });
  }
};

/**
 * Pay quarterly installment
 * POST /api/taxableprofile/business/:profileId/cit/quarterly/:quarter/pay
 */
const payQuarterlyInstallment = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const quarter = parseInt(req.params.quarter, 10);
    if (quarter < 1 || quarter > 4) {
      return res.status(400).json({ success: false, message: 'quarter must be 1-4' });
    }

    const cit = await getOrCreateCit(profile._id, profile.year);
    const inst = (cit.quarterlyAssessments || []).find(i => i.quarter === quarter);
    if (!inst) {
      return res.status(404).json({ success: false, message: `Quarter ${quarter} assessment not found. Update quarterly assessment first.` });
    }
    if (inst.status === 'paid') {
      return res.status(400).json({ success: false, message: `Quarter ${quarter} is already paid` });
    }

    inst.status = 'paid';
    inst.paidAt = new Date();
    await cit.save();

    return res.status(200).json({
      success: true,
      message: `CIT quarterly installment Q${quarter} marked as paid`,
      data: { profileId: profile._id, paidQuarter: quarter, ...buildQuarterlyView(cit, profile.year) }
    });
  } catch (error) {
    console.error('[CIT] payQuarterlyInstallment error:', error);
    return res.status(500).json({ success: false, message: 'Error paying quarterly installment' });
  }
};

/**
 * Defer quarterly installment to annual filing
 * POST /api/taxableprofile/business/:profileId/cit/quarterly/:quarter/defer
 */
const deferQuarterlyInstallment = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const quarter = parseInt(req.params.quarter, 10);
    if (quarter < 1 || quarter > 4) {
      return res.status(400).json({ success: false, message: 'quarter must be 1-4' });
    }

    const cit = await getOrCreateCit(profile._id, profile.year);
    const inst = (cit.quarterlyAssessments || []).find(i => i.quarter === quarter);
    if (!inst) {
      return res.status(404).json({ success: false, message: `Quarter ${quarter} assessment not found` });
    }
    if (inst.status === 'paid') {
      return res.status(400).json({ success: false, message: `Quarter ${quarter} is already paid and cannot be deferred` });
    }

    inst.status = 'deferred';
    inst.deferredAt = new Date();
    await cit.save();

    return res.status(200).json({
      success: true,
      message: `CIT quarterly installment Q${quarter} deferred to annual filing`,
      data: { profileId: profile._id, deferredQuarter: quarter, ...buildQuarterlyView(cit, profile.year) }
    });
  } catch (error) {
    console.error('[CIT] deferQuarterlyInstallment error:', error);
    return res.status(500).json({ success: false, message: 'Error deferring quarterly installment' });
  }
};

/**
 * Save annual financials
 * PUT /api/taxableprofile/business/:profileId/cit/financials
 */
const saveCitFinancials = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const { revenue, otherIncome, costOfSales, operatingExpenses, depreciation, interestPaid, otherExpenses } = req.body;

    if (typeof revenue !== 'number' || revenue < 0) {
      return res.status(400).json({ success: false, message: 'revenue must be a non-negative number' });
    }

    const year = profile.year;
    const cit = await getOrCreateCit(profile._id, year);

    cit.financials = {
      revenue: revenue || 0,
      otherIncome: otherIncome || 0,
      costOfSales: costOfSales || 0,
      operatingExpenses: operatingExpenses || 0,
      depreciation: depreciation || 0,
      interestPaid: interestPaid || 0,
      otherExpenses: otherExpenses || 0
    };
    await cit.save();

    const totalRevenue = (cit.financials.revenue || 0) + (cit.financials.otherIncome || 0);
    const totalExpenses = (cit.financials.costOfSales || 0) + (cit.financials.operatingExpenses || 0) + (cit.financials.depreciation || 0) + (cit.financials.interestPaid || 0) + (cit.financials.otherExpenses || 0);

    return res.status(200).json({
      success: true,
      message: 'CIT financials saved',
      data: {
        profileId: profile._id,
        year,
        financials: {
          ...cit.financials.toObject ? cit.financials.toObject() : cit.financials,
          totalRevenue,
          totalExpenses,
          accountingProfit: totalRevenue - totalExpenses
        }
      }
    });
  } catch (error) {
    console.error('[CIT] saveCitFinancials error:', error);
    return res.status(500).json({ success: false, message: 'Error saving CIT financials' });
  }
};

/**
 * Save tax adjustments
 * PUT /api/taxableprofile/business/:profileId/cit/adjustments
 */
const saveCitAdjustments = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const { disallowableExpenses, capitalAllowances, pioneerRelief, otherDeductions } = req.body;

    const year = profile.year;
    const cit = await getOrCreateCit(profile._id, year);

    cit.taxAdjustments = {
      disallowableExpenses: Array.isArray(disallowableExpenses) ? disallowableExpenses : [],
      capitalAllowances: Array.isArray(capitalAllowances) ? capitalAllowances : [],
      pioneerRelief: pioneerRelief || 0,
      otherDeductions: otherDeductions || 0
    };
    await cit.save();

    const totalDisallowable = cit.taxAdjustments.disallowableExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const totalCapitalAllowancesAmt = cit.taxAdjustments.capitalAllowances.reduce((s, e) => s + (e.amount || 0), 0);

    return res.status(200).json({
      success: true,
      message: 'CIT tax adjustments saved',
      data: {
        profileId: profile._id,
        year,
        adjustments: {
          totalDisallowableExpenses: totalDisallowable,
          totalCapitalAllowances: totalCapitalAllowancesAmt,
          pioneerRelief: cit.taxAdjustments.pioneerRelief,
          otherDeductions: cit.taxAdjustments.otherDeductions,
          netAdjustment: totalDisallowable - totalCapitalAllowancesAmt
        }
      }
    });
  } catch (error) {
    console.error('[CIT] saveCitAdjustments error:', error);
    return res.status(500).json({ success: false, message: 'Error saving CIT adjustments' });
  }
};

/**
 * Get CIT computation & review
 * GET /api/taxableprofile/business/:profileId/cit/computation
 */
const getCitComputation = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const year = parseInt(req.query.year) || profile.year;

    const cit = await CITReturn.findOne({ profileId: profile._id, year });
    if (!cit) {
      return res.status(404).json({ success: false, message: 'No CIT records found. Save financials first.' });
    }

    const whtCredits = await WHTCredit.find({ profileId: profile._id, year }).lean();
    const whtCreditsTotal = whtCredits.reduce((s, c) => s + (c.whtAmount || 0), 0);
    const result = computeCit(cit, whtCreditsTotal);

    // Persist computed fields
    cit.accountingProfit = result.accountingProfit;
    cit.totalDisallowable = result.totalDisallowable;
    cit.totalCapitalAllowances = result.totalCapitalAllowances;
    cit.adjustedTaxableProfit = result.adjustedTaxableProfit;
    cit.citTaxRate = result.citTaxRate;
    cit.grossCitOwed = result.grossCitOwed;
    cit.tertiaryEducationTax = result.tertiaryEducationTax;
    cit.totalWhtCreditsApplied = result.totalWhtCreditsApplied;
    cit.quarterlyInstallmentsPaid = result.quarterlyInstallmentsPaid;
    cit.netCitPayable = result.netCitPayable;
    await cit.save();

    return res.status(200).json({
      success: true,
      message: 'CIT computation retrieved',
      data: {
        profileId: profile._id,
        year,
        ...result,
        breakdown: {
          revenue: result.totalRevenue,
          totalExpenses: result.totalExpenses,
          accountingProfit: result.accountingProfit,
          addBack: result.totalDisallowable,
          lessAllowances: result.totalCapitalAllowances,
          taxableProfit: result.adjustedTaxableProfit,
          citAt30Percent: result.grossCitOwed,
          eduTaxAt3Percent: result.tertiaryEducationTax,
          grossTax: result.grossCitOwed + result.tertiaryEducationTax,
          lessWhtCredits: result.totalWhtCreditsApplied,
          lessQuarterlyPaid: result.quarterlyInstallmentsPaid,
          netPayable: result.netCitPayable
        }
      }
    });
  } catch (error) {
    console.error('[CIT] getCitComputation error:', error);
    return res.status(500).json({ success: false, message: 'Error computing CIT' });
  }
};

/**
 * Submit CIT annual return
 * POST /api/taxableprofile/business/:profileId/cit/submit
 */
const submitCitReturn = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const year = profile.year;

    const cit = await CITReturn.findOne({ profileId: profile._id, year });
    if (!cit) {
      return res.status(404).json({ success: false, message: 'No CIT records found. Save financials first.' });
    }
    if (cit.filed) {
      return res.status(400).json({ success: false, message: 'CIT return has already been submitted' });
    }

    // Verify financials exist
    if (!cit.financials || !cit.financials.revenue) {
      return res.status(400).json({ success: false, message: 'CIT financials must be saved before submitting' });
    }

    const now = new Date();
    cit.status = 'submitted';
    cit.filed = true;
    cit.filedAt = now;
    cit.filingId = `cit_${year}_${Date.now()}`;
    await cit.save();

    return res.status(200).json({
      success: true,
      message: 'CIT annual return submitted',
      data: {
        filingId: cit.filingId,
        year,
        status: 'submitted',
        submittedAt: now.toISOString(),
        netCitPayable: cit.netCitPayable
      }
    });
  } catch (error) {
    console.error('[CIT] submitCitReturn error:', error);
    return res.status(500).json({ success: false, message: 'Error submitting CIT return' });
  }
};

module.exports = {
  getCitRecords,
  getQuarterlyAssessments,
  updateQuarterlyAssessment,
  payQuarterlyInstallment,
  deferQuarterlyInstallment,
  saveCitFinancials,
  saveCitAdjustments,
  getCitComputation,
  submitCitReturn
};
