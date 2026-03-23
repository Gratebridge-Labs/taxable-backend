/**
 * Test data helpers with proper schema validation
 */

/**
 * Valid Nigerian phone numbers for testing
 */
const VALID_PHONES = {
  // Format: +2348012345678 (with country code and +) - 10 digits after +234
  WITH_COUNTRY_CODE: '+2348012345678',
  // Format: 08012345678 (without country code) - 11 digits starting with 0
  WITHOUT_COUNTRY_CODE: '08012345678',
  // Format: +234 801 234 5678 (with spaces)
  WITH_SPACES: '+234 801 234 5678',
  // Test user (with +) - 10 digits after +234
  TEST_USER: '+2347012345678'
};

/**
 * Valid test user data
 */
const TEST_USERS = {
  NEW_USER: {
    firstName: 'John',
    lastName: 'Doe',
    email: 'john.doe@example.com',
    phone: VALID_PHONES.TEST_USER,
    password: 'Password123!',
    emailVerified: true
  },
  EXISTING_USER: {
    firstName: 'Jane',
    lastName: 'Smith',
    email: 'jane.smith@example.com',
    phone: '+2347023456789',
    password: 'SecurePass456!',
    emailVerified: true
  }
};

/**
 * Clean phone number for WhatsApp ID (remove + and spaces)
 */
const cleanPhoneNumber = (phone) => {
  return phone.replace(/[+\s-]/g, '');
};

/**
 * Format phone number for User model
 * Note: The WhatsApp bot query looks for phone without + prefix in some cases
 * For testing, we should store without + to match the query logic
 */
const formatPhoneForUser = (phone) => {
  // Remove + prefix for consistency with WhatsApp bot query logic
  return phone.replace(/^\+/, '');
};

/**
 * Generate valid test data for user creation
 */
const generateValidUserData = (overrides = {}) => {
  // Generate a valid 10-digit Nigerian phone number (after +234)
  const randomDigits = Math.floor(Math.random() * 10000000000).toString().padStart(10, '0');
  const baseData = {
    firstName: 'Test',
    lastName: 'User',
    email: `test.user.${Date.now()}@example.com`,
    phone: `+234${randomDigits}`,
    password: 'TestPass123!',
    emailVerified: true,
    ...overrides
  };
  
  // Ensure phone is properly formatted for User model
  baseData.phone = formatPhoneForUser(baseData.phone);
  
  return baseData;
};

/**
 * Generate valid WhatsApp webhook payload
 */
const generateWhatsAppPayload = (phoneNumber, messageText) => {
  const cleanPhone = cleanPhoneNumber(phoneNumber);
  
  return {
    object: 'whatsapp_business_account',
    entry: [{
      id: 'test-entry-id',
      changes: [{
        value: {
          messaging_product: 'whatsapp',
          metadata: {
            display_phone_number: '15555555555',
            phone_number_id: 'test-phone-id'
          },
          contacts: [{
            profile: {
              name: 'Test User'
            },
            wa_id: cleanPhone
          }],
          messages: [{
            from: cleanPhone,
            id: `test-message-${Date.now()}`,
            timestamp: Math.floor(Date.now() / 1000),
            type: 'text',
            text: {
              body: messageText
            }
          }]
        },
        field: 'messages'
      }]
    }]
  };
};

module.exports = {
  VALID_PHONES,
  TEST_USERS,
  cleanPhoneNumber,
  generateValidUserData,
  generateWhatsAppPayload
};