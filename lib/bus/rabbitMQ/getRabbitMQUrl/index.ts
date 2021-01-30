import debug from 'debug';
import util from 'util';
import { IRabbitMQBusOptions } from '../types';

const log = debug('servicebus');

export function getRabbitMQUrl(options: IRabbitMQBusOptions): string {
    let rabbitUrl = options.url || process.env.RABBITMQ_URL;
    if (!rabbitUrl) {
        // see if url can be built with user and password
        if (options.user && options.password) {
            const auth = util.format('%s:%s', options.user, options.password);
            const host = options.host || 'localhost';
            const port = options.port || 5672;
            log('Creating RabbitMQ URL %s@%s:%s', options.user, host, port);
            rabbitUrl = util.format('amqp://%s@%s:%s', auth, host, port);
        } else {
            log('RabbitMQ URL could not be determined. Using default amqp://localhost');
            rabbitUrl = 'amqp://localhost';
        }
    }
    return rabbitUrl;
}
