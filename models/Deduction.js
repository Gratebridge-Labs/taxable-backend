const mongoose = require('mongoose');

const deductionSchema = new mongoose.Schema({
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxableProfile',
    required: [true, 'Profile ID is required'],
    index: true
  },
  deductionType: {
    type: String,
    required: [true, 'Deduction type is required'],
    enum: ['nhf', 'nhis', 'pension', 'life_insurance', 'mortgage_interest', 'rent_relief', 'transport_allowance', 'other'],
    index: true
  },
  // NHF Contribution
  nhf: {
    contribution: {
      type: Number,
      min: 0
    },
    basicSalary: Number, // For auto-calculation
    autoCalculated: {
      type: Boolean,
      default: false
    }
  },
  // NHIS Contribution
  nhis: {
    contribution: {
      type: Number,
      min: 0
    }
  },
  // Pension Contribution
  pension: {
    contribution: {
      type: Number,
      min: 0
    },
    pensionFundAdministrator: String,
    totalIncome: Number, // For limit validation (25% of income)
    autoCalculated: {
      type: Boolean,
      default: false
    }
  },
  // Life Insurance
  lifeInsurance: {
    premium: {
      type: Number,
      min: 0
    },
    insuranceCompany: String,
    coverageType: {
      type: String,
      enum: ['self', 'spouse', 'both']
    }
  },
  // Mortgage Interest
  mortgageInterest: {
    interestPaid: {
      type: Number,
      min: 0
    },
    lenderName: String,
    propertyAddress: {
      streetAddress: String,
      city: String,
      state: String
    }
  },
  // Rent Relief
  rentRelief: {
    annualRent: {
      type: Number,
      min: 0
    },
    reliefAmount: {
      type: Number,
      min: 0,
      max: 500000 // Capped at ₦500,000
    },
    propertyAddress: {
      streetAddress: String,
      city: String,
      state: String
    },
    hasReceipts: Boolean,
    autoCalculated: {
      type: Boolean,
      default: true // Always auto-calculated
    }
  },
  // Transport Allowance
  transportAllowance: {
    amount: {
      type: Number,
      min: 0,
      max: 200000 // Capped at ₦200,000
    }
  },
  // Other deductions
  other: {
    description: String,
    amount: {
      type: Number,
      min: 0
    },
    justification: String
  },
  // Common fields
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  period: {
    startDate: Date,
    endDate: Date,
    year: {
      type: Number,
      required: true
    }
  },
  // Validation
  isValid: {
    type: Boolean,
    default: true
  },
  validationMessage: String,
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

deductionSchema.index({ profileId: 1, deductionType: 1 });
deductionSchema.index({ profileId: 1, 'period.year': 1 });

deductionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  
  // Auto-calculate amount based on deductionType
  if (this.deductionType === 'nhf' && this.nhf) {
    this.amount = this.nhf.contribution || 0;
    // Auto-calculate if basic salary provided
    if (this.nhf.basicSalary && this.nhf.basicSalary > 360000) {
      const calculated = this.nhf.basicSalary * 0.025;
      if (!this.nhf.contribution || this.nhf.autoCalculated) {
        this.nhf.contribution = calculated;
        this.amount = calculated;
        this.nhf.autoCalculated = true;
      }
    }
  } else if (this.deductionType === 'nhis' && this.nhis) {
    this.amount = this.nhis.contribution || 0;
  } else if (this.deductionType === 'pension' && this.pension) {
    this.amount = this.pension.contribution || 0;
    // Validate 25% limit
    if (this.pension.totalIncome && this.amount > this.pension.totalIncome * 0.25) {
      this.isValid = false;
      this.validationMessage = `Pension deduction exceeds 25% of income (max: ₦${this.pension.totalIncome * 0.25})`;
    }
  } else if (this.deductionType === 'life_insurance' && this.lifeInsurance) {
    this.amount = this.lifeInsurance.premium || 0;
  } else if (this.deductionType === 'mortgage_interest' && this.mortgageInterest) {
    this.amount = this.mortgageInterest.interestPaid || 0;
  } else if (this.deductionType === 'rent_relief' && this.rentRelief) {
    // Auto-calculate rent relief (20% of rent, max ₦500k)
    if (this.rentRelief.annualRent) {
      const calculated = Math.min(this.rentRelief.annualRent * 0.20, 500000);
      this.rentRelief.reliefAmount = calculated;
      this.amount = calculated;
      this.rentRelief.autoCalculated = true;
    }
  } else if (this.deductionType === 'transport_allowance' && this.transportAllowance) {
    this.amount = Math.min(this.transportAllowance.amount || 0, 200000);
  } else if (this.deductionType === 'other' && this.other) {
    this.amount = this.other.amount || 0;
  }
  
  next();
});

module.exports = mongoose.model('Deduction', deductionSchema);

