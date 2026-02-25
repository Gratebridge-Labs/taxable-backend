/**
 * Mono open banking integration (https://docs.mono.co/docs)
 * - Initiate account linking (returns URL for user to connect bank)
 * - Webhook receives auth success and account id
 * - Fetch income data from linked account
 *
 * Requires: MONO_SECRET_KEY in env. Optional: APP_URL or MONO_REDIRECT_URL for redirect after link.
 */
const https = require('https');

const MONO_BASE = 'api.withmono.com';
const MONO_SECRET = process.env.MONO_SECRET_KEY;

function monoRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : '';
    const options = {
      hostname: MONO_BASE,
      path: path.startsWith('/') ? path : `/${path}`,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'mono-sec-key': MONO_SECRET || ''
      }
    };
    if (payload) options.headers['Content-Length'] = Buffer.byteLength(payload);

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsed = data ? JSON.parse(data) : {};
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(parsed);
          else reject(new Error(parsed.message || parsed.error || `Mono API ${res.statusCode}: ${data}`));
        } catch (e) {
          reject(new Error(`Mono API response parse error: ${data}`));
        }
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

/**
 * Initiate account linking. Returns { link } for user to open and connect their bank.
 * @param {Object} opts - { customer: { name, email }, redirectUrl?, meta: { ref, profileId?, userId? } }
 */
async function initiateAccountLinking(opts) {
  if (!MONO_SECRET || !String(MONO_SECRET).trim()) {
    console.error('[Mono] initiateAccountLinking: MONO_SECRET_KEY is not set or empty');
    throw new Error('MONO_SECRET_KEY is not set');
  }
  const { customer, redirectUrl, meta = {} } = opts;
  if (!customer || !customer.email) throw new Error('customer.name and customer.email are required');

  const redirect = redirectUrl || process.env.MONO_REDIRECT_URL || process.env.APP_URL || 'https://dashboard.gettaxable.com';
  const path = '/v2/accounts/initiate';
  const body = {
    customer: {
      name: customer.name || customer.email.split('@')[0],
      email: customer.email
    },
    redirect_url: redirect,
    scope: 'auth',
    meta: { ref: meta.ref || meta.userId || meta.profileId || Date.now().toString(), ...meta }
  };

  const res = await monoRequest('POST', path, body);
  // Mono v2 API returns the link in data.mono_url; fallbacks for other shapes
  const link = (res.data && res.data.mono_url) || res.link || res.url || res.authorisation_url;
  console.log('[Mono] initiateAccountLinking response', { status: 'ok', resultKeys: Object.keys(res || {}), hasLink: !!link });
  if (!link) console.warn('[Mono] initiate response missing link; sample:', JSON.stringify(res).slice(0, 400));
  return {
    link,
    reference: body.meta.ref
  };
}

/**
 * Fetch income data for a linked Mono account.
 * GET https://api.withmono.com/v2/accounts/{id}/income
 */
async function getAccountIncome(accountId) {
  if (!MONO_SECRET) throw new Error('MONO_SECRET_KEY is not set');
  if (!accountId) throw new Error('accountId is required');
  const path = `/v2/accounts/${encodeURIComponent(accountId)}/income`;
  return monoRequest('GET', path);
}

/**
 * Fetch account info (holder, balance, etc.) for a linked account.
 */
async function getAccountInfo(accountId) {
  if (!MONO_SECRET) throw new Error('MONO_SECRET_KEY is not set');
  if (!accountId) throw new Error('accountId is required');
  const path = `/v2/accounts/${encodeURIComponent(accountId)}`;
  return monoRequest('GET', path);
}

module.exports = {
  initiateAccountLinking,
  getAccountIncome,
  getAccountInfo,
  isConfigured: () => !!MONO_SECRET
};
