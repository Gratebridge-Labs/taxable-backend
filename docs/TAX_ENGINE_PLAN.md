# Nigerian Tax Engine - Comprehensive Plan & Roadmap

## Executive Summary

Building a comprehensive tax preparation engine for Nigeria that simplifies tax filing, ensures compliance with FIRS (Federal Inland Revenue Service) standards, and helps Nigerians optimize their tax obligations through proper deductions, exemptions, and monthly tax planning.

---

## 1. Core Architecture & Data Model

### 1.1 Taxable Profile Structure
```
TaxableProfile {
  - profileId: TP[random9digits] (unique identifier)
  - user: User reference (creator/owner)
  - author: User reference (who created this profile - can be different from user)
  - year: Tax year (2020-2100)
  - profileType: Individual | Business | Joint (Spouse) | Joint (Business Partners)
  - status: draft | active | completed | archived
  - createdAt, updatedAt
}
```

### 1.2 Profile Ownership Types
- **Individual**: User filing for themselves
- **Joint (Spouse)**: Married couple filing jointly
- **Joint (Business Partners)**: Business with multiple stakeholders
- **Business**: Company/enterprise filing

### 1.3 Key Models to Build

#### A. Tax Questionnaire System
```
TaxQuestion {
  - questionId: TQ[random]
  - category: income | deductions | exemptions | business | personal
  - questionText: string
  - questionType: yes/no | multiple_choice | number | text | date
  - explanation: string (detailed context)
  - helpText: string (additional guidance)
  - order: number (display order)
  - required: boolean
  - dependsOn: [questionIds] (conditional questions)
  - profileType: Individual | Business | Both
}
```

#### B. User Responses
```
QuestionResponse {
  - responseId: QR[random]
  - profileId: TaxableProfile reference
  - questionId: TaxQuestion reference
  - answer: mixed (varies by question type)
  - answeredAt: Date
  - updatedAt: Date
}
```

#### C. Income Sources
```
IncomeSource {
  - incomeId: INC[random]
  - profileId: TaxableProfile reference
  - sourceType: employment | business | rental | investment | other
  - amount: number
  - frequency: monthly | quarterly | annually | one-time
  - employerName: string (if employment)
  - taxWithheld: number
  - documents: [file references]
  - period: { start: Date, end: Date }
}
```

#### D. Deductions & Allowances
```
Deduction {
  - deductionId: DED[random]
  - profileId: TaxableProfile reference
  - category: housing | transport | medical | education | pension | nhf | other
  - amount: number
  - maxAllowed: number (based on tax rules)
  - description: string
  - documents: [file references]
  - period: { start: Date, end: Date }
  - status: pending | verified | rejected
}
```

#### E. Tax Calculations
```
TaxCalculation {
  - calculationId: TC[random]
  - profileId: TaxableProfile reference
  - month: number (1-12, null for annual)
  - year: number
  - grossIncome: number
  - totalDeductions: number
  - taxableIncome: number
  - taxRate: number (percentage)
  - taxPayable: number
  - taxPaid: number
  - balance: number
  - breakdown: {
      - incomeBreakdown: {}
      - deductionBreakdown: {}
      - taxBrackets: []
    }
  - calculatedAt: Date
}
```

#### F. Tax Forms
```
TaxForm {
  - formId: TF[random]
  - profileId: TaxableProfile reference
  - formType: ITF001 | ITF002 | ITF003 | etc. (FIRS form types)
  - formData: object (filled form data)
  - status: draft | completed | submitted
  - generatedAt: Date
  - submittedAt: Date
  - pdfUrl: string
}
```

#### G. Documents
```
Document {
  - documentId: DOC[random]
  - profileId: TaxableProfile reference
  - documentType: receipt | invoice | payslip | certificate | other
  - category: income | deduction | exemption | proof
  - fileName: string
  - fileUrl: string
  - fileSize: number
  - uploadedAt: Date
  - verified: boolean
}
```

---

## 2. Core Qualifying Questions (Nigerian Tax Context)

### 2.1 Individual Profile - Base Questions (10-12 Core Questions)

1. **Employment Status**
   - Are you currently employed? (Yes/No)
   - *Explanation: Employment income is taxed under PAYE (Pay As You Earn). If employed, you'll need to provide employment details and payslips.*

2. **Business Income**
   - Do you operate a business or have business income? (Yes/No)
   - *Explanation: Business income is taxed separately and requires detailed income/expense tracking.*

3. **Housing Situation**
   - Do you rent accommodation? (Yes/No)
   - Do you own a home? (Yes/No)
   - *Explanation: Housing allowance is a key deduction. Rent receipts can be claimed as deductions up to certain limits.*

4. **Transportation**
   - Do you have transportation expenses? (Yes/No)
   - Do you own a vehicle? (Yes/No)
   - *Explanation: Transport allowance is deductible. Vehicle maintenance and fuel costs may be claimable for business use.*

5. **Medical Expenses**
   - Do you have medical expenses or health insurance? (Yes/No)
   - *Explanation: Medical expenses and NHIS contributions are deductible. Keep receipts for medical treatments.*

6. **Education**
   - Do you have education expenses? (Yes/No)
   - Do you have dependents in school? (Yes/No)
   - *Explanation: Education expenses for self and dependents may be deductible. Tuition fees and related costs.*

7. **Pension Contributions**
   - Are you contributing to a pension scheme? (Yes/No)
   - *Explanation: Pension contributions (RSA) are tax-deductible up to certain limits. This reduces your taxable income.*

8. **National Housing Fund (NHF)**
   - Are you contributing to NHF? (Yes/No)
   - *Explanation: NHF contributions are mandatory for certain income levels and are deductible.*

9. **Investment Income**
   - Do you have investment income (dividends, interest, capital gains)? (Yes/No)
   - *Explanation: Different tax rates apply to investment income. Some may be exempt or taxed at source.*

10. **Rental Income**
    - Do you receive rental income from properties? (Yes/No)
    - *Explanation: Rental income is taxable. Expenses related to property maintenance can be deducted.*

11. **Dependents**
    - Do you have dependents? (Yes/No)
    - How many dependents? (Number)
    - *Explanation: Dependent allowances reduce taxable income. Each dependent has a specific allowance amount.*

12. **Previous Tax Filing**
    - Have you filed taxes before? (Yes/No)
    - *Explanation: Helps determine if you need to file previous years or just current year.*

### 2.2 Business Profile - Base Questions

1. **Business Type**
   - What type of business entity? (Sole Proprietorship | Partnership | Company | Unincorporated Association)
   - *Explanation: Different entities have different tax obligations and rates. Note: LLC (Limited Liability Company) is not a recognized business structure in Nigeria.*

2. **Business Registration**
   - Is your business registered with CAC? (Yes/No)
   - *Explanation: Registration status affects tax filing requirements and available deductions.*

3. **Business Income Sources**
   - What are your main revenue streams? (Multiple choice)
   - *Explanation: Different income types may have different tax treatments.*

4. **Employees**
   - Do you have employees? (Yes/No)
   - How many employees? (Number)
   - *Explanation: Employer tax obligations include PAYE, pension contributions, and NHF.*

5. **Business Expenses**
   - Do you have significant business expenses? (Yes/No)
   - *Explanation: Business expenses are deductible. Categories include rent, utilities, salaries, etc.*

6. **Capital Allowances**
   - Do you have capital assets (equipment, vehicles, buildings)? (Yes/No)
   - *Explanation: Capital allowances allow depreciation deductions on business assets.*

7. **Previous Business Tax Filing**
   - Have you filed business taxes before? (Yes/No)
   - *Explanation: Helps determine filing history and any outstanding obligations.*

---

## 3. Tax Rules & Calculations (Nigerian Standards)

### 3.1 Personal Income Tax Rates (2024)
- **First ₦300,000**: 7%
- **Next ₦300,000**: 11%
- **Next ₦500,000**: 15%
- **Next ₦500,000**: 19%
- **Next ₦1,600,000**: 21%
- **Above ₦3,200,000**: 24%

### 3.2 Key Deductions & Allowances
- **Personal Relief**: ₦200,000 (annual)
- **Dependent Allowance**: ₦2,500 per dependent (max 4)
- **Housing Allowance**: Up to 25% of basic salary
- **Transport Allowance**: Up to ₦200,000 annually
- **Medical Allowance**: Actual expenses (with receipts)
- **Pension Contribution**: Up to 25% of income
- **NHF Contribution**: 2.5% of basic salary (mandatory for certain income levels)

### 3.3 Business Tax (Company Income Tax)
- **Small Companies** (< ₦25M turnover): 0% (first 4 years) or 20%
- **Medium Companies** (₦25M - ₦100M): 20%
- **Large Companies** (> ₦100M): 30%

### 3.4 Capital Allowances
- **Plant & Machinery**: 50% initial, 25% annually
- **Motor Vehicles**: 25% annually
- **Building**: 10% annually

---

## 4. User Flow & Experience

### 4.1 Profile Creation Flow
```
1. User creates Taxable Profile
   → Selects year
   → Selects profile type (Individual/Business/Joint)
   → Profile created with status: 'draft'

2. Author Assignment
   → If creating for someone else, assign author
   → Track who created vs. who owns

3. NIN/TIN Collection
   → Collect National Identification Number (NIN) - 11 digits
   → Collect Tax Identification Number (TIN) - 10-12 digits (if available)
   → For joint profiles, collect NIN/TIN for all parties
   → Validate format and provide guidance if missing

4. Initial Questionnaire
   → Present base questions (varies by profile type)
   → Each question has explanation/help text with terminology breakdowns
   → Conditional questions based on answers
   → Save progress (can resume later)

5. Joint Profile Data Collection (if applicable)
   → For Joint_Spouse: Both spouses answer individual questions separately
   → For Joint_Business: All partners input their data
   → System combines data for calculations
   → Each party can input their own information

6. Detailed Information Collection
   → Income sources (employment, business, rental, etc.)
   → Deductions (housing, transport, medical, etc.)
   → Documents upload
   → Dependents information

5. Monthly Tax Calculations
   → User can run calculations monthly
   → See projected tax liability
   → Track payments made
   → See balance due/refund

6. Form Generation
   → Auto-fill FIRS forms based on data
   → Generate PDF forms
   → Review and edit before submission

7. Submission
   → Mark profile as 'completed'
   → Generate submission package
   → Export all forms and documents
```

### 4.2 Monthly Tax Calculation Flow
```
1. User selects profile
2. Enters/updates income for the month
3. Enters/updates deductions for the month
4. System calculates:
   - Gross income
   - Total deductions
   - Taxable income
   - Tax payable (based on brackets)
   - Tax already paid
   - Balance due/refund
5. Shows breakdown and explanations
6. Saves calculation (can view history)
7. User can adjust and recalculate
```

### 4.3 Interactive Question Flow
```
For each question:
1. Display question with clear explanation
2. Show help text/context
3. Provide answer options
4. Show impact preview (how answer affects tax)
5. Allow user to go back and change
6. Save progress automatically
7. Show progress indicator
8. Conditional questions appear based on answers
```

---

## 5. Technical Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
- [ ] Update TaxableProfile model with author field
- [ ] Create TaxQuestion model
- [ ] Create QuestionResponse model
- [ ] Create API endpoints for questions
- [ ] Create API endpoints for responses
- [ ] Build question management system

### Phase 2: Core Questions (Week 3-4)
- [ ] Implement 10-12 base questions for Individual
- [ ] Implement base questions for Business
- [ ] Add conditional question logic
- [ ] Create question explanation/help system
- [ ] Build question flow UI logic

### Phase 3: Income & Deductions (Week 5-6)
- [ ] Create IncomeSource model
- [ ] Create Deduction model
- [ ] Build income tracking system
- [ ] Build deduction tracking system
- [ ] Add document upload functionality
- [ ] Create validation rules

### Phase 4: Tax Calculations (Week 7-8)
- [ ] Create TaxCalculation model
- [ ] Implement tax bracket calculations
- [ ] Build monthly calculation engine
- [ ] Create annual calculation engine
- [ ] Add calculation history
- [ ] Build breakdown visualization

### Phase 5: Forms & Documents (Week 9-10)
- [ ] Research FIRS form structures
- [ ] Create TaxForm model
- [ ] Build form auto-fill system
- [ ] Generate PDF forms
- [ ] Create document management system
- [ ] Build form review/edit system

### Phase 6: Advanced Features (Week 11-12)
- [ ] Joint profile support (spouse/business partners)
- [ ] Multi-year filing support
- [ ] Tax optimization suggestions
- [ ] Compliance checking
- [ ] Export/import functionality
- [ ] Reporting dashboard

---

## 6. Database Schema Summary

### Core Models
1. **TaxableProfile** - Main profile container
2. **TaxQuestion** - Question definitions
3. **QuestionResponse** - User answers
4. **IncomeSource** - Income tracking
5. **Deduction** - Deductions & allowances
6. **TaxCalculation** - Calculation results
7. **TaxForm** - Generated forms
8. **Document** - Uploaded documents
9. **Author** - Profile author tracking (extends User)

### Relationships
- TaxableProfile → User (owner)
- TaxableProfile → User (author)
- TaxableProfile → QuestionResponse (1:many)
- TaxableProfile → IncomeSource (1:many)
- TaxableProfile → Deduction (1:many)
- TaxableProfile → TaxCalculation (1:many)
- TaxableProfile → TaxForm (1:many)
- TaxableProfile → Document (1:many)

---

## 7. API Endpoints Structure

### Profile Management
- `POST /api/taxableprofile/create` - Create profile
- `GET /api/taxableprofile/list` - List user profiles
- `GET /api/taxableprofile/:profileId` - Get profile
- `PUT /api/taxableprofile/:profileId` - Update profile
- `DELETE /api/taxableprofile/:profileId` - Delete profile

### Questions
- `GET /api/taxableprofile/:profileId/questions` - Get questions for profile
- `GET /api/taxableprofile/:profileId/questions/:questionId` - Get specific question
- `POST /api/taxableprofile/:profileId/questions/:questionId/answer` - Answer question
- `GET /api/taxableprofile/:profileId/responses` - Get all responses

### Income
- `POST /api/taxableprofile/:profileId/income` - Add income source
- `GET /api/taxableprofile/:profileId/income` - Get all income sources
- `PUT /api/taxableprofile/:profileId/income/:incomeId` - Update income
- `DELETE /api/taxableprofile/:profileId/income/:incomeId` - Delete income

### Deductions
- `POST /api/taxableprofile/:profileId/deductions` - Add deduction
- `GET /api/taxableprofile/:profileId/deductions` - Get all deductions
- `PUT /api/taxableprofile/:profileId/deductions/:deductionId` - Update deduction
- `DELETE /api/taxableprofile/:profileId/deductions/:deductionId` - Delete deduction

### Calculations
- `POST /api/taxableprofile/:profileId/calculate` - Run tax calculation
- `GET /api/taxableprofile/:profileId/calculations` - Get calculation history
- `GET /api/taxableprofile/:profileId/calculations/:calculationId` - Get specific calculation

### Forms
- `POST /api/taxableprofile/:profileId/forms/generate` - Generate forms
- `GET /api/taxableprofile/:profileId/forms` - Get all forms
- `GET /api/taxableprofile/:profileId/forms/:formId` - Get specific form
- `GET /api/taxableprofile/:profileId/forms/:formId/pdf` - Download PDF

### Documents
- `POST /api/taxableprofile/:profileId/documents` - Upload document
- `GET /api/taxableprofile/:profileId/documents` - Get all documents
- `DELETE /api/taxableprofile/:profileId/documents/:documentId` - Delete document

---

## 8. Key Features & Benefits

### For Users
1. **Simplified Process**: Step-by-step guided flow
2. **Monthly Planning**: Calculate tax monthly, not just at year-end
3. **Cost Savings**: Maximize deductions and exemptions
4. **Time Savings**: Auto-filled forms, no manual calculations
5. **Compliance**: Ensures all requirements met
6. **Documentation**: Centralized document storage
7. **Transparency**: Clear breakdowns and explanations

### For the Platform
1. **Scalable Architecture**: Modular design
2. **Extensible**: Easy to add new questions, deductions, rules
3. **Compliant**: Based on FIRS standards
4. **User-Friendly**: Interactive, educational flow
5. **Data-Driven**: Track usage, optimize flows

---

## 9. Next Steps

1. **Review & Approve Plan**: Review this document and provide feedback
2. **Research FIRS Forms**: Get official form structures and requirements
3. **Start Phase 1**: Begin with foundation models and APIs
4. **Iterate**: Build incrementally, test with real scenarios
5. **User Testing**: Get feedback early and often

---

## 10. Questions for Clarification

1. Should we support multi-year filing in one profile or separate profiles per year?
2. What FIRS forms are most critical to support first?
3. Do we need real-time integration with FIRS systems?
4. Should calculations be real-time or batch processed?
5. What file formats should we support for document uploads?
6. Should we build a tax advisor/consultant feature?

---

**Document Version**: 1.0  
**Last Updated**: December 27, 2024  
**Status**: Draft - Awaiting Review

