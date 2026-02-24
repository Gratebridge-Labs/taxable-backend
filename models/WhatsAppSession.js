const mongoose = require('mongoose');

/**
 * Tracks WhatsApp conversation state for registration and other flows.
 * Keyed by wa_id (WhatsApp user phone number with country code, no +).
 */
const whatsAppSessionSchema = new mongoose.Schema({
  waId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },
  /** Registration flow: welcome | first_name | last_name | email | phone_confirm | phone_input | password | otp | done | login_email | login_password */
  step: {
    type: String,
    default: 'welcome',
    enum: ['welcome', 'first_name', 'last_name', 'email', 'phone', 'phone_confirm', 'phone_input', 'password', 'otp', 'done', 'login_email', 'login_password']
  },
  /** Partial registration data collected so far; loginEmail used during login flow */
  registrationData: {
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    password: { type: String },
    loginEmail: { type: String, trim: true, lowercase: true }
  },
  /** After user is created, we may need to verify OTP */
  pendingUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('WhatsAppSession', whatsAppSessionSchema);
