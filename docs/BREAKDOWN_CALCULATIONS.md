# Breakdown Calculations System

## Overview
The tax engine provides detailed breakdowns of all calculations, showing step-by-step how tax is computed. This transparency helps users understand their tax liability and verify calculations.

## Breakdown Types

### 1. Income Breakdown
**Shows**: All income sources with details

**Structure**:
```json
{
  "totalIncome": 5000000,
  "sources": [
    {
      "type": "employment",
      "description": "Salary from ABC Company",
      "amount": 3000000,
      "period": "2025-01 to 2025-12",
      "details": {
        "grossSalary": 3000000,
        "basicSalary": 2400000,
        "housingAllowance": 600000,
        "transportAllowance": 200000,
        "benefitsInKind": 0
      }
    },
    {
      "type": "business",
      "description": "Business Revenue",
      "amount": 2000000,
      "period": "2025-01 to 2025-12",
      "details": {
        "revenue": 2000000,
        "expenses": 800000,
        "netIncome": 1200000
      }
    }
  ]
}
```

### 2. Deduction Breakdown
**Shows**: All deductions with calculations

**Structure**:
```json
{
  "totalDeductions": 1160000,
  "deductions": [
    {
      "type": "nhf",
      "description": "National Housing Fund",
      "amount": 60000,
      "calculation": "Basic Salary (₦2,400,000) × 2.5% = ₦60,000",
      "maxAllowed": null,
      "status": "within_limit"
    },
    {
      "type": "rent_relief",
      "description": "Rent Relief",
      "amount": 500000,
      "calculation": "Annual Rent (₦3,000,000) × 20% = ₦600,000, capped at ₦500,000",
      "maxAllowed": 500000,
      "status": "capped"
    },
    {
      "type": "pension",
      "description": "Pension Contribution",
      "amount": 600000,
      "calculation": "Actual contribution: ₦600,000",
      "maxAllowed": 1250000,
      "status": "within_limit"
    }
  ]
}
```

### 3. Tax Calculation Breakdown
**Shows**: Step-by-step tax calculation

**Structure**:
```json
{
  "chargeableIncome": 3840000,
  "taxBrackets": [
    {
      "bracket": 1,
      "range": "₦0 - ₦800,000",
      "incomeInBracket": 800000,
      "rate": "0%",
      "tax": 0,
      "explanation": "First ₦800,000 is tax-free"
    },
    {
      "bracket": 2,
      "range": "₦800,001 - ₦3,000,000",
      "incomeInBracket": 2200000,
      "rate": "15%",
      "tax": 330000,
      "explanation": "Next ₦2,200,000 taxed at 15%"
    },
    {
      "bracket": 3,
      "range": "₦3,000,001 - ₦12,000,000",
      "incomeInBracket": 840000,
      "rate": "18%",
      "tax": 151200,
      "explanation": "Next ₦840,000 taxed at 18%"
    }
  ],
  "totalTax": 481200,
  "payeDeducted": 400000,
  "taxWithheldAtSource": 0,
  "finalTaxPayable": 81200,
  "calculation": {
    "step1": "Total Income: ₦5,000,000",
    "step2": "Less Deductions: ₦1,160,000",
    "step3": "Chargeable Income: ₦3,840,000",
    "step4": "Tax on ₦800,000 @ 0%: ₦0",
    "step5": "Tax on ₦2,200,000 @ 15%: ₦330,000",
    "step6": "Tax on ₦840,000 @ 18%: ₦151,200",
    "step7": "Total Tax: ₦481,200",
    "step8": "Less PAYE: ₦400,000",
    "step9": "Final Tax Payable: ₦81,200"
  }
}
```

### 4. Business Profit Breakdown
**Shows**: Business income, expenses, and profit calculation

**Structure**:
```json
{
  "totalRevenue": 10000000,
  "revenueBySource": [
    {
      "source": "Sale of Goods",
      "amount": 7000000,
      "percentage": 70
    },
    {
      "source": "Provision of Services",
      "amount": 3000000,
      "percentage": 30
    }
  ],
  "totalExpenses": 6000000,
  "expensesByCategory": [
    {
      "category": "Rent and Lease",
      "amount": 1200000,
      "percentage": 20
    },
    {
      "category": "Salaries and Wages",
      "amount": 3000000,
      "percentage": 50
    },
    {
      "category": "Utilities",
      "amount": 600000,
      "percentage": 10
    },
    {
      "category": "Other",
      "amount": 1200000,
      "percentage": 20
    }
  ],
  "capitalAllowances": 500000,
  "rdDeduction": 400000,
  "donationDeduction": 200000,
  "assessableProfit": 2900000,
  "calculation": {
    "step1": "Total Revenue: ₦10,000,000",
    "step2": "Less Operating Expenses: ₦6,000,000",
    "step3": "Less Capital Allowances: ₦500,000",
    "step4": "Less R&D Deduction: ₦400,000",
    "step5": "Less Donation Deduction: ₦200,000",
    "step6": "Assessable Profit: ₦2,900,000"
  }
}
```

### 5. Monthly Breakdown
**Shows**: Monthly income, expenses, and tax calculations

**Structure**:
```json
{
  "year": 2025,
  "monthlyBreakdown": [
    {
      "month": 1,
      "monthName": "January",
      "income": {
        "employment": 250000,
        "business": 833333,
        "rental": 166667,
        "total": 1250000
      },
      "expenses": {
        "business": 500000,
        "rental": 50000,
        "total": 550000
      },
      "deductions": {
        "nhf": 5000,
        "pension": 50000,
        "rentRelief": 41667,
        "total": 96667
      },
      "taxableIncome": 603333,
      "taxCalculated": 90499,
      "payeDeducted": 33333,
      "taxPayable": 57166
    }
    // ... for each month
  ],
  "annualTotal": {
    "totalIncome": 15000000,
    "totalExpenses": 6600000,
    "totalDeductions": 1160000,
    "totalTax": 1085994,
    "totalPaye": 400000,
    "finalTaxPayable": 685994
  }
}
```

## Calculation Explanations

### Individual Tax Calculation Explanation
```
Step 1: Calculate Total Income
  Employment Income: ₦3,000,000
  Business Income: ₦1,200,000
  Rental Income: ₦800,000
  ──────────────────────────────
  Total Income: ₦5,000,000

Step 2: Calculate Eligible Deductions
  NHF Contribution: ₦60,000 (2.5% of basic salary)
  Rent Relief: ₦500,000 (20% of rent, capped at ₦500k)
  Pension Contribution: ₦600,000
  ──────────────────────────────
  Total Deductions: ₦1,160,000

Step 3: Calculate Chargeable Income
  Total Income: ₦5,000,000
  Less Deductions: ₦1,160,000
  ──────────────────────────────
  Chargeable Income: ₦3,840,000

Step 4: Calculate Tax (Progressive Rates)
  First ₦800,000 @ 0%: ₦0
  Next ₦2,200,000 @ 15%: ₦330,000
  Next ₦840,000 @ 18%: ₦151,200
  ──────────────────────────────
  Total Tax: ₦481,200

Step 5: Calculate Final Tax Payable
  Tax Calculated: ₦481,200
  Less PAYE Deducted: ₦400,000
  ──────────────────────────────
  Final Tax Payable: ₦81,200
```

### Business Tax Calculation Explanation
```
Step 1: Calculate Total Revenue
  Sale of Goods: ₦7,000,000
  Services: ₦3,000,000
  ──────────────────────────────
  Total Revenue: ₦10,000,000

Step 2: Calculate Total Expenses
  Operating Expenses: ₦6,000,000
  Capital Allowances: ₦500,000
  R&D Deduction: ₦400,000 (5% of turnover)
  Donation Deduction: ₦200,000 (10% of profit)
  ──────────────────────────────
  Total Expenses: ₦7,100,000

Step 3: Calculate Assessable Profit
  Total Revenue: ₦10,000,000
  Less Total Expenses: ₦7,100,000
  ──────────────────────────────
  Assessable Profit: ₦2,900,000

Step 4: Determine Tax Rate
  Turnover: ₦10,000,000 (≤ ₦50M) ✓
  Fixed Assets: ₦150,000,000 (≤ ₦250M) ✓
  Professional Services: No ✓
  ──────────────────────────────
  Status: Small Company
  Tax Rate: 0%

Step 5: Calculate Development Levy
  Assessable Profit: ₦2,900,000
  Development Levy (4%): ₦116,000
  ──────────────────────────────
  Total Tax Payable: ₦116,000
```

## Export Formats

### Excel Breakdown Export
**File Structure**:
- Sheet 1: Income Breakdown
- Sheet 2: Expense Breakdown
- Sheet 3: Deduction Breakdown
- Sheet 4: Tax Calculation
- Sheet 5: Monthly Breakdown (if applicable)

### PDF Breakdown Export
**Sections**:
1. Summary (one page)
2. Income Details
3. Expense Details
4. Deduction Details
5. Tax Calculation Details
6. Monthly Breakdown (if applicable)

## API Response Format

### GET /api/taxableprofile/:profileId/breakdown
```json
{
  "success": true,
  "data": {
    "profileId": "TP123456789",
    "year": 2025,
    "incomeBreakdown": { /* ... */ },
    "expenseBreakdown": { /* ... */ },
    "deductionBreakdown": { /* ... */ },
    "taxBreakdown": { /* ... */ },
    "monthlyBreakdown": [ /* ... */ ],
    "summary": {
      "totalIncome": 5000000,
      "totalDeductions": 1160000,
      "chargeableIncome": 3840000,
      "taxCalculated": 481200,
      "finalTaxPayable": 81200
    }
  }
}
```

## Implementation Notes

1. **Real-time Calculations**: Breakdowns update as user enters data
2. **Detailed Explanations**: Each calculation includes explanation
3. **Visual Breakdowns**: Charts and graphs for better understanding
4. **Export Options**: Excel, PDF, JSON formats
5. **Monthly Tracking**: Show monthly progress toward annual filing
6. **Comparison**: Compare with previous year (if available)

