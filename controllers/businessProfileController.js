/**
 * Business Profile Controller
 * Handles business-specific profile operations: company info, setup config, and business summary
 */

const TaxableProfile = require('../models/TaxableProfile');
const { validationResult } = require('express-validator');

/**
 * Update business company information for a Business profile
 * PUT /api/taxableprofile/business/:profileId/company-info
 * Body: { companyName, TIN, RCNumber, natureOfBusiness, businessAddress: { street, city, state, country }, email, phoneNumber, website }
 */
const updateBusinessCompanyInfo = async (req, res) => {
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
    const profile = await TaxableProfile.findOne({
      _id: profileId,
      user: userId
    });

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
        message: 'Business company info can only be updated for Business profiles'
      });
    }

    // Update business company info
    const updateData = {
      businessCompanyInfo: req.body
    };

    // Ensure required fields are present
    if (!req.body.companyName) {
      return res.status(400).json({
        success: false,
        message: 'companyName is required'
      });
    }

    // TIN validation (10-12 digits)
    if (req.body.TIN && !/^[0-9]{10,12}$/.test(req.body.TIN)) {
      return res.status(400).json({
        success: false,
        message: 'TIN must be 10-12 digits'
      });
    }

    // Update profile
    const updatedProfile = await TaxableProfile.findByIdAndUpdate(
      profileId,
      { $set: updateData },
      { new: true, runValidators: true }
    ).select('-__v');

    return res.status(200).json({
      success: true,
      message: 'Business company information updated',
      profile: updatedProfile
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
    const profile = await TaxableProfile.findOne({
      _id: profileId,
      user: userId
    });

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

    // Update profile
    const updatedProfile = await TaxableProfile.findByIdAndUpdate(
      profileId,
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
    const profile = await TaxableProfile.findOne({
      _id: profileId,
      user: userId
    });

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
    const profile = await TaxableProfile.findOne({
      _id: profileId,
      user: userId
    });

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

    const profile = await TaxableProfile.findOne({ _id: profileId, user: userId });
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
  updateBusinessSetup,
  getBusinessProfileSummary,
  getBusinessPaymentEligibility,
  getBusinessTaxSummary
};