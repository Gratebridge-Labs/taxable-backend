/**
 * Profile Validation Utilities
 * Handles validation logic for Taxable Profiles
 */

/**
 * Check if a year is valid for profile creation
 * Rules:
 * - Can create for current year
 * - Can create for next year if within 30 days of that year
 * @param {Number} year - The year to validate
 * @returns {Object} { valid: Boolean, message: String }
 */
const validateYear = (year) => {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const nextYear = currentYear + 1;

  // Convert to number if it's a string
  const yearNum = typeof year === 'string' ? parseInt(year, 10) : year;

  // Check if year is a valid number
  if (!Number.isInteger(yearNum) || isNaN(yearNum) || yearNum < 2020 || yearNum > 2100) {
    return {
      valid: false,
      message: 'Year must be a valid 4-digit year between 2020 and 2100'
    };
  }

  // Can create for current year
  if (yearNum === currentYear) {
    return {
      valid: true,
      message: 'Valid year'
    };
  }

  // Can create for next year if within 30 days
  if (yearNum === nextYear) {
    // Calculate days until next year
    const nextYearDate = new Date(nextYear, 0, 1); // January 1st of next year
    const daysUntilNextYear = Math.ceil((nextYearDate - currentDate) / (1000 * 60 * 60 * 24));

    if (daysUntilNextYear <= 30) {
      return {
        valid: true,
        message: 'Valid year (within 30 days of next year)'
      };
    } else {
      return {
        valid: false,
        message: `Cannot create profile for ${year}. You can only create for next year if it's within 30 days.`
      };
    }
  }

  // Cannot create for past years or years beyond next year
  if (yearNum < currentYear) {
    return {
      valid: false,
      message: 'Cannot create profile for past years'
    };
  }

  if (yearNum > nextYear) {
    return {
      valid: false,
      message: 'Cannot create profile for years beyond next year'
    };
  }

  return {
    valid: false,
    message: 'Invalid year'
  };
};

/**
 * Get allowed years for profile creation
 * @returns {Array} Array of allowed year numbers
 */
const getAllowedYears = () => {
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const nextYear = currentYear + 1;
  const allowedYears = [currentYear];

  // Check if next year is within 30 days
  const nextYearDate = new Date(nextYear, 0, 1);
  const daysUntilNextYear = Math.ceil((nextYearDate - currentDate) / (1000 * 60 * 60 * 24));

  if (daysUntilNextYear <= 30) {
    allowedYears.push(nextYear);
  }

  return allowedYears;
};

/**
 * Validate profile type
 * @param {String} profileType - The profile type to validate
 * @returns {Object} { valid: Boolean, message: String }
 */
const validateProfileType = (profileType) => {
  const validTypes = ['Individual', 'Business'];

  if (!profileType) {
    return {
      valid: false,
      message: 'Profile type is required'
    };
  }

  if (!validTypes.includes(profileType)) {
    return {
      valid: false,
      message: `Profile type must be one of: ${validTypes.join(', ')}`
    };
  }

  return {
    valid: true,
    message: 'Valid profile type'
  };
};

/**
 * Web-specific year validation (only 2025 or 2026 allowed)
 * @param {Number} year - The year to validate
 * @returns {Object} { valid: Boolean, message: String }
 */
const validateWebYear = (year) => {
  const yearNum = typeof year === 'string' ? parseInt(year, 10) : year;

  if (!Number.isInteger(yearNum) || isNaN(yearNum)) {
    return {
      valid: false,
      message: 'Year must be a valid number'
    };
  }

  if (yearNum === 2025 || yearNum === 2026) {
    return {
      valid: true,
      message: 'Valid year'
    };
  }

  return {
    valid: false,
    message: 'Year must be 2025 or 2026'
  };
};

/**
 * Get allowed years for web (2025, 2026)
 * @returns {Array} Array of allowed year numbers
 */
const getWebAllowedYears = () => {
  return [2025, 2026];
};

/**
 * Validate filing preference based on year
 * @param {String} filingPreference - 'monthly' or 'annual'
 * @param {Number} year - The tax year
 * @returns {Object} { valid: Boolean, message: String }
 */
const validateFilingPreference = (filingPreference, year) => {
  if (!filingPreference) {
    return {
      valid: false,
      message: 'Filing preference is required'
    };
  }

  if (!['monthly', 'annual'].includes(filingPreference)) {
    return {
      valid: false,
      message: 'Filing preference must be "monthly" or "annual"'
    };
  }

  // 2025 only allows annual filing
  if (year === 2025 && filingPreference !== 'annual') {
    return {
      valid: false,
      message: 'For tax year 2025, only annual filing is allowed'
    };
  }

  return {
    valid: true,
    message: 'Valid filing preference'
  };
};

/**
 * Validate NIN format
 * @param {String} nin - NIN to validate
 * @returns {Object} { valid: Boolean, message: String }
 */
const validateNIN = (nin) => {
  if (!nin) {
    return {
      valid: false,
      message: 'NIN is required'
    };
  }

  const ninStr = String(nin).replace(/[^0-9]/g, '');
  if (ninStr.length !== 11) {
    return {
      valid: false,
      message: 'NIN must be exactly 11 digits'
    };
  }

  return {
    valid: true,
    message: 'Valid NIN'
  };
};

/**
 * Get valid income sources
 * @returns {Array} Array of valid income source strings
 */
const getValidIncomeSources = () => {
  return [
    'Salary / Employment',
    'Business/Self-employment',
    'Freelance/Consulting',
    'Investment income',
    'Rental income',
    'Digital Assets/Crypto'
  ];
};

module.exports = {
  validateYear,
  getAllowedYears,
  validateProfileType,
  validateWebYear,
  getWebAllowedYears,
  validateFilingPreference,
  validateNIN,
  getValidIncomeSources
};

