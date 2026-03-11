const mongoose = require('mongoose');
const { randomBytes } = require('crypto');

/**
 * Upload session for the web UI at gettaxable.com/uploads/:uploadId.
 * Created when user (or WhatsApp flow) requests "upload documents"; holds user, profile, and file refs.
 */
const uploadSchema = new mongoose.Schema({
  uploadId: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxableProfile',
    required: false,
    index: true
  },
  year: {
    type: Number,
    required: false
  },
  type: {
    type: String,
    enum: ['bank_statements', 'relief_documents', 'general'],
    default: 'general'
  },
  status: {
    type: String,
    enum: ['pending', 'completed'],
    default: 'pending'
  },
  /** Banks user selected (for bank statement uploads). IDs/names from our banks list. */
  selectedBanks: [{
    type: String
  }],
  /** Per-file references: documentId, fileUrl, kind, and optional bankId / deductionId */
  files: [{
    documentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
    fileUrl: { type: String, required: true },
    kind: { type: String, enum: ['bank_statement', 'relief'], required: true },
    bankId: { type: String },
    deductionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Deduction' },
    uploadedAt: { type: Date, default: Date.now }
  }],
  expiresAt: {
    type: Date,
    required: false
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, {
  timestamps: true
});

uploadSchema.index({ user: 1, createdAt: -1 });
uploadSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 }); // TTL only if expiresAt set

uploadSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

/** Generate a short URL-safe upload ID */
function generateUploadId() {
  return randomBytes(12).toString('base64url');
}

module.exports = mongoose.model('Upload', uploadSchema);
module.exports.generateUploadId = generateUploadId;
