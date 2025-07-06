# IndexedDB AsyncAPI

A modern TypeScript wrapper for IndexedDB that converts callback-based operations into async/await patterns, making database operations more intuitive and easier to work with.

## Features

- 🚀 **Async/Await Support**: Convert IndexedDB's callback-based API to modern async/await
- 🔄 **Cursor Iteration**: Built-in async iterator support for cursor operations
- 📦 **Export/Import**: Easy database backup and restore functionality
- 🎯 **Type Safe**: Full TypeScript support with proper typing
- 🪶 **Lightweight**: Minimal dependencies, small bundle size
- 🛡️ **Error Handling**: Proper error propagation with Promises

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

## Error Handling

All operations return Promises, so you can use standard try/catch blocks:

```typescript
try {
  const store = dbAPI.query('users');
  const user = await store.get(123);
  console.log(user);
} catch (error) {
  console.error('Database operation failed:', error);
}
```

## Best Practices

1. **Always await `open()`** before performing operations
2. **Use appropriate transaction modes** (`readonly` for reads, `readwrite` for writes)
3. **Handle errors properly** with try/catch blocks
4. **Use indexes** for efficient querying
5. **Close transactions promptly** by limiting scope
6. **Version your database schema** for proper upgrades

## Example: Complete Todo App

```typescript
import IndexedDBAsyncAPI from 'react-indexeddb-asyncapi';

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
}

// Usage
const app = new TodoApp();
await app.init();

const todoId = await app.addTodo('Learn IndexedDB');
const todos = await app.getTodos();
await app.toggleTodo(todoId);
```

## Browser Support

This package works in all modern browsers that support:
- IndexedDB
- Promises
- Proxy objects
- Async/await (or with transpilation)

## Pending Changes

- Support for tests
- Linting operations
- Additional examples and tutorials

## License

MIT License - see LICENSE file for details.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
