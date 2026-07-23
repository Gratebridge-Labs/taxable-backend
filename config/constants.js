/**
 * Application Constants
 * Can be updated as needed
 */

/** Base URL for this API (e.g. for webhooks, links). Override with API_BASE_URL in env. */
const API_BASE_URL = process.env.API_BASE_URL || 'https://api.gettaxable.com/api';

/**
 * Company Income Tax — defaults used by quarterly estimates / company-info.
 * Annual CIT uses turnover brackets on CITReturn (20% ≤ ₦25M, else 30%).
 * Override the standard rate with CIT_RATE in env (e.g. CIT_RATE=0.20) for
 * estimate fallbacks that don't yet know turnover.
 */
const CIT_RATE = process.env.CIT_RATE ? Number(process.env.CIT_RATE) : 0.30;
const CIT_SMALL_COMPANY_TURNOVER = 25_000_000;
const CIT_RATE_SMALL = 0.20;
const DEVELOPMENT_LEVY_RATE = 0.04;

module.exports = {
  API_BASE_URL,
  CIT_RATE,
  CIT_SMALL_COMPANY_TURNOVER,
  CIT_RATE_SMALL,
  DEVELOPMENT_LEVY_RATE
};
