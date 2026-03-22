const Employee = require('../models/Employee');
const TaxableProfile = require('../models/TaxableProfile');
const { validationResult } = require('express-validator');

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
        employees,
        summary: {
          totalEmployees,
          totalBasicSalary,
          totalCompensation,
          totalDeductions,
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

module.exports = {
  listEmployees,
  addEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeById,
  getEmployeeSummary
};