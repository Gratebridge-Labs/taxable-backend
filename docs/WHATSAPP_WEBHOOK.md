# WhatsApp Webhook Setup

## Environment variables

Add to your `.env`:

```env
# WhatsApp Cloud API (Meta)
WHATSAPP_ACCESS_TOKEN=your_system_user_access_token
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
WHATSAPP_VERIFY_TOKEN=taxable_webhook_verify
# Optional: default is v21.0
# WHATSAPP_API_VERSION=v21.0
```

- **WHATSAPP_ACCESS_TOKEN**: From Meta App → WhatsApp → API Setup (System user or temporary token).
- **WHATSAPP_PHONE_NUMBER_ID**: From Meta App → WhatsApp → API Setup (Phone number ID).
- **WHATSAPP_VERIFY_TOKEN**: Any string you choose; must match the value you enter in the Meta webhook configuration.

## Webhook URL

Base URL for the API: **https://api.gettaxable.com/api**

- **Verification (GET):** `https://api.gettaxable.com/api/whatsapp/webhook`
- **Incoming messages (POST):** same URL

In Meta Developer Console → Your App → WhatsApp → Configuration → Webhook:

1. Set Callback URL to `https://api.gettaxable.com/api/whatsapp/webhook`.
2. Set Verify token to the same value as `WHATSAPP_VERIFY_TOKEN`.
3. Subscribe to **messages**.

## Flow: "Hi Taxable" → always menu

When a user sends:

- "Hi Taxable"
- "Hi, Taxable"
- "Get started"
- "Hello Taxable"

the bot **always shows the menu** (no account / no profile / profile completed). It does **not** start registration. To create an account, the user replies **Create my account** from the no-account menu.

Every menu includes a **pinned commands** block so users can refer back:

- *Hi Taxable* or *Menu* — Show menu
- *Tax profile* — Set up / manage tax profile
- *Continue my filing* — Continue filing
- *Complete my details* — Add DOB & address

## Flow: "Create my account"

When the user has no account and replies **Create my account** (or "Create account", "Sign up"), the bot will:

1. Ask for **first name**
2. Ask for **last name**
3. Ask for **email**
4. Ask for **phone** (suggests number from WhatsApp)
5. Ask for **password** (min 8 chars, 1 upper, 1 lower, 1 number)
6. Create the user and send OTP to their email
7. Ask for the **6-digit OTP** from email
8. Verify and confirm registration

Session state is stored in `WhatsAppSession` (by WhatsApp ID). User can say **Hi Taxable** or **Menu** anytime to see the menu (and pinned commands).

## Troubleshooting: "I sent a message but got no reply"

1. **Check Vercel (or your host) logs**  
   After sending a message, look for:
   - `[WhatsApp webhook] POST received` → Meta is calling your URL.
   - `[WhatsApp webhook] Message from 234... : ...` → Your code received the text.
   - `[WhatsApp webhook] Reply sent to ...` → Reply was sent.
   - `[WhatsApp webhook] Send error: ...` → Sending failed (token, phone number ID, or API error).

2. **Meta App & Webhook**
   - Meta for Developers → Your App → WhatsApp → **Configuration** → Webhook shows a green check and "Verified".
   - Under "Webhook fields", **messages** is subscribed.
   - In **App mode**: if the app is in **Development**, only **test phone numbers** (added in WhatsApp → API Setup) receive replies. Add your number there or switch to Live for all numbers.

3. **Environment variables (on Vercel)**
   - `WHATSAPP_ACCESS_TOKEN`: From WhatsApp → API Setup. Use a **System user** token with `whatsapp_business_messaging` and `whatsapp_business_management`. If you use a temporary token, it expires.
   - `WHATSAPP_PHONE_NUMBER_ID`: From API Setup, the **Phone number ID** (numeric), not the actual phone number.

4. **24-hour rule**  
   You can send a free-form text reply only if the user has sent you a message in the last 24 hours. If they did send a message and you see "Reply sent" in logs but no message on WhatsApp, the problem is usually the token or Phone number ID.

5. **Message content**  
   To start registration, the user must send something like: "Hi Taxable", "Get started", or "Hi Taxable I want to get started". Exact wording is flexible; the app detects intent.

## Error: "(#10) Application does not have permission for this action"

This means your **access token** does not have permission to send WhatsApp messages. Fix it in Meta for Developers:

1. **Use a System User token (not a User token)**  
   - Go to [Meta for Developers](https://developers.facebook.com) → Your App → **WhatsApp** → **API Setup**.  
   - Under "Temporary access token" you may see a short-lived token — that can work for testing but expires.  
   - For production: **Business Settings** → **Users** → **System users** → create or select a system user → **Generate new token**. Select your App, then enable at least:
     - **whatsapp_business_messaging** (required to send messages)
     - **whatsapp_business_management**
   - Copy the token and set it as `WHATSAPP_ACCESS_TOKEN` in Vercel (Environment Variables).

2. **Confirm WhatsApp is added to the App**  
   - In the App dashboard, **Add Products** → **WhatsApp** must be added.

3. **Phone number and app mode**  
   - In **WhatsApp** → **API Setup**, the **Phone number ID** must belong to a number connected to this app.  
   - If the app is in **Development**, only **test numbers** (added in the same API Setup section) can receive messages. Add the number you’re testing with (e.g. 2348064031915) as a test number, or switch the app to **Live** and complete business verification if required.

4. **Redeploy**  
   After changing `WHATSAPP_ACCESS_TOKEN` (and optionally `WHATSAPP_PHONE_NUMBER_ID`) in Vercel, redeploy or wait for the next deployment so the new env vars are used.

## Error 190: "Session has expired" / Token expired

This happens when `WHATSAPP_ACCESS_TOKEN` has expired. Meta tokens can expire (e.g. temporary token, or System User token with an expiry). When it does, the webhook may return 200 but the reply never reaches the user, and logs show:

- `[WhatsApp API] Send failed: code: 190, message: 'Error validating access token: Session has expired...'`
- `errorSubcode: 463`

### Fix right now

1. **Generate a new token**  
   - [Meta for Developers](https://developers.facebook.com) → Your App → **Business Settings** (or Meta Business Suite) → **Users** → **System users** → select the system user → **Generate new token**.  
   - Choose your App, select **whatsapp_business_messaging** and **whatsapp_business_management**, set expiry to **Never** (or longest available).  
   - Copy the token.

2. **Update env**  
   - **Vercel:** Project → Settings → Environment Variables → edit `WHATSAPP_ACCESS_TOKEN` → paste the new token → Save.  
   - **Local:** Update `WHATSAPP_ACCESS_TOKEN` in `.env`.

3. **Redeploy**  
   - In Vercel, trigger a redeploy (Deployments → … → Redeploy) so the new token is used. No code change needed.

After redeploy, send a new message (e.g. "Hi Taxable"); replies should work again.

### Reduce how often it happens

- **Use a System User token with "Never" expiry** (or the longest expiry Meta offers). Avoid the temporary token from the WhatsApp API Setup page for production.
- **Optional:** Monitor logs for `[WhatsApp API] Send failed` with code `190` and set up an alert (e.g. email or Slack) so you know to refresh the token before users notice.

## Testing locally

Use a tunnel (e.g. ngrok) so Meta can reach your server:

```bash
ngrok http 3000
# Use https://xxxx.ngrok.io/api/whatsapp/webhook as Callback URL
```

Ensure `WHATSAPP_VERIFY_TOKEN` in `.env` matches the Verify token in the Meta webhook form when you click "Verify and save".
