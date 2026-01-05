# Income Questions Reference

## Overview
This document lists all income-related question IDs that support monthly/annual periods and can be saved using the `/api/questions/:profileId/income` endpoint.

## Individual Profile Income Questions

### Employment Income
- `IND_DET_EMPLOYMENT_007` - Annual gross salary
- `IND_DET_EMPLOYMENT_008` - Basic salary
- `IND_DET_EMPLOYMENT_009` - Housing allowance
- `IND_DET_EMPLOYMENT_010` - Transport allowance
- `IND_DET_EMPLOYMENT_011` - PAYE deducted
- `IND_DET_EMPLOYMENT_013` - Benefits-in-kind (table format)

### Business Income (Self-Employment)
- `IND_DET_BUSINESS_004` - Annual business income (revenue)

### Rental Income
- `IND_DET_RENTAL_001` - Number of properties
- `IND_DET_RENTAL_002` - Rental income and expenses (table format)

### Investment Income
- `IND_DET_INVESTMENT_001` - Investment income types (table format: dividends, interest, capital gains)

## Business Profile Income Questions

### Business Revenue
- `BUS_DET_INCOME_001` - Total business revenue (turnover)
- `BUS_DET_INCOME_002` - Revenue sources (table format)
- `BUS_DET_INCOME_003` - Other income (yes/no)
- `BUS_DET_INCOME_004` - Other income details (table format: dividends, interest, rental, capital gains)

## API Endpoints

### 1. Get All Detailed Questions (Includes Income Data)
**GET** `/api/questions/:profileId/detailed-questions?period=monthly`

Returns all detailed questions grouped by category, including income data.

#### Query Parameters
- `period`: `"monthly"` or `"annually"` (default: `"annually"`)

#### Response Structure for Income Questions
```json
{
  "success": true,
  "data": {
    "profileId": "TP123456789",
    "profileType": "Individual",
    "year": 2025,
    "period": "monthly",
    "categories": [
      {
        "categoryKey": "incomeanddeductions",
        "categoryName": "Income and Deductions",
        "questions": [
          {
            "questionId": "IND_DET_EMPLOYMENT_007",
            "questionText": "What is your annual gross salary?",
            "questionType": "number",
            "categoryKey": "incomeanddeductions",
            "period": "monthly",
            "supportsMonthly": true,
            "supportsAnnually": true,
            "answered": true,
            "existingResponse": 5000000,
            "answeredAt": "2025-01-15T10:30:00.000Z",
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
              }
              // ... months 3-12
            },
            "annualTotal": 60000000,
            "allMonthsComplete": true
          }
        ]
      }
    ]
  }
}
```

### 2. Save Income Data (Auto-Save)
**POST** `/api/questions/:profileId/income`

Saves income data with monthly/annual period support.

#### Request Body
```json
{
  "questionId": "IND_DET_EMPLOYMENT_007",
  "response": 5000000,
  "period": "monthly",
  "month": 1,
  "year": 2025,
  "autoSave": true
}
```

#### Response
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
    "annualTotal": null,
    "savedAt": "2025-01-15T10:30:00.000Z"
  }
}
```

### 3. Answer Base Questions (All at Once)
**POST** `/api/questions/:profileId/answer-base-questions`

Works for both Individual and Business profiles. Submits all base question answers in a single request.

#### Request Body
```json
{
  "answers": [
    {
      "questionId": "IND_BASE_001",
      "response": ["Employment (Salary/Wages)", "Rental Income"]
    },
    {
      "questionId": "IND_BASE_002",
      "response": "I rent accommodation"
    },
    {
      "questionId": "IND_BASE_003",
      "response": ["National Housing Fund (NHF)", "Pension Scheme (RSA)"]
    },
    {
      "questionId": "IND_BASE_004",
      "response": "No additional income"
    },
    {
      "questionId": "IND_BASE_005",
      "response": false
    },
    {
      "questionId": "IND_BASE_006",
      "response": ["None of the above"]
    }
  ]
}
```

#### Response
```json
{
  "success": true,
  "message": "All base questions answered successfully",
  "data": {
    "savedResponses": [
      {
        "questionId": "IND_BASE_001",
        "responseId": "65a1b2c3d4e5f6g7h8i9j0k1"
      }
      // ... all saved responses
    ],
    "nextQuestions": [
      // Conditional questions based on answers
    ],
    "hasMoreQuestions": true,
    "baseQuestionsComplete": true
  }
}
```

## Usage Flow

1. **Create Taxable Profile**
   - Individual or Business profile

2. **Answer Base Questions**
   - `POST /api/questions/:profileId/answer-base-questions`
   - Submit all base questions at once
   - Works for both Individual and Business

3. **Get All Detailed Questions**
   - `GET /api/questions/:profileId/detailed-questions?period=monthly`
   - Returns all questions grouped by category
   - Includes income data (monthly/annual) if available

4. **Save Income Data**
   - `POST /api/questions/:profileId/income`
   - Use for income questions with monthly/annual periods
   - Supports auto-save

5. **Answer Other Questions**
   - `POST /api/questions/:profileId/answer`
   - Use for non-income detailed questions

## Notes

- All income questions have `categoryKey: "incomeanddeductions"`
- Income questions support both `monthly` and `annually` periods
- When all 12 months are filled, `annualTotal` is automatically calculated
- Base questions endpoint works for both Individual and Business profiles automatically
- The system determines which questions to load based on `profile.profileType`

