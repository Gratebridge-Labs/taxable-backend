const mongoose = require('mongoose');

const taxableProfileSchema = new mongoose.Schema({
  profileId: {
    type: String,
    unique: true,
    index: true,
    required: false // Will be auto-generated in pre-save hook
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true
  },
  year: {
    type: Number,
    required: [true, 'Tax year is required'],
    min: [2020, 'Year must be 2020 or later'],
    max: [2100, 'Year must be 2100 or earlier'],
    validate: {
      validator: function(value) {
        // Year must be a valid 4-digit year
        return Number.isInteger(value) && value >= 2020 && value <= 2100;
      },
      message: 'Year must be a valid 4-digit year'
    }
  },
  profileType: {
    type: String,
    required: [true, 'Profile type is required'],
    enum: {
      values: ['Individual', 'Business', 'Joint_Spouse', 'Joint_Business'],
      message: 'Profile type must be Individual, Business, Joint_Spouse, or Joint_Business'
    }
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Author is required'],
    index: true
  },
  jointParties: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['spouse', 'business_partner', 'stakeholder']
    },
        sharePercentage: {
          type: Number,
          validate: {
            validator: function(v) { return v >= 0 && v <= 100; },
            message: 'Share percentage must be between 0 and 100'
          }
        },
    nin: {
      type: String,
      match: [/^[0-9]{11}$/, 'NIN must be exactly 11 digits']
    },
    tin: {
      type: String,
      match: [/^[0-9]{10,12}$/, 'TIN must be 10-12 digits']
    }
  }],
  primaryNIN: {
    type: String,
    match: [/^[0-9]{11}$/, 'NIN must be exactly 11 digits'],
    required: false
  },
  /** What the user wants to do with this profile: file annual returns or calculate monthly PAYE */
  intent: {
    type: String,
    enum: {
      values: ['file_returns', 'calculate_paye'],
      message: 'Intent must be file_returns or calculate_paye'
    },
    required: false
  },
  /** Primary income sources (multiple). Values: Salary / Employment, Business/Self-employment, Freelance/Consulting, Investment income, Rental income, Digital Assets/Crypto */
  primaryIncomeSources: {
    type: [String],
    default: undefined,
    validate: {
      validator: function(v) {
        if (!Array.isArray(v) || v.length === 0) return true;
        const allowed = ['Salary / Employment', 'Business/Self-employment', 'Freelance/Consulting', 'Investment income', 'Rental income', 'Digital Assets/Crypto'];
        return v.every(item => allowed.includes(item));
      },
      message: 'Each primary income source must be one of: Salary / Employment, Business/Self-employment, Freelance/Consulting, Investment income, Rental income, Digital Assets/Crypto'
    }
  },
  /** Lived in Nigeria 183+ days this tax year (determines worldwide vs Nigerian-sourced income) */
  residency183Days: { type: Boolean, required: false },
  /** Pays rent (eligible for 20% rent relief, max N500k) */
  paysRent: { type: Boolean, required: false },
  /** Annual rent amount in Naira (from WhatsApp flow). Prefer over rentMonthlyAmount. */
  rentAnnualAmount: {
    type: Number,
    min: [0, 'Rent amount cannot be negative'],
    required: false
  },
  /** @deprecated Use rentAnnualAmount. Kept for backward compatibility. */
  rentMonthlyAmount: {
    type: Number,
    min: [0, 'Rent amount cannot be negative'],
    required: false
  },
  /** Pays for health insurance */
  hasHealthInsurance: { type: Boolean, required: false },
  /** Annual health insurance contribution in Naira. Prefer over healthInsuranceMonthlyAmount. */
  healthInsuranceAnnualAmount: {
    type: Number,
    min: [0, 'Health insurance amount cannot be negative'],
    required: false
  },
  /** @deprecated Use healthInsuranceAnnualAmount. Kept for backward compatibility. */
  healthInsuranceMonthlyAmount: {
    type: Number,
    min: [0, 'Health insurance amount cannot be negative'],
    required: false
  },
  /** Contributes to a pension plan */
  hasPension: { type: Boolean, required: false },
  /** Annual pension contribution in Naira. Prefer over pensionMonthlyAmount. */
  pensionAnnualAmount: {
    type: Number,
    min: [0, 'Pension amount cannot be negative'],
    required: false
  },
  /** @deprecated Use pensionAnnualAmount. Kept for backward compatibility. */
  pensionMonthlyAmount: {
    type: Number,
    min: [0, 'Pension amount cannot be negative'],
    required: false
  },
  /** Pays a mortgage */
  paysMortgage: { type: Boolean, required: false },
  /** Annual mortgage interest/repayment in Naira. Prefer over mortgageMonthlyAmount. */
  mortgageAnnualAmount: {
    type: Number,
    min: [0, 'Mortgage amount cannot be negative'],
    required: false
  },
  /** @deprecated Use mortgageAnnualAmount. Kept for backward compatibility. */
  mortgageMonthlyAmount: {
    type: Number,
    min: [0, 'Mortgage amount cannot be negative'],
    required: false
  },
  /** How the user prefers to log income/expenses: monthly vs annual */
  filingPreference: {
    type: String,
    enum: {
      values: ['monthly', 'annual'],
      message: 'Filing preference must be monthly or annual'
    },
    required: false
  },
  /** Monthly income entries for monthly filers: { month: 1-12, year: number, amount: number } */
  monthlyIncome: [{
    month: { type: Number, min: 1, max: 12 },
    year: { type: Number },
    amount: { type: Number }
  }],
  /** Monthly health insurance for monthly filers */
  monthlyHealthInsurance: [{
    month: { type: Number, min: 1, max: 12 },
    year: { type: Number },
    amount: { type: Number }
  }],
  /** Monthly pension for monthly filers */
  monthlyPension: [{
    month: { type: Number, min: 1, max: 12 },
    year: { type: Number },
    amount: { type: Number }
  }],
  /** Date of birth (for individuals) */
  dob: { type: Date, required: false },
  /** Address */
  street: { type: String, trim: true, required: false },
  city: { type: String, trim: true, required: false },
  state: { type: String, trim: true, required: false },
  /** Local Government Area (Individual personal info) */
  lga: { type: String, trim: true, required: false },
  /** Contact overrides for Individual personal info (defaults fall back to User) */
  contactEmail: { type: String, trim: true, lowercase: true, required: false },
  contactPhone: { type: String, trim: true, required: false },
  /** Display full name override for Individual personal info */
  fullName: { type: String, trim: true, required: false },
  /** Income details (collected after base setup; structure can be extended) */
  incomeDetails: { type: mongoose.Schema.Types.Mixed, required: false },
  /** Relief/deductibles details for individuals */
  deductiblesDetails: { type: mongoose.Schema.Types.Mixed, required: false },
  primaryTIN: {
    type: String,
    match: [/^[0-9]{10,12}$/, 'TIN must be 10-12 digits'],
    required: false // Collected after base questions, optional
  },
  /** Business company information (for Business profiles) */
  businessCompanyInfo: {
    companyName: { type: String, trim: true },
    TIN: { 
      type: String,
      match: [/^[0-9]{10,12}$/, 'TIN must be 10-12 digits']
    },
    RCNumber: { type: String, trim: true },
    natureOfBusiness: { type: String, trim: true },
    industrySector: { type: String, trim: true },
    dateOfIncorporation: { type: Date },
    businessAddress: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      lga: { type: String, trim: true },
      country: { type: String, trim: true, default: 'Nigeria' }
    },
    email: { 
      type: String,
      trim: true,
      lowercase: true
    },
    phoneNumber: { type: String, trim: true },
    website: { type: String, trim: true }
  },
  /** Business setup configuration (for Business profiles) */
  businessSetup: {
    setupCompleted: { type: Boolean, default: false },
    payeEnabled: { type: Boolean, default: false },
    vatEnabled: { type: Boolean, default: false },
    whtEnabled: { type: Boolean, default: false },
    citEnabled: { type: Boolean, default: false },
    filingFrequency: {
      type: String,
      enum: ['monthly', 'quarterly', 'annually'],
      default: 'annually'
    },
    financialYearEnd: {
      type: String,
      enum: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
      default: 'December'
    },
    accountingMethod: {
      type: String,
      enum: ['cash', 'accrual'],
      default: 'cash'
    },
    currency: {
      type: String,
      default: 'NGN'
    },
    hasEmployees: { type: Boolean, default: false },
    numberOfEmployees: { type: Number, min: 0, default: 0 },
    averageMonthlySalary: { type: Number, min: 0, default: 0 }
  },
  /**
   * Normal status.
   * - Individual profiles: draft | active | completed | archived (existing behavior)
   * - Business profiles: tracks the current section the user is on
   *   (companyinformation | paye | vat | wht | cit)
   */
  status: {
    type: String,
    enum: ['draft', 'active', 'submitted', 'completed', 'archived', 'companyinformation', 'paye', 'vat', 'wht', 'cit'],
    default: 'draft'
  },
  baseQuestionsAnswered: {
    type: Boolean,
    default: false
  },
  submitted: {
    type: Boolean,
    default: false
  },
  submittedAt: {
    type: Date
  },
  filed: {
    type: Boolean,
    default: false
  },
  filedAt: {
    type: Date
  },
  /**
   * Filing lifecycle status for annual flow.
   * - null / undefined: user is still answering base questions (profile not ready)
   * - pending_upload: profile created, user needs to upload documents
   * - upload_done: documents uploaded / complete
   * - pending_accountant_payment: user chose to book a tax agent, payment link created
   * - tax_agent_review: accountant review payment completed, agent is reviewing
   * - tax_agent_approved: agent has approved profile (admin action)
   * - pending_filing_payment: user chose to file, filing-fee payment link created
   * - filed: filing fee payment completed and return submitted
   */
  filingStatus: {
    type: String,
    enum: [
      // Individual / WhatsApp flow lifecycle
      'pending_upload',
      'upload_done',
      'pending_accountant_payment',
      'tax_agent_review',
      'tax_agent_approved',
      'pending_filing_payment',
      'filed',
      'monthly_active',
      'monthly_pending',
      // Business flow lifecycle
      'draft',      // default on creation
      'ready',      // set once status reaches the cit section
      'submitted',
      'review',
      'success'
    ],
    default: null
  },
  adminNotes: {
    type: String,
    trim: true,
    maxlength: [5000, 'Admin notes cannot exceed 5000 characters']
  },
  adminMetadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  lastReviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  lastReviewedAt: {
    type: Date
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

/** Return true if str looks like a MongoDB ObjectId (24 hex chars) */
function isMongoObjectId(str) {
  return typeof str === 'string' && /^[a-fA-F0-9]{24}$/.test(str);
}

/**
 * Find one profile by custom profileId (e.g. TP589605302) or MongoDB _id.
 * Use this instead of findOne({ $or: [{ profileId }, { _id }] }) to avoid CastError
 * when the value is a custom profileId string.
 */
taxableProfileSchema.statics.findByProfileIdOrId = function (idParam, userId) {
  const byProfileId = userId ? { profileId: idParam, user: userId } : { profileId: idParam };
  if (isMongoObjectId(idParam)) {
    const byId = userId ? { _id: idParam, user: userId } : { _id: idParam };
    return this.findOne({ $or: [byProfileId, byId] });
  }
  return this.findOne(byProfileId);
};

// Index for profile lookups. Non-unique — users can create multiple folders
// for the same year and profile type (e.g. two Individual 2026 filings).
taxableProfileSchema.index({ user: 1, year: 1, profileType: 1 });

// Index for year queries
taxableProfileSchema.index({ year: 1 });
taxableProfileSchema.index({ profileType: 1 });
taxableProfileSchema.index({ status: 1 });

// Generate profileId before validation (only if it's a new document)
taxableProfileSchema.pre('validate', async function(next) {
  // Only generate profileId for new documents
  if (this.isNew && !this.profileId) {
    try {
      // Use this.constructor to avoid circular reference
      const TaxableProfileModel = this.constructor;
      
      let profileId;
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 10;

      // Generate a unique random profileId
      while (!isUnique && attempts < maxAttempts) {
        // Generate random 9-digit number (100000000 to 999999999)
        const randomNumber = Math.floor(100000000 + Math.random() * 900000000);
        profileId = `TP${randomNumber}`;

        // Check if this profileId already exists
        const existingProfile = await TaxableProfileModel.findOne({ profileId });
        if (!existingProfile) {
          isUnique = true;
        }
        attempts++;
      }

      if (!isUnique) {
        return next(new Error('Failed to generate unique profileId after multiple attempts'));
      }

      this.profileId = profileId;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Update updatedAt on save
taxableProfileSchema.pre('save', function(next) {
  this.updatedAt = Date.now();

  // Business: once the user reaches the CIT (final) section, the filing is
  // ready to submit. Don't override a further lifecycle state.
  if (this.profileType === 'Business' && this.status === 'cit' && this.filingStatus === 'draft') {
    this.filingStatus = 'ready';
  }

  next();
});

module.exports = mongoose.model('TaxableProfile', taxableProfileSchema);

