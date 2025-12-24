const express = require('express');
const router = express.Router();
const {
  getHistory,
  generateWeeklySnapshot,
  generateMonthlySnapshot,
  comparePeriods,
  getTrendAnalysis,
  getYearOverYearComparison
} = require('../controllers/historyController');
const authMiddleware = require('../middleware/authMiddleware');
const { accountMiddleware } = require('../middleware/accountMiddleware');

// All routes require authentication
router.use(authMiddleware);

// All routes require account context
router.use(accountMiddleware);

// Generate endpoints
router.post('/weekly', generateWeeklySnapshot);
router.post('/monthly', generateMonthlySnapshot);

// Analysis endpoints
router.get('/compare', comparePeriods);
router.get('/trends', getTrendAnalysis);
router.get('/year-over-year', getYearOverYearComparison);

// Get history
router.get('/', getHistory);

module.exports = router;

