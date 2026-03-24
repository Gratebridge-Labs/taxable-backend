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
  downloadTaxReturn,
  getWebProfiles,
  getWebProfileById,
  deleteWebProfile
} = require('../controllers/profileWebController');
const { updateIncomeDataMonthly, upsertMonthlyIncomeMonth, updateIncomeDataAnnual, getIncomeData } = require('../controllers/incomeDataController');
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

// Helper endpoints (public)
router.get('/allowed-years', getAllowedYears);
router.get('/income-sources', getIncomeSources);

// Profile listing and retrieval
router.get('/', authenticate, checkEmailVerified, getWebProfiles); // List all profiles for web

// Profile creation and management
router.post('/create', authenticate, checkEmailVerified, createWebProfileValidation, createWebProfile);
router.put('/:profileId/complete', authenticate, checkEmailVerified, completeProfile);
router.put('/:profileId/personal-info', authenticate, checkEmailVerified, personalInfoValidation, updatePersonalInfo);
router.post('/:profileId/upload-session', authenticate, checkEmailVerified, createProfileUploadSession);
router.post('/:profileId/submit', authenticate, checkEmailVerified, submitProfileForReview);
router.post('/:profileId/file', authenticate, checkEmailVerified, fileTax);
router.get('/:profileId/calculate', authenticate, checkEmailVerified, calculateWebTax);
router.get('/:profileId/download', authenticate, checkEmailVerified, downloadTaxReturn);
router.delete('/:profileId', authenticate, checkEmailVerified, deleteWebProfile); // Delete profile

// Income data endpoints
router.put('/:profileId/income-data/monthly', authenticate, checkEmailVerified, updateIncomeDataMonthly);
router.put('/:profileId/income-data/monthly/:month', authenticate, checkEmailVerified, upsertMonthlyIncomeMonth);
router.put('/:profileId/income-data/annual', authenticate, checkEmailVerified, updateIncomeDataAnnual);
router.get('/:profileId/income-data', authenticate, checkEmailVerified, getIncomeData);

// NIN verification endpoints (stub)
router.post('/nin/verify', authenticate, checkEmailVerified, verifyNIN);
router.get('/nin/status/:nin', authenticate, checkEmailVerified, getNINStatus);
router.post('/nin/verify-bulk', authenticate, checkEmailVerified, verifyNINBulk);

// Keep dynamic route last so static paths above are not shadowed.
router.get('/:profileId', authenticate, checkEmailVerified, getWebProfileById); // Get single profile for web

module.exports = router;