const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { 
  updateBusinessCompanyInfo, 
  updateBusinessSetup, 
  getBusinessProfileSummary,
  getBusinessPaymentEligibility,
  getBusinessTaxSummary
} = require('../controllers/businessProfileController');
const {
  createBusinessTaxAgentPaymentLink,
  createBusinessFilingFeePaymentLink,
  getBusinessPaymentOptions
} = require('../controllers/businessPaymentController');
const { upsertMonthlyPaye, getPayeRecords, getAnnualPayeSummary, submitAnnualPaye } = require('../controllers/payeController');
const { upsertMonthlyVat, getVatRecords, verifyVatReturn } = require('../controllers/vatController');
const { addWhtDeduction, updateWhtDeduction, deleteWhtDeduction, addWhtCredit, getWhtRecords, remitWht } = require('../controllers/whtController');
const { getCitRecords, getQuarterlyAssessments, updateQuarterlyAssessment, payQuarterlyInstallment, deferQuarterlyInstallment, saveCitFinancials, saveCitAdjustments, getCitComputation, submitCitReturn } = require('../controllers/citController');
const { authenticate } = require('../middleware/auth');
const { checkEmailVerified } = require('../middleware/profileAuth');
const { requireBusinessProfile } = require('../middleware/businessAuth');

// Validation rules for business company info
const businessCompanyInfoValidation = [
  body('companyName')
    .trim()
    .notEmpty().withMessage('companyName is required')
    .isLength({ max: 200 }).withMessage('companyName must be less than 200 characters'),
  
  body('TIN')
    .optional({ values: 'falsy' })
    .trim()
    .matches(/^[0-9]{10,12}$/).withMessage('TIN must be 10-12 digits'),
  
  body('RCNumber')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 50 }).withMessage('RCNumber must be less than 50 characters'),
  
  body('natureOfBusiness')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 500 }).withMessage('natureOfBusiness must be less than 500 characters'),
  
  body('businessAddress')
    .optional({ values: 'falsy' })
    .isObject().withMessage('businessAddress must be an object'),
  
  body('businessAddress.street')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 500 }).withMessage('street must be less than 500 characters'),
  
  body('businessAddress.city')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 100 }).withMessage('city must be less than 100 characters'),
  
  body('businessAddress.state')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 100 }).withMessage('state must be less than 100 characters'),
  
  body('businessAddress.country')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 100 }).withMessage('country must be less than 100 characters'),
  
  body('email')
    .optional({ values: 'falsy' })
    .trim()
    .isEmail().withMessage('Invalid email address')
    .normalizeEmail(),
  
  body('phoneNumber')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 20 }).withMessage('phoneNumber must be less than 20 characters'),
  
  body('website')
    .optional({ values: 'falsy' })
    .trim()
    .isURL({ require_protocol: false }).withMessage('Invalid website URL')
];

// Validation rules for business setup configuration
const businessSetupValidation = [
  body('payeEnabled')
    .optional({ values: 'falsy' })
    .isBoolean().withMessage('payeEnabled must be true or false'),
  
  body('vatEnabled')
    .optional({ values: 'falsy' })
    .isBoolean().withMessage('vatEnabled must be true or false'),
  
  body('whtEnabled')
    .optional({ values: 'falsy' })
    .isBoolean().withMessage('whtEnabled must be true or false'),
  
  body('citEnabled')
    .optional({ values: 'falsy' })
    .isBoolean().withMessage('citEnabled must be true or false'),
  
  body('filingFrequency')
    .optional({ values: 'falsy' })
    .trim()
    .isIn(['monthly', 'quarterly', 'annually']).withMessage('filingFrequency must be monthly, quarterly, or annually'),
  
  body('financialYearEnd')
    .optional({ values: 'falsy' })
    .trim()
    .isIn(['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'])
    .withMessage('Invalid financialYearEnd'),
  
  body('accountingMethod')
    .optional({ values: 'falsy' })
    .trim()
    .isIn(['cash', 'accrual']).withMessage('accountingMethod must be cash or accrual'),
  
  body('currency')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 3 }).withMessage('currency must be 3 characters (e.g., NGN)'),
  
  body('hasEmployees')
    .optional({ values: 'falsy' })
    .isBoolean().withMessage('hasEmployees must be true or false'),
  
  body('numberOfEmployees')
    .optional({ values: 'falsy' })
    .toInt()
    .isInt({ min: 0 }).withMessage('numberOfEmployees must be a positive integer'),
  
  body('averageMonthlySalary')
    .optional({ values: 'falsy' })
    .toFloat()
    .isFloat({ min: 0 }).withMessage('averageMonthlySalary must be a positive number')
];

// Business profile routes
router.put('/:profileId/company-info', authenticate, checkEmailVerified, businessCompanyInfoValidation, updateBusinessCompanyInfo);
router.put('/:profileId/setup', authenticate, checkEmailVerified, businessSetupValidation, updateBusinessSetup);
router.get('/:profileId/summary', authenticate, checkEmailVerified, getBusinessProfileSummary);
router.get('/:profileId/payment-eligibility', authenticate, checkEmailVerified, getBusinessPaymentEligibility);

// Business payment routes
router.post('/:profileId/payments/tax-agent', authenticate, checkEmailVerified, createBusinessTaxAgentPaymentLink);
router.post('/:profileId/payments/filing', authenticate, checkEmailVerified, createBusinessFilingFeePaymentLink);
router.get('/:profileId/payments/options', authenticate, checkEmailVerified, getBusinessPaymentOptions);

// Business tax summary
router.get('/:profileId/tax-summary', authenticate, checkEmailVerified, getBusinessTaxSummary);

// ── PAYE Routes ──
router.put('/:profileId/paye/monthly/:month', authenticate, checkEmailVerified, requireBusinessProfile, upsertMonthlyPaye);
router.get('/:profileId/paye', authenticate, checkEmailVerified, requireBusinessProfile, getPayeRecords);
router.get('/:profileId/paye/annual', authenticate, checkEmailVerified, requireBusinessProfile, getAnnualPayeSummary);
router.post('/:profileId/paye/annual-submit', authenticate, checkEmailVerified, requireBusinessProfile, submitAnnualPaye);

// ── VAT Routes ──
router.put('/:profileId/vat/:month', authenticate, checkEmailVerified, requireBusinessProfile, upsertMonthlyVat);
router.get('/:profileId/vat', authenticate, checkEmailVerified, requireBusinessProfile, getVatRecords);
router.post('/:profileId/vat/:month/verify', authenticate, checkEmailVerified, requireBusinessProfile, verifyVatReturn);

// ── WHT Routes ──
router.get('/:profileId/wht', authenticate, checkEmailVerified, requireBusinessProfile, getWhtRecords);
router.post('/:profileId/wht/deductions', authenticate, checkEmailVerified, requireBusinessProfile, addWhtDeduction);
router.put('/:profileId/wht/deductions/:deductionId', authenticate, checkEmailVerified, requireBusinessProfile, updateWhtDeduction);
router.delete('/:profileId/wht/deductions/:deductionId', authenticate, checkEmailVerified, requireBusinessProfile, deleteWhtDeduction);
router.post('/:profileId/wht/credits', authenticate, checkEmailVerified, requireBusinessProfile, addWhtCredit);
router.post('/:profileId/wht/remit', authenticate, checkEmailVerified, requireBusinessProfile, remitWht);

// ── CIT Routes ──
router.get('/:profileId/cit', authenticate, checkEmailVerified, requireBusinessProfile, getCitRecords);
router.get('/:profileId/cit/assessments', authenticate, checkEmailVerified, requireBusinessProfile, getQuarterlyAssessments);
router.put('/:profileId/cit/quarterly', authenticate, checkEmailVerified, requireBusinessProfile, updateQuarterlyAssessment);
router.post('/:profileId/cit/quarterly/:quarter/pay', authenticate, checkEmailVerified, requireBusinessProfile, payQuarterlyInstallment);
router.post('/:profileId/cit/quarterly/:quarter/defer', authenticate, checkEmailVerified, requireBusinessProfile, deferQuarterlyInstallment);
router.put('/:profileId/cit/financials', authenticate, checkEmailVerified, requireBusinessProfile, saveCitFinancials);
router.put('/:profileId/cit/adjustments', authenticate, checkEmailVerified, requireBusinessProfile, saveCitAdjustments);
router.get('/:profileId/cit/computation', authenticate, checkEmailVerified, requireBusinessProfile, getCitComputation);
router.post('/:profileId/cit/submit', authenticate, checkEmailVerified, requireBusinessProfile, submitCitReturn);

module.exports = router;