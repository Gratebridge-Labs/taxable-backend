const mongoose = require('mongoose');

const taxProfileSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true
  },
  account: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Account',
    required: [true, 'Account is required'],
    index: true
  },
  taxYear: {
    type: Number,
    required: [true, 'Tax year is required'],
    min: [2000, 'Tax year must be after 2000'],
    max: [2100, 'Tax year must be before 2100']
  },
  annualIncomeEstimate: {
    type: Number,
    default: 0,
    min: [0, 'Annual income cannot be negative']
  },
  totalDeductions: {
    type: Number,
    default: 0,
    min: [0, 'Deductions cannot be negative']
  },
  estimatedTaxLiability: {
    type: Number,
    default: 0,
    min: [0, 'Tax liability cannot be negative']
  },
  effectiveTaxRate: {
    type: Number,
    default: 0,
    min: [0, 'Tax rate cannot be negative'],
    max: [100, 'Tax rate cannot exceed 100%']
  },
  lastCalculatedAt: {
    type: Date,
    default: null
  },
  calculationBreakdown: {
    taxableIncome: { type: Number, default: 0 },
    exemption: { type: Number, default: 0 },
    bracket1: { type: Number, default: 0 },
    bracket2: { type: Number, default: 0 }
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Ensure one tax profile per account per year
taxProfileSchema.index({ account: 1, taxYear: 1 }, { unique: true });

// Index for queries
taxProfileSchema.index({ account: 1, taxYear: -1 });
taxProfileSchema.index({ user: 1, account: 1, taxYear: -1 });

// Virtual for weekly estimate
taxProfileSchema.virtual('weeklyEstimate').get(function() {
  return this.estimatedTaxLiability > 0 
    ? Math.round((this.estimatedTaxLiability / 52) * 100) / 100 
    : 0;
});

// Virtual for monthly estimate
taxProfileSchema.virtual('monthlyEstimate').get(function() {
  return this.estimatedTaxLiability > 0 
    ? Math.round((this.estimatedTaxLiability / 12) * 100) / 100 
    : 0;
});

// Ensure virtuals are included in JSON
taxProfileSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('TaxProfile', taxProfileSchema);

