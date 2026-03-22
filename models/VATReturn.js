const mongoose = require('mongoose');

const vatReturnSchema = new mongoose.Schema({
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxableProfile',
    required: true,
    index: true
  },
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  year: {
    type: Number,
    required: true,
    min: 2020,
    max: 2100
  },
  totalSales: { type: Number, required: true, min: 0 },
  zeroRatedSales: { type: Number, default: 0, min: 0 },
  exemptSales: { type: Number, default: 0, min: 0 },
  totalPurchases: { type: Number, required: true, min: 0 },
  // Computed fields (server-side at 7.5% VAT rate)
  taxableSales: { type: Number, default: 0, min: 0 },
  outputVat: { type: Number, default: 0, min: 0 },
  inputVat: { type: Number, default: 0, min: 0 },
  netVatPayable: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['draft', 'filed'],
    default: 'draft'
  },
  filedAt: { type: Date },
  filingId: { type: String }
}, { timestamps: true });

// One return per profile per month per year
vatReturnSchema.index({ profileId: 1, year: 1, month: 1 }, { unique: true });

const VAT_RATE = 0.075; // 7.5%

// Compute VAT amounts before save
vatReturnSchema.pre('save', function (next) {
  this.taxableSales = (this.totalSales || 0) - (this.zeroRatedSales || 0) - (this.exemptSales || 0);
  this.outputVat = Math.round(this.taxableSales * VAT_RATE);
  this.inputVat = Math.round((this.totalPurchases || 0) * VAT_RATE);
  this.netVatPayable = this.outputVat - this.inputVat;
  next();
});

module.exports = mongoose.model('VATReturn', vatReturnSchema);
