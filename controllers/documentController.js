const Document = require('../models/Document');
const Transaction = require('../models/Transaction');
const fs = require('fs');
const path = require('path');
const TAX_CONSTANTS = require('../config/constants');
const documentProcessor = require('../services/documentProcessor');

// @desc    Upload a document
// @route   POST /api/documents/upload
// @access  Private
const uploadDocument = async (req, res) => {
  try {
    const { documentType } = req.body;
    const file = req.file;

    if (!file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded'
      });
    }

    // Create document record
    const document = await Document.create({
      user: req.user._id,
      documentType: documentType || TAX_CONSTANTS.DOCUMENT_TYPES.BANK_STATEMENT,
      fileName: file.originalname,
      filePath: file.path,
      fileSize: file.size,
      mimeType: file.mimetype,
      uploadDate: new Date(),
      processingStatus: TAX_CONSTANTS.PROCESSING_STATUS.PENDING
    });

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      data: {
        document: {
          id: document._id,
          fileName: document.fileName,
          documentType: document.documentType,
          fileSize: document.fileSize,
          processingStatus: document.processingStatus,
          uploadDate: document.uploadDate,
          createdAt: document.createdAt
        }
      }
    });
  } catch (error) {
    console.error('Upload document error:', error);
    
    // Clean up uploaded file if document creation failed
    if (req.file && req.file.path) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
      }
    }

    res.status(500).json({
      success: false,
      message: error.message || 'Error uploading document'
    });
  }
};

// @desc    Get all documents for current user
// @route   GET /api/documents
// @access  Private
const getDocuments = async (req, res) => {
  try {
    const { documentType, status, page = 1, limit = 10 } = req.query;
    
    // Build query
    const query = { user: req.user._id };
    if (documentType) {
      query.documentType = documentType;
    }
    if (status) {
      query.processingStatus = status;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const limitNum = parseInt(limit);

    // Get documents
    const documents = await Document.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limitNum)
      .select('-extractedData -metadata'); // Exclude large fields for list view

    // Get total count
    const total = await Document.countDocuments(query);

    res.json({
      success: true,
      data: {
        documents,
        pagination: {
          page: parseInt(page),
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum)
        }
      }
    });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching documents'
    });
  }
};

// @desc    Get single document by ID
// @route   GET /api/documents/:id
// @access  Private
const getDocument = async (req, res) => {
  try {
    const { id } = req.params;

    const document = await Document.findOne({
      _id: id,
      user: req.user._id
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    res.json({
      success: true,
      data: { document }
    });
  } catch (error) {
    console.error('Get document error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching document'
    });
  }
};

// @desc    Delete a document
// @route   DELETE /api/documents/:id
// @access  Private
const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;

    const document = await Document.findOne({
      _id: id,
      user: req.user._id
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Delete associated transactions
    await Transaction.deleteMany({ document: id });

    // Delete file from filesystem
    if (document.filePath && fs.existsSync(document.filePath)) {
      try {
        fs.unlinkSync(document.filePath);
      } catch (unlinkError) {
        console.error('Error deleting file:', unlinkError);
        // Continue with document deletion even if file deletion fails
      }
    }

    // Delete document record
    await Document.findByIdAndDelete(id);

    res.json({
      success: true,
      message: 'Document deleted successfully'
    });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error deleting document'
    });
  }
};

// @desc    Get document processing status
// @route   GET /api/documents/:id/status
// @access  Private
const getDocumentStatus = async (req, res) => {
  try {
    const { id } = req.params;

    const document = await Document.findOne({
      _id: id,
      user: req.user._id
    }).select('processingStatus errorMessage fileName documentType createdAt updatedAt extractedData');

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    res.json({
      success: true,
      data: {
        document: {
          id: document._id,
          fileName: document.fileName,
          documentType: document.documentType,
          processingStatus: document.processingStatus,
          errorMessage: document.errorMessage,
          transactionsExtracted: document.extractedData?.transactionCount || 0,
          createdAt: document.createdAt,
          updatedAt: document.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Get document status error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching document status'
    });
  }
};

// @desc    Process a document and extract transactions
// @route   POST /api/documents/:id/process
// @access  Private
const processDocument = async (req, res) => {
  try {
    const { id } = req.params;

    // Verify document belongs to user
    const document = await Document.findOne({
      _id: id,
      user: req.user._id
    });

    if (!document) {
      return res.status(404).json({
        success: false,
        message: 'Document not found'
      });
    }

    // Check if already processed
    if (document.processingStatus === TAX_CONSTANTS.PROCESSING_STATUS.COMPLETED) {
      return res.json({
        success: true,
        message: 'Document already processed',
        data: {
          transactionsExtracted: document.extractedData?.transactionCount || 0
        }
      });
    }

    // Check if currently processing
    if (document.processingStatus === TAX_CONSTANTS.PROCESSING_STATUS.PROCESSING) {
      return res.status(400).json({
        success: false,
        message: 'Document is currently being processed'
      });
    }

    // Process document (async - could be moved to queue in production)
    const result = await documentProcessor.processDocument(id);

    res.json({
      success: true,
      message: 'Document processed successfully',
      data: {
        transactionsExtracted: result.transactionsExtracted,
        documentId: document._id,
        processingStatus: TAX_CONSTANTS.PROCESSING_STATUS.COMPLETED
      }
    });
  } catch (error) {
    console.error('Process document error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error processing document'
    });
  }
};

module.exports = {
  uploadDocument,
  getDocuments,
  getDocument,
  deleteDocument,
  getDocumentStatus,
  processDocument
};

