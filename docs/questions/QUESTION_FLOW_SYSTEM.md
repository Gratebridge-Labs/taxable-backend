# Question Flow System

## Overview
The tax engine uses a **base questions → detailed questions → NIN/TIN collection → income/deduction details → form generation** flow.

## Flow Structure

### Phase 1: Base Questions (Qualifying Questions)
**Purpose**: Determine which detailed questions and forms are needed.

**Individual Base Questions** (`IND_BASE_001` to `IND_BASE_006`):
- Primary income source
- Housing situation
- Contributions (NHF, NHIS, Pension, Life Insurance)
- Additional income sources
- Capital gains (asset disposals)
- Exemptions

**Business Base Questions** (`BUS_BASE_001` to `BUS_BASE_006`):
- Business structure
- Business size (turnover)
- Business activities
- Expense types
- Employees
- Specialized business types

### Phase 2: NIN/TIN Collection
**Purpose**: Collect identification numbers required for tax filing.

- **Individual**: NIN (required), TIN (if available)
- **Business**: Business TIN (required), CAC Registration Number
- **Joint Spouse**: Both spouses' NIN and TIN
- **Joint Business**: Business TIN, all partners' NIN and TIN

### Phase 3: Personal/Business Information
**Purpose**: Collect basic identification and contact information.

**Individual Personal Info**:
- Full name (first, middle, last)
- Date of birth
- Residential address
- Phone number
- Email address
- Occupation
- Marital status

**Business Information**:
- Business name
- Registered name
- Business address
- Phone number
- Email address
- Website
- Commencement date

### Phase 4: NIN/TIN Collection
**Purpose**: Collect tax identification numbers required for filing.

- Individual: NIN (required), TIN (if available)
- Business: Business TIN (required), CAC Registration Number
- Joint Spouse: Both spouses' NIN and TIN
- Joint Business: Business TIN, all partners' NIN and TIN

### Phase 5: Detailed Questions (Based on Base Answers)
**Purpose**: Collect specific information needed for calculations and forms.

**See `INDIVIDUAL_DETAILED_QUESTIONS.json` and `BUSINESS_DETAILED_QUESTIONS.json` for complete details:**

**Employment Details** (`IND_DET_EMPLOYMENT`):
- Employer name, address, TIN
- Employment dates (start/end)
- Annual gross salary, basic salary
- Housing allowance, transport allowance
- PAYE deducted
- Benefits-in-kind (type, value, description)

**Business Details** (`IND_DET_BUSINESS`):
- Business name, address
- Business type
- Annual business income/revenue
- Business expenses (by category with amounts)
- Capital assets (type, cost, date acquired)

**Deduction Details** (Based on `IND_BASE_003`):
- NHF contribution amounts
- NHIS contribution amounts
- Pension contribution amounts (with PFA name)
- Life insurance premiums (with insurance company)
- Mortgage interest (with lender and property address)
- Rent paid (for rent relief calculation, with property address and receipts)

**Income Details** (Based on `IND_BASE_004`):
- Rental income and expenses (per property)
- Investment income (dividends, interest, capital gains with amounts and tax withheld)
- Other income sources

**Capital Gains Details** (`IND_DET_CAPITAL_GAINS`):
- Assets disposed (type, description)
- Date acquired, date disposed
- Acquisition cost
- Disposal proceeds
- Disposal expenses
- Exemption eligibility

**Business Expenses** (`BUS_DET_EXPENSES`):
- All expense categories with amounts
- R&D expenditure (max 5% of turnover)
- Donations (max 10% of profit before tax)

**Business Capital Assets** (`BUS_DET_CAPITAL`):
- Asset class (Building, Plant, Vehicle, etc.)
- Description, cost, date acquired
- Previous capital allowances claimed

**Employees** (`BUS_DET_EMPLOYEES`):
- Number of employees
- Total payroll
- PAYE deducted and remitted
- Pension contributions for employees
- NHF contributions for employees

### Phase 4: Calculations
**Purpose**: Calculate tax liability based on collected data.

1. Calculate total income
2. Apply eligible deductions
3. Calculate chargeable income
4. Apply tax rates (progressive for individuals, flat for companies)
5. Calculate development levy (companies)
6. Calculate final tax liability

### Phase 5: Form Generation
**Purpose**: Generate government forms with collected data.

Forms are auto-filled based on:
- Profile type
- Income sources
- Deductions claimed
- Exemptions applied

## Conditional Logic

Each base question has `conditionalQuestions` that determine which detailed questions to ask:

```json
"conditionalQuestions": {
  "yes": ["IND_DET_EMPLOYMENT", "IND_DET_RENT"],
  "no": []
}
```

## Question Dependencies

Questions use `dependsOn` to ensure proper ordering:
- Base questions depend on nothing (or previous base questions)
- Detailed questions depend on base questions
- NIN/TIN collection happens after base questions

## Example Flow

**Individual Profile:**
1. Base: "What is your primary source of income?" → "Employment"
2. Base: "What is your housing situation?" → "I rent accommodation"
3. Base: "Do you contribute to..." → "NHF, Pension"
4. Base: "Do you have additional income?" → "Rental income"
5. Base: "Did you dispose of assets?" → "No"
6. Base: "Do exemptions apply?" → "None"
7. **NIN/TIN Collection**
8. Detailed: Employment income, employer details, PAYE
9. Detailed: Rent paid (for rent relief)
10. Detailed: NHF contributions
11. Detailed: Pension contributions
12. Detailed: Rental income and expenses
13. **Calculations**
14. **Form Generation**

## Notes

- Base questions are **qualifying questions** - they determine the path
- NIN/TIN are **NOT base questions** - they're collected after base questions
- Detailed questions are **data collection questions** - they gather specific amounts and details
- All questions include explanations with terminology breakdowns
- Questions are designed to lead to complete information for government forms

