/**
 * Tax Recalculation Service
 * Automatically recalculates tax profiles when transactions change
 */

const TaxProfile = require('../models/TaxProfile');
const Transaction = require('../models/Transaction');
const taxCalculator = require('./taxCalculator');
const { getYearToDate } = require('../utils/helpers');

/**
 * Recalculate tax profile for a specific year
 * This is called automatically when transactions change
 * @param {string} userId - User ID
 * @param {string} accountId - Account ID
 * @param {number} taxYear - Tax year
 * @returns {Promise<Object>} Updated tax profile
 */
const recalculateTaxProfileForYear = async (userId, accountId, taxYear) => {
  try {
    // Get date range for tax year
    const startDate = new Date(taxYear, 0, 1);
    const endDate = new Date(taxYear, 11, 31, 23, 59, 59, 999);

    // Get all transactions for the tax year
    const transactions = await Transaction.find({
      user: userId,
      account: accountId,
      transactionDate: {
        $gte: startDate,
        $lte: endDate
      }
    });

    // Calculate totals from transactions
    let totalIncome = 0;
    let totalDeductions = 0;

    transactions.forEach(tx => {
      if (tx.transactionType === 'income') {
        totalIncome += tx.amount || 0;
      } else if (tx.transactionType === 'expense' && tx.isTaxDeductible) {
        totalDeductions += tx.amount || 0;
      }
    });

    // Calculate year-to-date if current year
    const currentYear = new Date().getFullYear();
    const isCurrentYear = taxYear === currentYear;
    
    let annualIncomeEstimate = totalIncome;
    let annualDeductionsEstimate = totalDeductions;

    if (isCurrentYear) {
      const { monthsElapsed } = getYearToDate();
      if (monthsElapsed > 0 && monthsElapsed < 12) {
        annualIncomeEstimate = (totalIncome / monthsElapsed) * 12;
        annualDeductionsEstimate = (totalDeductions / monthsElapsed) * 12;
      }
    }

    // Calculate tax
    const taxCalculation = taxCalculator.calculatePersonalIncomeTax(
      annualIncomeEstimate,
      annualDeductionsEstimate
    );

    // Update or create tax profile
    let taxProfile = await TaxProfile.findOne({
      user: userId,
      account: accountId,
      taxYear
    });

    if (taxProfile) {
      taxProfile.annualIncomeEstimate = annualIncomeEstimate;
      taxProfile.totalDeductions = annualDeductionsEstimate;
      taxProfile.estimatedTaxLiability = taxCalculation.taxLiability;
      taxProfile.effectiveTaxRate = taxCalculation.effectiveRate;
      taxProfile.lastCalculatedAt = new Date();
      taxProfile.calculationBreakdown = taxCalculation.breakdown;
      await taxProfile.save();
    } else {
      taxProfile = await TaxProfile.create({
        user: userId,
        account: accountId,
        taxYear,
        annualIncomeEstimate,
        totalDeductions: annualDeductionsEstimate,
        estimatedTaxLiability: taxCalculation.taxLiability,
        effectiveTaxRate: taxCalculation.effectiveRate,
        lastCalculatedAt: new Date(),
        calculationBreakdown: taxCalculation.breakdown
      });
    }

    return taxProfile;
  } catch (error) {
    console.error(`Error recalculating tax profile for year ${taxYear}:`, error);
    // Don't throw - we don't want to break transaction operations
    return null;
  }
};

/**
 * Recalculate tax profile based on transaction date
 * Automatically determines which tax year(s) need recalculation
 * @param {string} userId - User ID
 * @param {string} accountId - Account ID
 * @param {Date} transactionDate - Transaction date
 * @returns {Promise<void>}
 */
const recalculateTaxProfileForTransaction = async (userId, accountId, transactionDate) => {
  try {
    const taxYear = transactionDate.getFullYear();
    await recalculateTaxProfileForYear(userId, accountId, taxYear);
  } catch (error) {
    console.error('Error recalculating tax profile for transaction:', error);
    // Don't throw - non-blocking operation
  }
};

/**
 * Recalculate tax profiles for multiple years
 * Useful when bulk importing transactions
 * @param {string} userId - User ID
 * @param {string} accountId - Account ID
 * @param {Array<number>} taxYears - Array of tax years
 * @returns {Promise<void>}
 */
const recalculateTaxProfilesForYears = async (userId, accountId, taxYears) => {
  try {
    const uniqueYears = [...new Set(taxYears)];
    await Promise.all(
      uniqueYears.map(year => recalculateTaxProfileForYear(userId, accountId, year))
    );
  } catch (error) {
    console.error('Error recalculating tax profiles for years:', error);
  }
};

module.exports = {
  recalculateTaxProfileForYear,
  recalculateTaxProfileForTransaction,
  recalculateTaxProfilesForYears
};

