/**
 * WHT Controller
 * Deductions (remittances):
 *   GET/POST/PUT/DELETE /wht/deductions[+/:id]  ·  POST /wht/file
 * Credits (WHT suffered — CIT offset):
 *   GET/POST/PUT/DELETE /wht/credits[+/:id]
 */
const WHTDeduction = require('../models/WHTDeduction');
const WHTCredit = require('../models/WHTCredit');
const { WHT_TYPES, WHT_RATES } = WHTDeduction;
const { WHT_CREDIT_TYPES, WHT_CREDIT_RATES } = WHTCredit;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const WHT_CATEGORIES = [
  { value: 'consultancy', label: 'Consultancy / Professional Fees', defaultRate: 5 },
  { value: 'contracts', label: 'Contracts / Supply of Goods', defaultRate: 5 },
  { value: 'transport', label: 'Transport', defaultRate: 5 },
  { value: 'rent', label: 'Rent', defaultRate: 10 },
  { value: 'director_fees', label: "Director's Fees", defaultRate: 10 }
];

function parseMonth(value) {
  if (value === undefined || value === null || value === '') return null;
  let n = parseInt(value, 10);
  if (isNaN(n)) {
    const idx = MONTH_NAMES.findIndex(m => m.toLowerCase() === String(value).toLowerCase());
    if (idx === -1) return null;
    n = idx + 1;
  }
  return n >= 1 && n <= 12 ? n : null;
}

function resolveYear(req, profile) {
  const fromQuery = parseInt(req.query?.year, 10);
  const fromBody = parseInt(req.body?.year, 10);
  if (Number.isFinite(fromQuery)) return fromQuery;
  if (Number.isFinite(fromBody)) return fromBody;
  return profile.year;
}

function publicProfileId(profile) {
  return profile.profileId || String(profile._id);
}

function toDateOnly(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function computeAmounts(gross, rate) {
  const whtDeducted = Math.round(Number(gross) * (Number(rate) / 100));
  return {
    whtDeducted,
    netPaid: Math.max(0, Number(gross) - whtDeducted)
  };
}

function formatDeduction(doc) {
  return {
    id: String(doc._id),
    payee: doc.payee,
    tin: doc.tin || null,
    whtType: doc.whtType,
    gross: doc.gross || 0,
    whtRate: doc.whtRate,
    whtDeducted: doc.whtDeducted || 0,
    netPaid: doc.netPaid || 0,
    date: toDateOnly(doc.date),
    receiptUrl: doc.receiptUrl || null,
    createdAt: doc.createdAt || null
  };
}

function monthStatus(deductions) {
  if (!deductions.length) return 'draft';
  return deductions.every(d => d.status === 'filed') ? 'filed' : 'draft';
}

async function isMonthFiled(profileId, year, month) {
  const filed = await WHTDeduction.exists({ profileId, year, month, status: 'filed' });
  return !!filed;
}

/**
 * List available WHT deduction + credit types with default rates.
 * GET /api/taxableprofile/business/:profileId/wht/categories
 */
const getWhtCategories = async (req, res) => {
  const creditCategories = WHT_CREDIT_TYPES.map(value => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
    defaultRate: WHT_CREDIT_RATES[value]
  }));

  return res.status(200).json({
    success: true,
    data: {
      categories: WHT_CATEGORIES,
      rateOptions: WHT_RATES,
      whtTypes: WHT_TYPES,
      creditCategories,
      creditTypes: WHT_CREDIT_TYPES,
      creditRates: WHT_CREDIT_RATES
    }
  });
};

/**
 * List WHT deductions for a month.
 * GET /api/taxableprofile/business/:profileId/wht/deductions?year=&month=
 */
const listWhtDeductions = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const year = resolveYear(req, profile);
    const month = parseMonth(req.query.month);

    if (!month) {
      return res.status(400).json({
        success: false,
        message: 'month query param is required (1-12)'
      });
    }

    const deductions = await WHTDeduction.find({ profileId: profile._id, year, month })
      .sort({ date: -1, createdAt: -1 })
      .lean();

    const totalWhtToRemit = deductions.reduce((s, d) => s + (d.whtDeducted || 0), 0);

    return res.status(200).json({
      success: true,
      message: `WHT deductions for ${MONTH_NAMES[month - 1]} ${year}`,
      data: {
        profileId: publicProfileId(profile),
        year,
        month,
        monthName: MONTH_NAMES[month - 1],
        status: monthStatus(deductions),
        deductions: deductions.map(formatDeduction),
        summary: {
          totalDeductions: deductions.length,
          totalWhtToRemit
        }
      }
    });
  } catch (error) {
    console.error('[WHT] listWhtDeductions error:', error);
    return res.status(500).json({ success: false, message: 'Error retrieving WHT deductions' });
  }
};

/**
 * Add a WHT deduction.
 * POST /api/taxableprofile/business/:profileId/wht/deductions
 */
const addWhtDeduction = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const {
      payee,
      tin,
      whtType,
      gross,
      whtRate,
      date,
      receiptUrl,
      // back-compat aliases
      payeeName,
      vendorName,
      payeeTin,
      paymentCategory,
      grossAmount,
      transactionDate,
      documentId
    } = req.body;

    const name = payee || payeeName || vendorName;
    const category = whtType || paymentCategory;
    const vendorTin = tin ?? payeeTin;
    const grossValue = gross ?? grossAmount;
    const dateValue = date || transactionDate;
    const receipt = receiptUrl || documentId;

    if (!name) {
      return res.status(400).json({ success: false, message: 'payee is required' });
    }
    if (!category || !WHT_TYPES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `whtType must be one of: ${WHT_TYPES.join(', ')}`
      });
    }
    if (typeof grossValue !== 'number' || !(grossValue > 0)) {
      return res.status(400).json({ success: false, message: 'gross must be a positive number' });
    }
    if (!WHT_RATES.includes(Number(whtRate))) {
      return res.status(400).json({ success: false, message: 'whtRate must be 5 or 10' });
    }
    if (vendorTin && !/^[0-9]{10,14}$/.test(String(vendorTin))) {
      return res.status(400).json({ success: false, message: 'TIN must be 10-14 digits' });
    }

    let month = parseMonth(req.body.month);
    if (!month && dateValue) month = new Date(dateValue).getMonth() + 1;
    if (!month) {
      return res.status(400).json({ success: false, message: 'A valid month (1-12) is required' });
    }

    const year = resolveYear(req, profile);

    if (await isMonthFiled(profile._id, year, month)) {
      return res.status(400).json({
        success: false,
        message: `Cannot add deductions — ${MONTH_NAMES[month - 1]} ${year} has already been filed`
      });
    }

    const rate = Number(whtRate);
    const amounts = computeAmounts(grossValue, rate);

    const deduction = await WHTDeduction.create({
      profileId: profile._id,
      payee: name,
      tin: vendorTin || undefined,
      whtType: category,
      gross: grossValue,
      whtRate: rate,
      whtDeducted: amounts.whtDeducted,
      netPaid: amounts.netPaid,
      date: dateValue ? new Date(dateValue) : undefined,
      receiptUrl: receipt || undefined,
      month,
      year,
      status: 'draft'
    });

    return res.status(201).json({
      success: true,
      message: `WHT deduction added for ${MONTH_NAMES[month - 1]}`,
      data: formatDeduction(deduction)
    });
  } catch (error) {
    console.error('[WHT] addWhtDeduction error:', error);
    return res.status(500).json({ success: false, message: 'Error adding WHT deduction' });
  }
};

/**
 * Update a WHT deduction (draft months only).
 * PUT /api/taxableprofile/business/:profileId/wht/deductions/:deductionId
 */
const updateWhtDeduction = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const { deductionId } = req.params;

    const deduction = await WHTDeduction.findOne({ _id: deductionId, profileId: profile._id });
    if (!deduction) {
      return res.status(404).json({ success: false, message: 'WHT deduction not found' });
    }
    if (deduction.status === 'filed') {
      return res.status(400).json({ success: false, message: 'Cannot update a filed WHT deduction' });
    }

    const b = req.body;
    if (b.payee !== undefined || b.payeeName !== undefined || b.vendorName !== undefined) {
      deduction.payee = b.payee ?? b.payeeName ?? b.vendorName;
    }
    if (b.tin !== undefined || b.payeeTin !== undefined) {
      const t = b.tin ?? b.payeeTin;
      if (t && !/^[0-9]{10,14}$/.test(String(t))) {
        return res.status(400).json({ success: false, message: 'TIN must be 10-14 digits' });
      }
      deduction.tin = t || undefined;
    }
    if (b.whtType !== undefined || b.paymentCategory !== undefined) {
      const category = b.whtType ?? b.paymentCategory;
      if (!WHT_TYPES.includes(category)) {
        return res.status(400).json({
          success: false,
          message: `whtType must be one of: ${WHT_TYPES.join(', ')}`
        });
      }
      deduction.whtType = category;
    }
    if (b.date !== undefined || b.transactionDate !== undefined) {
      const dateValue = b.date ?? b.transactionDate;
      deduction.date = dateValue ? new Date(dateValue) : undefined;
    }
    if (b.receiptUrl !== undefined || b.documentId !== undefined) {
      deduction.receiptUrl = b.receiptUrl ?? b.documentId ?? undefined;
    }
    if (b.gross !== undefined || b.grossAmount !== undefined) {
      const g = Number(b.gross ?? b.grossAmount);
      if (!(g > 0)) {
        return res.status(400).json({ success: false, message: 'gross must be a positive number' });
      }
      deduction.gross = g;
    }
    if (b.whtRate !== undefined) {
      if (!WHT_RATES.includes(Number(b.whtRate))) {
        return res.status(400).json({ success: false, message: 'whtRate must be 5 or 10' });
      }
      deduction.whtRate = Number(b.whtRate);
    }

    const amounts = computeAmounts(deduction.gross, deduction.whtRate);
    deduction.whtDeducted = amounts.whtDeducted;
    deduction.netPaid = amounts.netPaid;

    await deduction.save();

    return res.status(200).json({
      success: true,
      message: 'WHT deduction updated',
      data: formatDeduction(deduction)
    });
  } catch (error) {
    console.error('[WHT] updateWhtDeduction error:', error);
    return res.status(500).json({ success: false, message: 'Error updating WHT deduction' });
  }
};

/**
 * Delete a WHT deduction (draft only).
 * DELETE /api/taxableprofile/business/:profileId/wht/deductions/:deductionId
 */
const deleteWhtDeduction = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const { deductionId } = req.params;

    const deduction = await WHTDeduction.findOne({ _id: deductionId, profileId: profile._id });
    if (!deduction) {
      return res.status(404).json({ success: false, message: 'WHT deduction not found' });
    }
    if (deduction.status === 'filed') {
      return res.status(400).json({ success: false, message: 'Cannot delete a filed WHT deduction' });
    }

    await WHTDeduction.deleteOne({ _id: deductionId });

    return res.status(200).json({ success: true, message: 'WHT deduction deleted' });
  } catch (error) {
    console.error('[WHT] deleteWhtDeduction error:', error);
    return res.status(500).json({ success: false, message: 'Error deleting WHT deduction' });
  }
};

/**
 * Mark a month's WHT remittance as filed.
 * POST /api/taxableprofile/business/:profileId/wht/file
 * Body: { year?, month }
 */
const fileWhtMonth = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const month = parseMonth(req.body.month);
    const year = resolveYear(req, profile);

    if (!month) {
      return res.status(400).json({ success: false, message: 'A valid month (1-12) is required' });
    }

    const deductions = await WHTDeduction.find({ profileId: profile._id, year, month });

    if (deductions.length === 0) {
      return res.status(400).json({
        success: false,
        message: `No WHT deductions found for ${MONTH_NAMES[month - 1]} ${year}`
      });
    }

    if (deductions.every(d => d.status === 'filed')) {
      return res.status(400).json({
        success: false,
        message: `${MONTH_NAMES[month - 1]} ${year} WHT remittance has already been filed`
      });
    }

    const now = new Date();
    let totalWhtToRemit = 0;
    for (const d of deductions) {
      d.status = 'filed';
      d.filedAt = now;
      await d.save();
      totalWhtToRemit += d.whtDeducted || 0;
    }

    return res.status(200).json({
      success: true,
      message: `WHT remittance filed for ${MONTH_NAMES[month - 1]} ${year}`,
      data: {
        profileId: publicProfileId(profile),
        year,
        month,
        monthName: MONTH_NAMES[month - 1],
        status: 'filed',
        totalDeductions: deductions.length,
        totalWhtToRemit,
        filedAt: now.toISOString()
      }
    });
  } catch (error) {
    console.error('[WHT] fileWhtMonth error:', error);
    return res.status(500).json({ success: false, message: 'Error filing WHT remittance' });
  }
};

function formatCredit(doc) {
  return {
    id: String(doc._id),
    payee: doc.payee,
    tin: doc.tin || null,
    whtType: doc.whtType,
    gross: doc.gross || 0,
    whtRate: doc.whtRate,
    whtAmount: doc.whtAmount || 0,
    date: toDateOnly(doc.date),
    receiptUrl: doc.receiptUrl || null,
    month: doc.month,
    year: doc.year,
    createdAt: doc.createdAt || null
  };
}

function resolveCreditRate(whtType, explicitRate) {
  if (typeof explicitRate === 'number' && explicitRate >= 0) return explicitRate;
  if (WHT_CREDIT_RATES[whtType] != null) return WHT_CREDIT_RATES[whtType];
  return null;
}

/**
 * List WHT credits (WHT suffered). Monthly or annual.
 * GET /api/taxableprofile/business/:profileId/wht/credits?year=&month=
 */
const listWhtCredits = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const year = resolveYear(req, profile);
    const month = parseMonth(req.query.month);

    const filter = { profileId: profile._id, year };
    if (month) filter.month = month;

    const credits = await WHTCredit.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .lean();

    const totalWhtAmount = credits.reduce((s, c) => s + (c.whtAmount || 0), 0);

    const data = {
      profileId: publicProfileId(profile),
      year,
      credits: credits.map(formatCredit),
      summary: {
        totalCredits: credits.length,
        totalWhtAmount
      }
    };
    if (month) {
      data.month = month;
      data.monthName = MONTH_NAMES[month - 1];
    }

    return res.status(200).json({
      success: true,
      message: month
        ? `WHT credits for ${MONTH_NAMES[month - 1]} ${year}`
        : `WHT credits for ${year}`,
      data
    });
  } catch (error) {
    console.error('[WHT] listWhtCredits error:', error);
    return res.status(500).json({ success: false, message: 'Error retrieving WHT credits' });
  }
};

/**
 * Add a WHT credit (WHT suffered by the business — CIT offset).
 * POST /api/taxableprofile/business/:profileId/wht/credits
 * Rate is derived from whtType unless whtRate is supplied.
 */
const addWhtCredit = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const {
      payee,
      tin,
      whtType,
      gross,
      whtRate,
      date,
      receiptUrl,
      // back-compat aliases
      clientName,
      clientTin,
      paymentCategory,
      grossAmount,
      dateIssued,
      documentId
    } = req.body;

    const name = payee || clientName;
    const category = whtType || paymentCategory;
    const partyTin = tin ?? clientTin;
    const grossValue = gross ?? grossAmount;
    const dateValue = date || dateIssued;
    const receipt = receiptUrl || documentId;

    if (!name) {
      return res.status(400).json({ success: false, message: 'payee is required' });
    }
    if (!category || !WHT_CREDIT_TYPES.includes(category)) {
      return res.status(400).json({
        success: false,
        message: `whtType must be one of: ${WHT_CREDIT_TYPES.join(', ')}`
      });
    }
    if (typeof grossValue !== 'number' || !(grossValue > 0)) {
      return res.status(400).json({ success: false, message: 'gross must be a positive number' });
    }
    if (partyTin && !/^[0-9]{10,14}$/.test(String(partyTin))) {
      return res.status(400).json({ success: false, message: 'TIN must be 10-14 digits' });
    }

    let month = parseMonth(req.body.month);
    if (!month && dateValue) month = new Date(dateValue).getMonth() + 1;
    if (!month) {
      return res.status(400).json({ success: false, message: 'A valid month (1-12) is required' });
    }

    const year = resolveYear(req, profile);
    const rate = resolveCreditRate(category, whtRate);
    if (rate == null) {
      return res.status(400).json({ success: false, message: 'Could not resolve whtRate for this whtType' });
    }

    const amounts = computeAmounts(grossValue, rate);

    const credit = await WHTCredit.create({
      profileId: profile._id,
      payee: name,
      tin: partyTin || undefined,
      whtType: category,
      gross: grossValue,
      whtRate: rate,
      whtAmount: amounts.whtDeducted,
      date: dateValue ? new Date(dateValue) : undefined,
      receiptUrl: receipt || undefined,
      month,
      year,
      status: 'active'
    });

    return res.status(201).json({
      success: true,
      message: `WHT credit added for ${MONTH_NAMES[month - 1]}`,
      data: formatCredit(credit)
    });
  } catch (error) {
    console.error('[WHT] addWhtCredit error:', error);
    return res.status(500).json({ success: false, message: 'Error adding WHT credit' });
  }
};

/**
 * Update a WHT credit.
 * PUT /api/taxableprofile/business/:profileId/wht/credits/:creditId
 */
const updateWhtCredit = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const { creditId } = req.params;

    const credit = await WHTCredit.findOne({ _id: creditId, profileId: profile._id });
    if (!credit) {
      return res.status(404).json({ success: false, message: 'WHT credit not found' });
    }

    const b = req.body;
    if (b.payee !== undefined || b.clientName !== undefined) {
      credit.payee = b.payee ?? b.clientName;
    }
    if (b.tin !== undefined || b.clientTin !== undefined) {
      const t = b.tin ?? b.clientTin;
      if (t && !/^[0-9]{10,14}$/.test(String(t))) {
        return res.status(400).json({ success: false, message: 'TIN must be 10-14 digits' });
      }
      credit.tin = t || undefined;
    }
    if (b.whtType !== undefined || b.paymentCategory !== undefined) {
      const category = b.whtType ?? b.paymentCategory;
      if (!WHT_CREDIT_TYPES.includes(category)) {
        return res.status(400).json({
          success: false,
          message: `whtType must be one of: ${WHT_CREDIT_TYPES.join(', ')}`
        });
      }
      credit.whtType = category;
      // Re-derive rate from type unless an explicit rate is also being set
      if (b.whtRate === undefined) {
        credit.whtRate = WHT_CREDIT_RATES[category];
      }
    }
    if (b.whtRate !== undefined) {
      const rate = Number(b.whtRate);
      if (!(rate >= 0) || rate > 100) {
        return res.status(400).json({ success: false, message: 'whtRate must be between 0 and 100' });
      }
      credit.whtRate = rate;
    }
    if (b.gross !== undefined || b.grossAmount !== undefined) {
      const g = Number(b.gross ?? b.grossAmount);
      if (!(g > 0)) {
        return res.status(400).json({ success: false, message: 'gross must be a positive number' });
      }
      credit.gross = g;
    }
    if (b.date !== undefined || b.dateIssued !== undefined) {
      const dateValue = b.date ?? b.dateIssued;
      credit.date = dateValue ? new Date(dateValue) : undefined;
    }
    if (b.receiptUrl !== undefined || b.documentId !== undefined) {
      credit.receiptUrl = b.receiptUrl ?? b.documentId ?? undefined;
    }
    const month = parseMonth(b.month);
    if (month) credit.month = month;
    if (b.year !== undefined) {
      const y = parseInt(b.year, 10);
      if (Number.isFinite(y)) credit.year = y;
    }

    const amounts = computeAmounts(credit.gross, credit.whtRate);
    credit.whtAmount = amounts.whtDeducted;

    await credit.save();

    return res.status(200).json({
      success: true,
      message: 'WHT credit updated',
      data: formatCredit(credit)
    });
  } catch (error) {
    console.error('[WHT] updateWhtCredit error:', error);
    return res.status(500).json({ success: false, message: 'Error updating WHT credit' });
  }
};

/**
 * Delete a WHT credit.
 * DELETE /api/taxableprofile/business/:profileId/wht/credits/:creditId
 */
const deleteWhtCredit = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const { creditId } = req.params;

    const credit = await WHTCredit.findOne({ _id: creditId, profileId: profile._id });
    if (!credit) {
      return res.status(404).json({ success: false, message: 'WHT credit not found' });
    }

    await WHTCredit.deleteOne({ _id: creditId });

    return res.status(200).json({ success: true, message: 'WHT credit deleted' });
  } catch (error) {
    console.error('[WHT] deleteWhtCredit error:', error);
    return res.status(500).json({ success: false, message: 'Error deleting WHT credit' });
  }
};

module.exports = {
  getWhtCategories,
  listWhtDeductions,
  addWhtDeduction,
  updateWhtDeduction,
  deleteWhtDeduction,
  fileWhtMonth,
  listWhtCredits,
  addWhtCredit,
  updateWhtCredit,
  deleteWhtCredit,
  // Back-compat aliases
  getWhtByMonth: listWhtDeductions,
  getWhtRecords: listWhtDeductions,
  remitWht: fileWhtMonth
};
