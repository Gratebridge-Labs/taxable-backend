const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxableProfile',
    required: [true, 'Profile ID is required'],
    index: true
  },
  documentType: {
    type: String,
    required: [true, 'Document type is required'],
    enum: ['receipt', 'invoice', 'payslip', 'bank_statement', 'contract', 'certificate', 'other'],
    index: true
  },
  category: {
    type: String,
    enum: ['income', 'expense', 'deduction', 'proof', 'form', 'other']
  },
  fileName: {
    type: String,
    required: [true, 'File name is required']
  },
  originalFileName: {
    type: String,
    required: true
  },
  fileUrl: {
    type: String,
    required: [true, 'File URL is required']
  },
  fileSize: {
    type: Number,
    required: true,
    min: 0
  },
  mimeType: {
    type: String,
    required: true
  },
  // Link to related records
  linkedTo: {
    incomeSourceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'IncomeSource'
    },
    deductionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Deduction'
    },
    questionResponseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QuestionResponse'
    }
  },
  // Metadata
  description: String,
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uploadedAt: {
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

documentSchema.index({ profileId: 1, documentType: 1 });
documentSchema.index({ profileId: 1, uploadedAt: -1 });
documentSchema.index({ 'linkedTo.incomeSourceId': 1 });
documentSchema.index({ 'linkedTo.deductionId': 1 });

documentSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Document', documentSchema);

