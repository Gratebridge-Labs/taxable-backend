const mongoose = require('mongoose');

const whatsAppErrorLogSchema = new mongoose.Schema({
  // Error categorization
  errorType: {
    type: String,
    required: true,
    enum: [
      'whatsapp_api',      // WhatsApp API failures (sending messages, media download)
      'payment',           // Payment integration failures (Paystack)
      'bank',              // Bank integration failures (Mono)
      'database',          // Database operations failures
      'external_service',  // External service failures (email, upload, etc.)
      'state_machine',     // State machine/flow errors
      'validation',        // User input validation failures
      'authentication',    // Authentication/authorization errors
      'session',           // Session management errors
      'unknown'           // Unclassified errors
    ],
    index: true
  },
  
  errorCode: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  
  severity: {
    type: String,
    required: true,
    enum: ['critical', 'high', 'medium', 'low', 'info'],
    default: 'medium',
    index: true
  },
  
  // Error details
  message: {
    type: String,
    required: true,
    trim: true
  },
  
  stackTrace: {
    type: String,
    trim: true
  },
  
  // Context information
  context: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // User information
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    index: true
  },
  
  waId: {
    type: String,
    trim: true,
    index: true
  },
  
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'WhatsAppSession',
    index: true
  },
  
  sessionStep: {
    type: String,
    trim: true
  },
  
  userMessage: {
    type: String,
    trim: true
  },
  
  // Resolution tracking
  resolved: {
    type: Boolean,
    default: false,
    index: true
  },
  
  resolutionNotes: {
    type: String,
    trim: true
  },
  
  resolvedAt: {
    type: Date
  },
  
  resolvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin'
  },
  
  // Metadata
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  
  // Environment information
  environment: {
    type: String,
    enum: ['development', 'staging', 'production'],
    default: process.env.NODE_ENV || 'development',
    index: true
  },
  
  appVersion: {
    type: String,
    trim: true
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Compound indexes for common query patterns
whatsAppErrorLogSchema.index({ resolved: 1, createdAt: -1 });
whatsAppErrorLogSchema.index({ errorType: 1, severity: 1, createdAt: -1 });
whatsAppErrorLogSchema.index({ userId: 1, createdAt: -1 });
whatsAppErrorLogSchema.index({ waId: 1, createdAt: -1 });
whatsAppErrorLogSchema.index({ environment: 1, createdAt: -1 });

// Pre-save middleware to update updatedAt
whatsAppErrorLogSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static methods for common queries
whatsAppErrorLogSchema.statics.findUnresolved = function(limit = 100) {
  return this.find({ resolved: false })
    .sort({ createdAt: -1 })
    .limit(limit)
    .populate('userId', 'email firstName lastName phone')
    .populate('resolvedBy', 'fullName email')
    .lean();
};

whatsAppErrorLogSchema.statics.findByTypeAndSeverity = function(errorType, severity, limit = 50) {
  return this.find({ errorType, severity })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

whatsAppErrorLogSchema.statics.findByUserId = function(userId, limit = 50) {
  return this.find({ userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
};

whatsAppErrorLogSchema.statics.getErrorStats = function(timeRangeHours = 24) {
  const cutoffDate = new Date(Date.now() - (timeRangeHours * 60 * 60 * 1000));
  
  return this.aggregate([
    {
      $match: {
        createdAt: { $gte: cutoffDate }
      }
    },
    {
      $group: {
        _id: {
          errorType: '$errorType',
          severity: '$severity',
          resolved: '$resolved'
        },
        count: { $sum: 1 },
        lastError: { $max: '$createdAt' }
      }
    },
    {
      $group: {
        _id: '$_id.errorType',
        severityBreakdown: {
          $push: {
            severity: '$_id.severity',
            resolved: '$_id.resolved',
            count: '$count',
            lastError: '$lastError'
          }
        },
        totalCount: { $sum: '$count' }
      }
    },
    {
      $sort: { totalCount: -1 }
    }
  ]);
};

whatsAppErrorLogSchema.statics.markAsResolved = function(errorId, adminId, notes = '') {
  return this.findByIdAndUpdate(
    errorId,
    {
      $set: {
        resolved: true,
        resolutionNotes: notes,
        resolvedAt: new Date(),
        resolvedBy: adminId,
        updatedAt: new Date()
      }
    },
    { new: true }
  );
};

const WhatsAppErrorLog = mongoose.model('WhatsAppErrorLog', whatsAppErrorLogSchema);

module.exports = WhatsAppErrorLog;