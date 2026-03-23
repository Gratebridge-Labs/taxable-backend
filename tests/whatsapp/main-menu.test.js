// Test to see the actual main menu structure
const { initTestApp, simulateMessage, getLastReply, replyContains } = require('./helpers/simulator');
const { connectTestDB, disconnectTestDB, seedTestData } = require('./helpers/dbSetup');

describe('WhatsApp Bot - Main Menu Structure', () => {
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
  
  test('Main menu for new user (no tax profile)', async () => {
    console.log('\n=== TESTING MAIN MENU FOR NEW USER ===\n');
    
    // Create a registered user without tax profile
    const user = await seedTestData.createRegisteredUser({
      firstName: 'John',
      lastName: 'Doe',
      email: 'john@test.com',
      phone: testPhone,
      emailVerified: true
    });
    
    // Create WhatsApp session for this user
    await seedTestData.createWhatsAppSession({
      phoneNumber: testPhone,
      userId: user._id,
      step: 'done'
    });
    
    // User says "Hi Taxable" - should go straight to main menu
    const result = await simulateMessage(testPhone, 'Hi Taxable');
    
    console.log('Main Menu Response:');
    console.log('='.repeat(50));
    console.log(getLastReply(result));
    console.log('='.repeat(50));
    
    // Verify main menu structure
    expect(replyContains(getLastReply(result), 'Hi John')).toBeTruthy();
    expect(replyContains(getLastReply(result), 'Main Menu')).toBeTruthy();
    expect(replyContains(getLastReply(result), '1️⃣ My Tax Profile')).toBeTruthy();
    expect(replyContains(getLastReply(result), '2️⃣ File / Update Taxes')).toBeTruthy();
    expect(replyContains(getLastReply(result), '3️⃣ Subscribe / Manage Plan')).toBeTruthy();
    expect(replyContains(getLastReply(result), '4️⃣ FAQs')).toBeTruthy();
    expect(replyContains(getLastReply(result), '5️⃣ Talk to Support')).toBeTruthy();
    
    // Should NOT show tax year/filing status for new user
    expect(replyContains(getLastReply(result), 'Tax year:')).toBeFalsy();
    expect(replyContains(getLastReply(result), 'Filing status:')).toBeFalsy();
    
    console.log('\n✓ Main menu for new user is correct\n');
  });
  
  test('Main menu for user WITH tax profile', async () => {
    console.log('\n=== TESTING MAIN MENU FOR USER WITH TAX PROFILE ===\n');
    
    // Create a registered user
    const user = await seedTestData.createRegisteredUser({
      firstName: 'Jane',
      lastName: 'Taxpayer',
      email: 'jane@test.com',
      phone: testPhone,
      emailVerified: true
    });
    
    // Create tax profile for the user
    await seedTestData.createTaxProfile({
      userId: user._id,
      year: 2025,
      nin: '12345678901',
      annualIncome: 5000000,
      filingPreference: 'annual',
      stateOfResidence: 'Lagos',
      status: 'draft'
    });
    
    // Create WhatsApp session
    await seedTestData.createWhatsAppSession({
      phoneNumber: testPhone,
      userId: user._id,
      step: 'done'
    });
    
    // User says "Hi Taxable"
    const result = await simulateMessage(testPhone, 'Hi Taxable');
    
    console.log('Main Menu Response (with tax profile):');
    console.log('='.repeat(50));
    console.log(getLastReply(result));
    console.log('='.repeat(50));
    
    // Verify main menu structure
    expect(replyContains(getLastReply(result), 'Hi Jane')).toBeTruthy();
    expect(replyContains(getLastReply(result), 'Main Menu')).toBeTruthy();
    
    // Should show tax year for user with profile
    expect(replyContains(getLastReply(result), 'Tax year:')).toBeTruthy();
    expect(replyContains(getLastReply(result), '2025')).toBeTruthy();
    
    // Should show filing status
    expect(replyContains(getLastReply(result), 'Filing status:')).toBeTruthy();
    
    // Main menu options should still be present
    expect(replyContains(getLastReply(result), '1️⃣ My Tax Profile')).toBeTruthy();
    expect(replyContains(getLastReply(result), '2️⃣ File / Update Taxes')).toBeTruthy();
    expect(replyContains(getLastReply(result), '3️⃣ Subscribe / Manage Plan')).toBeTruthy();
    expect(replyContains(getLastReply(result), '4️⃣ FAQs')).toBeTruthy();
    expect(replyContains(getLastReply(result), '5️⃣ Talk to Support')).toBeTruthy();
    
    console.log('\n✓ Main menu for user with tax profile is correct\n');
  });
  
  test('Main menu navigation options', async () => {
    console.log('\n=== TESTING MAIN MENU NAVIGATION ===\n');
    
    // Create a registered user
    const user = await seedTestData.createRegisteredUser({
      firstName: 'Mike',
      lastName: 'User',
      email: 'mike@test.com',
      phone: testPhone,
      emailVerified: true
    });
    
    await seedTestData.createWhatsAppSession({
      phoneNumber: testPhone,
      userId: user._id,
      step: 'done'
    });
    
    // Get to main menu
    await simulateMessage(testPhone, 'Hi Taxable');
    
    console.log('Testing menu option 1: My Tax Profile');
    const result1 = await simulateMessage(testPhone, '1');
    console.log('Response to "1":', getLastReply(result1)?.substring(0, 150) + '...');
    expect(result1.replies.length).toBeGreaterThan(0);
    
    // Go back to main menu
    const resultBack = await simulateMessage(testPhone, 'Back');
    console.log('Response to "Back":', getLastReply(resultBack)?.substring(0, 100) + '...');
    expect(replyContains(getLastReply(resultBack), 'Main Menu')).toBeTruthy();
    
    console.log('\nTesting menu option 2: File / Update Taxes');
    const result2 = await simulateMessage(testPhone, '2');
    console.log('Response to "2":', getLastReply(result2)?.substring(0, 150) + '...');
    expect(result2.replies.length).toBeGreaterThan(0);
    
    console.log('\nTesting menu option 3: Subscribe / Manage Plan');
    const result3 = await simulateMessage(testPhone, '3');
    console.log('Response to "3":', getLastReply(result3)?.substring(0, 150) + '...');
    expect(result3.replies.length).toBeGreaterThan(0);
    
    console.log('\nTesting menu option 4: FAQs');
    const result4 = await simulateMessage(testPhone, '4');
    console.log('Response to "4":', getLastReply(result4)?.substring(0, 150) + '...');
    expect(result4.replies.length).toBeGreaterThan(0);
    
    console.log('\nTesting menu option 5: Talk to Support');
    const result5 = await simulateMessage(testPhone, '5');
    console.log('Response to "5":', getLastReply(result5)?.substring(0, 150) + '...');
    expect(result5.replies.length).toBeGreaterThan(0);
    
    console.log('\n✓ All main menu options are functional\n');
  });
  
  test('Natural language commands for main menu', async () => {
    console.log('\n=== TESTING NATURAL LANGUAGE MENU COMMANDS ===\n');
    
    // Create a registered user
    const user = await seedTestData.createRegisteredUser({
      firstName: 'Sarah',
      lastName: 'User',
      email: 'sarah@test.com',
      phone: testPhone,
      emailVerified: true
    });
    
    await seedTestData.createWhatsAppSession({
      phoneNumber: testPhone,
      userId: user._id,
      step: 'done'
    });
    
    // Get to main menu
    await simulateMessage(testPhone, 'Hi Taxable');
    
    const naturalCommands = [
      'menu',
      'Menu',
      'MENU',
      'show menu',
      'main menu',
      'Main Menu',
      'go to menu',
      'back to menu',
      'back to main menu'
    ];
    
    for (const command of naturalCommands) {
      const result = await simulateMessage(testPhone, command);
      console.log(`Command: "${command}" → Shows main menu: ${replyContains(getLastReply(result), 'Main Menu') ? '✓' : '✗'}`);
      expect(replyContains(getLastReply(result), 'Main Menu')).toBeTruthy();
    }
    
    console.log('\n✓ Natural language menu commands work\n');
  });
});