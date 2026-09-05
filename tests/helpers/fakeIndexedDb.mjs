function clone(value) {
    return value === undefined ? undefined : structuredClone(value);
}

class NameList {
    constructor(source) { this.source = source; }
    contains(name) { return this.source.has(name); }
}

class FakeTransaction {
    constructor(db, names, mode, factory) {
        this.db = db;
        this.names = Array.isArray(names) ? names : [names];
        this.mode = mode;
        this.factory = factory;
        this.error = null;
        this.oncomplete = null;
        this.onerror = null;
        this.onabort = null;
        this.pending = 0;
        this.finished = false;
        this.timer = null;
        this.staged = new Map();
        for (const name of this.names) {
            const source = db.stores.get(name);
            if (!source) throw new Error(`missing store ${name}`);
            this.staged.set(name, { keyPath: source.keyPath, records: new Map([...source.records].map(([k,v]) => [k, clone(v)])), indexes: new Map(source.indexes) });
        }
        this.#scheduleComplete();
    }

    objectStore(name) {
        const data = this.staged.get(name);
        if (!data) throw new Error(`store ${name} not in transaction`);
        return new FakeObjectStore(this, data, name);
    }

    request(executor) {
        this.pending += 1;
        if (this.timer) clearTimeout(this.timer);
        const request = { result: undefined, error: null, onsuccess: null, onerror: null };
        queueMicrotask(() => {
            if (this.finished) return;
            try {
                request.result = executor();
                request.onsuccess?.({ target: request });
            } catch (error) {
                request.error = error;
                this.error = error;
                request.onerror?.({ target: request });
                this.#abort(error);
            } finally {
                this.pending -= 1;
                this.#scheduleComplete();
            }
        });
        return request;
    }

    #abort(error) {
        if (this.finished) return;
        this.finished = true;
        if (this.timer) clearTimeout(this.timer);
        this.error = error;
        queueMicrotask(() => {
            this.onerror?.({ target: this });
            this.onabort?.({ target: this });
        });
    }

    #scheduleComplete() {
        if (this.finished || this.pending > 0) return;
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
            if (this.finished || this.pending > 0) return;
            for (const [name, staged] of this.staged) {
                this.db.stores.set(name, { keyPath: staged.keyPath, records: new Map([...staged.records].map(([k,v]) => [k, clone(v)])), indexes: new Map(staged.indexes) });
            }
            this.finished = true;
            this.oncomplete?.({ target: this });
        }, 2);
    }
}

class FakeObjectStore {
    constructor(transaction, data, name) {
        this.transaction = transaction;
        this.data = data;
        this.name = name;
        this.indexNames = new NameList(data.indexes);
    }
    createIndex(name, keyPath, options = {}) {
        this.data.indexes.set(name, { keyPath, options });
        return {};
    }
    get(key) { return this.transaction.request(() => clone(this.data.records.get(key))); }
    getAll() { return this.transaction.request(() => [...this.data.records.values()].map(clone)); }
    put(value) {
        return this.transaction.request(() => {
            this.transaction.factory.putCount += 1;
            if (this.transaction.factory.failPutAt && this.transaction.factory.putCount === this.transaction.factory.failPutAt) {
                const error = new Error('Injected IndexedDB put failure'); error.name = this.transaction.factory.failName || 'UnknownError'; throw error;
            }
            const key = value?.[this.data.keyPath];
            if (key === undefined) throw new Error(`missing keyPath ${this.data.keyPath}`);
            this.data.records.set(key, clone(value));
            return key;
        });
    }
    delete(key) { return this.transaction.request(() => { this.data.records.delete(key); return undefined; }); }
    index() { throw new Error('index access intentionally unavailable in fake; tests use getAll fallback'); }
}

class FakeUpgradeStore {
    constructor(data) { this.data = data; this.indexNames = new NameList(data.indexes); }
    createIndex(name, keyPath, options = {}) { this.data.indexes.set(name, { keyPath, options }); return {}; }
}

class FakeDatabase {
    constructor(factory) {
        this.factory = factory;
        this.stores = new Map();
        this.objectStoreNames = new NameList(this.stores);
    }
    createObjectStore(name, options = {}) {
        const data = { keyPath: options.keyPath, records: new Map(), indexes: new Map() };
        this.stores.set(name, data);
        return new FakeUpgradeStore(data);
    }
    transaction(names, mode) { return new FakeTransaction(this, names, mode, this.factory); }
    close() {}
}

export class FakeIndexedDBFactory {
    constructor() {
        this.db = null;
        this.version = 0;
        this.putCount = 0;
        this.failPutAt = 0;
        this.failName = 'UnknownError';
    }
    open(_name, version) {
        const request = { result: null, error: null, transaction: null, onupgradeneeded: null, onsuccess: null, onerror: null, onblocked: null };
        queueMicrotask(() => {
            try {
                if (!this.db) this.db = new FakeDatabase(this);
                request.result = this.db;
                if (Number(version) > this.version) {
                    this.version = Number(version);
                    request.onupgradeneeded?.({ target: request });
                }
                setTimeout(() => request.onsuccess?.({ target: request }), 0);
            } catch (error) {
                request.error = error;
                request.onerror?.({ target: request });
            }
        });
        return request;
    }
    failNextPut(name = 'UnknownError') {
        this.failPutAt = this.putCount + 1;
        this.failName = name;
    }
    clearFailure() { this.failPutAt = 0; }
}
