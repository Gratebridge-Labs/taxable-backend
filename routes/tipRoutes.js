const express = require('express');
const router = express.Router();
const {
  getPersonalizedTips,
  getSuggestions,
  getReferenceTips,
  getAIAnalysis
} = require('../controllers/tipController');
const authMiddleware = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authMiddleware);

// AI analysis endpoint (before personalized)
router.get('/ai-analysis', getAIAnalysis);

// Personalized tips endpoint (before reference tips)
router.get('/personalized', getPersonalizedTips);

// Reference tips endpoint
router.get('/', getReferenceTips);

module.exports = router;

