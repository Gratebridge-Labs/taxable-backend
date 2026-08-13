const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { register, verifyOTP, resendOTP, setup2FA, enable2FA, login, forgotPassword, verifyResetOTP, resetPassword, changePassword, getMyProfile, updateProfile } = require('../controllers/authController');
const { authenticate } = require('../middleware/auth');

// Validation rules for registration
const registerValidation = [
  body('firstName')
    .trim()
    .notEmpty().withMessage('First name is required')
    .isLength({ min: 2, max: 50 }).withMessage('First name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s'-]+$/).withMessage('First name can only contain letters, spaces, hyphens, and apostrophes'),
  
  body('lastName')
    .trim()
    .notEmpty().withMessage('Last name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Last name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s'-]+$/).withMessage('Last name can only contain letters, spaces, hyphens, and apostrophes'),
  
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .matches(/^(\+?234[\s-]?)?[0-9]{3}[\s-]?[0-9]{3}[\s-]?[0-9]{4}$|^0?[0-9]{10}$/).withMessage('Please provide a valid phone number (e.g., +2348012345678, +234 801 234 5678, or 08012345678)'),
  
  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),

  body('receiveTaxDeadlineReminders')
    .optional()
    .isBoolean().withMessage('receiveTaxDeadlineReminders must be a boolean')
];

// Validation rules for OTP verification
const verifyOTPValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('code')
    .trim()
    .notEmpty().withMessage('OTP code is required')
    .isLength({ min: 6, max: 6 }).withMessage('OTP code must be 6 digits')
    .isNumeric().withMessage('OTP code must contain only numbers')
];

// Validation rules for resending OTP
const resendOTPValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail()
];

// Validation rules for login
const loginValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('password')
    .notEmpty().withMessage('Password is required'),
  
  body('twoFactorCode')
    .optional()
    .trim()
    .isLength({ min: 6, max: 6 }).withMessage('2FA code must be 6 digits')
    .isNumeric().withMessage('2FA code must contain only numbers')
];

// Validation rules for enabling 2FA
const enable2FAValidation = [
  body('code')
    .trim()
    .notEmpty().withMessage('Verification code is required')
    .isLength({ min: 6, max: 6 }).withMessage('Verification code must be 6 digits')
    .isNumeric().withMessage('Verification code must contain only numbers')
];

// Validation rules for forgot password
const forgotPasswordValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail()
];

// Validation rules for verify reset OTP
const verifyResetOTPValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('code')
    .trim()
    .notEmpty().withMessage('Reset code is required')
    .isLength({ min: 6, max: 6 }).withMessage('Reset code must be 6 digits')
    .isNumeric().withMessage('Reset code must contain only numbers')
];

// Validation rules for reset password
const resetPasswordValidation = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('resetToken')
    .trim()
    .notEmpty().withMessage('Reset token is required'),
  
  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 8 }).withMessage('Password must be at least 8 characters long')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/).withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number')
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

// Validation rules for update profile
const updateProfileValidation = [
  body('firstName')
    .optional()
    .trim()
    .notEmpty().withMessage('First name cannot be empty')
    .isLength({ min: 2, max: 50 }).withMessage('First name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s'-]+$/).withMessage('First name can only contain letters, spaces, hyphens, and apostrophes'),
  
  body('lastName')
    .optional()
    .trim()
    .notEmpty().withMessage('Last name cannot be empty')
    .isLength({ min: 2, max: 50 }).withMessage('Last name must be between 2 and 50 characters')
    .matches(/^[a-zA-Z\s'-]+$/).withMessage('Last name can only contain letters, spaces, hyphens, and apostrophes'),
  
  body('phone')
    .optional()
    .trim()
    .notEmpty().withMessage('Phone number cannot be empty')
    .matches(/^(\+?234[\s-]?)?[0-9]{3}[\s-]?[0-9]{3}[\s-]?[0-9]{4}$|^0?[0-9]{10}$/).withMessage('Please provide a valid phone number (e.g., +2348012345678, +234 801 234 5678, or 08012345678)'),

  body('tin')
    .optional()
    .trim()
    .notEmpty().withMessage('TIN cannot be empty')
    .isLength({ min: 8, max: 20 }).withMessage('TIN must be between 8 and 20 characters')
    .matches(/^[a-zA-Z0-9\s-]+$/).withMessage('TIN can only contain letters, numbers, spaces, and hyphens'),

  body('profileImageUrl')
    .optional()
    .isURL().withMessage('profileImageUrl must be a valid URL'),

  body('receiveTaxDeadlineReminders')
    .optional()
    .isBoolean().withMessage('receiveTaxDeadlineReminders must be a boolean')
];

// Public routes
router.post('/register', registerValidation, register);
router.post('/verify-otp', verifyOTPValidation, verifyOTP);
router.post('/resend-otp', resendOTPValidation, resendOTP);
router.post('/login', loginValidation, login);
router.post('/forgot-password', forgotPasswordValidation, forgotPassword);
router.post('/verify-reset-otp', verifyResetOTPValidation, verifyResetOTP);
router.post('/reset-password', resetPasswordValidation, resetPassword);

// Protected routes (require authentication)
router.get('/me', authenticate, getMyProfile); // Get authenticated user's profile
router.put('/me', authenticate, updateProfileValidation, updateProfile); // Update authenticated user's profile
router.get('/setup-2fa', authenticate, setup2FA);
router.post('/enable-2fa', authenticate, enable2FAValidation, enable2FA);
router.post('/change-password', authenticate, changePasswordValidation, changePassword);

module.exports = router;

