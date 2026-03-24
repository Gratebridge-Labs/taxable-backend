const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  createPaymentLink,
  getSubscriptionStatus,
  verifyPaymentDone,
  createUserFilingPaymentLink,
  createTaxAgentPaymentForWeb,
  createCalculatedFilingPaymentForWeb,
  getFilingPaymentsForWeb
} = require('../controllers/paystackController');

router.post('/create-link', authenticate, createPaymentLink);
router.get('/subscription/status', authenticate, getSubscriptionStatus);
router.post('/verify-done', authenticate, verifyPaymentDone);
router.post('/filing-link', authenticate, createUserFilingPaymentLink);
router.post('/tax-agent/link', authenticate, createTaxAgentPaymentForWeb);
router.post('/filing/link', authenticate, createCalculatedFilingPaymentForWeb);
router.get('/filing/payments', authenticate, getFilingPaymentsForWeb);

module.exports = router;
