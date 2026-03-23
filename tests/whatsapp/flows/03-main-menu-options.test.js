/**
 * Test all main menu options (1-5) functionality
 */
const { initTestApp, simulateMessage, simulateConversation, getLastReply, replyContains } = require('../helpers/simulator');
const { connectTestDB, disconnectTestDB } = require('../helpers/dbSetup');
const { VALID_PHONES, TEST_USERS, generateValidUserData } = require('../helpers/testData');

describe('WhatsApp Bot - Main Menu Options', () => {
  const testPhone = VALID_PHONES.TEST_USER;
  let testUserId;
  
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
    
    // Create a test user that's already registered and logged in
    // Use the same phone number as the WhatsApp ID
    // Note: The WhatsApp bot query looks for phone without + prefix
    const User = require('../../../models/User');
    const phoneWithoutPlus = testPhone.replace('+', '');
    const userData = generateValidUserData({ phone: phoneWithoutPlus });
    console.log('Creating user with phone:', userData.phone, 'WhatsApp ID:', testPhone);
    const user = new User(userData);
    try {
      await user.save();
      testUserId = user._id;
      console.log('✅ User created successfully');
    } catch (error) {
      console.log('❌ User creation failed:', error.message);
      if (error.errors) {
        Object.keys(error.errors).forEach(key => {
          console.log(`  ${key}:`, error.errors[key].message);
        });
      }
      throw error;
    }
    
    // Create a WhatsApp session for this user at 'done' state (logged in)
    const WhatsAppSession = require('../../../models/WhatsAppSession');
    await WhatsAppSession.create({
      waId: testPhone.replace('+', ''), // WhatsApp ID doesn't have +
      step: 'done',
      registrationData: {
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        phone: testPhone,
        password: userData.password
      },
      pendingUserId: testUserId
    });
    
    // Create a tax profile (required for main menu to show fully)
    const TaxableProfile = require('../../../models/TaxableProfile');
    await TaxableProfile.create({
      user: testUserId,
      author: testUserId,
      profileType: 'Individual',
      year: new Date().getFullYear(),
      filingStatus: 'pending_upload',
      profileId: `TEST-${Date.now()}`
    });
  });
  
  test('Option 1: My Tax Profile - shows tax profile info', async () => {
    console.log('\n=== Testing Main Menu Option 1: My Tax Profile ===\n');
    
    // First, trigger main menu by saying "Hi Taxable" (get started intent)
    const result1 = await simulateMessage(testPhone, 'Hi Taxable');
    const lastReply1 = getLastReply(result1);
    console.log('Main menu triggered:', lastReply1?.substring(0, 200) + '...');
    
    // Check if main menu is shown
    expect(replyContains(lastReply1, 'Main Menu')).toBe(true);
    expect(replyContains(lastReply1, 'My Tax Profile')).toBe(true);
    
    // Select option 1
    const result2 = await simulateMessage(testPhone, '1');
    const lastReply2 = getLastReply(result2);
    console.log('Option 1 response:', lastReply2?.substring(0, 200) + '...');
    
    // Should show tax profile information or prompt to create one
    expect(replyContains(lastReply2, 'tax') || replyContains(lastReply2, 'profile')).toBe(true);
  });
  
  test('Option 2: File / Update Taxes - initiates filing process', async () => {
    console.log('\n=== Testing Main Menu Option 2: File / Update Taxes ===\n');
    
    // Trigger main menu with "Hi Taxable"
    await simulateMessage(testPhone, 'Hi Taxable');
    
    // Select option 2
    const result = await simulateMessage(testPhone, '2');
    const lastReply = getLastReply(result);
    console.log('Option 2 response:', lastReply?.substring(0, 200) + '...');
    
    // Should initiate filing process
    expect(replyContains(lastReply, 'file') || replyContains(lastReply, 'tax') || replyContains(lastReply, 'update')).toBe(true);
  });
  
  test('Option 3: Subscribe / Manage Plan - shows subscription options', async () => {
    console.log('\n=== Testing Main Menu Option 3: Subscribe / Manage Plan ===\n');
    
    // Trigger main menu with "Hi Taxable"
    await simulateMessage(testPhone, 'Hi Taxable');
    
    // Select option 3
    const result = await simulateMessage(testPhone, '3');
    const lastReply = getLastReply(result);
    console.log('Option 3 response:', lastReply?.substring(0, 200) + '...');
    
    // Should show subscription options
    expect(replyContains(lastReply, 'subscribe') || replyContains(lastReply, 'plan') || replyContains(lastReply, 'subscription')).toBe(true);
  });
  
  test('Option 4: FAQs - shows frequently asked questions', async () => {
    console.log('\n=== Testing Main Menu Option 4: FAQs ===\n');
    
    // Trigger main menu with "Hi Taxable"
    await simulateMessage(testPhone, 'Hi Taxable');
    
    // Select option 4
    const result = await simulateMessage(testPhone, '4');
    const lastReply = getLastReply(result);
    console.log('Option 4 response:', lastReply?.substring(0, 200) + '...');
    
    // Should show FAQs
    expect(replyContains(lastReply, 'FAQ') || replyContains(lastReply, 'question') || replyContains(lastReply, 'help')).toBe(true);
  });
  
  test('Option 5: Talk to Support - initiates support conversation', async () => {
    console.log('\n=== Testing Main Menu Option 5: Talk to Support ===\n');
    
    // Trigger main menu with "Hi Taxable"
    await simulateMessage(testPhone, 'Hi Taxable');
    
    // Select option 5
    const result = await simulateMessage(testPhone, '5');
    const lastReply = getLastReply(result);
    console.log('Option 5 response:', lastReply?.substring(0, 200) + '...');
    
    // Should initiate support conversation
    expect(replyContains(lastReply, 'support') || replyContains(lastReply, 'help') || replyContains(lastReply, 'agent')).toBe(true);
  });
  
  test('Complete user journey from registration to main menu access', async () => {
    console.log('\n=== Testing Complete User Journey ===\n');
    
    // Use a fresh phone number
    const freshPhone = VALID_PHONES.WITH_COUNTRY_CODE;
    
    // Step 1: New user starts conversation
    console.log('Step 1: New user says "Hi"');
    const result1 = await simulateMessage(freshPhone, 'Hi');
    const reply1 = getLastReply(result1);
    console.log('Bot:', reply1?.substring(0, 150) + '...');
    
    // Should see welcome message
    expect(replyContains(reply1, 'welcome') || replyContains(reply1, 'Taxable')).toBe(true);
    
    // Step 2: Choose to create account (option 1)
    console.log('\nStep 2: User chooses "1" (create account)');
    const result2 = await simulateMessage(freshPhone, '1');
    const reply2 = getLastReply(result2);
    console.log('Bot:', reply2?.substring(0, 150) + '...');
    
    // Step 3: Confirm account creation
    console.log('\nStep 3: User confirms "1" (yes, let\'s go)');
    const result3 = await simulateMessage(freshPhone, '1');
    const reply3 = getLastReply(result3);
    console.log('Bot:', reply3?.substring(0, 150) + '...');
    
    // Should ask for full name
    expect(replyContains(reply3, 'name') || replyContains(reply3, 'full name')).toBe(true);
    
    // Note: Registration flow continues with name, email, phone, password, OTP
    // For this test, we'll verify the flow starts correctly
    
    console.log('\n✅ Registration flow initiated successfully');
  });
});