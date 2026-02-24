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

- **Verification (GET):** `https://your-domain.com/api/whatsapp/webhook`
- **Incoming messages (POST):** same URL

In Meta Developer Console → Your App → WhatsApp → Configuration → Webhook:

1. Set Callback URL to `https://your-domain.com/api/whatsapp/webhook`.
2. Set Verify token to the same value as `WHATSAPP_VERIFY_TOKEN`.
3. Subscribe to **messages**.

## Flow: "Hi Taxable I want to get started"

When a user sends a message like:

- "Hi Taxable I want to get started"
- "Hi Taxable"
- "Get started"
- "Hello Taxable"

the bot will:

1. Ask for **first name**
2. Ask for **last name**
3. Ask for **email**
4. Ask for **phone** (suggests number from WhatsApp)
5. Ask for **password** (min 8 chars, 1 upper, 1 lower, 1 number)
6. Create the user and send OTP to their email
7. Ask for the **6-digit OTP** from email
8. Verify and confirm registration

Session state is stored in `WhatsAppSession` (by WhatsApp ID). User can say "Hi Taxable I want to get started" again mid-flow to restart, or after completion to see the already-registered message.

## Testing locally

Use a tunnel (e.g. ngrok) so Meta can reach your server:

```bash
ngrok http 3000
# Use https://xxxx.ngrok.io/api/whatsapp/webhook as Callback URL
```

Ensure `WHATSAPP_VERIFY_TOKEN` in `.env` matches the Verify token in the Meta webhook form when you click "Verify and save".
