const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { 
  createWebProfile, 
  completeProfile, 
  createProfileUploadSession,
  submitProfileForReview,
  fileTax,
  getAllowedYears,
  getIncomeSources,
  updatePersonalInfo,
  downloadTaxReturn
} = require('../controllers/profileWebController');
const { calculateWebTax } = require('../controllers/calculationController');
const { verifyNIN, getNINStatus, verifyNINBulk } = require('../controllers/ninController');
const { authenticate } = require('../middleware/auth');
const { checkEmailVerified } = require('../middleware/profileAuth');

// Validation rules for web profile creation (year + type only)
const createWebProfileValidation = [
  body('year')
    .notEmpty().withMessage('Year is required')
    .toInt()
    .isInt({ min: 2025, max: 2026 }).withMessage('Year must be 2025 or 2026'),
  
  body('profileType')
    .trim()
    .notEmpty().withMessage('Profile type is required')
    .isIn(['Individual', 'Business']).withMessage('Profile type must be either Individual or Business')
];

// Validation for complete profile (all optional)
const completeProfileValidation = [
  body('primaryNIN')
    .optional({ values: 'falsy' })
    .trim()
    .matches(/^[0-9]{11}$/).withMessage('NIN must be exactly 11 digits'),
  
  body('primaryIncomeSources')
    .optional({ values: 'falsy' })
    .isArray().withMessage('primaryIncomeSources must be an array'),
  body('primaryIncomeSources.*')
    .optional()
    .trim()
    .isIn(['Salary / Employment', 'Business/Self-employment', 'Freelance/Consulting', 'Investment income', 'Rental income', 'Digital Assets/Crypto']).withMessage('Invalid primary income source'),
  
  body('residency183Days').optional({ values: 'falsy' }).isBoolean().withMessage('residency183Days must be true or false'),
  body('state').optional({ values: 'falsy' }).trim().isLength({ max: 100 }).withMessage('state max 100 characters'),
  body('paysRent').optional({ values: 'falsy' }).isBoolean().withMessage('paysRent must be true or false'),
  body('rentAnnualAmount').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('rentAnnualAmount must be a positive number'),
  body('rentMonthlyAmount').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('rentMonthlyAmount must be a positive number'),
  body('hasHealthInsurance').optional({ values: 'falsy' }).isBoolean().withMessage('hasHealthInsurance must be true or false'),
  body('healthInsuranceAnnualAmount').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('healthInsuranceAnnualAmount must be a positive number'),
  body('healthInsuranceMonthlyAmount').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('healthInsuranceMonthlyAmount must be a positive number'),
  body('hasPension').optional({ values: 'falsy' }).isBoolean().withMessage('hasPension must be true or false'),
  body('pensionAnnualAmount').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('pensionAnnualAmount must be a positive number'),
  body('pensionMonthlyAmount').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('pensionMonthlyAmount must be a positive number'),
  body('paysMortgage').optional({ values: 'falsy' }).isBoolean().withMessage('paysMortgage must be true or false'),
  body('mortgageAnnualAmount').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('mortgageAnnualAmount must be a positive number'),
  body('mortgageMonthlyAmount').optional({ values: 'falsy' }).isFloat({ min: 0 }).withMessage('mortgageMonthlyAmount must be a positive number'),
  body('filingPreference').optional({ values: 'falsy' }).isIn(['monthly', 'annual']).withMessage('filingPreference must be monthly or annual'),
  body('dob').optional({ values: 'falsy' }).isISO8601().withMessage('dob must be a valid date (e.g. YYYY-MM-DD)'),
  body('street').optional({ values: 'falsy' }).trim().isLength({ max: 500 }).withMessage('street max 500 characters'),
  body('city').optional({ values: 'falsy' }).trim().isLength({ max: 100 }).withMessage('city max 100 characters')
];

// Validation for personal info
const personalInfoValidation = [
  body('tin')
    .optional({ values: 'falsy' })
    .trim()
    .matches(/^[0-9]{10,12}$/).withMessage('TIN must be 10-12 digits'),
  
  body('residencyStatus')
    .optional({ values: 'falsy' })
    .trim()
    .isIn(['resident', 'non-resident', 'part-year']).withMessage('Residency status must be resident, non-resident, or part-year'),
  
  body('fullName')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ min: 2, max: 100 }).withMessage('Full name must be between 2 and 100 characters'),
  
  body('dateOfBirth')
    .optional({ values: 'falsy' })
    .isISO8601().withMessage('Date of birth must be a valid date (e.g. YYYY-MM-DD)'),
  
  body('streetAddress')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 500 }).withMessage('Street address cannot exceed 500 characters'),
  
  body('city')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 100 }).withMessage('City cannot exceed 100 characters'),
  
  body('state')
    .optional({ values: 'falsy' })
    .trim()
    .isLength({ max: 100 }).withMessage('State cannot exceed 100 characters')
];

// Profile creation and management
router.post('/create', authenticate, checkEmailVerified, createWebProfileValidation, createWebProfile);
router.put('/:profileId/complete', authenticate, checkEmailVerified, completeProfileValidation, completeProfile);
router.put('/:profileId/personal-info', authenticate, checkEmailVerified, personalInfoValidation, updatePersonalInfo);
router.post('/:profileId/upload-session', authenticate, checkEmailVerified, createProfileUploadSession);
router.post('/:profileId/submit', authenticate, checkEmailVerified, submitProfileForReview);
router.post('/:profileId/file', authenticate, checkEmailVerified, fileTax);
router.get('/:profileId/calculate', authenticate, checkEmailVerified, calculateWebTax);
router.get('/:profileId/download', authenticate, checkEmailVerified, downloadTaxReturn);

// NIN verification endpoints (stub)
router.post('/nin/verify', authenticate, checkEmailVerified, verifyNIN);
router.get('/nin/status/:nin', authenticate, checkEmailVerified, getNINStatus);
router.post('/nin/verify-bulk', authenticate, checkEmailVerified, verifyNINBulk);

// Helper endpoints (no auth required for some)
router.get('/allowed-years', getAllowedYears); // Public
router.get('/income-sources', getIncomeSources); // Public

module.exports = router;