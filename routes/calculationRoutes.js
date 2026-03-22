const express = require('express');
const router = express.Router();
const { calculateTax, getBreakdown, getCalculationHistory, getTaxSummary } = require('../controllers/calculationController');
const { authenticate } = require('../middleware/auth');
const { checkEmailVerified } = require('../middleware/profileAuth');

// All routes require authentication and email verification
router.post('/:profileId/calculate', authenticate, checkEmailVerified, calculateTax);
router.get('/:profileId/breakdown', authenticate, checkEmailVerified, getBreakdown);
router.get('/:profileId/history', authenticate, checkEmailVerified, getCalculationHistory);
router.get('/:profileId/summary', authenticate, checkEmailVerified, getTaxSummary);

module.exports = router;

