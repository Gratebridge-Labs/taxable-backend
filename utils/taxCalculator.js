/**
 * Tax Calculation Engine
 * Calculates tax based on Nigeria Tax Act 2025
 */

const TAX_BRACKETS = [
  { min: 0, max: 800000, rate: 0.00 },
  { min: 800001, max: 3000000, rate: 0.15 },
  { min: 3000001, max: 12000000, rate: 0.18 },
  { min: 12000001, max: 25000000, rate: 0.21 },
  { min: 25000001, max: 50000000, rate: 0.23 },
  { min: 50000001, max: null, rate: 0.25 }
];

/**
 * Calculate individual tax using progressive brackets
 */
function calculateIndividualTax(chargeableIncome) {
  if (!chargeableIncome || chargeableIncome <= 0) {
    return {
      totalTax: 0,
      brackets: [],
      breakdown: []
    };
  }

  let remainingIncome = chargeableIncome;
  let totalTax = 0;
  const bracketCalculations = [];

  for (let i = 0; i < TAX_BRACKETS.length && remainingIncome > 0; i++) {
    const bracket = TAX_BRACKETS[i];
    const bracketMin = bracket.min;
    const bracketMax = bracket.max === null ? Infinity : bracket.max;
    const bracketRange = bracketMax - bracketMin + 1;

    let incomeInBracket = 0;
    if (remainingIncome > 0) {
      if (remainingIncome >= bracketRange) {
        incomeInBracket = bracketRange;
      } else {
        incomeInBracket = remainingIncome;
      }
    }

    if (incomeInBracket > 0) {
      const taxInBracket = incomeInBracket * bracket.rate;
      totalTax += taxInBracket;

      bracketCalculations.push({
        bracket: i + 1,
        range: bracketMax === null 
          ? `Above ₦${bracketMin.toLocaleString()}`
          : `₦${bracketMin.toLocaleString()} - ₦${bracketMax.toLocaleString()}`,
        incomeInBracket: incomeInBracket,
        rate: `${(bracket.rate * 100).toFixed(0)}%`,
        tax: taxInBracket,
        explanation: bracketMax === null
          ? `Above ₦${bracketMin.toLocaleString()} taxed at ${(bracket.rate * 100).toFixed(0)}%`
          : `Next ₦${(bracketMax - bracketMin + 1).toLocaleString()} taxed at ${(bracket.rate * 100).toFixed(0)}%`
      });

      remainingIncome -= incomeInBracket;
    }
  }

  return {
    totalTax: totalTax,
    brackets: bracketCalculations,
    breakdown: bracketCalculations
  };
}

/**
 * Calculate company tax
 */
function calculateCompanyTax(assessableProfit, isSmallCompany = false) {
  if (!assessableProfit || assessableProfit <= 0) {
    return {
      companyTax: 0,
      developmentLevy: 0,
      totalTax: 0,
      taxRate: isSmallCompany ? 0 : 0.30
    };
  }

  const taxRate = isSmallCompany ? 0 : 0.30;
  const companyTax = assessableProfit * taxRate;
  
  // Development levy (4% of assessable profit, not for small companies)
  const developmentLevy = isSmallCompany ? 0 : assessableProfit * 0.04;
  
  const totalTax = companyTax + developmentLevy;

  return {
    companyTax: companyTax,
    developmentLevy: developmentLevy,
    totalTax: totalTax,
    taxRate: taxRate,
    isSmallCompany: isSmallCompany
  };
}

/**
 * Calculate rent relief (20% of annual rent, max ₦500,000)
 */
function calculateRentRelief(annualRent) {
  if (!annualRent || annualRent <= 0) {
    return 0;
  }
  return Math.min(annualRent * 0.20, 500000);
}

/**
 * Calculate NHF contribution (2.5% of basic salary, if > ₦30,000/month)
 */
function calculateNHF(basicSalary) {
  if (!basicSalary || basicSalary <= 360000) { // ₦30,000/month = ₦360,000/year
    return 0;
  }
  return basicSalary * 0.025;
}

/**
 * Validate pension contribution (max 25% of total income)
 */
function validatePensionContribution(pensionContribution, totalIncome) {
  const maxAllowed = totalIncome * 0.25;
  return {
    contribution: pensionContribution,
    maxAllowed: maxAllowed,
    isValid: pensionContribution <= maxAllowed,
    claimable: Math.min(pensionContribution, maxAllowed)
  };
}

/**
 * Calculate total income from all sources
 */
function calculateTotalIncome(incomeSources) {
  if (!incomeSources || incomeSources.length === 0) {
    return 0;
  }

  return incomeSources.reduce((total, source) => {
    return total + (source.totalAmount || 0);
  }, 0);
}

/**
 * Calculate total deductions
 */
function calculateTotalDeductions(deductions) {
  if (!deductions || deductions.length === 0) {
    return 0;
  }

  return deductions.reduce((total, deduction) => {
    return total + (deduction.amount || 0);
  }, 0);
}

/**
 * Calculate chargeable income (total income - deductions)
 */
function calculateChargeableIncome(totalIncome, totalDeductions) {
  return Math.max(0, totalIncome - totalDeductions);
}

/**
 * Calculate final tax liability (tax - credits)
 */
function calculateFinalTaxLiability(taxCalculated, payeDeducted = 0, taxWithheldAtSource = 0) {
  const totalCredits = payeDeducted + taxWithheldAtSource;
  const finalLiability = taxCalculated - totalCredits;
  
  return {
    taxCalculated: taxCalculated,
    totalCredits: totalCredits,
    finalTaxLiability: finalLiability,
    isRefund: finalLiability < 0,
    refundAmount: finalLiability < 0 ? Math.abs(finalLiability) : 0
  };
}

/**
 * Complete tax calculation for individual
 */
function calculateIndividualTaxComplete(incomeSources, deductions, payeDeducted = 0, taxWithheldAtSource = 0) {
  const totalIncome = calculateTotalIncome(incomeSources);
  const totalDeductions = calculateTotalDeductions(deductions);
  const chargeableIncome = calculateChargeableIncome(totalIncome, totalDeductions);
  
  const taxResult = calculateIndividualTax(chargeableIncome);
  const finalResult = calculateFinalTaxLiability(
    taxResult.totalTax,
    payeDeducted,
    taxWithheldAtSource
  );

  return {
    income: {
      totalIncome: totalIncome,
      breakdown: incomeSources.map(source => ({
        type: source.incomeType,
        amount: source.totalAmount || 0
      }))
    },
    deductions: {
      totalDeductions: totalDeductions,
      breakdown: deductions.map(deduction => ({
        type: deduction.deductionType,
        amount: deduction.amount || 0
      }))
    },
    chargeableIncome: chargeableIncome,
    taxCalculation: taxResult,
    finalTaxLiability: finalResult.finalTaxLiability,
    isRefund: finalResult.isRefund,
    refundAmount: finalResult.refundAmount,
    credits: {
      payeDeducted: payeDeducted,
      taxWithheldAtSource: taxWithheldAtSource,
      totalCredits: finalResult.totalCredits
    }
  };
}

/**
 * Complete tax calculation for company
 */
function calculateCompanyTaxComplete(incomeSources, expenses, capitalAllowances, rdExpenditure, donations, turnover, fixedAssets, isProfessionalServices) {
  const totalRevenue = calculateTotalIncome(incomeSources);
  
  // Calculate assessable profit
  const totalExpenses = expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
  const totalCapitalAllowances = capitalAllowances.reduce((sum, ca) => sum + (ca.amount || 0), 0);
  
  // R&D deduction (max 5% of turnover)
  const maxRDDeduction = turnover * 0.05;
  const rdDeduction = Math.min(rdExpenditure || 0, maxRDDeduction);
  
  // Donation deduction (max 10% of profit before tax)
  const profitBeforeTax = totalRevenue - totalExpenses - totalCapitalAllowances - rdDeduction;
  const maxDonationDeduction = profitBeforeTax * 0.10;
  const donationDeduction = Math.min(donations || 0, maxDonationDeduction);
  
  const assessableProfit = profitBeforeTax - donationDeduction;
  
  // Determine if small company
  const isSmallCompany = (turnover <= 50000000) && 
                         (fixedAssets <= 250000000) && 
                         (!isProfessionalServices);
  
  const taxResult = calculateCompanyTax(assessableProfit, isSmallCompany);

  return {
    revenue: {
      totalRevenue: totalRevenue,
      breakdown: incomeSources.map(source => ({
        type: source.incomeType,
        amount: source.totalAmount || 0
      }))
    },
    expenses: {
      totalExpenses: totalExpenses,
      capitalAllowances: totalCapitalAllowances,
      rdDeduction: rdDeduction,
      donationDeduction: donationDeduction,
      totalDeductions: totalExpenses + totalCapitalAllowances + rdDeduction + donationDeduction
    },
    assessableProfit: assessableProfit,
    isSmallCompany: isSmallCompany,
    taxCalculation: taxResult,
    finalTaxLiability: taxResult.totalTax
  };
}

module.exports = {
  calculateIndividualTax,
  calculateCompanyTax,
  calculateRentRelief,
  calculateNHF,
  validatePensionContribution,
  calculateTotalIncome,
  calculateTotalDeductions,
  calculateChargeableIncome,
  calculateFinalTaxLiability,
  calculateIndividualTaxComplete,
  calculateCompanyTaxComplete,
  TAX_BRACKETS
};

