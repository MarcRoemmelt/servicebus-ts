import { v1 } from 'uuid';
import { Middleware } from '../../bus.types';

export function correlateMiddleware(): Middleware {
    return {
        handleOutgoing(queueName, message, options, next) {
            if (!message.cid) {
                message.cid = v1();
            }

            next(null, queueName, message, options);
        },
    };
}
