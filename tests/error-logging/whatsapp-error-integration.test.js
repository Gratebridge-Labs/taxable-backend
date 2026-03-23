const mongoose = require('mongoose');
const WhatsAppErrorLogger = require('../../utils/whatsappErrorLogger');
const WhatsAppErrorLog = require('../../models/WhatsAppErrorLog');

describe('WhatsApp Error Logger Integration', () => {
  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/taxable_test', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
  });

  afterAll(async () => {
    // Clean up test data
    await WhatsAppErrorLog.deleteMany({});
    await mongoose.connection.close();
  });

  describe('WhatsAppErrorLogger Class', () => {
    it('should log WhatsApp API errors', async () => {
      const error = new Error('Failed to send WhatsApp message');
      const context = {
        waId: '+2348012345678',
        messageId: 'msg_123',
        action: 'send_message'
      };

      const loggedError = await WhatsAppErrorLogger.logApiError(error, context);

      expect(loggedError).toBeDefined();
      expect(loggedError.errorType).toBe('whatsapp_api');
      expect(loggedError.severity).toBe('medium');
      expect(loggedError.context.waId).toBe('+2348012345678');
      expect(loggedError.context.apiAction).toBe('send_message');
    });

    it('should log payment errors with context', async () => {
      const error = new Error('Paystack payment failed: Invalid card');
      const context = {
        paymentType: 'subscription',
        amount: 4000,
        userId: new mongoose.Types.ObjectId(),
        waId: '+2348012345678'
      };

      const loggedError = await WhatsAppErrorLogger.logPaymentError(error, context);

      expect(loggedError).toBeDefined();
      expect(loggedError.errorType).toBe('payment');
      expect(loggedError.severity).toBe('high');
      expect(loggedError.context.paymentType).toBe('subscription');
      expect(loggedError.context.amount).toBe(4000);
    });

    it('should log bank integration errors', async () => {
      const error = new Error('Mono bank connection failed');
      const context = {
        service: 'mono',
        accountId: 'acc_123',
        action: 'connect',
        userId: new mongoose.Types.ObjectId()
      };

      const loggedError = await WhatsAppErrorLogger.logBankError(error, context);

      expect(loggedError).toBeDefined();
      expect(loggedError.errorType).toBe('bank');
      expect(loggedError.severity).toBe('high');
      expect(loggedError.context.service).toBe('mono');
      expect(loggedError.context.action).toBe('connect');
    });

    it('should log database errors', async () => {
      const error = new Error('MongoDB connection failed');
      const context = {
        operation: 'find_user',
        userId: new mongoose.Types.ObjectId(),
        waId: '+2348012345678'
      };

      const loggedError = await WhatsAppErrorLogger.logDatabaseError(error, context);

      expect(loggedError).toBeDefined();
      expect(loggedError.errorType).toBe('database');
      expect(loggedError.severity).toBe('medium');
      expect(loggedError.context.operation).toBe('find_user');
    });

    it('should log state machine errors', async () => {
      const error = new Error('Invalid state transition');
      const context = {
        currentStep: 'registration',
        expectedStep: 'login',
        userInput: 'invalid',
        sessionId: new mongoose.Types.ObjectId(),
        waId: '+2348012345678'
      };

      const loggedError = await WhatsAppErrorLogger.logStateError(error, context);

      expect(loggedError).toBeDefined();
      expect(loggedError.errorType).toBe('state_machine');
      expect(loggedError.severity).toBe('medium');
      expect(loggedError.context.currentStep).toBe('registration');
      expect(loggedError.context.expectedStep).toBe('login');
    });

    it('should log validation errors', async () => {
      const error = new Error('Invalid phone number format');
      const context = {
        field: 'phone',
        value: 'invalid',
        rule: 'nigerian_format',
        userMessage: '123',
        waId: '+2348012345678'
      };

      const loggedError = await WhatsAppErrorLogger.logValidationError(error, context);

      expect(loggedError).toBeDefined();
      expect(loggedError.errorType).toBe('validation');
      expect(loggedError.severity).toBe('low');
      expect(loggedError.context.field).toBe('phone');
      expect(loggedError.context.value).toBe('invalid');
    });

    it('should log external service errors', async () => {
      const error = new Error('Email service failed: SMTP error');
      const context = {
        service: 'email',
        action: 'send_otp',
        userId: new mongoose.Types.ObjectId(),
        isCritical: false
      };

      const loggedError = await WhatsAppErrorLogger.logExternalServiceError(error, context);

      expect(loggedError).toBeDefined();
      expect(loggedError.errorType).toBe('external_service');
      expect(loggedError.severity).toBe('medium');
      expect(loggedError.context.service).toBe('email');
      expect(loggedError.context.action).toBe('send_otp');
    });

    it('should log session errors', async () => {
      const error = new Error('Session not found');
      const context = {
        action: 'retrieve',
        sessionId: new mongoose.Types.ObjectId(),
        waId: '+2348012345678',
        sessionStep: 'registration'
      };

      const loggedError = await WhatsAppErrorLogger.logSessionError(error, context);

      expect(loggedError).toBeDefined();
      expect(loggedError.errorType).toBe('session');
      expect(loggedError.severity).toBe('medium');
      expect(loggedError.context.action).toBe('retrieve');
      expect(loggedError.context.sessionStep).toBe('registration');
    });

    it('should log media errors', async () => {
      const error = new Error('Failed to download media');
      const context = {
        mediaType: 'image',
        mediaId: 'media_123',
        userId: new mongoose.Types.ObjectId(),
        waId: '+2348012345678'
      };

      const loggedError = await WhatsAppErrorLogger.logMediaError(error, context);

      expect(loggedError).toBeDefined();
      expect(loggedError.errorType).toBe('whatsapp_api');
      expect(loggedError.severity).toBe('medium');
      expect(loggedError.context.mediaType).toBe('image');
      expect(loggedError.context.mediaId).toBe('media_123');
    });

    it('should log generic errors with automatic type detection', async () => {
      const paymentError = new Error('Payment processing failed with Paystack');
      const context = {
        userId: new mongoose.Types.ObjectId(),
        waId: '+2348012345678',
        paymentId: 'pay_123'
      };

      const loggedError = await WhatsAppErrorLogger.logGenericError(paymentError, context);

      expect(loggedError).toBeDefined();
      expect(loggedError.errorType).toBe('payment');
      expect(loggedError.severity).toBe('high');
    });

    it('should log errors with session context', async () => {
      const error = new Error('Session processing failed');
      const mockSession = {
        _id: new mongoose.Types.ObjectId(),
        step: 'tax_profile_creation',
        user: new mongoose.Types.ObjectId(),
        waId: '+2348012345678',
        data: { test: true }
      };

      const loggedError = await WhatsAppErrorLogger.logErrorWithSession(error, mockSession, {
        additional: 'context'
      });

      expect(loggedError).toBeDefined();
      expect(loggedError.sessionId.toString()).toBe(mockSession._id.toString());
      expect(loggedError.sessionStep).toBe('tax_profile_creation');
      expect(loggedError.userId.toString()).toBe(mockSession.user.toString());
    });

    it('should log errors with user context', async () => {
      const error = new Error('User processing failed');
      const mockUser = {
        _id: new mongoose.Types.ObjectId(),
        email: 'test@user.com',
        phone: '08012345678',
        firstName: 'Test',
        lastName: 'User'
      };

      const loggedError = await WhatsAppErrorLogger.logErrorWithUser(error, mockUser, {
        additional: 'context'
      });

      expect(loggedError).toBeDefined();
      expect(loggedError.userId.toString()).toBe(mockUser._id.toString());
    });

    it('should create safe error logging wrapper', async () => {
      const errorLoggerService = require('../../services/errorLoggerService');
      const mockError = new Error('Test error');
      
      // Spy on the logGenericError method
      const logSpy = jest.spyOn(errorLoggerService, 'logWhatsAppError').mockResolvedValue({
        _id: new mongoose.Types.ObjectId(),
        errorType: 'test',
        severity: 'medium'
      });

      const failingFunction = () => {
        throw mockError;
      };

      const wrappedFunction = WhatsAppErrorLogger.withErrorLogging(failingFunction, {
        test: 'context'
      });

      await expect(wrappedFunction()).rejects.toThrow('Test error');
      expect(logSpy).toHaveBeenCalledWith(
        'unknown', // Default error type
        mockError,
        expect.objectContaining({ test: 'context' }),
        expect.any(Object)
      );

      logSpy.mockRestore();
    });

    it('should extract context from webhook request', () => {
      const mockReq = {
        requestId: 'req_123',
        body: {
          entry: [{
            id: 'webhook_123',
            changes: [{
              field: 'messages',
              value: {
                metadata: {
                  phone_number_id: 'phone_123',
                  display_phone_number: '+2348012345678'
                },
                messages: [{
                  from: '+2348012345678',
                  id: 'msg_123',
                  type: 'text',
                  text: { body: 'Hello' }
                }]
              }
            }]
          }]
        }
      };

      const context = WhatsAppErrorLogger.extractContextFromWebhook(
        mockReq,
        '+2348012345678',
        'Hello',
        'text'
      );

      expect(context.waId).toBe('+2348012345678');
      expect(context.userMessage).toBe('Hello');
      expect(context.messageType).toBe('text');
      expect(context.webhookId).toBe('webhook_123');
      expect(context.phoneNumberId).toBe('phone_123');
      expect(context.displayPhoneNumber).toBe('+2348012345678');
    });

    it('should determine error type from message', () => {
      expect(WhatsAppErrorLogger._determineErrorTypeFromMessage('Payment failed')).toBe('payment');
      expect(WhatsAppErrorLogger._determineErrorTypeFromMessage('Bank connection error')).toBe('bank');
      expect(WhatsAppErrorLogger._determineErrorTypeFromMessage('WhatsApp API error')).toBe('whatsapp_api');
      expect(WhatsAppErrorLogger._determineErrorTypeFromMessage('Database connection failed')).toBe('database');
      expect(WhatsAppErrorLogger._determineErrorTypeFromMessage('Invalid input')).toBe('validation');
      expect(WhatsAppErrorLogger._determineErrorTypeFromMessage('Session state invalid')).toBe('state_machine');
      expect(WhatsAppErrorLogger._determineErrorTypeFromMessage('Email sending failed')).toBe('external_service');
      expect(WhatsAppErrorLogger._determineErrorTypeFromMessage('Media download failed')).toBe('whatsapp_api');
      expect(WhatsAppErrorLogger._determineErrorTypeFromMessage('Unknown error')).toBe('unknown');
    });

    it('should determine severity from error', () => {
      expect(WhatsAppErrorLogger._determineSeverityFromError(new Error('Payment failed'))).toBe('high');
      expect(WhatsAppErrorLogger._determineSeverityFromError(new Error('Bank connection failed'))).toBe('high');
      expect(WhatsAppErrorLogger._determineSeverityFromError(new Error('Critical system failure'))).toBe('critical');
      expect(WhatsAppErrorLogger._determineSeverityFromError(new Error('Authentication failed'))).toBe('high');
      expect(WhatsAppErrorLogger._determineSeverityFromError(new Error('Validation error'))).toBe('medium');
      expect(WhatsAppErrorLogger._determineSeverityFromError(new Error('Regular error'))).toBe('medium');
    });
  });

  describe('Error Context Enrichment', () => {
    it('should handle errors when database logging fails', async () => {
      // Mock the error logger service to throw an error
      const originalLog = WhatsAppErrorLogger.logGenericError;
      WhatsAppErrorLogger.logGenericError = jest.fn().mockRejectedValue(new Error('Database down'));

      // This should not throw, but log to console
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const error = new Error('Test error');
      const result = await WhatsAppErrorLogger.logGenericError(error, { test: true });

      expect(result).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();

      // Restore
      WhatsAppErrorLogger.logGenericError = originalLog;
      consoleSpy.mockRestore();
    });
  });
});