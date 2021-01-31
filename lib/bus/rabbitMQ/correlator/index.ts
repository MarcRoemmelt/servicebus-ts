import cluster from 'cluster';
import fs from 'fs';
import { v1 as newId } from 'uuid';
import path from 'path';
import util from 'util';
import debug from 'debug';
import { EventEmitter } from 'events';
import { IRabbitMQBusOptions } from '../types';
import { IPubSubQueueOptions } from '../../bus.types';
const warn = debug('servicebus:warn');

export class Correlator extends EventEmitter {
    initialized = false;
    queues = {};
    filename: string;

    constructor(options: IRabbitMQBusOptions) {
        super();
        // note: if you want to cluster servicebus, provide a 'queuesfile' option param when calling .bus(options). you'll likely do a mod of the cluster.worker.id in your cluster.js file when you call fork();
        if (cluster.isWorker && options.queuesFile === undefined)
            warn(
                "Warning, to use subscriptions in a clustered app, you should specify a queuesFile option when calling .bus(options). You may want to provide something like util.format('.queues.worker.%s', (cluster.worker.id % cluster.workers.length)).",
            );

        this.filename =
            options && options.queuesFile
                ? path.join(process.cwd(), options.queuesFile)
                : cluster.isWorker
                ? path.join(process.cwd(), util.format('.queues.worker.%s', cluster.worker.id))
                : path.join(process.cwd(), '.queues');

        fs.readFile(this.filename, (err, buf) => {
            if (err) {
                this.queues = {};
                this.initialized = true;
                this.emit('ready');
                return;
            }
            try {
                this.queues = JSON.parse(buf.toString());
            } catch (error) {
                this.queues = {};
            }
            this.initialized = true;
            this.emit('ready');
        });
    }

    public async queueName(options: IPubSubQueueOptions): Promise<string> {
        let result;

        if (this.queues.hasOwnProperty(options.queueName)) {
            result = this.queues[options.queueName];
        } else if (options.routingKey) {
            result = options.queueName;
        } else {
            result = util.format('%s.%s', options.queueName, newId());
            this.queues[options.queueName] = result;
        }

        await this.persistQueueFile();
        return result;
    }

    public async persistQueueFile(): Promise<void> {
        return new Promise((r) => {
            const contents = JSON.stringify(this.queues);
            fs.writeFile(this.filename, contents, () => r());
        });
    }
}
