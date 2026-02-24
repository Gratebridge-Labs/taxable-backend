require('dotenv').config();
const express = require('express');
const cors = require('cors');
const connectDB = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

// Connect to MongoDB
connectDB();

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
