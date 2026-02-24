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
  /** Pays for health insurance */
  hasHealthInsurance: { type: Boolean, required: false },
  /** Contributes to a pension plan */
  hasPension: { type: Boolean, required: false },
  /** Pays a mortgage */
  paysMortgage: { type: Boolean, required: false },
  primaryTIN: {
    type: String,
    match: [/^[0-9]{10,12}$/, 'TIN must be 10-12 digits'],
    required: false // Collected after base questions, optional
  },
  status: {
    type: String,
    enum: ['draft', 'active', 'completed', 'archived'],
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

// Compound index to ensure one profile per user per year per profileType
// This allows users to have both Individual and Business profiles for the same year
taxableProfileSchema.index({ user: 1, year: 1, profileType: 1 }, { unique: true });

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
  next();
});

module.exports = mongoose.model('TaxableProfile', taxableProfileSchema);

