const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { createProfile, getUserProfiles, getProfileById, submitTaxInformation, fileTax } = require('../controllers/profileController');
const { authenticate } = require('../middleware/auth');
const { checkEmailVerified } = require('../middleware/profileAuth');

// Validation rules for creating profile
// POST /create body (all except year and profileType are optional):
//   year, profileType, nin, intent, primaryIncomeSources[], residency183Days, paysRent, hasHealthInsurance, hasPension, paysMortgage
const createProfileValidation = [
  body('year')
    .notEmpty().withMessage('Year is required')
    .toInt()
    .isInt({ min: 2020, max: 2100 }).withMessage('Year must be a valid 4-digit year between 2020 and 2100'),
  
  body('profileType')
    .trim()
    .notEmpty().withMessage('Profile type is required')
    .isIn(['Individual', 'Business']).withMessage('Profile type must be either Individual or Business'),

  body('nin')
    .optional({ values: 'falsy' })
    .trim()
    .matches(/^[0-9]{11}$/).withMessage('NIN must be exactly 11 digits'),

  body('intent')
    .optional({ values: 'falsy' })
    .trim()
    .isIn(['file_returns', 'calculate_paye']).withMessage('Intent must be file_returns or calculate_paye'),

  body('primaryIncomeSources')
    .optional({ values: 'falsy' })
    .isArray().withMessage('primaryIncomeSources must be an array'),
  body('primaryIncomeSources.*')
    .optional()
    .trim()
    .isIn(['Salary / Employment', 'Business/Self-employment', 'Freelance/Consulting', 'Investment income', 'Rental income', 'Digital Assets/Crypto']).withMessage('Invalid primary income source'),

  body('residency183Days').optional({ values: 'falsy' }).isBoolean().withMessage('residency183Days must be true or false'),
  body('paysRent').optional({ values: 'falsy' }).isBoolean().withMessage('paysRent must be true or false'),
  body('hasHealthInsurance').optional({ values: 'falsy' }).isBoolean().withMessage('hasHealthInsurance must be true or false'),
  body('hasPension').optional({ values: 'falsy' }).isBoolean().withMessage('hasPension must be true or false'),
  body('paysMortgage').optional({ values: 'falsy' }).isBoolean().withMessage('paysMortgage must be true or false')
];

// Protected routes (require authentication and email verification)
router.post('/create', authenticate, checkEmailVerified, createProfileValidation, createProfile);
router.get('/list', authenticate, checkEmailVerified, getUserProfiles);
router.get('/:profileId', authenticate, checkEmailVerified, getProfileById);
router.post('/:profileId/submit', authenticate, checkEmailVerified, submitTaxInformation); // Submit tax information for review
router.post('/:profileId/file', authenticate, checkEmailVerified, fileTax); // File tax (after approval)

module.exports = router;

