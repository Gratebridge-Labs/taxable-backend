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
const { accountMiddleware } = require('../middleware/accountMiddleware');

// All routes require authentication
router.use(authMiddleware);

// All routes require account context
router.use(accountMiddleware);

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

