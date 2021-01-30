import { IIncomingFn, IOutgoingFn, Middleware } from '../../bus.types';

const packageMessage: IOutgoingFn = (queueName, message, options, next) => {
    const opts = typeof options === 'function' ? null : options;
    const nextFn = typeof options === 'function' ? options : next;

    const newMessage = {
        data: message,
        datetime: message.datetime || new Date().toUTCString(),
        type: message.type || queueName,
    };

    nextFn(null, queueName, newMessage, opts);
};

const handleIncoming: IIncomingFn = (channel, message, options, next) => {
    message.content.type = message.properties.type || message.content.type;
    next(null, channel, message, options);
};

export function packageMiddleware(): Middleware {
    return {
        handleOutgoing: packageMessage,
        handleIncoming: handleIncoming,
    };
}
