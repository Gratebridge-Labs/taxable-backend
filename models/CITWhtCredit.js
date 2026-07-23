const mongoose = require('mongoose');

/**
 * CIT-return WHT credit notes.
 * Independent of /wht/credits but shares the same conceptual fields for the CIT UI.
 */
const citWhtCreditSchema = new mongoose.Schema({
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
  clientName: { type: String, required: true, trim: true },
  clientTIN: { type: String, trim: true },
  creditRef: { type: String, required: true, trim: true },
  grossValue: { type: Number, required: true, min: 0 },
  withheldAmount: { type: Number, required: true, min: 0 }
}, { timestamps: true });

citWhtCreditSchema.index({ profileId: 1, year: 1 });

module.exports = mongoose.model('CITWhtCredit', citWhtCreditSchema);
