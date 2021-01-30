/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it } from 'mocha';
import sinon from 'sinon';
import chai from 'chai';
import debug from 'debug';
import b from '../../../bus-shim';
import cb from '../../../bus-confirm-shim';
import { RabbitMQBus, SubscribeReceipt } from '../bus';
const log = debug('servicebus:test');
const should = chai.should();

describe('servicebus', function () {
    let bus: RabbitMQBus;
    let confirmBus: RabbitMQBus;
    before(async function () {
        bus = await b();
        confirmBus = await cb();
    });

    describe('#publish & #subscribe', function () {
        it('should cause message to be received by subscribe', function (done) {
            this.timeout(5000);
            void bus.subscribe('my.event.11', function () {
                done();
            });
            setTimeout(function () {
                void bus.publish('my.event.11', { my: 'event' });
            }, 100);
        });

        it('should fan out to when multiple listening', function (done) {
            this.timeout(5000);
            let count = 0;
            let oneDone, twoDone, threeDone, fourDone;
            function tryDone() {
                count++;
                log(`received my.event.12 ${count} times`);
                if (count === 4 && oneDone && twoDone && threeDone && fourDone) {
                    done();
                }
            }
            void bus.subscribe('my.event.12', function () {
                oneDone = true;
                tryDone();
            });
            void bus.subscribe('my.event.12', function () {
                twoDone = true;
                tryDone();
            });
            void bus.subscribe('my.event.12', function () {
                threeDone = true;
                tryDone();
            });
            void bus.subscribe('my.event.12', function () {
                fourDone = true;
                tryDone();
            });
            setTimeout(function () {
                void bus.publish('my.event.12', { my: 'event' });
                void bus.publish('my.event.12', { my: 'event' });
                void bus.publish('my.event.12', { my: 'event' });
                void bus.publish('my.event.12', { my: 'event' });
            }, 100);
        });

        it('can handle high event throughput', function (done) {
            this.timeout(30000);
            let count = 0;
            const endCount = 5000;
            function tryDone() {
                count++;
                if (count > endCount) {
                    done();
                }
            }
            void bus.subscribe('my.event.13', function () {
                log(`received my.event.13 ${count} times`);
                tryDone();
            });
            setTimeout(function () {
                for (let i = 0; i <= endCount; ++i) {
                    void bus.publish('my.event.13', { my: 'event' });
                }
            }, 100);
        });

        it('sends subsequent messages only after previous messages are acknowledged', function (done) {
            this.timeout(5000);
            let count = 0;
            const subscriptions: SubscribeReceipt[] = [];
            const interval = setInterval(function checkDone() {
                if (count === 4) {
                    done();
                    clearInterval(interval);
                    subscriptions.forEach(function (subscription) {
                        subscription.unsubscribe();
                    });
                }
            }, 100);
            void bus
                .subscribe('my.event.14', { ack: true }, function (event, message, channel) {
                    count++;
                    log(`received my.event.14 ${count} times`);
                    channel.ack(message);
                })
                .then((sub) => subscriptions.push(sub));

            setTimeout(function () {
                void bus.publish('my.event.14', { my: 'event' });
                void bus.publish('my.event.14', { my: 'event' });
                void bus.publish('my.event.14', { my: 'event' });
                void bus.publish('my.event.14', { my: 'event' });
            }, 100);
        });

        it('should use callback in confirm mode', function (done) {
            void confirmBus.publish('my.event.15', { my: 'event' }, function (err) {
                done(err);
            });
        });

        it('should use callback in confirm mode with options supplied', function (done) {
            void confirmBus.publish('my.event.15', { my: 'event' }, {}, function (err) {
                done(err);
            });
        });

        it('should throw error when using callback and not confirmsEnabled', function (done) {
            void bus.publish('my.event.15', { my: 'event' }, function (err) {
                should.exist(err);
                err.message.should.eql('callbacks only supported when created with bus({ enableConfirms:true })');
                done();
            });
        });

        it('should allow ack:true and autodelete:true for publishes', function (done) {
            this.timeout(10000);
            const expectation = sinon.mock();
            void bus
                .subscribe('my.event.30', { ack: true, autoDelete: true }, function () {
                    expectation();
                })
                .then((subscription) => {
                    setTimeout(function () {
                        void bus.publish('my.event.30', {});
                        subscription.unsubscribe();
                        setTimeout(function () {
                            expectation.callCount.should.eql(1);
                            void bus.destroyListener('my.event.30', { force: true }).then(() => done());
                        }, 100);
                    }, 500);
                });
        });

        it('should not receive events after successful unsubscribe', function (done) {
            let subscribed = false;
            let subscription: null | SubscribeReceipt = null;

            const unsubscribe = function () {
                subscription?.unsubscribe(function () {
                    subscribed = false;
                    void bus.publish('my.event.17', { my: 'event' });
                    setTimeout(done, 500);
                });
            };

            const handler = function () {
                if (subscribed) {
                    unsubscribe();
                } else {
                    throw new Error('unexpected invocation');
                }
            };

            void bus.subscribe('my.event.17', handler).then((sub) => (subscription = sub));
            setTimeout(function () {
                subscribed = true;
                void bus.publish('my.event.17', { my: 'event' });
            }, 100);
        });
    });
});
