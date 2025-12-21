# Taxable Backend - MVP Planning & Strategy Document

## Executive Summary

**Taxable** is an MVP platform designed to help Nigerians prepare for the 2026 Tax Reform. The platform will assist users in:
- Understanding tax obligations
- Receiving personalized tax tips
- Running tax estimates
- Monitoring potential tax liabilities throughout the year
- Preparing tax-filing ready reports
- Tracking financial history

**Phase 1 (MVP):** Backend development focusing on data collection, analysis, estimation, and reporting
**Phase 2 (Future):** Direct tax filing integration with NRS (Nigeria Revenue Service)

---

## 1. Research: 2026 Tax Reform in Nigeria

### 1.1 Key Changes

#### Personal Income Tax (PIT)
- **Exemption Threshold:** Individuals earning ₦800,000 or less annually are **exempt** from personal income tax
- **Progressive Tax Structure:** Rates range from 0% to 25% based on income brackets
- **Tax Brackets (Estimated):**
  - ₦0 - ₦800,000: **0%** (Exempt)
  - ₦800,001 - ₦1,500,000: **15%** (Estimated)
  - Above ₦1,500,000: **25%** (Estimated)
  - *Note: Exact brackets need verification from official sources*

#### Corporate Income Tax (CIT)
- Large companies (turnover > ₦100M): **25%** (down from 30%)
- Small companies (turnover ≤ ₦100M, assets < ₦250M): **Exempt** from CIT, CGT, and Development Levy

#### Value Added Tax (VAT)
- **Exempt Items:** Food, healthcare, education, residential rent, public transport
- **Standard Rate:** 7.5% (unchanged, but exemptions expanded)

#### Tax Administration
- **FIRS → NRS:** Federal Inland Revenue Service transitioning to Nigeria Revenue Service
- **Digital Filing:** Nationwide digital tax-filing system with biometric identification (by Dec 2025)
- **E-Invoicing:** Mandatory for businesses
- **TIN Requirement:** Tax Identification Number required for financial transactions

### 1.2 Implications for Taxable Platform

1. **Income Categorization:** Need to distinguish between taxable and exempt income
2. **Expense Tracking:** Identify VAT-exempt vs VAT-applicable expenses
3. **Progressive Calculation:** Implement accurate tax bracket calculations
4. **TIN Integration:** Future integration with TIN verification system
5. **Digital Compliance:** Prepare for NRS digital filing standards

---

## 2. Backend Architecture Strategy

### 2.1 Technology Stack Recommendations

**Core Stack:**
- **Runtime:** Node.js (JavaScript/TypeScript)
- **Framework:** Express.js or Fastify
- **Database:** PostgreSQL (for structured data) + MongoDB (for document storage - bank statements)
- **ORM/ODM:** Prisma (PostgreSQL) + Mongoose (MongoDB)
- **File Storage:** AWS S3 / Cloudinary / Local storage (MVP)
- **Authentication:** JWT tokens
- **Validation:** Zod or Joi
- **Document Processing:** PDF parsing libraries (pdf-parse, pdf-lib)
- **Bank Statement Parsing:** OCR/Text extraction (Tesseract.js or cloud OCR APIs)

**Optional/Advanced:**
- **Queue System:** Bull (Redis) for background processing
- **Caching:** Redis
- **Email Service:** Nodemailer / SendGrid
- **Analytics:** Custom analytics service

### 2.2 System Architecture

```
┌─────────────────┐
│   Client App    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────┐
│      API Gateway (Express)      │
│  - Authentication Middleware     │
│  - Rate Limiting                │
│  - Request Validation           │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│      Business Logic Layer        │
│  - Tax Calculation Engine        │
│  - Document Processing Service   │
│  - Report Generation Service     │
│  - Analytics & Tips Engine        │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│      Data Access Layer           │
│  - User Repository               │
│  - Transaction Repository       │
│  - Report Repository             │
│  - Document Repository           │
└────────┬────────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│      Database Layer              │
│  - PostgreSQL (Users, Reports)   │
│  - MongoDB (Documents, History)  │
│  - File Storage (S3/Cloudinary)  │
└─────────────────────────────────┘
```

---

## 3. Database Schema Design

### 3.1 PostgreSQL Schema (Core Data)

#### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone VARCHAR(20),
  tin VARCHAR(20), -- Tax Identification Number
  date_of_birth DATE,
  employment_status VARCHAR(50), -- employed, self-employed, unemployed, etc.
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Tax Profiles Table
```sql
CREATE TABLE tax_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  tax_year INTEGER NOT NULL, -- e.g., 2026
  annual_income_estimate DECIMAL(15,2) DEFAULT 0,
  total_deductions DECIMAL(15,2) DEFAULT 0,
  estimated_tax_liability DECIMAL(15,2) DEFAULT 0,
  last_calculated_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, tax_year)
);
```

#### Transactions Table
```sql
CREATE TABLE transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  tax_profile_id UUID REFERENCES tax_profiles(id) ON DELETE CASCADE,
  transaction_type VARCHAR(50) NOT NULL, -- income, expense
  category VARCHAR(100), -- salary, business_income, rent, utilities, etc.
  amount DECIMAL(15,2) NOT NULL,
  description TEXT,
  transaction_date DATE NOT NULL,
  source VARCHAR(100), -- bank_statement, manual_entry, etc.
  document_id UUID, -- Reference to uploaded document
  is_tax_deductible BOOLEAN DEFAULT false,
  vat_applicable BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Documents Table
```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  document_type VARCHAR(50) NOT NULL, -- bank_statement, receipt, invoice, etc.
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size BIGINT,
  mime_type VARCHAR(100),
  upload_date DATE NOT NULL,
  processing_status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
  extracted_data JSONB, -- Parsed data from document
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Reports Table
```sql
CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  tax_profile_id UUID REFERENCES tax_profiles(id) ON DELETE CASCADE,
  report_type VARCHAR(50) NOT NULL, -- weekly, monthly, annual, custom
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  total_income DECIMAL(15,2) DEFAULT 0,
  total_expenses DECIMAL(15,2) DEFAULT 0,
  taxable_income DECIMAL(15,2) DEFAULT 0,
  estimated_tax DECIMAL(15,2) DEFAULT 0,
  tips JSONB, -- Array of personalized tips
  suggestions JSONB, -- Array of suggestions
  report_data JSONB, -- Full report data
  generated_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Tax Tips Table (Reference Data)
```sql
CREATE TABLE tax_tips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tip_category VARCHAR(100), -- deductions, exemptions, compliance, etc.
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  applicable_conditions JSONB, -- Conditions when tip is relevant
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 3.2 MongoDB Collections (Document Storage & History)

#### Transaction History Collection
```javascript
{
  _id: ObjectId,
  userId: UUID,
  taxYear: Number,
  weekNumber: Number,
  transactions: [{
    transactionId: UUID,
    type: String,
    category: String,
    amount: Number,
    date: Date
  }],
  summary: {
    totalIncome: Number,
    totalExpenses: Number,
    estimatedTax: Number
  },
  createdAt: Date
}
```

#### Document Processing Logs
```javascript
{
  _id: ObjectId,
  documentId: UUID,
  userId: UUID,
  processingSteps: [{
    step: String,
    status: String,
    data: Object,
    timestamp: Date
  }],
  errors: [String],
  createdAt: Date
}
```

---

## 4. Core Features & Functionality

### 4.1 User Management
- User registration and authentication
- Profile management
- TIN verification (future integration)

### 4.2 Document Upload & Processing
- **Bank Statement Upload:**
  - Support PDF, CSV, Excel formats
  - Extract transactions (date, amount, description, type)
  - Categorize transactions automatically
  - Manual review and correction interface
  
- **Other Documents:**
  - Receipts, invoices, pay slips
  - Manual entry option

### 4.3 Transaction Management
- **CRUD Operations:**
  - Create, read, update, delete transactions
  - Bulk import from statements
  - Categorization (income/expense)
  - Tagging (tax-deductible, VAT-applicable)

- **Categorization:**
  - Income: Salary, Business Income, Rental Income, Investment Income, Other
  - Expenses: Rent, Utilities, Transportation, Healthcare, Education, Business Expenses, Other

### 4.4 Tax Calculation Engine
- **Income Calculation:**
  - Sum all income sources
  - Apply exemptions (₦800,000 threshold)
  
- **Deduction Calculation:**
  - Identify tax-deductible expenses
  - Calculate total deductions
  
- **Tax Liability Calculation:**
  - Apply progressive tax brackets
  - Calculate estimated annual tax
  - Project weekly/monthly tax liability

### 4.5 Report Generation
- **Weekly Reports:**
  - Income summary
  - Expense summary
  - Tax estimate
  - Tips and suggestions
  
- **Monthly Reports:**
  - Comprehensive financial overview
  - Tax projections
  - Year-to-date calculations
  
- **Annual Reports:**
  - Tax filing ready format
  - Complete transaction history
  - All deductions and exemptions
  - Final tax liability estimate

### 4.6 Analytics & Tips Engine
- **Personalized Tips:**
  - Based on income level
  - Based on expense patterns
  - Based on tax bracket
  - Compliance reminders
  
- **Suggestions:**
  - Potential deductions user might be missing
  - Tax-saving opportunities
  - Expense optimization recommendations

### 4.7 History & Tracking
- Weekly snapshots of financial status
- Historical comparison (week-over-week, month-over-month)
- Trend analysis
- Tax liability projections over time

---

## 5. API Endpoints Design

### 5.1 Authentication
```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
POST   /api/auth/refresh-token
GET    /api/auth/me
```

### 5.2 User Management
```
GET    /api/users/profile
PUT    /api/users/profile
PATCH  /api/users/tin
```

### 5.3 Tax Profiles
```
GET    /api/tax-profiles
GET    /api/tax-profiles/:year
POST   /api/tax-profiles
PUT    /api/tax-profiles/:id
GET    /api/tax-profiles/:id/estimate
```

### 5.4 Documents
```
POST   /api/documents/upload
GET    /api/documents
GET    /api/documents/:id
DELETE /api/documents/:id
POST   /api/documents/:id/process
GET    /api/documents/:id/status
```

### 5.5 Transactions
```
GET    /api/transactions
GET    /api/transactions/:id
POST   /api/transactions
PUT    /api/transactions/:id
DELETE /api/transactions/:id
POST   /api/transactions/bulk-import
GET    /api/transactions/summary
```

### 5.6 Reports
```
GET    /api/reports
GET    /api/reports/:id
POST   /api/reports/generate
GET    /api/reports/weekly
GET    /api/reports/monthly
GET    /api/reports/annual
GET    /api/reports/:id/download
```

### 5.7 Tips & Suggestions
```
GET    /api/tips
GET    /api/tips/personalized
GET    /api/suggestions
```

### 5.8 History
```
GET    /api/history/weekly
GET    /api/history/monthly
GET    /api/history/comparison
```

---

## 6. Tax Calculation Logic

### 6.1 Tax Bracket Calculation (2026 Reform)

```javascript
function calculatePersonalIncomeTax(annualIncome) {
  // Exemption threshold
  if (annualIncome <= 800000) {
    return 0;
  }
  
  // Progressive brackets (estimated - needs official confirmation)
  let tax = 0;
  let taxableIncome = annualIncome;
  
  // First bracket: ₦800,001 - ₦1,500,000 at 15%
  if (taxableIncome > 800000) {
    const bracket1Amount = Math.min(taxableIncome - 800000, 700000);
    tax += bracket1Amount * 0.15;
  }
  
  // Second bracket: Above ₦1,500,000 at 25%
  if (taxableIncome > 1500000) {
    const bracket2Amount = taxableIncome - 1500000;
    tax += bracket2Amount * 0.25;
  }
  
  return tax;
}
```

### 6.2 Deductible Expenses
- Business expenses (for self-employed)
- Professional development/training
- Medical expenses (with limits)
- Charitable donations
- Pension contributions
- *Note: Exact deductible items need verification*

### 6.3 VAT Calculation
- Identify VAT-applicable expenses
- Apply 7.5% VAT rate
- Exclude: Food, healthcare, education, rent, public transport

---

## 7. Security Considerations

1. **Data Encryption:**
   - Encrypt sensitive data at rest
   - Use HTTPS for all API communications
   - Encrypt file uploads

2. **Authentication:**
   - JWT tokens with expiration
   - Refresh token mechanism
   - Password hashing (bcrypt)

3. **Authorization:**
   - User can only access their own data
   - Role-based access control (for future admin features)

4. **Data Privacy:**
   - Comply with Nigeria Data Protection Regulation (NDPR)
   - Secure document storage
   - Audit logs for sensitive operations

5. **Input Validation:**
   - Validate all user inputs
   - Sanitize file uploads
   - Prevent SQL injection, XSS attacks

---

## 8. MVP Scope & Priorities

### Phase 1: Core MVP (Backend)
**Must Have:**
1. User authentication and profile management
2. Document upload (bank statements - PDF/CSV)
3. Basic transaction extraction and categorization
4. Tax calculation engine (2026 brackets)
5. Weekly report generation
6. Basic tips engine
7. Transaction history

**Nice to Have:**
1. Advanced document parsing (OCR)
2. Automated categorization using ML
3. Monthly/annual reports
4. Email notifications
5. Advanced analytics

**Future:**
1. Direct tax filing integration
2. TIN verification API
3. NRS system integration
4. Mobile app backend
5. Multi-currency support

---

## 9. Development Phases

### Phase 1: Foundation (Week 1-2)
- Project setup
- Database schema implementation
- Authentication system
- Basic API structure

### Phase 2: Core Features (Week 3-4)
- Document upload and storage
- Transaction management
- Tax calculation engine
- Basic report generation

### Phase 3: Intelligence (Week 5-6)
- Tips and suggestions engine
- Advanced categorization
- History tracking
- Analytics

### Phase 4: Polish & Testing (Week 7-8)
- Error handling
- Performance optimization
- Security hardening
- API documentation
- Testing

---

## 10. Key Decisions Needed

1. **Exact Tax Brackets:** Need official documentation for precise brackets
2. **Deductible Expenses:** Comprehensive list of what's deductible
3. **File Storage:** Cloud (S3/Cloudinary) vs Local for MVP
4. **Document Parsing:** OCR service vs manual parsing
5. **Database:** PostgreSQL only vs PostgreSQL + MongoDB hybrid
6. **Deployment:** Cloud provider (AWS, Azure, GCP) or self-hosted

---

## 11. Next Steps

1. **Research:**
   - Get official tax bracket documentation
   - Verify deductible expense categories
   - Research NRS digital filing standards

2. **Setup:**
   - Initialize backend project
   - Set up database
   - Configure development environment

3. **Development:**
   - Start with authentication
   - Build core features incrementally
   - Test with sample data

4. **Validation:**
   - Consult with tax professionals
   - Validate calculations
   - User testing

---

## 12. Resources & References

- Nigeria Revenue Service (NRS) - Official website
- Federal Inland Revenue Service (FIRS) - Transitioning to NRS
- Personal Income Tax Act (PITA)
- Companies Income Tax Act (CITA)
- Value Added Tax Act (VATA)
- Nigeria Data Protection Regulation (NDPR)

---

**Document Version:** 1.0  
**Last Updated:** 2025-01-XX  
**Status:** Planning Phase

