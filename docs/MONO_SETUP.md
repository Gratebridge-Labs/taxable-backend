# Mono Open Banking Integration

Taxable uses [Mono](https://mono.co) so users can connect their bank and we pull **income data** automatically instead of manual entry.

**API base URL:** `https://api.gettaxable.com/api`

## What we get from Mono

1. **From initiate (POST /v2/accounts/initiate)**  
   We get a **link** (URL). We send this link to the user (e.g. in WhatsApp). The user opens it in a browser, signs into their bank via Mono, and connects their account. We do **not** get any account data from initiate—only the one-time URL.

2. **From the webhook (when the user has connected)**  
   Mono sends a POST to our webhook with an **account id** (and often our `meta.ref`). We store this in `MonoLink` (user, monoAccountId, status: linked). We need this id to fetch income later.

3. **From getAccountIncome(accountId)**  
   We call Mono’s **Income API** with the stored account id and get back **income data** (e.g. total income, streams, employer info). We save that into the user’s tax profile when they reply “done” in WhatsApp.

So the flow is: **initiate → link** → user opens link → **webhook → account id** → user says “done” → **getAccountIncome → income data** saved to profile.

## Docs

- [Mono Docs](https://docs.mono.co/docs)
- [API Reference](https://docs.mono.co/api)
- [Initiate Account Linking](https://docs.mono.co/api/bank-data/authorisation/initiate-account-linking)
- [Income API](https://docs.mono.co/api/bank-data/accounts/income)
- [Webhooks](https://docs.mono.co/docs/financial-data/webhook-introduction)

## Environment variables

Add to `.env`:

```env
# API base URL (used in docs; optional override)
API_BASE_URL=https://api.gettaxable.com/api

# Mono (open banking – optional; if set, WhatsApp will offer "connect bank" for income)
MONO_SECRET_KEY=your_mono_secret_key_from_dashboard

# Where to redirect users after they link their bank (optional; default below)
APP_URL=https://dashboard.gettaxable.com
# or
MONO_REDIRECT_URL=https://your-app.com/mono/connected
```

- **MONO_SECRET_KEY**: From [Mono Dashboard](https://app.withmono.com) → API Keys (Secret key). Required for initiate, income, and webhook verification.
- **APP_URL** / **MONO_REDIRECT_URL**: Redirect URL after the user completes bank linking in Mono’s flow.

## Backend behaviour

1. **Initiate link**  
   - `POST /api/mono/connect/initiate` (auth required)  
   - Body: `{ "profileId": "TP123...", "redirectUrl": "optional" }`  
   - Returns `{ link, reference }`. User opens `link` in a browser to connect their bank.

2. **Webhook**  
   - Mono sends events to `POST /api/mono/webhook`.  
   - Configure this URL in the Mono dashboard: `https://api.gettaxable.com/api/mono/webhook`.  
   - On successful link we store `MonoLink` (user, profileId, monoAccountId) so we can fetch income.

3. **Fetch income**  
   - `GET /api/mono/income` (auth required).  
   - Uses the user’s latest linked account and returns Mono’s income payload.  
   - Optional query: `?profileId=TP123` to prefer a link for that profile.

4. **WhatsApp**  
   - When we ask for “income info” (e.g. after DOB/address or Continue my filing), we also send a one-time Mono connect link if `MONO_SECRET_KEY` is set.  
   - User can open the link, connect bank; we receive the webhook and can later fetch income via the API or a job.

## Webhook payload (Mono)

Mono may send different event names; we treat as “linked” when we get an account id and can resolve `ref` (from our `meta.ref` on initiate). We store `ref` when initiating so the webhook can match and set `monoAccountId` and `status: 'linked'`.

## Storing income on profile

When the user replies *done* in WhatsApp after connecting their bank, we call Mono’s income API and save the result to `TaxableProfile.incomeDetails` as `{ source: 'mono', data: income }`. You can also call `GET /api/mono/income` from the dashboard and map the response into calculations.

## Status

- `GET /api/mono/status` (auth) – returns `{ configured, linked, linkedAt, profileId }`.
