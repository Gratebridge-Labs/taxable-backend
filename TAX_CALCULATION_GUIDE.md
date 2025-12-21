# Tax Calculation Guide - 2026 Nigeria Tax Reform

## Personal Income Tax (PIT) Structure

### Exemption Threshold
- **Annual Income ≤ ₦800,000:** **0% tax** (Fully exempt)

### Progressive Tax Brackets (Estimated - Needs Official Confirmation)

Based on research, the tax structure appears to be:

| Income Range | Tax Rate | Tax Calculation |
|-------------|----------|----------------|
| ₦0 - ₦800,000 | 0% | Exempt |
| ₦800,001 - ₦1,500,000 | 15% | 15% on amount above ₦800,000 |
| Above ₦1,500,000 | 25% | 15% on ₦700,000 + 25% on amount above ₦1,500,000 |

### Calculation Examples

#### Example 1: Low Income (Exempt)
```
Annual Income: ₦600,000
Taxable Income: ₦0 (below threshold)
Tax Liability: ₦0
```

#### Example 2: Middle Income
```
Annual Income: ₦1,200,000
Taxable Income: ₦1,200,000 - ₦800,000 = ₦400,000
Tax at 15%: ₦400,000 × 0.15 = ₦60,000
Total Tax Liability: ₦60,000
```

#### Example 3: High Income
```
Annual Income: ₦3,000,000
Taxable Income: ₦3,000,000 - ₦800,000 = ₦2,200,000

First Bracket (₦800,001 - ₦1,500,000):
  Taxable: ₦700,000
  Tax: ₦700,000 × 0.15 = ₦105,000

Second Bracket (Above ₦1,500,000):
  Taxable: ₦3,000,000 - ₦1,500,000 = ₦1,500,000
  Tax: ₦1,500,000 × 0.25 = ₦375,000

Total Tax Liability: ₦105,000 + ₦375,000 = ₦480,000
```

## Taxable Income Calculation

### Formula
```
Taxable Income = Total Annual Income - Exemptions - Deductions
```

### Components

#### 1. Total Annual Income
- Salary/Wages
- Business Income
- Rental Income
- Investment Income
- Other Income Sources

#### 2. Exemptions
- First ₦800,000 is exempt (personal exemption)

#### 3. Deductions (Need Official List)
Potential deductions (to be verified):
- **Pension Contributions:** Up to certain limit
- **National Housing Fund (NHF):** If applicable
- **Life Insurance Premiums:** With limits
- **Medical Expenses:** With limits
- **Charitable Donations:** With limits
- **Professional Development:** Training/education expenses
- **Business Expenses:** For self-employed individuals

## Value Added Tax (VAT)

### Standard Rate
- **7.5%** on applicable goods and services

### VAT Exempt Items (2026 Reform)
- Food items
- Healthcare services
- Educational services
- Residential rent
- Public transport

### VAT Calculation
```
VAT Amount = (Expense Amount × 7.5%) / 1.075
```

For expenses that include VAT:
```
Base Amount = Expense Amount / 1.075
VAT Amount = Expense Amount - Base Amount
```

## Weekly/Monthly Tax Projections

### Weekly Projection
```
Weekly Income = Total Income / 52
Weekly Tax Estimate = (Annual Tax Estimate) / 52
```

### Monthly Projection
```
Monthly Income = Total Income / 12
Monthly Tax Estimate = (Annual Tax Estimate) / 12
```

### Year-to-Date (YTD) Calculation
```
YTD Income = Sum of all income from Jan 1 to current date
YTD Tax Estimate = Calculate tax on (YTD Income × 12 / months_passed)
```

## Implementation Pseudocode

```javascript
class TaxCalculator {
  // Constants
  EXEMPTION_THRESHOLD = 800000;
  BRACKET_1_MAX = 1500000;
  BRACKET_1_RATE = 0.15;
  BRACKET_2_RATE = 0.25;
  VAT_RATE = 0.075;

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
    if (taxableIncome <= this.EXEMPTION_THRESHOLD) {
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
      exemption: this.EXEMPTION_THRESHOLD,
      bracket1: 0,
      bracket2: 0
    };

    // First bracket: ₦800,001 to ₦1,500,000 at 15%
    const bracket1Amount = Math.min(
      taxableIncome - this.EXEMPTION_THRESHOLD,
      this.BRACKET_1_MAX - this.EXEMPTION_THRESHOLD
    );
    
    if (bracket1Amount > 0) {
      const bracket1Tax = bracket1Amount * this.BRACKET_1_RATE;
      tax += bracket1Tax;
      breakdown.bracket1 = bracket1Tax;
    }

    // Second bracket: Above ₦1,500,000 at 25%
    if (taxableIncome > this.BRACKET_1_MAX) {
      const bracket2Amount = taxableIncome - this.BRACKET_1_MAX;
      const bracket2Tax = bracket2Amount * this.BRACKET_2_RATE;
      tax += bracket2Tax;
      breakdown.bracket2 = bracket2Tax;
    }

    const effectiveRate = (tax / annualIncome) * 100;

    return {
      taxableIncome,
      taxLiability: Math.round(tax * 100) / 100, // Round to 2 decimal places
      effectiveRate: Math.round(effectiveRate * 100) / 100,
      breakdown
    };
  }

  /**
   * Calculate VAT on expense
   * @param {number} expenseAmount - Total expense amount (including VAT if applicable)
   * @param {boolean} includesVAT - Whether amount includes VAT
   * @param {boolean} isExempt - Whether expense is VAT exempt
   * @returns {object} VAT calculation result
   */
  calculateVAT(expenseAmount, includesVAT = false, isExempt = false) {
    if (isExempt) {
      return {
        baseAmount: expenseAmount,
        vatAmount: 0,
        totalAmount: expenseAmount
      };
    }

    let baseAmount, vatAmount;

    if (includesVAT) {
      baseAmount = expenseAmount / (1 + this.VAT_RATE);
      vatAmount = expenseAmount - baseAmount;
    } else {
      baseAmount = expenseAmount;
      vatAmount = expenseAmount * this.VAT_RATE;
    }

    return {
      baseAmount: Math.round(baseAmount * 100) / 100,
      vatAmount: Math.round(vatAmount * 100) / 100,
      totalAmount: Math.round((baseAmount + vatAmount) * 100) / 100
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
}
```

## Tips Generation Logic

### Tip Categories

1. **Exemption Awareness**
   - If income < ₦800,000: "You are exempt from personal income tax!"
   - If close to threshold: "You're close to the tax threshold. Consider..."

2. **Deduction Opportunities**
   - If no deductions claimed: "Consider claiming deductions for..."
   - If low deductions: "You may be missing potential deductions..."

3. **Tax Bracket Optimization**
   - If in higher bracket: "You're in the 25% bracket. Consider..."
   - If close to next bracket: "You're approaching the next tax bracket..."

4. **Compliance Reminders**
   - "Ensure you have a valid TIN"
   - "Keep records of all deductible expenses"
   - "File your tax returns before the deadline"

5. **Expense Optimization**
   - "Consider VAT-exempt alternatives for..."
   - "Track your business expenses for deductions"

## Important Notes

⚠️ **Critical:** The exact tax brackets and rates need to be verified from official NRS/FIRS documentation. The rates provided here are estimates based on research and should be confirmed before production use.

⚠️ **Deductions:** The list of deductible expenses needs to be verified against official tax laws. Some deductions may have limits or specific conditions.

⚠️ **Updates:** Tax laws may change. The system should be designed to easily update tax brackets and rates.

## Data Validation Rules

1. **Income Validation:**
   - Must be positive number
   - Should have reasonable upper limit (e.g., ₦1 billion)
   - Should be in Nigerian Naira (₦)

2. **Date Validation:**
   - Transaction dates should be within current tax year
   - Cannot be future dates (for historical tracking)

3. **Amount Validation:**
   - All amounts should be positive
   - Should use 2 decimal places precision
   - Should handle large numbers (up to billions)

4. **Category Validation:**
   - Income categories: salary, business, rental, investment, other
   - Expense categories: rent, utilities, transport, healthcare, education, business, other
   - Must match predefined list

