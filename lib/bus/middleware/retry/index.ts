import { IMessage, Middleware } from 'lib/bus/bus.types';
import { MemoryStore, RedisStore } from './stores';
import util from 'util';
import debug from 'debug';
import type { Bus } from 'lib/bus/Bus';
const log = debug('servicebus:retry');

export { RedisStore, MemoryStore } from './stores';

interface IRetryMiddlewareOptions {
    setRetriesRemaining?: boolean;
    maxRetries?: number;
    store: MemoryStore | RedisStore;
    namespace?: string;
}
export function retryMiddleware(opts?: IRetryMiddlewareOptions): Middleware {
    const options = opts || { store: new MemoryStore() };

    options.setRetriesRemaining = options.setRetriesRemaining || false;

    const maxRetries = options.maxRetries || 3;
    const store = options.store;

    const methodMax = {};

    function createOnly(method: string, max: number) {
        const calledByMethod = {};
        methodMax[method] = max;
        return function only(message: IMessage) {
            if (calledByMethod[method] === undefined) {
                calledByMethod[method] = 1;
            } else {
                calledByMethod[method]++;
            }
            if (Object.keys(calledByMethod).length && calledByMethod[method] > methodMax[method]) {
                const methods = Object.keys(calledByMethod).join(',');
                throw new Error(
                    util.format(
                        'message type: %s cid: %s handle already called with %s',
                        message.content.type,
                        message.content.cid,
                        methods,
                    ),
                );
            }
        };
    }

    function getNamespacedUniqueMessageId(uniqueMessageId: string): string {
        return options.namespace !== undefined
            ? util.format('%s-%s', options.namespace, uniqueMessageId)
            : uniqueMessageId;
    }

    function setRetriesRemaining(uniqueMessageId: string, message: IMessage, cb) {
        if (!options.setRetriesRemaining) {
            return cb(null, message);
        } else if (message.fields.redelivered) {
            return store.get(getNamespacedUniqueMessageId(uniqueMessageId), function (err, count) {
                if (err) return cb(err);
                message.content.retriesRemaining = maxRetries - count;
                return cb(null, message);
            });
        } else {
            message.content.retriesRemaining = maxRetries;
            return cb(null, message);
        }
    }

    return {
        handleIncoming(this: Bus, channel, msg, options, next) {
            if (!options || !options.ack) return next(null, channel, msg, options);
            const onlyAckOnce = createOnly('ack', 1);
            const onlyRejectMax = createOnly('reject', maxRetries);
            const uniqueMessageId = msg.content.cid;

            setRetriesRemaining(uniqueMessageId, msg, (err: null | Error, message: IMessage) => {
                if (err) {
                    this.emit('error', err);
                    if (next) next(err);
                }

                const ack = (cb) => {
                    onlyAckOnce(message);

                    log('acking message %s', uniqueMessageId);

                    channel.ack(message as any);

                    if (cb) return cb();
                };

                message.content.handle = {
                    ack,
                    acknowledge(cb) {
                        ack(cb);
                    },
                    reject: (cb) => {
                        onlyRejectMax(message);

                        const namespacedUniqueMessageId = getNamespacedUniqueMessageId(uniqueMessageId);

                        store.increment(namespacedUniqueMessageId, (err) => {
                            if (err) {
                                this.emit('error', err);
                                if (cb) return cb(err);
                            }

                            store.get(namespacedUniqueMessageId, (err, count) => {
                                if (err) {
                                    this.emit('error', err);
                                    if (cb) return cb(err);
                                }

                                if (count > maxRetries) {
                                    const errorQueueName = util.format('%s.error', options.queueName);

                                    log('sending message %s to error queue %s', uniqueMessageId, errorQueueName);

                                    const buffer = Buffer.from(JSON.stringify(message.content));

                                    channel.sendToQueue(
                                        errorQueueName,
                                        buffer,
                                        Object.assign(options, { headers: { rejected: count } }),
                                    );
                                    channel.reject(message as any, false);

                                    store.clear(namespacedUniqueMessageId, (err) => {
                                        if (err) {
                                            this.emit('error', err);
                                        }

                                        if (cb) return cb(err);
                                    });
                                } else {
                                    log('retrying message %s', uniqueMessageId);

                                    channel.reject(message as any, true);

                                    if (cb) return cb();
                                }
                            });
                        });
                    },
                };

                return next(null, channel, message, options);
            });
        },
    };
}
