const mongoose = require('mongoose');
const TAX_CONSTANTS = require('../config/constants');

const reportSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true
  },
  taxProfile: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxProfile',
    default: null
  },
  reportType: {
    type: String,
    required: [true, 'Report type is required'],
    enum: Object.values(TAX_CONSTANTS.REPORT_TYPES),
    index: true
  },
  periodStart: {
    type: Date,
    required: [true, 'Period start date is required']
  },
  periodEnd: {
    type: Date,
    required: [true, 'Period end date is required']
  },
  totalIncome: {
    type: Number,
    default: 0,
    min: [0, 'Total income cannot be negative']
  },
  totalExpenses: {
    type: Number,
    default: 0,
    min: [0, 'Total expenses cannot be negative']
  },
  totalDeductions: {
    type: Number,
    default: 0,
    min: [0, 'Total deductions cannot be negative']
  },
  taxableIncome: {
    type: Number,
    default: 0,
    min: [0, 'Taxable income cannot be negative']
  },
  estimatedTax: {
    type: Number,
    default: 0,
    min: [0, 'Estimated tax cannot be negative']
  },
  effectiveTaxRate: {
    type: Number,
    default: 0,
    min: [0, 'Tax rate cannot be negative'],
    max: [100, 'Tax rate cannot exceed 100%']
  },
  tips: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },
  suggestions: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },
  reportData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  summary: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  categoryBreakdown: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  generatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
reportSchema.index({ user: 1, generatedAt: -1 });
reportSchema.index({ user: 1, reportType: 1, generatedAt: -1 });
reportSchema.index({ user: 1, periodStart: 1, periodEnd: 1 });

// Virtual for net amount
reportSchema.virtual('netAmount').get(function() {
  return (this.totalIncome || 0) - (this.totalExpenses || 0);
});

// Virtual for formatted period
reportSchema.virtual('periodLabel').get(function() {
  if (this.reportType === TAX_CONSTANTS.REPORT_TYPES.WEEKLY) {
    return `Week of ${this.periodStart.toLocaleDateString()}`;
  } else if (this.reportType === TAX_CONSTANTS.REPORT_TYPES.MONTHLY) {
    return this.periodStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } else if (this.reportType === TAX_CONSTANTS.REPORT_TYPES.ANNUAL) {
    return this.periodStart.getFullYear().toString();
  }
  return `${this.periodStart.toLocaleDateString()} - ${this.periodEnd.toLocaleDateString()}`;
});

// Ensure virtuals are included in JSON
reportSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Report', reportSchema);

