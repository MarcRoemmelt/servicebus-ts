/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it } from 'mocha';
import sinon from 'sinon';
import chai from 'chai';
import debug from 'debug';
import b from '../../../bus-shim';
import cb from '../../../bus-confirm-shim';
import { RabbitMQBus } from '../bus';
const log = debug('servicebus:test');
const should = chai.should();

describe('servicebus', function () {
    let bus: RabbitMQBus;
    let confirmBus: RabbitMQBus;

    before(async () => {
        bus = await b();
        confirmBus = await cb();
    });

    describe('#send & #listen', function () {
        it('should cause message to be received by listen', function (done) {
            void bus.listen('my.event.1', function () {
                done();
            });
            setTimeout(function () {
                void bus.send('my.event.1', { my: 'event' });
            }, 10);
        });

        it('should distribute out to subsequent listeners when multiple listening', function (done) {
            let count = 0;
            function tryDone() {
                count++;
                if (count === 4) {
                    done();
                }
            }
            void bus.listen('my.event.2', function () {
                tryDone();
            });
            void bus.listen('my.event.2', function () {
                tryDone();
            });
            void bus.listen('my.event.2', function () {
                tryDone();
            });
            void bus.listen('my.event.2', function () {
                tryDone();
            });
            setTimeout(function () {
                void bus.send('my.event.2', { my: 'event' });
                void bus.send('my.event.2', { my: 'event' });
                void bus.send('my.event.2', { my: 'event' });
                void bus.send('my.event.2', { my: 'event' });
            }, 10);
        });

        it('can handle high event throughput', function (done) {
            this.timeout(30000);
            let count = 0;
            const endCount = 15000;
            function tryDone() {
                count++;
                if (count > endCount) {
                    done();
                }
            }
            void bus.listen('my.event.3', function () {
                tryDone();
            });
            setTimeout(function () {
                for (let i = 0; i <= endCount; ++i) {
                    void bus.send('my.event.3', { my: 'event' });
                }
            }, 100);
        });

        it('sends subsequent messages only after previous messages are acknowledged', function (done) {
            this.timeout(5000);
            let count = 0;
            const interval = setInterval(function checkDone() {
                if (count === 4) {
                    clearInterval(interval);
                    void bus.destroyListener('my.event.4').then(() => done());
                }
            }, 10);
            void bus.listen('my.event.4', { ack: true }, function (content, message, channel) {
                count++;
                channel.ack(message);
            });
            setTimeout(function () {
                void bus.send('my.event.4', { my: Math.random() }, { ack: true });
                void bus.send('my.event.4', { my: Math.random() }, { ack: true });
                void bus.send('my.event.4', { my: Math.random() }, { ack: true });
                void bus.send('my.event.4', { my: Math.random() }, { ack: true });
            }, 100);
        });

        it('should use callback in confirm mode', function (done) {
            void confirmBus.send('my.event.19', { my: 'event' }, {}, function (err) {
                done(err);
            });
        });

        it('should use callback in confirm mode with options supplied', function (done) {
            void confirmBus.send('my.event.19', { my: 'event' }, function (err) {
                done(err);
            });
        });

        it('should throw error when using callback and not confirmsEnabled', function (done) {
            void bus.send('my.event.15', { my: 'event' }, function (err) {
                should.exist(err);
                err.message.should.eql('callbacks only supported when created with bus({ enableConfirms:true })');
                done();
            });
        });

        it('should allow ack:true and autodelete:true for sends', function (done) {
            const expectation = sinon.mock();
            void bus.listen('my.event.25', { ack: true, autoDelete: true }, function () {
                expectation();
            });
            setTimeout(function () {
                void bus.send('my.event.25', {}, { ack: true });
                setTimeout(function () {
                    void bus.unlisten('my.event.25').then(() =>
                        setTimeout(function () {
                            expectation.callCount.should.eql(1);
                            void bus.destroyListener('my.event.25', { force: true }).then(() => done());
                        }, 100),
                    );
                }, 100);
            }, 100);
        });
    });

    describe('#unlisten', function () {
        it('should cause message to not be received by listen', function (done) {
            let completed = false;
            function tryDone(err?: Error) {
                if (err) return log(err);
                if (completed) return true;
                completed = true;
                done();
            }
            void bus
                .listen('my.event.17', function () {
                    tryDone(new Error('should not receive events after unlisten'));
                })
                .then(() => void bus.unlisten('my.event.17'))
                .then(() => {
                    void bus.send('my.event.17', { test: 'data' });
                    setTimeout(function () {
                        tryDone();
                    }, 100);
                });
        });
    });

    describe('#destroyListener', function () {
        it('should cause message to not be received by listen', function (done) {
            let completed = false;
            function tryDone(err?: Error) {
                if (err) return log(err);
                if (completed) return true;
                completed = true;
                done();
            }
            void bus
                .listen('my.event.18', { ack: true }, function (content, message, channel) {
                    channel.ack(message);
                    tryDone(new Error('should not receive events after destroy'));
                })
                .then(() => bus.destroyListener('my.event.18'))
                .then(() => {
                    void bus.send('my.event.18', { test: 'data' }, { ack: true, expiration: 100 });
                    setTimeout(tryDone, 100);
                });
        });
    });
});
