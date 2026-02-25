const TaxableProfile = require('../models/TaxableProfile');
const User = require('../models/User');
const { validateYear, validateProfileType } = require('../utils/profileValidation');
const { validationResult } = require('express-validator');
const { sendTaxProfileCreatedEmail, sendFilingSubmittedEmail } = require('../utils/emailService');

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

    try {
      const user = await User.findById(userId).select('email firstName').lean();
      if (user?.email) {
        await sendTaxProfileCreatedEmail(user.email, user.firstName || 'there', profile.year);
      }
    } catch (e) {
      console.error('[Profile] Tax profile created email failed:', e.message);
    }

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

    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);

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
 * Update a taxable profile (partial update: dob, street, city, state, incomeDetails, deductiblesDetails)
 * PUT /api/taxableprofile/:profileId — pass profile ID in the URL
 */
const updateProfile = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;
    const { dob, street, city, state, incomeDetails, deductiblesDetails } = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    if (dob !== undefined) profile.dob = dob ? new Date(dob) : null;
    if (street !== undefined) profile.street = street || '';
    if (city !== undefined) profile.city = city || '';
    if (state !== undefined) profile.state = state || '';
    if (incomeDetails !== undefined) profile.incomeDetails = incomeDetails;
    if (deductiblesDetails !== undefined) profile.deductiblesDetails = deductiblesDetails;

    await profile.save();

    res.status(200).json({
      success: true,
      message: 'Tax profile updated successfully',
      data: {
        profileId: profile.profileId,
        id: profile._id,
        dob: profile.dob,
        street: profile.street,
        city: profile.city,
        state: profile.state
      }
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating your tax profile',
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

    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);

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
 * Perform submit (if needed) + file tax. Shared for API and WhatsApp (PDF: CONFIRM to file).
 * @returns {{ success: boolean, message: string, profile?: object }}
 */
const performFileTax = async (userId, profileId) => {
  const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);
  if (!profile) {
    return { success: false, message: 'Tax profile not found' };
  }
  if (profile.filed) {
    return { success: false, message: 'Tax has already been filed for this profile' };
  }
  if (!profile.submitted) {
    profile.submitted = true;
    profile.submittedAt = new Date();
    profile.status = 'active';
    profile.baseQuestionsAnswered = true;
    await profile.save();
  }
  profile.filed = true;
  profile.filedAt = new Date();
  profile.status = 'completed';
  await profile.save();
  try {
    const user = await User.findById(userId).select('email firstName').lean();
    if (user?.email) {
      await sendFilingSubmittedEmail(user.email, user.firstName || 'there', profile.year, null);
    }
  } catch (e) {
    console.error('[Profile] Filing submitted email failed:', e.message);
  }
  return { success: true, message: 'Tax filed successfully', profile };
};

/**
 * File tax (after approval/review) — HTTP handler
 */
const fileTax = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const result = await performFileTax(userId, profileId);
    if (!result.success) {
      const status = result.message === 'Tax profile not found' ? 404 : 400;
      return res.status(status).json({ success: false, message: result.message });
    }
    return res.status(200).json({
      success: true,
      message: result.message,
      data: {
        profileId: result.profile.profileId,
        filed: true,
        filedAt: result.profile.filedAt,
        status: result.profile.status
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
  updateProfile,
  submitTaxInformation,
  fileTax,
  performFileTax
};

