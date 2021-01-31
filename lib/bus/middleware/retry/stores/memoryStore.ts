export class MemoryStore {
    store: { [key: string]: number } = {};

    public clear(uniqueId: string, cb: (err?: null | Error, retry?: number) => void): void {
        delete this.store[uniqueId];
        cb();
    }

    public get(uniqueId: string, cb: (err: null | Error, retry: number) => void): void {
        cb(null, this.store[uniqueId]);
    }

    public increment(uniqueId: string, cb: (err: null | Error, retry: number) => void): void {
        let count = this.store[uniqueId];
        if (count === undefined) {
            count = 1;
        } else {
            count = count + 1;
        }
        this.store[uniqueId] = count;
        cb(null, this.store[uniqueId]);
    }
}
