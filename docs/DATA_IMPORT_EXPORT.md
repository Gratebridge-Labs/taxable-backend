# Data Import/Export System

## Overview
The tax engine supports importing data from Excel/CSV files and exporting breakdowns, calculations, and forms. This reduces manual data entry for businesses with sales data, individuals with transaction records, etc.

## Current Capabilities

### ✅ Installed Packages
- **multer**: File upload handling
- **xlsx**: Excel file parsing (.xlsx, .xls)
- **csv-parser**: CSV file parsing
- **pdf-parse**: PDF parsing (for uploaded documents)

## Supported Import Formats

### 1. Excel Files (.xlsx, .xls)
**Use Cases:**
- Business sales data
- Monthly income records
- Expense tracking sheets
- Employee payroll data
- Transaction records

### 2. CSV Files (.csv)
**Use Cases:**
- Bank statements (converted to CSV)
- Accounting software exports
- Simple transaction lists

### 3. PDF Documents
**Use Cases:**
- Payslips (for employment income extraction)
- Bank statements
- Receipts and invoices

## Import Templates

### Business Sales Data Template
**File**: `docs/templates/business_sales_template.xlsx`

**Structure:**
```
| Date       | Invoice # | Customer | Description | Amount (₦) | Tax (₦) |
|------------|-----------|----------|-------------|------------|----------|
| 2025-01-15 | INV-001   | ABC Ltd  | Product A   | 100,000    | 7,500    |
| 2025-01-20 | INV-002   | XYZ Corp | Service B   | 200,000    | 15,000   |
```

**Mapped To:**
- Business income (sum of Amount column)
- VAT collected (sum of Tax column)
- Revenue by period (monthly breakdown)

### Business Expenses Template
**File**: `docs/templates/business_expenses_template.xlsx`

**Structure:**
```
| Date       | Category           | Vendor      | Description      | Amount (₦) | Receipt # |
|------------|-------------------|-------------|------------------|------------|-----------|
| 2025-01-10 | Rent              | Landlord    | Office Rent      | 500,000    | RCP-001   |
| 2025-01-15 | Utilities         | PHCN        | Electricity      | 50,000     | RCP-002   |
| 2025-01-20 | Salaries          | Payroll     | January Salaries | 1,000,000  | PAY-001   |
```

**Mapped To:**
- Business expenses by category
- Expense validation
- Receipt tracking

### Individual Income Template
**File**: `docs/templates/individual_income_template.xlsx`

**Structure:**
```
| Date       | Source            | Description        | Amount (₦) | Type        |
|------------|-------------------|--------------------|------------|-------------|
| 2025-01-01 | Employment        | January Salary     | 500,000    | Employment  |
| 2025-01-15 | Rental            | Property A Rent    | 200,000    | Rental      |
| 2025-02-01 | Investment        | Dividend Payment   | 50,000     | Investment  |
```

**Mapped To:**
- Employment income
- Rental income
- Investment income
- Other income

### Bank Statement Template (CSV)
**File**: `docs/templates/bank_statement_template.csv`

**Structure:**
```
Date,Description,Debit,Credit,Balance
2025-01-01,Salary Credit,0,500000,500000
2025-01-05,Rent Payment,200000,0,300000
2025-01-10,NHF Deduction,12500,0,287500
```

**Mapped To:**
- Income sources (Credit entries)
- Expenses (Debit entries)
- Deductions (NHF, Pension, etc.)

## Import Process Flow

### Step 1: Upload File
```
POST /api/taxableprofile/:profileId/import
Content-Type: multipart/form-data

Body:
- file: [Excel/CSV file]
- importType: "sales" | "expenses" | "income" | "bank_statement"
- mapping: {optional custom field mapping}
```

### Step 2: File Validation
- Check file format (Excel, CSV)
- Validate file structure
- Check required columns
- Validate data types

### Step 3: Data Parsing
- Parse Excel/CSV file
- Extract data rows
- Map columns to tax engine fields
- Validate amounts and dates

### Step 4: Data Import
- Create IncomeSource records
- Create Deduction records
- Create Expense records
- Link to TaxableProfile

### Step 5: Validation & Review
- Show import summary
- Highlight errors/warnings
- Allow user to review and confirm
- Auto-calculate totals

## Export Formats

### 1. Tax Calculation Breakdown (Excel)
**Endpoint**: `GET /api/taxableprofile/:profileId/export/breakdown`

**Contains:**
- Income breakdown by source
- Expense breakdown by category
- Deduction breakdown
- Tax calculation step-by-step
- Monthly calculations (if applicable)

### 2. Tax Return Summary (PDF)
**Endpoint**: `GET /api/taxableprofile/:profileId/export/summary`

**Contains:**
- Complete tax return summary
- All income sources
- All deductions
- Final tax calculation
- Payment instructions

### 3. FIRS Form (PDF)
**Endpoint**: `GET /api/taxableprofile/:profileId/forms/:formId/pdf`

**Contains:**
- Auto-filled FIRS tax return form
- Ready for submission

### 4. Data Export (Excel/CSV)
**Endpoint**: `GET /api/taxableprofile/:profileId/export/data?format=excel|csv`

**Contains:**
- All profile data
- Income sources
- Expenses
- Deductions
- Calculations

## Breakdown Calculations

### Individual Breakdown
```
Total Income Breakdown:
├── Employment Income: ₦X
│   ├── Gross Salary: ₦Y
│   ├── Benefits-in-Kind: ₦Z
│   └── PAYE Deducted: ₦W
├── Business Income: ₦X
│   ├── Revenue: ₦Y
│   └── Expenses: ₦Z
├── Rental Income: ₦X
│   ├── Rental Received: ₦Y
│   └── Rental Expenses: ₦Z
└── Investment Income: ₦X

Deductions Breakdown:
├── NHF Contribution: ₦X
├── NHIS Contribution: ₦Y
├── Pension Contribution: ₦Z
├── Life Insurance: ₦W
├── Mortgage Interest: ₦V
└── Rent Relief: ₦U

Tax Calculation Breakdown:
├── Chargeable Income: ₦X
├── Tax Bracket 1 (0-₦800k): ₦0 (0%)
├── Tax Bracket 2 (₦800k-₦3M): ₦Y (15%)
├── Tax Bracket 3 (₦3M-₦12M): ₦Z (18%)
└── Total Tax: ₦W
```

### Business Breakdown
```
Income Breakdown:
├── Turnover: ₦X
├── Other Income: ₦Y
└── Total Income: ₦Z

Expenses Breakdown:
├── Operating Expenses: ₦X
│   ├── Rent: ₦A
│   ├── Utilities: ₦B
│   ├── Salaries: ₦C
│   └── Other: ₦D
├── Capital Allowances: ₦Y
│   ├── Buildings (10%): ₦E
│   ├── Plant (20%): ₦F
│   └── Vehicles (25%): ₦G
├── R&D Deduction: ₦Z (max 5% of turnover)
└── Donation Deduction: ₦W (max 10% of profit)

Profit Calculation:
├── Assessable Profit: ₦X
├── Company Type: Small Company / Other
└── Tax Rate: 0% / 30%

Tax Calculation:
├── Company Tax: ₦X
├── Development Levy (4%): ₦Y
└── Total Tax Payable: ₦Z
```

## Implementation Plan

### Phase 1: File Upload Infrastructure
- [ ] Create upload middleware (multer)
- [ ] Create file storage system
- [ ] Add file validation
- [ ] Create upload endpoints

### Phase 2: Excel/CSV Parsing
- [ ] Create Excel parser service
- [ ] Create CSV parser service
- [ ] Create data mapper
- [ ] Add data validation

### Phase 3: Import Handlers
- [ ] Business sales data importer
- [ ] Business expenses importer
- [ ] Individual income importer
- [ ] Bank statement importer

### Phase 4: Export System
- [ ] Breakdown Excel generator
- [ ] PDF form generator
- [ ] Data export (Excel/CSV)
- [ ] Summary PDF generator

### Phase 5: Breakdown Calculations
- [ ] Income breakdown calculator
- [ ] Expense breakdown calculator
- [ ] Deduction breakdown calculator
- [ ] Tax calculation breakdown
- [ ] Monthly breakdown calculator

## API Endpoints

### Import Endpoints
```
POST /api/taxableprofile/:profileId/import
  - Upload Excel/CSV file
  - Specify import type
  - Map data to tax engine

GET /api/taxableprofile/:profileId/import/template/:type
  - Download import template
  - Types: sales, expenses, income, bank_statement

POST /api/taxableprofile/:profileId/import/validate
  - Validate file before import
  - Return validation results

POST /api/taxableprofile/:profileId/import/confirm
  - Confirm and complete import
  - After user reviews validation results
```

### Export Endpoints
```
GET /api/taxableprofile/:profileId/export/breakdown
  - Export calculation breakdown (Excel)

GET /api/taxableprofile/:profileId/export/summary
  - Export tax return summary (PDF)

GET /api/taxableprofile/:profileId/export/data
  - Export all data (Excel/CSV)
  - Query param: ?format=excel|csv

GET /api/taxableprofile/:profileId/export/monthly
  - Export monthly calculations (Excel)
  - Query param: ?year=2025&month=1
```

### Breakdown Endpoints
```
GET /api/taxableprofile/:profileId/breakdown
  - Get complete breakdown (JSON)
  - Includes all calculations

GET /api/taxableprofile/:profileId/breakdown/income
  - Get income breakdown only

GET /api/taxableprofile/:profileId/breakdown/expenses
  - Get expense breakdown only

GET /api/taxableprofile/:profileId/breakdown/deductions
  - Get deduction breakdown only

GET /api/taxableprofile/:profileId/breakdown/tax
  - Get tax calculation breakdown
```

## Data Mapping Examples

### Excel Sales Data → Business Income
```javascript
{
  "Date": "2025-01-15",
  "Invoice #": "INV-001",
  "Amount (₦)": 100000,
  "Tax (₦)": 7500
}
→
{
  incomeSource: "business",
  amount: 100000,
  date: "2025-01-15",
  description: "Invoice INV-001",
  vatCollected: 7500,
  period: "2025-01"
}
```

### Excel Expenses → Business Expenses
```javascript
{
  "Date": "2025-01-10",
  "Category": "Rent",
  "Amount (₦)": 500000,
  "Receipt #": "RCP-001"
}
→
{
  expenseCategory: "rent",
  amount: 500000,
  date: "2025-01-10",
  description: "Office Rent",
  receiptNumber: "RCP-001",
  period: "2025-01"
}
```

## Error Handling

### Import Errors
- Invalid file format
- Missing required columns
- Invalid data types
- Date format errors
- Amount format errors
- Duplicate entries

### Validation Warnings
- Amounts seem unusual
- Dates outside tax year
- Missing receipts for expenses
- Incomplete data

## User Experience

### Import Flow
1. User uploads Excel/CSV file
2. System validates and parses
3. Shows preview of data to be imported
4. Highlights errors/warnings
5. User reviews and confirms
6. Data imported and linked to profile
7. Auto-calculations run

### Export Flow
1. User requests breakdown/export
2. System generates file
3. User downloads file
4. Can share with accountant/tax advisor

## Next Steps

1. Create import template Excel files
2. Implement file upload endpoints
3. Implement Excel/CSV parsers
4. Create data mappers
5. Implement breakdown calculators
6. Create PDF form generators
7. Add export endpoints

