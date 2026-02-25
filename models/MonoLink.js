const mongoose = require('mongoose');

/**
 * Stores Mono account links per user/profile so we can fetch income and show "connected" in WhatsApp.
 */
const monoLinkSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  profileId: {
    type: String,
    trim: true,
    index: true,
    required: false
  },
  /** Mono account id (returned by Mono after successful link; set when webhook fires) */
  monoAccountId: {
    type: String,
    required: false,
    unique: true,
    sparse: true,
    trim: true,
    index: true
  },
  /** Reference we sent in meta.ref when initiating (for webhook matching) */
  ref: {
    type: String,
    trim: true,
    index: true,
    required: false
  },
  status: {
    type: String,
    enum: ['pending', 'linked', 'unlinked', 'error'],
    default: 'pending'
  },
  /** Cached income summary (optional; can refetch from Mono) */
  incomeSnapshot: {
    type: mongoose.Schema.Types.Mixed,
    required: false
  },
  lastIncomeFetchAt: {
    type: Date,
    required: false
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

monoLinkSchema.index({ user: 1, profileId: 1 });
monoLinkSchema.index({ ref: 1 }, { sparse: true });

module.exports = mongoose.model('MonoLink', monoLinkSchema);
