# WhatsApp conversation – bot responses (in flow order)

## 1. Get started / welcome

- **First time or “Hi Taxable” (main):**  
  `Welcome to *Taxable*! 🎉 We're here to make tax simple and stress-free. You can create an account or log in — we've got you. Let's get started by creating your account. First, what should we call you? *What's your first name?*`

- **Shorter welcome (alternate):**  
  `Welcome to *Taxable*! 🎉 We're here to make tax simple and stress-free. Let's get started by creating your account. *What's your first name?*`

- **Already registered:**  
  `You're already in! 🎉 Log in at the Taxable app or website with {email} — we can't wait to have you back.`

- **Restart mid-flow:**  
  `No worries! Let's start fresh. *What's your first name?*`

- **Default / no session:**  
  `Say *Hi Taxable* or *Get started* to create your account — we can't wait to meet you! 🎉`

---

## 2. First name

- **Valid:**  
  `Nice to meet you, {firstName}! 👋 *What's your last name?*`

- **Invalid:**  
  `We'd love to get your name right — just letters, 2–50 characters. Try again? 😊`

---

## 3. Last name

- **Valid:**  
  `Perfect! *What's your email address?* We'll use it to verify your account and keep you updated.`

- **Invalid:**  
  `Almost there — just letters for your last name, 2–50 characters. Try again?`

---

## 4. Email

- **Valid:**  
  `Great! *What's your phone number?* We have {suggestedPhone} from WhatsApp — reply with that or send a different number.`

- **Invalid:**  
  `That doesn't look like a valid email (e.g. name@example.com). Give it another go? 📧`

---

## 5. Phone

- **Valid:**  
  `Almost there! *Choose a password* — at least 8 characters, with one uppercase letter, one lowercase letter, and one number. We never show or repeat it in chat for your security. 🔒`

- **Invalid:**  
  `We need a valid Nigerian number (e.g. 08012345678 or +2348012345678). Try again? 📱`

---

## 6. Password

- **Valid (account created):**  
  1. `Got it! We've saved your password securely — we never show or repeat it in chat. 🔒`  
  2. `Account created! 🎉 We've sent a 6-digit code to {email}. Reply with the *code* to verify. Didn't get it? Just reply *resend* and we'll send it again.`

- **Invalid:**  
  `We need at least 8 characters, with one uppercase letter, one lowercase letter, and one number. Give it another go? 🔐`

- **Email already exists:**  
  `This email is already registered. Use a different email or log in on the Taxable app — we'd love to have you back! 😊`

- **Email send failed:**  
  `We couldn't send the verification email just now. Double-check your email and try again, or say *resend* later when we ask for your code. We're on it! 📧`

- **Other error:**  
  `Oops, something went wrong on our end. Please try again — or say *Hi Taxable* to start fresh. We're here to help! 💬`

---

## 7. OTP / verification code

- **User says “resend” (success):**  
  `No problem! We've sent a *new* 6-digit code to {email}. Check your inbox (and spam folder). Reply with the code when you get it. 📧`

- **User says “resend” (failure):**  
  `We couldn't send the code right now. Please check that your email is correct, or say *Hi Taxable* to start over. We're here to help! 💬`

- **Not a 6-digit code:**  
  `Send us the *6-digit code* from your email, or reply *resend* if you didn't get it. 😊`

- **Wrong/expired code:**  
  `That code doesn't look right or may have expired. Check the code in your email, or reply *resend* to get a new one. Need to start over? Say *Hi Taxable*. 😊`

- **Code already used:**  
  `You're all set! 🎉 That code was already used — just log in on the Taxable app or website. Welcome back!`

- **Code expired:**  
  `That code has expired. Reply *resend* to get a new code, or say *Hi Taxable* to start registration again. We've got you! 👍`

- **User not found (OTP step):**  
  `Something went wrong on our end. Say *Hi Taxable* to start over — we'll get you through this! 💪`

- **Valid code – success:**  
  `✅ You're in! Your email is verified. Log in at the Taxable app or website with {email} and your password. Welcome to Taxable — let's make tax simple! 🎉`

---

## 8. Done (already finished registration)

- **User says something when already done:**  
  `You're already registered! Log in on the Taxable app or website. Need to do something else? Say *Hi Taxable* and we'll help. 😊`

---

## 9. Generic error (uncaught)

- **Webhook error:**  
  `Oops! Something went wrong. Try again or say *Hi Taxable* to start fresh — we're here to help! 💬`

---

## Can we clear the password from the conversation?

**Short answer: No** — with the **official Meta WhatsApp Cloud API** you cannot delete messages (neither the user’s nor the bot’s) after they’re sent. The API has no “delete message” endpoint, so the password will stay visible in the user’s chat history.

**What we already do:**  
- We never echo or repeat the password in any bot reply.  
- We send a clear line: “We’ve saved your password securely — we never show or repeat it in chat.”

**If you must avoid the password ever appearing in WhatsApp:**  
- **Option A:** Don’t ask for the password in chat. After email/phone, send a **one-time secure link** (e.g. to your app) where the user sets their password on a web page. The link expires after use. Then the password is never in WhatsApp.  
- **Option B:** Use a third-party WhatsApp API provider that supports message deletion (e.g. delete “for everyone” within their time window). That’s outside the standard Meta Cloud API and has its own limits (e.g. time window, provider rules).
