/**
 * Helper utility functions
 */

/**
 * Format currency in Nigerian Naira
 */
const formatCurrency = (amount) => {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

/**
 * Calculate year-to-date from date
 */
const getYearToDate = (date = new Date()) => {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const diffTime = Math.abs(date - startOfYear);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const monthsElapsed = diffDays / 30; // Approximate
  return {
    monthsElapsed: Math.max(1, Math.ceil(monthsElapsed)),
    daysElapsed: diffDays
  };
};

/**
 * Get current tax year
 */
const getCurrentTaxYear = () => {
  return new Date().getFullYear();
};

/**
 * Validate email format
 */
const isValidEmail = (email) => {
  const emailRegex = /^\S+@\S+\.\S+$/;
  return emailRegex.test(email);
};

/**
 * Sanitize string input
 */
const sanitizeString = (str) => {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/[<>]/g, '');
};

module.exports = {
  formatCurrency,
  getYearToDate,
  getCurrentTaxYear,
  isValidEmail,
  sanitizeString
};

