import amqp, { Channel, Replies } from 'amqplib';
import util from 'util';
import { Bus } from '../../Bus';
import { Correlator } from '../correlator';
import debug from 'debug';
import { EventEmitter } from 'events';
import * as json from '../../formatters/json';
import { PubSubQueue } from '../pubsubQueue';
import querystring from 'querystring';
import { Queue } from '../queue';
import { IRabbitMQBusOptions } from '../types';
import { IMessage, IPubSubQueueOptions } from '../../bus.types';
import { getRabbitMQUrl } from '../getRabbitMQUrl';

const log = debug('servicebus');

export class SubscribeReceipt extends EventEmitter {
    unsubscribe: any;
    constructor(unsubscribe: (...args: any[]) => void) {
        super();
        this.unsubscribe = unsubscribe;
    }
}

interface IDestroyListenerOptions {
    force?: boolean;
}

export class RabbitMQBus extends Bus {
    assertQueuesOnFirstSend: any;
    channels: Channel[];
    correlator: any;
    delayOnStartup: any;
    exchangeName: any;
    exchangeOptions: any;
    formatter: any;
    initialized: boolean;
    log: any;
    prefetch: any;
    pubsubqueues: { [key: string]: PubSubQueue } = {};
    queues: { [key: string]: Queue } = {};
    queuesFile: any;
    connection?: amqp.Connection;
    sendChannel!: amqp.Channel;
    confirmChannel?: amqp.ConfirmChannel;
    listenChannel!: amqp.Channel;

    constructor(options: IRabbitMQBusOptions) {
        super();

        options = options || {};
        options.url = getRabbitMQUrl(options);
        options.vhost = options.vhost || process.env.RABBITMQ_VHOST;
        options.exchangeName = options.exchangeName || 'amq.topic';

        this.assertQueuesOnFirstSend =
            options.assertQueuesOnFirstSend === undefined ? true : options.assertQueuesOnFirstSend;
        this.channels = [];
        this.correlator = options.correlator || new Correlator(options);
        this.delayOnStartup = options.delayOnStartup || 10;
        this.exchangeName = options.exchangeName;
        this.exchangeOptions = options.exchangeOptions || {};
        this.formatter = json;
        this.initialized = false;
        this.log = options.log || log;
        this.prefetch = options.prefetch;
        this.pubsubqueues = {};
        this.queues = {};
        this.queuesFile = options.queuesFile;
    }

    static async create(options: IRabbitMQBusOptions, implOpts?: Record<string, any>): Promise<RabbitMQBus> {
        const bus = new RabbitMQBus(options);
        await bus.connectRabbitMQ(options, implOpts);
        return bus;
    }

    private async connectRabbitMQ(options: IRabbitMQBusOptions, implOpts) {
        try {
            const vhost = options.vhost && util.format('/%s', querystring.escape(options.vhost));
            const url = vhost ? util.format('%s%s', options.url, vhost) : options.url!;
            this.log('connecting to rabbitmq on %s', url);
            this.connection = await amqp.connect(url, implOpts);

            const channelError = (err: Error) => {
                this.log('channel error with connection %s error: %s', options.url, err.toString());
                this.emit('error', err);
            };

            this.connection.on('close', this.emit.bind(this, 'connection.close'));
            this.connection.on('error', this.emit.bind(this, 'connection.error'));

            this.sendChannel = await this.connection.createChannel();
            this.sendChannel.on('error', channelError);
            this.sendChannel.on('close', this.emit.bind(this, 'channel.close'));

            if (options.prefetch) {
                await this.sendChannel.prefetch(options.prefetch);
            }
            this.channels.push(this.sendChannel);

            this.listenChannel = await this.connection.createChannel();

            this.listenChannel.on('error', channelError);
            this.listenChannel.on('close', this.emit.bind(this, 'channel.close'));
            if (options.prefetch) {
                await this.listenChannel.prefetch(options.prefetch);
            }
            this.channels.push(this.listenChannel);

            if (options.enableConfirms) {
                this.confirmChannel = await this.connection.createConfirmChannel();
                this.confirmChannel.on('error', channelError);
                this.confirmChannel.on('close', this.emit.bind(this, 'channel.close'));

                if (options.prefetch) {
                    await this.confirmChannel.prefetch(options.prefetch);
                }
                this.channels.push(this.confirmChannel);
            }

            this.initialized = true;
            this.log('connected to rabbitmq on %s', url);
            this.emit('ready');
        } catch (err) {
            this.log('error connecting to rabbitmq: %s', err);
            this.emit('error', err);
        }
    }

    public async listen(
        queueName: string,
        opts: Partial<IPubSubQueueOptions> | ((content: IMessage['content'], message: IMessage) => void),
        cb?: (content: IMessage['content'], message: IMessage, channel: Channel) => void,
    ): Promise<void> {
        this.log('listen on queue %j', queueName);
        const options = typeof opts === 'function' ? {} : opts;
        const callback = (typeof opts === 'function' ? opts : cb) as (
            content: IMessage['content'],
            message: IMessage,
        ) => void;

        if (!this.initialized) {
            this.on('ready', () => void this.listen.bind(this, queueName, options, callback));
            return;
        }

        const fullOptions = this.setOptions(queueName, options);

        if (this.queues[fullOptions.queueName] === undefined) {
            this.log('creating queue %s', fullOptions.queueName);
            const queue = await Queue.create(fullOptions);
            queue.on('listening', () => {
                this.emit('listening', queue);
            });
            this.queues[fullOptions.queueName] = queue;
        }

        await this.queues[fullOptions.queueName].listen(callback, fullOptions);
    }

    public async unlisten(queueName: string): Promise<void> {
        if (this.queues[queueName] === undefined) {
            throw new Error(util.format('no queue currently listening at %s', queueName));
        } else {
            await this.queues[queueName].unlisten();
            delete this.queues[queueName];
        }
    }

    public async destroyListener(queueName: string, options: Partial<IDestroyListenerOptions> = {}): Promise<void> {
        if (!options.force && this.queues[queueName] === undefined) {
            throw new Error(util.format('no queue currently listening at %s', queueName));
        } else {
            const q = this.queues[queueName];
            if (!q && options.force) {
                await this.listenChannel.deleteQueue(queueName, { ifEmpty: false });
                return;
            }
            delete this.queues[queueName];
            await q.destroy();
        }
    }

    public setOptions(
        queueName: Record<string, any> | string,
        options: Partial<IPubSubQueueOptions>,
    ): IPubSubQueueOptions {
        const opts = options as IPubSubQueueOptions;
        if (typeof queueName === 'object') {
            Object.assign(opts, { queueName: queueName.queueName, routingKey: queueName.routingKey });
        } else {
            Object.assign(opts, { queueName: queueName });
        }

        Object.assign(opts, {
            assertQueue: this.assertQueuesOnFirstSend,
            bus: this,
            confirmChannel: this.confirmChannel,
            correlator: this.correlator,
            exchangeName: this.exchangeName,
            exchangeOptions: this.exchangeOptions,
            formatter: this.formatter,
            listenChannel: this.listenChannel,
            log: this.log,
            queuesFile: this.queuesFile,
            sendChannel: this.sendChannel,
        });
        return opts;
    }

    public async send(
        queueName: string,
        message: Record<string, any>,
        opts: Record<string, any> | ((err: any, ok?: Replies.Empty) => void) = {},
        cb?: (err: any, ok?: Replies.Empty) => void,
    ): Promise<void> {
        const options = typeof opts === 'function' ? {} : opts;
        const callback = (typeof opts === 'function' ? opts : cb) as (err: any, ok?: Replies.Empty) => void;

        if (!this.initialized) {
            return new Promise((r) => {
                this.on(
                    'ready',
                    () => void this.send.call(this, queueName, message, options, callback).then(() => r()),
                );
            });
        }

        if (callback && !this.confirmChannel)
            return callback(new Error('callbacks only supported when created with bus({ enableConfirms:true })'));

        const fullOptions = this.setOptions(queueName, options);

        const key = this.confirmChannel && callback ? fullOptions.queueName + '.confirm' : fullOptions.queueName;

        if (this.queues[key] === undefined) {
            this.queues[key] = await Queue.create(fullOptions);
        }

        return new Promise((r) => {
            this.handleOutgoing(fullOptions.queueName, message, fullOptions, (queueName, message, fullOptions) => {
                this.queues[key].send(message, fullOptions, callback);
                r();
            });
        });
    }

    public async subscribe(
        queueName: string,
        opts: Partial<IPubSubQueueOptions> | ((...args: any[]) => void),
        cb?: (content: IMessage['content'], message: IMessage, channel: Channel) => void,
    ): Promise<SubscribeReceipt> {
        const options = typeof opts === 'function' ? {} : opts;
        const callback = (typeof opts === 'function' ? opts : cb) as (...args: any[]) => void;

        this.log('subscribe on queue %j', queueName);

        let handle: null | SubscribeReceipt = null;
        function _unsubscribe(options) {
            handle && handle.unsubscribe(options);
        }

        if (!this.initialized) {
            return new Promise((r) => {
                this.on('ready', () => {
                    void this.subscribe.call(this, queueName, options, callback).then(r);
                });
            });
        }

        const fullOptions = this.setOptions(queueName, options);

        if (this.pubsubqueues[fullOptions.queueName] === undefined) {
            this.log('creating pusubqueue %s', fullOptions.queueName);
            const pubSubQueue = await PubSubQueue.create(fullOptions);
            pubSubQueue.on('subscribed', () => {
                this.emit('subscribed', pubSubQueue);
            });
            this.pubsubqueues[fullOptions.queueName] = pubSubQueue;
        }

        handle = this.pubsubqueues[fullOptions.queueName].subscribe(fullOptions, callback);

        const receipt = new SubscribeReceipt(_unsubscribe);

        handle.on('subscribed', () => {
            receipt.emit('subscribed');
        });

        return receipt;
    }

    public async publish(
        queueName: string,
        message: Record<string, any>,
        opts: Partial<IPubSubQueueOptions> | ((...args: any[]) => void) = {},
        callback?: (err: any, ok: Replies.Empty) => void,
    ): Promise<void> {
        const cb = (typeof opts === 'function' ? opts : callback) as (...args: any[]) => void;
        const options = typeof opts === 'function' ? {} : opts;

        if (!this.initialized) {
            return new Promise((r) => {
                this.on('ready', () => void this.publish.call(this, queueName, message, options, cb).then(() => r()));
            });
        }

        if (cb && !this.confirmChannel)
            return cb(new Error('callbacks only supported when created with bus({ enableConfirms:true })'));

        const fullOptions = this.setOptions(queueName, options);

        const key = this.confirmChannel && cb ? fullOptions.queueName + '.confirm' : fullOptions.queueName;

        if (this.pubsubqueues[key] === undefined) {
            this.log('creating pusubqueue %s', fullOptions.queueName);
            this.pubsubqueues[key] = await PubSubQueue.create(fullOptions);
        }

        return new Promise((r) => {
            this.handleOutgoing(fullOptions.queueName, message, fullOptions, (queueName, message, fullOptions) => {
                this.pubsubqueues[key].publish(message, fullOptions, cb);
                r();
            });
        });
    }

    public async close(): Promise<void> {
        this.log('closing channels and connection');
        await Promise.all(this.channels.map((channel) => channel.close()));
        await this.connection?.close();
    }
}
