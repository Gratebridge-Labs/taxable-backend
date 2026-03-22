const mongoose = require('mongoose');

const employeeSchema = new mongoose.Schema({
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxableProfile',
    required: [true, 'Profile ID is required'],
    index: true
  },
  // Employee identification
  employeeId: {
    type: String,
    unique: true,
    index: true,
    sparse: true
  },
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    maxlength: [50, 'First name cannot exceed 50 characters']
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    maxlength: [50, 'Last name cannot exceed 50 characters']
  },
  middleName: {
    type: String,
    trim: true,
    maxlength: [50, 'Middle name cannot exceed 50 characters']
  },
  dateOfBirth: {
    type: Date,
    required: [true, 'Date of birth is required']
  },
  gender: {
    type: String,
    enum: ['male', 'female', 'other'],
    required: [true, 'Gender is required']
  },
  maritalStatus: {
    type: String,
    enum: ['single', 'married', 'divorced', 'widowed'],
    default: 'single'
  },
  // Contact information
  email: {
    type: String,
    required: [true, 'Email is required'],
    lowercase: true,
    trim: true,
    match: [
      /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email address'
    ]
  },
  phone: {
    type: String,
    required: [true, 'Phone number is required'],
    trim: true,
    match: [/^(\+?234[\s-]?)?[0-9]{3}[\s-]?[0-9]{3}[\s-]?[0-9]{4}$|^0?[0-9]{10}$/, 'Please provide a valid phone number']
  },
  address: {
    street: String,
    city: String,
    state: String,
    postalCode: String,
    country: {
      type: String,
      default: 'Nigeria'
    }
  },
  // Employment details
  employmentType: {
    type: String,
    enum: ['full_time', 'part_time', 'contract', 'intern', 'consultant'],
    default: 'full_time'
  },
  jobTitle: {
    type: String,
    required: [true, 'Job title is required'],
    trim: true,
    maxlength: [100, 'Job title cannot exceed 100 characters']
  },
  department: {
    type: String,
    trim: true,
    maxlength: [100, 'Department cannot exceed 100 characters']
  },
  employmentStartDate: {
    type: Date,
    required: [true, 'Employment start date is required']
  },
  employmentEndDate: Date,
  isActive: {
    type: Boolean,
    default: true
  },
  // Tax identification
  tin: {
    type: String,
    trim: true,
    match: [/^[0-9]{10,12}$/, 'TIN must be 10-12 digits']
  },
  nin: {
    type: String,
    trim: true,
    match: [/^[0-9]{11}$/, 'NIN must be exactly 11 digits']
  },
  // Compensation
  basicSalary: {
    type: Number,
    required: [true, 'Basic salary is required'],
    min: [0, 'Basic salary cannot be negative']
  },
  housingAllowance: {
    type: Number,
    default: 0,
    min: [0, 'Housing allowance cannot be negative']
  },
  transportAllowance: {
    type: Number,
    default: 0,
    min: [0, 'Transport allowance cannot be negative'],
    max: [200000, 'Transport allowance cannot exceed ₦200,000']
  },
  otherAllowances: {
    type: Number,
    default: 0,
    min: [0, 'Other allowances cannot be negative']
  },
  // Deductions at source
  nhfContribution: {
    type: Number,
    default: 0,
    min: [0, 'NHF contribution cannot be negative']
  },
  nhisContribution: {
    type: Number,
    default: 0,
    min: [0, 'NHIS contribution cannot be negative']
  },
  pensionContribution: {
    type: Number,
    default: 0,
    min: [0, 'Pension contribution cannot be negative']
  },
  lifeInsurancePremium: {
    type: Number,
    default: 0,
    min: [0, 'Life insurance premium cannot be negative']
  },
  // Bank details for payment
  bankDetails: {
    bankName: String,
    accountNumber: String,
    accountName: String,
    bankCode: String
  },
  // Status and metadata
  status: {
    type: String,
    enum: ['active', 'inactive', 'terminated', 'on_leave'],
    default: 'active'
  },
  notes: {
    type: String,
    trim: true,
    maxlength: [1000, 'Notes cannot exceed 1000 characters']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Generate employeeId before validation
employeeSchema.pre('validate', async function(next) {
  if (this.isNew && !this.employeeId) {
    try {
      const EmployeeModel = this.constructor;
      
      let employeeId;
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (!isUnique && attempts < maxAttempts) {
        // Generate random 6-digit number
        const randomNumber = Math.floor(100000 + Math.random() * 900000);
        employeeId = `EMP${randomNumber}`;

        const existingEmployee = await EmployeeModel.findOne({ employeeId });
        if (!existingEmployee) {
          isUnique = true;
        }
        attempts++;
      }

      if (!isUnique) {
        return next(new Error('Failed to generate unique employeeId after multiple attempts'));
      }

      this.employeeId = employeeId;
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Update updatedAt on save
employeeSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Calculate total compensation (virtual)
employeeSchema.virtual('totalCompensation').get(function() {
  return (this.basicSalary || 0) + 
         (this.housingAllowance || 0) + 
         (this.transportAllowance || 0) + 
         (this.otherAllowances || 0);
});

// Calculate total deductions (virtual)
employeeSchema.virtual('totalDeductions').get(function() {
  return (this.nhfContribution || 0) + 
         (this.nhisContribution || 0) + 
         (this.pensionContribution || 0) + 
         (this.lifeInsurancePremium || 0);
});

// Calculate net pay (virtual)
employeeSchema.virtual('netPay').get(function() {
  return this.totalCompensation - this.totalDeductions;
});

// Indexes
employeeSchema.index({ profileId: 1, isActive: 1 });
employeeSchema.index({ profileId: 1, employeeId: 1 });
employeeSchema.index({ profileId: 1, email: 1 });
employeeSchema.index({ profileId: 1, status: 1 });
employeeSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Employee', employeeSchema);