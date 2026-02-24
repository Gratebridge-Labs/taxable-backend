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
  /** Registration flow: welcome | first_name | last_name | email | phone | password | otp | done */
  step: {
    type: String,
    default: 'welcome',
    enum: ['welcome', 'first_name', 'last_name', 'email', 'phone', 'password', 'otp', 'done']
  },
  /** Partial registration data collected so far */
  registrationData: {
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    password: { type: String }
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
