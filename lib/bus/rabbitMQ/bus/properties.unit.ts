/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it } from 'mocha';
import { expect } from 'chai';
import b from '../../../bus-shim';
import { bus as bb } from '../../..';
import { RabbitMQBus } from '.';

// the following code is being used in the above shim
// var pack = require('../../bus/middleware/package');

// bus.use(pack());

describe('properties', function () {
    let bus: RabbitMQBus;
    let baseBus: RabbitMQBus;
    before(async () => {
        bus = await b();

        const busUrl = process.env.RABBITMQ_URL;

        baseBus = await bb({
            prefetch: 5,
            url: busUrl,
        });
    });

    it('should add a properties property in message if an options is passed as third argument in producers', function (done) {
        void bus.listen('my.message.props.1', function (msg, message) {
            message.should.have.property('properties');
            expect(message.properties.correlationId).to.eql('test-value');
            done();
        });
        setTimeout(() => {
            void bus.send('my.message.props.1', { my: 'message' }, { correlationId: 'test-value' });
        }, 1000);
    });

    it('should add a headers property in message if an options is passed as third argument in producers', function (done) {
        void bus.listen('my.message.props.2', function (msg, message) {
            message.should.have.property('properties');
            message.properties.should.have.property('headers');
            expect(message.properties.headers.audit).to.eql('value');
            done();
        });
        setTimeout(() => {
            void bus.send(
                'my.message.props.2',
                { my: 'message' },
                { headers: { audit: 'value', sub: { doc: 'ument' } } },
            );
        }, 1000);
    });

    it('should have access to properties and headers in middleware', function (done) {
        if (!process.env.RABBITMQ_URL)
            throw new Error(
                'Tests require a RABBITMQ_URL environment variable to be set, pointing to the RabbiqMQ instance you wish to use. Example url: "amqp://localhost:5672"',
            );

        baseBus.use({
            handleOutgoing(queueName, event, options) {
                options.should.have.property('headers');
                expect(options.headers.audit).to.eql('value');
                done();
            },
        });

        setTimeout(() => {
            void baseBus.send(
                'my.message.props.3',
                { my: 'message' },
                { headers: { audit: 'value', sub: { doc: 'ument' } } },
            );
        }, 1000);
    });
});
