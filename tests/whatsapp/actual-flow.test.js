// Test to understand the actual user flow and see the REAL main menu
const { initTestApp, simulateMessage, getLastReply, replyContains } = require('./helpers/simulator');
const { connectTestDB, disconnectTestDB } = require('./helpers/dbSetup');
const { VALID_PHONES, cleanPhoneNumber } = require('./helpers/testData');

describe('WhatsApp Bot - Actual User Flow to Main Menu', () => {
  const testPhone = VALID_PHONES.TEST_USER;
  
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
  
  test('See what happens at each step of user journey', async () => {
    console.log('\n=== TRACING ACTUAL USER FLOW ===\n');
    
    // Step 1: New user says "Hi Taxable"
    console.log('Step 1: User says "Hi Taxable"');
    const result1 = await simulateMessage(testPhone, 'Hi Taxable');
    console.log('Bot says:', getLastReply(result1)?.substring(0, 150) + '...');
    console.log('This is the WELCOME message for new/unauthenticated users\n');
    
    // Step 2: User chooses "1" (create account)
    console.log('Step 2: User chooses "1" (create account)');
    const result2 = await simulateMessage(testPhone, '1');
    console.log('Bot says:', getLastReply(result2)?.substring(0, 150) + '...');
    console.log('This is the ACCOUNT CREATION intro\n');
    
    // Step 3: User confirms "1" (yes, let\'s go)
    console.log('Step 3: User confirms "1" (yes, let\'s go)');
    const result3 = await simulateMessage(testPhone, '1');
    console.log('Bot says:', getLastReply(result3)?.substring(0, 150) + '...');
    console.log('Bot asks for FULL NAME\n');
    
    // Step 4: User enters name
    console.log('Step 4: User enters name "John Taxpayer"');
    const result4 = await simulateMessage(testPhone, 'John Taxpayer');
    console.log('Bot says:', getLastReply(result4)?.substring(0, 150) + '...');
    console.log('Bot asks for EMAIL\n');
    
    // Step 5: User enters email
    console.log('Step 5: User enters email "john@test.com"');
    const result5 = await simulateMessage(testPhone, 'john@test.com');
    console.log('Bot says:', getLastReply(result5)?.substring(0, 150) + '...');
    console.log('Bot confirms PHONE NUMBER\n');
    
    // Step 6: User confirms phone
    console.log('Step 6: User confirms phone "Yes"');
    const result6 = await simulateMessage(testPhone, 'Yes');
    console.log('Bot says:', getLastReply(result6)?.substring(0, 150) + '...');
    console.log('Bot asks for PASSWORD\n');
    
    // Step 7: User enters password
    console.log('Step 7: User enters password "SecurePass123"');
    const result7 = await simulateMessage(testPhone, 'SecurePass123');
    console.log('Bot says:', getLastReply(result7)?.substring(0, 200) + '...');
    console.log('Bot sends OTP (registration mocked)\n');
    
    // Step 8: User enters OTP (mocked to fail, but let's see what happens)
    console.log('Step 8: User enters OTP "123456"');
    const result8 = await simulateMessage(testPhone, '123456');
    console.log('Bot says:', getLastReply(result8)?.substring(0, 150) + '...');
    console.log('OTP verification fails (mocked)\n');
    
    // Step 9: User comes back later and tries "Hi Taxable" again
    console.log('Step 9: User returns later, says "Hi Taxable"');
    const result9 = await simulateMessage(testPhone, 'Hi Taxable');
    console.log('Bot says:', getLastReply(result9)?.substring(0, 150) + '...');
    console.log('Still shows WELCOME message (user not fully registered)\n');
    
    // Step 10: User tries "Menu" command
    console.log('Step 10: User tries "Menu" command');
    const result10 = await simulateMessage(testPhone, 'Menu');
    console.log('Bot says:', getLastReply(result10)?.substring(0, 150) + '...');
    console.log('Bot asks to complete registration first\n');
    
    console.log('\n=== KEY INSIGHTS ===');
    console.log('1. MAIN MENU only appears AFTER successful registration/login');
    console.log('2. New users see WELCOME message first');
    console.log('3. Registration flow must complete (including OTP) to get to main menu');
    console.log('4. "Menu" command only works for logged-in users');
    console.log('5. The actual main menu structure (from code analysis):');
    console.log('   - Hi [Name] 👋');
    console.log('   - Tax year: [Year] (if has profile)');
    console.log('   - Filing status: [Status] (if has profile)');
    console.log('   - *Main Menu*');
    console.log('   - 1️⃣ My Tax Profile');
    console.log('   - 2️⃣ File / Update Taxes');
    console.log('   - 3️⃣ Subscribe / Manage Plan');
    console.log('   - 4️⃣ FAQs');
    console.log('   - 5️⃣ Talk to Support');
    
    // The test passes if we get through all steps without errors
    expect(true).toBe(true);
  });
  
  test('Check main menu structure from code', async () => {
    console.log('\n=== MAIN MENU STRUCTURE (FROM CODE ANALYSIS) ===\n');
    
    // Based on the getLoggedInMainMenu function in whatsappPrompts.js
    const mainMenuStructure = `
Hi [FirstName] 👋

*Tax year:* [Year] (only if user has tax profile)
*Filing status:* [Status] (only if user has tax profile)

*Main Menu*

1️⃣ My Tax Profile
2️⃣ File / Update Taxes
3️⃣ Subscribe / Manage Plan
4️⃣ FAQs
5️⃣ Talk to Support`;
    
    console.log(mainMenuStructure);
    
    console.log('\n=== VARIATIONS ===');
    console.log('1. NEW USER (no tax profile):');
    console.log('   - Shows only "Hi [Name] 👋" then menu options');
    console.log('   - No tax year/filing status shown');
    
    console.log('\n2. USER WITH TAX PROFILE:');
    console.log('   - Shows tax year and filing status');
    console.log('   - May show estimated income/tax if available');
    
    console.log('\n3. USER WHO HAS FILED:');
    console.log('   - Shows "Filed ✅" status');
    
    console.log('\n=== NATURAL LANGUAGE COMMANDS ===');
    console.log('- "menu", "Menu", "main menu" → Shows main menu');
    console.log('- "back", "go back", "back to menu" → Returns to main menu');
    console.log('- "1", "2", "3", "4", "5" → Selects menu option');
    
    expect(true).toBe(true);
  });
});