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
  // For income questions with monthly/annual periods
  period: {
    type: String,
    enum: ['monthly', 'annually'],
    default: 'annually'
  },
  // For monthly income: store month and year
  month: {
    type: Number,
    min: 1,
    max: 12
  },
  year: {
    type: Number,
    min: 2020,
    max: 2100
  },
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
// For monthly income: profileId + questionId + period + month + year must be unique
// For annual: profileId + questionId + period must be unique
// We'll handle uniqueness in application logic to support both cases
questionResponseSchema.index({ profileId: 1, questionId: 1, period: 1, month: 1, year: 1 });
questionResponseSchema.index({ profileId: 1, answeredAt: -1 });

module.exports = mongoose.model('QuestionResponse', questionResponseSchema);

