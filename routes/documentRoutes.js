const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { checkEmailVerified } = require('../middleware/profileAuth');
const {
  createDocument,
  listDocuments,
  getDocumentById,
  deleteDocument,
  serveDocument
} = require('../controllers/documentController');

router.post('/', authenticate, checkEmailVerified, createDocument);
router.get('/', authenticate, checkEmailVerified, listDocuments);
router.get('/serve/:id', authenticate, checkEmailVerified, serveDocument);
router.get('/:id', authenticate, checkEmailVerified, getDocumentById);
router.delete('/:id', authenticate, checkEmailVerified, deleteDocument);

module.exports = router;
