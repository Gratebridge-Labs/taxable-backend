const express = require('express');
const router = express.Router();
const { sendExpiryReminders } = require('../services/subscriptionReminderService');

/**
 * Cron endpoint: send subscription expiry reminders (3 days before).
 * Call with: GET /api/cron/subscription-expiry-reminders?secret=YOUR_CRON_SECRET
 * Set CRON_SECRET in .env and use the same value in your cron job.
 */
router.get('/subscription-expiry-reminders', async (req, res) => {
  try {
    const secret = process.env.CRON_SECRET;
    const provided = req.query.secret || req.headers['x-cron-secret'];
    if (!secret || provided !== secret) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    const result = await sendExpiryReminders();
    return res.status(200).json({
      success: true,
      message: `Sent ${result.sent} expiry reminder(s).`,
      data: result
    });
  } catch (err) {
    console.error('[Cron] subscription-expiry-reminders error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
