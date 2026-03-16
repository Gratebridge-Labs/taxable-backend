# Admin: Approve tax status (so user can pay and file)

## Endpoint

**PATCH** `/api/admin/taxable-profiles/:profileId/filing-status`

- **Auth:** Admin (Bearer token).
- **Body:** `{ "filingStatus": "tax_agent_approved" }` (or another allowed value).
- **profileId:** Use the profile’s MongoDB `_id` or the string `profileId` (e.g. `TP958909103`).

### Allowed `filingStatus` values

| Value | Meaning |
|-------|--------|
| `pending_upload` | User needs to upload documents |
| `upload_done` | Documents uploaded |
| `pending_accountant_payment` | Awaiting accountant review payment |
| `tax_agent_review` | Accountant review paid; agent is reviewing |
| **`tax_agent_approved`** | **Agent approved — user can pay filing fee and file** |
| `pending_filing_payment` | Filing fee link sent; awaiting payment |
| `filed` | Filing fee paid and return filed |

### Example: approve so user can file

```bash
curl -X PATCH "https://api.gettaxable.com/api/admin/taxable-profiles/69b7faf0711f93c7e5669d8c/filing-status" \
  -H "Authorization: Bearer <admin_token>" \
  -H "Content-Type: application/json" \
  -d '{"filingStatus":"tax_agent_approved"}'
```

After you set a profile to `tax_agent_approved`:

1. User sees “File your 2025 tax return — reply **file**” in the WhatsApp menu.
2. User replies **file** → bot sends the ₦25,000 filing-fee payment link.
3. User pays → Paystack webhook sets `filingStatus: 'filed'`, `filed: true`, `filedAt`.
4. User replies **done** → bot shows updated status (Filed).

## Related admin route

- **POST** `/api/admin/taxable-profiles/:profileId/filing-link`  
  Body: `{ "userId": "<user _id>", "type": "filing_fee" }`  
  Manually generate a filing-fee payment link for a user (e.g. if they lost the WhatsApp link).
