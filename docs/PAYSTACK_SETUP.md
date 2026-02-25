# Paystack subscription and charges

Taxable uses [Paystack](https://paystack.com) for subscription and one-time charges. The flow: create a payment link → user pays on Paystack → webhook notifies us → we mark subscription active, set currentPeriodEnd, and email the user. WhatsApp users can say "Done" after paying to trigger manual verification if the webhook has not fired yet.

## Environment variables

Add to `.env`:

```env
# Paystack (subscriptions & charges)
PAYSTACK_SECRET_KEY=sk_test_xxxx

# Optional: where to redirect the user after successful payment (default: APP_URL + /payment/success)
PAYSTACK_CALLBACK_URL=https://dashboard.gettaxable.com/payment/success
APP_URL=https://dashboard.gettaxable.com

# Cron: subscription expiry reminders (3 days before). Set and use in scheduler.
CRON_SECRET=your_secret_here
```

- **PAYSTACK_SECRET_KEY**: From [Paystack Dashboard](https://dashboard.paystack.com) → Settings → API Keys & Webhooks. Use test key for development, live key for production.
- **PAYSTACK_CALLBACK_URL** / **APP_URL**: Redirect URL after the user completes payment on Paystack.
- **CRON_SECRET**: Optional. Required to call the subscription-expiry-reminders cron endpoint (see Cron section below).

## API

### Create payment link (auth required)

**POST** `/api/paystack/create-link`

Body:

```json
{
  "plan": "monthly",
  "callback_url": "https://your-app.com/payment/success"
}
```

- **plan**: `monthly` | `yearly` (PDF spec: ₦4,000 / ₦30,000). Legacy: `basic` | `pro` | `annual` map to same amounts.
- **callback_url**: Override redirect URL after payment.

Response:

```json
{
  "success": true,
  "data": {
    "authorization_url": "https://checkout.paystack.com/...",
    "reference": "...",
    "plan": "Monthly",
    "planName": "Monthly"
  }
}
```

Redirect the user to `authorization_url` to complete payment.

### Webhook (Paystack → your backend)

**POST** `https://api.gettaxable.com/api/paystack/webhook`

Configure this URL in Paystack Dashboard → Settings → API Keys & Webhooks → Webhook URL.

- Paystack sends `charge.success` (and other events) to this URL.
- We verify the signature (X-Paystack-Signature) using your secret key.
- On `charge.success` we find the pending subscription by `reference`, set status to `active`, set `paidAt` and `currentPeriodEnd` (30 days for monthly, 365 for yearly), then send the user an email: “Your subscription is active”.

### Verify payment done (auth required)

**POST** `/api/paystack/verify-done`

When the user says "Done" after paying (e.g. from WhatsApp). If there is a pending subscription for the user, we verify the transaction with Paystack; if successful we set the subscription to active, set `currentPeriodEnd`, and send the subscription-active email. Use when the webhook has not confirmed yet (Case 3 in the PDF).

### Get subscription status (auth required)

**GET** `/api/paystack/subscription/status`

Returns the current user’s active subscription (if any), including `currentPeriodEnd`, and recent subscriptions.

### Cron: subscription expiry reminders

**GET** `/api/cron/subscription-expiry-reminders?secret=YOUR_CRON_SECRET`

Call from a scheduler (e.g. daily). Sends "Your subscription expires in 3 days" email to users whose `currentPeriodEnd` is in 3 days. Requires `CRON_SECRET` in env and the same value in the request (`secret` query or `X-Cron-Secret` header).

## Default plans (PDF spec)

| plan    | amountKobo | Naira   | periodDays |
|---------|------------|---------|------------|
| monthly | 400000     | ₦4,000  | 30  |
| yearly  | 3000000    | ₦30,000 | 365 |


## Emails

- **Subscription active**: After webhook or verify-done confirms payment, we send `sendSubscriptionActiveEmail(to, firstName, planName)`.
- **Subscription expiring**: Cron job sends `sendSubscriptionExpiringEmail(to, firstName, 3, planName)` 3 days before `currentPeriodEnd`.

## Error handling

- **Webhook**: Invalid signature returns 401; we always respond 200 to Paystack so they do not retry unnecessarily. Errors are logged; subscription activation failures do not expose internals.
- **verify-done**: Returns 200 with `verified: false` and a user-friendly message when payment is not found or not confirmed; 500 only on unexpected errors (message is generic).
- **WhatsApp**: Subscription link creation errors are caught and the user is told to try again or say "Subscription plans"; verify-done errors show PAYMENT_NOT_CONFIRMED_YET.
- **Emails**: Subscription-active and subscription-expiring emails are best-effort; failures are logged and do not block activation or cron.

## WhatsApp flow (PDF)

- User chooses "Subscription plans" → we send the subscription message (₦4k monthly, ₦30k yearly).
- "Choose monthly" / "Choose yearly" → we create a payment link and send it; user pays then replies "Done".
- "Done" or "Check again" → we run verify-done logic; if payment is confirmed we activate subscription and send PAYMENT_CONFIRMED + menu.
- Locked actions (Create tax profile, Connect banks, File tax) require an active subscription; otherwise we show the subscription-required message.
