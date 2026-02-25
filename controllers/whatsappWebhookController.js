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

/** User wants to learn how tax works (menu choice) */
function isLearnHowTaxWorksIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return (
    /learn\s*how\s*tax\s*works/i.test(t) ||
    /how\s*(does|do)\s*tax\s*work/i.test(t) ||
    /simple\s*version/i.test(t) ||
    /how\s*tax\s*works/i.test(t) ||
    t === 'learn how tax works' ||
    t === 'learn how tax works first'
  );
}

/** User wants to login to existing account */
function isLoginIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return (
    /^login$/i.test(t) ||
    /login\s*to\s*(my\s*)?account/i.test(t) ||
    /log\s*in/i.test(t) ||
    /sign\s*in/i.test(t) ||
    /i\s*have\s*an\s*account/i.test(t) ||
    /already\s*have\s*an\s*account/i.test(t)
  );
}

/** User wants to set up tax profile */
function isSetUpTaxProfileIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return (
    /set\s*up\s*(my\s*)?tax\s*profile/i.test(t) ||
    /setup\s*(my\s*)?tax\s*profile/i.test(t) ||
    /tax\s*profile/i.test(t) && !/login/i.test(t) ||
    /create\s*(my\s*)?tax\s*profile/i.test(t)
  );
}

/** User wants to continue their filing (menu option) */
function isContinueMyFilingIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return (
    /continue\s*my\s*filing/i.test(t) ||
    /continue\s*filing/i.test(t) ||
    /continue\s*my\s*tax/i.test(t) ||
    t === 'continue my filing'
  );
}

/** User wants to complete/add DOB and address details */
function isCompleteMyDetailsIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return (
    /complete\s*my\s*details/i.test(t) ||
    /add\s*my\s*details/i.test(t) ||
    /complete\s*my\s*profile/i.test(t) ||
    /add\s*(my\s*)?(dob|address|details)/i.test(t) ||
    t === 'complete my details'
  );
}

/** True if profile has NIN and personal/address details needed before income & deductibles */
function profileHasPersonalDetailsComplete(profile) {
  if (!profile) return false;
  const hasNin = !!(profile.primaryNIN && String(profile.primaryNIN).trim().length === 11);
  const hasDob = !!(profile.dob != null);
  const hasStreet = !!(profile.street != null && String(profile.street).trim());
  const hasCity = !!(profile.city != null && String(profile.city).trim());
  const hasState = !!(profile.state != null && String(profile.state).trim());
  return hasNin && hasDob && hasStreet && hasCity && hasState;
}

/** User says they're ready to start (e.g. after tax profile summary). Handles "I'm ready", "im ready", "ready", smart quotes. */
function isImReadyIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase().replace(/[\u2018\u2019\u201B]/g, "'"); // normalize smart apostrophes
  return (
    /^i'?m\s*ready\.?$/i.test(t) ||
    /^i\s+am\s+ready\.?$/i.test(t) ||
    /^ready\.?$/i.test(t)
  );
}

/** Income source options for tax profile (order 1–6). */
const INCOME_SOURCE_OPTIONS = [
  'Salary / Employment',
  'Business/Self-employment',
  'Freelance/Consulting',
  'Investment income',
  'Rental income',
  'Digital Assets/Crypto'
];

/** Parse "1" or "1,2" or "1, 2, 3" into array of option labels. Returns [] if invalid. */
function parseIncomeSourceReply(text) {
  const t = text.trim().replace(/\s+/g, '');
  const parts = t.split(',').map(s => parseInt(s, 10)).filter(n => n >= 1 && n <= 6);
  const unique = [...new Set(parts)];
  if (unique.length === 0) return null;
  return unique.map(n => INCOME_SOURCE_OPTIONS[n - 1]);
}

/** Time-based greeting: Good morning / afternoon / evening */
function getTimeBasedGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Good morning';
  if (hour >= 12 && hour < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Variation 1: User has account + no tax profile (assistant tone) */
function getMessageNoProfile(firstName) {
  const g = getTimeBasedGreeting();
  const name = firstName || 'there';
  return (
    g + ' ' + name + ' 👋\n\n' +
    'I\'m Taxable — your tax assistant. I\'m here to make this simple for you.\n\n' +
    'I checked your account and you\'re all signed up 👍\n' +
    'But it looks like you haven\'t set up your tax profile yet.\n\n' +
    'That\'s the first thing we should do — once it\'s ready, I can calculate properly and guide you step by step.\n\n' +
    '📌 *Quick tax update:*\n' +
    '• Earn ₦800,000 or less? No PAYE.\n' +
    '• Rent relief: 20% (up to ₦500k).\n' +
    '• SMEs under ₦50m turnover? No Company Income Tax.\n\n' +
    '🗓 *Filing deadlines:*\n' +
    '• Employers — Jan 31\n' +
    '• Individuals — Mar 31\n' +
    'Late payment = 10% penalty + interest.\n\n' +
    'What would you like to do next?\n\n' +
    '• Set up my tax profile\n' +
    '• Learn how tax works (simple version)\n' +
    '• Estimate my PAYE\n' +
    '• Speak to someone\n\n' +
    'Just reply with your choice and I\'ll guide you.'
  );
}

/** Variation 2: User has account + profile completed */
function getMessageProfileCompleted(firstName) {
  const g = getTimeBasedGreeting();
  const name = firstName || 'there';
  return (
    g + ' ' + name + ' 👋\n\n' +
    'I\'m Taxable — your personal tax guide.\n\n' +
    'Good news — your account is active and your tax profile is ready ✅\n\n' +
    'Right now, your filing hasn\'t been completed yet, so we should sort that before the deadline.\n' +
    'You\'re actually closer than you think.\n\n' +
    '📌 *Quick reminder:*\n' +
    '• ₦800k or less income? No PAYE.\n' +
    '• Rent relief: 20% (max ₦500k).\n\n' +
    '🗓 *Filing deadline:* Mar 31\n' +
    'Late payment = 10% + interest.\n\n' +
    'Would you like to:\n\n' +
    '• Continue my filing\n' +
    '• Check my PAYE estimate\n' +
    '• Ask a question\n\n' +
    'Tell me what you need and I\'ll handle it.'
  );
}

/** Variation 3: User has no account (no first name) */
function getMessageNoAccount() {
  const g = getTimeBasedGreeting();
  return (
    g + ' 👋\n\n' +
    'I\'m Taxable — your assistant for everything Nigerian tax.\n\n' +
    'It looks like you don\'t have an account yet.\n' +
    'No worries — we\'ll start from there.\n\n' +
    'Once your account is created, I\'ll help you set up your tax profile and guide you through everything step by step.\n\n' +
    '📌 *Quick update you should know:*\n' +
    '• ₦800k or less income? No PAYE.\n' +
    '• Rent relief: 20% (up to ₦500k).\n' +
    '• SMEs under ₦50m turnover? No CIT.\n\n' +
    '🗓 *Deadlines:*\n' +
    'Jan 31 (Employers)\n' +
    'Mar 31 (Individuals)\n\n' +
    'Ready to begin?\n\n' +
    '• Create my account\n' +
    '• Login to your account\n' +
    '• Learn how tax works first\n\n' +
    'Just reply with what you\'d like to do.'
  );
}

/** Shared "simple version" of how tax works, including what deductibles are. */
function getSimpleTaxExplanation() {
  return (
    'Here\'s the simple version:\n\n' +
    'There is *income*, and there are *deductibles*. The government wants a piece of the income — that\'s tax.\n\n' +
    '*Deductibles* are different life aspects that can help relieve or reduce the amount you pay as tax (e.g. rent, pension, certain allowances).'
  );
}

/** Summary shown before tax profile questions; user replies "I'm ready" to start. */
function getTaxProfileSummary() {
  return (
    'Here\'s what we\'ll need — it\'s quick:\n\n' +
    '• *NIN* (National ID Number, 11 digits — this is your Tax ID)\n' +
    '• A few *yes/no* questions: residency (183+ days in Nigeria), rent, health insurance, pension, mortgage\n\n' +
    'Reply *I\'m ready* when you want to start.'
  );
}

/** One message for "beginner" intent: simple explanation (assistant tone) */
function getBeginnerExplanation(firstName) {
  const g = getTimeBasedGreeting();
  const name = firstName ? ` ${firstName}.` : '';
  return (
    g + name + '\n\n' +
    'I\'m Taxable — your tax assistant.\n\n' +
    getSimpleTaxExplanation() + '\n\n' +
    'We\'ll guide you step by step. Reply with *Set up my tax profile* or *tax profile* for the next step.'
  );
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
        const user = await User.findOne({ $or: [{ phone }, { phone: phone.replace(/^0/, '234') }] }).select('email firstName _id');
        if (user) {
          const hasProfile = await TaxableProfile.findOne({ user: user._id }).select('_id').lean();
          await reply(hasProfile ? getMessageProfileCompleted(user.firstName) : getMessageNoProfile(user.firstName));
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
        await reply(getMessageNoAccount());
      } else if (isLearnHowTaxWorksIntent(text)) {
        await reply(getSimpleTaxExplanation() + '\n\nReply *Create my account* or *Login to your account* to get started.');
      } else if (isLoginIntent(text)) {
        session = await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          { $set: { step: 'login_email', registrationData: {}, updatedAt: new Date() } },
          { upsert: true, new: true }
        );
        await reply("What's the *email address* for your Taxable account?");
      } else if (isBeginnerIntent(text)) {
        await reply(getSimpleTaxExplanation() + '\n\nSay *Hi Taxable* to create an account and we\'ll guide you step by step.');
      }
      sendOk();
      return;
    }

    // Login flow: collect email then password, verify, link user to this WhatsApp and set session to done
    if (session && (session.step === 'login_email' || session.step === 'login_password')) {
      if (session.step === 'login_email') {
        if (!isValidEmail(text)) {
          await reply("That doesn't look like a valid email. Please send your Taxable account email (e.g. name@example.com).");
          sendOk();
          return;
        }
        const loginEmail = text.trim().toLowerCase();
        session.registrationData = session.registrationData || {};
        session.registrationData.loginEmail = loginEmail;
        session.step = 'login_password';
        await session.save();
        await reply("Now enter your *password*.");
        sendOk();
        return;
      }
      if (session.step === 'login_password') {
        const loginEmail = (session.registrationData && session.registrationData.loginEmail) || '';
        const userDoc = await User.findOne({ email: loginEmail }).select('+password firstName lastName _id');
        if (!userDoc) {
          await reply("That email isn't registered. Try again with the correct email, or reply *Create my account* to sign up.");
          sendOk();
          return;
        }
        const match = await userDoc.comparePassword(text.trim());
        if (!match) {
          await reply("That password isn't right. Try again, or reply *Create my account* to sign up.");
          sendOk();
          return;
        }
        const phone = waIdToPhone(from);
        await User.findByIdAndUpdate(userDoc._id, { $set: { phone, updatedAt: new Date() } });
        session.step = 'done';
        session.registrationData = {
          firstName: userDoc.firstName,
          lastName: userDoc.lastName,
          email: userDoc.email,
          phone
        };
        session.pendingUserId = undefined;
        await session.save();
        const hasProfile = await TaxableProfile.findOne({ user: userDoc._id }).select('_id').lean();
        await reply(hasProfile ? getMessageProfileCompleted(userDoc.firstName) : getMessageNoProfile(userDoc.firstName));
        sendOk();
        return;
      }
    }

    // Tax profile setup flow: intro → year → NIN → income → residency → rent → health → pension → mortgage → create → reuse_ask → dob → street → city → state → income_info → deductibles
    const taxProfileSteps = ['tax_profile_intro', 'tax_profile_year', 'tax_profile_nin', 'tax_profile_income', 'tax_profile_residency', 'tax_profile_rent', 'tax_profile_health', 'tax_profile_pension', 'tax_profile_mortgage', 'tax_profile_reuse_ask', 'tax_profile_dob', 'tax_profile_street', 'tax_profile_city', 'tax_profile_state', 'tax_profile_income_info', 'tax_profile_deductibles'];
    if (session && taxProfileSteps.includes(session.step)) {
      const phoneForTax = waIdToPhone(from);
      const userForTax = await User.findOne({ $or: [{ phone: phoneForTax }, { phone: phoneForTax.replace(/^0/, '234') }] }).select('_id firstName').lean();
      if (!userForTax) {
        session.step = 'done';
        session.taxProfileData = {};
        await session.save();
        await reply("We couldn't find your account. Say *Hi Taxable* to start fresh.");
        sendOk();
        return;
      }
      const td = session.taxProfileData || {};

      if (session.step === 'tax_profile_intro') {
        if (!isImReadyIntent(text)) {
          await reply("Reply *I'm ready* when you want to start the tax profile setup.");
          sendOk();
          return;
        }
        session.step = 'tax_profile_year';
        session.taxProfileData = {};
        await session.save();
        await reply("Which *tax year*? (e.g. 2025 or 2026). Minimum is 2025.");
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_year') {
        const y = parseInt(String(text).trim(), 10);
        if (isNaN(y) || y < 2025 || y > 2100) {
          await reply("Please send a valid year (2025 or later), e.g. 2026.");
          sendOk();
          return;
        }
        td.year = y;
        session.taxProfileData = td;
        session.step = 'tax_profile_nin';
        await session.save();
        await reply("What's your *NIN*? (11 digits — your National ID Number, used as Tax ID).");
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_nin') {
        const nin = String(text).trim().replace(/\D/g, '');
        if (nin.length !== 11) {
          await reply("NIN must be exactly 11 digits. Send your National ID Number.");
          sendOk();
          return;
        }
        td.nin = nin;
        session.taxProfileData = td;
        session.step = 'tax_profile_income';
        await session.save();
        const incomeList = INCOME_SOURCE_OPTIONS.map((label, i) => `${i + 1}. ${label}`).join('\n');
        await reply("What's your *primary income source*? You can pick one or more. Reply with the number(s), e.g. *1* or *1,2* or *1,2,3*:\n\n" + incomeList);
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_income') {
        const sources = parseIncomeSourceReply(text);
        if (!sources || sources.length === 0) {
          await reply("Reply with the number(s) for your income source(s), e.g. 1 or 1,2. Options: 1=Salary, 2=Business, 3=Freelance, 4=Investment, 5=Rental, 6=Digital/Crypto.");
          sendOk();
          return;
        }
        td.primaryIncomeSources = sources;
        session.taxProfileData = td;
        session.step = 'tax_profile_residency';
        await session.save();
        await reply("Did you live in Nigeria for *183+ days* this tax year? (This affects whether you declare worldwide or only Nigerian income.) Reply *Yes* or *No*.");
        sendOk();
        return;
      }

      const yesNo = (t) => { const x = t.trim().toLowerCase(); return x === 'yes' || x === 'y' ? true : x === 'no' || x === 'n' ? false : null; };
      if (session.step === 'tax_profile_residency') {
        const val = yesNo(text);
        if (val === null) { await reply("Reply *Yes* or *No*."); sendOk(); return; }
        td.residency183Days = val;
        session.taxProfileData = td;
        session.step = 'tax_profile_rent';
        await session.save();
        await reply("Do you *pay rent*? (If yes, you may get 20% rent relief, up to ₦500k.) Reply *Yes* or *No*.");
        sendOk();
        return;
      }
      if (session.step === 'tax_profile_rent') {
        const val = yesNo(text);
        if (val === null) { await reply("Reply *Yes* or *No*."); sendOk(); return; }
        td.paysRent = val;
        session.taxProfileData = td;
        session.step = 'tax_profile_health';
        await session.save();
        await reply("Do you pay for *health insurance*? Reply *Yes* or *No*.");
        sendOk();
        return;
      }
      if (session.step === 'tax_profile_health') {
        const val = yesNo(text);
        if (val === null) { await reply("Reply *Yes* or *No*."); sendOk(); return; }
        td.hasHealthInsurance = val;
        session.taxProfileData = td;
        session.step = 'tax_profile_pension';
        await session.save();
        await reply("Do you contribute to a *pension plan*? Reply *Yes* or *No*.");
        sendOk();
        return;
      }
      if (session.step === 'tax_profile_pension') {
        const val = yesNo(text);
        if (val === null) { await reply("Reply *Yes* or *No*."); sendOk(); return; }
        td.hasPension = val;
        session.taxProfileData = td;
        session.step = 'tax_profile_mortgage';
        await session.save();
        await reply("Do you pay a *mortgage*? Reply *Yes* or *No*.");
        sendOk();
        return;
      }
      if (session.step === 'tax_profile_mortgage') {
        const val = yesNo(text);
        if (val === null) { await reply("Reply *Yes* or *No*."); sendOk(); return; }
        td.paysMortgage = val;
        session.taxProfileData = td;
        const year = td.year;
        const nin = td.nin;
        const primaryIncomeSources = td.primaryIncomeSources || [];
        const residency183Days = td.residency183Days;
        const paysRent = td.paysRent;
        const hasHealthInsurance = td.hasHealthInsurance;
        const hasPension = td.hasPension;
        const paysMortgage = td.paysMortgage;
        const existing = await TaxableProfile.findOne({ user: userForTax._id, year, profileType: 'Individual' });
        if (existing) {
          await reply(`You already have a tax profile for ${year}. Say *Hi* or *menu* to see your options.`);
          session.step = 'done';
          session.taxProfileData = {};
          await session.save();
          sendOk();
          return;
        }
        let createdProfile;
        try {
          createdProfile = await TaxableProfile.create({
            user: userForTax._id,
            author: userForTax._id,
            year,
            profileType: 'Individual',
            status: 'draft',
            primaryNIN: nin,
            primaryIncomeSources: primaryIncomeSources.length ? primaryIncomeSources : undefined,
            residency183Days,
            paysRent,
            hasHealthInsurance,
            hasPension,
            paysMortgage
          });
        } catch (err) {
          console.error('[WhatsApp] Tax profile create error:', err);
          await reply("Something went wrong creating your profile. Please try again or say *menu* for options.");
          sendOk();
          return;
        }
        td.currentProfileId = createdProfile.profileId;
        session.taxProfileData = td;
        const previousProfileWithDetails = await TaxableProfile.findOne({
          user: userForTax._id,
          _id: { $ne: createdProfile._id },
          $or: [{ dob: { $exists: true, $ne: null } }, { street: { $exists: true, $ne: '', $ne: null } }]
        }).sort({ year: -1 }).select('year dob street city state').lean();
        if (previousProfileWithDetails && (previousProfileWithDetails.dob || previousProfileWithDetails.street)) {
          session.step = 'tax_profile_reuse_ask';
          await session.save();
          await reply(`Your tax profile for *${year}* is created ✅\n\nDo you want to *reuse* the details (date of birth, address) from your ${previousProfileWithDetails.year} profile? Reply *Yes* or *No*.`);
        } else {
          session.step = 'tax_profile_dob';
          await session.save();
          await reply(`Your tax profile for *${year}* is created ✅\n\nNext: what's your *date of birth*? (e.g. 15-Jan-1990 or 1990-01-15)`);
        }
        sendOk();
        return;
      }

      const pid = td.currentProfileId;
      const currentProfile = pid ? await TaxableProfile.findByProfileIdOrId(pid, userForTax._id) : null;

      if (session.step === 'tax_profile_reuse_ask') {
        const val = yesNo(text);
        if (val === null) { await reply("Reply *Yes* or *No*."); sendOk(); return; }
        if (val && currentProfile) {
          const previous = await TaxableProfile.findOne({
            user: userForTax._id,
            _id: { $ne: currentProfile._id },
            $or: [{ dob: { $exists: true, $ne: null } }, { street: { $exists: true, $ne: '' } }]
          }).sort({ year: -1 });
          if (previous) {
            if (currentProfile) {
              currentProfile.dob = previous.dob;
              currentProfile.street = previous.street;
              currentProfile.city = previous.city;
              currentProfile.state = previous.state;
              await currentProfile.save();
            }
            session.step = 'tax_profile_income_info';
            session.taxProfileData = td;
            await session.save();
            await reply("Done — we've reused your details.\n\nNext: share your *income* info (e.g. employment salary, business income, or a short description). Reply in one message.");
          } else {
            session.step = 'tax_profile_dob';
            await session.save();
            await reply("We couldn't find previous details. What's your *date of birth*? (e.g. 1990-01-15)");
          }
        } else if (!currentProfile) {
          session.step = 'tax_profile_dob';
          await session.save();
          await reply("What's your *date of birth*? (e.g. 1990-01-15)");
        } else {
          session.step = 'tax_profile_dob';
          await session.save();
          await reply("What's your *date of birth*? (e.g. 1990-01-15 or 15-Jan-1990)");
        }
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_dob') {
        const raw = text.trim();
        let dobDate = null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) dobDate = new Date(raw);
        else if (/^\d{1,2}-\w{3}-\d{4}$/i.test(raw) || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(raw)) dobDate = new Date(raw);
        if (!dobDate || isNaN(dobDate.getTime())) {
          await reply("Send a valid date, e.g. *1990-01-15* or *15-Jan-1990*.");
          sendOk();
          return;
        }
        if (currentProfile) {
          currentProfile.dob = dobDate;
          await currentProfile.save();
        }
        td.dob = raw;
        session.taxProfileData = td;
        session.step = 'tax_profile_street';
        await session.save();
        await reply("What's your *street address*? (e.g. 12 Main Street, Apapa)");
        sendOk();
        return;
      }
      if (session.step === 'tax_profile_street') {
        const street = text.trim().slice(0, 500);
        if (currentProfile) {
          currentProfile.street = street;
          await currentProfile.save();
        }
        td.street = street;
        session.taxProfileData = td;
        session.step = 'tax_profile_city';
        await session.save();
        await reply("What's your *city*?");
        sendOk();
        return;
      }
      if (session.step === 'tax_profile_city') {
        const city = text.trim().slice(0, 100);
        if (currentProfile) {
          currentProfile.city = city;
          await currentProfile.save();
        }
        td.city = city;
        session.taxProfileData = td;
        session.step = 'tax_profile_state';
        await session.save();
        await reply("What's your *state*?");
        sendOk();
        return;
      }
      if (session.step === 'tax_profile_state') {
        const state = text.trim().slice(0, 100);
        if (currentProfile) {
          currentProfile.state = state;
          await currentProfile.save();
        }
        td.state = state;
        session.taxProfileData = td;
        session.step = 'tax_profile_income_info';
        await session.save();
        await reply("Thanks. Next: share your *income* info (e.g. employment salary, business income, or a short description). Reply in one message.");
        sendOk();
        return;
      }
      if (session.step === 'tax_profile_income_info') {
        const incomeInfo = text.trim().slice(0, 2000);
        if (currentProfile) {
          currentProfile.incomeDetails = { source: 'whatsapp', text: incomeInfo };
          await currentProfile.save();
        }
        session.step = 'tax_profile_deductibles';
        session.taxProfileData = td;
        await session.save();
        await reply("Got it. Last step: share any *relief or deductibles* (e.g. rent, pension, NHF, donations). Reply in one message — or *skip* to finish.");
        sendOk();
        return;
      }
      if (session.step === 'tax_profile_deductibles') {
        const deductiblesInfo = text.trim().toLowerCase() === 'skip' ? '' : text.trim().slice(0, 2000);
        if (currentProfile) {
          currentProfile.deductiblesDetails = deductiblesInfo ? { source: 'whatsapp', text: deductiblesInfo } : undefined;
          await currentProfile.save();
        }
        session.step = 'done';
        session.taxProfileData = {};
        await session.save();
        await reply("You're all set ✅ Your tax profile is complete. Say *Hi* or *menu* anytime.");
        sendOk();
        return;
      }
    }

    // Allow "Hi Taxable" / get started to restart the flow mid-registration (or cancel tax profile and show menu)
    if (isGetStarted && session.step !== 'done') {
      if (taxProfileSteps.includes(session.step)) {
        session.step = 'done';
        session.taxProfileData = {};
        await session.save();
        const phoneForMenu = waIdToPhone(from);
        const userForMenu = await User.findOne({ $or: [{ phone: phoneForMenu }, { phone: phoneForMenu.replace(/^0/, '234') }] }).select('firstName _id').lean();
        const hasProfile = userForMenu ? await TaxableProfile.findOne({ user: userForMenu._id }).select('_id').lean() : null;
        await reply(hasProfile ? getMessageProfileCompleted(userForMenu.firstName) : getMessageNoProfile(userForMenu.firstName));
      } else {
        session.step = 'first_name';
        session.registrationData = {};
        session.pendingUserId = undefined;
        await session.save();
        await reply("No worries! Let's start fresh. *What's your first name?*");
      }
      sendOk();
      return;
    }

    // Registered user: handle "learn how tax works" and "menu/hi" so we don't just resend menu
    const phoneForLookup = waIdToPhone(from);
    const regUser = await User.findOne({ $or: [{ phone: phoneForLookup }, { phone: phoneForLookup.replace(/^0/, '234') }] }).select('firstName _id').lean();
    if (regUser && isLearnHowTaxWorksIntent(text)) {
      await reply(getBeginnerExplanation(regUser.firstName));
      sendOk();
      return;
    }
    if (regUser && isBeginnerIntent(text)) {
      await reply(getBeginnerExplanation(regUser.firstName));
      sendOk();
      return;
    }

    if (regUser && isSetUpTaxProfileIntent(text)) {
      session = await WhatsAppSession.findOneAndUpdate(
        { waId: from },
        { $set: { step: 'tax_profile_intro', taxProfileData: {}, updatedAt: new Date() } },
        { upsert: true, new: true }
      );
      await reply(getTaxProfileSummary());
      sendOk();
      return;
    }

    if (regUser && isContinueMyFilingIntent(text)) {
      const latestProfile = await TaxableProfile.findOne({ user: regUser._id })
        .sort({ year: -1, createdAt: -1 })
        .select('primaryNIN dob street city state profileId')
        .lean();
      if (!latestProfile) {
        await reply("You don't have a tax profile yet. Reply *Set up tax profile* or *tax profile* to create one.");
        sendOk();
        return;
      }
      if (!profileHasPersonalDetailsComplete(latestProfile)) {
        await reply(
          "We need your *date of birth* and *address* (street, city, state) before we can continue.\n\n" +
          "Reply *Complete my details* to add them now."
        );
        sendOk();
        return;
      }
      session = await WhatsAppSession.findOneAndUpdate(
        { waId: from },
        {
          $set: {
            step: 'tax_profile_income_info',
            taxProfileData: { currentProfileId: latestProfile.profileId },
            updatedAt: new Date()
          }
        },
        { upsert: true, new: true }
      );
      await reply(
        "Next up is *Income* and *deductibles or reliefs*.\n\n" +
        "Share your income info in one message (e.g. employment salary, business income). Then we'll ask about reliefs and deductibles.\n\n" +
        "Reply with your income details below 👇"
      );
      sendOk();
      return;
    }

    if (regUser && isCompleteMyDetailsIntent(text)) {
      const latestProfile = await TaxableProfile.findOne({ user: regUser._id })
        .sort({ year: -1, createdAt: -1 })
        .select('primaryNIN dob street city state profileId')
        .lean();
      if (!latestProfile) {
        await reply("You don't have a tax profile yet. Reply *Set up tax profile* or *tax profile* to create one.");
        sendOk();
        return;
      }
      if (profileHasPersonalDetailsComplete(latestProfile)) {
        await reply("You're all set — we already have your DOB and address. Say *Continue my filing* for the next step.");
        sendOk();
        return;
      }
      session = await WhatsAppSession.findOneAndUpdate(
        { waId: from },
        {
          $set: {
            step: 'tax_profile_dob',
            taxProfileData: { currentProfileId: latestProfile.profileId },
            updatedAt: new Date()
          }
        },
        { upsert: true, new: true }
      );
      await reply("What's your *date of birth*? (e.g. 1990-01-15 or 15-Jan-1990)");
      sendOk();
      return;
    }

    if (regUser && isMenuOrHiIntent(text)) {
      const hasProfile = await TaxableProfile.findOne({ user: regUser._id }).select('_id').lean();
      await reply(hasProfile ? getMessageProfileCompleted(regUser.firstName) : getMessageNoProfile(regUser.firstName));
      sendOk();
      return;
    }

    // Unregistered user (mid-flow) says "menu", "hi", "learn how tax works", or "beginner" → don't use as name
    if (isMenuOrHiIntent(text)) {
      await reply("Finish signing up to see the menu! Say *Hi Taxable* to start over, or reply with your answer to the question above. We can't wait to have you! 😊");
      sendOk();
      return;
    }
    if (isLearnHowTaxWorksIntent(text)) {
      await reply(getSimpleTaxExplanation() + '\n\nFinish signing up (reply above) or say *Hi Taxable* to start over — then reply *tax profile* for the next step.');
      sendOk();
      return;
    }
    if (isBeginnerIntent(text)) {
      await reply(getSimpleTaxExplanation() + '\n\nFinish signing up (reply above) or say *Hi Taxable* to start over — then reply *tax profile* for the next step.');
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
          await reply(getMessageNoProfile(data.firstName));
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
        await reply(getMessageNoProfile(data.firstName));
        break;
      }
      case 'done': {
        const phoneForDone = waIdToPhone(from);
        const userDone = await User.findOne({ $or: [{ phone: phoneForDone }, { phone: phoneForDone.replace(/^0/, '234') }] }).select('_id firstName').lean();
        const hasProfileDone = userDone ? await TaxableProfile.findOne({ user: userDone._id }).select('_id').lean() : null;
        await reply(hasProfileDone ? getMessageProfileCompleted(userDone.firstName) : getMessageNoProfile(data.firstName || userDone?.firstName));
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
