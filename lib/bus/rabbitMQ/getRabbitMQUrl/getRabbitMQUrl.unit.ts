import { describe } from 'mocha';
import { expect } from 'chai';
import { getRabbitMQUrl } from './index';

describe('getRabbitMQUrl', function () {
    it('determines url based on options available', function () {
        const temp = process.env.RABBITMQ_URL;
        process.env.RABBITMQ_URL = '';
        let url = getRabbitMQUrl({ url: 'amqp://rabbitmq:5672' });
        expect(url).to.eql('amqp://rabbitmq:5672');

        url = getRabbitMQUrl({ user: 'pat', password: 'test1234' });
        expect(url).to.eql('amqp://pat:test1234@localhost:5672');

        url = getRabbitMQUrl({ user: 'pat', password: 'test1234', host: 'myhost', port: 5555 });
        expect(url).to.eql('amqp://pat:test1234@myhost:5555');
        process.env.RABBITMQ_URL = temp;
    });
});
