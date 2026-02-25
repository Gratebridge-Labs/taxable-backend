# WhatsApp flows vs TAXABLE WHATSAPP PROMPTS.pdf

This checklist confirms alignment between the PDF and the backend/WhatsApp implementation.

## Full-flow alignment (intro → returning user → everything)

### No account / first contact (entry)
- **Get started / Hi Taxable** (no user): Reply is **ENTRY_MESSAGE** (PDF: 5 steps, "I don't understand tax", "Create an account", "Login", "FAQ", "Talk to someone").
- **Menu / Hi** in welcome: Reply is **ENTRY_MESSAGE**.
- **"I don't understand tax" / "Explain it" / Learn how tax works / Beginner**: Reply is **CURIOUS_MODE_REPLY** (PDF: income, reliefs, Create my account, I still have questions, FAQ, Talk to support).
- **FAQ / Talk to someone**: Reply points to support@gettaxable.com and options.

### Account creation (PDF: Create account → intro → Ready → step-by-step)
- **"Create an account"**: Reply is **CREATE_ACCOUNT_INTRO** ("Amazing... When you're ready, reply Ready and we'll begin."). Step set to `create_account_ready`.
- **"Ready"** (from create_account_ready): Reply is **CREATE_ACCOUNT_FIRST_NAME** ("Great. What's your first name?"), then step `first_name`.
- **Registration steps**: Each step uses PDF prompts — **CREATE_ACCOUNT_LAST_NAME**, **CREATE_ACCOUNT_EMAIL**, **CREATE_ACCOUNT_USE_WHATSAPP_NUMBER**, **CREATE_ACCOUNT_PASSWORD**.

### Post-verification / returning user menus
- **After login** (no profile): **getPostVerificationWelcome(firstName)** (PDF: 🔒 Create tax profile, Connect your banks, File your tax, Subscription plans, Learn how tax works, etc.).
- **After login** (has profile): **getLoggedInMainMenu(firstName, year, hasActiveSubscription)** (PDF: Review profile, Add reliefs, View tax summary, File, Manage banks if sub, Subscription plans, etc.).
- **After OTP verification**: **getPostVerificationWelcome(firstName)**.
- **Hi Taxable / menu** (returning user, no profile): **getPostVerificationWelcome(firstName)**.
- **Hi Taxable / menu** (returning user, has profile): **getLoggedInMainMenu(firstName, year, hasActiveSubscription)**.
- **Switch case 'done'**: Same logic — getPostVerificationWelcome or getLoggedInMainMenu by profile + subscription.

### Tax profile creation (PDF)
- **"Create tax profile"** (with subscription): **getTaxProfileIntro(firstName, year)** + "Reply I'm ready". If user has no existing profile, year = 2025 (not asked). If existing, we ask which year.
- **After "I'm ready"**: If no existing profile → go to NIN (**TAX_PROFILE_ASK_NIN**). If existing → ask year then NIN.

### Subscription (see below)
- Subscription placement, Choose monthly/yearly, Done/Check again, webhook, verify-done, expiry reminder, gating — all as in PDF.

## Fully aligned (subscription details)

| PDF section | Implementation |
|------------|----------------|
| **Subscription placement** | When user taps 🔒 action (Create tax profile, Connect banks, File tax / Continue filing), we show `SUBSCRIPTION_REQUIRED` (₦4k monthly, ₦30k yearly, Choose monthly/yearly, Learn why, Go back). |
| **Learn why subscription matters** | Reply uses `SUBSCRIPTION_WHY_IT_MATTERS`. |
| **Choose monthly** | Paystack init 400000 kobo, store reference + pending, send `getPaymentLinkMessage(link)` with “reply Done”. |
| **Choose yearly** | 3000000 kobo, `getPaymentLinkMessageYearly(link)`. |
| **Backend flow** | Paystack Initialize Transaction, metadata (user_id, plan), store reference, status = pending. |
| **After user pays – Webhook** | Verify signature, mark subscription active, set expiry (30/365 days), send subscription-active email. |
| **After user pays – User says Done** | `verifyPendingSubscriptionForUser()` → Paystack Verify API; if success, activate + email, then `PAYMENT_CONFIRMED` + unlocked menu. |
| **Done / Check again** | Same verify flow; if not confirmed we send “I’m still waiting… reply Check again”. |
| **Case 2 (pays but doesn’t return)** | Webhook activates silently; next time they open chat, subscription = active. |
| **Case 3 (webhook fails)** | Done → manual verify via Paystack Verify API. |
| **Case 4 (Expiry)** | Cron `GET /api/cron/subscription-expiry-reminders`; 3 days before `currentPeriodEnd` we send “Your subscription expires in 3 days. Renew now to avoid disruption.” |
| **Locked actions** | Create tax profile and Continue my filing require active subscription; otherwise we show subscription-required. |
| **Logged-in menu (with/without sub)** | `getLoggedInMainMenu(firstName, year, hasActiveSubscription)` shows 🔒 and options per PDF. |

## Prompts available (constants/whatsappPrompts.js)

All PDF messages are in `constants/whatsappPrompts.js`:

- Entry, Curious mode, Account creation (intro, first/last name, WhatsApp number, email, password)
- Post-verification welcome (with 🔒 and Subscription plans)
- Subscription required, Why it matters, Payment link (monthly/yearly), Payment confirmed, Not confirmed yet, Resend link
- Tax profile: intro, NIN, income sources 1–6, reliefs (rent, pension, NHF, life, health, mortgage), created, missing fields (DOB, street, city, state), complete
- Connect bank: intro, link, success, connect another
- Logged-in main menu, File confirm, File submitted

Subscription flow in the WhatsApp controller uses these prompts. Other flows (entry, curious, account creation, tax profile steps, bank connect) can be wired to use the same constants for full PDF wording.

## View tax summary & file (PDF)

- **View tax summary**: Intent `isViewTaxSummaryIntent`; subscription + profile; `generateCompleteBreakdown`; income snapshot, reliefs, estimated tax, fee, total; error message if build fails.
- **Proceed to file**: Intent `isProceedToFileIntent`; sends `FILE_TAX_CONFIRM`; step `filing_confirm` + `filingProfileId`.
- **CONFIRM**: `performFileTax` → `FILE_TAX_SUBMITTED` + main menu; Back → main menu. Email `sendFilingSubmittedEmail` after filing.

## Manage connected banks (PDF)

- **List**: Intent `isManageConnectedBanksIntent`; list MonoLink (linked) as 1. Bank 1 (****1234); step `manage_banks_list`.
- **View insights**: Reply 1–N in that step shows link incomeSnapshot.
- **Add**: Reply "Add" → new Mono link (max 5).
- **Remove**: Reply "Remove" → step `manage_banks_remove`; number → unlink. API: GET/POST `/api/mono/connections` and unlink.

## Add reliefs & documents (PDF)

- **Add reliefs**: Intent `isAddReliefsIntent`; relief menu 1–8 (NHF, NHIS, Pension, etc.); step `relief_menu` → `relief_amount`; amount → create Deduction; "Saved ✅" + dashboard link for documents.
- **View added reliefs**: Lists deductions for profile+year.
- **APIs**: POST/GET/PUT/DELETE `/api/deductions`; POST/GET/DELETE `/api/documents` (fileUrl + linkedTo.deductionId).

## Optional / not yet implemented

| PDF | Status |
|-----|--------|
| **Case 1 – Resend link after 10–15 min** | Message `PAYMENT_NOT_COMPLETED_RESEND` exists; no timer/session yet to send it after 10–15 min. Can be added later (e.g. cron or session-based). |
| **Entry message (exact PDF)** | No-account users get `getMessageNoAccount()` (similar: Create account, Login, Learn how tax works). PDF also has “I don’t understand tax”, “FAQ”, “Talk to someone”. To match exactly, use `ENTRY_MESSAGE` from prompts for first contact. |
| **Post-verification welcome (exact PDF)** | After email verify we send `getMessageNoProfile()` (menu without 🔒). PDF wants “Create tax profile 🔒, Connect your banks 🔒, File your tax 🔒, Subscription plans…”. Use `getPostVerificationWelcome(firstName)` after verification to match. |

## Summary

- **Subscription flow (placement, choose monthly/yearly, payment link, Done/Check again, webhook, verify-done, expiry reminder, gating)** is fully aligned with the document.
- **Copy** for that flow and for tax profile, bank, filing is centralized in `constants/whatsappPrompts.js`.
- Remaining gaps are optional: resend-link timer, and switching entry/post-verification to the exact PDF prompts where desired.
