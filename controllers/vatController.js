/**
 * VAT Controller
 * Month-scoped VAT returns matching the frontend contract:
 *   GET    /vat?year=                    → list months
 *   GET    /vat?year=&month=             → get one month
 *   PUT    /vat                          → upsert (year/month in body)
 *   POST   /vat/file                     → file month
 *   DELETE /vat?year=&month=             → delete draft month
 */
const VATReturn = require('../models/VATReturn');

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const VAT_RATE = VATReturn.VAT_RATE || 0.075;

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
  const fromQuery = parseInt(req.query.year, 10);
  const fromBody = parseInt(req.body?.year, 10);
  if (Number.isFinite(fromQuery)) return fromQuery;
  if (Number.isFinite(fromBody)) return fromBody;
  return profile.year;
}

/** Prior calendar month for a given year/month. */
function priorMonth(year, month) {
  if (month === 1) return { year: year - 1, month: 12 };
  return { year, month: month - 1 };
}

/**
 * Suggest brought-forward credit from the prior month when that month is filed
 * and ended in a credit (netPosition < 0).
 */
async function suggestBroughtForward(profileId, year, month) {
  const prev = priorMonth(year, month);
  const prior = await VATReturn.findOne({
    profileId,
    year: prev.year,
    month: prev.month,
    status: 'filed'
  }).lean();

  if (!prior) return 0;
  if ((prior.netPosition || 0) < 0) return Math.abs(prior.netPosition);
  return prior.vatCreditCarryForward || 0;
}

function formatFiling(record) {
  const net = record.netPosition || 0;
  return {
    id: record._id,
    year: record.year,
    month: record.month,
    monthName: MONTH_NAMES[record.month - 1],
    status: record.status || 'draft',
    filed: record.status === 'filed',
    standardSales: record.standardSales || 0,
    exemptSales: record.exemptSales || 0,
    wvatCredit: record.wvatCredit || 0,
    allowableInputVAT: record.allowableInputVAT || 0,
    nonAllowableOverheads: record.nonAllowableOverheads || 0,
    nonAllowableCapEx: record.nonAllowableCapEx || 0,
    broughtForwardCredit: record.broughtForwardCredit || 0,
    salesScheduleUrl: record.salesScheduleUrl || null,
    purchaseInvoicesUrl: record.purchaseInvoicesUrl || null,
    disclaimerAccepted: !!record.disclaimerAccepted,
    computed: {
      outputVAT: record.outputVAT || 0,
      netPosition: net,
      isCredit: net < 0,
      vatCreditCarryForward: record.vatCreditCarryForward || 0
    },
    filedAt: record.filedAt || null,
    filingId: record.filingId || null,
    updatedAt: record.updatedAt || null,
    createdAt: record.createdAt || null
  };
}

const NUMERIC_FIELDS = [
  'standardSales',
  'exemptSales',
  'wvatCredit',
  'allowableInputVAT',
  'nonAllowableOverheads',
  'nonAllowableCapEx',
  'broughtForwardCredit'
];

/**
 * GET /vat
 * - no month → 12-month list
 * - ?month=   → single month filing (with BF credit suggestion when empty)
 */
const getVat = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const year = resolveYear(req, profile);
    const month = parseMonth(req.query.month);

    // Single month
    if (month) {
      let record = await VATReturn.findOne({ profileId: profile._id, year, month });
      const suggestedBf = await suggestBroughtForward(profile._id, year, month);

      if (!record) {
        // Empty draft shape for a new month, with auto-suggested BF credit
        const empty = {
          _id: null,
          year,
          month,
          status: 'draft',
          standardSales: 0,
          exemptSales: 0,
          wvatCredit: 0,
          allowableInputVAT: 0,
          nonAllowableOverheads: 0,
          nonAllowableCapEx: 0,
          broughtForwardCredit: suggestedBf,
          salesScheduleUrl: null,
          purchaseInvoicesUrl: null,
          disclaimerAccepted: false,
          outputVAT: 0,
          netPosition: -suggestedBf,
          vatCreditCarryForward: suggestedBf,
          filedAt: null,
          filingId: null,
          updatedAt: null,
          createdAt: null
        };

        return res.status(200).json({
          success: true,
          message: `VAT return for ${MONTH_NAMES[month - 1]} ${year} (new)`,
          data: {
            filing: formatFiling(empty),
            suggestedBroughtForwardCredit: suggestedBf
          }
        });
      }

      return res.status(200).json({
        success: true,
        message: `VAT return for ${MONTH_NAMES[month - 1]} ${year} retrieved`,
        data: {
          filing: formatFiling(record),
          suggestedBroughtForwardCredit: suggestedBf
        }
      });
    }

    // 12-month overview
    const records = await VATReturn.find({ profileId: profile._id, year }).sort({ month: 1 }).lean();
    const months = [];
    for (let m = 1; m <= 12; m++) {
      const rec = records.find(r => r.month === m);
      months.push({
        month: m,
        monthName: MONTH_NAMES[m - 1],
        status: rec ? rec.status : 'draft',
        filed: !!(rec && rec.status === 'filed'),
        summary: {
          outputVAT: rec ? (rec.outputVAT || 0) : 0,
          netPosition: rec ? (rec.netPosition || 0) : 0
        }
      });
    }

    return res.status(200).json({
      success: true,
      message: 'VAT months retrieved',
      data: {
        profileId: profile.profileId || profile._id,
        year,
        months
      }
    });
  } catch (error) {
    console.error('[VAT] getVat error:', error);
    return res.status(500).json({ success: false, message: 'Error retrieving VAT' });
  }
};

/**
 * PUT /vat
 * Upsert a month. year + month required in body. Partial merge OK.
 */
const upsertVat = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const year = resolveYear(req, profile);
    const month = parseMonth(req.body.month);

    if (!month) {
      return res.status(400).json({ success: false, message: 'month (1-12) is required' });
    }

    for (const field of NUMERIC_FIELDS) {
      if (req.body[field] !== undefined) {
        const value = Number(req.body[field]);
        if (!Number.isFinite(value) || value < 0) {
          return res.status(400).json({ success: false, message: `${field} must be a non-negative number` });
        }
      }
    }

    let record = await VATReturn.findOne({ profileId: profile._id, year, month });
    if (!record) {
      // Seed brought-forward from prior month if FE didn't send it
      const suggestedBf = await suggestBroughtForward(profile._id, year, month);
      record = new VATReturn({
        profileId: profile._id,
        year,
        month,
        broughtForwardCredit: suggestedBf
      });
    }

    if (record.status === 'filed') {
      return res.status(400).json({
        success: false,
        message: `${MONTH_NAMES[month - 1]} ${year} VAT return has already been filed`
      });
    }

    for (const field of NUMERIC_FIELDS) {
      if (req.body[field] !== undefined) record[field] = Number(req.body[field]);
    }
    if (req.body.salesScheduleUrl !== undefined) record.salesScheduleUrl = req.body.salesScheduleUrl || undefined;
    if (req.body.purchaseInvoicesUrl !== undefined) record.purchaseInvoicesUrl = req.body.purchaseInvoicesUrl || undefined;
    if (req.body.disclaimerAccepted !== undefined) {
      record.disclaimerAccepted = req.body.disclaimerAccepted === true || req.body.disclaimerAccepted === 'true';
    }

    record.status = 'draft';
    await record.save();

    return res.status(200).json({
      success: true,
      message: `VAT return saved for ${MONTH_NAMES[month - 1]} ${year}`,
      data: { filing: formatFiling(record) }
    });
  } catch (error) {
    console.error('[VAT] upsertVat error:', error);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Duplicate VAT record for this month' });
    }
    return res.status(500).json({
      success: false,
      message: 'Error saving VAT return',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * POST /vat/file
 * Mark a month as filed. Requires year + month in body.
 * Disclaimer must already be accepted (or sent as disclaimerAccepted: true).
 */
const fileVat = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const year = resolveYear(req, profile);
    const month = parseMonth(req.body.month);

    if (!month) {
      return res.status(400).json({ success: false, message: 'month (1-12) is required' });
    }

    const record = await VATReturn.findOne({ profileId: profile._id, year, month });
    if (!record) {
      return res.status(404).json({
        success: false,
        message: `No VAT return found for ${MONTH_NAMES[month - 1]} ${year}. Save the return first.`
      });
    }

    if (record.status === 'filed') {
      return res.status(400).json({
        success: false,
        message: `${MONTH_NAMES[month - 1]} ${year} VAT return has already been filed`,
        data: { filing: formatFiling(record) }
      });
    }

    const accept =
      req.body.disclaimerAccepted === true ||
      req.body.disclaimerAccepted === 'true' ||
      record.disclaimerAccepted === true;

    if (!accept) {
      return res.status(400).json({
        success: false,
        message: 'disclaimerAccepted must be true before filing'
      });
    }

    record.disclaimerAccepted = true;
    record.status = 'filed';
    record.filedAt = new Date();
    record.filingId = `vat_${year}_${String(month).padStart(2, '0')}_${Date.now()}`;
    await record.save();

    return res.status(200).json({
      success: true,
      message: `VAT return filed for ${MONTH_NAMES[month - 1]} ${year}`,
      data: {
        filing: {
          id: record._id,
          year: record.year,
          month: record.month,
          monthName: MONTH_NAMES[month - 1],
          status: 'filed',
          filed: true,
          filedAt: record.filedAt,
          filingId: record.filingId,
          computed: {
            outputVAT: record.outputVAT || 0,
            netPosition: record.netPosition || 0,
            isCredit: (record.netPosition || 0) < 0
          }
        }
      }
    });
  } catch (error) {
    console.error('[VAT] fileVat error:', error);
    return res.status(500).json({ success: false, message: 'Error filing VAT return' });
  }
};

/**
 * DELETE /vat?year=&month=
 * Deletes a draft month only (filed months are blocked).
 */
const deleteVat = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const year = resolveYear(req, profile);
    const month = parseMonth(req.query.month ?? req.body?.month);

    if (!month) {
      return res.status(400).json({ success: false, message: 'month (1-12) is required' });
    }

    const record = await VATReturn.findOne({ profileId: profile._id, year, month });
    if (!record) {
      return res.status(404).json({
        success: false,
        message: `No VAT return found for ${MONTH_NAMES[month - 1]} ${year}`
      });
    }

    if (record.status === 'filed') {
      return res.status(400).json({
        success: false,
        message: `Cannot delete a filed VAT return for ${MONTH_NAMES[month - 1]} ${year}`
      });
    }

    await VATReturn.deleteOne({ _id: record._id });

    return res.status(200).json({
      success: true,
      message: `VAT return for ${MONTH_NAMES[month - 1]} ${year} deleted`,
      data: { year, month, deleted: true }
    });
  } catch (error) {
    console.error('[VAT] deleteVat error:', error);
    return res.status(500).json({ success: false, message: 'Error deleting VAT return' });
  }
};

module.exports = {
  getVat,
  upsertVat,
  fileVat,
  deleteVat,
  // Back-compat aliases (if anything else still imports old names)
  getVatRecords: getVat,
  getVatReturnByMonth: getVat,
  upsertMonthlyVat: upsertVat,
  verifyVatReturn: fileVat
};
