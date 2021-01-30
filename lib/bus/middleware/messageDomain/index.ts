// eslint-disable-next-line node/no-deprecated-api
import domain from 'domain';
import { IMiddlewareOptions, Middleware } from '../../bus.types';

export function messageDomainMiddleware(opts: IMiddlewareOptions = {}): Middleware {
    return {
        handleIncoming(channel, message, options, next) {
            const d = domain.create();

            if (opts.onError) {
                d.on('error', (err) => {
                    if (opts.onError) {
                        opts.onError(err, message, channel, d);
                    } else {
                        throw err;
                    }
                });
            }

            d.run(() => {
                if (message.properties.correlationId) {
                    d.correlationId = message.properties.correlationId;
                }

                next(null, channel, message, options);
            });
        },
    };
}
