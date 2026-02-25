const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { createPaymentLink, getSubscriptionStatus, verifyPaymentDone } = require('../controllers/paystackController');

router.post('/create-link', authenticate, createPaymentLink);
router.get('/subscription/status', authenticate, getSubscriptionStatus);
router.post('/verify-done', authenticate, verifyPaymentDone);

module.exports = router;
