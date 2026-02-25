const Subscription = require('../models/Subscription');
const User = require('../models/User');
const { initializeTransaction, verifyWebhookSignature } = require('../services/paystackService');
const { sendSubscriptionActiveEmail } = require('../utils/emailService');

const DEFAULT_PLANS = {
  basic: { amountKobo: 500000, planName: 'Basic' },   // ₦5,000
  pro: { amountKobo: 1500000, planName: 'Pro' },    // ₦15,000
  annual: { amountKobo: 5000000, planName: 'Annual' } // ₦50,000
};

/**
 * POST /api/paystack/create-link
 * Create a Paystack payment link for subscription. Auth required.
 * Body: { plan?: 'basic'|'pro'|'annual', amountKobo?: number, planName?: string, callback_url?: string }
 */
const createPaymentLink = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const user = await User.findById(userId).select('email firstName').lean();
    if (!user?.email) return res.status(400).json({ success: false, message: 'User email not found' });

    const { plan = 'basic', amountKobo, planName, callback_url } = req.body || {};
    const planConfig = DEFAULT_PLANS[plan] || { amountKobo: amountKobo || 500000, planName: planName || plan || 'Subscription' };
    const amount = amountKobo != null ? Number(amountKobo) : planConfig.amountKobo;
    const planNameFinal = planName || planConfig.planName;

    const subscription = await Subscription.create({
      user: userId,
      plan: plan,
      planName: planNameFinal,
      amountKobo: amount,
      status: 'pending'
    });

    const baseUrl = process.env.APP_URL || process.env.PAYSTACK_CALLBACK_URL || 'https://dashboard.gettaxable.com';
    const callback = callback_url || `${baseUrl}/payment/success`;

    const result = await initializeTransaction({
      email: user.email,
      amount,
      callback_url: callback,
      metadata: {
        user_id: userId,
        subscription_id: String(subscription._id),
        plan,
        plan_name: planNameFinal
      },
      reference: `sub_${subscription._id}_${Date.now()}`
    });

    subscription.paystackReference = result.reference;
    await subscription.save();

    return res.status(200).json({
      success: true,
      message: 'Payment link created. Redirect the user to authorization_url to complete payment.',
      data: {
        authorization_url: result.authorization_url,
        access_code: result.access_code,
        reference: result.reference,
        subscriptionId: subscription._id,
        amountKobo: amount,
        plan: planNameFinal
      }
    });
  } catch (err) {
    console.error('[Paystack] createPaymentLink error:', err.message);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to create payment link'
    });
  }
};

/**
 * POST /api/paystack/webhook
 * Paystack sends events here. Raw body required for signature verification.
 * On charge.success we mark subscription active and email the user.
 */
const handleWebhook = async (req, res) => {
  try {
    const rawBody = req.rawBody || (req.body && Buffer.isBuffer(req.body) ? req.body : null);
    const signature = req.headers['x-paystack-signature'];
    if (rawBody && signature && !verifyWebhookSignature(rawBody, signature)) {
      console.warn('[Paystack webhook] Invalid signature');
      return res.status(401).json({ received: false });
    }
    const payload = typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : (rawBody ? JSON.parse(rawBody.toString()) : {});
    const event = payload.event;
    const data = payload.data || {};

    if (event === 'charge.success') {
      const reference = data.reference || data.reference_id;
      if (!reference) {
        console.warn('[Paystack webhook] charge.success missing reference:', JSON.stringify(payload).slice(0, 300));
        return res.status(200).json({ received: true });
      }
      const subscription = await Subscription.findOneAndUpdate(
        { paystackReference: reference, status: 'pending' },
        { status: 'active', paidAt: new Date(), updatedAt: new Date() },
        { new: true }
      );
      if (subscription) {
        const user = await User.findById(subscription.user).select('email firstName').lean();
        if (user?.email) {
          try {
            await sendSubscriptionActiveEmail(user.email, user.firstName || 'there', subscription.planName);
          } catch (e) {
            console.error('[Paystack webhook] Subscription email failed:', e.message);
          }
        }
        console.log('[Paystack webhook] Subscription activated:', subscription._id, 'user:', subscription.user);
      } else {
        console.log('[Paystack webhook] charge.success reference not found or already processed:', reference);
      }
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[Paystack webhook] Error:', err.message);
    res.status(200).json({ received: true });
  }
};

/**
 * GET /api/paystack/subscription/status
 * Get current user's subscription status. Auth required.
 */
const getSubscriptionStatus = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const subs = await Subscription.find({ user: userId }).sort({ createdAt: -1 }).limit(5).lean();
    const active = subs.find(s => s.status === 'active');
    return res.status(200).json({
      success: true,
      data: {
        hasActiveSubscription: !!active,
        activeSubscription: active ? { plan: active.plan, planName: active.planName, paidAt: active.paidAt } : null,
        recent: subs
      }
    });
  } catch (err) {
    console.error('[Paystack] getSubscriptionStatus error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  createPaymentLink,
  handleWebhook,
  getSubscriptionStatus
};
