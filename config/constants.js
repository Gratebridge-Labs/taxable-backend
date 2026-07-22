/**
 * Application Constants
 * Can be updated as needed
 */

/** Base URL for this API (e.g. for webhooks, links). Override with API_BASE_URL in env. */
const API_BASE_URL = process.env.API_BASE_URL || 'https://api.gettaxable.com/api';

/**
 * Company Income Tax rate (as a fraction). Single source of truth used by the
 * company-info CIT estimate and the quarterly assessment screens so they never
 * disagree. Override with CIT_RATE in env (e.g. CIT_RATE=0.20).
 */
const CIT_RATE = process.env.CIT_RATE ? Number(process.env.CIT_RATE) : 0.30;

module.exports = {
  API_BASE_URL,
  CIT_RATE
};
