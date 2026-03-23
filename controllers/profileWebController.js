/**
 * Web-specific Taxable Profile Controller
 * Optimized for frontend with simplified flows
 */

const TaxableProfile = require('../models/TaxableProfile');
const User = require('../models/User');
const { validateYear, validateProfileType } = require('../utils/profileValidation');
const { validationResult } = require('express-validator');
const { sendTaxProfileCreatedEmail } = require('../utils/emailService');
const { createUploadSessionForUser } = require('./uploadController');

/**
 * Create a new Taxable Profile for web (year + type only)
 * POST /api/taxableprofile/web/create
 * Body: { year, profileType }
 * Returns: profile + auto-created upload session
 */
const createWebProfile = async (req, res) => {
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
    const { year, profileType } = req.body;

    // Convert year to number
    const yearNum = typeof year === 'string' ? parseInt(year, 10) : year;

    // Validate year (web-specific: only 2025 or 2026 allowed)
    if (yearNum !== 2025 && yearNum !== 2026) {
      return res.status(400).json({
        success: false,
        message: 'Year must be 2025 or 2026'
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

    // Build minimal profile payload
    const profilePayload = {
      user: userId,
      author: userId,
      year: yearNum,
      profileType: profileType,
      status: 'draft',
      filingStatus: 'pending_upload' // Start with pending upload
    };

    const profile = await TaxableProfile.create(profilePayload);

    // Auto-create upload session linked to profile
    let uploadSession = null;
    try {
      uploadSession = await createUploadSessionForUser(userId, profile._id, yearNum);
    } catch (uploadError) {
      console.error('[ProfileWeb] Upload session creation failed:', uploadError.message);
      // Continue without upload session - profile is still created
    }

    // Send email notification
    try {
      const user = await User.findById(userId).select('email firstName').lean();
      if (user?.email) {
        await sendTaxProfileCreatedEmail(user.email, user.firstName || 'there', profile.year);
      }
    } catch (e) {
      console.error('[ProfileWeb] Tax profile created email failed:', e.message);
    }

    // Prepare response
    const response = {
      success: true,
      message: 'Tax profile created successfully',
      data: {
        profileId: profile.profileId,
        id: profile._id,
        year: profile.year,
        profileType: profile.profileType,
        status: profile.status,
        filingStatus: profile.filingStatus,
        createdAt: profile.createdAt
      }
    };

    // Add upload session to response if created
    if (uploadSession) {
      response.data.uploadSession = {
        uploadId: uploadSession.uploadId,
        uploadUrl: uploadSession.uploadUrl
      };
    }

    res.status(201).json(response);
  } catch (error) {
    console.error('Create web profile error:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'A profile already exists for this year and type'
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
 * Complete profile with additional data (bulk update)
 * PUT /api/taxableprofile/:profileId/complete
 * Body: partial profile data (all optional)
 */
const completeProfile = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;
    const {
      primaryNIN,
      primaryIncomeSources,
      residency183Days,
      state,
      paysRent,
      rentAnnualAmount,
      rentMonthlyAmount,
      hasHealthInsurance,
      healthInsuranceAnnualAmount,
      healthInsuranceMonthlyAmount,
      hasPension,
      pensionAnnualAmount,
      pensionMonthlyAmount,
      paysMortgage,
      mortgageAnnualAmount,
      mortgageMonthlyAmount,
      filingPreference,
      dob,
      street,
      city
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

    // Validate filing preference based on year
    if (filingPreference) {
      if (profile.year === 2025 && filingPreference !== 'annual') {
        return res.status(400).json({
          success: false,
          message: 'For tax year 2025, only annual filing is allowed'
        });
      }
      if (profile.year === 2026 && !['monthly', 'annual'].includes(filingPreference)) {
        return res.status(400).json({
          success: false,
          message: 'Filing preference must be "monthly" or "annual" for 2026'
        });
      }
    }

    // Update fields if provided
    if (primaryNIN !== undefined) {
      const ninStr = String(primaryNIN || '').replace(/[^0-9]/g, '');
      if (ninStr && ninStr.length !== 11) {
        return res.status(400).json({
          success: false,
          message: 'NIN must be exactly 11 digits'
        });
      }
      profile.primaryNIN = ninStr || null;
    }

    if (primaryIncomeSources !== undefined) {
      const validSources = ['Salary / Employment', 'Business/Self-employment', 'Freelance/Consulting', 'Investment income', 'Rental income', 'Digital Assets/Crypto'];
      if (Array.isArray(primaryIncomeSources)) {
        const invalid = primaryIncomeSources.find(s => !validSources.includes(s));
        if (invalid) {
          return res.status(400).json({
            success: false,
            message: `Invalid income source: ${invalid}. Must be one of: ${validSources.join(', ')}`
          });
        }
        profile.primaryIncomeSources = primaryIncomeSources;
      } else if (primaryIncomeSources === null) {
        profile.primaryIncomeSources = undefined;
      }
    }

    // Update boolean fields
    if (residency183Days !== undefined) profile.residency183Days = residency183Days;
    if (state !== undefined) profile.state = state;
    if (paysRent !== undefined) profile.paysRent = paysRent;
    if (rentAnnualAmount !== undefined) profile.rentAnnualAmount = rentAnnualAmount;
    if (rentMonthlyAmount !== undefined) profile.rentMonthlyAmount = rentMonthlyAmount;
    if (hasHealthInsurance !== undefined) profile.hasHealthInsurance = hasHealthInsurance;
    if (healthInsuranceAnnualAmount !== undefined) profile.healthInsuranceAnnualAmount = healthInsuranceAnnualAmount;
    if (healthInsuranceMonthlyAmount !== undefined) profile.healthInsuranceMonthlyAmount = healthInsuranceMonthlyAmount;
    if (hasPension !== undefined) profile.hasPension = hasPension;
    if (pensionAnnualAmount !== undefined) profile.pensionAnnualAmount = pensionAnnualAmount;
    if (pensionMonthlyAmount !== undefined) profile.pensionMonthlyAmount = pensionMonthlyAmount;
    if (paysMortgage !== undefined) profile.paysMortgage = paysMortgage;
    if (mortgageAnnualAmount !== undefined) profile.mortgageAnnualAmount = mortgageAnnualAmount;
    if (mortgageMonthlyAmount !== undefined) profile.mortgageMonthlyAmount = mortgageMonthlyAmount;
    if (filingPreference !== undefined) profile.filingPreference = filingPreference;
    if (dob !== undefined) profile.dob = dob ? new Date(dob) : null;
    if (street !== undefined) profile.street = street;
    if (city !== undefined) profile.city = city;

    await profile.save();

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        profileId: profile.profileId,
        year: profile.year,
        profileType: profile.profileType,
        updatedFields: Object.keys(req.body).filter(key => req.body[key] !== undefined)
      }
    });
  } catch (error) {
    console.error('Complete profile error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while updating your profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Create upload session for existing profile
 * POST /api/taxableprofile/:profileId/upload-session
 */
const createProfileUploadSession = async (req, res) => {
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

    // Create upload session
    const uploadSession = await createUploadSessionForUser(userId, profile._id, profile.year);

    res.status(201).json({
      success: true,
      message: 'Upload session created',
      data: {
        uploadId: uploadSession.uploadId,
        uploadUrl: uploadSession.uploadUrl,
        profileId: profile.profileId,
        year: profile.year
      }
    });
  } catch (error) {
    console.error('Create upload session error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while creating upload session',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Submit profile for review
 * POST /api/taxableprofile/:profileId/submit
 */
const submitProfileForReview = async (req, res) => {
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
      message: 'Profile submitted successfully for review',
      data: {
        profileId: profile.profileId,
        submitted: true,
        submittedAt: profile.submittedAt,
        status: profile.status
      }
    });
  } catch (error) {
    console.error('Submit profile error:', error);
    res.status(500).json({
      success: false,
      message: 'Error submitting profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * File tax (after approval/payment)
 * POST /api/taxableprofile/:profileId/file
 */
const fileTax = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Tax profile not found' });
    }

    if (profile.filed) {
      return res.status(400).json({ success: false, message: 'Tax has already been filed for this profile' });
    }

    // If not submitted, mark as submitted first
    if (!profile.submitted) {
      profile.submitted = true;
      profile.submittedAt = new Date();
      profile.status = 'active';
    }

    // Mark as filed
    profile.filed = true;
    profile.filedAt = new Date();
    profile.filingStatus = 'filed';
    profile.status = 'completed';
    await profile.save();

    // Send email notification
    try {
      const user = await User.findById(userId).select('email firstName').lean();
      if (user?.email) {
        // Use existing filing submitted email function
        const { sendFilingSubmittedEmail } = require('../utils/emailService');
        await sendFilingSubmittedEmail(user.email, user.firstName || 'there', profile.year, null);
      }
    } catch (e) {
      console.error('[ProfileWeb] Filing submitted email failed:', e.message);
    }

    res.status(200).json({
      success: true,
      message: 'Tax filed successfully',
      data: {
        profileId: profile.profileId,
        filed: true,
        filedAt: profile.filedAt,
        status: profile.status,
        filingStatus: profile.filingStatus
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

/**
 * Get allowed years for web (2025, 2026)
 * GET /api/taxableprofile/web/allowed-years
 */
const getAllowedYears = async (req, res) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        allowedYears: [2025, 2026],
        currentYear: new Date().getFullYear(),
        note: 'Only 2025 and 2026 tax years are available for filing'
      }
    });
  } catch (error) {
    console.error('Get allowed years error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving allowed years'
    });
  }
};

/**
 * Get valid income sources
 * GET /api/taxableprofile/web/income-sources
 */
const getIncomeSources = async (req, res) => {
  try {
    const incomeSources = [
      'Salary / Employment',
      'Business/Self-employment',
      'Freelance/Consulting',
      'Investment income',
      'Rental income',
      'Digital Assets/Crypto'
    ];

    res.status(200).json({
      success: true,
      data: {
        incomeSources,
        count: incomeSources.length
      }
    });
  } catch (error) {
    console.error('Get income sources error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving income sources'
    });
  }
};

/**
 * Download tax return (stub endpoint)
 * GET /taxableprofile/web/:profileId/download
 */
const downloadTaxReturn = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;
    const { format = 'pdf' } = req.query;

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

    // Check if profile has been filed
    if (!profile.filed) {
      return res.status(400).json({
        success: false,
        message: 'Tax return has not been filed yet. Please file your tax return first.'
      });
    }

    // This is a stub endpoint for PDF generation
    // In production, this would generate and return a PDF file
    
    const stubResponse = {
      success: true,
      message: 'Tax return download initiated (stub)',
      data: {
        profileId: profile.profileId,
        year: profile.year,
        format,
        downloadUrl: `https://api.taxable.com/stub/download/${profile.profileId}.${format}`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours from now
        note: 'This is a stub endpoint. In production, this would generate and return a PDF tax return document.'
      }
    };

    // If client wants to simulate file download, we can set headers
    if (req.query.simulate === 'true') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="tax-return-${profile.profileId}.pdf"`);
      // Return a minimal PDF header (just for stub)
      const pdfStub = '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [] /Count 0 >>\nendobj\nxref\n0 3\n0000000000 65535 f \n0000000010 00000 n \n0000000053 00000 n \ntrailer\n<< /Size 3 /Root 1 0 R >>\nstartxref\n94\n%%EOF';
      return res.send(pdfStub);
    }

    res.status(200).json(stubResponse);
  } catch (error) {
    console.error('Download tax return error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while preparing tax return download',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update personal information
 * PUT /taxableprofile/web/:profileId/personal-info
 * Body: { tin, residencyStatus, fullName, dateOfBirth, streetAddress, city, state }
 */
const updatePersonalInfo = async (req, res) => {
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
      tin,
      residencyStatus,
      fullName,
      dateOfBirth,
      streetAddress,
      city,
      state
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

    // Update User model with fullName if provided
    if (fullName) {
      const nameParts = fullName.trim().split(' ');
      const firstName = nameParts[0] || '';
      const lastName = nameParts.slice(1).join(' ') || '';
      
      await User.findByIdAndUpdate(userId, {
        firstName,
        lastName,
        updatedAt: Date.now()
      });
    }

    // Update TaxableProfile fields
    if (tin !== undefined) {
      const tinStr = String(tin || '').replace(/[^0-9]/g, '');
      if (tinStr && (tinStr.length < 10 || tinStr.length > 12)) {
        return res.status(400).json({
          success: false,
          message: 'TIN must be 10-12 digits'
        });
      }
      profile.primaryTIN = tinStr || null;
    }

    if (residencyStatus !== undefined) {
      // Map residencyStatus to residency183Days
      // Assuming residencyStatus values: 'resident', 'non-resident', 'part-year'
      if (residencyStatus === 'resident') {
        profile.residency183Days = true;
      } else if (residencyStatus === 'non-resident') {
        profile.residency183Days = false;
      } else if (residencyStatus === 'part-year') {
        // For part-year residents, we might need additional logic
        profile.residency183Days = true; // Default to true for part-year
      }
    }

    if (dateOfBirth !== undefined) {
      profile.dob = dateOfBirth ? new Date(dateOfBirth) : null;
    }

    if (streetAddress !== undefined) {
      profile.street = streetAddress;
    }

    if (city !== undefined) {
      profile.city = city;
    }

    if (state !== undefined) {
      profile.state = state;
    }

    await profile.save();

    res.status(200).json({
      success: true,
      message: 'Personal information updated successfully',
      data: {
        profileId: profile.profileId,
        updatedFields: Object.keys(req.body).filter(key => req.body[key] !== undefined),
        personalInfo: {
          tin: profile.primaryTIN,
          residencyStatus: profile.residency183Days ? 'resident' : 'non-resident',
          fullName: fullName ? `${profile.user?.firstName || ''} ${profile.user?.lastName || ''}`.trim() : undefined,
          dateOfBirth: profile.dob,
          streetAddress: profile.street,
          city: profile.city,
          state: profile.state
        }
      }
    });
  } catch (error) {
    console.error('Update personal info error:', error);
    
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
      message: 'An error occurred while updating personal information',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get user's profiles for web interface
 * GET /api/taxableprofile/web
 * Returns all profiles for the authenticated user with web-optimized format
 */
const getWebProfiles = async (req, res) => {
  try {
    const userId = req.user?.userId;
    
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const profiles = await TaxableProfile.find({ user: userId })
      .sort({ year: -1, createdAt: -1 })
      .select('-__v')
      .lean();

    // Format for web interface
    const formattedProfiles = profiles.map(profile => ({
      id: profile._id,
      profileId: profile.profileId,
      year: profile.year,
      profileType: profile.profileType,
      status: profile.status,
      filingStatus: profile.filingStatus,
      primaryNIN: profile.primaryNIN,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      // Include basic info for display
      displayName: `${profile.profileType} - ${profile.year}`,
      isComplete: profile.status === 'active' || profile.status === 'submitted',
      canFile: profile.filingStatus === 'tax_agent_approved' || profile.filingStatus === 'pending_filing_payment'
    }));

    res.status(200).json({
      success: true,
      message: 'Profiles retrieved successfully',
      data: {
        profiles: formattedProfiles,
        count: formattedProfiles.length
      }
    });
  } catch (error) {
    console.error('[ProfileWeb] Get profiles error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving your profiles',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get a specific profile by ID for web interface
 * GET /api/taxableprofile/web/:profileId
 * Supports both MongoDB _id and custom profileId
 */
const getWebProfileById = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Try to find by custom profileId first, then by MongoDB _id
    let profile = await TaxableProfile.findOne({
      $or: [
        { profileId: profileId, user: userId },
        { _id: profileId, user: userId }
      ]
    })
    .select('-__v')
    .lean();

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    // Format for web interface
    const formattedProfile = {
      id: profile._id,
      profileId: profile.profileId,
      year: profile.year,
      profileType: profile.profileType,
      status: profile.status,
      filingStatus: profile.filingStatus,
      primaryNIN: profile.primaryNIN,
      // Personal information
      primaryIncomeSources: profile.primaryIncomeSources || [],
      residency183Days: profile.residency183Days,
      state: profile.state,
      paysRent: profile.paysRent,
      rentAnnualAmount: profile.rentAnnualAmount,
      rentMonthlyAmount: profile.rentMonthlyAmount,
      hasHealthInsurance: profile.hasHealthInsurance,
      healthInsuranceAnnualAmount: profile.healthInsuranceAnnualAmount,
      healthInsuranceMonthlyAmount: profile.healthInsuranceMonthlyAmount,
      hasPension: profile.hasPension,
      pensionAnnualAmount: profile.pensionAnnualAmount,
      pensionMonthlyAmount: profile.pensionMonthlyAmount,
      paysMortgage: profile.paysMortgage,
      mortgageAnnualAmount: profile.mortgageAnnualAmount,
      mortgageMonthlyAmount: profile.mortgageMonthlyAmount,
      filingPreference: profile.filingPreference,
      // Additional info
      dob: profile.dob,
      street: profile.street,
      city: profile.city,
      incomeDetails: profile.incomeDetails,
      deductiblesDetails: profile.deductiblesDetails,
      // Timestamps
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      // Metadata
      adminMetadata: profile.adminMetadata,
      intent: profile.intent
    };

    res.status(200).json({
      success: true,
      message: 'Profile retrieved successfully',
      data: {
        profile: formattedProfile
      }
    });
  } catch (error) {
    console.error('[ProfileWeb] Get profile error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving the profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  createWebProfile,
  completeProfile,
  createProfileUploadSession,
  submitProfileForReview,
  fileTax,
  getAllowedYears,
  getIncomeSources,
  updatePersonalInfo,
  downloadTaxReturn,
  getWebProfiles,
  getWebProfileById
};