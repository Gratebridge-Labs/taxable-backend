const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');

let mongoServer;

/**
 * Connect to in-memory MongoDB for testing
 */
const connectTestDB = async () => {
  mongoServer = await MongoMemoryServer.create();
  const mongoUri = mongoServer.getUri();
  
  await mongoose.connect(mongoUri, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  
  console.log(`[TEST] Connected to in-memory MongoDB at ${mongoUri}`);
};

/**
 * Clear all collections in the test database
 */
const clearDatabase = async () => {
  const collections = mongoose.connection.collections;
  
  for (const key in collections) {
    const collection = collections[key];
    await collection.deleteMany({});
  }
};

/**
 * Disconnect from test database and stop server
 */
const disconnectTestDB = async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
  console.log('[TEST] Disconnected from in-memory MongoDB');
};

/**
 * Seed test data for specific scenarios
 */
const seedTestData = {
  /**
   * Create a registered user with verified email
   */
  createRegisteredUser: async (data = {}) => {
    const User = require('../../../models/User');
    
    const user = new User({
      firstName: data.firstName || 'John',
      lastName: data.lastName || 'Doe',
      email: data.email || 'john@test.com',
      phone: data.phone || data.phoneNumber || '+2348123456789',
      password: data.password || '$2b$10$fakehashforpasswordtesting', // "Password1"
      emailVerified: data.emailVerified !== undefined ? data.emailVerified : true,
      createdAt: new Date()
    });
    
    await user.save();
    return user;
  },
  
  /**
   * Create a WhatsApp session for a user
   */
  createWhatsAppSession: async (data = {}) => {
    const WhatsAppSession = require('../../../models/WhatsAppSession');
    
    const session = new WhatsAppSession({
      waId: data.waId || data.phoneNumber?.replace('+', '') || '2348123456789',
      phoneNumber: data.phoneNumber || '+2348123456789',
      userId: data.userId || null,
      step: data.step || 'entry',
      flow: data.flow || null,
      data: data.data || {},
      lastInteraction: new Date()
    });
    
    await session.save();
    return session;
  },
  
  /**
   * Create a tax profile for a user
   */
  createTaxProfile: async (data = {}) => {
    const TaxableProfile = require('../../../models/TaxableProfile');
    
    const profile = new TaxableProfile({
      user: data.userId,
      author: data.userId,
      profileType: data.profileType || 'Individual',
      year: data.year || 2025,
      nin: data.nin || '12345678901',
      annualIncome: data.annualIncome || 5000000,
      filingPreference: data.filingPreference || 'annual',
      stateOfResidence: data.stateOfResidence || 'Lagos',
      isResident: data.isResident !== undefined ? data.isResident : true,
      monthlyRent: data.monthlyRent || 50000,
      healthInsuranceAmount: data.healthInsuranceAmount || 100000,
      pensionContribution: data.pensionContribution || 200000,
      mortgageInterest: data.mortgageInterest || 0,
      status: data.status || 'draft',
      createdAt: new Date()
    });
    
    await profile.save();
    return profile;
  },
  
  /**
   * Create an OTP for a user
   */
  createOTP: async (data = {}) => {
    const OTP = require('../../../models/OTP');
    
    const otp = new OTP({
      userId: data.userId,
      code: data.code || '123456',
      type: data.type || 'email_verification',
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
      used: false
    });
    
    await otp.save();
    return otp;
  }
};

module.exports = {
  connectTestDB,
  clearDatabase,
  disconnectTestDB,
  seedTestData
};