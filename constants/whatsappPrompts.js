/**
 * Centralized WhatsApp prompts from TAXABLE WHATSAPP PROMPTS.pdf.
 * Use these for consistent copy and easy updates.
 */

// —— SHARED INTRO & MENU CONSTANT BLOCK (same for all users after greeting) ——
const TAXABLE_INTRO_LINE = `I'm Taxable — your personal tax assistant for everything Nigerian tax.`;

const WATCH_VIDEO_URL = 'https://www.youtube.com/watch?v=KSeupcEGVN4&t=82s&pp=ygUJdGF4c2xheWVy';

const MENU_CONSTANT_BLOCK = `Tax doesn't have to be confusing.
On Taxable, it's simple. Just 5 easy steps:
1️⃣ Create your account
2️⃣ Set up your tax profile
3️⃣ Connect your banks
4️⃣ Add your reliefs & deductibles
5️⃣ File your tax

That's it.
No guesswork. No overpaying. No missed deadlines.

📽 Watch how it works in 2 minutes:
${WATCH_VIDEO_URL}

📌 Quick updates you should know:
• Earn ₦800,000 or less? No PAYE.
• Rent relief: 20% (up to ₦500k).
• SMEs under ₦50m turnover? 100% CIT exemption.

🗓 Filing deadlines:
• Employers — Jan 31
• Individuals — Mar 31
Late filing attracts 10% penalty + interest.`;

// —— ENTRY (logged out user) ——
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

// —— ACCOUNT CREATION ——
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
• Go back`;

const SUBSCRIPTION_WHY_IT_MATTERS = `Tax isn't just about filing once.
It's about staying updated as your income changes, capturing new reliefs, and avoiding penalties.

The subscription keeps everything running automatically so you don't have to think about it.`;

// —— CHOOSE MONTHLY ——
function getPaymentLinkMessage(link) {
  return `Great choice 👍

Your monthly subscription is ₦4,000.
I'll generate a secure payment link for you now.

Please complete the payment using the link below:
🔗 ${link}

Once you're done, reply *Done* and I'll confirm your subscription.
Take your time — I'll be here.`;
}

// —— CHOOSE YEARLY (same pattern, different amount) ——
function getPaymentLinkMessageYearly(link) {
  return `Great choice 👍

Your yearly subscription is ₦30,000 (you save ₦18,000).
I'll generate a secure payment link for you now.

Please complete the payment using the link below:
🔗 ${link}

Once you're done, reply *Done* and I'll confirm your subscription.
Take your time — I'll be here.`;
}

// —— AFTER PAYMENT (webhook or Done verified) ——
const PAYMENT_CONFIRMED = `Payment confirmed ✅

Your subscription is now active.
You now have full access to:
• Create tax profile
• Connect banks
• File tax

Let's continue 👇`;

// —— User said Done but payment not found / not confirmed ——
const PAYMENT_NOT_CONFIRMED_YET = `I'm still waiting for confirmation.
If you've completed payment, give it a few seconds and reply *Check again*.
If you're having issues, I can help.`;

// —— User clicked link but didn't pay (after 10–15 min) ——
const PAYMENT_NOT_COMPLETED_RESEND = `It looks like the payment hasn't been completed yet.
Would you like me to resend the payment link?`;

// —— TAX PROFILE CREATION ——
function getTaxProfileIntro(firstName, year = 2025) {
  return `Alright ${firstName} — let's set up your ${year} tax profile.
This will take about 2 minutes.`;
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
You can connect more than one bank.`;

function getConnectBankLink(monoLink) {
  return `🔗 Connect a bank: ${monoLink}

When you're done, reply *Done*.`;
}

const CONNECT_BANK_SUCCESS = `Connected ✅`;

const CONNECT_ANOTHER_BANK = `Would you like to connect another bank?
• Yes — add another
• No — continue`;

// —— LOGGED-IN MAIN MENU (has profile; menu varies by subscription) ——
function getLoggedInMainMenu(firstName, year = 2025, hasActiveSubscription = false) {
  const menuBlock = hasActiveSubscription
    ? `Here's what you can do today:
• Review your ${year} tax profile
• Add reliefs & upload documents
• View tax summary
• File your ${year} tax return
• Manage connected banks
• Subscription details
• I don't understand tax — explain it
• FAQ
• Talk to support`
    : `Here's what you can do today:
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

  return `Hi ${firstName} 👋

${TAXABLE_INTRO_LINE}

${MENU_CONSTANT_BLOCK}

${menuBlock}`;
}

// —— FILING ——
const FILE_TAX_CONFIRM = `Before I file, please confirm:
1. Your information is accurate
2. Your relief documents are correct
3. You're ready to submit your 2025 return

Reply *CONFIRM* to file, or *Back* to review.`;

const FILE_TAX_SUBMITTED = `Submitted ✅

I'll update you once it's accepted, and you'll be able to download your filing receipt here.`;

module.exports = {
  ENTRY_MESSAGE,
  CURIOUS_MODE_REPLY,
  CREATE_ACCOUNT_INTRO,
  CREATE_ACCOUNT_FIRST_NAME,
  CREATE_ACCOUNT_LAST_NAME,
  CREATE_ACCOUNT_USE_WHATSAPP_NUMBER,
  CREATE_ACCOUNT_EMAIL,
  CREATE_ACCOUNT_PASSWORD,
  getPostVerificationWelcome,
  SUBSCRIPTION_REQUIRED,
  SUBSCRIPTION_WHY_IT_MATTERS,
  getPaymentLinkMessage,
  getPaymentLinkMessageYearly,
  PAYMENT_CONFIRMED,
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
  FILE_TAX_SUBMITTED
};
