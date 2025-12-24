const mongoose = require('mongoose');

const historySchema = new mongoose.Schema({
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
  snapshotType: {
    type: String,
    required: [true, 'Snapshot type is required'],
    enum: ['weekly', 'monthly', 'annual'],
    index: true
  },
  snapshotDate: {
    type: Date,
    required: [true, 'Snapshot date is required'],
    index: true
  },
  // Period information
  periodStart: {
    type: Date,
    required: true
  },
  periodEnd: {
    type: Date,
    required: true
  },
  // Financial summary
  totalIncome: {
    type: Number,
    default: 0
  },
  totalExpenses: {
    type: Number,
    default: 0
  },
  totalDeductions: {
    type: Number,
    default: 0
  },
  netAmount: {
    type: Number,
    default: 0
  },
  // Tax information
  estimatedTax: {
    type: Number,
    default: 0
  },
  effectiveTaxRate: {
    type: Number,
    default: 0
  },
  // Transaction counts
  transactionCount: {
    type: Number,
    default: 0
  },
  incomeTransactionCount: {
    type: Number,
    default: 0
  },
  expenseTransactionCount: {
    type: Number,
    default: 0
  },
  // Category breakdown
  categoryBreakdown: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  // Additional metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
historySchema.index({ account: 1, snapshotDate: -1 });
historySchema.index({ account: 1, snapshotType: 1, snapshotDate: -1 });
historySchema.index({ user: 1, account: 1, snapshotType: 1, snapshotDate: -1 });
// Unique constraint: one snapshot per account per period
historySchema.index({ account: 1, snapshotType: 1, periodStart: 1, periodEnd: 1 }, { unique: true });

module.exports = mongoose.model('History', historySchema);

