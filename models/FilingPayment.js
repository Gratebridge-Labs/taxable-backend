const mongoose = require('mongoose');

/** One-time payments: accountant review (₦30k) or filing fee (₦25k). Paystack reference stored for webhook. */
const filingPaymentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  profileId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxableProfile', required: true, index: true },
  type: {
    type: String,
    required: true,
    enum: ['accountant_review', 'filing_fee']
  },
  amountKobo: { type: Number, required: true },
  paystackReference: { type: String, required: true, index: true },
  status: { type: String, enum: ['pending', 'completed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

filingPaymentSchema.index({ paystackReference: 1 });
filingPaymentSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

module.exports = mongoose.model('FilingPayment', filingPaymentSchema);
