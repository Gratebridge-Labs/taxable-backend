const mongoose = require('mongoose');

const profileReviewSchema = new mongoose.Schema({
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxableProfile',
    required: [true, 'Taxable profile is required'],
    index: true
  },
  requestedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User who requested review is required'],
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'in_review', 'approved', 'rejected', 'requires_changes'],
    default: 'pending',
    required: true,
    index: true
  },
  reviewNotes: {
    type: String,
    trim: true,
    maxlength: [5000, 'Review notes cannot exceed 5000 characters']
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  reviewedAt: {
    type: Date
  },
  requestedAt: {
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

// Update updatedAt on save
profileReviewSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  if (this.isModified('status') && this.status !== 'pending') {
    this.reviewedAt = Date.now();
  }
  next();
});

// Indexes
profileReviewSchema.index({ profileId: 1, status: 1 });
profileReviewSchema.index({ requestedBy: 1, status: 1 });
profileReviewSchema.index({ requestedAt: -1 });

module.exports = mongoose.model('ProfileReview', profileReviewSchema);

