const WhatsAppErrorLog = require('../models/WhatsAppErrorLog');
const mongoose = require('mongoose');

class ErrorLoggerService {
  constructor() {
    this.appVersion = process.env.APP_VERSION || '1.0.0';
    this.environment = process.env.NODE_ENV || 'development';
  }

  /**
   * Log a WhatsApp error with comprehensive context
   * @param {string} errorType - Type of error (whatsapp_api, payment, bank, etc.)
   * @param {Error|string} error - Error object or error message
   * @param {Object} context - Additional context information
   * @param {Object} options - Additional options (severity, errorCode, etc.)
   * @returns {Promise<Object>} - Created error log document
   */
  async logWhatsAppError(errorType, error, context = {}, options = {}) {
    try {
      const {
        severity = this._determineSeverity(errorType, error),
        errorCode = this._generateErrorCode(errorType, error),
        userId = null,
        waId = null,
        sessionId = null,
        sessionStep = null,
        userMessage = null,
        metadata = {}
      } = options;

      // Extract error details
      const errorMessage = error instanceof Error ? error.message : String(error);
      const stackTrace = error instanceof Error ? error.stack : null;

      // Prepare error log document
      const errorLogData = {
        errorType,
        errorCode,
        severity,
        message: errorMessage,
        stackTrace,
        context: {
          ...context,
          // Add common context fields
          timestamp: new Date().toISOString(),
          requestId: context.requestId || this._generateRequestId(),
          ...(context.additionalContext || {})
        },
        userId: userId && mongoose.Types.ObjectId.isValid(userId) ? userId : null,
        waId,
        sessionId: sessionId && mongoose.Types.ObjectId.isValid(sessionId) ? sessionId : null,
        sessionStep,
        userMessage,
        metadata: {
          ...metadata,
          loggedFrom: context.loggedFrom || 'errorLoggerService',
          appVersion: this.appVersion
        },
        environment: this.environment,
        appVersion: this.appVersion
      };

      // Create error log
      const errorLog = await WhatsAppErrorLog.create(errorLogData);

      // Log to console for immediate visibility (in development/staging)
      if (this.environment !== 'production' || severity === 'critical' || severity === 'high') {
        this._logToConsole(errorType, severity, errorMessage, errorLog._id);
      }

      // For critical errors, trigger additional alerts (could be extended for email/SMS)
      if (severity === 'critical') {
        await this._triggerCriticalAlert(errorLog);
      }

      return errorLog;
    } catch (loggingError) {
      // Fallback to console if database logging fails
      console.error('[ErrorLoggerService] Failed to log error:', loggingError.message);
      console.error('Original error:', error);
      console.error('Context:', context);
      
      return null;
    }
  }

  /**
   * Log a critical error (payment failures, bank integration down, etc.)
   */
  async logCriticalError(error, context = {}) {
    return this.logWhatsAppError(
      this._determineErrorTypeFromError(error),
      error,
      context,
      { severity: 'critical' }
    );
  }

  /**
   * Log a payment-related error
   */
  async logPaymentError(error, paymentContext = {}) {
    const context = {
      ...paymentContext,
      paymentType: paymentContext.paymentType || 'unknown',
      amount: paymentContext.amount,
      paymentId: paymentContext.paymentId,
      userId: paymentContext.userId
    };

    return this.logWhatsAppError(
      'payment',
      error,
      context,
      { 
        severity: 'high',
        errorCode: `PAYMENT_${paymentContext.paymentType?.toUpperCase() || 'UNKNOWN'}_FAILED`,
        userId: paymentContext.userId,
        metadata: { paymentDetails: paymentContext }
      }
    );
  }

  /**
   * Log a WhatsApp API error
   */
  async logWhatsAppApiError(error, apiContext = {}) {
    const context = {
      ...apiContext,
      apiEndpoint: apiContext.endpoint || 'unknown',
      messageId: apiContext.messageId,
      waId: apiContext.waId
    };

    return this.logWhatsAppError(
      'whatsapp_api',
      error,
      context,
      {
        severity: apiContext.isCritical ? 'high' : 'medium',
        errorCode: `WA_API_${apiContext.action?.toUpperCase() || 'UNKNOWN'}_FAILED`,
        waId: apiContext.waId,
        userId: apiContext.userId
      }
    );
  }

  /**
   * Log a bank integration error (Mono)
   */
  async logBankError(error, bankContext = {}) {
    const context = {
      ...bankContext,
      bankService: bankContext.service || 'mono',
      accountId: bankContext.accountId,
      action: bankContext.action || 'unknown'
    };

    return this.logWhatsAppError(
      'bank',
      error,
      context,
      {
        severity: 'high',
        errorCode: `BANK_${bankContext.service?.toUpperCase() || 'UNKNOWN'}_${bankContext.action?.toUpperCase() || 'FAILED'}`,
        userId: bankContext.userId,
        waId: bankContext.waId
      }
    );
  }

  /**
   * Log a validation error
   */
  async logValidationError(error, validationContext = {}) {
    const context = {
      ...validationContext,
      field: validationContext.field,
      value: validationContext.value,
      validationRule: validationContext.rule
    };

    return this.logWhatsAppError(
      'validation',
      error,
      context,
      {
        severity: 'low',
        errorCode: `VALIDATION_${validationContext.field?.toUpperCase() || 'UNKNOWN'}_FAILED`,
        userId: validationContext.userId,
        waId: validationContext.waId,
        userMessage: validationContext.userMessage
      }
    );
  }

  /**
   * Log a state machine/flow error
   */
  async logStateMachineError(error, stateContext = {}) {
    const context = {
      ...stateContext,
      currentStep: stateContext.currentStep,
      expectedStep: stateContext.expectedStep,
      userInput: stateContext.userInput
    };

    return this.logWhatsAppError(
      'state_machine',
      error,
      context,
      {
        severity: 'medium',
        errorCode: `STATE_${stateContext.currentStep?.toUpperCase() || 'UNKNOWN'}_INVALID`,
        userId: stateContext.userId,
        waId: stateContext.waId,
        sessionId: stateContext.sessionId,
        sessionStep: stateContext.currentStep,
        userMessage: stateContext.userMessage
      }
    );
  }

  /**
   * Get recent errors with filters
   */
  async getRecentErrors(filters = {}, options = {}) {
    const {
      limit = 50,
      skip = 0,
      sort = { createdAt: -1 },
      populate = ['userId', 'resolvedBy']
    } = options;

    const query = this._buildQuery(filters);

    let queryBuilder = WhatsAppErrorLog.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit);

    // Apply population
    if (populate.includes('userId')) {
      queryBuilder = queryBuilder.populate('userId', 'email firstName lastName phone');
    }
    if (populate.includes('resolvedBy')) {
      queryBuilder = queryBuilder.populate('resolvedBy', 'fullName email');
    }

    return queryBuilder.lean();
  }

  /**
   * Get error statistics
   */
  async getErrorStats(timeRangeHours = 24, filters = {}) {
    const cutoffDate = new Date(Date.now() - (timeRangeHours * 60 * 60 * 1000));
    
    const matchStage = {
      createdAt: { $gte: cutoffDate },
      ...this._buildQuery(filters)
    };

    return WhatsAppErrorLog.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            errorType: '$errorType',
            severity: '$severity',
            resolved: '$resolved'
          },
          count: { $sum: 1 },
          lastError: { $max: '$createdAt' }
        }
      },
      {
        $group: {
          _id: '$_id.errorType',
          severityBreakdown: {
            $push: {
              severity: '$_id.severity',
              resolved: '$_id.resolved',
              count: '$count',
              lastError: '$lastError'
            }
          },
          totalCount: { $sum: '$count' }
        }
      },
      { $sort: { totalCount: -1 } }
    ]);
  }

  /**
   * Mark error as resolved
   */
  async markErrorResolved(errorId, adminId, notes = '') {
    if (!mongoose.Types.ObjectId.isValid(errorId)) {
      throw new Error('Invalid error ID');
    }

    return WhatsAppErrorLog.markAsResolved(errorId, adminId, notes);
  }

  /**
   * Get error by ID with full details
   */
  async getErrorById(errorId) {
    if (!mongoose.Types.ObjectId.isValid(errorId)) {
      throw new Error('Invalid error ID');
    }

    return WhatsAppErrorLog.findById(errorId)
      .populate('userId', 'email firstName lastName phone')
      .populate('resolvedBy', 'fullName email')
      .populate('sessionId')
      .lean();
  }

  /**
   * Search errors with advanced criteria
   */
  async searchErrors(searchCriteria = {}, options = {}) {
    const {
      limit = 50,
      skip = 0,
      sort = { createdAt: -1 }
    } = options;

    const query = {};

    // Text search
    if (searchCriteria.searchText) {
      query.$or = [
        { message: { $regex: searchCriteria.searchText, $options: 'i' } },
        { errorCode: { $regex: searchCriteria.searchText, $options: 'i' } },
        { userMessage: { $regex: searchCriteria.searchText, $options: 'i' } }
      ];
    }

    // Date range
    if (searchCriteria.startDate || searchCriteria.endDate) {
      query.createdAt = {};
      if (searchCriteria.startDate) {
        query.createdAt.$gte = new Date(searchCriteria.startDate);
      }
      if (searchCriteria.endDate) {
        query.createdAt.$lte = new Date(searchCriteria.endDate);
      }
    }

    // Add other filters
    if (searchCriteria.errorType) {
      query.errorType = searchCriteria.errorType;
    }
    if (searchCriteria.severity) {
      query.severity = searchCriteria.severity;
    }
    if (searchCriteria.resolved !== undefined) {
      query.resolved = searchCriteria.resolved;
    }
    if (searchCriteria.userId) {
      query.userId = searchCriteria.userId;
    }
    if (searchCriteria.waId) {
      query.waId = searchCriteria.waId;
    }

    return WhatsAppErrorLog.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate('userId', 'email firstName lastName phone')
      .populate('resolvedBy', 'fullName email')
      .lean();
  }

  /**
   * Get unresolved error count
   */
  async getUnresolvedCount() {
    return WhatsAppErrorLog.countDocuments({ resolved: false });
  }

  /**
   * Clean up old errors (for cron job)
   */
  async cleanupOldErrors(retentionDays = 90) {
    const cutoffDate = new Date(Date.now() - (retentionDays * 24 * 60 * 60 * 1000));
    
    const result = await WhatsAppErrorLog.deleteMany({
      createdAt: { $lt: cutoffDate },
      resolved: true,
      severity: { $in: ['low', 'info'] }
    });

    return {
      deletedCount: result.deletedCount,
      cutoffDate: cutoffDate.toISOString()
    };
  }

  // Private helper methods

  _determineSeverity(errorType, error) {
    // Default severity based on error type
    const severityMap = {
      'payment': 'high',
      'bank': 'high',
      'whatsapp_api': 'medium',
      'database': 'medium',
      'state_machine': 'medium',
      'external_service': 'medium',
      'authentication': 'high',
      'session': 'medium',
      'validation': 'low',
      'unknown': 'medium'
    };

    return severityMap[errorType] || 'medium';
  }

  _generateErrorCode(errorType, error) {
    const prefix = errorType.toUpperCase().replace(/_/g, '');
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 6);
    
    return `${prefix}_${timestamp}_${random}`;
  }

  _generateRequestId() {
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  }

  _determineErrorTypeFromError(error) {
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      
      if (message.includes('payment') || message.includes('paystack')) return 'payment';
      if (message.includes('bank') || message.includes('mono')) return 'bank';
      if (message.includes('whatsapp') || message.includes('wa')) return 'whatsapp_api';
      if (message.includes('database') || message.includes('mongodb') || message.includes('mongoose')) return 'database';
      if (message.includes('validation') || message.includes('invalid')) return 'validation';
      if (message.includes('session') || message.includes('state')) return 'state_machine';
    }
    
    return 'unknown';
  }

  _buildQuery(filters) {
    const query = {};

    if (filters.errorType) {
      query.errorType = filters.errorType;
    }
    if (filters.severity) {
      query.severity = filters.severity;
    }
    if (filters.resolved !== undefined) {
      query.resolved = filters.resolved;
    }
    if (filters.userId) {
      query.userId = filters.userId;
    }
    if (filters.waId) {
      query.waId = filters.waId;
    }
    if (filters.environment) {
      query.environment = filters.environment;
    }
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      if (filters.startDate) {
        query.createdAt.$gte = new Date(filters.startDate);
      }
      if (filters.endDate) {
        query.createdAt.$lte = new Date(filters.endDate);
      }
    }

    return query;
  }

  _logToConsole(errorType, severity, message, errorId) {
    const colors = {
      critical: '\x1b[31m', // Red
      high: '\x1b[33m',     // Yellow
      medium: '\x1b[36m',   // Cyan
      low: '\x1b[32m',      // Green
      info: '\x1b[90m'      // Gray
    };

    const reset = '\x1b[0m';
    const color = colors[severity] || colors.medium;
    
    console.log(`${color}[WhatsApp Error]${reset} ${errorType.toUpperCase()} (${severity}) - ${message}`);
    console.log(`${color}Error ID:${reset} ${errorId}`);
  }

  async _triggerCriticalAlert(errorLog) {
    // This is a placeholder for critical alert system
    // Could be extended to send emails, SMS, Slack notifications, etc.
    
    console.error(`🚨 CRITICAL ERROR ALERT 🚨`);
    console.error(`Type: ${errorLog.errorType}`);
    console.error(`Code: ${errorLog.errorCode}`);
    console.error(`Message: ${errorLog.message}`);
    console.error(`Error ID: ${errorLog._id}`);
    console.error(`Timestamp: ${errorLog.createdAt}`);
    
    if (errorLog.userId) {
      console.error(`User ID: ${errorLog.userId}`);
    }
    if (errorLog.waId) {
      console.error(`WhatsApp ID: ${errorLog.waId}`);
    }
  }
}

// Create singleton instance
const errorLoggerService = new ErrorLoggerService();

module.exports = errorLoggerService;