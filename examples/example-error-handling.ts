// Example demonstrating the enhanced error handling capabilities

import IndexedDBAsyncAPI from './IndexedDBAsyncAPI';

// Example schema for demonstration
const exampleSchema = (db: IDBDatabase) => {
    // Create users object store
    if (!db.objectStoreNames.contains('users')) {
        const userStore = db.createObjectStore('users', { keyPath: 'id', autoIncrement: true });
        userStore.createIndex('email', 'email', { unique: true });
        userStore.createIndex('name', 'name', { unique: false });
    }
    
    // Create logs object store for error logging
    if (!db.objectStoreNames.contains('error_logs')) {
        const logStore = db.createObjectStore('error_logs', { keyPath: 'id', autoIncrement: true });
        logStore.createIndex('timestamp', 'timestamp');
        logStore.createIndex('level', 'level');
        logStore.createIndex('category', 'error.category');
    }
};

// Example usage with error handling
async function demonstrateErrorHandling() {
    const db = new IndexedDBAsyncAPI('example_db', exampleSchema, 1);
    
    try {
        // Open database with enhanced error handling
        console.log('Opening database...');
        await db.open();
        console.log('Database opened successfully');
        
        // Example 1: Basic operation with error handling
        try {
            const userQuery = db.query('users');
            const user = await (userQuery as any).add({
                name: 'John Doe',
                email: 'john@example.com',
                age: 30
            });
            console.log('User added successfully:', user);
        } catch (error) {
            console.error('Failed to add user:', error);
        }
        
        // Example 2: Attempting duplicate email (should trigger constraint error)
        try {
            const userQuery = db.query('users');
            await (userQuery as any).add({
                name: 'Jane Doe',
                email: 'john@example.com', // Same email - will trigger constraint error
                age: 25
            });
        } catch (error) {
            console.error('Expected constraint error:', error);
        }
        
        // Example 3: Query non-existent object store (should trigger validation error)
        try {
            const nonExistentQuery = db.query('non_existent_store');
            await (nonExistentQuery as any).getAll();
        } catch (error) {
            console.error('Expected object store not found error:', error);
        }
        
        // Example 4: Check database health
        const isHealthy = await db.isHealthy();
        console.log('Database health status:', isHealthy);
        
        // Example 5: Get error statistics
        const errorStats = await db.getErrorStats();
        console.log('Error statistics:', errorStats);
        
        // Example 6: Get error logs
        const errorLogs = db.getErrorLogs();
        console.log('Recent error logs:', errorLogs);
        
        // Example 7: Export data with error handling
        try {
            const exportedData = await db.export();
            console.log('Data exported successfully, size:', exportedData.length);
        } catch (error) {
            console.error('Export failed:', error);
        }
        
    } catch (error) {
        console.error('Database operation failed:', error);
        
        // Check if the error is retryable
        if (error instanceof Error) {
            // Import ErrorClassifier dynamically to check if error is retryable
            console.log('Error details:', {
                name: error.name,
                message: error.message,
                stack: error.stack
            });
        }
    } finally {
        // Clean up
        db.close();
    }
}

// Export for use in other files
export { demonstrateErrorHandling, exampleSchema };

// Run demonstration if this file is executed directly
if (typeof window !== 'undefined') {
    // Browser environment
    demonstrateErrorHandling().catch(console.error);
} else {
    // Node.js environment (for testing)
    console.log('Error handling example loaded. Call demonstrateErrorHandling() to run.');
}
