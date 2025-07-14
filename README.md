# IndexedDB AsyncAPI

A modern TypeScript wrapper for IndexedDB that converts callback-based operations into async/await patterns, making database operations more intuitive and easier to work with.

## Features

- 🚀 **Async/Await Support**: Convert IndexedDB's callback-based API to modern async/await
- 🔄 **Cursor Iteration**: Built-in async iterator support for cursor operations
- 📦 **Export/Import**: Easy database backup and restore functionality
- 🎯 **Type Safe**: Full TypeScript support with proper typing
- 🪶 **Lightweight**: Minimal dependencies, small bundle size
- 🛡️ **Advanced Error Handling**: Comprehensive error handling with custom error types, retry mechanisms, and recovery strategies
- 🔄 **Automatic Retry**: Built-in exponential backoff retry with circuit breaker pattern
- 📊 **Error Monitoring**: Error logging, statistics, and health monitoring
- 🛠️ **Error Recovery**: Automatic error recovery and cleanup mechanisms
- ⚡ **Rate Limiting**: Prevents error storms with intelligent rate limiting

## Installation

```bash
npm install react-indexeddb-asyncapi
```

## Quick Start

```typescript
import IndexedDBAsyncAPI from 'react-indexeddb-asyncapi';

// Define your database schema
const schema = (db: IDBDatabase) => {
  // Create object stores during database upgrade
  if (!db.objectStoreNames.contains('users')) {
    const userStore = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
    userStore.createIndex('email', 'email', { unique: true });
  }
  
  if (!db.objectStoreNames.contains('posts')) {
    const postStore = db.createObjectStore('posts', { keyPath: 'id', autoIncrement: true });
    postStore.createIndex('userId', 'userId');
  }
};

// Initialize and open database
const dbAPI = new IndexedDBAsyncAPI('myapp-db', schema, 1);
await dbAPI.open();

// Now you can use async/await for all operations!
```

## How to Use

### 1. Basic CRUD Operations

```typescript
// Create/Update records
const userStore = dbAPI.query('users');
const userId = await userStore.add({
  name: 'John Doe',
  email: 'john@example.com',
  age: 30
});

// Read records
const user = await userStore.get(userId);
console.log(user); // { id: 1, name: 'John Doe', email: 'john@example.com', age: 30 }

// Update records
await userStore.put({
  id: userId,
  name: 'John Smith',
  email: 'john.smith@example.com',
  age: 31
});

// Delete records
await userStore.delete(userId);
```

### 2. Querying with Indexes

```typescript
// Query by index
const userStore = dbAPI.query('users');
const userByEmail = await userStore.index('email').get('john@example.com');

// Get all records
const allUsers = await userStore.getAll();

// Get records with key range
const activeUsers = await userStore.getAll(IDBKeyRange.bound(1, 100));
```

### 3. Cursor Operations with Async Iteration

```typescript
// Iterate through all records
const userStore = dbAPI.query('users');
const cursor = await userStore.openCursor();

for await (const record of cursor) {
  console.log(`User: ${record.value.name}, Key: ${record.key}`);
  // Process each record
}

// Iterate with key range and direction
const cursorWithRange = await userStore.openCursor(
  IDBKeyRange.lowerBound(10), 
  'prev'
);

for await (const record of cursorWithRange) {
  console.log(record.value);
}
```

### 4. Transaction Management

```typescript
// Read-only transaction (default is 'readwrite')
const readOnlyStore = dbAPI.query('users', 'readonly');
const users = await readOnlyStore.getAll();

// Custom transaction handlers
const store = dbAPI.query('users', 'readwrite', 
  (event) => console.log('Transaction completed'),
  (event) => console.error('Transaction failed', event)
);
```

### 5. Export and Import Data

```typescript
// Export entire database
const backupData = await dbAPI.export();
console.log('Database backup:', backupData);

// Export with filters
const filteredData = await dbAPI.export(
  IDBKeyRange.bound(1, 100), // Key range
  50 // Maximum count
);

// Import data (requires keyPaths for stores without keyPath)
const keyPaths = {
  'users': 'id',
  'posts': 'id'
};
await dbAPI.import(backupData, keyPaths);
```

### 6. Database Management

```typescript
// Clear entire database
await dbAPI.clear();

// Check if database is open
if (dbAPI.db) {
  console.log('Database is open');
  console.log('Store names:', [...dbAPI.db.objectStoreNames]);
}
```

## Advanced Error Handling

This library includes comprehensive error handling features that automatically manage database errors, retries, and recovery.

### Error Types

The library provides specific error classes for different scenarios:

```typescript
import { 
  DatabaseError, 
  DatabaseConnectionError, 
  StorageQuotaError, 
  DataValidationError,
  ErrorClassifier 
} from 'react-indexeddb-asyncapi';

try {
  const store = dbAPI.query('users');
  await store.add({ email: 'duplicate@example.com' }); // Duplicate email
} catch (error) {
  if (error instanceof DataValidationError) {
    console.log('Validation error:', error.validationErrors);
  } else if (error instanceof StorageQuotaError) {
    console.log('Storage quota exceeded');
  } else if (error instanceof DatabaseConnectionError) {
    console.log('Connection failed:', error.message);
  }
}
```

### Automatic Retry and Recovery

Operations are automatically retried with exponential backoff:

```typescript
// Retries are automatic - no additional code needed
try {
  const store = dbAPI.query('users');
  const result = await store.add({ name: 'John' });
  // If this fails due to temporary issues, it will be retried automatically
} catch (error) {
  // Only permanent failures reach here
  console.error('Operation failed after retries:', error);
}
```

### Error Monitoring and Statistics

Monitor database health and error patterns:

```typescript
// Check database health
const isHealthy = await dbAPI.isHealthy();
console.log('Database healthy:', isHealthy);

// Get error statistics
const stats = await dbAPI.getErrorStats();
console.log('Total errors:', stats.totalErrors);
console.log('Recent errors (24h):', stats.recentErrors);
console.log('Errors by category:', stats.errorsByCategory);

// Get detailed error logs
const errorLogs = dbAPI.getErrorLogs();
errorLogs.forEach(log => {
  console.log(`${log.timestamp}: ${log.message}`);
});
```

### Error Classification

Understand error types for better handling:

```typescript
import { ErrorClassifier } from 'react-indexeddb-asyncapi';

try {
  // Your database operations
} catch (error) {
  if (ErrorClassifier.isRetryable(error)) {
    console.log('This error will be retried automatically');
  }
  
  if (ErrorClassifier.requiresUserAction(error)) {
    console.log('User intervention needed');
    // Show user-friendly error message
  }
  
  const category = ErrorClassifier.classify(error);
  console.log('Error category:', category); // 'retryable' | 'permanent' | 'user' | 'system'
}
```

### Custom Error Handling

For advanced scenarios, you can use the error handling components directly:

```typescript
import { RetryManager, CircuitBreaker } from 'react-indexeddb-asyncapi';

const retryManager = new RetryManager();

// Custom retry configuration
await retryManager.withRetry(
  () => myDatabaseOperation(),
  'my_operation',
  {
    maxRetries: 5,
    baseDelay: 200,
    maxDelay: 10000,
    backoffFactor: 1.5
  }
);

// Circuit breaker for preventing cascading failures
const circuitBreaker = new CircuitBreaker();
await circuitBreaker.execute(
  () => myDatabaseOperation(),
  'operation_key',
  {
    failureThreshold: 3,
    resetTimeout: 30000
  }
);
```

### Error Recovery Strategies

The library automatically handles common error scenarios:

- **Storage Quota Exceeded**: Automatic cleanup of temporary data
- **Version Conflicts**: Database reconnection and recovery
- **Transaction Failures**: Automatic retry with exponential backoff
- **Connection Issues**: Reconnection attempts and graceful degradation

For detailed error handling documentation, see [ERROR_HANDLING.md](./ERROR_HANDLING.md).

## API Reference

### Constructor

```typescript
new IndexedDBAsyncAPI(dbName: string, schema: SchemaUpgradeCallback, version?: number)
```

- `dbName`: Name of the IndexedDB database
- `schema`: Callback function to define database schema during upgrades
- `version`: Database version (optional)

### Methods

#### `open(): Promise<IndexedDBAsyncAPI>`

Opens the database connection and applies schema upgrades if needed.

```typescript
const dbAPI = new IndexedDBAsyncAPI('mydb', schema, 1);
await dbAPI.open();
```

#### `query(objectStoreName: string, mode?: IDBTransactionMode, oncomplete?: Function, onerror?: Function): AsyncProxy<IDBObjectStore>`

Creates a transaction and returns an async-enabled object store.

```typescript
const store = dbAPI.query('users', 'readwrite');
const readOnlyStore = dbAPI.query('users', 'readonly');
```

#### `export(keyRange?: IDBKeyRange, count?: number): Promise<string>`

Exports database data as JSON string.

```typescript
const allData = await dbAPI.export();
const limitedData = await dbAPI.export(undefined, 100);
const rangeData = await dbAPI.export(IDBKeyRange.bound(1, 50));
```

#### `import(data: string, keyPaths: KeyPaths): Promise<void>`

Imports data from JSON string.

```typescript
await dbAPI.import(jsonData, { 'users': 'id', 'posts': 'postId' });
```

#### `clear(): Promise<void>`

Deletes the entire database.

```typescript
await dbAPI.clear();
```

#### `isHealthy(): Promise<boolean>`

Checks if the database is healthy and responsive.

```typescript
const healthy = await dbAPI.isHealthy();
if (!healthy) {
  console.warn('Database health check failed');
}
```

#### `getErrorStats(): Promise<ErrorStats>`

Returns comprehensive error statistics.

```typescript
const stats = await dbAPI.getErrorStats();
console.log('Total errors:', stats.totalErrors);
console.log('Recent errors:', stats.recentErrors);
console.log('Errors by level:', stats.errorsByLevel);
console.log('Errors by category:', stats.errorsByCategory);
```

#### `getErrorLogs(): ErrorLog[]`

Returns detailed error logs.

```typescript
const logs = dbAPI.getErrorLogs();
logs.forEach(log => {
  console.log(`${log.timestamp} [${log.level}]: ${log.message}`);
});
```

#### `close(): void`

Forcefully closes the database connection.

```typescript
dbAPI.close();
```

### AsyncProxy Methods

All standard IDBObjectStore and IDBIndex methods are available with Promise-based returns:

```typescript
// Standard operations
await store.add(data);
await store.put(data);
await store.get(key);
await store.delete(key);
await store.clear();
await store.getAll();
await store.getAllKeys();
await store.count();

// Index operations
const index = store.index('indexName');
await index.get(key);
await index.getAll();
await index.count();

// Cursor operations return AsyncCursorResult
const cursor = await store.openCursor();
const keyCursor = await store.openKeyCursor();
```

## Types

### SchemaUpgradeCallback

```typescript
interface SchemaUpgradeCallback {
  (db: IDBDatabase): void;
}
```

### KeyPaths

```typescript
interface KeyPaths {
  [objectStoreName: string]: string;
}
```

### CursorResult

```typescript
interface CursorResult<T = any> {
  key: IDBValidKey;
  value: T;
  primaryKey: IDBValidKey;
}
```

### AsyncCursorResult

```typescript
interface AsyncCursorResult<T = any> {
  request: IDBRequest<IDBCursor>;
  cursor: IDBCursor;
  [Symbol.asyncIterator](): AsyncGenerator<CursorResult<T>, void, unknown>;
}
```

### ErrorLog

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

### ErrorStats

```typescript
interface ErrorStats {
  totalErrors: number;
  errorsByLevel: Record<string, number>;
  errorsByCategory: Record<string, number>;
  recentErrors: number;
}
```

### DatabaseError Classes

```typescript
// Base error class
abstract class DatabaseError extends Error {
  abstract readonly code: string;
  abstract readonly category: 'user' | 'system' | 'network' | 'data';
  constructor(message: string, context?: string, originalError?: Error);
}

// Specific error types
class DatabaseConnectionError extends DatabaseError;
class DatabaseVersionError extends DatabaseError;
class StorageQuotaError extends DatabaseError;
class TransactionError extends DatabaseError;
class DataValidationError extends DatabaseError;
class ObjectStoreNotFoundError extends DatabaseError;
```

## Error Handling

The library includes comprehensive error handling with automatic retry, recovery, and monitoring. All operations return Promises with enhanced error information:

```typescript
try {
  const store = dbAPI.query('users');
  const user = await store.get(123);
  console.log(user);
} catch (error) {
  // Enhanced error information available
  if (error instanceof DatabaseError) {
    console.error('Database error:', {
      code: error.code,
      category: error.category,
      context: error.context,
      message: error.message
    });
  }
}
```

**Key Features:**
- **Automatic Retry**: Failed operations are automatically retried with exponential backoff
- **Error Classification**: Errors are categorized as retryable, permanent, user, or system errors
- **Health Monitoring**: Check database health with `await dbAPI.isHealthy()`
- **Error Statistics**: Monitor error patterns with `await dbAPI.getErrorStats()`
- **Recovery Strategies**: Automatic cleanup and recovery for common error scenarios

For comprehensive error handling documentation, see the [Advanced Error Handling](#advanced-error-handling) section above or [ERROR_HANDLING.md](./ERROR_HANDLING.md).

## Best Practices

1. **Always await `open()`** before performing operations
2. **Use appropriate transaction modes** (`readonly` for reads, `readwrite` for writes)
3. **Handle errors properly** with try/catch blocks and leverage the built-in error types
4. **Monitor database health** regularly with `isHealthy()` for critical applications
5. **Use indexes** for efficient querying
6. **Close transactions promptly** by limiting scope
7. **Version your database schema** for proper upgrades
8. **Check error statistics** periodically to identify patterns and issues
9. **Implement graceful degradation** for quota and connection errors
10. **Let automatic retry handle temporary failures** - most errors are handled automatically

## Example: Complete Todo App

```typescript
import IndexedDBAsyncAPI, { StorageQuotaError, DataValidationError } from 'react-indexeddb-asyncapi';

interface Todo {
  id?: number;
  title: string;
  completed: boolean;
  createdAt: Date;
}

class TodoApp {
  private dbAPI: IndexedDBAsyncAPI;

  constructor() {
    const schema = (db: IDBDatabase) => {
      if (!db.objectStoreNames.contains('todos')) {
        const store = db.createObjectStore('todos', { keyPath: 'id', autoIncrement: true });
        store.createIndex('completed', 'completed');
        store.createIndex('createdAt', 'createdAt');
      }
    };

    this.dbAPI = new IndexedDBAsyncAPI('todo-app', schema, 1);
  }

  async init() {
    await this.dbAPI.open();
  }

  async addTodo(title: string): Promise<number> {
    const store = this.dbAPI.query('todos');
    return await store.add({
      title,
      completed: false,
      createdAt: new Date()
    });
  }

  async getTodos(): Promise<Todo[]> {
    const store = this.dbAPI.query('todos', 'readonly');
    return await store.getAll();
  }

  async toggleTodo(id: number): Promise<void> {
    const store = this.dbAPI.query('todos');
    const todo = await store.get(id);
    if (todo) {
      todo.completed = !todo.completed;
      await store.put(todo);
    }
  }

  async deleteTodo(id: number): Promise<void> {
    const store = this.dbAPI.query('todos');
    await store.delete(id);
  }

  async getCompletedTodos(): Promise<Todo[]> {
    const store = this.dbAPI.query('todos', 'readonly');
    const index = store.index('completed');
    return await index.getAll(true);
  }

  // Error handling and monitoring example
  async getAppHealth(): Promise<{ healthy: boolean; errorStats: any }> {
    try {
      const healthy = await this.dbAPI.isHealthy();
      const errorStats = await this.dbAPI.getErrorStats();
      
      return { healthy, errorStats };
    } catch (error) {
      console.error('Health check failed:', error);
      return { healthy: false, errorStats: null };
    }
  }

  // Graceful error handling example
  async safeAddTodo(title: string): Promise<{ success: boolean; id?: number; error?: string }> {
    try {
      const id = await this.addTodo(title);
      return { success: true, id };
    } catch (error) {
      if (error instanceof StorageQuotaError) {
        return { success: false, error: 'Storage full. Please free up space.' };
      } else if (error instanceof DataValidationError) {
        return { success: false, error: 'Invalid todo data provided.' };
      } else {
        return { success: false, error: 'Failed to save todo. Please try again.' };
      }
    }
  }
}

// Usage
const app = new TodoApp();
await app.init();

// Basic operations with automatic error handling
const todoId = await app.addTodo('Learn IndexedDB');
const todos = await app.getTodos();
await app.toggleTodo(todoId);

// Error-aware operations
const result = await app.safeAddTodo('Another todo');
if (result.success) {
  console.log('Todo added with ID:', result.id);
} else {
  console.error('Failed to add todo:', result.error);
}

// Monitor application health
const health = await app.getAppHealth();
console.log('App healthy:', health.healthy);
if (health.errorStats) {
  console.log('Error statistics:', health.errorStats);
}
```

## Browser Support

This package works in all modern browsers that support:
- IndexedDB
- Promises
- Proxy objects
- Async/await (or with transpilation)

## Documentation

- [Comprehensive Error Handling Guide](./ERROR_HANDLING.md) - Detailed documentation on error handling features
- [GitHub Wiki](https://github.com/pallavsharma505/react-indexeddb-asyncapi/wiki) - Additional documentation and examples

## Pending Changes

- Support for tests
- Linting operations  
- Additional examples and tutorials
- Performance optimization guides

## License

MIT License - see LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
