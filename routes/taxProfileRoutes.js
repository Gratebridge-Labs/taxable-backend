const express = require('express');
const router = express.Router();
const {
  getTaxProfiles,
  getTaxProfile,
  createOrUpdateTaxProfile,
  getTaxEstimate,
  getTaxProfileSummary,
  recalculateTaxProfile
} = require('../controllers/taxProfileController');
const authMiddleware = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authMiddleware);

// Summary endpoint (before :year route)
router.get('/:year/summary', getTaxProfileSummary);

// Estimate endpoint (before :year route)
router.get('/:year/estimate', getTaxEstimate);

// Recalculate endpoint (before :year route)
router.post('/:year/recalculate', recalculateTaxProfile);

// CRUD routes
router.get('/', getTaxProfiles);
router.get('/:year', getTaxProfile);
router.post('/', createOrUpdateTaxProfile);

module.exports = router;

