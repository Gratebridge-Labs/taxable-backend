# WhatsApp Error Logging & Monitoring System

## Overview

A comprehensive error logging and monitoring system for the WhatsApp bot that provides real-time visibility into failures, errors, and issues. This system enables admins to monitor, analyze, and resolve WhatsApp bot issues efficiently.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  WhatsApp Bot   │───▶│ Error Logger     │───▶│  Database        │
│  (Controller)   │    │  Service         │    │  (MongoDB)       │
└─────────────────┘    └──────────────────┘    └──────────────────┘
         │                       │                       │
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌──────────────────┐
│  Error Context  │    │  Admin API       │    │  Admin Dashboard │
│  Middleware     │    │  Endpoints       │    │  (Frontend)      │
└─────────────────┘    └──────────────────┘    └──────────────────┘
```

## Features

### 1. **Comprehensive Error Tracking**
- 10 error types (payment, bank, whatsapp_api, database, etc.)
- 5 severity levels (critical, high, medium, low, info)
- Rich context capture (user, session, message, state)
- Stack traces and detailed error information

### 2. **Real-time Monitoring**
- Live error dashboard with statistics
- Unresolved error count tracking
- Error trends over time
- Critical error alerts

### 3. **Admin Management**
- List and filter errors
- View error details with full context
- Mark errors as resolved
- Search across all error fields
- Cleanup old errors

### 4. **Integration**
- Automatic integration with WhatsApp controller
- Context enrichment middleware
- Webhook request tracking
- Session and user context linking

## Database Schema

### WhatsAppErrorLog Model

| Field | Type | Description | Indexed |
|-------|------|-------------|---------|
| `errorType` | Enum | Type of error (10 categories) | ✅ |
| `errorCode` | String | Unique error code | ✅ |
| `severity` | Enum | Error severity (5 levels) | ✅ |
| `message` | String | Error message | |
| `stackTrace` | String | Full error stack trace | |
| `context` | Mixed | Additional context data | |
| `userId` | ObjectId | Reference to User | ✅ |
| `waId` | String | WhatsApp ID | ✅ |
| `sessionId` | ObjectId | Reference to WhatsAppSession | ✅ |
| `sessionStep` | String | Current session step | |
| `userMessage` | String | User's message that triggered error | |
| `resolved` | Boolean | Whether error is resolved | ✅ |
| `resolutionNotes` | String | Admin resolution notes | |
| `resolvedAt` | Date | When error was resolved | |
| `resolvedBy` | ObjectId | Reference to Admin | |
| `metadata` | Mixed | Additional metadata | |
| `environment` | Enum | Environment (dev/staging/prod) | ✅ |
| `appVersion` | String | App version | |
| `createdAt` | Date | When error occurred | ✅ |
| `updatedAt` | Date | Last update timestamp | |

## API Endpoints

### 1. **List Errors**
```
GET /api/admin/whatsapp-errors
```
**Query Parameters:**
- `page` (default: 1) - Page number
- `limit` (default: 50) - Items per page
- `errorType` - Filter by error type
- `severity` - Filter by severity
- `resolved` - Filter by resolved status
- `userId` - Filter by user ID
- `waId` - Filter by WhatsApp ID
- `startDate`, `endDate` - Date range filter
- `searchText` - Text search across message/code

### 2. **Get Error Details**
```
GET /api/admin/whatsapp-errors/:errorId
```

### 3. **Mark Error as Resolved**
```
PATCH /api/admin/whatsapp-errors/:errorId/resolve
```
**Request Body:**
```json
{
  "notes": "Fixed the payment issue"
}
```

### 4. **Error Statistics**
```
GET /api/admin/whatsapp-error-stats
```
**Query Parameters:**
- `timeRange` (default: 24) - Hours to include in stats

### 5. **Error Trends**
```
GET /api/admin/whatsapp-error-trends
```
**Query Parameters:**
- `period` (day/week/month) - Time period grouping
- `points` (default: 7) - Number of data points

### 6. **Advanced Search**
```
POST /api/admin/whatsapp-errors/search
```
**Request Body:**
```json
{
  "searchText": "payment",
  "errorType": "payment",
  "severity": "high",
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "page": 1,
  "limit": 50
}
```

### 7. **Unresolved Count**
```
GET /api/admin/whatsapp-errors/unresolved-count
```

### 8. **Cleanup Old Errors**
```
POST /api/admin/whatsapp-errors/cleanup
```
**Request Body:**
```json
{
  "retentionDays": 90,
  "dryRun": true
}
```

## Error Types

| Type | Description | Severity | Examples |
|------|-------------|----------|----------|
| `whatsapp_api` | WhatsApp API failures | Medium | Message sending, media download |
| `payment` | Payment integration failures | High | Paystack payment, subscription |
| `bank` | Bank integration failures | High | Mono connection, income fetch |
| `database` | Database operation failures | Medium | User lookup, session save |
| `external_service` | External service failures | Medium | Email sending, file upload |
| `state_machine` | State/flow errors | Medium | Invalid state transition |
| `validation` | Input validation failures | Low | Invalid phone, email format |
| `authentication` | Auth/security failures | High | Invalid credentials, access denied |
| `session` | Session management errors | Medium | Session not found, expired |
| `unknown` | Unclassified errors | Medium | Generic errors |

## Severity Levels

| Level | Description | Action Required |
|-------|-------------|-----------------|
| `critical` | System-critical failures | Immediate attention |
| `high` | Important feature failures | Priority resolution |
| `medium` | Regular operational errors | Normal resolution |
| `low` | Minor validation issues | Monitor and batch fix |
| `info` | Informational logs | No action needed |

## Integration with WhatsApp Controller

The error logging is automatically integrated into the WhatsApp webhook controller (`whatsappWebhookController.js`). All existing `console.error` calls have been enhanced with structured error logging.

### Example Integration:
```javascript
// Before:
console.error('[WhatsApp] Payment error:', e.message);

// After:
await WhatsAppErrorLogger.logGenericError(e, {
  errorType: 'payment',
  severity: 'high',
  context: 'Payment error:',
  loggedFrom: 'whatsapp_webhook'
});
console.error('[WhatsApp] Payment error:', e.message);
```

### Error Context Enrichment:
The `errorContextMiddleware` automatically enriches errors with:
- Request ID and timestamp
- WhatsApp message details
- User and session context
- Environment information

## Usage Examples

### 1. **Logging a Payment Error**
```javascript
const WhatsAppErrorLogger = require('../utils/whatsappErrorLogger');

try {
  // Payment processing logic
} catch (error) {
  await WhatsAppErrorLogger.logPaymentError(error, {
    paymentType: 'subscription',
    amount: 4000,
    paymentId: 'pay_123',
    userId: user._id,
    waId: '+2348012345678'
  });
}
```

### 2. **Logging a WhatsApp API Error**
```javascript
await WhatsAppErrorLogger.logApiError(error, {
  waId: '+2348012345678',
  messageId: 'msg_123',
  action: 'send_message',
  endpoint: 'messages'
});
```

### 3. **Using Error Logging Wrapper**
```javascript
const safeFunction = WhatsAppErrorLogger.withErrorLogging(
  async (userId, data) => {
    // Your function logic
  },
  { functionName: 'processUserData' }
);

// Use the wrapped function
await safeFunction(userId, data);
```

## Admin Dashboard Integration

### Frontend Components Needed:
1. **Error List View** - Filterable table of errors
2. **Error Detail View** - Full error context and stack trace
3. **Dashboard Widgets** - Error counts, severity distribution
4. **Trend Charts** - Error frequency over time
5. **Resolution Workflow** - Assign, resolve, add notes

### Sample Dashboard Queries:
```javascript
// Get unresolved critical errors
GET /api/admin/whatsapp-errors?severity=critical&resolved=false

// Get today's error statistics
GET /api/admin/whatsapp-error-stats?timeRange=24

// Search for payment failures
POST /api/admin/whatsapp-errors/search
{
  "errorType": "payment",
  "severity": "high",
  "startDate": "2024-01-15"
}
```

## Monitoring & Alerting

### Critical Error Alerts:
- Payment failures (high severity)
- Bank integration failures (high severity)
- WhatsApp API downtime (critical)
- Database connection issues (critical)

### Alert Channels (Future Enhancement):
- Email notifications for critical errors
- Slack/Teams webhook integration
- SMS alerts for system-critical issues
- Dashboard real-time updates (WebSocket)

## Performance Considerations

### Database Indexing:
- Compound indexes for common query patterns
- Time-based indexing for date range queries
- User/session indexing for user-specific errors

### Data Retention:
- Default: 90 days for resolved low/medium errors
- Critical/high errors: Keep longer for analysis
- Configurable retention policy

### Scaling:
- Batch error insertion for high-volume scenarios
- Pagination for error listing endpoints
- Cached statistics for dashboard
- Background processing for error aggregation

## Testing

### Run Complete Test Suite:
```bash
# Test error logging system
node test-error-logging-system.js

# Run unit tests
npm test -- tests/error-logging/

# Test admin endpoints
npm test -- tests/error-logging/admin-error-log.test.js
```

### Test Coverage:
1. **Unit Tests** - Individual components
2. **Integration Tests** - API endpoints
3. **End-to-End Tests** - Complete flow
4. **Performance Tests** - High-volume error logging

## Deployment

### Environment Variables:
```env
# Error Logging Configuration
ERROR_LOG_RETENTION_DAYS=90
ERROR_LOG_ALERT_EMAIL=admin@example.com
ERROR_LOG_CRITICAL_SEVERITY=critical,high

# Monitoring
ERROR_LOG_MONITORING_ENABLED=true
ERROR_LOG_ALERT_WEBHOOK_URL=https://hooks.slack.com/...
```

### Health Checks:
```bash
# Check error logging health
curl -H "Authorization: Bearer <admin-token>" \
  https://api.gettaxable.com/api/admin/whatsapp-error-stats

# Check unresolved critical errors
curl -H "Authorization: Bearer <admin-token>" \
  "https://api.gettaxable.com/api/admin/whatsapp-errors?severity=critical&resolved=false"
```

## Troubleshooting

### Common Issues:

1. **No errors appearing in dashboard**
   - Check database connection
   - Verify error logging is enabled in controller
   - Check environment filters

2. **High error volume**
   - Review error patterns
   - Check for recurring issues
   - Implement error aggregation

3. **Performance issues**
   - Review database indexes
   - Implement pagination
   - Cache statistics

4. **Missing context**
   - Verify middleware is applied
   - Check session/user linking
   - Review error context enrichment

### Debug Commands:
```javascript
// Check error logging directly
const errorLoggerService = require('./services/errorLoggerService');
const stats = await errorLoggerService.getErrorStats(1);
console.log('Last hour errors:', stats);

// Manually log test error
await errorLoggerService.logWhatsAppError('test', 
  new Error('Test error'),
  { test: true },
  { severity: 'medium', errorCode: 'DEBUG_TEST' }
);
```

## Future Enhancements

### Planned Features:
1. **Real-time WebSocket notifications**
2. **Error aggregation and deduplication**
3. **Auto-resolution suggestions**
4. **Error correlation analysis**
5. **Performance impact tracking**
6. **User impact scoring**
7. **Integration with monitoring tools (Sentry, Datadog)**

### Advanced Analytics:
- Error prediction using ML
- Root cause analysis
- Impact assessment
- Resolution time tracking
- Team performance metrics

## Support

For issues with the error logging system:
1. Check the error logs themselves
2. Review database connection
3. Verify admin authentication
4. Check environment configuration
5. Contact development team

---

**Last Updated**: March 2024  
**Version**: 1.0.0  
**Status**: Production Ready