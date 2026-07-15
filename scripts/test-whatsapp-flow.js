#!/usr/bin/env node

/**
 * Test WhatsApp Flow - Non-interactive test of WhatsApp bot
 * 
 * Usage:
 *   node scripts/test-whatsapp-flow.js [phoneNumber] [flowName]
 * 
 * Example:
 *   node scripts/test-whatsapp-flow.js +2348123456789 registration
 */

const mongoose = require('mongoose');
const path = require('path');
const { MongoMemoryServer } = require('mongodb-memory-server');

// Add project root to module path
require('module').Module._nodeModulePaths(path.join(__dirname, '..'));

// Mock Jest globals if not present
if (typeof global.jest === 'undefined') {
  global.jest = {
    fn: (implementation) => implementation,
    mock: () => {},
    clearAllMocks: () => {},
    resetAllMocks: () => {},
    restoreAllMocks: () => {}
  };
}

// Test flows
const testFlows = {
  registration: [
    'Hi Taxable',
    '1', // Create account
    '1', // Confirm
    'John Doe',
    'john@test.com',
    'Yes', // Confirm phone
    'Password1',
    'Password1',
    '1' // Confirm registration
  ],
  
  login: [
    'Hi Taxable',
    '2', // Login
    'john@test.com',
    'Password1'
  ],
  
  quickstart: [
    'Hi Taxable',
    '3' // Quickstart
  ],
  
  menu: [
    'Hi Taxable',
    '1', // Create account
    '1', // Confirm
    'Test User',
    'test@example.com',
    'Yes',
    'Password1',
    'Password1',
    '1', // Confirm registration
    '1', // Main menu option 1
    '1' // Tax profile creation
  ]
};

async function runTestFlow(phoneNumber, flowName) {
  console.log(`🚀 Testing WhatsApp Flow: ${flowName}`);
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
    
    // Load environment variables
    require('dotenv').config();
    
    // Clear require cache
    delete require.cache[require.resolve('../tests/whatsapp/helpers/simulator')];
    delete require.cache[require.resolve('../tests/whatsapp/helpers/mockSetup')];
    
    // Initialize mocks
    require('../tests/whatsapp/helpers/mockSetup');
    
    // Load simulator
    const { initTestApp, simulateMessage } = require('../tests/whatsapp/helpers/simulator');
    
    // Initialize test app
    const app = initTestApp();
    
    // Get flow messages
    const messages = testFlows[flowName];
    if (!messages) {
      throw new Error(`Flow "${flowName}" not found. Available: ${Object.keys(testFlows).join(', ')}`);
    }
    
    // Run the flow
    const results = [];
    for (const message of messages) {
      console.log(`👤 You: ${message}`);
      
      const result = await simulateMessage(phoneNumber, message);
      
      if (result.replies && result.replies.length > 0) {
        result.replies.forEach(reply => {
          console.log(`🤖 Bot: ${reply.substring(0, 100)}${reply.length > 100 ? '...' : ''}`);
        });
      } else {
        console.log('🤖 Bot: (No reply)');
      }
      
      if (result.session) {
        console.log(`📊 Session: ${result.session.step} (${result.session.flow || 'no flow'})`);
      }
      
      console.log('─'.repeat(30));
      results.push(result);
    }
    
    console.log('✅ Flow completed successfully!');
    console.log(`📈 Total messages: ${messages.length}`);
    console.log(`💾 Final session state: ${results[results.length - 1]?.session?.step || 'unknown'}`);
    
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
if (args.length < 2) {
  console.log('Usage: node scripts/test-whatsapp-flow.js [phoneNumber] [flowName]');
  console.log('Available flows:', Object.keys(testFlows).join(', '));
  process.exit(1);
}

const phoneNumber = args[0];
const flowName = args[1];

runTestFlow(phoneNumber, flowName);