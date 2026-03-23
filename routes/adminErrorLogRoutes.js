const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
  getWhatsAppErrors,
  getErrorById,
  markErrorResolved,
  getErrorStats,
  getErrorTrends,
  searchErrors,
  getUnresolvedCount,
  cleanupOldErrors
} = require('../controllers/adminErrorLogController');
const { authenticateAdmin } = require('../middleware/adminAuth');

// Validation rules for marking error as resolved
const markResolvedValidation = [
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Resolution notes cannot exceed 1000 characters')
];

// Validation rules for search
const searchValidation = [
  body('searchText')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Search text cannot exceed 100 characters'),
  
  body('errorType')
    .optional()
    .isIn([
      'whatsapp_api',
      'payment',
      'bank',
      'database',
      'external_service',
      'state_machine',
      'validation',
      'authentication',
      'session',
      'unknown'
    ]).withMessage('Invalid error type'),
  
  body('severity')
    .optional()
    .isIn(['critical', 'high', 'medium', 'low', 'info'])
    .withMessage('Invalid severity level'),
  
  body('resolved')
    .optional()
    .isBoolean().withMessage('Resolved must be a boolean'),
  
  body('userId')
    .optional()
    .trim()
    .matches(/^[0-9a-fA-F]{24}$/).withMessage('Invalid user ID format'),
  
  body('waId')
    .optional()
    .trim()
    .isLength({ max: 20 }).withMessage('WhatsApp ID cannot exceed 20 characters'),
  
  body('startDate')
    .optional()
    .isISO8601().withMessage('Start date must be in ISO 8601 format'),
  
  body('endDate')
    .optional()
    .isISO8601().withMessage('End date must be in ISO 8601 format'),
  
  body('environment')
    .optional()
    .isIn(['development', 'staging', 'production'])
    .withMessage('Invalid environment'),
  
  body('page')
    .optional()
    .isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  
  body('limit')
    .optional()
    .isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
  
  body('sortBy')
    .optional()
    .isIn(['createdAt', 'severity', 'errorType', 'resolved'])
    .withMessage('Invalid sort field'),
  
  body('sortOrder')
    .optional()
    .isIn(['asc', 'desc'])
    .withMessage('Sort order must be asc or desc')
];

// Validation rules for cleanup
const cleanupValidation = [
  body('retentionDays')
    .optional()
    .isInt({ min: 1, max: 365 }).withMessage('Retention days must be between 1 and 365'),
  
  body('dryRun')
    .optional()
    .isBoolean().withMessage('Dry run must be a boolean')
];

// GET /api/admin/whatsapp-errors - List errors with filtering
router.get('/whatsapp-errors', authenticateAdmin, getWhatsAppErrors);

// GET /api/admin/whatsapp-errors/:errorId - Get error by ID
router.get('/whatsapp-errors/:errorId', authenticateAdmin, getErrorById);

// PATCH /api/admin/whatsapp-errors/:errorId/resolve - Mark error as resolved
router.patch('/whatsapp-errors/:errorId/resolve', authenticateAdmin, markResolvedValidation, markErrorResolved);

// GET /api/admin/whatsapp-error-stats - Get error statistics dashboard
router.get('/whatsapp-error-stats', authenticateAdmin, getErrorStats);

// GET /api/admin/whatsapp-error-trends - Get error trends over time
router.get('/whatsapp-error-trends', authenticateAdmin, getErrorTrends);

// POST /api/admin/whatsapp-errors/search - Advanced error search
router.post('/whatsapp-errors/search', authenticateAdmin, searchValidation, searchErrors);

// GET /api/admin/whatsapp-errors/unresolved-count - Get unresolved error count
router.get('/whatsapp-errors/unresolved-count', authenticateAdmin, getUnresolvedCount);

// POST /api/admin/whatsapp-errors/cleanup - Clean up old errors
router.post('/whatsapp-errors/cleanup', authenticateAdmin, cleanupValidation, cleanupOldErrors);

module.exports = router;