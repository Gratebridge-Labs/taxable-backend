const Admin = require('../models/Admin');

/**
 * Generate a secure 6-digit admin code
 * Format: First 2 digits are based on role (10=Root, 20=Accountant, 30=General)
 *         Last 4 digits are random
 * This ensures codes are unique and somewhat meaningful
 */
const generateAdminCode = (role = 'General') => {
  const rolePrefix = {
    'Root Admin': '10',
    'Accountant': '20',
    'General': '30'
  };

  const prefix = rolePrefix[role] || '30';
  
  // Generate random 4-digit suffix (1000-9999)
  const suffix = Math.floor(1000 + Math.random() * 9000).toString();
  
  return prefix + suffix;
};

/**
 * Generate a unique admin code (checks for duplicates)
 */
const generateUniqueAdminCode = async (role = 'General', maxAttempts = 10) => {
  let attempts = 0;
  let adminCode;
  let isUnique = false;

  while (!isUnique && attempts < maxAttempts) {
    adminCode = generateAdminCode(role);
    
    // Check if code already exists
    const existingAdmin = await Admin.findOne({ adminCode });
    if (!existingAdmin) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    throw new Error('Failed to generate unique admin code after multiple attempts');
  }

  return adminCode;
};

module.exports = {
  generateAdminCode,
  generateUniqueAdminCode
};

