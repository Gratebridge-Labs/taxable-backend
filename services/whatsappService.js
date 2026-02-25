/**
 * WhatsApp Cloud API - send text messages, fetch/download media (image, document)
 * Requires: WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID in env
 */
const https = require('https');

const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';
const BASE_URL = 'graph.facebook.com';

/** GET media URL from WhatsApp (response has .url); then download from that URL with same token */
function getMediaUrl(mediaId) {
  return new Promise((resolve, reject) => {
    const token = process.env.WHATSAPP_ACCESS_TOKEN;
    if (!token) return reject(new Error('WHATSAPP_ACCESS_TOKEN not set'));
    const path = `/${API_VERSION}/${mediaId}`;
    const options = {
      hostname: BASE_URL,
      path,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            const json = JSON.parse(data || '{}');
            const url = json.url;
            if (url) resolve(url);
            else reject(new Error('No url in media response'));
          } catch (e) {
            reject(e);
          }
        } else {
          reject(new Error(`WhatsApp media URL failed: ${res.statusCode} ${data}`));
        }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

/** Download media file from WhatsApp; returns { buffer, mimeType } (mime from Content-Type) */
function downloadMedia(mediaId) {
  return getMediaUrl(mediaId).then(downloadUrl => {
    return new Promise((resolve, reject) => {
      const token = process.env.WHATSAPP_ACCESS_TOKEN;
      const u = new URL(downloadUrl);
      const options = {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` }
      };
      const req = https.request(options, (res) => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => {
          const buffer = Buffer.concat(chunks);
          const mimeType = (res.headers['content-type'] || 'application/octet-stream').split(';')[0].trim();
          resolve({ buffer, mimeType });
        });
      });
      req.on('error', reject);
      req.end();
    });
  });
}

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
  sendTextMessage,
  getMediaUrl,
  downloadMedia
};
