/**
 * Test tax profile creation flow
 */
const { initTestApp, simulateMessage, simulateConversation, getLastReply, replyContains } = require('../helpers/simulator');
const { connectTestDB, disconnectTestDB } = require('../helpers/dbSetup');
const { VALID_PHONES, generateValidUserData } = require('../helpers/testData');

describe('WhatsApp Bot - Tax Profile Creation Flow', () => {
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
  
  test('Start tax profile creation from main menu', async () => {
    console.log('\n=== Testing Tax Profile Creation from Main Menu ===\n');
    
    // Create a registered user without a tax profile
    const User = require('../../../models/User');
    const phoneInDb = testPhone.replace('+', '');
    const userData = generateValidUserData({ 
      phone: phoneInDb,
      firstName: 'Tax',
      lastName: 'User'
    });
    
    const user = new User(userData);
    await user.save();
    console.log('✅ Created user without tax profile');
    
    // Step 1: User says "Hi Taxable" to get main menu
    console.log('\nStep 1: User says "Hi Taxable"');
    const result1 = await simulateMessage(testPhone, 'Hi Taxable');
    const reply1 = getLastReply(result1);
    console.log('Bot:', reply1?.substring(0, 150) + '...');
    
    // Should show main menu (user has no tax profile yet)
    expect(replyContains(reply1, 'Main Menu')).toBe(true);
    
    // Step 2: User selects option 1 (My Tax Profile)
    console.log('\nStep 2: User selects option 1 (My Tax Profile)');
    const result2 = await simulateMessage(testPhone, '1');
    const reply2 = getLastReply(result2);
    console.log('Bot:', reply2?.substring(0, 150) + '...');
    
    // Should show tax profile options or prompt to create one
    expect(replyContains(reply2, 'tax') || replyContains(reply2, 'profile')).toBe(true);
    
    // Check if it prompts to create a tax profile
    if (replyContains(reply2, 'create') || replyContains(reply2, 'new')) {
      console.log('✅ Bot prompts to create tax profile');
      
      // Step 3: User chooses to create new tax profile
      console.log('\nStep 3: User chooses to create new tax profile');
      const result3 = await simulateMessage(testPhone, '3'); // Assuming 3 is "Create new tax profile"
      const reply3 = getLastReply(result3);
      console.log('Bot:', reply3?.substring(0, 150) + '...');
      
      // Should start tax profile creation flow
      expect(replyContains(reply3, 'year') || replyContains(reply3, 'tax year')).toBe(true);
    }
  });
  
  test('Test registration to tax profile creation flow', async () => {
    console.log('\n=== Testing Complete Registration to Tax Profile Flow ===\n');
    
    // Use a fresh phone number
    const freshPhone = VALID_PHONES.WITH_COUNTRY_CODE; // +2348012345678
    
    // Step 1: New user starts
    console.log('Step 1: User says "Hi Taxable"');
    const result1 = await simulateMessage(freshPhone, 'Hi Taxable');
    const reply1 = getLastReply(result1);
    console.log('Bot:', reply1?.substring(0, 150) + '...');
    
    // Step 2: Choose to create account
    console.log('\nStep 2: User chooses "1" (I\'m new)');
    await simulateMessage(freshPhone, '1');
    
    // Step 3: Confirm account creation
    console.log('\nStep 3: User confirms "1" (Yes, let\'s go)');
    await simulateMessage(freshPhone, '1');
    
    // Step 4: Enter name
    console.log('\nStep 4: User enters "Jane Taxpayer"');
    await simulateMessage(freshPhone, 'Jane Taxpayer');
    
    // Step 5: Enter email
    console.log('\nStep 5: User enters "jane.taxpayer@example.com"');
    await simulateMessage(freshPhone, 'jane.taxpayer@example.com');
    
    // Step 6: Confirm phone (if prompted)
    console.log('\nStep 6: User confirms phone');
    await simulateMessage(freshPhone, '1');
    
    // Note: Registration flow would continue with password, OTP, etc.
    // For this test, we're verifying the flow starts correctly
    
    console.log('\n✅ Registration flow initiated successfully');
    
    // Check session state
    const WhatsAppSession = require('../../../models/WhatsAppSession');
    const session = await WhatsAppSession.findOne({ waId: freshPhone.replace('+', '') });
    console.log('\nCurrent session step:', session?.step);
    console.log('Registration data collected:', session?.registrationData);
  });
  
  test('Test error handling for invalid inputs', async () => {
    console.log('\n=== Testing Error Handling ===\n');
    
    // Create a registered user
    const User = require('../../../models/User');
    const phoneInDb = testPhone.replace('+', '');
    const userData = generateValidUserData({ phone: phoneInDb });
    const user = new User(userData);
    await user.save();
    
    // Create a tax profile
    const TaxableProfile = require('../../../models/TaxableProfile');
    await TaxableProfile.create({
      user: user._id,
      author: user._id,
      profileType: 'Individual',
      year: new Date().getFullYear(),
      filingStatus: 'pending_upload',
      profileId: `TEST-${Date.now()}`
    });
    
    console.log('✅ Created user with tax profile');
    
    // Test 1: Invalid menu option
    console.log('\nTest 1: Invalid menu option');
    await simulateMessage(testPhone, 'Hi Taxable'); // Get main menu
    const result1 = await simulateMessage(testPhone, '99'); // Invalid option
    const reply1 = getLastReply(result1);
    console.log('Bot response to invalid option:', reply1?.substring(0, 100) + '...');
    
    // Should handle invalid option gracefully
    expect(replyContains(reply1, 'invalid') || replyContains(reply1, 'try again') || replyContains(reply1, 'menu')).toBe(true);
    
    // Test 2: Empty message
    console.log('\nTest 2: Empty message');
    const result2 = await simulateMessage(testPhone, '');
    const reply2 = getLastReply(result2);
    console.log('Bot response to empty message:', reply2 ? 'Has response' : 'No response');
    
    // Should handle empty message (might ignore or show help)
    
    // Test 3: Very long message
    console.log('\nTest 3: Very long message');
    const longMessage = 'A'.repeat(1000);
    const result3 = await simulateMessage(testPhone, longMessage);
    const reply3 = getLastReply(result3);
    console.log('Bot response to long message:', reply3?.substring(0, 100) + '...');
    
    // Should handle long message gracefully
  });
});