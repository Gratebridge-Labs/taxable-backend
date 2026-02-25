/**
 * Document API – create (link to deduction/income), list by profile or deduction (PDF: upload documents for reliefs).
 * Upload: client uploads file to storage (S3/Cloudinary) and sends fileUrl + metadata; or create from buffer (WhatsApp).
 */

const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const Document = require('../models/Document');
const TaxableProfile = require('../models/TaxableProfile');
const Deduction = require('../models/Deduction');

const APP_URL = process.env.APP_URL || 'https://dashboard.gettaxable.com';
const UPLOADS_DIR = path.join(process.cwd(), 'uploads', 'documents');

/** Resolve profileId string to TaxableProfile belonging to user */
async function getProfileForUser(profileIdStr, userId) {
  if (!profileIdStr || !userId) return null;
  return TaxableProfile.findOne({ profileId: profileIdStr, user: userId }).select('_id').lean();
}

/**
 * POST /api/documents
 * Body: profileId (string), documentType, category, fileName, originalFileName, fileUrl, fileSize, mimeType,
 *       linkedTo: { deductionId?, incomeSourceId? }, description?
 */
const createDocument = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { profileId: profileIdStr, documentType, category, fileName, originalFileName, fileUrl, fileSize, mimeType, linkedTo, description } = req.body;

    if (!profileIdStr || !documentType || !fileName || !originalFileName || !fileUrl || fileSize == null || !mimeType) {
      return res.status(400).json({
        success: false,
        message: 'profileId, documentType, fileName, originalFileName, fileUrl, fileSize, and mimeType are required'
      });
    }

    const profile = await getProfileForUser(profileIdStr, userId);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Tax profile not found' });
    }

    if (linkedTo?.deductionId) {
      const deduction = await Deduction.findOne({ _id: linkedTo.deductionId, profileId: profile._id }).lean();
      if (!deduction) {
        return res.status(400).json({ success: false, message: 'Deduction not found or does not belong to this profile' });
      }
    }

    const doc = new Document({
      profileId: profile._id,
      documentType,
      category: category || 'deduction',
      fileName,
      originalFileName,
      fileUrl,
      fileSize: Number(fileSize),
      mimeType,
      linkedTo: linkedTo || {},
      description: description || null,
      uploadedBy: userId
    });
    await doc.save();

    return res.status(201).json({
      success: true,
      message: 'Document saved',
      data: doc
    });
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: err.message || 'Validation failed',
        errors: err.errors ? Object.fromEntries(Object.entries(err.errors).map(([k, v]) => [k, v.message])) : undefined
      });
    }
    console.error('[Document] create error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to create document' });
  }
};

/**
 * GET /api/documents?profileId=xxx&year=2025 | ?deductionId=xxx
 */
const listDocuments = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const { profileId: profileIdStr, deductionId } = req.query;

    if (deductionId) {
      const deduction = await Deduction.findById(deductionId).populate('profileId', 'user').lean();
      if (!deduction) {
        return res.status(404).json({ success: false, message: 'Deduction not found' });
      }
      if (deduction.profileId?.user?.toString() !== userId) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const list = await Document.find({ 'linkedTo.deductionId': deductionId }).sort({ uploadedAt: -1 }).lean();
      return res.status(200).json({ success: true, data: list, count: list.length });
    }

    if (!profileIdStr) {
      return res.status(400).json({
        success: false,
        message: 'Query param profileId or deductionId is required'
      });
    }

    const profile = await getProfileForUser(profileIdStr, userId);
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Tax profile not found' });
    }

    const list = await Document.find({ profileId: profile._id }).sort({ uploadedAt: -1 }).lean();
    return res.status(200).json({ success: true, data: list, count: list.length });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid id' });
    }
    console.error('[Document] list error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to list documents' });
  }
};

/**
 * GET /api/documents/:id
 */
const getDocumentById = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const doc = await Document.findById(req.params.id).populate('profileId', 'user').lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }
    const profile = await TaxableProfile.findById(doc.profileId).select('user').lean();
    if (!profile || profile.user.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    return res.status(200).json({ success: true, data: doc });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid document id' });
    }
    console.error('[Document] get error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to get document' });
  }
};

/**
 * DELETE /api/documents/:id
 */
const deleteDocument = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const doc = await Document.findById(req.params.id).lean();
    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found' });
    }
    const profile = await TaxableProfile.findById(doc.profileId).select('user').lean();
    if (!profile || profile.user.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    await Document.findByIdAndDelete(req.params.id);

    return res.status(200).json({
      success: true,
      message: 'Document removed'
    });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ success: false, message: 'Invalid document id' });
    }
    console.error('[Document] delete error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to delete document' });
  }
};

/**
 * Stream document file to response (for docs stored on disk via WhatsApp upload).
 * GET /api/documents/serve/:id
 */
const serveDocument = async (req, res) => {
  try {
    const userId = req.user?.userId;
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const doc = await Document.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found' });
    const profile = await TaxableProfile.findById(doc.profileId).select('user').lean();
    if (!profile || profile.user.toString() !== userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
    if (!doc.filePath) {
      return res.status(400).json({ success: false, message: 'File not stored locally; use fileUrl' });
    }
    const absolutePath = path.isAbsolute(doc.filePath) ? doc.filePath : path.join(process.cwd(), doc.filePath);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, message: 'File not found on server' });
    }
    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.originalFileName || doc.fileName)}"`);
    fs.createReadStream(absolutePath).pipe(res);
  } catch (err) {
    if (err.name === 'CastError') return res.status(400).json({ success: false, message: 'Invalid document id' });
    console.error('[Document] serve error:', err.message);
    return res.status(500).json({ success: false, message: err.message || 'Failed to serve file' });
  }
};

/**
 * Create a document from a buffer (e.g. WhatsApp media). Saves file to uploads/documents/{userId}/{id}-{filename}.
 * Returns the created document or throws.
 */
async function createDocumentFromBuffer(userId, profileId, deductionId, buffer, originalFileName, mimeType) {
  const profile = await TaxableProfile.findOne({ _id: profileId, user: userId }).select('_id').lean();
  if (!profile) throw new Error('Tax profile not found');
  if (deductionId) {
    const deduction = await Deduction.findOne({ _id: deductionId, profileId }).lean();
    if (!deduction) throw new Error('Deduction not found');
  }
  const id = new mongoose.Types.ObjectId();
  const safeName = (originalFileName || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'file';
  const ext = path.extname(safeName) || (mimeType && mimeType.includes('pdf') ? '.pdf' : '.bin');
  const fileName = `${id}${ext}`;
  const userDir = path.join(UPLOADS_DIR, String(userId));
  fs.mkdirSync(userDir, { recursive: true });
  const relativePath = path.join('uploads', 'documents', String(userId), fileName);
  const absolutePath = path.join(process.cwd(), relativePath);
  fs.writeFileSync(absolutePath, buffer);
  const doc = new Document({
    _id: id,
    profileId,
    documentType: 'receipt',
    category: 'deduction',
    fileName,
    originalFileName: originalFileName || fileName,
    fileUrl: `${APP_URL}/api/documents/serve/${id}`,
    filePath: relativePath,
    fileSize: buffer.length,
    mimeType: mimeType || 'application/octet-stream',
    linkedTo: deductionId ? { deductionId } : {},
    uploadedBy: userId
  });
  await doc.save();
  return doc;
}

module.exports = {
  createDocument,
  listDocuments,
  getDocumentById,
  deleteDocument,
  serveDocument,
  createDocumentFromBuffer,
  getProfileForUser
};
