# Enhanced Error Handling in React IndexedDB AsyncAPI

This document describes the comprehensive error handling features added to the React IndexedDB AsyncAPI library.

## Overview

The enhanced error handling system provides:

- **Custom Error Classes**: Specific error types for different database scenarios
- **Automatic Retry Mechanisms**: Exponential backoff retry with circuit breaker pattern
- **Error Classification**: Categorizes errors as retryable, permanent, user, or system errors
- **Error Logging**: Comprehensive logging system with statistics and monitoring
- **Recovery Strategies**: Automatic error recovery and cleanup mechanisms
- **Rate Limiting**: Prevents error storms and provides graceful degradation

## Error Classes

### Base Error Class

```typescript
abstract class DatabaseError extends Error {
    abstract readonly code: string;
    abstract readonly category: 'user' | 'system' | 'network' | 'data';
    
    constructor(
        message: string,
        public readonly context?: string,
        public readonly originalError?: Error
    )
}
```

### Specific Error Types

| Error Class | Category | Description | Use Case |
|------------|----------|-------------|-----------|
| `DatabaseConnectionError` | system | Database connection failures | Network issues, browser limits |
| `DatabaseVersionError` | system | Version conflicts | Schema upgrades, concurrent access |
| `StorageQuotaError` | system | Storage quota exceeded | Browser storage limits |
| `TransactionError` | system | Transaction failures | Concurrency issues, timeouts |
| `DataValidationError` | data | Invalid data format | Schema validation, type errors |
| `ObjectStoreNotFoundError` | user | Missing object stores | API misuse, schema issues |

## Usage Examples

### Basic Error Handling

```typescript
import IndexedDBAsyncAPI from 'react-indexeddb-asyncapi';

const db = new IndexedDBAsyncAPI('mydb', schema, 1);

try {
    await db.open();
    const query = db.query('users');
    await query.add({ name: 'John', email: 'john@example.com' });
} catch (error) {
    if (error instanceof DatabaseError) {
        console.log('Error category:', error.category);
        console.log('Error code:', error.code);
        console.log('Context:', error.context);
    }
}
```

### Error Statistics and Monitoring

```typescript
// Get comprehensive error statistics
const stats = await db.getErrorStats();
console.log('Total errors:', stats.totalErrors);
console.log('Errors by level:', stats.errorsByLevel);
console.log('Errors by category:', stats.errorsByCategory);
console.log('Recent errors (24h):', stats.recentErrors);

// Get detailed error logs
const logs = db.getErrorLogs();
logs.forEach(log => {
    console.log(`${log.timestamp}: ${log.message}`);
});

// Check database health
const isHealthy = await db.isHealthy();
if (!isHealthy) {
    console.warn('Database health check failed');
}
```

### Advanced Error Handling with Custom Recovery

```typescript
import { ErrorClassifier, DatabaseErrorFactory } from 'react-indexeddb-asyncapi';

try {
    // Your database operations
    await performDatabaseOperation();
} catch (error) {
    const dbError = DatabaseErrorFactory.create(error, 'my_operation');
    
    if (ErrorClassifier.isRetryable(dbError)) {
        console.log('Error is retryable, will be handled automatically');
    } else if (ErrorClassifier.requiresUserAction(dbError)) {
        console.log('Error requires user intervention');
        // Show user-friendly error message
    }
}
```

## Automatic Features

### Retry Mechanism

The library automatically retries operations that fail with retryable errors:

- **Exponential Backoff**: Delay increases exponentially (100ms, 200ms, 400ms, ...)
- **Max Retries**: Configurable maximum retry attempts (default: 3)
- **Circuit Breaker**: Temporarily blocks operations after repeated failures

### Error Rate Limiting

Prevents error storms by limiting error frequency:

- **Max Errors**: Maximum errors per context (default: 5)
- **Reset Time**: Error counter reset period (default: 60 seconds)
- **Graceful Degradation**: Temporary operation blocking when limits exceeded

### Automatic Cleanup

The system attempts automatic cleanup on quota errors:

- **Temporary Data**: Removes expired temporary records
- **Old Logs**: Cleans up old error logs and application logs  
- **Duplicate Records**: Removes duplicate entries where possible

## Configuration

### Error Handling Options

```typescript
// Configure retry behavior
const db = new IndexedDBAsyncAPI('mydb', schema, 1);

// The library handles retries automatically, but you can access
// the retry manager for custom operations
import { RetryManager } from 'react-indexeddb-asyncapi';

const retryManager = new RetryManager();
await retryManager.withRetry(
    () => myOperation(),
    'custom_operation',
    {
        maxRetries: 5,
        baseDelay: 200,
        maxDelay: 10000,
        backoffFactor: 1.5
    }
);
```

### Circuit Breaker Configuration

```typescript
import { CircuitBreaker } from 'react-indexeddb-asyncapi';

const circuitBreaker = new CircuitBreaker();
await circuitBreaker.execute(
    () => myOperation(),
    'operation_key',
    {
        failureThreshold: 3,
        resetTimeout: 30000,
        monitoringPeriod: 60000
    }
);
```

## Error Recovery Strategies

### Quota Exceeded Errors

1. **Automatic Cleanup**: Remove temporary and old data
2. **User Notification**: Inform user of storage constraints
3. **Graceful Degradation**: Continue with reduced functionality

### Version Conflicts

1. **Database Refresh**: Close and reopen database connection
2. **User Notification**: Inform user about required page refresh
3. **Automatic Retry**: Attempt reconnection with new version

### Transaction Errors

1. **Automatic Retry**: Retry with exponential backoff
2. **Connection Reset**: Reset database connection if needed
3. **Operation Queueing**: Queue operations during recovery

## Best Practices

### 1. Always Handle Errors

```typescript
try {
    await db.open();
    // Your operations
} catch (error) {
    // Always handle database errors
    console.error('Database operation failed:', error);
}
```

### 2. Monitor Error Statistics

```typescript
// Regularly check error statistics
setInterval(async () => {
    const stats = await db.getErrorStats();
    if (stats.recentErrors > 10) {
        console.warn('High error rate detected');
    }
}, 60000);
```

### 3. Implement Graceful Degradation

```typescript
try {
    // Try primary operation
    await primaryDatabaseOperation();
} catch (error) {
    if (error instanceof StorageQuotaError) {
        // Fall back to essential operations only
        await essentialOperationOnly();
    }
}
```

### 4. Use Health Checks

```typescript
// Check database health before critical operations
if (await db.isHealthy()) {
    await criticalOperation();
} else {
    // Use alternative approach or notify user
    showOfflineMode();
}
```

## Error Logging

### Log Structure

```typescript
interface ErrorLog {
    id?: number;
    timestamp: string;
    level: 'error' | 'warn' | 'info';
    message: string;
    error?: {
        name: string;
        message: string;
        stack?: string;
        code?: string;
        category?: string;
    };
    context?: string;
    userAgent: string;
    url: string;
    sessionId: string;
}
```

### Accessing Logs

```typescript
// Get all error logs
const logs = db.getErrorLogs();

// Filter by level
const errorLogs = logs.filter(log => log.level === 'error');

// Get recent logs
const recentLogs = logs.filter(log => 
    new Date(log.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
);
```

## Migration Guide

If you're upgrading from a previous version:

1. **No Breaking Changes**: All existing code continues to work
2. **Enhanced Errors**: Errors now include more detailed information
3. **New Methods**: Additional methods for error monitoring and health checks
4. **Automatic Features**: Retry and recovery happen automatically

### Optional Enhancements

```typescript
// Add error monitoring to existing code
const originalOperation = async () => {
    // Your existing code
};

// Enhanced with error monitoring
const enhancedOperation = async () => {
    try {
        await originalOperation();
    } catch (error) {
        const stats = await db.getErrorStats();
        console.log('Operation failed, error stats:', stats);
        throw error;
    }
};
```

## Browser Compatibility

The error handling features work in all browsers that support IndexedDB:

- **Chrome 24+**
- **Firefox 16+** 
- **Safari 7+**
- **Edge 12+**
- **IE 10+** (with limitations)

## Performance Impact

The error handling system is designed for minimal performance impact:

- **Lazy Initialization**: Error handling components initialize only when needed
- **Efficient Logging**: Logs stored in memory with localStorage fallback
- **Minimal Overhead**: Error checking adds < 1ms per operation
- **Cleanup Optimization**: Background cleanup prevents storage bloat

## Contributing

To contribute to the error handling system:

1. Add test cases for new error scenarios
2. Follow the existing error class patterns
3. Update documentation for new features
4. Ensure backward compatibility

For more examples and advanced usage, see the `example-error-handling.ts` file in the source code.
