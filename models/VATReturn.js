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

  // ── Step 2: Output VAT (Sales) ──
  standardSales: { type: Number, default: 0, min: 0 },        // sales taxable at 7.5% (cash received)
  exemptZeroRatedSales: { type: Number, default: 0, min: 0 }, // exempt / zero-rated sales
  wvatCredit: { type: Number, default: 0, min: 0 },           // Withholding VAT (WVAT) credit

  // ── Step 3: Input VAT (Purchases) ──
  inputVatInventory: { type: Number, default: 0, min: 0 },    // on inventory/raw materials (ALLOWABLE)
  inputVatOverheads: { type: Number, default: 0, min: 0 },    // on operational overheads (non-allowable)
  inputVatCapex: { type: Number, default: 0, min: 0 },        // on capital expenditure (non-allowable)

  // ── Step 4: Adjustments ──
  broughtForwardCredit: { type: Number, default: 0, min: 0 }, // VAT credit carried in from prior month

  // ── Computed ──
  outputVat: { type: Number, default: 0, min: 0 },            // standardSales * 7.5%
  allowableInputVat: { type: Number, default: 0, min: 0 },    // = inputVatInventory only
  netVatPayable: { type: Number, default: 0, min: 0 },        // amount owed to FIRS (>= 0)
  vatCreditCarryForward: { type: Number, default: 0, min: 0 },// credit rolled to next month (>= 0)

  // Optional supporting documents (uploaded separately)
  salesScheduleDocId: { type: String },
  purchaseInvoicesDocId: { type: String },

  // Wizard progress (1-5) so the frontend can resume where the user left off
  currentStep: { type: Number, default: 1, min: 1, max: 5 },

  status: {
    type: String,
    enum: ['draft', 'filed'],
    default: 'draft'
  },
  confirmed: { type: Boolean, default: false },
  filedAt: { type: Date },
  filingId: { type: String }
}, { timestamps: true });

// One return per profile per month per year
vatReturnSchema.index({ profileId: 1, year: 1, month: 1 }, { unique: true });

// Compute VAT amounts before save
vatReturnSchema.pre('save', function (next) {
  this.outputVat = Math.round((this.standardSales || 0) * VAT_RATE);

  // Only VAT on inventory/raw materials for resale is claimable
  this.allowableInputVat = this.inputVatInventory || 0;

  // Net position: output VAT less allowable input VAT, WVAT credit, and any brought-forward credit
  const net = this.outputVat - this.allowableInputVat - (this.wvatCredit || 0) - (this.broughtForwardCredit || 0);

  if (net >= 0) {
    this.netVatPayable = net;
    this.vatCreditCarryForward = 0;
  } else {
    this.netVatPayable = 0;
    this.vatCreditCarryForward = Math.abs(net);
  }
  next();
});

vatReturnSchema.statics.VAT_RATE = VAT_RATE;

module.exports = mongoose.model('VATReturn', vatReturnSchema);
