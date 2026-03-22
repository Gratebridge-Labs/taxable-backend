/**
 * VAT Controller
 * Handles monthly VAT return filings and retrieval
 */
const VATReturn = require('../models/VATReturn');

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/**
 * Upsert monthly VAT return
 * PUT /api/taxableprofile/business/:profileId/vat/:month
 */
const upsertMonthlyVat = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const monthParam = req.params.month;

    let monthNum = parseInt(monthParam, 10);
    if (isNaN(monthNum)) {
      const idx = MONTH_NAMES.findIndex(m => m.toLowerCase() === String(monthParam).toLowerCase());
      if (idx === -1) return res.status(400).json({ success: false, message: 'Invalid month. Use 1-12 or month name.' });
      monthNum = idx + 1;
    }
    if (monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ success: false, message: 'Month must be between 1 and 12' });
    }

    const { totalSales, zeroRatedSales, exemptSales, totalPurchases } = req.body;

    if (typeof totalSales !== 'number' || totalSales < 0) {
      return res.status(400).json({ success: false, message: 'totalSales must be a non-negative number' });
    }
    if (typeof totalPurchases !== 'number' || totalPurchases < 0) {
      return res.status(400).json({ success: false, message: 'totalPurchases must be a non-negative number' });
    }

    const year = profile.year;

    let record = await VATReturn.findOne({ profileId: profile._id, year, month: monthNum });
    if (record) {
      record.totalSales = totalSales;
      record.zeroRatedSales = zeroRatedSales || 0;
      record.exemptSales = exemptSales || 0;
      record.totalPurchases = totalPurchases;
      record.status = 'draft';
      await record.save();
    } else {
      record = await VATReturn.create({
        profileId: profile._id,
        year,
        month: monthNum,
        totalSales,
        zeroRatedSales: zeroRatedSales || 0,
        exemptSales: exemptSales || 0,
        totalPurchases,
        status: 'draft'
      });
    }

    return res.status(200).json({
      success: true,
      message: `VAT return saved for ${MONTH_NAMES[monthNum - 1]}`,
      data: {
        profileId: profile._id,
        month: monthNum,
        monthName: MONTH_NAMES[monthNum - 1],
        year,
        totalSales: record.totalSales,
        zeroRatedSales: record.zeroRatedSales,
        exemptSales: record.exemptSales,
        taxableSales: record.taxableSales,
        totalPurchases: record.totalPurchases,
        outputVat: record.outputVat,
        inputVat: record.inputVat,
        netVatPayable: record.netVatPayable,
        status: record.status
      }
    });
  } catch (error) {
    console.error('[VAT] upsertMonthlyVat error:', error);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Duplicate VAT record for this month' });
    }
    return res.status(500).json({ success: false, message: 'Error saving VAT return' });
  }
};

/**
 * Get all VAT records for the profile year
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
        totalSales: rec ? rec.totalSales : 0,
        exemptSales: rec ? rec.exemptSales : 0,
        totalPurchases: rec ? rec.totalPurchases : 0,
        outputVat: rec ? rec.outputVat : 0,
        inputVat: rec ? rec.inputVat : 0,
        netVatPayable: rec ? rec.netVatPayable : 0,
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
          totalInputVat: records.reduce((s, r) => s + (r.inputVat || 0), 0),
          totalNetVat: records.reduce((s, r) => s + (r.netVatPayable || 0), 0),
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
 * Verify VAT return status for a specific month
 * POST /api/taxableprofile/business/:profileId/vat/:month/verify
 */
const verifyVatReturn = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const monthParam = req.params.month;

    let monthNum = parseInt(monthParam, 10);
    if (isNaN(monthNum)) {
      const idx = MONTH_NAMES.findIndex(m => m.toLowerCase() === String(monthParam).toLowerCase());
      if (idx === -1) return res.status(400).json({ success: false, message: 'Invalid month' });
      monthNum = idx + 1;
    }

    const year = profile.year;
    const record = await VATReturn.findOne({ profileId: profile._id, year, month: monthNum });

    if (!record) {
      return res.status(404).json({ success: false, message: `No VAT return found for ${MONTH_NAMES[monthNum - 1]} ${year}` });
    }

    // Mark as filed if still draft
    if (record.status === 'draft') {
      record.status = 'filed';
      record.filedAt = new Date();
      record.filingId = `vat_${year}_${String(monthNum).padStart(2, '0')}_${Date.now()}`;
      await record.save();
    }

    return res.status(200).json({
      success: true,
      message: 'VAT return verification status',
      data: {
        month: monthNum,
        monthName: MONTH_NAMES[monthNum - 1],
        year,
        status: record.status,
        filingId: record.filingId || null,
        filedAt: record.filedAt || null,
        netVatPayable: record.netVatPayable
      }
    });
  } catch (error) {
    console.error('[VAT] verifyVatReturn error:', error);
    return res.status(500).json({ success: false, message: 'Error verifying VAT return' });
  }
};

module.exports = {
  upsertMonthlyVat,
  getVatRecords,
  verifyVatReturn
};
