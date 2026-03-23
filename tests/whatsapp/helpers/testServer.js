// Test-specific server that doesn't connect to real MongoDB
require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Paystack webhook must receive raw body for signature verification (mount before express.json)
const paystackWebhook = require('../../../controllers/paystackController').handleWebhook;
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

// Request logging middleware (disabled in tests)
app.use((req, res, next) => {
  // console.log(`${req.method} ${req.path} - ${new Date().toISOString()}`);
  next();
});

// Basic route
app.get('/', (req, res) => {
  res.json({
    message: 'Taxable Backend API (Test Mode)',
    version: '1.0.0',
    status: 'running',
    note: 'Test server with mocked dependencies'
  });
});

// Welcome endpoint for testing
app.get('/api/welcome', (req, res) => {
  res.json({
    success: true,
    message: 'Welcome to Taxable Backend API! 🎉',
    version: '1.0.0',
  });
});

// Import and use WhatsApp webhook routes
const whatsappRoutes = require('../../../routes/whatsappWebhookRoutes');
app.use('/api/whatsapp', whatsappRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Test server error:', err);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

module.exports = app;