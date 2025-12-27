# Tax Engine Documentation

This directory contains all documentation, rules, and configuration files for the Nigerian Tax Engine.

## Directory Structure

```
docs/
├── README.md (this file)
├── TAX_ENGINE_PLAN.md (Overall plan and roadmap)
├── questions/
│   ├── INDIVIDUAL_BASE_QUESTIONS.json
│   ├── BUSINESS_BASE_QUESTIONS.json
│   ├── JOINT_SPOUSE_QUESTIONS.json
│   └── JOINT_BUSINESS_QUESTIONS.json
├── rules/
│   ├── TAX_RATES_2025.json
│   ├── DEDUCTIONS_ALLOWANCES_2025.json
│   └── TERMINOLOGY.json
└── forms/
    └── (FIRS form structures - to be added)
```

## Files Overview

### Questions Files
- **INDIVIDUAL_BASE_QUESTIONS.json**: Base qualifying questions for individual tax profiles
- **BUSINESS_BASE_QUESTIONS.json**: Base qualifying questions for business tax profiles
- **JOINT_SPOUSE_QUESTIONS.json**: Questions specific to joint spouse filings
- **JOINT_BUSINESS_QUESTIONS.json**: Questions specific to joint business partner filings

### Rules Files
- **TAX_RATES_2025.json**: Tax rates and brackets for individuals and companies (based on Nigeria Tax Act 2025)
- **DEDUCTIONS_ALLOWANCES_2025.json**: All deductions, allowances, and their limits (based on Nigeria Tax Act 2025)
- **TERMINOLOGY.json**: Definitions of tax terms for user education

## Maintenance Guidelines

### Updating Questions
1. Edit the appropriate JSON file in `questions/`
2. Update the `lastUpdated` date
3. Increment version if making breaking changes
4. Test question flow after updates

### Updating Tax Rules
1. Edit the appropriate JSON file in `rules/`
2. Update the `lastUpdated` date and `effectiveYear` if applicable
3. Reference the specific section of Nigeria Tax Act 2025
4. Update calculation logic in code if rates change

### Adding New Questions
1. Follow the existing JSON structure
2. Assign unique questionId (format: PROFILE_TYPE_NUMBER)
3. Set proper dependencies and conditional logic
4. Include detailed explanations with terminology breakdowns
5. Update version number

### Adding New Rules
1. Follow the existing JSON structure
2. Reference the Nigeria Tax Act 2025 section
3. Include clear explanations
4. Update version number

## Version Control
- Each file has a `version` field
- Increment version for breaking changes
- Keep `lastUpdated` date current
- Document changes in commit messages

## Sources
- **Primary Source**: Nigeria Tax Act 2025 (Official Gazette)
- **Regulatory Body**: FIRS (Federal Inland Revenue Service)
- **Website**: https://www.firs.gov.ng/

## Notes
- All amounts are in NGN (Nigerian Naira)
- All rates are based on Nigeria Tax Act 2025
- Rules are effective for tax year 2025 and onwards
- Always verify with FIRS for latest updates

