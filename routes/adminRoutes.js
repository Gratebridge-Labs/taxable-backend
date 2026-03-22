const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
  createAdmin,
  adminLogin,
  changeAdminPassword,
  getAllUsers,
  getAllTaxableProfiles,
  getAllProfileReviews,
  getFilledProfiles,
  addProfileNotes,
  updateTaxFilingStatus,
  approveNIN,
  generateFilingPaymentLinkForAdmin
} = require('../controllers/adminController');
const { authenticateAdmin } = require('../middleware/adminAuth');

// Validation rules for admin creation
const createAdminValidation = [
  body('fullName')
    .trim()
    .notEmpty().withMessage('Full name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Full name must be between 2 and 100 characters'),
  
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),
  
  body('adminCode')
    .trim()
    .notEmpty().withMessage('Admin code is required')
    .equals('274950').withMessage('Invalid admin code'),
  
  body('role')
    .optional()
    .isIn(['Root Admin', 'Accountant', 'General']).withMessage('Role must be Root Admin, Accountant, or General')
];

// Validation rules for admin login
const adminLoginValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('password')
    .notEmpty().withMessage('Password is required')
];

// Validation rules for change password
const changePasswordValidation = [
  body('oldPassword')
    .notEmpty().withMessage('Current password is required'),
  
  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
];

// Public routes
router.post('/create', createAdminValidation, createAdmin);
router.post('/login', adminLoginValidation, adminLogin);

// Validation rules for adding profile notes
const addProfileNotesValidation = [
  body('adminNotes')
    .optional()
    .trim()
    .isLength({ max: 5000 }).withMessage('Admin notes cannot exceed 5000 characters'),
  
  body('adminMetadata')
    .optional()
    .isObject().withMessage('Admin metadata must be an object')
];

// Validation rules for updating filing status
const updateFilingStatusValidation = [
  body('filingStatus')
    .trim()
    .notEmpty().withMessage('filingStatus is required')
    .isIn([
      'pending_upload',
      'upload_done',
      'pending_accountant_payment',
      'tax_agent_review',
      'tax_agent_approved',
      'pending_filing_payment',
      'filed'
    ])
    .withMessage('Invalid filingStatus value')
];

// Validation for generating filing payment link
const generateFilingLinkValidation = [
  body('userId')
    .trim()
    .notEmpty().withMessage('userId is required'),
  body('type')
    .optional()
    .isIn(['accountant_review', 'filing_fee']).withMessage('type must be accountant_review or filing_fee')
];

// Validation for NIN approval
const ninApprovalValidation = [
  body('verified')
    .notEmpty().withMessage('verified is required')
    .isBoolean().withMessage('verified must be a boolean'),
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Notes cannot exceed 1000 characters')
];

// Protected routes (require admin authentication)
router.post('/change-password', authenticateAdmin, changePasswordValidation, changeAdminPassword);
router.get('/users', authenticateAdmin, getAllUsers);
router.get('/taxable-profiles', authenticateAdmin, getAllTaxableProfiles);
router.get('/filled-profiles', authenticateAdmin, getFilledProfiles); // Get all submitted/filled profiles
router.get('/profile-reviews', authenticateAdmin, getAllProfileReviews);
router.put('/taxable-profiles/:profileId/notes', authenticateAdmin, addProfileNotesValidation, addProfileNotes); // Add notes/metadata to profile
router.patch('/taxable-profiles/:profileId/filing-status', authenticateAdmin, updateFilingStatusValidation, updateTaxFilingStatus); // Update filingStatus for a profile
router.patch('/taxable-profiles/:profileId/nin-approval', authenticateAdmin, ninApprovalValidation, approveNIN); // Approve/reject NIN verification
router.post('/taxable-profiles/:profileId/filing-link', authenticateAdmin, generateFilingLinkValidation, generateFilingPaymentLinkForAdmin); // Generate accountant/filing payment link

module.exports = router;

