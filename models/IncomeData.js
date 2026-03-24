const mongoose = require('mongoose');

const incomeDataSchema = new mongoose.Schema({
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxableProfile',
    required: true,
    index: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  year: {
    type: Number,
    required: true,
    index: true
  },
  filingPreference: {
    type: String,
    enum: ['monthly', 'annual'],
    required: true
  },
  // Monthly records keyed by month number string: "1"..."12"
  monthlyIncomes: {
    type: Map,
    of: [mongoose.Schema.Types.Mixed],
    default: {}
  },
  // Annual: array of income objects
  annualIncomes: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound index for fast lookups
incomeDataSchema.index({ profileId: 1, year: 1 }, { unique: true });
incomeDataSchema.index({ userId: 1, year: 1 });

// Update updatedAt on save
incomeDataSchema.pre('save', function(next) {
  this.updatedAt = Date.now();

  // Keep only valid month keys (1..12) in monthlyIncomes map
  if (this.monthlyIncomes && this.monthlyIncomes instanceof Map) {
    for (const key of this.monthlyIncomes.keys()) {
      const month = Number(key);
      if (!Number.isInteger(month) || month < 1 || month > 12) {
        this.monthlyIncomes.delete(key);
      }
    }
  }

  next();
});

module.exports = mongoose.model('IncomeData', incomeDataSchema);