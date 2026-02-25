# Paystack subscription and charges

Taxable uses [Paystack](https://paystack.com) for subscription and one-time charges. The flow: create a payment link → user pays on Paystack → webhook notifies us → we mark subscription active and email the user.

## Environment variables

Add to `.env`:

```env
# Paystack (subscriptions & charges)
PAYSTACK_SECRET_KEY=sk_test_xxxx

# Optional: where to redirect the user after successful payment (default: APP_URL + /payment/success)
PAYSTACK_CALLBACK_URL=https://dashboard.gettaxable.com/payment/success
APP_URL=https://dashboard.gettaxable.com
```

- **PAYSTACK_SECRET_KEY**: From [Paystack Dashboard](https://dashboard.paystack.com) → Settings → API Keys & Webhooks. Use test key for development, live key for production.
- **PAYSTACK_CALLBACK_URL** / **APP_URL**: Redirect URL after the user completes payment on Paystack.

## API

### Create payment link (auth required)

**POST** `/api/paystack/create-link`

Body:

```json
{
  "plan": "basic",
  "planName": "Basic Plan",
  "callback_url": "https://your-app.com/payment/success"
}
```

- **plan**: `basic` | `pro` | `annual` (default amounts: ₦5,000 / ₦15,000 / ₦50,000), or omit and pass `amountKobo`.
- **amountKobo**: Override amount in kobo (e.g. 500000 = ₦5,000).
- **planName**: Display name for the plan (emails, dashboard).
- **callback_url**: Override redirect URL after payment.

Response:

```json
{
  "success": true,
  "data": {
    "authorization_url": "https://checkout.paystack.com/...",
    "access_code": "...",
    "reference": "...",
    "subscriptionId": "...",
    "amountKobo": 500000,
    "plan": "Basic"
  }
}
```

Redirect the user to `authorization_url` to complete payment.

### Webhook (Paystack → your backend)

**POST** `https://api.gettaxable.com/api/paystack/webhook`

Configure this URL in Paystack Dashboard → Settings → API Keys & Webhooks → Webhook URL.

- Paystack sends `charge.success` (and other events) to this URL.
- We verify the signature (X-Paystack-Signature) using your secret key.
- On `charge.success` we find the pending subscription by `reference`, set status to `active`, then send the user an email: “Your subscription is active”.

### Get subscription status (auth required)

**GET** `/api/paystack/subscription/status`

Returns the current user’s active subscription (if any) and recent subscriptions.

## Default plans (amounts in kobo)

| plan    | amountKobo | Naira   |
|--------|------------|---------|
| basic  | 500000     | ₦5,000  |
| pro    | 1500000    | ₦15,000 |
| annual | 5000000    | ₦50,000 |

You can pass `amountKobo` in the request to use a custom amount.

## Email

After the webhook confirms payment we send an email via `sendSubscriptionActiveEmail(to, firstName, planName)` so the user sees “Your subscription is active” in their inbox.
