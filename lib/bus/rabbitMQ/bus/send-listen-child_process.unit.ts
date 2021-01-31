import { describe, it } from 'mocha';
import { expect } from 'chai';
import cp from 'child_process';
import b from '../../../bus-shim';
import { RabbitMQBus } from '.';

describe('servicebus (child_processes)', function () {
    describe('#send & #listen', function () {
        let bus: RabbitMQBus;

        before(async () => {
            bus = await b();
        });

        it('should cause message to be received by listen', function (done) {
            this.timeout(15000);
            let count = 0;
            function tryDone() {
                count++;
                if (count === 1) {
                    done();
                    sender.kill();
                }
            }

            void bus.listen('event.22', function (content) {
                expect(content.data).to.eql({ msg: 'from-child' });
                tryDone();
            });

            const sender = cp.exec(`node ./node_modules/.bin/ts-node ${__dirname}/child_process-shim.ts`);
        });
    });
});
