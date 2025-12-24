const express = require('express');
const router = express.Router();
const {
  getTransactions,
  getTransaction,
  createTransaction,
  updateTransaction,
  deleteTransaction,
  getTransactionSummary,
  bulkImportTransactions
} = require('../controllers/transactionController');
const authMiddleware = require('../middleware/authMiddleware');

// All routes require authentication
router.use(authMiddleware);

// Summary endpoint (before :id route)
router.get('/summary', getTransactionSummary);

// Bulk import endpoint
router.post('/bulk-import', bulkImportTransactions);

// CRUD routes
router.get('/', getTransactions);
router.get('/:id', getTransaction);
router.post('/', createTransaction);
router.put('/:id', updateTransaction);
router.delete('/:id', deleteTransaction);

module.exports = router;

