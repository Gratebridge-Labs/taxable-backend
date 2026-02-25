# Mono Open Banking Integration

Taxable uses [Mono](https://mono.co) so users can connect their bank and we pull **income data** automatically instead of manual entry.

**API base URL:** `https://api.gettaxable.com/api`

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

Today we do not auto-save Mono income into `TaxableProfile.incomeDetails`. You can:

- Call `GET /api/mono/income` from the dashboard or another flow and then map the response into your profile/calculations, or
- Add a small job/cron that calls `getAccountIncome` for linked accounts and writes a summary into `incomeDetails` or a dedicated store.

## Status

- `GET /api/mono/status` (auth) – returns `{ configured, linked, linkedAt, profileId }`.
