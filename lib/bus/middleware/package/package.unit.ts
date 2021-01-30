import { describe, it } from 'mocha';
import { should } from 'chai';
import b from '../../../bus-shim';
import { RabbitMQBus } from 'lib/bus/rabbitMQ/bus';
should();

// the following code is being used in the above shim
// var pack = require('../../bus/middleware/package');

// bus.use(pack());

describe('package', function () {
    let bus: RabbitMQBus;
    before(async () => {
        bus = await b();
    });

    it('should repackage message into data property and provide a datetime and type property equal to the queue name', function (done) {
        void bus.listen('my.message.type', (message) => {
            message.should.have.property('data');
            message.should.have.property('datetime');
            message.should.have.property('type', 'my.message.type');
            done();
        });
        setTimeout(function () {
            void bus.send('my.message.type', { my: 'message' });
        }, 100);
    });
});
