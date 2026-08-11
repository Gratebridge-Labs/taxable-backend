/**
 * Web-specific Taxable Profile Controller
 * Optimized for frontend with simplified flows
 */

const TaxableProfile = require('../models/TaxableProfile');
const User = require('../models/User');
const IncomeData = require('../models/IncomeData');
const Deduction = require('../models/Deduction');
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
    const { year, profileType, intent, taxId, taxTypes } = req.body;

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

    // Build minimal profile payload.
    // Business filings track section progress in `status` (starting at the
    // company information section) and lifecycle in `filingStatus` (draft).
    // Individual filings keep the existing draft + pending_upload defaults.
    const isBusiness = profileType === 'Business';
    const profilePayload = {
      user: userId,
      author: userId,
      year: yearNum,
      profileType: profileType,
      status: isBusiness ? 'companyinformation' : 'draft',
      filingStatus: isBusiness ? 'draft' : 'pending_upload'
    };

    // Optional: what the user wants to do with this profile
    if (intent) {
      profilePayload.intent = intent;
    }

    // Individual: taxId = NIN (exactly 11 digits)
    if (!isBusiness && taxId) {
      const ninStr = String(taxId).replace(/[^0-9]/g, '');
      if (ninStr.length !== 11) {
        return res.status(400).json({
          success: false,
          message: 'taxId (NIN) must be exactly 11 digits'
        });
      }
      profilePayload.primaryNIN = ninStr;
    }

    // Business-only: capture Tax ID (RC/BN) and the tax types to file.
    // The `vatWht` UI checkbox is a single control that enables both VAT and WHT.
    if (isBusiness) {
      if (taxId) {
        profilePayload.businessCompanyInfo = { RCNumber: taxId };
      }

      const selected = taxTypes || {};
      profilePayload.businessSetup = {
        payeEnabled: !!selected.paye,
        vatEnabled: !!selected.vatWht,
        whtEnabled: !!selected.vatWht,
        citEnabled: !!selected.cit
      };
    }

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
        intent: profile.intent,
        status: profile.status,
        filingStatus: profile.filingStatus,
        createdAt: profile.createdAt
      }
    };

    // Echo back business selections so the frontend can confirm what was stored
    if (profile.profileType === 'Business') {
      response.data.businessCompanyInfo = {
        RCNumber: profile.businessCompanyInfo?.RCNumber || null
      };
      response.data.businessSetup = {
        payeEnabled: profile.businessSetup?.payeEnabled || false,
        vatEnabled: profile.businessSetup?.vatEnabled || false,
        whtEnabled: profile.businessSetup?.whtEnabled || false,
        citEnabled: profile.businessSetup?.citEnabled || false
      };
    }

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
      nin,
      primaryIncomeSources,
      residency183Days,
      paysRent,
      hasHealthInsurance,
      hasPension,
      hasMortgage,
      Hasmortgage,
      filingPreference,
      dob,
      street,
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

    if (filingPreference !== undefined && filingPreference !== null && !['monthly', 'annual'].includes(filingPreference)) {
      return res.status(400).json({
        success: false,
        message: 'filingPreference must be "monthly" or "annual"'
      });
    }

    // Update only the specified step-5 fields (all nullable)
    if (nin !== undefined) {
      const ninStr = String(nin || '').replace(/[^0-9]/g, '');
      if (ninStr && ninStr.length !== 11) {
        return res.status(400).json({
          success: false,
          message: 'NIN must be exactly 11 digits'
        });
      }
      profile.primaryNIN = ninStr || null;
    }

    if (primaryIncomeSources !== undefined) {
      if (primaryIncomeSources === null) {
        profile.primaryIncomeSources = undefined;
      } else if (Array.isArray(primaryIncomeSources)) {
        profile.primaryIncomeSources = primaryIncomeSources;
      } else {
        return res.status(400).json({
          success: false,
          message: 'primaryIncomeSources must be an array or null'
        });
      }
    }

    if (residency183Days !== undefined) profile.residency183Days = residency183Days;
    if (paysRent !== undefined) profile.paysRent = paysRent;
    if (hasHealthInsurance !== undefined) profile.hasHealthInsurance = hasHealthInsurance;
    if (hasPension !== undefined) profile.hasPension = hasPension;
    const mortgageValue = hasMortgage !== undefined ? hasMortgage : Hasmortgage;
    if (mortgageValue !== undefined) profile.paysMortgage = mortgageValue;
    if (filingPreference !== undefined) profile.filingPreference = filingPreference;
    if (dob !== undefined) profile.dob = dob || null;
    if (street !== undefined) profile.street = street;
    if (city !== undefined) profile.city = city;
    if (state !== undefined) profile.state = state;

    await profile.save();

    res.status(200).json({
      success: true,
      message: 'Profile completed',
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

    const { legalConfirmAccuracy, legalConfirmAuthority } = req.body || {};
    if (legalConfirmAccuracy !== true || legalConfirmAuthority !== true) {
      return res.status(400).json({
        success: false,
        message: 'legalConfirmAccuracy and legalConfirmAuthority must both be true'
      });
    }

    // Mark as submitted
    profile.submitted = true;
    profile.submittedAt = Date.now();
    profile.status = 'submitted';
    profile.filingStatus = 'submitted';
    await profile.save();

    res.status(200).json({
      success: true,
      message: 'Profile submitted',
      data: {
        profileId: profile.profileId,
        submitted: true,
        submittedAt: profile.submittedAt,
        status: profile.status,
        filingStatus: profile.filingStatus
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

function normalizeMonthNumber(m) {
  if (m === undefined || m === null || m === '') return null;
  const n = Number(m);
  return Number.isInteger(n) && n >= 1 && n <= 12 ? n : NaN;
}

async function assertProfileIncomeAndDeductionsComplete(profile, userId, month) {
  const requiredProfileFields = [
    'primaryNIN',
    'primaryIncomeSources',
    'residency183Days',
    'paysRent',
    'hasHealthInsurance',
    'hasPension',
    'paysMortgage',
    'filingPreference',
    'dob',
    'street',
    'city',
    'state'
  ];
  const missingProfileFields = requiredProfileFields.filter((field) => profile[field] === undefined);
  if (missingProfileFields.length) {
    const err = new Error('Insufficient data: tax profile is not complete');
    err.statusCode = 400;
    err.data = { missingProfileFields };
    throw err;
  }

  if (!['monthly', 'annual'].includes(profile.filingPreference)) {
    const err = new Error('Insufficient data: filingPreference must be monthly or annual');
    err.statusCode = 400;
    throw err;
  }

  const requestedMonth = profile.filingPreference === 'monthly' ? normalizeMonthNumber(month) : null;
  if (profile.filingPreference === 'monthly' && (!requestedMonth || Number.isNaN(requestedMonth))) {
    const err = new Error('For monthly filing, a valid month (1-12) is required');
    err.statusCode = 400;
    throw err;
  }

  const incomeData = await IncomeData.findOne({ profileId: profile._id, year: profile.year }).lean();
  if (!incomeData) {
    const err = new Error('Insufficient data: income data not found');
    err.statusCode = 400;
    throw err;
  }

  const deductions = await Deduction.find({ profileId: profile._id, 'period.year': profile.year }).lean();
  if (!deductions.length) {
    const err = new Error('Insufficient data: deductions data not found');
    err.statusCode = 400;
    throw err;
  }

  const incomeItems = (() => {
    if (profile.filingPreference === 'annual') return Array.isArray(incomeData.annualIncomes) ? incomeData.annualIncomes : [];
    const monthlyMap = incomeData.monthlyIncomes || {};
    const monthItems = monthlyMap[String(requestedMonth)] || [];
    return Array.isArray(monthItems) ? monthItems : [];
  })();
  if (!incomeItems.length) {
    const err = new Error('Insufficient data: income data is not complete for requested period');
    err.statusCode = 400;
    throw err;
  }

  const deductionItems = (() => {
    if (profile.filingPreference === 'annual') return deductions.filter((d) => d.frequency === 'annual' || d.month == null);
    return deductions.filter((d) => {
      if (d.frequency === 'monthly') return d.month === requestedMonth;
      return d.month == null || d.frequency === 'annual';
    });
  })();
  if (!deductionItems.length) {
    const err = new Error('Insufficient data: deductions data is not complete for requested period');
    err.statusCode = 400;
    throw err;
  }

  return { month: requestedMonth };
}

/**
 * Submit tax filing (web)
 * POST /api/taxableprofile/web/:profileId/filing/submit
 * Body: { status: 'submitted' | 'filed', month?: number } (month required for monthly profiles)
 */
const submitTaxFiling = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;
    const { status, month } = req.body || {};

    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!['submitted', 'filed'].includes(status)) {
      return res.status(400).json({ success: false, message: 'status must be "submitted" or "filed"' });
    }

    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);
    if (!profile) return res.status(404).json({ success: false, message: 'Tax profile not found' });

    const { month: normalizedMonth } = await assertProfileIncomeAndDeductionsComplete(profile, userId, month);

    // Update status based on filing preference and requested status
    if (profile.filingPreference === 'annual') {
      if (status === 'submitted') {
        profile.submitted = true;
        profile.submittedAt = new Date();
        profile.status = 'active';
      } else {
        profile.filed = true;
        profile.filedAt = new Date();
        profile.filingStatus = 'filed';
        profile.status = 'completed';
      }
    } else {
      // Monthly: store month-level filing info in adminMetadata
      profile.adminMetadata = profile.adminMetadata || {};
      profile.adminMetadata.monthlyFilings = profile.adminMetadata.monthlyFilings || {};
      const key = `${profile.year}`;
      profile.adminMetadata.monthlyFilings[key] = profile.adminMetadata.monthlyFilings[key] || {};
      profile.adminMetadata.monthlyFilings[key][String(normalizedMonth)] = status;
      profile.status = 'active';
      profile.filingStatus = status === 'filed' ? 'monthly_active' : 'monthly_pending';
    }

    await profile.save();

    return res.status(200).json({
      success: true,
      message: `Tax filing ${status} successfully`,
      data: {
        profileId: profile.profileId,
        year: profile.year,
        filingPreference: profile.filingPreference,
        month: profile.filingPreference === 'monthly' ? normalizedMonth : null,
        status,
        profileStatus: profile.status,
        filingStatus: profile.filingStatus,
        submitted: !!profile.submitted,
        filed: !!profile.filed
      }
    });
  } catch (error) {
    console.error('Submit tax filing error:', error);
    const statusCode = error.statusCode || 500;
    return res.status(statusCode).json({
      success: false,
      message: error.message || 'Error submitting tax filing',
      data: error.data || undefined
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
    const sources = [
      { id: 'salary', label: 'Salary / Employment' },
      { id: 'business', label: 'Business/Self-employment' },
      { id: 'freelance', label: 'Freelance/Consulting' },
      { id: 'investment', label: 'Investment income' },
      { id: 'rental', label: 'Rental income' },
      { id: 'crypto', label: 'Digital Assets/Crypto' }
    ];

    res.status(200).json({
      success: true,
      message: 'Income sources retrieved',
      data: {
        sources,
        // Backward-compatible alias
        incomeSources: sources.map((s) => s.label),
        count: sources.length
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
 * Body: { nin, fullName, email, phone, dob, streetAddress, city, state, lga, residencyStatus, tin? }
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
      nin,
      tin,
      residencyStatus,
      fullName,
      email,
      phone,
      dob,
      dateOfBirth,
      streetAddress,
      city,
      state,
      lga
    } = req.body;

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

    // Personal info lives on the profile only — it must never mutate the User
    // account record (name/email/phone). The account keeps its signup values.
    if (fullName) {
      profile.fullName = fullName.trim();
    }

    if (email !== undefined) {
      const emailStr = String(email || '').trim().toLowerCase();
      if (emailStr) {
        profile.contactEmail = emailStr;
      }
    }

    if (phone !== undefined) {
      const phoneStr = String(phone || '').trim();
      if (phoneStr) {
        profile.contactPhone = phoneStr;
      }
    }

    if (nin !== undefined) {
      const ninStr = String(nin || '').replace(/[^0-9]/g, '');
      if (ninStr && ninStr.length !== 11) {
        return res.status(400).json({
          success: false,
          message: 'NIN must be exactly 11 digits'
        });
      }
      profile.primaryNIN = ninStr || null;
    }

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
      if (residencyStatus === 'resident') {
        profile.residency183Days = true;
      } else if (residencyStatus === 'non-resident') {
        profile.residency183Days = false;
      } else if (residencyStatus === 'part-year') {
        profile.residency183Days = true;
      }
    }

    const dobValue = dob !== undefined ? dob : dateOfBirth;
    if (dobValue !== undefined) {
      profile.dob = dobValue ? new Date(dobValue) : null;
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

    if (lga !== undefined) {
      profile.lga = lga;
    }

    await profile.save();

    const user = await User.findById(userId).select('firstName lastName email phone').lean();
    const resolvedFullName = profile.fullName ||
      [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
      null;

    res.status(200).json({
      success: true,
      message: 'Personal information saved',
      data: {
        profileId: profile.profileId,
        updatedFields: Object.keys(req.body).filter(key => req.body[key] !== undefined),
        personalInfo: {
          nin: profile.primaryNIN,
          fullName: resolvedFullName,
          email: profile.contactEmail || user?.email || null,
          phone: profile.contactPhone || user?.phone || null,
          dob: profile.dob,
          streetAddress: profile.street,
          city: profile.city,
          state: profile.state,
          lga: profile.lga || null,
          residencyStatus: profile.residency183Days ? 'resident' : 'non-resident'
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
      businessSetup: profile.businessSetup || null,
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

    // Use safe helper to avoid ObjectId cast errors for custom profile IDs.
    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId)
      .select('-__v')
      .lean();

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    const user = await User.findById(userId).select('firstName lastName email phone').lean();
    const fullName = profile.fullName ||
      [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
      null;

    const isComplete = !!(
      profile.primaryNIN &&
      Array.isArray(profile.primaryIncomeSources) &&
      profile.primaryIncomeSources.length &&
      profile.filingPreference &&
      profile.dob &&
      profile.street &&
      profile.city &&
      profile.state
    );
    const canFile = profile.filingStatus === 'tax_agent_approved' ||
      profile.filingStatus === 'pending_filing_payment';

    // Format for web interface (Individual PIT FE contract)
    const formattedProfile = {
      id: profile._id,
      profileId: profile.profileId,
      year: profile.year,
      profileType: profile.profileType,
      status: profile.status,
      filingStatus: profile.filingStatus,
      filingPreference: profile.filingPreference || null,
      intent: profile.intent || null,
      nin: profile.primaryNIN ?? null,
      primaryNIN: profile.primaryNIN,
      fullName,
      email: profile.contactEmail || user?.email || null,
      phone: profile.contactPhone || user?.phone || null,
      dob: profile.dob || null,
      street: profile.street || null,
      streetAddress: profile.street || null,
      city: profile.city || null,
      state: profile.state || null,
      lga: profile.lga || null,
      primaryIncomeSources: profile.primaryIncomeSources || [],
      residency183Days: profile.residency183Days,
      paysRent: profile.paysRent,
      rentAnnualAmount: profile.rentAnnualAmount,
      rentMonthlyAmount: profile.rentMonthlyAmount,
      hasHealthInsurance: profile.hasHealthInsurance,
      healthInsuranceAnnualAmount: profile.healthInsuranceAnnualAmount,
      healthInsuranceMonthlyAmount: profile.healthInsuranceMonthlyAmount,
      hasPension: profile.hasPension,
      pensionAnnualAmount: profile.pensionAnnualAmount,
      pensionMonthlyAmount: profile.pensionMonthlyAmount,
      hasMortgage: profile.paysMortgage,
      paysMortgage: profile.paysMortgage,
      mortgageAnnualAmount: profile.mortgageAnnualAmount,
      mortgageMonthlyAmount: profile.mortgageMonthlyAmount,
      incomeDetails: profile.incomeDetails,
      deductiblesDetails: profile.deductiblesDetails,
      isComplete,
      canFile,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      adminMetadata: profile.adminMetadata
    };

    res.status(200).json({
      success: true,
      message: 'Profile retrieved',
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

/**
 * Delete a profile for web interface
 * DELETE /api/taxableprofile/web/:profileId
 * Supports both MongoDB _id and custom profileId
 */
const deleteWebProfile = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Use safe helper to avoid ObjectId cast errors for custom profile IDs.
    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Profile not found'
      });
    }

    // Check if profile can be deleted — block only once it's committed to the
    // filing pipeline. This allows both individual drafts (draft/pending_upload)
    // and business drafts (companyinformation/draft) to be removed.
    const blockedFilingStatuses = [
      'upload_done', 'pending_accountant_payment', 'tax_agent_review',
      'tax_agent_approved', 'pending_filing_payment', 'filed',
      'monthly_active', 'monthly_pending', 'submitted', 'review', 'success'
    ];

    const deletable = !profile.filed && !profile.submitted && !blockedFilingStatuses.includes(profile.filingStatus);

    if (!deletable) {
      return res.status(400).json({
        success: false,
        message: 'Profile cannot be deleted once it has been submitted or filed.',
        currentStatus: profile.status,
        currentFilingStatus: profile.filingStatus
      });
    }

    // Store profile info for response before deletion
    const deletedProfileInfo = {
      id: profile._id,
      profileId: profile.profileId,
      year: profile.year,
      profileType: profile.profileType,
      status: profile.status,
      filingStatus: profile.filingStatus
    };

    // Delete the profile
    await TaxableProfile.findByIdAndDelete(profile._id);

    // Also delete associated data (optional - cascade delete)
    try {
      const Deduction = require('../models/Deduction');
      const Document = require('../models/Document');
      const IncomeSource = require('../models/IncomeSource');
      
      // Delete associated deductions
      await Deduction.deleteMany({ profileId: profile._id });
      
      // Delete associated documents
      await Document.deleteMany({ 'linkedTo.profileId': profile._id });
      
      // Delete associated income sources
      await IncomeSource.deleteMany({ profile: profile._id });
      
      console.log(`[ProfileWeb] Deleted profile ${profile._id} with associated data`);
    } catch (cascadeError) {
      console.error('[ProfileWeb] Cascade delete error:', cascadeError.message);
      // Continue even if cascade delete fails - main profile is deleted
    }

    res.status(200).json({
      success: true,
      message: 'Profile deleted successfully',
      data: {
        deletedProfile: deletedProfileInfo,
        deletedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('[ProfileWeb] Delete profile error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while deleting the profile',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  createWebProfile,
  completeProfile,
  createProfileUploadSession,
  submitProfileForReview,
  submitTaxFiling,
  fileTax,
  getAllowedYears,
  getIncomeSources,
  updatePersonalInfo,
  downloadTaxReturn,
  getWebProfiles,
  getWebProfileById,
  deleteWebProfile
};