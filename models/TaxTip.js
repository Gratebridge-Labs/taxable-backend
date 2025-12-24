const mongoose = require('mongoose');

const taxTipSchema = new mongoose.Schema({
  tipCategory: {
    type: String,
    required: [true, 'Tip category is required'],
    enum: [
      'exemption',
      'deductions',
      'compliance',
      'optimization',
      'tax_bracket',
      'data_quality',
      'general'
    ],
    index: true
  },
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [255, 'Title cannot exceed 255 characters']
  },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true
  },
  applicableConditions: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
    // Example: { minIncome: 800000, maxIncome: 1500000, employmentStatus: 'self_employed' }
  },
  priority: {
    type: Number,
    default: 5,
    min: [0, 'Priority must be between 0 and 10'],
    max: [10, 'Priority must be between 0 and 10']
  },
  isActive: {
    type: Boolean,
    default: true,
    index: true
  },
  // AI Enhancement Fields (for future AI integration)
  aiEnhanced: {
    type: Boolean,
    default: false
  },
  aiGenerated: {
    type: Boolean,
    default: false
  },
  aiMetadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
    // Store AI model info, confidence scores, etc.
  },
  // Tags for better categorization and AI matching
  tags: {
    type: [String],
    default: []
  },
  // Related categories or keywords for AI matching
  keywords: {
    type: [String],
    default: []
  }
}, {
  timestamps: true
});

// Indexes
taxTipSchema.index({ tipCategory: 1, isActive: 1, priority: -1 });
taxTipSchema.index({ tags: 1 });
taxTipSchema.index({ aiEnhanced: 1 });

module.exports = mongoose.model('TaxTip', taxTipSchema);

