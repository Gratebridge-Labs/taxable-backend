/**
 * Business Payment Controller
 * Handles business-specific payment operations with additional validation for business completeness
 */

const TaxableProfile = require('../models/TaxableProfile');
const { createFilingPaymentLink } = require('./paystackController');

/**
 * Create a tax agent review payment link for business profiles with business completeness validation
 * POST /api/taxableprofile/business/:profileId/payments/tax-agent
 * Returns: { authorization_url, reference, type, amountNaira }
 */
const createBusinessTaxAgentPaymentLink = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;
    const type = 'accountant_review';

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!profileId) {
      return res.status(400).json({
        success: false,
        message: 'profileId is required'
      });
    }

    // Verify profile exists and belongs to user (accepts custom profileId or Mongo _id)
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
        message: 'Business payment endpoints are only for Business profiles'
      });
    }

    // Business-specific validation: check company info and setup completeness
    const companyInfo = profile.businessCompanyInfo || {};
    const companyInfoComplete = !!(companyInfo.companyName && companyInfo.TIN && companyInfo.RCNumber && 
        companyInfo.natureOfBusiness && companyInfo.businessAddress && 
        companyInfo.businessAddress.street && companyInfo.businessAddress.city && 
        companyInfo.businessAddress.state && companyInfo.email && companyInfo.phoneNumber);

    const setup = profile.businessSetup || {};
    const setupCompleted = setup.setupCompleted || false;

    if (!companyInfoComplete) {
      return res.status(400).json({
        success: false,
        message: 'Business company information is incomplete. Please complete company info before requesting payment.',
        missingFields: {
          companyName: !companyInfo.companyName,
          TIN: !companyInfo.TIN,
          RCNumber: !companyInfo.RCNumber,
          natureOfBusiness: !companyInfo.natureOfBusiness,
          businessAddress: !companyInfo.businessAddress?.street || !companyInfo.businessAddress?.city || !companyInfo.businessAddress?.state,
          email: !companyInfo.email,
          phoneNumber: !companyInfo.phoneNumber
        }
      });
    }

    if (!setupCompleted) {
      return res.status(400).json({
        success: false,
        message: 'Business setup is incomplete. Please configure at least one tax type (PAYE, VAT, WHT, or CIT) before requesting payment.',
        missingSetup: {
          payeEnabled: !setup.payeEnabled,
          vatEnabled: !setup.vatEnabled,
          whtEnabled: !setup.whtEnabled,
          citEnabled: !setup.citEnabled,
          setupCompleted: false
        }
      });
    }

    // Validate profile status for accountant review payment
    if (!['draft', 'submitted', 'upload_done'].includes(profile.filingStatus)) {
      return res.status(400).json({
        success: false,
        message: 'Accountant review payment only available for draft, submitted, or upload_done profiles'
      });
    }

    // Create payment link using existing function
    const data = await createFilingPaymentLink(userId, profile._id, type);

    return res.status(200).json({
      success: true,
      message: 'Business tax agent review payment link created',
      data
    });
  } catch (error) {
    console.error('[BusinessPayment] createBusinessTaxAgentPaymentLink error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error creating business tax agent review payment link',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Create a filing fee payment link for business profiles with business completeness validation
 * POST /api/taxableprofile/business/:profileId/payments/filing
 * Returns: { authorization_url, reference, type, amountNaira }
 */
const createBusinessFilingFeePaymentLink = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;
    const type = 'filing_fee';

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (!profileId) {
      return res.status(400).json({
        success: false,
        message: 'profileId is required'
      });
    }

    // Verify profile exists and belongs to user (accepts custom profileId or Mongo _id)
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
        message: 'Business payment endpoints are only for Business profiles'
      });
    }

    // Business-specific validation: check company info and setup completeness
    const companyInfo = profile.businessCompanyInfo || {};
    const companyInfoComplete = !!(companyInfo.companyName && companyInfo.TIN && companyInfo.RCNumber && 
        companyInfo.natureOfBusiness && companyInfo.businessAddress && 
        companyInfo.businessAddress.street && companyInfo.businessAddress.city && 
        companyInfo.businessAddress.state && companyInfo.email && companyInfo.phoneNumber);

    const setup = profile.businessSetup || {};
    const setupCompleted = setup.setupCompleted || false;

    if (!companyInfoComplete) {
      return res.status(400).json({
        success: false,
        message: 'Business company information is incomplete. Please complete company info before requesting payment.',
        missingFields: {
          companyName: !companyInfo.companyName,
          TIN: !companyInfo.TIN,
          RCNumber: !companyInfo.RCNumber,
          natureOfBusiness: !companyInfo.natureOfBusiness,
          businessAddress: !companyInfo.businessAddress?.street || !companyInfo.businessAddress?.city || !companyInfo.businessAddress?.state,
          email: !companyInfo.email,
          phoneNumber: !companyInfo.phoneNumber
        }
      });
    }

    if (!setupCompleted) {
      return res.status(400).json({
        success: false,
        message: 'Business setup is incomplete. Please configure at least one tax type (PAYE, VAT, WHT, or CIT) before requesting payment.',
        missingSetup: {
          payeEnabled: !setup.payeEnabled,
          vatEnabled: !setup.vatEnabled,
          whtEnabled: !setup.whtEnabled,
          citEnabled: !setup.citEnabled,
          setupCompleted: false
        }
      });
    }

    // Validate profile status for filing fee payment
    if (profile.filingStatus !== 'tax_agent_review' && profile.filingStatus !== 'tax_agent_approved') {
      return res.status(400).json({
        success: false,
        message: 'Filing fee payment only available after tax agent review'
      });
    }

    // Create payment link using existing function
    const data = await createFilingPaymentLink(userId, profile._id, type);

    return res.status(200).json({
      success: true,
      message: 'Business filing fee payment link created',
      data
    });
  } catch (error) {
    console.error('[BusinessPayment] createBusinessFilingFeePaymentLink error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error creating business filing fee payment link',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get business payment options and eligibility
 * GET /api/taxableprofile/business/:profileId/payments/options
 */
const getBusinessPaymentOptions = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    // Verify profile exists and belongs to user (accepts custom profileId or Mongo _id)
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
        message: 'Business payment options only available for Business profiles'
      });
    }

    // Business-specific validation
    const companyInfo = profile.businessCompanyInfo || {};
    const companyInfoComplete = !!(companyInfo.companyName && companyInfo.TIN && companyInfo.RCNumber && 
        companyInfo.natureOfBusiness && companyInfo.businessAddress && 
        companyInfo.businessAddress.street && companyInfo.businessAddress.city && 
        companyInfo.businessAddress.state && companyInfo.email && companyInfo.phoneNumber);

    const setup = profile.businessSetup || {};
    const setupCompleted = setup.setupCompleted || false;

    const businessComplete = companyInfoComplete && setupCompleted;

    // Determine available payment options based on filingStatus and business completeness
    const options = {
      accountantReview: {
        available: businessComplete && ['draft', 'submitted', 'upload_done'].includes(profile.filingStatus),
        amount: 30000, // ₦30,000
        description: 'Tax Agent Review - Professional review of your business tax profile',
        requirements: {
          businessComplete,
          filingStatus: profile.filingStatus,
          requiredStatus: ['draft', 'submitted', 'upload_done']
        }
      },
      filingFee: {
        available: businessComplete && ['tax_agent_review', 'tax_agent_approved'].includes(profile.filingStatus),
        amount: 25000, // ₦25,000
        description: 'Filing Fee - Submit your business tax returns to FIRS',
        requirements: {
          businessComplete,
          filingStatus: profile.filingStatus,
          requiredStatus: ['tax_agent_review', 'tax_agent_approved']
        }
      }
    };

    // Get missing requirements for each option
    const missingRequirements = {
      companyInfo: !companyInfoComplete ? {
        missingFields: {
          companyName: !companyInfo.companyName,
          TIN: !companyInfo.TIN,
          RCNumber: !companyInfo.RCNumber,
          natureOfBusiness: !companyInfo.natureOfBusiness,
          businessAddress: !companyInfo.businessAddress?.street || !companyInfo.businessAddress?.city || !companyInfo.businessAddress?.state,
          email: !companyInfo.email,
          phoneNumber: !companyInfo.phoneNumber
        }
      } : null,
      setup: !setupCompleted ? {
        missingConfig: {
          payeEnabled: !setup.payeEnabled,
          vatEnabled: !setup.vatEnabled,
          whtEnabled: !setup.whtEnabled,
          citEnabled: !setup.citEnabled
        }
      } : null
    };

    return res.status(200).json({
      success: true,
      message: 'Business payment options retrieved',
      options,
      businessComplete,
      companyInfoComplete,
      setupCompleted,
      filingStatus: profile.filingStatus,
      missingRequirements: Object.values(missingRequirements).filter(Boolean).length > 0 ? missingRequirements : null
    });
  } catch (error) {
    console.error('[BusinessPayment] getBusinessPaymentOptions error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error retrieving business payment options',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  createBusinessTaxAgentPaymentLink,
  createBusinessFilingFeePaymentLink,
  getBusinessPaymentOptions
};