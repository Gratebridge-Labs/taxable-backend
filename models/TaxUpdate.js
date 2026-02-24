const mongoose = require('mongoose');

/**
 * Short, dated Nigerian tax news/highlights for WhatsApp menu and other surfaces.
 * Keeps users in the loop on FIRS, policy changes, deadlines, and key updates.
 */
const taxUpdateSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [120, 'Title should be short for WhatsApp (max 120 chars)']
  },
  summary: {
    type: String,
    trim: true,
    maxlength: [280, 'Summary for menu (max 280 chars)']
  },
  link: {
    type: String,
    trim: true
  },
  /** e.g. 'firs', 'policy', 'deadline', 'reminder' */
  category: {
    type: String,
    trim: true,
    default: 'general'
  },
  /** Show in WhatsApp menu when true */
  active: {
    type: Boolean,
    default: true
  },
  /** Optional: show after this date (e.g. deadline) */
  effectiveFrom: { type: Date },
  /** Optional: hide after this date */
  effectiveUntil: { type: Date },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

taxUpdateSchema.index({ active: 1, effectiveUntil: 1, createdAt: -1 });

module.exports = mongoose.model('TaxUpdate', taxUpdateSchema);
