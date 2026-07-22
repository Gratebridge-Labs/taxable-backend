/**
 * WHT Controller
 * Handles Withholding Tax deductions (remitting) and credits (receiving)
 */
const WHTDeduction = require('../models/WHTDeduction');
const WHTCredit = require('../models/WHTCredit');

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/**
 * WHT payment categories with their default rate (%). The form exposes a 5%/10%
 * toggle; picking a category pre-selects the correct default which the user can
 * still override.
 */
const WHT_CATEGORIES = [
  { value: 'professional_services', label: 'Professional / Consultancy Fees', defaultRate: 10 },
  { value: 'management_services', label: 'Management Services', defaultRate: 10 },
  { value: 'technical_services', label: 'Technical Services', defaultRate: 10 },
  { value: 'rent', label: 'Rent', defaultRate: 10 },
  { value: 'dividends', label: 'Dividends', defaultRate: 10 },
  { value: 'interest', label: 'Interest', defaultRate: 10 },
  { value: 'royalties', label: 'Royalties', defaultRate: 10 },
  { value: 'commission', label: 'Commission', defaultRate: 10 },
  { value: 'directors_fees', label: "Directors' Fees", defaultRate: 10 },
  { value: 'contracts_supplies', label: 'Contracts / Supply of Goods', defaultRate: 5 },
  { value: 'construction', label: 'Construction', defaultRate: 5 },
  { value: 'other', label: 'Other', defaultRate: 5 }
];

/** Parse a month from a number (1-12) or a month name. Returns 1-12 or null. */
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

/** Look up the default rate for a payment category (falls back to 10%). */
function defaultRateForCategory(category) {
  const found = WHT_CATEGORIES.find(c => c.value === category || c.label === category);
  return found ? found.defaultRate : 10;
}

/**
 * List available WHT payment categories + default rates.
 * GET /api/taxableprofile/business/:profileId/wht/categories
 */
const getWhtCategories = async (req, res) => {
  return res.status(200).json({ success: true, data: { categories: WHT_CATEGORIES, rateOptions: [5, 10] } });
};

/**
 * Add a WHT deduction (business withholds from a vendor) — smart:
 * - month-scoped (PAYE/VAT-style)
 * - rate defaults from the payment category when not supplied
 * - amount to withhold + net paid are auto-computed (override allowed)
 * POST /api/taxableprofile/business/:profileId/wht/deductions
 */
const addWhtDeduction = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const {
      vendorName, payeeName, tin, payeeTin, paymentCategory, whtType,
      grossAmount, whtRate, whtDeducted, transactionDate, documentId
    } = req.body;

    const name = vendorName || payeeName;
    const category = paymentCategory || whtType;
    const vendorTin = tin || payeeTin;

    if (!name) return res.status(400).json({ success: false, message: 'vendorName is required' });
    if (!category) return res.status(400).json({ success: false, message: 'paymentCategory is required' });
    if (typeof grossAmount !== 'number' || grossAmount <= 0) {
      return res.status(400).json({ success: false, message: 'grossAmount must be a positive number' });
    }
    if (vendorTin && !/^[0-9]{10,14}$/.test(String(vendorTin))) {
      return res.status(400).json({ success: false, message: 'TIN must be 10-14 digits' });
    }

    // Month is required (WHT is managed per month); derive from transactionDate if given
    let month = parseMonth(req.body.month);
    if (!month && transactionDate) month = new Date(transactionDate).getMonth() + 1;
    if (!month) return res.status(400).json({ success: false, message: 'A valid month (1-12) is required' });

    // Smart rate + amount: default rate from category, auto-compute the withholding
    const rate = (typeof whtRate === 'number' && whtRate >= 0) ? whtRate : defaultRateForCategory(category);
    const computedWht = Math.round(grossAmount * (rate / 100));
    const finalWht = (typeof whtDeducted === 'number' && whtDeducted >= 0) ? Math.round(whtDeducted) : computedWht;
    const netPaid = Math.max(0, grossAmount - finalWht);

    const deduction = await WHTDeduction.create({
      profileId: profile._id,
      payeeName: name,
      payeeTin: vendorTin || undefined,
      transactionDate: transactionDate ? new Date(transactionDate) : undefined,
      whtType: category,
      grossAmount,
      whtRate: rate,
      whtDeducted: finalWht,
      netPaid,
      documentId: documentId || undefined,
      month,
      year: profile.year,
      status: 'pending'
    });

    return res.status(201).json({
      success: true,
      message: `WHT deduction added for ${MONTH_NAMES[month - 1]}`,
      data: deduction
    });
  } catch (error) {
    console.error('[WHT] addWhtDeduction error:', error);
    return res.status(500).json({ success: false, message: 'Error adding WHT deduction' });
  }
};

/**
 * Update WHT deduction
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
    if (deduction.status === 'remitted') {
      return res.status(400).json({ success: false, message: 'Cannot update a remitted WHT deduction' });
    }

    const b = req.body;
    if (b.vendorName !== undefined || b.payeeName !== undefined) deduction.payeeName = b.vendorName ?? b.payeeName;
    if (b.tin !== undefined || b.payeeTin !== undefined) {
      const t = b.tin ?? b.payeeTin;
      if (t && !/^[0-9]{10,14}$/.test(String(t))) {
        return res.status(400).json({ success: false, message: 'TIN must be 10-14 digits' });
      }
      deduction.payeeTin = t || undefined;
    }
    if (b.paymentCategory !== undefined || b.whtType !== undefined) deduction.whtType = b.paymentCategory ?? b.whtType;
    if (b.transactionDate !== undefined) deduction.transactionDate = new Date(b.transactionDate);
    if (b.documentId !== undefined) deduction.documentId = b.documentId;
    const month = parseMonth(b.month);
    if (month) deduction.month = month;
    if (b.grossAmount !== undefined) deduction.grossAmount = Number(b.grossAmount);
    if (b.whtRate !== undefined) deduction.whtRate = Number(b.whtRate);

    // Recompute the withholding + net unless an explicit override is provided
    if (b.whtDeducted !== undefined) {
      deduction.whtDeducted = Math.round(Number(b.whtDeducted));
    } else if (b.grossAmount !== undefined || b.whtRate !== undefined) {
      deduction.whtDeducted = Math.round((deduction.grossAmount || 0) * ((deduction.whtRate || 0) / 100));
    }
    deduction.netPaid = Math.max(0, (deduction.grossAmount || 0) - (deduction.whtDeducted || 0));

    await deduction.save();

    return res.status(200).json({
      success: true,
      message: 'WHT deduction updated',
      data: deduction
    });
  } catch (error) {
    console.error('[WHT] updateWhtDeduction error:', error);
    return res.status(500).json({ success: false, message: 'Error updating WHT deduction' });
  }
};

/**
 * Delete WHT deduction
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
    if (deduction.status === 'remitted') {
      return res.status(400).json({ success: false, message: 'Cannot delete a remitted WHT deduction' });
    }

    await WHTDeduction.deleteOne({ _id: deductionId });

    return res.status(200).json({ success: true, message: 'WHT deduction deleted' });
  } catch (error) {
    console.error('[WHT] deleteWhtDeduction error:', error);
    return res.status(500).json({ success: false, message: 'Error deleting WHT deduction' });
  }
};

/**
 * Add WHT credit note (client withholds from the business)
 * POST /api/taxableprofile/business/:profileId/wht/credits
 */
const addWhtCredit = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const { clientName, clientTin, creditNoteNumber, whtType, whtRate, grossAmount, whtAmount, dateIssued, documentId } = req.body;

    if (!clientName) return res.status(400).json({ success: false, message: 'clientName is required' });
    if (!creditNoteNumber) return res.status(400).json({ success: false, message: 'creditNoteNumber is required' });
    if (typeof grossAmount !== 'number' || grossAmount < 0) return res.status(400).json({ success: false, message: 'grossAmount must be a non-negative number' });
    if (typeof whtAmount !== 'number' || whtAmount < 0) return res.status(400).json({ success: false, message: 'whtAmount must be a non-negative number' });
    if (!dateIssued) return res.status(400).json({ success: false, message: 'dateIssued is required' });

    const credit = await WHTCredit.create({
      profileId: profile._id,
      clientName,
      clientTin: clientTin || undefined,
      creditNoteNumber,
      whtType: whtType || undefined,
      whtRate: whtRate || undefined,
      grossAmount,
      whtAmount,
      dateIssued: new Date(dateIssued),
      documentId: documentId || undefined,
      year: profile.year,
      status: 'active'
    });

    return res.status(201).json({
      success: true,
      message: 'WHT credit note added',
      data: credit
    });
  } catch (error) {
    console.error('[WHT] addWhtCredit error:', error);
    return res.status(500).json({ success: false, message: 'Error adding WHT credit note' });
  }
};

/**
 * Get all WHT records (deductions and credits)
 * GET /api/taxableprofile/business/:profileId/wht
 */
const getWhtRecords = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const year = parseInt(req.query.year) || profile.year;
    const type = req.query.type || 'all'; // 'deductions', 'credits', 'all'

    let deductions = [];
    let credits = [];

    if (type === 'all' || type === 'deductions') {
      deductions = await WHTDeduction.find({ profileId: profile._id, year }).sort({ transactionDate: -1 }).lean();
    }
    if (type === 'all' || type === 'credits') {
      credits = await WHTCredit.find({ profileId: profile._id, year }).sort({ dateIssued: -1 }).lean();
    }

    return res.status(200).json({
      success: true,
      message: 'WHT records retrieved',
      data: {
        profileId: profile._id,
        year,
        deductions,
        credits,
        summary: {
          totalWhtDeducted: deductions.reduce((s, d) => s + (d.whtDeducted || 0), 0),
          totalWhtCredits: credits.reduce((s, c) => s + (c.whtAmount || 0), 0),
          deductionCount: deductions.length,
          creditCount: credits.length
        }
      }
    });
  } catch (error) {
    console.error('[WHT] getWhtRecords error:', error);
    return res.status(500).json({ success: false, message: 'Error retrieving WHT records' });
  }
};

/**
 * Get WHT deductions for a specific month (roster + totals + remit status).
 * GET /api/taxableprofile/business/:profileId/wht/:month
 */
const getWhtByMonth = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const month = parseMonth(req.params.month);
    if (!month) {
      return res.status(400).json({ success: false, message: 'Invalid month. Use 1-12 or a month name.' });
    }
    const year = parseInt(req.query.year, 10) || profile.year;

    const deductions = await WHTDeduction.find({ profileId: profile._id, year, month }).sort({ createdAt: -1 }).lean();

    const totalGross = deductions.reduce((s, d) => s + (d.grossAmount || 0), 0);
    const totalWht = deductions.reduce((s, d) => s + (d.whtDeducted || 0), 0);
    const pending = deductions.filter(d => d.status === 'pending');
    const remitted = deductions.filter(d => d.status === 'remitted');

    return res.status(200).json({
      success: true,
      message: `WHT deductions for ${MONTH_NAMES[month - 1]} retrieved`,
      data: {
        profileId: profile._id,
        month,
        monthName: MONTH_NAMES[month - 1],
        year,
        deductions,
        summary: {
          count: deductions.length,
          totalGross,
          totalWhtToRemit: pending.reduce((s, d) => s + (d.whtDeducted || 0), 0),
          totalWhtRemitted: remitted.reduce((s, d) => s + (d.whtDeducted || 0), 0),
          totalWht,
          allRemitted: deductions.length > 0 && pending.length === 0,
          status: deductions.length === 0 ? 'not_started' : (pending.length === 0 ? 'remitted' : 'draft')
        }
      }
    });
  } catch (error) {
    console.error('[WHT] getWhtByMonth error:', error);
    return res.status(500).json({ success: false, message: 'Error retrieving WHT deductions' });
  }
};

/**
 * Remit WHT for a specific month
 * POST /api/taxableprofile/business/:profileId/wht/remit
 */
const remitWht = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const month = parseMonth(req.body.month);
    const year = req.body.year || profile.year;

    if (!month) {
      return res.status(400).json({ success: false, message: 'A valid month (1-12) is required' });
    }

    const deductions = await WHTDeduction.find({ profileId: profile._id, year, month, status: 'pending' });

    if (deductions.length === 0) {
      return res.status(400).json({ success: false, message: `No pending WHT deductions found for ${MONTH_NAMES[month - 1]}` });
    }

    const now = new Date();
    let totalRemitted = 0;
    for (const d of deductions) {
      d.status = 'remitted';
      d.remittedAt = now;
      await d.save();
      totalRemitted += d.whtDeducted || 0;
    }

    return res.status(200).json({
      success: true,
      message: `WHT remittance submitted for ${MONTH_NAMES[month - 1]} ${year}`,
      data: {
        month,
        year,
        totalDeductions: deductions.length,
        totalWhtRemitted: totalRemitted,
        status: 'submitted',
        submittedAt: now.toISOString()
      }
    });
  } catch (error) {
    console.error('[WHT] remitWht error:', error);
    return res.status(500).json({ success: false, message: 'Error remitting WHT' });
  }
};

module.exports = {
  getWhtCategories,
  addWhtDeduction,
  updateWhtDeduction,
  deleteWhtDeduction,
  addWhtCredit,
  getWhtRecords,
  getWhtByMonth,
  remitWht
};
