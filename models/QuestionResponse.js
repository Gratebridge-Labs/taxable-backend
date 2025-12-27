const mongoose = require('mongoose');

const questionResponseSchema = new mongoose.Schema({
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxableProfile',
    required: [true, 'Profile ID is required'],
    index: true
  },
  questionId: {
    type: String,
    required: [true, 'Question ID is required'],
    index: true
  },
  questionType: {
    type: String,
    required: true,
    enum: ['yes_no', 'multiple_choice', 'text', 'number', 'date', 'email', 'address', 'table']
  },
  response: {
    type: mongoose.Schema.Types.Mixed,
    required: [true, 'Response is required']
  },
  // For table responses (expenses, income sources, etc.)
  tableData: [{
    type: mongoose.Schema.Types.Mixed
  }],
  // Metadata
  answeredAt: {
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

// Compound index for quick lookups
questionResponseSchema.index({ profileId: 1, questionId: 1 }, { unique: true });
questionResponseSchema.index({ profileId: 1, answeredAt: -1 });

module.exports = mongoose.model('QuestionResponse', questionResponseSchema);

