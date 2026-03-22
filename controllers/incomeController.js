const IncomeSource = require('../models/IncomeSource');
const TaxableProfile = require('../models/TaxableProfile');
const { validationResult } = require('express-validator');

/**
 * List all income records for a profile
 * GET /taxableprofile/web/:profileId/income
 */
const listIncome = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;
    const { year, month, incomeType, category } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Find profile (user must own it)
    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    // Build query
    const query = { profileId: profile._id };
    
    if (year) {
      query['period.year'] = parseInt(year, 10);
    }
    
    if (month) {
      query['period.month'] = parseInt(month, 10);
    }
    
    if (incomeType) {
      query.incomeType = incomeType;
    }
    
    if (category) {
      query.category = category;
    }

    const incomeRecords = await IncomeSource.find(query)
      .sort({ 'period.year': -1, 'period.month': -1, createdAt: -1 })
      .lean();

    // Calculate totals
    const totalAmount = incomeRecords.reduce((sum, record) => sum + (record.totalAmount || 0), 0);
    const totalNetAmount = incomeRecords.reduce((sum, record) => sum + (record.netAmount || 0), 0);

    res.status(200).json({
      success: true,
      data: {
        incomeRecords,
        summary: {
          totalRecords: incomeRecords.length,
          totalAmount,
          totalNetAmount,
          averageAmount: incomeRecords.length > 0 ? totalAmount / incomeRecords.length : 0
        },
        profile: {
          profileId: profile.profileId,
          year: profile.year,
          profileType: profile.profileType
        }
      }
    });
  } catch (error) {
    console.error('List income error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving income records',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Add income record
 * POST /taxableprofile/web/:profileId/income
 * Body: { type, category, amount, month, year, ...incomeDetails }
 */
const addIncome = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.user?.userId;
    const { profileId } = req.params;
    const {
      type,
      category,
      amount,
      month,
      year,
      description,
      // Employment fields
      employerName,
      employerTIN,
      bonuses,
      commissions,
      // Freelance fields
      clientName,
      freelanceFees,
      royalties,
      // Crypto fields
      platformName,
      cryptoType,
      amountInNGN,
      // Other fields based on type
      ...otherFields
    } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Find profile (user must own it)
    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    // Validate year matches profile year if provided
    if (year && year !== profile.year) {
      return res.status(400).json({
        success: false,
        message: `Income year (${year}) must match profile year (${profile.year})`
      });
    }

    // Build income record based on type
    const incomeData = {
      profileId: profile._id,
      incomeType: type,
      category: category || 'salary',
      period: {
        year: year || profile.year,
        month: month || null
      },
      totalAmount: amount || 0
    };

    // Add type-specific details
    switch (type) {
      case 'employment':
        incomeData.employment = {
          employerName: employerName || otherFields.employerName,
          employerTIN: employerTIN || otherFields.employerTIN,
          annualGrossSalary: amount || 0,
          bonuses: bonuses || 0,
          commissions: commissions || 0,
          ...otherFields
        };
        break;
      
      case 'freelance':
        incomeData.freelance = {
          clientName: clientName || otherFields.clientName,
          freelanceFees: freelanceFees || amount || 0,
          royalties: royalties || 0,
          description: description || otherFields.description,
          ...otherFields
        };
        break;
      
      case 'crypto':
        incomeData.crypto = {
          platformName: platformName || otherFields.platformName,
          cryptoType: cryptoType || otherFields.cryptoType,
          amountInNGN: amountInNGN || amount || 0,
          description: description || otherFields.description,
          ...otherFields
        };
        break;
      
      case 'business':
        incomeData.business = {
          businessName: otherFields.businessName,
          annualRevenue: amount || 0,
          ...otherFields
        };
        break;
      
      case 'rental':
        incomeData.rental = {
          properties: [{
            annualRentalIncome: amount || 0,
            ...otherFields
          }]
        };
        break;
      
      case 'investment':
        incomeData.investment = {
          incomeItems: [{
            incomeType: category || 'other',
            amount: amount || 0,
            ...otherFields
          }]
        };
        break;
      
      case 'other':
        incomeData.other = {
          description: description || otherFields.description,
          amount: amount || 0,
          ...otherFields
        };
        break;
    }

    const incomeRecord = await IncomeSource.create(incomeData);

    res.status(201).json({
      success: true,
      message: 'Income record added successfully',
      data: {
        incomeRecord: {
          id: incomeRecord._id,
          incomeType: incomeRecord.incomeType,
          category: incomeRecord.category,
          amount: incomeRecord.totalAmount,
          netAmount: incomeRecord.netAmount,
          period: incomeRecord.period,
          createdAt: incomeRecord.createdAt
        }
      }
    });
  } catch (error) {
    console.error('Add income error:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'An income record already exists with similar details'
      });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({
      success: false,
      message: 'An error occurred while adding income record',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update income record
 * PUT /taxableprofile/web/:profileId/income/:incomeId
 */
const updateIncome = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.user?.userId;
    const { profileId, incomeId } = req.params;
    const updateData = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Find profile (user must own it)
    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    // Find income record (must belong to profile)
    const incomeRecord = await IncomeSource.findOne({
      _id: incomeId,
      profileId: profile._id
    });

    if (!incomeRecord) {
      return res.status(404).json({
        success: false,
        message: 'Income record not found'
      });
    }

    // Update fields
    Object.keys(updateData).forEach(key => {
      if (key !== '_id' && key !== 'profileId' && key !== 'createdAt') {
        // Handle nested updates for type-specific fields
        if (key.startsWith('employment.')) {
          const field = key.replace('employment.', '');
          if (!incomeRecord.employment) incomeRecord.employment = {};
          incomeRecord.employment[field] = updateData[key];
        } else if (key.startsWith('freelance.')) {
          const field = key.replace('freelance.', '');
          if (!incomeRecord.freelance) incomeRecord.freelance = {};
          incomeRecord.freelance[field] = updateData[key];
        } else if (key.startsWith('crypto.')) {
          const field = key.replace('crypto.', '');
          if (!incomeRecord.crypto) incomeRecord.crypto = {};
          incomeRecord.crypto[field] = updateData[key];
        } else if (key.startsWith('business.')) {
          const field = key.replace('business.', '');
          if (!incomeRecord.business) incomeRecord.business = {};
          incomeRecord.business[field] = updateData[key];
        } else if (key.startsWith('rental.')) {
          const field = key.replace('rental.', '');
          if (!incomeRecord.rental) incomeRecord.rental = {};
          incomeRecord.rental[field] = updateData[key];
        } else if (key.startsWith('investment.')) {
          const field = key.replace('investment.', '');
          if (!incomeRecord.investment) incomeRecord.investment = {};
          incomeRecord.investment[field] = updateData[key];
        } else if (key.startsWith('other.')) {
          const field = key.replace('other.', '');
          if (!incomeRecord.other) incomeRecord.other = {};
          incomeRecord.other[field] = updateData[key];
        } else if (key.startsWith('period.')) {
          const field = key.replace('period.', '');
          if (!incomeRecord.period) incomeRecord.period = {};
          incomeRecord.period[field] = updateData[key];
        } else {
          incomeRecord[key] = updateData[key];
        }
      }
    });

    await incomeRecord.save();

    res.status(200).json({
      success: true,
      message: 'Income record updated successfully',
      data: {
        incomeRecord: {
          id: incomeRecord._id,
          incomeType: incomeRecord.incomeType,
          category: incomeRecord.category,
          amount: incomeRecord.totalAmount,
          netAmount: incomeRecord.netAmount,
          period: incomeRecord.period,
          updatedAt: incomeRecord.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Update income error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({
      success: false,
      message: 'An error occurred while updating income record',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete income record
 * DELETE /taxableprofile/web/:profileId/income/:incomeId
 */
const deleteIncome = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId, incomeId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Find profile (user must own it)
    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    // Find and delete income record (must belong to profile)
    const incomeRecord = await IncomeSource.findOneAndDelete({
      _id: incomeId,
      profileId: profile._id
    });

    if (!incomeRecord) {
      return res.status(404).json({
        success: false,
        message: 'Income record not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Income record deleted successfully',
      data: {
        deletedRecord: {
          id: incomeRecord._id,
          incomeType: incomeRecord.incomeType,
          amount: incomeRecord.totalAmount,
          period: incomeRecord.period
        }
      }
    });
  } catch (error) {
    console.error('Delete income error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while deleting income record',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get income summary for a profile
 * GET /taxableprofile/web/:profileId/income/summary
 */
const getIncomeSummary = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Find profile (user must own it)
    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    // Get all income records for the profile
    const incomeRecords = await IncomeSource.find({ profileId: profile._id }).lean();

    // Calculate summary by income type
    const summaryByType = {};
    let totalAmount = 0;
    let totalNetAmount = 0;

    incomeRecords.forEach(record => {
      const type = record.incomeType;
      if (!summaryByType[type]) {
        summaryByType[type] = {
          count: 0,
          totalAmount: 0,
          totalNetAmount: 0
        };
      }
      
      summaryByType[type].count++;
      summaryByType[type].totalAmount += record.totalAmount || 0;
      summaryByType[type].totalNetAmount += record.netAmount || 0;
      
      totalAmount += record.totalAmount || 0;
      totalNetAmount += record.netAmount || 0;
    });

    // Calculate monthly breakdown if monthly data exists
    const monthlyBreakdown = {};
    incomeRecords.forEach(record => {
      if (record.period?.month && record.period?.year) {
        const key = `${record.period.year}-${String(record.period.month).padStart(2, '0')}`;
        if (!monthlyBreakdown[key]) {
          monthlyBreakdown[key] = {
            month: record.period.month,
            year: record.period.year,
            totalAmount: 0,
            count: 0
          };
        }
        monthlyBreakdown[key].totalAmount += record.totalAmount || 0;
        monthlyBreakdown[key].count++;
      }
    });

    res.status(200).json({
      success: true,
      data: {
        profile: {
          profileId: profile.profileId,
          year: profile.year,
          profileType: profile.profileType
        },
        summary: {
          totalRecords: incomeRecords.length,
          totalAmount,
          totalNetAmount,
          averageAmount: incomeRecords.length > 0 ? totalAmount / incomeRecords.length : 0,
          byType: summaryByType
        },
        monthlyBreakdown: Object.values(monthlyBreakdown).sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year;
          return b.month - a.month;
        })
      }
    });
  } catch (error) {
    console.error('Get income summary error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving income summary',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  listIncome,
  addIncome,
  updateIncome,
  deleteIncome,
  getIncomeSummary
};