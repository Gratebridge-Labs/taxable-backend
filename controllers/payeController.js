/**
 * PAYE Controller
 * Handles employee payroll tax management: monthly filings and annual returns
 */
const StaffPayrollRecord = require('../models/StaffPayrollRecord');

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/**
 * Upsert monthly PAYE filing
 * PUT /api/taxableprofile/business/:profileId/paye/monthly/:month
 */
const upsertMonthlyPaye = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const monthParam = req.params.month;
    const { employees } = req.body;

    // Parse month (accept number 1-12 or name)
    let monthNum = parseInt(monthParam, 10);
    if (isNaN(monthNum)) {
      const idx = MONTH_NAMES.findIndex(m => m.toLowerCase() === String(monthParam).toLowerCase());
      if (idx === -1) return res.status(400).json({ success: false, message: 'Invalid month. Use 1-12 or month name.' });
      monthNum = idx + 1;
    }
    if (monthNum < 1 || monthNum > 12) {
      return res.status(400).json({ success: false, message: 'Month must be between 1 and 12' });
    }

    if (!Array.isArray(employees) || employees.length === 0) {
      return res.status(400).json({ success: false, message: 'employees array is required and must not be empty' });
    }

    // Validate each employee
    for (let i = 0; i < employees.length; i++) {
      const e = employees[i];
      if (!e.name) return res.status(400).json({ success: false, message: `employees[${i}].name is required` });
      if (typeof e.grossSalary !== 'number' || e.grossSalary < 0) return res.status(400).json({ success: false, message: `employees[${i}].grossSalary must be a non-negative number` });
      if (typeof e.payeComputed !== 'number' || e.payeComputed < 0) return res.status(400).json({ success: false, message: `employees[${i}].payeComputed must be a non-negative number` });
    }

    const year = profile.year;

    // Upsert: find existing or create
    let record = await StaffPayrollRecord.findOne({ profileId: profile._id, year, month: monthNum });
    if (record) {
      record.employees = employees;
      record.status = 'draft';
      await record.save();
    } else {
      record = await StaffPayrollRecord.create({
        profileId: profile._id,
        year,
        month: monthNum,
        employees,
        status: 'draft'
      });
    }

    return res.status(200).json({
      success: true,
      message: `PAYE monthly filing saved for ${MONTH_NAMES[monthNum - 1]}`,
      data: {
        profileId: profile._id,
        month: MONTH_NAMES[monthNum - 1],
        monthNumber: monthNum,
        year,
        employeeCount: record.employees.length,
        totalGross: record.totalGross,
        totalPension: record.totalPension,
        totalNhf: record.totalNhf,
        totalPayeRemitted: record.totalPaye,
        status: record.status
      }
    });
  } catch (error) {
    console.error('[PAYE] upsertMonthlyPaye error:', error);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Duplicate PAYE record for this month' });
    }
    return res.status(500).json({ success: false, message: 'Error saving PAYE filing', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

/**
 * Get all PAYE records for the profile year
 * GET /api/taxableprofile/business/:profileId/paye
 */
const getPayeRecords = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const year = parseInt(req.query.year) || profile.year;

    const records = await StaffPayrollRecord.find({ profileId: profile._id, year }).sort({ month: 1 }).lean();

    // Build months array (1-12)
    const months = [];
    for (let m = 1; m <= 12; m++) {
      const rec = records.find(r => r.month === m);
      months.push({
        month: m,
        monthName: MONTH_NAMES[m - 1],
        employeeCount: rec ? rec.employees.length : 0,
        totalGross: rec ? rec.totalGross : 0,
        totalPayeRemitted: rec ? rec.totalPaye : 0,
        status: rec ? rec.status : 'pending',
        filedAt: rec ? rec.filedAt : null
      });
    }

    const filed = records.filter(r => r.status === 'filed').length;
    const draft = records.filter(r => r.status === 'draft').length;

    return res.status(200).json({
      success: true,
      message: 'PAYE records retrieved',
      data: {
        profileId: profile._id,
        year,
        months,
        annualSummary: {
          totalGross: records.reduce((s, r) => s + (r.totalGross || 0), 0),
          totalPayeRemitted: records.reduce((s, r) => s + (r.totalPaye || 0), 0),
          monthsFiled: filed,
          monthsDraft: draft,
          monthsPending: 12 - filed - draft
        }
      }
    });
  } catch (error) {
    console.error('[PAYE] getPayeRecords error:', error);
    return res.status(500).json({ success: false, message: 'Error retrieving PAYE records' });
  }
};

/**
 * Get annual PAYE summary
 * GET /api/taxableprofile/business/:profileId/paye/annual
 */
const getAnnualPayeSummary = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const year = parseInt(req.query.year) || profile.year;

    const records = await StaffPayrollRecord.find({ profileId: profile._id, year }).sort({ month: 1 }).lean();

    // Collect unique employees across all months
    const employeeSet = new Set();
    records.forEach(r => r.employees.forEach(e => employeeSet.add(e.name + (e.tin || ''))));

    const monthlyBreakdown = [];
    for (let m = 1; m <= 12; m++) {
      const rec = records.find(r => r.month === m);
      monthlyBreakdown.push({
        month: m,
        gross: rec ? rec.totalGross : 0,
        paye: rec ? rec.totalPaye : 0,
        pension: rec ? rec.totalPension : 0,
        nhf: rec ? rec.totalNhf : 0,
        status: rec ? rec.status : 'pending'
      });
    }

    const allFiled = records.length === 12 && records.every(r => r.status === 'filed');

    return res.status(200).json({
      success: true,
      message: 'Annual PAYE summary retrieved',
      data: {
        year,
        totalEmployees: employeeSet.size,
        totalGrossPayroll: records.reduce((s, r) => s + (r.totalGross || 0), 0),
        totalPensionDeductions: records.reduce((s, r) => s + (r.totalPension || 0), 0),
        totalNhfDeductions: records.reduce((s, r) => s + (r.totalNhf || 0), 0),
        totalPayeRemitted: records.reduce((s, r) => s + (r.totalPaye || 0), 0),
        monthlyBreakdown,
        status: allFiled ? 'completed' : records.length > 0 ? 'in_progress' : 'not_started'
      }
    });
  } catch (error) {
    console.error('[PAYE] getAnnualPayeSummary error:', error);
    return res.status(500).json({ success: false, message: 'Error retrieving annual PAYE summary' });
  }
};

/**
 * Submit PAYE annual returns
 * POST /api/taxableprofile/business/:profileId/paye/annual-submit
 */
const submitAnnualPaye = async (req, res) => {
  try {
    const profile = req.businessProfile;
    const year = profile.year;

    const records = await StaffPayrollRecord.find({ profileId: profile._id, year });

    if (records.length === 0) {
      return res.status(400).json({ success: false, message: 'No PAYE records found for this year. Submit monthly records first.' });
    }

    // Mark all draft records as filed
    const now = new Date();
    for (const rec of records) {
      if (rec.status === 'draft') {
        rec.status = 'filed';
        rec.filedAt = now;
        await rec.save();
      }
    }

    const totalPaye = records.reduce((s, r) => s + (r.totalPaye || 0), 0);

    return res.status(200).json({
      success: true,
      message: 'PAYE annual return submitted',
      data: {
        filingId: `paye_${year}_${Date.now()}`,
        year,
        status: 'submitted',
        submittedAt: now.toISOString(),
        totalPayeForYear: totalPaye,
        monthsFiled: records.length
      }
    });
  } catch (error) {
    console.error('[PAYE] submitAnnualPaye error:', error);
    return res.status(500).json({ success: false, message: 'Error submitting annual PAYE return' });
  }
};

module.exports = {
  upsertMonthlyPaye,
  getPayeRecords,
  getAnnualPayeSummary,
  submitAnnualPaye
};
