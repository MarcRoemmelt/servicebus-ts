import { describe, it } from 'mocha';
import { should } from 'chai';
import b from '../../../bus-shim';
import { RabbitMQBus } from 'lib/bus/rabbitMQ/bus';
should();
// the following code is being use in the above shim
// var correlate = require('../../bus/middleware/correlate');

// bus.use(correlate());

describe('correlate', function () {
    let bus: RabbitMQBus;
    before(async () => {
        bus = await b();
    });

    it('should cause a unique cid property to be added to an outgoing message', function (done) {
        void bus.listen('my.message.11', function (content) {
            content.should.have.property('cid'); // message.data will have it since we're using both correlate and package in our tests
            done();
        });
        setTimeout(function () {
            void bus.send('my.message.11', { my: 'message' });
        }, 100);
    });
});
