#!/usr/bin/env node

/**
 * Simple WhatsApp Test - Direct test of WhatsApp controller
 * 
 * Usage:
 *   node scripts/simple-whatsapp-test.js [phoneNumber]
 */

const mongoose = require('mongoose');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Add project root to module path
require('module').Module._nodeModulePaths(path.join(__dirname, '..'));

// Load environment variables
require('dotenv').config();

// Mock WhatsApp service
const mockWhatsAppService = {
  sendTextMessage: (phoneNumber, message) => {
    console.log(`📤 WhatsApp API -> ${phoneNumber}: ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);
    return Promise.resolve({ success: true });
  },
  sendImage: () => Promise.resolve({ success: true }),
  sendTypingIndicator: () => Promise.resolve(),
  downloadMedia: () => Promise.resolve(Buffer.from('fake-image-data'))
};

// Mock other services
const mockRegistrationService = {
  registerUser: (userData) => {
    console.log(`📝 Registration -> ${userData.email}`);
    return Promise.resolve({
      user: {
        _id: '507f1f77bcf86cd799439011',
        ...userData,
        emailVerified: false,
        createdAt: new Date()
      },
      otpCode: '123456'
    });
  },
  resendOTP: () => Promise.resolve({ success: true })
};

// Mock the WhatsApp controller
async function mockWhatsAppWebhook(phoneNumber, text) {
  // Load the actual controller
  const whatsappController = require('../controllers/whatsappWebhookController');
  
  // Create mock request
  const req = {
    body: {
      object: 'whatsapp_business_account',
      entry: [{
        id: 'test-entry-id',
        changes: [{
          value: {
            messaging_product: 'whatsapp',
            metadata: {
              display_phone_number: '15555555555',
              phone_number_id: process.env.WHATSAPP_PHONE_NUMBER_ID || 'test-phone-id'
            },
            contacts: [{
              profile: {
                name: 'Test User'
              },
              wa_id: phoneNumber
            }],
            messages: [{
              from: phoneNumber,
              id: 'test-message-id',
              timestamp: Math.floor(Date.now() / 1000),
              type: 'text',
              text: {
                body: text
              }
            }]
          },
          field: 'messages'
        }]
      }]
    }
  };
  
  // Create mock response
  const res = {
    status: (code) => ({
      json: (data) => {
        console.log(`📨 Webhook response: ${code}`);
        return data;
      },
      send: (data) => {
        console.log(`📨 Webhook response: ${code}`);
        return data;
      }
    }),
    send: (data) => {
      console.log(`📨 Webhook response sent`);
      return data;
    }
  };
  
  // Call the webhook handler
  await whatsappController.handleWebhook(req, res);
}

async function runSimpleTest(phoneNumber) {
  console.log(`🚀 Simple WhatsApp Test`);
  console.log(`📱 Phone: ${phoneNumber}`);
  console.log('─'.repeat(50));
  
  let mongoServer;
  
  try {
    // Setup in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log(`✅ Connected to in-memory MongoDB`);
    
    // Mock the services by replacing them in the require cache
    require.cache[require.resolve('../services/whatsappService')] = {
      exports: mockWhatsAppService
    };
    
    require.cache[require.resolve('../services/registrationService')] = {
      exports: mockRegistrationService
    };
    
    // Test simple conversation
    const testMessages = [
      'Hi Taxable',
      '1', // Create account
      '1', // Confirm
      'Test User',
      'test@example.com'
    ];
    
    for (const message of testMessages) {
      console.log(`\n👤 You: ${message}`);
      console.log('─'.repeat(30));
      
      await mockWhatsAppWebhook(phoneNumber, message);
      
      // Check session state
      const WhatsAppSession = require('../models/WhatsAppSession');
      const session = await WhatsAppSession.findOne({ waId: phoneNumber });
      
      if (session) {
        console.log(`📊 Session: ${session.step} (${session.flow || 'no flow'})`);
      }
      
      // Small delay
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    console.log('\n✅ Test completed!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (mongoServer) {
      await mongoose.disconnect();
      await mongoServer.stop();
      console.log('🔌 Disconnected from database');
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 1) {
  console.log('Usage: node scripts/simple-whatsapp-test.js [phoneNumber]');
  process.exit(1);
}

const phoneNumber = args[0];
runSimpleTest(phoneNumber);