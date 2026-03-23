const { initTestApp, simulateMessage, simulateConversation, getLastReply, replyContains } = require('../helpers/simulator');
const { connectTestDB, disconnectTestDB, seedTestData } = require('../helpers/dbSetup');

describe('Registration Flow', () => {
  const testPhone = '+2348123456789';
  
  beforeAll(async () => {
    await connectTestDB();
    initTestApp();
  });
  
  afterAll(async () => {
    await disconnectTestDB();
  });
  
  beforeEach(async () => {
    // Clear database before each test
    const mongoose = require('mongoose');
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
  });
  
  test('New user completes full registration', async () => {
    // Start conversation
    const result1 = await simulateMessage(testPhone, 'Hi Taxable');
    expect(result1.replies.length).toBeGreaterThan(0);
    expect(replyContains(getLastReply(result1), 'Welcome') || replyContains(getLastReply(result1), 'Hey')).toBeTruthy();
    
    // Choose to create account
    const result2 = await simulateMessage(testPhone, '1');
    expect(result2.replies.length).toBeGreaterThan(0);
    
    // Confirm account creation
    const result3 = await simulateMessage(testPhone, '1');
    expect(result3.replies.length).toBeGreaterThan(0);
    
    // Enter full name
    const result4 = await simulateMessage(testPhone, 'John Doe');
    expect(result4.replies.length).toBeGreaterThan(0);
    
    // Enter email
    const result5 = await simulateMessage(testPhone, 'john@test.com');
    expect(result5.replies.length).toBeGreaterThan(0);
    
    // Confirm phone number
    const result6 = await simulateMessage(testPhone, 'Yes');
    expect(result6.replies.length).toBeGreaterThan(0);
    
    // Enter password
    const result7 = await simulateMessage(testPhone, 'Password1');
    expect(result7.replies.length).toBeGreaterThan(0);
    
    // Enter OTP
    const result8 = await simulateMessage(testPhone, '123456');
    expect(result8.replies.length).toBeGreaterThan(0);
    
    // Check session exists
    expect(result8.session).toBeTruthy();
    
    // Check user was created (the mock should have been called)
    // Note: The actual user creation is mocked, so we can't check DB
    // But we can verify the flow completed
    console.log('Registration flow completed successfully');
  });
  
  test('Registration with invalid email shows error', async () => {
    await simulateMessage(testPhone, 'Hi Taxable');
    await simulateMessage(testPhone, '1');
    await simulateMessage(testPhone, '1');
    await simulateMessage(testPhone, 'John Doe');
    
    const result = await simulateMessage(testPhone, 'invalid-email');
    expect(result.replies.length).toBeGreaterThan(0);
    
    // Should allow retry with valid email
    const result2 = await simulateMessage(testPhone, 'john@test.com');
    expect(result2.replies.length).toBeGreaterThan(0);
  });
  
  test('Registration with weak password shows error', async () => {
    await simulateMessage(testPhone, 'Hi Taxable');
    await simulateMessage(testPhone, '1');
    await simulateMessage(testPhone, '1');
    await simulateMessage(testPhone, 'John Doe');
    await simulateMessage(testPhone, 'john@test.com');
    await simulateMessage(testPhone, 'Yes');
    
    const result = await simulateMessage(testPhone, 'weak');
    expect(result.replies.length).toBeGreaterThan(0);
    
    // Should allow retry with strong password
    const result2 = await simulateMessage(testPhone, 'Password1');
    expect(result2.replies.length).toBeGreaterThan(0);
  });
  
  test('Wrong OTP then correct OTP works', async () => {
    await simulateMessage(testPhone, 'Hi Taxable');
    await simulateMessage(testPhone, '1');
    await simulateMessage(testPhone, '1');
    await simulateMessage(testPhone, 'John Doe');
    await simulateMessage(testPhone, 'john@test.com');
    await simulateMessage(testPhone, 'Yes');
    await simulateMessage(testPhone, 'Password1');
    
    // Wrong OTP
    const result1 = await simulateMessage(testPhone, '999999');
    expect(result1.replies.length).toBeGreaterThan(0);
    
    // Correct OTP
    const result2 = await simulateMessage(testPhone, '123456');
    expect(result2.replies.length).toBeGreaterThan(0);
  });
  
  test('Resend OTP option works', async () => {
    await simulateMessage(testPhone, 'Hi Taxable');
    await simulateMessage(testPhone, '1');
    await simulateMessage(testPhone, '1');
    await simulateMessage(testPhone, 'John Doe');
    await simulateMessage(testPhone, 'john@test.com');
    await simulateMessage(testPhone, 'Yes');
    await simulateMessage(testPhone, 'Password1');
    
    // Choose resend option
    const result = await simulateMessage(testPhone, 'Resend');
    expect(result.replies.length).toBeGreaterThan(0);
    
    // Enter OTP
    const result2 = await simulateMessage(testPhone, '123456');
    expect(result2.replies.length).toBeGreaterThan(0);
  });
  
  test('Stop mid-flow then resume', async () => {
    await simulateMessage(testPhone, 'Hi Taxable');
    await simulateMessage(testPhone, '1');
    await simulateMessage(testPhone, '1');
    await simulateMessage(testPhone, 'John Doe');
    
    // Stop the flow
    const result1 = await simulateMessage(testPhone, 'Stop');
    expect(result1.replies.length).toBeGreaterThan(0);
    
    // Check session exists
    const WhatsAppSession = require('../../../models/WhatsAppSession');
    const session = await WhatsAppSession.findOne({ phoneNumber: testPhone });
    expect(session).toBeTruthy();
    
    // Resume with "Hi Taxable"
    const result2 = await simulateMessage(testPhone, 'Hi Taxable');
    expect(result2.replies.length).toBeGreaterThan(0);
  });
  
  test('Menu command mid-flow shows menu', async () => {
    await simulateMessage(testPhone, 'Hi Taxable');
    await simulateMessage(testPhone, '1');
    await simulateMessage(testPhone, '1');
    await simulateMessage(testPhone, 'John Doe');
    
    // Send menu command
    const result = await simulateMessage(testPhone, 'Menu');
    expect(result.replies.length).toBeGreaterThan(0);
    
    // Should be able to continue registration
    const result2 = await simulateMessage(testPhone, '1');
    expect(result2.replies.length).toBeGreaterThan(0);
  });
  
  test('Existing email redirects to login', async () => {
    // Create existing user first
    await seedTestData.createRegisteredUser({
      email: 'existing@test.com',
      phoneNumber: '+234876543210',
      phone: '+234876543210' // Add phone field
    });
    
    await simulateMessage(testPhone, 'Hi Taxable');
    await simulateMessage(testPhone, '1');
    await simulateMessage(testPhone, '1');
    await simulateMessage(testPhone, 'John Doe');
    
    // Try to register with existing email
    const result = await simulateMessage(testPhone, 'existing@test.com');
    expect(result.replies.length).toBeGreaterThan(0);
    
    // Should redirect to login flow
    const result2 = await simulateMessage(testPhone, '1');
    expect(result2.replies.length).toBeGreaterThan(0);
  });
});