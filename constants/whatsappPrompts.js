/**
 * Centralized WhatsApp prompts from TAXABLE WHATSAPP PROMPTS.pdf.
 * Use these for consistent copy and easy updates.
 */

// —— SHARED INTRO & MENU CONSTANT BLOCK (same for all users after greeting) ——
const TAXABLE_INTRO_LINE = `I'm Taxable — your personal tax assistant for everything Nigerian tax.`;

const WATCH_VIDEO_URL = 'https://www.youtube.com/watch?v=KSeupcEGVN4&t=82s&pp=ygUJdGF4c2xheWVy';
const WATCH_VIDEO_THUMBNAIL_URL = 'https://img.youtube.com/vi/KSeupcEGVN4/maxresdefault.jpg';
const WATCH_VIDEO_CAPTION = `📽 Watch how it works in 2 minutes:\n${WATCH_VIDEO_URL}`;

const MENU_CONSTANT_BLOCK = `Tax doesn't have to be confusing.
On Taxable, it's simple. Just 5 easy steps:
1️⃣ Create your account
2️⃣ Set up your tax profile
3️⃣ Connect your banks
4️⃣ Add your reliefs & deductibles
5️⃣ File your tax

That's it.
No guesswork. No overpaying. No missed deadlines.

📌 Quick updates you should know:
• Earn ₦800,000 or less? No PAYE.
• Rent relief: 20% (up to ₦500k).
• SMEs under ₦50m turnover? 100% CIT exemption.

🗓 Filing deadlines:
• Employers — Jan 31
• Individuals — Mar 31
Late filing attracts 10% penalty + interest.`;

/** Logged-in user: only individuals filing deadline (no 5 steps, no quick updates). */
const FILING_DEADLINE_INDIVIDUAL = `🗓 Filing deadline reminder:
• Individuals — Mar 31
Late filing attracts 10% penalty + interest.`;

// —— Footer for every message that isn't the main menu (logged-in or new user) ——
const BACK_TO_MENU_FOOTER = `

• *Back to menu* — return to your options`;

// —— FIRST WELCOME (brand new user — any first message) ——
const FIRST_WELCOME_MESSAGE = `👋 Hey! Welcome to Taxable.
Managing your taxes in Nigeria just got a lot easier — and I'm here to help you every step of the way.

Are you new here or do you already have an account?
1️⃣ I'm new — create my account
2️⃣ I already have an account

Reply with 1 or 2 to continue.`;

// —— ENTRY (legacy / fallback) ——
function getEntryMessage() {
  return `Hi 👋

${TAXABLE_INTRO_LINE}

${MENU_CONSTANT_BLOCK}

What would you like to do?
• I don't understand tax — explain it
• Create an account
• Login
• FAQ
• Talk to someone

Just reply with your choice 👇`;
}

const ENTRY_MESSAGE = getEntryMessage();

// —— CURIOUS MODE (education) ——
const CURIOUS_MODE_REPLY = `That's completely okay 🙂

Tax can sound complicated — but it's actually built on just two main things:

1️⃣ Your Income
How much money you earn — salary or business.

2️⃣ Your Reliefs & Deductions
Things that legally reduce the tax you pay.
For example:
● Pension
● NHF
● Rent relief
● Life insurance

Your tax is simply:
Income minus Reliefs = What you owe
That's the entire cycle.

On Taxable, we:
• Track your income
• Help you claim valid reliefs
• Keep everything in sync automatically
• File correctly when ready

You don't have to calculate anything yourself.

Ready to move forward?
• Create my account
• I still have questions
• FAQ
• Talk to support

• *Back to main menu* — return to your options above`;

// —— ACCOUNT CREATION (new user flow) ——
/** MESSAGE 2 — They pick 1 (New User Confirmation) */
const CREATE_ACCOUNT_CONFIRM = `Awesome! Let's get you set up. 🎉

It takes less than 3 minutes and you only need to do this once.

Ready?
1️⃣ Yes, let's go
2️⃣ Not right now`;

const CREATE_ACCOUNT_NOT_NOW = `No problem! Whenever you're ready, just send a message and we'll pick up right here. 👋`;

/** STEP 1 — Full Name */
const CREATE_ACCOUNT_FULL_NAME = `Great! Let's start with the basics.

What's your full name? (as written in your government IDs)

✏️ Type and send your full name below.`;

const CREATE_ACCOUNT_FULL_NAME_INVALID = `Hmm, that doesn't look like a name. 😅
Please type your full name — for example: *Chidi Okafor*`;

/** STEP 2 — Email (used with firstName) */
function getCreateAccountEmailPrompt(firstName) {
  return `Nice to meet you, ${firstName || 'there'}! 👋

What's your email address?
We'll use this to send you important updates and account information.

✏️ Type your email and send.`;
}
const CREATE_ACCOUNT_EMAIL_INVALID = `That email doesn't look right. Please check and try again.
Example: yourname@gmail.com`;
const CREATE_ACCOUNT_EMAIL_EXISTS = `It looks like this email already has a Taxable account.
1️⃣ Log in instead
2️⃣ Use a different email
3️⃣ Talk to support`;

/** STEP 3 — Phone (used with firstName, suggestedNumber) */
function getCreateAccountPhoneConfirmPrompt(firstName, suggestedNumber) {
  return `Almost there${firstName ? `, ${firstName}` : ''}!

Is *${suggestedNumber || 'this number'}* the best number to reach you on?

1️⃣ Yes, use this number
2️⃣ No, I have a different number`;
}
const CREATE_ACCOUNT_PHONE_INPUT = `No problem. What phone number should we use for your account?
✏️ Type your number below (e.g. 08012345678)`;

/** STEP 4 — Password (typed) */
const CREATE_ACCOUNT_PASSWORD_NEW = `Now let's secure your account. 🔒
You'll need a password to log in on the Taxable website.

✏️ Type your password below`;

const CREATE_ACCOUNT_PASSWORD_SAVED = `✅ Password saved! Your account is secure.`;

/** ACCOUNT CREATED — Final message (used with firstName) */
function getAccountCreatedFinalMessage(firstName) {
  return `🎉 Welcome to Taxable, ${firstName || 'there'}!

Your account is all set. Here's what people usually do first:
1️⃣ Set up my tax profile
2️⃣ See how Taxable works (short videos)
3️⃣ Subscribe to a plan
4️⃣ Go to the main menu`;
}

/** Scenarios */
const CREATE_ACCOUNT_PICK_NUMBER = `Please reply with one of the numbers above. 😊`;
const CREATE_ACCOUNT_MENU_MID_FLOW = `You're in the middle of setting up your account.
1️⃣ Continue setup
2️⃣ Exit to Main Menu (progress saved)`;
const CREATE_ACCOUNT_STOPPED = `Got it — we've paused your account setup. Your progress is saved. Come back anytime to continue. 👋`;

// —— Legacy (still used where needed) ——
const CREATE_ACCOUNT_INTRO = `Amazing 🙌

I'm glad you're getting started.
To create your account, I'll just need a few details:
• Your first and last name
• Your phone number (we can use this WhatsApp number if you'd like)
• An email address we can verify
• A password you'll remember

Nothing complicated.
When you're ready, reply *Ready* and we'll begin.`;

const CREATE_ACCOUNT_FIRST_NAME = `Great.
What's your first name?`;

const CREATE_ACCOUNT_LAST_NAME = `And your last name?`;

const CREATE_ACCOUNT_USE_WHATSAPP_NUMBER = `Would you like to use this WhatsApp number as your account number?
Reply Yes or send another number.`;

const CREATE_ACCOUNT_EMAIL = `What's your email address?`;

const CREATE_ACCOUNT_PASSWORD = `Now create a password.`;

// —— POST-VERIFICATION WELCOME (logged in, NO active subscription) ——
function getPostVerificationWelcome(firstName, year = 2025) {
  return `Hi ${firstName} 👋

${TAXABLE_INTRO_LINE}

${MENU_CONSTANT_BLOCK}

Here's what you can do today:
• Review your ${year} tax profile 🔒
• Add reliefs & upload documents 🔒
• File your ${year} tax return 🔒
• Subscription plans
• Learn how tax works
• Estimate my tax
• FAQ
• I don't understand tax — explain it
• Talk to support

🔒 = Requires active subscription`;
}

// —— SUBSCRIPTION PLACEMENT (when user taps locked action) ——
const SUBSCRIPTION_REQUIRED = `To unlock this feature, you'll need an active subscription.

Taxable runs year-round to:
• Stay synced with your financial activity
• Track changes automatically
• Store your tax records securely
• Send deadline reminders
• Keep you compliant all year

💳 ₦4,000 monthly
💳 ₦30,000 yearly
If you choose yearly, you save ₦18,000.
That's over 6 months free.
You can cancel anytime.

What would you like to do?
• Choose monthly
• Choose yearly (Best value)
• Learn why subscription matters
• Go back${BACK_TO_MENU_FOOTER}`;

const SUBSCRIPTION_WHY_IT_MATTERS = `Tax isn't just about filing once.
It's about staying updated as your income changes, capturing new reliefs, and avoiding penalties.

The subscription keeps everything running automatically so you don't have to think about it.${BACK_TO_MENU_FOOTER}`;

// —— CHOOSE MONTHLY ——
function getPaymentLinkMessage(link) {
  return `Great choice 👍

Your monthly subscription is ₦4,000.
I'll generate a secure payment link for you now.

Please complete the payment using the link below:
🔗 ${link}

Once you're done, reply *Done* and I'll confirm your subscription.
Take your time — I'll be here.${BACK_TO_MENU_FOOTER}`;
}

// —— CHOOSE YEARLY (same pattern, different amount) ——
function getPaymentLinkMessageYearly(link) {
  return `Great choice 👍

Your yearly subscription is ₦30,000 (you save ₦18,000).
I'll generate a secure payment link for you now.

Please complete the payment using the link below:
🔗 ${link}

Once you're done, reply *Done* and I'll confirm your subscription.
Take your time — I'll be here.${BACK_TO_MENU_FOOTER}`;
}

// —— AFTER PAYMENT (webhook or Done verified) ——
const PAYMENT_CONFIRMED = `Payment confirmed ✅

Your subscription is now active.
You now have full access to:
• Create tax profile
• Connect banks
• File tax

Let's continue 👇${BACK_TO_MENU_FOOTER}`;

/** PDF: After payment confirmed (e.g. from Tax Profile flow) — "You're in, [First Name]! Your tax profile is now active..." */
function getPaymentConfirmedAfterProfile(firstName) {
  return `🎉 You're in, ${firstName || 'there'}!

Your tax profile is now active. Here's what to do next:

1️⃣ Log this month's income & expenses
2️⃣ Connect my bank account
3️⃣ Watch how Taxable works (2 mins)
4️⃣ Go to Main Menu`;
}

// —— User said Done but payment not found / not confirmed ——
const PAYMENT_NOT_CONFIRMED_YET = `I'm still waiting for confirmation.
If you've completed payment, give it a few seconds and reply *Check again*.
If you're having issues, I can help.${BACK_TO_MENU_FOOTER}`;

// —— User clicked link but didn't pay (after 10–15 min) ——
const PAYMENT_NOT_COMPLETED_RESEND = `It looks like the payment hasn't been completed yet.
Would you like me to resend the payment link?${BACK_TO_MENU_FOOTER}`;

// —— TAX PROFILE CREATION ——
function getTaxProfileIntro(firstName, year = 2025) {
  return `Alright ${firstName} — let's set up your ${year} tax profile.
This will take about 2 minutes.${BACK_TO_MENU_FOOTER}`;
}

const TAX_PROFILE_ASK_NIN = `What's your NIN? (11 digits)`;

const TAX_PROFILE_INCOME_SOURCES = `What are your income sources? You can pick more than one.
Reply with numbers like: 1,3,5

1. Salary / Employment
2. Business / Self-employment
3. Freelance / Consulting
4. Investment income
5. Rental income
6. Digital assets / Crypto`;

const TAX_PROFILE_RELIEF_RENT = `Do you pay rent? (Yes/No)`;
const TAX_PROFILE_RELIEF_PENSION = `Do you contribute to a pension plan? (Yes/No)`;
const TAX_PROFILE_RELIEF_NHF = `Do you pay NHF? (Yes/No)`;
const TAX_PROFILE_RELIEF_LIFE_INSURANCE = `Do you have life insurance? (Yes/No)`;
const TAX_PROFILE_RELIEF_HEALTH_INSURANCE = `Do you pay for health insurance? (Yes/No)`;
const TAX_PROFILE_RELIEF_MORTGAGE = `Do you pay a mortgage? (Yes/No)`;

function getTaxProfileCreated(year = 2025) {
  return `Perfect — your ${year} tax profile is created ✅`;
}

const TAX_PROFILE_MISSING_FIELDS = `Quick one — to complete your profile, I still need:`;
const TAX_PROFILE_ASK_DOB = `What's your date of birth? (DD/MM/YYYY)`;
const TAX_PROFILE_ASK_STREET = `What's your street address?`;
const TAX_PROFILE_ASK_CITY = `Which city?`;
const TAX_PROFILE_ASK_STATE = `Which state?`;
const TAX_PROFILE_COMPLETE = `Great — your profile is now complete ✅`;

// —— CONNECT BANK (Mono) ——
const CONNECT_BANK_INTRO = `Next, let's connect your bank so I can keep your income in sync automatically.
You can connect more than one bank.${BACK_TO_MENU_FOOTER}`;

function getConnectBankLink(monoLink) {
  return `🔗 Connect a bank: ${monoLink}

When you're done, reply *Done*.${BACK_TO_MENU_FOOTER}`;
}

const CONNECT_BANK_SUCCESS = `Connected ✅`;

const CONNECT_ANOTHER_BANK = `Would you like to connect another bank?
• Yes — add another
• No — continue${BACK_TO_MENU_FOOTER}`;

// —— LOGGED-IN MAIN MENU (has profile) — compact status + snapshot + CTA to create new profile.
// options:
// - filedForYear?: number — when set, show "You have filed for X taxes."
// - filingStatus?: 'pending_upload' | 'upload_done' | 'pending_accountant_payment' | 'tax_agent_review' | 'tax_agent_approved' | 'pending_filing_payment' | 'filed'
// - filingSummary?: { estimatedAnnualIncome?: number, totalReliefs?: number, estimatedTax?: number }
function getLoggedInMainMenu(firstName, year = 2025, hasActiveSubscription = false, options = {}) {
  const filedLine = options && options.filedForYear
    ? `You have filed for *${options.filedForYear}* taxes.\n\n`
    : '';

  const filingStatus = options.filingStatus;
  const filingSummary = options.filingSummary || {};

  const statusLabel = (() => {
    switch (filingStatus) {
      case 'pending_upload':
        return 'Pending document upload';
      case 'upload_done':
        return 'Documents uploaded';
      case 'pending_accountant_payment':
        return 'Awaiting tax agent payment';
      case 'tax_agent_review':
        return 'Pending tax agent review';
      case 'tax_agent_approved':
        return 'Approved by tax agent — ready to file';
      case 'pending_filing_payment':
        return 'Awaiting filing payment';
      case 'filed':
        return 'Filed';
      default:
        return 'Not yet filed';
    }
  })();

  const fmt = (n) => (n != null && Number(n) >= 0 ? `₦${Number(n).toLocaleString()}` : '—');
  const income = filingSummary.estimatedAnnualIncome != null ? filingSummary.estimatedAnnualIncome : undefined;
  const totalReliefs = filingSummary.totalReliefs != null ? filingSummary.totalReliefs : undefined;
  const tax = filingSummary.estimatedTax != null ? filingSummary.estimatedTax : undefined;

  let msg = `Hi ${firstName} 👋

${filedLine}*Tax year:* ${year}
*Filing status:* ${statusLabel}
`;

  if (income != null || totalReliefs != null || tax != null) {
    msg += `\nBased on your current profile:\n`;
    if (income != null) msg += `• Estimated annual income: ${fmt(income)}\n`;
    if (totalReliefs != null) msg += `• Total reliefs (est.): ${fmt(totalReliefs)}\n`;
    if (tax != null) msg += `• Estimated annual tax: ${fmt(tax)}\n`;
  }

  msg += `\nWhat would you like to do next?\n`;
  msg += `1️⃣ View your ${year} tax summary — reply 1\n`;
  msg += `2️⃣ Create ${year + 1} tax profile — reply 2\n`;

  // Option 3: File taxes (hide once already filed)
  if (filingStatus === 'filed') {
    // no option 3
  } else if (filingStatus === 'tax_agent_approved' || filingStatus === 'pending_filing_payment') {
    msg += `3️⃣ File your ${year} tax return — reply 3\n`;
  } else {
    msg += `3️⃣ File your ${year} tax return — (available after tax agent approves)\n`;
  }

  return msg;
}

// —— FILING ——
const FILE_TAX_CONFIRM = `Before I file, please confirm:
1. Your information is accurate
2. Your relief documents are correct
3. You're ready to submit your 2025 return

Reply *CONFIRM* to file, or *Back* to review.${BACK_TO_MENU_FOOTER}`;

const FILE_TAX_SUBMITTED = `Submitted ✅

I'll update you once it's accepted, and you'll be able to download your filing receipt here.${BACK_TO_MENU_FOOTER}`;

module.exports = {
  FIRST_WELCOME_MESSAGE,
  ENTRY_MESSAGE,
  CURIOUS_MODE_REPLY,
  CREATE_ACCOUNT_INTRO,
  CREATE_ACCOUNT_CONFIRM,
  CREATE_ACCOUNT_NOT_NOW,
  CREATE_ACCOUNT_FULL_NAME,
  CREATE_ACCOUNT_FULL_NAME_INVALID,
  getCreateAccountEmailPrompt,
  CREATE_ACCOUNT_EMAIL_INVALID,
  CREATE_ACCOUNT_EMAIL_EXISTS,
  getCreateAccountPhoneConfirmPrompt,
  CREATE_ACCOUNT_PHONE_INPUT,
  CREATE_ACCOUNT_FIRST_NAME,
  CREATE_ACCOUNT_LAST_NAME,
  CREATE_ACCOUNT_USE_WHATSAPP_NUMBER,
  CREATE_ACCOUNT_EMAIL,
  CREATE_ACCOUNT_PASSWORD,
  CREATE_ACCOUNT_PASSWORD_NEW,
  CREATE_ACCOUNT_PASSWORD_SAVED,
  getAccountCreatedFinalMessage,
  CREATE_ACCOUNT_PICK_NUMBER,
  CREATE_ACCOUNT_MENU_MID_FLOW,
  CREATE_ACCOUNT_STOPPED,
  getPostVerificationWelcome,
  SUBSCRIPTION_REQUIRED,
  SUBSCRIPTION_WHY_IT_MATTERS,
  getPaymentLinkMessage,
  getPaymentLinkMessageYearly,
  PAYMENT_CONFIRMED,
  getPaymentConfirmedAfterProfile,
  PAYMENT_NOT_CONFIRMED_YET,
  PAYMENT_NOT_COMPLETED_RESEND,
  getTaxProfileIntro,
  TAX_PROFILE_ASK_NIN,
  TAX_PROFILE_INCOME_SOURCES,
  TAX_PROFILE_RELIEF_RENT,
  TAX_PROFILE_RELIEF_PENSION,
  TAX_PROFILE_RELIEF_NHF,
  TAX_PROFILE_RELIEF_LIFE_INSURANCE,
  TAX_PROFILE_RELIEF_HEALTH_INSURANCE,
  TAX_PROFILE_RELIEF_MORTGAGE,
  getTaxProfileCreated,
  TAX_PROFILE_MISSING_FIELDS,
  TAX_PROFILE_ASK_DOB,
  TAX_PROFILE_ASK_STREET,
  TAX_PROFILE_ASK_CITY,
  TAX_PROFILE_ASK_STATE,
  TAX_PROFILE_COMPLETE,
  CONNECT_BANK_INTRO,
  getConnectBankLink,
  CONNECT_BANK_SUCCESS,
  CONNECT_ANOTHER_BANK,
  getLoggedInMainMenu,
  FILE_TAX_CONFIRM,
  FILE_TAX_SUBMITTED,
  BACK_TO_MENU_FOOTER,
  WATCH_VIDEO_THUMBNAIL_URL,
  WATCH_VIDEO_CAPTION
};
