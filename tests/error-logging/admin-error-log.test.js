const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../../server');
const WhatsAppErrorLog = require('../../models/WhatsAppErrorLog');
const Admin = require('../../models/Admin');
const User = require('../../models/User');

describe('Admin Error Log Monitoring System', () => {
  let adminToken;
  let testAdmin;
  let testUser;
  let testErrorIds = [];

  beforeAll(async () => {
    // Connect to test database
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/taxable_test', {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    // Create test admin
    testAdmin = await Admin.create({
      fullName: 'Test Admin',
      email: 'admin@test.com',
      password: 'TestPass123',
      adminCode: '123456',
      role: 'Root Admin'
    });

    // Create test user
    testUser = await User.create({
      email: 'user@test.com',
      password: 'TestPass123',
      firstName: 'Test',
      lastName: 'User',
      phone: '08012345678'
    });

    // Login as admin to get token
    const loginRes = await request(app)
      .post('/api/admin/login')
      .send({
        email: 'admin@test.com',
        password: 'TestPass123'
      });

    adminToken = loginRes.body.data.token;

    // Create test error logs
    const testErrors = [
      {
        errorType: 'payment',
        errorCode: 'PAYMENT_PAYSTACK_FAILED',
        severity: 'high',
        message: 'Payment processing failed',
        userId: testUser._id,
        waId: '+2348012345678',
        resolved: false,
        context: { paymentId: 'test_123', amount: 30000 }
      },
      {
        errorType: 'bank',
        errorCode: 'BANK_MONO_CONNECTION_FAILED',
        severity: 'critical',
        message: 'Bank connection failed',
        userId: testUser._id,
        waId: '+2348012345678',
        resolved: false,
        context: { bank: 'mono', action: 'connect' }
      },
      {
        errorType: 'whatsapp_api',
        errorCode: 'WA_API_SEND_FAILED',
        severity: 'medium',
        message: 'Failed to send WhatsApp message',
        waId: '+2348098765432',
        resolved: true,
        resolvedAt: new Date(),
        resolvedBy: testAdmin._id,
        context: { messageId: 'msg_123', endpoint: 'messages' }
      },
      {
        errorType: 'validation',
        errorCode: 'VALIDATION_PHONE_FAILED',
        severity: 'low',
        message: 'Invalid phone number format',
        waId: '+2348011111111',
        resolved: false,
        context: { field: 'phone', value: 'invalid' }
      }
    ];

    const createdErrors = await WhatsAppErrorLog.insertMany(testErrors);
    testErrorIds = createdErrors.map(err => err._id);
  });

  afterAll(async () => {
    // Clean up test data
    await WhatsAppErrorLog.deleteMany({});
    await Admin.deleteMany({});
    await User.deleteMany({});
    await mongoose.connection.close();
  });

  describe('GET /api/admin/whatsapp-errors', () => {
    it('should return list of errors with pagination', async () => {
      const res = await request(app)
        .get('/api/admin/whatsapp-errors')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ page: 1, limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.errors).toBeInstanceOf(Array);
      expect(res.body.data.pagination).toHaveProperty('totalCount');
      expect(res.body.data.pagination.totalCount).toBeGreaterThanOrEqual(4);
    });

    it('should filter errors by type', async () => {
      const res = await request(app)
        .get('/api/admin/whatsapp-errors')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ errorType: 'payment' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.errors.every(err => err.errorType === 'payment')).toBe(true);
    });

    it('should filter errors by severity', async () => {
      const res = await request(app)
        .get('/api/admin/whatsapp-errors')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ severity: 'critical' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.errors.every(err => err.severity === 'critical')).toBe(true);
    });

    it('should filter errors by resolved status', async () => {
      const res = await request(app)
        .get('/api/admin/whatsapp-errors')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ resolved: 'false' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.errors.every(err => err.resolved === false)).toBe(true);
    });

    it('should require admin authentication', async () => {
      const res = await request(app)
        .get('/api/admin/whatsapp-errors');

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/admin/whatsapp-errors/:errorId', () => {
    it('should return error details by ID', async () => {
      const errorId = testErrorIds[0];
      const res = await request(app)
        .get(`/api/admin/whatsapp-errors/${errorId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.error).toHaveProperty('_id', errorId.toString());
      expect(res.body.data.error).toHaveProperty('errorType', 'payment');
    });

    it('should return 404 for non-existent error', async () => {
      const fakeId = new mongoose.Types.ObjectId();
      const res = await request(app)
        .get(`/api/admin/whatsapp-errors/${fakeId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });

    it('should return 400 for invalid error ID', async () => {
      const res = await request(app)
        .get('/api/admin/whatsapp-errors/invalid-id')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('PATCH /api/admin/whatsapp-errors/:errorId/resolve', () => {
    it('should mark error as resolved', async () => {
      const errorId = testErrorIds[1]; // Get the bank error (unresolved)
      const res = await request(app)
        .patch(`/api/admin/whatsapp-errors/${errorId}/resolve`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ notes: 'Fixed bank connection issue' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.error.resolved).toBe(true);
      expect(res.body.data.error.resolutionNotes).toBe('Fixed bank connection issue');
      expect(res.body.data.error.resolvedBy).toBe(testAdmin._id.toString());
    });

    it('should require admin authentication', async () => {
      const errorId = testErrorIds[0];
      const res = await request(app)
        .patch(`/api/admin/whatsapp-errors/${errorId}/resolve`)
        .send({ notes: 'Test' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/admin/whatsapp-error-stats', () => {
    it('should return error statistics', async () => {
      const res = await request(app)
        .get('/api/admin/whatsapp-error-stats')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary).toHaveProperty('totalErrors');
      expect(res.body.data.summary).toHaveProperty('unresolvedCount');
      expect(res.body.data.severityBreakdown).toHaveProperty('critical');
      expect(res.body.data.severityBreakdown).toHaveProperty('high');
      expect(res.body.data.severityBreakdown).toHaveProperty('medium');
      expect(res.body.data.severityBreakdown).toHaveProperty('low');
      expect(res.body.data.topErrorTypes).toBeInstanceOf(Array);
    });

    it('should accept time range parameter', async () => {
      const res = await request(app)
        .get('/api/admin/whatsapp-error-stats')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ timeRange: '48' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.summary.timeRangeHours).toBe(48);
    });
  });

  describe('GET /api/admin/whatsapp-error-trends', () => {
    it('should return error trends', async () => {
      const res = await request(app)
        .get('/api/admin/whatsapp-error-trends')
        .set('Authorization', `Bearer ${adminToken}`)
        .query({ period: 'day', points: 7 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.trends).toBeInstanceOf(Array);
      expect(res.body.data).toHaveProperty('period', 'day');
      expect(res.body.data).toHaveProperty('points');
    });
  });

  describe('POST /api/admin/whatsapp-errors/search', () => {
    it('should search errors with advanced criteria', async () => {
      const res = await request(app)
        .post('/api/admin/whatsapp-errors/search')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          searchText: 'payment',
          errorType: 'payment',
          severity: 'high',
          page: 1,
          limit: 10
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.errors).toBeInstanceOf(Array);
      expect(res.body.data.pagination).toHaveProperty('totalCount');
      expect(res.body.data.searchCriteria).toHaveProperty('searchText', 'payment');
    });

    it('should validate search criteria', async () => {
      const res = await request(app)
        .post('/api/admin/whatsapp-errors/search')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          errorType: 'invalid_type', // Invalid error type
          page: 0 // Invalid page
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /api/admin/whatsapp-errors/unresolved-count', () => {
    it('should return unresolved error count', async () => {
      const res = await request(app)
        .get('/api/admin/whatsapp-errors/unresolved-count')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('unresolvedCount');
      expect(typeof res.body.data.unresolvedCount).toBe('number');
    });
  });

  describe('POST /api/admin/whatsapp-errors/cleanup', () => {
    it('should perform dry run cleanup', async () => {
      const res = await request(app)
        .post('/api/admin/whatsapp-errors/cleanup')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          retentionDays: 7,
          dryRun: true
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.dryRun).toBe(true);
      expect(res.body.data).toHaveProperty('wouldDeleteCount');
    });

    it('should require admin authentication', async () => {
      const res = await request(app)
        .post('/api/admin/whatsapp-errors/cleanup')
        .send({
          retentionDays: 7,
          dryRun: true
        });

      expect(res.status).toBe(401);
    });
  });

  describe('Error Logger Service Integration', () => {
    it('should log errors through the service', async () => {
      const errorLoggerService = require('../../services/errorLoggerService');
      
      const testError = new Error('Test error logging');
      const loggedError = await errorLoggerService.logWhatsAppError(
        'test',
        testError,
        { test: true },
        { severity: 'medium', errorCode: 'TEST_ERROR' }
      );

      expect(loggedError).toBeDefined();
      expect(loggedError.errorType).toBe('test');
      expect(loggedError.severity).toBe('medium');
      expect(loggedError.errorCode).toBe('TEST_ERROR');

      // Clean up test error
      await WhatsAppErrorLog.findByIdAndDelete(loggedError._id);
    });

    it('should log payment errors correctly', async () => {
      const errorLoggerService = require('../../services/errorLoggerService');
      
      const paymentError = new Error('Payment failed: insufficient funds');
      const loggedError = await errorLoggerService.logPaymentError(paymentError, {
        paymentType: 'subscription',
        amount: 4000,
        paymentId: 'pay_123',
        userId: testUser._id
      });

      expect(loggedError).toBeDefined();
      expect(loggedError.errorType).toBe('payment');
      expect(loggedError.severity).toBe('high');

      // Clean up test error
      await WhatsAppErrorLog.findByIdAndDelete(loggedError._id);
    });
  });
});