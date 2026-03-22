const mongoose = require('mongoose');

const staffPayrollRecordSchema = new mongoose.Schema({
  profileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'TaxableProfile',
    required: true,
    index: true
  },
  month: {
    type: Number,
    required: true,
    min: 1,
    max: 12
  },
  year: {
    type: Number,
    required: true,
    min: 2020,
    max: 2100
  },
  employees: [{
    name: { type: String, required: true, trim: true },
    tin: { type: String, trim: true },
    grossSalary: { type: Number, required: true, min: 0 },
    pensionDeduction: { type: Number, default: 0, min: 0 },
    nhfDeduction: { type: Number, default: 0, min: 0 },
    payeComputed: { type: Number, required: true, min: 0 }
  }],
  totalGross: { type: Number, default: 0, min: 0 },
  totalPension: { type: Number, default: 0, min: 0 },
  totalNhf: { type: Number, default: 0, min: 0 },
  totalPaye: { type: Number, default: 0, min: 0 },
  status: {
    type: String,
    enum: ['draft', 'filed'],
    default: 'draft'
  },
  filedAt: { type: Date }
}, { timestamps: true });

// One record per profile per month per year
staffPayrollRecordSchema.index({ profileId: 1, year: 1, month: 1 }, { unique: true });

// Compute totals before save
staffPayrollRecordSchema.pre('save', function (next) {
  if (this.employees && this.employees.length > 0) {
    this.totalGross = this.employees.reduce((sum, e) => sum + (e.grossSalary || 0), 0);
    this.totalPension = this.employees.reduce((sum, e) => sum + (e.pensionDeduction || 0), 0);
    this.totalNhf = this.employees.reduce((sum, e) => sum + (e.nhfDeduction || 0), 0);
    this.totalPaye = this.employees.reduce((sum, e) => sum + (e.payeComputed || 0), 0);
  }
  next();
});

module.exports = mongoose.model('StaffPayrollRecord', staffPayrollRecordSchema);
