const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { checkEmailVerified } = require('../middleware/profileAuth');
const {
  createDeduction,
  createDeductions,
  listDeductions,
  getDeductionById,
  updateDeduction,
  deleteDeduction
} = require('../controllers/deductionController');

router.post('/', authenticate, checkEmailVerified, createDeduction); // Single deduction
router.post('/batch', authenticate, checkEmailVerified, createDeductions); // Bulk save (create/update by replace)
router.get('/', authenticate, checkEmailVerified, listDeductions); // GET /api/deductions?profileId=xxx&year=2025
router.get('/:id', authenticate, checkEmailVerified, getDeductionById);
router.put('/:id', authenticate, checkEmailVerified, updateDeduction);
router.delete('/:id', authenticate, checkEmailVerified, deleteDeduction);

module.exports = router;
