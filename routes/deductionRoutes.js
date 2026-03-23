const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { checkEmailVerified } = require('../middleware/profileAuth');
const {
  createDeduction,
  listDeductions,
  listDeductionsByProfileId,
  getDeductionById,
  updateDeduction,
  deleteDeduction,
  verifyDeduction
} = require('../controllers/deductionController');

router.post('/', authenticate, checkEmailVerified, createDeduction);
router.get('/', authenticate, checkEmailVerified, listDeductions); // GET /api/deductions?profileId=xxx&year=2025

// Combined route handler for both GET /api/deductions/:id (single deduction) and GET /api/deductions/:profileId (list by profile)
router.get('/:param', authenticate, checkEmailVerified, async (req, res, next) => {
  const { param } = req.params;
  const { year } = req.query;
  
  // Check if param is a valid MongoDB ObjectId (24 hex chars)
  const isObjectId = /^[0-9a-fA-F]{24}$/.test(param);
  
  if (isObjectId && !year) {
    // If it's an ObjectId and no year query param, treat as single deduction ID
    req.params.id = param;
    return getDeductionById(req, res, next);
  } else {
    // Otherwise treat as profileId for listing deductions (requires year query param)
    req.params.profileId = param;
    return listDeductionsByProfileId(req, res, next);
  }
});

router.put('/:id', authenticate, checkEmailVerified, updateDeduction);
router.delete('/:id', authenticate, checkEmailVerified, deleteDeduction);
router.post('/:id/verify', authenticate, checkEmailVerified, verifyDeduction);

module.exports = router;
