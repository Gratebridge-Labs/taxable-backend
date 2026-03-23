// Debug user lookup issue
const { initTestApp, simulateMessage } = require('./helpers/simulator');
const { connectTestDB, disconnectTestDB } = require('./helpers/dbSetup');
const { VALID_PHONES, generateValidUserData } = require('./helpers/testData');

describe('Debug User Lookup', () => {
  const testPhone = VALID_PHONES.TEST_USER; // +2347012345678
  
  beforeAll(async () => {
    await connectTestDB();
    initTestApp();
  });
  
  afterAll(async () => {
    await disconnectTestDB();
  });
  
  beforeEach(async () => {
    // Clear database
    const mongoose = require('mongoose');
    const collections = mongoose.connection.collections;
    for (const key in collections) {
      const collection = collections[key];
      await collection.deleteMany({});
    }
  });
  
  test('Test user lookup logic', async () => {
    console.log('\n=== Testing User Lookup Logic ===\n');
    
    // Test the waIdToPhone function from the controller
    // Need to import the whole controller and extract the function
    const controller = require('../../controllers/whatsappWebhookController');
    // waIdToPhone is not exported, let's recreate it based on the code
    function waIdToPhone(waId) {
      const digits = String(waId).replace(/\D/g, '');
      if (digits.length === 13 && digits.startsWith('234')) {
        return '0' + digits.slice(3);
      }
      if (digits.length === 11 && digits.startsWith('0')) return digits;
      if (digits.length === 10) return '0' + digits;
      return digits;
    }
    
    const waId = testPhone; // +2347012345678
    const phoneForLookup = waIdToPhone(waId);
    console.log('WhatsApp ID:', waId);
    console.log('phoneForLookup (after waIdToPhone):', phoneForLookup);
    console.log('phoneForLookup.replace(/^0/, "234"):', phoneForLookup.replace(/^0/, '234'));
    
    // Create user with phone without + (to match query logic)
    const User = require('../../models/User');
    const phoneInDb = waId.replace('+', ''); // 2347012345678
    const userData = generateValidUserData({ phone: phoneInDb });
    
    console.log('\nCreating user with phone in DB:', userData.phone);
    const user = new User(userData);
    await user.save();
    console.log('✅ User created with _id:', user._id.toString());
    
    // Now test the actual query
    const query = {
      $or: [
        { phone: phoneForLookup },
        { phone: phoneForLookup.replace(/^0/, '234') }
      ]
    };
    console.log('\nQuery:', JSON.stringify(query, null, 2));
    
    const foundUser = await User.findOne(query).select('firstName _id').lean();
    console.log('Found user:', foundUser ? `Yes (_id: ${foundUser._id})` : 'No');
    
    // Also test the exact query from the controller
    const regUser = await User.findOne({ $or: [{ phone: phoneForLookup }, { phone: phoneForLookup.replace(/^0/, '234') }] }).select('firstName _id').lean();
    console.log('regUser (from controller query):', regUser ? `Yes (_id: ${regUser._id})` : 'No');
    
    expect(regUser).not.toBeNull();
    expect(regUser._id.toString()).toBe(user._id.toString());
  });
  
  test('Test complete flow with session', async () => {
    console.log('\n=== Testing Complete Flow ===\n');
    
    // Create user
    const User = require('../../models/User');
    const phoneInDb = testPhone.replace('+', ''); // 2347012345678
    const userData = generateValidUserData({ phone: phoneInDb });
    const user = new User(userData);
    await user.save();
    
    // Create WhatsApp session
    const WhatsAppSession = require('../../models/WhatsAppSession');
    await WhatsAppSession.create({
      waId: testPhone.replace('+', ''), // WhatsApp ID without +
      step: 'done',
      registrationData: {
        firstName: userData.firstName,
        lastName: userData.lastName,
        email: userData.email,
        phone: testPhone,
        password: userData.password
      },
      pendingUserId: user._id
    });
    
    // Also create a tax profile (might be required for main menu)
    const TaxableProfile = require('../../models/TaxableProfile');
    // Check the schema first
    const profileData = {
      user: user._id,
      year: new Date().getFullYear(),
      filingStatus: 'pending_upload', // Valid enum value
      profileId: `TEST-${Date.now()}`,
      author: user._id, // Required field
      profileType: 'Individual' // Valid enum value (capital I)
    };
    console.log('Creating tax profile with data:', {
      ...profileData,
      user: profileData.user.toString(),
      author: profileData.author.toString()
    });
    await TaxableProfile.create(profileData);
    
    console.log('✅ Created user, session, and tax profile');
    
    // Now send a message
    const result = await simulateMessage(testPhone, 'Hi');
    console.log('\nBot reply:', result.replies[0]?.substring(0, 200) + '...');
    
    // Check what we got
    if (result.replies[0]?.includes('Welcome to Taxable')) {
      console.log('❌ Got welcome message (user not found or not registered)');
    } else if (result.replies[0]?.includes('Main Menu')) {
      console.log('✅ Got main menu!');
    } else {
      console.log('Got other message');
    }
  });
});