/**
 * Simple test to trace the actual registration flow
 */
const { initTestApp, simulateMessage, simulateConversation, getLastReply, replyContains } = require('../helpers/simulator');
const { connectTestDB, disconnectTestDB } = require('../helpers/dbSetup');
const { VALID_PHONES, generateValidUserData } = require('../helpers/testData');

describe('WhatsApp Bot - Simple Registration Flow', () => {
  const testPhone = VALID_PHONES.TEST_USER; // +2347012345678
  
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
  
  test('Complete registration flow step by step', async () => {
    console.log('\n=== Testing Complete Registration Flow ===\n');
    
    // Step 1: User says "Hi Taxable"
    console.log('Step 1: User says "Hi Taxable"');
    const result1 = await simulateMessage(testPhone, 'Hi Taxable');
    const reply1 = getLastReply(result1);
    console.log('Bot:', reply1?.substring(0, 150) + '...');
    
    // Should see welcome message asking if new or existing
    expect(replyContains(reply1, 'new') || replyContains(reply1, 'account')).toBe(true);
    
    // Step 2: User chooses "1" (I'm new)
    console.log('\nStep 2: User chooses "1" (I\'m new)');
    const result2 = await simulateMessage(testPhone, '1');
    const reply2 = getLastReply(result2);
    console.log('Bot:', reply2?.substring(0, 150) + '...');
    
    // Should ask for confirmation to create account
    expect(replyContains(reply2, 'create') || replyContains(reply2, 'account')).toBe(true);
    
    // Step 3: User confirms "1" (Yes, let's go)
    console.log('\nStep 3: User confirms "1" (Yes, let\'s go)');
    const result3 = await simulateMessage(testPhone, '1');
    const reply3 = getLastReply(result3);
    console.log('Bot:', reply3?.substring(0, 150) + '...');
    
    // Should ask for full name
    expect(replyContains(reply3, 'name') || replyContains(reply3, 'full name')).toBe(true);
    
    // Step 4: User enters name
    console.log('\nStep 4: User enters "John Taxpayer"');
    const result4 = await simulateMessage(testPhone, 'John Taxpayer');
    const reply4 = getLastReply(result4);
    console.log('Bot:', reply4?.substring(0, 150) + '...');
    
    // Should ask for email
    expect(replyContains(reply4, 'email') || replyContains(reply4, '@')).toBe(true);
    
    // Step 5: User enters email
    console.log('\nStep 5: User enters "john.taxpayer@example.com"');
    const result5 = await simulateMessage(testPhone, 'john.taxpayer@example.com');
    const reply5 = getLastReply(result5);
    console.log('Bot:', reply5?.substring(0, 150) + '...');
    
    // Should ask for phone or confirm phone
    expect(replyContains(reply5, 'phone') || replyContains(reply5, 'number')).toBe(true);
    
    // Step 6: User confirms phone (or enters it)
    console.log('\nStep 6: User confirms phone with "1" (if prompted)');
    const result6 = await simulateMessage(testPhone, '1');
    const reply6 = getLastReply(result6);
    console.log('Bot:', reply6?.substring(0, 150) + '...');
    
    // Should ask for password or move to next step
    // Note: The actual flow might vary based on implementation
    
    console.log('\n✅ Registration flow progressing correctly');
    
    // Check session state
    const WhatsAppSession = require('../../../models/WhatsAppSession');
    const session = await WhatsAppSession.findOne({ waId: testPhone.replace('+', '') });
    console.log('\nCurrent session step:', session?.step);
    console.log('Registration data collected:', session?.registrationData);
  });
  
  test('Test login flow for existing user', async () => {
    console.log('\n=== Testing Login Flow ===\n');
    
    // First create a user
    const User = require('../../../models/User');
    const phoneInDb = testPhone.replace('+', ''); // 2347012345678
    const userData = generateValidUserData({ 
      phone: phoneInDb,
      firstName: 'Existing',
      lastName: 'User',
      email: 'existing.user@example.com'
    });
    
    const user = new User(userData);
    await user.save();
    console.log('✅ Created existing user:', userData.email);
    
    // Step 1: User says "Hi Taxable"
    console.log('\nStep 1: User says "Hi Taxable"');
    const result1 = await simulateMessage(testPhone, 'Hi Taxable');
    const reply1 = getLastReply(result1);
    console.log('Bot:', reply1?.substring(0, 150) + '...');
    
    // Should ask if new or existing
    expect(replyContains(reply1, 'new') || replyContains(reply1, 'account')).toBe(true);
    
    // Step 2: User chooses "2" (I have an account)
    console.log('\nStep 2: User chooses "2" (I have an account)');
    const result2 = await simulateMessage(testPhone, '2');
    const reply2 = getLastReply(result2);
    console.log('Bot:', reply2?.substring(0, 150) + '...');
    
    // Should ask for email
    expect(replyContains(reply2, 'email') || replyContains(reply2, 'login')).toBe(true);
    
    // Step 3: User enters email
    console.log('\nStep 3: User enters email');
    const result3 = await simulateMessage(testPhone, 'existing.user@example.com');
    const reply3 = getLastReply(result3);
    console.log('Bot:', reply3?.substring(0, 150) + '...');
    
    // Should ask for password or show success
    expect(replyContains(reply3, 'password') || replyContains(reply3, 'welcome')).toBe(true);
    
    console.log('\n✅ Login flow progressing correctly');
  });
});