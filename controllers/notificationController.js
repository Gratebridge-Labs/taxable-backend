const Notification = require('../models/Notification');
const User = require('../models/User');
const { validationResult } = require('express-validator');

/**
 * Create general notification (admin only)
 */
const createGeneralNotification = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const adminId = req.admin?.adminId;
    const { title, message } = req.body;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - Admin access required'
      });
    }

    const notification = await Notification.create({
      title,
      message,
      type: 'general',
      isGeneral: true,
      createdBy: adminId
    });

    await notification.populate('createdBy', 'fullName email role');

    res.status(201).json({
      success: true,
      message: 'General notification created successfully',
      data: {
        notification
      }
    });

  } catch (error) {
    console.error('Create general notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating notification',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all general notifications
 */
const getGeneralNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [notifications, total] = await Promise.all([
      Notification.find({ isGeneral: true })
        .populate('createdBy', 'fullName email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Notification.countDocuments({ isGeneral: true })
    ]);

    res.status(200).json({
      success: true,
      message: 'General notifications retrieved successfully',
      data: {
        notifications,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get general notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving notifications',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete general notification (admin only)
 */
const deleteGeneralNotification = async (req, res) => {
  try {
    const adminId = req.admin?.adminId;
    const { notificationId } = req.params;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - Admin access required'
      });
    }

    const notification = await Notification.findOne({
      _id: notificationId,
      isGeneral: true
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    await Notification.findByIdAndDelete(notificationId);

    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    });

  } catch (error) {
    console.error('Delete general notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting notification',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Create user-specific notification (admin only)
 */
const createUserNotification = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const adminId = req.admin?.adminId;
    const { userId, title, message } = req.body;

    if (!adminId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized - Admin access required'
      });
    }

    // Verify user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    const notification = await Notification.create({
      title,
      message,
      type: 'user_specific',
      isGeneral: false,
      userId: userId,
      createdBy: adminId
    });

    await notification.populate('createdBy', 'fullName email role');
    await notification.populate('userId', 'firstName lastName email');

    res.status(201).json({
      success: true,
      message: 'User notification created successfully',
      data: {
        notification
      }
    });

  } catch (error) {
    console.error('Create user notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error creating notification',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get user's notifications (user-specific only)
 */
const getUserNotifications = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { page = 1, limit = 20, read } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const query = { userId: userId };
    if (read !== undefined) {
      query.read = read === 'true';
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .populate('createdBy', 'fullName email role')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Notification.countDocuments(query),
      Notification.countDocuments({ userId: userId, read: false })
    ]);

    res.status(200).json({
      success: true,
      message: 'Notifications retrieved successfully',
      data: {
        notifications,
        unreadCount,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get user notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving notifications',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get all notifications for authenticated user (general + user-specific combined)
 */
const getAllNotifications = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { page = 1, limit = 20, read } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Get general notifications
    const generalNotifications = await Notification.find({ isGeneral: true })
      .populate('createdBy', 'fullName email role')
      .sort({ createdAt: -1 })
      .lean();

    // Get user-specific notifications
    const userQuery = { userId: userId };
    if (read !== undefined) {
      userQuery.read = read === 'true';
    }

    const userNotifications = await Notification.find(userQuery)
      .populate('createdBy', 'fullName email role')
      .sort({ createdAt: -1 })
      .lean();

    // Combine and sort by date (newest first)
    const allNotifications = [...generalNotifications, ...userNotifications]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .map(notif => ({
        ...notif,
        isGeneral: notif.isGeneral || false,
        type: notif.isGeneral ? 'general' : 'user_specific'
      }));

    // Apply pagination
    const total = allNotifications.length;
    const paginatedNotifications = allNotifications.slice(skip, skip + parseInt(limit));

    // Count unread user-specific notifications
    const unreadUserNotifications = await Notification.countDocuments({
      userId: userId,
      read: false
    });

    res.status(200).json({
      success: true,
      message: 'All notifications retrieved successfully',
      data: {
        notifications: paginatedNotifications,
        unreadCount: unreadUserNotifications,
        generalCount: generalNotifications.length,
        userSpecificCount: userNotifications.length,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / parseInt(limit))
        }
      }
    });

  } catch (error) {
    console.error('Get all notifications error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving notifications',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Mark notification as read
 */
const markNotificationRead = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { notificationId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const notification = await Notification.findOne({
      _id: notificationId,
      userId: userId
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    notification.read = true;
    notification.readAt = Date.now();
    await notification.save();

    res.status(200).json({
      success: true,
      message: 'Notification marked as read',
      data: {
        notification
      }
    });

  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating notification',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete user notification
 */
const deleteUserNotification = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { notificationId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    const notification = await Notification.findOne({
      _id: notificationId,
      userId: userId
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    await Notification.findByIdAndDelete(notificationId);

    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    });

  } catch (error) {
    console.error('Delete user notification error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deleting notification',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  createGeneralNotification,
  getGeneralNotifications,
  deleteGeneralNotification,
  createUserNotification,
  getUserNotifications,
  getAllNotifications,
  markNotificationRead,
  deleteUserNotification
};

