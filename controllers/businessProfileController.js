/**
 * Business Profile Controller
 * Handles business-specific profile operations: company info, setup config, and business summary
 */

const TaxableProfile = require('../models/TaxableProfile');
const CITReturn = require('../models/CITReturn');
const { validationResult } = require('express-validator');
const { CIT_RATE } = require('../config/constants');

/**
 * Build a CIT installment estimate from an estimated gross revenue + profit margin.
 * Returns the estimated annual profit, estimated CIT, and the per-quarter amount.
 */
function computeCitEstimate(grossRevenue = 0, profitMarginPercent = 0) {
  const estimatedAnnualProfit = Math.max(0, Math.round((grossRevenue || 0) * ((profitMarginPercent || 0) / 100)));
  const estimatedAnnualCit = Math.round(estimatedAnnualProfit * CIT_RATE);
  const quarterlyInstallment = Math.round(estimatedAnnualCit / 4);
  return { estimatedAnnualProfit, estimatedAnnualCit, quarterlyInstallment };
}

/** Generate the 4 quarterly installment rows, preserving existing paid/deferred status. */
function buildQuarterlyInstallments(quarterlyInstallment, year, existing) {
  const dueDates = [
    new Date(year, 2, 31),  // Q1: Mar 31
    new Date(year, 5, 30),  // Q2: Jun 30
    new Date(year, 8, 30),  // Q3: Sep 30
    new Date(year, 11, 31)  // Q4: Dec 31
  ];
  const installments = [];
  for (let q = 1; q <= 4; q++) {
    const prev = (existing || []).find(i => i.quarter === q);
    installments.push({
      quarter: q,
      dueDate: dueDates[q - 1],
      amount: quarterlyInstallment,
      status: prev ? prev.status : 'pending',
      paidAt: prev ? prev.paidAt : undefined,
      deferredAt: prev ? prev.deferredAt : undefined
    });
  }
  return installments;
}

/** Load a Business profile owned by the user, or send the appropriate error response. */
async function loadBusinessProfile(req, res) {
  const userId = req.user?.userId;
  const { profileId } = req.params;

  // Accept either the custom profileId (e.g. TP437322778) or the Mongo _id
  const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);
  if (!profile) {
    res.status(404).json({ success: false, message: 'Tax profile not found or access denied' });
    return null;
  }
  if (profile.profileType !== 'Business') {
    res.status(400).json({ success: false, message: 'This action is only available for Business profiles' });
    return null;
  }
  return profile;
}

/**
 * Update the "Company Information" section for a Business profile.
 *
 * This is a partial-merge save: send only the fields the user changed and the
 * rest are left untouched, so the frontend can safely auto-save the whole
 * section (or a single field) with one call. It also handles the CIT
 * "pay in quarterly installments" block shown on the same screen and returns
 * the live CIT estimate so the UI can render it without a second request.
 *
 * PUT /api/taxableprofile/business/:profileId/company-info
 * Body (all optional):
 *   companyName, TIN, RCNumber, natureOfBusiness, industrySector,
 *   dateOfIncorporation, email, phoneNumber, website,
 *   businessAddress: { street, city, state, lga, country },
 *   payCitQuarterly, estimatedGrossRevenue, estimatedProfitMargin
 */
const updateBusinessCompanyInfo = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const profile = await loadBusinessProfile(req, res);
    if (!profile) return;

    const {
      companyName, TIN, RCNumber, natureOfBusiness, industrySector,
      dateOfIncorporation, email, phoneNumber, website, businessAddress,
      payCitQuarterly, estimatedGrossRevenue, estimatedProfitMargin
    } = req.body;

    // Merge only the top-level fields that were actually provided
    const info = profile.businessCompanyInfo || {};
    const topLevel = { companyName, TIN, RCNumber, natureOfBusiness, industrySector, dateOfIncorporation, email, phoneNumber, website };
    for (const [key, value] of Object.entries(topLevel)) {
      if (value !== undefined) info[key] = value;
    }

    // Merge nested address fields without wiping the ones not sent
    if (businessAddress && typeof businessAddress === 'object') {
      info.businessAddress = { ...(info.businessAddress || {}) };
      for (const key of ['street', 'city', 'state', 'lga', 'country']) {
        if (businessAddress[key] !== undefined) info.businessAddress[key] = businessAddress[key];
      }
    }

    profile.businessCompanyInfo = info;
    profile.markModified('businessCompanyInfo');
    await profile.save();

    // ── CIT quarterly installment block (same screen) ──
    let citEstimate = null;
    const touchesCit = payCitQuarterly !== undefined ||
                       estimatedGrossRevenue !== undefined ||
                       estimatedProfitMargin !== undefined;

    if (touchesCit) {
      let cit = await CITReturn.findOne({ profileId: profile._id, year: profile.year });
      if (!cit) cit = new CITReturn({ profileId: profile._id, year: profile.year });

      if (payCitQuarterly !== undefined) cit.payCitQuarterly = !!payCitQuarterly;
      if (estimatedGrossRevenue !== undefined) cit.estimatedGrossRevenue = estimatedGrossRevenue;
      if (estimatedProfitMargin !== undefined) cit.estimatedProfitMargin = estimatedProfitMargin;

      const { estimatedAnnualProfit, estimatedAnnualCit, quarterlyInstallment } =
        computeCitEstimate(cit.estimatedGrossRevenue, cit.estimatedProfitMargin);
      cit.estimatedAnnualProfit = estimatedAnnualProfit;

      // Only lay out quarterly installments when the user opts into quarterly payment
      if (cit.payCitQuarterly) {
        cit.quarterlyAssessments = buildQuarterlyInstallments(quarterlyInstallment, profile.year, cit.quarterlyAssessments);
      }
      await cit.save();

      citEstimate = {
        payCitQuarterly: cit.payCitQuarterly,
        estimatedGrossRevenue: cit.estimatedGrossRevenue,
        estimatedProfitMargin: cit.estimatedProfitMargin,
        estimatedAnnualProfit,
        estimatedAnnualCit,
        quarterlyInstallment
      };
    }

    return res.status(200).json({
      success: true,
      message: 'Company information saved',
      data: {
        profileId: profile._id,
        companyInfo: profile.businessCompanyInfo,
        citEstimate
      }
    });
  } catch (error) {
    console.error('[BusinessProfile] updateBusinessCompanyInfo error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating business company information',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get the "Company Information" section (prefill on load).
 * Returns the saved company info plus the current CIT installment estimate.
 * GET /api/taxableprofile/business/:profileId/company-info
 */
const getBusinessCompanyInfo = async (req, res) => {
  try {
    const profile = await loadBusinessProfile(req, res);
    if (!profile) return;

    const cit = await CITReturn.findOne({ profileId: profile._id, year: profile.year }).lean();
    const grossRevenue = cit?.estimatedGrossRevenue || 0;
    const profitMargin = cit?.estimatedProfitMargin || 0;
    const { estimatedAnnualProfit, estimatedAnnualCit, quarterlyInstallment } = computeCitEstimate(grossRevenue, profitMargin);

    return res.status(200).json({
      success: true,
      message: 'Company information retrieved',
      data: {
        profileId: profile._id,
        year: profile.year,
        companyInfo: profile.businessCompanyInfo || {},
        citEstimate: {
          payCitQuarterly: cit?.payCitQuarterly || false,
          estimatedGrossRevenue: grossRevenue,
          estimatedProfitMargin: profitMargin,
          estimatedAnnualProfit,
          estimatedAnnualCit,
          quarterlyInstallment
        }
      }
    });
  } catch (error) {
    console.error('[BusinessProfile] getBusinessCompanyInfo error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving business company information',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update business setup configuration for a Business profile
 * PUT /api/taxableprofile/business/:profileId/setup
 * Body: { payeEnabled, vatEnabled, whtEnabled, citEnabled, filingFrequency, financialYearEnd, accountingMethod, currency, hasEmployees, numberOfEmployees, averageMonthlySalary }
 */
const updateBusinessSetup = async (req, res) => {
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
    
    // Verify profile exists and belongs to user
    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found or access denied'
      });
    }

    // Ensure profile is Business type
    if (profile.profileType !== 'Business') {
      return res.status(400).json({
        success: false,
        message: 'Business setup can only be updated for Business profiles'
      });
    }

    // Prepare setup update data
    const setupData = { ...req.body };
    
    // Mark setup as completed if at least one tax type is enabled
    if (setupData.payeEnabled || setupData.vatEnabled || setupData.whtEnabled || setupData.citEnabled) {
      setupData.setupCompleted = true;
    } else {
      setupData.setupCompleted = false;
    }

    const updateData = {
      businessSetup: setupData
    };

    // Update profile (use the resolved _id, since profileId may be a custom id)
    const updatedProfile = await TaxableProfile.findByIdAndUpdate(
      profile._id,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-__v');

    return res.status(200).json({
      success: true,
      message: 'Business setup configuration updated',
      profile: updatedProfile
    });
  } catch (error) {
    console.error('[BusinessProfile] updateBusinessSetup error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error updating business setup configuration',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get business profile summary including company info completeness, setup status, and tax statuses
 * GET /api/taxableprofile/business/:profileId/summary
 */
const getBusinessProfileSummary = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;
    
    // Verify profile exists and belongs to user
    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found or access denied'
      });
    }

    // Ensure profile is Business type
    if (profile.profileType !== 'Business') {
      return res.status(400).json({
        success: false,
        message: 'Business summary only available for Business profiles'
      });
    }

    // Calculate company info completeness
    const companyInfo = profile.businessCompanyInfo || {};
    let companyInfoComplete = false;
    let missingCompanyFields = [];

    if (companyInfo.companyName && companyInfo.TIN && companyInfo.RCNumber && 
        companyInfo.natureOfBusiness && companyInfo.businessAddress && 
        companyInfo.businessAddress.street && companyInfo.businessAddress.city && 
        companyInfo.businessAddress.state && companyInfo.email && companyInfo.phoneNumber) {
      companyInfoComplete = true;
    } else {
      if (!companyInfo.companyName) missingCompanyFields.push('companyName');
      if (!companyInfo.TIN) missingCompanyFields.push('TIN');
      if (!companyInfo.RCNumber) missingCompanyFields.push('RCNumber');
      if (!companyInfo.natureOfBusiness) missingCompanyFields.push('natureOfBusiness');
      if (!companyInfo.businessAddress?.street) missingCompanyFields.push('businessAddress.street');
      if (!companyInfo.businessAddress?.city) missingCompanyFields.push('businessAddress.city');
      if (!companyInfo.businessAddress?.state) missingCompanyFields.push('businessAddress.state');
      if (!companyInfo.email) missingCompanyFields.push('email');
      if (!companyInfo.phoneNumber) missingCompanyFields.push('phoneNumber');
    }

    // Get setup status
    const setup = profile.businessSetup || {};
    const setupCompleted = setup.setupCompleted || false;

    // Calculate overall profile completeness
    const profileComplete = companyInfoComplete && setupCompleted;

    // Get tax statuses
    const taxStatuses = {
      paye: setup.payeEnabled ? 'pending' : 'not_configured',
      vat: setup.vatEnabled ? 'pending' : 'not_configured',
      wht: setup.whtEnabled ? 'pending' : 'not_configured',
      cit: setup.citEnabled ? 'pending' : 'not_configured'
    };

    // Check payment eligibility
    const canRequestAccountantReview = profile.filingStatus === 'upload_done' || 
                                      profile.filingStatus === 'pending_accountant_payment';
    const canRequestFilingFee = profile.filingStatus === 'tax_agent_approved' || 
                               profile.filingStatus === 'pending_filing_payment';

    // Prepare summary response
    const summary = {
      profileId: profile._id,
      profileType: profile.profileType,
      year: profile.year,
      companyInfo: {
        ...companyInfo,
        complete: companyInfoComplete,
        missingFields: missingCompanyFields
      },
      setup: {
        ...setup,
        complete: setupCompleted
      },
      taxStatuses,
      paymentEligibility: {
        canRequestAccountantReview,
        canRequestFilingFee
      },
      filingStatus: profile.filingStatus,
      status: profile.status,
      overallComplete: profileComplete,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt
    };

    return res.status(200).json({
      success: true,
      message: 'Business profile summary retrieved',
      summary
    });
  } catch (error) {
    console.error('[BusinessProfile] getBusinessProfileSummary error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving business profile summary',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Check if business profile is ready for payment (accountant review or filing fee)
 * GET /api/taxableprofile/business/:profileId/payment-eligibility
 */
const getBusinessPaymentEligibility = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;
    
    // Verify profile exists and belongs to user
    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found or access denied'
      });
    }

    // Ensure profile is Business type
    if (profile.profileType !== 'Business') {
      return res.status(400).json({
        success: false,
        message: 'Business payment eligibility only available for Business profiles'
      });
    }

    // Check company info completeness
    const companyInfo = profile.businessCompanyInfo || {};
    const companyInfoComplete = !!(companyInfo.companyName && companyInfo.TIN && companyInfo.RCNumber && 
        companyInfo.natureOfBusiness && companyInfo.businessAddress && 
        companyInfo.businessAddress.street && companyInfo.businessAddress.city && 
        companyInfo.businessAddress.state && companyInfo.email && companyInfo.phoneNumber);

    // Check setup completeness
    const setup = profile.businessSetup || {};
    const setupCompleted = setup.setupCompleted || false;

    // Check profile completeness
    const profileComplete = companyInfoComplete && setupCompleted;

    // Determine payment eligibility
    const canRequestAccountantReview = profileComplete && 
                                      (profile.filingStatus === 'upload_done' || 
                                       profile.filingStatus === 'pending_accountant_payment');
    const canRequestFilingFee = profileComplete && 
                               (profile.filingStatus === 'tax_agent_approved' || 
                                profile.filingStatus === 'pending_filing_payment');

    return res.status(200).json({
      success: true,
      message: 'Business payment eligibility retrieved',
      eligibility: {
        profileId: profile._id,
        profileComplete,
        companyInfoComplete,
        setupCompleted,
        canRequestAccountantReview,
        canRequestFilingFee,
        currentFilingStatus: profile.filingStatus,
        requirements: {
          needsCompanyInfo: !companyInfoComplete,
          needsSetup: !setupCompleted,
          needsUploads: profile.filingStatus === 'pending_upload',
          needsAccountantPayment: profile.filingStatus === 'pending_accountant_payment',
          needsTaxAgentReview: profile.filingStatus === 'tax_agent_review',
          needsFilingPayment: profile.filingStatus === 'pending_filing_payment'
        }
      }
    });
  } catch (error) {
    console.error('[BusinessProfile] getBusinessPaymentEligibility error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking payment eligibility',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get consolidated business tax summary across all tax types
 * GET /api/taxableprofile/business/:profileId/tax-summary
 */
const getBusinessTaxSummary = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;

    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Tax profile not found or access denied' });
    }
    if (profile.profileType !== 'Business') {
      return res.status(400).json({ success: false, message: 'Business tax summary only available for Business profiles' });
    }

    const year = parseInt(req.query.year) || profile.year;
    const setup = profile.businessSetup || {};

    // Lazy-require to avoid circular deps
    const StaffPayrollRecord = require('../models/StaffPayrollRecord');
    const VATReturn = require('../models/VATReturn');
    const WHTDeduction = require('../models/WHTDeduction');
    const WHTCredit = require('../models/WHTCredit');
    const CITReturn = require('../models/CITReturn');

    // PAYE
    let payeSummary = { enabled: !!setup.payeEnabled, totalPayeForYear: 0, monthsFiled: 0, monthsPending: 12, status: 'not_configured' };
    if (setup.payeEnabled) {
      const payeRecords = await StaffPayrollRecord.find({ profileId: profile._id, year }).lean();
      const filed = payeRecords.filter(r => r.status === 'filed').length;
      payeSummary = {
        enabled: true,
        totalPayeForYear: payeRecords.reduce((s, r) => s + (r.totalPaye || 0), 0),
        monthsFiled: filed,
        monthsPending: 12 - payeRecords.length,
        status: filed === 12 ? 'completed' : payeRecords.length > 0 ? 'in_progress' : 'not_started'
      };
    }

    // VAT
    let vatSummary = { enabled: !!setup.vatEnabled, totalNetVat: 0, monthsFiled: 0, monthsPending: 12, status: 'not_configured' };
    if (setup.vatEnabled) {
      const vatRecords = await VATReturn.find({ profileId: profile._id, year }).lean();
      const filed = vatRecords.filter(r => r.status === 'filed').length;
      vatSummary = {
        enabled: true,
        totalNetVat: vatRecords.reduce((s, r) => s + (r.netVatPayable || 0), 0),
        monthsFiled: filed,
        monthsPending: 12 - vatRecords.length,
        status: filed === 12 ? 'completed' : vatRecords.length > 0 ? 'in_progress' : 'not_started'
      };
    }

    // WHT
    let whtSummary = { enabled: !!setup.whtEnabled, totalDeducted: 0, totalCredits: 0, status: 'not_configured' };
    if (setup.whtEnabled) {
      const deductions = await WHTDeduction.find({ profileId: profile._id, year }).lean();
      const credits = await WHTCredit.find({ profileId: profile._id, year }).lean();
      whtSummary = {
        enabled: true,
        totalDeducted: deductions.reduce((s, d) => s + (d.whtDeducted || 0), 0),
        totalCredits: credits.reduce((s, c) => s + (c.whtAmount || 0), 0),
        status: deductions.length > 0 || credits.length > 0 ? 'in_progress' : 'not_started'
      };
    }

    // CIT
    let citSummary = { enabled: !!setup.citEnabled, accountingProfit: 0, taxableProfit: 0, citDue: 0, eduTaxDue: 0, credits: { whtCredits: 0, quarterlyPayments: 0 }, netTaxPayable: 0, status: 'not_configured' };
    if (setup.citEnabled) {
      const cit = await CITReturn.findOne({ profileId: profile._id, year }).lean();
      if (cit) {
        const whtCreditsTotal = whtSummary.totalCredits || 0;
        const qPaid = (cit.quarterlyAssessments || []).filter(i => i.status === 'paid').reduce((s, i) => s + (i.amount || 0), 0);
        citSummary = {
          enabled: true,
          accountingProfit: cit.accountingProfit || 0,
          taxableProfit: cit.adjustedTaxableProfit || 0,
          citDue: cit.grossCitOwed || 0,
          eduTaxDue: cit.tertiaryEducationTax || 0,
          credits: { whtCredits: whtCreditsTotal, quarterlyPayments: qPaid },
          netTaxPayable: cit.netCitPayable || 0,
          status: cit.filed ? 'filed' : cit.financials && cit.financials.revenue ? 'in_progress' : 'not_started'
        };
      } else {
        citSummary.status = 'not_started';
      }
    }

    const totalTaxLiability = {
      paye: payeSummary.totalPayeForYear || 0,
      vat: vatSummary.totalNetVat || 0,
      cit: citSummary.netTaxPayable || 0,
      total: (payeSummary.totalPayeForYear || 0) + (vatSummary.totalNetVat || 0) + (citSummary.netTaxPayable || 0)
    };

    return res.status(200).json({
      success: true,
      message: 'Business tax summary retrieved',
      data: {
        profileId: profile._id,
        year,
        paye: payeSummary,
        vat: vatSummary,
        wht: whtSummary,
        cit: citSummary,
        totalTaxLiability
      }
    });
  } catch (error) {
    console.error('[BusinessProfile] getBusinessTaxSummary error:', error);
    return res.status(500).json({ success: false, message: 'Error retrieving business tax summary', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

module.exports = {
  updateBusinessCompanyInfo,
  getBusinessCompanyInfo,
  updateBusinessSetup,
  getBusinessProfileSummary,
  getBusinessPaymentEligibility,
  getBusinessTaxSummary
};