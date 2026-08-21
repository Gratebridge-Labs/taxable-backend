const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { 
  updateBusinessCompanyInfo, 
  getBusinessCompanyInfo,
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
const { listBusinessEmployees, addBusinessEmployee, bulkAddEmployees, updateBusinessEmployee, deleteEmployee, getEmployeeById } = require('../controllers/payeEmployeeController');
const { getVat, upsertVat, fileVat, deleteVat } = require('../controllers/vatController');
const {
  getWhtCategories,
  listWhtDeductions,
  addWhtDeduction,
  updateWhtDeduction,
  deleteWhtDeduction,
  fileWhtMonth,
  listWhtCredits,
  addWhtCredit,
  updateWhtCredit,
  deleteWhtCredit
} = require('../controllers/whtController');
const {
  getAnnual,
  upsertAnnual,
  fileAnnual,
  listCitWhtCredits,
  createCitWhtCredit,
  updateCitWhtCredit,
  deleteCitWhtCredit,
  getQuarterly,
  payQuarter,
  deferQuarter
} = require('../controllers/citController');
const { authenticate } = require('../middleware/auth');
const { checkEmailVerified } = require('../middleware/profileAuth');
const { requireBusinessProfile } = require('../middleware/businessAuth');
const { importMulter, downloadSample, parseImport } = require('../controllers/csvImportController');

// Validation rules for business company info.
// All fields are optional so the frontend can partial-save / auto-save the section.
const businessCompanyInfoValidation = [
  body('companyName')
    .optional({ values: 'falsy' })
    .trim()
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

  body('industrySector')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 100 }).withMessage('industrySector must be less than 100 characters'),

  body('dateOfIncorporation')
    .optional({ values: 'falsy' })
    .isISO8601().withMessage('dateOfIncorporation must be a valid date (e.g. YYYY-MM-DD)'),
  
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

  body('businessAddress.lga')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 100 }).withMessage('lga must be less than 100 characters'),
  
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
    .isURL({ require_protocol: false }).withMessage('Invalid website URL'),

  // CIT "pay in quarterly installments" block (rendered on the same screen)
  body('payCitQuarterly')
    .optional()
    .isBoolean().withMessage('payCitQuarterly must be true or false'),

  body('estimatedGrossRevenue')
    .optional({ values: 'falsy' })
    .toFloat()
    .isFloat({ min: 0 }).withMessage('estimatedGrossRevenue must be a positive number'),

  body('estimatedProfitMargin')
    .optional({ values: 'falsy' })
    .toFloat()
    .isFloat({ min: 0, max: 100 }).withMessage('estimatedProfitMargin must be between 0 and 100')
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

// Validation for adding an employee via the business PAYE form
const businessEmployeeValidation = [
  body('month')
    .notEmpty().withMessage('month is required (PAYE is managed per month)')
    .toInt()
    .isInt({ min: 1, max: 12 }).withMessage('month must be between 1 and 12'),

  body('firstName')
    .trim().notEmpty().withMessage('First name is required')
    .isLength({ max: 50 }).withMessage('First name cannot exceed 50 characters'),

  body('lastName')
    .trim().notEmpty().withMessage('Last name is required')
    .isLength({ max: 50 }).withMessage('Last name cannot exceed 50 characters'),

  body('email')
    .trim().notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),

  body('phone')
    .trim().notEmpty().withMessage('Phone number is required')
    .matches(/^(\+?234[\s-]?)?[0-9]{3}[\s-]?[0-9]{3}[\s-]?[0-9]{4}$|^0?[0-9]{10}$/)
    .withMessage('Please provide a valid phone number'),

  body('jobPosition')
    .trim().notEmpty().withMessage('Job position is required')
    .isLength({ max: 100 }).withMessage('Job position cannot exceed 100 characters'),

  body('jtbTaxId')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 50 }).withMessage('JTB Tax ID cannot exceed 50 characters'),

  body('monthlySalary')
    .notEmpty().withMessage('Monthly salary is required')
    .toFloat()
    .isFloat({ min: 0 }).withMessage('Monthly salary must be a positive number'),

  body('deductions').optional({ values: 'falsy' }).isObject().withMessage('deductions must be an object'),
  body('deductions.pension').optional().isBoolean().withMessage('deductions.pension must be true or false'),
  body('deductions.nhf').optional().isBoolean().withMessage('deductions.nhf must be true or false'),
  body('deductions.hmo').optional().isBoolean().withMessage('deductions.hmo must be true or false'),
  body('deductions.annualRent').optional().isBoolean().withMessage('deductions.annualRent must be true or false'),

  body('annualRentAmount')
    .optional({ values: 'falsy' })
    .toFloat()
    .isFloat({ min: 0 }).withMessage('annualRentAmount must be a positive number'),

  // When the annual rent toggle is on, the annual rent value must be provided
  body('annualRentAmount').custom((value, { req }) => {
    const annualRent = req.body?.deductions?.annualRent;
    const wantsRent = annualRent === true || annualRent === 'true';
    if (wantsRent && !(Number(value) > 0)) {
      throw new Error('annualRentAmount is required and must be greater than 0 when annual rent is selected');
    }
    return true;
  })
];

// Validation for updating an employee (partial — all fields optional).
// The annual-rent-value rule is enforced in the controller after merging
// with the employee's existing toggles.
const businessEmployeeUpdateValidation = [
  body('firstName').optional({ values: 'falsy' }).trim().isLength({ max: 50 }).withMessage('First name cannot exceed 50 characters'),
  body('lastName').optional({ values: 'falsy' }).trim().isLength({ max: 50 }).withMessage('Last name cannot exceed 50 characters'),
  body('email').optional({ values: 'falsy' }).trim().isEmail().withMessage('Please provide a valid email address').normalizeEmail(),
  body('phone').optional({ values: 'falsy' }).trim()
    .matches(/^(\+?234[\s-]?)?[0-9]{3}[\s-]?[0-9]{3}[\s-]?[0-9]{4}$|^0?[0-9]{10}$/).withMessage('Please provide a valid phone number'),
  body('jobPosition').optional({ values: 'falsy' }).trim().isLength({ max: 100 }).withMessage('Job position cannot exceed 100 characters'),
  body('jtbTaxId').optional({ values: 'falsy' }).trim().isLength({ max: 50 }).withMessage('JTB Tax ID cannot exceed 50 characters'),
  body('monthlySalary').optional({ values: 'falsy' }).toFloat().isFloat({ min: 0 }).withMessage('Monthly salary must be a positive number'),
  body('deductions').optional({ values: 'falsy' }).isObject().withMessage('deductions must be an object'),
  body('deductions.pension').optional().isBoolean().withMessage('deductions.pension must be true or false'),
  body('deductions.nhf').optional().isBoolean().withMessage('deductions.nhf must be true or false'),
  body('deductions.hmo').optional().isBoolean().withMessage('deductions.hmo must be true or false'),
  body('deductions.annualRent').optional().isBoolean().withMessage('deductions.annualRent must be true or false'),
  body('annualRentAmount').optional({ values: 'falsy' }).toFloat().isFloat({ min: 0 }).withMessage('annualRentAmount must be a positive number')
];

// CSV / Excel import (sample download is not profile-scoped — register before /:profileId)
router.get('/import/samples/:type', authenticate, downloadSample);
router.post(
  '/:profileId/import',
  authenticate,
  checkEmailVerified,
  requireBusinessProfile,
  (req, res, next) => {
    importMulter.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message || 'Failed to upload file' });
      }
      next();
    });
  },
  parseImport
);

// Business profile routes
router.get('/:profileId/company-info', authenticate, checkEmailVerified, getBusinessCompanyInfo);
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

// ── PAYE Employee roster (managed per month) ──
router.get('/:profileId/paye/employees', authenticate, checkEmailVerified, requireBusinessProfile, listBusinessEmployees);
router.post('/:profileId/paye/employees/bulk', authenticate, checkEmailVerified, requireBusinessProfile, bulkAddEmployees);
router.post('/:profileId/paye/employees', authenticate, checkEmailVerified, requireBusinessProfile, businessEmployeeValidation, addBusinessEmployee);
router.get('/:profileId/paye/employees/:employeeId', authenticate, checkEmailVerified, requireBusinessProfile, getEmployeeById);
router.put('/:profileId/paye/employees/:employeeId', authenticate, checkEmailVerified, requireBusinessProfile, businessEmployeeUpdateValidation, updateBusinessEmployee);
router.delete('/:profileId/paye/employees/:employeeId', authenticate, checkEmailVerified, requireBusinessProfile, deleteEmployee);

// ── PAYE Routes ──
router.put('/:profileId/paye/monthly/:month', authenticate, checkEmailVerified, requireBusinessProfile, upsertMonthlyPaye);
router.get('/:profileId/paye', authenticate, checkEmailVerified, requireBusinessProfile, getPayeRecords);
router.get('/:profileId/paye/annual', authenticate, checkEmailVerified, requireBusinessProfile, getAnnualPayeSummary);
router.post('/:profileId/paye/annual-submit', authenticate, checkEmailVerified, requireBusinessProfile, submitAnnualPaye);

// ── VAT Routes (month-scoped; year/month via query or body) ──
router.get('/:profileId/vat', authenticate, checkEmailVerified, requireBusinessProfile, getVat);
router.put('/:profileId/vat', authenticate, checkEmailVerified, requireBusinessProfile, upsertVat);
router.post('/:profileId/vat/file', authenticate, checkEmailVerified, requireBusinessProfile, fileVat);
router.delete('/:profileId/vat', authenticate, checkEmailVerified, requireBusinessProfile, deleteVat);

// ── WHT Routes (month-scoped deductions; year/month via query or body) ──
router.get('/:profileId/wht/categories', authenticate, checkEmailVerified, requireBusinessProfile, getWhtCategories);
router.get('/:profileId/wht/deductions', authenticate, checkEmailVerified, requireBusinessProfile, listWhtDeductions);
router.post('/:profileId/wht/deductions', authenticate, checkEmailVerified, requireBusinessProfile, addWhtDeduction);
router.put('/:profileId/wht/deductions/:deductionId', authenticate, checkEmailVerified, requireBusinessProfile, updateWhtDeduction);
router.delete('/:profileId/wht/deductions/:deductionId', authenticate, checkEmailVerified, requireBusinessProfile, deleteWhtDeduction);
router.post('/:profileId/wht/file', authenticate, checkEmailVerified, requireBusinessProfile, fileWhtMonth);
router.get('/:profileId/wht/credits', authenticate, checkEmailVerified, requireBusinessProfile, listWhtCredits);
router.post('/:profileId/wht/credits', authenticate, checkEmailVerified, requireBusinessProfile, addWhtCredit);
router.put('/:profileId/wht/credits/:creditId', authenticate, checkEmailVerified, requireBusinessProfile, updateWhtCredit);
router.delete('/:profileId/wht/credits/:creditId', authenticate, checkEmailVerified, requireBusinessProfile, deleteWhtCredit);

// ── CIT Routes (year-scoped; ?year= on GETs, year in body on writes) ──
router.get('/:profileId/cit', authenticate, checkEmailVerified, requireBusinessProfile, getAnnual);
router.put('/:profileId/cit', authenticate, checkEmailVerified, requireBusinessProfile, upsertAnnual);
router.post('/:profileId/cit/file', authenticate, checkEmailVerified, requireBusinessProfile, fileAnnual);

router.get('/:profileId/cit/wht-credits', authenticate, checkEmailVerified, requireBusinessProfile, listCitWhtCredits);
router.post('/:profileId/cit/wht-credits', authenticate, checkEmailVerified, requireBusinessProfile, createCitWhtCredit);
router.put('/:profileId/cit/wht-credits/:creditId', authenticate, checkEmailVerified, requireBusinessProfile, updateCitWhtCredit);
router.delete('/:profileId/cit/wht-credits/:creditId', authenticate, checkEmailVerified, requireBusinessProfile, deleteCitWhtCredit);

router.get('/:profileId/cit/quarterly', authenticate, checkEmailVerified, requireBusinessProfile, getQuarterly);
router.post('/:profileId/cit/quarterly/pay', authenticate, checkEmailVerified, requireBusinessProfile, payQuarter);
router.post('/:profileId/cit/quarterly/defer', authenticate, checkEmailVerified, requireBusinessProfile, deferQuarter);

module.exports = router;