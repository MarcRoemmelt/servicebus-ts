import debug from 'debug';
import util from 'util';
import { IMiddlewareOptions, Middleware, IIncomingFn, IOutgoingFn, IMessage } from '../../bus.types';

export function loggerMiddleware(options?: IMiddlewareOptions): Middleware {
    options = options || {};
    const label = options.label || 'servicebus';
    const logger = options.log || debug(label);
    // allow users to pass in leveled log libs like bunyan or pino
    // and use log.info if a leveled logger
    const log = 'info' in logger ? logger.info : logger;

    const fnIncoming =
        options.fnIncoming ||
        ((_channel, message: IMessage) => {
            log(util.format('received %j via routingKey %s', message.content, message.fields.routingKey));
        });

    const fnOutgoing =
        options.fnOutgoing ||
        ((message: IMessage, queueName: string) => {
            log(util.format('sending %j to %s', message, queueName));
        });

    const logIncoming: IIncomingFn = (channel, message, options, next) => {
        const opts = typeof options === 'function' ? null : options;
        const nextFn = typeof options === 'function' ? options : next;
        fnIncoming(channel, message, opts);
        nextFn(null, channel, message, opts);
    };

    const logOutgoing: IOutgoingFn = (queueName, message, options, next) => {
        const opts = typeof options === 'function' ? null : options;
        const nextFn = typeof options === 'function' ? options : next;

        fnOutgoing(message, queueName);
        nextFn(null, queueName, message, opts);
    };

    return {
        handleIncoming: logIncoming,
        handleOutgoing: logOutgoing,
    };
}
