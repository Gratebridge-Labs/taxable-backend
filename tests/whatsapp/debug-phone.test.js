// Debug phone number validation
const { connectTestDB, disconnectTestDB } = require('./helpers/dbSetup');

describe('Debug Phone Validation', () => {
  beforeAll(async () => {
    await connectTestDB();
  });
  
  afterAll(async () => {
    await disconnectTestDB();
  });
  
  test('Test phone validation directly', async () => {
    const User = require('../../models/User');
    
    // Test 1: Create user with valid phone
    const user1 = new User({
      firstName: 'Test',
      lastName: 'User',
      email: 'test@example.com',
      phone: '+2347012345678',
      password: 'Password123!'
    });
    
    try {
      await user1.save();
      console.log('✅ User 1 saved successfully');
    } catch (error) {
      console.log('❌ User 1 error:', error.message);
      console.log('Validation errors:', error.errors);
    }
    
    // Test 2: Create user with phone without +
    const user2 = new User({
      firstName: 'Test2',
      lastName: 'User2',
      email: 'test2@example.com',
      phone: '2347012345678',
      password: 'Password123!'
    });
    
    try {
      await user2.save();
      console.log('✅ User 2 saved successfully');
    } catch (error) {
      console.log('❌ User 2 error:', error.message);
      console.log('Validation errors:', error.errors);
    }
    
    // Test 3: Create user with local format
    const user3 = new User({
      firstName: 'Test3',
      lastName: 'User3',
      email: 'test3@example.com',
      phone: '08012345678',
      password: 'Password123!'
    });
    
    try {
      await user3.save();
      console.log('✅ User 3 saved successfully');
    } catch (error) {
      console.log('❌ User 3 error:', error.message);
      console.log('Validation errors:', error.errors);
    }
    
    // Test the regex directly
    const regex = /^(\+?234[\s-]?)?[0-9]{3}[\s-]?[0-9]{3}[\s-]?[0-9]{4}$|^0?[0-9]{10}$/;
    console.log('\nRegex tests:');
    console.log('+2347012345678 =>', regex.test('+2347012345678'));
    console.log('2347012345678  =>', regex.test('2347012345678'));
    console.log('08012345678    =>', regex.test('08012345678'));
    console.log('07012345678    =>', regex.test('07012345678'));
  });
});