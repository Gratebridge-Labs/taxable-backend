# Account System Migration Guide

## Overview

The system now supports multiple accounts per user:
- **Individual Accounts**: For personal tax filing
- **Business Accounts**: For business tax filing
- Users can have multiple business accounts

## Key Changes

### Models Updated
- ✅ `Account` - New model for individual/business accounts
- ✅ `User` - Added `defaultIndividualAccount` reference
- ✅ `Transaction` - Now references `account` instead of just `user`
- ✅ `Document` - Now references `account`
- ✅ `TaxProfile` - Now references `account`
- ✅ `Report` - Now references `account`

### Controllers Updated
- ✅ `accountController` - New controller for account management
- ✅ `authController` - Creates default individual account on registration
- ✅ `transactionController` - Updated to use account context
- ⚠️ `documentController` - Needs account context updates
- ⚠️ `taxProfileController` - Needs account context updates
- ⚠️ `reportController` - Needs account context updates
- ⚠️ `tipController` - Needs account context updates

### Services Updated
- ✅ `taxRecalculationService` - Updated to use accountId
- ⚠️ `documentProcessor` - Updated to use accountId
- ⚠️ `reportGenerator` - Needs account context updates
- ⚠️ `tipsEngine` - Needs account context updates

## API Changes

### New Endpoints
- `GET /api/accounts` - List user's accounts
- `GET /api/accounts/:id` - Get account details
- `POST /api/accounts` - Create new account
- `PUT /api/accounts/:id` - Update account
- `DELETE /api/accounts/:id` - Delete account (soft delete)
- `PATCH /api/accounts/:id/set-default` - Set default account

### Required Changes for Existing Endpoints

All endpoints that previously used `user` now require `accountId`:

**Option 1: Query Parameter**
```
GET /api/transactions?accountId=1234567890
```

**Option 2: Request Body**
```json
{
  "accountId": "1234567890",
  ...
}
```

**Option 3: Header**
```
X-Account-ID: 1234567890
```

## Migration Steps for Remaining Controllers

### Document Controller
1. Add `accountMiddleware` to routes
2. Update queries to filter by `account`
3. Update document creation to include `account`

### Tax Profile Controller
1. Add `accountMiddleware` to routes
2. Update queries to filter by `account`
3. Update tax profile creation to include `account`
4. Update unique index constraint (already done in model)

### Report Controller
1. Add `accountMiddleware` to routes
2. Update `reportGenerator` service to accept `accountId`
3. Update queries to filter by `account`

### Tip Controller
1. Update to use account context (optional - tips can be user-level)
2. Or add account filtering for account-specific tips

## Example Usage

### Creating a Business Account
```bash
POST /api/accounts
{
  "accountType": "business",
  "name": "My Business",
  "businessName": "ABC Enterprises Ltd",
  "businessType": "corporation",
  "businessTIN": "TIN123456",
  "registrationNumber": "RC123456"
}
```

### Using Account Context
```bash
# Get transactions for a specific account
GET /api/transactions?accountId=1234567890

# Or use header
GET /api/transactions
Headers: X-Account-ID: 1234567890
```

## Default Account Behavior

- On registration, a default individual account is automatically created
- The first account of each type becomes the default
- Users can switch default accounts
- When an account is deleted, another account of the same type becomes default (if available)

## Notes

- All data is now scoped to accounts
- Users can switch between accounts
- Business accounts have additional fields (businessName, businessTIN, etc.)
- Account separation ensures proper tax filing for individuals vs businesses

