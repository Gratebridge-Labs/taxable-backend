/**
 * WHT Controller
 * Handles Withholding Tax deductions (remitting) and credits (receiving)
 */
const WHTDeduction = require('../models/WHTDeduction');
const WHTCredit = require('../models/WHTCredit');

/**
 * Add WHT deduction (business withholds from vendor)
 * POST /api/taxableprofile/business/:profileId/wht/deductions
 */
const addWhtDeduction = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const { payeeName, payeeTin, transactionDate, whtType, grossAmount, whtRate, whtDeducted, netPaid } = req.body;

    if (!payeeName) return res.status(400).json({ success: false, message: 'payeeName is required' });
    if (!transactionDate) return res.status(400).json({ success: false, message: 'transactionDate is required' });
    if (!whtType) return res.status(400).json({ success: false, message: 'whtType is required' });
    if (typeof grossAmount !== 'number' || grossAmount < 0) return res.status(400).json({ success: false, message: 'grossAmount must be a non-negative number' });
    if (typeof whtRate !== 'number' || whtRate < 0) return res.status(400).json({ success: false, message: 'whtRate must be a non-negative number' });
    if (typeof whtDeducted !== 'number' || whtDeducted < 0) return res.status(400).json({ success: false, message: 'whtDeducted must be a non-negative number' });
    if (typeof netPaid !== 'number' || netPaid < 0) return res.status(400).json({ success: false, message: 'netPaid must be a non-negative number' });

    const deduction = await WHTDeduction.create({
      profileId: profile._id,
      payeeName,
      payeeTin: payeeTin || undefined,
      transactionDate: new Date(transactionDate),
      whtType,
      grossAmount,
      whtRate,
      whtDeducted,
      netPaid,
      year: profile.year,
      status: 'pending'
    });

    return res.status(201).json({
      success: true,
      message: 'WHT deduction added',
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

    const fields = ['payeeName', 'payeeTin', 'transactionDate', 'whtType', 'grossAmount', 'whtRate', 'whtDeducted', 'netPaid'];
    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        deduction[f] = f === 'transactionDate' ? new Date(req.body[f]) : req.body[f];
      }
    });

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
 * Remit WHT for a specific month
 * POST /api/taxableprofile/business/:profileId/wht/remit
 */
const remitWht = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const { month, year: reqYear } = req.body;
    const year = reqYear || profile.year;

    if (!month || month < 1 || month > 12) {
      return res.status(400).json({ success: false, message: 'month (1-12) is required' });
    }

    const deductions = await WHTDeduction.find({ profileId: profile._id, year, month, status: 'pending' });

    if (deductions.length === 0) {
      return res.status(400).json({ success: false, message: `No pending WHT deductions found for month ${month}` });
    }

    const now = new Date();
    let totalRemitted = 0;
    for (const d of deductions) {
      d.status = 'remitted';
      d.remittedAt = now;
      await d.save();
      totalRemitted += d.whtDeducted || 0;
    }

    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

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
  addWhtDeduction,
  updateWhtDeduction,
  deleteWhtDeduction,
  addWhtCredit,
  getWhtRecords,
  remitWht
};
