/**
 * Tax Constants - 2026 Nigeria Tax Reform
 * NOTE: These are estimates based on research. Verify with official NRS documentation.
 */

module.exports = {
  // Personal Income Tax (PIT) Constants
  TAX: {
    EXEMPTION_THRESHOLD: 800000, // ₦800,000 annual exemption
    BRACKET_1_MAX: 1500000, // ₦1,500,000
    BRACKET_1_RATE: 0.15, // 15%
    BRACKET_2_RATE: 0.25, // 25%
  },

  // VAT Constants
  VAT: {
    RATE: 0.075, // 7.5%
    EXEMPT_CATEGORIES: [
      'food',
      'healthcare',
      'education',
      'residential_rent',
      'public_transport'
    ]
  },

  // Transaction Categories
  INCOME_CATEGORIES: [
    'salary',
    'business_income',
    'rental_income',
    'investment_income',
    'other_income'
  ],

  EXPENSE_CATEGORIES: [
    'rent',
    'utilities',
    'transportation',
    'healthcare',
    'education',
    'business_expenses',
    'food',
    'entertainment',
    'other_expenses'
  ],

  // Transaction Types
  TRANSACTION_TYPES: {
    INCOME: 'income',
    EXPENSE: 'expense'
  },

  // Document Types
  DOCUMENT_TYPES: {
    BANK_STATEMENT: 'bank_statement',
    RECEIPT: 'receipt',
    INVOICE: 'invoice',
    PAY_SLIP: 'pay_slip',
    OTHER: 'other'
  },

  // Processing Status
  PROCESSING_STATUS: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed'
  },

  // Report Types
  REPORT_TYPES: {
    WEEKLY: 'weekly',
    MONTHLY: 'monthly',
    ANNUAL: 'annual',
    CUSTOM: 'custom'
  }
};

