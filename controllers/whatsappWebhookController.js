const WhatsAppSession = require('../models/WhatsAppSession');
const User = require('../models/User');
const OTP = require('../models/OTP');
const { sendTextMessage } = require('../services/whatsappService');
const { registerUser } = require('../services/registrationService');

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
 * POST - Receive incoming WhatsApp messages and handle registration flow
 */
const handleWebhook = async (req, res) => {
  // Respond 200 immediately so Meta doesn't retry
  res.status(200).send('OK');

  const body = req.body;
  console.log('[WhatsApp webhook] POST received', body?.object || 'no object');

  if (!body?.object || body.object !== 'whatsapp_business_account') {
    console.log('[WhatsApp webhook] Ignored: not whatsapp_business_account');
    return;
  }
  const entry = body.entry?.[0];
  const changes = entry?.changes?.[0];
  if (changes?.field !== 'messages') {
    console.log('[WhatsApp webhook] Ignored: field is', changes?.field);
    return;
  }
  const value = changes?.value;
  const messages = value?.messages;
  if (!messages?.length) {
    console.log('[WhatsApp webhook] Ignored: no messages in payload');
    return;
  }

  const message = messages[0];
  const from = message.from; // wa_id
  const type = message.type;
  let text = '';
  if (type === 'text' && message.text) text = message.text.body || '';
  if (!text.trim()) {
    console.log('[WhatsApp webhook] Ignored: no text (type=', type, ')');
    return;
  }

  console.log('[WhatsApp webhook] Message from', from, ':', text.substring(0, 80));

  const reply = (msg) => {
    sendTextMessage(from, msg)
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
          reply(`You're already registered! Your email is ${user.email}. Log in at the Taxable app or website to continue.`);
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
      reply("Great! To get started, I'll need a few details. What's your *first name*?");
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
        reply("Great! To get started, I'll need a few details. What's your *first name*?");
      }
      return;
    }

    // Allow "Hi Taxable" / get started to restart the flow mid-registration
    if (isGetStarted && session.step !== 'done') {
      session.step = 'first_name';
      session.registrationData = {};
      session.pendingUserId = undefined;
      await session.save();
      reply("No problem! Let's start over. What's your *first name*?");
      return;
    }

    const step = session.step;
    const data = session.registrationData || {};

    switch (step) {
      case 'first_name': {
        if (!isValidName(text)) {
          reply('Please send a valid first name (letters only, 2–50 characters).');
          return;
        }
        data.firstName = text.trim();
        session.registrationData = data;
        session.step = 'last_name';
        await session.save();
        reply(`Thanks! What's your *last name*?`);
        break;
      }
      case 'last_name': {
        if (!isValidName(text)) {
          reply('Please send a valid last name (letters only, 2–50 characters).');
          return;
        }
        data.lastName = text.trim();
        session.registrationData = data;
        session.step = 'email';
        await session.save();
        reply('What’s your *email address*?');
        break;
      }
      case 'email': {
        if (!isValidEmail(text)) {
          reply('Please send a valid email address (e.g. name@example.com).');
          return;
        }
        data.email = text.trim().toLowerCase();
        session.registrationData = data;
        session.step = 'phone';
        await session.save();
        const suggestedPhone = waIdToPhone(from);
        reply(`What’s your *phone number*? (We have ${suggestedPhone} from WhatsApp — reply with it or send a different number.)`);
        break;
      }
      case 'phone': {
        const phone = text.trim().replace(/\s/g, '');
        const normalized = phone.startsWith('0') ? phone : phone.startsWith('234') ? '0' + phone.slice(3) : '0' + phone;
        if (!isValidPhone(normalized)) {
          reply('Please send a valid Nigerian phone number (e.g. 08012345678 or +2348012345678).');
          return;
        }
        data.phone = normalized;
        session.registrationData = data;
        session.step = 'password';
        await session.save();
        reply('Choose a *password* (at least 8 characters, with one uppercase letter, one lowercase letter, and one number).');
        break;
      }
      case 'password': {
        if (!isValidPassword(text)) {
          reply('Password must be at least 8 characters and include one uppercase letter, one lowercase letter, and one number. Try again.');
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
          reply(`Account created! We’ve sent a 6-digit verification code to ${data.email}. Reply with that *code* to verify your account.`);
        } catch (err) {
          if (err.code === 'EMAIL_EXISTS') {
            reply('This email is already registered. Please use a different email or log in on the Taxable app.');
            session.step = 'email';
            session.registrationData = { ...data, email: undefined };
            await session.save();
          } else if (err.code === 'EMAIL_SEND_FAILED') {
            reply('We couldn’t send the verification email. Please check your email address and try again later.');
            session.step = 'email';
            await session.save();
          } else {
            console.error('WhatsApp registration error:', err);
            reply('Something went wrong. Please try again or register on the Taxable app.');
            session.step = 'password';
            await session.save();
          }
        }
        break;
      }
      case 'otp': {
        if (!isValidOTP(text)) {
          reply('Please send the 6-digit code from your email.');
          return;
        }
        const email = data.email;
        const otpRecord = await OTP.findOne({
          email,
          code: text.trim(),
          purpose: 'email_verification'
        });
        if (!otpRecord) {
          reply('Invalid or expired code. Please check the code we sent to your email, or say "Hi Taxable I want to get started" to start over.');
          return;
        }
        if (otpRecord.verified) {
          reply('This code was already used. You’re all set — log in on the Taxable app!');
          session.step = 'done';
          await session.save();
          return;
        }
        if (otpRecord.expiresAt < new Date()) {
          reply('This code has expired. Please say "Hi Taxable I want to get started" to register again and we’ll send a new code.');
          return;
        }
        const user = await User.findById(session.pendingUserId);
        if (!user) {
          reply('Something went wrong. Please say "Hi Taxable I want to get started" to register again.');
          return;
        }
        otpRecord.verified = true;
        await otpRecord.save();
        user.emailVerified = true;
        await user.save();
        session.step = 'done';
        session.pendingUserId = undefined;
        await session.save();
        reply(`✅ You’re all set! Your email is verified. Log in at the Taxable app or website with ${email} and your password. Welcome to Taxable!`);
        break;
      }
      case 'done':
        reply('You’re already registered. Log in at the Taxable app or website. Need help? Reply with "Hi Taxable I want to get started" to run through registration again.');
        break;
      default:
        reply('Reply with *Hi Taxable I want to get started* to register.');
    }
  } catch (err) {
    console.error('WhatsApp webhook error:', err);
    sendTextMessage(from, 'Something went wrong. Please try again or register at the Taxable app.').catch(() => {});
  }
};

module.exports = {
  verifyWebhook,
  handleWebhook
};
