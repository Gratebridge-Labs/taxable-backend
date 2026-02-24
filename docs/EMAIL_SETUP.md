# Email setup (OTP, welcome, password reset)

## Environment variables

In `.env` and in Vercel (Environment Variables):

```env
EMAIL_HOST=mail.gettaxable.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=do_not_reply@gettaxable.com
EMAIL_PASS=your_password
EMAIL_FROM=do_not_reply@gettaxable.com
# Optional:
# EMAIL_FROM_NAME=Taxable
# DEBUG_EMAIL=true   # log raw SMTP traffic to console (for debugging only)
```

- **EMAIL_HOST** – SMTP server hostname.
- **EMAIL_PORT** – `587` (STARTTLS) or `465` (SSL). Use `EMAIL_SECURE=true` for 465.
- **EMAIL_USER** / **EMAIL_PASS** – SMTP auth (usually full email and password).
- **EMAIL_FROM** – “From” address (often same as EMAIL_USER).

## Behaviour

- **Port 587:** `requireTLS: true` is set so the connection uses STARTTLS (required by many custom SMTP servers).
- **Port 465:** Set `EMAIL_PORT=465` and `EMAIL_SECURE=true`.
- **Timeouts:** 15s connection, 10s greeting to avoid long hangs.
- **TLS:** `rejectUnauthorized: false` so self-signed or hostname mismatch (e.g. `mail.gettaxable.com`) still works.

## If emails don’t send

1. **Check logs**  
   Look for `[Email] OTP send failed` or `[Email] Welcome send failed`. The log line includes:
   - `error.message`
   - `code` (e.g. EAUTH, ECONNECTION, ETIMEDOUT)
   - `command` (last SMTP command if any)
   - First 150–200 chars of `response` (SMTP server reply).

2. **Typical causes**
   - **EAUTH** – Wrong `EMAIL_USER` or `EMAIL_PASS`, or account not allowed to use SMTP.
   - **ECONNECTION / ETIMEDOUT** – Firewall, wrong host/port, or server down. Try telnet to `EMAIL_HOST` on `EMAIL_PORT`.
   - **Self-signed cert** – Already handled with `rejectUnauthorized: false`. If you need strict TLS, we can add an option to enable verification.
   - **“Relay access denied” / 5.7.1** – Server is not allowing relay for this user or “from” address; fix permissions or FROM on the mail server.

3. **Vercel**  
   Ensure `EMAIL_*` are set in the project’s Environment Variables and that a new deployment has run after changing them.

4. **Test from the app**  
   Trigger OTP (e.g. register or WhatsApp flow) and check Vercel logs for the exact `[Email]` error line to see the SMTP response.

## "Success" but no email received

- **Send test to an address you check**  
  Call `POST /api/health/email-test` with a body like `{ "to": "your@gmail.com" }`. If you don’t pass `to`, the test goes to `EMAIL_USER` (e.g. `do_not_reply@gettaxable.com`), which you may not be watching.
- **Check spam / junk**  
  Mail from no-reply addresses or new domains often lands in spam until you mark it “Not spam”.
- **Delivery and reputation**  
  For `mail.gettaxable.com` (or your SMTP host), add **SPF** and ideally **DKIM** in DNS so receiving providers don’t drop or spam-filter. Without them, Gmail/Outlook may accept the message then quarantine or reject it.

---

## Works to some domains (e.g. paxalpay.com) but not Gmail

**What’s happening:** Your app is sending correctly (SMTP accepts the message). Business mail servers (like paxalpay.com) often deliver it. **Gmail, Yahoo, Outlook.com** are stricter: they require proper **domain authentication** and may drop or hide the message (spam/quarantine) when it’s missing.

So nothing is “wrong” in the code — the fix is on the **domain/DNS** side for **gettaxable.com** (the domain in your From address).

### 1. Add or fix SPF for gettaxable.com

SPF says which servers are allowed to send email for `@gettaxable.com`.

- In your DNS (where gettaxable.com is managed), add a **TXT** record for **gettaxable.com** (or fix the existing one):
  - **Name/host:** `@` (or `gettaxable.com`)
  - **Value:**  
    `v=spf1 include:mail.gettaxable.com ~all`  
    If your mail is actually sent by another host (e.g. your hosting provider’s mail server), use their include or `ip4:...` instead of `include:mail.gettaxable.com`. Your host’s docs will say what to use.
- If you already have an SPF record, **add** the sending server to it (e.g. `include:mail.gettaxable.com` or the right `ip4`) and keep a single `v=spf1 ... ~all` (or `-all` when you’re sure).

Check:  
[https://mxtoolbox.com/spf.aspx](https://mxtoolbox.com/spf.aspx) → enter `gettaxable.com` and confirm the record is valid and includes your mail server.

### 2. Add DKIM (strongly recommended for Gmail)

DKIM signs messages so receivers can verify they really came from your domain. Many hosts (cPanel, Plesk, etc.) have “DKIM” or “Email authentication” in the panel and will give you a **TXT** record to add in DNS. Add that record for the selector they give (e.g. `default._domainkey.gettaxable.com`). Without DKIM, Gmail is much more likely to filter you.

### 3. Optional: DMARC

A DMARC TXT record for `_dmarc.gettaxable.com` tells receivers what to do if SPF/DKIM fail (e.g. “none” to monitor first). This can help with reputation over time.

### 4. After changing DNS

- Wait for DNS to propagate (often 5–30 minutes, sometimes longer).
- Send another test to Gmail with `POST /api/health/email-test` and body `{ "to": "your@gmail.com" }`.
- Check **Spam** and **Promotions** in Gmail. If it still doesn’t appear, wait 24h and try again (reputation can lag).

**Summary:** Mail to helpdesk@paxalpay.com proves the backend is fine. To reach Gmail (and similar), fix SPF and add DKIM for gettaxable.com in DNS.

---

## Gmail bounce: "550-5.7.26 sender is unauthenticated" (SPF/DKIM did not pass)

If you get a bounce from Gmail saying **"Your email has been blocked because the sender is unauthenticated. Gmail requires all senders to authenticate with either SPF or DKIM"** and the diagnostics show:

- **SPF [gettaxable.com] with ip: [198.54.116.191] = did not pass**
- **DKIM = did not pass**
- **Reporting-MTA: server122.web-hosting.com**

then Gmail is rejecting because **gettaxable.com** is not authorizing the server that actually sends mail (IP `198.54.116.191` = server122.web-hosting.com).

### Fix (cPanel / Namecheap-style hosting)

1. **SPF**  
   In DNS for **gettaxable.com**, set a **TXT** record for `@` (or `gettaxable.com`):
   - **Value:** `v=spf1 ip4:198.54.116.191 ~all`  
   (That authorizes the sending server. If you already have an SPF record, merge this: e.g. `v=spf1 ip4:198.54.116.191 include:... ~all` — only one SPF record per domain.)

2. **DKIM**  
   See the step-by-step guide below: **"DKIM on Namecheap shared hosting (cPanel)"**.

3. **Re-test**  
   After 15–30 minutes, send again to Gmail. Reference: [Google mail auth help](https://support.google.com/mail/answer/81126#authentication).
