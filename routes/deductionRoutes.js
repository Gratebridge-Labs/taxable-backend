const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { checkEmailVerified } = require('../middleware/profileAuth');
const {
  createDeduction,
  listDeductions,
  getDeductionById,
  updateDeduction,
  deleteDeduction
} = require('../controllers/deductionController');

router.post('/', authenticate, checkEmailVerified, createDeduction);
router.get('/', authenticate, checkEmailVerified, listDeductions);
router.get('/:id', authenticate, checkEmailVerified, getDeductionById);
router.put('/:id', authenticate, checkEmailVerified, updateDeduction);
router.delete('/:id', authenticate, checkEmailVerified, deleteDeduction);

module.exports = router;
