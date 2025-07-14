/* eslint-disable @typescript-eslint/no-explicit-any */

// Error handling interfaces and types
interface SchemaUpgradeCallback {
    (db: IDBDatabase): void;
}

interface KeyPaths {
    [objectStoreName: string]: string;
}

interface CursorResult<T = any> {
    key: IDBValidKey;
    value: T;
    primaryKey: IDBValidKey;
}

interface AsyncCursorResult<T = any> {
    request: IDBRequest<IDBCursor>;
    cursor: IDBCursor;
    [Symbol.asyncIterator](): AsyncGenerator<CursorResult<T>, void, unknown>;
}

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

interface CircuitBreakerState {
    state: 'closed' | 'open' | 'half-open';
    failureCount: number;
    lastFailTime: number;
    failureThreshold: number;
    resetTimeout: number;
    monitoringPeriod: number;
}

// Custom Error Classes
abstract class DatabaseError extends Error {
    abstract readonly code: string;
    abstract readonly category: 'user' | 'system' | 'network' | 'data';
    
    constructor(
        message: string,
        public readonly context?: string,
        public readonly originalError?: Error
    ) {
        super(message);
        this.name = this.constructor.name;
        
        // Maintain proper stack trace for where the error was thrown
        if ((Error as any).captureStackTrace) {
            (Error as any).captureStackTrace(this, this.constructor);
        }
    }

    toJSON() {
        return {
            name: this.name,
            message: this.message,
            code: this.code,
            category: this.category,
            context: this.context,
            timestamp: new Date().toISOString(),
            stack: this.stack
        };
    }
}

class DatabaseConnectionError extends DatabaseError {
    readonly code = 'DB_CONNECTION_ERROR';
    readonly category = 'system' as const;
    
    constructor(dbName: string, originalError?: Error) {
        super(`Failed to connect to database: ${dbName}`, undefined, originalError);
    }
}

class DatabaseVersionError extends DatabaseError {
    readonly code = 'DB_VERSION_ERROR';
    readonly category = 'system' as const;
    
    constructor(dbName: string, expectedVersion?: number, actualVersion?: number) {
        const message = expectedVersion && actualVersion 
            ? `Database version conflict for ${dbName}. Expected: ${expectedVersion}, Actual: ${actualVersion}`
            : `Database version conflict for ${dbName}`;
        super(message);
    }
}

class StorageQuotaError extends DatabaseError {
    readonly code = 'STORAGE_QUOTA_EXCEEDED';
    readonly category = 'system' as const;
    
    constructor(attemptedSize?: number) {
        const message = attemptedSize 
            ? `Storage quota exceeded. Attempted to store ${attemptedSize} bytes.`
            : 'Storage quota exceeded.';
        super(message);
    }
}

class TransactionError extends DatabaseError {
    readonly code = 'TRANSACTION_ERROR';
    readonly category = 'system' as const;
    
    constructor(operation: string, originalError?: Error) {
        super(`Transaction failed during ${operation}`, operation, originalError);
    }
}

class DataValidationError extends DatabaseError {
    readonly code = 'DATA_VALIDATION_ERROR';
    readonly category = 'data' as const;
    
    constructor(
        public readonly validationErrors: Array<{ field: string; message: string }>
    ) {
        const errorSummary = validationErrors.map(e => `${e.field}: ${e.message}`).join(', ');
        super(`Data validation failed: ${errorSummary}`);
    }
}

class ObjectStoreNotFoundError extends DatabaseError {
    readonly code = 'OBJECT_STORE_NOT_FOUND';
    readonly category = 'user' as const;
    
    constructor(storeName: string) {
        super(`Object store '${storeName}' not found`);
    }
}

// Error Classification and Recovery
class ErrorClassifier {
    static classify(error: Error): 'retryable' | 'permanent' | 'user' | 'system' {
        const errorName = error.name.toLowerCase();
        
        // Retryable errors (temporary issues)
        if (errorName.includes('timeout') || 
            errorName.includes('network') ||
            errorName.includes('abort') ||
            errorName.includes('transactioninactive')) {
            return 'retryable';
        }
        
        // User errors (client-side issues)
        if (errorName.includes('constraint') ||
            errorName.includes('data') ||
            errorName.includes('notfound') ||
            errorName.includes('validation')) {
            return 'user';
        }
        
        // System errors (permanent issues)
        if (errorName.includes('quota') ||
            errorName.includes('version') ||
            errorName.includes('security') ||
            errorName.includes('connection')) {
            return 'system';
        }
        
        return 'permanent';
    }

    static isRetryable(error: Error): boolean {
        return this.classify(error) === 'retryable';
    }

    static requiresUserAction(error: Error): boolean {
        const classification = this.classify(error);
        return classification === 'user' || classification === 'system';
    }
}

// Error Factory
class DatabaseErrorFactory {
    static create(error: any, context?: string): DatabaseError {
        if (error instanceof DatabaseError) {
            return error;
        }

        const errorName = error.name?.toLowerCase() || '';
        const errorMessage = error.message || 'Unknown error';

        switch (errorName) {
            case 'constrainterror':
                return new DataValidationError([{ field: 'unknown', message: errorMessage }]);
            
            case 'quotaexceedederror':
                return new StorageQuotaError();
            
            case 'versionerror':
                return new DatabaseVersionError(context || 'unknown');
            
            case 'transactioninactiveerror':
            case 'aborterror':
                return new TransactionError(context || 'unknown operation', error);
            
            case 'notfounderror':
                return new ObjectStoreNotFoundError(context || 'unknown');
            
            default:
                return new DatabaseConnectionError(context || 'unknown', error);
        }
    }
}

// Circuit Breaker Implementation
class CircuitBreaker {
    private states = new Map<string, CircuitBreakerState>();

    async execute<T>(
        operation: () => Promise<T>,
        operationKey: string,
        options: {
            failureThreshold?: number;
            resetTimeout?: number;
            monitoringPeriod?: number;
        } = {}
    ): Promise<T> {
        const state = this.getState(operationKey, options);

        // Check circuit breaker state
        if (state.state === 'open') {
            if (Date.now() - state.lastFailTime > state.resetTimeout) {
                state.state = 'half-open';
            } else {
                throw new Error('Circuit breaker is open. Operation blocked.');
            }
        }

        try {
            const result = await operation();
            
            // Reset on success
            if (state.state === 'half-open') {
                state.state = 'closed';
                state.failureCount = 0;
            }
            
            return result;
        } catch (error) {
            state.failureCount++;
            state.lastFailTime = Date.now();
            
            if (state.failureCount >= state.failureThreshold) {
                state.state = 'open';
            }
            
            throw error;
        }
    }

    private getState(
        key: string, 
        options: { failureThreshold?: number; resetTimeout?: number; monitoringPeriod?: number }
    ): CircuitBreakerState {
        if (!this.states.has(key)) {
            this.states.set(key, {
                state: 'closed',
                failureCount: 0,
                lastFailTime: 0,
                failureThreshold: options.failureThreshold || 5,
                resetTimeout: options.resetTimeout || 30000,
                monitoringPeriod: options.monitoringPeriod || 60000
            });
        }
        
        return this.states.get(key)!;
    }
}

// Retry Manager with Exponential Backoff
class RetryManager {
    private circuitBreaker = new CircuitBreaker();

    async withRetry<T>(
        operation: () => Promise<T>,
        operationKey: string,
        options: {
            maxRetries?: number;
            baseDelay?: number;
            maxDelay?: number;
            backoffFactor?: number;
            shouldRetry?: (error: Error) => boolean;
            useCircuitBreaker?: boolean;
        } = {}
    ): Promise<T> {
        const {
            maxRetries = 3,
            baseDelay = 100,
            maxDelay = 5000,
            backoffFactor = 2,
            shouldRetry = ErrorClassifier.isRetryable,
            useCircuitBreaker = true
        } = options;

        const wrappedOperation = useCircuitBreaker 
            ? () => this.circuitBreaker.execute(operation, operationKey)
            : operation;

        let lastError: Error;
        
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await wrappedOperation();
            } catch (error) {
                lastError = error instanceof Error ? error : new Error('Unknown error');
                
                // Don't retry on last attempt or if error is not retryable
                if (attempt === maxRetries || !shouldRetry(lastError)) {
                    break;
                }
                
                // Calculate delay with exponential backoff
                const delay = Math.min(baseDelay * Math.pow(backoffFactor, attempt), maxDelay);
                await this.sleep(delay);
            }
        }
        
        throw lastError!;
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Error Logger
class ErrorLogger {
    private sessionId = this.generateSessionId();
    private errorLogs: ErrorLog[] = [];
    
    constructor() {}

    async logError(error: Error, context?: string, level: 'error' | 'warn' = 'error'): Promise<void> {
        const errorLog: ErrorLog = {
            timestamp: new Date().toISOString(),
            level,
            message: error.message,
            error: {
                name: error.name,
                message: error.message,
                stack: error.stack,
                code: error instanceof DatabaseError ? error.code : undefined,
                category: error instanceof DatabaseError ? error.category : undefined
            },
            context,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
            url: typeof window !== 'undefined' ? window.location.href : 'Unknown',
            sessionId: this.sessionId
        };

        // Store in memory (could be extended to persist to IndexedDB)
        this.errorLogs.push(errorLog);
        
        // Log to console
        console.error('Database error:', errorLog);
        
        // Store in localStorage as fallback
        this.logToLocalStorage(errorLog);
    }

    getErrorLogs(): ErrorLog[] {
        return [...this.errorLogs];
    }

    private generateSessionId(): string {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    private logToLocalStorage(errorLog: ErrorLog): void {
        try {
            const logs = JSON.parse(localStorage.getItem('indexeddb_error_logs') || '[]');
            logs.push(errorLog);
            // Keep only last 50 logs
            localStorage.setItem('indexeddb_error_logs', JSON.stringify(logs.slice(-50)));
        } catch (error) {
            console.error('Failed to log to localStorage:', error);
        }
    }
}

// Create a more flexible proxy type that doesn't try to map every method
type AsyncProxy<T> = {
    [K in keyof T]: T[K] extends (...args: infer Args) => IDBRequest<infer R>
        ? R extends IDBCursor
            ? (...args: Args) => Promise<AsyncCursorResult>
            : (...args: Args) => Promise<R>
        : T[K] extends (...args: infer Args) => IDBIndex
            ? (...args: Args) => AsyncProxy<IDBIndex>
            : T[K];
};

export default class IndexedDBAsyncAPI {
    public readonly name: string;
    public readonly schema: SchemaUpgradeCallback;
    public readonly version?: number;
    public db: IDBDatabase | null = null;
    
    // Error handling components
    private retryManager: RetryManager;
    private errorLogger: ErrorLogger;
    private errorCount = new Map<string, number>();
    private readonly MAX_ERRORS = 5;
    private readonly ERROR_RESET_TIME = 60000; // 1 minute

    constructor(db_name: string, schema: SchemaUpgradeCallback, version?: number) {
        this.name = db_name;
        this.schema = schema;
        if (version) this.version = version;
        
        // Initialize error handling components
        this.retryManager = new RetryManager();
        this.errorLogger = new ErrorLogger();
        
        Object.seal(this);
    }

    async open(): Promise<IndexedDBAsyncAPI> {
        return this.withErrorHandling(
            () => this._openDatabase(),
            'database_open'
        );
    }

    private _openDatabase(): Promise<IndexedDBAsyncAPI> {
        return new Promise((resolve, reject) => {
            try {
                const db_request = self.indexedDB.open(this.name, this.version);
                const schema = this.schema;
                
                db_request.onerror = (event: Event) => {
                    const error = db_request.error || new Error('Unknown database error');
                    reject(DatabaseErrorFactory.create(error, 'database_open'));
                };
                
                db_request.onsuccess = (event: Event) => {
                    try {
                        this.db = db_request.result;
                        
                        // Set up error handling for database
                        this.db.onerror = (event: Event) => {
                            this.errorLogger.logError(
                                new DatabaseConnectionError(this.name, event.target as any),
                                'database_runtime_error'
                            );
                        };
                        
                        this.db.onversionchange = (event: Event) => {
                            this.db?.close();
                            this.errorLogger.logError(
                                new DatabaseVersionError(this.name),
                                'database_version_change'
                            );
                        };
                        
                        resolve(this);
                    } catch (error) {
                        reject(DatabaseErrorFactory.create(error, 'database_setup'));
                    }
                };
                
                db_request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
                    try {
                        schema(db_request.result);
                    } catch (error) {
                        reject(DatabaseErrorFactory.create(error, 'schema_upgrade'));
                    }
                };
                
                db_request.onblocked = (event: Event) => {
                    const error = new DatabaseConnectionError(
                        this.name, 
                        new Error('Database upgrade blocked by other connections')
                    );
                    reject(error);
                };
                
            } catch (error) {
                reject(DatabaseErrorFactory.create(error, 'database_open_setup'));
            }
        });
    }

    query(
        objectStoreName: string,
        mode: IDBTransactionMode = "readwrite",
        oncomplete?: (event: Event) => void,
        onerror?: (event: Event) => void
    ): AsyncProxy<IDBObjectStore> {
        if (!this.db) {
            throw new DatabaseConnectionError(this.name, new Error("Database not opened. Call open() first."));
        }
        
        try {
            // Validate object store exists
            if (!this.db.objectStoreNames.contains(objectStoreName)) {
                throw new ObjectStoreNotFoundError(objectStoreName);
            }
            
            const transaction = this.db.transaction(objectStoreName, mode);
            
            // Enhanced error handling for transactions
            const enhancedErrorHandler = (event: Event) => {
                const error = DatabaseErrorFactory.create(
                    (event.target as any)?.error || new Error('Transaction error'),
                    `transaction_${objectStoreName}_${mode}`
                );
                this.errorLogger.logError(error, `query_${objectStoreName}`);
                if (onerror) onerror(event);
            };
            
            const enhancedCompleteHandler = (event: Event) => {
                if (oncomplete) oncomplete(event);
            };
            
            transaction.oncomplete = enhancedCompleteHandler;
            transaction.onerror = enhancedErrorHandler;
            transaction.onabort = enhancedErrorHandler;
            
            return IndexedDBAsyncAPI.proxy(transaction.objectStore(objectStoreName));
            
        } catch (error) {
            const dbError = DatabaseErrorFactory.create(error, `query_${objectStoreName}`);
            this.errorLogger.logError(dbError);
            throw dbError;
        }
    }

    // Error handling wrapper method
    private async withErrorHandling<T>(
        operation: () => Promise<T>,
        context: string,
        options: {
            retryCount?: number;
            fallback?: () => Promise<T>;
            skipLogging?: boolean;
            useRetry?: boolean;
        } = {}
    ): Promise<T> {
        const { 
            retryCount = 3, 
            fallback, 
            skipLogging = false, 
            useRetry = true 
        } = options;

        try {
            if (useRetry) {
                return await this.retryManager.withRetry(operation, context, {
                    maxRetries: retryCount
                });
            } else {
                return await operation();
            }
        } catch (error) {
            const dbError = error instanceof DatabaseError 
                ? error 
                : DatabaseErrorFactory.create(error, context);

            if (!skipLogging) {
                await this.errorLogger.logError(dbError, context);
            }

            // Check error rate limiting
            if (this.isErrorRateLimited(context)) {
                throw new DatabaseConnectionError(
                    this.name, 
                    new Error('Too many errors. Please try again later.')
                );
            }

            // Handle specific error types
            const handledError = await this.handleSpecificError(dbError, context, retryCount);
            if (handledError !== null) {
                return handledError;
            }

            // Try fallback if available
            if (fallback) {
                try {
                    return await fallback();
                } catch (fallbackError) {
                    // Log fallback failure but throw original error
                    await this.errorLogger.logError(
                        DatabaseErrorFactory.create(fallbackError, `${context}_fallback`),
                        `${context}_fallback`
                    );
                }
            }

            throw dbError;
        }
    }

    private async handleSpecificError(
        error: DatabaseError, 
        context: string, 
        retryCount: number
    ): Promise<any> {
        switch (error.name) {
            case 'StorageQuotaError':
                return await this.handleQuotaError(error, context);
                
            case 'DatabaseVersionError':
                return await this.handleVersionError(error, context);
                
            case 'TransactionError':
                if (retryCount > 0) {
                    // Wait a bit and let retry mechanism handle it
                    await new Promise(resolve => setTimeout(resolve, 100));
                    return null; // Let retry mechanism handle
                }
                break;
                
            case 'DatabaseConnectionError':
                return await this.handleConnectionError(error, context);
        }

        return null; // No specific handling, let error propagate
    }

    private async handleQuotaError(error: DatabaseError, context: string): Promise<never> {
        // Try to free up space
        const freedSpace = await this.attemptCleanup();
        
        if (freedSpace > 0) {
            throw new StorageQuotaError();
        } else {
            throw new StorageQuotaError();
        }
    }

    private async handleVersionError(error: DatabaseError, context: string): Promise<never> {
        // Database version conflict - need to reload
        throw new DatabaseVersionError(this.name);
    }

    private async handleConnectionError(error: DatabaseError, context: string): Promise<never> {
        // Database connection issue
        throw new DatabaseConnectionError(this.name, error.originalError);
    }

    private isErrorRateLimited(context: string): boolean {
        const errorKey = `${context}_errors`;
        const currentCount = this.errorCount.get(errorKey) || 0;
        
        if (currentCount >= this.MAX_ERRORS) {
            return true;
        }
        
        this.errorCount.set(errorKey, currentCount + 1);
        
        // Reset counter after timeout
        setTimeout(() => {
            this.errorCount.delete(errorKey);
        }, this.ERROR_RESET_TIME);
        
        return false;
    }

    private async attemptCleanup(): Promise<number> {
        // Basic cleanup attempt - could be extended based on specific needs
        let freedBytes = 0;
        
        try {
            // This is a placeholder for cleanup logic
            // In a real implementation, you might clean up temporary data, old logs, etc.
            await new Promise(resolve => setTimeout(resolve, 100)); // Simulate cleanup time
            freedBytes = 1024; // Simulate freed space
        } catch (cleanupError) {
            await this.errorLogger.logError(
                DatabaseErrorFactory.create(cleanupError, 'cleanup'),
                'cleanup'
            );
        }
        
        return freedBytes;
    }

    static proxy<T extends IDBObjectStore | IDBIndex>(obj: T): AsyncProxy<T> {
        return new Proxy(obj, {
            get: function (obj: T, prop: string | symbol) {
                const value = (obj as any)[prop];
                if (!(value instanceof Function)) return value;
                
                return function (...params: any[]) {
                    try {
                        const request = value.apply(obj, params);
                        
                        if (request instanceof IDBIndex) {
                            return IndexedDBAsyncAPI.proxy(request);
                        }
                        
                        return new Promise((resolve, reject) => {
                            request.onsuccess = (e: Event) => {
                                try {
                                    let result = request.result;
                                    if (result instanceof IDBCursor) {
                                        resolve({
                                            request,
                                            cursor: result,
                                            [Symbol.asyncIterator]: async function* () {
                                                let promise: Promise<void>;
                                                while (result) {
                                                    yield {
                                                        key: result.key,
                                                        value: result.value,
                                                        primaryKey: result.primaryKey
                                                    };
                                                    promise = new Promise<void>((resolve, reject) => {
                                                        request.onsuccess = (e: Event) => resolve();
                                                        request.onerror = (e: Event) => {
                                                            const error = DatabaseErrorFactory.create(
                                                                (e.target as any)?.error || new Error('Cursor iteration error'),
                                                                'cursor_iteration'
                                                            );
                                                            reject(error);
                                                        };
                                                    });
                                                    result.continue();
                                                    await promise;
                                                    result = request.result;
                                                }
                                            }
                                        });
                                    } else {
                                        resolve(result);
                                    }
                                } catch (error) {
                                    const dbError = DatabaseErrorFactory.create(error, `proxy_success_${String(prop)}`);
                                    reject(dbError);
                                }
                            };
                            request.onerror = (e: Event) => {
                                const error = DatabaseErrorFactory.create(
                                    (e.target as any)?.error || new Error(`Operation ${String(prop)} failed`),
                                    `proxy_${String(prop)}`
                                );
                                reject(error);
                            };
                        });
                    } catch (error) {
                        const dbError = DatabaseErrorFactory.create(error, `proxy_${String(prop)}`);
                        return Promise.reject(dbError);
                    }
                };
            },
        }) as AsyncProxy<T>;
    }

    async export(keyRange?: IDBKeyRange, count?: number): Promise<string> {
        return this.withErrorHandling(
            () => this._export(keyRange, count),
            'export'
        );
    }

    private async _export(keyRange?: IDBKeyRange, count?: number): Promise<string> {
        if (!this.db) {
            throw new DatabaseConnectionError(this.name, new Error("Database not opened. Call open() first."));
        }
        
        const results = await Promise.all(
            [...this.db.objectStoreNames].map(async (objectStorename) => {
                try {
                    const query = this.query(objectStorename, 'readonly');
                    // Cast to any since we need to access keyPath and getAll which are properly proxied
                    const queryAny = query as any;
                    if (queryAny.keyPath === null) {
                        return [objectStorename, await queryAny.getAll(keyRange, count)];
                    }
                    return null;
                } catch (error) {
                    // Log error but continue with other stores
                    await this.errorLogger.logError(
                        DatabaseErrorFactory.create(error, `export_${objectStorename}`),
                        'export_store'
                    );
                    return null;
                }
            })
        );
        
        return JSON.stringify(results.filter(result => result !== null));
    }

    async import(data: string, keyPaths: KeyPaths): Promise<void> {
        return this.withErrorHandling(
            () => this._import(data, keyPaths),
            'import'
        );
    }

    private async _import(data: string, keyPaths: KeyPaths): Promise<void> {
        try {
            const parsedData: [string, any[]][] = JSON.parse(data);
            
            await Promise.all(
                parsedData.map(async ([objectStoreName, entries]) => {
                    try {
                        const query = this.query(objectStoreName);
                        // Cast to any since we need to access keyPath and put which are properly proxied
                        const queryAny = query as any;
                        if (queryAny.keyPath === null) {
                            const keyPath = keyPaths[objectStoreName];
                            if (keyPath === undefined) {
                                throw new DataValidationError([{
                                    field: 'keyPath',
                                    message: `ObjectStore '${objectStoreName}' does not have a KeyPath. Provide keyPath in import options.`
                                }]);
                            }
                            for (const obj of entries) {
                                const key = obj[keyPath];
                                if (key === undefined) {
                                    throw new DataValidationError([{
                                        field: keyPath,
                                        message: `ObjectStore '${objectStoreName}' entry is missing its key.`
                                    }]);
                                }
                                await queryAny.put(obj, key);
                            }
                        } else {
                            for (const obj of entries) {
                                await queryAny.put(obj);
                            }
                        }
                    } catch (error) {
                        throw DatabaseErrorFactory.create(error, `import_${objectStoreName}`);
                    }
                })
            );
        } catch (error) {
            if (error instanceof SyntaxError) {
                throw new DataValidationError([{
                    field: 'data',
                    message: 'Invalid JSON format in import data'
                }]);
            }
            throw error;
        }
    }

    async clear(): Promise<void> {
        return this.withErrorHandling(
            () => this._clear(),
            'clear_database',
            { useRetry: false } // Don't retry database deletion
        );
    }

    private _clear(): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                // Close current connection before deleting
                if (this.db) {
                    this.db.close();
                    this.db = null;
                }
                
                const request = self.indexedDB.deleteDatabase(this.name);
                
                request.onsuccess = () => resolve();
                request.onerror = (event: Event) => {
                    const error = DatabaseErrorFactory.create(
                        (event.target as any)?.error || new Error('Failed to delete database'),
                        'clear_database'
                    );
                    reject(error);
                };
                request.onblocked = (event: Event) => {
                    const error = new DatabaseConnectionError(
                        this.name,
                        new Error('Database deletion blocked by other connections')
                    );
                    reject(error);
                };
            } catch (error) {
                reject(DatabaseErrorFactory.create(error, 'clear_database_setup'));
            }
        });
    }

    // Utility methods for error handling and monitoring
    getErrorLogs(): ErrorLog[] {
        return this.errorLogger.getErrorLogs();
    }

    async getErrorStats(): Promise<{
        totalErrors: number;
        errorsByLevel: Record<string, number>;
        errorsByCategory: Record<string, number>;
        recentErrors: number;
    }> {
        const logs = this.errorLogger.getErrorLogs();
        const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        
        const stats = {
            totalErrors: logs.length,
            errorsByLevel: {} as Record<string, number>,
            errorsByCategory: {} as Record<string, number>,
            recentErrors: 0
        };
        
        for (const log of logs) {
            // Count by level
            stats.errorsByLevel[log.level] = (stats.errorsByLevel[log.level] || 0) + 1;
            
            // Count by category
            if (log.error?.category) {
                stats.errorsByCategory[log.error.category] = 
                    (stats.errorsByCategory[log.error.category] || 0) + 1;
            }
            
            // Count recent errors
            if (new Date(log.timestamp) >= oneDayAgo) {
                stats.recentErrors++;
            }
        }
        
        return stats;
    }

    // Check database health
    async isHealthy(): Promise<boolean> {
        try {
            if (!this.db) return false;
            
            // Try a simple operation to check if database is responsive
            const testStore = [...this.db.objectStoreNames][0];
            if (testStore) {
                const query = this.query(testStore, 'readonly');
                await (query as any).count();
            }
            
            return true;
        } catch (error) {
            await this.errorLogger.logError(
                DatabaseErrorFactory.create(error, 'health_check'),
                'health_check'
            );
            return false;
        }
    }

    // Force close database connection
    close(): void {
        if (this.db) {
            this.db.close();
            this.db = null;
        }
    }
}

// Export all error handling classes and interfaces for external use
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
};

export type {
    ErrorLog,
    CircuitBreakerState,
    SchemaUpgradeCallback,
    KeyPaths,
    CursorResult,
    AsyncCursorResult,
    AsyncProxy
};