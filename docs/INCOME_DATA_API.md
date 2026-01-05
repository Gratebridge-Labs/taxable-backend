# Income Data API Documentation

## Overview
The Income Data API supports saving income information with both **monthly** and **annual** periods. This allows users to track their income throughout the year on a monthly basis, or enter it all at once annually. The API includes auto-save functionality for seamless user experience.

## Endpoints

### 1. Save Income Data (with Auto-Save)
**POST** `/api/questions/:profileId/income`

Saves income data for a specific question. Supports both monthly and annual periods.

#### Request Body
```json
{
  "questionId": "IND_DET_EMPLOYMENT_007",
  "response": 5000000,
  "period": "monthly",  // or "annually"
  "month": 1,           // Required if period is "monthly" (1-12)
  "year": 2025,          // Required if period is "monthly"
  "autoSave": true       // Optional: indicates if this is an auto-save
}
```

#### Response (Monthly)
```json
{
  "success": true,
  "message": "Income data auto-saved successfully",
  "data": {
    "responseId": "65a1b2c3d4e5f6g7h8i9j0k1",
    "questionId": "IND_DET_EMPLOYMENT_007",
    "response": 5000000,
    "period": "monthly",
    "month": 1,
    "year": 2025,
    "annualTotal": null,  // Will be calculated when all 12 months are filled
    "savedAt": "2025-01-15T10:30:00.000Z"
  }
}
```

#### Response (Annual)
```json
{
  "success": true,
  "message": "Income data saved successfully",
  "data": {
    "responseId": "65a1b2c3d4e5f6g7h8i9j0k1",
    "questionId": "IND_DET_EMPLOYMENT_007",
    "response": 60000000,
    "period": "annually",
    "month": null,
    "year": 2025,
    "annualTotal": null,
    "savedAt": "2025-01-15T10:30:00.000Z"
  }
}
```

#### Response (Monthly - All 12 Months Complete)
```json
{
  "success": true,
  "message": "Income data auto-saved successfully",
  "data": {
    "responseId": "65a1b2c3d4e5f6g7h8i9j0k1",
    "questionId": "IND_DET_EMPLOYMENT_007",
    "response": 5000000,
    "period": "monthly",
    "month": 12,
    "year": 2025,
    "annualTotal": 60000000,  // Auto-calculated sum of all 12 months
    "savedAt": "2025-12-15T10:30:00.000Z"
  }
}
```

### 2. Get Income Data
**GET** `/api/questions/:profileId/income/:questionId?period=monthly&year=2025`

Retrieves income data for a specific question.

#### Query Parameters
- `period`: `"monthly"` or `"annually"` (default: `"annually"`)
- `year`: Required if `period` is `"monthly"`

#### Response (Monthly)
```json
{
  "success": true,
  "message": "Monthly income data retrieved successfully",
  "data": {
    "questionId": "IND_DET_EMPLOYMENT_007",
    "period": "monthly",
    "year": 2025,
    "monthlyData": {
      "1": {
        "month": 1,
        "year": 2025,
        "response": 5000000,
        "updatedAt": "2025-01-15T10:30:00.000Z"
      },
      "2": {
        "month": 2,
        "year": 2025,
        "response": 5000000,
        "updatedAt": "2025-02-15T10:30:00.000Z"
      },
      // ... months 3-11
      "12": {
        "month": 12,
        "year": 2025,
        "response": 5000000,
        "updatedAt": "2025-12-15T10:30:00.000Z"
      }
    },
    "annualTotal": 60000000,
    "allMonthsComplete": true
  }
}
```

#### Response (Annual)
```json
{
  "success": true,
  "message": "Annual income data retrieved successfully",
  "data": {
    "questionId": "IND_DET_EMPLOYMENT_007",
    "period": "annually",
    "year": 2025,
    "response": 60000000,
    "updatedAt": "2025-01-15T10:30:00.000Z"
  }
}
```

## Usage Examples

### Example 1: Monthly Income Entry (Auto-Save)
User enters salary for January 2025:

```javascript
// Frontend auto-saves on blur/change
POST /api/questions/TP123456789/income
{
  "questionId": "IND_DET_EMPLOYMENT_007",
  "response": 5000000,
  "period": "monthly",
  "month": 1,
  "year": 2025,
  "autoSave": true
}
```

### Example 2: Switching Between Monthly and Annual
User starts with monthly, then switches to annual:

```javascript
// Step 1: User has entered monthly data for Jan-Mar
// Step 2: User switches to "Annual" view
// Step 3: System calculates total from monthly entries OR allows manual entry

// If user wants to enter annual total directly:
POST /api/questions/TP123456789/income
{
  "questionId": "IND_DET_EMPLOYMENT_007",
  "response": 60000000,
  "period": "annually"
}
```

### Example 3: Table-Based Income (Multiple Income Sources)
For questions that use table format (e.g., investment income):

```javascript
POST /api/questions/TP123456789/income
{
  "questionId": "IND_DET_INVESTMENT_001",
  "response": [
    {
      "source": "Dividends",
      "amount": 500000,
      "description": "Stock dividends"
    },
    {
      "source": "Interest",
      "amount": 200000,
      "description": "Bank interest"
    }
  ],
  "period": "annually"
}
```

### Example 4: Monthly Table Data
For monthly income with multiple sources:

```javascript
POST /api/questions/TP123456789/income
{
  "questionId": "IND_DET_INVESTMENT_001",
  "response": [
    {
      "source": "Dividends",
      "amount": 41667,  // Monthly amount
      "description": "Stock dividends"
    }
  ],
  "period": "monthly",
  "month": 1,
  "year": 2025,
  "autoSave": true
}
```

## Frontend Integration

### Auto-Save Implementation
```javascript
// Example: Auto-save on input change (with debounce)
let debounceTimer;

function handleIncomeInput(questionId, value, period, month, year) {
  clearTimeout(debounceTimer);
  
  debounceTimer = setTimeout(() => {
    fetch(`/api/questions/${profileId}/income`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        questionId: questionId,
        response: value,
        period: period,
        month: month,
        year: year,
        autoSave: true
      })
    })
    .then(res => res.json())
    .then(data => {
      if (data.success) {
        // Show auto-save indicator
        showAutoSaveIndicator('Saved');
        
        // If all 12 months complete, show annual total
        if (data.data.annualTotal) {
          displayAnnualTotal(data.data.annualTotal);
        }
      }
    });
  }, 1000); // 1 second debounce
}
```

### Monthly View Toggle
```javascript
// User toggles between Monthly and Annual view
function togglePeriod(period) {
  if (period === 'monthly') {
    // Load monthly data for current year
    fetch(`/api/questions/${profileId}/income/${questionId}?period=monthly&year=2025`)
      .then(res => res.json())
      .then(data => {
        // Display monthly inputs (12 fields)
        displayMonthlyInputs(data.data.monthlyData);
        
        // Show annual total if all months complete
        if (data.data.allMonthsComplete) {
          displayAnnualTotal(data.data.annualTotal);
        }
      });
  } else {
    // Load annual data
    fetch(`/api/questions/${profileId}/income/${questionId}?period=annually`)
      .then(res => res.json())
      .then(data => {
        // Display single annual input
        displayAnnualInput(data.data.response);
      });
  }
}
```

## Supported Income Questions

### Individual Profile
- `IND_DET_EMPLOYMENT_007`: Annual gross salary
- `IND_DET_EMPLOYMENT_008`: Basic salary
- `IND_DET_EMPLOYMENT_009`: Housing allowance
- `IND_DET_EMPLOYMENT_010`: Transport allowance
- `IND_DET_EMPLOYMENT_011`: PAYE deducted
- `IND_DET_RENTAL_001`: Rental income
- `IND_DET_INVESTMENT_001`: Investment income (table)

### Business Profile
- `BUS_DET_INCOME_001`: Total business revenue
- `BUS_DET_INCOME_002`: Revenue sources (table)
- `BUS_DET_INCOME_004`: Other income (table)

## Error Handling

### Missing Required Fields
```json
{
  "success": false,
  "message": "Month and year are required for monthly period"
}
```

### Invalid Period
```json
{
  "success": false,
  "message": "Period must be either \"monthly\" or \"annually\""
}
```

### Invalid Month
```json
{
  "success": false,
  "message": "Month must be between 1 and 12"
}
```

### Question Not Found
```json
{
  "success": false,
  "message": "Question not found"
}
```

### Not an Income Question
```json
{
  "success": false,
  "message": "This endpoint is only for income questions. Use /answer endpoint for other questions."
}
```

## Notes

1. **Auto-Save**: The `autoSave` flag is informational and doesn't affect functionality. It's useful for UI indicators.

2. **Annual Total Calculation**: When all 12 months are filled for a monthly question, the system automatically calculates and returns the annual total.

3. **Period Switching**: Users can switch between monthly and annual views. Monthly data is preserved even when viewing annual, and vice versa.

4. **Validation**: All income questions must have `categoryKey: "incomeanddeductions"` to use this endpoint.

5. **Business Profiles**: Business income questions also support monthly/annual periods for tracking revenue throughout the year.

