const mongoose = require('mongoose');
const WhatsAppSession = require('../models/WhatsAppSession');
const User = require('../models/User');
const OTP = require('../models/OTP');
const TaxableProfile = require('../models/TaxableProfile');
const TaxUpdate = require('../models/TaxUpdate');
const MonoLink = require('../models/MonoLink');
const Deduction = require('../models/Deduction');
const Document = require('../models/Document');
const IncomeSource = require('../models/IncomeSource');
const Subscription = require('../models/Subscription');
const { sendTextMessage, sendImage, sendTypingIndicator } = require('../services/whatsappService');
const { registerUser, resendOTP } = require('../services/registrationService');
const { initiateAccountLinking, getAccountIncome } = require('../services/monoService');
const { estimateTaxFromAnnualIncome, calculateRentRelief } = require('../utils/taxCalculator');
const { createSubscriptionLinkForUser, createFilingPaymentLink, verifyPendingSubscriptionForUser } = require('./paystackController');
const { sendTaxProfileCreatedEmail } = require('../utils/emailService');
const {
  FIRST_WELCOME_MESSAGE,
  ENTRY_MESSAGE,
  CURIOUS_MODE_REPLY,
  CREATE_ACCOUNT_INTRO,
  CREATE_ACCOUNT_FIRST_NAME,
  CREATE_ACCOUNT_LAST_NAME,
  CREATE_ACCOUNT_USE_WHATSAPP_NUMBER,
  CREATE_ACCOUNT_EMAIL,
  CREATE_ACCOUNT_PASSWORD,
  CREATE_ACCOUNT_CONFIRM,
  CREATE_ACCOUNT_NOT_NOW,
  CREATE_ACCOUNT_FULL_NAME,
  CREATE_ACCOUNT_FULL_NAME_INVALID,
  getCreateAccountEmailPrompt,
  CREATE_ACCOUNT_EMAIL_INVALID,
  CREATE_ACCOUNT_EMAIL_EXISTS,
  getCreateAccountPhoneConfirmPrompt,
  CREATE_ACCOUNT_PHONE_INPUT,
  CREATE_ACCOUNT_PASSWORD_NEW,
  CREATE_ACCOUNT_PASSWORD_SAVED,
  getAccountCreatedFinalMessage,
  CREATE_ACCOUNT_PICK_NUMBER,
  CREATE_ACCOUNT_MENU_MID_FLOW,
  CREATE_ACCOUNT_STOPPED,
  getPostVerificationWelcome,
  getTaxProfileIntro,
  TAX_PROFILE_ASK_NIN,
  SUBSCRIPTION_WHY_IT_MATTERS,
  getPaymentLinkMessage,
  getPaymentLinkMessageYearly,
  PAYMENT_CONFIRMED,
  getPaymentConfirmedAfterProfile,
  PAYMENT_NOT_CONFIRMED_YET,
  getLoggedInMainMenu,
  FILE_TAX_CONFIRM,
  FILE_TAX_SUBMITTED,
  CONNECT_BANK_INTRO,
  getConnectBankLink,
  CONNECT_ANOTHER_BANK,
  BACK_TO_MENU_FOOTER
} = require('../constants/whatsappPrompts');
const { generateCompleteBreakdown } = require('../utils/breakdownCalculator');
const { performFileTax } = require('./profileController');
const { downloadMedia } = require('../services/whatsappService');
const { createDocumentFromBuffer } = require('./documentController');
const { createUploadSessionForUser } = require('./uploadController');

const WhatsAppErrorLogger = require('../utils/whatsappErrorLogger');
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
        await WhatsAppErrorLogger.logGenericError(e, {
      errorType: 'database',
      severity: 'medium',
      context: 'getLatestTaxUpdatesForMenu error:',
      loggedFrom: 'whatsapp_webhook'
    });
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

/** PDF: "I don't understand tax — explain it" (curious mode); bracket shortcut (explain) */
function isIDontUnderstandTaxIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return (
    /^explain\.?$/i.test(t) ||
    /i don'?t understand tax/i.test(t) ||
    /don'?t understand tax/i.test(t) ||
    /explain\s*(it|tax)/i.test(t) ||
    t === "i don't understand tax" ||
    t === "explain it"
  );
}

/** PDF: "FAQ" or "Talk to someone" / "Talk to support"; bracket shortcuts (faq), (support) */
function isFAQOrTalkToSomeoneIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return (
    /^faq\.?$/i.test(t) ||
    /^support\.?$/i.test(t) ||
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
    /create\s*(an\s*)?account/i.test(t) ||
    /sign\s*up/i.test(t) ||
    /i\s*want\s*to\s*(create|sign\s*up)/i.test(t) ||
    t === 'create my account' ||
    t === 'create an account'
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

/** User wants to review tax profile (light dashboard view; bracket shortcut "review") */
function isReviewProfileIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return (
    /^review\.?$/i.test(t) ||
    /review\s*(your|my)\s*(tax\s*)?profile/i.test(t) ||
    /review\s*profile/i.test(t)
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

/** PDF: "View tax summary"; bracket shortcut (summary) */
function isViewTaxSummaryIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return /^summary\.?$/i.test(t) || /view\s*tax\s*summary/i.test(t) || t === 'view tax summary' || /tax\s*summary/i.test(t) && /view|show|see/i.test(t);
}

/** PDF: "Proceed to file"; bracket shortcut (file). Also "3" when menu option 3 is "File your X tax return". */
function isProceedToFileIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return /^file\.?$/i.test(t) || /^3$/i.test(t) || /proceed\s*to\s*file/i.test(t) || /file\s*(my\s*)?tax/i.test(t) && /proceed|ready|submit/i.test(t) || t === 'proceed to file';
}

/** PDF: "Reply CONFIRM to file" */
function isConfirmFileIntent(text) {
  if (!text || typeof text !== 'string') return false;
  return /^confirm\.?$/i.test(text.trim()) || text.trim().toLowerCase() === 'confirm';
}

/** PDF: "Manage connected banks"; bracket shortcut (connect) */
function isManageConnectedBanksIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return /^connect\.?$/i.test(t) || /connect\s*and\s*manage\s*banks/i.test(t) || /manage\s*connected\s*banks/i.test(t) || (/connected\s*banks/i.test(t) && /manage|list|view|connect/i.test(t)) || t === 'manage connected banks' || t === 'connect and manage banks';
}

/** PDF: "Add reliefs & upload documents"; bracket shortcut (relief) */
function isAddReliefsIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  return /^relief\.?$/i.test(t) || /add\s*reliefs/i.test(t) || /reliefs?\s*&\s*upload\s*documents?/i.test(t) || /upload\s*documents?/i.test(t) && /relief/i.test(t) || t === 'add reliefs' || t === 'add reliefs & upload documents';
}

/** User wants to go to the upload page (e.g. "I want to upload documents") — not the add-reliefs flow. */
function isUploadDocumentsIntent(text) {
  if (!text || typeof text !== 'string') return false;
  const t = text.trim().toLowerCase();
  if (/add\s*reliefs/i.test(t)) return false; // "Add reliefs & upload documents" → relief flow
  return /(?:i\s*want\s+to\s+)?upload\s*(?:my\s+)?documents?/i.test(t) || /upload\s*documents?/i.test(t);
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
        await WhatsAppErrorLogger.logGenericError(e, {
      errorType: 'payment',
      severity: 'high',
      context: 'safeHasActiveSubscription error:',
      loggedFrom: 'whatsapp_webhook'
    });
    console.error('[WhatsApp] safeHasActiveSubscription error:', e.message);
    return false;
  }
}

/** Income source options for tax profile (order 1–7). */
const INCOME_SOURCE_OPTIONS = [
  'Salary / Employment',
  'Business/Self-employment',
  'Freelance/Consulting',
  'Investment income',
  'Rental income',
  'Digital Assets/Crypto',
  'Other'
];

/** Build light dashboard message for "Review" (profile summary + follow-up options). */
function getReviewProfileSummaryMessage(profile) {
  if (!profile) return null;
  const year = profile.year || new Date().getFullYear();
  const nin = profile.primaryNIN ? String(profile.primaryNIN).trim() : '';
  // Developer note: NIN masked to last 3 digits in all UI confirmations — never display in full after submission
  const ninDisplay = nin.length >= 3 ? `****${nin.slice(-3)}` : nin ? '****' : '—';
  const incomeSources = Array.isArray(profile.primaryIncomeSources) && profile.primaryIncomeSources.length
    ? profile.primaryIncomeSources.join(', ')
    : '—';
  const resident = profile.residency183Days === true ? 'Nigeria (183+ days)' : profile.residency183Days === false ? 'Not Nigeria' : '—';
  const yesNo = (v) => (v === true ? 'Yes' : v === false ? 'No' : '—');
  const rent = yesNo(profile.paysRent);
  const pension = yesNo(profile.hasPension);
  const health = yesNo(profile.hasHealthInsurance);
  const mortgage = yesNo(profile.paysMortgage);
  let msg = `Here's your *${year}* tax profile summary 👇\n\n`;
  msg += `🧾 *Identity*\n`;
  msg += `• NIN: ${ninDisplay}\n`;
  msg += `• Income sources: ${incomeSources}\n`;
  msg += `• Resident status: ${resident}\n\n`;
  msg += `💡 *Relief indicators*\n`;
  msg += `• Rent: ${rent}\n`;
  msg += `• Pension: ${pension}\n`;
  msg += `• NHF/Mortgage: ${mortgage}\n`;
  msg += `• Life insurance: —\n`;
  msg += `• Health insurance: ${health}\n\n`;
  msg += `Would you like to:\n`;
  msg += `• Change income sources\n`;
  msg += `• Update relief answers\n`;
  msg += `• Update NIN\n`;
  msg += `• Go back\n\n`;
  msg += `Type what you'd like to change.`;
  return msg;
}

/** Parse "1" or "1,2" or "1, 2, 3" into array of option labels. Returns [] if invalid. */
function parseIncomeSourceReply(text) {
  const t = text.trim().replace(/\s+/g, '');
  const parts = t.split(',').map(s => parseInt(s, 10)).filter(n => n >= 1 && n <= INCOME_SOURCE_OPTIONS.length);
  const unique = [...new Set(parts)];
  if (unique.length === 0) return null;
  return unique.map(n => INCOME_SOURCE_OPTIONS[n - 1]);
}

/** Map profile primaryIncomeSources label to IncomeSource.incomeType */
const INCOME_SOURCE_LABEL_TO_TYPE = {
  'Salary / Employment': 'employment',
  'Business/Self-employment': 'business',
  'Freelance/Consulting': 'business',
  'Investment income': 'investment',
  'Rental income': 'rental',
  'Digital Assets/Crypto': 'other',
  'Other': 'other'
};

/**
 * Create or replace IncomeSource records for a profile from (sources, amounts).
 * Deletes existing IncomeSource for profileId+year, then creates one per (source, amount).
 */
async function syncIncomeSourcesFromAmounts(profileId, year, primaryIncomeSources, incomeAmounts, otherIncomeDescription) {
  let options = {};
  // Backward-compatible: allow a 6th argument as options { month?: number }
  if (arguments.length >= 6 && typeof arguments[5] === 'object' && arguments[5] != null) {
    options = arguments[5];
  }
  const month = options?.month != null ? Number(options.month) : null; // 1..12

  if (!profileId || !Array.isArray(primaryIncomeSources) || primaryIncomeSources.length === 0 || !Array.isArray(incomeAmounts) || incomeAmounts.length !== primaryIncomeSources.length) return;
  const deleteQuery = month ? { profileId, 'period.year': year, 'period.month': month } : { profileId, 'period.year': year };
  await IncomeSource.deleteMany(deleteQuery);

  const startDate = month ? new Date(year, month - 1, 1) : new Date(year, 0, 1);
  const endDate = month ? new Date(year, month, 0) : new Date(year, 11, 31);
  for (let i = 0; i < primaryIncomeSources.length; i++) {
    const label = primaryIncomeSources[i];
    const amount = Number(incomeAmounts[i]) || 0;
    if (amount <= 0) continue;
    const incomeType = INCOME_SOURCE_LABEL_TO_TYPE[label] || 'other';
    const payload = {
      profileId,
      incomeType,
      period: { startDate, endDate, year, ...(month ? { month } : {}) },
      totalAmount: amount
    };
    // If month is set, treat the amount as a monthly value.
    if (incomeType === 'employment') payload.employment = { annualGrossSalary: amount };
    else if (incomeType === 'business') payload.business = { annualRevenue: amount };
    else if (incomeType === 'rental') payload.rental = { properties: [{ annualRentalIncome: amount }] };
    else if (incomeType === 'investment') payload.investment = { incomeItems: [{ incomeType: 'other', amount }] };
    else payload.other = { amount, description: label === 'Other' ? (otherIncomeDescription || 'Other income') : label };
    await IncomeSource.create(payload);
  }
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

/** Get annual amount from profile/td (prefer annual field, fallback to monthly * 12 for backward compat). */
function getAnnualAmount(profile, td, annualKey, monthlyKey) {
  const annual = profile?.[annualKey] ?? td?.[annualKey];
  if (annual != null && Number(annual) >= 0) return Number(annual);
  const monthly = profile?.[monthlyKey] ?? td?.[monthlyKey];
  if (monthly != null && Number(monthly) >= 0) return Number(monthly) * 12;
  return 0;
}

/** Get monthly amount from profile/td (prefer monthly field, fallback to annual / 12). */
function getMonthlyAmount(profile, td, monthlyKey, annualKey) {
  const monthly = profile?.[monthlyKey] ?? td?.[monthlyKey];
  if (monthly != null && Number(monthly) >= 0) return Number(monthly);
  const annual = profile?.[annualKey] ?? td?.[annualKey];
  if (annual != null && Number(annual) >= 0) return Number(annual) / 12;
  return 0;
}

/** Estimate annual deductibles from profile/td (for summary when no IncomeSource/Deduction data yet). Amounts stored as annual. */
function estimateDeductiblesFromProfile(profile, td) {
  let total = 0;
  const rentAnnual = getAnnualAmount(profile, td, 'rentAnnualAmount', 'rentMonthlyAmount');
  if ((profile?.paysRent || td?.paysRent) && rentAnnual > 0) {
    total += calculateRentRelief(rentAnnual); // 20% of annual rent, max ₦500,000
  }
  if (profile?.hasPension || td?.hasPension) {
    total += getAnnualAmount(profile, td, 'pensionAnnualAmount', 'pensionMonthlyAmount');
  }
  if (profile?.hasHealthInsurance || td?.hasHealthInsurance) {
    total += getAnnualAmount(profile, td, 'healthInsuranceAnnualAmount', 'healthInsuranceMonthlyAmount');
  }
  if (profile?.paysMortgage || td?.paysMortgage) {
    total += getAnnualAmount(profile, td, 'mortgageAnnualAmount', 'mortgageMonthlyAmount');
  }
  return total;
}

/** Estimate monthly deductibles for monthly tracking (rent relief is annual, prorated monthly; others use monthly entered values). */
function estimateMonthlyDeductiblesFromProfile(profile, td) {
  let total = 0;
  // Rent relief is computed annually, then prorated for monthly estimate.
  const rentAnnual = getAnnualAmount(profile, td, 'rentAnnualAmount', 'rentMonthlyAmount');
  if ((profile?.paysRent || td?.paysRent) && rentAnnual > 0) {
    total += calculateRentRelief(rentAnnual) / 12;
  }
  // Other deductibles are applied based on the month’s captured amounts.
  if (profile?.hasPension || td?.hasPension) {
    total += getMonthlyAmount(profile, td, 'pensionMonthlyAmount', 'pensionAnnualAmount');
  }
  if (profile?.hasHealthInsurance || td?.hasHealthInsurance) {
    total += getMonthlyAmount(profile, td, 'healthInsuranceMonthlyAmount', 'healthInsuranceAnnualAmount');
  }
  if (profile?.paysMortgage || td?.paysMortgage) {
    total += getMonthlyAmount(profile, td, 'mortgageMonthlyAmount', 'mortgageAnnualAmount');
  }
  return total;
}

/** STEP 8 — Profile summary message (PDF: Tax Year, NIN masked last 3, income sources, tax authority, deductibles, filing preference, estimated tax). */
async function getTaxProfileSummaryForStep8(firstName, profile, td, breakdown) {
  const year = profile?.year || td?.year || new Date().getFullYear();
  const nin = (profile?.primaryNIN || td?.nin || '').toString().trim();
  const ninDisplay = nin.length >= 3 ? `****${nin.slice(-3)}` : '—';
  const incomeList = Array.isArray(profile?.primaryIncomeSources) && profile.primaryIncomeSources.length
    ? profile.primaryIncomeSources.join(', ')
    : (Array.isArray(td?.primaryIncomeSources) && td.primaryIncomeSources.length ? td.primaryIncomeSources.join(', ') : '—');
  const state = profile?.state || td?.state || '—';
  const stateIRS = state !== '—' ? `${state} Internal Revenue Service` : '—';
  const fmt = (n) => (n != null && Number(n) >= 0 ? `₦${Number(n).toLocaleString()}` : '—');
  const rentVal = getAnnualAmount(profile, td, 'rentAnnualAmount', 'rentMonthlyAmount');
  const rent = profile?.paysRent || td?.paysRent ? fmt(rentVal) : '—';
  const healthVal = getAnnualAmount(profile, td, 'healthInsuranceAnnualAmount', 'healthInsuranceMonthlyAmount');
  const health = profile?.hasHealthInsurance || td?.hasHealthInsurance ? fmt(healthVal) : '—';
  const pensionVal = getAnnualAmount(profile, td, 'pensionAnnualAmount', 'pensionMonthlyAmount');
  const pension = profile?.hasPension || td?.hasPension ? fmt(pensionVal) : '—';
  const mortgageVal = getAnnualAmount(profile, td, 'mortgageAnnualAmount', 'mortgageMonthlyAmount');
  const mortgage = profile?.paysMortgage || td?.paysMortgage ? fmt(mortgageVal) : '—';
  const filingPref = profile?.filingPreference || td?.filingPreference || '—';
  const filingLabel = filingPref === 'monthly' ? 'Monthly' : filingPref === 'annual' ? 'Annual' : filingPref;

  const s = breakdown?.summary || {};
  let estIncome = s.totalIncome ?? 0;
  let estDeductions = s.totalDeductions ?? 0;
  let chargeable = s.chargeableIncome ?? (estIncome - estDeductions);
  let annualTax = s.finalTaxPayable ?? s.taxCalculated ?? 0;
  const hasBreakdownData = estIncome > 0 || estDeductions > 0;

  // Fallback: if breakdown has income but zero deductions, estimate reliefs from profile flags (rent/health/pension/mortgage)
  const hasProfileReliefs =
    (profile?.paysRent || td?.paysRent) ||
    (profile?.hasHealthInsurance || td?.hasHealthInsurance) ||
    (profile?.hasPension || td?.hasPension) ||
    (profile?.paysMortgage || td?.paysMortgage);

  const isMonthly = filingPref === 'monthly';
  const month = td?.periodMonth || profile?.periodMonth || 1;

  if (!hasBreakdownData) {
    // No income/deduction data at all – estimate from profile flags.
    if (isMonthly) {
      const mDed = estimateMonthlyDeductiblesFromProfile(profile, td);
      estDeductions = Math.round(mDed * 12);
    } else {
      estDeductions = estimateDeductiblesFromProfile(profile, td);
    }
    chargeable = null;
    annualTax = null;
  } else if (estIncome > 0 && estDeductions === 0 && hasProfileReliefs) {
    // We have income but no stored deductions, while profile has relief info:
    // estimate deductions and recompute tax so the user sees a more realistic position.
    if (isMonthly) {
      const mDed = estimateMonthlyDeductiblesFromProfile(profile, td);
      const projectedAnnualIncome = Number(estIncome) * 12;
      const projectedAnnualDeductions = Math.round(mDed * 12);
      estDeductions = projectedAnnualDeductions;
      const projectedChargeable = Math.max(projectedAnnualIncome - projectedAnnualDeductions, 0);
      chargeable = projectedChargeable;
      annualTax = projectedChargeable > 0 ? estimateTaxFromAnnualIncome(projectedChargeable).totalTax : 0;
      estIncome = projectedAnnualIncome; // for display as annual estimate
    } else {
      estDeductions = estimateDeductiblesFromProfile(profile, td);
      const estimatedChargeable = Math.max(estIncome - estDeductions, 0);
      chargeable = estimatedChargeable;
      annualTax = estimatedChargeable > 0 ? estimateTaxFromAnnualIncome(estimatedChargeable).totalTax : 0;
    }
  } else if (isMonthly && estIncome > 0) {
    // Monthly tracking: treat current stored income as this month, then annualize for an estimate.
    const mDed = estimateMonthlyDeductiblesFromProfile(profile, td);
    const projectedAnnualIncome = Number(estIncome) * 12;
    const projectedAnnualDeductions = Math.round(mDed * 12);
    const projectedChargeable = Math.max(projectedAnnualIncome - projectedAnnualDeductions, 0);
    annualTax = projectedChargeable > 0 ? estimateTaxFromAnnualIncome(projectedChargeable).totalTax : 0;
    chargeable = projectedChargeable;
    estDeductions = projectedAnnualDeductions;
    estIncome = projectedAnnualIncome;
  }

  const monthlyTax = annualTax != null && annualTax > 0 ? Math.round(annualTax / 12) : null;

  let msg = `Here's your tax profile summary, ${firstName || 'there'} 👇\n\n`;
  msg += '━━━━━━━━━━━━━━━\n';
  msg += `📅 *Tax Year:* ${year}\n`;
  msg += `🪪 *Tax ID (NIN):* ${ninDisplay}\n`;
  msg += `💼 *Income Sources:* ${incomeList}\n`;
  msg += `📍 *Tax Authority:* ${stateIRS}\n`;
  msg += `🏠 *Rent:* ${rent}/month\n`;
  msg += `🏥 *Health Insurance:* ${health}/month\n`;
  msg += `🏦 *Pension:* ${pension}/month\n`;
  msg += `🏡 *Mortgage:* ${mortgage}/month\n`;
  msg += `📆 *Filing Preference:* ${filingLabel}\n`;
  msg += '━━━━━━━━━━━━━━━\n\n';
  msg += "Based on what you've shared, here's your estimated tax position:\n";
  msg += `📊 *Estimated Annual Income:* ${hasBreakdownData ? fmt(estIncome) : '—'}\n`;
  msg += `🔽 *Total Deductibles & Reliefs:* ${fmt(estDeductions)}\n`;
  msg += `📉 *Estimated Taxable Income:* ${chargeable != null ? fmt(chargeable) : '—'}\n`;
  msg += `🧾 *Estimated Annual Tax (PIT):* ${annualTax != null ? fmt(annualTax) : '—'}\n`;
  msg += `📆 *Estimated Monthly Tax:* ${monthlyTax != null ? fmt(monthlyTax) : '—'}\n\n`;
  msg += 'Is everything correct?\n';
  msg += '1️⃣ Yes, looks good\n';
  msg += '2️⃣ No, I want to make a change';
  return msg;
}

/** STEP 7 — Filing preference message. For 2025 (past year) only annual is offered. */
function getFilingPreferenceMessage(year) {
  if (year === 2025) {
    return (
      'STEP 7 — Filing Preference\n\n' +
      'For tax year *2025*, the year has already passed — so we only support *annual* documentation. You\'ll enter everything for the full year when you file.\n\n' +
      '1️⃣ Continue with Annual'
    );
  }
  return (
    'STEP 7 — Filing Preference\n\n' +
    'Almost done! One important choice before we finish. 💡\n\n' +
    '*How would you like to document your income and expenses?*\n\n' +
    '1️⃣ *Monthly* — I\'ll log my records each month as I go (recommended ✅)\n' +
    '   Best for: staying on top of your taxes all year, no year-end panic\n\n' +
    '2️⃣ *Annually* — I\'ll enter everything at the end of the year\n' +
    '   Best for: people with simple, predictable income'
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

  /** Show typing bubble (loading) while we prepare a response */
  if (message.id) {
    await sendTypingIndicator(message.id).catch(async (e) => {
      await WhatsAppErrorLogger.logGenericError(e, {
        errorType: 'whatsapp_api',
        severity: 'medium',
        context: 'WhatsApp Typing indicator error:',
        loggedFrom: 'whatsapp_webhook'
      });
      console.error('[WhatsApp] Typing indicator error:', e.message);
    });
  }

  /** Send reply and return promise so we can await it before ending the request (required on serverless) */
  const reply = (msg) => {
    return sendTextMessage(from, msg)
      .then(() => console.log('[WhatsApp webhook] Reply sent to', from))
      .catch(err => console.error('[WhatsApp webhook] Send error:', err.message || err));
  };

  // —— Incoming image or document: save and link to relief (user can send docs in chat) ——
  if (type === 'image' || type === 'document') {
    // Check if user has verified email
    const phoneForLookup = waIdToPhone(from);
    const userForMedia = await User.findOne({ $or: [{ phone: phoneForLookup }, { phone: phoneForLookup.replace(/^0/, '234') }] }).select('_id emailVerified').lean();
    
    if (!userForMedia) {
      await reply("I can't process images right now. Please type your message instead, or create an account first.");
      sendOk();
      return;
    }
    
    if (!userForMedia.emailVerified) {
      await reply("Please verify your email first before sending documents. Check your inbox for the verification code.");
      sendOk();
      return;
    }
    
    try {
      const regUserForMedia = userForMedia;
      const mediaId = type === 'image' ? message.image?.id : message.document?.id;
      const originalFileName = type === 'document' ? (message.document?.filename || 'document') : (message.image?.caption ? `${message.image.caption}.jpg` : 'image.jpg');
      
      if (!mediaId) {
        await reply("I didn't receive the file. Please try sending it again.");
        sendOk();
        return;
      }
      
      let buffer, mimeType;
      try {
        const mediaResult = await downloadMedia(mediaId);
        buffer = mediaResult.buffer;
        mimeType = mediaResult.mimeType;
      } catch (mediaErr) {
            await WhatsAppErrorLogger.logGenericError(e, {
      errorType: 'whatsapp_api',
      severity: 'medium',
      context: 'Media download error:',
      loggedFrom: 'whatsapp_webhook'
    });
    console.error('[WhatsApp] Media download error:', mediaErr.message);
        await reply(`Sorry, I couldn't download that image. ${mediaErr.message?.includes('does not support image') ? "It seems this image type isn't supported. " : ''}Please try sending it as a document instead, or use the upload link in your profile.`);
        sendOk();
        return;
      }
      
      const profile = await TaxableProfile.findOne({ user: regUserForMedia._id }).sort({ year: -1 }).select('_id year').lean();
      if (!profile) {
        await reply("Create a tax profile first (Reply *1* for My Tax Profile), then you can send documents here.");
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
        await reply("Document received ✅ Saved and linked to your relief.");
        const sessionAfter = await WhatsAppSession.findOne({ waId: from }).lean();
        if (sessionAfter?.step === 'relief_awaiting_document') {
          await WhatsAppSession.findOneAndUpdate(
            { waId: from },
            { $set: { step: 'relief_menu', updatedAt: new Date() } }
          );
          const reliefList = RELIEF_TYPES.map((r) => `${r.num}. ${r.label}`).join('\n');
          await reply(`Choose a relief type:\n\n${reliefList}\n\nOr *View added reliefs* or *Back*.${BACK_TO_MENU_FOOTER}`);
        }
      } else {
        await reply("Document received ✅ Saved. To attach it to a relief, add a relief first then send the document again, or link it from the dashboard.");
      }
    } catch (e) {
          await WhatsAppErrorLogger.logGenericError(e, {
      errorType: 'whatsapp_api',
      severity: 'medium',
      context: 'Media handler error:',
      loggedFrom: 'whatsapp_webhook'
    });
    console.error('[WhatsApp] Media handler error:', e.message);
      await reply("We couldn't process that. Please try again or use the upload link in your profile.");
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
        const userForMenu = await User.findOne({ $or: [{ phone: phoneForLookup }, { phone: phoneForLookup.replace(/^0/, '234') }] }).select('firstName _id emailVerified').lean();
        
        // Check if user exists but hasn't verified email
        if (userForMenu && !userForMenu.emailVerified) {
          await reply(
            `Hi ${userForMenu.firstName} 👋\n\n` +
            `Your email hasn't been verified yet.\n\n` +
            `Please check your inbox for the verification code we sent you.\n\n` +
            `Reply with your 6-digit code to verify.\n\n` +
            `1️⃣ Resend code\n` +
            `2️⃣ Wrong email`
          );
          session = await WhatsAppSession.findOneAndUpdate(
            { waId: from },
            { $set: { step: 'otp', updatedAt: new Date() } },
            { upsert: true, new: true }
          );
          sendOk();
          return;
        }
        
        if (userForMenu) {
          console.log('[WhatsApp menu] User resolved for menu', {
            waId: from,
            phoneForLookup,
            userId: userForMenu._id.toString()
          });
          // Prefer the most recently updated profile with a non-null filingStatus;
          // fall back to latest by year. We fetch a wider window because users can
          // have multiple drafts/years and only some have filingStatus populated.
          const candidateProfiles = await TaxableProfile.find({ user: userForMenu._id })
            .sort({ updatedAt: -1 })
            .limit(20)
            .lean();
          console.log(
            '[WhatsApp menu] Candidate profiles (most recent first)',
            candidateProfiles.map((p) => ({
              _id: p?._id?.toString?.() || String(p?._id),
              year: p?.year ?? null,
              profileType: p?.profileType ?? null,
              status: p?.status ?? null,
              filingStatus: p?.filingStatus ?? null,
              updatedAt: p?.updatedAt ?? null,
              createdAt: p?.createdAt ?? null
            }))
          );
          const mostRecentWithStatus = candidateProfiles.find(p => p.filingStatus != null);
          const latestByYear = [...candidateProfiles].sort((a, b) => (b.year || 0) - (a.year || 0))[0] || null;
          const latestProfile = mostRecentWithStatus || latestByYear;
          console.log('[WhatsApp menu] Resolved latestProfile for menu', {
            waId: from,
            userId: userForMenu._id.toString(),
            profileCount: candidateProfiles.length,
            chosenProfileId: latestProfile?._id?.toString() || null,
            chosenYear: latestProfile?.year || null,
            chosenFilingStatus: latestProfile?.filingStatus || null
          });
          const hasSub = await safeHasActiveSubscription(userForMenu._id);
          const year = latestProfile?.year || new Date().getFullYear();

          if (latestProfile) {
            let menuOpts = {};
            // Always pass filingStatus for the latest profile
            if (latestProfile.filingStatus) {
              menuOpts.filingStatus = latestProfile.filingStatus;
            }
            // For filed profiles, keep filedForYear so we can mention it
            if (latestProfile.filingStatus === 'filed') {
              menuOpts.filedForYear = year;
            }

            // Build a lightweight summary snapshot for the menu (income, reliefs, tax) when possible
            try {
              const breakdown = await generateCompleteBreakdown(latestProfile._id, year);
              const s = breakdown?.summary || {};
              menuOpts.filingSummary = {
                estimatedAnnualIncome: s.totalIncome ?? undefined,
                totalReliefs: s.totalDeductions ?? undefined,
                estimatedTax: s.finalTaxPayable ?? s.taxCalculated ?? undefined
              };
            } catch (e) {
                  await WhatsAppErrorLogger.logGenericError(e, {
      errorType: 'unknown',
      severity: 'medium',
      context: 'getLoggedInMainMenu breakdown error:',
      loggedFrom: 'whatsapp_webhook'
    });
    console.error('[WhatsApp] getLoggedInMainMenu breakdown error:', e.message);
            }

            await reply(getLoggedInMainMenu(userForMenu.firstName, true, year, latestProfile?.filingStatus || null, menuOpts));
          } else {
            await reply(getLoggedInMainMenu(userForMenu.firstName, false));
          }
          session = await WhatsAppSession.findOneAndUpdate(
            { waId: from },
            { $set: { step: 'done', updatedAt: new Date() } },
            { upsert: true, new: true }
          );
        } else {
          await reply(FIRST_WELCOME_MESSAGE);
          session = await WhatsAppSession.findOneAndUpdate(
            { waId: from },
            { $set: { step: 'welcome_choice', updatedAt: new Date() } },
            { upsert: true, new: true }
          );
        }
      } catch (e) {
            await WhatsAppErrorLogger.logGenericError(e, {
      errorType: 'unknown',
      severity: 'medium',
      context: 'Get started error:',
      loggedFrom: 'whatsapp_webhook'
    });
    console.error('[WhatsApp] Get started error:', e.message);
        await reply(FIRST_WELCOME_MESSAGE);
        try {
          session = await WhatsAppSession.findOneAndUpdate(
            { waId: from },
            { $set: { step: 'welcome_choice', updatedAt: new Date() } },
            { upsert: true, new: true }
          );
        } catch (e2) {}
      }
      sendOk();
      return;
    }

    // No session or welcome / welcome_choice / create_account_confirm / create_account_paused / create_account_ready
    if (!session || session.step === 'welcome' || session.step === 'welcome_choice' || session.step === 'create_account_confirm' || session.step === 'create_account_paused' || session.step === 'create_account_ready') {
      // After first welcome: 1 → create account (MESSAGE 2), 2 → login
      if (session?.step === 'welcome_choice') {
        const choice = text.trim().toLowerCase();
        if (choice === '1' || isCreateAccountIntent(text)) {
          session = await WhatsAppSession.findOneAndUpdate(
            { waId: from },
            { $set: { step: 'create_account_confirm', registrationData: {}, updatedAt: new Date() } },
            { upsert: true, new: true }
          );
          await reply(CREATE_ACCOUNT_CONFIRM);
          sendOk();
          return;
        }
        if (choice === '2' || isLoginIntent(text)) {
          session = await WhatsAppSession.findOneAndUpdate(
            { waId: from },
            { $set: { step: 'login_email', registrationData: {}, updatedAt: new Date() } },
            { upsert: true, new: true }
          );
          await reply("What's the *email address* for your Taxable account?");
          sendOk();
          return;
        }
        await reply("Please reply with *1* or *2* to continue.\n\n1️⃣ I'm new — create my account\n2️⃣ I already have an account");
        sendOk();
        return;
      }
      // Paused signup: any message → show Ready again
      if (session?.step === 'create_account_paused') {
        session = await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          { $set: { step: 'create_account_confirm', updatedAt: new Date() } },
          { new: true }
        );
        await reply(CREATE_ACCOUNT_CONFIRM);
        sendOk();
        return;
      }
      // Create account confirm: 1 Yes let's go → full_name, 2 Not right now → paused
      if (session?.step === 'create_account_confirm') {
        const c = text.trim().toLowerCase();
        if (c === '1' || c === 'yes' || c === 'y' || /let'?s\s*go/i.test(c)) {
          session = await WhatsAppSession.findOneAndUpdate(
            { waId: from },
            { $set: { step: 'full_name', updatedAt: new Date() } },
            { new: true }
          );
          await reply(CREATE_ACCOUNT_FULL_NAME);
          sendOk();
          return;
        }
        if (c === '2' || c === 'no' || c === 'n' || /not\s*right\s*now/i.test(c)) {
          await WhatsAppSession.findOneAndUpdate(
            { waId: from },
            { $set: { step: 'create_account_paused', updatedAt: new Date() } }
          );
          await reply(CREATE_ACCOUNT_NOT_NOW);
          sendOk();
          return;
        }
        await reply(CREATE_ACCOUNT_PICK_NUMBER);
        sendOk();
        return;
      }
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
        await reply(FIRST_WELCOME_MESSAGE);
        if (!session) session = await WhatsAppSession.findOneAndUpdate({ waId: from }, { $set: { step: 'welcome_choice', updatedAt: new Date() } }, { upsert: true, new: true });
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
        await reply(FIRST_WELCOME_MESSAGE);
        if (!session) session = await WhatsAppSession.findOneAndUpdate({ waId: from }, { $set: { step: 'welcome_choice', updatedAt: new Date() } }, { upsert: true, new: true });
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
            await reply(getLoggedInMainMenu(userDoc.firstName, true, hasProfile.year, null));
          } else {
            await reply(getLoggedInMainMenu(userDoc.firstName, false));
          }
        } catch (e) {
              await WhatsAppErrorLogger.logGenericError(e2, {
      errorType: 'database',
      severity: 'medium',
      context: 'Login success save error:',
      loggedFrom: 'whatsapp_webhook'
    });
    console.error('[WhatsApp] Login success save error:', e.message);
          await reply("You're logged in, but we couldn't save your session. Say *Hi Taxable* to see your menu.");
        }
        sendOk();
        return;
      }
    }

    // Tax profile setup flow (FLOW 3 — Tax Profile Setup)
    // intro_choice → intro_explain? → year → NIN → income(+other, confirm) → residency(+nonresident choice) → state → deductibles (rent/health/pension/mortgage + amounts) → filing preference → create profile → reuse_ask → dob → street → city → state → income_info → deductibles free-text
    const taxProfileSteps = [
      'tax_profile_intro',
      'tax_profile_draft_choice',
      'tax_profile_intro_choice',
      'tax_profile_intro_explain',
      'tax_profile_year',
      'tax_profile_nin',
      'tax_profile_nin_keep',
      'tax_profile_income',
      'tax_profile_income_other_desc',
      'tax_profile_income_confirm',
      'tax_profile_filing_preference_early',
      'tax_profile_income_amount',
      'tax_profile_residency',
      'tax_profile_residency_nonresident_choice',
      'tax_profile_state',
      'tax_profile_state_keep',
      'tax_profile_rent',
      'tax_profile_rent_amount',
      'tax_profile_health',
      'tax_profile_health_amount',
      'tax_profile_pension',
      'tax_profile_pension_amount',
      'tax_profile_mortgage',
      'tax_profile_mortgage_amount',
      'tax_profile_reuse_ask',
      'tax_profile_dob',
      'tax_profile_street',
      'tax_profile_city',
      'tax_profile_state',
      'tax_profile_income_info',
      'tax_profile_deductibles',
      'tax_profile_filing_preference',
      'tax_profile_summary',
      'tax_profile_summary_confirm',
      'tax_profile_edit_choice',
      'tax_profile_final_steps',
      'tax_profile_subscription',
      'tax_profile_subscription_details',
      'tax_profile_subscription_later',
      // Direct edit flow steps (must be included so replies are routed to edit handlers)
      'edit_tax_year',
      'edit_nin',
      'edit_income',
      'edit_residency',
      'edit_state',
      'edit_rent_yn',
      'edit_rent_amount',
      'edit_filing_preference'
    ];
    if (session && String(session.step || '').startsWith('edit_') && !taxProfileSteps.includes(session.step)) {
      // #region agent log
      fetch('http://127.0.0.1:7402/ingest/8841f111-e782-4862-acaa-8f2e41540d3f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'23342d'},body:JSON.stringify({sessionId:'23342d',runId:'post-fix',hypothesisId:'H6',location:'controllers/whatsappWebhookController.js:taxProfileSteps:gate',message:'Edit step is missing from taxProfileSteps allowlist',data:{step:session.step},timestamp:Date.now()})}).catch(()=>{});
      // #endregion
    }
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

      // Helper: parse Yes/No into boolean
      const yesNo = (t) => {
        const x = String(t || '').trim().toLowerCase();
        if (x === 'yes' || x === 'y' || x === '1') return true;
        if (x === 'no' || x === 'n' || x === '2') return false;
        return null;
      };

      // Helper: parse integer amount in Naira; accepts commas, spaces, ₦. Returns { ok, value, errorType }
      const parseAmount = (raw) => {
        const t = String(raw || '').replace(/[,₦\s]/g, '').trim();
        if (!/^[0-9]+$/.test(t)) {
          return { ok: false, errorType: 'not_numeric' };
        }
        const value = parseInt(t, 10);
        if (!Number.isFinite(value) || value < 0) {
          return { ok: false, errorType: 'not_numeric' };
        }
        return { ok: true, value };
      };

      // Treat amounts above this as "implausibly high" and confirm
      const PLAUSIBLE_MONTHLY_MAX = 5000000;
      // Prepare current profile context early so all edit branches can read it safely.
      const pid = td.currentProfileId;
      let currentProfile = pid ? await TaxableProfile.findByProfileIdOrId(pid, userForTax._id) : null;
      // If we're at summary confirm but profile lookup failed (e.g. session from before currentProfileId), use latest profile for user+year
      if (!currentProfile && td.year != null) {
        currentProfile = await TaxableProfile.findOne({ user: userForTax._id, year: td.year }).sort({ createdAt: -1 }).limit(1).exec();
      }
      const EDIT_SUMMARY_MENU_TEXT =
        'Which part would you like to update?\n\n' +
        '1️⃣ Tax Year\n' +
        '2️⃣ NIN / Tax ID\n' +
        '3️⃣ Income Sources\n' +
        '4️⃣ Tax Residency\n' +
        '5️⃣ State of Residence\n' +
        '6️⃣ Deductibles & Reliefs\n' +
        '7️⃣ Filing Preference';

      const returnToTaxProfileEditSummaryMenu = async (profileHint = null) => {
        let profile = profileHint;
        if (!profile) {
          const profileId = td.currentProfileId;
          profile = profileId ? await TaxableProfile.findByProfileIdOrId(profileId, userForTax._id) : null;
        }
        if (!profile && td.year) {
          profile = await TaxableProfile.findOne({ user: userForTax._id, year: td.year }).sort({ createdAt: -1 }).exec();
        }
        if (!profile) {
          profile = await TaxableProfile.findOne({ user: userForTax._id }).sort({ year: -1 }).exec();
        }
        if (!profile) {
          await reply("Couldn't load your profile summary right now. Say *Menu* to continue.");
          session.step = 'done';
          session.taxProfileData = {};
          await session.save();
          return;
        }

        td.currentProfileId = profile.profileId;
        td.year = profile.year;
        session.step = 'tax_profile_edit_choice';
        session.taxProfileData = td;
        await session.save();

        // #region agent log
        fetch('http://127.0.0.1:7402/ingest/8841f111-e782-4862-acaa-8f2e41540d3f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'23342d'},body:JSON.stringify({sessionId:'23342d',runId:'post-fix',hypothesisId:'H8',location:'controllers/whatsappWebhookController.js:returnToTaxProfileEditSummaryMenu',message:'Returned to tax profile edit summary after successful update',data:{step:session.step,profileId:profile.profileId,year:profile.year},timestamp:Date.now()})}).catch(()=>{});
        // #endregion

        let breakdown = null;
        try { breakdown = await generateCompleteBreakdown(profile._id, profile.year); } catch (e) {}
        const summaryMsg = await getTaxProfileSummaryForStep8(userForTax.firstName, profile, td, breakdown);
        await reply(summaryMsg);
        await reply(EDIT_SUMMARY_MENU_TEXT);
      };

      if (session.step === 'tax_profile_draft_choice') {
        const choice = String(text || '').trim();
        if (choice === '1') {
          const draftId = td._draftProfileId;
          const draftProfile = draftId ? await TaxableProfile.findByProfileIdOrId(draftId, userForTax._id) : null;
          if (!draftProfile || draftProfile.status !== 'draft') {
            session.step = 'tax_profile_intro_choice';
            session.taxProfileData = { year: new Date().getFullYear() };
            await session.save();
            await reply('That draft is no longer available. Starting a fresh tax profile setup.\n\nReady to set it up?\n1️⃣ Yes, let\'s go\n2️⃣ What is a tax profile?\n0️⃣ Back to Main Menu');
            sendOk();
            return;
          }
          const tdRestore = {
            currentProfileId: draftProfile.profileId,
            year: draftProfile.year,
            nin: draftProfile.primaryNIN,
            primaryIncomeSources: draftProfile.primaryIncomeSources,
            state: draftProfile.state,
            paysRent: draftProfile.paysRent,
            rentAnnualAmount: draftProfile.rentAnnualAmount ?? draftProfile.rentMonthlyAmount,
            rentMonthlyAmount: draftProfile.rentMonthlyAmount,
            hasHealthInsurance: draftProfile.hasHealthInsurance,
            healthInsuranceAnnualAmount: draftProfile.healthInsuranceAnnualAmount ?? draftProfile.healthInsuranceMonthlyAmount,
            healthInsuranceMonthlyAmount: draftProfile.healthInsuranceMonthlyAmount,
            hasPension: draftProfile.hasPension,
            pensionAnnualAmount: draftProfile.pensionAnnualAmount ?? draftProfile.pensionMonthlyAmount,
            pensionMonthlyAmount: draftProfile.pensionMonthlyAmount,
            paysMortgage: draftProfile.paysMortgage,
            mortgageAnnualAmount: draftProfile.mortgageAnnualAmount ?? draftProfile.mortgageMonthlyAmount,
            mortgageMonthlyAmount: draftProfile.mortgageMonthlyAmount,
            filingPreference: draftProfile.filingPreference,
            residency183Days: draftProfile.residency183Days
          };
          session.taxProfileData = tdRestore;
          session.step = 'tax_profile_summary_confirm';
          await session.save();
          let breakdown = null;
          try { breakdown = await generateCompleteBreakdown(draftProfile._id, draftProfile.year); } catch (e) {}
          const summaryMsg = await getTaxProfileSummaryForStep8(userForTax.firstName, draftProfile, tdRestore, breakdown);
          await reply(summaryMsg);
          sendOk();
          return;
        }
        if (choice === '2') {
          session.step = 'tax_profile_intro_choice';
          session.taxProfileData = { year: new Date().getFullYear() };
          await session.save();
          await reply(
            '📋 *Tax Profile Setup*\n\n' +
            'This is where everything begins. Your tax profile helps us calculate what you owe, track your income across the year, and make filing stress-free when the time comes.\n\n' +
            'It takes about 3–5 minutes to complete.\n\n' +
            'Ready to set it up?\n' +
            '1️⃣ Yes, let\'s go\n' +
            '2️⃣ What is a tax profile?\n' +
            '0️⃣ Back to Main Menu'
          );
          sendOk();
          return;
        }
        await reply('Please reply with 1 or 2.');
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_intro') {
        // Message 1 — Introduction
        await reply(
          '📋 *Tax Profile Setup*\n\n' +
          'This is where everything begins. Your tax profile helps us calculate what you owe, track your income across the year, and make filing stress-free when the time comes.\n\n' +
          'It takes about 3–5 minutes to complete.\n\n' +
          'Ready to set it up?\n' +
          '1️⃣ Yes, let\'s go\n' +
          '2️⃣ What is a tax profile?\n' +
          '0️⃣ Back to Main Menu'
        );
        session.step = 'tax_profile_intro_choice';
        session.taxProfileData = td;
        await session.save();
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_intro_choice') {
        const choice = String(text || '').trim();
        if (choice === '1') {
          // Proceed to tax year (STEP 1)
          session.step = 'tax_profile_year';
          session.taxProfileData = td;
          await session.save();
          await reply(
            'STEP 1 — Tax Year\n' +
            'Which tax year are you filing for?\n\n' +
            '1️⃣ 2025 (January – December 2025)\n' +
            '2️⃣ 2026 (January – December 2026)'
          );
          sendOk();
          return;
        }
        if (choice === '2') {
          session.step = 'tax_profile_intro_explain';
          await session.save();
          await reply(
            'A tax profile is basically your financial identity for tax purposes. 🗂️\n\n' +
            'It tells us things like how you earn money, where you live, and what reliefs you qualify for — so we can calculate your taxes correctly and help you file with confidence.\n\n' +
            'You only set it up once. After that, you just update your numbers monthly or yearly.\n\n' +
            '1️⃣ Got it — let\'s set it up\n' +
            '0️⃣ Back to Main Menu'
          );
          sendOk();
          return;
        }
        if (choice === '0') {
          session.step = 'done';
          session.taxProfileData = {};
          await session.save();
          await reply('Okay — taking you back to the main menu. Say *Hi Taxable* or *Menu* if you don\'t see it.');
          sendOk();
          return;
        }
        await reply('Please reply with 1, 2, or 0.');
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_intro_explain') {
        const choice = String(text || '').trim();
        if (choice === '1') {
          session.step = 'tax_profile_year';
          await session.save();
          await reply(
            'STEP 1 — Tax Year\n' +
            'Which tax year are you filing for?\n\n' +
            '1️⃣ 2025 (January – December 2025)\n' +
            '2️⃣ 2026 (January – December 2026)'
          );
          sendOk();
          return;
        }
        if (choice === '0') {
          session.step = 'done';
          session.taxProfileData = {};
          await session.save();
          await reply('Okay — taking you back to the main menu. Say *Hi Taxable* or *Menu* if you don\'t see it.');
          sendOk();
          return;
        }
        await reply('Please reply with 1 or 0.');
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_year') {
        try {
          const choice = String(text || '').trim();
          let y = null;
          if (choice === '1') y = 2025;
          if (choice === '2') y = 2026;
          if (!y) {
            await reply('Please reply with 1 or 2 for the tax year.\n\n1️⃣ 2025 (January – December 2025)\n2️⃣ 2026 (January – December 2026)');
            sendOk();
            return;
          }
          td.year = y;
          session.taxProfileData = td;
          if (td.editReturnToSummary && currentProfile) {
            // #region agent log
            fetch('http://127.0.0.1:7402/ingest/8841f111-e782-4862-acaa-8f2e41540d3f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'23342d'},body:JSON.stringify({sessionId:'23342d',runId:'pre-fix',hypothesisId:'H3',location:'controllers/whatsappWebhookController.js:tax_profile_year:editReturnToSummary',message:'About to return to summary from tax year step',data:{step:session.step,hasCurrentProfile:!!currentProfile,editReturnToSummary:!!td.editReturnToSummary,year:td.year},timestamp:Date.now()})}).catch(()=>{});
            // #endregion
            await returnToSummaryAndSend();
            sendOk();
            return;
          }
          // If we already have prior info (e.g. NIN/state) from a previous year, ask if the user wants to keep it.
          try {
            const prev = await TaxableProfile.findOne({
              user: userForTax._id,
              profileType: 'Individual',
              year: { $lt: y }
            })
              .sort({ year: -1, updatedAt: -1 })
              .select('primaryNIN state year')
              .lean();
            if (prev?.primaryNIN && !td.nin) td.prevNin = prev.primaryNIN;
            if (prev?.state && !td.state) td.prevState = prev.state;
          } catch (e) {
                await WhatsAppErrorLogger.logGenericError(e, {
      errorType: 'database',
      severity: 'medium',
      context: 'prev profile lookup failed:',
      loggedFrom: 'whatsapp_webhook'
    });
    console.error('[WhatsApp] prev profile lookup failed:', e.message);
          }

          if (td.prevNin && !td.nin) {
            session.step = 'tax_profile_nin_keep';
            await session.save();
            const masked = String(td.prevNin).slice(-3).padStart(11, '•');
            await reply(
              'STEP 2 — Tax ID (NIN)\n' +
              'We found your NIN from your previous profile (' + masked + ').\n\n' +
              'Do you want to use the same NIN for this tax year?\n\n' +
              '1️⃣ Yes, use it\n' +
              '2️⃣ No, enter a new one'
            );
          } else {
            session.step = 'tax_profile_nin';
            await session.save();
            await reply(
              'STEP 2 — Tax ID (NIN)\n' +
              'What is your *NIN* (National Identification Number)?\n' +
              'Your NIN is your Tax ID for individual filers in Nigeria. It\'s required to file your taxes with the relevant authority.\n\n' +
              '🔒 This is encrypted and never shared with third parties.\n\n' +
              '✏️ Type your 11-digit NIN and send.'
            );
          }
          sendOk();
          return;
        } catch (e) {
              await WhatsAppErrorLogger.logGenericError(e, {
      errorType: 'unknown',
      severity: 'medium',
      context: 'tax_profile_year error:',
      loggedFrom: 'whatsapp_webhook'
    });
    console.error('[WhatsApp] tax_profile_year error:', e?.message || e, e?.stack);
          await reply("Something went wrong while setting your tax year. Please reply 1 or 2 again, or say *Hi* to restart." + BACK_TO_MENU_FOOTER);
          sendOk();
          return;
        }
      }

      if (session.step === 'tax_profile_nin_keep') {
        const choice = String(text || '').trim();
        if (choice === '1') {
          td.nin = td.prevNin;
          session.taxProfileData = td;
          session.step = 'tax_profile_income';
          await session.save();
          const incomeList = INCOME_SOURCE_OPTIONS.map((label, i) => `${i + 1}. ${label}`).join('\n');
          await reply(
            'STEP 3 — Source of Income\n' +
            'How do you earn your income?\n' +
            'Select *all that apply* — send the numbers separated by commas.\n\n' +
            'Example: 1, 3\n\n' +
            incomeList +
            '\n'
          );
          sendOk();
          return;
        }
        if (choice === '2') {
          session.step = 'tax_profile_nin';
          session.taxProfileData = td;
          await session.save();
          await reply(
            'STEP 2 — Tax ID (NIN)\n' +
            'What is your *NIN* (National Identification Number)?\n\n' +
            '✏️ Type your 11-digit NIN and send.'
          );
          sendOk();
          return;
        }
        await reply('Please reply with 1 or 2.');
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_nin') {
        const nin = String(text).trim().replace(/\D/g, '');
        // #region agent log
        fetch('http://127.0.0.1:7402/ingest/8841f111-e782-4862-acaa-8f2e41540d3f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'23342d'},body:JSON.stringify({sessionId:'23342d',runId:'pre-fix',hypothesisId:'H2',location:'controllers/whatsappWebhookController.js:tax_profile_nin:parsed',message:'Parsed NIN from user input',data:{step:session.step,ninLength:nin.length,editReturnToSummary:!!td.editReturnToSummary,hasCurrentProfile:!!currentProfile},timestamp:Date.now()})}).catch(()=>{});
        // #endregion
        if (nin.length !== 11) {
          // #region agent log
          fetch('http://127.0.0.1:7402/ingest/8841f111-e782-4862-acaa-8f2e41540d3f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'23342d'},body:JSON.stringify({sessionId:'23342d',runId:'pre-fix',hypothesisId:'H2',location:'controllers/whatsappWebhookController.js:tax_profile_nin:invalid_length',message:'Rejected NIN due to invalid length',data:{step:session.step,ninLength:nin.length},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          await reply('A NIN should be exactly 11 digits with no spaces or letters. Please check and try again. ✏️');
          sendOk();
          return;
        }
        td.nin = nin;
        session.taxProfileData = td;
        if (td.editReturnToSummary && currentProfile) {
          // #region agent log
          fetch('http://127.0.0.1:7402/ingest/8841f111-e782-4862-acaa-8f2e41540d3f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'23342d'},body:JSON.stringify({sessionId:'23342d',runId:'pre-fix',hypothesisId:'H4',location:'controllers/whatsappWebhookController.js:tax_profile_nin:before_returnToSummary',message:'About to return to summary from NIN step',data:{step:session.step,hasCurrentProfile:!!currentProfile,editReturnToSummary:!!td.editReturnToSummary,ninLength:nin.length},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          await returnToSummaryAndSend();
          sendOk();
          return;
        }
        session.step = 'tax_profile_income';
        await session.save();
        const incomeList = INCOME_SOURCE_OPTIONS.map((label, i) => `${i + 1}. ${label}`).join('\n');
        await reply(
          'STEP 3 — Source of Income\n' +
          'How do you earn your income?\n' +
          'Select *all that apply* — send the numbers separated by commas.\n\n' +
          'Example: 1, 3\n\n' +
          incomeList +
          '\n'
        );
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_income') {
        const sources = parseIncomeSourceReply(text);
        if (!sources || sources.length === 0) {
          await reply('Reply with the number(s) for your income source(s), e.g. 1 or 1,3 or 1,2,3.\nExample: 1, 3');
          sendOk();
          return;
        }
        td.primaryIncomeSources = sources;
        // If they picked "Other", capture description before confirming
        if (sources.includes('Other')) {
          session.taxProfileData = td;
          session.step = 'tax_profile_income_other_desc';
          await session.save();
          await reply('Please briefly describe your other income source:\n\n✏️ Type and send.');
          sendOk();
          return;
        }
        session.taxProfileData = td;
        session.step = 'tax_profile_income_confirm';
        await session.save();
        const listed = td.primaryIncomeSources.map(s => `✅ ${s}`).join('\n');
        await reply(`Got it! You earn from:\n${listed}\n\nIs that correct?\n\n1️⃣ Yes, that's right\n2️⃣ No, let me change it`);
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_income_other_desc') {
        const desc = String(text || '').trim();
        if (!desc) {
          await reply('Please describe your other income source in a few words.');
          sendOk();
          return;
        }
        td.otherIncomeDescription = desc.slice(0, 500);
        session.taxProfileData = td;
        session.step = 'tax_profile_income_confirm';
        await session.save();
        const listed = td.primaryIncomeSources.map(s => (s === 'Other' ? `✅ Other — ${td.otherIncomeDescription}` : `✅ ${s}`)).join('\n');
        await reply(`Got it! You earn from:\n${listed}\n\nIs that correct?\n\n1️⃣ Yes, that's right\n2️⃣ No, let me change it`);
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_income_confirm') {
        const choice = String(text || '').trim();
        if (choice === '2') {
          // Restart STEP 3
          td.primaryIncomeSources = [];
          td.otherIncomeDescription = undefined;
          session.taxProfileData = td;
          session.step = 'tax_profile_income';
          await session.save();
          const incomeList = INCOME_SOURCE_OPTIONS.map((label, i) => `${i + 1}. ${label}`).join('\n');
          await reply(
            'No problem — let\'s update it.\n\n' +
            'How do you earn your income?\n' +
            'Select *all that apply* — send the numbers separated by commas.\n\n' +
            'Example: 1, 3\n\n' +
            incomeList
          );
          sendOk();
          return;
        }
        if (choice !== '1') {
          await reply('Please reply with 1 or 2.');
          sendOk();
          return;
        }
        session.taxProfileData = td;
        if (td.editReturnToSummary && currentProfile) {
          await returnToSummaryAndSend();
          sendOk();
          return;
        }
        // For future years (e.g. 2026+), ask filing preference BEFORE collecting amounts.
        // Monthly means they report month-by-month (starting with January).
        if (td.year && td.year > 2025 && !td.filingPreference) {
          session.step = 'tax_profile_filing_preference_early';
          await session.save();
          await reply(getFilingPreferenceMessage(td.year));
          sendOk();
          return;
        }
        // Ask for amount per income source (same order as primaryIncomeSources)
        td.incomeAmounts = [];
        td.incomeAmountIndex = 0;
        session.taxProfileData = td;
        session.step = 'tax_profile_income_amount';
        await session.save();
        const sources = td.primaryIncomeSources || [];
        const yearForPrompt = td.year || new Date().getFullYear();
        const monthName = td.filingPreference === 'monthly' ? 'January ' : '';
        const firstLabel = sources[0];
        await reply(
          `STEP 3B — Income amounts\n\n` +
          `How much did you earn from *${firstLabel}* in ${monthName}${yearForPrompt}?\n\n` +
          `Enter the amount in Naira (${td.filingPreference === 'monthly' ? 'for that month' : 'annual total'}).\nExample: 5000000 or 3,000,000`
        );
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_filing_preference_early') {
        const choice = String(text || '').trim();
        if (choice === '1') {
          td.filingPreference = 'monthly';
          td.periodMonth = td.periodMonth || 1; // start with January
        } else if (choice === '2') {
          td.filingPreference = 'annual';
          td.periodMonth = undefined;
        } else {
          await reply('Please reply with 1 (Monthly) or 2 (Annually).');
          sendOk();
          return;
        }
        // Continue to income amounts
        td.incomeAmounts = [];
        td.incomeAmountIndex = 0;
        session.taxProfileData = td;
        session.step = 'tax_profile_income_amount';
        await session.save();
        const sources = td.primaryIncomeSources || [];
        const yearForPrompt = td.year || new Date().getFullYear();
        const firstLabel = sources[0];
        const monthName = td.filingPreference === 'monthly' ? 'January ' : '';
        await reply(
          `STEP 3B — Income amounts\n\n` +
          `How much did you earn from *${firstLabel}* in ${monthName}${yearForPrompt}?\n\n` +
          `Enter the amount in Naira (${td.filingPreference === 'monthly' ? 'for that month' : 'annual total'}).`
        );
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_income_amount') {
        const amountRaw = String(text || '').replace(/[,₦\s]/g, '');
        const amount = parseFloat(amountRaw, 10);
        if (isNaN(amount) || amount < 0) {
          await reply('Please enter a valid amount in Naira (e.g. 5000000 or 3,000,000).');
          sendOk();
          return;
        }
        const sources = td.primaryIncomeSources || [];
        const idx = td.incomeAmountIndex ?? 0;
        if (!Array.isArray(td.incomeAmounts)) td.incomeAmounts = [];
        td.incomeAmounts.push(Math.round(amount));
        td.incomeAmountIndex = idx + 1;
        session.taxProfileData = td;
        if (idx + 1 < sources.length) {
          await session.save();
          const nextLabel = sources[idx + 1];
          const yearForPrompt = td.year || new Date().getFullYear();
          const monthName = td.filingPreference === 'monthly' ? 'January ' : '';
          await reply(
            `Got it — ₦${Number(amount).toLocaleString()} for ${sources[idx]}.\n\n` +
            `How much did you earn from *${nextLabel}* in ${monthName}${yearForPrompt}?\n\n` +
            `Enter the amount in Naira (${td.filingPreference === 'monthly' ? 'for that month' : 'annual total'}).`
          );
          sendOk();
          return;
        }
        await session.save();
        if (td.editReturnToSummary && currentProfile) {
          currentProfile.primaryIncomeSources = sources;
          await currentProfile.save();
          try {
            await syncIncomeSourcesFromAmounts(
              currentProfile._id,
              currentProfile.year,
              sources,
              td.incomeAmounts,
              td.otherIncomeDescription,
              { month: td.filingPreference === 'monthly' ? (td.periodMonth || 1) : undefined }
            );
          } catch (e) {
                await WhatsAppErrorLogger.logGenericError(e, {
      errorType: 'unknown',
      severity: 'medium',
      context: 'syncIncomeSources on edit:',
      loggedFrom: 'whatsapp_webhook'
    });
    console.error('[WhatsApp] syncIncomeSources on edit:', e.message);
          }
          await returnToSummaryAndSend();
          sendOk();
          return;
        }
        session.step = 'tax_profile_residency';
        await session.save();
        await reply(
          'STEP 4 — Tax Residency\n' +
          'Did you live in Nigeria for *183 days or more* during this tax year?\n' +
          'This determines whether you are a Nigerian tax resident — which affects how your income is taxed.\n\n' +
          '1️⃣ Yes — I lived in Nigeria for 183+ days\n' +
          '2️⃣ No — I spent significant time outside Nigeria'
        );
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_residency') {
        const choice = String(text || '').trim();
        if (choice === '1') {
          td.residency183Days = true;
          session.taxProfileData = td;
          if (td.editReturnToSummary && currentProfile) {
            await returnToSummaryAndSend();
            sendOk();
            return;
          }
          if (td.prevState && !td.state) {
            session.step = 'tax_profile_state_keep';
            await session.save();
            await reply(
              'STEP 5 — State of Residence\n' +
              'We found your state from your previous profile: *' + td.prevState + '*.\n\n' +
              'Do you want to use the same state?\n\n' +
              '1️⃣ Yes, use it\n' +
              '2️⃣ No, enter a new one'
            );
          } else {
            session.step = 'tax_profile_state';
            await session.save();
            await reply(
              'STEP 5 — State of Residence\n' +
              'Which state do you currently live in?\n' +
              'This tells us which tax authority to route your filing to.'
            );
          }
          sendOk();
          return;
        }
        if (choice === '2') {
          td.residency183Days = false;
          session.taxProfileData = td;
          if (td.editReturnToSummary && currentProfile) {
            await returnToSummaryAndSend();
            sendOk();
            return;
          }
          session.step = 'tax_profile_residency_nonresident_choice';
          await session.save();
          await reply(
            'Noted. Tax residency rules can be more complex when you\'ve spent time outside Nigeria.\n' +
            'We recommend speaking with one of our tax experts to make sure your profile is set up correctly.\n\n' +
            '1️⃣ Talk to a tax expert\n' +
            '2️⃣ Continue anyway'
          );
          sendOk();
          return;
        }
        await reply('Please reply with 1 or 2.');
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_residency_nonresident_choice') {
        const choice = String(text || '').trim();
        if (choice === '1') {
          // Flag for expert review via adminMetadata when profile is created later
          td.nonResidentNeedsExpertReview = true;
          session.taxProfileData = td;
          await session.save();
          await reply('Got it. A tax expert will review your profile before filing is approved. You can also reach support anytime if you have questions.');
        } else if (choice === '2') {
          td.nonResidentChoseToContinue = true;
          session.taxProfileData = td;
          await session.save();
        } else {
          await reply('Please reply with 1 or 2.');
          sendOk();
          return;
        }
        // In both cases, continue to State of Residence
        if (td.prevState && !td.state) {
          session.step = 'tax_profile_state_keep';
          await session.save();
          await reply(
            'STEP 5 — State of Residence\n' +
            'We found your state from your previous profile: *' + td.prevState + '*.\n\n' +
            'Do you want to use the same state?\n\n' +
            '1️⃣ Yes, use it\n' +
            '2️⃣ No, enter a new one'
          );
        } else {
          session.step = 'tax_profile_state';
          await session.save();
          await reply(
            'STEP 5 — State of Residence\n' +
            'Which state do you currently live in?\n' +
            'This tells us which tax authority to route your filing to.'
          );
        }
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_state_keep') {
        const choice = String(text || '').trim();
        if (choice === '1') {
          td.state = td.prevState;
          session.taxProfileData = td;
          session.step = 'tax_profile_rent';
          await session.save();
          await reply(`Got it — *${td.state}* ✅\n\nYour tax authority: *${td.state} Internal Revenue Service*`);
          await reply(
            'STEP 6 — Deductibles & Reliefs\n' +
            'Now let\'s capture your deductibles. These reduce your taxable income — so don\'t skip this part! 😊\n\n' +
            '6A — Rent\n' +
            'Do you pay rent?\n\n' +
            '1️⃣ Yes\n' +
            '2️⃣ No'
          );
          sendOk();
          return;
        }
        if (choice === '2') {
          session.step = 'tax_profile_state';
          await session.save();
          await reply(
            'STEP 5 — State of Residence\n' +
            'Which state do you currently live in?\n' +
            'This tells us which tax authority to route your filing to.'
          );
          sendOk();
          return;
        }
        await reply('Please reply with 1 or 2.');
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_state') {
        const stateInput = text.trim().slice(0, 100);
        if (!stateInput) {
          await reply('Please tell us which state you live in (e.g. Lagos, Abuja, Rivers).');
          sendOk();
          return;
        }
        td.state = stateInput;
        session.taxProfileData = td;
        if (td.editReturnToSummary && currentProfile) {
          await returnToSummaryAndSend();
          sendOk();
          return;
        }
        session.step = 'tax_profile_rent';
        await session.save();
        await reply(`Got it — *${stateInput}* ✅\n\nYour tax authority: *${stateInput} Internal Revenue Service*`);
        await reply(
          'STEP 6 — Deductibles & Reliefs\n' +
          'Now let\'s capture your deductibles. These reduce your taxable income — so don\'t skip this part! 😊\n\n' +
          '6A — Rent\n' +
          'Do you pay rent?\n\n' +
          '1️⃣ Yes\n' +
          '2️⃣ No'
        );
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_rent') {
        const choice = String(text || '').trim();
        if (choice === '1') {
          td.paysRent = true;
          session.taxProfileData = td;
          session.step = 'tax_profile_rent_amount';
          await session.save();
          await reply(
            'How much do you pay in rent *per year* (total annual rent)?\n\n' +
            '✏️ Type the amount in Naira — numbers only.\n' +
            'Example: 1200000 or 1,200,000'
          );
          sendOk();
          return;
        }
        if (choice === '2') {
          td.paysRent = false;
          td.rentAnnualAmount = undefined;
          td.rentMonthlyAmount = undefined;
          session.taxProfileData = td;
          if (td.editReturnToSummary && currentProfile) {
            await returnToSummaryAndSend();
            sendOk();
            return;
          }
          session.step = 'tax_profile_health';
          await session.save();
          await reply(
            '6B — Health Insurance\n' +
            'Do you pay for *private health insurance*?\n\n' +
            '(This does not include NHIS deducted from your salary — that\'s captured separately)\n\n' +
            '1️⃣ Yes\n' +
            '2️⃣ No'
          );
          sendOk();
          return;
        }
        await reply('Please reply with 1 or 2.');
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_rent_amount') {
        const parsed = parseAmount(text);
        if (!parsed.ok) {
          await reply('Please enter a valid amount in Naira (e.g. 1200000 or 1,200,000) for your *annual* rent.');
          sendOk();
          return;
        }
        const amount = parsed.value;
        const PLAUSIBLE_ANNUAL_RENT_MAX = 100000000; // 100M for annual rent
        if (amount > PLAUSIBLE_ANNUAL_RENT_MAX) {
          td._pendingConfirmAmountType = 'rent';
          td._pendingConfirmAmountValue = amount;
          session.taxProfileData = td;
          session.step = 'tax_profile_amount_confirm';
          await session.save();
          await reply(`Just to confirm — you entered ₦${amount.toLocaleString()} as your *annual* rent. Is that correct?\n\n1️⃣ Yes\n2️⃣ No, let me fix it`);
          sendOk();
          return;
        }
        td.rentAnnualAmount = amount;
        td.rentMonthlyAmount = Math.round(amount / 12);
        session.taxProfileData = td;
        if (td.editReturnToSummary && currentProfile) {
          await returnToSummaryAndSend();
          sendOk();
          return;
        }
        session.step = 'tax_profile_health';
        await session.save();
        await reply(
          '6B — Health Insurance\n' +
          'Do you pay for *private health insurance*?\n\n' +
          '(This does not include NHIS deducted from your salary — that\'s captured separately)\n\n' +
          '1️⃣ Yes\n' +
          '2️⃣ No'
        );
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_health') {
        const choice = String(text || '').trim();
        if (choice === '1') {
          td.hasHealthInsurance = true;
          session.taxProfileData = td;
          session.step = 'tax_profile_health_amount';
          await session.save();
          await reply(
            'How much do you pay for health insurance *per month* (monthly amount)?\n\n' +
            '✏️ Type the amount in Naira — numbers only.\n' +
            'Example: 50000 or 50,000'
          );
          sendOk();
          return;
        }
        if (choice === '2') {
          td.hasHealthInsurance = false;
          td.healthInsuranceAnnualAmount = undefined;
          td.healthInsuranceMonthlyAmount = undefined;
          session.taxProfileData = td;
          if (td.editReturnToSummary && currentProfile) {
            await returnToSummaryAndSend();
            sendOk();
            return;
          }
          session.step = 'tax_profile_pension';
          await session.save();
          await reply(
            '6C — Pension\n' +
            'Do you contribute to a *pension plan*?\n\n' +
            '1️⃣ Yes — my employer deducts it from my salary\n' +
            '2️⃣ Yes — I contribute voluntarily\n' +
            '3️⃣ Both\n' +
            '4️⃣ No'
          );
          sendOk();
          return;
        }
        await reply('Please reply with 1 or 2.');
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_health_amount') {
        const parsed = parseAmount(text);
        if (!parsed.ok) {
          await reply('Please enter a valid amount in Naira (e.g. 85000 or 85,000).');
          sendOk();
          return;
        }
        const amount = parsed.value;
        if (amount > PLAUSIBLE_MONTHLY_MAX) {
          td._pendingConfirmAmountType = 'health';
          td._pendingConfirmAmountValue = amount;
          session.taxProfileData = td;
          session.step = 'tax_profile_amount_confirm';
          await session.save();
          await reply(`Just to confirm — you entered ₦${amount.toLocaleString()}. Is that correct?\n\n1️⃣ Yes\n2️⃣ No, let me fix it`);
          sendOk();
          return;
        }
        td.healthInsuranceMonthlyAmount = amount;
        td.healthInsuranceAnnualAmount = amount * 12;
        session.taxProfileData = td;
        if (td.editReturnToSummary && currentProfile) {
          await returnToSummaryAndSend();
          sendOk();
          return;
        }
        session.step = 'tax_profile_pension';
        await session.save();
        await reply(
          '6C — Pension\n' +
          'Do you contribute to a *pension plan*?\n\n' +
          '1️⃣ Yes — my employer deducts it from my salary\n' +
          '2️⃣ Yes — I contribute voluntarily\n' +
          '3️⃣ Both\n' +
          '4️⃣ No'
        );
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_pension') {
        const choice = String(text || '').trim();
        if (['1', '2', '3'].includes(choice)) {
          td.hasPension = true;
          session.taxProfileData = td;
          session.step = 'tax_profile_pension_amount';
          await session.save();
          await reply(
            'How much is contributed to your pension *per month* in total (monthly amount)?\n\n' +
            '✏️ Type the amount in Naira — numbers only.\n' +
            'Example: 50000 or 50,000'
          );
          sendOk();
          return;
        }
        if (choice === '4') {
          td.hasPension = false;
          td.pensionAnnualAmount = undefined;
          td.pensionMonthlyAmount = undefined;
          session.taxProfileData = td;
          if (td.editReturnToSummary && currentProfile) {
            await returnToSummaryAndSend();
            sendOk();
            return;
          }
          session.step = 'tax_profile_mortgage';
          await session.save();
          await reply(
            '6D — Mortgage\n' +
            'Do you pay a *mortgage*?\n\n' +
            '1️⃣ Yes\n' +
            '2️⃣ No'
          );
          sendOk();
          return;
        }
        await reply('Please reply with 1, 2, 3, or 4.');
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_pension_amount') {
        const parsed = parseAmount(text);
        if (!parsed.ok) {
          await reply('Please enter a valid amount in Naira (e.g. 85000 or 85,000).');
          sendOk();
          return;
        }
        const amount = parsed.value;
        if (amount > PLAUSIBLE_MONTHLY_MAX) {
          td._pendingConfirmAmountType = 'pension';
          td._pendingConfirmAmountValue = amount;
          session.taxProfileData = td;
          session.step = 'tax_profile_amount_confirm';
          await session.save();
          await reply(`Just to confirm — you entered ₦${amount.toLocaleString()}. Is that correct?\n\n1️⃣ Yes\n2️⃣ No, let me fix it`);
          sendOk();
          return;
        }
        td.pensionMonthlyAmount = amount;
        td.pensionAnnualAmount = amount * 12;
        session.taxProfileData = td;
        if (td.editReturnToSummary && currentProfile) {
          await returnToSummaryAndSend();
          sendOk();
          return;
        }
        session.step = 'tax_profile_mortgage';
        await session.save();
        await reply(
          '6D — Mortgage\n' +
          'Do you pay a *mortgage*?\n\n' +
          '1️⃣ Yes\n' +
          '2️⃣ No'
        );
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_mortgage') {
        const choice = String(text || '').trim();
        if (choice === '1') {
          td.paysMortgage = true;
          session.taxProfileData = td;
          session.step = 'tax_profile_mortgage_amount';
          await session.save();
          await reply(
            'How much is your mortgage repayment *per month* (monthly amount)?\n\n' +
            '✏️ Type the amount in Naira — numbers only.\n' +
            'Example: 100000 or 100,000'
          );
          sendOk();
          return;
        }
        if (choice === '2') {
          td.paysMortgage = false;
          td.mortgageAnnualAmount = undefined;
          td.mortgageMonthlyAmount = undefined;
          session.taxProfileData = td;
          session.step = 'tax_profile_filing_preference';
          await session.save();
          await reply(getFilingPreferenceMessage(td.year));
          sendOk();
          return;
        }
        await reply('Please reply with 1 or 2.');
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_mortgage_amount') {
        const parsed = parseAmount(text);
        if (!parsed.ok) {
          await reply('Please enter a valid amount in Naira (e.g. 85000 or 85,000).');
          sendOk();
          return;
        }
        const amount = parsed.value;
        if (amount > PLAUSIBLE_MONTHLY_MAX) {
          td._pendingConfirmAmountType = 'mortgage';
          td._pendingConfirmAmountValue = amount;
          session.taxProfileData = td;
          session.step = 'tax_profile_amount_confirm';
          await session.save();
          await reply(`Just to confirm — you entered ₦${amount.toLocaleString()}. Is that correct?\n\n1️⃣ Yes\n2️⃣ No, let me fix it`);
          sendOk();
          return;
        }
        td.mortgageMonthlyAmount = amount;
        td.mortgageAnnualAmount = amount * 12;
        session.taxProfileData = td;
        if (td.editReturnToSummary && currentProfile) {
          await returnToSummaryAndSend();
          sendOk();
          return;
        }
        session.step = 'tax_profile_filing_preference';
        await session.save();
        await reply(getFilingPreferenceMessage(td.year));
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_amount_confirm') {
        const choice = String(text || '').trim();
        const type = td._pendingConfirmAmountType;
        const value = td._pendingConfirmAmountValue;
        if (!type || typeof value !== 'number') {
          // Safety fallback: reset to rent step
          td._pendingConfirmAmountType = undefined;
          td._pendingConfirmAmountValue = undefined;
          session.taxProfileData = td;
          session.step = 'tax_profile_rent';
          await session.save();
          await reply("Let's try that again from rent. Do you pay rent?\n\n1️⃣ Yes\n2️⃣ No");
          sendOk();
          return;
        }
        if (choice === '2') {
          // Let them re-enter the amount for that field
          session.step =
            type === 'rent'
              ? 'tax_profile_rent_amount'
              : type === 'health'
              ? 'tax_profile_health_amount'
              : type === 'pension'
              ? 'tax_profile_pension_amount'
              : 'tax_profile_mortgage_amount';
          await session.save();
          const reenterMsg = type === 'rent'
            ? 'No problem — please enter your *annual* rent in Naira (numbers only).'
            : 'No problem — please enter the correct *monthly* amount in Naira (numbers only).';
          await reply(reenterMsg);
          sendOk();
          return;
        }
        if (choice !== '1') {
          await reply('Please reply with 1 or 2.');
          sendOk();
          return;
        }
        // Confirm and move forward based on which amount we were confirming (rent = annual, others = monthly)
        if (type === 'rent') { td.rentAnnualAmount = value; td.rentMonthlyAmount = Math.round(value / 12); }
        if (type === 'health') { td.healthInsuranceMonthlyAmount = value; td.healthInsuranceAnnualAmount = value * 12; }
        if (type === 'pension') { td.pensionMonthlyAmount = value; td.pensionAnnualAmount = value * 12; }
        if (type === 'mortgage') { td.mortgageMonthlyAmount = value; td.mortgageAnnualAmount = value * 12; }
        td._pendingConfirmAmountType = undefined;
        td._pendingConfirmAmountValue = undefined;
        session.taxProfileData = td;

        if (type === 'rent') {
          session.step = 'tax_profile_health';
          await session.save();
          await reply(
            '6B — Health Insurance\n' +
            'Do you pay for *private health insurance*?\n\n' +
            '(This does not include NHIS deducted from your salary — that\'s captured separately)\n\n' +
            '1️⃣ Yes\n' +
            '2️⃣ No'
          );
          sendOk();
          return;
        }
        if (type === 'health') {
          session.step = 'tax_profile_pension';
          await session.save();
          await reply(
            '6C — Pension\n' +
            'Do you contribute to a *pension plan*?\n\n' +
            '1️⃣ Yes — my employer deducts it from my salary\n' +
            '2️⃣ Yes — I contribute voluntarily\n' +
            '3️⃣ Both\n' +
            '4️⃣ No'
          );
          sendOk();
          return;
        }
        if (type === 'pension') {
          session.step = 'tax_profile_mortgage';
          await session.save();
          await reply(
            '6D — Mortgage\n' +
            'Do you pay a *mortgage*?\n\n' +
            '1️⃣ Yes\n' +
            '2️⃣ No'
          );
          sendOk();
          return;
        }
        if (type === 'mortgage') {
          td.mortgageAnnualAmount = value;
          td.mortgageMonthlyAmount = value;
          session.taxProfileData = td;
          if (td.editReturnToSummary && currentProfile) {
            await returnToSummaryAndSend();
            sendOk();
            return;
          }
          session.step = 'tax_profile_filing_preference';
          await session.save();
          await reply(getFilingPreferenceMessage(td.year));
          sendOk();
          return;
        }
      }

      if (session.step === 'tax_profile_filing_preference') {
        const choice = String(text || '').trim();
        if (td.editReturnToSummary && currentProfile) {
          if (choice === '1') {
            td.filingPreference = 'monthly';
            session.taxProfileData = td;
            await returnToSummaryAndSend();
            sendOk();
            return;
          }
          if (choice === '2') {
            td.filingPreference = 'annual';
            session.taxProfileData = td;
            await returnToSummaryAndSend();
            sendOk();
            return;
          }
          await reply('Please reply with 1 (Monthly) or 2 (Annually).');
          sendOk();
          return;
        }
        // If we already captured filingPreference earlier (monthly vs annual), do not ask again here.
        // Proceed directly to profile creation after sending the preference confirmation message once.
        if (td.filingPreference === 'monthly') {
          await reply(
            'Great choice! 💪\n\n' +
            'Every month, we\'ll remind you to log your income, expenses, deductibles, and reliefs. We track everything in real time so filing at year end is just one tap.\n\n' +
            'You also get *1 month free* to try it out — no commitment.'
          );
        } else if (td.filingPreference === 'annual') {
          await reply(
            'No problem. When you\'re ready to file, come back and we\'ll walk you through everything at once.\n\n' +
            'Just know you can switch to monthly tracking anytime. 😊'
          );
        } else {
          // Fall through to normal prompt handling below (will set td.filingPreference).
        }
        const is2025OnlyAnnual = td.year === 2025;
        if (is2025OnlyAnnual) {
          if (choice !== '1') {
            await reply(
              'For tax year 2025, the year has already passed — we only support *annual* documentation. Reply *1* to continue with Annual.'
            );
            sendOk();
            return;
          }
          td.filingPreference = 'annual';
          session.taxProfileData = td;
          await session.save();
          await reply(
            'For 2025 we\'ll capture everything for the full year when you file. You can file your 2025 return now — the deadline is *31 March 2026*. We\'re here to help you file whenever you\'re ready.\n\n' +
            'Just know you can switch to monthly tracking for future years anytime. 😊'
          );
        } else if (td.filingPreference === 'monthly' || td.filingPreference === 'annual') {
          // Already chosen earlier — skip re-prompt and proceed.
        } else if (choice === '1') {
          td.filingPreference = 'monthly';
          session.taxProfileData = td;
          await session.save();
          await reply(
            'Great choice! 💪\n\n' +
            'Every month, we\'ll remind you to log your income, expenses, deductibles, and reliefs. We track everything in real time so filing at year end is just one tap.\n\n' +
            'You also get *1 month free* to try it out — no commitment.'
          );
        } else if (choice === '2') {
          td.filingPreference = 'annual';
          session.taxProfileData = td;
          await session.save();
          await reply(
            'No problem. When you\'re ready to file, come back and we\'ll walk you through everything at once. We will send a reminder on the 7th of December for you to prepare to file your annual tax for the 1st of January, 2027.\n\n' +
            'Just know you can switch to monthly tracking anytime. 😊'
          );
        } else {
          await reply('Please reply with 1 (Monthly) or 2 (Annually).');
          sendOk();
          return;
        }

        // Now create/update the TaxableProfile record
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
          await reply(`You already have a tax profile for ${year}.\n\n1️⃣ View my existing profile\n2️⃣ Edit it\n3️⃣ Talk to support`);
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
            rentAnnualAmount: td.rentAnnualAmount ?? td.rentMonthlyAmount,
            rentMonthlyAmount: td.rentMonthlyAmount,
            hasHealthInsurance,
            healthInsuranceAnnualAmount: td.healthInsuranceAnnualAmount ?? td.healthInsuranceMonthlyAmount,
            healthInsuranceMonthlyAmount: td.healthInsuranceMonthlyAmount,
            hasPension,
            pensionAnnualAmount: td.pensionAnnualAmount ?? td.pensionMonthlyAmount,
            pensionMonthlyAmount: td.pensionMonthlyAmount,
            paysMortgage,
            mortgageAnnualAmount: td.mortgageAnnualAmount ?? td.mortgageMonthlyAmount,
            mortgageMonthlyAmount: td.mortgageMonthlyAmount,
            filingPreference: td.filingPreference,
            state: td.state || undefined,
            adminMetadata: {
              ...(td.nonResidentNeedsExpertReview ? { nonResidentNeedsExpertReview: true } : {}),
              ...(td.nonResidentChoseToContinue ? { nonResidentChoseToContinue: true } : {})
            }
          });
        } catch (err) {
    // #region agent log
    fetch('http://127.0.0.1:7402/ingest/8841f111-e782-4862-acaa-8f2e41540d3f',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'23342d'},body:JSON.stringify({sessionId:'23342d',runId:'pre-fix',hypothesisId:'H1',location:'controllers/whatsappWebhookController.js:handleWebhook:catch',message:'Webhook handler fell into top-level catch',data:{errorName:err?.name||null,errorMessage:err?.message||String(err),errorStackTop:String(err?.stack||'').split('\\n').slice(0,3).join(' | ')},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    // Log unhandled error
    await WhatsAppErrorLogger.logGenericError(err, {
      errorType: 'unknown',
      severity: 'high',
      context: 'webhook_main_handler',
      loggedFrom: 'whatsapp_webhook',
      isUnhandled: true
    });
    console.error('[WhatsApp] webhook error:', err.message || err);
    try {
      await sendTextMessage(from, "Oops! Something went wrong. Try again or say *Hi Taxable* to start fresh — we're here to help! 💬" + BACK_TO_MENU_FOOTER);
    } catch (e) {
          await WhatsAppErrorLogger.logGenericError(e, {
      errorType: 'unknown',
      severity: 'medium',
      context: 'failed to send error reply:',
      loggedFrom: 'whatsapp_webhook'
    });
    console.error('[WhatsApp] failed to send error reply:', e.message);
    }
    if (!res.headersSent) res.status(200).send('OK');
  }
};

module.exports = {
  verifyWebhook,
  handleWebhook
};
