import { Channel, ConfirmChannel, ConsumeMessage, Options } from 'amqplib';
import { RabbitMQBus } from './rabbitMQ/bus';

export type IMessage = ConsumeMessage & {
    content: Record<string, any>;
};
export type IOptions = Record<string, any>;

export interface IIncomingNextFn {
    (error: Error): void;
    (error: null | Error, channel: Channel, message: IMessage, options: IOptions | null): void;
    (
        error: null | Error,
        channel: Channel,
        message: IMessage,
        options: IOptions | null,
        callback: (...args: any[]) => void,
    ): void;
}
export interface IOutgoingNextFn {
    (error: Error): void;
    (error: null | Error, queueName: string, message: Record<string, any>, options: IOptions | null): void;
    (
        error: null | Error,
        queueName: string,
        message: Record<string, any>,
        options: IOptions | null,
        callback: (...args: any[]) => void,
    ): void;
}

export type IMiddlewareOptions = Partial<{
    [key: string]: any;
    fnIncoming: any;
    fnOutgoing: any;
    log?: Record<string, any>;
    label: string;
}>;

export interface IIncomingFn {
    (channel: Channel, message: IMessage, options: IOptions, next: IIncomingNextFn): void;
}
export interface IOutgoingFn {
    (queueName: string, message: Record<string, any>, options: IOptions, next: IOutgoingNextFn): void;
}

export interface Middleware {
    handleIncoming?: IIncomingFn;
    handleOutgoing?: IOutgoingFn;
}

export type IQueueOptions = {
    queueName: string;
    queueType: 'queue' | 'pubsubqueue';
    contentType: any;
    persistent: boolean;
    ack?: boolean;
    acknowledge?: boolean;
    formatter: {
        deserialize: (val: string) => any;
        serialize: (val: any) => string;
    };
    publish: Options.Publish;
    autoDelete?: boolean;
    queueOptions?: any;
    exclusive?: boolean;
    bus: RabbitMQBus;
    assertQueue?: boolean;
    confirmChannel: ConfirmChannel;
    listenChannel: Channel;
    sendChannel: Channel;
    log: any;
    maxRetries?: number;
    routingKey: string;
    autoDeleteErrorQueue?: boolean;
};

export interface IPubSubQueueOptions extends IQueueOptions {
    exchangeOptions: {
        type: 'topic';
        durable: boolean;
        autoDelete: boolean;
    };
    exchangeName: string;
    correlator: any;
}
