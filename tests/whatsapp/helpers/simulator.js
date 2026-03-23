const request = require('supertest');

// We'll create the Express app in each test to ensure fresh imports
let app;

// These will be initialized after mocks are set up
let getMockReplies, clearMocks;

/**
 * Initialize the Express app for testing
 * Must be called before simulateMessage
 */
const initTestApp = () => {
  // Clear require cache to get fresh imports with mocks
  delete require.cache[require.resolve('../../../controllers/whatsappWebhookController')];
  
  // Get mock functions after mocks are set up
  const mockSetup = require('./mockSetup');
  getMockReplies = mockSetup.getMockReplies;
  clearMocks = mockSetup.clearMocks;
  
  // Use test server instead of real server
  app = require('./testServer');
  return app;
};

/**
 * Simulate a WhatsApp message from a user
 * @param {string} phoneNumber - User's WhatsApp phone number
 * @param {string} text - Message text
 * @returns {Promise<{replies: Array<{message: string}>, session: any}>}
 */
const simulateMessage = async (phoneNumber, text) => {
  if (!app) {
    throw new Error('Test app not initialized. Call initTestApp() first.');
  }
  
  // Clear previous mock replies
  clearMocks();
  
  // Construct WhatsApp webhook payload
  const payload = {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'test-entry-id',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '15555555555',
            phone_number_id: 'test-phone-id'
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
  };
  
  // Send POST request to webhook endpoint
  const response = await request(app)
    .post('/api/whatsapp/webhook')
    .send(payload)
    .expect(200);
  
  // Get replies captured by mock
  const mockReplies = getMockReplies();
  const replies = mockReplies
    .filter(r => r.phoneNumber === phoneNumber)
    .map(r => r.message);
  
  // Get current session state
  const WhatsAppSession = require('../../../models/WhatsAppSession');
  const session = await WhatsAppSession.findOne({ waId: phoneNumber });
  
  return {
    replies,
    session: session ? session.toObject() : null,
    response
  };
};

/**
 * Simulate a conversation flow by sending multiple messages
 * @param {string} phoneNumber - User's WhatsApp phone number
 * @param {Array<string>} messages - Array of message texts
 * @returns {Promise<Array<{input: string, replies: string[], session: any}>>}
 */
const simulateConversation = async (phoneNumber, messages) => {
  const results = [];
  
  for (const message of messages) {
    const result = await simulateMessage(phoneNumber, message);
    results.push({
      input: message,
      replies: result.replies,
      session: result.session
    });
    
    // Small delay between messages to simulate real interaction
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return results;
};

/**
 * Extract the last reply from simulation results
 */
const getLastReply = (simulationResult) => {
  if (!simulationResult.replies || simulationResult.replies.length === 0) {
    return null;
  }
  return simulationResult.replies[simulationResult.replies.length - 1];
};

/**
 * Check if reply contains specific text (case-insensitive)
 */
const replyContains = (reply, text) => {
  if (!reply) return false;
  return reply.toLowerCase().includes(text.toLowerCase());
};

module.exports = {
  initTestApp,
  simulateMessage,
  simulateConversation,
  getLastReply,
  replyContains
};