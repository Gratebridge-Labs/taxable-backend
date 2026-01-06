const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
  createBlog,
  getAllBlogs,
  getBlogById,
  updateBlog,
  deleteBlog
} = require('../controllers/blogController');
const { authenticateAdmin } = require('../middleware/adminAuth');

// Create blog (admin only)
router.post(
  '/',
  authenticateAdmin,
  [
    body('title')
      .trim()
      .notEmpty().withMessage('Title is required')
      .isLength({ max: 200 }).withMessage('Title cannot exceed 200 characters'),
    body('content')
      .trim()
      .notEmpty().withMessage('Content is required'),
    body('excerpt')
      .optional()
      .trim()
      .isLength({ max: 500 }).withMessage('Excerpt cannot exceed 500 characters'),
    body('featuredImage')
      .optional()
      .trim()
      .isURL().withMessage('Featured image must be a valid URL'),
    body('tags')
      .optional()
      .isArray().withMessage('Tags must be an array'),
    body('category')
      .optional()
      .trim(),
    body('published')
      .optional()
      .isBoolean().withMessage('Published must be a boolean'),
    body('buttonType')
      .optional()
      .isIn(['consultation', 'create_account']).withMessage('Button type must be either "consultation" or "create_account"')
  ],
  createBlog
);

// Get all blogs (public, but admins see all including unpublished)
router.get('/', getAllBlogs);

// Get blog by ID or slug (public, but admins see unpublished)
router.get('/:blogId', getBlogById);

// Update blog (admin only)
router.put(
  '/:blogId',
  authenticateAdmin,
  [
    body('title')
      .optional()
      .trim()
      .notEmpty().withMessage('Title cannot be empty')
      .isLength({ max: 200 }).withMessage('Title cannot exceed 200 characters'),
    body('content')
      .optional()
      .trim()
      .notEmpty().withMessage('Content cannot be empty'),
    body('excerpt')
      .optional()
      .trim()
      .isLength({ max: 500 }).withMessage('Excerpt cannot exceed 500 characters'),
    body('featuredImage')
      .optional()
      .trim()
      .isURL().withMessage('Featured image must be a valid URL'),
    body('tags')
      .optional()
      .isArray().withMessage('Tags must be an array'),
    body('category')
      .optional()
      .trim(),
    body('published')
      .optional()
      .isBoolean().withMessage('Published must be a boolean'),
    body('buttonType')
      .optional()
      .isIn(['consultation', 'create_account']).withMessage('Button type must be either "consultation" or "create_account"')
  ],
  updateBlog
);

// Delete blog (admin only)
router.delete('/:blogId', authenticateAdmin, deleteBlog);

module.exports = router;

