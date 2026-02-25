const mongoose = require('mongoose');
const WhatsAppSession = require('../models/WhatsAppSession');
const User = require('../models/User');
const OTP = require('../models/OTP');
const TaxableProfile = require('../models/TaxableProfile');
const TaxUpdate = require('../models/TaxUpdate');
const MonoLink = require('../models/MonoLink');
const Deduction = require('../models/Deduction');
const Subscription = require('../models/Subscription');
const { sendTextMessage, sendImage } = require('../services/whatsappService');
const { registerUser, resendOTP } = require('../services/registrationService');
const { initiateAccountLinking, getAccountIncome } = require('../services/monoService');
const { estimateTaxFromAnnualIncome } = require('../utils/taxCalculator');
const { createSubscriptionLinkForUser, verifyPendingSubscriptionForUser } = require('./paystackController');
const { sendTaxProfileCreatedEmail } = require('../utils/emailService');
const {
  ENTRY_MESSAGE,
  CURIOUS_MODE_REPLY,
  CREATE_ACCOUNT_INTRO,
  CREATE_ACCOUNT_FIRST_NAME,
  CREATE_ACCOUNT_LAST_NAME,
  CREATE_ACCOUNT_USE_WHATSAPP_NUMBER,
  CREATE_ACCOUNT_EMAIL,
  CREATE_ACCOUNT_PASSWORD,
  getPostVerificationWelcome,
  getTaxProfileIntro,
  TAX_PROFILE_ASK_NIN,
  SUBSCRIPTION_REQUIRED,
  SUBSCRIPTION_WHY_IT_MATTERS,
  getPaymentLinkMessage,
  getPaymentLinkMessageYearly,
  PAYMENT_CONFIRMED,
  PAYMENT_NOT_CONFIRMED_YET,
  getLoggedInMainMenu,
  FILE_TAX_CONFIRM,
  FILE_TAX_SUBMITTED,
  CONNECT_BANK_INTRO,
  getConnectBankLink,
  CONNECT_ANOTHER_BANK,
  BACK_TO_MENU_FOOTER,
  WATCH_VIDEO_THUMBNAIL_URL,
  WATCH_VIDEO_CAPTION
} = require('../constants/whatsappPrompts');
const { generateCompleteBreakdown } = require('../utils/breakdownCalculator');
const { performFileTax } = require('./profileController');
const { downloadMedia } = require('../services/whatsappService');
const { createDocumentFromBuffer } = require('./documentController');

const DASHBOARD_URL = 'dashboard.gettaxable.com';
const APP_URL = process.env.APP_URL || 'https://dashboard.gettaxable.com';
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
function isBackToMainMenuIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return /back\s+to\s+(main\s+)?menu/i.test(t) || /go\s+back\s+to\s+menu/i.test(t) || /main\s+menu$/i.test(t) || t === 'back to main menu' || t === 'back to menu' || t === 'main menu';
}

function isMenuOrHiIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return (
    isBackToMainMenuIntent(text) ||
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

/** PDF: "I don't understand tax — explain it" (curious mode) */
function isIDontUnderstandTaxIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return (
    /i don'?t understand tax/i.test(t) ||
    /don'?t understand tax/i.test(t) ||
    /explain\s*(it|tax)/i.test(t) ||
    t === "i don't understand tax" ||
    t === "explain it"
  );
}

/** PDF: "FAQ" or "Talk to someone" / "Talk to support" */
function isFAQOrTalkToSomeoneIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return (
    /^faq$/i.test(t) ||
    /talk\s*to\s*(someone|support)/i.test(t) ||
    t === 'talk to someone' ||
    t === 'talk to support'
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

/** User wants to create a new account (from no-account menu) */
function isCreateAccountIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return (
    /create\s*my\s*account/i.test(t) ||
    /create\s*account/i.test(t) ||
    /sign\s*up/i.test(t) ||
    /i\s*want\s*to\s*(create|sign\s*up)/i.test(t) ||
    t === 'create my account'
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

/** User wants to get their financial data (Mono link or summary) */
function isGetMyFinancialDataIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return (
    /get\s*my\s*financial\s*data/i.test(t) ||
    /my\s*financial\s*data/i.test(t) ||
    /financial\s*data/i.test(t) && /get|show|fetch/i.test(t) ||
    t === 'get my financial data'
  );
}

/** User wants PAYE / tax estimate */
function isCheckPayeEstimateIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return (
    /check\s*my\s*paye\s*estimate/i.test(t) ||
    /paye\s*estimate/i.test(t) ||
    /estimate\s*my\s*tax/i.test(t) ||
    /tax\s*estimate/i.test(t) ||
    t === 'check my paye estimate' ||
    t === 'estimate my tax'
  );
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

/** User wants subscription plans (PDF: "Subscription plans" menu option) */
function isSubscriptionPlansIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return (
    /subscription\s*plans?/i.test(t) ||
    /^subscription$/i.test(t) ||
    t === 'subscription plans'
  );
}

/** User chose monthly plan (PDF: "Choose monthly") */
function isChooseMonthlyIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return /choose\s*monthly/i.test(t) || t === 'monthly' || t === 'choose monthly';
}

/** User chose yearly plan (PDF: "Choose yearly") */
function isChooseYearlyIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return /choose\s*yearly/i.test(t) || t === 'yearly' || t === 'choose yearly' || /best\s*value/i.test(t);
}

/** User wants to learn why subscription matters */
function isLearnWhySubscriptionMattersIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return (
    /learn\s*why\s*subscription\s*matters/i.test(t) ||
    /why\s*subscription/i.test(t) ||
    /subscription\s*matters/i.test(t)
  );
}

/** User says Done or Check again (after payment link – PDF flow) */
function isDoneOrCheckAgainIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return /^done\.?$/i.test(t) || /check\s*again/i.test(t) || t === 'done' || t === 'check again';
}

/** PDF: "View tax summary" */
function isViewTaxSummaryIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return /view\s*tax\s*summary/i.test(t) || t === 'view tax summary' || /tax\s*summary/i.test(t) && /view|show|see/i.test(t);
}

/** PDF: "Proceed to file" */
function isProceedToFileIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return /proceed\s*to\s*file/i.test(t) || /file\s*(my\s*)?tax/i.test(t) && /proceed|ready|submit/i.test(t) || t === 'proceed to file';
}

/** PDF: "Reply CONFIRM to file" */
function isConfirmFileIntent(text) {
  if (!text || typeof text !== 'string') return false;
  return /^confirm\.?$/i.test(text.trim()) || text.trim().toLowerCase() === 'confirm';
}

/** PDF: "Manage connected banks" */
function isManageConnectedBanksIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return /connect\s*and\s*manage\s*banks/i.test(t) || /manage\s*connected\s*banks/i.test(t) || (/connected\s*banks/i.test(t) && /manage|list|view|connect/i.test(t)) || t === 'manage connected banks' || t === 'connect and manage banks';
}

/** PDF: "Add reliefs & upload documents" */
function isAddReliefsIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return /add\s*reliefs/i.test(t) || /reliefs?\s*&\s*upload\s*documents?/i.test(t) || /upload\s*documents?/i.test(t) && /relief/i.test(t) || t === 'add reliefs' || t === 'add reliefs & upload documents';
}

const RELIEF_TYPES = [
  { num: 1, key: 'nhf', label: 'NHF (National Housing Fund)' },
  { num: 2, key: 'nhis', label: 'NHIS (Health Insurance)' },
  { num: 3, key: 'pension', label: 'Pension' },
  { num: 4, key: 'life_insurance', label: 'Life insurance' },
  { num: 5, key: 'mortgage_interest', label: 'Mortgage interest' },
  { num: 6, key: 'rent_relief', label: 'Rent relief' },
  { num: 7, key: 'transport_allowance', label: 'Transport allowance' },
  { num: 8, key: 'other', label: 'Other' }
];

/** Check if user has an active subscription (for 🔒 gating). Uses status and optional currentPeriodEnd. */
async function hasActiveSubscriptionCore(userId) {
  const sub = await Subscription.findOne({
    user: userId,
    status: 'active',
    $or: [
      { currentPeriodEnd: { $exists: false } },
      { currentPeriodEnd: null },
      { currentPeriodEnd: { $gt: new Date() } }
    ]
  }).lean();
  return !!sub;
}

/** Safe version: never throws; returns false on DB/error so we can always show a reply */
async function safeHasActiveSubscription(userId) {
  if (!userId) return false;
  try {
    return await hasActiveSubscriptionCore(userId);
  } catch (e) {
    console.error('[WhatsApp] safeHasActiveSubscription error:', e.message);
    return false;
  }
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

/**
 * Get Mono connect link for this user/profile. Returns { link } or null.
 * What we get from Mono: (1) From initiate → a link (URL) for the user to open and connect their bank.
 * (2) From webhook → account id when they've connected. (3) From getAccountIncome(accountId) → income data.
 */
async function getMonoConnectLinkForUser(userId, profileId) {
  const hasKey = !!(process.env.MONO_SECRET_KEY && process.env.MONO_SECRET_KEY.trim());
  console.log('[Mono] getMonoConnectLinkForUser called', { userId: String(userId), profileId: profileId || null, MONO_SECRET_KEY_set: hasKey });
  try {
    const userDoc = await User.findById(userId).select('email firstName lastName').lean();
    if (!userDoc || !userDoc.email) {
      console.log('[Mono] getMonoConnectLinkForUser: no user or email', { hasUser: !!userDoc, hasEmail: !!userDoc?.email });
      return null;
    }
    const ref = `u${userId}_${Date.now()}${profileId ? `_p${profileId}` : ''}`;
    const result = await initiateAccountLinking({
      customer: {
        name: [userDoc.firstName, userDoc.lastName].filter(Boolean).join(' ') || userDoc.email?.split('@')[0] || 'Customer',
        email: userDoc.email
      },
      redirectUrl: APP_URL,
      meta: { ref, userId: userId.toString(), profileId: profileId || undefined }
    });
    const link = result.link || result.url || result.authorisation_url;
    console.log('[Mono] initiateAccountLinking result', { hasLink: !!link, resultKeys: Object.keys(result || {}), linkLength: link ? String(link).length : 0 });
    if (!link) {
      console.warn('[Mono] initiate returned no link; full result:', JSON.stringify(result).slice(0, 500));
      return null;
    }
    await MonoLink.findOneAndUpdate(
      { ref },
      { user: userId, profileId: profileId || undefined, ref, status: 'pending', updatedAt: new Date() },
      { upsert: true, new: true }
    );
    return { link };
  } catch (e) {
    console.error('[Mono] getMonoConnectLinkForUser error', { message: e.message, stack: e.stack });
    return null;
  }
}

/** Pinned command list — same in every menu so users can refer back */
function getPinnedMenuCommands() {
  return (
    '\n\n📌 *Commands (reply anytime):*\n' +
    '• *Hi Taxable* or *Menu* — Show this menu\n' +
    '• *Tax profile* — Set up / manage tax profile\n' +
    '• *Continue my filing* — Continue filing\n' +
    '• *Get my financial data* — Bank link / income summary\n' +
    '• *Check my PAYE estimate* — Tax estimate from your income\n' +
    '• *Complete my details* — Add DOB & address'
  );
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
    '• Get my financial data\n' +
    '• Learn how tax works (simple version)\n' +
    '• Estimate my PAYE\n' +
    '• Speak to someone\n\n' +
    'Just reply with your choice and I\'ll guide you.' +
    getPinnedMenuCommands()
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
    '• Get my financial data\n' +
    '• Check my PAYE estimate\n' +
    '• Ask a question\n\n' +
    'Tell me what you need and I\'ll handle it.' +
    getPinnedMenuCommands()
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
    'Just reply with what you\'d like to do.' +
    getPinnedMenuCommands()
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
  if (type === 'text' && message.text) text = (message.text.body || '').trim();

  /** Send reply and return promise so we can await it before ending the request (required on serverless) */
  const reply = (msg) => {
    return sendTextMessage(from, msg)
      .then(() => console.log('[WhatsApp webhook] Reply sent to', from))
      .catch(err => console.error('[WhatsApp webhook] Send error:', err.message || err));
  };

  /** Send YouTube thumbnail + caption so the video link shows with preview in WhatsApp. */
  async function sendWatchVideoPreview() {
    try {
      await sendImage(from, WATCH_VIDEO_THUMBNAIL_URL, WATCH_VIDEO_CAPTION);
    } catch (e) {
      console.error('[WhatsApp] sendWatchVideoPreview error:', e.message);
    }
  }

  // —— Incoming image or document: save and link to relief (user can send docs in chat) ——
  if (type === 'image' || type === 'document') {
    try {
      const phoneForLookup = waIdToPhone(from);
      const regUserForMedia = await User.findOne({ $or: [{ phone: phoneForLookup }, { phone: phoneForLookup.replace(/^0/, '234') }] }).select('_id').lean();
      if (regUserForMedia) {
        const mediaId = type === 'image' ? message.image?.id : message.document?.id;
        const originalFileName = type === 'document' ? (message.document?.filename || 'document') : (message.image?.caption ? `${message.image.caption}.jpg` : 'image.jpg');
        if (mediaId) {
          try {
            const { buffer, mimeType } = await downloadMedia(mediaId);
            const profile = await TaxableProfile.findOne({ user: regUserForMedia._id }).sort({ year: -1 }).select('_id year').lean();
            if (!profile) {
              await reply("Create a tax profile first (Reply *Create tax profile*), then add a relief. After that you can send documents here to attach to the relief.");
              sendOk();
              return;
            }
            let sessionForMedia = await WhatsAppSession.findOne({ waId: from }).lean();
            let deductionId = sessionForMedia?.taxProfileData?.lastDeductionId || null;
            if (!deductionId) {
              const lastDeduction = await Deduction.findOne({ profileId: profile._id, 'period.year': profile.year }).sort({ createdAt: -1 }).select('_id').lean();
              deductionId = lastDeduction ? String(lastDeduction._id) : null;
            }
            const doc = await createDocumentFromBuffer(
              regUserForMedia._id,
              profile._id,
              deductionId ? new mongoose.Types.ObjectId(deductionId) : null,
              buffer,
              originalFileName,
              mimeType
            );
            if (deductionId) {
              await reply("Document received ✅ Saved and linked to your relief. You can send another or reply *View added reliefs* / *Back*.");
            } else {
              await reply("Document received ✅ Saved. To attach it to a relief, add a relief first then send the document again, or link it from the dashboard.");
            }
          } catch (err) {
            console.error('[WhatsApp] Document upload error:', err.message);
            await reply("We couldn't save that file. Please try again or upload from the dashboard: https://" + DASHBOARD_URL);
          }
        } else {
          await reply("We didn't receive the file. Please send the image or document again.");
        }
      } else {
        await reply("Create an account and add a relief first; then you can send documents here to attach to your relief.");
      }
    } catch (e) {
      console.error('[WhatsApp] Media handler error:', e.message);
      await reply("We couldn't process that. Please try again or upload from the dashboard: https://" + DASHBOARD_URL);
    }
    sendOk();
    return;
  }

  if (!text) {
    console.log('[WhatsApp webhook] Ignored: no text (type=', type, ')');
    sendOk();
    return;
  }

  console.log('[WhatsApp webhook] Message from', from, ':', text.substring(0, 80));

  try {
    let session = await WhatsAppSession.findOne({ waId: from });
    const isGetStarted = isGetStartedIntent(text);
    const phoneForLookup = waIdToPhone(from);

    // Hi Taxable / Get started → PDF: entry (no account) or post-verification / logged-in menu (returning user)
    if (isGetStarted) {
      try {
        const userForMenu = await User.findOne({ $or: [{ phone: phoneForLookup }, { phone: phoneForLookup.replace(/^0/, '234') }] }).select('firstName _id').lean();
        if (userForMenu) {
          const hasProfile = await TaxableProfile.findOne({ user: userForMenu._id }).sort({ year: -1 }).select('_id year').lean();
          const hasSub = await safeHasActiveSubscription(userForMenu._id);
          const year = hasProfile?.year || new Date().getFullYear();
          if (hasProfile) {
            await reply(getLoggedInMainMenu(userForMenu.firstName, year, hasSub));
          } else {
            await sendWatchVideoPreview();
            await reply(getPostVerificationWelcome(userForMenu.firstName));
          }
          session = await WhatsAppSession.findOneAndUpdate(
            { waId: from },
            { $set: { step: 'done', updatedAt: new Date() } },
            { upsert: true, new: true }
          );
        } else {
          await sendWatchVideoPreview();
          await reply(ENTRY_MESSAGE);
          session = await WhatsAppSession.findOneAndUpdate(
            { waId: from },
            { $set: { step: 'welcome', updatedAt: new Date() } },
            { upsert: true, new: true }
          );
        }
      } catch (e) {
        console.error('[WhatsApp] Get started error:', e.message);
        await sendWatchVideoPreview();
        await reply(ENTRY_MESSAGE);
        try {
          session = await WhatsAppSession.findOneAndUpdate(
            { waId: from },
            { $set: { step: 'welcome', updatedAt: new Date() } },
            { upsert: true, new: true }
          );
        } catch (e2) {}
      }
      sendOk();
      return;
    }

    // No session or welcome: PDF entry menu, Create account (intro → Ready), Curious mode, Login, FAQ/Talk to someone
    if (!session || session.step === 'welcome' || session.step === 'create_account_ready') {
      if (session?.step === 'create_account_ready' && isImReadyIntent(text)) {
        session = await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          { $set: { step: 'first_name', registrationData: {}, updatedAt: new Date() } },
          { upsert: true, new: true }
        );
        await reply(CREATE_ACCOUNT_FIRST_NAME);
        sendOk();
        return;
      }
      if (isCreateAccountIntent(text)) {
        session = await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          { $set: { step: 'create_account_ready', registrationData: {}, updatedAt: new Date() } },
          { upsert: true, new: true }
        );
        await reply(CREATE_ACCOUNT_INTRO);
        sendOk();
        return;
      }
      if (isMenuOrHiIntent(text)) {
        await sendWatchVideoPreview();
        await reply(ENTRY_MESSAGE);
        if (!session) session = await WhatsAppSession.findOneAndUpdate({ waId: from }, { $set: { step: 'welcome', updatedAt: new Date() } }, { upsert: true, new: true });
        sendOk();
        return;
      }
      if (isIDontUnderstandTaxIntent(text) || isLearnHowTaxWorksIntent(text) || isBeginnerIntent(text)) {
        await reply(CURIOUS_MODE_REPLY);
        if (!session) session = await WhatsAppSession.findOneAndUpdate({ waId: from }, { $set: { step: 'welcome', updatedAt: new Date() } }, { upsert: true, new: true });
        sendOk();
        return;
      }
      if (isFAQOrTalkToSomeoneIntent(text)) {
        await reply("You can reach us at support@gettaxable.com or reply *Talk to support* anytime. For quick answers, try *Learn how tax works* or *Create my account* to get started." + BACK_TO_MENU_FOOTER);
        if (!session) session = await WhatsAppSession.findOneAndUpdate({ waId: from }, { $set: { step: 'welcome', updatedAt: new Date() } }, { upsert: true, new: true });
        sendOk();
        return;
      }
      if (isLoginIntent(text)) {
        session = await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          { $set: { step: 'login_email', registrationData: {}, updatedAt: new Date() } },
          { upsert: true, new: true }
        );
        await reply("What's the *email address* for your Taxable account?");
        sendOk();
        return;
      }
      if (session?.step === 'create_account_ready') {
        await reply("When you're ready, reply *Ready* and we'll begin.");
        sendOk();
        return;
      }
      if (!session || session.step === 'welcome') {
        await sendWatchVideoPreview();
        await reply(ENTRY_MESSAGE);
        if (!session) session = await WhatsAppSession.findOneAndUpdate({ waId: from }, { $set: { step: 'welcome', updatedAt: new Date() } }, { upsert: true, new: true });
        sendOk();
        return;
      }
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
        try {
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
          const hasProfile = await TaxableProfile.findOne({ user: userDoc._id }).sort({ year: -1 }).select('_id year').lean();
          const hasSub = await safeHasActiveSubscription(userDoc._id);
          const year = hasProfile?.year || new Date().getFullYear();
          if (hasProfile) {
            await reply(getLoggedInMainMenu(userDoc.firstName, year, hasSub));
          } else {
            await sendWatchVideoPreview();
            await reply(getPostVerificationWelcome(userDoc.firstName));
          }
        } catch (e) {
          console.error('[WhatsApp] Login success save error:', e.message);
          await reply("You're logged in, but we couldn't save your session. Say *Hi Taxable* to see your menu.");
        }
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
        // PDF: if no existing profile, year already set (e.g. 2025); don't ask. If existing, ask year.
        const existingProfileForYear = await TaxableProfile.findOne({ user: userForTax._id }).sort({ year: -1 }).select('year').lean();
        if (existingProfileForYear) {
          session.step = 'tax_profile_year';
          session.taxProfileData = td;
          await session.save();
          await reply("Which *tax year*? (e.g. 2025 or 2026). Minimum is 2025.");
        } else {
          const yearDefault = td.year || new Date().getFullYear();
          td.year = yearDefault;
          session.taxProfileData = td;
          session.step = 'tax_profile_nin';
          await session.save();
          await reply(TAX_PROFILE_ASK_NIN);
        }
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
        try {
          const u = await User.findById(userForTax._id).select('email firstName').lean();
          if (u?.email) await sendTaxProfileCreatedEmail(u.email, u.firstName || 'there', year);
        } catch (e) {
          console.error('[WhatsApp] Tax profile created email failed:', e.message);
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
            let monoLinkReuse;
            try {
              monoLinkReuse = await getMonoConnectLinkForUser(userForTax._id, currentProfile?.profileId);
            } catch (e) {
              console.error('[WhatsApp] reuse_ask Mono link error:', e.message);
              monoLinkReuse = null;
            }
            console.log('[Mono] reuse_ask → income step', { gotLink: !!monoLinkReuse?.link, waId: from });
            if (monoLinkReuse?.link) {
              await reply("Done — we've reused your details.\n\nLet's get your *financial data* in. Connect your bank with Mono (one-time):\n\n" + monoLinkReuse.link);
              await reply("After connecting, reply *done*. Or type your income details here if you prefer not to connect.");
            } else {
              await reply("Done — we've reused your details.\n\nNext: share your *income* info (e.g. employment salary, business income, or a short description). Reply in one message.");
            }
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
        let monoLinkState;
        try {
          monoLinkState = await getMonoConnectLinkForUser(userForTax._id, currentProfile?.profileId);
        } catch (e) {
          console.error('[WhatsApp] tax_profile_state Mono link error:', e.message);
          monoLinkState = null;
        }
        console.log('[Mono] tax_profile_state → income step', { gotLink: !!monoLinkState?.link, waId: from });
        if (monoLinkState?.link) {
          await reply(
            "Let's get your *financial data* in.\n\n" +
            "Connect your bank securely with Mono (one-time) and we'll pull your income automatically:\n\n" +
            monoLinkState.link
          );
          await reply("After you've connected, reply *done* here. Or type your income details in one message if you prefer not to connect.");
        } else {
          await reply("Thanks. Next: share your *income* info (e.g. employment salary, business income, or a short description). Reply in one message.");
        }
        sendOk();
        return;
      }
      if (session.step === 'tax_profile_income_info') {
        const raw = text.trim().toLowerCase();
        const isDoneIntent = raw === 'done' || raw === 'connected' || raw === "i've connected" || raw === 'i connected';
        if (isDoneIntent && currentProfile) {
          const link = await MonoLink.findOne({
            user: userForTax._id,
            status: 'linked'
          }).sort({ updatedAt: -1 }).lean();
          console.log('[Mono] user said done', { waId: from, userId: String(userForTax._id), foundLink: !!link, monoAccountId: link?.monoAccountId || null });
          if (link) {
            try {
              const income = await getAccountIncome(link.monoAccountId);
              currentProfile.incomeDetails = { source: 'mono', data: income };
              await currentProfile.save();
              session.step = 'tax_profile_deductibles';
              session.taxProfileData = td;
              await session.save();
              await reply("We've got your financial data from your bank ✅ Last step: share any *relief or deductibles* (e.g. rent, pension, NHF, donations). Reply in one message — or *skip* to finish.");
              sendOk();
              return;
            } catch (e) {
              console.error('[WhatsApp] Mono income fetch error:', e.message);
              await reply("We couldn't fetch your income from the link yet. You can try again in a moment, or type your income details here instead.");
              sendOk();
              return;
            }
          }
          await reply("We didn't detect a connected bank yet. Open the link we sent above to connect, or type your income details here if you prefer.");
          sendOk();
          return;
        }
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

    // Registered user
    const regUser = await User.findOne({ $or: [{ phone: phoneForLookup }, { phone: phoneForLookup.replace(/^0/, '234') }] }).select('firstName _id').lean();

    // —— Filing confirm (PDF: CONFIRM to file, or Back) ——
    if (regUser && session?.step === 'filing_confirm') {
      const filingProfileId = session.taxProfileData?.filingProfileId;
      if (isConfirmFileIntent(text)) {
        if (!filingProfileId) {
          await reply("Something went wrong — please say *View tax summary* then *Proceed to file* again.");
          session.step = 'done';
          await session.save();
          sendOk();
          return;
        }
        try {
          const result = await performFileTax(regUser._id, filingProfileId);
          if (result.success) {
            await reply(FILE_TAX_SUBMITTED);
            session.step = 'done';
            session.taxProfileData = { ...(session.taxProfileData || {}), filingProfileId: undefined };
            await session.save();
            const hasProfile = await TaxableProfile.findOne({ user: regUser._id }).sort({ year: -1 }).select('year').lean();
            const year = hasProfile?.year || new Date().getFullYear();
            const hasSub = await safeHasActiveSubscription(regUser._id);
            await reply(getLoggedInMainMenu(regUser.firstName, year, hasSub));
          } else {
            await reply(result.message || "We couldn't file your tax right now. Please try again or contact support.");
          }
        } catch (err) {
          console.error('[WhatsApp] performFileTax error:', err.message);
          await reply("Something went wrong while filing. Please try again in a moment or contact support.");
        }
      } else if (text.trim().toLowerCase() === 'back') {
        session.step = 'done';
        session.taxProfileData = { ...(session.taxProfileData || {}), filingProfileId: undefined };
        await session.save();
        const hasProfile = await TaxableProfile.findOne({ user: regUser._id }).sort({ year: -1 }).select('year').lean();
        const year = hasProfile?.year || new Date().getFullYear();
        const hasSub = await safeHasActiveSubscription(regUser._id);
        await reply(getLoggedInMainMenu(regUser.firstName, year, hasSub));
      } else {
        await reply("Reply *CONFIRM* to file, or *Back* to review.");
      }
      sendOk();
      return;
    }

    if (regUser && isLearnHowTaxWorksIntent(text)) {
      await reply(getBeginnerExplanation(regUser.firstName) + BACK_TO_MENU_FOOTER);
      sendOk();
      return;
    }
    if (regUser && isBeginnerIntent(text)) {
      await reply(getBeginnerExplanation(regUser.firstName) + BACK_TO_MENU_FOOTER);
      sendOk();
      return;
    }

    // —— Subscription flow (PDF): Done / Check again → verify payment ——
    if (regUser && isDoneOrCheckAgainIntent(text)) {
      try {
        const result = await verifyPendingSubscriptionForUser(regUser._id);
        if (result.verified) {
          await reply(PAYMENT_CONFIRMED);
          const hasProfile = await TaxableProfile.findOne({ user: regUser._id }).select('_id').lean();
          const latestProfile = await TaxableProfile.findOne({ user: regUser._id }).sort({ year: -1 }).select('year').lean();
          const year = latestProfile?.year || new Date().getFullYear();
          await reply(getLoggedInMainMenu(regUser.firstName, year, true));
        } else {
          await reply(result.message || PAYMENT_NOT_CONFIRMED_YET);
        }
      } catch (err) {
        console.error('[WhatsApp] verifyPendingSubscription error:', err.message);
        await reply(PAYMENT_NOT_CONFIRMED_YET);
      }
      sendOk();
      return;
    }

    // —— Subscription plans menu (PDF) ——
    if (regUser && isSubscriptionPlansIntent(text)) {
      await reply(SUBSCRIPTION_REQUIRED);
      sendOk();
      return;
    }
    if (regUser && isLearnWhySubscriptionMattersIntent(text)) {
      await reply(SUBSCRIPTION_WHY_IT_MATTERS);
      sendOk();
      return;
    }
    if (regUser && isChooseMonthlyIntent(text)) {
      try {
        const { authorization_url } = await createSubscriptionLinkForUser(regUser._id, 'monthly');
        await reply(getPaymentLinkMessage(authorization_url));
      } catch (err) {
        console.error('[WhatsApp] createSubscriptionLink monthly error:', err.message);
        await reply("We couldn't generate the payment link right now. Please try again in a moment or say *Subscription plans* to try again." + BACK_TO_MENU_FOOTER);
      }
      sendOk();
      return;
    }
    if (regUser && isChooseYearlyIntent(text)) {
      try {
        const { authorization_url } = await createSubscriptionLinkForUser(regUser._id, 'yearly');
        await reply(getPaymentLinkMessageYearly(authorization_url));
      } catch (err) {
        console.error('[WhatsApp] createSubscriptionLink yearly error:', err.message);
        await reply("We couldn't generate the payment link right now. Please try again in a moment or say *Subscription plans* to try again." + BACK_TO_MENU_FOOTER);
      }
      sendOk();
      return;
    }

    // —— Locked actions: require active subscription (PDF 🔒) ——
    if (regUser && isSetUpTaxProfileIntent(text)) {
      const hasSub = await safeHasActiveSubscription(regUser._id);
      if (!hasSub) {
        await reply(SUBSCRIPTION_REQUIRED);
        sendOk();
        return;
      }
      const existingProfile = await TaxableProfile.findOne({ user: regUser._id }).sort({ year: -1 }).select('year').lean();
      const yearForIntro = existingProfile?.year || 2025; // PDF: if none → 2025
      const taxProfileDataInitial = existingProfile ? {} : { year: 2025 };
      session = await WhatsAppSession.findOneAndUpdate(
        { waId: from },
        { $set: { step: 'tax_profile_intro', taxProfileData: taxProfileDataInitial, updatedAt: new Date() } },
        { upsert: true, new: true }
      );
      await reply(getTaxProfileIntro(regUser.firstName, yearForIntro));
      await reply("Reply *I'm ready* when you want to start." + BACK_TO_MENU_FOOTER);
      sendOk();
      return;
    }

    // —— View tax summary (PDF: income, reliefs, estimated tax, fee, next steps) ——
    if (regUser && isViewTaxSummaryIntent(text)) {
      const hasSub = await safeHasActiveSubscription(regUser._id);
      if (!hasSub) {
        await reply(SUBSCRIPTION_REQUIRED);
        sendOk();
        return;
      }
      const latestProfile = await TaxableProfile.findOne({ user: regUser._id }).sort({ year: -1 }).select('_id year profileId').lean();
      if (!latestProfile) {
        await reply("You don't have a tax profile yet. Reply *Create tax profile* to set one up.");
        sendOk();
        return;
      }
      try {
        const breakdown = await generateCompleteBreakdown(latestProfile._id, latestProfile.year);
        const s = breakdown?.summary || {};
        const totalIncome = s.totalIncome ?? 0;
        const totalDeductions = s.totalDeductions ?? 0;
        const taxPayable = s.finalTaxPayable ?? s.taxCalculated ?? 0;
        const feePlaceholder = 5000;
        const totalToday = taxPayable + feePlaceholder;
        let msg = `Here's your *${latestProfile.year}* tax summary (based on your connected banks + reliefs):\n\n`;
        msg += `*Income snapshot*\n• Total income detected: ₦${Number(totalIncome).toLocaleString()}\n• Period: Jan–Dec ${latestProfile.year} (or current-to-date)\n\n`;
        msg += `*Reliefs applied*\n• Total reliefs & deductions: ₦${Number(totalDeductions).toLocaleString()}\n\n`;
        msg += `*Estimated tax due*\n• Estimated PAYE/Tax payable: ₦${Number(taxPayable).toLocaleString()}\n\n`;
        msg += `*Filing costs*\n• Filing service fee: ₦${feePlaceholder.toLocaleString()}\n• Estimated tax to pay government: ₦${Number(taxPayable).toLocaleString()}\n• *Total today: ₦${Number(totalToday).toLocaleString()}*\n\n`;
        msg += `What would you like to do next?\n• View details\n• Continue adding reliefs\n• Proceed to file${BACK_TO_MENU_FOOTER}`;
        await reply(msg);
      } catch (err) {
        console.error('[WhatsApp] Tax summary error:', err.message);
        await reply("We're still building your summary. Make sure your bank is connected and you've added reliefs, then try *View tax summary* again. If it persists, contact support." + BACK_TO_MENU_FOOTER);
      }
      sendOk();
      return;
    }

    // —— Manage connected banks (PDF: list, add, remove) ——
    if (regUser && isManageConnectedBanksIntent(text)) {
      const hasSub = await safeHasActiveSubscription(regUser._id);
      if (!hasSub) {
        await reply(SUBSCRIPTION_REQUIRED);
        sendOk();
        return;
      }
      const links = await MonoLink.find({ user: regUser._id, status: 'linked' }).sort({ updatedAt: -1 }).lean();
      if (!links.length) {
        try {
          const latestProfile = await TaxableProfile.findOne({ user: regUser._id }).sort({ year: -1 }).select('profileId').lean();
          const monoLink = await getMonoConnectLinkForUser(regUser._id, latestProfile?.profileId);
          if (monoLink?.link) {
            await reply(CONNECT_BANK_INTRO);
            await reply(getConnectBankLink(monoLink.link));
          } else {
            await reply("You don't have any banks connected yet. Reply *Continue my filing* to get a link to connect your bank.");
          }
        } catch (e) {
          console.error('[WhatsApp] Manage banks link error:', e.message);
          await reply("We couldn't load the bank link right now. Please try again in a moment or reply *Continue my filing*.");
        }
        sendOk();
        return;
      }
      const list = links.map((l, i) => `${i + 1}. Bank ${i + 1} (${l.monoAccountId ? '****' + String(l.monoAccountId).slice(-4) : 'connected'})`).join('\n');
      const linkIds = links.map((l) => String(l._id));
      await WhatsAppSession.findOneAndUpdate(
        { waId: from },
        { $set: { step: 'manage_banks_list', 'taxProfileData.manageBanksLinkIds': linkIds, updatedAt: new Date() } },
        { upsert: true }
      );
      await reply(`Here are your connected banks 👇\n\n${list}\n\nReply with a *number* to view insights, or *Add* to connect another bank, or *Remove* to disconnect one.${BACK_TO_MENU_FOOTER}`);
      sendOk();
      return;
    }
    // In manage_banks_list: number = view insights for that bank; Back = main menu
    if (regUser && session?.step === 'manage_banks_list') {
      if (/^back\.?$/i.test(text.trim())) {
        await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          { $set: { step: 'done', 'taxProfileData.manageBanksLinkIds': [], updatedAt: new Date() } }
        );
        const menu = await getLoggedInMainMenu(regUser.firstName, new Date().getFullYear(), await safeHasActiveSubscription(regUser._id));
        await reply(menu);
        sendOk();
        return;
      }
      const linkIds = session.taxProfileData?.manageBanksLinkIds || [];
      const num = parseInt(text.trim(), 10);
      if (num >= 1 && num <= linkIds.length) {
        const link = await MonoLink.findById(linkIds[num - 1]);
        if (link && link.user.toString() === regUser._id.toString()) {
          let snap = link.incomeSnapshot;
          try {
            if (link.monoAccountId) {
              const fresh = await getAccountIncome(link.monoAccountId);
              if (fresh) {
                snap = fresh;
                link.incomeSnapshot = fresh;
                link.lastIncomeFetchAt = new Date();
                link.updatedAt = new Date();
                await link.save();
              }
            }
          } catch (e) {
            console.error('[WhatsApp] Fresh income fetch for bank failed:', e.message);
          }
          const total = snap?.total_income ?? snap?.income ?? snap?.data?.total_income ?? 0;
          const monthlyAvg = snap?.monthly_average ?? snap?.average_monthly_income ?? snap?.data?.monthly_average;
          const period = snap?.period ? ` (${snap.period})` : '';
          let msg = `*Bank ${num}* — View data${period}\n\n• Total income detected: ₦${Number(total).toLocaleString()}`;
          if (monthlyAvg != null && monthlyAvg > 0) msg += `\n• Monthly average: ₦${Number(monthlyAvg).toLocaleString()}`;
          if (snap?.income_type || snap?.type) msg += `\n• Type: ${snap.income_type || snap.type || 'Income'}`;
          msg += `\n\nFor full breakdown and tax summary, reply *View tax summary* or check the dashboard:\nhttps://${DASHBOARD_URL}${BACK_TO_MENU_FOOTER}`;
          await reply(msg);
        } else {
          await reply("That bank isn't in your list. Reply *Manage connected banks* to see the list again." + BACK_TO_MENU_FOOTER);
        }
        await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          { $set: { step: 'done', 'taxProfileData.manageBanksLinkIds': [], updatedAt: new Date() } }
        );
      } else {
        await reply("Reply with a number from the list, or *Add*, or *Remove*, or *Back* for the main menu.");
      }
      sendOk();
      return;
    }
    // Remove: ask which bank (store linkIds for next message)
    if (regUser && text.trim().toLowerCase() === 'remove') {
      const linksForRemove = await MonoLink.find({ user: regUser._id, status: 'linked' }).sort({ updatedAt: -1 }).lean();
      if (!linksForRemove.length) {
        await reply("You don't have any connected banks to remove.");
        sendOk();
        return;
      }
      const linkIds = linksForRemove.map((l) => String(l._id));
      await WhatsAppSession.findOneAndUpdate(
        { waId: from },
        { $set: { step: 'manage_banks_remove', 'taxProfileData.manageBanksLinkIds': linkIds, updatedAt: new Date() } },
        { upsert: true }
      );
      await reply("Reply with the *number* of the bank to remove (e.g. 1, 2, 3).");
      sendOk();
      return;
    }
    // In manage_banks_remove step: number = unlink that bank; Back = cancel
    if (regUser && session?.step === 'manage_banks_remove') {
      if (/^back\.?$/i.test(text.trim())) {
        await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          { $set: { step: 'done', 'taxProfileData.manageBanksLinkIds': [], updatedAt: new Date() } }
        );
        const menu = await getLoggedInMainMenu(regUser.firstName, new Date().getFullYear(), await safeHasActiveSubscription(regUser._id));
        await reply(menu);
        sendOk();
        return;
      }
      const linkIds = session.taxProfileData?.manageBanksLinkIds || [];
      const num = parseInt(text.trim(), 10);
      if (num >= 1 && num <= linkIds.length) {
        const linkId = linkIds[num - 1];
        const link = await MonoLink.findOne({ _id: linkId, user: regUser._id });
        if (link) {
          link.status = 'unlinked';
          link.updatedAt = new Date();
          await link.save();
          await reply("Bank disconnected ✅ You can connect it again anytime via *Manage connected banks*.");
        } else {
          await reply("That connection wasn't found. Reply *Manage connected banks* to see the list again.");
        }
        await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          { $set: { step: 'done', 'taxProfileData.manageBanksLinkIds': [], updatedAt: new Date() } }
        );
      } else {
        await reply(`Please reply with a number between 1 and ${linkIds.length}, or *Back* to cancel.`);
      }
      sendOk();
      return;
    }
    if (regUser && text.trim().toLowerCase() === 'add') {
      const links = await MonoLink.find({ user: regUser._id, status: 'linked' }).lean();
      if (links.length >= 5) {
        await reply("You can connect up to 5 banks. Reply *Remove* next to a bank to disconnect one first.");
        sendOk();
        return;
      }
      try {
        const latestProfile = await TaxableProfile.findOne({ user: regUser._id }).sort({ year: -1 }).select('profileId').lean();
        const monoLink = await getMonoConnectLinkForUser(regUser._id, latestProfile?.profileId);
        if (monoLink?.link) {
          await reply(CONNECT_ANOTHER_BANK);
          await reply(getConnectBankLink(monoLink.link));
        } else {
          await reply("We couldn't generate a new link right now. Please try again in a moment.");
        }
      } catch (e) {
        console.error('[WhatsApp] Add bank link error:', e.message);
        await reply("We couldn't generate a new link right now. Please try again in a moment.");
      }
      sendOk();
      return;
    }

    // —— Add reliefs (PDF: relief menu → amount → saved; documents via dashboard) ——
    if (regUser && isAddReliefsIntent(text)) {
      const hasSub = await safeHasActiveSubscription(regUser._id);
      if (!hasSub) {
        await reply(SUBSCRIPTION_REQUIRED);
        sendOk();
        return;
      }
      const latestProfile = await TaxableProfile.findOne({ user: regUser._id }).sort({ year: -1 }).select('_id profileId year').lean();
      if (!latestProfile) {
        await reply("You don't have a tax profile yet. Reply *Create tax profile* first.");
        sendOk();
        return;
      }
      const reliefList = RELIEF_TYPES.map((r) => `${r.num}. ${r.label}`).join('\n');
      await WhatsAppSession.findOneAndUpdate(
        { waId: from },
        { $set: { step: 'relief_menu', 'taxProfileData.reliefProfileId': latestProfile.profileId, 'taxProfileData.reliefYear': latestProfile.year, updatedAt: new Date() } },
        { upsert: true }
      );
      await reply(`Choose a relief type (reply with the number):\n\n${reliefList}\n\nOr reply *View added reliefs* to see what you've added, or *Back* for the main menu.${BACK_TO_MENU_FOOTER}`);
      sendOk();
      return;
    }
    if (regUser && /^view\s*added\s*reliefs?\.?$/i.test(text.trim())) {
      const latestProfile = await TaxableProfile.findOne({ user: regUser._id }).sort({ year: -1 }).select('_id profileId year').lean();
      if (!latestProfile) {
        await reply("You don't have a tax profile yet.");
        sendOk();
        return;
      }
      const deductions = await Deduction.find({ profileId: latestProfile._id, 'period.year': latestProfile.year }).sort({ createdAt: -1 }).lean();
      if (!deductions.length) {
        await reply("You haven't added any reliefs yet. Reply *Add reliefs* to add one.");
        sendOk();
        return;
      }
      const lines = deductions.map((d, i) => `${i + 1}. ${d.deductionType.replace(/_/g, ' ')}: ₦${Number(d.amount || 0).toLocaleString()}`).join('\n');
      await reply(`Your added reliefs for ${latestProfile.year}:\n\n${lines}\n\nReply *Add reliefs* to add more, or *View tax summary* to see your estimate.${BACK_TO_MENU_FOOTER}`);
      sendOk();
      return;
    }
    // relief_menu: number 1–8 → relief_amount
    if (regUser && session?.step === 'relief_menu') {
      if (/^back\.?$/i.test(text.trim())) {
        await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          { $set: { step: 'done', 'taxProfileData.reliefProfileId': undefined, 'taxProfileData.reliefYear': undefined, 'taxProfileData.selectedReliefType': undefined, updatedAt: new Date() } }
        );
        const menu = await getLoggedInMainMenu(regUser.firstName, new Date().getFullYear(), await safeHasActiveSubscription(regUser._id));
        await reply(menu);
        sendOk();
        return;
      }
      const num = parseInt(text.trim(), 10);
      const relief = RELIEF_TYPES.find((r) => r.num === num);
      if (relief) {
        await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          { $set: { step: 'relief_amount', 'taxProfileData.selectedReliefType': relief.key, updatedAt: new Date() } }
        );
        const hint = relief.key === 'rent_relief' ? ' (we\'ll apply 20% relief, max ₦500,000)' : '';
        await reply(`Enter the *amount* in Naira for ${relief.label}${hint}. Example: 50000${BACK_TO_MENU_FOOTER}`);
        sendOk();
        return;
      }
      await reply("Reply with a number from 1 to 8, or *View added reliefs* or *Back*.");
      sendOk();
      return;
    }
    // relief_amount: number → create deduction, then offer add another / view / back
    if (regUser && session?.step === 'relief_amount') {
      if (/^back\.?$/i.test(text.trim())) {
        await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          { $set: { step: 'relief_menu', 'taxProfileData.selectedReliefType': undefined, updatedAt: new Date() } }
        );
        const reliefList = RELIEF_TYPES.map((r) => `${r.num}. ${r.label}`).join('\n');
        await reply(`Choose a relief type:\n\n${reliefList}\n\nOr *View added reliefs* or *Back*.`);
        sendOk();
        return;
      }
      const amount = parseFloat(String(text).replace(/[,₦\s]/g, ''), 10);
      if (isNaN(amount) || amount < 0) {
        await reply("Please enter a valid amount in Naira (e.g. 50000). Or reply *Back* to cancel.");
        sendOk();
        return;
      }
      const profileIdStr = session.taxProfileData?.reliefProfileId;
      const year = session.taxProfileData?.reliefYear;
      const deductionType = session.taxProfileData?.selectedReliefType;
      const profile = await TaxableProfile.findOne({ profileId: profileIdStr, user: regUser._id }).select('_id').lean();
      if (!profile) {
        await reply("Your profile wasn't found. Reply *Back* and try again.");
        sendOk();
        return;
      }
      const period = { year, startDate: new Date(year, 0, 1), endDate: new Date(year, 11, 31) };
      const payload = { profileId: profile._id, deductionType, period, amount: 0 };
      if (deductionType === 'nhf') payload.nhf = { contribution: amount };
      else if (deductionType === 'nhis') payload.nhis = { contribution: amount };
      else if (deductionType === 'pension') payload.pension = { contribution: amount };
      else if (deductionType === 'life_insurance') payload.lifeInsurance = { premium: amount };
      else if (deductionType === 'mortgage_interest') payload.mortgageInterest = { interestPaid: amount };
      else if (deductionType === 'rent_relief') payload.rentRelief = { annualRent: amount };
      else if (deductionType === 'transport_allowance') payload.transportAllowance = { amount: Math.min(amount, 200000) };
      else if (deductionType === 'other') payload.other = { amount, description: 'Other deduction' };
      try {
        const deduction = new Deduction(payload);
        await deduction.save();
        await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          { $set: { step: 'relief_menu', 'taxProfileData.selectedReliefType': undefined, 'taxProfileData.lastDeductionId': String(deduction._id), updatedAt: new Date() } }
        );
        const displayAmount = deduction.amount != null ? deduction.amount : amount;
        await reply(`Saved ✅ Relief added: ₦${Number(displayAmount).toLocaleString()}.\n\nYou can *send a photo or document* here to attach to this relief, or use the dashboard: https://${DASHBOARD_URL}\n\nReply with a number (1–8) to add another relief, *View added reliefs*, or *Back* for the main menu.${BACK_TO_MENU_FOOTER}`);
        const reliefList = RELIEF_TYPES.map((r) => `${r.num}. ${r.label}`).join('\n');
        await reply(`Choose a relief type:\n\n${reliefList}\n\nOr *View added reliefs* or *Back*.${BACK_TO_MENU_FOOTER}`);
      } catch (err) {
        console.error('[WhatsApp] Relief save error:', err.message);
        await reply("Something went wrong saving that relief. Please try again or add it from the dashboard: https://" + DASHBOARD_URL);
      }
      sendOk();
      return;
    }

    // —— Proceed to file (PDF: CONFIRM step) ——
    if (regUser && isProceedToFileIntent(text)) {
      const hasSub = await safeHasActiveSubscription(regUser._id);
      if (!hasSub) {
        await reply(SUBSCRIPTION_REQUIRED);
        sendOk();
        return;
      }
      const latestProfile = await TaxableProfile.findOne({ user: regUser._id }).sort({ year: -1 }).select('profileId year').lean();
      if (!latestProfile) {
        await reply("You don't have a tax profile yet. Reply *Create tax profile* first.");
        sendOk();
        return;
      }
      session = await WhatsAppSession.findOneAndUpdate(
        { waId: from },
        { $set: { step: 'filing_confirm', 'taxProfileData.filingProfileId': latestProfile.profileId, updatedAt: new Date() } },
        { upsert: true, new: true }
      );
      const confirmMsg = FILE_TAX_CONFIRM.replace('2025', String(latestProfile.year));
      await reply(confirmMsg);
      sendOk();
      return;
    }

    if (regUser && isContinueMyFilingIntent(text)) {
      const hasSub = await safeHasActiveSubscription(regUser._id);
      if (!hasSub) {
        await reply(SUBSCRIPTION_REQUIRED);
        sendOk();
        return;
      }
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
      let monoLink;
      try {
        monoLink = await getMonoConnectLinkForUser(regUser._id, latestProfile.profileId);
      } catch (e) {
        console.error('[WhatsApp] Continue my filing Mono link error:', e.message);
        monoLink = null;
      }
      console.log('[Mono] Continue my filing → income step', { gotLink: !!monoLink?.link, waId: from });
      if (monoLink?.link) {
        await reply(
          "Let's get your *financial data* in.\n\n" +
          "Connect your bank securely with Mono (one-time) and we'll pull your income automatically:\n\n" +
          monoLink.link
        );
        await reply("After you've connected, reply *done* here. Or if you prefer not to connect, just type your income details in one message (e.g. salary, business income).");
      } else {
        await reply(
          "Let's get your *financial data* in.\n\n" +
          "Share your income info in one message (e.g. employment salary, business income). Then we'll ask about reliefs and deductibles.\n\n" +
          "Reply with your income details below 👇"
        );
      }
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

    if (regUser && isGetMyFinancialDataIntent(text)) {
      const link = await MonoLink.findOne({ user: regUser._id, status: 'linked' }).sort({ updatedAt: -1 }).lean();
      if (link) {
        try {
          const income = await getAccountIncome(link.monoAccountId);
          const totalIncome = (income && (income.total_income ?? income.totalIncome ?? income.monthly_average * 12)) || 0;
          const balance = (income && (income.balance ?? income.total_balance)) || null;
          let msg = "We have your *financial data* from your linked bank ✅\n\n";
          if (balance != null) msg += "• Balance: ₦" + Number(balance).toLocaleString() + "\n";
          if (totalIncome > 0) msg += "• Income (annual): ₦" + Number(totalIncome).toLocaleString() + "\n";
          msg += "\nSay *Check my PAYE estimate* to see an estimated tax based on this income." + BACK_TO_MENU_FOOTER;
          await reply(msg);
        } catch (e) {
          console.error('[WhatsApp] Get financial data fetch error:', e.message);
          await reply("Your bank is linked ✅ We're still syncing the latest numbers. Say *Check my PAYE estimate* if you've already added income, or try again in a moment." + BACK_TO_MENU_FOOTER);
        }
      } else {
        let monoLinkGet;
        try {
          monoLinkGet = await getMonoConnectLinkForUser(regUser._id, null);
        } catch (e) {
          console.error('[WhatsApp] Get financial data Mono link error:', e.message);
          monoLinkGet = null;
        }
        if (monoLinkGet?.link) {
          await reply("Let's get your *financial data* in. Connect your bank (one-time) and we'll pull your income:\n\n" + monoLinkGet.link + BACK_TO_MENU_FOOTER);
          await reply("After connecting, say *Get my financial data* again to see your summary.");
        } else {
          await reply("To get your financial data we need to connect your bank. Set up your tax profile first (reply *Continue my filing* or *Tax profile*), then we'll send you a secure link to connect." + BACK_TO_MENU_FOOTER);
        }
      }
      sendOk();
      return;
    }

    if (regUser && isCheckPayeEstimateIntent(text)) {
      const profile = await TaxableProfile.findOne({ user: regUser._id }).sort({ year: -1, createdAt: -1 }).select('incomeDetails').lean();
      let annualIncome = 0;
      if (profile?.incomeDetails) {
        const id = profile.incomeDetails;
        if (id.source === 'mono' && id.data) {
          const d = id.data;
          annualIncome = d.total_income ?? d.totalIncome ?? (d.monthly_average != null ? d.monthly_average * 12 : 0) ?? (d.income && (d.income.total ?? d.income.annual)) ?? 0;
        }
        if (annualIncome <= 0 && id.text) {
          const match = String(id.text).match(/(\d[\d,.\s]*)\s*(?:naira|ngn|₦|k|m)/i) || String(id.text).match(/(\d{1,3}(?:,\d{3})*(?:\.\d+)?)/);
          if (match) annualIncome = parseFloat(String(match[1]).replace(/,/g, ''), 10) || 0;
        }
      }
      if (annualIncome <= 0) {
        await reply("We don't have your income on file yet. Reply *Get my financial data* to connect your bank, or *Continue my filing* to add income manually. Then I can give you a PAYE estimate." + BACK_TO_MENU_FOOTER);
        sendOk();
        return;
      }
      const e = estimateTaxFromAnnualIncome(annualIncome);
      const pct = Math.round(e.effectiveRatePercent * 100) / 100;
      await reply(
        "Based on your income of *₦" + annualIncome.toLocaleString() + "* (annual):\n\n" +
        "• Estimated tax: *₦" + e.totalTax.toLocaleString() + "*\n" +
        "• Effective rate: *" + pct + "%*\n\n" +
        "(Rates: 0% up to ₦800k, then 15%, 18%, etc. This is an estimate only.)" + BACK_TO_MENU_FOOTER
      );
      sendOk();
      return;
    }

    if (regUser && isMenuOrHiIntent(text)) {
      const hasProfile = await TaxableProfile.findOne({ user: regUser._id }).sort({ year: -1 }).select('_id year').lean();
      const hasSub = await safeHasActiveSubscription(regUser._id);
      const year = hasProfile?.year || new Date().getFullYear();
      if (hasProfile) {
        await reply(getLoggedInMainMenu(regUser.firstName, year, hasSub));
      } else {
        await sendWatchVideoPreview();
        await reply(getPostVerificationWelcome(regUser.firstName));
      }
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

    if (!session) {
      await sendWatchVideoPreview();
      await reply(ENTRY_MESSAGE);
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
        await reply(CREATE_ACCOUNT_LAST_NAME);
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
        await reply(CREATE_ACCOUNT_EMAIL);
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
        await reply(CREATE_ACCOUNT_USE_WHATSAPP_NUMBER);
        break;
      }
      case 'phone': {
        // Legacy: session had step 'phone' (old flow). Treat as phone_confirm and ask yes/no.
        session.step = 'phone_confirm';
        await session.save();
        await reply(CREATE_ACCOUNT_USE_WHATSAPP_NUMBER);
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
          await reply(CREATE_ACCOUNT_PASSWORD);
          break;
        }
        if (t === 'no' || t === 'n') {
          session.step = 'phone_input';
          await session.save();
          await reply(`No problem, ${firstName}! What's your *phone number*? (e.g. 08012345678)`);
          break;
        }
        await reply("Reply *Yes* to use this WhatsApp number, or *No* to send another number.");
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
        await reply(CREATE_ACCOUNT_PASSWORD);
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
          await reply(`${data.firstName || 'There'}, you're all set! 🎉 That code was already used — sign in when you're ready. Welcome back!`);
          session.step = 'done';
          await session.save();
          await sendWatchVideoPreview();
          await reply(getPostVerificationWelcome(data.firstName));
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
        await reply(`✅ You're in, ${data.firstName}! Your email is verified. Your account is ready. Welcome to Taxable! 🎉`);
        await sendWatchVideoPreview();
        await reply(getPostVerificationWelcome(data.firstName));
        break;
      }
      case 'done': {
        try {
          const phoneForDone = waIdToPhone(from);
          const userDone = await User.findOne({ $or: [{ phone: phoneForDone }, { phone: phoneForDone.replace(/^0/, '234') }] }).select('_id firstName').lean();
          if (userDone) {
            const hasProfileDone = await TaxableProfile.findOne({ user: userDone._id }).sort({ year: -1 }).select('_id year').lean();
            const hasSubDone = await safeHasActiveSubscription(userDone._id);
            const yearDone = hasProfileDone?.year || new Date().getFullYear();
            if (hasProfileDone) {
              await reply(getLoggedInMainMenu(userDone.firstName, yearDone, hasSubDone));
            } else {
              await sendWatchVideoPreview();
              await reply(getPostVerificationWelcome(userDone.firstName));
            }
          } else {
            await sendWatchVideoPreview();
            await reply(ENTRY_MESSAGE);
          }
        } catch (e) {
          console.error('[WhatsApp] case done error:', e.message);
          await sendWatchVideoPreview();
          await reply(ENTRY_MESSAGE);
        }
        break;
      }
      default:
        await reply("I didn't quite get that. Reply *Hi Taxable* or *menu* for options — we're here to help! 💬");
    }
    sendOk();
  } catch (err) {
    console.error('[WhatsApp] webhook error:', err.message || err);
    try {
      await sendTextMessage(from, "Oops! Something went wrong. Try again or say *Hi Taxable* to start fresh — we're here to help! 💬" + BACK_TO_MENU_FOOTER);
    } catch (e) {
      console.error('[WhatsApp] failed to send error reply:', e.message);
    }
    if (!res.headersSent) res.status(200).send('OK');
  }
};

module.exports = {
  verifyWebhook,
  handleWebhook
};
