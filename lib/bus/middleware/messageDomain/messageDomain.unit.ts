import { describe, it } from 'mocha';
import { should, expect } from 'chai';
import b from '../../../bus-shim';
import { bus as baseBus } from '../../..';
import { RabbitMQBus } from 'lib/bus/rabbitMQ/bus';
should();
// the following code is being use in the above shim
// var domain = require('../../bus/middleware/domain');

// bus.use(domain());

describe('messageDomain', function () {
    let bus: RabbitMQBus;
    let domainBus: RabbitMQBus;
    before(async () => {
        bus = await b();
        const busUrl = process.env.RABBITMQ_URL;
        domainBus = await baseBus({ url: busUrl });
    });

    it('should process incoming message in new domain', function (done) {
        void bus.listen('my.message.domain.1', function () {
            process.domain.should.have.property('domain');
            done();
        });
        setTimeout(function () {
            void bus.send('my.message.domain.1', { my: 'message' });
        }, 10);
    });

    it('should cause a provided correlationId property to be added to current domain', function (done) {
        this.timeout(10000);
        void bus.listen('my.message.domain.2', function () {
            expect(process.domain.correlationId).to.eql('test-value');
            done();
        });
        setTimeout(function () {
            void bus.send('my.message.domain.2', { my: 'message' }, { correlationId: 'test-value' });
        }, 10);
    });

    /* TODO: determine which resources are being shared between buses and fix the following to work with all tests, in addition to by itself (which it is now) */
    it('should catch errors with domains when onError supplied', function (done) {
        function onError(err: Error) {
            expect(err.message).to.eql('domain error');
            done();
        }

        domainBus.use(
            domainBus.messageDomain({
                onError: onError,
            }),
        );

        void domainBus.listen('my.message.domain.3', function () {
            throw new Error('domain error');
        });
        setTimeout(function () {
            void domainBus.send('my.message.domain.3', { my: 'message' });
        });
    });
});
