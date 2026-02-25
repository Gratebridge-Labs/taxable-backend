const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { createPaymentLink, getSubscriptionStatus } = require('../controllers/paystackController');

router.post('/create-link', authenticate, createPaymentLink);
router.get('/subscription/status', authenticate, getSubscriptionStatus);

module.exports = router;
