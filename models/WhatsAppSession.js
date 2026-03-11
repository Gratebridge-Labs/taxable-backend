const mongoose = require('mongoose');

/**
 * Tracks WhatsApp conversation state for registration and other flows.
 * Keyed by wa_id (WhatsApp user phone number with country code, no +).
 */
const whatsAppSessionSchema = new mongoose.Schema({
  waId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true
  },
  /** Registration flow + login + tax profile: ... | login_email | login_password | tax_profile_intro | tax_profile_year | tax_profile_nin | tax_profile_income | tax_profile_residency | tax_profile_rent | tax_profile_health | tax_profile_pension | tax_profile_mortgage */
  step: {
    type: String,
    default: 'welcome',
    enum: [
      'welcome',
      'welcome_choice',
      'create_account_confirm',
      'create_account_paused',
      'full_name',
      'email_exists',
      'account_created_choice',
      'registration_menu_choice',
      'create_account_ready',
      'first_name',
      'last_name',
      'email',
      'phone',
      'phone_confirm',
      'phone_input',
      'password',
      'otp',
      'done',
      'login_email',
      'login_password',
      // Tax profile setup (FLOW 3)
      'tax_profile_intro',
      'tax_profile_draft_choice',
      'tax_profile_intro_choice',
      'tax_profile_intro_explain',
      'tax_profile_year',
      'tax_profile_nin',
      'tax_profile_income',
      'tax_profile_income_other_desc',
      'tax_profile_income_confirm',
      'tax_profile_residency',
      'tax_profile_residency_nonresident_choice',
      'tax_profile_rent',
      'tax_profile_rent_amount',
      'tax_profile_health',
      'tax_profile_health_amount',
      'tax_profile_pension',
      'tax_profile_pension_amount',
      'tax_profile_mortgage',
      'tax_profile_mortgage_amount',
      'tax_profile_amount_confirm',
      'tax_profile_reuse_ask',
      'tax_profile_dob',
      'tax_profile_street',
      'tax_profile_city',
      'tax_profile_state',
      'tax_profile_income_info',
      'tax_profile_deductibles',
      'tax_profile_filing_preference',
      'tax_profile_summary',
      'tax_profile_income_amount',
      'tax_profile_summary_confirm',
      'tax_profile_edit_choice',
      'tax_profile_final_steps',
      'tax_profile_subscription',
      'tax_profile_subscription_details',
      'tax_profile_subscription_later',
      // Filing, banks & reliefs
      'filing_confirm',
      'manage_banks_remove',
      'manage_banks_list',
      'relief_menu',
      'relief_amount',
      'relief_awaiting_document',
      'review_profile_view'
    ]
  },
  /** Partial registration data collected so far; loginEmail used during login flow */
  registrationData: {
    firstName: { type: String, trim: true },
    lastName: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true },
    phone: { type: String, trim: true },
    password: { type: String },
    loginEmail: { type: String, trim: true, lowercase: true }
  },
  /** Data collected during tax profile setup (WhatsApp); currentProfileId = profile we're filling after create */
  taxProfileData: {
    year: { type: Number },
    nin: { type: String, trim: true },
    primaryIncomeSources: [String],
    otherIncomeDescription: { type: String, trim: true },
    /** Amounts per income source (same order as primaryIncomeSources), in Naira annual */
    incomeAmounts: [Number],
    incomeAmountIndex: { type: Number },
    residency183Days: { type: Boolean },
    paysRent: { type: Boolean },
    rentMonthlyAmount: { type: Number },
    hasHealthInsurance: { type: Boolean },
    healthInsuranceMonthlyAmount: { type: Number },
    hasPension: { type: Boolean },
    pensionMonthlyAmount: { type: Number },
    paysMortgage: { type: Boolean },
    mortgageMonthlyAmount: { type: Number },
    filingPreference: { type: String, trim: true }, // 'monthly' | 'annual'
    _pendingConfirmAmountType: { type: String, trim: true },
    _pendingConfirmAmountValue: { type: Number },
    editReturnToSummary: { type: Boolean },
    currentProfileId: { type: String, trim: true },
    _draftProfileId: { type: String, trim: true },
    dob: { type: String, trim: true },
    street: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    /** For manage_banks_remove: ordered list of MonoLink _ids (string) */
    manageBanksLinkIds: [String],
    filingProfileId: { type: String, trim: true },
    reliefProfileId: { type: String, trim: true },
    reliefYear: { type: Number },
    selectedReliefType: { type: String, trim: true },
    /** After adding a relief, store last created deduction id so next image/document can link to it */
    lastDeductionId: { type: String, trim: true }
  },
  /** After user is created, we may need to verify OTP */
  pendingUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('WhatsAppSession', whatsAppSessionSchema);
