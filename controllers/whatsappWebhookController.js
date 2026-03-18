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
  SUBSCRIPTION_REQUIRED,
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
  BACK_TO_MENU_FOOTER,
  WATCH_VIDEO_THUMBNAIL_URL,
  WATCH_VIDEO_CAPTION
} = require('../constants/whatsappPrompts');
const { generateCompleteBreakdown } = require('../utils/breakdownCalculator');
const { performFileTax } = require('./profileController');
const { downloadMedia } = require('../services/whatsappService');
const { createDocumentFromBuffer } = require('./documentController');
const { createUploadSessionForUser } = require('./uploadController');

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

  if (!hasBreakdownData) {
    // No income/deduction data at all – just estimate deductibles, leave tax blank
    estDeductions = estimateDeductiblesFromProfile(profile, td);
    chargeable = null;
    annualTax = null;
  } else if (estIncome > 0 && estDeductions === 0 && hasProfileReliefs) {
    // We have income but no stored deductions, while profile has relief info:
    // estimate deductions and recompute tax so the user sees a more realistic position.
    estDeductions = estimateDeductiblesFromProfile(profile, td);
    const estimatedChargeable = Math.max(estIncome - estDeductions, 0);
    chargeable = estimatedChargeable;
    if (estimatedChargeable > 0) {
      const taxEst = estimateTaxFromAnnualIncome(estimatedChargeable);
      annualTax = taxEst.totalTax;
    } else {
      annualTax = 0;
    }
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
    await sendTypingIndicator(message.id).catch((e) => console.error('[WhatsApp] Typing indicator error:', e.message));
  }

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
              console.error('[WhatsApp] getLoggedInMainMenu breakdown error:', e.message);
            }

            await reply(getLoggedInMainMenu(userForMenu.firstName, year, hasSub, menuOpts));
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
          await reply(FIRST_WELCOME_MESSAGE);
          session = await WhatsAppSession.findOneAndUpdate(
            { waId: from },
            { $set: { step: 'welcome_choice', updatedAt: new Date() } },
            { upsert: true, new: true }
          );
        }
      } catch (e) {
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
      'tax_profile_subscription_later'
    ];
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
        if (nin.length !== 11) {
          await reply('A NIN should be exactly 11 digits with no spaces or letters. Please check and try again. ✏️');
          sendOk();
          return;
        }
        td.nin = nin;
        session.taxProfileData = td;
        if (td.editReturnToSummary && currentProfile) {
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
        if (Array.isArray(td.incomeAmounts) && td.incomeAmounts.length === primaryIncomeSources.length) {
          try {
            await syncIncomeSourcesFromAmounts(
              createdProfile._id,
              year,
              primaryIncomeSources,
              td.incomeAmounts,
              td.otherIncomeDescription,
              { month: td.filingPreference === 'monthly' ? (td.periodMonth || 1) : undefined }
            );
          } catch (e) {
            console.error('[WhatsApp] syncIncomeSources on create:', e.message);
          }
        }
        td.currentProfileId = createdProfile.profileId;
        session.taxProfileData = td;
        session.step = 'tax_profile_summary_confirm';
        await session.save();
        let breakdown = null;
        try {
          breakdown = await generateCompleteBreakdown(createdProfile._id, year);
        } catch (e) {
          console.error('[WhatsApp] Step 8 breakdown error:', e.message);
        }
        const summaryMsg = await getTaxProfileSummaryForStep8(userForTax.firstName, createdProfile, td, breakdown);
        await reply(summaryMsg);
        sendOk();
        return;
      }

      const pid = td.currentProfileId;
      let currentProfile = pid ? await TaxableProfile.findByProfileIdOrId(pid, userForTax._id) : null;
      // If we're at summary confirm but profile lookup failed (e.g. session from before currentProfileId), use latest profile for user+year
      if (!currentProfile && td.year != null) {
        currentProfile = await TaxableProfile.findOne({ user: userForTax._id, year: td.year }).sort({ createdAt: -1 }).limit(1).exec();
      }

      const returnToSummaryAndSend = async () => {
        if (!currentProfile) return;
        if (td.year !== undefined) currentProfile.year = td.year;
        if (td.nin) currentProfile.primaryNIN = td.nin;
        if (td.primaryIncomeSources?.length) currentProfile.primaryIncomeSources = td.primaryIncomeSources;
        if (td.residency183Days !== undefined) currentProfile.residency183Days = td.residency183Days;
        if (td.state) currentProfile.state = td.state;
        if (td.paysRent !== undefined) currentProfile.paysRent = td.paysRent;
        if (td.rentAnnualAmount !== undefined) currentProfile.rentAnnualAmount = td.rentAnnualAmount;
        if (td.rentMonthlyAmount !== undefined) currentProfile.rentMonthlyAmount = td.rentMonthlyAmount;
        if (td.hasHealthInsurance !== undefined) currentProfile.hasHealthInsurance = td.hasHealthInsurance;
        if (td.healthInsuranceAnnualAmount !== undefined) currentProfile.healthInsuranceAnnualAmount = td.healthInsuranceAnnualAmount;
        if (td.healthInsuranceMonthlyAmount !== undefined) currentProfile.healthInsuranceMonthlyAmount = td.healthInsuranceMonthlyAmount;
        if (td.hasPension !== undefined) currentProfile.hasPension = td.hasPension;
        if (td.pensionAnnualAmount !== undefined) currentProfile.pensionAnnualAmount = td.pensionAnnualAmount;
        if (td.pensionMonthlyAmount !== undefined) currentProfile.pensionMonthlyAmount = td.pensionMonthlyAmount;
        if (td.paysMortgage !== undefined) currentProfile.paysMortgage = td.paysMortgage;
        if (td.mortgageAnnualAmount !== undefined) currentProfile.mortgageAnnualAmount = td.mortgageAnnualAmount;
        if (td.mortgageMonthlyAmount !== undefined) currentProfile.mortgageMonthlyAmount = td.mortgageMonthlyAmount;
        if (td.filingPreference) currentProfile.filingPreference = td.filingPreference;
        await currentProfile.save();
        td.editReturnToSummary = false;
        session.taxProfileData = td;
        session.step = 'tax_profile_summary_confirm';
        await session.save();
        let b = null;
        try { b = await generateCompleteBreakdown(currentProfile._id, currentProfile.year); } catch (e) {}
        const msg = await getTaxProfileSummaryForStep8(userForTax.firstName, currentProfile, td, b);
        await reply(msg);
      };

      if (session.step === 'tax_profile_summary_confirm') {
        const choice = String(text || '').trim();
        if (choice === '1') {
          const isAnnual = (td.filingPreference || currentProfile?.filingPreference) === 'annual' || td.year === 2025;
          if (isAnnual && currentProfile) {
            // Best-effort profile + session update; even if these fail we still move user into final steps
            try {
              await TaxableProfile.updateOne(
                { _id: currentProfile._id },
                { $set: { status: 'active', filingStatus: 'pending_upload', updatedAt: new Date() } }
              );
            } catch (err) {
              console.error('[WhatsApp] summary_confirm annual updateOne error:', err.message || err, err.stack);
            }
            session.step = 'tax_profile_final_steps';
            session.taxProfileData = td;
            try {
              await session.save();
            } catch (err) {
              console.error('[WhatsApp] summary_confirm annual session.save error:', err.message || err, err.stack);
            }
            const yearLabel = td.year || currentProfile.year || new Date().getFullYear();
            await reply(
              'Next steps to file your ' + yearLabel + ' taxes:\n\n' +
              '*First:* Upload your documents (bank statements and relief documents). You must do this before you can book an accountant or file.\n\n' +
              '1️⃣ *Get my upload link* — We\'ll send you a link to upload. Do this first.\n\n' +
              'After you\'ve uploaded your documents, you can:\n' +
              '2️⃣ *Book an accountant to review* (Recommended) — ₦30,000\n' +
              '3️⃣ *I\'m ready to file* — Pay ₦25,000 to file your ' + yearLabel + ' return\n\n' +
              'Reply with *1* to get your upload link.'
            );
            sendOk();
            return;
          }
          session.step = 'tax_profile_subscription';
          session.taxProfileData = td;
          await session.save();
          const isMonthly = (td.filingPreference || currentProfile?.filingPreference) === 'monthly';
          if (isMonthly) {
            await reply(
              'Your tax profile is ready to save. 🎉\n\n' +
              "To keep your profile, track your records monthly, and file your taxes — you'll need a Taxable plan.\n\n" +
              "Here's the good news: *your first month is completely free.* No payment needed today.\n\n" +
              '💳 *Monthly Plan*\n' +
              '₦4,000/month — cancel anytime\n' +
              '✅ Monthly income & expense tracking\n' +
              '✅ Real-time tax position\n' +
              '✅ Year-end filing included\n' +
              '✅ Bank account integration\n' +
              '✅ Tax expert support\n\n' +
              '1️⃣ Start my free month — save my profile\n' +
              '2️⃣ See more plan details\n' +
              '3️⃣ I\'ll subscribe later (profile won\'t be saved after trial ends)'
            );
          } else {
            await reply(
              'Your tax profile is ready to save. 🎉\n\n' +
              "To keep your profile and file your taxes — you'll need a Taxable plan.\n\n" +
              '💳 *Annual Plan*\n' +
              '₦30,000/year — one payment, full year access\n' +
              '✅ Full year tax documentation\n' +
              '✅ Accurate PIT calculation\n' +
              '✅ Year-end filing included\n' +
              '✅ Bank account integration\n' +
              '✅ Tax expert support\n\n' +
              '1️⃣ Subscribe and save my profile\n' +
              '2️⃣ See more plan details\n' +
              '3️⃣ I\'ll subscribe later (profile won\'t be saved after one month)'
            );
          }
          sendOk();
          return;
        }
        if (choice === '2') {
          session.step = 'tax_profile_edit_choice';
          session.taxProfileData = td;
          await session.save();
          await reply(
            'Which part would you like to update?\n\n' +
            '1️⃣ Tax Year\n' +
            '2️⃣ NIN / Tax ID\n' +
            '3️⃣ Income Sources\n' +
            '4️⃣ Tax Residency\n' +
            '5️⃣ State of Residence\n' +
            '6️⃣ Deductibles & Reliefs\n' +
            '7️⃣ Filing Preference'
          );
          sendOk();
          return;
        }
        await reply('Please reply with 1 or 2.');
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_edit_choice') {
        const choice = String(text || '').trim();
        const stepMap = {
          '1': 'tax_profile_year',
          '2': 'tax_profile_nin',
          '3': 'tax_profile_income',
          '4': 'tax_profile_residency',
          '5': 'tax_profile_state',
          '6': 'tax_profile_rent',
          '7': 'tax_profile_filing_preference'
        };
        const nextStep = stepMap[choice];
        if (!nextStep) {
          await reply('Please reply with a number from 1 to 7.');
          sendOk();
          return;
        }
        td.editReturnToSummary = true;
        session.taxProfileData = td;
        session.step = nextStep;
        await session.save();
        if (nextStep === 'tax_profile_year') {
          await reply('Which tax year are you filing for?\n\n1️⃣ 2025 (January – December 2025)\n2️⃣ 2026 (January – December 2026)');
        } else if (nextStep === 'tax_profile_nin') {
          await reply('What is your *NIN* (National Identification Number)? Type your 11-digit NIN and send.');
        } else if (nextStep === 'tax_profile_income') {
          td.incomeAmounts = undefined;
          td.incomeAmountIndex = undefined;
          session.taxProfileData = td;
          const incomeList = INCOME_SOURCE_OPTIONS.map((label, i) => `${i + 1}. ${label}`).join('\n');
          await reply('How do you earn your income? Select all that apply — send numbers separated by commas.\nExample: 1, 3\n\n' + incomeList);
        } else if (nextStep === 'tax_profile_residency') {
          await reply('Did you live in Nigeria for *183 days or more* during this tax year?\n\n1️⃣ Yes — I lived in Nigeria for 183+ days\n2️⃣ No — I spent significant time outside Nigeria');
        } else if (nextStep === 'tax_profile_state') {
          await reply('Which state do you currently live in?');
        } else if (nextStep === 'tax_profile_rent') {
          await reply('6A — Rent\nDo you pay rent?\n\n1️⃣ Yes\n2️⃣ No');
        } else if (nextStep === 'tax_profile_filing_preference') {
          await reply(getFilingPreferenceMessage(td.year));
        }
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_final_steps') {
        const choice = String(text || '').trim();
        const yearLabel = td.year || currentProfile?.year || new Date().getFullYear();
        const uploadLinkSent = td.finalStepsUploadLinkSent === true;
        if (choice === '1') {
          try {
            const { uploadUrl } = await createUploadSessionForUser(userForTax._id, currentProfile._id, yearLabel);
            td.finalStepsUploadLinkSent = true;
            session.taxProfileData = td;
            await session.save();
            await reply(
              '📎 Use this link to upload your documents (bank statements and relief documents):\n\n' + uploadUrl + '\n\n' +
              'After you\'ve uploaded your documents, you can:\n\n' +
              '2️⃣ *Book an accountant to review* (₦30,000 — recommended)\n' +
              '3️⃣ *I\'m ready to file* (₦25,000)\n\n' +
              'Reply with 2 or 3 when you\'re done uploading.'
            );
          } catch (e) {
            console.error('[WhatsApp] createUploadSession in final_steps:', e.message);
            await reply("We couldn't generate the upload link right now. Please try again in a moment.");
          }
          sendOk();
          return;
        }
        if (choice === '2' || choice === '3') {
          if (!uploadLinkSent) {
            await reply(
              'Please upload your documents first. Reply *1* to get your upload link — then you can book an accountant or file.'
            );
            sendOk();
            return;
          }
        }
        if (choice === '2') {
          try {
            // Require documents for all reliefs before booking accountant review
            const deductions = await Deduction.find({ profileId: currentProfile._id, 'period.year': yearLabel })
              .select('_id deductionType')
              .lean();
            const withoutDoc = [];
            for (const d of deductions) {
              const count = await Document.countDocuments({ 'linkedTo.deductionId': d._id });
              if (count === 0) withoutDoc.push(d);
            }
            if (withoutDoc.length > 0) {
              const labels = withoutDoc.map(
                (d) => RELIEF_TYPES.find((r) => r.key === d.deductionType)?.label || d.deductionType
              );
              await reply(
                'Before you book an accountant review, each relief needs a supporting document.\n\n' +
                'Still missing documents for:\n• ' + labels.join('\n• ') + '\n\n' +
                'Open your upload link, add documents for these reliefs, then reply *2* again.'
              );
              sendOk();
              return;
            }

            // All documents present → mark upload_done and pending_accountant_payment
            await TaxableProfile.updateOne(
              { _id: currentProfile._id },
              { $set: { filingStatus: 'pending_accountant_payment', updatedAt: new Date() } }
            );

            const { authorization_url } = await createFilingPaymentLink(userForTax._id, currentProfile._id, 'accountant_review');
            await reply(
              'Almost there! Tap the link below to pay ₦30,000 for your accountant review:\n\n' + authorization_url + '\n\n' +
              'After payment, your status will be *Pending tax agent review*. We\'ll update you when the review is done — then you can file.\n\n' +
              'When you\'re done, reply *done* here and we\'ll show your latest status.'
            );
            // Track that the user has an in-progress filing payment for this profile,
            // so "Done" checks the filing status instead of subscription payments.
            session.step = 'filing_payment_pending';
            session.taxProfileData = {
              ...(session.taxProfileData || {}),
              filingProfileId: currentProfile._id,
              filingPaymentType: 'accountant_review'
            };
            await session.save();
          } catch (e) {
            console.error('[WhatsApp] createFilingPaymentLink accountant:', e.message);
            await reply("We couldn't generate the payment link. Please try again or say *menu* for options.");
          }
          sendOk();
          return;
        }
        if (choice === '3') {
          try {
            // Require documents for all reliefs before filing
            const deductions = await Deduction.find({ profileId: currentProfile._id, 'period.year': yearLabel })
              .select('_id deductionType')
              .lean();
            const withoutDoc = [];
            for (const d of deductions) {
              const count = await Document.countDocuments({ 'linkedTo.deductionId': d._id });
              if (count === 0) withoutDoc.push(d);
            }
            if (withoutDoc.length > 0) {
              const labels = withoutDoc.map(
                (d) => RELIEF_TYPES.find((r) => r.key === d.deductionType)?.label || d.deductionType
              );
              await reply(
                'Before you file, every relief needs a supporting document.\n\n' +
                'Still missing documents for:\n• ' + labels.join('\n• ') + '\n\n' +
                'Open your upload link, add documents for these reliefs, then reply *3* again.'
              );
              sendOk();
              return;
            }

            // All documents present → mark upload_done and pending_filing_payment
            await TaxableProfile.updateOne(
              { _id: currentProfile._id },
              { $set: { filingStatus: 'pending_filing_payment', updatedAt: new Date() } }
            );

            const { authorization_url } = await createFilingPaymentLink(userForTax._id, currentProfile._id, 'filing_fee');
            await reply(
              'Almost there! Tap the link below to pay ₦25,000 to file your ' + yearLabel + ' taxes:\n\n' + authorization_url + '\n\n' +
              'After payment, your return will move to *Filed* status once confirmed.\n\n' +
              'When you\'re done, reply *done* here and we\'ll show your latest status.'
            );
            // Track that the user has an in-progress filing payment for this profile,
            // so "Done" checks the filing status instead of subscription payments.
            session.step = 'filing_payment_pending';
            session.taxProfileData = {
              ...(session.taxProfileData || {}),
              filingProfileId: currentProfile._id,
              filingPaymentType: 'filing_fee'
            };
            await session.save();
          } catch (e) {
            console.error('[WhatsApp] createFilingPaymentLink filing:', e.message);
            await reply("We couldn't generate the payment link. Please try again or say *menu* for options.");
          }
          sendOk();
          return;
        }
        await reply(
          uploadLinkSent
            ? 'Please reply with 2 or 3 (accountant review or ready to file).'
            : 'Please reply with *1* to get your upload link first.'
        );
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_subscription') {
        const choice = String(text || '').trim();
        if (choice === '3') {
          session.step = 'tax_profile_subscription_later';
          session.taxProfileData = td;
          await session.save();
          await reply(
            "Got it — your profile details have been saved as a draft.\n\n" +
            "You can come back anytime to subscribe and activate it.\n" +
            "Just know that until you subscribe, your profile isn't active and we can't track or file your taxes.\n\n" +
            '1️⃣ Back to Main Menu'
          );
          sendOk();
          return;
        }
        if (choice === '2') {
          session.step = 'tax_profile_subscription_details';
          session.taxProfileData = td;
          await session.save();
          const isMonthly = (td.filingPreference || currentProfile?.filingPreference) === 'monthly';
          if (isMonthly) {
            await reply(
              '💳 *Taxable Monthly Plan — ₦4,000/month*\n\n' +
              "Here's everything that's included:\n" +
              '- Log income & expenses every month\n' +
              '- See your tax position in real time\n' +
              '- Auto-track via bank integration\n' +
              '- File your PIT at year end\n' +
              '- Access to tax expert support\n' +
              '- Cancel anytime — no lock-in\n\n' +
              '*First month is free.* Your card is only charged from month 2.\n\n' +
              '1️⃣ Start my free month\n' +
              '2️⃣ Go back'
            );
          } else {
            await reply(
              '💳 *Taxable Annual Plan — ₦30,000/year*\n\n' +
              "Here's everything that's included:\n" +
              '- One-time full year documentation\n' +
              '- Accurate PIT calculation\n' +
              '- File your taxes at year end\n' +
              '- Bank account integration\n' +
              '- Access to tax expert support\n\n' +
              'One payment. No monthly charges. No surprises.\n\n' +
              '1️⃣ Subscribe now\n' +
              '2️⃣ Go back'
            );
          }
          sendOk();
          return;
        }
        if (choice === '1') {
          const isMonthly = (td.filingPreference || currentProfile?.filingPreference) === 'monthly';
          try {
            const { authorization_url } = await createSubscriptionLinkForUser(userForTax._id, isMonthly ? 'monthly' : 'yearly');
            if (authorization_url) {
              await reply(
                'Almost there! Tap the secure link below to complete your payment 👇\n\n' +
                `🔗 ${authorization_url}\n\n` +
                'Come back and send *DONE* once payment is complete.'
              );
              session.step = 'done';
              session.taxProfileData = {};
              await session.save();
            } else {
              await reply("We couldn't generate a payment link right now. Please try *Subscribe / Manage Plan* from the main menu or talk to support.");
            }
          } catch (e) {
            console.error('[WhatsApp] Subscription payment link error:', e.message);
            await reply("We couldn't generate a payment link right now. Please try again from the main menu or talk to support.");
          }
          sendOk();
          return;
        }
        await reply('Please reply with 1, 2, or 3.');
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_subscription_details') {
        const choice = String(text || '').trim();
        if (choice === '2') {
          session.step = 'tax_profile_subscription';
          session.taxProfileData = td;
          await session.save();
          const isMonthly = (td.filingPreference || currentProfile?.filingPreference) === 'monthly';
          if (isMonthly) {
            await reply('Your tax profile is ready to save. 🎉\n\n1️⃣ Start my free month — save my profile\n2️⃣ See more plan details\n3️⃣ I\'ll subscribe later (profile won\'t be saved after trial ends)');
          } else {
            await reply('Your tax profile is ready to save. 🎉\n\n1️⃣ Subscribe and save my profile\n2️⃣ See more plan details\n3️⃣ I\'ll subscribe later (profile won\'t be saved after one month)');
          }
          sendOk();
          return;
        }
        if (choice === '1') {
          const isMonthly = (td.filingPreference || currentProfile?.filingPreference) === 'monthly';
          try {
            const { authorization_url } = await createSubscriptionLinkForUser(userForTax._id, isMonthly ? 'monthly' : 'yearly');
            if (authorization_url) {
              await reply('Almost there! Tap the secure link below to complete your payment 👇\n\n🔗 ' + authorization_url + '\n\nCome back and send *DONE* once payment is complete.');
              session.step = 'done';
              session.taxProfileData = {};
              await session.save();
            } else {
              await reply("We couldn't generate a payment link. Try from main menu or talk to support.");
            }
          } catch (e) {
            console.error('[WhatsApp] Subscription link error:', e.message);
            await reply("We couldn't generate a payment link. Try again or talk to support.");
          }
          sendOk();
          return;
        }
        await reply('Please reply with 1 or 2.');
        sendOk();
        return;
      }

      if (session.step === 'tax_profile_subscription_later') {
        const choice = String(text || '').trim();
        if (choice === '1') {
          session.step = 'done';
          session.taxProfileData = {};
          await session.save();
          const menu = await getLoggedInMainMenu(userForTax.firstName, td.year || new Date().getFullYear(), false);
          await reply(menu);
        } else {
          await reply('Reply 1 to go back to Main Menu.');
        }
        sendOk();
        return;
      }

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
        const alreadyHaveState = !!(td.state && String(td.state).trim());
        if (alreadyHaveState) {
          session.step = 'tax_profile_income_info';
          await session.save();
          if (currentProfile && !currentProfile.state) {
            currentProfile.state = td.state;
            await currentProfile.save();
          }
          let monoLinkState;
          try {
            monoLinkState = await getMonoConnectLinkForUser(userForTax._id, currentProfile?.profileId);
          } catch (e) {
            console.error('[WhatsApp] tax_profile_city→income Mono link error:', e.message);
            monoLinkState = null;
          }
          console.log('[Mono] tax_profile_city → income (state already set)', { waId: from });
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

    // —— Main menu numeric shortcuts (must be numbers) ——
    // When the user is at the main menu (step=done), always treat:
    // 1 = tax summary, 2 = tax profile, 3 = file.
    if (regUser && session?.step === 'done') {
      const choice = String(text || '').trim();
      if (choice === '1') {
        // Same behavior as "View tax summary"
        const hasSub = await safeHasActiveSubscription(regUser._id);
        if (!hasSub) {
          await reply(SUBSCRIPTION_REQUIRED);
          sendOk();
          return;
        }
        const latestProfile = await TaxableProfile.findOne({ user: regUser._id }).sort({ year: -1 }).select('_id year profileId').lean();
        if (!latestProfile) {
          await reply("You don't have a tax profile yet. Reply *2* to create one.");
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
          let msg = `Here's your *${latestProfile.year}* tax summary (based on your income and reliefs):\n\n`;
          msg += `*Income snapshot*\n• Total income detected: ₦${Number(totalIncome).toLocaleString()}\n• Period: Jan–Dec ${latestProfile.year} (or current-to-date)\n\n`;
          msg += `*Reliefs applied*\n• Total reliefs & deductions: ₦${Number(totalDeductions).toLocaleString()}\n\n`;
          msg += `*Estimated tax due*\n• Estimated PAYE/Tax payable: ₦${Number(taxPayable).toLocaleString()}\n\n`;
          msg += `*Filing costs*\n• Filing service fee: ₦${feePlaceholder.toLocaleString()}\n• Estimated tax to pay government: ₦${Number(taxPayable).toLocaleString()}\n• *Total today: ₦${Number(totalToday).toLocaleString()}*\n\n`;
          msg += `What would you like to do next?\n• Reply *3* to proceed to file\n• Reply *2* to create next year's profile${BACK_TO_MENU_FOOTER}`;
          await reply(msg);
        } catch (err) {
          console.error('[WhatsApp] Tax summary error:', err.message);
          await reply("We're still building your summary. Make sure your bank is connected and you've added reliefs, then try again. If it persists, contact support." + BACK_TO_MENU_FOOTER);
        }
        sendOk();
        return;
      }
      if (choice === '2') {
        // Create next-year tax profile (number-driven).
        // Since the menu already says "Create {year+1} tax profile", do NOT ask for year again.
        const draftProfile = await TaxableProfile.findOne({ user: regUser._id, status: 'draft' })
          .sort({ updatedAt: -1 })
          .select('profileId year primaryNIN primaryIncomeSources state paysRent rentAnnualAmount rentMonthlyAmount hasHealthInsurance healthInsuranceAnnualAmount healthInsuranceMonthlyAmount hasPension pensionAnnualAmount pensionMonthlyAmount paysMortgage mortgageAnnualAmount mortgageMonthlyAmount filingPreference residency183Days createdAt')
          .lean();
        if (draftProfile) {
          const draftDate = draftProfile.createdAt
            ? new Date(draftProfile.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })
            : 'a previous session';
          session = await WhatsAppSession.findOneAndUpdate(
            { waId: from },
            { $set: { step: 'tax_profile_draft_choice', taxProfileData: { _draftProfileId: draftProfile.profileId, year: draftProfile.year }, updatedAt: new Date() } },
            { upsert: true, new: true }
          );
          await reply(`You have an unfinished tax profile from ${draftDate}.\n\n1️⃣ Continue where I left off\n2️⃣ Start fresh`);
          sendOk();
          return;
        }
        const latestExisting = await TaxableProfile.findOne({ user: regUser._id }).sort({ year: -1 }).select('year').lean();
        const baseYear = latestExisting?.year || new Date().getFullYear();
        const nextYear = baseYear + 1;
        const taxProfileDataInitial = { year: nextYear };
        session = await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          // Jump straight to NIN step (or NIN reuse prompt) since year is already known.
          { $set: { step: 'tax_profile_nin', taxProfileData: taxProfileDataInitial, updatedAt: new Date() } },
          { upsert: true, new: true }
        );
        await reply(
          '📋 *Tax Profile Setup — ' + String(nextYear) + '*\n\n' +
          'STEP 2 — Tax ID (NIN)\n' +
          'What is your *NIN* (National Identification Number)?\n\n' +
          '✏️ Type your 11-digit NIN and send.'
        );
        sendOk();
        return;
      }
      if (choice === '3') {
        // If the latest profile is already filed, option 3 should not be actionable.
        const candidateProfiles = await TaxableProfile.find({ user: regUser._id })
          .sort({ updatedAt: -1 })
          .limit(20)
          .select('_id year filingStatus')
          .lean();
        const mostRecentWithStatus = candidateProfiles.find((p) => p.filingStatus != null);
        const latestByYear = [...candidateProfiles].sort((a, b) => (b.year || 0) - (a.year || 0))[0] || null;
        const latestProfile = mostRecentWithStatus || latestByYear;
        if (latestProfile?.filingStatus === 'filed') {
          await reply("You've already filed for " + String(latestProfile.year) + ". Reply 1 to view summary or 2 to create next year's profile." + BACK_TO_MENU_FOOTER);
          sendOk();
          return;
        }
        // Otherwise, allow normal file flow below (isProceedToFileIntent handles it).
      }
      // choice === '3' is already handled by isProceedToFileIntent (it matches /^3$/)
    }

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

    // —— "Done" / "Check again" after filing payments (accountant review / filing fee) ——
    if (
      regUser &&
      session?.step === 'filing_payment_pending' &&
      session?.taxProfileData?.filingProfileId &&
      isDoneOrCheckAgainIntent(text)
    ) {
      try {
        const profile = await TaxableProfile.findById(session.taxProfileData.filingProfileId)
          .select('year filingStatus')
          .lean();
        if (!profile) {
          await reply(
            "We couldn't find your latest filing status yet. If you've completed payment, please wait a minute and try *Done* again, or say *menu* for options."
          );
          sendOk();
          return;
        }

        const hasSub = await safeHasActiveSubscription(regUser._id);
        const year = profile.year || new Date().getFullYear();

        await reply("Here's your latest filing status:");
        await reply(
          getLoggedInMainMenu(regUser.firstName, year, hasSub, {
            filingStatus: profile.filingStatus
          })
        );

        // Reset session back to main menu after confirming filing payment status.
        await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          {
            $set: {
              step: 'done',
              'taxProfileData.filingProfileId': undefined,
              'taxProfileData.filingPaymentType': undefined,
              updatedAt: new Date()
            }
          },
          { upsert: true, new: true }
        );
      } catch (err) {
        console.error('[WhatsApp] filing payment Done handler error:', err.message);
        await reply(
          "We're still updating your filing status. If you've completed payment, wait a few seconds and reply *Done* again, or say *menu* for options."
        );
      }
      sendOk();
      return;
    }

    // —— Subscription flow (PDF): Done / Check again → verify subscription payment ——
    // IMPORTANT: Only handle here when the user is actually in a subscription-related context (no filingProfileId in session).
    if (regUser && !session?.taxProfileData?.filingProfileId && isDoneOrCheckAgainIntent(text)) {
      try {
        const result = await verifyPendingSubscriptionForUser(regUser._id);
        if (result.verified) {
          await reply(getPaymentConfirmedAfterProfile(regUser.firstName));
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

    // —— After "Review" summary: go back, or point to Tax profile for updates ——
    if (regUser && session?.step === 'review_profile_view') {
      const t = text.trim().toLowerCase();
      if (isBackToMainMenuIntent(text) || /^go\s*back\.?$/i.test(t) || /^back\.?$/i.test(t)) {
        await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          { $set: { step: 'done', updatedAt: new Date() } }
        );
        const menu = await getLoggedInMainMenu(regUser.firstName, new Date().getFullYear(), await safeHasActiveSubscription(regUser._id));
        await reply(menu);
        sendOk();
        return;
      }
      if (/change\s*income\s*sources/i.test(t) || /update\s*relief/i.test(t) || /update\s*nin/i.test(t)) {
        await reply("Reply *Tax profile* or *Update my tax profile* to change that." + BACK_TO_MENU_FOOTER);
        session = await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          { $set: { step: 'done', updatedAt: new Date() } },
          { new: true }
        );
        sendOk();
        return;
      }
      await reply("Reply *Go back* for the main menu, or *Tax profile* to update your details." + BACK_TO_MENU_FOOTER);
      sendOk();
      return;
    }

    // —— Locked actions: require active subscription (PDF 🔒) ——
    if (regUser && isReviewProfileIntent(text)) {
      const hasSub = await safeHasActiveSubscription(regUser._id);
      if (!hasSub) {
        await reply(SUBSCRIPTION_REQUIRED);
        sendOk();
        return;
      }
      const latestProfile = await TaxableProfile.findOne({ user: regUser._id })
        .sort({ year: -1 })
        .select('year primaryNIN primaryIncomeSources residency183Days paysRent hasPension hasHealthInsurance paysMortgage')
        .lean();
      if (!latestProfile) {
        await reply("You don't have a tax profile yet. Reply *Create tax profile* to set one up.");
        sendOk();
        return;
      }
      const summaryMsg = getReviewProfileSummaryMessage(latestProfile);
      if (summaryMsg) {
        await reply(summaryMsg);
        await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          { $set: { step: 'review_profile_view', updatedAt: new Date() } },
          { upsert: true }
        );
      } else {
        await reply("We couldn't load your profile summary. Reply *Tax profile* to update your details.");
      }
      sendOk();
      return;
    }

    if (regUser && isSetUpTaxProfileIntent(text)) {
      // PDF edge case: unfinished draft profile — "You have an unfinished tax profile from [date]. 1 Continue where I left off 2 Start fresh"
      const draftProfile = await TaxableProfile.findOne({ user: regUser._id, status: 'draft' }).sort({ updatedAt: -1 }).select('profileId year primaryNIN primaryIncomeSources state paysRent rentAnnualAmount rentMonthlyAmount hasHealthInsurance healthInsuranceAnnualAmount healthInsuranceMonthlyAmount hasPension pensionAnnualAmount pensionMonthlyAmount paysMortgage mortgageAnnualAmount mortgageMonthlyAmount filingPreference residency183Days createdAt').lean();
      if (draftProfile) {
        const draftDate = draftProfile.createdAt ? new Date(draftProfile.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' }) : 'a previous session';
        session = await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          { $set: { step: 'tax_profile_draft_choice', taxProfileData: { _draftProfileId: draftProfile.profileId, year: draftProfile.year }, updatedAt: new Date() } },
          { upsert: true, new: true }
        );
        await reply(`You have an unfinished tax profile from ${draftDate}.\n\n1️⃣ Continue where I left off\n2️⃣ Start fresh`);
        sendOk();
        return;
      }
      const existingProfile = await TaxableProfile.findOne({ user: regUser._id }).sort({ year: -1 }).select('year').lean();
      const initialYear = existingProfile?.year || new Date().getFullYear();
      const taxProfileDataInitial = { year: initialYear };
      session = await WhatsAppSession.findOneAndUpdate(
        { waId: from },
        { $set: { step: 'tax_profile_intro_choice', taxProfileData: taxProfileDataInitial, updatedAt: new Date() } },
        { upsert: true, new: true }
      );
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
        let msg = `Here's your *${latestProfile.year}* tax summary (based on your income and reliefs):\n\n`;
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

    // —— Upload documents (link to gettaxable.com/uploads) ——
    if (regUser && isUploadDocumentsIntent(text)) {
      const latestProfile = await TaxableProfile.findOne({ user: regUser._id }).sort({ year: -1 }).select('_id profileId year').lean();
      if (!latestProfile) {
        await reply("You don't have a tax profile yet. Reply *Create tax profile* first, then you can upload documents.");
        sendOk();
        return;
      }
      try {
        const { uploadUrl } = await createUploadSessionForUser(regUser._id, latestProfile._id, latestProfile.year);
        await reply(
          `📎 Use this link to upload your documents (bank statements and relief documents):\n\n${uploadUrl}\n\n` +
          "You can select your banks and upload statements, and add supporting documents for your reliefs. The link is valid for 7 days." +
          BACK_TO_MENU_FOOTER
        );
      } catch (err) {
        console.error('[WhatsApp] createUploadSession error:', err.message);
        await reply("We couldn't create an upload link right now. Please try again in a moment or use the dashboard: https://" + DASHBOARD_URL + BACK_TO_MENU_FOOTER);
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
        await reply(`Enter the *amount* in Naira for ${relief.label}${hint}.\n\nExample: 50000 or 50,000${BACK_TO_MENU_FOOTER}`);
        sendOk();
        return;
      }
      await reply("Reply with a number from 1 to 8, or *View added reliefs* or *Back*.");
      sendOk();
      return;
    }
    // relief_awaiting_document: wait for document or Skip / Back before showing relief menu again
    if (regUser && session?.step === 'relief_awaiting_document') {
      const t = text.trim().toLowerCase();
      if (/^back\.?$/i.test(t)) {
        await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          { $set: { step: 'done', 'taxProfileData.reliefProfileId': undefined, 'taxProfileData.reliefYear': undefined, 'taxProfileData.lastDeductionId': undefined, updatedAt: new Date() } }
        );
        const menu = await getLoggedInMainMenu(regUser.firstName, new Date().getFullYear(), await safeHasActiveSubscription(regUser._id));
        await reply(menu);
        sendOk();
        return;
      }
      if (/^skip\.?$/i.test(t)) {
        await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          { $set: { step: 'relief_menu', updatedAt: new Date() } }
        );
        const reliefList = RELIEF_TYPES.map((r) => `${r.num}. ${r.label}`).join('\n');
        await reply(`Choose a relief type:\n\n${reliefList}\n\nOr *View added reliefs* or *Back*.${BACK_TO_MENU_FOOTER}`);
        sendOk();
        return;
      }
      await reply("Reply *Skip* to add another relief later, or *Back* to menu.");
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
      // Accept amounts with or without commas (e.g. 3,000,000 or 3000000)
      const amount = parseFloat(String(text).replace(/[,₦\s]/g, ''), 10);
      if (isNaN(amount) || amount < 0) {
        await reply("Please enter a valid amount in Naira (e.g. 50000 or 3,000,000). Or reply *Back* to cancel.");
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
          { $set: { step: 'relief_awaiting_document', 'taxProfileData.selectedReliefType': undefined, 'taxProfileData.lastDeductionId': String(deduction._id), updatedAt: new Date() } }
        );
        const reliefLabel = RELIEF_TYPES.find((r) => r.key === deductionType)?.label || deductionType;
        let savedMsg;
        if (deductionType === 'rent_relief' && deduction.rentRelief?.annualRent != null) {
          const annualRent = Number(deduction.rentRelief.annualRent);
          const reliefApplied = Number(deduction.amount != null ? deduction.amount : 0);
          savedMsg = `Saved ✅ Rent relief: annual rent ₦${annualRent.toLocaleString()} — relief applied ₦${reliefApplied.toLocaleString()}.\n\nYou can *send a photo or document* here to attach to this relief, or use the dashboard: https://${DASHBOARD_URL}\n\nReply *Skip* to add another relief later, or *Back* to menu.`;
        } else {
          const displayAmount = deduction.amount != null ? deduction.amount : amount;
          savedMsg = `Saved ✅ ${reliefLabel}: ₦${Number(displayAmount).toLocaleString()}.\n\nYou can *send a photo or document* here to attach to this relief, or use the dashboard: https://${DASHBOARD_URL}\n\nReply *Skip* to add another relief later, or *Back* to menu.`;
        }
        await reply(savedMsg);
      } catch (err) {
        console.error('[WhatsApp] Relief save error:', err.message);
        await reply("Something went wrong saving that relief. Please try again or add it from the dashboard: https://" + DASHBOARD_URL);
      }
      sendOk();
      return;
    }

    // —— Proceed to file: branch on filingStatus (approve → payment link; filed → done; else → after approval) ——
    if (regUser && isProceedToFileIntent(text)) {
      // Filing does NOT require an active subscription.
      const hasSub = await safeHasActiveSubscription(regUser._id);
      const candidateProfiles = await TaxableProfile.find({ user: regUser._id })
        .sort({ updatedAt: -1 })
        .limit(20)
        .select('profileId year _id filingStatus')
        .lean();
      const mostRecentWithStatus = candidateProfiles.find((p) => p.filingStatus != null);
      const latestByYear = [...candidateProfiles].sort((a, b) => (b.year || 0) - (a.year || 0))[0] || null;
      const latestProfile = mostRecentWithStatus || latestByYear;

      if (!latestProfile) {
        await reply("You don't have a tax profile yet. Reply *Create tax profile* first.");
        sendOk();
        return;
      }

      const filingStatus = latestProfile.filingStatus || null;
      const yearLabel = String(latestProfile.year);

      if (filingStatus === 'filed') {
        const year = latestProfile.year || new Date().getFullYear();
        await reply("You've already filed your " + yearLabel + " tax return.");
        await reply(getLoggedInMainMenu(regUser.firstName, year, hasSub, { filingStatus: 'filed', filedForYear: year }));
        sendOk();
        return;
      }

      if (filingStatus !== 'tax_agent_approved' && filingStatus !== 'pending_filing_payment') {
        await reply("File your " + yearLabel + " tax return is available *after a tax agent approves* your profile. We'll notify you when it's ready." + BACK_TO_MENU_FOOTER);
        sendOk();
        return;
      }

      const deductions = await Deduction.find({ profileId: latestProfile._id, 'period.year': latestProfile.year }).select('_id deductionType').lean();
      const withoutDoc = [];
      for (const d of deductions) {
        const count = await Document.countDocuments({ 'linkedTo.deductionId': d._id });
        if (count === 0) withoutDoc.push(d);
      }
      if (withoutDoc.length > 0) {
        const labels = withoutDoc.map((d) => RELIEF_TYPES.find((r) => r.key === d.deductionType)?.label || d.deductionType);
        await reply(`Before filing, every relief needs a supporting document.\n\nStill missing documents for:\n• ${labels.join('\n• ')}\n\nAdd a relief, enter the amount, then send a photo or document for that relief. You can also *View added reliefs* and send documents for any relief.${BACK_TO_MENU_FOOTER}`);
        sendOk();
        return;
      }

      try {
        if (filingStatus === 'tax_agent_approved') {
          await TaxableProfile.updateOne(
            { _id: latestProfile._id },
            { $set: { filingStatus: 'pending_filing_payment', updatedAt: new Date() } }
          );
        }
        // Charge = computed tax payable + ₦25,000 filing fee
        const breakdown = await generateCompleteBreakdown(latestProfile._id, latestProfile.year);
        const s = breakdown?.summary || {};
        const taxPayable = s.finalTaxPayable ?? s.taxCalculated ?? 0;
        const totalNaira = Number(taxPayable) + 25000;
        const amountKoboOverride = Math.max(0, Math.round(totalNaira * 100));

        const { authorization_url } = await createFilingPaymentLink(regUser._id, latestProfile._id, 'filing_fee', amountKoboOverride);
        await reply(
          'Almost there! Tap the link below to pay *₦' + Number(totalNaira).toLocaleString() + '* to file your ' + yearLabel + ' taxes:\n\n' +
          authorization_url + '\n\n' +
          'This total includes:\n' +
          '• Filing fee: ₦25,000\n' +
          '• Estimated tax payable: ₦' + Number(taxPayable).toLocaleString() + '\n\n' +
          'After payment, your return will move to *Filed* status once confirmed.\n\n' +
          'When you\'re done, reply *done* here and we\'ll show your latest status.'
        );
        session = await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          {
            $set: {
              step: 'filing_payment_pending',
              taxProfileData: {
                ...(session?.taxProfileData || {}),
                filingProfileId: latestProfile._id,
                filingPaymentType: 'filing_fee'
              },
              updatedAt: new Date()
            }
          },
          { upsert: true, new: true }
        );
      } catch (e) {
        console.error('[WhatsApp] createFilingPaymentLink filing (file intent):', e.message);
        await reply("We couldn't generate the payment link right now. Please try again or say *menu* for options.");
      }
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
        await reply("We don't have your income on file yet. Set up your tax profile and enter your income by source (reply *Continue my filing* or *Tax profile*), then I can give you a PAYE estimate." + BACK_TO_MENU_FOOTER);
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
      console.log('[WhatsApp menu] Menu/Hi intent (registered user)', {
        waId: from,
        userId: regUser._id.toString()
      });
      const hasSub = await safeHasActiveSubscription(regUser._id);

      // Same selection logic as Get started: prefer most recently updated profile with filingStatus,
      // otherwise fall back to latest by year.
      const candidateProfiles = await TaxableProfile.find({ user: regUser._id })
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
      const mostRecentWithStatus = candidateProfiles.find((p) => p.filingStatus != null);
      const latestByYear = [...candidateProfiles].sort((a, b) => (b.year || 0) - (a.year || 0))[0] || null;
      const latestProfile = mostRecentWithStatus || latestByYear;

      const year = latestProfile?.year || new Date().getFullYear();
      if (latestProfile) {
        const menuOpts = {};
        if (latestProfile.filingStatus) menuOpts.filingStatus = latestProfile.filingStatus;
        if (latestProfile.filingStatus === 'filed') menuOpts.filedForYear = year;

        console.log('[WhatsApp menu] Resolved latestProfile for menu (menu/hi)', {
          waId: from,
          userId: regUser._id.toString(),
          profileCount: candidateProfiles.length,
          chosenProfileId: latestProfile?._id?.toString() || null,
          chosenYear: latestProfile?.year || null,
          chosenFilingStatus: latestProfile?.filingStatus || null
        });

        await reply(getLoggedInMainMenu(regUser.firstName, year, hasSub, menuOpts));

        // Ensure numeric shortcuts (1/2/3) work immediately after showing the menu.
        await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          { $set: { step: 'done', updatedAt: new Date() } },
          { upsert: true, new: true }
        );
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
      await reply(FIRST_WELCOME_MESSAGE);
      await WhatsAppSession.findOneAndUpdate({ waId: from }, { $set: { step: 'welcome_choice', updatedAt: new Date() } }, { upsert: true, new: true });
      sendOk();
      return;
    }
    const step = session.step;
    const data = session.registrationData || {};

    const REGISTRATION_STEPS = ['full_name', 'email', 'email_exists', 'phone_confirm', 'phone_input', 'password', 'otp'];
    if (REGISTRATION_STEPS.includes(step) && /^stop\.?$/i.test(text.trim())) {
      await WhatsAppSession.findOneAndUpdate(
        { waId: from },
        { $set: { step: 'create_account_paused', updatedAt: new Date() } }
      );
      await reply(CREATE_ACCOUNT_STOPPED);
      sendOk();
      return;
    }
    if (REGISTRATION_STEPS.includes(step) && isMenuOrHiIntent(text)) {
      await WhatsAppSession.findOneAndUpdate(
        { waId: from },
        { $set: { step: 'registration_menu_choice', 'registrationData.returnStep': step, updatedAt: new Date() } }
      );
      await reply(CREATE_ACCOUNT_MENU_MID_FLOW);
      sendOk();
      return;
    }
    if (step === 'registration_menu_choice') {
      const c = text.trim().toLowerCase();
      const returnStep = session.registrationData?.returnStep || 'full_name';
      if (c === '1') {
        session = await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          { $set: { step: returnStep, 'registrationData.returnStep': undefined, updatedAt: new Date() } },
          { new: true }
        );
        const rd = session.registrationData || {};
        if (returnStep === 'full_name') await reply(CREATE_ACCOUNT_FULL_NAME);
        else if (returnStep === 'email') await reply(getCreateAccountEmailPrompt(rd.firstName));
        else if (returnStep === 'email_exists') await reply(CREATE_ACCOUNT_EMAIL_EXISTS);
        else if (returnStep === 'phone_confirm') await reply(getCreateAccountPhoneConfirmPrompt(rd.firstName, waIdToPhone(from)));
        else if (returnStep === 'phone_input') await reply(CREATE_ACCOUNT_PHONE_INPUT);
        else if (returnStep === 'password') await reply(CREATE_ACCOUNT_PASSWORD_NEW);
        else if (returnStep === 'otp') await reply(`${rd.firstName || 'There'}, send us the *6-digit code* from your email, or reply *resend* if you didn't get it. 😊`);
        else await reply(CREATE_ACCOUNT_FULL_NAME);
        sendOk();
        return;
      }
      if (c === '2') {
        await WhatsAppSession.findOneAndUpdate(
          { waId: from },
          { $set: { step: 'welcome_choice', registrationData: {}, updatedAt: new Date() } }
        );
        await reply(FIRST_WELCOME_MESSAGE);
        sendOk();
        return;
      }
      await reply(CREATE_ACCOUNT_PICK_NUMBER);
      sendOk();
      return;
    }

    switch (step) {
      case 'full_name': {
        const full = text.trim();
        if (!full || /^\d+$/.test(full.replace(/\s/g, ''))) {
          await reply(CREATE_ACCOUNT_FULL_NAME_INVALID);
          sendOk();
          return;
        }
        const parts = full.split(/\s+/).filter(Boolean);
        data.firstName = parts[0] || full;
        data.lastName = parts.length > 1 ? parts.slice(1).join(' ') : parts[0] || '';
        session.registrationData = data;
        session.step = 'email';
        await session.save();
        await reply(getCreateAccountEmailPrompt(data.firstName));
        break;
      }
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
          await reply(CREATE_ACCOUNT_EMAIL_INVALID);
          sendOk();
          return;
        }
        const emailLower = text.trim().toLowerCase();
        const existingUser = await User.findOne({ email: emailLower }).select('_id').lean();
        if (existingUser) {
          session.registrationData = { ...data, email: emailLower };
          session.step = 'email_exists';
          await session.save();
          await reply(CREATE_ACCOUNT_EMAIL_EXISTS);
          sendOk();
          return;
        }
        data.email = emailLower;
        session.registrationData = data;
        session.step = 'phone_confirm';
        await session.save();
        await reply(getCreateAccountPhoneConfirmPrompt(data.firstName, waIdToPhone(from)));
        break;
      }
      case 'email_exists': {
        const e = text.trim().toLowerCase();
        if (e === '1') {
          session.step = 'login_email';
          session.registrationData = {};
          await session.save();
          await reply("What's the *email address* for your Taxable account?");
          sendOk();
          return;
        }
        if (e === '2') {
          session.step = 'email';
          session.registrationData = { ...data, email: undefined };
          await session.save();
          await reply(getCreateAccountEmailPrompt(data.firstName));
          sendOk();
          return;
        }
        if (e === '3') {
          await reply("You can reach us at support@gettaxable.com or reply *Talk to support* anytime." + BACK_TO_MENU_FOOTER);
          sendOk();
          return;
        }
        await reply(CREATE_ACCOUNT_PICK_NUMBER);
        sendOk();
        return;
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
          await reply(CREATE_ACCOUNT_PASSWORD_SAVED);
          await reply(`${data.firstName}, we've sent a 6-digit code to ${data.email}. Reply with the *code* to verify. Didn't get it? Just reply *resend* and we'll send it again.`);
        } catch (err) {
          if (err.code === 'EMAIL_EXISTS') {
            session.step = 'email_exists';
            session.registrationData = { ...data, email: data.email };
            await session.save();
            await reply(CREATE_ACCOUNT_EMAIL_EXISTS);
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
        session.step = 'account_created_choice';
        session.pendingUserId = undefined;
        await session.save();
        await reply(`✅ You're in, ${data.firstName}! Your email is verified. Your account is ready. 🎉`);
        await reply(getAccountCreatedFinalMessage(data.firstName));
        break;
      }
      case 'account_created_choice': {
        const c = text.trim().toLowerCase();
        const firstName = data.firstName || '';
        if (c === '1') {
          session.step = 'tax_profile_intro_choice';
          session.taxProfileData = session.taxProfileData || {};
          session.taxProfileData.year = session.taxProfileData.year || new Date().getFullYear();
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
        if (c === '2') {
          session.step = 'done';
          await session.save();
          await sendWatchVideoPreview();
          await reply(getPostVerificationWelcome(firstName));
          sendOk();
          return;
        }
        if (c === '3') {
          session.step = 'done';
          await session.save();
          await reply(SUBSCRIPTION_REQUIRED);
          sendOk();
          return;
        }
        if (c === '4') {
          session.step = 'done';
          await session.save();
          await reply(getPostVerificationWelcome(firstName));
          sendOk();
          return;
        }
        await reply(CREATE_ACCOUNT_PICK_NUMBER);
        sendOk();
        return;
      }
      case 'done': {
        try {
          const phoneForDone = waIdToPhone(from);
          const userDone = await User.findOne({ $or: [{ phone: phoneForDone }, { phone: phoneForDone.replace(/^0/, '234') }] }).select('_id firstName').lean();
          if (userDone) {
            const hasSubDone = await safeHasActiveSubscription(userDone._id);
            const candidateProfilesDone = await TaxableProfile.find({ user: userDone._id }).sort({ updatedAt: -1 }).limit(20).select('_id year filingStatus').lean();
            const mostRecentWithStatusDone = candidateProfilesDone.find((p) => p.filingStatus != null);
            const latestByYearDone = [...candidateProfilesDone].sort((a, b) => (b.year || 0) - (a.year || 0))[0] || null;
            const latestProfileDone = mostRecentWithStatusDone || latestByYearDone;
            const yearDone = latestProfileDone?.year || new Date().getFullYear();
            if (latestProfileDone) {
              const menuOptsDone = {};
              if (latestProfileDone.filingStatus) menuOptsDone.filingStatus = latestProfileDone.filingStatus;
              if (latestProfileDone.filingStatus === 'filed') menuOptsDone.filedForYear = yearDone;
              await reply(getLoggedInMainMenu(userDone.firstName, yearDone, hasSubDone, menuOptsDone));
            } else {
              await sendWatchVideoPreview();
              await reply(getPostVerificationWelcome(userDone.firstName));
            }
          } else {
            await reply(FIRST_WELCOME_MESSAGE);
            await WhatsAppSession.findOneAndUpdate({ waId: from }, { $set: { step: 'welcome_choice', updatedAt: new Date() } }, { upsert: true, new: true });
          }
        } catch (e) {
          console.error('[WhatsApp] case done error:', e.message);
          await reply(FIRST_WELCOME_MESSAGE);
          await WhatsAppSession.findOneAndUpdate({ waId: from }, { $set: { step: 'welcome_choice', updatedAt: new Date() } }, { upsert: true, new: true });
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
