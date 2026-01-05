const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
  createAdmin,
  adminLogin,
  changeAdminPassword,
  getAllUsers,
  getAllTaxableProfiles,
  getAllProfileReviews
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
    .isLength({ min: 6, max: 6 }).withMessage('Admin code must be exactly 6 digits')
    .matches(/^[0-9]{6}$/).withMessage('Admin code must contain only numbers'),
  
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
    .notEmpty().withMessage('Password is required'),
  
  body('adminCode')
    .trim()
    .notEmpty().withMessage('Admin code is required')
    .isLength({ min: 6, max: 6 }).withMessage('Admin code must be exactly 6 digits')
    .matches(/^[0-9]{6}$/).withMessage('Admin code must contain only numbers')
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

// Protected routes (require admin authentication)
router.post('/change-password', authenticateAdmin, changePasswordValidation, changeAdminPassword);
router.get('/users', authenticateAdmin, getAllUsers);
router.get('/taxable-profiles', authenticateAdmin, getAllTaxableProfiles);
router.get('/profile-reviews', authenticateAdmin, getAllProfileReviews);

module.exports = router;

