#!/usr/bin/env node

/**
 * WhatsApp Bot Simulator - Interactive Terminal Tool
 * 
 * Usage:
 *   node scripts/whatsapp-simulator.js [phoneNumber]
 * 
 * Example:
 *   node scripts/whatsapp-simulator.js +2348123456789
 */

const readline = require('readline');
const mongoose = require('mongoose');
const path = require('path');

// Add project root to module path
require('module').Module._nodeModulePaths(path.join(__dirname, '..'));

// Initialize database connection
async function initDatabase() {
  try {
    // Use in-memory MongoDB for testing
    const { MongoMemoryServer } = require('mongodb-memory-server');
    const mongoServer = await MongoMemoryServer.create();
    const mongoUri = mongoServer.getUri();
    
    await mongoose.connect(mongoUri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    
    console.log(`✅ Connected to in-memory MongoDB at ${mongoUri}`);
    return { mongoServer, connected: true };
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    console.log('⚠️  Running in offline mode (no session persistence)');
    return { mongoServer: null, connected: false };
  }
}

// Load test helpers
function loadTestHelpers() {
  try {
    // Clear require cache to get fresh imports
    delete require.cache[require.resolve('../tests/whatsapp/helpers/simulator')];
    delete require.cache[require.resolve('../tests/whatsapp/helpers/mockSetup')];
    
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
    
    // Initialize mocks first
    require('../tests/whatsapp/helpers/mockSetup');
    
    // Then load simulator
    const { initTestApp, simulateMessage } = require('../tests/whatsapp/helpers/simulator');
    
    // Initialize test app
    const app = initTestApp();
    
    return { simulateMessage, app };
  } catch (error) {
    console.error('❌ Failed to load test helpers:', error.message);
    console.log('⚠️  Running in simplified mode');
    return null;
  }
}

// Format message for display
function formatMessage(sender, message, maxLength = 80) {
  const prefix = sender === 'user' ? '👤 You: ' : '🤖 Bot: ';
  const lines = [];
  let currentLine = '';
  
  // Simple word wrap
  const words = message.split(' ');
  for (const word of words) {
    if ((currentLine + word).length > maxLength) {
      lines.push(currentLine);
      currentLine = word + ' ';
    } else {
      currentLine += word + ' ';
    }
  }
  
  if (currentLine) {
    lines.push(currentLine);
  }
  
  // Add prefix to first line, indent subsequent lines
  return lines.map((line, index) => {
    if (index === 0) {
      return prefix + line;
    }
    return ' '.repeat(prefix.length) + line;
  }).join('\n');
}

// Display conversation history
function displayConversation(history) {
  console.log('\n' + '='.repeat(60));
  console.log('💬 CONVERSATION HISTORY');
  console.log('='.repeat(60));
  
  if (history.length === 0) {
    console.log('No messages yet. Type something to start!');
    return;
  }
  
  history.forEach((entry, index) => {
    console.log(`\n[${index + 1}] ${formatMessage(entry.sender, entry.message)}`);
    
    // Show session state changes
    if (entry.sessionState) {
      console.log(`   📍 State: ${entry.sessionState.step || 'unknown'}`);
    }
  });
  
  console.log('\n' + '='.repeat(60));
}

// Show available commands
function showHelp() {
  console.log('\n📋 AVAILABLE COMMANDS:');
  console.log('  [message]     - Send message to bot');
  console.log('  help          - Show this help');
  console.log('  history       - Show conversation history');
  console.log('  state         - Show current session state');
  console.log('  reset         - Start new conversation');
  console.log('  clear         - Clear screen');
  console.log('  test [flow]   - Run test flow (registration, login, profile)');
  console.log('  exit          - Quit simulator');
  console.log('');
}

// Run predefined test flow
async function runTestFlow(flowName, phoneNumber, simulateMessage, history) {
  const flows = {
    'registration': [
      'Hi',
      '1', // Create account
      'John',
      'Doe',
      'john.doe@example.com',
      '2348012345678',
      'Password123',
      '123456' // OTP
    ],
    'login': [
      'Hi',
      '2', // Login
      'john.doe@example.com',
      'Password123'
    ],
    'quickstart': [
      'Hi',
      '1', // Create account
      'Test',
      'User',
      'test.user@example.com',
      '2348098765432',
      'Test123',
      '123456',
      '3', // Create tax profile
      '2026',
      'Individual'
    ],
    'menu': [
      'Hi',
      'menu'
    ]
  };
  
  if (!flows[flowName]) {
    console.log(`❌ Unknown flow: ${flowName}`);
    console.log(`Available flows: ${Object.keys(flows).join(', ')}`);
    return;
  }
  
  console.log(`\n🧪 Running test flow: ${flowName}`);
  console.log('='.repeat(40));
  
  for (const message of flows[flowName]) {
    console.log(`\n→ ${formatMessage('user', message)}`);
    
    const result = await simulateMessage(phoneNumber, message);
    
    // Add to history
    history.push({
      sender: 'user',
      message: message,
      timestamp: new Date()
    });
    
    if (result.replies && result.replies.length > 0) {
      result.replies.forEach(reply => {
        console.log(`\n${formatMessage('bot', reply)}`);
        history.push({
          sender: 'bot',
          message: reply,
          timestamp: new Date(),
          sessionState: result.session
        });
      });
    } else {
      console.log('\n🤖 Bot: (no response)');
    }
    
    // Small delay for readability
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n✅ Flow completed!');
}

// Main simulator class
class WhatsAppSimulator {
  constructor(phoneNumber = '+2348123456789') {
    this.phoneNumber = phoneNumber;
    this.history = [];
    this.dbConnected = false;
    this.simulateMessage = null;
  }
  
  async init() {
    console.log('🚀 Initializing WhatsApp Bot Simulator...\n');
    
    // Connect to database
    this.dbConnected = await initDatabase();
    
    // Load test helpers
    const helpers = loadTestHelpers();
    this.simulateMessage = helpers.simulateMessage;
    
    console.log(`📱 Simulating WhatsApp number: ${this.phoneNumber}`);
    console.log('💡 Type "help" for available commands\n');
  }
  
  async start() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '💬 '
    });
    
    rl.prompt();
    
    rl.on('line', async (input) => {
      const command = input.trim();
      
      if (!command) {
        rl.prompt();
        return;
      }
      
      switch (command.toLowerCase()) {
        case 'exit':
        case 'quit':
          console.log('\n👋 Goodbye!');
          rl.close();
          process.exit(0);
          break;
          
        case 'help':
          showHelp();
          break;
          
        case 'history':
          displayConversation(this.history);
          break;
          
        case 'state':
          await this.showSessionState();
          break;
          
        case 'reset':
          this.history = [];
          console.log('\n🔄 Conversation reset. New session started.\n');
          break;
          
        case 'clear':
          console.clear();
          console.log('🧹 Screen cleared\n');
          break;
          
        default:
          // Check if it's a test flow command
          if (command.toLowerCase().startsWith('test ')) {
            const flowName = command.split(' ')[1];
            await runTestFlow(flowName, this.phoneNumber, this.simulateMessage, this.history);
          } else {
            // Regular message
            await this.handleMessage(command);
          }
          break;
      }
      
      rl.prompt();
    });
    
    rl.on('close', () => {
      console.log('\n👋 Goodbye!');
      process.exit(0);
    });
  }
  
  async handleMessage(message) {
    try {
      console.log(`\n${formatMessage('user', message)}`);
      
      // Add to history
      this.history.push({
        sender: 'user',
        message: message,
        timestamp: new Date()
      });
      
      // Send to bot
      const result = await this.simulateMessage(this.phoneNumber, message);
      
      // Process replies
      if (result.replies && result.replies.length > 0) {
        result.replies.forEach(reply => {
          console.log(`\n${formatMessage('bot', reply)}`);
          this.history.push({
            sender: 'bot',
            message: reply,
            timestamp: new Date(),
            sessionState: result.session
          });
        });
      } else {
        console.log('\n🤖 Bot: (no response)');
        this.history.push({
          sender: 'bot',
          message: '(no response)',
          timestamp: new Date(),
          sessionState: result.session
        });
      }
      
      // Show session state if changed
      if (result.session && this.history.length > 1) {
        const prevState = this.history[this.history.length - 3]?.sessionState;
        const currentState = result.session;
        
        if (!prevState || prevState.step !== currentState.step) {
          console.log(`\n📍 Session state: ${currentState.step || 'unknown'}`);
        }
      }
      
    } catch (error) {
      console.error(`\n❌ Error: ${error.message}`);
      this.history.push({
        sender: 'system',
        message: `Error: ${error.message}`,
        timestamp: new Date()
      });
    }
  }
  
  async showSessionState() {
    try {
      const WhatsAppSession = require('../models/WhatsAppSession');
      const session = await WhatsAppSession.findOne({ waId: this.phoneNumber });
      
      if (session) {
        console.log('\n📊 CURRENT SESSION STATE:');
        console.log('='.repeat(40));
        console.log(`User ID: ${session.userId || '(not linked)'}`);
        console.log(`Step: ${session.step || '(none)'}`);
        console.log(`Data: ${JSON.stringify(session.data || {}, null, 2)}`);
        console.log(`Created: ${session.createdAt}`);
        console.log(`Updated: ${session.updatedAt}`);
      } else {
        console.log('\n📊 No active session found for this number.');
      }
    } catch (error) {
      console.log(`\n⚠️  Could not fetch session: ${error.message}`);
    }
  }
}

// Main execution
async function main() {
  const phoneNumber = process.argv[2] || '+2348123456789';
  
  // Validate phone number format
  if (!phoneNumber.match(/^\+\d{10,15}$/)) {
    console.error('❌ Invalid phone number format. Use: +2348123456789');
    process.exit(1);
  }
  
  const simulator = new WhatsAppSimulator(phoneNumber);
  
  try {
    await simulator.init();
    await simulator.start();
  } catch (error) {
    console.error('❌ Failed to start simulator:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('❌ Unhandled error:', error);
    process.exit(1);
  });
}

module.exports = WhatsAppSimulator;