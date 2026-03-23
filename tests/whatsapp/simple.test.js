// Simple test to verify the test setup works
const { initTestApp, simulateMessage } = require('./helpers/simulator');
const { connectTestDB, disconnectTestDB } = require('./helpers/dbSetup');

describe('Simple WhatsApp Test', () => {
  beforeAll(async () => {
    await connectTestDB();
    initTestApp();
  });
  
  afterAll(async () => {
    await disconnectTestDB();
  });
  
  test('Basic test to verify setup', async () => {
    const result = await simulateMessage('+2348123456789', 'Hi');
    
    console.log('Result:', {
      hasReplies: result.replies.length > 0,
      replies: result.replies,
      hasSession: !!result.session
    });
    
    // Basic assertions
    expect(result).toBeDefined();
    expect(result.replies).toBeDefined();
    expect(Array.isArray(result.replies)).toBe(true);
  });
});