const mongoose = require('mongoose');

/**
 * Tracks user subscriptions (one-time or recurring) paid via Paystack.
 * When webhook confirms payment, status becomes 'active' and user gets email.
 */
const subscriptionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  /** Plan identifier (e.g. 'basic', 'pro', 'annual') */
  plan: {
    type: String,
    trim: true,
    required: true,
    index: true
  },
  /** Human-readable plan name for emails */
  planName: {
    type: String,
    trim: true,
    default: 'Subscription'
  },
  /** Amount in kobo (Paystack subunit) */
  amountKobo: {
    type: Number,
    required: true
  },
  /** Paystack transaction reference (unique per transaction) */
  paystackReference: {
    type: String,
    trim: true,
    index: true,
    sparse: true
  },
  /** Paystack subscription code if this is a recurring subscription */
  paystackSubscriptionCode: {
    type: String,
    trim: true,
    sparse: true
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'failed', 'cancelled'],
    default: 'pending',
    index: true
  },
  /** When payment was confirmed (webhook) */
  paidAt: {
    type: Date
  },
  /** Optional: period end for recurring (e.g. next billing date) */
  currentPeriodEnd: {
    type: Date
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, { timestamps: true });

subscriptionSchema.index({ user: 1, plan: 1, status: 1 });
subscriptionSchema.index({ paystackReference: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Subscription', subscriptionSchema);
