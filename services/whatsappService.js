/**
 * WhatsApp Cloud API - send text messages
 * Requires: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID in env
 */
const https = require('https');

const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';
const BASE_URL = `graph.facebook.com`;

function sendTextMessage(to, body) {
  return new Promise((resolve, reject) => {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

    if (!token || !phoneNumberId) {
      return reject(new Error('WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID must be set'));
    }

    // to: recipient phone number with country code, no + (e.g. 2348012345678)
    const toNumber = String(to).replace(/\D/g, '');
    if (!toNumber.length) {
      return reject(new Error('Invalid recipient phone number'));
    }

    const payload = JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: toNumber,
      type: 'text',
      text: {
        preview_url: false,
        body: body
      }
    });

    const options = {
      hostname: BASE_URL,
      path: `/${API_VERSION}/${phoneNumberId}/messages`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data || '{}'));
          } catch {
            resolve({});
          }
        } else {
          try {
            const errBody = JSON.parse(data || '{}');
            const err = errBody.error || {};
            const msg = err.message || `WhatsApp API ${res.statusCode}: ${data}`;
            const code = err.code;
            const subcode = err.error_subcode;
            console.error('[WhatsApp API] Send failed:', { code, message: msg, type: err.type, errorSubcode: subcode, fbtraceId: err.fbtrace_id });
            if (code === 190 || subcode === 463 || /expired|Session has expired/i.test(msg)) {
              console.error('[WhatsApp API] Token expired or invalid. Generate a new token in Meta (Business Settings → System users → Generate token) and update WHATSAPP_ACCESS_TOKEN in Vercel, then redeploy.');
            }
            reject(new Error(msg));
          } catch (e) {
            console.error('[WhatsApp API] Send failed (parse error):', res.statusCode, data);
            reject(new Error(`WhatsApp API error: ${res.statusCode} ${data}`));
          }
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

module.exports = {
  sendTextMessage
};
