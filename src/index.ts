export { default } from './IndexedDBAsyncAPI';
export { default as IndexedDBAsyncAPI } from './IndexedDBAsyncAPI';

// Export error handling types and classes for advanced usage
export {
    DatabaseError,
    DatabaseConnectionError,
    DatabaseVersionError,
    StorageQuotaError,
    TransactionError,
    DataValidationError,
    ObjectStoreNotFoundError,
    ErrorClassifier,
    DatabaseErrorFactory,
    RetryManager,
    ErrorLogger,
    CircuitBreaker
} from './IndexedDBAsyncAPI';

// Export interfaces for TypeScript users
export type {
    ErrorLog,
    CircuitBreakerState,
    SchemaUpgradeCallback,
    KeyPaths,
    CursorResult,
    AsyncCursorResult,
    AsyncProxy
} from './IndexedDBAsyncAPI';
