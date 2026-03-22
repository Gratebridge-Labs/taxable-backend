const mongoose = require('mongoose');

const whtDeductionSchema = new mongoose.Schema({
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxableProfile',
    required: true,
    index: true
  },
  payeeName: { type: String, required: true, trim: true },
  payeeTin: { type: String, trim: true },
  transactionDate: { type: Date, required: true },
  whtType: { type: String, required: true, trim: true },
  grossAmount: { type: Number, required: true, min: 0 },
  whtRate: { type: Number, required: true, min: 0, max: 100 },
  whtDeducted: { type: Number, required: true, min: 0 },
  netPaid: { type: Number, required: true, min: 0 },
  month: { type: Number, min: 1, max: 12 },
  year: { type: Number, required: true, min: 2020, max: 2100 },
  status: {
    type: String,
    enum: ['pending', 'remitted'],
    default: 'pending'
  },
  remittedAt: { type: Date }
}, { timestamps: true });

whtDeductionSchema.index({ profileId: 1, year: 1 });
whtDeductionSchema.index({ profileId: 1, year: 1, month: 1 });

// Derive month from transactionDate if not set
whtDeductionSchema.pre('save', function (next) {
  if (!this.month && this.transactionDate) {
    this.month = new Date(this.transactionDate).getMonth() + 1;
  }
  next();
});

module.exports = mongoose.model('WHTDeduction', whtDeductionSchema);
