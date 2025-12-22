const mongoose = require('mongoose');
const TAX_CONSTANTS = require('../config/constants');

const documentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User is required']
  },
  documentType: {
    type: String,
    required: [true, 'Document type is required'],
    enum: Object.values(TAX_CONSTANTS.DOCUMENT_TYPES),
    default: TAX_CONSTANTS.DOCUMENT_TYPES.BANK_STATEMENT
  },
  fileName: {
    type: String,
    required: [true, 'File name is required']
  },
  filePath: {
    type: String,
    required: [true, 'File path is required']
  },
  fileSize: {
    type: Number, // Size in bytes
    required: true
  },
  mimeType: {
    type: String,
    required: true
  },
  uploadDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  processingStatus: {
    type: String,
    enum: Object.values(TAX_CONSTANTS.PROCESSING_STATUS),
    default: TAX_CONSTANTS.PROCESSING_STATUS.PENDING
  },
  extractedData: {
    type: mongoose.Schema.Types.Mixed, // Store parsed data from document
    default: null
  },
  errorMessage: {
    type: String,
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed, // Additional metadata
    default: {}
  }
}, {
  timestamps: true
});

// Index for faster queries
documentSchema.index({ user: 1, createdAt: -1 });
documentSchema.index({ processingStatus: 1 });

// Method to get file extension
documentSchema.virtual('fileExtension').get(function() {
  return this.fileName.split('.').pop().toLowerCase();
});

// Ensure virtuals are included in JSON
documentSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Document', documentSchema);

