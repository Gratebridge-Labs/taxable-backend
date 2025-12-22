const mongoose = require('mongoose');
const TAX_CONSTANTS = require('../config/constants');

const transactionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true
  },
  document: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Document',
    default: null // null for manually entered transactions
  },
  transactionType: {
    type: String,
    required: [true, 'Transaction type is required'],
    enum: Object.values(TAX_CONSTANTS.TRANSACTION_TYPES),
    index: true
  },
  category: {
    type: String,
    required: true,
    enum: [
      ...TAX_CONSTANTS.INCOME_CATEGORIES,
      ...TAX_CONSTANTS.EXPENSE_CATEGORIES
    ]
  },
  amount: {
    type: Number,
    required: [true, 'Amount is required'],
    min: [0, 'Amount must be positive']
  },
  description: {
    type: String,
    trim: true
  },
  narration: {
    type: String, // Bank statement narration/remarks
    trim: true
  },
  transactionDate: {
    type: Date,
    required: [true, 'Transaction date is required'],
    index: true
  },
  source: {
    type: String,
    enum: ['bank_statement', 'manual_entry', 'receipt', 'invoice', 'pay_slip'],
    default: 'manual_entry'
  },
  isTaxDeductible: {
    type: Boolean,
    default: false
  },
  vatApplicable: {
    type: Boolean,
    default: false
  },
  vatAmount: {
    type: Number,
    default: 0
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed, // Store additional data like reference numbers
    default: {}
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
transactionSchema.index({ user: 1, transactionDate: -1 });
transactionSchema.index({ user: 1, transactionType: 1, transactionDate: -1 });
transactionSchema.index({ user: 1, category: 1 });
transactionSchema.index({ document: 1 });

// Virtual for formatted amount
transactionSchema.virtual('formattedAmount').get(function() {
  return `₦${this.amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
});

// Ensure virtuals are included in JSON
transactionSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Transaction', transactionSchema);

