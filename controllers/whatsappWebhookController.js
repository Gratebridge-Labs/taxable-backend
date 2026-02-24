const WhatsAppSession = require('../models/WhatsAppSession');
const User = require('../models/User');
const OTP = require('../models/OTP');
const TaxableProfile = require('../models/TaxableProfile');
const TaxUpdate = require('../models/TaxUpdate');
const { sendTextMessage } = require('../services/whatsappService');
const { registerUser, resendOTP } = require('../services/registrationService');

const DASHBOARD_URL = 'dashboard.gettaxable.com';
const TAX_UPDATES_MENU_LIMIT = 2;

/** Fetch latest active Nigerian tax updates for the menu (sync-safe: returns [] on error). */
async function getLatestTaxUpdatesForMenu() {
  try {
    const now = new Date();
    const list = await TaxUpdate.find({
      active: true,
      $and: [
        { $or: [{ effectiveUntil: { $exists: false } }, { effectiveUntil: null }, { effectiveUntil: { $gt: now } }] },
        { $or: [{ effectiveFrom: { $exists: false } }, { effectiveFrom: null }, { effectiveFrom: { $lte: now } }] }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(TAX_UPDATES_MENU_LIMIT)
      .select('title summary link')
      .lean();
    return list || [];
  } catch (e) {
    console.error('[WhatsApp] getLatestTaxUpdatesForMenu error:', e.message);
    return [];
  }
}

/** Format latest updates as a short block for WhatsApp; clear spacing for readability. */
function formatTaxUpdatesBlock(updates) {
  if (!updates || !updates.length) return '';
  const lines = updates.map((u) => {
    const text = u.summary ? `${u.title}: ${u.summary}` : u.title;
    return u.link ? `• ${text}\n  ${u.link}` : `• ${text}`;
  });
  return '📌 *Latest — Nigerian tax:*\n\n' + lines.join('\n\n') + '\n\n';
}

const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN || 'taxable_webhook_verify';

/** Normalize WhatsApp wa_id to Nigerian phone format for User model (e.g. 2348012345678 -> 08012345678) */
function waIdToPhone(waId) {
  const digits = String(waId).replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('234')) {
    return '0' + digits.slice(3);
  }
  if (digits.length === 11 && digits.startsWith('0')) return digits;
  if (digits.length === 10) return '0' + digits;
  return digits;
}

/** Check if message is a "get started" / "Hi Taxable" intent */
function isGetStartedIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return (
    t.includes('hi taxable') ||
    t.includes('hi, taxable') ||
    t.includes('i want to get started') ||
    t.includes('get started') ||
    /^(hello|hey)\s*taxable/i.test(t) ||
    /taxable.*(get started|i want to get started)/i.test(t)
  );
}

/** Validate email format (simple) */
function isValidEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s).trim());
}

/** Validate Nigerian phone (User model pattern) */
function isValidPhone(s) {
  return /^(\+?234[\s-]?)?[0-9]{3}[\s-]?[0-9]{3}[\s-]?[0-9]{4}$|^0?[0-9]{10}$/.test(String(s).replace(/\s/g, ''));
}

/** Password: min 8, 1 upper, 1 lower, 1 number */
function isValidPassword(s) {
  return typeof s === 'string' && s.length >= 8 && /[a-z]/.test(s) && /[A-Z]/.test(s) && /\d/.test(s);
}

/** 6-digit OTP */
function isValidOTP(s) {
  return /^[0-9]{6}$/.test(String(s).trim());
}

/** First/Last name: letters, spaces, hyphens, apostrophes, 2–50 chars */
function isValidName(s) {
  return typeof s === 'string' && s.length >= 2 && s.length <= 50 && /^[a-zA-Z\s'-]+$/.test(s.trim());
}

/** User wants to resend the OTP (didn't get email) */
function isResendOTPIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return (
    /^resend$/i.test(t) ||
    /resend\s*(code|otp|email)?$/i.test(t) ||
    /(didn't|didnt)\s*get\s*(it|the\s*code|the\s*email)/i.test(t) ||
    /send\s*(it\s*)?again/i.test(t) ||
    /(i\s*)?didn't\s*receive/i.test(t) ||
    t === 'resend code' || t === 'resend otp'
  );
}

/** User is asking for menu or saying hi (for registered users) */
function isMenuOrHiIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return (
    /^menu$/i.test(t) ||
    /^hi$/i.test(t) ||
    /^hey$/i.test(t) ||
    /^hello$/i.test(t) ||
    /^options?$/i.test(t) ||
    /main\s*menu/i.test(t) ||
    /what\s*can\s*(you|i)\s*do/i.test(t)
  );
}

/** User says they're a complete beginner / never filed tax */
function isBeginnerIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return (
    /complete\s*beginner/i.test(t) ||
    /i'?m\s*a\s*beginner/i.test(t) ||
    /i\s*never\s*(filed|filled)\s*tax/i.test(t) ||
    /never\s*(filed|filled)\s*tax/i.test(t) ||
    /ive\s*never\s*filled\s*tax/i.test(t) ||
    /beginner.*tax|tax.*beginner/i.test(t)
  );
}

/** Time-based greeting: Good morning / afternoon / evening */
function getTimeBasedGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Menu body: Dashboard under Estimate PAYE, add beginner option, clearer formatting, reply = tax profile */
function getMenuBody() {
  return (
    '*Create tax profile* — we\'ll walk you through it\n\n' +
    '*Learn how Nigerian tax works* — no jargon, promise\n\n' +
    '*Estimate PAYE* — see what you might owe\n\n' +
    '📱 *Dashboard* → ' + DASHBOARD_URL + '\n\n' +
    '*I\'m a complete beginner — I\'ve never filed tax*\n\n' +
    '*Book a consultation* — talk to a human when you need to\n\n' +
    'Reply with *tax profile* for the next step.'
  );
}

/** One message for "beginner" intent: simple explanation */
function getBeginnerExplanation(firstName) {
  const name = firstName ? `${firstName}.` : '';
  return (
    getTimeBasedGreeting() + (name ? ' ' + name : '') + '\n\n' +
    'Here\'s the simple version:\n\n' +
    'There is *income*, and there are *deductibles*. The government wants a piece of the income — that\'s tax.\n\n' +
    'We\'ll guide you step by step. Reply with *tax profile* for the next step.'
  );
}

/**
 * Full menu message: time-based greeting + optional latest tax block + "where you're at" + menu.
 * status: { hasProfile: boolean, profileYear?: number } optional.
 * latestUpdates: array of { title, summary?, link? } from TaxUpdate (optional).
 */
function getMenuMessage(firstName, status = {}, latestUpdates = []) {
  const name = firstName || 'there';
  const greeting = getTimeBasedGreeting() + ' ' + name + '.\n\n';
  let line;
  if (status.hasProfile && status.profileYear) {
    line = `You've got a tax profile for ${status.profileYear} — nice. 🎯`;
  } else if (status.hasProfile) {
    line = 'You\'re set up — pick your next move below. 🎯';
  } else {
    line = 'No tax profile yet — create one and we\'ll guide you. 👇';
  }
  const updatesBlock = formatTaxUpdatesBlock(latestUpdates);
  return greeting + updatesBlock + line + '\n\n' + getMenuBody();
}

/**
 * GET - Webhook verification (Meta sends hub.mode, hub.verify_token, hub.challenge)
 */
const verifyWebhook = (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.status(403).send('Forbidden');
  }
};

/**
 * POST - Receive incoming WhatsApp messages and handle registration flow.
 * We await sending the reply before responding 200 so serverless (Vercel) doesn't kill the function early.
 */
const handleWebhook = async (req, res) => {
  const body = req.body;
  const sendOk = () => {
    if (!res.headersSent) res.status(200).send('OK');
  };

  console.log('[WhatsApp webhook] POST received', body?.object || 'no object');

  if (!body?.object || body.object !== 'whatsapp_business_account') {
    console.log('[WhatsApp webhook] Ignored: not whatsapp_business_account');
    sendOk();
    return;
  }
  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  if (changes?.field !== 'messages') {
    console.log('[WhatsApp webhook] Ignored: field is', changes?.field);
    sendOk();
    return;
  }
  const value = changes?.value;
  const messages = value?.messages;
  if (!messages?.length) {
    console.log('[WhatsApp webhook] Ignored: no messages in payload');
    sendOk();
    return;
  }

  const message = messages[0];
  const from = message.from; // wa_id
  const type = message.type;
  let text = '';
  if (type === 'text' && message.text) text = message.text.body || '';
  if (!text.trim()) {
    console.log('[WhatsApp webhook] Ignored: no text (type=', type, ')');
    sendOk();
    return;
  }

  console.log('[WhatsApp webhook] Message from', from, ':', text.substring(0, 80));

  /** Send reply and return promise so we can await it before ending the request (required on serverless) */
  const reply = (msg) => {
    return sendTextMessage(from, msg)
      .then(() => console.log('[WhatsApp webhook] Reply sent to', from))
      .catch(err => console.error('[WhatsApp webhook] Send error:', err.message || err));
  };

  try {
    let session = await WhatsAppSession.findOne({ waId: from });
    const isGetStarted = isGetStartedIntent(text);

    // Start registration flow
    if (isGetStarted && (!session || session.step === 'welcome' || session.step === 'done')) {
      if (session?.step === 'done') {
        const phone = waIdToPhone(from);
        const user = await User.findOne({ $or: [{ phone }, { phone: phone.replace(/^0/, '234') }] }).select('email firstName');
        if (user) {
          const latestUpdates = await getLatestTaxUpdatesForMenu();
          const greeting = getTimeBasedGreeting() + ' ' + user.firstName + '. ';
          await reply(greeting + 'You\'re already in! 🎉 Your dashboard: ' + DASHBOARD_URL + ' — signed up with ' + user.email + '.\n\n' + formatTaxUpdatesBlock(latestUpdates) + getMenuBody());
          sendOk();
          return;
        }
      }
      if (!session) {
        session = await WhatsAppSession.create({ waId: from, step: 'first_name' });
      } else {
        session.step = 'first_name';
        session.registrationData = {};
        session.pendingUserId = undefined;
        await session.save();
      }
      await reply("Welcome to *Taxable*! 🎉 We're here to make tax simple and stress-free. You can create an account or log in — we've got you. Let's get started by creating your account. First, what should we call you? *What's your first name?*");
      sendOk();
      return;
    }

    // If no session or not in flow, ignore or prompt
    if (!session || session.step === 'welcome') {
      if (isGetStarted) {
        session = await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          { $set: { step: 'first_name', registrationData: {}, updatedAt: new Date() } },
          { upsert: true, new: true }
        );
        await reply("Welcome to *Taxable*! 🎉 We're here to make tax simple and stress-free. Let's get started by creating your account. *What's your first name?*");
      } else if (isMenuOrHiIntent(text)) {
        await reply("You're not signed up yet. Say *Hi Taxable* or *Get started* to create your account — then you'll get the full menu! 🎉");
      } else if (isBeginnerIntent(text)) {
        await reply("Here's the simple version:\n\nThere is *income*, and there are *deductibles*. The government wants a piece of the income — that's tax.\n\nSay *Hi Taxable* to create an account and we'll guide you step by step.");
      }
      sendOk();
      return;
    }

    // Allow "Hi Taxable" / get started to restart the flow mid-registration
    if (isGetStarted && session.step !== 'done') {
      session.step = 'first_name';
      session.registrationData = {};
      session.pendingUserId = undefined;
      await session.save();
      await reply("No worries! Let's start fresh. *What's your first name?*");
      sendOk();
      return;
    }

    // Registered user says "menu" or "hi" (or hello/options) → show menu with status
    const phoneForLookup = waIdToPhone(from);
    const regUser = await User.findOne({ $or: [{ phone: phoneForLookup }, { phone: phoneForLookup.replace(/^0/, '234') }] }).select('firstName _id').lean();
    if (regUser && isBeginnerIntent(text)) {
      await reply(getBeginnerExplanation(regUser.firstName));
      sendOk();
      return;
    }

    if (regUser && isMenuOrHiIntent(text)) {
      const [latestProfile, latestUpdates] = await Promise.all([
        TaxableProfile.findOne({ user: regUser._id }).sort({ year: -1 }).select('year').lean(),
        getLatestTaxUpdatesForMenu()
      ]);
      const status = latestProfile ? { hasProfile: true, profileYear: latestProfile.year } : { hasProfile: false };
      await reply(getMenuMessage(regUser.firstName, status, latestUpdates));
      sendOk();
      return;
    }

    // Unregistered user (mid-flow) says "menu", "hi", or "beginner" → don't use as name; prompt to sign up or continue
    if (isMenuOrHiIntent(text)) {
      await reply("Finish signing up to see the menu! Say *Hi Taxable* to start over, or reply with your answer to the question above. We can't wait to have you! 😊");
      sendOk();
      return;
    }
    if (isBeginnerIntent(text)) {
      await reply("Here's the simple version:\n\nThere is *income*, and there are *deductibles*. The government wants a piece of the income — that's tax.\n\nFinish signing up (reply above) or say *Hi Taxable* to start over — then reply *tax profile* for the next step.");
      sendOk();
      return;
    }

    const step = session.step;
    const data = session.registrationData || {};

    switch (step) {
      case 'first_name': {
        if (!isValidName(text)) {
          await reply("We'd love to get your name right — just letters, 2–50 characters. Try again? 😊");
          sendOk();
          return;
        }
        data.firstName = text.trim();
        session.registrationData = data;
        session.step = 'last_name';
        await session.save();
        await reply(`Nice to meet you, ${data.firstName}! 👋 *What's your last name?*`);
        break;
      }
      case 'last_name': {
        if (!isValidName(text)) {
          await reply("Almost there — just letters for your last name, 2–50 characters. Try again?");
          sendOk();
          return;
        }
        data.lastName = text.trim();
        session.registrationData = data;
        session.step = 'email';
        await session.save();
        await reply(`${data.firstName}, what's your *email address*? We'll use it to verify your account and keep you updated.`);
        break;
      }
      case 'email': {
        if (!isValidEmail(text)) {
          await reply(`${data.firstName || 'There'}, that doesn't look like a valid email (e.g. name@example.com). Give it another go? 📧`);
          sendOk();
          return;
        }
        data.email = text.trim().toLowerCase();
        session.registrationData = data;
        session.step = 'phone_confirm';
        await session.save();
        const suggestedPhone = waIdToPhone(from);
        const firstName = data.firstName || '';
        await reply(`Great, ${firstName}! We have *${suggestedPhone}* from WhatsApp. Do you want to use this number? Reply *yes* or *no*.`);
        break;
      }
      case 'phone': {
        // Legacy: session had step 'phone' (old flow). Treat as phone_confirm and ask yes/no.
        session.step = 'phone_confirm';
        await session.save();
        const suggestedPhone = waIdToPhone(from);
        const firstName = data.firstName || '';
        await reply(`Great, ${firstName}! We have *${suggestedPhone}* from WhatsApp. Do you want to use this number? Reply *yes* or *no*.`);
        break;
      }
      case 'phone_confirm': {
        const t = text.trim().toLowerCase();
        const suggestedPhone = waIdToPhone(from);
        const firstName = data.firstName || '';
        if (t === 'yes' || t === 'y') {
          data.phone = suggestedPhone;
          session.registrationData = data;
          session.step = 'password';
          await session.save();
          await reply(`${firstName}, almost there! *Choose a password* — at least 8 characters, with one uppercase letter, one lowercase letter, and one number. We never show or repeat it in chat for your security. 🔒`);
          break;
        }
        if (t === 'no' || t === 'n') {
          session.step = 'phone_input';
          await session.save();
          await reply(`No problem, ${firstName}! What's your *phone number*?`);
          break;
        }
        await reply(`Reply *yes* to use ${suggestedPhone}, or *no* to enter a different number, ${firstName}. 😊`);
        sendOk();
        return;
      }
      case 'phone_input': {
        const phone = text.trim().replace(/\s/g, '');
        const normalized = phone.startsWith('0') ? phone : phone.startsWith('234') ? '0' + phone.slice(3) : '0' + phone;
        const firstName = data.firstName || '';
        if (!isValidPhone(normalized)) {
          await reply(`${firstName}, we need a valid Nigerian number (e.g. 08012345678 or +2348012345678). Try again? 📱`);
          sendOk();
          return;
        }
        data.phone = normalized;
        session.registrationData = data;
        session.step = 'password';
        await session.save();
        await reply(`${firstName}, almost there! *Choose a password* — at least 8 characters, with one uppercase letter, one lowercase letter, and one number. We never show or repeat it in chat for your security. 🔒`);
        break;
      }
      case 'password': {
        if (!isValidPassword(text)) {
          await reply(`${data.firstName || 'There'}, we need at least 8 characters, with one uppercase letter, one lowercase letter, and one number. Give it another go? 🔐`);
          sendOk();
          return;
        }
        data.password = text;
        session.registrationData = data;
        session.step = 'otp';
        await session.save();

        try {
          const { user } = await registerUser({
            firstName: data.firstName,
            lastName: data.lastName,
            email: data.email,
            phone: data.phone,
            password: data.password
          });
          session.pendingUserId = user._id;
          await session.save();
          await reply("Got it! We've saved your password securely — we never show or repeat it in chat. 🔒");
          await reply(`${data.firstName}, account created! 🎉 We've sent a 6-digit code to ${data.email}. Reply with the *code* to verify. Didn't get it? Just reply *resend* and we'll send it again.`);
        } catch (err) {
          if (err.code === 'EMAIL_EXISTS') {
            await reply("This email is already registered. Use a different email or log in on the Taxable app — we'd love to have you back! 😊");
            session.step = 'email';
            session.registrationData = { ...data, email: undefined };
            await session.save();
          } else if (err.code === 'EMAIL_SEND_FAILED') {
            await reply('We couldn’t send the verification email. Please check your email address and try again later.');
            session.step = 'email';
            await session.save();
          } else {
            console.error('WhatsApp registration error:', err);
            await reply("Oops, something went wrong on our end. Please try again — or say *Hi Taxable* to start fresh. We're here to help! 💬");
            session.step = 'password';
            await session.save();
          }
        }
        break;
      }
      case 'otp': {
        if (isResendOTPIntent(text)) {
          const email = data.email;
          const firstName = data.firstName || 'there';
          try {
            await resendOTP(email, firstName);
            await reply(`No problem, ${firstName}! We've sent a *new* 6-digit code to ${email}. Check your inbox (and spam folder). Reply with the code when you get it. 📧`);
          } catch (e) {
            console.error('[WhatsApp] Resend OTP failed', email, e.message);
            await reply("We couldn't send the code right now. Please check that your email is correct, or say *Hi Taxable* to start over. We're here to help! 💬");
          }
          sendOk();
          return;
        }
        if (!isValidOTP(text)) {
          await reply(`${data.firstName || 'There'}, send us the *6-digit code* from your email, or reply *resend* if you didn't get it. 😊`);
          sendOk();
          return;
        }
        const email = data.email;
        const otpRecord = await OTP.findOne({
          email,
          code: text.trim(),
          purpose: 'email_verification'
        });
        if (!otpRecord) {
          await reply(`${data.firstName || 'There'}, that code doesn't look right or may have expired. Check the code in your email, or reply *resend* to get a new one. Need to start over? Say *Hi Taxable*. 😊`);
          sendOk();
          return;
        }
        if (otpRecord.verified) {
          await reply(`${data.firstName || 'There'}, you're all set! 🎉 That code was already used — open the Taxable app or website and sign in when you're ready. Welcome back!`);
          session.step = 'done';
          await session.save();
          const latestUpdates = await getLatestTaxUpdatesForMenu();
          await reply(getMenuMessage(data.firstName, {}, latestUpdates));
          sendOk();
          return;
        }
        if (otpRecord.expiresAt < new Date()) {
          await reply(`${data.firstName || 'There'}, that code has expired. Reply *resend* to get a new code, or say *Hi Taxable* to start registration again. We've got you! 👍`);
          sendOk();
          return;
        }
        const user = await User.findById(session.pendingUserId);
        if (!user) {
          await reply("Something went wrong on our end. Say *Hi Taxable* to start over — we'll get you through this! 💪");
          sendOk();
          return;
        }
        otpRecord.verified = true;
        await otpRecord.save();
        user.emailVerified = true;
        await user.save();
        session.step = 'done';
        session.pendingUserId = undefined;
        await session.save();
        await reply(`✅ You're in, ${data.firstName}! Your email is verified. Open the Taxable app or website and sign in with the password you just set — your account is ready. Welcome to Taxable! 🎉`);
        const latestUpdates = await getLatestTaxUpdatesForMenu();
        await reply(getMenuMessage(data.firstName, {}, latestUpdates));
        break;
      }
      case 'done': {
        const latestUpdates = await getLatestTaxUpdatesForMenu();
        await reply(getMenuMessage(data.firstName || undefined, {}, latestUpdates));
        break;
      }
      default:
        await reply("Say *Hi Taxable* or *Get started* to create your account — we can't wait to meet you! 🎉");
    }
    sendOk();
  } catch (err) {
    console.error('WhatsApp webhook error:', err);
    try {
      await sendTextMessage(from, "Oops! Something went wrong. Try again or say *Hi Taxable* to start fresh — we're here to help! 💬");
    } catch (e) {}
    sendOk();
  }
};

module.exports = {
  verifyWebhook,
  handleWebhook
};
