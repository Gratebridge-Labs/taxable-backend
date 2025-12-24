/**
 * History Service
 * Generates and manages financial history snapshots
 */

const History = require('../models/History');
const Transaction = require('../models/Transaction');
const TaxProfile = require('../models/TaxProfile');
const taxCalculator = require('./taxCalculator');

class HistoryService {
  /**
   * Generate weekly snapshot
   * @param {string} userId - User ID
   * @param {string} accountId - Account ID
   * @param {Date} weekStart - Start of week (Monday)
   * @returns {Promise<Object>} History snapshot
   */
  async generateWeeklySnapshot(userId, accountId, weekStart = null) {
    // If no weekStart provided, use current week
    if (!weekStart) {
      weekStart = this.getWeekStart(new Date());
    } else {
      weekStart = this.getWeekStart(weekStart);
    }

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    return await this.generateSnapshot(
      userId,
      accountId,
      'weekly',
      weekStart,
      weekEnd
    );
  }

  /**
   * Generate monthly snapshot
   * @param {string} userId - User ID
   * @param {string} accountId - Account ID
   * @param {number} year - Year
   * @param {number} month - Month (1-12)
   * @returns {Promise<Object>} History snapshot
   */
  async generateMonthlySnapshot(userId, accountId, year = null, month = null) {
    const now = new Date();
    const reportYear = year || now.getFullYear();
    const reportMonth = month || (now.getMonth() + 1);

    const monthStart = new Date(reportYear, reportMonth - 1, 1);
    const monthEnd = new Date(reportYear, reportMonth, 0, 23, 59, 59, 999);

    return await this.generateSnapshot(
      userId,
      accountId,
      'monthly',
      monthStart,
      monthEnd
    );
  }

  /**
   * Generate annual snapshot
   * @param {string} userId - User ID
   * @param {string} accountId - Account ID
   * @param {number} year - Tax year
   * @returns {Promise<Object>} History snapshot
   */
  async generateAnnualSnapshot(userId, accountId, year = null) {
    const reportYear = year || new Date().getFullYear();
    const yearStart = new Date(reportYear, 0, 1);
    const yearEnd = new Date(reportYear, 11, 31, 23, 59, 59, 999);

    return await this.generateSnapshot(
      userId,
      accountId,
      'annual',
      yearStart,
      yearEnd
    );
  }

  /**
   * Core snapshot generation logic
   */
  async generateSnapshot(userId, accountId, snapshotType, periodStart, periodEnd) {
    // Get transactions for the period
    const transactions = await Transaction.find({
      user: userId,
      account: accountId,
      transactionDate: {
        $gte: periodStart,
        $lte: periodEnd
      }
    });

    // Calculate totals
    let totalIncome = 0;
    let totalExpenses = 0;
    let totalDeductions = 0;
    const categoryBreakdown = {
      income: {},
      expenses: {}
    };

    transactions.forEach(tx => {
      if (tx.transactionType === 'income') {
        totalIncome += tx.amount || 0;
        categoryBreakdown.income[tx.category] = 
          (categoryBreakdown.income[tx.category] || 0) + (tx.amount || 0);
      } else {
        totalExpenses += tx.amount || 0;
        categoryBreakdown.expenses[tx.category] = 
          (categoryBreakdown.expenses[tx.category] || 0) + (tx.amount || 0);
        if (tx.isTaxDeductible) {
          totalDeductions += tx.amount || 0;
        }
      }
    });

    const netAmount = totalIncome - totalExpenses;

    // Get tax profile for the year
    const taxYear = periodEnd.getFullYear();
    const taxProfile = await TaxProfile.findOne({
      user: userId,
      account: accountId,
      taxYear
    });

    // Calculate tax estimate
    const taxCalculation = taxCalculator.calculatePersonalIncomeTax(
      totalIncome,
      totalDeductions
    );

    // Create or update snapshot
    const snapshot = await History.findOneAndUpdate(
      {
        user: userId,
        account: accountId,
        snapshotType,
        periodStart,
        periodEnd
      },
      {
        user: userId,
        account: accountId,
        snapshotType,
        snapshotDate: new Date(),
        periodStart,
        periodEnd,
        totalIncome,
        totalExpenses,
        totalDeductions,
        netAmount,
        estimatedTax: taxCalculation.taxLiability,
        effectiveTaxRate: taxCalculation.effectiveRate,
        transactionCount: transactions.length,
        incomeTransactionCount: transactions.filter(t => t.transactionType === 'income').length,
        expenseTransactionCount: transactions.filter(t => t.transactionType === 'expense').length,
        categoryBreakdown,
        metadata: {
          taxYear,
          taxProfileId: taxProfile?._id
        }
      },
      {
        new: true,
        upsert: true,
        runValidators: true
      }
    );

    return snapshot;
  }

  /**
   * Get history snapshots
   */
  async getHistory(userId, accountId, snapshotType = null, limit = 50) {
    const query = {
      user: userId,
      account: accountId
    };

    if (snapshotType) {
      query.snapshotType = snapshotType;
    }

    return await History.find(query)
      .sort({ snapshotDate: -1 })
      .limit(parseInt(limit));
  }

  /**
   * Compare two periods
   */
  async comparePeriods(userId, accountId, period1Id, period2Id) {
    const period1 = await History.findOne({
      _id: period1Id,
      user: userId,
      account: accountId
    });

    const period2 = await History.findOne({
      _id: period2Id,
      user: userId,
      account: accountId
    });

    if (!period1 || !period2) {
      throw new Error('One or both periods not found');
    }

    return {
      period1,
      period2,
      comparison: {
        income: {
          change: period2.totalIncome - period1.totalIncome,
          changePercent: period1.totalIncome > 0 
            ? ((period2.totalIncome - period1.totalIncome) / period1.totalIncome) * 100 
            : 0
        },
        expenses: {
          change: period2.totalExpenses - period1.totalExpenses,
          changePercent: period1.totalExpenses > 0 
            ? ((period2.totalExpenses - period1.totalExpenses) / period1.totalExpenses) * 100 
            : 0
        },
        netAmount: {
          change: period2.netAmount - period1.netAmount,
          changePercent: period1.netAmount !== 0 
            ? ((period2.netAmount - period1.netAmount) / Math.abs(period1.netAmount)) * 100 
            : 0
        },
        tax: {
          change: period2.estimatedTax - period1.estimatedTax,
          changePercent: period1.estimatedTax > 0 
            ? ((period2.estimatedTax - period1.estimatedTax) / period1.estimatedTax) * 100 
            : 0
        }
      }
    };
  }

  /**
   * Get trend analysis
   */
  async getTrendAnalysis(userId, accountId, snapshotType, periods = 12) {
    const snapshots = await History.find({
      user: userId,
      account: accountId,
      snapshotType
    })
      .sort({ snapshotDate: -1 })
      .limit(parseInt(periods));

    if (snapshots.length < 2) {
      return {
        trend: 'insufficient_data',
        message: 'Need at least 2 snapshots for trend analysis'
      };
    }

    // Calculate trends
    const incomeTrend = this.calculateTrend(snapshots.map(s => s.totalIncome));
    const expenseTrend = this.calculateTrend(snapshots.map(s => s.totalExpenses));
    const netTrend = this.calculateTrend(snapshots.map(s => s.netAmount));
    const taxTrend = this.calculateTrend(snapshots.map(s => s.estimatedTax));

    return {
      snapshots: snapshots.reverse(), // Oldest first for trend visualization
      trends: {
        income: incomeTrend,
        expenses: expenseTrend,
        netAmount: netTrend,
        tax: taxTrend
      },
      summary: {
        averageIncome: snapshots.reduce((sum, s) => sum + s.totalIncome, 0) / snapshots.length,
        averageExpenses: snapshots.reduce((sum, s) => sum + s.totalExpenses, 0) / snapshots.length,
        averageNet: snapshots.reduce((sum, s) => sum + s.netAmount, 0) / snapshots.length
      }
    };
  }

  /**
   * Calculate trend direction and strength
   */
  calculateTrend(values) {
    if (values.length < 2) return { direction: 'stable', strength: 0 };

    // Simple linear regression
    const n = values.length;
    const x = Array.from({ length: n }, (_, i) => i + 1);
    const sumX = x.reduce((a, b) => a + b, 0);
    const sumY = values.reduce((a, b) => a + b, 0);
    const sumXY = x.reduce((sum, xi, i) => sum + xi * values[i], 0);
    const sumXX = x.reduce((sum, xi) => sum + xi * xi, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const avgY = sumY / n;
    const percentChange = (slope / Math.abs(avgY)) * 100;

    let direction = 'stable';
    if (slope > 0.05 * avgY) direction = 'increasing';
    else if (slope < -0.05 * avgY) direction = 'decreasing';

    return {
      direction,
      slope,
      percentChange,
      strength: Math.abs(percentChange) < 5 ? 'weak' : 
                Math.abs(percentChange) < 15 ? 'moderate' : 'strong'
    };
  }

  /**
   * Year-over-year comparison
   */
  async getYearOverYearComparison(userId, accountId, year1, year2) {
    const year1Snapshots = await History.find({
      user: userId,
      account: accountId,
      snapshotType: 'annual',
      periodStart: { $gte: new Date(year1, 0, 1), $lt: new Date(year1 + 1, 0, 1) }
    });

    const year2Snapshots = await History.find({
      user: userId,
      account: accountId,
      snapshotType: 'annual',
      periodStart: { $gte: new Date(year2, 0, 1), $lt: new Date(year2 + 1, 0, 1) }
    });

    // Get annual summaries
    const year1Summary = year1Snapshots.length > 0 ? year1Snapshots[0] : null;
    const year2Summary = year2Snapshots.length > 0 ? year2Snapshots[0] : null;

    if (!year1Summary || !year2Summary) {
      throw new Error('Insufficient data for year-over-year comparison');
    }

    return {
      year1: {
        year: year1,
        summary: year1Summary
      },
      year2: {
        year: year2,
        summary: year2Summary
      },
      comparison: {
        income: {
          change: year2Summary.totalIncome - year1Summary.totalIncome,
          changePercent: year1Summary.totalIncome > 0 
            ? ((year2Summary.totalIncome - year1Summary.totalIncome) / year1Summary.totalIncome) * 100 
            : 0
        },
        expenses: {
          change: year2Summary.totalExpenses - year1Summary.totalExpenses,
          changePercent: year1Summary.totalExpenses > 0 
            ? ((year2Summary.totalExpenses - year1Summary.totalExpenses) / year1Summary.totalExpenses) * 100 
            : 0
        },
        tax: {
          change: year2Summary.estimatedTax - year1Summary.estimatedTax,
          changePercent: year1Summary.estimatedTax > 0 
            ? ((year2Summary.estimatedTax - year1Summary.estimatedTax) / year1Summary.estimatedTax) * 100 
            : 0
        }
      }
    };
  }

  /**
   * Get start of week (Monday)
   */
  getWeekStart(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const weekStart = new Date(d.setDate(diff));
    weekStart.setHours(0, 0, 0, 0);
    return weekStart;
  }
}

module.exports = new HistoryService();

