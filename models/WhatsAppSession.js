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
      'tax_profile_nin_keep',
      'tax_profile_income',
      'tax_profile_income_other_desc',
      'tax_profile_income_confirm',
      'tax_profile_filing_preference_early',
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
      'tax_profile_state_keep',
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
      // Direct edit steps
      'edit_tax_year',
      'edit_nin',
      'edit_income',
      'edit_residency',
      'edit_state',
      'edit_rent_yn',
      'edit_rent_amount',
      'edit_filing_preference',
      // Filing, banks & reliefs
      'filing_confirm',
      // Filing payments (accountant review / filing fee) pending confirmation via "done"
      'filing_payment_pending',
      'manage_banks_remove',
      'manage_banks_list',
      'relief_menu',
      'relief_amount',
      'relief_awaiting_document',
      'review_profile_view',
      // Monthly filing flow
      'monthly_filing_choice',
      'monthly_income_month',
      'monthly_health_insurance',
      'monthly_health_insurance_amount',
      'monthly_pension',
      'monthly_pension_amount',
      'monthly_upload',
      'monthly_upload_rent_done',
      // Annual filing flow
      'annual_filing_choice',
      'annual_upload_done',
      'accountant_booking_confirm',
      // Subscription
      'subscription_menu',
      'subscription_pending'
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
    /** Previous-year carryover (used to ask "keep same?") */
    prevNin: { type: String, trim: true },
    prevState: { type: String, trim: true },
    primaryIncomeSources: [String],
    otherIncomeDescription: { type: String, trim: true },
    /** Amounts per income source (same order as primaryIncomeSources), in Naira annual */
    incomeAmounts: [Number],
    incomeAmountIndex: { type: Number },
    residency183Days: { type: Boolean },
    paysRent: { type: Boolean },
    /** Annual amounts (preferred). Backward compat: rentMonthlyAmount etc. */
    rentAnnualAmount: { type: Number },
    rentMonthlyAmount: { type: Number },
    hasHealthInsurance: { type: Boolean },
    healthInsuranceAnnualAmount: { type: Number },
    healthInsuranceMonthlyAmount: { type: Number },
    hasPension: { type: Boolean },
    pensionAnnualAmount: { type: Number },
    pensionMonthlyAmount: { type: Number },
    paysMortgage: { type: Boolean },
    mortgageAnnualAmount: { type: Number },
    mortgageMonthlyAmount: { type: Number },
    filingPreference: { type: String, trim: true }, // 'monthly' | 'annual'
    /** For monthly filingPreference, which month we're capturing now (1=Jan..12=Dec). */
    periodMonth: { type: Number },
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
    filingPaymentType: { type: String, trim: true },
    reliefProfileId: { type: String, trim: true },
    reliefYear: { type: Number },
    selectedReliefType: { type: String, trim: true },
    /** After adding a relief, store last created deduction id so next image/document can link to it */
    lastDeductionId: { type: String, trim: true },
    /** true after user got upload link in tax_profile_final_steps (must do upload before 2 or 3) */
    finalStepsUploadLinkSent: { type: Boolean },
    /** For main menu flows */
    _profileId: { type: String, trim: true },
    _year: { type: Number },
    /** Monthly filing data */
    monthlyIncomeAmount: { type: Number },
    healthInsuranceMonthly: { type: Number },
    pensionMonthly: { type: Number }
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
