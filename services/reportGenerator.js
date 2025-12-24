/**
 * Report Generator Service
 * Generates weekly, monthly, and annual reports with comprehensive data
 */

const Transaction = require('../models/Transaction');
const TaxProfile = require('../models/TaxProfile');
const Report = require('../models/Report');
const taxCalculator = require('./taxCalculator');
const tipsEngine = require('./tipsEngine');
const TAX_CONSTANTS = require('../config/constants');

class ReportGenerator {
  /**
   * Generate weekly report
   * @param {string} userId - User ID
   * @param {Date} weekStart - Start of the week (Monday)
   * @returns {Promise<Object>} Generated report
   */
  async generateWeeklyReport(userId, weekStart = null) {
    // If no weekStart provided, use current week
    if (!weekStart) {
      weekStart = this.getWeekStart(new Date());
    } else {
      weekStart = this.getWeekStart(weekStart);
    }

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    return await this.generateReport(
      userId,
      TAX_CONSTANTS.REPORT_TYPES.WEEKLY,
      weekStart,
      weekEnd
    );
  }

  /**
   * Generate monthly report
   * @param {string} userId - User ID
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Object>} Generated report
   */
  async generateMonthlyReport(userId, year = null, month = null) {
    const now = new Date();
    const reportYear = year || now.getFullYear();
    const reportMonth = month || (now.getMonth() + 1);

    const monthStart = new Date(reportYear, reportMonth - 1, 1);
    const monthEnd = new Date(reportYear, reportMonth, 0, 23, 59, 59, 999);

    return await this.generateReport(
      userId,
      TAX_CONSTANTS.REPORT_TYPES.MONTHLY,
      monthStart,
      monthEnd
    );
  }

  /**
   * Generate annual report
   * @param {string} userId - User ID
   * @param {number} year - Tax year
   * @returns {Promise<Object>} Generated report
   */
  async generateAnnualReport(userId, year = null) {
    const reportYear = year || new Date().getFullYear();
    const yearStart = new Date(reportYear, 0, 1);
    const yearEnd = new Date(reportYear, 11, 31, 23, 59, 59, 999);

    return await this.generateReport(
      userId,
      TAX_CONSTANTS.REPORT_TYPES.ANNUAL,
      yearStart,
      yearEnd
    );
  }

  /**
   * Generate custom date range report
   * @param {string} userId - User ID
   * @param {Date} startDate - Start date
   * @param {Date} endDate - End date
   * @returns {Promise<Object>} Generated report
   */
  async generateCustomReport(userId, startDate, endDate) {
    return await this.generateReport(
      userId,
      TAX_CONSTANTS.REPORT_TYPES.CUSTOM,
      startDate,
      endDate
    );
  }

  /**
   * Core report generation logic
   * @param {string} userId - User ID
   * @param {string} reportType - Report type
   * @param {Date} periodStart - Period start date
   * @param {Date} periodEnd - Period end date
   * @returns {Promise<Object>} Generated report
   */
  async generateReport(userId, reportType, periodStart, periodEnd) {
    // Get transactions for the period
    const transactions = await Transaction.find({
      user: userId,
      transactionDate: {
        $gte: periodStart,
        $lte: periodEnd
      }
    }).sort({ transactionDate: 1 });

    // Calculate totals
    const totals = this.calculateTotals(transactions);

    // Get category breakdown
    const categoryBreakdown = this.getCategoryBreakdown(transactions);

    // Get tax profile for the year
    const taxYear = periodEnd.getFullYear();
    let taxProfile = await TaxProfile.findOne({
      user: userId,
      taxYear
    });

    // Calculate tax estimate
    const taxCalculation = taxCalculator.calculatePersonalIncomeTax(
      totals.totalIncome,
      totals.totalDeductions
    );

    // Get user data for tips
    const userData = { userId }; // Can be expanded with actual user data
    const tips = tipsEngine.generatePersonalizedTips(
      userData,
      transactions,
      taxProfile || {}
    );
    const suggestions = tipsEngine.generateSuggestions(
      userData,
      transactions,
      taxProfile || {}
    );

    // Build report data
    const reportData = {
      period: {
        start: periodStart,
        end: periodEnd,
        days: Math.ceil((periodEnd - periodStart) / (1000 * 60 * 60 * 24)) + 1
      },
      transactions: {
        total: transactions.length,
        income: transactions.filter(t => t.transactionType === 'income').length,
        expenses: transactions.filter(t => t.transactionType === 'expense').length
      },
      financial: {
        totalIncome: totals.totalIncome,
        totalExpenses: totals.totalExpenses,
        netAmount: totals.totalIncome - totals.totalExpenses,
        totalDeductions: totals.totalDeductions
      },
      tax: {
        taxableIncome: taxCalculation.taxableIncome,
        estimatedTax: taxCalculation.taxLiability,
        effectiveRate: taxCalculation.effectiveRate,
        breakdown: taxCalculation.breakdown
      },
      categoryBreakdown,
      tips: tips.slice(0, 10), // Top 10 tips
      suggestions: suggestions.slice(0, 5) // Top 5 suggestions
    };

    // Create or update report
    const report = await Report.findOneAndUpdate(
      {
        user: userId,
        reportType,
        periodStart,
        periodEnd
      },
      {
        user: userId,
        taxProfile: taxProfile?._id || null,
        reportType,
        periodStart,
        periodEnd,
        totalIncome: totals.totalIncome,
        totalExpenses: totals.totalExpenses,
        totalDeductions: totals.totalDeductions,
        taxableIncome: taxCalculation.taxableIncome,
        estimatedTax: taxCalculation.taxLiability,
        effectiveTaxRate: taxCalculation.effectiveRate,
        tips: tips.slice(0, 10),
        suggestions: suggestions.slice(0, 5),
        reportData,
        summary: {
          netAmount: totals.totalIncome - totals.totalExpenses,
          transactionCount: transactions.length,
          averageDailyIncome: totals.totalIncome / Math.max(1, reportData.period.days),
          averageDailyExpenses: totals.totalExpenses / Math.max(1, reportData.period.days)
        },
        categoryBreakdown,
        generatedAt: new Date()
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    );

    return report;
  }

  /**
   * Calculate totals from transactions
   */
  calculateTotals(transactions) {
    let totalIncome = 0;
    let totalExpenses = 0;
    let totalDeductions = 0;

    transactions.forEach(tx => {
      if (tx.transactionType === 'income') {
        totalIncome += tx.amount || 0;
      } else if (tx.transactionType === 'expense') {
        totalExpenses += tx.amount || 0;
        if (tx.isTaxDeductible) {
          totalDeductions += tx.amount || 0;
        }
      }
    });

    return {
      totalIncome,
      totalExpenses,
      totalDeductions
    };
  }

  /**
   * Get category breakdown
   */
  getCategoryBreakdown(transactions) {
    const incomeByCategory = {};
    const expensesByCategory = {};

    transactions.forEach(tx => {
      if (tx.transactionType === 'income') {
        incomeByCategory[tx.category] = (incomeByCategory[tx.category] || 0) + (tx.amount || 0);
      } else {
        expensesByCategory[tx.category] = (expensesByCategory[tx.category] || 0) + (tx.amount || 0);
      }
    });

    return {
      income: incomeByCategory,
      expenses: expensesByCategory
    };
  }

  /**
   * Get start of week (Monday)
   */
  getWeekStart(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0); // Set to start of day
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
    const weekStart = new Date(d.setDate(diff));
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
  }

  /**
   * Get report history
   */
  async getReportHistory(userId, reportType = null, limit = 10) {
    const query = { user: userId };
    if (reportType) {
      query.reportType = reportType;
    }

    return await Report.find(query)
      .sort({ generatedAt: -1 })
      .limit(limit)
      .select('-reportData'); // Exclude large reportData for list view
  }
}

module.exports = new ReportGenerator();

