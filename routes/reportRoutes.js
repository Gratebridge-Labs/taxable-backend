const express = require('express');
const router = express.Router();
const {
  getReports,
  getReport,
  generateWeeklyReport,
  generateMonthlyReport,
  generateAnnualReport,
  generateCustomReport,
  downloadReport,
  deleteReport
} = require('../controllers/reportController');
const authMiddleware = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authMiddleware);

// Generate endpoints (before :id route)
router.get('/weekly', generateWeeklyReport);
router.get('/monthly', generateMonthlyReport);
router.get('/annual', generateAnnualReport);
router.post('/generate', generateCustomReport);

// Download endpoint (before :id route)
router.get('/:id/download', downloadReport);

// CRUD routes
router.get('/', getReports);
router.get('/:id', getReport);
router.delete('/:id', deleteReport);

module.exports = router;

