# FIRS Forms Implementation Guide

## Overview
This document outlines how to obtain, structure, and implement FIRS tax forms for auto-filling and PDF generation.

## FIRS Forms Needed

### Individual Forms
1. **Individual Tax Return Form** (ITF001)
2. **PAYE Return Form** (if applicable)
3. **Capital Gains Tax Return** (if applicable)

### Business Forms
1. **Company Income Tax Return Form** (CTF001)
2. **PAYE Return Form** (for employers)
3. **VAT Return Form** (if applicable)
4. **Development Levy Return** (for companies)

## Obtaining FIRS Forms

### Option 1: Download from FIRS Website
1. Visit https://www.firs.gov.ng/
2. Navigate to "Forms" or "Downloads" section
3. Download latest forms (2025/2026 versions)
4. Save to `docs/forms/firs_forms/` directory

### Option 2: Request from FIRS
- Contact FIRS directly for official form templates
- Ensure forms are current (2025 Tax Act compliant)

### Option 3: Create Form Structures
- Based on Nigeria Tax Act 2025 requirements
- Map form fields to our data model
- Create PDF templates matching FIRS format

## Form Structure Mapping

### Individual Tax Return Form Mapping
```javascript
{
  "formCode": "ITF001",
  "sections": {
    "personalInfo": {
      "fields": [
        { "formField": "surname", "dataPath": "personalInformation.lastName" },
        { "formField": "firstName", "dataPath": "personalInformation.firstName" },
        { "formField": "nin", "dataPath": "primaryNIN" },
        { "formField": "tin", "dataPath": "primaryTIN" }
      ]
    },
    "income": {
      "fields": [
        { "formField": "employmentIncome", "dataPath": "employmentDetails.annualGrossSalary" },
        { "formField": "businessIncome", "dataPath": "businessDetails.annualBusinessIncome" },
        { "formField": "rentalIncome", "dataPath": "rentalIncome.totalRentalIncome" }
      ]
    },
    "deductions": {
      "fields": [
        { "formField": "nhf", "dataPath": "deductions.nhfContribution" },
        { "formField": "pension", "dataPath": "deductions.pensionContribution" },
        { "formField": "rentRelief", "dataPath": "deductions.rentRelief" }
      ]
    },
    "taxCalculation": {
      "fields": [
        { "formField": "chargeableIncome", "dataPath": "calculated.chargeableIncome" },
        { "formField": "taxPayable", "dataPath": "calculated.finalTaxPayable" }
      ]
    }
  }
}
```

## Form Generation Process

### Step 1: Data Collection
- Collect all data from TaxableProfile
- Run calculations
- Validate all required fields

### Step 2: Form Mapping
- Map collected data to form fields
- Apply auto-calculations
- Fill in derived values

### Step 3: PDF Generation
- Use PDF library (pdfkit, puppeteer, etc.)
- Load form template
- Fill in data
- Generate PDF

### Step 4: Validation
- Check all required fields filled
- Validate calculations
- Ensure compliance with FIRS requirements

## Implementation Plan

### Phase 1: Form Structure Definition
- [x] Create form structure JSON files
- [ ] Download actual FIRS forms
- [ ] Map form fields to data model
- [ ] Create field validation rules

### Phase 2: PDF Template Creation
- [ ] Create PDF templates matching FIRS forms
- [ ] Add form fields (text fields, checkboxes, etc.)
- [ ] Style forms to match FIRS format
- [ ] Add form codes and version numbers

### Phase 3: Auto-Fill Engine
- [ ] Create form filler service
- [ ] Map data to form fields
- [ ] Handle calculations
- [ ] Apply formatting

### Phase 4: PDF Generation
- [ ] Integrate PDF library
- [ ] Generate filled forms
- [ ] Add digital signatures (if needed)
- [ ] Create download endpoints

## Current Status

✅ **Form Structures Defined**: `FIRS_FORM_STRUCTURES.json`
✅ **Data Mapping**: All fields mapped to data model
✅ **Auto-Calculations**: All calculated fields identified
⏳ **Actual Forms**: Need to download from FIRS website
⏳ **PDF Generation**: To be implemented

## Next Steps

1. **Download FIRS Forms**: Get official forms from FIRS website
2. **Create PDF Templates**: Convert forms to fillable PDF templates
3. **Implement Form Filler**: Auto-fill forms with collected data
4. **Add Validation**: Ensure forms are complete before generation
5. **Create Download Endpoints**: Allow users to download filled forms

