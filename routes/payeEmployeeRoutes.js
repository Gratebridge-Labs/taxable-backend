const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
  listEmployees,
  addEmployee,
  updateEmployee,
  deleteEmployee,
  getEmployeeById,
  getEmployeeSummary
} = require('../controllers/payeEmployeeController');
const { authenticate } = require('../middleware/auth');
const { checkEmailVerified } = require('../middleware/profileAuth');

// Validation rules for adding employee
const addEmployeeValidation = [
  body('firstName')
    .trim()
    .notEmpty().withMessage('First name is required')
    .isLength({ max: 50 }).withMessage('First name cannot exceed 50 characters'),
  
  body('lastName')
    .trim()
    .notEmpty().withMessage('Last name is required')
    .isLength({ max: 50 }).withMessage('Last name cannot exceed 50 characters'),
  
  body('middleName')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('Middle name cannot exceed 50 characters'),
  
  body('dateOfBirth')
    .notEmpty().withMessage('Date of birth is required')
    .isISO8601().withMessage('Date of birth must be a valid date (e.g. YYYY-MM-DD)'),
  
  body('gender')
    .trim()
    .notEmpty().withMessage('Gender is required')
    .isIn(['male', 'female', 'other']).withMessage('Gender must be male, female, or other'),
  
  body('maritalStatus')
    .optional()
    .trim()
    .isIn(['single', 'married', 'divorced', 'widowed']).withMessage('Invalid marital status'),
  
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('phone')
    .trim()
    .notEmpty().withMessage('Phone number is required')
    .matches(/^(\+?234[\s-]?)?[0-9]{3}[\s-]?[0-9]{3}[\s-]?[0-9]{4}$|^0?[0-9]{10}$/)
    .withMessage('Please provide a valid phone number'),
  
  body('employmentType')
    .optional()
    .trim()
    .isIn(['full_time', 'part_time', 'contract', 'intern', 'consultant'])
    .withMessage('Invalid employment type'),
  
  body('jobTitle')
    .trim()
    .notEmpty().withMessage('Job title is required')
    .isLength({ max: 100 }).withMessage('Job title cannot exceed 100 characters'),
  
  body('department')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Department cannot exceed 100 characters'),
  
  body('employmentStartDate')
    .notEmpty().withMessage('Employment start date is required')
    .isISO8601().withMessage('Employment start date must be a valid date'),
  
  body('employmentEndDate')
    .optional()
    .isISO8601().withMessage('Employment end date must be a valid date'),
  
  body('tin')
    .optional()
    .trim()
    .matches(/^[0-9]{10,12}$/).withMessage('TIN must be 10-12 digits'),
  
  body('nin')
    .optional()
    .trim()
    .matches(/^[0-9]{11}$/).withMessage('NIN must be exactly 11 digits'),
  
  body('basicSalary')
    .notEmpty().withMessage('Basic salary is required')
    .isFloat({ min: 0 }).withMessage('Basic salary must be a positive number'),
  
  body('housingAllowance')
    .optional()
    .isFloat({ min: 0 }).withMessage('Housing allowance must be a positive number'),
  
  body('transportAllowance')
    .optional()
    .isFloat({ min: 0, max: 200000 }).withMessage('Transport allowance must be between 0 and 200,000'),
  
  body('otherAllowances')
    .optional()
    .isFloat({ min: 0 }).withMessage('Other allowances must be a positive number'),
  
  body('nhfContribution')
    .optional()
    .isFloat({ min: 0 }).withMessage('NHF contribution must be a positive number'),
  
  body('nhisContribution')
    .optional()
    .isFloat({ min: 0 }).withMessage('NHIS contribution must be a positive number'),
  
  body('pensionContribution')
    .optional()
    .isFloat({ min: 0 }).withMessage('Pension contribution must be a positive number'),
  
  body('lifeInsurancePremium')
    .optional()
    .isFloat({ min: 0 }).withMessage('Life insurance premium must be a positive number'),
  
  body('status')
    .optional()
    .trim()
    .isIn(['active', 'inactive', 'terminated', 'on_leave'])
    .withMessage('Invalid status'),
  
  body('isActive')
    .optional()
    .isBoolean().withMessage('isActive must be true or false'),
  
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Notes cannot exceed 1000 characters')
];

// Validation rules for updating employee (all optional)
const updateEmployeeValidation = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('First name cannot exceed 50 characters'),
  
  body('lastName')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('Last name cannot exceed 50 characters'),
  
  body('middleName')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('Middle name cannot exceed 50 characters'),
  
  body('dateOfBirth')
    .optional()
    .isISO8601().withMessage('Date of birth must be a valid date (e.g. YYYY-MM-DD)'),
  
  body('gender')
    .optional()
    .trim()
    .isIn(['male', 'female', 'other']).withMessage('Gender must be male, female, or other'),
  
  body('maritalStatus')
    .optional()
    .trim()
    .isIn(['single', 'married', 'divorced', 'widowed']).withMessage('Invalid marital status'),
  
  body('email')
    .optional()
    .trim()
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail(),
  
  body('phone')
    .optional()
    .trim()
    .matches(/^(\+?234[\s-]?)?[0-9]{3}[\s-]?[0-9]{3}[\s-]?[0-9]{4}$|^0?[0-9]{10}$/)
    .withMessage('Please provide a valid phone number'),
  
  body('employmentType')
    .optional()
    .trim()
    .isIn(['full_time', 'part_time', 'contract', 'intern', 'consultant'])
    .withMessage('Invalid employment type'),
  
  body('jobTitle')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Job title cannot exceed 100 characters'),
  
  body('department')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Department cannot exceed 100 characters'),
  
  body('employmentStartDate')
    .optional()
    .isISO8601().withMessage('Employment start date must be a valid date'),
  
  body('employmentEndDate')
    .optional()
    .isISO8601().withMessage('Employment end date must be a valid date'),
  
  body('tin')
    .optional()
    .trim()
    .matches(/^[0-9]{10,12}$/).withMessage('TIN must be 10-12 digits'),
  
  body('nin')
    .optional()
    .trim()
    .matches(/^[0-9]{11}$/).withMessage('NIN must be exactly 11 digits'),
  
  body('basicSalary')
    .optional()
    .isFloat({ min: 0 }).withMessage('Basic salary must be a positive number'),
  
  body('housingAllowance')
    .optional()
    .isFloat({ min: 0 }).withMessage('Housing allowance must be a positive number'),
  
  body('transportAllowance')
    .optional()
    .isFloat({ min: 0, max: 200000 }).withMessage('Transport allowance must be between 0 and 200,000'),
  
  body('otherAllowances')
    .optional()
    .isFloat({ min: 0 }).withMessage('Other allowances must be a positive number'),
  
  body('nhfContribution')
    .optional()
    .isFloat({ min: 0 }).withMessage('NHF contribution must be a positive number'),
  
  body('nhisContribution')
    .optional()
    .isFloat({ min: 0 }).withMessage('NHIS contribution must be a positive number'),
  
  body('pensionContribution')
    .optional()
    .isFloat({ min: 0 }).withMessage('Pension contribution must be a positive number'),
  
  body('lifeInsurancePremium')
    .optional()
    .isFloat({ min: 0 }).withMessage('Life insurance premium must be a positive number'),
  
  body('status')
    .optional()
    .trim()
    .isIn(['active', 'inactive', 'terminated', 'on_leave'])
    .withMessage('Invalid status'),
  
  body('isActive')
    .optional()
    .isBoolean().withMessage('isActive must be true or false'),
  
  body('notes')
    .optional()
    .trim()
    .isLength({ max: 1000 }).withMessage('Notes cannot exceed 1000 characters')
];

// PAYE Employee CRUD routes
router.get('/:profileId/paye/employees', authenticate, checkEmailVerified, listEmployees);
router.post('/:profileId/paye/employees', authenticate, checkEmailVerified, addEmployeeValidation, addEmployee);
router.get('/:profileId/paye/employees/:employeeId', authenticate, checkEmailVerified, getEmployeeById);
router.put('/:profileId/paye/employees/:employeeId', authenticate, checkEmailVerified, updateEmployeeValidation, updateEmployee);
router.delete('/:profileId/paye/employees/:employeeId', authenticate, checkEmailVerified, deleteEmployee);
router.get('/:profileId/paye/employees/summary', authenticate, checkEmailVerified, getEmployeeSummary);

module.exports = router;