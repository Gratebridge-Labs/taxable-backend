const express = require('express');
const router = express.Router();
const { verifyWebhook, handleWebhook } = require('../controllers/whatsappWebhookController');
const { errorContextMiddleware } = require('../middleware/errorContextMiddleware');

// GET - Meta verification (hub.mode, hub.verify_token, hub.challenge)
router.get('/webhook', verifyWebhook);

// POST - Incoming messages (no auth; validate signature in production if needed)
// Add error context middleware for comprehensive error logging
router.post('/webhook', errorContextMiddleware, handleWebhook);

module.exports = router;
