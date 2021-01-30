import 'longjohn';
import { namedBus as b } from '.';
import { RabbitMQBus } from './bus/rabbitMQ/bus';

if (!process.env.RABBITMQ_URL)
    throw new Error(
        'Tests require a RABBITMQ_URL environment variable to be set, pointing to the RabbiqMQ instance you wish to use. Example url: "amqp://localhost:5672"',
    );

const busUrl = process.env.RABBITMQ_URL;

export default async function (): Promise<RabbitMQBus> {
    // const retry = require('servicebus-retry');
    const bus = await b('confirmBus', {
        url: busUrl,
        enableConfirms: true,
    });

    bus.use(bus.messageDomain());
    bus.use(bus.package());
    bus.use(bus.correlate());
    bus.use(bus.logger());
    // bus.use(
    //     retry({
    //         store: retry.MemoryStore(),
    //     }),
    // );

    return bus;
}
