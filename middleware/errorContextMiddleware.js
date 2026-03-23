const errorLoggerService = require('../services/errorLoggerService');
const mongoose = require('mongoose');

/**
 * Middleware to enrich error context for WhatsApp webhook requests
 * This middleware should be applied to WhatsApp webhook routes
 */
const errorContextMiddleware = (req, res, next) => {
  // Store original error handler
  const originalSend = res.send;
  const originalJson = res.json;
  
  // Generate request ID for tracking
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  req.requestId = requestId;
  
  // Add request context to res.locals for easy access
  res.locals.errorContext = {
    requestId,
    timestamp: new Date().toISOString(),
    method: req.method,
    path: req.path,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
    environment: process.env.NODE_ENV || 'development',
    appVersion: process.env.APP_VERSION || '1.0.0'
  };
  
  // Override res.send to capture response data
  res.send = function(body) {
    res.locals.responseBody = body;
    res.locals.responseSentAt = new Date().toISOString();
    return originalSend.call(this, body);
  };
  
  // Override res.json to capture response data
  res.json = function(body) {
    res.locals.responseBody = body;
    res.locals.responseSentAt = new Date().toISOString();
    return originalJson.call(this, body);
  };
  
  // Error handler for this request
  res.locals.logError = async (errorType, error, additionalContext = {}) => {
    try {
      // Extract WhatsApp-specific context from request
      const whatsappContext = extractWhatsAppContext(req);
      
      // Merge all context
      const fullContext = {
        ...res.locals.errorContext,
        ...whatsappContext,
        ...additionalContext,
        responseStatus: res.statusCode,
        responseTime: res.locals.responseSentAt ? 
          new Date(res.locals.responseSentAt) - new Date(res.locals.errorContext.timestamp) : null
      };
      
      // Determine user/session info from context
      const options = {
        userId: additionalContext.userId || whatsappContext.userId,
        waId: additionalContext.waId || whatsappContext.waId,
        sessionId: additionalContext.sessionId || whatsappContext.sessionId,
        sessionStep: additionalContext.sessionStep || whatsappContext.sessionStep,
        userMessage: additionalContext.userMessage || whatsappContext.userMessage
      };
      
      // Log the error
      return await errorLoggerService.logWhatsAppError(
        errorType,
        error,
        fullContext,
        options
      );
    } catch (loggingError) {
      // Fallback to console if logging fails
      console.error('[ErrorContextMiddleware] Failed to log error:', loggingError.message);
      console.error('Original error:', error);
      return null;
    }
  };
  
  next();
};

/**
 * Extract WhatsApp-specific context from request
 */
function extractWhatsAppContext(req) {
  const context = {
    loggedFrom: 'whatsapp_webhook',
    webhookType: 'whatsapp'
  };
  
  try {
    // Extract from request body (WhatsApp webhook format)
    const body = req.body;
    
    if (body && body.entry && body.entry[0] && body.entry[0].changes && body.entry[0].changes[0]) {
      const change = body.entry[0].changes[0];
      const value = change.value;
      
      context.webhookField = change.field;
      
      if (value && value.messages && value.messages[0]) {
        const message = value.messages[0];
        
        context.waId = message.from;
        context.messageId = message.id;
        context.messageType = message.type;
        context.timestamp = message.timestamp ? new Date(message.timestamp * 1000).toISOString() : null;
        
        // Extract message content based on type
        if (message.type === 'text') {
          context.userMessage = message.text?.body;
          context.messageLength = message.text?.body?.length || 0;
        } else if (message.type === 'image') {
          context.mediaType = 'image';
          context.mediaId = message.image?.id;
          context.caption = message.image?.caption;
        } else if (message.type === 'document') {
          context.mediaType = 'document';
          context.mediaId = message.document?.id;
          context.filename = message.document?.filename;
          context.caption = message.document?.caption;
        } else if (message.type === 'interactive') {
          context.interactiveType = message.interactive?.type;
          if (message.interactive?.type === 'button_reply') {
            context.buttonId = message.interactive.button_reply?.id;
            context.buttonTitle = message.interactive.button_reply?.title;
          }
        }
      }
      
      // Extract metadata
      if (value.metadata) {
        context.phoneNumberId = value.metadata.phone_number_id;
        context.displayPhoneNumber = value.metadata.display_phone_number;
      }
    }
    
    // Try to extract from query params or headers
    if (req.query.wa_id) {
      context.waId = req.query.wa_id;
    }
    
    if (req.headers['x-whatsapp-webhook-id']) {
      context.webhookId = req.headers['x-whatsapp-webhook-id'];
    }
    
  } catch (error) {
    context.extractionError = error.message;
  }
  
  return context;
}

/**
 * Middleware to extract session context for authenticated requests
 * This should be used after authentication middleware
 */
const sessionContextMiddleware = (req, res, next) => {
  // Add session context to res.locals
  res.locals.sessionContext = {};
  
  if (req.user) {
    res.locals.sessionContext.userId = req.user._id;
    res.locals.sessionContext.userEmail = req.user.email;
    res.locals.sessionContext.userPhone = req.user.phone;
  }
  
  if (req.session) {
    res.locals.sessionContext.sessionId = req.session.id;
  }
  
  // Merge session context into error context
  if (res.locals.errorContext) {
    res.locals.errorContext = {
      ...res.locals.errorContext,
      ...res.locals.sessionContext
    };
  }
  
  next();
};

/**
 * Helper function to create error context for manual logging
 */
function createErrorContext(baseContext = {}) {
  const requestId = `ctx_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  
  return {
    requestId,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    appVersion: process.env.APP_VERSION || '1.0.0',
    ...baseContext
  };
}

/**
 * Helper to extract user context from WhatsApp session
 */
async function extractUserContextFromSession(sessionId, waId) {
  try {
    const context = {
      waId,
      sessionId: sessionId && mongoose.Types.ObjectId.isValid(sessionId) ? sessionId : null
    };
    
    if (sessionId && mongoose.Types.ObjectId.isValid(sessionId)) {
      const WhatsAppSession = require('../models/WhatsAppSession');
      const session = await WhatsAppSession.findById(sessionId).lean();
      
      if (session) {
        context.sessionStep = session.step;
        context.sessionData = session.data || {};
        context.userId = session.user;
        context.createdAt = session.createdAt;
        context.updatedAt = session.updatedAt;
      }
    }
    
    if (waId) {
      const User = require('../models/User');
      // Try to find user by WhatsApp ID (converted to phone)
      const phone = waIdToPhone(waId);
      const user = await User.findOne({ phone }).lean();
      
      if (user) {
        context.userId = user._id;
        context.userEmail = user.email;
        context.userName = `${user.firstName || ''} ${user.lastName || ''}`.trim();
      }
    }
    
    return context;
  } catch (error) {
    console.error('[extractUserContextFromSession] Error:', error.message);
    return { waId, sessionId, extractionError: error.message };
  }
}

/**
 * Convert WhatsApp ID to phone number format
 * WhatsApp ID format: +234XXXXXXXXXX → Local format: 0XXXXXXXXXX
 */
function waIdToPhone(waId) {
  if (!waId) return null;
  
  // Remove + prefix if present
  let phone = waId.replace(/^\+/, '');
  
  // Convert international to local format for Nigeria
  if (phone.startsWith('234') && phone.length === 13) {
    phone = '0' + phone.substring(3);
  }
  
  return phone;
}

/**
 * Middleware to log unhandled errors
 */
const unhandledErrorMiddleware = (err, req, res, next) => {
  // Skip if headers already sent
  if (res.headersSent) {
    return next(err);
  }
  
  // Log the unhandled error
  if (res.locals.logError) {
    res.locals.logError('unknown', err, {
      isUnhandled: true,
      errorMiddleware: 'unhandledErrorMiddleware'
    }).catch(loggingError => {
      console.error('[unhandledErrorMiddleware] Failed to log error:', loggingError.message);
    });
  } else {
    // Fallback logging
    console.error('[Unhandled Error]', err);
    console.error('Request:', {
      method: req.method,
      path: req.path,
      query: req.query,
      body: req.body
    });
  }
  
  // Send error response
  res.status(err.status || 500).json({
    success: false,
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

module.exports = {
  errorContextMiddleware,
  sessionContextMiddleware,
  unhandledErrorMiddleware,
  createErrorContext,
  extractUserContextFromSession,
  waIdToPhone
};