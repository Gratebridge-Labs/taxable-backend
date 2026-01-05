const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
  requestProfileReview,
  getMyReviews,
  getReviewById,
  updateReviewStatus,
  deleteReview
} = require('../controllers/profileReviewController');
const { authenticate } = require('../middleware/auth');
const { authenticateAdmin } = require('../middleware/adminAuth');
const { checkEmailVerified } = require('../middleware/profileAuth');

// Validation rules for requesting review
const requestReviewValidation = [
  body('profileId')
    .notEmpty().withMessage('Profile ID is required')
    .trim()
];

// Validation rules for updating review status
const updateReviewStatusValidation = [
  body('status')
    .notEmpty().withMessage('Status is required')
    .isIn(['pending', 'in_review', 'approved', 'rejected', 'requires_changes']).withMessage('Invalid status'),
  
  body('reviewNotes')
    .optional()
    .trim()
    .isLength({ max: 5000 }).withMessage('Review notes cannot exceed 5000 characters')
];

// User routes (require authentication and email verification)
router.post('/request', authenticate, checkEmailVerified, requestReviewValidation, requestProfileReview);
router.get('/my-reviews', authenticate, checkEmailVerified, getMyReviews);
router.get('/:reviewId', authenticate, checkEmailVerified, getReviewById);

// Admin routes (require admin authentication)
router.put('/:reviewId/status', authenticateAdmin, updateReviewStatusValidation, updateReviewStatus);
router.delete('/:reviewId', authenticateAdmin, deleteReview);

module.exports = router;

