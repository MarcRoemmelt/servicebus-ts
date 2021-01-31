import 'longjohn';
import { bus as b } from '.';
import { MemoryStore, retryMiddleware } from './bus/middleware/retry';
import { RabbitMQBus } from './bus/rabbitMQ/bus';

if (!process.env.RABBITMQ_URL)
    throw new Error(
        'Tests require a RABBITMQ_URL environment variable to be set, pointing to the RabbiqMQ instance you wish to use. Example url: "amqp://localhost:5672"',
    );

const busUrl = process.env.RABBITMQ_URL;
let bus: RabbitMQBus;
export default async function (): Promise<RabbitMQBus> {
    if (!bus) {
        bus = await b({
            prefetch: 5,
            url: busUrl,
        });

        bus.use(bus.messageDomain());
        bus.use(bus.package());
        bus.use(bus.correlate());
        bus.use(bus.logger());
        bus.use(
            retryMiddleware({
                store: new MemoryStore(),
            }),
        );
    }
    return bus;
}
