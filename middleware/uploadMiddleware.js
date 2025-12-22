const multer = require('multer');
const path = require('path');
const fs = require('fs');
const TAX_CONSTANTS = require('../config/constants');

// Ensure uploads directory exists
const uploadsDir = process.env.UPLOAD_PATH || './uploads';
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Create user-specific directory
    const userDir = path.join(uploadsDir, req.user._id.toString());
    if (!fs.existsSync(userDir)) {
      fs.mkdirSync(userDir, { recursive: true });
    }
    cb(null, userDir);
  },
  filename: (req, file, cb) => {
    // Generate unique filename: timestamp-originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

// File filter - only allow specific file types
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = [
    'application/pdf', // PDF
    'text/csv', // CSV
    'application/vnd.ms-excel', // Excel .xls
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' // Excel .xlsx
  ];

  const allowedExtensions = ['.pdf', '.csv', '.xls', '.xlsx'];

  const ext = path.extname(file.originalname).toLowerCase();
  const isValidMimeType = allowedMimeTypes.includes(file.mimetype);
  const isValidExtension = allowedExtensions.includes(ext);

  if (isValidMimeType && isValidExtension) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: PDF, CSV, Excel (.xls, .xlsx)`), false);
  }
};

// Configure multer
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, // 10MB default
    files: 1 // Only one file at a time
  }
});

// Middleware to handle single file upload
const uploadSingle = upload.single('document');

// Wrapper to handle errors
const handleUpload = (req, res, next) => {
  uploadSingle(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(400).json({
            success: false,
            message: `File size exceeds limit. Maximum size: ${(parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024) / (1024 * 1024)}MB`
          });
        }
        if (err.code === 'LIMIT_FILE_COUNT') {
          return res.status(400).json({
            success: false,
            message: 'Too many files. Only one file allowed per upload.'
          });
        }
      }
      return res.status(400).json({
        success: false,
        message: err.message || 'File upload error'
      });
    }
    
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file provided. Please upload a file with the field name "document".'
      });
    }
    
    next();
  });
};

module.exports = {
  handleUpload,
  upload
};

