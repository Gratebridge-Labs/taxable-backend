const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
  createGeneralNotification,
  getGeneralNotifications,
  deleteGeneralNotification,
  createUserNotification,
  getUserNotifications,
  markNotificationRead,
  deleteUserNotification
} = require('../controllers/notificationController');
const { authenticate } = require('../middleware/auth');
const { authenticateAdmin } = require('../middleware/adminAuth');

// General Notifications (Admin only for create/delete, public for read)
router.post(
  '/general',
  authenticateAdmin,
  [
    body('title')
      .trim()
      .notEmpty().withMessage('Title is required')
      .isLength({ max: 200 }).withMessage('Title cannot exceed 200 characters'),
    body('message')
      .trim()
      .notEmpty().withMessage('Message is required')
      .isLength({ max: 2000 }).withMessage('Message cannot exceed 2000 characters')
  ],
  createGeneralNotification
);

router.get('/general', getGeneralNotifications);

router.delete('/general/:notificationId', authenticateAdmin, deleteGeneralNotification);

// User-specific Notifications (Admin only for create, user for read/update/delete)
router.post(
  '/user',
  authenticateAdmin,
  [
    body('userId')
      .notEmpty().withMessage('User ID is required')
      .isMongoId().withMessage('Invalid user ID'),
    body('title')
      .trim()
      .notEmpty().withMessage('Title is required')
      .isLength({ max: 200 }).withMessage('Title cannot exceed 200 characters'),
    body('message')
      .trim()
      .notEmpty().withMessage('Message is required')
      .isLength({ max: 2000 }).withMessage('Message cannot exceed 2000 characters')
  ],
  createUserNotification
);

router.get('/user', authenticate, getUserNotifications);

router.put('/user/:notificationId/read', authenticate, markNotificationRead);

router.delete('/user/:notificationId', authenticate, deleteUserNotification);

module.exports = router;

