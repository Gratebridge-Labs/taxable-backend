const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
  listIncome,
  addIncome,
  updateIncome,
  deleteIncome,
  getIncomeSummary
} = require('../controllers/incomeController');
const { authenticate } = require('../middleware/auth');
const { checkEmailVerified } = require('../middleware/profileAuth');

// Validation rules for adding income
const addIncomeValidation = [
  body('type')
    .trim()
    .notEmpty().withMessage('Income type is required')
    .isIn(['employment', 'business', 'rental', 'investment', 'freelance', 'crypto', 'other'])
    .withMessage('Income type must be one of: employment, business, rental, investment, freelance, crypto, other'),
  
  body('category')
    .optional()
    .trim()
    .isIn(['salary', 'bonus', 'commission', 'freelance_fee', 'royalty', 'rental', 'dividend', 'interest', 'capital_gain', 'crypto', 'other'])
    .withMessage('Invalid income category'),
  
  body('amount')
    .optional()
    .isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  
  body('month')
    .optional()
    .isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
  
  body('year')
    .optional()
    .isInt({ min: 2020, max: 2100 }).withMessage('Year must be a valid year'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Description cannot exceed 1000 characters'),
  
  // Employment fields
  body('employerName')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Employer name cannot exceed 200 characters'),
  
  body('employerTIN')
    .optional()
    .trim()
    .matches(/^[0-9]{10,12}$/).withMessage('Employer TIN must be 10-12 digits'),
  
  body('bonuses')
    .optional()
    .isFloat({ min: 0 }).withMessage('Bonuses must be a positive number'),
  
  body('commissions')
    .optional()
    .isFloat({ min: 0 }).withMessage('Commissions must be a positive number'),
  
  // Freelance fields
  body('clientName')
    .optional()
    .trim()
    .isLength({ max: 200 }).withMessage('Client name cannot exceed 200 characters'),
  
  body('freelanceFees')
    .optional()
    .isFloat({ min: 0 }).withMessage('Freelance fees must be a positive number'),
  
  body('royalties')
    .optional()
    .isFloat({ min: 0 }).withMessage('Royalties must be a positive number'),
  
  // Crypto fields
  body('platformName')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Platform name cannot exceed 100 characters'),
  
  body('cryptoType')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('Crypto type cannot exceed 50 characters'),
  
  body('amountInNGN')
    .optional()
    .isFloat({ min: 0 }).withMessage('Amount in NGN must be a positive number')
];

// Validation rules for updating income (all optional)
const updateIncomeValidation = [
  body('type')
    .optional()
    .trim()
    .isIn(['employment', 'business', 'rental', 'investment', 'freelance', 'crypto', 'other'])
    .withMessage('Income type must be one of: employment, business, rental, investment, freelance, crypto, other'),
  
  body('category')
    .optional()
    .trim()
    .isIn(['salary', 'bonus', 'commission', 'freelance_fee', 'royalty', 'rental', 'dividend', 'interest', 'capital_gain', 'crypto', 'other'])
    .withMessage('Invalid income category'),
  
  body('amount')
    .optional()
    .isFloat({ min: 0 }).withMessage('Amount must be a positive number'),
  
  body('month')
    .optional()
    .isInt({ min: 1, max: 12 }).withMessage('Month must be between 1 and 12'),
  
  body('year')
    .optional()
    .isInt({ min: 2020, max: 2100 }).withMessage('Year must be a valid year'),
  
  body('description')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Description cannot exceed 1000 characters')
];

// Income CRUD routes
router.get('/:profileId/income', authenticate, checkEmailVerified, listIncome);
router.post('/:profileId/income', authenticate, checkEmailVerified, addIncomeValidation, addIncome);
router.put('/:profileId/income/:incomeId', authenticate, checkEmailVerified, updateIncomeValidation, updateIncome);
router.delete('/:profileId/income/:incomeId', authenticate, checkEmailVerified, deleteIncome);
router.get('/:profileId/income/summary', authenticate, checkEmailVerified, getIncomeSummary);

module.exports = router;