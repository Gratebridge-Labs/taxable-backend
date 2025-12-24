const Account = require('../models/Account');

/**
 * Middleware to validate and set account context
 * Expects accountId in query params or body
 */
const accountMiddleware = async (req, res, next) => {
  try {
    const accountId = req.query.accountId || req.body.accountId || req.headers['x-account-id'];

    if (!accountId) {
      return res.status(400).json({
        success: false,
        message: 'Account ID is required. Provide accountId in query, body, or X-Account-ID header.'
      });
    }

    // Verify account belongs to user
    const account = await Account.findOne({
      _id: accountId,
      user: req.user._id,
      isActive: true
    });

    if (!account) {
      return res.status(404).json({
        success: false,
        message: 'Account not found or you do not have access to this account'
      });
    }

    // Attach account to request
    req.account = account;
    next();
  } catch (error) {
    console.error('Account middleware error:', error);
    res.status(500).json({
      success: false,
      message: 'Error validating account'
    });
  }
};

/**
 * Optional account middleware - sets account if provided, but doesn't require it
 * Useful for endpoints that can work with or without account context
 */
const optionalAccountMiddleware = async (req, res, next) => {
  try {
    const accountId = req.query.accountId || req.body.accountId || req.headers['x-account-id'];

    if (accountId) {
      const account = await Account.findOne({
        _id: accountId,
        user: req.user._id,
        isActive: true
      });

      if (account) {
        req.account = account;
      }
    }

    next();
  } catch (error) {
    console.error('Optional account middleware error:', error);
    // Don't fail if account lookup fails in optional mode
    next();
  }
};

module.exports = {
  accountMiddleware,
  optionalAccountMiddleware
};

