const { simulateMessage, simulateConversation, getLastReply, replyContains } = require('../helpers/simulator');
const { seedTestData } = require('../helpers/dbSetup');

describe('Login Flow', () => {
  const testPhone = '+2348123456789';
  
  beforeEach(async () => {
    // Create a registered user for login tests
    await seedTestData.createRegisteredUser({
      email: 'john@test.com',
      phoneNumber: '+234876543210', // Different phone, user hasn't linked this WhatsApp yet
      password: '$2b$10$fakehashforpasswordtesting' // "Password1"
    });
  });
  
  test('Existing user logs in successfully', async () => {
    // Start conversation
    const result1 = await simulateMessage(testPhone, 'Hi Taxable');
    expect(replyContains(getLastReply(result1), 'Welcome')).toBeTruthy();
    
    // Choose login option
    const result2 = await simulateMessage(testPhone, '2');
    expect(replyContains(getLastReply(result2), 'email')).toBeTruthy();
    
    // Enter email
    const result3 = await simulateMessage(testPhone, 'john@test.com');
    expect(replyContains(getLastReply(result3), 'password')).toBeTruthy();
    
    // Enter password
    const result4 = await simulateMessage(testPhone, 'Password1');
    expect(replyContains(getLastReply(result4), 'successfully')).toBeTruthy();
    expect(replyContains(getLastReply(result4), 'logged in')).toBeTruthy();
    
    // Should show main menu
    expect(replyContains(getLastReply(result4), 'menu')).toBeTruthy();
    
    // Check session is at "done" state and linked to user
    expect(result4.session).toBeTruthy();
    expect(result4.session.step).toBe('done');
    expect(result4.session.userId).toBeTruthy();
    
    // Check user's phone number was updated
    const User = require('../../../models/User');
    const user = await User.findOne({ email: 'john@test.com' });
    expect(user.phoneNumber).toBe(testPhone);
  });
  
  test('Login with wrong email shows error', async () => {
    await simulateMessage(testPhone, 'Hi Taxable');
    await simulateMessage(testPhone, '2');
    
    const result = await simulateMessage(testPhone, 'wrong@test.com');
    expect(replyContains(getLastReply(result), 'not found')).toBeTruthy();
    expect(replyContains(getLastReply(result), 'try again')).toBeTruthy();
    
    // Should allow retry with correct email
    const result2 = await simulateMessage(testPhone, 'john@test.com');
    expect(replyContains(getLastReply(result2), 'password')).toBeTruthy();
  });
  
  test('Login with wrong password shows error', async () => {
    await simulateMessage(testPhone, 'Hi Taxable');
    await simulateMessage(testPhone, '2');
    await simulateMessage(testPhone, 'john@test.com');
    
    const result = await simulateMessage(testPhone, 'WrongPassword');
    expect(replyContains(getLastReply(result), 'incorrect')).toBeTruthy();
    expect(replyContains(getLastReply(result), 'password')).toBeTruthy();
    
    // Should allow retry with correct password
    const result2 = await simulateMessage(testPhone, 'Password1');
    expect(replyContains(getLastReply(result2), 'successfully')).toBeTruthy();
  });
  
  test('Login with unverified email prompts for verification', async () => {
    // Create user with unverified email
    const user = await seedTestData.createRegisteredUser({
      email: 'unverified@test.com',
      emailVerified: false
    });
    
    await simulateMessage(testPhone, 'Hi Taxable');
    await simulateMessage(testPhone, '2');
    await simulateMessage(testPhone, 'unverified@test.com');
    await simulateMessage(testPhone, 'Password1');
    
    const result = await simulateMessage(testPhone, '123456');
    expect(replyContains(getLastReply(result), 'verified')).toBeTruthy();
    expect(replyContains(getLastReply(result), 'successfully')).toBeTruthy();
    
    // Check user is now verified
    const User = require('../../../models/User');
    const updatedUser = await User.findById(user._id);
    expect(updatedUser.emailVerified).toBe(true);
  });
  
  test('Returning user goes straight to main menu', async () => {
    // Create user already linked to this WhatsApp
    const user = await seedTestData.createRegisteredUser({
      email: 'john@test.com',
      phoneNumber: testPhone, // Same phone number
      emailVerified: true
    });
    
    // Create session for this user
    await seedTestData.createWhatsAppSession({
      phoneNumber: testPhone,
      userId: user._id,
      step: 'done'
    });
    
    // User says "Hi Taxable"
    const result = await simulateMessage(testPhone, 'Hi Taxable');
    
    // Should go straight to main menu (not show welcome options)
    expect(replyContains(getLastReply(result), 'menu')).toBeTruthy();
    expect(replyContains(getLastReply(result), 'Welcome')).toBeFalsy();
    expect(replyContains(getLastReply(result), 'create account')).toBeFalsy();
    expect(replyContains(getLastReply(result), 'login')).toBeFalsy();
    
    // Check session is still at "done"
    expect(result.session.step).toBe('done');
  });
  
  test('User can switch accounts by logging in with different email', async () => {
    // Create first user linked to this WhatsApp
    const user1 = await seedTestData.createRegisteredUser({
      email: 'user1@test.com',
      phoneNumber: testPhone,
      firstName: 'User1'
    });
    
    await seedTestData.createWhatsAppSession({
      phoneNumber: testPhone,
      userId: user1._id,
      step: 'done'
    });
    
    // Create second user (not linked yet)
    const user2 = await seedTestData.createRegisteredUser({
      email: 'user2@test.com',
      phoneNumber: '+234876543210',
      firstName: 'User2',
      password: '$2b$10$fakehashforpasswordtesting'
    });
    
    // User1 is currently logged in, sends "Menu"
    await simulateMessage(testPhone, 'Menu');
    
    // Choose login option (switch account)
    await simulateMessage(testPhone, '2');
    await simulateMessage(testPhone, 'user2@test.com');
    await simulateMessage(testPhone, 'Password1');
    
    const result = await simulateMessage(testPhone, 'Menu');
    
    // Should now be user2
    expect(replyContains(getLastReply(result), 'menu')).toBeTruthy();
    
    // Check session is linked to user2
    const WhatsAppSession = require('../../../models/WhatsAppSession');
    const session = await WhatsAppSession.findOne({ phoneNumber: testPhone });
    expect(session.userId.toString()).toBe(user2._id.toString());
    
    // Check user2's phone was updated
    const User = require('../../../models/User');
    const updatedUser2 = await User.findById(user2._id);
    expect(updatedUser2.phoneNumber).toBe(testPhone);
  });
});