require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

// Paystack webhook must receive raw body for signature verification (mount before express.json)
const paystackWebhook = require('./controllers/paystackController').handleWebhook;
app.use('/api/paystack/webhook', express.raw({ type: 'application/json' }), (req, res, next) => {
  try {
    req.rawBody = req.body;
    req.body = req.body && Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : {};
  } catch (e) {
    req.body = {};
  }
  next();
}, paystackWebhook);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Basic route
app.get('/', (req, res) => {
  res.json({
    message: 'Taxable Backend API',
    version: '1.0.0',
    status: 'running',
    note: 'Ready for implementation'
  });
});

// Welcome endpoint for testing
app.get('/api/welcome', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to Taxable Backend API! 🎉',
    version: '1.0.0',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

// Email health check: verify SMTP and send a test email to the address you provide
const { sendTestEmail } = require('./utils/emailService');
app.post('/api/health/email-test', async (req, res) => {
  try {
    const to = req.body?.to || req.query?.to;
    const result = await sendTestEmail(to);
    res.json({
      success: true,
      message: 'Test email sent. Check your inbox (and spam/junk) at: ' + result.to,
      messageId: result.messageId,
      to: result.to,
      tip: 'If you don\'t see it, check spam/junk and that your domain has SPF/DKIM set for ' + (process.env.EMAIL_HOST || 'your SMTP host')
    });
  } catch (err) {
    console.error('[Health] email-test failed:', err.message, err.code, err.response);
    res.status(err.message && err.message.includes('Missing "to"') ? 400 : 500).json({
      success: false,
      message: err.message || 'Email test failed',
      code: err.code || undefined,
      smtpResponse: err.response ? String(err.response).slice(0, 200) : undefined
    });
  }
});

// API Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/admin', require('./routes/adminRoutes')); // Admin routes
app.use('/api/taxableprofile', require('./routes/profileRoutes'));
app.use('/api/calculations', require('./routes/calculationRoutes')); // Tax calculation routes
app.use('/api/questions', require('./routes/questionRoutes')); // Question flow routes
app.use('/api/profile-reviews', require('./routes/profileReviewRoutes')); // Profile review routes
app.use('/api/notifications', require('./routes/notificationRoutes')); // Notification routes
app.use('/api/blogs', require('./routes/blogRoutes')); // Blog routes
app.use('/api/whatsapp', require('./routes/whatsappWebhookRoutes')); // WhatsApp webhook
app.use('/api/mono', require('./routes/monoRoutes')); // Mono open banking (connect bank, income)
app.use('/api/deductions', require('./routes/deductionRoutes')); // Reliefs/deductions (create, list, update, delete)
app.use('/api/documents', require('./routes/documentRoutes')); // Document upload/link (create, list, delete)
app.use('/api/tax', require('./routes/taxEstimateRoutes')); // Tax estimate (sample + by income)
app.use('/api/paystack', require('./routes/paystackRoutes')); // Paystack subscriptions & charges (webhook mounted above)
app.use('/api/cron', require('./routes/cronRoutes')); // Cron: subscription expiry reminders (use CRON_SECRET)

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Taxable Backend Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;
