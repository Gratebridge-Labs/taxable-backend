const express = require('express');
const router = express.Router();
const { verifyWebhook, handleWebhook } = require('../controllers/whatsappWebhookController');

// GET - Meta verification (hub.mode, hub.verify_token, hub.challenge)
router.get('/webhook', verifyWebhook);

// POST - Incoming messages (no auth; validate signature in production if needed)
router.post('/webhook', handleWebhook);

module.exports = router;
