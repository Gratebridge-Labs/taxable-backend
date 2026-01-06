const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * Generate JWT token for user or admin
 * @param {Object} userOrPayload - User Mongoose document or admin payload object
 * @returns {String} JWT token
 */
const generateToken = (userOrPayload) => {
  let tokenPayload;

  // If it's a user document (has _id property from Mongoose)
  if (userOrPayload._id && !userOrPayload.adminId) {
    tokenPayload = {
      userId: userOrPayload._id.toString(),
      email: userOrPayload.email,
      emailVerified: userOrPayload.emailVerified
    };
  } else {
    // It's an admin payload (already structured)
    tokenPayload = {
      ...userOrPayload
    };
  }

  return jwt.sign(tokenPayload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  });
};

/**
 * Verify JWT token
 * @param {String} token - JWT token
 * @returns {Object} Decoded token payload
 */
const verifyToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

/**
 * Generate password reset token
 * @returns {String} Secure random token
 */
const generateResetToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

module.exports = {
  generateToken,
  verifyToken,
  generateResetToken
};

