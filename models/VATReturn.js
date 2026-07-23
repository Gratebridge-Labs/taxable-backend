const mongoose = require('mongoose');

const VAT_RATE = 0.075; // 7.5%

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

  // Output VAT (Sales)
  standardSales: { type: Number, default: 0, min: 0 },
  exemptSales: { type: Number, default: 0, min: 0 },
  wvatCredit: { type: Number, default: 0, min: 0 },

  // Input VAT (Purchases)
  allowableInputVAT: { type: Number, default: 0, min: 0 },
  nonAllowableOverheads: { type: Number, default: 0, min: 0 },
  nonAllowableCapEx: { type: Number, default: 0, min: 0 },

  // Adjustments
  broughtForwardCredit: { type: Number, default: 0, min: 0 },

  // Computed (server)
  outputVAT: { type: Number, default: 0, min: 0 },
  netPosition: { type: Number, default: 0 }, // signed: >0 payable, <0 credit
  vatCreditCarryForward: { type: Number, default: 0, min: 0 },

  // Supporting documents (URLs after upload)
  salesScheduleUrl: { type: String },
  purchaseInvoicesUrl: { type: String },

  status: {
    type: String,
    enum: ['draft', 'filed'],
    default: 'draft'
  },
  disclaimerAccepted: { type: Boolean, default: false },
  filedAt: { type: Date },
  filingId: { type: String }
}, { timestamps: true });

vatReturnSchema.index({ profileId: 1, year: 1, month: 1 }, { unique: true });

vatReturnSchema.pre('save', function (next) {
  this.outputVAT = Math.round((this.standardSales || 0) * VAT_RATE);

  // Net = outputVAT - allowableInputVAT - wvatCredit - broughtForwardCredit
  const net = this.outputVAT
    - (this.allowableInputVAT || 0)
    - (this.wvatCredit || 0)
    - (this.broughtForwardCredit || 0);

  this.netPosition = Math.round(net);
  this.vatCreditCarryForward = net < 0 ? Math.abs(Math.round(net)) : 0;
  next();
});

vatReturnSchema.statics.VAT_RATE = VAT_RATE;

module.exports = mongoose.model('VATReturn', vatReturnSchema);
