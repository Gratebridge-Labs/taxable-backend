/**
 * Paystack integration: initialize transaction (payment link), verify transaction, webhook handling.
 * Docs: https://paystack.com/docs/
 * Requires: PAYSTACK_SECRET_KEY in env. Optional: PAYSTACK_CALLBACK_URL for redirect after payment.
 */
const https = require('https');

const PAYSTACK_BASE = 'api.paystack.co';
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;

function paystackRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const options = {
      hostname: PAYSTACK_BASE,
      path: path.startsWith('/') ? path : `/${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${PAYSTACK_SECRET || ''}`
      }
    };
    if (payload) options.headers['Content-Length'] = Buffer.byteLength(payload);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          if (parsed.status === true && parsed.data) {
            resolve(parsed.data);
          } else {
            reject(new Error(parsed.message || parsed.error || `Paystack ${res.statusCode}: ${data}`));
          }
        } catch (e) {
          reject(new Error(`Paystack response parse error: ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Initialize a transaction. Returns authorization_url for the user to complete payment.
 * @param {Object} opts - { email, amount (in kobo), callback_url?, metadata?, reference? }
 */
async function initializeTransaction(opts) {
  if (!PAYSTACK_SECRET || !String(PAYSTACK_SECRET).trim()) {
    throw new Error('PAYSTACK_SECRET_KEY is not set');
  }
  const { email, amount, callback_url, metadata, reference } = opts;
  if (!email || amount == null || amount < 1) {
    throw new Error('email and amount (kobo) are required');
  }
  const body = {
    email,
    amount: Math.round(Number(amount)),
    ...(callback_url && { callback_url }),
    ...(metadata && typeof metadata === 'object' && { metadata }),
    ...(reference && { reference })
  };
  const data = await paystackRequest('POST', '/transaction/initialize', body);
  return {
    authorization_url: data.authorization_url,
    access_code: data.access_code,
    reference: data.reference
  };
}

/**
 * Verify a transaction by reference (optional; webhook is the source of truth).
 */
async function verifyTransaction(reference) {
  if (!PAYSTACK_SECRET) throw new Error('PAYSTACK_SECRET_KEY is not set');
  if (!reference) throw new Error('reference is required');
  const data = await paystackRequest('GET', `/transaction/verify/${encodeURIComponent(reference)}`);
  return data;
}

/**
 * Verify Paystack webhook signature (X-Paystack-Signature = HMAC SHA512 of raw body).
 */
function verifyWebhookSignature(rawBody, signature) {
  if (!PAYSTACK_SECRET || !signature || !rawBody) return false;
  const crypto = require('crypto');
  const hash = crypto.createHmac('sha512', PAYSTACK_SECRET).update(rawBody).digest('hex');
  return hash === signature;
}

module.exports = {
  initializeTransaction,
  verifyTransaction,
  verifyWebhookSignature,
  isConfigured: () => !!(PAYSTACK_SECRET && PAYSTACK_SECRET.trim())
};
