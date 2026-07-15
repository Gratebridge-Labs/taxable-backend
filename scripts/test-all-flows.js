#!/usr/bin/env node

/**
 * Test All WhatsApp Flows - Comprehensive test runner
 * 
 * Usage:
 *   node scripts/test-all-flows.js [phoneNumber]
 */

const mongoose = require('mongoose');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Add project root to module path
require('module').Module._nodeModulePaths(path.join(__dirname, '..'));

// Load environment variables
require('dotenv').config();

// Define all test flows
const testFlows = {
  '01_welcome': {
    name: 'Welcome Flow',
    description: 'Basic welcome and menu navigation',
    messages: [
      'Hi Taxable',
      '1', // Create account
      '2', // Go back to main menu
      '2', // Login
      '3', // Quickstart
      '4'  // Learn more
    ]
  },
  
  '02_registration': {
    name: 'Full Registration',
    description: 'Complete user registration',
    messages: [
      'Hi Taxable',
      '1', // Create account
      '1', // Confirm
      'John Doe',
      'john@test.com',
      '1', // Yes, use this number
      'Password1',
      'Password1',
      '1'  // Confirm registration
    ]
  },
  
  '03_login': {
    name: 'Login Flow',
    description: 'User login with existing account',
    messages: [
      'Hi Taxable',
      '2', // Login
      'john@test.com',
      'Password1'
    ],
    setup: async () => {
      // Create a user first
      const User = require('../models/User');
      const user = new User({
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@test.com',
        phone: '+2348123456789',
        password: '$2b$10$fakehashforpasswordtesting', // "Password1"
        emailVerified: true,
        createdAt: new Date()
      });
      await user.save();
      return { user };
    }
  },
  
  '04_main_menu': {
    name: 'Main Menu Navigation',
    description: 'Test all main menu options',
    messages: [
      'Hi Taxable',
      '1', // Create account
      '1', // Confirm
      'Menu Tester',
      'menu@test.com',
      '1', // Yes, use this number
      'Password1',
      'Password1',
      '1', // Confirm registration
      '1', // Create tax profile
      '2', // View existing profiles
      '3', // Connect bank account
      '4', // Subscription plans
      '5', // Help & support
      '6'  // Account settings
    ]
  },
  
  '05_quickstart': {
    name: 'Quickstart Flow',
    description: 'Quick tax estimation without registration',
    messages: [
      'Hi Taxable',
      '3', // Quickstart
      '5000000', // Annual income
      'Lagos', // State
      '1', // Yes, resident
      '50000', // Monthly rent
      '100000', // Health insurance
      '200000' // Pension contribution
    ]
  }
};

// Mock services
const mockServices = {
  whatsappService: {
    sendTextMessage: (phoneNumber, message) => {
      console.log(`📤 WhatsApp -> ${phoneNumber}: ${message.substring(0, 80)}${message.length > 80 ? '...' : ''}`);
      return Promise.resolve({ success: true });
    },
    sendImage: () => Promise.resolve({ success: true }),
    sendTypingIndicator: () => Promise.resolve(),
    downloadMedia: () => Promise.resolve(Buffer.from('fake-image-data'))
  },
  
  registrationService: {
    registerUser: (userData) => {
      console.log(`📝 Registration -> ${userData.email}`);
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

async function runFlowTest(phoneNumber, flowId, flowConfig) {
  console.log(`\n🔹 ${flowConfig.name}`);
  console.log(`📋 ${flowConfig.description}`);
  console.log('─'.repeat(60));
  
  let setupData = {};
  
  try {
    // Run setup if defined
    if (flowConfig.setup) {
      console.log('⚙️  Running setup...');
      setupData = await flowConfig.setup();
    }
    
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
    
    let finalSession = null;
    let messageCount = 0;
    
    // Run each message in the flow
    for (const message of flowConfig.messages) {
      messageCount++;
      console.log(`\n${messageCount}. 👤 You: ${message}`);
      console.log('─'.repeat(40));
      
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
                  id: `test-message-${messageCount}`,
                  timestamp: Math.floor(Date.now() / 1000),
                  type: 'text',
                  text: {
                    body: message
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
            // console.log(`📨 Response: ${code}`);
            return data;
          },
          send: (data) => {
            // console.log(`📨 Response: ${code}`);
            return data;
          }
        }),
        send: () => {}
      };
      
      // Call the webhook handler
      await whatsappController.handleWebhook(req, res);
      
      // Check session state
      const WhatsAppSession = require('../models/WhatsAppSession');
      const session = await WhatsAppSession.findOne({ waId: phoneNumber });
      
      if (session) {
        finalSession = session;
        console.log(`📊 Session: ${session.step} (${session.flow || 'no flow'})`);
      }
      
      // Small delay between messages
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    // Report results
    console.log('\n✅ Flow completed successfully!');
    console.log(`📈 Messages processed: ${messageCount}`);
    if (finalSession) {
      console.log(`💾 Final state: ${finalSession.step}`);
      console.log(`📂 Flow: ${finalSession.flow || 'none'}`);
    }
    
    return {
      success: true,
      messageCount,
      finalSession: finalSession ? finalSession.toObject() : null,
      setupData
    };
    
  } catch (error) {
    console.error(`❌ Error in flow ${flowId}:`, error.message);
    return {
      success: false,
      error: error.message,
      setupData
    };
  }
}

async function runAllTests(phoneNumber) {
  console.log('🚀 WhatsApp Bot Comprehensive Test Suite');
  console.log('📱 Test Phone:', phoneNumber);
  console.log('═'.repeat(60));
  
  let mongoServer;
  const results = {};
  
  try {
    // Setup in-memory MongoDB
    mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log('✅ Connected to in-memory MongoDB');
    
    // Run each flow
    for (const [flowId, flowConfig] of Object.entries(testFlows)) {
      // Clear database between flows
      const collections = mongoose.connection.collections;
      for (const key in collections) {
        const collection = collections[key];
        await collection.deleteMany({});
      }
      
      // Clear require cache for fresh imports
      delete require.cache[require.resolve('../controllers/whatsappWebhookController')];
      
      results[flowId] = await runFlowTest(phoneNumber, flowId, flowConfig);
      
      // Add separator between flows
      console.log('\n' + '═'.repeat(60));
    }
    
    // Generate summary report
    console.log('\n📊 TEST SUMMARY');
    console.log('═'.repeat(60));
    
    let totalTests = 0;
    let passedTests = 0;
    let failedTests = 0;
    
    for (const [flowId, result] of Object.entries(results)) {
      totalTests++;
      const flowName = testFlows[flowId].name;
      
      if (result.success) {
        passedTests++;
        console.log(`✅ ${flowId}: ${flowName} - PASSED (${result.messageCount} messages)`);
      } else {
        failedTests++;
        console.log(`❌ ${flowId}: ${flowName} - FAILED: ${result.error}`);
      }
    }
    
    console.log('\n📈 OVERALL RESULTS');
    console.log(`Total flows: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${failedTests}`);
    console.log(`Success rate: ${Math.round((passedTests / totalTests) * 100)}%`);
    
    if (failedTests === 0) {
      console.log('\n🎉 ALL TESTS PASSED! WhatsApp bot is ready for beta testing.');
    } else {
      console.log(`\n⚠️  ${failedTests} test(s) failed. Review errors above.`);
    }
    
  } catch (error) {
    console.error('❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  } finally {
    if (mongoServer) {
      await mongoose.disconnect();
      await mongoServer.stop();
      console.log('\n🔌 Disconnected from database');
    }
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 1) {
  console.log('Usage: node scripts/test-all-flows.js [phoneNumber]');
  console.log('\nAvailable test flows:');
  for (const [flowId, flowConfig] of Object.entries(testFlows)) {
    console.log(`  ${flowId}: ${flowConfig.name} - ${flowConfig.description}`);
  }
  process.exit(1);
}

const phoneNumber = args[0];
runAllTests(phoneNumber);