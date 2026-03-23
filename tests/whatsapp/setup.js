// Global test setup for WhatsApp tests
require('./helpers/mockSetup');

const { connectTestDB, clearDatabase, disconnectTestDB } = require('./helpers/dbSetup');
const { initTestApp } = require('./helpers/simulator');

// Global timeout for tests (5 minutes)
jest.setTimeout(300000);

beforeAll(async () => {
  console.log('[SETUP] Starting WhatsApp test suite...');
  await connectTestDB();
  initTestApp();
});

beforeEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await disconnectTestDB();
  console.log('[TEARDOWN] WhatsApp test suite completed.');
});

// Helper to wait for async operations
global.wait = (ms = 100) => new Promise(resolve => setTimeout(resolve, ms));