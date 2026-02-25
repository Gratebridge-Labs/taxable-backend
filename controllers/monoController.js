const mongoose = require('mongoose');
const MonoLink = require('../models/MonoLink');
const User = require('../models/User');
const { initiateAccountLinking, getAccountIncome, isConfigured } = require('../services/monoService');

/**
 * POST /api/mono/connect/initiate
 * Start Mono account linking; returns link for user to connect bank.
 * Body: { profileId?: string, redirectUrl?: string }
 */
const initiateConnect = async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Bank linking is not configured. Set MONO_SECRET_KEY.'
      });
    }
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const user = await User.findById(userId).select('email firstName lastName').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const { profileId, redirectUrl } = req.body || {};
    const ref = `u${userId}_${Date.now()}${profileId ? `_p${profileId}` : ''}`;
    const { link, reference } = await initiateAccountLinking({
      customer: {
        name: [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email?.split('@')[0] || 'Customer',
        email: user.email
      },
      redirectUrl: redirectUrl || undefined,
      meta: { ref, userId, profileId: profileId || undefined }
    });

    await MonoLink.findOneAndUpdate(
      { ref },
      {
        user: userId,
        profileId: profileId || undefined,
        ref,
        status: 'pending',
        updatedAt: new Date()
      },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Use this link to connect your bank. It opens in a browser.',
      data: { link, reference }
    });
  } catch (err) {
    console.error('[Mono] initiate error:', err.message);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to start bank connection'
    });
  }
};

/**
 * POST /api/mono/webhook
 * Mono sends events here (auth success, etc.). No auth; validate via Mono webhook secret if set.
 */
const handleWebhook = async (req, res) => {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ message: 'Invalid payload' });
    }
    const event = payload.event || payload.type;
    const accountId = payload.data?.id || payload.data?.accountId || payload.id;

    if (event === 'account_connected' || event === 'auth' || payload.event === 'success') {
      const id = accountId || payload.data?.account_id;
      const meta = payload.meta || payload.data?.meta || {};
      const ref = meta.ref || payload.data?.ref || payload.ref;
      if (!id) {
        console.warn('[Mono webhook] No account id in payload:', JSON.stringify(payload).slice(0, 300));
        return res.status(200).json({ received: true });
      }
      let userId = meta.userId;
      let profileId = meta.profileId;
      if (!userId && ref && typeof ref === 'string' && ref.startsWith('u')) {
        const parts = ref.split('_');
        userId = parts[0].slice(1);
        if (ref.includes('_p')) profileId = ref.split('_p')[1];
      }
      if (!userId) {
        console.warn('[Mono webhook] No userId in meta or ref:', ref, meta);
        return res.status(200).json({ received: true });
      }
      const userObjectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;
      await MonoLink.findOneAndUpdate(
        { ref },
        {
          user: userObjectId,
          profileId: profileId || undefined,
          monoAccountId: id,
          status: 'linked',
          updatedAt: new Date()
        },
        { upsert: true, new: true, setDefaultsOnCreate: true }
      );
      console.log('[Mono webhook] Account linked:', id, 'user:', userId);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[Mono webhook] Error:', err.message);
    res.status(200).json({ received: true });
  }
};

/**
 * GET /api/mono/income
 * Fetch income for the authenticated user's linked Mono account (latest link).
 * Optional query: profileId to prefer link for that profile.
 */
const getIncome = async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({
        success: false,
        message: 'Bank linking is not configured.'
      });
    }
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { profileId } = req.query;
    const link = await MonoLink.findOne({
      user: userId,
      status: 'linked',
      ...(profileId ? { profileId } : {})
    }).sort({ updatedAt: -1 }).lean();

    if (!link) {
      return res.status(404).json({
        success: false,
        message: 'No bank account linked. Use the connect link to link your bank first.'
      });
    }

    const income = await getAccountIncome(link.monoAccountId);
    await MonoLink.findByIdAndUpdate(link._id, {
      incomeSnapshot: income,
      lastIncomeFetchAt: new Date(),
      updatedAt: new Date()
    });

    return res.status(200).json({
      success: true,
      data: { income, profileId: link.profileId }
    });
  } catch (err) {
    console.error('[Mono] getIncome error:', err.message);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to fetch income from bank'
    });
  }
};

/**
 * GET /api/mono/status
 * Check if user has a linked account and if Mono is configured.
 */
const getStatus = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const link = await MonoLink.findOne({ user: userId, status: 'linked' }).select('profileId createdAt').lean();
    return res.status(200).json({
      success: true,
      data: {
        configured: isConfigured(),
        linked: !!link,
        linkedAt: link?.createdAt || null,
        profileId: link?.profileId || null
      }
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  initiateConnect,
  handleWebhook,
  getIncome,
  getStatus
};
