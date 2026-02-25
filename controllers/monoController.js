const mongoose = require('mongoose');
const MonoLink = require('../models/MonoLink');
const User = require('../models/User');
const { initiateAccountLinking, getAccountIncome, isConfigured } = require('../services/monoService');
const { sendBankConnectedEmail } = require('../utils/emailService');

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
    // Log payload structure (safe: no full body in prod, just keys and sample) for debugging
    const payloadKeys = Object.keys(payload);
    const dataKeys = payload.data && typeof payload.data === 'object' ? Object.keys(payload.data) : [];
    console.log('[Mono webhook] received', { event: payload.event || payload.type, payloadKeys, dataKeys, sample: JSON.stringify(payload).slice(0, 600) });

    const event = (payload.event || payload.type || '').toLowerCase();
    const isAccountConnected =
      event === 'account_connected' ||
      event === 'mono.events.account_connected' ||
      event === 'auth' ||
      event === 'success' ||
      (payload.event && String(payload.event).toLowerCase().includes('account'));

    const id =
      payload.data?.id ||
      payload.data?.accountId ||
      payload.data?.account_id ||
      (payload.data?.account && (payload.data.account.id || payload.data.account._id)) ||
      payload.id ||
      payload.account_id;

    const meta = payload.meta || payload.data?.meta || payload.data || {};
    const ref = meta.ref || payload.data?.ref || payload.ref;

    if (isAccountConnected && id) {
      let userId = meta.user_id || meta.userId;
      let profileId = meta.profile_id || meta.profileId;
      if (!userId && ref && typeof ref === 'string' && ref.startsWith('u')) {
        const parts = ref.split('_');
        userId = parts[0].slice(1);
        if (ref.includes('_p')) profileId = ref.split('_p')[1];
      }
      if (!userId) {
        console.warn('[Mono webhook] No userId in meta or ref:', ref, { metaKeys: Object.keys(meta) });
        return res.status(200).json({ received: true });
      }
      const userObjectId = mongoose.Types.ObjectId.isValid(userId) ? new mongoose.Types.ObjectId(userId) : userId;

      const updateByRef = ref ? await MonoLink.findOneAndUpdate(
        { ref },
        {
          user: userObjectId,
          profileId: profileId || undefined,
          monoAccountId: id,
          status: 'linked',
          updatedAt: new Date()
        },
        { new: true }
      ) : null;

      if (!updateByRef && ref) {
        await MonoLink.findOneAndUpdate(
          { ref },
          {
            user: userObjectId,
            profileId: profileId || undefined,
            monoAccountId: id,
            ref,
            status: 'linked',
            updatedAt: new Date()
          },
          { upsert: true, new: true, setDefaultsOnCreate: true }
        );
        console.log('[Mono webhook] Account linked (upsert by ref):', id, 'user:', userId, 'ref:', ref);
      } else if (updateByRef) {
        console.log('[Mono webhook] Account linked (update by ref):', id, 'user:', userId, 'ref:', ref);
      } else {
        const byAccountId = await MonoLink.findOneAndUpdate(
          { monoAccountId: id },
          { status: 'linked', user: userObjectId, profileId: profileId || undefined, updatedAt: new Date() },
          { new: true }
        );
        if (byAccountId) {
          console.log('[Mono webhook] Account linked (update by monoAccountId):', id, 'user:', userId);
        } else {
          const created = await MonoLink.create({
            user: userObjectId,
            profileId: profileId || undefined,
            monoAccountId: id,
            ref: ref || `webhook_${id}_${Date.now()}`,
            status: 'linked'
          });
          console.log('[Mono webhook] Account linked (new doc, no ref):', id, 'user:', userId, 'newId:', created._id);
        }
      }
      try {
        const user = await User.findById(userObjectId).select('email firstName').lean();
        if (user?.email) {
          await sendBankConnectedEmail(user.email, user.firstName || 'there', 'your bank');
        }
      } catch (e) {
        console.error('[Mono webhook] Bank connected email failed:', e.message);
      }
    } else if (!id) {
      console.warn('[Mono webhook] No account id in payload; event=', event, 'id=', id);
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('[Mono webhook] Error:', err.message, err.stack);
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

/**
 * GET /api/mono/connections
 * List all bank connections for the user (PDF: Manage connected banks).
 */
const listConnections = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const links = await MonoLink.find({ user: userId, status: 'linked' })
      .sort({ updatedAt: -1 })
      .select('monoAccountId profileId createdAt updatedAt incomeSnapshot lastIncomeFetchAt')
      .lean();
    return res.status(200).json({
      success: true,
      data: {
        connections: links.map((l, i) => ({
          id: l._id,
          index: i + 1,
          monoAccountId: l.monoAccountId,
          profileId: l.profileId,
          linkedAt: l.createdAt,
          lastIncomeFetchAt: l.lastIncomeFetchAt,
          incomeSnapshot: l.incomeSnapshot
        })),
        count: links.length
      }
    });
  } catch (err) {
    console.error('[Mono] listConnections error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to list connections' });
  }
};

/**
 * POST /api/mono/connections/:linkId/unlink
 * Unlink (remove) a bank connection. Sets status to 'unlinked' (PDF: add/remove flow).
 */
const unlinkConnection = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const { linkId } = req.params;
    const link = await MonoLink.findOne({ _id: linkId, user: userId });
    if (!link) {
      return res.status(404).json({ success: false, message: 'Connection not found' });
    }
    link.status = 'unlinked';
    link.updatedAt = new Date();
    await link.save();
    return res.status(200).json({
      success: true,
      message: 'Bank disconnected successfully',
      data: { linkId: link._id, status: 'unlinked' }
    });
  } catch (err) {
    console.error('[Mono] unlinkConnection error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to disconnect' });
  }
};

module.exports = {
  initiateConnect,
  handleWebhook,
  getIncome,
  getStatus,
  listConnections,
  unlinkConnection
};
