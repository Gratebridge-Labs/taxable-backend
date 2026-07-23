const mongoose = require('mongoose');

const SMALL_COMPANY_TURNOVER = 25_000_000;
const CIT_RATE_SMALL = 0.20;
const CIT_RATE_STANDARD = 0.30;
const DEVELOPMENT_LEVY_RATE = 0.04;
const CA_CLASS1_RATE = 0.10;
const CA_CLASS2_RATE = 0.20;
const CA_CLASS3_RATE = 0.25;

const citReturnSchema = new mongoose.Schema({
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxableProfile',
    required: true,
    index: true
  },
  year: {
    type: Number,
    required: true,
    min: 2020,
    max: 2100
  },

  // Annual financials
  financials: {
    totalRevenue: { type: Number, default: 0, min: 0 },
    cogs: { type: Number, default: 0, min: 0 },
    opex: { type: Number, default: 0, min: 0 },
    govFines: { type: Number, default: 0, min: 0 },
    accountingDepreciation: { type: Number, default: 0, min: 0 },
    generalProvisions: { type: Number, default: 0, min: 0 }
  },

  // Capital allowance asset bases (rates applied server-side)
  capitalAllowances: {
    class1Assets: { type: Number, default: 0, min: 0 },
    class2Assets: { type: Number, default: 0, min: 0 },
    class3Assets: { type: Number, default: 0, min: 0 }
  },

  documents: {
    auditedFinancialsUrl: { type: String },
    trialBalanceUrl: { type: String }
  },

  settlementPreference: {
    type: String,
    enum: ['rollover', 'refund', null],
    default: null
  },

  // Quarterly installment estimates + payment state
  estimatedGrossRevenue: { type: Number, default: 0, min: 0 },
  estimatedProfitMargin: { type: Number, default: 0, min: 0, max: 100 },
  estimatedAnnualProfit: { type: Number, default: 0, min: 0 },
  payCitQuarterly: { type: Boolean, default: false },
  quarterlyAssessments: [{
    quarter: { type: Number, min: 1, max: 4 },
    dueDate: { type: Date },
    amountDue: { type: Number, default: 0, min: 0 },
    amountPaid: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'paid', 'deferred'],
      default: 'pending'
    },
    paidAt: { type: Date },
    deferredAt: { type: Date }
  }],

  // Computed (persisted on save / file)
  accountingProfit: { type: Number, default: 0 },
  nonDeductibleTotal: { type: Number, default: 0 },
  totalCapitalAllowances: { type: Number, default: 0 },
  assessableProfit: { type: Number, default: 0 },
  bracketRate: { type: Number, default: CIT_RATE_STANDARD },
  baseCIT: { type: Number, default: 0 },
  developmentLevy: { type: Number, default: 0 },
  totalObligation: { type: Number, default: 0 },
  totalWhtCredits: { type: Number, default: 0 },
  totalQuarterlyPaid: { type: Number, default: 0 },
  finalPosition: { type: Number, default: 0 },

  status: {
    type: String,
    enum: ['draft', 'filed'],
    default: 'draft'
  },
  filed: { type: Boolean, default: false },
  legalConfirmAccuracy: { type: Boolean, default: false },
  legalConfirmAuthority: { type: Boolean, default: false },
  filedAt: { type: Date },
  filingId: { type: String }
}, { timestamps: true });

citReturnSchema.index({ profileId: 1, year: 1 }, { unique: true });

/**
 * Pure computation used by pre-save and by callers that need a live result
 * without persisting (e.g. empty draft responses).
 *
 * accountingProfit = totalRevenue - cogs - opex
 * nonDeductible = govFines + accountingDepreciation + generalProvisions
 * capitalAllowances = class1*10% + class2*20% + class3*25%
 * assessableProfit = accountingProfit + nonDeductible - capitalAllowances
 * bracketRate = turnover ≤ ₦25M → 20% else 30%
 * baseCIT / developmentLevy / finalPosition as documented
 */
function computeCitFields(doc, whtCreditsTotal = 0) {
  const f = doc.financials || {};
  const ca = doc.capitalAllowances || {};

  const totalRevenue = f.totalRevenue || 0;
  const accountingProfit = Math.round(
    totalRevenue - (f.cogs || 0) - (f.opex || 0)
  );
  const nonDeductibleTotal = Math.round(
    (f.govFines || 0) + (f.accountingDepreciation || 0) + (f.generalProvisions || 0)
  );
  const totalCapitalAllowances = Math.round(
    (ca.class1Assets || 0) * CA_CLASS1_RATE +
    (ca.class2Assets || 0) * CA_CLASS2_RATE +
    (ca.class3Assets || 0) * CA_CLASS3_RATE
  );
  const assessableProfit = Math.max(
    0,
    Math.round(accountingProfit + nonDeductibleTotal - totalCapitalAllowances)
  );

  const bracketRate = totalRevenue <= SMALL_COMPANY_TURNOVER
    ? CIT_RATE_SMALL
    : CIT_RATE_STANDARD;
  const baseCIT = Math.round(assessableProfit * bracketRate);
  const developmentLevy = Math.round(assessableProfit * DEVELOPMENT_LEVY_RATE);
  const totalObligation = baseCIT + developmentLevy;

  const totalQuarterlyPaid = (doc.quarterlyAssessments || [])
    .filter((i) => i.status === 'paid')
    .reduce((s, i) => s + (i.amountPaid || i.amountDue || 0), 0);

  const credits = Number(whtCreditsTotal) || 0;
  const finalPosition = Math.round(totalObligation - credits - totalQuarterlyPaid);

  return {
    accountingProfit,
    nonDeductibleTotal,
    totalCapitalAllowances,
    assessableProfit,
    bracketRate,
    baseCIT,
    developmentLevy,
    totalObligation,
    totalWhtCredits: credits,
    totalQuarterlyPaid,
    finalPosition
  };
}

citReturnSchema.statics.computeCitFields = computeCitFields;
citReturnSchema.statics.SMALL_COMPANY_TURNOVER = SMALL_COMPANY_TURNOVER;
citReturnSchema.statics.CIT_RATE_SMALL = CIT_RATE_SMALL;
citReturnSchema.statics.CIT_RATE_STANDARD = CIT_RATE_STANDARD;
citReturnSchema.statics.DEVELOPMENT_LEVY_RATE = DEVELOPMENT_LEVY_RATE;
citReturnSchema.statics.CA_CLASS1_RATE = CA_CLASS1_RATE;
citReturnSchema.statics.CA_CLASS2_RATE = CA_CLASS2_RATE;
citReturnSchema.statics.CA_CLASS3_RATE = CA_CLASS3_RATE;

/** Bracket rate for a given turnover (used by quarterly estimates). */
citReturnSchema.statics.bracketRateForTurnover = function (turnover) {
  return (turnover || 0) <= SMALL_COMPANY_TURNOVER
    ? CIT_RATE_SMALL
    : CIT_RATE_STANDARD;
};

citReturnSchema.methods.applyComputed = function (whtCreditsTotal = 0) {
  const result = computeCitFields(this, whtCreditsTotal);
  Object.assign(this, result);
  return result;
};

module.exports = mongoose.model('CITReturn', citReturnSchema);
