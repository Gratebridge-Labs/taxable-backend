/**
 * Sends "subscription expires in 3 days" emails (PDF spec).
 * Run via cron: GET /api/cron/subscription-expiry-reminders?secret=CRON_SECRET
 * Marks subscriptions with metadata.expiryReminderSentAt so we don't spam.
 */
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const { sendSubscriptionExpiringEmail } = require('../utils/emailService');

const REMIND_DAYS = 3;

/**
 * Find active subscriptions expiring in REMIND_DAYS days that haven't been reminded yet.
 */
function getSubscriptionsToRemind() {
  const now = new Date();
  const inThreeDays = new Date(now);
  inThreeDays.setDate(inThreeDays.getDate() + REMIND_DAYS);
  const startOfRemindDay = new Date(inThreeDays.getFullYear(), inThreeDays.getMonth(), inThreeDays.getDate());
  const endOfRemindDay = new Date(startOfRemindDay);
  endOfRemindDay.setDate(endOfRemindDay.getDate() + 1);
  return Subscription.find({
    status: 'active',
    currentPeriodEnd: { $gte: startOfRemindDay, $lt: endOfRemindDay },
    $or: [
      { 'metadata.expiryReminderSentAt': { $exists: false } },
      { 'metadata.expiryReminderSentAt': null }
    ]
  }).lean();
}

/**
 * Send expiry reminder emails and mark as reminded.
 * @returns {Promise<{ sent: number, errors: Array<{ subscriptionId: string, error: string }> }>}
 */
async function sendExpiryReminders() {
  const subs = await getSubscriptionsToRemind();
  const results = { sent: 0, errors: [] };
  for (const sub of subs) {
    try {
      const user = await User.findById(sub.user).select('email firstName').lean();
      if (!user?.email) {
        results.errors.push({ subscriptionId: String(sub._id), error: 'User has no email' });
        continue;
      }
      await sendSubscriptionExpiringEmail(user.email, user.firstName || 'there', REMIND_DAYS, sub.planName);
      await Subscription.updateOne(
        { _id: sub._id },
        { $set: { 'metadata.expiryReminderSentAt': new Date(), updatedAt: new Date() } }
      );
      results.sent += 1;
    } catch (err) {
      results.errors.push({ subscriptionId: String(sub._id), error: err.message });
    }
  }
  return results;
}

module.exports = {
  getSubscriptionsToRemind,
  sendExpiryReminders,
  REMIND_DAYS
};
