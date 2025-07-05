/* eslint-disable @typescript-eslint/no-explicit-any */
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

    constructor(db_name: string, schema: SchemaUpgradeCallback, version?: number) {
        this.name = db_name;
        this.schema = schema;
        if (version) this.version = version;
        Object.seal(this);
    }

    open(): Promise<IndexedDBAsyncAPI> {
        return new Promise((resolve, reject) => {
            const db_request = self.indexedDB.open(this.name, this.version);
            const schema = this.schema;
            
            db_request.onerror = (event: Event) => reject(event);
            db_request.onsuccess = (event: Event) => {
                this.db = db_request.result;
                resolve(this);
            };
            db_request.onupgradeneeded = function (event: IDBVersionChangeEvent) {
                schema(this.result);
            };
        });
    }

    query(
        objectStoreName: string,
        mode: IDBTransactionMode = "readwrite",
        oncomplete?: (event: Event) => void,
        onerror?: (event: Event) => void
    ): AsyncProxy<IDBObjectStore> {
        if (!this.db) {
            throw new Error("Database not opened. Call open() first.");
        }
        
        const transaction = this.db.transaction(objectStoreName, mode);
        if (oncomplete instanceof Function) transaction.oncomplete = oncomplete;
        if (onerror instanceof Function) transaction.onerror = onerror;
        return IndexedDBAsyncAPI.proxy(transaction.objectStore(objectStoreName));
    }

    static proxy<T extends IDBObjectStore | IDBIndex>(obj: T): AsyncProxy<T> {
        return new Proxy(obj, {
            get: function (obj: T, prop: string | symbol) {
                const value = (obj as any)[prop];
                if (!(value instanceof Function)) return value;
                
                return function (...params: any[]) {
                    const request = value.apply(obj, params);
                    
                    if (request instanceof IDBIndex) {
                        return IndexedDBAsyncAPI.proxy(request);
                    }
                    
                    return new Promise((resolve, reject) => {
                        request.onsuccess = (e: Event) => {
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
                                                request.onerror = (e: Event) => reject(e);
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
                        };
                        request.onerror = (e: Event) => reject(e);
                    });
                };
            },
        }) as AsyncProxy<T>;
    }

    async export(keyRange?: IDBKeyRange, count?: number): Promise<string> {
        if (!this.db) {
            throw new Error("Database not opened. Call open() first.");
        }
        
        const results = await Promise.all(
            [...this.db.objectStoreNames].map(async (objectStorename) => {
                const query = this.query(objectStorename);
                // Cast to any since we need to access keyPath and getAll which are properly proxied
                const queryAny = query as any;
                if (queryAny.keyPath === null) {
                    return [objectStorename, await queryAny.getAll(keyRange, count)];
                }
                return null;
            })
        );
        
        return JSON.stringify(results.filter(result => result !== null));
    }

    async import(data: string, keyPaths: KeyPaths): Promise<void> {
        const parsedData: [string, any[]][] = JSON.parse(data);
        
        await Promise.all(
            parsedData.map(async ([objectStoreName, entries]) => {
                const query = this.query(objectStoreName);
                // Cast to any since we need to access keyPath and put which are properly proxied
                const queryAny = query as any;
                if (queryAny.keyPath === null) {
                    const keyPath = keyPaths[objectStoreName];
                    if (keyPath === undefined) {
                        throw new Error(
                            `ObjectStore '${queryAny.name}' does not have a KeyPath. Call import(data, {[objectStoreName]:[keyPath]}).`
                        );
                    }
                    for (const obj of entries) {
                        const key = obj[keyPath];
                        if (key === undefined) {
                            throw new Error(
                                `ObjectStore '${queryAny.name}' entry '${obj}' is missing its key.`
                            );
                        }
                        await queryAny.put(obj, key);
                    }
                } else {
                    for (const obj of entries) {
                        await queryAny.put(obj);
                    }
                }
            })
        );
    }

    async clear(): Promise<void> {
        return new Promise((resolve, reject) => {
            const request = self.indexedDB.deleteDatabase(this.name);
            request.onsuccess = () => resolve();
            request.onerror = (event: Event) => reject(event);
        });
    }
}