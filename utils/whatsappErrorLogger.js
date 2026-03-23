const errorLoggerService = require('../services/errorLoggerService');
const { extractUserContextFromSession } = require('../middleware/errorContextMiddleware');

/**
 * Helper functions for logging WhatsApp-specific errors
 */

class WhatsAppErrorLogger {
  /**
   * Log a WhatsApp API error
   */
  static async logApiError(error, context = {}) {
    const enrichedContext = {
      ...context,
      loggedFrom: 'whatsapp_webhook',
      apiAction: context.action || 'unknown'
    };

    return errorLoggerService.logWhatsAppApiError(error, enrichedContext);
  }

  /**
   * Log a payment-related error in WhatsApp flow
   */
  static async logPaymentError(error, paymentContext = {}) {
    const enrichedContext = {
      ...paymentContext,
      loggedFrom: 'whatsapp_webhook',
      flow: 'whatsapp_payment'
    };

    return errorLoggerService.logPaymentError(error, enrichedContext);
  }

  /**
   * Log a bank integration error in WhatsApp flow
   */
  static async logBankError(error, bankContext = {}) {
    const enrichedContext = {
      ...bankContext,
      loggedFrom: 'whatsapp_webhook',
      flow: 'whatsapp_bank_integration'
    };

    return errorLoggerService.logBankError(error, enrichedContext);
  }

  /**
   * Log a database error in WhatsApp flow
   */
  static async logDatabaseError(error, dbContext = {}) {
    const enrichedContext = {
      ...dbContext,
      loggedFrom: 'whatsapp_webhook',
      operation: dbContext.operation || 'unknown'
    };

    return errorLoggerService.logWhatsAppError(
      'database',
      error,
      enrichedContext,
      {
        severity: 'medium',
        errorCode: `DB_${dbContext.operation?.toUpperCase() || 'UNKNOWN'}_FAILED`,
        userId: dbContext.userId,
        waId: dbContext.waId,
        sessionId: dbContext.sessionId
      }
    );
  }

  /**
   * Log a state machine/flow error
   */
  static async logStateError(error, stateContext = {}) {
    const enrichedContext = {
      ...stateContext,
      loggedFrom: 'whatsapp_webhook',
      flow: 'whatsapp_state_machine'
    };

    return errorLoggerService.logStateMachineError(error, enrichedContext);
  }

  /**
   * Log a validation error in WhatsApp flow
   */
  static async logValidationError(error, validationContext = {}) {
    const enrichedContext = {
      ...validationContext,
      loggedFrom: 'whatsapp_webhook',
      flow: 'whatsapp_validation'
    };

    return errorLoggerService.logValidationError(error, enrichedContext);
  }

  /**
   * Log an external service error (email, upload, etc.)
   */
  static async logExternalServiceError(error, serviceContext = {}) {
    const enrichedContext = {
      ...serviceContext,
      loggedFrom: 'whatsapp_webhook',
      service: serviceContext.service || 'unknown'
    };

    return errorLoggerService.logWhatsAppError(
      'external_service',
      error,
      enrichedContext,
      {
        severity: serviceContext.isCritical ? 'high' : 'medium',
        errorCode: `EXT_${serviceContext.service?.toUpperCase() || 'UNKNOWN'}_FAILED`,
        userId: serviceContext.userId,
        waId: serviceContext.waId
      }
    );
  }

  /**
   * Log a session-related error
   */
  static async logSessionError(error, sessionContext = {}) {
    const enrichedContext = {
      ...sessionContext,
      loggedFrom: 'whatsapp_webhook',
      flow: 'whatsapp_session'
    };

    return errorLoggerService.logWhatsAppError(
      'session',
      error,
      enrichedContext,
      {
        severity: 'medium',
        errorCode: `SESSION_${sessionContext.action?.toUpperCase() || 'UNKNOWN'}_FAILED`,
        userId: sessionContext.userId,
        waId: sessionContext.waId,
        sessionId: sessionContext.sessionId,
        sessionStep: sessionContext.sessionStep
      }
    );
  }

  /**
   * Log a media/download error
   */
  static async logMediaError(error, mediaContext = {}) {
    const enrichedContext = {
      ...mediaContext,
      loggedFrom: 'whatsapp_webhook',
      mediaType: mediaContext.mediaType || 'unknown'
    };

    return errorLoggerService.logWhatsAppError(
      'whatsapp_api',
      error,
      enrichedContext,
      {
        severity: 'medium',
        errorCode: `MEDIA_${mediaContext.mediaType?.toUpperCase() || 'UNKNOWN'}_FAILED`,
        userId: mediaContext.userId,
        waId: mediaContext.waId,
        sessionId: mediaContext.sessionId
      }
    );
  }

  /**
   * Log a generic WhatsApp error with automatic context extraction
   */
  static async logGenericError(error, baseContext = {}) {
    // Try to extract additional context from error message
    const errorType = this._determineErrorTypeFromMessage(error.message);
    
    const enrichedContext = {
      ...baseContext,
      loggedFrom: 'whatsapp_webhook',
      autoDetectedType: errorType
    };

    return errorLoggerService.logWhatsAppError(
      errorType,
      error,
      enrichedContext,
      {
        severity: this._determineSeverityFromError(error),
        userId: baseContext.userId,
        waId: baseContext.waId,
        sessionId: baseContext.sessionId,
        sessionStep: baseContext.sessionStep,
        userMessage: baseContext.userMessage
      }
    );
  }

  /**
   * Helper to log error with session context
   */
  static async logErrorWithSession(error, session, additionalContext = {}) {
    const context = {
      ...additionalContext,
      sessionId: session?._id,
      sessionStep: session?.step,
      userId: session?.user,
      waId: session?.waId,
      sessionData: session?.data || {}
    };

    return this.logGenericError(error, context);
  }

  /**
   * Helper to log error with user context
   */
  static async logErrorWithUser(error, user, additionalContext = {}) {
    const context = {
      ...additionalContext,
      userId: user?._id,
      userEmail: user?.email,
      userPhone: user?.phone,
      userName: `${user?.firstName || ''} ${user?.lastName || ''}`.trim()
    };

    return this.logGenericError(error, context);
  }

  /**
   * Create a safe error logging wrapper for async functions
   */
  static withErrorLogging(fn, errorContext = {}) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (error) {
        // Log the error
        await this.logGenericError(error, {
          ...errorContext,
          functionName: fn.name || 'anonymous',
          args: args.slice(0, 2) // Log first 2 args for context
        });
        
        // Re-throw the error
        throw error;
      }
    };
  }

  /**
   * Determine error type from error message
   */
  static _determineErrorTypeFromMessage(message) {
    if (!message) return 'unknown';
    
    const msg = message.toLowerCase();
    
    if (msg.includes('payment') || msg.includes('paystack')) return 'payment';
    if (msg.includes('bank') || msg.includes('mono')) return 'bank';
    if (msg.includes('whatsapp') || msg.includes('wa api')) return 'whatsapp_api';
    if (msg.includes('database') || msg.includes('mongodb') || msg.includes('mongoose')) return 'database';
    if (msg.includes('validation') || msg.includes('invalid')) return 'validation';
    if (msg.includes('session') || msg.includes('state')) return 'state_machine';
    if (msg.includes('email') || msg.includes('smtp')) return 'external_service';
    if (msg.includes('upload') || msg.includes('file')) return 'external_service';
    if (msg.includes('media') || msg.includes('download')) return 'whatsapp_api';
    
    return 'unknown';
  }

  /**
   * Determine severity from error
   */
  static _determineSeverityFromError(error) {
    const message = error.message?.toLowerCase() || '';
    
    // Critical errors
    if (message.includes('payment failed') || 
        message.includes('bank connection failed') ||
        message.includes('critical') ||
        message.includes('fatal')) {
      return 'critical';
    }
    
    // High severity errors
    if (message.includes('payment') || 
        message.includes('bank') ||
        message.includes('authentication failed') ||
        message.includes('security')) {
      return 'high';
    }
    
    // Medium severity (default)
    return 'medium';
  }

  /**
   * Extract common context from WhatsApp webhook request
   */
  static extractContextFromWebhook(req, from, text, type) {
    const context = {
      waId: from,
      messageType: type,
      userMessage: text,
      webhookTimestamp: new Date().toISOString(),
      requestId: req.requestId || `webhook_${Date.now()}`
    };

    // Extract from request body if available
    if (req.body && req.body.entry && req.body.entry[0]) {
      const entry = req.body.entry[0];
      context.webhookId = entry.id;
      
      if (entry.changes && entry.changes[0]) {
        const change = entry.changes[0];
        context.webhookField = change.field;
        
        if (change.value && change.value.metadata) {
          context.phoneNumberId = change.value.metadata.phone_number_id;
          context.displayPhoneNumber = change.value.metadata.display_phone_number;
        }
      }
    }

    return context;
  }
}

module.exports = WhatsAppErrorLogger;