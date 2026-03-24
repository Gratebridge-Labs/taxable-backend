const Deduction = require('../models/Deduction');
const TaxableProfile = require('../models/TaxableProfile');

function simplifyDeduction(deduction) {
  return {
    _id: deduction._id,
    type: deduction.deductionType,
    value: deduction.amount,
    frequency: deduction.frequency,
    month: deduction.month,
    documentUrl: deduction.documentUrl || null,
    metadata: deduction.metadata || {},
    year: deduction.period?.year || null,
    createdAt: deduction.createdAt,
    updatedAt: deduction.updatedAt
  };
}

/** Resolve profileId string to TaxableProfile belonging to user; returns profile or null */
async function getProfileForUser(profileIdStr, userId) {
  if (!profileIdStr || !userId) return null;
  return TaxableProfile.findOne({ profileId: profileIdStr, user: userId }).select('_id profileId year').lean();
}

const createDeduction = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { profileId: profileIdStr, year, type, value, frequency, documentUrl, month, metadata } = req.body;
    if (!profileIdStr || !year || !type || value === undefined || !frequency) {
      return res.status(400).json({
        success: false,
        message: 'profileId, year, type, value and frequency are required'
      });
    }

    const profile = await getProfileForUser(profileIdStr, userId);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Tax profile not found' });
    }

    const validTypes = ['rent_relief', 'pension', 'mortgage', 'insurance'];
    const validFrequencies = ['annual', 'monthly'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, message: `type must be one of: ${validTypes.join(', ')}` });
    }
    if (!validFrequencies.includes(frequency)) {
      return res.status(400).json({ success: false, message: 'frequency must be annual or monthly' });
    }
    if (month !== undefined && month !== null && (month < 1 || month > 12)) {
      return res.status(400).json({ success: false, message: 'month must be between 1 and 12 when provided' });
    }

    const deduction = new Deduction({
      profileId: profile._id,
      deductionType: type,
      amount: value,
      frequency,
      month: month ?? null,
      documentUrl: documentUrl || null,
      metadata: metadata || {},
      period: {
        year: Number(year),
        startDate: new Date(Number(year), 0, 1),
        endDate: new Date(Number(year), 11, 31)
      }
    });
    await deduction.save();

    return res.status(201).json({
      success: true,
      message: 'Deduction saved',
      data: simplifyDeduction(deduction)
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

const createDeductions = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { profileId: profileIdStr, year, deductions } = req.body;
    
    if (!profileIdStr || !year || !deductions || !Array.isArray(deductions)) {
      return res.status(400).json({
        success: false,
        message: 'profileId, year, and deductions array are required'
      });
    }

    if (deductions.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'deductions array cannot be empty'
      });
    }

    const profile = await getProfileForUser(profileIdStr, userId);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Tax profile not found' });
    }

    const validDeductionTypes = ['rent_relief', 'pension', 'mortgage', 'insurance'];
    const validFrequencies = ['annual', 'monthly'];
    
    // Validate all deductions before processing
    for (const deduction of deductions) {
      if (!deduction.type) {
        return res.status(400).json({
          success: false,
          message: 'Each deduction must have a type'
        });
      }
      
      if (!validDeductionTypes.includes(deduction.type)) {
        return res.status(400).json({
          success: false,
          message: `Invalid deduction type: ${deduction.type}. Must be one of: ${validDeductionTypes.join(', ')}`
        });
      }

      if (!deduction.frequency || !validFrequencies.includes(deduction.frequency)) {
        return res.status(400).json({
          success: false,
          message: `Invalid frequency: ${deduction.frequency}. Must be "annual" or "monthly"`
        });
      }

      if (deduction.month !== undefined && deduction.month !== null && (deduction.month < 1 || deduction.month > 12)) {
        return res.status(400).json({
          success: false,
          message: 'month must be between 1 and 12 when provided'
        });
      }

      if (deduction.value === undefined || deduction.value === null) {
        return res.status(400).json({
          success: false,
          message: 'Each deduction must have a value'
        });
      }
    }

    await Deduction.deleteMany({
      profileId: profile._id,
      'period.year': Number(year)
    });

    const createdDeductions = await Promise.all(
      deductions.map(async (deductionData) => {
        const { type, value, frequency, month, documentUrl, metadata } = deductionData;

        const payload = {
          profileId: profile._id,
          deductionType: type,
          period: {
            year: Number(year),
            startDate: new Date(Number(year), 0, 1),
            endDate: new Date(Number(year), 11, 31)
          },
          amount: value,
          frequency,
          month: month ?? null,
          documentUrl: documentUrl || null,
          metadata: metadata || {}
        };

        const deduction = new Deduction(payload);
        await deduction.save();
        return deduction;
      })
    );
    const simplifiedDeductions = createdDeductions.map(simplifyDeduction);

    return res.status(200).json({
      success: true,
      data: simplifiedDeductions,
      count: simplifiedDeductions.length
    });
  } catch (err) {
    console.error('[Deduction] list error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to list deductions' });
  }
};

const listDeductions = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { profileId: profileIdStr, year } = req.query;
    if (!profileIdStr || !year) {
      return res.status(400).json({
        success: false,
        message: 'profileId and year are required'
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

    const simplifiedDeductions = list.map(simplifyDeduction);
    return res.status(200).json({
      success: true,
      data: simplifiedDeductions,
      count: simplifiedDeductions.length
    });
  } catch (err) {
    console.error('[Deduction] list error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to list deductions' });
  }
};

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

    // Simplify the response
    const simplifiedDeduction = simplifyDeduction(deduction);

    return res.status(200).json({ success: true, data: simplifiedDeduction });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid deduction id' });
    }
    console.error('[Deduction] get error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to get deduction' });
  }
};

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

    const { type, value, frequency, month, documentUrl, metadata } = req.body;
    const validDeductionTypes = ['rent_relief', 'pension', 'mortgage', 'insurance'];
    const validFrequencies = ['annual', 'monthly'];

    if (type !== undefined) {
      if (!validDeductionTypes.includes(type)) {
        return res.status(400).json({ success: false, message: `type must be one of: ${validDeductionTypes.join(', ')}` });
      }
      deduction.deductionType = type;
    }

    if (value !== undefined) deduction.amount = value;
    if (frequency !== undefined) {
      if (!validFrequencies.includes(frequency)) {
        return res.status(400).json({ success: false, message: 'frequency must be annual or monthly' });
      }
      deduction.frequency = frequency;
    }
    if (month !== undefined) {
      if (month !== null && (month < 1 || month > 12)) {
        return res.status(400).json({ success: false, message: 'month must be between 1 and 12 when provided' });
      }
      deduction.month = month;
    }
    if (documentUrl !== undefined) deduction.documentUrl = documentUrl;
    if (metadata !== undefined) deduction.metadata = metadata;

    await deduction.save();

    return res.status(200).json({
      success: true,
      message: 'Deduction updated',
      data: simplifyDeduction(deduction)
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

module.exports = {
  createDeduction,
  createDeductions,
  listDeductions,
  getDeductionById,
  updateDeduction,
  deleteDeduction,
  getProfileForUser
};
