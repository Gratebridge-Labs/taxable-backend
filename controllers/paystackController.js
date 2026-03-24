const mongoose = require('mongoose');
const Subscription = require('../models/Subscription');
const User = require('../models/User');
const TaxableProfile = require('../models/TaxableProfile');
const FilingPayment = require('../models/FilingPayment');
const IncomeData = require('../models/IncomeData');
const Deduction = require('../models/Deduction');
const { initializeTransaction, verifyTransaction, verifyWebhookSignature } = require('../services/paystackService');
const { sendSubscriptionActiveEmail } = require('../utils/emailService');

/** PDF spec: ₦4,000 monthly, ₦30,000 yearly. Period days used for currentPeriodEnd. */
const DEFAULT_PLANS = {
  monthly: { amountKobo: 400000, planName: 'Monthly', periodDays: 30 },   // ₦4,000
  yearly: { amountKobo: 3000000, planName: 'Yearly', periodDays: 365 },   // ₦30,000
  // Legacy keys kept for backward compatibility
  basic: { amountKobo: 400000, planName: 'Monthly', periodDays: 30 },
  pro: { amountKobo: 3000000, planName: 'Yearly', periodDays: 365 },
  annual: { amountKobo: 3000000, planName: 'Yearly', periodDays: 365 }
};

/**
 * Create a subscription payment link for a user (used by HTTP create-link and WhatsApp "Choose monthly/yearly").
 * @param {string} userId - User _id
 * @param {string} plan - 'monthly' | 'yearly' (or legacy basic/pro/annual)
 * @param {string} [callback_url] - Optional redirect after payment
 * @returns {Promise<{ authorization_url: string, reference: string, planName: string }>}
 */
async function createSubscriptionLinkForUser(userId, plan = 'monthly', callback_url) {
  const user = await User.findById(userId).select('email firstName').lean();
  if (!user?.email) throw new Error('User email not found');
  const planConfig = DEFAULT_PLANS[plan] || DEFAULT_PLANS.monthly;
  const amount = planConfig.amountKobo;
  const planNameFinal = planConfig.planName;

  const subscription = await Subscription.create({
    user: userId,
    plan: plan,
    planName: planNameFinal,
    amountKobo: amount,
    status: 'pending'
  });

  // Force Paystack redirect to the dashboard root (no extra unconfigured routes).
  const callback = 'https://dashboard.gettaxable.com';

  const result = await initializeTransaction({
    email: user.email,
    amount,
    callback_url: callback,
    metadata: {
      user_id: String(userId),
      subscription_id: String(subscription._id),
      plan,
      plan_name: planNameFinal
    },
    reference: `sub_${subscription._id}_${Date.now()}`
  });

  subscription.paystackReference = result.reference;
  await subscription.save();

  return {
    authorization_url: result.authorization_url,
    reference: result.reference,
    planName: planNameFinal
  };
}

/** One-time filing payments: accountant review ₦30,000, filing fee ₦25,000 (2025). */
const FILING_PAYMENT_AMOUNTS = {
  accountant_review: 3000000,   // ₦30,000 in kobo
  filing_fee: 2500000           // ₦25,000 in kobo
};

/**
 * Create a one-time payment link for accountant review (₦30k) or filing fee (₦25k).
 * Used by WhatsApp annual flow. Webhook updates profile.filingStatus.
 */
async function createFilingPaymentLink(userId, profileId, type = 'accountant_review', amountKoboOverride) {
  if (!['accountant_review', 'filing_fee'].includes(type)) throw new Error('Invalid filing payment type');
  const user = await User.findById(userId).select('email firstName').lean();
  if (!user?.email) throw new Error('User email not found');
  const amountKobo = typeof amountKoboOverride === 'number' && amountKoboOverride > 0
    ? amountKoboOverride
    : FILING_PAYMENT_AMOUNTS[type];
  const ref = `filing_${new mongoose.Types.ObjectId()}_${Date.now()}`;
  const doc = await FilingPayment.create({
    user: userId,
    profileId,
    type,
    amountKobo,
    paystackReference: ref,
    status: 'pending'
  });
  const result = await initializeTransaction({
    email: user.email,
    amount: amountKobo,
    // Force Paystack redirect to the dashboard root (no extra unconfigured routes).
    callback_url: 'https://dashboard.gettaxable.com',
    metadata: {
      user_id: String(userId),
      profile_id: String(profileId),
      payment_type: type,
      filing_payment_id: String(doc._id)
    },
    reference: ref
  });
  if (result.reference && result.reference !== ref) {
    doc.paystackReference = result.reference;
    await doc.save();
  }
  return {
    authorization_url: result.authorization_url,
    reference: result.reference || ref,
    type,
    amountNaira: amountKobo / 100
  };
}

function toNum(v) {
  return (typeof v === 'number' && Number.isFinite(v)) ? v : Number(v) || 0;
}

async function calculateTaxForPayment(profile, month) {
  const filingPreference = profile.filingPreference;
  const requestedMonth = month == null ? null : Number(month);
  if (!['monthly', 'annual'].includes(filingPreference)) {
    throw new Error('Insufficient data: filingPreference must be monthly or annual');
  }
  if (filingPreference === 'monthly' && (!requestedMonth || requestedMonth < 1 || requestedMonth > 12)) {
    throw new Error('For monthly filing, provide a valid month (1-12)');
  }

  const incomeData = await IncomeData.findOne({ profileId: profile._id, year: profile.year }).lean();
  if (!incomeData) throw new Error('Insufficient data: income data not found');

  const deductions = await Deduction.find({ profileId: profile._id, 'period.year': profile.year }).lean();
  if (!deductions.length) throw new Error('Insufficient data: deductions data not found');

  const incomeItems = (() => {
    if (filingPreference === 'annual') return Array.isArray(incomeData.annualIncomes) ? incomeData.annualIncomes : [];
    const monthlyMap = incomeData.monthlyIncomes || {};
    const monthItems = monthlyMap[String(requestedMonth)] || [];
    return Array.isArray(monthItems) ? monthItems : [];
  })();
  if (!incomeItems.length) throw new Error('Insufficient data: no income data found for requested period');

  const periodDeductions = (() => {
    if (filingPreference === 'annual') return deductions.filter((d) => d.frequency === 'annual' || d.month == null);
    return deductions.filter((d) => {
      if (d.frequency === 'monthly') return d.month === requestedMonth;
      return d.month == null || d.frequency === 'annual';
    });
  })();
  if (!periodDeductions.length) throw new Error('Insufficient data: no deductions data found for requested period');

  const totalIncome = incomeItems.reduce((sum, item) => {
    const type = String(item?.type || '').toLowerCase();
    if (type === 'employment') return sum + toNum(item.grossSalary) + toNum(item.bonuses) + toNum(item.commissions);
    if (type === 'digital_assets' || type === 'freelance') return sum + toNum(item.value);
    return sum + toNum(item.value || item.amount || item.grossSalary);
  }, 0);

  const totalCalculatedRelief = periodDeductions.reduce((sum, d) => {
    const amount = toNum(d.amount);
    if (filingPreference === 'monthly' && d.frequency === 'annual') return sum + (amount / 12);
    return sum + amount;
  }, 0);

  const taxableIncome = Math.max(0, totalIncome - totalCalculatedRelief);
  const brackets = [
    { from: 0, to: 300000, rate: 0.07 },
    { from: 300001, to: 600000, rate: 0.11 },
    { from: 600001, to: 1100000, rate: 0.15 },
    { from: 1100001, to: 1600000, rate: 0.19 },
    { from: 1600001, to: 3200000, rate: 0.21 },
    { from: 3200001, to: Infinity, rate: 0.24 }
  ];
  const computeTax = (baseIncome) => {
    let remaining = baseIncome;
    let tax = 0;
    for (const b of brackets) {
      if (remaining <= 0) break;
      const range = b.to === Infinity ? remaining : Math.min(b.to - b.from + 1, remaining);
      const taxableInBracket = Math.min(range, remaining);
      tax += taxableInBracket * b.rate;
      remaining -= taxableInBracket;
    }
    return tax;
  };

  const annualizedTaxableIncome = filingPreference === 'monthly' ? taxableIncome * 12 : taxableIncome;
  const annualTaxAmount = computeTax(annualizedTaxableIncome);
  const monthlyTax = annualTaxAmount / 12;
  const totalTaxAmount = filingPreference === 'monthly' ? monthlyTax : annualTaxAmount;

  return {
    filingPreference,
    month: filingPreference === 'monthly' ? requestedMonth : null,
    totalIncome,
    totalCalculatedRelief,
    taxableIncome,
    totalTaxAmount,
    monthlyTax
  };
}

/**
 * POST /api/paystack/create-link
 * Create a Paystack payment link for subscription. Auth required.
 * Body: { plan?: 'monthly'|'yearly'|'basic'|'pro'|'annual', amountKobo?: number, planName?: string, callback_url?: string }
 */
const createPaymentLink = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const { plan = 'monthly', callback_url } = req.body || {};
    const data = await createSubscriptionLinkForUser(userId, plan, callback_url);
    return res.status(200).json({
      success: true,
      message: 'Payment link created. Redirect the user to authorization_url to complete payment.',
      data: {
        authorization_url: data.authorization_url,
        reference: data.reference,
        plan: data.planName,
        planName: data.planName
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
    console.log('[Paystack webhook] Incoming request at /api/paystack/webhook');
    const rawBody = req.rawBody || (req.body && Buffer.isBuffer(req.body) ? req.body : null);
    const signature = req.headers['x-paystack-signature'];
    if (rawBody && signature && !verifyWebhookSignature(rawBody, signature)) {
      console.warn('[Paystack webhook] Invalid signature');
      return res.status(401).json({ received: false });
    }
    const payload = typeof req.body === 'object' && !Buffer.isBuffer(req.body) ? req.body : (rawBody ? JSON.parse(rawBody.toString()) : {});
    const event = payload.event;
    const data = payload.data || {};

    console.log('[Paystack webhook] Event received:', event);

    if (event === 'charge.success') {
      const reference = data.reference || data.reference_id;
      if (!reference) {
        console.warn('[Paystack webhook] charge.success missing reference:', JSON.stringify(payload).slice(0, 300));
        return res.status(200).json({ received: true });
      }
      const subscription = await Subscription.findOne({ paystackReference: reference, status: 'pending' }).lean();
      if (subscription) {
        const periodDays = (DEFAULT_PLANS[subscription.plan] && DEFAULT_PLANS[subscription.plan].periodDays) || 30;
        const currentPeriodEnd = new Date();
        currentPeriodEnd.setDate(currentPeriodEnd.getDate() + periodDays);
        await Subscription.updateOne(
          { _id: subscription._id },
          { status: 'active', paidAt: new Date(), currentPeriodEnd, updatedAt: new Date() }
        );
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
        const filingPayment = await FilingPayment.findOne({ paystackReference: reference, status: 'pending' });
        if (filingPayment) {
          await FilingPayment.updateOne(
            { _id: filingPayment._id },
            { status: 'completed', updatedAt: new Date() }
          );
          // When accountant_review is paid, profile moves into tax_agent_review.
          // For annual filing_fee, profile is filed.
          // For monthly filing_fee, keep profile active in monthly mode.
          const isMonthlyFilingPayment = filingPayment.type === 'filing_fee' && filingPayment.paymentFor === 'monthly';
          const newStatus = filingPayment.type === 'accountant_review'
            ? 'tax_agent_review'
            : (isMonthlyFilingPayment ? 'monthly_active' : 'filed');
          const update = { filingStatus: newStatus, updatedAt: new Date() };
          if (filingPayment.type === 'filing_fee') {
            if (!isMonthlyFilingPayment) {
              update.filed = true;
              update.filedAt = new Date();
              update.status = 'completed';
            } else {
              update.status = 'active';
            }
          }
          await TaxableProfile.updateOne(
            { _id: filingPayment.profileId },
            { $set: update }
          );
          console.log('[Paystack webhook] FilingPayment completed:', filingPayment._id, 'type:', filingPayment.type, 'profile:', filingPayment.profileId);
        } else {
          console.log('[Paystack webhook] charge.success reference not found or already processed:', reference);
        }
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
        activeSubscription: active ? { plan: active.plan, planName: active.planName, paidAt: active.paidAt, currentPeriodEnd: active.currentPeriodEnd } : null,
        recent: subs
      }
    });
  } catch (err) {
    console.error('[Paystack] getSubscriptionStatus error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Verify pending subscription for a user (by userId). Used by HTTP verify-done and WhatsApp "Done".
 * @param {string} userId - User _id
 * @returns {Promise<{ verified: boolean, message: string, activeSubscription?: object }>}
 */
async function verifyPendingSubscriptionForUser(userId) {
  const pending = await Subscription.findOne({ user: userId, status: 'pending' }).sort({ createdAt: -1 });
  if (!pending?.paystackReference) {
    const active = await Subscription.findOne({ user: userId, status: 'active' }).lean();
    return {
      verified: !!active,
      message: active ? 'Subscription already active' : 'No pending payment found. Complete payment first, then reply Done.',
      activeSubscription: active ? { plan: active.plan, planName: active.planName, paidAt: active.paidAt } : null
    };
  }
  let verifiedData;
  try {
    verifiedData = await verifyTransaction(pending.paystackReference);
  } catch (err) {
    console.warn('[Paystack] verifyPending Paystack verify failed:', err.message);
    return {
      verified: false,
      message: "Payment not confirmed yet. If you've completed payment, wait a few seconds and try again, or reply Check again."
    };
  }
  const success = verifiedData && verifiedData.status === 'success';
  if (!success) {
    return { verified: false, message: 'Payment not completed. Please complete payment using the link sent to you.' };
  }
  const periodDays = (DEFAULT_PLANS[pending.plan] && DEFAULT_PLANS[pending.plan].periodDays) || 30;
  const currentPeriodEnd = new Date();
  currentPeriodEnd.setDate(currentPeriodEnd.getDate() + periodDays);
  await Subscription.updateOne(
    { _id: pending._id },
    { status: 'active', paidAt: new Date(), currentPeriodEnd, updatedAt: new Date() }
  );
  const user = await User.findById(userId).select('email firstName').lean();
  if (user?.email) {
    try {
      await sendSubscriptionActiveEmail(user.email, user.firstName || 'there', pending.planName);
    } catch (e) {
      console.error('[Paystack] verifyPending email failed:', e.message);
    }
  }
  return {
    verified: true,
    message: 'Payment confirmed. Your subscription is now active.',
    activeSubscription: { plan: pending.plan, planName: pending.planName, paidAt: new Date(), currentPeriodEnd }
  };
}

/**
 * POST /api/paystack/verify-done
 * When user says "Done" after paying: verify pending payment via Paystack API (Case 3 - webhook failed).
 * Auth required. Activates subscription and sends email if payment succeeded.
 */
const verifyPaymentDone = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const data = await verifyPendingSubscriptionForUser(userId);
    return res.status(200).json({ success: true, data });
  } catch (err) {
    console.error('[Paystack] verifyPaymentDone error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Verification failed' });
  }
};

/**
 * POST /api/paystack/filing-link
 * Create a filing payment link for accountant review or filing fee (user-facing).
 * Body: { profileId: string, type: 'accountant_review' | 'filing_fee' }
 * Returns: { authorization_url, reference, type, amountNaira }
 */
const createUserFilingPaymentLink = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { profileId, type = 'accountant_review' } = req.body;

    if (!profileId) {
      return res.status(400).json({
        success: false,
        message: 'profileId is required'
      });
    }

    if (!['accountant_review', 'filing_fee'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'type must be either "accountant_review" or "filing_fee"'
      });
    }

    // Verify profile belongs to user
    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found or access denied'
      });
    }

    // Validate profile status based on payment type
    if (type === 'accountant_review') {
      if (!['draft', 'submitted'].includes(profile.filingStatus)) {
        return res.status(400).json({
          success: false,
          message: 'Accountant review payment only available for draft or submitted profiles'
        });
      }
    } else if (type === 'filing_fee') {
      if (profile.filingStatus !== 'tax_agent_review') {
        return res.status(400).json({
          success: false,
          message: 'Filing fee payment only available after tax agent review'
        });
      }
    }

    const data = await createFilingPaymentLink(userId, profile._id, type);

    return res.status(200).json({
      success: true,
      message: 'Filing payment link created',
      data
    });
  } catch (error) {
    console.error('[Paystack] createUserFilingPaymentLink error:', error);
    return res.status(500).json({
      success: false,
      message: 'Error creating filing payment link',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * POST /api/paystack/tax-agent/link
 * Body: { profileId: string }
 */
const createTaxAgentPaymentForWeb = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { profileId } = req.body || {};
    if (!profileId) return res.status(400).json({ success: false, message: 'profileId is required' });

    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);
    if (!profile) return res.status(404).json({ success: false, message: 'Tax profile not found or access denied' });

    const data = await createFilingPaymentLink(userId, profile._id, 'accountant_review');
    return res.status(200).json({ success: true, message: 'Tax agent payment link created', data });
  } catch (error) {
    console.error('[Paystack] createTaxAgentPaymentForWeb error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Error creating tax agent payment link' });
  }
};

/**
 * POST /api/paystack/filing/link
 * Body: { profileId: string, month?: number }
 * Filing amount is based on calculated tax data.
 */
const createCalculatedFilingPaymentForWeb = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { profileId, month } = req.body || {};
    if (!profileId) return res.status(400).json({ success: false, message: 'profileId is required' });

    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);
    if (!profile) return res.status(404).json({ success: false, message: 'Tax profile not found or access denied' });

    const calc = await calculateTaxForPayment(profile, month);
    const amountKobo = Math.max(100, Math.round(calc.totalTaxAmount * 100));
    const ref = `filing_${new mongoose.Types.ObjectId()}_${Date.now()}`;

    const user = await User.findById(userId).select('email').lean();
    if (!user?.email) return res.status(400).json({ success: false, message: 'User email not found' });

    const filingPayment = await FilingPayment.create({
      user: userId,
      profileId: profile._id,
      type: 'filing_fee',
      paymentFor: calc.filingPreference === 'monthly' ? 'monthly' : 'annual',
      month: calc.month,
      year: profile.year,
      amountKobo,
      calculationSnapshot: {
        totalIncome: calc.totalIncome,
        totalCalculatedRelief: calc.totalCalculatedRelief,
        taxableIncome: calc.taxableIncome,
        totalTaxAmount: calc.totalTaxAmount,
        monthlyTax: calc.monthlyTax
      },
      paystackReference: ref,
      status: 'pending'
    });

    const result = await initializeTransaction({
      email: user.email,
      amount: amountKobo,
      callback_url: 'https://dashboard.gettaxable.com',
      metadata: {
        user_id: String(userId),
        profile_id: String(profile._id),
        payment_type: 'filing_fee',
        filing_payment_id: String(filingPayment._id),
        payment_for: filingPayment.paymentFor,
        month: filingPayment.month,
        year: filingPayment.year
      },
      reference: ref
    });

    if (result.reference && result.reference !== ref) {
      filingPayment.paystackReference = result.reference;
      await filingPayment.save();
    }

    return res.status(200).json({
      success: true,
      message: 'Calculated filing payment link created',
      data: {
        authorization_url: result.authorization_url,
        reference: result.reference || ref,
        amountNaira: amountKobo / 100,
        paymentFor: filingPayment.paymentFor,
        month: filingPayment.month,
        year: filingPayment.year,
        taxSummary: filingPayment.calculationSnapshot
      }
    });
  } catch (error) {
    console.error('[Paystack] createCalculatedFilingPaymentForWeb error:', error);
    return res.status(400).json({
      success: false,
      message: error.message || 'Error creating calculated filing payment link'
    });
  }
};

/**
 * GET /api/paystack/filing/payments?profileId=TPxxxx(optional)
 */
const getFilingPaymentsForWeb = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { profileId } = req.query || {};
    const query = { user: userId };
    let profile = null;
    if (profileId) {
      profile = await TaxableProfile.findByProfileIdOrId(profileId, userId).select('_id profileId year').lean();
      if (!profile) return res.status(404).json({ success: false, message: 'Tax profile not found or access denied' });
      query.profileId = profile._id;
    }

    const payments = await FilingPayment.find(query).sort({ createdAt: -1 }).lean();
    return res.status(200).json({
      success: true,
      data: {
        profileId: profile?.profileId || null,
        count: payments.length,
        payments: payments.map((p) => ({
          id: p._id,
          type: p.type,
          paymentFor: p.paymentFor || 'annual',
          month: p.month ?? null,
          year: p.year ?? null,
          amountKobo: p.amountKobo,
          amountNaira: p.amountKobo / 100,
          status: p.status,
          paystackReference: p.paystackReference,
          calculationSnapshot: p.calculationSnapshot || null,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt
        }))
      }
    });
  } catch (error) {
    console.error('[Paystack] getFilingPaymentsForWeb error:', error);
    return res.status(500).json({ success: false, message: error.message || 'Error retrieving filing payments' });
  }
};

module.exports = {
  createPaymentLink,
  createSubscriptionLinkForUser,
  createFilingPaymentLink,
  createUserFilingPaymentLink,
  createTaxAgentPaymentForWeb,
  createCalculatedFilingPaymentForWeb,
  getFilingPaymentsForWeb,
  handleWebhook,
  getSubscriptionStatus,
  verifyPaymentDone,
  verifyPendingSubscriptionForUser,
  DEFAULT_PLANS,
  FILING_PAYMENT_AMOUNTS
};
