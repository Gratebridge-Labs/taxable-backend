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
 * GET /api/uploads/:uploadId — Get upload session (no auth; link is secret).
 * Returns: upload session, banks list, reliefDocumentStatus (if profileId set).
 */
const getUploadByUploadId = async (req, res) => {
  try {
    const { uploadId } = req.params;
    const upload = await Upload.findOne({ uploadId })
      .populate('profileId', 'year profileId')
      .lean();
    if (!upload) return res.status(404).json({ success: false, message: 'Upload session not found' });
    if (upload.expiresAt && new Date(upload.expiresAt) < new Date()) {
      return res.status(410).json({ success: false, message: 'Upload session has expired' });
    }

    let reliefDocumentStatus = null;
    if (upload.profileId) {
      reliefDocumentStatus = await getReliefDocumentStatusForProfile(upload.profileId._id, upload.year || upload.profileId.year);
    }

    return res.status(200).json({
      success: true,
      data: {
        uploadId: upload.uploadId,
        status: upload.status,
        type: upload.type,
        year: upload.year || upload.profileId?.year,
        profileId: upload.profileId?._id?.toString(),
        selectedBanks: upload.selectedBanks || [],
        files: upload.files || [],
        reliefDocumentStatus,
        banks: NIGERIAN_BANKS
      }
    });
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ success: false, message: 'Invalid upload id' });
    console.error('[Upload] getByUploadId error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to get upload session' });
  }
};

/**
 * PATCH /api/uploads/:uploadId — Update selected banks (optional; no auth).
 * Body: { selectedBanks: string[] }
 */
const updateUploadBanks = async (req, res) => {
  try {
    const { uploadId } = req.params;
    const { selectedBanks } = req.body || {};
    const upload = await Upload.findOne({ uploadId });
    if (!upload) return res.status(404).json({ success: false, message: 'Upload session not found' });
    if (upload.expiresAt && new Date(upload.expiresAt) < new Date()) {
      return res.status(410).json({ success: false, message: 'Upload session has expired' });
    }
    if (Array.isArray(selectedBanks)) {
      upload.selectedBanks = selectedBanks.filter(b => typeof b === 'string');
      await upload.save();
    }
    return res.status(200).json({ success: true, data: { selectedBanks: upload.selectedBanks } });
  } catch (err) {
    console.error('[Upload] updateBanks error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to update' });
  }
};

/**
 * POST /api/upload — Upload file (multipart).
 * Query or body (form): uploadId, kind (bank_statement|relief), bankId?, deductionId?.
 * File field: "file".
 * No auth; uploadId identifies the session.
 * Returns: { url, documentId } — url is e.g. https://api.gettaxable.com/api/documents/serve/:id
 */
const uploadFile = async (req, res) => {
  try {
    const uploadId = (req.body?.uploadId || req.query?.uploadId || '').trim();
    const kind = (req.body?.kind || req.query?.kind || 'bank_statement').trim();
    const bankId = req.body?.bankId || req.query?.bankId;
    const deductionIdStr = req.body?.deductionId || req.query?.deductionId;

    if (!uploadId) return res.status(400).json({ success: false, message: 'uploadId is required' });
    if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });

    const upload = await Upload.findOne({ uploadId });
    if (!upload) return res.status(404).json({ success: false, message: 'Upload session not found' });
    if (upload.expiresAt && new Date(upload.expiresAt) < new Date()) {
      return res.status(410).json({ success: false, message: 'Upload session has expired' });
    }

    const userId = upload.user.toString();
    const profileId = upload.profileId;
    if (!profileId) return res.status(400).json({ success: false, message: 'Upload session has no profile; add a profile first' });

    let deductionId = null;
    if (deductionIdStr && kind === 'relief') {
      const deduction = await Deduction.findOne({ _id: deductionIdStr, profileId }).lean();
      if (!deduction) return res.status(400).json({ success: false, message: 'Deduction not found' });
      deductionId = deduction._id;
    }

    const id = new mongoose.Types.ObjectId();
    const fileName = req.file.filename;
    const originalFileName = req.file.originalname || fileName;
    const filePathForDoc = path.join(UPLOADS_DIR, userId, fileName);
    const absolutePath = path.isAbsolute(filePathForDoc) ? filePathForDoc : path.join(UPLOADS_DIR, userId, fileName);
    const fileUrl = `${API_BASE_URL.replace(/\/$/, '')}/documents/serve/${id}`;

    const doc = new Document({
      _id: id,
      profileId,
      documentType: kind === 'bank_statement' ? 'bank_statement' : 'receipt',
      category: 'deduction',
      fileName,
      originalFileName,
      fileUrl,
      filePath: UPLOADS_BASE !== process.cwd() ? absolutePath : path.join('uploads', 'documents', userId, fileName),
      fileSize: req.file.size || 0,
      mimeType: req.file.mimetype || 'application/octet-stream',
      linkedTo: deductionId ? { deductionId } : {},
      uploadedBy: userId
    });
    await doc.save();

    upload.files.push({
      documentId: doc._id,
      fileUrl: doc.fileUrl,
      kind: kind === 'relief' ? 'relief' : 'bank_statement',
      bankId: bankId || undefined,
      deductionId: deductionId || undefined
    });
    await upload.save();

    return res.status(201).json({
      success: true,
      data: { url: doc.fileUrl, documentId: doc._id }
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: err.message });
    }
    console.error('[Upload] uploadFile error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to upload file' });
  }
};

/** Middleware: resolve uploadId and set req.uploadUserId for multer destination */
const resolveUploadForUpload = async (req, res, next) => {
  const uploadId = (req.body?.uploadId || req.query?.uploadId || '').trim();
  if (!uploadId) return next();
  try {
    const upload = await Upload.findOne({ uploadId }).select('user').lean();
    if (upload) req.uploadUserId = upload.user.toString();
  } catch (e) { /* ignore */ }
  next();
};

/**
 * Ensure Deduction records exist for profile-level reliefs (paysRent, hasHealthInsurance, hasPension, paysMortgage)
 * so upload session can show reliefDocumentStatus and user can upload supporting docs.
 * Rent = annual only. Health, pension, mortgage = stored monthly on profile → we use monthly * 12 for annual relief.
 */
async function ensureProfileReliefDeductions(profileId, year) {
  const profile = await TaxableProfile.findById(profileId)
    .select('year paysRent rentMonthlyAmount rentAnnualAmount hasHealthInsurance healthInsuranceMonthlyAmount healthInsuranceAnnualAmount hasPension pensionMonthlyAmount pensionAnnualAmount paysMortgage mortgageMonthlyAmount mortgageAnnualAmount')
    .lean();
  if (!profile) return;
  const y = year || profile.year;
  const period = { year: y, startDate: new Date(y, 0, 1), endDate: new Date(y, 11, 31) };

  // Rent: collected as annual
  const rentAnnual = profile.rentAnnualAmount ?? (profile.rentMonthlyAmount != null ? profile.rentMonthlyAmount * 12 : 0);
  // Health, pension, mortgage: collected as monthly → annual = monthly * 12 for relief/session
  const healthAnnual = profile.healthInsuranceAnnualAmount ?? (profile.healthInsuranceMonthlyAmount != null ? profile.healthInsuranceMonthlyAmount * 12 : 0);
  const pensionAnnual = profile.pensionAnnualAmount ?? (profile.pensionMonthlyAmount != null ? profile.pensionMonthlyAmount * 12 : 0);
  const mortgageAnnual = profile.mortgageAnnualAmount ?? (profile.mortgageMonthlyAmount != null ? profile.mortgageMonthlyAmount * 12 : 0);

  if (profile.paysRent && rentAnnual > 0) {
    const exists = await Deduction.findOne({ profileId, 'period.year': y, deductionType: 'rent_relief' }).select('_id').lean();
    if (!exists) {
      await Deduction.create({
        profileId,
        deductionType: 'rent_relief',
        period,
        amount: 0,
        rentRelief: { annualRent: rentAnnual }
      });
    }
  }
  if (profile.hasHealthInsurance && healthAnnual > 0) {
    const exists = await Deduction.findOne({ profileId, 'period.year': y, deductionType: 'nhis' }).select('_id').lean();
    if (!exists) {
      await Deduction.create({
        profileId,
        deductionType: 'nhis',
        period,
        amount: healthAnnual,
        nhis: { contribution: healthAnnual }
      });
    }
  }
  if (profile.hasPension && pensionAnnual > 0) {
    const exists = await Deduction.findOne({ profileId, 'period.year': y, deductionType: 'pension' }).select('_id').lean();
    if (!exists) {
      await Deduction.create({
        profileId,
        deductionType: 'pension',
        period,
        amount: pensionAnnual,
        pension: { contribution: pensionAnnual }
      });
    }
  }
  if (profile.paysMortgage && mortgageAnnual > 0) {
    const exists = await Deduction.findOne({ profileId, 'period.year': y, deductionType: 'mortgage_interest' }).select('_id').lean();
    if (!exists) {
      await Deduction.create({
        profileId,
        deductionType: 'mortgage_interest',
        period,
        amount: mortgageAnnual,
        mortgageInterest: { interestPaid: mortgageAnnual }
      });
    }
  }
}

/**
 * Get relief document status for a profile: which reliefs user has declared and whether each has supporting docs.
 * Used by GET /api/uploads/:uploadId and by GET /api/profiles/:profileId/relief-document-status.
 * Ensures Deduction records exist from profile relief fields so WhatsApp-only users get status.
 */
async function getReliefDocumentStatusForProfile(profileId, year) {
  const profile = await TaxableProfile.findById(profileId).lean();
  if (!profile) return null;

  await ensureProfileReliefDeductions(profileId, year || profile.year);

  const deductions = await Deduction.find({ profileId, 'period.year': year || profile.year }).lean();
  const deductionIds = deductions.map(d => d._id);
  const docsByDeduction = await Document.find({ 'linkedTo.deductionId': { $in: deductionIds } })
    .select('linkedTo.deductionId')
    .lean();

  const hasDoc = new Set(docsByDeduction.map(d => d.linkedTo?.deductionId?.toString()).filter(Boolean));

  const reliefLabels = {
    nhf: 'NHF',
    nhis: 'NHIS',
    pension: 'Pension',
    life_insurance: 'Life Insurance',
    mortgage_interest: 'Mortgage Interest',
    rent_relief: 'Rent Relief',
    transport_allowance: 'Transport Allowance',
    other: 'Other'
  };

  return deductions.map(d => ({
    deductionId: d._id,
    deductionType: d.deductionType,
    label: reliefLabels[d.deductionType] || d.deductionType,
    amount: d.amount,
    hasSupportingDocument: hasDoc.has(d._id.toString())
  }));
}

/**
 * GET /api/uploads/relief-document-status?profileId=xxx&year=2025
 * Returns which reliefs the user has declared and whether each has a supporting document.
 */
const getReliefDocumentStatus = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const profileId = req.query.profileId;
    const year = req.query.year ? Number(req.query.year) : null;
    if (!profileId) return res.status(400).json({ success: false, message: 'profileId is required' });

    const profile = await TaxableProfile.findOne({ _id: profileId, user: userId }).select('_id year').lean();
    if (!profile) return res.status(404).json({ success: false, message: 'Profile not found' });

    const status = await getReliefDocumentStatusForProfile(profile._id, year || profile.year);
    return res.status(200).json({ success: true, data: status });
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ success: false, message: 'Invalid profile id' });
    console.error('[Upload] reliefDocumentStatus error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to get relief document status' });
  }
};

/** GET /api/uploads/banks — List banks (no auth) */
const listBanks = (req, res) => {
  return res.status(200).json({ success: true, data: NIGERIAN_BANKS });
};

/**
 * Create an upload session for a user (e.g. from WhatsApp). Returns { uploadId, uploadUrl }.
 */
async function createUploadSessionForUser(userId, profileId, year) {
  const uploadId = generateUploadId();
  const upload = new Upload({
    uploadId,
    user: userId,
    profileId: profileId || undefined,
    year: year ? Number(year) : undefined,
    type: 'general',
    status: 'pending',
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
  });
  await upload.save();
  return { uploadId, uploadUrl: `${UPLOAD_PAGE_BASE}/uploads/${uploadId}` };
}

module.exports = {
  createUploadSession,
  getUploadByUploadId,
  updateUploadBanks,
  uploadFile,
  resolveUploadForUpload,
  uploadMulter,
  getReliefDocumentStatus,
  getReliefDocumentStatusForProfile,
  listBanks,
  createUploadSessionForUser
};
