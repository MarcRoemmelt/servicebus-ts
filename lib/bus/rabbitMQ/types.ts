import { Debugger } from 'debug';
import { Correlator } from './correlator';

export interface IRabbitMQBusOptions {
    filename?: string;
    queuesFile?: string;
    user?: string;
    password?: string;
    host?: string;
    port?: number;
    vhost?: string;
    url?: string;
    assertQueuesOnFirstSend?: boolean;
    exchangeName?: string;
    correlator?: Correlator;
    delayOnStartup?: number;
    log?: Debugger;
    prefetch?: number;
    enableConfirms?: boolean;
    exchangeOptions?: {
        type: 'topic';
        durable: boolean;
        autoDelete: boolean;
    };
}
