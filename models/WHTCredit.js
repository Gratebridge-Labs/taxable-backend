const mongoose = require('mongoose');

/** Default WHT rates (%) for credits the business suffered. */
const WHT_CREDIT_RATES = {
  services: 5,
  rent: 10,
  dividends: 10,
  interest: 10,
  royalties: 10,
  construction: 2.5,
  haulage: 5
};

const WHT_CREDIT_TYPES = Object.keys(WHT_CREDIT_RATES);

const whtCreditSchema = new mongoose.Schema({
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
    enum: WHT_CREDIT_TYPES
  },
  gross: { type: Number, required: true, min: 0 },
  whtRate: { type: Number, required: true, min: 0, max: 100 },
  /** Amount of WHT suffered — used by CIT as a credit against CIT payable */
  whtAmount: { type: Number, required: true, min: 0 },
  date: { type: Date },
  receiptUrl: { type: String },
  month: { type: Number, min: 1, max: 12, required: true },
  year: { type: Number, required: true, min: 2020, max: 2100 },
  status: {
    type: String,
    enum: ['active', 'applied'],
    default: 'active'
  }
}, { timestamps: true });

whtCreditSchema.index({ profileId: 1, year: 1 });
whtCreditSchema.index({ profileId: 1, year: 1, month: 1 });

whtCreditSchema.pre('save', function (next) {
  if (!this.month && this.date) {
    this.month = new Date(this.date).getMonth() + 1;
  }
  if (this.whtRate == null && this.whtType && WHT_CREDIT_RATES[this.whtType] != null) {
    this.whtRate = WHT_CREDIT_RATES[this.whtType];
  }
  const gross = Number(this.gross) || 0;
  const rate = Number(this.whtRate) || 0;
  this.whtAmount = Math.round(gross * (rate / 100));
  next();
});

const WHTCredit = mongoose.model('WHTCredit', whtCreditSchema);
WHTCredit.WHT_CREDIT_TYPES = WHT_CREDIT_TYPES;
WHTCredit.WHT_CREDIT_RATES = WHT_CREDIT_RATES;

module.exports = WHTCredit;
