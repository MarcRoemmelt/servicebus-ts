import { EventEmitter } from 'events';
import { Channel } from 'amqplib';
import readableId from 'readable-id-mjs';
import { correlateMiddleware } from '../middleware/correlate';
import { messageDomainMiddleware } from '../middleware/messageDomain';
import { loggerMiddleware } from '../middleware/logger';
import { packageMiddleware } from '../middleware/package';
import {
    IIncomingFn,
    IIncomingNextFn,
    IMessage,
    IOptions,
    IOutgoingFn,
    IOutgoingNextFn,
    Middleware,
} from '../bus.types';

export class Bus extends EventEmitter {
    incomingMiddleware: IIncomingFn[] = [];
    outgoingMiddleware: IOutgoingFn[] = [];

    constructor() {
        super();
        this.setMaxListeners(Infinity);
    }

    public use(middleware: Middleware): Bus {
        if (middleware.handleIncoming) this.incomingMiddleware.push(middleware.handleIncoming);
        if (middleware.handleOutgoing) this.outgoingMiddleware.push(middleware.handleOutgoing);
        return this;
    }

    public handleIncoming(
        channel: Channel,
        message: IMessage,
        options: Record<string, any>,
        callback: (err: null | Error, channel?: Channel, message?: IMessage, options?) => void,
    ): any {
        let index = this.incomingMiddleware.length - 1;

        const nextFn: IIncomingNextFn = (
            err: null | Error,
            channel?: Channel,
            message?: IMessage,
            options?: IOptions | null,
        ): void => {
            if (err) return callback(err);

            const currentMiddleware = this.incomingMiddleware[index];

            index = index - 1;

            if (undefined === currentMiddleware) {
                return callback(null, channel, message, options);
            } else {
                return currentMiddleware(channel!, message!, options!, nextFn);
            }
        };

        return nextFn(null, channel, message, options, callback);
    }

    public handleOutgoing(
        queueName: string,
        message: Record<string, any>,
        options: Record<string, any>,
        callback: (...args: any[]) => void,
    ): any {
        let index = 0;

        const next: IOutgoingNextFn = (
            err: null | Error,
            queueName?: string,
            message?: Record<string, any>,
            options?: IOptions | null,
        ) => {
            if (err) return callback(err);

            const currentMiddleware = this.outgoingMiddleware[index];

            index++;

            if (undefined === currentMiddleware) {
                return callback(queueName, message, options);
            } else {
                return currentMiddleware(queueName!, message!, options!, next);
            }
        };

        return next(null, queueName, message, options);
    }

    public createCorrelationId(forceNew?: boolean): string {
        if (process.domain && process.domain.correlationId && !forceNew) {
            return process.domain.correlationId;
        }
        return readableId();
    }
    public correlate = correlateMiddleware;
    public messageDomain = messageDomainMiddleware;
    public logger = loggerMiddleware;
    public package = packageMiddleware;
}
