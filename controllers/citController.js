/**
 * CIT Controller
 * Year-scoped Company Income Tax matching the frontend contract:
 *   GET    /cit?year=                          → annual return + computed
 *   PUT    /cit                                → upsert annual (year in body)
 *   POST   /cit/file                           → file annual return
 *   GET    /cit/wht-credits?year=              → list CIT WHT credits
 *   POST   /cit/wht-credits                    → create credit
 *   PUT    /cit/wht-credits/:creditId          → update credit
 *   DELETE /cit/wht-credits/:creditId          → delete credit
 *   GET    /cit/quarterly?year=                → quarterly installments
 *   POST   /cit/quarterly/pay                  → pay a quarter
 *   POST   /cit/quarterly/defer                → defer a quarter (typically Q4)
 */
const CITReturn = require('../models/CITReturn');
const CITWhtCredit = require('../models/CITWhtCredit');

const FINANCIAL_FIELDS = [
  'totalRevenue',
  'cogs',
  'opex',
  'govFines',
  'accountingDepreciation',
  'generalProvisions'
];

const CA_FIELDS = ['class1Assets', 'class2Assets', 'class3Assets'];

function resolveYear(req, profile) {
  const fromQuery = parseInt(req.query.year, 10);
  const fromBody = parseInt(req.body?.year, 10);
  if (Number.isFinite(fromQuery)) return fromQuery;
  if (Number.isFinite(fromBody)) return fromBody;
  return profile.year;
}

function parseQuarter(value) {
  const q = parseInt(value, 10);
  return Number.isFinite(q) && q >= 1 && q <= 4 ? q : null;
}

function quarterDueDates(year) {
  return [
    new Date(year, 2, 31),
    new Date(year, 5, 30),
    new Date(year, 8, 30),
    new Date(year, 11, 31)
  ];
}

/** Estimated annual CIT (base only) from gross revenue + profit margin %. */
function computeCitEstimate(grossRevenue = 0, profitMarginPercent = 0) {
  const estimatedAnnualProfit = Math.max(
    0,
    Math.round((grossRevenue || 0) * ((profitMarginPercent || 0) / 100))
  );
  const rate = CITReturn.bracketRateForTurnover(grossRevenue);
  const estimatedAnnualCit = Math.round(estimatedAnnualProfit * rate);
  const quarterlyInstallment = Math.round(estimatedAnnualCit / 4);
  return { estimatedAnnualProfit, estimatedAnnualCit, quarterlyInstallment, bracketRate: rate };
}

/** Lay out 4 quarters, preserving paid/deferred state and amounts paid. */
function buildQuarterlyInstallments(quarterlyInstallment, year, existing) {
  const dueDates = quarterDueDates(year);
  const installments = [];
  for (let q = 1; q <= 4; q++) {
    const prev = (existing || []).find((i) => i.quarter === q);
    installments.push({
      quarter: q,
      dueDate: dueDates[q - 1],
      amountDue: quarterlyInstallment,
      amountPaid: prev ? (prev.amountPaid || 0) : 0,
      status: prev ? prev.status : 'pending',
      paidAt: prev ? prev.paidAt : undefined,
      deferredAt: prev ? prev.deferredAt : undefined
    });
  }
  return installments;
}

async function getOrCreateCit(profileId, year) {
  let cit = await CITReturn.findOne({ profileId, year });
  if (!cit) {
    cit = await CITReturn.create({ profileId, year });
  }
  return cit;
}

async function sumCitWhtCredits(profileId, year) {
  const credits = await CITWhtCredit.find({ profileId, year }).lean();
  return credits.reduce((s, c) => s + (c.withheldAmount || 0), 0);
}

function formatCredit(credit) {
  return {
    id: credit._id,
    year: credit.year,
    clientName: credit.clientName,
    clientTIN: credit.clientTIN || null,
    creditRef: credit.creditRef,
    grossValue: credit.grossValue || 0,
    withheldAmount: credit.withheldAmount || 0,
    certificateUrl: credit.certificateUrl || null,
    createdAt: credit.createdAt || null,
    updatedAt: credit.updatedAt || null
  };
}

function emptyAnnual(profile, year) {
  return {
    _id: null,
    profileId: profile._id,
    year,
    status: 'draft',
    filed: false,
    financials: {
      totalRevenue: 0,
      cogs: 0,
      opex: 0,
      govFines: 0,
      accountingDepreciation: 0,
      generalProvisions: 0
    },
    capitalAllowances: {
      class1Assets: 0,
      class2Assets: 0,
      class3Assets: 0
    },
    documents: {
      auditedFinancialsUrl: null,
      trialBalanceUrl: null
    },
    settlementPreference: null,
    quarterlyAssessments: [],
    accountingProfit: 0,
    nonDeductibleTotal: 0,
    totalCapitalAllowances: 0,
    assessableProfit: 0,
    bracketRate: CITReturn.CIT_RATE_STANDARD,
    baseCIT: 0,
    developmentLevy: 0,
    totalObligation: 0,
    totalWhtCredits: 0,
    totalQuarterlyPaid: 0,
    finalPosition: 0,
    filedAt: null,
    filingId: null,
    updatedAt: null,
    createdAt: null
  };
}

function formatAnnual(profile, record, computed) {
  const f = record.financials || {};
  const ca = record.capitalAllowances || {};
  const docs = record.documents || {};
  const c = computed || CITReturn.computeCitFields(record, record.totalWhtCredits || 0);

  return {
    profileId: profile.profileId || profile._id,
    year: record.year,
    status: record.status || 'draft',
    filed: record.status === 'filed' || !!record.filed,
    financials: {
      totalRevenue: f.totalRevenue || 0,
      cogs: f.cogs || 0,
      opex: f.opex || 0,
      govFines: f.govFines || 0,
      accountingDepreciation: f.accountingDepreciation || 0,
      generalProvisions: f.generalProvisions || 0
    },
    capitalAllowances: {
      class1Assets: ca.class1Assets || 0,
      class2Assets: ca.class2Assets || 0,
      class3Assets: ca.class3Assets || 0
    },
    documents: {
      auditedFinancialsUrl: docs.auditedFinancialsUrl || null,
      trialBalanceUrl: docs.trialBalanceUrl || null
    },
    settlementPreference: record.settlementPreference || null,
    computed: {
      accountingProfit: c.accountingProfit,
      nonDeductibleTotal: c.nonDeductibleTotal,
      totalCapitalAllowances: c.totalCapitalAllowances,
      assessableProfit: c.assessableProfit,
      bracketRate: c.bracketRate,
      baseCIT: c.baseCIT,
      developmentLevy: c.developmentLevy,
      totalObligation: c.totalObligation,
      totalWhtCredits: c.totalWhtCredits,
      totalQuarterlyPaid: c.totalQuarterlyPaid,
      finalPosition: c.finalPosition
    },
    filedAt: record.filedAt || null,
    filingId: record.filingId || null,
    updatedAt: record.updatedAt || null,
    createdAt: record.createdAt || null
  };
}

function formatQuarterly(cit, year) {
  const gross = cit.estimatedGrossRevenue || 0;
  const margin = cit.estimatedProfitMargin || 0;
  const { estimatedAnnualProfit, estimatedAnnualCit, quarterlyInstallment } =
    computeCitEstimate(gross, margin);

  const rows = (cit.quarterlyAssessments && cit.quarterlyAssessments.length === 4)
    ? cit.quarterlyAssessments
    : buildQuarterlyInstallments(quarterlyInstallment, year, []);

  const quarters = rows.map((inst) => ({
    quarter: inst.quarter,
    status: inst.status || 'pending',
    amountDue: inst.amountDue != null ? inst.amountDue : quarterlyInstallment,
    amountPaid: inst.amountPaid || 0,
    paidAt: inst.paidAt || null,
    deferredAt: inst.deferredAt || null,
    dueDate: inst.dueDate || null
  }));

  const totalPaid = quarters
    .filter((q) => q.status === 'paid')
    .reduce((s, q) => s + (q.amountPaid || q.amountDue || 0), 0);

  return {
    year,
    payCitQuarterly: !!cit.payCitQuarterly,
    estimatedGrossRevenue: gross,
    estimatedProfitMargin: margin,
    estimatedAnnualProfit,
    estimatedAnnualCit,
    quarterlyInstallment,
    quarters,
    summary: {
      totalPaid,
      remaining: Math.max(0, estimatedAnnualCit - totalPaid)
    }
  };
}

function validateNonNegative(body, fields) {
  for (const field of fields) {
    if (body[field] !== undefined) {
      const value = Number(body[field]);
      if (!Number.isFinite(value) || value < 0) {
        return `${field} must be a non-negative number`;
      }
    }
  }
  return null;
}

/**
 * GET /cit?year=
 */
const getAnnual = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const year = resolveYear(req, profile);

    let record = await CITReturn.findOne({ profileId: profile._id, year });
    const whtTotal = await sumCitWhtCredits(profile._id, year);

    if (!record) {
      const empty = emptyAnnual(profile, year);
      const computed = CITReturn.computeCitFields(empty, whtTotal);
      return res.status(200).json({
        success: true,
        message: `CIT return for ${year} (new)`,
        data: formatAnnual(profile, empty, { ...computed, totalWhtCredits: whtTotal })
      });
    }

    const computed = CITReturn.computeCitFields(record, whtTotal);
    return res.status(200).json({
      success: true,
      message: `CIT return for ${year} retrieved`,
      data: formatAnnual(profile, record, computed)
    });
  } catch (error) {
    console.error('[CIT] getAnnual error:', error);
    return res.status(500).json({ success: false, message: 'Error retrieving CIT return' });
  }
};

/**
 * PUT /cit
 * Upsert annual financials + capital allowances + docs. year required in body.
 */
const upsertAnnual = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const year = resolveYear(req, profile);

    if (!Number.isFinite(parseInt(req.body?.year, 10)) && req.body?.year !== undefined) {
      return res.status(400).json({ success: false, message: 'year must be a valid number' });
    }

    const finErr = validateNonNegative(req.body, FINANCIAL_FIELDS);
    if (finErr) return res.status(400).json({ success: false, message: finErr });
    const caErr = validateNonNegative(req.body, CA_FIELDS);
    if (caErr) return res.status(400).json({ success: false, message: caErr });

    if (
      req.body.settlementPreference !== undefined &&
      req.body.settlementPreference !== null &&
      !['rollover', 'refund'].includes(req.body.settlementPreference)
    ) {
      return res.status(400).json({
        success: false,
        message: 'settlementPreference must be rollover, refund, or null'
      });
    }

    let record = await CITReturn.findOne({ profileId: profile._id, year });
    if (!record) {
      record = new CITReturn({ profileId: profile._id, year });
    }

    if (record.status === 'filed' || record.filed) {
      return res.status(400).json({
        success: false,
        message: `CIT return for ${year} has already been filed`
      });
    }

    if (!record.financials) record.financials = {};
    if (!record.capitalAllowances) record.capitalAllowances = {};
    if (!record.documents) record.documents = {};

    for (const field of FINANCIAL_FIELDS) {
      if (req.body[field] !== undefined) record.financials[field] = Number(req.body[field]);
    }
    for (const field of CA_FIELDS) {
      if (req.body[field] !== undefined) record.capitalAllowances[field] = Number(req.body[field]);
    }
    if (req.body.auditedFinancialsUrl !== undefined) {
      record.documents.auditedFinancialsUrl = req.body.auditedFinancialsUrl || undefined;
    }
    if (req.body.trialBalanceUrl !== undefined) {
      record.documents.trialBalanceUrl = req.body.trialBalanceUrl || undefined;
    }
    if (req.body.settlementPreference !== undefined) {
      record.settlementPreference = req.body.settlementPreference || null;
    }

    record.status = 'draft';
    record.filed = false;
    record.markModified('financials');
    record.markModified('capitalAllowances');
    record.markModified('documents');

    const whtTotal = await sumCitWhtCredits(profile._id, year);
    const computed = record.applyComputed(whtTotal);
    await record.save();

    return res.status(200).json({
      success: true,
      message: `CIT return saved for ${year}`,
      data: formatAnnual(profile, record, computed)
    });
  } catch (error) {
    console.error('[CIT] upsertAnnual error:', error);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Duplicate CIT record for this year' });
    }
    return res.status(500).json({
      success: false,
      message: 'Error saving CIT return',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * POST /cit/file
 * Body: year, legalConfirmAccuracy, legalConfirmAuthority, settlementPreference?
 */
const fileAnnual = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const year = resolveYear(req, profile);

    const record = await CITReturn.findOne({ profileId: profile._id, year });
    if (!record) {
      return res.status(404).json({
        success: false,
        message: `No CIT return found for ${year}. Save the return first.`
      });
    }

    if (record.status === 'filed' || record.filed) {
      return res.status(400).json({
        success: false,
        message: `CIT return for ${year} has already been filed`,
        data: formatAnnual(profile, record, CITReturn.computeCitFields(record, record.totalWhtCredits || 0))
      });
    }

    const confirmAccuracy =
      req.body.legalConfirmAccuracy === true || req.body.legalConfirmAccuracy === 'true';
    const confirmAuthority =
      req.body.legalConfirmAuthority === true || req.body.legalConfirmAuthority === 'true';

    if (!confirmAccuracy || !confirmAuthority) {
      return res.status(400).json({
        success: false,
        message: 'legalConfirmAccuracy and legalConfirmAuthority must both be true before filing'
      });
    }

    if (
      req.body.settlementPreference !== undefined &&
      req.body.settlementPreference !== null &&
      !['rollover', 'refund'].includes(req.body.settlementPreference)
    ) {
      return res.status(400).json({
        success: false,
        message: 'settlementPreference must be rollover, refund, or null'
      });
    }

    if (req.body.settlementPreference !== undefined) {
      record.settlementPreference = req.body.settlementPreference || null;
    }

    const whtTotal = await sumCitWhtCredits(profile._id, year);
    const computed = record.applyComputed(whtTotal);

    record.legalConfirmAccuracy = true;
    record.legalConfirmAuthority = true;
    record.status = 'filed';
    record.filed = true;
    record.filedAt = new Date();
    record.filingId = `cit_${year}_${Date.now()}`;
    await record.save();

    return res.status(200).json({
      success: true,
      message: `CIT return filed for ${year}`,
      data: {
        ...formatAnnual(profile, record, computed),
        legalConfirmAccuracy: true,
        legalConfirmAuthority: true
      }
    });
  } catch (error) {
    console.error('[CIT] fileAnnual error:', error);
    return res.status(500).json({ success: false, message: 'Error filing CIT return' });
  }
};

/**
 * GET /cit/wht-credits?year=
 */
const listCitWhtCredits = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const year = resolveYear(req, profile);
    const credits = await CITWhtCredit.find({ profileId: profile._id, year })
      .sort({ createdAt: -1 })
      .lean();

    const totalWithheld = credits.reduce((s, c) => s + (c.withheldAmount || 0), 0);

    return res.status(200).json({
      success: true,
      message: 'CIT WHT credits retrieved',
      data: {
        profileId: profile.profileId || profile._id,
        year,
        credits: credits.map(formatCredit),
        summary: {
          count: credits.length,
          totalWithheld
        }
      }
    });
  } catch (error) {
    console.error('[CIT] listCitWhtCredits error:', error);
    return res.status(500).json({ success: false, message: 'Error retrieving CIT WHT credits' });
  }
};

/**
 * POST /cit/wht-credits
 */
const createCitWhtCredit = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const year = resolveYear(req, profile);
    const { clientName, clientTIN, creditRef, grossValue, withheldAmount, certificateUrl } = req.body;

    if (!clientName || !String(clientName).trim()) {
      return res.status(400).json({ success: false, message: 'clientName is required' });
    }
    if (!creditRef || !String(creditRef).trim()) {
      return res.status(400).json({ success: false, message: 'creditRef is required' });
    }
    if (!Number.isFinite(Number(grossValue)) || Number(grossValue) < 0) {
      return res.status(400).json({ success: false, message: 'grossValue must be a non-negative number' });
    }
    if (!Number.isFinite(Number(withheldAmount)) || Number(withheldAmount) < 0) {
      return res.status(400).json({ success: false, message: 'withheldAmount must be a non-negative number' });
    }

    const cit = await CITReturn.findOne({ profileId: profile._id, year });
    if (cit && (cit.status === 'filed' || cit.filed)) {
      return res.status(400).json({
        success: false,
        message: `Cannot add WHT credits after CIT return for ${year} is filed`
      });
    }

    const credit = await CITWhtCredit.create({
      profileId: profile._id,
      year,
      clientName: String(clientName).trim(),
      clientTIN: clientTIN ? String(clientTIN).trim() : undefined,
      creditRef: String(creditRef).trim(),
      grossValue: Number(grossValue),
      withheldAmount: Number(withheldAmount),
      certificateUrl: certificateUrl ? String(certificateUrl).trim() : undefined
    });

    return res.status(201).json({
      success: true,
      message: 'CIT WHT credit added',
      data: { credit: formatCredit(credit) }
    });
  } catch (error) {
    console.error('[CIT] createCitWhtCredit error:', error);
    return res.status(500).json({ success: false, message: 'Error creating CIT WHT credit' });
  }
};

/**
 * PUT /cit/wht-credits/:creditId
 */
const updateCitWhtCredit = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const { creditId } = req.params;

    const credit = await CITWhtCredit.findOne({ _id: creditId, profileId: profile._id });
    if (!credit) {
      return res.status(404).json({ success: false, message: 'CIT WHT credit not found' });
    }

    const cit = await CITReturn.findOne({ profileId: profile._id, year: credit.year });
    if (cit && (cit.status === 'filed' || cit.filed)) {
      return res.status(400).json({
        success: false,
        message: `Cannot update WHT credits after CIT return for ${credit.year} is filed`
      });
    }

    if (req.body.clientName !== undefined) {
      if (!String(req.body.clientName).trim()) {
        return res.status(400).json({ success: false, message: 'clientName cannot be empty' });
      }
      credit.clientName = String(req.body.clientName).trim();
    }
    if (req.body.clientTIN !== undefined) {
      credit.clientTIN = req.body.clientTIN ? String(req.body.clientTIN).trim() : undefined;
    }
    if (req.body.creditRef !== undefined) {
      if (!String(req.body.creditRef).trim()) {
        return res.status(400).json({ success: false, message: 'creditRef cannot be empty' });
      }
      credit.creditRef = String(req.body.creditRef).trim();
    }
    if (req.body.grossValue !== undefined) {
      const v = Number(req.body.grossValue);
      if (!Number.isFinite(v) || v < 0) {
        return res.status(400).json({ success: false, message: 'grossValue must be a non-negative number' });
      }
      credit.grossValue = v;
    }
    if (req.body.withheldAmount !== undefined) {
      const v = Number(req.body.withheldAmount);
      if (!Number.isFinite(v) || v < 0) {
        return res.status(400).json({ success: false, message: 'withheldAmount must be a non-negative number' });
      }
      credit.withheldAmount = v;
    }
    if (req.body.certificateUrl !== undefined) {
      credit.certificateUrl = req.body.certificateUrl ? String(req.body.certificateUrl).trim() : undefined;
    }

    await credit.save();

    return res.status(200).json({
      success: true,
      message: 'CIT WHT credit updated',
      data: { credit: formatCredit(credit) }
    });
  } catch (error) {
    console.error('[CIT] updateCitWhtCredit error:', error);
    return res.status(500).json({ success: false, message: 'Error updating CIT WHT credit' });
  }
};

/**
 * DELETE /cit/wht-credits/:creditId
 */
const deleteCitWhtCredit = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const { creditId } = req.params;

    const credit = await CITWhtCredit.findOne({ _id: creditId, profileId: profile._id });
    if (!credit) {
      return res.status(404).json({ success: false, message: 'CIT WHT credit not found' });
    }

    const cit = await CITReturn.findOne({ profileId: profile._id, year: credit.year });
    if (cit && (cit.status === 'filed' || cit.filed)) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete WHT credits after CIT return for ${credit.year} is filed`
      });
    }

    await CITWhtCredit.deleteOne({ _id: credit._id });

    return res.status(200).json({
      success: true,
      message: 'CIT WHT credit deleted',
      data: { id: creditId, deleted: true }
    });
  } catch (error) {
    console.error('[CIT] deleteCitWhtCredit error:', error);
    return res.status(500).json({ success: false, message: 'Error deleting CIT WHT credit' });
  }
};

/**
 * GET /cit/quarterly?year=
 * Aggregates estimates (from company-info / CITReturn) + payment state.
 */
const getQuarterly = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const year = resolveYear(req, profile);
    const cit = await getOrCreateCit(profile._id, year);

    const { estimatedAnnualProfit, quarterlyInstallment } = computeCitEstimate(
      cit.estimatedGrossRevenue,
      cit.estimatedProfitMargin
    );
    cit.estimatedAnnualProfit = estimatedAnnualProfit;

    // Ensure 4 rows exist when paying quarterly (or when estimates are set)
    if (cit.payCitQuarterly || estimatedAnnualProfit > 0) {
      const needsLayout = !cit.quarterlyAssessments || cit.quarterlyAssessments.length !== 4;
      if (needsLayout) {
        cit.quarterlyAssessments = buildQuarterlyInstallments(
          quarterlyInstallment,
          year,
          cit.quarterlyAssessments
        );
        await cit.save();
      } else {
        // Refresh amountDue for unpaid quarters when estimates change
        for (const inst of cit.quarterlyAssessments) {
          if (inst.status !== 'paid') inst.amountDue = quarterlyInstallment;
        }
        cit.markModified('quarterlyAssessments');
        await cit.save();
      }
    }

    return res.status(200).json({
      success: true,
      message: 'CIT quarterly assessments retrieved',
      data: {
        profileId: profile.profileId || profile._id,
        ...formatQuarterly(cit, year)
      }
    });
  } catch (error) {
    console.error('[CIT] getQuarterly error:', error);
    return res.status(500).json({ success: false, message: 'Error retrieving quarterly CIT' });
  }
};

/**
 * POST /cit/quarterly/pay
 * Body: { year, quarter, amount }
 */
const payQuarter = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const year = resolveYear(req, profile);
    const quarter = parseQuarter(req.body.quarter);

    if (!quarter) {
      return res.status(400).json({ success: false, message: 'quarter must be 1-4' });
    }

    const amount = req.body.amount !== undefined ? Number(req.body.amount) : null;
    if (amount !== null && (!Number.isFinite(amount) || amount < 0)) {
      return res.status(400).json({ success: false, message: 'amount must be a non-negative number' });
    }

    const cit = await getOrCreateCit(profile._id, year);

    if (!cit.quarterlyAssessments || cit.quarterlyAssessments.length !== 4) {
      const { quarterlyInstallment } = computeCitEstimate(
        cit.estimatedGrossRevenue,
        cit.estimatedProfitMargin
      );
      cit.quarterlyAssessments = buildQuarterlyInstallments(
        quarterlyInstallment,
        year,
        cit.quarterlyAssessments
      );
    }

    const inst = cit.quarterlyAssessments.find((i) => i.quarter === quarter);
    if (!inst) {
      return res.status(404).json({ success: false, message: `Quarter ${quarter} not found` });
    }
    if (inst.status === 'paid') {
      return res.status(400).json({ success: false, message: `Quarter ${quarter} is already paid` });
    }

    const payAmount = amount != null ? amount : (inst.amountDue || 0);
    inst.amountPaid = payAmount;
    if (amount != null) inst.amountDue = payAmount;
    inst.status = 'paid';
    inst.paidAt = new Date();
    cit.markModified('quarterlyAssessments');
    await cit.save();

    return res.status(200).json({
      success: true,
      message: `CIT Q${quarter} marked as paid`,
      data: {
        profileId: profile.profileId || profile._id,
        paidQuarter: quarter,
        ...formatQuarterly(cit, year)
      }
    });
  } catch (error) {
    console.error('[CIT] payQuarter error:', error);
    return res.status(500).json({ success: false, message: 'Error paying quarterly CIT' });
  }
};

/**
 * POST /cit/quarterly/defer
 * Body: { year, quarter } — UI typically defers Q4 into annual filing
 */
const deferQuarter = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const year = resolveYear(req, profile);
    const quarter = parseQuarter(req.body.quarter);

    if (!quarter) {
      return res.status(400).json({ success: false, message: 'quarter must be 1-4' });
    }

    const cit = await getOrCreateCit(profile._id, year);

    if (!cit.quarterlyAssessments || cit.quarterlyAssessments.length !== 4) {
      const { quarterlyInstallment } = computeCitEstimate(
        cit.estimatedGrossRevenue,
        cit.estimatedProfitMargin
      );
      cit.quarterlyAssessments = buildQuarterlyInstallments(
        quarterlyInstallment,
        year,
        cit.quarterlyAssessments
      );
    }

    const inst = cit.quarterlyAssessments.find((i) => i.quarter === quarter);
    if (!inst) {
      return res.status(404).json({ success: false, message: `Quarter ${quarter} not found` });
    }
    if (inst.status === 'paid') {
      return res.status(400).json({
        success: false,
        message: `Quarter ${quarter} is already paid and cannot be deferred`
      });
    }

    inst.status = 'deferred';
    inst.deferredAt = new Date();
    cit.markModified('quarterlyAssessments');
    await cit.save();

    return res.status(200).json({
      success: true,
      message: `CIT Q${quarter} deferred to annual filing`,
      data: {
        profileId: profile.profileId || profile._id,
        deferredQuarter: quarter,
        ...formatQuarterly(cit, year)
      }
    });
  } catch (error) {
    console.error('[CIT] deferQuarter error:', error);
    return res.status(500).json({ success: false, message: 'Error deferring quarterly CIT' });
  }
};

module.exports = {
  getAnnual,
  upsertAnnual,
  fileAnnual,
  listCitWhtCredits,
  createCitWhtCredit,
  updateCitWhtCredit,
  deleteCitWhtCredit,
  getQuarterly,
  payQuarter,
  deferQuarter,
  // Shared helpers for company-info
  computeCitEstimate,
  buildQuarterlyInstallments,
  // Back-compat aliases
  getCitRecords: getAnnual,
  getQuarterlyAssessments: getQuarterly,
  payQuarterlyInstallment: payQuarter,
  deferQuarterlyInstallment: deferQuarter,
  submitCitReturn: fileAnnual
};
