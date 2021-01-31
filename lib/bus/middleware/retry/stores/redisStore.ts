import d from 'debug';
import redis, { RedisClient } from 'redis';
import util from 'util';

const debug = d('servicebus:retry:RedisStore');

interface IRedisStoreOptions {
    host: string;
    port: number;
    password?: string;
    keyFormat?: string;
    keyExpireTTL?: number;
    ttl?: number;
}
export class RedisStore {
    keyFormat: string;
    keyExpireTTL: number;
    client: RedisClient;

    constructor(options: IRedisStoreOptions) {
        options = options || {};

        if (!options.host) throw new Error('a host is required to instantiate a redis store');
        if (!options.port) throw new Error('a port is required to instantiate a redis store');

        debug('creating RedisStore with arguments %j', options);

        const extraOptions = options.password ? { password: options.password } : undefined;

        this.client = redis.createClient(options.port, options.host, extraOptions);

        this.keyFormat = options.keyFormat || 'servicebus.retry.%s';
        this.keyExpireTTL = options.keyExpireTTL || options.ttl || 30;
    }

    public clear(uniqueId: string, cb: (err: null | Error, retry: number) => void): void {
        debug('clearing %s', uniqueId);
        this.client.del(util.format(this.keyFormat, uniqueId), cb);
    }

    public get(uniqueId: string, cb: (err: null | Error, retry: null | string) => void): void {
        debug('getting %s', uniqueId);
        this.client.get(util.format(this.keyFormat, uniqueId), cb);
    }

    public increment(uniqueId: string, cb: (err?: null | Error, retry?: null | string) => void): void {
        debug('incrementing %s', uniqueId);

        const multi = this.client.multi();
        const key = util.format(this.keyFormat, uniqueId);

        multi.incr(key);
        multi.expire(key, this.keyExpireTTL);

        multi.exec(function (err) {
            cb(err);
        });
    }
}
