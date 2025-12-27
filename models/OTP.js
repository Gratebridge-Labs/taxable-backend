const mongoose = require('mongoose');

const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
    index: true
  },
  code: {
    type: String,
    required: [true, 'OTP code is required'],
    length: [6, 'OTP must be 6 digits']
  },
  purpose: {
    type: String,
    enum: ['email_verification', 'password_reset'],
    default: 'email_verification'
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 10 * 60 * 1000) // 10 minutes from now
  },
  verified: {
    type: Boolean,
    default: false
  },
  resetToken: {
    type: String,
    select: false // Don't return token by default
  },
  resetTokenExpiresAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600 // Auto-delete after 10 minutes (in seconds)
  }
});

// Index for faster lookups
otpSchema.index({ email: 1, code: 1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('OTP', otpSchema);

