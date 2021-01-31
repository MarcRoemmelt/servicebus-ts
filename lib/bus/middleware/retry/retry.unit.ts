/* eslint-disable @typescript-eslint/no-empty-function */
import { describe, it } from 'mocha';
import chai from 'chai';
import util from 'util';
import { bus as b } from '../../..';
import { retryMiddleware } from '.';
import { RedisStore } from './stores';
import { RabbitMQBus, SubscribeReceipt } from 'lib/bus/rabbitMQ/bus';
import { Channel } from 'amqplib';
import { IMessage } from 'lib/bus/bus.types';
chai.should();

describe('#retry', function () {
    let bus: RabbitMQBus;

    describe('#MemoryStore', function () {
        before(async function () {
            bus = await b({ url: process.env.RABBITMQ_URL });
            bus.use(bus.correlate());
            bus.use(retryMiddleware());
        });

        it('should throw if ack called more than once on message', function () {
            const channel = ({
                ack: function () {},
                publish: function () {},
            } as unknown) as Channel;
            const message = ({
                content: {
                    cid: 1,
                },
                fields: {},
                properties: {
                    headers: {},
                },
            } as unknown) as IMessage;
            const middleware = retryMiddleware().handleIncoming!;
            middleware(channel, message, { ack: true }, ((err, channel, message: IMessage) => {
                message.content.handle.ack();
                (function () {
                    message.content.handle.ack();
                }.should.throw(Error));
            }) as any);
        });

        it('should throw if reject called more than max on message', function () {
            const channel = ({
                reject: function () {},
                publish: function () {},
            } as unknown) as Channel;
            const message = ({
                content: {
                    cid: 1,
                },
                fields: {
                    redelivered: false,
                },
                properties: {
                    headers: {},
                },
            } as unknown) as IMessage;
            const middleware = retryMiddleware().handleIncoming!;
            middleware(channel, message, { ack: true, maxRetries: 3 }, ((
                error: null | Error,
                channel: Channel,
                message: IMessage,
            ) => {
                message.content.handle.reject();
                message.content.handle.reject();
                message.content.handle.reject();
                (function () {
                    message.content.handle.reject();
                }.should.throw(Error));
            }) as any);
        });

        it('rejected send/listen messages should retry until max retries', function (done) {
            let count = 0;
            void bus.listen('test.servicebus.retry.1', { ack: true }, (content) => {
                count++;
                content.handle.reject();
            });
            void bus.listen('test.servicebus.retry.1.error', { ack: true }, (content) => {
                count.should.equal(4); // one send and three retries
                content.handle.ack();
                void bus.destroyListener('test.servicebus.retry.1').then(() => {
                    void bus.destroyListener('test.servicebus.retry.1.error').then(() => {
                        done();
                    });
                });
            });
            setTimeout(function () {
                void bus.send('test.servicebus.retry.1', { my: 'event' });
            }, 100);
        });

        it('rejected publish/subscribe messages should retry until max retries', function (done) {
            let count = 0;
            let subscription: SubscribeReceipt;
            void bus
                .subscribe('test.servicebus.retry.2', { ack: true }, (content) => {
                    count++;
                    content.handle.reject();
                })
                .then((sub) => (subscription = sub));
            void bus.listen('test.servicebus.retry.2.error', { ack: true }, function (event) {
                count.should.equal(4); // one send and three retries
                event.handle.ack();
                subscription.unsubscribe();
                void bus.destroyListener('test.servicebus.retry.2.error').then(() => done());
            });
            setTimeout(function () {
                void bus.publish('test.servicebus.retry.2', { data: Math.random() });
            }, 1000);
        });
    });

    describe('#RedisStore', function () {
        const store = new RedisStore({
            host: process.env.REDIS_HOST!,
            port: Number(process.env.REDIS_PORT)!,
        });

        before(async function () {
            bus = await b({ url: process.env.RABBITMQ_URL });
            bus.use(bus.correlate());
            bus.use(
                retryMiddleware({
                    namespace: 'namespace',
                    store,
                }),
            );
        });

        it('should throw if ack called more than once on message', function () {
            const channel = ({
                ack: function () {},
                publish: function () {},
            } as unknown) as Channel;
            const message = ({
                content: {
                    cid: 1,
                },
                fields: {},
                properties: {
                    headers: {},
                },
            } as unknown) as IMessage;
            const middleware = retryMiddleware().handleIncoming!;
            middleware(channel, message, { ack: true }, ((err, channel, message: IMessage) => {
                message.content.handle.ack();
                (function () {
                    message.content.handle.ack();
                }.should.throw(Error));
            }) as any);
        });

        it('should throw if reject called more than max on message', function () {
            const channel = ({
                reject: function () {},
                publish: function () {},
            } as unknown) as Channel;
            const message = ({
                content: {
                    cid: 1,
                },
                fields: {},
                properties: {
                    headers: {},
                },
            } as unknown) as IMessage;
            const middleware = retryMiddleware().handleIncoming!;
            middleware(channel, message, { ack: true, maxRetries: 3 }, ((err, channel, message: IMessage) => {
                message.content.handle.reject();
                message.content.handle.reject();
                message.content.handle.reject();
                (function () {
                    message.content.handle.reject();
                }.should.throw(Error));
            }) as any);
        });

        it('rejected send/listen messages should retry until max retries', function (done) {
            this.timeout(5000);
            let count = 0;
            void bus.listen('test.servicebus.retry.3', { ack: true }, function (event) {
                count++;
                event.handle.reject();
            });
            void bus.listen('test.servicebus.retry.3.error', { ack: true }, function (event) {
                count.should.equal(4); // one send and three retries
                event.handle.ack();
                void bus.destroyListener('test.servicebus.retry.3').then(() => {
                    void bus.destroyListener('test.servicebus.retry.3.error').then(() => {
                        done();
                    });
                });
            });
            setTimeout(function () {
                void bus.send('test.servicebus.retry.3', { my: 'event' });
            }, 100);
        });

        it('rejected publish/subscribe messages should retry until max retries', function (done) {
            let count = 0;
            let subscription: SubscribeReceipt;
            void bus
                .subscribe('test.servicebus.retry.4', { ack: true }, function (event) {
                    count++;
                    event.handle.reject();
                })
                .then((sub) => (subscription = sub));
            void bus.listen('test.servicebus.retry.4.error', { ack: true }, function (event) {
                count.should.equal(4); // one send and three retries
                event.handle.ack();
                subscription.unsubscribe();
                void bus.destroyListener('test.servicebus.retry.4.error').then(() => {
                    done();
                });
                // });
            });
            setTimeout(function () {
                void bus.publish('test.servicebus.retry.4', { data: Math.random() });
            }, 100);
        });

        it('rejected wildcard subscribe messages should retry until max retries', function (done) {
            let count = 0;
            let subscription: SubscribeReceipt;
            void bus
                .subscribe('test.servicebus.retry.wildcard.*', { ack: true }, function (event) {
                    count++;
                    event.handle.reject();
                })
                .then((sub) => (subscription = sub));
            void bus.listen('test.servicebus.retry.wildcard.*.error', { ack: true }, function (event) {
                count.should.equal(4); // one send and three retries
                event.handle.ack();
                subscription.unsubscribe();
                void bus.destroyListener('test.servicebus.retry.wildcard.*.error').then(() => {
                    done();
                });
            });
            setTimeout(function () {
                void bus.publish('test.servicebus.retry.wildcard.5', { data: Math.random() });
            }, 100);
        });
    });

    describe('#options', function () {
        describe('namespace', function () {
            const store = new RedisStore({
                host: process.env.REDIS_HOST!,
                port: Number(process.env.REDIS_PORT!),
            });

            before(async function () {
                bus = await b({ url: process.env.RABBITMQ_URL });
                bus.use(bus.correlate());
                bus.use(
                    retryMiddleware({
                        namespace: 'namespace',
                        store: store,
                    }),
                );
            });

            it('should prepend unique message id with provided namespace', function (done) {
                let count = 0;

                void bus.listen('test.servicebus.retry.5.error', { ack: true }, function () {});

                void bus.listen('test.servicebus.retry.5', { ack: true }, function (event) {
                    count++;

                    if (count === 4) {
                        const key = util.format('%s-%s', 'namespace', event.cid);
                        store.get(key, function (err, rejectCount) {
                            if (err) return done(err);
                            Number(rejectCount).should.eql(count - 1);
                            store.clear(key, function (err) {
                                if (err) return done(err);
                                void bus.destroyListener('test.servicebus.retry.5', { force: true }).then(() => {
                                    void bus
                                        .destroyListener('test.servicebus.retry.5.error', { force: true })
                                        .then(() => {
                                            done();
                                        });
                                });
                            });
                        });
                    }

                    event.handle.reject((err) => {
                        if (err) return done(err);
                    });
                });

                setTimeout(function () {
                    void bus.send('test.servicebus.retry.5', { my: 'event' });
                }, 100);
            });
        });

        describe('setRetriesRemaining', function () {
            const store = new RedisStore({
                host: process.env.REDIS_HOST!,
                port: Number(process.env.REDIS_PORT!),
            });
            const maxRetries = 5;
            before(async function () {
                bus = await b({ url: process.env.RABBITMQ_URL });
                bus.use(bus.correlate());
                bus.use(
                    retryMiddleware({
                        maxRetries,
                        namespace: 'namespace',
                        setRetriesRemaining: true,
                        store,
                    }),
                );
                bus.use(bus.package());
            });

            it('should provide count of retries remaining', function (done) {
                let count = 0;

                void bus.listen('test.servicebus.retry.6', { ack: true }, function (event) {
                    count++;
                    Number(count).should.eql(maxRetries - event.retriesRemaining + 1);

                    if (event.retriesRemaining === 0) {
                        void bus
                            .destroyListener('test.servicebus.retry.6', { force: true })
                            .then(
                                () =>
                                    void bus
                                        .destroyListener('test.servicebus.retry.6.error', { force: true })
                                        .then(() => done()),
                            );
                    }

                    event.handle.reject(function (err) {
                        if (err) return done(err);
                    });
                });

                void bus.listen('test.servicebus.retry.6.error', { ack: true }, function () {});

                setTimeout(function () {
                    void bus.send('test.servicebus.retry.6', { my: 'event' }, { ack: true });
                }, 100);
            });
        });
    });
});
