/**
 * VAT Controller
 * Handles the monthly VAT return wizard (Output VAT → Input VAT → Adjustments → Review → Submit)
 */
const VATReturn = require('../models/VATReturn');

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const VAT_RATE = 0.075; // 7.5%

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

/** Build the "Review & Submit" breakdown for a VAT return. */
function buildVatReview(record) {
  const outputVat = record.outputVat || 0;
  const allowableInputVat = record.allowableInputVat || 0;
  const wvatCredit = record.wvatCredit || 0;
  const broughtForwardCredit = record.broughtForwardCredit || 0;

  const net = outputVat - allowableInputVat - wvatCredit - broughtForwardCredit;
  const isCredit = net < 0;

  return {
    outputVatCollected: outputVat,
    lessAllowableInputVat: allowableInputVat,
    lessWvatCredit: wvatCredit,
    lessBroughtForwardCredit: broughtForwardCredit,
    netVatPayable: record.netVatPayable || 0,
    netVatCredit: record.vatCreditCarryForward || 0,
    // Convenience for the UI: signed net + label
    net,
    position: isCredit ? 'credit' : 'payable',
    message: isCredit
      ? `VAT Credit of ₦${(record.vatCreditCarryForward || 0).toLocaleString()} accumulated. This will roll over to offset next month's tax.`
      : `Net VAT of ₦${(record.netVatPayable || 0).toLocaleString()} is payable for this month.`
  };
}

/** Serialize a VAT return for API responses. */
function formatVatReturn(record, monthNum, year) {
  return {
    month: monthNum,
    monthName: MONTH_NAMES[monthNum - 1],
    year,
    vatRate: VAT_RATE,
    currentStep: record.currentStep || 1,
    outputSection: {
      standardSales: record.standardSales || 0,
      outputVat: record.outputVat || 0,
      exemptZeroRatedSales: record.exemptZeroRatedSales || 0,
      wvatCredit: record.wvatCredit || 0
    },
    inputSection: {
      inputVatInventory: record.inputVatInventory || 0,   // allowable
      inputVatOverheads: record.inputVatOverheads || 0,   // non-allowable
      inputVatCapex: record.inputVatCapex || 0,           // non-allowable
      allowableInputVat: record.allowableInputVat || 0
    },
    adjustments: {
      broughtForwardCredit: record.broughtForwardCredit || 0
    },
    documents: {
      salesScheduleDocId: record.salesScheduleDocId || null,
      purchaseInvoicesDocId: record.purchaseInvoicesDocId || null
    },
    review: buildVatReview(record),
    status: record.status,
    confirmed: record.confirmed || false,
    filedAt: record.filedAt || null,
    filingId: record.filingId || null
  };
}

// Numeric fields the wizard can save (any subset, per step)
const NUMERIC_FIELDS = [
  'standardSales', 'exemptZeroRatedSales', 'wvatCredit',
  'inputVatInventory', 'inputVatOverheads', 'inputVatCapex',
  'broughtForwardCredit'
];

/**
 * Upsert a monthly VAT return (partial save — send only the fields for the
 * current wizard step). Recomputes output/allowable/net on every save.
 * PUT /api/taxableprofile/business/:profileId/vat/:month
 */
const upsertMonthlyVat = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const monthNum = parseMonth(req.params.month);
    if (!monthNum) {
      return res.status(400).json({ success: false, message: 'Invalid month. Use 1-12 or a month name.' });
    }
    const year = profile.year;

    // Validate any provided numeric fields
    for (const field of NUMERIC_FIELDS) {
      if (req.body[field] !== undefined) {
        const value = Number(req.body[field]);
        if (!Number.isFinite(value) || value < 0) {
          return res.status(400).json({ success: false, message: `${field} must be a non-negative number` });
        }
      }
    }

    let record = await VATReturn.findOne({ profileId: profile._id, year, month: monthNum });
    if (!record) {
      record = new VATReturn({ profileId: profile._id, year, month: monthNum });
    }

    if (record.status === 'filed') {
      return res.status(400).json({ success: false, message: `${MONTH_NAMES[monthNum - 1]} VAT return has already been filed` });
    }

    // Apply only the fields that were provided (partial merge)
    for (const field of NUMERIC_FIELDS) {
      if (req.body[field] !== undefined) record[field] = Number(req.body[field]);
    }
    if (req.body.salesScheduleDocId !== undefined) record.salesScheduleDocId = req.body.salesScheduleDocId;
    if (req.body.purchaseInvoicesDocId !== undefined) record.purchaseInvoicesDocId = req.body.purchaseInvoicesDocId;
    if (req.body.currentStep !== undefined) {
      const step = parseInt(req.body.currentStep, 10);
      if (step >= 1 && step <= 5) record.currentStep = step;
    }

    record.status = 'draft';
    await record.save();

    return res.status(200).json({
      success: true,
      message: `VAT return saved for ${MONTH_NAMES[monthNum - 1]}`,
      data: formatVatReturn(record, monthNum, year)
    });
  } catch (error) {
    console.error('[VAT] upsertMonthlyVat error:', error);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Duplicate VAT record for this month' });
    }
    return res.status(500).json({ success: false, message: 'Error saving VAT return', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

/**
 * Get a single month's VAT return (prefill the wizard).
 * GET /api/taxableprofile/business/:profileId/vat/:month
 */
const getVatReturnByMonth = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const monthNum = parseMonth(req.params.month);
    if (!monthNum) {
      return res.status(400).json({ success: false, message: 'Invalid month. Use 1-12 or a month name.' });
    }
    const year = parseInt(req.query.year, 10) || profile.year;

    let record = await VATReturn.findOne({ profileId: profile._id, year, month: monthNum });
    if (!record) {
      // Return an empty, unsaved shape so the wizard can render fresh
      record = new VATReturn({ profileId: profile._id, year, month: monthNum });
    }

    return res.status(200).json({
      success: true,
      message: `VAT return for ${MONTH_NAMES[monthNum - 1]} retrieved`,
      data: formatVatReturn(record, monthNum, year)
    });
  } catch (error) {
    console.error('[VAT] getVatReturnByMonth error:', error);
    return res.status(500).json({ success: false, message: 'Error retrieving VAT return' });
  }
};

/**
 * Get all VAT records for the profile year (12-month overview).
 * GET /api/taxableprofile/business/:profileId/vat
 */
const getVatRecords = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const year = parseInt(req.query.year) || profile.year;

    const records = await VATReturn.find({ profileId: profile._id, year }).sort({ month: 1 }).lean();

    const months = [];
    for (let m = 1; m <= 12; m++) {
      const rec = records.find(r => r.month === m);
      months.push({
        month: m,
        monthName: MONTH_NAMES[m - 1],
        standardSales: rec ? rec.standardSales : 0,
        outputVat: rec ? rec.outputVat : 0,
        allowableInputVat: rec ? rec.allowableInputVat : 0,
        netVatPayable: rec ? rec.netVatPayable : 0,
        vatCreditCarryForward: rec ? rec.vatCreditCarryForward : 0,
        status: rec ? rec.status : 'pending',
        filedAt: rec ? rec.filedAt : null
      });
    }

    const filed = records.filter(r => r.status === 'filed').length;

    return res.status(200).json({
      success: true,
      message: 'VAT records retrieved',
      data: {
        profileId: profile._id,
        year,
        months,
        annualSummary: {
          totalOutputVat: records.reduce((s, r) => s + (r.outputVat || 0), 0),
          totalAllowableInputVat: records.reduce((s, r) => s + (r.allowableInputVat || 0), 0),
          totalNetVatPayable: records.reduce((s, r) => s + (r.netVatPayable || 0), 0),
          totalVatCredit: records.reduce((s, r) => s + (r.vatCreditCarryForward || 0), 0),
          monthsFiled: filed,
          monthsPending: 12 - filed
        }
      }
    });
  } catch (error) {
    console.error('[VAT] getVatRecords error:', error);
    return res.status(500).json({ success: false, message: 'Error retrieving VAT records' });
  }
};

/**
 * Submit (file) a monthly VAT return. Requires the accuracy confirmation.
 * POST /api/taxableprofile/business/:profileId/vat/:month/verify
 */
const verifyVatReturn = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const monthNum = parseMonth(req.params.month);
    if (!monthNum) {
      return res.status(400).json({ success: false, message: 'Invalid month' });
    }
    const year = profile.year;

    const record = await VATReturn.findOne({ profileId: profile._id, year, month: monthNum });
    if (!record) {
      return res.status(404).json({ success: false, message: `No VAT return found for ${MONTH_NAMES[monthNum - 1]} ${year}. Save the return first.` });
    }

    if (record.status === 'filed') {
      return res.status(400).json({
        success: false,
        message: `${MONTH_NAMES[monthNum - 1]} VAT return has already been filed`,
        data: formatVatReturn(record, monthNum, year)
      });
    }

    // Require the "I confirm these records are accurate" checkbox
    const confirmed = req.body.confirmed === true || req.body.confirmed === 'true';
    if (!confirmed) {
      return res.status(400).json({ success: false, message: 'You must confirm the records are accurate under the Nigeria Tax Act before filing' });
    }

    record.confirmed = true;
    record.status = 'filed';
    record.filedAt = new Date();
    record.filingId = `vat_${year}_${String(monthNum).padStart(2, '0')}_${Date.now()}`;
    record.currentStep = 5;
    await record.save();

    return res.status(200).json({
      success: true,
      message: `VAT return filed for ${MONTH_NAMES[monthNum - 1]}`,
      data: formatVatReturn(record, monthNum, year)
    });
  } catch (error) {
    console.error('[VAT] verifyVatReturn error:', error);
    return res.status(500).json({ success: false, message: 'Error filing VAT return' });
  }
};

module.exports = {
  upsertMonthlyVat,
  getVatReturnByMonth,
  getVatRecords,
  verifyVatReturn
};
