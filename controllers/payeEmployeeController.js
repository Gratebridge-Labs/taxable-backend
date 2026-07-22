const Employee = require('../models/Employee');
const TaxableProfile = require('../models/TaxableProfile');
const { validationResult } = require('express-validator');
const { calculateIndividualTax, calculateRentRelief } = require('../utils/taxCalculator');

// Statutory deduction rates applied to monthly salary when toggled on the PAYE form
const PENSION_RATE = 0.08;  // 8%
const NHF_RATE = 0.025;     // 2.5%
const HMO_RATE = 0.05;      // 5% (NHIS)

const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/** Parse a month from a number (1-12) or a month name. Returns 1-12 or null. */
function parseMonth(value) {
  if (value === undefined || value === null || value === '') return null;
  let n = parseInt(value, 10);
  if (isNaN(n)) {
    const idx = MONTH_NAMES.findIndex(m => m.toLowerCase() === String(value).toLowerCase());
    if (idx === -1) return null;
    n = idx + 1;
  }
  return n >= 1 && n <= 12 ? n : null;
}

/**
 * Compute an employee's monthly PAYE and the payroll figures shown on the
 * Employee Payroll table (gross, taxable income with rent relief, statutory
 * deductions, and PAYE due this month).
 *
 * Nigeria Tax Act 2025: PAYE is derived from annual chargeable income
 * (annual gross - statutory reliefs - rent relief), then divided across 12 months.
 */
function computeEmployeePayroll(emp) {
  const monthlyGross = emp.basicSalary || 0;
  const annualGross = monthlyGross * 12;
  const sd = emp.statutoryDeductions || {};

  // Monthly statutory deduction amounts (as displayed in the table)
  const pensionMonthly = sd.pension ? Math.round(monthlyGross * PENSION_RATE) : 0;
  const nhfMonthly = sd.nhf ? Math.round(monthlyGross * NHF_RATE) : 0;
  const hmoMonthly = sd.hmo ? Math.round(monthlyGross * HMO_RATE) : 0;

  const annualRent = sd.annualRent ? (emp.annualRentAmount || 0) : 0;
  const rentRelief = calculateRentRelief(annualRent); // 20% of annual rent, capped at ₦500,000

  const annualTaxableIncome = Math.max(
    0,
    annualGross - (pensionMonthly * 12) - (nhfMonthly * 12) - (hmoMonthly * 12) - rentRelief
  );

  const annualPaye = calculateIndividualTax(annualTaxableIncome).totalTax;
  const payeThisMonth = Math.round(annualPaye / 12);

  return {
    grossIncome: monthlyGross,          // monthly
    annualGrossIncome: annualGross,
    taxableIncome: Math.round(annualTaxableIncome), // annual chargeable income
    hmo: hmoMonthly,                    // monthly
    pension: pensionMonthly,            // monthly
    nhf: nhfMonthly,                    // monthly
    annualRent,                         // annual rent value entered
    rentRelief,
    annualPaye: Math.round(annualPaye),
    payeThisMonth
  };
}

/**
 * Map the simplified business PAYE "Add Employee" form to an Employee document,
 * computing statutory deduction amounts from the selected toggles.
 */
function buildEmployeeFromBusinessForm(body = {}) {
  const monthlySalary = Number(body.monthlySalary) || 0;
  const d = body.deductions || {};

  return {
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email ? String(body.email).toLowerCase() : undefined,
    phone: body.phone,
    jobTitle: body.jobPosition || body.jobTitle,
    jtbTaxId: body.jtbTaxId,
    basicSalary: monthlySalary,
    statutoryDeductions: {
      pension: !!d.pension,
      nhf: !!d.nhf,
      hmo: !!d.hmo,
      annualRent: !!d.annualRent
    },
    annualRentAmount: d.annualRent ? (Number(body.annualRentAmount) || 0) : 0,
    pensionContribution: d.pension ? Math.round(monthlySalary * PENSION_RATE) : 0,
    nhfContribution: d.nhf ? Math.round(monthlySalary * NHF_RATE) : 0,
    nhisContribution: d.hmo ? Math.round(monthlySalary * HMO_RATE) : 0
  };
}

/** Recompute stored statutory deduction amounts from an employee's salary + toggles. */
function applyDeductionAmounts(employee) {
  const salary = employee.basicSalary || 0;
  const sd = employee.statutoryDeductions || {};
  employee.pensionContribution = sd.pension ? Math.round(salary * PENSION_RATE) : 0;
  employee.nhfContribution = sd.nhf ? Math.round(salary * NHF_RATE) : 0;
  employee.nhisContribution = sd.hmo ? Math.round(salary * HMO_RATE) : 0;
  if (!sd.annualRent) employee.annualRentAmount = 0;
}

/** Shape an employee document for API responses. */
function formatEmployee(employee) {
  return {
    id: employee._id,
    employeeId: employee.employeeId,
    month: employee.month,
    year: employee.year,
    firstName: employee.firstName,
    lastName: employee.lastName,
    email: employee.email,
    phone: employee.phone,
    jobTitle: employee.jobTitle,
    jtbTaxId: employee.jtbTaxId,
    monthlySalary: employee.basicSalary,
    statutoryDeductions: employee.statutoryDeductions,
    annualRentAmount: employee.annualRentAmount,
    deductionAmounts: {
      pension: employee.pensionContribution || 0,
      nhf: employee.nhfContribution || 0,
      hmo: employee.nhisContribution || 0
    },
    payroll: computeEmployeePayroll(employee),
    totalDeductions: (employee.nhfContribution || 0) + (employee.nhisContribution || 0) + (employee.pensionContribution || 0) + (employee.lifeInsurancePremium || 0),
    status: employee.status,
    isActive: employee.isActive,
    createdAt: employee.createdAt
  };
}

/**
 * List all employees for a profile
 * GET /taxableprofile/web/:profileId/paye/employees
 */
const listEmployees = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;
    const { status, isActive, department, employmentType } = req.query;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Find profile (user must own it)
    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    // Build query
    const query = { profileId: profile._id, createdBy: userId };
    
    if (status) {
      query.status = status;
    }
    
    if (isActive !== undefined) {
      query.isActive = isActive === 'true';
    }
    
    if (department) {
      query.department = department;
    }
    
    if (employmentType) {
      query.employmentType = employmentType;
    }

    const employees = await Employee.find(query)
      .sort({ createdAt: -1 })
      .lean();

    // Attach payroll computation (gross, taxable income, deductions, PAYE) per employee
    const employeesWithPayroll = employees.map(emp => ({ ...emp, payroll: computeEmployeePayroll(emp) }));
    const totalPayeThisMonth = employeesWithPayroll.reduce((sum, emp) => sum + (emp.payroll.payeThisMonth || 0), 0);

    // Calculate totals
    const totalEmployees = employees.length;
    const totalBasicSalary = employees.reduce((sum, emp) => sum + (emp.basicSalary || 0), 0);
    const totalCompensation = employees.reduce((sum, emp) => {
      const compensation = (emp.basicSalary || 0) + 
                          (emp.housingAllowance || 0) + 
                          (emp.transportAllowance || 0) + 
                          (emp.otherAllowances || 0);
      return sum + compensation;
    }, 0);
    const totalDeductions = employees.reduce((sum, emp) => {
      const deductions = (emp.nhfContribution || 0) + 
                        (emp.nhisContribution || 0) + 
                        (emp.pensionContribution || 0) + 
                        (emp.lifeInsurancePremium || 0);
      return sum + deductions;
    }, 0);

    res.status(200).json({
      success: true,
      data: {
        employees: employeesWithPayroll,
        summary: {
          totalEmployees,
          totalBasicSalary,
          totalCompensation,
          totalDeductions,
          totalPayeThisMonth,
          averageBasicSalary: totalEmployees > 0 ? totalBasicSalary / totalEmployees : 0,
          averageCompensation: totalEmployees > 0 ? totalCompensation / totalEmployees : 0
        },
        profile: {
          profileId: profile.profileId,
          year: profile.year,
          profileType: profile.profileType
        }
      }
    });
  } catch (error) {
    console.error('List employees error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving employees',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Add employee
 * POST /taxableprofile/web/:profileId/paye/employees
 */
const addEmployee = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.user?.userId;
    const { profileId } = req.params;
    const employeeData = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Find profile (user must own it)
    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    // Check if employee with same email already exists for this profile
    if (employeeData.email) {
      const existingEmployee = await Employee.findOne({
        profileId: profile._id,
        email: employeeData.email.toLowerCase()
      });
      
      if (existingEmployee) {
        return res.status(409).json({
          success: false,
          message: 'An employee with this email already exists for this profile'
        });
      }
    }

    // Create employee
    const employee = await Employee.create({
      ...employeeData,
      profileId: profile._id,
      createdBy: userId,
      updatedBy: userId,
      email: employeeData.email?.toLowerCase()
    });

    res.status(201).json({
      success: true,
      message: 'Employee added successfully',
      data: {
        employee: {
          id: employee._id,
          employeeId: employee.employeeId,
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email,
          jobTitle: employee.jobTitle,
          department: employee.department,
          basicSalary: employee.basicSalary,
          totalCompensation: employee.totalCompensation,
          status: employee.status,
          isActive: employee.isActive,
          createdAt: employee.createdAt
        }
      }
    });
  } catch (error) {
    console.error('Add employee error:', error);
    
    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'An employee with similar details already exists'
      });
    }

    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({
      success: false,
      message: 'An error occurred while adding employee',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Update employee
 * PUT /taxableprofile/web/:profileId/paye/employees/:employeeId
 */
const updateEmployee = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const userId = req.user?.userId;
    const { profileId, employeeId } = req.params;
    const updateData = req.body;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Find profile (user must own it)
    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    // Find employee (must belong to profile and created by user)
    const employee = await Employee.findOne({
      _id: employeeId,
      profileId: profile._id,
      createdBy: userId
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Check if email is being changed and if it conflicts with existing employee
    if (updateData.email && updateData.email !== employee.email) {
      const existingEmployee = await Employee.findOne({
        profileId: profile._id,
        email: updateData.email.toLowerCase(),
        _id: { $ne: employeeId }
      });
      
      if (existingEmployee) {
        return res.status(409).json({
          success: false,
          message: 'Another employee with this email already exists for this profile'
        });
      }
    }

    // Update fields
    Object.keys(updateData).forEach(key => {
      if (key !== '_id' && key !== 'profileId' && key !== 'employeeId' && 
          key !== 'createdAt' && key !== 'createdBy') {
        if (key === 'email') {
          employee[key] = updateData[key].toLowerCase();
        } else {
          employee[key] = updateData[key];
        }
      }
    });

    employee.updatedBy = userId;
    await employee.save();

    res.status(200).json({
      success: true,
      message: 'Employee updated successfully',
      data: {
        employee: {
          id: employee._id,
          employeeId: employee.employeeId,
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email,
          jobTitle: employee.jobTitle,
          department: employee.department,
          basicSalary: employee.basicSalary,
          totalCompensation: employee.totalCompensation,
          status: employee.status,
          isActive: employee.isActive,
          updatedAt: employee.updatedAt
        }
      }
    });
  } catch (error) {
    console.error('Update employee error:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Validation error',
        errors: Object.values(error.errors).map(err => err.message)
      });
    }

    res.status(500).json({
      success: false,
      message: 'An error occurred while updating employee',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Delete employee
 * DELETE /taxableprofile/web/:profileId/paye/employees/:employeeId
 */
const deleteEmployee = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId, employeeId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Find profile (user must own it)
    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    // Find and delete employee (must belong to profile and created by user)
    const employee = await Employee.findOneAndDelete({
      _id: employeeId,
      profileId: profile._id,
      createdBy: userId
    });

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Employee deleted successfully',
      data: {
        deletedEmployee: {
          id: employee._id,
          employeeId: employee.employeeId,
          firstName: employee.firstName,
          lastName: employee.lastName,
          email: employee.email
        }
      }
    });
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while deleting employee',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get employee by ID
 * GET /taxableprofile/web/:profileId/paye/employees/:employeeId
 */
const getEmployeeById = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId, employeeId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Find profile (user must own it)
    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    // Find employee (must belong to profile and created by user)
    const employee = await Employee.findOne({
      _id: employeeId,
      profileId: profile._id,
      createdBy: userId
    }).lean();

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Calculate virtual fields
    const totalCompensation = (employee.basicSalary || 0) + 
                             (employee.housingAllowance || 0) + 
                             (employee.transportAllowance || 0) + 
                             (employee.otherAllowances || 0);
    
    const totalDeductions = (employee.nhfContribution || 0) + 
                           (employee.nhisContribution || 0) + 
                           (employee.pensionContribution || 0) + 
                           (employee.lifeInsurancePremium || 0);
    
    const netPay = totalCompensation - totalDeductions;

    res.status(200).json({
      success: true,
      data: {
        employee: {
          ...employee,
          totalCompensation,
          totalDeductions,
          netPay
        },
        profile: {
          profileId: profile.profileId,
          year: profile.year,
          profileType: profile.profileType
        }
      }
    });
  } catch (error) {
    console.error('Get employee error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving employee',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Get employee summary for a profile
 * GET /taxableprofile/web/:profileId/paye/employees/summary
 */
const getEmployeeSummary = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Find profile (user must own it)
    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    // Get all employees for the profile
    const employees = await Employee.find({
      profileId: profile._id,
      createdBy: userId
    }).lean();

    // Calculate summary by status
    const summaryByStatus = {};
    const summaryByEmploymentType = {};
    const summaryByDepartment = {};
    
    let totalEmployees = 0;
    let totalBasicSalary = 0;
    let totalCompensation = 0;
    let totalDeductions = 0;
    let activeEmployees = 0;

    employees.forEach(emp => {
      const status = emp.status || 'active';
      const employmentType = emp.employmentType || 'full_time';
      const department = emp.department || 'Unassigned';
      
      const compensation = (emp.basicSalary || 0) + 
                          (emp.housingAllowance || 0) + 
                          (emp.transportAllowance || 0) + 
                          (emp.otherAllowances || 0);
      
      const deductions = (emp.nhfContribution || 0) + 
                        (emp.nhisContribution || 0) + 
                        (emp.pensionContribution || 0) + 
                        (emp.lifeInsurancePremium || 0);

      // Status summary
      if (!summaryByStatus[status]) {
        summaryByStatus[status] = {
          count: 0,
          totalCompensation: 0,
          totalDeductions: 0
        };
      }
      summaryByStatus[status].count++;
      summaryByStatus[status].totalCompensation += compensation;
      summaryByStatus[status].totalDeductions += deductions;

      // Employment type summary
      if (!summaryByEmploymentType[employmentType]) {
        summaryByEmploymentType[employmentType] = {
          count: 0,
          totalCompensation: 0
        };
      }
      summaryByEmploymentType[employmentType].count++;
      summaryByEmploymentType[employmentType].totalCompensation += compensation;

      // Department summary
      if (!summaryByDepartment[department]) {
        summaryByDepartment[department] = {
          count: 0,
          totalCompensation: 0
        };
      }
      summaryByDepartment[department].count++;
      summaryByDepartment[department].totalCompensation += compensation;

      // Totals
      totalEmployees++;
      totalBasicSalary += emp.basicSalary || 0;
      totalCompensation += compensation;
      totalDeductions += deductions;
      
      if (emp.isActive) {
        activeEmployees++;
      }
    });

    res.status(200).json({
      success: true,
      data: {
        profile: {
          profileId: profile.profileId,
          year: profile.year,
          profileType: profile.profileType
        },
        summary: {
          totalEmployees,
          activeEmployees,
          inactiveEmployees: totalEmployees - activeEmployees,
          totalBasicSalary,
          totalCompensation,
          totalDeductions,
          netPayroll: totalCompensation - totalDeductions,
          averageBasicSalary: totalEmployees > 0 ? totalBasicSalary / totalEmployees : 0,
          averageCompensation: totalEmployees > 0 ? totalCompensation / totalEmployees : 0
        },
        breakdown: {
          byStatus: summaryByStatus,
          byEmploymentType: summaryByEmploymentType,
          byDepartment: summaryByDepartment
        }
      }
    });
  } catch (error) {
    console.error('Get employee summary error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while retrieving employee summary',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

/**
 * Add a single employee via the business PAYE flow (simplified form).
 * Relies on requireBusinessProfile middleware (req.businessProfile).
 * POST /api/taxableprofile/business/:profileId/paye/employees
 */
const addBusinessEmployee = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const userId = req.user?.userId;
    const profile = req.businessProfile;

    // PAYE is managed per month — month is required
    const month = parseMonth(req.body.month ?? req.query.month);
    if (!month) {
      return res.status(400).json({ success: false, message: 'A valid month (1-12) is required' });
    }
    const year = profile.year;

    const mapped = buildEmployeeFromBusinessForm(req.body);

    // Prevent duplicate email within the same profile for the same month
    if (mapped.email) {
      const existing = await Employee.findOne({ profileId: profile._id, year, month, email: mapped.email });
      if (existing) {
        return res.status(409).json({ success: false, message: `An employee with this email already exists for ${MONTH_NAMES[month - 1]}` });
      }
    }

    const employee = await Employee.create({
      ...mapped,
      profileId: profile._id,
      month,
      year,
      createdBy: userId,
      updatedBy: userId
    });

    return res.status(201).json({
      success: true,
      message: 'Employee added successfully',
      data: { employee: formatEmployee(employee) }
    });
  } catch (error) {
    console.error('[PAYE] addBusinessEmployee error:', error);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'An employee with similar details already exists' });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: 'Validation error', errors: Object.values(error.errors).map(e => e.message) });
    }
    return res.status(500).json({ success: false, message: 'An error occurred while adding employee', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

/**
 * Bulk-add employees via the business PAYE flow.
 * Accepts { employees: [ {simplified form}, ... ] }. Valid rows are inserted;
 * invalid/duplicate rows are reported back per index so the frontend can show
 * exactly which rows failed.
 * POST /api/taxableprofile/business/:profileId/paye/employees/bulk
 */
const bulkAddEmployees = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const profile = req.businessProfile;
    const { employees } = req.body;

    // PAYE is managed per month — month is required and applies to the whole batch
    const month = parseMonth(req.body.month ?? req.query.month);
    if (!month) {
      return res.status(400).json({ success: false, message: 'A valid month (1-12) is required' });
    }
    const year = profile.year;

    if (!Array.isArray(employees) || employees.length === 0) {
      return res.status(400).json({ success: false, message: 'employees must be a non-empty array' });
    }
    if (employees.length > 500) {
      return res.status(400).json({ success: false, message: 'Cannot add more than 500 employees at once' });
    }

    // Emails already used by this profile for this month, plus emails seen within this batch
    const existing = await Employee.find({ profileId: profile._id, year, month }).select('email').lean();
    const usedEmails = new Set(existing.map(e => e.email).filter(Boolean));

    const added = [];
    const failed = [];

    for (let i = 0; i < employees.length; i++) {
      const row = employees[i] || {};
      const mapped = buildEmployeeFromBusinessForm(row);

      // Minimal required fields for the simplified form
      const missing = [];
      if (!mapped.firstName) missing.push('firstName');
      if (!mapped.lastName) missing.push('lastName');
      if (!mapped.email) missing.push('email');
      if (!mapped.phone) missing.push('phone');
      if (!mapped.jobTitle) missing.push('jobPosition');
      if (missing.length) {
        failed.push({ index: i, email: row.email || null, reason: `Missing required field(s): ${missing.join(', ')}` });
        continue;
      }

      // If annual rent relief is selected, the annual rent value is required
      const wantsRent = row.deductions && (row.deductions.annualRent === true || row.deductions.annualRent === 'true');
      if (wantsRent && !(Number(row.annualRentAmount) > 0)) {
        failed.push({ index: i, email: mapped.email, reason: 'annualRentAmount is required and must be greater than 0 when annual rent is selected' });
        continue;
      }

      if (usedEmails.has(mapped.email)) {
        failed.push({ index: i, email: mapped.email, reason: 'Duplicate email' });
        continue;
      }

      try {
        const employee = await Employee.create({
          ...mapped,
          profileId: profile._id,
          month,
          year,
          createdBy: userId,
          updatedBy: userId
        });
        usedEmails.add(mapped.email);
        added.push(formatEmployee(employee));
      } catch (rowError) {
        const reason = rowError.name === 'ValidationError'
          ? Object.values(rowError.errors).map(e => e.message).join('; ')
          : (rowError.code === 11000 ? 'Duplicate employee' : 'Failed to create employee');
        failed.push({ index: i, email: mapped.email, reason });
      }
    }

    return res.status(failed.length && !added.length ? 400 : 201).json({
      success: added.length > 0,
      message: `Added ${added.length} of ${employees.length} employees for ${MONTH_NAMES[month - 1]}`,
      data: {
        month,
        monthName: MONTH_NAMES[month - 1],
        year,
        addedCount: added.length,
        failedCount: failed.length,
        added,
        failed
      }
    });
  } catch (error) {
    console.error('[PAYE] bulkAddEmployees error:', error);
    return res.status(500).json({ success: false, message: 'An error occurred while bulk-adding employees', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

/**
 * List employees for a business PAYE month (roster + monthly PAYE total).
 * Relies on requireBusinessProfile (req.businessProfile). Month is required.
 * GET /api/taxableprofile/business/:profileId/paye/employees?month=1
 */
const listBusinessEmployees = async (req, res) => {
  try {
    const profile = req.businessProfile;

    const month = parseMonth(req.query.month);
    if (!month) {
      return res.status(400).json({ success: false, message: 'A valid month (1-12) query param is required' });
    }
    const year = parseInt(req.query.year, 10) || profile.year;

    const employees = await Employee.find({ profileId: profile._id, year, month })
      .sort({ createdAt: -1 })
      .lean();

    const rows = employees.map(emp => formatEmployee(emp));
    const totalPayeThisMonth = rows.reduce((sum, r) => sum + (r.payroll.payeThisMonth || 0), 0);
    const totalGross = rows.reduce((sum, r) => sum + (r.payroll.grossIncome || 0), 0);

    return res.status(200).json({
      success: true,
      message: `Employees for ${MONTH_NAMES[month - 1]} retrieved`,
      data: {
        profileId: profile.profileId,
        month,
        monthName: MONTH_NAMES[month - 1],
        year,
        employees: rows,
        summary: {
          totalEmployees: rows.length,
          totalGross,
          totalPayeThisMonth
        }
      }
    });
  } catch (error) {
    console.error('[PAYE] listBusinessEmployees error:', error);
    return res.status(500).json({ success: false, message: 'Error retrieving employees', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

/**
 * Update an employee via the business PAYE flow (simplified form, partial merge).
 * Recomputes statutory deductions when salary/toggles change and enforces the
 * annual-rent-value rule. Relies on requireBusinessProfile (req.businessProfile).
 * PUT /api/taxableprofile/business/:profileId/paye/employees/:employeeId
 */
const updateBusinessEmployee = async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, message: 'Validation failed', errors: errors.array() });
    }

    const userId = req.user?.userId;
    const profile = req.businessProfile;
    const { employeeId } = req.params;

    const employee = await Employee.findOne({ _id: employeeId, profileId: profile._id, createdBy: userId });
    if (!employee) {
      return res.status(404).json({ success: false, message: 'Employee not found' });
    }

    const {
      firstName, lastName, email, phone, jobPosition, jobTitle,
      jtbTaxId, monthlySalary, deductions, annualRentAmount
    } = req.body;

    // Email change → ensure no other employee in this profile uses it
    if (email !== undefined) {
      const normalized = String(email).toLowerCase();
      if (normalized !== employee.email) {
        const clash = await Employee.findOne({ profileId: profile._id, year: employee.year, month: employee.month, email: normalized, _id: { $ne: employee._id } });
        if (clash) {
          return res.status(409).json({ success: false, message: 'Another employee with this email already exists for this month' });
        }
        employee.email = normalized;
      }
    }

    if (firstName !== undefined) employee.firstName = firstName;
    if (lastName !== undefined) employee.lastName = lastName;
    if (phone !== undefined) employee.phone = phone;
    if (jobPosition !== undefined || jobTitle !== undefined) employee.jobTitle = jobPosition ?? jobTitle;
    if (jtbTaxId !== undefined) employee.jtbTaxId = jtbTaxId;
    if (monthlySalary !== undefined) employee.basicSalary = Number(monthlySalary) || 0;

    // Merge deduction toggles (partial), then recompute amounts
    if (deductions && typeof deductions === 'object') {
      const sd = employee.statutoryDeductions || {};
      for (const key of ['pension', 'nhf', 'hmo', 'annualRent']) {
        if (deductions[key] !== undefined) sd[key] = !!deductions[key];
      }
      employee.statutoryDeductions = sd;
    }
    if (annualRentAmount !== undefined) employee.annualRentAmount = Number(annualRentAmount) || 0;

    // Enforce annual rent value when rent relief is on (after merge)
    if (employee.statutoryDeductions?.annualRent && !(Number(employee.annualRentAmount) > 0)) {
      return res.status(400).json({ success: false, message: 'annualRentAmount is required and must be greater than 0 when annual rent is selected' });
    }

    applyDeductionAmounts(employee);
    employee.updatedBy = userId;
    await employee.save();

    return res.status(200).json({
      success: true,
      message: 'Employee updated successfully',
      data: { employee: formatEmployee(employee) }
    });
  } catch (error) {
    console.error('[PAYE] updateBusinessEmployee error:', error);
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'An employee with similar details already exists' });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ success: false, message: 'Validation error', errors: Object.values(error.errors).map(e => e.message) });
    }
    return res.status(500).json({ success: false, message: 'An error occurred while updating employee', error: process.env.NODE_ENV === 'development' ? error.message : undefined });
  }
};

module.exports = {
  listEmployees,
  addEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeById,
  getEmployeeSummary,
  addBusinessEmployee,
  bulkAddEmployees,
  updateBusinessEmployee,
  listBusinessEmployees
};