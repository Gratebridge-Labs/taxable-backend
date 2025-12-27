const TaxCalculation = require('../models/TaxCalculation');
const IncomeSource = require('../models/IncomeSource');
const Deduction = require('../models/Deduction');
const TaxableProfile = require('../models/TaxableProfile');
const { 
  calculateIndividualTaxComplete, 
  calculateCompanyTaxComplete 
} = require('../utils/taxCalculator');
const { generateCompleteBreakdown } = require('../utils/breakdownCalculator');

/**
 * Calculate tax for a profile
 */
const calculateTax = async (req, res) => {
  try {
    const { profileId } = req.params;
    const { year, calculationType = 'annual', month } = req.body;

    // Get profile
    const profile = await TaxableProfile.findOne({ 
      profileId,
      user: req.user.userId 
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    const taxYear = year || profile.year;

    // Get all income sources
    const incomeSources = await IncomeSource.find({ 
      profileId: profile._id,
      'period.year': taxYear 
    });

    // Get all deductions
    const deductions = await Deduction.find({ 
      profileId: profile._id,
      'period.year': taxYear 
    });

    let calculationResult;

    if (profile.profileType === 'Individual' || profile.profileType === 'Joint_Spouse') {
      // Calculate individual tax
      const payeDeducted = incomeSources
        .filter(s => s.incomeType === 'employment')
        .reduce((sum, s) => sum + (s.employment?.payeDeducted || 0), 0);
      
      const taxWithheldAtSource = incomeSources
        .filter(s => s.incomeType === 'investment')
        .reduce((sum, s) => {
          if (s.investment?.incomeItems) {
            return sum + s.investment.incomeItems.reduce((s, item) => s + (item.taxWithheld || 0), 0);
          }
          return sum;
        }, 0);

      calculationResult = calculateIndividualTaxComplete(
        incomeSources,
        deductions,
        payeDeducted,
        taxWithheldAtSource
      );
    } else if (profile.profileType === 'Business' || profile.profileType === 'Joint_Business') {
      // Calculate company tax
      // Get business expenses, capital allowances, etc. from question responses or separate models
      // For now, simplified version
      const expenses = []; // TODO: Get from business expenses model
      const capitalAllowances = []; // TODO: Get from capital assets model
      
      // Get turnover from income sources
      const turnover = incomeSources
        .filter(s => s.incomeType === 'business')
        .reduce((sum, s) => sum + (s.totalAmount || 0), 0);

      calculationResult = calculateCompanyTaxComplete(
        incomeSources,
        expenses,
        capitalAllowances,
        0, // R&D expenditure
        0, // Donations
        turnover,
        0, // Fixed assets - TODO: Get from profile
        false // Is professional services - TODO: Get from profile
      );
    }

    // Save calculation
    const taxCalculation = new TaxCalculation({
      profileId: profile._id,
      calculationType,
      period: {
        year: taxYear,
        month: month || null,
        startDate: new Date(taxYear, 0, 1),
        endDate: new Date(taxYear, 11, 31)
      },
      income: {
        totalIncome: calculationResult.income.totalIncome,
        employmentIncome: calculationResult.income.breakdown.find(b => b.type === 'employment')?.amount || 0,
        businessIncome: calculationResult.income.breakdown.find(b => b.type === 'business')?.amount || 0,
        rentalIncome: calculationResult.income.breakdown.find(b => b.type === 'rental')?.amount || 0,
        investmentIncome: calculationResult.income.breakdown.find(b => b.type === 'investment')?.amount || 0,
        otherIncome: calculationResult.income.breakdown.find(b => b.type === 'other')?.amount || 0
      },
      deductions: {
        totalDeductions: calculationResult.deductions.totalDeductions,
        nhf: calculationResult.deductions.breakdown.find(b => b.type === 'nhf')?.amount || 0,
        nhis: calculationResult.deductions.breakdown.find(b => b.type === 'nhis')?.amount || 0,
        pension: calculationResult.deductions.breakdown.find(b => b.type === 'pension')?.amount || 0,
        lifeInsurance: calculationResult.deductions.breakdown.find(b => b.type === 'life_insurance')?.amount || 0,
        mortgageInterest: calculationResult.deductions.breakdown.find(b => b.type === 'mortgage_interest')?.amount || 0,
        rentRelief: calculationResult.deductions.breakdown.find(b => b.type === 'rent_relief')?.amount || 0,
        transportAllowance: calculationResult.deductions.breakdown.find(b => b.type === 'transport_allowance')?.amount || 0,
        other: calculationResult.deductions.breakdown.find(b => b.type === 'other')?.amount || 0
      },
      taxCalculation: {
        chargeableIncome: calculationResult.chargeableIncome,
        individualTax: profile.profileType === 'Individual' || profile.profileType === 'Joint_Spouse' 
          ? calculationResult.taxCalculation 
          : null,
        companyTax: profile.profileType === 'Business' || profile.profileType === 'Joint_Business'
          ? calculationResult.taxCalculation
          : null
      },
      credits: calculationResult.credits,
      finalTaxLiability: calculationResult.finalTaxLiability,
      isRefund: calculationResult.isRefund,
      status: 'draft'
    });

    await taxCalculation.save();

    res.status(200).json({
      success: true,
      message: 'Tax calculation completed successfully',
      data: {
        calculationId: taxCalculation._id,
        calculation: calculationResult,
        calculationDetails: taxCalculation
      }
    });

  } catch (error) {
    console.error('Tax calculation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error calculating tax',
      error: error.message
    });
  }
};

/**
 * Get calculation breakdown
 */
const getBreakdown = async (req, res) => {
  try {
    const { profileId } = req.params;
    const { year } = req.query;

    // Get profile
    const profile = await TaxableProfile.findOne({ 
      profileId,
      user: req.user.userId 
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    const taxYear = parseInt(year) || profile.year;

    // Generate complete breakdown
    const breakdown = await generateCompleteBreakdown(profile._id, taxYear);

    res.status(200).json({
      success: true,
      message: 'Breakdown generated successfully',
      data: breakdown
    });

  } catch (error) {
    console.error('Breakdown generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating breakdown',
      error: error.message
    });
  }
};

/**
 * Get calculation history
 */
const getCalculationHistory = async (req, res) => {
  try {
    const { profileId } = req.params;

    // Get profile
    const profile = await TaxableProfile.findOne({ 
      profileId,
      user: req.user.userId 
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    const calculations = await TaxCalculation.find({ 
      profileId: profile._id 
    }).sort({ calculatedAt: -1 });

    res.status(200).json({
      success: true,
      message: 'Calculation history retrieved successfully',
      data: {
        calculations: calculations.map(calc => ({
          calculationId: calc._id,
          calculationType: calc.calculationType,
          period: calc.period,
          finalTaxLiability: calc.finalTaxLiability,
          isRefund: calc.isRefund,
          status: calc.status,
          calculatedAt: calc.calculatedAt
        }))
      }
    });

  } catch (error) {
    console.error('Get calculation history error:', error);
    res.status(500).json({
      success: false,
      message: 'Error retrieving calculation history',
      error: error.message
    });
  }
};

module.exports = {
  calculateTax,
  getBreakdown,
  getCalculationHistory
};

