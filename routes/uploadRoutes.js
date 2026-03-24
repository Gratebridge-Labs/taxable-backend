const express = require('express');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const {
  createUploadSession,
  getUploadByUploadId,
  updateUploadBanks,
  uploadFile,
  uploadDeductionDocument,
  resolveUploadForUpload,
  resolveSimpleUploadUser,
  uploadMulter,
  uploadSimpleFile,
  getReliefDocumentStatus,
  listBanks
} = require('../controllers/uploadController');

// Create upload session (auth required)
router.post('/uploads', authenticate, createUploadSession);

// Relief document status (auth required) — for dashboard / UI
router.get('/uploads/relief-document-status', authenticate, getReliefDocumentStatus);

// List banks (public, for upload UI)
router.get('/uploads/banks', listBanks);

// Get upload session by uploadId (no auth; link is secret)
router.get('/uploads/:uploadId', getUploadByUploadId);

// Update selected banks (no auth)
router.patch('/uploads/:uploadId', updateUploadBanks);

// File upload (multipart): use uploadId in body or query; no auth
router.post(
  '/upload',
  resolveUploadForUpload,
  uploadMulter.single('file'),
  uploadFile
);

// Simple generic upload (auth required): multipart file only
router.post(
  '/upload/simple',
  authenticate,
  resolveSimpleUploadUser,
  uploadMulter.single('file'),
  uploadSimpleFile
);

// Deduction document upload (auth required)
router.post(
  '/upload/deduction',
  authenticate,
  uploadMulter.single('file'),
  uploadDeductionDocument
);

module.exports = router;
