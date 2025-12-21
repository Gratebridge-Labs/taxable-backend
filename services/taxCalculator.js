/**
 * Tax Calculator Service
 * Implements 2026 Nigeria Tax Reform calculations
 */

const TAX_CONSTANTS = require('../config/constants');

class TaxCalculator {
  /**
   * Calculate personal income tax based on 2026 reform
   * @param {number} annualIncome - Total annual income
   * @param {number} deductions - Total deductions
   * @returns {object} Tax calculation result
   */
  calculatePersonalIncomeTax(annualIncome, deductions = 0) {
    // Calculate taxable income
    const taxableIncome = Math.max(0, annualIncome - deductions);
    
    // Apply exemption threshold
    if (taxableIncome <= TAX_CONSTANTS.TAX.EXEMPTION_THRESHOLD) {
      return {
        taxableIncome: 0,
        taxLiability: 0,
        effectiveRate: 0,
        breakdown: {
          exemption: taxableIncome,
          bracket1: 0,
          bracket2: 0
        }
      };
    }

    let tax = 0;
    const breakdown = {
      exemption: TAX_CONSTANTS.TAX.EXEMPTION_THRESHOLD,
      bracket1: 0,
      bracket2: 0
    };

    // First bracket: ₦800,001 to ₦1,500,000 at 15%
    const bracket1Amount = Math.min(
      taxableIncome - TAX_CONSTANTS.TAX.EXEMPTION_THRESHOLD,
      TAX_CONSTANTS.TAX.BRACKET_1_MAX - TAX_CONSTANTS.TAX.EXEMPTION_THRESHOLD
    );
    
    if (bracket1Amount > 0) {
      const bracket1Tax = bracket1Amount * TAX_CONSTANTS.TAX.BRACKET_1_RATE;
      tax += bracket1Tax;
      breakdown.bracket1 = bracket1Tax;
    }

    // Second bracket: Above ₦1,500,000 at 25%
    if (taxableIncome > TAX_CONSTANTS.TAX.BRACKET_1_MAX) {
      const bracket2Amount = taxableIncome - TAX_CONSTANTS.TAX.BRACKET_1_MAX;
      const bracket2Tax = bracket2Amount * TAX_CONSTANTS.TAX.BRACKET_2_RATE;
      tax += bracket2Tax;
      breakdown.bracket2 = bracket2Tax;
    }

    const effectiveRate = annualIncome > 0 ? (tax / annualIncome) * 100 : 0;

    return {
      taxableIncome,
      taxLiability: Math.round(tax * 100) / 100,
      effectiveRate: Math.round(effectiveRate * 100) / 100,
      breakdown
    };
  }

  /**
   * Project annual tax from partial year data
   * @param {number} ytdIncome - Year-to-date income
   * @param {number} monthsElapsed - Number of months passed in tax year
   * @param {number} deductions - Total deductions
   * @returns {object} Projected tax calculation
   */
  projectAnnualTax(ytdIncome, monthsElapsed, deductions = 0) {
    if (monthsElapsed === 0) monthsElapsed = 1; // Prevent division by zero
    
    const projectedAnnualIncome = (ytdIncome / monthsElapsed) * 12;
    const projectedDeductions = (deductions / monthsElapsed) * 12;
    
    return this.calculatePersonalIncomeTax(
      projectedAnnualIncome,
      projectedDeductions
    );
  }

  /**
   * Calculate weekly tax estimate
   * @param {number} annualTax - Annual tax liability
   * @returns {number} Weekly tax estimate
   */
  calculateWeeklyEstimate(annualTax) {
    return Math.round((annualTax / 52) * 100) / 100;
  }

  /**
   * Calculate monthly tax estimate
   * @param {number} annualTax - Annual tax liability
   * @returns {number} Monthly tax estimate
   */
  calculateMonthlyEstimate(annualTax) {
    return Math.round((annualTax / 12) * 100) / 100;
  }
}

module.exports = new TaxCalculator();

