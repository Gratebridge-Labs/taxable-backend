const mongoose = require('mongoose');

const accountSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required'],
    index: true
  },
  accountType: {
    type: String,
    required: [true, 'Account type is required'],
    enum: ['individual', 'business'],
    index: true
  },
  name: {
    type: String,
    required: [true, 'Account name is required'],
    trim: true
  },
  // Individual account fields
  tin: {
    type: String,
    trim: true,
    uppercase: true
  },
  dateOfBirth: {
    type: Date
  },
  employmentStatus: {
    type: String,
    enum: ['employed', 'self_employed', 'unemployed', 'retired', 'student'],
    default: null
  },
  // Business account fields
  businessName: {
    type: String,
    trim: true
  },
  businessType: {
    type: String,
    enum: ['sole_proprietorship', 'partnership', 'corporation', 'llc', 'other'],
    default: null
  },
  businessTIN: {
    type: String,
    trim: true,
    uppercase: true
  },
  registrationNumber: {
    type: String,
    trim: true
  },
  businessAddress: {
    street: String,
    city: String,
    state: String,
    country: { type: String, default: 'Nigeria' },
    postalCode: String
  },
  // Common fields
  phone: {
    type: String,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  isDefault: {
    type: Boolean,
    default: false
  },
  isActive: {
    type: Boolean,
    default: true
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes
accountSchema.index({ user: 1, accountType: 1 });
accountSchema.index({ user: 1, isDefault: 1 });
accountSchema.index({ user: 1, isActive: 1 });

// Ensure only one default account per user per type
accountSchema.pre('save', async function(next) {
  if (this.isDefault && this.isModified('isDefault')) {
    // Unset other default accounts of the same type for this user
    await mongoose.model('Account').updateMany(
      {
        user: this.user,
        accountType: this.accountType,
        _id: { $ne: this._id }
      },
      { isDefault: false }
    );
  }
  next();
});

module.exports = mongoose.model('Account', accountSchema);

