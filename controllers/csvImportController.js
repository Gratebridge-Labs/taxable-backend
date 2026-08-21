const fs = require('fs');
const path = require('path');
const multer = require('multer');
const {
  IMPORT_TYPES,
  SAMPLE_FILES,
  parseImportBuffer,
  samplePath
} = require('../utils/csvImportParser');

const importMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const name = file.originalname || '';
    const mime = file.mimetype || '';
    const allowedExt = /\.(csv|xlsx|xls)$/i.test(name);
    const allowedMime = [
      'text/csv',
      'text/plain',
      'application/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream'
    ].includes(mime);
    if (allowedExt || allowedMime) cb(null, true);
    else cb(new Error('Only CSV or Excel files (.csv, .xlsx, .xls) are allowed'));
  }
});

/**
 * GET /api/taxableprofile/business/import/samples/:type
 * Download a filled-in sample CSV for VAT, WHT, PAYE, or CIT WHT credits.
 */
const downloadSample = (req, res) => {
  const importType = String(req.params.type || '').trim();
  const meta = SAMPLE_FILES[importType];
  const filePath = samplePath(importType);

  if (!meta || !filePath || !fs.existsSync(filePath)) {
    return res.status(404).json({
      success: false,
      message: `Unknown sample type. Use one of: ${IMPORT_TYPES.join(', ')}`
    });
  }

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${meta.downloadName}"`);
  return res.sendFile(path.resolve(filePath));
};

/**
 * POST /api/taxableprofile/business/:profileId/import
 * Multipart: file, importType
 * Parses CSV/Excel and returns mapped rows for form pre-fill.
 */
const parseImport = (req, res) => {
  try {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ success: false, message: 'Upload a CSV or Excel file' });
    }

    const importType = String(req.body?.importType || req.query?.importType || '').trim();
    if (!IMPORT_TYPES.includes(importType)) {
      return res.status(400).json({
        success: false,
        message: `importType is required and must be one of: ${IMPORT_TYPES.join(', ')}`
      });
    }

    const data = parseImportBuffer(req.file.buffer, importType, req.file.originalname);
    return res.status(200).json({
      success: true,
      message: `Parsed ${data.acceptedCount} of ${data.rowCount} row(s)`,
      data
    });
  } catch (error) {
    const status = error.status || 400;
    return res.status(status).json({
      success: false,
      message: error.message || 'Failed to parse file',
      errors: error.details || undefined
    });
  }
};

module.exports = {
  importMulter,
  downloadSample,
  parseImport
};
