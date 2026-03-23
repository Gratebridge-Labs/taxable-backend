// Mock all external services before they're imported by the controller
jest.mock('../../../services/whatsappService', () => {
  const mockReplies = [];
  const mockImages = [];
  
  return {
    sendTextMessage: jest.fn((phoneNumber, message) => {
      console.log(`[MOCK] sendTextMessage to ${phoneNumber}: ${message.substring(0, 100)}...`);
      mockReplies.push({ phoneNumber, message, type: 'text' });
      return Promise.resolve({ success: true });
    }),
    sendImage: jest.fn((phoneNumber, imageUrl, caption) => {
      console.log(`[MOCK] sendImage to ${phoneNumber}: ${caption || 'no caption'}`);
      mockImages.push({ phoneNumber, imageUrl, caption });
      return Promise.resolve({ success: true });
    }),
    sendTypingIndicator: jest.fn(() => Promise.resolve()),
    downloadMedia: jest.fn(() => Promise.resolve(Buffer.from('fake-image-data'))),
    getMockReplies: () => mockReplies,
    getMockImages: () => mockImages,
    clearMocks: () => {
      mockReplies.length = 0;
      mockImages.length = 0;
    }
  };
});

jest.mock('../../../services/registrationService', () => ({
  registerUser: jest.fn((userData) => {
    console.log(`[MOCK] registerUser called with email: ${userData.email}`);
    // Create a mock ObjectId
    const mockObjectId = '507f1f77bcf86cd799439011';
    return Promise.resolve({
      user: {
        _id: mockObjectId,
        ...userData,
        emailVerified: false,
        createdAt: new Date()
      },
      otpCode: '123456'
    });
  }),
  resendOTP: jest.fn(() => Promise.resolve({ success: true }))
}));

jest.mock('../../../services/monoService', () => ({
  initiateAccountLinking: jest.fn(() => Promise.resolve({ 
    link: 'https://mono.test/connect',
    success: true 
  })),
  getAccountIncome: jest.fn(() => Promise.resolve({ 
    income: 500000,
    currency: 'NGN',
    period: 'monthly'
  }))
}));

jest.mock('../../../controllers/paystackController', () => ({
  createSubscriptionLinkForUser: jest.fn(() => Promise.resolve({ 
    authorization_url: 'https://paystack.test/subscription',
    success: true 
  })),
  createFilingPaymentLink: jest.fn(() => Promise.resolve({ 
    authorization_url: 'https://paystack.test/filing',
    success: true 
  })),
  verifyPendingSubscriptionForUser: jest.fn(() => Promise.resolve({ 
    verified: true,
    subscription: { plan: 'monthly', amount: 3000 }
  })),
  handleWebhook: jest.fn((req, res) => res.status(200).json({ received: true }))
}));

jest.mock('../../../utils/emailService', () => ({
  sendTaxProfileCreatedEmail: jest.fn(() => Promise.resolve({ success: true })),
  sendOTPEmail: jest.fn(() => Promise.resolve({ success: true }))
}));

// Mock utils/taxCalculator
jest.mock('../../../utils/taxCalculator', () => ({
  estimateTaxFromAnnualIncome: jest.fn((income) => {
    // Simple mock: 7.5% of income
    return Math.round(income * 0.075);
  }),
  calculateRentRelief: jest.fn((rentAmount) => {
    // Simple mock: 25% of rent up to 150k
    return Math.min(rentAmount * 0.25, 150000);
  })
}));

module.exports = {
  getMockReplies: () => require('../../../services/whatsappService').getMockReplies(),
  getMockImages: () => require('../../../services/whatsappService').getMockImages(),
  clearMocks: () => require('../../../services/whatsappService').clearMocks()
};