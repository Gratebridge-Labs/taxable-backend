/**
 * Application Constants
 * Can be updated as needed
 */

/** Base URL for this API (e.g. for webhooks, links). Override with API_BASE_URL in env. */
const API_BASE_URL = process.env.API_BASE_URL || 'https://api.gettaxable.com/api';

module.exports = {
  API_BASE_URL
};
