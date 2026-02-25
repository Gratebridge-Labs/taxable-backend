const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { initiateConnect, handleWebhook, getIncome, getStatus } = require('../controllers/monoController');

// Webhook: Mono calls this with POST. GET is for browser/dashboard checks.
router.get('/webhook', (req, res) => {
  res.status(200).json({ message: 'Mono webhook endpoint; Mono sends POST here. GET is only for checking the URL.' });
});
router.post('/webhook', handleWebhook);

// Authenticated routes
router.post('/connect/initiate', authenticate, initiateConnect);
router.get('/income', authenticate, getIncome);
router.get('/status', authenticate, getStatus);

module.exports = router;
