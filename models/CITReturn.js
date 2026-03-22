const mongoose = require('mongoose');

const citReturnSchema = new mongoose.Schema({
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxableProfile',
    required: true,
    index: true
  },
  year: {
    type: Number,
    required: true,
    min: 2020,
    max: 2100
  },
  // Financial statements
  financials: {
    revenue: { type: Number, default: 0, min: 0 },
    otherIncome: { type: Number, default: 0, min: 0 },
    costOfSales: { type: Number, default: 0, min: 0 },
    operatingExpenses: { type: Number, default: 0, min: 0 },
    depreciation: { type: Number, default: 0, min: 0 },
    interestPaid: { type: Number, default: 0, min: 0 },
    otherExpenses: { type: Number, default: 0, min: 0 }
  },
  // Tax adjustments
  taxAdjustments: {
    disallowableExpenses: [{
      description: { type: String, trim: true },
      amount: { type: Number, default: 0, min: 0 }
    }],
    capitalAllowances: [{
      description: { type: String, trim: true },
      amount: { type: Number, default: 0, min: 0 }
    }],
    pioneerRelief: { type: Number, default: 0, min: 0 },
    otherDeductions: { type: Number, default: 0, min: 0 }
  },
  // Quarterly assessment installments
  quarterlyAssessments: [{
    quarter: { type: Number, min: 1, max: 4 },
    dueDate: { type: Date },
    amount: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'paid', 'deferred', 'overdue'],
      default: 'pending'
    },
    paidAt: { type: Date },
    deferredAt: { type: Date }
  }],
  estimatedAnnualProfit: { type: Number, default: 0, min: 0 },
  payCitQuarterly: { type: Boolean, default: false },
  // Computed fields
  accountingProfit: { type: Number, default: 0 },
  totalDisallowable: { type: Number, default: 0 },
  totalCapitalAllowances: { type: Number, default: 0 },
  adjustedTaxableProfit: { type: Number, default: 0 },
  citTaxRate: { type: Number, default: 30 },
  grossCitOwed: { type: Number, default: 0 },
  tertiaryEducationTax: { type: Number, default: 0 },
  totalWhtCreditsApplied: { type: Number, default: 0 },
  quarterlyInstallmentsPaid: { type: Number, default: 0 },
  netCitPayable: { type: Number, default: 0 },
  status: {
    type: String,
    enum: ['draft', 'submitted', 'filed'],
    default: 'draft'
  },
  filed: { type: Boolean, default: false },
  filedAt: { type: Date },
  filingId: { type: String }
}, { timestamps: true });

// One CIT return per profile per year
citReturnSchema.index({ profileId: 1, year: 1 }, { unique: true });

module.exports = mongoose.model('CITReturn', citReturnSchema);
