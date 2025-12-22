const express = require('express');
const router = express.Router();
const {
  uploadDocument,
  getDocuments,
  getDocument,
  deleteDocument,
  getDocumentStatus,
  processDocument
} = require('../controllers/documentController');
const authMiddleware = require('../middleware/authMiddleware');
const { handleUpload } = require('../middleware/uploadMiddleware');

// All routes require authentication
router.use(authMiddleware);

// Upload document
router.post('/upload', handleUpload, uploadDocument);

// Get all documents
router.get('/', getDocuments);

// Process document
router.post('/:id/process', processDocument);

// Get document status
router.get('/:id/status', getDocumentStatus);

// Get single document
router.get('/:id', getDocument);

// Delete document
router.delete('/:id', deleteDocument);

module.exports = router;

