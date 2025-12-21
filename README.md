# Taxable Backend - MVP

A backend system to help Nigerians prepare for the 2026 Tax Reform by providing tax estimation, monitoring, tips, and tax-filing ready reports.

## 📋 Overview

**Taxable** is designed to:
- Help users understand their tax obligations under the 2026 Tax Reform
- Provide personalized tax tips and suggestions
- Calculate and monitor estimated tax liabilities
- Generate tax-filing ready reports
- Track financial history and trends

## 🎯 Key Features (MVP)

1. **User Management**
   - Registration and authentication
   - Profile management
   - TIN (Tax Identification Number) storage

2. **Document Processing**
   - Bank statement upload (PDF, CSV, Excel)
   - Transaction extraction and categorization
   - Manual transaction entry

3. **Tax Calculation**
   - 2026 Tax Reform compliant calculations
   - Progressive tax bracket application
   - Weekly/monthly/annual projections

4. **Reporting**
   - Weekly financial summaries
   - Monthly comprehensive reports
   - Annual tax-filing ready reports
   - Personalized tips and suggestions

5. **History & Tracking**
   - Weekly snapshots
   - Historical comparisons
   - Trend analysis

## 📚 Documentation

- **[PLANNING.md](./PLANNING.md)** - Comprehensive planning document with architecture, database schema, API design
- **[TAX_CALCULATION_GUIDE.md](./TAX_CALCULATION_GUIDE.md)** - Tax calculation logic, examples, and formulas
- **[IMPLEMENTATION_ROADMAP.md](./IMPLEMENTATION_ROADMAP.md)** - Step-by-step implementation guide and checklist

## 🔑 Key Insights from 2026 Tax Reform Research

### Personal Income Tax
- **Exemption:** ₦800,000 or less annually = 0% tax
- **Progressive Rates:** 0% to 25% based on income brackets
- **Estimated Brackets:**
  - ₦0 - ₦800,000: 0% (Exempt)
  - ₦800,001 - ₦1,500,000: 15%
  - Above ₦1,500,000: 25%

### VAT Changes
- **Exempt Items:** Food, healthcare, education, residential rent, public transport
- **Standard Rate:** 7.5%

### Administrative Changes
- FIRS → NRS (Nigeria Revenue Service)
- Digital tax-filing system with biometric identification
- Mandatory TIN for financial transactions
- E-invoicing requirements for businesses

## 🏗️ Technology Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB (with Mongoose)
- **Authentication:** JWT
- **File Processing:** PDF-parse, CSV-parser, XLSX
- **File Storage:** Local (MVP) → Cloud (Production)

## 📁 Project Structure

```
taxable-backend/
├── config/          # Database, constants, configurations
├── controllers/     # Request handlers
├── models/          # MongoDB schemas
├── routes/          # API routes
├── middleware/      # Auth, validation, error handling
├── services/        # Business logic (tax calc, reports, tips)
├── utils/           # Helpers, parsers, validators
└── server.js        # Entry point
```

## 🚀 Quick Start (After Implementation)

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Set Environment Variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

3. **Start Development Server**
   ```bash
   npm run dev
   ```

4. **Start Production Server**
   ```bash
   npm start
   ```

## 📊 API Endpoints Overview

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Documents
- `POST /api/documents/upload` - Upload bank statement
- `GET /api/documents` - List user documents
- `GET /api/documents/:id` - Get document details
- `DELETE /api/documents/:id` - Delete document

### Transactions
- `GET /api/transactions` - List transactions
- `POST /api/transactions` - Create transaction
- `POST /api/transactions/bulk-import` - Bulk import from document
- `GET /api/transactions/summary` - Transaction summary

### Tax Profiles
- `GET /api/tax-profiles` - List tax profiles
- `POST /api/tax-profiles` - Create tax profile
- `GET /api/tax-profiles/:id/estimate` - Get tax estimate

### Reports
- `GET /api/reports` - List reports
- `POST /api/reports/generate` - Generate new report
- `GET /api/reports/weekly` - Get weekly report
- `GET /api/reports/annual` - Get annual report

### Tips
- `GET /api/tips/personalized` - Get personalized tips
- `GET /api/suggestions` - Get tax suggestions

## ⚠️ Important Notes

1. **Tax Brackets:** The exact tax brackets need to be verified from official NRS documentation. Current implementation uses estimated brackets.

2. **Deductions:** The list of deductible expenses needs official verification. System is designed to be easily updated.

3. **Data Privacy:** System must comply with Nigeria Data Protection Regulation (NDPR).

4. **Security:** All sensitive data must be encrypted. File uploads must be validated and secured.

## 🔄 Development Phases

### Phase 1: Foundation (Week 1-2)
- Project setup
- Database schema
- Authentication

### Phase 2: Core Features (Week 3-4)
- Document upload
- Transaction management
- Tax calculation

### Phase 3: Intelligence (Week 5-6)
- Report generation
- Tips engine
- Analytics

### Phase 4: Polish (Week 7-8)
- Testing
- Security
- Documentation
- Deployment prep

## 📝 Next Steps

1. Review planning documents
2. Confirm tax brackets with official sources
3. Set up development environment
4. Begin Phase 1 implementation
5. Consult with tax professionals for validation

## 🤝 Contributing

This is an MVP project. Contributions and feedback are welcome!

## 📄 License

[To be determined]

---

**Status:** Planning Complete - Ready for Implementation  
**Last Updated:** 2025-01-XX

# taxable-backend
