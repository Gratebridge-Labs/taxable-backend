const TaxCalculation = require('../models/TaxCalculation');
const IncomeSource = require('../models/IncomeSource');
const IncomeData = require('../models/IncomeData');
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

/**
 * Get tax summary for a profile (WhatsApp-style summary)
 */
const getTaxSummary = async (req, res) => {
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
    const s = breakdown?.summary || {};

    // Format NIN for display
    const nin = profile.primaryNIN || '';
    const ninDisplay = nin.length >= 3 ? `****${nin.slice(-3)}` : '—';

    // Get income sources list
    const incomeList = Array.isArray(profile.primaryIncomeSources) && profile.primaryIncomeSources.length
      ? profile.primaryIncomeSources.join(', ')
      : '—';

    // Get tax authority
    const state = profile.state || '—';
    const stateIRS = state !== '—' ? `${state} Internal Revenue Service` : '—';

    // Format amounts
    const fmt = (n) => (n != null && Number(n) >= 0 ? `₦${Number(n).toLocaleString()}` : '—');

    // Get deductible amounts from profile
    const rentVal = profile.rentAnnualAmount || (profile.rentMonthlyAmount ? profile.rentMonthlyAmount * 12 : 0);
    const rent = profile.paysRent ? fmt(rentVal) : '—';
    const healthVal = profile.healthInsuranceAnnualAmount || (profile.healthInsuranceMonthlyAmount ? profile.healthInsuranceMonthlyAmount * 12 : 0);
    const health = profile.hasHealthInsurance ? fmt(healthVal) : '—';
    const pensionVal = profile.pensionAnnualAmount || (profile.pensionMonthlyAmount ? profile.pensionMonthlyAmount * 12 : 0);
    const pension = profile.hasPension ? fmt(pensionVal) : '—';
    const mortgageVal = profile.mortgageAnnualAmount || (profile.mortgageMonthlyAmount ? profile.mortgageMonthlyAmount * 12 : 0);
    const mortgage = profile.paysMortgage ? fmt(mortgageVal) : '—';

    const filingPref = profile.filingPreference || '—';
    const filingLabel = filingPref === 'monthly' ? 'Monthly' : filingPref === 'annual' ? 'Annual' : filingPref;

    // Calculate monthly tax if annual tax available
    const annualTax = s.finalTaxPayable ?? s.taxCalculated ?? 0;
    const monthlyTax = annualTax > 0 ? Math.round(annualTax / 12) : null;

    // Determine next steps based on profile status
    let nextSteps = [];
    if (profile.filingStatus === 'draft') {
      nextSteps.push('Complete profile details');
      nextSteps.push('Upload supporting documents');
      nextSteps.push('Submit for review or file directly');
    } else if (profile.filingStatus === 'submitted') {
      nextSteps.push('Wait for tax agent review');
      nextSteps.push('Pay accountant review fee (₦30,000) if needed');
    } else if (profile.filingStatus === 'tax_agent_review') {
      nextSteps.push('Tax agent reviewing your profile');
      nextSteps.push('Pay filing fee (₦25,000) when ready to file');
    } else if (profile.filingStatus === 'filed') {
      nextSteps.push('Tax filing completed');
      nextSteps.push('Download filing receipt');
    }

    // Payment options
    const paymentOptions = [];
    if (profile.filingStatus === 'submitted' || profile.filingStatus === 'draft') {
      paymentOptions.push({
        type: 'accountant_review',
        amount: 30000,
        description: 'Tax agent review fee',
        status: 'available'
      });
    }
    if (profile.filingStatus === 'tax_agent_review') {
      paymentOptions.push({
        type: 'filing_fee',
        amount: 25000,
        description: 'Tax filing fee',
        status: 'available'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Tax summary retrieved successfully',
      data: {
        profile: {
          profileId: profile.profileId,
          year: profile.year,
          profileType: profile.profileType,
          filingStatus: profile.filingStatus,
          filingPreference: filingLabel,
          nin: ninDisplay,
          incomeSources: incomeList,
          taxAuthority: stateIRS,
          deductibles: {
            rent: { display: rent, annualAmount: rentVal },
            healthInsurance: { display: health, annualAmount: healthVal },
            pension: { display: pension, annualAmount: pensionVal },
            mortgage: { display: mortgage, annualAmount: mortgageVal }
          }
        },
        taxSummary: {
          totalIncome: s.totalIncome ?? 0,
          totalDeductions: s.totalDeductions ?? 0,
          chargeableIncome: s.chargeableIncome ?? 0,
          estimatedAnnualTax: annualTax,
          estimatedMonthlyTax: monthlyTax,
          isRefund: s.isRefund ?? false,
          breakdownAvailable: !!breakdown.taxBreakdown
        },
        nextSteps,
        paymentOptions,
        actions: {
          canSubmit: profile.filingStatus === 'draft',
          canPayAccountantReview: ['draft', 'submitted'].includes(profile.filingStatus),
          canPayFilingFee: profile.filingStatus === 'tax_agent_review',
          canFile: profile.filingStatus === 'tax_agent_review' && profile.filed !== true
        },
        breakdown: {
          income: breakdown.incomeBreakdown,
          deductions: breakdown.deductionBreakdown,
          tax: breakdown.taxBreakdown
        }
      }
    });

  } catch (error) {
    console.error('Tax summary error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating tax summary',
      error: error.message
    });
  }
};

/**
 * Web-specific tax calculation with PDF-expected format
 * GET /taxableprofile/web/:profileId/calculate
 */
const calculateWebTax = async (req, res) => {
  try {
    const userId = req.user?.userId;
    const { profileId } = req.params;
    const monthQuery = req.query?.month;
    const requestedMonth = monthQuery !== undefined ? Number(monthQuery) : null;

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: 'Unauthorized'
      });
    }

    // Find profile (user must own it)
    const profile = await TaxableProfile.findByProfileIdOrId(profileId, userId);
    if (!profile) {
      return res.status(404).json({
        success: false,
        message: 'Tax profile not found'
      });
    }

    // Profile completeness check for the 12 flow fields
    const requiredProfileFields = [
      'primaryNIN',
      'primaryIncomeSources',
      'residency183Days',
      'paysRent',
      'hasHealthInsurance',
      'hasPension',
      'paysMortgage',
      'filingPreference',
      'dob',
      'street',
      'city',
      'state'
    ];
    const missingProfileFields = requiredProfileFields.filter((field) => profile[field] === undefined);
    if (missingProfileFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient data: tax profile is not complete',
        data: { missingProfileFields }
      });
    }

    const taxYear = profile.year;
    const filingPreference = profile.filingPreference;
    if (!['monthly', 'annual'].includes(filingPreference)) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient data: filingPreference must be monthly or annual'
      });
    }

    if (filingPreference === 'monthly' && (!requestedMonth || requestedMonth < 1 || requestedMonth > 12)) {
      return res.status(400).json({
        success: false,
        message: 'For monthly filing, provide a valid month query (1-12)'
      });
    }

    const incomeData = await IncomeData.findOne({
      profileId: profile._id,
      year: taxYear
    }).lean();
    if (!incomeData) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient data: income data not found'
      });
    }

    const allDeductions = await Deduction.find({
      profileId: profile._id,
      'period.year': taxYear
    }).lean();
    if (!allDeductions.length) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient data: deductions data not found'
      });
    }

    const incomeItemsForPeriod = (() => {
      if (filingPreference === 'annual') {
        return Array.isArray(incomeData.annualIncomes) ? incomeData.annualIncomes : [];
      }
      const monthlyMap = incomeData.monthlyIncomes || {};
      const monthItems = monthlyMap[String(requestedMonth)] || [];
      return Array.isArray(monthItems) ? monthItems : [];
    })();

    if (!incomeItemsForPeriod.length) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient data: no income data found for requested period'
      });
    }

    const deductionItemsForPeriod = (() => {
      if (filingPreference === 'annual') {
        return allDeductions.filter((d) => d.frequency === 'annual' || d.month == null);
      }
      return allDeductions.filter((d) => {
        if (d.frequency === 'monthly') return d.month === requestedMonth;
        return d.month == null || d.frequency === 'annual';
      });
    })();

    if (!deductionItemsForPeriod.length) {
      return res.status(400).json({
        success: false,
        message: 'Insufficient data: no deductions data found for requested period'
      });
    }

    const toNum = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0);
    const incomeAmount = incomeItemsForPeriod.reduce((sum, item) => {
      const type = String(item?.type || '').toLowerCase();
      if (type === 'employment') {
        return sum + toNum(item.grossSalary) + toNum(item.bonuses) + toNum(item.commissions);
      }
      if (type === 'digital_assets' || type === 'freelance') {
        return sum + toNum(item.value);
      }
      return sum + toNum(item.value || item.amount || item.grossSalary);
    }, 0);

    const totalCalculatedRelief = deductionItemsForPeriod.reduce((sum, d) => {
      const amount = toNum(d.amount);
      if (filingPreference === 'monthly' && d.frequency === 'annual') {
        return sum + (amount / 12);
      }
      return sum + amount;
    }, 0);

    const taxableIncome = Math.max(0, incomeAmount - totalCalculatedRelief);

    const computeProgressiveTax = (baseIncome) => {
      const brackets = [
        { from: 0, to: 300000, rate: 0.07 },
        { from: 300001, to: 600000, rate: 0.11 },
        { from: 600001, to: 1100000, rate: 0.15 },
        { from: 1100001, to: 1600000, rate: 0.19 },
        { from: 1600001, to: 3200000, rate: 0.21 },
        { from: 3200001, to: Infinity, rate: 0.24 }
      ];

      let remaining = baseIncome;
      let tax = 0;
      for (const bracket of brackets) {
        if (remaining <= 0) break;
        const range = bracket.to === Infinity
          ? remaining
          : Math.min(bracket.to - bracket.from + 1, remaining);
        const taxableInBracket = Math.min(range, remaining);
        tax += taxableInBracket * bracket.rate;
        remaining -= taxableInBracket;
      }
      return tax;
    };

    const annualizedTaxableIncome = filingPreference === 'monthly' ? taxableIncome * 12 : taxableIncome;
    const annualTaxAmount = computeProgressiveTax(annualizedTaxableIncome);
    const monthlyTax = annualTaxAmount / 12;
    const totalTaxAmount = filingPreference === 'monthly' ? monthlyTax : annualTaxAmount;

    return res.status(200).json({
      success: true,
      data: {
        profileId: profile.profileId,
        year: taxYear,
        filingPreference,
        month: filingPreference === 'monthly' ? requestedMonth : null,
        taxSummary: {
          totalIncome: incomeAmount,
          totalCalculatedRelief,
          taxableIncome,
          totalTaxAmount,
          monthlyTax
        }
      }
    });
  } catch (error) {
    console.error('Calculate web tax error:', error);
    res.status(500).json({
      success: false,
      message: 'An error occurred while calculating tax',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

module.exports = {
  calculateTax,
  getBreakdown,
  getCalculationHistory,
  getTaxSummary,
  calculateWebTax
};

