# Joint Profile Flow Guide

## Overview
Joint profiles allow multiple parties to file taxes together, combining their income and deductions for potentially better tax outcomes.

## Joint Spouse Flow

### Step 1: Profile Creation
- User creates profile with type: `Joint_Spouse`
- Author is set (who created the profile)
- Primary user is set (first spouse)

### Step 2: Joint-Specific Questions
- Answer joint spouse questions (JOINT_001 through JOINT_005)
- Collect NIN and TIN for both spouses
- Determine how to combine incomes

### Step 3: Individual Questions for Each Spouse
- **First Spouse** answers Individual base questions (IND_001 through IND_016)
- **Second Spouse** answers Individual base questions (IND_001 through IND_016)
- Each spouse's data is stored separately but linked to the same profile

### Step 4: Data Combination
- System combines both spouses' income
- System combines both spouses' deductions
- Calculates tax on combined taxable income
- Shows breakdown for each spouse

### Step 5: Calculations
- Tax calculated on combined income
- Deductions applied from both spouses
- Final tax liability calculated
- Can show individual and combined views

## Joint Business Flow

### Step 1: Profile Creation
- User creates profile with type: `Joint_Business`
- Author is set (who created the profile)
- Primary user is set (first partner)

### Step 2: Joint Business Questions
- Answer joint business questions (JBUS_001 through JBUS_004)
- Specify number of partners
- Define profit sharing arrangement
- Collect business TIN

### Step 3: Partner Information Collection
- For each partner:
  - Collect NIN
  - Collect individual TIN (if available)
  - Define share percentage or arrangement

### Step 4: Business Questions
- All partners input business information together
- Answer business base questions (BUS_001 through BUS_012)
- Input business income and expenses
- Each partner can see and edit (based on permissions)

### Step 5: Income/Expense Allocation
- Business income allocated to each partner based on share
- Business expenses allocated proportionally
- Each partner's individual tax calculated on their share

### Step 6: Calculations
- Tax calculated for each partner on their share
- Combined view shows total business tax
- Individual views show each partner's liability

## Data Structure

### Joint Spouse Profile
```json
{
  "profileId": "TP123456789",
  "profileType": "Joint_Spouse",
  "user": "primary_spouse_user_id",
  "author": "creator_user_id",
  "jointParties": [
    {
      "user": "spouse1_user_id",
      "role": "spouse",
      "sharePercentage": 50,
      "nin": "12345678901",
      "tin": "1234567890"
    },
    {
      "user": "spouse2_user_id",
      "role": "spouse",
      "sharePercentage": 50,
      "nin": "98765432109",
      "tin": "9876543210"
    }
  ],
  "primaryNIN": "12345678901",
  "primaryTIN": "1234567890"
}
```

### Joint Business Profile
```json
{
  "profileId": "TP987654321",
  "profileType": "Joint_Business",
  "user": "primary_partner_user_id",
  "author": "creator_user_id",
  "jointParties": [
    {
      "user": "partner1_user_id",
      "role": "business_partner",
      "sharePercentage": 40,
      "nin": "11111111111",
      "tin": "1111111111"
    },
    {
      "user": "partner2_user_id",
      "role": "business_partner",
      "sharePercentage": 60,
      "nin": "22222222222",
      "tin": "2222222222"
    }
  ],
  "primaryNIN": "11111111111",
  "primaryTIN": "1111111111"
}
```

## API Considerations

### Creating Joint Profile
- `POST /api/taxableprofile/create`
  - Body includes `profileType: "Joint_Spouse"` or `"Joint_Business"`
  - Can include `jointParties` array in initial creation
  - Or add parties later via separate endpoint

### Adding Joint Parties
- `POST /api/taxableprofile/:profileId/joint-parties`
  - Add additional parties to existing joint profile
  - Validate NIN/TIN format
  - Set share percentages

### Inputting Data for Joint Profile
- Each party can input their own data
- Data is stored with party identifier
- Calculations combine all parties' data
- Views can show individual or combined

## Permissions
- Author: Full access (created the profile)
- Primary User: Full access (owner)
- Joint Parties: Can input their own data, view combined results
- Others: No access

