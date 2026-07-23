const mongoose = require('mongoose');

const WHT_TYPES = ['consultancy', 'contracts', 'transport', 'rent', 'director_fees'];
const WHT_RATES = [5, 10];

const whtDeductionSchema = new mongoose.Schema({
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxableProfile',
    required: true,
    index: true
  },
  payee: { type: String, required: true, trim: true },
  tin: { type: String, trim: true },
  whtType: {
    type: String,
    required: true,
    enum: WHT_TYPES
  },
  gross: { type: Number, required: true, min: 0 },
  whtRate: {
    type: Number,
    required: true,
    enum: WHT_RATES
  },
  whtDeducted: { type: Number, required: true, min: 0 },
  netPaid: { type: Number, required: true, min: 0 },
  date: { type: Date },
  receiptUrl: { type: String },
  month: { type: Number, min: 1, max: 12, required: true },
  year: { type: Number, required: true, min: 2020, max: 2100 },
  status: {
    type: String,
    enum: ['draft', 'filed'],
    default: 'draft'
  },
  filedAt: { type: Date }
}, { timestamps: true });

whtDeductionSchema.index({ profileId: 1, year: 1 });
whtDeductionSchema.index({ profileId: 1, year: 1, month: 1 });

whtDeductionSchema.pre('save', function (next) {
  if (!this.month && this.date) {
    this.month = new Date(this.date).getMonth() + 1;
  }
  // Always derive amounts from gross + rate
  const gross = Number(this.gross) || 0;
  const rate = Number(this.whtRate) || 0;
  this.whtDeducted = Math.round(gross * (rate / 100));
  this.netPaid = Math.max(0, gross - this.whtDeducted);
  next();
});

const WHTDeduction = mongoose.model('WHTDeduction', whtDeductionSchema);
WHTDeduction.WHT_TYPES = WHT_TYPES;
WHTDeduction.WHT_RATES = WHT_RATES;

module.exports = WHTDeduction;
