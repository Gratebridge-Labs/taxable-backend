const TaxProfile = require('../models/TaxProfile');
const Transaction = require('../models/Transaction');
const taxCalculator = require('../services/taxCalculator');
const { getYearToDate } = require('../utils/helpers');

// @desc    Get all tax profiles for current user
// @route   GET /api/tax-profiles
// @access  Private
const getTaxProfiles = async (req, res) => {
  try {
    const { taxYear } = req.query;

    const query = { user: req.user._id };
    if (taxYear) {
      query.taxYear = parseInt(taxYear);
    }

    const taxProfiles = await TaxProfile.find(query)
      .sort({ taxYear: -1 });

    res.json({
      success: true,
      data: { taxProfiles }
    });
  } catch (error) {
    console.error('Get tax profiles error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching tax profiles'
    });
  }
};

// @desc    Get single tax profile by year
// @route   GET /api/tax-profiles/:year
// @access  Private
const getTaxProfile = async (req, res) => {
  try {
    const { year } = req.params;
    const taxYear = parseInt(year);

    if (isNaN(taxYear)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tax year'
      });
    }

    let taxProfile = await TaxProfile.findOne({
      user: req.user._id,
      taxYear
    });

    // Create profile if it doesn't exist
    if (!taxProfile) {
      taxProfile = await TaxProfile.create({
        user: req.user._id,
        taxYear,
        annualIncomeEstimate: 0,
        totalDeductions: 0,
        estimatedTaxLiability: 0
      });
    }

    res.json({
      success: true,
      data: { taxProfile }
    });
  } catch (error) {
    console.error('Get tax profile error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching tax profile'
    });
  }
};

// @desc    Create or update tax profile
// @route   POST /api/tax-profiles
// @access  Private
const createOrUpdateTaxProfile = async (req, res) => {
  try {
    const { taxYear, annualIncomeEstimate, totalDeductions } = req.body;

    if (!taxYear) {
      return res.status(400).json({
        success: false,
        message: 'Tax year is required'
      });
    }

    const taxYearNum = parseInt(taxYear);
    if (isNaN(taxYearNum) || taxYearNum < 2000 || taxYearNum > 2100) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tax year'
      });
    }

    // Calculate tax estimate
    const income = annualIncomeEstimate || 0;
    const deductions = totalDeductions || 0;
    const taxCalculation = taxCalculator.calculatePersonalIncomeTax(income, deductions);

    // Find or create tax profile
    let taxProfile = await TaxProfile.findOne({
      user: req.user._id,
      taxYear: taxYearNum
    });

    if (taxProfile) {
      // Update existing profile
      taxProfile.annualIncomeEstimate = income;
      taxProfile.totalDeductions = deductions;
      taxProfile.estimatedTaxLiability = taxCalculation.taxLiability;
      taxProfile.effectiveTaxRate = taxCalculation.effectiveRate;
      taxProfile.lastCalculatedAt = new Date();
      taxProfile.calculationBreakdown = taxCalculation.breakdown;
      await taxProfile.save();
    } else {
      // Create new profile
      taxProfile = await TaxProfile.create({
        user: req.user._id,
        taxYear: taxYearNum,
        annualIncomeEstimate: income,
        totalDeductions: deductions,
        estimatedTaxLiability: taxCalculation.taxLiability,
        effectiveTaxRate: taxCalculation.effectiveRate,
        lastCalculatedAt: new Date(),
        calculationBreakdown: taxCalculation.breakdown
      });
    }

    res.json({
      success: true,
      message: 'Tax profile saved successfully',
      data: { taxProfile }
    });
  } catch (error) {
    console.error('Create/update tax profile error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error saving tax profile'
    });
  }
};

// @desc    Calculate tax estimate from transactions
// @route   GET /api/tax-profiles/:year/estimate
// @access  Private
const getTaxEstimate = async (req, res) => {
  try {
    const { year } = req.params;
    const taxYear = parseInt(year);

    if (isNaN(taxYear)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tax year'
      });
    }

    // Get date range for tax year
    const startDate = new Date(taxYear, 0, 1); // January 1
    const endDate = new Date(taxYear, 11, 31, 23, 59, 59, 999); // December 31

    // Get all transactions for the tax year
    const transactions = await Transaction.find({
      user: req.user._id,
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
    let projection = null;

    if (isCurrentYear) {
      // Project annual amounts from YTD data
      const { monthsElapsed } = getYearToDate();
      if (monthsElapsed > 0 && monthsElapsed < 12) {
        annualIncomeEstimate = (totalIncome / monthsElapsed) * 12;
        annualDeductionsEstimate = (totalDeductions / monthsElapsed) * 12;
        
        // Get projection
        projection = taxCalculator.projectAnnualTax(
          totalIncome,
          monthsElapsed,
          totalDeductions
        );
      }
    }

    // Calculate tax
    const taxCalculation = taxCalculator.calculatePersonalIncomeTax(
      annualIncomeEstimate,
      annualDeductionsEstimate
    );

    // Calculate weekly and monthly estimates
    const weeklyEstimate = taxCalculator.calculateWeeklyEstimate(taxCalculation.taxLiability);
    const monthlyEstimate = taxCalculator.calculateMonthlyEstimate(taxCalculation.taxLiability);

    // Update or create tax profile
    let taxProfile = await TaxProfile.findOne({
      user: req.user._id,
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
        user: req.user._id,
        taxYear,
        annualIncomeEstimate,
        totalDeductions: annualDeductionsEstimate,
        estimatedTaxLiability: taxCalculation.taxLiability,
        effectiveTaxRate: taxCalculation.effectiveRate,
        lastCalculatedAt: new Date(),
        calculationBreakdown: taxCalculation.breakdown
      });
    }

    res.json({
      success: true,
      data: {
        taxProfile,
        estimate: {
          yearToDate: {
            income: totalIncome,
            deductions: totalDeductions
          },
          projected: {
            annualIncome: annualIncomeEstimate,
            annualDeductions: annualDeductionsEstimate,
            taxLiability: taxCalculation.taxLiability,
            effectiveRate: taxCalculation.effectiveRate,
            weeklyEstimate,
            monthlyEstimate,
            breakdown: taxCalculation.breakdown
          },
          projection: projection ? {
            projectedAnnualIncome: projection.taxableIncome + annualDeductionsEstimate,
            projectedTaxLiability: projection.taxLiability,
            monthsElapsed: getYearToDate().monthsElapsed
          } : null
        }
      }
    });
  } catch (error) {
    console.error('Get tax estimate error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error calculating tax estimate'
    });
  }
};

// @desc    Get tax profile summary
// @route   GET /api/tax-profiles/:year/summary
// @access  Private
const getTaxProfileSummary = async (req, res) => {
  try {
    const { year } = req.params;
    const taxYear = parseInt(year);

    if (isNaN(taxYear)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tax year'
      });
    }

    // Get tax profile
    let taxProfile = await TaxProfile.findOne({
      user: req.user._id,
      taxYear
    });

    if (!taxProfile) {
      // Create default profile
      taxProfile = await TaxProfile.create({
        user: req.user._id,
        taxYear,
        annualIncomeEstimate: 0,
        totalDeductions: 0,
        estimatedTaxLiability: 0
      });
    }

    // Get transaction summary for the year
    const startDate = new Date(taxYear, 0, 1);
    const endDate = new Date(taxYear, 11, 31, 23, 59, 59, 999);

    const transactionSummary = await Transaction.aggregate([
      {
        $match: {
          user: req.user._id,
          transactionDate: {
            $gte: startDate,
            $lte: endDate
          }
        }
      },
      {
        $group: {
          _id: null,
          totalIncome: {
            $sum: {
              $cond: [{ $eq: ['$transactionType', 'income'] }, '$amount', 0]
            }
          },
          totalExpenses: {
            $sum: {
              $cond: [{ $eq: ['$transactionType', 'expense'] }, '$amount', 0]
            }
          },
          totalDeductions: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ['$transactionType', 'expense'] }, { $eq: ['$isTaxDeductible', true] }] },
                '$amount',
                0
              ]
            }
          },
          transactionCount: { $sum: 1 }
        }
      }
    ]);

    const summary = transactionSummary[0] || {
      totalIncome: 0,
      totalExpenses: 0,
      totalDeductions: 0,
      transactionCount: 0
    };

    res.json({
      success: true,
      data: {
        taxProfile,
        summary: {
          taxYear,
          annualIncomeEstimate: taxProfile.annualIncomeEstimate,
          actualIncome: summary.totalIncome,
          totalDeductions: taxProfile.totalDeductions,
          actualDeductions: summary.totalDeductions,
          estimatedTaxLiability: taxProfile.estimatedTaxLiability,
          effectiveTaxRate: taxProfile.effectiveTaxRate,
          weeklyEstimate: taxProfile.weeklyEstimate,
          monthlyEstimate: taxProfile.monthlyEstimate,
          transactionCount: summary.transactionCount,
          calculationBreakdown: taxProfile.calculationBreakdown,
          lastCalculatedAt: taxProfile.lastCalculatedAt
        }
      }
    });
  } catch (error) {
    console.error('Get tax profile summary error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error fetching tax profile summary'
    });
  }
};

// @desc    Recalculate tax profile from transactions
// @route   POST /api/tax-profiles/:year/recalculate
// @access  Private
const recalculateTaxProfile = async (req, res) => {
  try {
    const { year } = req.params;
    const taxYear = parseInt(year);

    if (isNaN(taxYear)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid tax year'
      });
    }

    // This is essentially the same as getTaxEstimate but forces recalculation
    const startDate = new Date(taxYear, 0, 1);
    const endDate = new Date(taxYear, 11, 31, 23, 59, 59, 999);

    const transactions = await Transaction.find({
      user: req.user._id,
      transactionDate: {
        $gte: startDate,
        $lte: endDate
      }
    });

    let totalIncome = 0;
    let totalDeductions = 0;

    transactions.forEach(tx => {
      if (tx.transactionType === 'income') {
        totalIncome += tx.amount || 0;
      } else if (tx.transactionType === 'expense' && tx.isTaxDeductible) {
        totalDeductions += tx.amount || 0;
      }
    });

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

    const taxCalculation = taxCalculator.calculatePersonalIncomeTax(
      annualIncomeEstimate,
      annualDeductionsEstimate
    );

    // Update tax profile
    let taxProfile = await TaxProfile.findOne({
      user: req.user._id,
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
        user: req.user._id,
        taxYear,
        annualIncomeEstimate,
        totalDeductions: annualDeductionsEstimate,
        estimatedTaxLiability: taxCalculation.taxLiability,
        effectiveTaxRate: taxCalculation.effectiveRate,
        lastCalculatedAt: new Date(),
        calculationBreakdown: taxCalculation.breakdown
      });
    }

    res.json({
      success: true,
      message: 'Tax profile recalculated successfully',
      data: {
        taxProfile,
        calculation: {
          yearToDateIncome: totalIncome,
          yearToDateDeductions: totalDeductions,
          projectedAnnualIncome: annualIncomeEstimate,
          projectedAnnualDeductions: annualDeductionsEstimate,
          taxLiability: taxCalculation.taxLiability,
          effectiveRate: taxCalculation.effectiveRate,
          breakdown: taxCalculation.breakdown
        }
      }
    });
  } catch (error) {
    console.error('Recalculate tax profile error:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Error recalculating tax profile'
    });
  }
};

module.exports = {
  getTaxProfiles,
  getTaxProfile,
  createOrUpdateTaxProfile,
  getTaxEstimate,
  getTaxProfileSummary,
  recalculateTaxProfile
};

