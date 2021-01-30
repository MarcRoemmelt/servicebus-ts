/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { describe, it } from 'mocha';
import { RabbitMQBus } from '.';
import { bus as baseBus } from '../../..';

describe('servicebus', function () {
    describe('#close', function () {
        let bus: RabbitMQBus;

        beforeEach(async function () {
            bus = await baseBus({ prefetch: 5, url: process.env.RABBITMQ_URL });
        });

        it('should emit connection.close event', function (done) {
            bus.on('connection.close', function () {
                done();
            });

            void bus.listen('my.event.50', function () {
                void bus.close();
            });

            setTimeout(function () {
                void bus.send('my.event.50', { my: 'event' });
            }, 10);
        });

        it('should emit channel.close event', function (done) {
            bus.once('channel.close', function () {
                done();
            });

            void bus.listen('my.event.51', function () {
                void bus.close();
            });

            setTimeout(function () {
                void bus.send('my.event.51', { my: 'event' });
            }, 10);
        });
    });
});
