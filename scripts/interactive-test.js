#!/usr/bin/env node

/**
 * Interactive WhatsApp Test
 * You type messages, bot responds in real-time
 */

const readline = require('readline');
const mongoose = require('mongoose');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Add project root to module path
require('module').Module._nodeModulePaths(path.join(__dirname, '..'));

// Load environment variables
require('dotenv').config();

// Mock services
const mockServices = {
  whatsappService: {
    sendTextMessage: (phoneNumber, message) => {
      console.log(`\n🤖 Bot: ${message}`);
      return Promise.resolve({ success: true });
    },
    sendImage: () => Promise.resolve({ success: true }),
    sendTypingIndicator: () => Promise.resolve(),
    downloadMedia: () => Promise.resolve(Buffer.from('fake-image-data'))
  },
  
  registrationService: {
    registerUser: (userData) => {
      console.log(`\n📝 [Registration Service] Creating user: ${userData.email}`);
      return Promise.resolve({
        user: {
          _id: new mongoose.Types.ObjectId(),
          ...userData,
          emailVerified: false,
          createdAt: new Date()
        },
        otpCode: '123456'
      });
    },
    resendOTP: () => Promise.resolve({ success: true })
  },
  
  monoService: {
    initiateAccountLinking: () => Promise.resolve({ 
      link: 'https://mono.test/connect',
      success: true 
    }),
    getAccountIncome: () => Promise.resolve({ 
      income: 500000,
      currency: 'NGN',
      period: 'monthly'
    })
  },
  
  emailService: {
    sendTaxProfileCreatedEmail: () => Promise.resolve({ success: true }),
    sendOTPEmail: () => Promise.resolve({ success: true })
  },
  
  taxCalculator: {
    estimateTaxFromAnnualIncome: (income) => Math.round(income * 0.075),
    calculateRentRelief: (rentAmount) => Math.min(rentAmount * 0.25, 150000)
  }
};

async function runInteractiveTest() {
  console.log('🚀 WhatsApp Bot Interactive Test');
  console.log('═'.repeat(60));
  console.log('Type messages as if you\'re chatting with the bot');
  console.log('Type "exit" to quit, "state" to see current session');
  console.log('═'.repeat(60));
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '👤 You: '
  });
  
  let mongoServer;
  let phoneNumber = '+2348123456789';
  
  try {
    // Setup in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to in-memory MongoDB');
    
    // Mock the services
    require.cache[require.resolve('../services/whatsappService')] = {
      exports: mockServices.whatsappService
    };
    
    require.cache[require.resolve('../services/registrationService')] = {
      exports: mockServices.registrationService
    };
    
    require.cache[require.resolve('../services/monoService')] = {
      exports: mockServices.monoService
    };
    
    require.cache[require.resolve('../utils/emailService')] = {
      exports: mockServices.emailService
    };
    
    require.cache[require.resolve('../utils/taxCalculator')] = {
      exports: mockServices.taxCalculator
    };
    
    // Load the controller
    const whatsappController = require('../controllers/whatsappWebhookController');
    
    console.log('\n💬 Starting conversation...');
    console.log('Type "Hi Taxable" to begin');
    
    rl.prompt();
    
    rl.on('line', async (line) => {
      const input = line.trim();
      
      if (input.toLowerCase() === 'exit') {
        console.log('\n👋 Goodbye!');
        rl.close();
        return;
      }
      
      if (input.toLowerCase() === 'state') {
        const WhatsAppSession = require('../models/WhatsAppSession');
        const session = await WhatsAppSession.findOne({ waId: phoneNumber });
        if (session) {
          console.log(`\n📊 Current Session:`);
          console.log(`   Step: ${session.step}`);
          console.log(`   Flow: ${session.flow || 'none'}`);
          console.log(`   Data: ${JSON.stringify(session.data, null, 2)}`);
        } else {
          console.log('\n📊 No active session');
        }
        rl.prompt();
        return;
      }
      
      if (input.toLowerCase() === 'help') {
        console.log('\n📋 Available commands:');
        console.log('  [any message] - Send to bot');
        console.log('  state - Show current session state');
        console.log('  exit - Quit the test');
        console.log('\n💡 Try these:');
        console.log('  Hi Taxable');
        console.log('  1 (Create account)');
        console.log('  John Doe');
        console.log('  test@example.com');
        console.log('  Yes');
        console.log('  Password1');
        rl.prompt();
        return;
      }
      
      if (input) {
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
                    id: `test-message-${Date.now()}`,
                    timestamp: Math.floor(Date.now() / 1000),
                    type: 'text',
                    text: {
                      body: input
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
            json: (data) => data,
            send: (data) => data
          }),
          send: () => {}
        };
        
        // Call the webhook handler
        try {
          await whatsappController.handleWebhook(req, res);
        } catch (error) {
          console.log(`\n❌ Error: ${error.message}`);
        }
      }
      
      rl.prompt();
    });
    
    rl.on('close', () => {
      console.log('\n🔌 Cleaning up...');
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Handle cleanup
process.on('SIGINT', () => {
  console.log('\n👋 Goodbye!');
  process.exit(0);
});

runInteractiveTest();