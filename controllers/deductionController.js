/**
 * Deduction (reliefs) API – create, list, update, delete (PDF: Add reliefs & upload documents).
 */

const Deduction = require('../models/Deduction');
const TaxableProfile = require('../models/TaxableProfile');

/** Resolve profileId string to TaxableProfile belonging to user; returns profile or null */
async function getProfileForUser(profileIdStr, userId) {
  if (!profileIdStr || !userId) return null;
  return TaxableProfile.findOne({ profileId: profileIdStr, user: userId }).select('_id profileId year').lean();
}

/**
 * POST /api/deductions
 * Body: profileId (string), year, deductionType, + type-specific (nhf, nhis, pension, life_insurance, mortgage_interest, rent_relief, transport_allowance, other)
 */
const createDeduction = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { profileId: profileIdStr, year, deductionType, ...rest } = req.body;
    if (!profileIdStr || !year || !deductionType) {
      return res.status(400).json({
        success: false,
        message: 'profileId, year, and deductionType are required'
      });
    }

    const profile = await getProfileForUser(profileIdStr, userId);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Tax profile not found' });
    }

    const period = {
      year: Number(year),
      startDate: new Date(year, 0, 1),
      endDate: new Date(year, 11, 31)
    };

    const payload = {
      profileId: profile._id,
      deductionType,
      period,
      amount: 0,
      ...rest
    };

    const deduction = new Deduction(payload);
    await deduction.save();

    return res.status(201).json({
      success: true,
      message: 'Deduction saved',
      data: deduction
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: err.message || 'Validation failed',
        errors: err.errors ? Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message])) : undefined
      });
    }
    console.error('[Deduction] create error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to create deduction' });
  }
};

/**
 * GET /api/deductions?profileId=xxx&year=2025
 */
const listDeductions = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { profileId: profileIdStr, year } = req.query;
    if (!profileIdStr || !year) {
      return res.status(400).json({
        success: false,
        message: 'Query params profileId and year are required'
      });
    }

    const profile = await getProfileForUser(profileIdStr, userId);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Tax profile not found' });
    }

    const list = await Deduction.find({
      profileId: profile._id,
      'period.year': Number(year)
    }).sort({ createdAt: -1 }).lean();

    return res.status(200).json({
      success: true,
      data: list,
      count: list.length
    });
  } catch (err) {
    console.error('[Deduction] list error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to list deductions' });
  }
};

/**
 * GET /api/deductions/:id
 */
const getDeductionById = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const deduction = await Deduction.findById(req.params.id).populate('profileId', 'profileId user').lean();
    if (!deduction) {
      return res.status(404).json({ success: false, message: 'Deduction not found' });
    }
    if (deduction.profileId?.user?.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    return res.status(200).json({ success: true, data: deduction });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid deduction id' });
    }
    console.error('[Deduction] get error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to get deduction' });
  }
};

/**
 * PUT /api/deductions/:id
 * Body: any updatable fields (deductionType, amount, type-specific, period, etc.)
 */
const updateDeduction = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const deduction = await Deduction.findById(req.params.id).populate('profileId', 'user');
    if (!deduction) {
      return res.status(404).json({ success: false, message: 'Deduction not found' });
    }
    if (deduction.profileId?.user?.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const allowed = ['deductionType', 'amount', 'period', 'nhf', 'nhis', 'pension', 'lifeInsurance', 'mortgageInterest', 'rentRelief', 'transportAllowance', 'other', 'isValid', 'validationMessage'];
    for (const key of Object.keys(req.body)) {
      if (allowed.includes(key)) deduction.set(key, req.body[key]);
    }
    await deduction.save();

    return res.status(200).json({
      success: true,
      message: 'Deduction updated',
      data: deduction
    });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid deduction id' });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: err.message || 'Validation failed',
        errors: err.errors ? Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message])) : undefined
      });
    }
    console.error('[Deduction] update error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to update deduction' });
  }
};

/**
 * DELETE /api/deductions/:id
 */
const deleteDeduction = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const deduction = await Deduction.findById(req.params.id).populate('profileId', 'user');
    if (!deduction) {
      return res.status(404).json({ success: false, message: 'Deduction not found' });
    }
    if (deduction.profileId?.user?.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    await Deduction.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      success: true,
      message: 'Deduction removed'
    });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid deduction id' });
    }
    console.error('[Deduction] delete error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to delete deduction' });
  }
};

/**
 * Verify a deduction (admin endpoint)
 * POST /api/deductions/:id/verify
 * Body: { status: 'verified' | 'rejected', notes: string, documentId: ObjectId }
 */
const verifyDeduction = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { id } = req.params;
    const { status, notes, documentId } = req.body;

    // Check if user is admin (you might want to add admin check middleware)
    // For now, we'll allow any authenticated user to verify
    // In production, add: const isAdmin = req.user?.role === 'admin';

    if (!status || !['verified', 'rejected'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Status is required and must be "verified" or "rejected"'
      });
    }

    const deduction = await Deduction.findById(id);
    if (!deduction) {
      return res.status(404).json({ success: false, message: 'Deduction not found' });
    }

    // Update verification status
    deduction.verificationStatus = status;
    deduction.verificationNotes = notes || deduction.verificationNotes;
    deduction.documentId = documentId || deduction.documentId;
    deduction.verifiedBy = userId; // In production, this should be admin ID
    deduction.verifiedAt = new Date();

    await deduction.save();

    res.status(200).json({
      success: true,
      message: `Deduction ${status} successfully`,
      data: {
        deduction: {
          id: deduction._id,
          deductionType: deduction.deductionType,
          amount: deduction.amount,
          verificationStatus: deduction.verificationStatus,
          verificationNotes: deduction.verificationNotes,
          verifiedBy: deduction.verifiedBy,
          verifiedAt: deduction.verifiedAt,
          documentId: deduction.documentId
        }
      }
    });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid deduction id' });
    }
    console.error('[Deduction] verify error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to verify deduction' });
  }
};

/**
 * GET /api/deductions/:profileId?year=2025
 * Alternative endpoint using path parameter for profileId
 * If year is not provided, returns deductions for all years for that profile
 */
const listDeductionsByProfileId = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { profileId: profileIdStr } = req.params;
    const { year } = req.query;
    
    if (!profileIdStr) {
      return res.status(400).json({
        success: false,
        message: 'Profile ID is required in path parameter'
      });
    }

    const profile = await getProfileForUser(profileIdStr, userId);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Tax profile not found' });
    }

    // Build query
    const query = { profileId: profile._id };
    if (year) {
      query['period.year'] = Number(year);
    }

    const list = await Deduction.find(query).sort({ 'period.year': -1, createdAt: -1 }).lean();

    // Group by year for better organization
    const deductionsByYear = {};
    list.forEach(deduction => {
      const year = deduction.period?.year || 'unknown';
      if (!deductionsByYear[year]) {
        deductionsByYear[year] = [];
      }
      deductionsByYear[year].push(deduction);
    });

    return res.status(200).json({
      success: true,
      data: {
        profileId: profile.profileId,
        profileYear: profile.year,
        deductions: list,
        deductionsByYear,
        count: list.length,
        yearFilter: year ? Number(year) : 'all'
      }
    });
  } catch (err) {
    console.error('[Deduction] list by profileId error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to list deductions' });
  }
};

module.exports = {
  createDeduction,
  listDeductions,
  listDeductionsByProfileId,
  getDeductionById,
  updateDeduction,
  deleteDeduction,
  verifyDeduction,
  getProfileForUser
};
