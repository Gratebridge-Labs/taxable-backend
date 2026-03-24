/**
 * Upload session and file upload for gettaxable.com/uploads flow.
 * - Create upload session (returns uploadId + link to UI).
 * - Get session by uploadId (for UI; no auth).
 * - Upload file (multipart); store file, create Document, return URL.
 * - Relief document status for a profile.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const mongoose = require('mongoose');
const multer = require('multer');
const Upload = require('../models/Upload');
const Document = require('../models/Document');
const TaxableProfile = require('../models/TaxableProfile');
const Deduction = require('../models/Deduction');
const { generateUploadId } = require('../models/Upload');
const { NIGERIAN_BANKS } = require('../constants/banks');
const { API_BASE_URL } = require('../config/constants');

const UPLOADS_BASE = (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) ? os.tmpdir() : process.cwd();
const UPLOADS_DIR = path.join(UPLOADS_BASE, 'uploads', 'documents');

const UPLOAD_PAGE_BASE = process.env.UPLOAD_PAGE_BASE || 'https://dashboard.gettaxable.com';

// Multer: store in uploads/documents/{userId}, unique filename
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const userId = req.uploadUserId || 'anon';
    const dir = path.join(UPLOADS_DIR, String(userId));
    try {
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    } catch (e) {
      cb(e);
    }
  },
  filename: (req, file, cb) => {
    const id = new mongoose.Types.ObjectId();
    const ext = (path.extname(file.originalname) || '').replace(/[^a-zA-Z0-9.]/g, '') || '.bin';
    cb(null, `${id}${ext}`);
  }
});
const uploadMulter = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowed = /\.(pdf|jpg|jpeg|png|gif|webp)$/i.test(file.originalname) ||
      ['application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp'].includes(file.mimetype);
    if (allowed) cb(null, true);
    else cb(new Error('Only PDF and images (jpg, png, gif, webp) are allowed'));
  }
});

/**
 * POST /api/uploads — Create upload session (auth required).
 * Body: profileId (optional), year (optional), type (optional).
 * Returns: { uploadId, uploadUrl } where uploadUrl = https://gettaxable.com/uploads/:uploadId
 */
const createUploadSession = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { profileId: profileIdStr, year, type } = req.body || {};
    let profileIdObj = null;
    if (profileIdStr) {
      const profile = await TaxableProfile.findOne({ profileId: profileIdStr, user: userId }).select('_id').lean();
      if (!profile) return res.status(404).json({ success: false, message: 'Tax profile not found' });
      profileIdObj = profile._id;
    }

    const uploadId = generateUploadId();
    const upload = new Upload({
      uploadId,
      user: userId,
      profileId: profileIdObj || undefined,
      year: year ? Number(year) : undefined,
      type: type || 'general',
      status: 'pending',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days
    });
    await upload.save();

    const uploadUrl = `${UPLOAD_PAGE_BASE}/uploads/${uploadId}`;
    return res.status(201).json({
      success: true,
      data: { uploadId, uploadUrl }
    });
  } catch (err) {
    console.error('[Upload] createSession error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to create upload session' });
  }
};

/**
 * POST /api/upload/deduction — Upload deduction document (auth required).
 * Multipart form: file, profileId (string), deductionType, year
 * Returns: { url, documentId } — url is e.g. https://api.gettaxable.com/api/documents/serve/:id
 */
const uploadDeductionDocument = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { profileId: profileIdStr, deductionType, year } = req.body || {};
    
    if (!profileIdStr) return res.status(400).json({ success: false, message: 'profileId is required' });
    if (!deductionType) return res.status(400).json({ success: false, message: 'deductionType is required' });
    if (!year) return res.status(400).json({ success: false, message: 'year is required' });
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    // Validate profile belongs to user
    const profile = await TaxableProfile.findOne({ 
      profileId: profileIdStr, 
      user: userId 
    }).select('_id profileId year').lean();
    
    if (!profile) {
      return res.status(404).json({ 
        success: false, 
        message: 'Tax profile not found or access denied' 
      });
    }

    // Validate deduction type
    const validDeductionTypes = ['nhf', 'nhis', 'pension', 'life_insurance', 'mortgage_interest', 'rent_relief', 'transport_allowance', 'other'];
    if (!validDeductionTypes.includes(deductionType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid deduction type. Must be one of: ${validDeductionTypes.join(', ')}`
      });
    }

    // Create document record
    const id = new mongoose.Types.ObjectId();
    const fileName = req.file.filename;
    const originalFileName = req.file.originalname || fileName;
    const fileUrl = `${API_BASE_URL.replace(/\/$/, '')}/documents/serve/${id}`;

    const doc = new Document({
      _id: id,
      profileId: profile._id,
      documentType: 'receipt',
      category: 'deduction',
      fileName,
      originalFileName,
      fileUrl,
      filePath: path.join('uploads', 'documents', userId, fileName),
      fileSize: req.file.size || 0,
      mimeType: req.file.mimetype || 'application/octet-stream',
      description: `${deductionType} deduction document for ${year}`,
      uploadedBy: userId
    });

    await doc.save();

    return res.status(201).json({
      success: true,
      data: { 
        url: doc.fileUrl, 
        documentId: doc._id,
        profileId: profileIdStr,
        deductionType,
        year: Number(year)
      }
    });

  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: err.message });
    }
    console.error('[Upload] uploadDeductionDocument error:', err.message);
    return res.status(500).json({ 
      success: false, 
      message: err.message || 'Failed to upload deduction document' 
    });
  }
};

/**
 * Internal helper used by web/WhatsApp flows to create upload sessions.
 */
const createUploadSessionForUser = async (userId, profileId, year, type = 'general') => {
  const uploadId = generateUploadId();
  const upload = await Upload.create({
    uploadId,
    user: userId,
    profileId: profileId || undefined,
    year: year !== undefined && year !== null ? Number(year) : undefined,
    type,
    status: 'pending',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  });

  return {
    uploadId: upload.uploadId,
    uploadUrl: `${UPLOAD_PAGE_BASE}/uploads/${upload.uploadId}`,
    upload
  };
};

/**
 * GET /api/uploads/:uploadId
 */
const getUploadByUploadId = async (req, res) => {
  try {
    const { uploadId } = req.params;
    const upload = await Upload.findOne({ uploadId }).lean();
    if (!upload) return res.status(404).json({ success: false, message: 'Upload session not found' });

    return res.status(200).json({
      success: true,
      data: {
        uploadId: upload.uploadId,
        profileId: upload.profileId,
        year: upload.year,
        type: upload.type,
        status: upload.status,
        selectedBanks: upload.selectedBanks || [],
        files: upload.files || [],
        expiresAt: upload.expiresAt,
        createdAt: upload.createdAt
      }
    });
  } catch (err) {
    console.error('[Upload] getUploadByUploadId error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to retrieve upload session' });
  }
};

/**
 * PATCH /api/uploads/:uploadId
 * Body: { selectedBanks: string[] }
 */
const updateUploadBanks = async (req, res) => {
  try {
    const { uploadId } = req.params;
    const selectedBanks = Array.isArray(req.body?.selectedBanks) ? req.body.selectedBanks : [];

    const upload = await Upload.findOne({ uploadId });
    if (!upload) return res.status(404).json({ success: false, message: 'Upload session not found' });

    upload.selectedBanks = selectedBanks.map((bank) => String(bank).trim()).filter(Boolean);
    await upload.save();

    return res.status(200).json({
      success: true,
      message: 'Selected banks updated',
      data: { uploadId: upload.uploadId, selectedBanks: upload.selectedBanks }
    });
  } catch (err) {
    console.error('[Upload] updateUploadBanks error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to update selected banks' });
  }
};

/**
 * Middleware for /api/upload multipart endpoint.
 * Resolves upload session and attaches user/profile context before multer runs.
 */
const resolveUploadForUpload = async (req, res, next) => {
  try {
    const uploadId = req.body?.uploadId || req.query?.uploadId;
    if (!uploadId) return res.status(400).json({ success: false, message: 'uploadId is required' });

    const upload = await Upload.findOne({ uploadId }).lean();
    if (!upload) return res.status(404).json({ success: false, message: 'Upload session not found' });

    req.uploadSession = upload;
    req.uploadUserId = String(upload.user);
    req.uploadProfileId = upload.profileId ? String(upload.profileId) : null;
    next();
  } catch (err) {
    console.error('[Upload] resolveUploadForUpload error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to resolve upload session' });
  }
};

/**
 * POST /api/upload
 * Multipart form: file + uploadId + optional kind/bankId/deductionId
 */
const uploadFile = async (req, res) => {
  try {
    if (!req.uploadSession) return res.status(400).json({ success: false, message: 'Invalid upload session context' });
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const id = new mongoose.Types.ObjectId();
    const fileName = req.file.filename;
    const originalFileName = req.file.originalname || fileName;
    const fileUrl = `${API_BASE_URL.replace(/\/$/, '')}/documents/serve/${id}`;

    const doc = await Document.create({
      _id: id,
      profileId: req.uploadSession.profileId,
      documentType: 'other',
      category: 'proof',
      fileName,
      originalFileName,
      fileUrl,
      filePath: path.join('uploads', 'documents', String(req.uploadSession.user), fileName),
      fileSize: req.file.size || 0,
      mimeType: req.file.mimetype || 'application/octet-stream',
      description: 'Uploaded via upload session',
      uploadedBy: req.uploadSession.user
    });

    await Upload.updateOne(
      { _id: req.uploadSession._id },
      {
        $push: {
          files: {
            documentId: doc._id,
            fileUrl: doc.fileUrl,
            kind: req.body?.kind === 'bank_statement' ? 'bank_statement' : 'relief',
            bankId: req.body?.bankId ? String(req.body.bankId) : undefined,
            deductionId: req.body?.deductionId || undefined,
            uploadedAt: new Date()
          }
        },
        $set: { status: 'completed', updatedAt: new Date() }
      }
    );

    return res.status(201).json({
      success: true,
      data: {
        url: doc.fileUrl,
        documentId: doc._id,
        uploadId: req.uploadSession.uploadId
      }
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: err.message });
    }
    console.error('[Upload] uploadFile error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to upload file' });
  }
};

/**
 * GET /api/uploads/relief-document-status?profileId=TPxxxxx or ObjectId
 */
const getReliefDocumentStatus = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const profileId = req.query?.profileId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });
    if (!profileId) return res.status(400).json({ success: false, message: 'profileId is required' });

    const profile = await TaxableProfile.findByProfileIdOrId(String(profileId), userId).select('_id').lean();
    if (!profile) return res.status(404).json({ success: false, message: 'Tax profile not found' });

    const docs = await Document.find({ profileId: profile._id, category: 'deduction' })
      .select('_id originalFileName createdAt linkedTo.deductionId')
      .lean();
    const deductions = await Deduction.find({ profileId: profile._id })
      .select('_id deductionType verificationStatus amount')
      .lean();

    return res.status(200).json({
      success: true,
      data: {
        profileId,
        deductionCount: deductions.length,
        documentCount: docs.length,
        deductions,
        documents: docs
      }
    });
  } catch (err) {
    console.error('[Upload] getReliefDocumentStatus error:', err.message);
    return res.status(500).json({ success: false, message: 'Failed to get relief document status' });
  }
};

/**
 * GET /api/uploads/banks
 */
const listBanks = async (req, res) => {
  return res.status(200).json({
    success: true,
    data: {
      banks: Array.isArray(NIGERIAN_BANKS) ? NIGERIAN_BANKS : []
    }
  });
};

module.exports = {
  createUploadSession,
  createUploadSessionForUser,
  getUploadByUploadId,
  updateUploadBanks,
  resolveUploadForUpload,
  uploadMulter,
  uploadFile,
  uploadDeductionDocument,
  getReliefDocumentStatus,
  listBanks
};
