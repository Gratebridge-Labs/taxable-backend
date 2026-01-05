const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Title is required'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  message: {
    type: String,
    required: [true, 'Message is required'],
    trim: true,
    maxlength: [2000, 'Message cannot exceed 2000 characters']
  },
  type: {
    type: String,
    enum: ['general', 'user_specific'],
    required: true,
    default: 'general'
  },
  // For general notifications (sent to all users)
  isGeneral: {
    type: Boolean,
    default: false
  },
  // For user-specific notifications
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: function() {
      return this.type === 'user_specific';
    }
  },
  read: {
    type: Boolean,
    default: false
  },
  readAt: {
    type: Date
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    required: true
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

// Indexes
notificationSchema.index({ userId: 1, read: 1 });
notificationSchema.index({ isGeneral: true });
notificationSchema.index({ createdAt: -1 });

// Update updatedAt on save
notificationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  if (this.isModified('read') && this.read) {
    this.readAt = Date.now();
  }
  next();
});

module.exports = mongoose.model('Notification', notificationSchema);

