const mongoose = require('mongoose');

const incomeSourceSchema = new mongoose.Schema({
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxableProfile',
    required: [true, 'Profile ID is required'],
    index: true
  },
  incomeType: {
    type: String,
    required: [true, 'Income type is required'],
    enum: ['employment', 'business', 'rental', 'investment', 'other'],
    index: true
  },
  // Employment income details
  employment: {
    employerName: String,
    employerTIN: String,
    employerAddress: {
      streetAddress: String,
      city: String,
      state: String,
      postalCode: String
    },
    employmentStartDate: Date,
    employmentEndDate: Date,
    annualGrossSalary: {
      type: Number,
      min: 0
    },
    basicSalary: {
      type: Number,
      min: 0
    },
    housingAllowance: {
      type: Number,
      min: 0
    },
    transportAllowance: {
      type: Number,
      min: 0,
      max: 200000
    },
    payeDeducted: {
      type: Number,
      min: 0
    },
    benefitsInKind: [{
      benefitType: String,
      value: Number,
      description: String
    }]
  },
  // Business income details
  business: {
    businessName: String,
    businessAddress: {
      streetAddress: String,
      city: String,
      state: String,
      postalCode: String
    },
    businessType: String,
    annualRevenue: {
      type: Number,
      min: 0
    },
    revenueBySource: [{
      source: String,
      amount: Number,
      description: String
    }]
  },
  // Rental income details
  rental: {
    properties: [{
      propertyAddress: {
        streetAddress: String,
        city: String,
        state: String
      },
      annualRentalIncome: {
        type: Number,
        min: 0
      },
      repairs: {
        type: Number,
        min: 0
      },
      managementFees: {
        type: Number,
        min: 0
      },
      insurance: {
        type: Number,
        min: 0
      },
      interestOnLoan: {
        type: Number,
        min: 0
      },
      otherExpenses: {
        type: Number,
        min: 0
      }
    }]
  },
  // Investment income details
  investment: {
    incomeItems: [{
      incomeType: {
        type: String,
        enum: ['dividends_nigerian', 'dividends_foreign', 'interest_savings', 'interest_bonds', 'interest_fixed_deposit', 'capital_gains_shares', 'capital_gains_property', 'other']
      },
      amount: {
        type: Number,
        min: 0
      },
      taxWithheld: {
        type: Number,
        min: 0
      },
      source: String
    }]
  },
  // Other income
  other: {
    description: String,
    amount: {
      type: Number,
      min: 0
    },
    source: String
  },
  // Common fields
  period: {
    startDate: Date,
    endDate: Date,
    year: {
      type: Number,
      required: true
    },
    month: Number // Optional, for monthly tracking
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  // Auto-calculated fields
  netAmount: {
    type: Number,
    min: 0
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

incomeSourceSchema.index({ profileId: 1, incomeType: 1 });
incomeSourceSchema.index({ profileId: 1, 'period.year': 1, 'period.month': 1 });

incomeSourceSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Auto-calculate totalAmount based on incomeType
  if (this.incomeType === 'employment' && this.employment) {
    this.totalAmount = this.employment.annualGrossSalary || 0;
  } else if (this.incomeType === 'business' && this.business) {
    this.totalAmount = this.business.annualRevenue || 0;
  } else if (this.incomeType === 'rental' && this.rental && this.rental.properties) {
    const totalIncome = this.rental.properties.reduce((sum, prop) => sum + (prop.annualRentalIncome || 0), 0);
    const totalExpenses = this.rental.properties.reduce((sum, prop) => 
      sum + (prop.repairs || 0) + (prop.managementFees || 0) + (prop.insurance || 0) + 
      (prop.interestOnLoan || 0) + (prop.otherExpenses || 0), 0);
    this.totalAmount = totalIncome;
    this.netAmount = totalIncome - totalExpenses;
  } else if (this.incomeType === 'investment' && this.investment && this.investment.incomeItems) {
    this.totalAmount = this.investment.incomeItems.reduce((sum, item) => sum + (item.amount || 0), 0);
  } else if (this.incomeType === 'other' && this.other) {
    this.totalAmount = this.other.amount || 0;
  }
  
  next();
});

module.exports = mongoose.model('IncomeSource', incomeSourceSchema);

