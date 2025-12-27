const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { createProfile, getUserProfiles, getProfileById } = require('../controllers/profileController');
const { authenticate } = require('../middleware/auth');
const { checkEmailVerified } = require('../middleware/profileAuth');

// Validation rules for creating profile
const createProfileValidation = [
  body('year')
    .notEmpty().withMessage('Year is required')
    .toInt()
    .isInt({ min: 2020, max: 2100 }).withMessage('Year must be a valid 4-digit year between 2020 and 2100'),
  
  body('profileType')
    .trim()
    .notEmpty().withMessage('Profile type is required')
    .isIn(['Individual', 'Business']).withMessage('Profile type must be either Individual or Business')
];

// Protected routes (require authentication and email verification)
router.post('/create', authenticate, checkEmailVerified, createProfileValidation, createProfile);
router.get('/list', authenticate, checkEmailVerified, getUserProfiles);
router.get('/:profileId', authenticate, checkEmailVerified, getProfileById);

module.exports = router;

