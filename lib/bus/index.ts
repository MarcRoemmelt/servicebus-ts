import { RabbitMQBus } from './rabbitMQ/bus';
import { IRabbitMQBusOptions } from './rabbitMQ/types';

export function bus(options: IRabbitMQBusOptions, implOpts?: Record<string, any>): Promise<RabbitMQBus> {
    return RabbitMQBus.create(options, implOpts);
}

const namedBuses = {};

export async function namedBus(
    name: string,
    options: IRabbitMQBusOptions,
    implOpts?: Record<string, any>,
): Promise<RabbitMQBus> {
    const bus = namedBuses[name] || (await RabbitMQBus.create(options, implOpts));
    namedBuses[name] = bus;
    return bus;
}
