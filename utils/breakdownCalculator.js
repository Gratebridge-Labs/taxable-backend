/**
 * Breakdown Calculator
 * Generates detailed breakdowns of income, expenses, deductions, and tax calculations
 */

const IncomeSource = require('../models/IncomeSource');
const Deduction = require('../models/Deduction');
const TaxCalculation = require('../models/TaxCalculation');
const { calculateIndividualTaxComplete, calculateCompanyTaxComplete } = require('./taxCalculator');

/**
 * Generate income breakdown
 */
async function generateIncomeBreakdown(profileId, year) {
  const incomeSources = await IncomeSource.find({ 
    profileId, 
    'period.year': year 
  });

  const breakdown = {
    totalIncome: 0,
    sources: []
  };

  incomeSources.forEach(source => {
    const sourceData = {
      type: source.incomeType,
      description: getIncomeDescription(source),
      amount: source.totalAmount || 0,
      period: {
        startDate: source.period?.startDate,
        endDate: source.period?.endDate,
        year: source.period?.year,
        month: source.period?.month
      },
      details: getIncomeDetails(source)
    };

    breakdown.sources.push(sourceData);
    breakdown.totalIncome += sourceData.amount;
  });

  return breakdown;
}

/**
 * Generate deduction breakdown
 */
async function generateDeductionBreakdown(profileId, year) {
  const deductions = await Deduction.find({ 
    profileId, 
    'period.year': year 
  });

  const breakdown = {
    totalDeductions: 0,
    deductions: []
  };

  deductions.forEach(deduction => {
    const deductionData = {
      type: deduction.deductionType,
      description: getDeductionDescription(deduction),
      amount: deduction.amount || 0,
      calculation: getDeductionCalculation(deduction),
      maxAllowed: getDeductionMaxAllowed(deduction),
      status: deduction.isValid ? 'valid' : 'invalid',
      autoCalculated: isDeductionAutoCalculated(deduction)
    };

    breakdown.deductions.push(deductionData);
    breakdown.totalDeductions += deductionData.amount;
  });

  return breakdown;
}

/**
 * Generate tax calculation breakdown
 */
async function generateTaxBreakdown(profileId, year) {
  const calculation = await TaxCalculation.findOne({ 
    profileId, 
    'period.year': year,
    calculationType: 'annual'
  }).sort({ calculatedAt: -1 });

  if (!calculation) {
    return null;
  }

  const breakdown = {
    chargeableIncome: calculation.taxCalculation.chargeableIncome,
    taxBrackets: [],
    totalTax: 0,
    credits: calculation.credits,
    finalTaxLiability: calculation.finalTaxLiability,
    isRefund: calculation.isRefund,
    calculation: generateCalculationSteps(calculation)
  };

  // Individual tax brackets
  if (calculation.taxCalculation.individualTax) {
    const individualTax = calculation.taxCalculation.individualTax;
    breakdown.totalTax = individualTax.totalTax || 0;
    
    // Add bracket calculations
    if (individualTax.bracket1 && individualTax.bracket1.incomeInBracket > 0) {
      breakdown.taxBrackets.push({
        bracket: 1,
        range: '₦0 - ₦800,000',
        incomeInBracket: individualTax.bracket1.incomeInBracket,
        rate: '0%',
        tax: individualTax.bracket1.tax || 0,
        explanation: 'First ₦800,000 is tax-free'
      });
    }
    // Add other brackets similarly...
  }

  // Company tax
  if (calculation.taxCalculation.companyTax) {
    const companyTax = calculation.taxCalculation.companyTax;
    breakdown.totalTax = (companyTax.companyTax || 0) + (companyTax.developmentLevy || 0);
    breakdown.companyTax = {
      isSmallCompany: companyTax.isSmallCompany,
      taxRate: `${(companyTax.taxRate * 100).toFixed(0)}%`,
      assessableProfit: companyTax.assessableProfit,
      companyTax: companyTax.companyTax,
      developmentLevy: companyTax.developmentLevy
    };
  }

  return breakdown;
}

/**
 * Generate complete breakdown (all components)
 */
async function generateCompleteBreakdown(profileId, year) {
  const incomeBreakdown = await generateIncomeBreakdown(profileId, year);
  const deductionBreakdown = await generateDeductionBreakdown(profileId, year);
  const taxBreakdown = await generateTaxBreakdown(profileId, year);

  return {
    profileId,
    year,
    incomeBreakdown,
    deductionBreakdown,
    taxBreakdown,
    summary: {
      totalIncome: incomeBreakdown.totalIncome,
      totalDeductions: deductionBreakdown.totalDeductions,
      chargeableIncome: taxBreakdown?.chargeableIncome || 0,
      taxCalculated: taxBreakdown?.totalTax || 0,
      finalTaxPayable: taxBreakdown?.finalTaxLiability || 0,
      isRefund: taxBreakdown?.isRefund || false
    }
  };
}

// Helper functions
function getIncomeDescription(source) {
  switch (source.incomeType) {
    case 'employment':
      return `Salary from ${source.employment?.employerName || 'Employer'}`;
    case 'business':
      return `Business: ${source.business?.businessName || 'Business Income'}`;
    case 'rental':
      return `Rental Income (${source.rental?.properties?.length || 0} properties)`;
    case 'investment':
      return `Investment Income`;
    case 'other':
      return source.other?.description || 'Other Income';
    default:
      return 'Income';
  }
}

function getIncomeDetails(source) {
  switch (source.incomeType) {
    case 'employment':
      return {
        grossSalary: source.employment?.annualGrossSalary,
        basicSalary: source.employment?.basicSalary,
        housingAllowance: source.employment?.housingAllowance,
        transportAllowance: source.employment?.transportAllowance,
        payeDeducted: source.employment?.payeDeducted
      };
    case 'business':
      return {
        revenue: source.business?.annualRevenue,
        revenueBySource: source.business?.revenueBySource
      };
    case 'rental':
      return {
        properties: source.rental?.properties,
        totalRentalIncome: source.totalAmount,
        netRentalIncome: source.netAmount
      };
    default:
      return {};
  }
}

function getDeductionDescription(deduction) {
  const descriptions = {
    nhf: 'National Housing Fund (NHF)',
    nhis: 'National Health Insurance Scheme (NHIS)',
    pension: 'Pension Contribution',
    life_insurance: 'Life Insurance Premium',
    mortgage_interest: 'Mortgage Interest',
    rent_relief: 'Rent Relief',
    transport_allowance: 'Transport Allowance',
    other: deduction.other?.description || 'Other Deduction'
  };
  return descriptions[deduction.deductionType] || 'Deduction';
}

function getDeductionCalculation(deduction) {
  switch (deduction.deductionType) {
    case 'nhf':
      if (deduction.nhf?.autoCalculated && deduction.nhf?.basicSalary) {
        return `Basic Salary (₦${deduction.nhf.basicSalary.toLocaleString()}) × 2.5% = ₦${deduction.amount.toLocaleString()}`;
      }
      return `Actual contribution: ₦${deduction.amount.toLocaleString()}`;
    case 'rent_relief':
      if (deduction.rentRelief?.autoCalculated && deduction.rentRelief?.annualRent) {
        const calculated = deduction.rentRelief.annualRent * 0.20;
        if (calculated > 500000) {
          return `Annual Rent (₦${deduction.rentRelief.annualRent.toLocaleString()}) × 20% = ₦${calculated.toLocaleString()}, capped at ₦500,000`;
        }
        return `Annual Rent (₦${deduction.rentRelief.annualRent.toLocaleString()}) × 20% = ₦${deduction.amount.toLocaleString()}`;
      }
      return `Actual rent relief: ₦${deduction.amount.toLocaleString()}`;
    case 'pension':
      if (deduction.pension?.totalIncome) {
        const maxAllowed = deduction.pension.totalIncome * 0.25;
        return `Actual contribution: ₦${deduction.amount.toLocaleString()} (max: ₦${maxAllowed.toLocaleString()} - 25% of income)`;
      }
      return `Actual contribution: ₦${deduction.amount.toLocaleString()}`;
    default:
      return `Amount: ₦${deduction.amount.toLocaleString()}`;
  }
}

function getDeductionMaxAllowed(deduction) {
  switch (deduction.deductionType) {
    case 'rent_relief':
      return 500000;
    case 'transport_allowance':
      return 200000;
    case 'pension':
      return deduction.pension?.totalIncome ? deduction.pension.totalIncome * 0.25 : null;
    default:
      return null;
  }
}

function isDeductionAutoCalculated(deduction) {
  switch (deduction.deductionType) {
    case 'nhf':
      return deduction.nhf?.autoCalculated || false;
    case 'rent_relief':
      return deduction.rentRelief?.autoCalculated || false;
    default:
      return false;
  }
}

function generateCalculationSteps(calculation) {
  const steps = [];
  
  steps.push(`Step 1: Total Income: ₦${calculation.income.totalIncome.toLocaleString()}`);
  steps.push(`Step 2: Less Deductions: ₦${calculation.deductions.totalDeductions.toLocaleString()}`);
  steps.push(`Step 3: Chargeable Income: ₦${calculation.taxCalculation.chargeableIncome.toLocaleString()}`);
  
  if (calculation.taxCalculation.individualTax) {
    const tax = calculation.taxCalculation.individualTax;
    steps.push(`Step 4: Tax Calculation (Progressive Rates)`);
    if (tax.bracket1 && tax.bracket1.incomeInBracket > 0) {
      steps.push(`  - First ₦800,000 @ 0%: ₦0`);
    }
    if (tax.bracket2 && tax.bracket2.incomeInBracket > 0) {
      steps.push(`  - Next ₦${tax.bracket2.incomeInBracket.toLocaleString()} @ 15%: ₦${(tax.bracket2.tax || 0).toLocaleString()}`);
    }
    // Add other brackets...
    steps.push(`Step 5: Total Tax: ₦${tax.totalTax.toLocaleString()}`);
  }
  
  if (calculation.credits.payeDeducted > 0) {
    steps.push(`Step 6: Less PAYE Deducted: ₦${calculation.credits.payeDeducted.toLocaleString()}`);
  }
  
  steps.push(`Step 7: Final Tax ${calculation.isRefund ? 'Refund' : 'Payable'}: ₦${Math.abs(calculation.finalTaxLiability).toLocaleString()}`);
  
  return steps;
}

module.exports = {
  generateIncomeBreakdown,
  generateDeductionBreakdown,
  generateTaxBreakdown,
  generateCompleteBreakdown
};

