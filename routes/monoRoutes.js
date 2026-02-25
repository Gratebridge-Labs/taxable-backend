const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { initiateConnect, handleWebhook, getIncome, getStatus } = require('../controllers/monoController');

// Webhook: Mono calls this (no auth). Use MONO_WEBHOOK_SECRET in dashboard to verify if needed.
router.post('/webhook', handleWebhook);

// Authenticated routes
router.post('/connect/initiate', authenticate, initiateConnect);
router.get('/income', authenticate, getIncome);
router.get('/status', authenticate, getStatus);

module.exports = router;
