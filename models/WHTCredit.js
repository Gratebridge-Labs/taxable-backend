const mongoose = require('mongoose');

const whtCreditSchema = new mongoose.Schema({
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxableProfile',
    required: true,
    index: true
  },
  clientName: { type: String, required: true, trim: true },
  clientTin: { type: String, trim: true },
  creditNoteNumber: { type: String, required: true, trim: true },
  whtType: { type: String, trim: true },
  whtRate: { type: Number, min: 0, max: 100 },
  grossAmount: { type: Number, required: true, min: 0 },
  whtAmount: { type: Number, required: true, min: 0 },
  dateIssued: { type: Date, required: true },
  documentId: { type: String, trim: true },
  year: { type: Number, required: true, min: 2020, max: 2100 },
  status: {
    type: String,
    enum: ['active', 'applied'],
    default: 'active'
  }
}, { timestamps: true });

whtCreditSchema.index({ profileId: 1, year: 1 });

module.exports = mongoose.model('WHTCredit', whtCreditSchema);
