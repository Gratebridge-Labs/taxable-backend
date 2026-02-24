const TaxableProfile = require('../models/TaxableProfile');
const { validateYear, validateProfileType } = require('../utils/profileValidation');
const { validationResult } = require('express-validator');

/**
 * Create a new Taxable Profile
 * Requires: email verification, valid year, profile type
 */
const createProfile = async (req, res) => {
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
    const {
      year,
      profileType,
      nin,
      intent,
      primaryIncomeSources,
      residency183Days,
      paysRent,
      hasHealthInsurance,
      hasPension,
      paysMortgage
    } = req.body;

    // Convert year to number (express-validator should handle this, but ensure it's a number)
    const yearNum = typeof year === 'string' ? parseInt(year, 10) : year;

    // Validate year
    const yearValidation = validateYear(yearNum);
    if (!yearValidation.valid) {
      return res.status(400).json({
        success: false,
        message: yearValidation.message
      });
    }

    // Validate profile type
    const profileTypeValidation = validateProfileType(profileType);
    if (!profileTypeValidation.valid) {
      return res.status(400).json({
        success: false,
        message: profileTypeValidation.message
      });
    }

    // Check if profile already exists for this user, year, and profileType
    // Users can have both Individual and Business profiles for the same year
    const existingProfile = await TaxableProfile.findOne({
      user: userId,
      year: yearNum,
      profileType: profileType
    });

    if (existingProfile) {
      return res.status(409).json({
        success: false,
        message: `You already have a ${profileType} tax profile for the year ${yearNum}`
      });
    }

    // Build profile payload (basic data collected at creation)
    const profilePayload = {
      user: userId,
      author: userId,
      year: yearNum,
      profileType: profileType,
      status: 'draft'
    };
    if (nin) profilePayload.primaryNIN = nin.trim();
    if (intent) profilePayload.intent = intent;
    if (Array.isArray(primaryIncomeSources) && primaryIncomeSources.length > 0) profilePayload.primaryIncomeSources = primaryIncomeSources;
    if (typeof residency183Days === 'boolean') profilePayload.residency183Days = residency183Days;
    if (typeof paysRent === 'boolean') profilePayload.paysRent = paysRent;
    if (typeof hasHealthInsurance === 'boolean') profilePayload.hasHealthInsurance = hasHealthInsurance;
    if (typeof hasPension === 'boolean') profilePayload.hasPension = hasPension;
    if (typeof paysMortgage === 'boolean') profilePayload.paysMortgage = paysMortgage;

    const profile = await TaxableProfile.create(profilePayload);

    res.status(201).json({
      success: true,
      message: 'Tax profile created successfully',
      data: {
        profileId: profile.profileId,
        id: profile._id,
        year: profile.year,
        profileType: profile.profileType,
        intent: profile.intent,
        primaryNIN: profile.primaryNIN ? `${profile.primaryNIN.slice(0, 4)}*******` : undefined,
        primaryIncomeSources: profile.primaryIncomeSources,
        residency183Days: profile.residency183Days,
        paysRent: profile.paysRent,
        hasHealthInsurance: profile.hasHealthInsurance,
        hasPension: profile.hasPension,
        paysMortgage: profile.paysMortgage,
        status: profile.status,
        createdAt: profile.createdAt
      }
    });
  } catch (error) {
    console.error('Create profile error:', error);
    
    // Handle duplicate key error (shouldn't happen due to check, but just in case)
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'A profile already exists for this year'
      });
    }

    res.status(500).json({
      success: false,
      message: 'An error occurred while creating your tax profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get user's profiles
 * Returns all profiles for the authenticated user
 */
const getUserProfiles = async (req, res) => {
  try {
    const userId = req.user?.userId;

    const profiles = await TaxableProfile.find({ user: userId })
      .sort({ year: -1, createdAt: -1 })
      .select('-__v');

    res.status(200).json({
      success: true,
      message: 'Profiles retrieved successfully',
      data: {
        profiles: profiles,
        count: profiles.length
      }
    });
  } catch (error) {
    console.error('Get profiles error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving your profiles',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get a specific profile by ID (supports both MongoDB _id and custom profileId)
 */
const getProfileById = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;

    // Try to find by custom profileId first, then by MongoDB _id
    const profile = await TaxableProfile.findOne({
      $or: [
        { profileId: profileId, user: userId },
        { _id: profileId, user: userId }
      ]
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Profile retrieved successfully',
      data: {
        profile: profile
      }
    });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving the profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Submit tax information for review (user submits completed profile)
 */
const submitTaxInformation = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Find profile
    const profile = await TaxableProfile.findOne({
      $or: [
        { profileId: profileId, user: userId },
        { _id: profileId, user: userId }
      ]
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    // Check if base questions are answered
    if (!profile.baseQuestionsAnswered) {
      return res.status(400).json({
        success: false,
        message: 'Base questions must be answered before submitting'
      });
    }

    // Check if already submitted
    if (profile.submitted) {
      return res.status(400).json({
        success: false,
        message: 'Profile has already been submitted for review'
      });
    }

    // Mark as submitted
    profile.submitted = true;
    profile.submittedAt = Date.now();
    profile.status = 'active';
    await profile.save();

    res.status(200).json({
      success: true,
      message: 'Tax information submitted successfully for review',
      data: {
        profileId: profile.profileId,
        submitted: true,
        submittedAt: profile.submittedAt,
        status: profile.status
      }
    });

  } catch (error) {
    console.error('Submit tax information error:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting tax information',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * File tax (after approval/review)
 */
const fileTax = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Find profile
    const profile = await TaxableProfile.findOne({
      $or: [
        { profileId: profileId, user: userId },
        { _id: profileId, user: userId }
      ]
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    // Check if submitted
    if (!profile.submitted) {
      return res.status(400).json({
        success: false,
        message: 'Profile must be submitted before filing'
      });
    }

    // Check if already filed
    if (profile.filed) {
      return res.status(400).json({
        success: false,
        message: 'Tax has already been filed for this profile'
      });
    }

    // Mark as filed
    profile.filed = true;
    profile.filedAt = Date.now();
    profile.status = 'completed';
    await profile.save();

    res.status(200).json({
      success: true,
      message: 'Tax filed successfully',
      data: {
        profileId: profile.profileId,
        filed: true,
        filedAt: profile.filedAt,
        status: profile.status
      }
    });

  } catch (error) {
    console.error('File tax error:', error);
    res.status(500).json({
      success: false,
      message: 'Error filing tax',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  createProfile,
  getUserProfiles,
  getProfileById,
  submitTaxInformation,
  fileTax
};

