const mongoose = require('mongoose');

const taxCalculationSchema = new mongoose.Schema({
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxableProfile',
    required: [true, 'Profile ID is required'],
    index: true
  },
  calculationType: {
    type: String,
    required: true,
    enum: ['monthly', 'annual', 'estimate'],
    default: 'annual'
  },
  period: {
    year: {
      type: Number,
      required: true
    },
    month: Number, // For monthly calculations
    startDate: Date,
    endDate: Date
  },
  // Income totals
  income: {
    totalIncome: {
      type: Number,
      required: true,
      validate: {
        validator: function(v) { return v >= 0; },
        message: 'Total income must be >= 0'
      }
    },
    employmentIncome: {
      type: Number,
      default: 0
    },
    businessIncome: {
      type: Number,
      default: 0
    },
    rentalIncome: {
      type: Number,
      default: 0
    },
    investmentIncome: {
      type: Number,
      default: 0
    },
    otherIncome: {
      type: Number,
      default: 0
    }
  },
  // Deductions
  deductions: {
    totalDeductions: {
      type: Number,
      required: true,
      validate: {
        validator: function(v) { return v >= 0; },
        message: 'Total deductions must be >= 0'
      }
    },
    nhf: {
      type: Number,
      default: 0
    },
    nhis: {
      type: Number,
      default: 0
    },
    pension: {
      type: Number,
      default: 0
    },
    lifeInsurance: {
      type: Number,
      default: 0
    },
    mortgageInterest: {
      type: Number,
      default: 0
    },
    rentRelief: {
      type: Number,
      default: 0
    },
    transportAllowance: {
      type: Number,
      default: 0
    },
    other: {
      type: Number,
      default: 0
    }
  },
  // Business expenses (for business profiles)
  businessExpenses: {
    totalExpenses: {
      type: Number,
      default: 0
    },
    operatingExpenses: {
      type: Number,
      default: 0
    },
    capitalAllowances: {
      type: Number,
      default: 0
    },
    rdDeduction: {
      type: Number,
      default: 0
    },
    donationDeduction: {
      type: Number,
      default: 0
    }
  },
  // Tax calculation
  taxCalculation: {
    chargeableIncome: {
      type: Number,
      required: true,
      validate: {
        validator: function(v) { return v >= 0; },
        message: 'Chargeable income must be >= 0'
      }
    },
    // For individuals - progressive brackets
    individualTax: {
      bracket1: {
        range: {
          min: { type: Number, default: 0 },
          max: { type: Number, default: 800000 }
        },
        incomeInBracket: Number,
        rate: { type: Number, default: 0.00 },
        tax: Number
      },
      bracket2: {
        range: {
          min: { type: Number, default: 800001 },
          max: { type: Number, default: 3000000 }
        },
        incomeInBracket: Number,
        rate: { type: Number, default: 0.15 },
        tax: Number
      },
      bracket3: {
        range: {
          min: { type: Number, default: 3000001 },
          max: { type: Number, default: 12000000 }
        },
        incomeInBracket: Number,
        rate: { type: Number, default: 0.18 },
        tax: Number
      },
      bracket4: {
        range: {
          min: { type: Number, default: 12000001 },
          max: { type: Number, default: 25000000 }
        },
        incomeInBracket: Number,
        rate: { type: Number, default: 0.21 },
        tax: Number
      },
      bracket5: {
        range: {
          min: { type: Number, default: 25000001 },
          max: { type: Number, default: 50000000 }
        },
        incomeInBracket: Number,
        rate: { type: Number, default: 0.23 },
        tax: Number
      },
      bracket6: {
        range: {
          min: { type: Number, default: 50000001 },
          max: { type: Number, default: null }
        },
        incomeInBracket: Number,
        rate: { type: Number, default: 0.25 },
        tax: Number
      },
      totalTax: {
        type: Number,
        default: 0
      }
    },
    // For companies
    companyTax: {
      isSmallCompany: Boolean,
      taxRate: {
        type: Number,
        default: 0.30
      },
      assessableProfit: Number,
      companyTax: {
        type: Number,
        default: 0
      },
      developmentLevy: {
        type: Number,
        default: 0
      }
    }
  },
  // Credits and payments
  credits: {
    payeDeducted: {
      type: Number,
      default: 0
    },
    taxWithheldAtSource: {
      type: Number,
      default: 0
    },
    totalCredits: {
      type: Number,
      default: 0
    }
  },
  // Final result
  finalTaxLiability: {
    type: Number,
    required: true
  },
  isRefund: {
    type: Boolean,
    default: false
  },
  // Breakdown (stored as JSON for flexibility)
  breakdown: {
    type: mongoose.Schema.Types.Mixed
  },
  // Status
  status: {
    type: String,
    enum: ['draft', 'final', 'submitted'],
    default: 'draft'
  },
  calculatedAt: {
    type: Date,
    default: Date.now
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

taxCalculationSchema.index({ profileId: 1, 'period.year': 1, 'period.month': 1 });
taxCalculationSchema.index({ profileId: 1, calculatedAt: -1 });

taxCalculationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Calculate final tax liability
  let totalTax = 0;
  if (this.taxCalculation.individualTax) {
    totalTax = this.taxCalculation.individualTax.totalTax || 0;
  } else if (this.taxCalculation.companyTax) {
    totalTax = (this.taxCalculation.companyTax.companyTax || 0) + 
                (this.taxCalculation.companyTax.developmentLevy || 0);
  }
  
  const totalCredits = (this.credits.payeDeducted || 0) + 
                       (this.credits.taxWithheldAtSource || 0);
  
  this.credits.totalCredits = totalCredits;
  this.finalTaxLiability = totalTax - totalCredits;
  this.isRefund = this.finalTaxLiability < 0;
  
  next();
});

module.exports = mongoose.model('TaxCalculation', taxCalculationSchema);

