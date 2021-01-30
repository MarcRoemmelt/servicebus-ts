import { Channel, ConfirmChannel, Replies } from 'amqplib';
import { EventEmitter } from 'events';
import { IMessage, IQueueOptions } from '../../bus.types';
import { RabbitMQBus } from '../bus';

export class Queue extends EventEmitter {
    ack: any;
    assertQueue: any;
    bus: RabbitMQBus;
    confirmChannel: ConfirmChannel;
    errorQueueName: string;
    formatter: any;
    initialized: boolean;
    listening: boolean;
    listenChannel: Channel;
    log: any;
    maxRetries: any;
    queueName: any;
    queueOptions: any;
    routingKey: any;
    subscription?: { consumerTag: string };
    sendChannel: Channel;
    contentType: any;

    constructor(options: IQueueOptions) {
        super();
        options = options || {};
        const queueOptions = options.queueOptions || {};

        Object.assign(queueOptions, {
            autoDelete: options.autoDelete === undefined ? !(options.ack || options.acknowledge) : options.autoDelete,
            contentType: options.contentType || 'application/json',
            durable: Boolean(options.ack || options.acknowledge),
            exclusive: options.exclusive || false,
            persistent: Boolean(options.ack || options.acknowledge || options.persistent),
        });

        this.ack = options.ack || options.acknowledge;
        this.assertQueue = options.assertQueue === undefined ? true : options.assertQueue;
        this.bus = options.bus;
        this.confirmChannel = options.confirmChannel;
        this.errorQueueName = options.queueName + '.error';
        this.formatter = options.formatter;
        this.initialized = false;
        this.listening = false;
        this.listenChannel = options.listenChannel;
        this.log = options.log;
        this.maxRetries = options.maxRetries || 3;
        this.queueName = options.queueName;
        this.queueOptions = queueOptions;
        this.routingKey = options.routingKey;
        this.sendChannel = options.sendChannel;

        this.setMaxListeners(Infinity);
        this.log('asserting queue %s', this.queueName);
    }

    static async create(options: IQueueOptions): Promise<Queue> {
        const queue = new Queue(options);
        await queue.assertRabbitMQQueue(options);
        return queue;
    }

    private async assertRabbitMQQueue(options: IQueueOptions) {
        if (!this.assertQueue) {
            this.initialized = true;
            this.emit('ready');
            return;
        }
        try {
            await this.listenChannel.assertQueue(this.queueName, this.queueOptions);

            if (this.ack) {
                this.log('asserting error queue %s', this.errorQueueName);
                Object.assign(this.queueOptions, {
                    autoDelete: options.autoDeleteErrorQueue || false,
                });
                return this.listenChannel.assertQueue(this.errorQueueName, this.queueOptions).then((_qok) => {
                    this.initialized = true;
                    this.emit('ready');
                    return _qok;
                });
            } else {
                this.initialized = true;
                this.emit('ready');
                return this;
            }
        } catch (err) {
            this.log(
                'error connecting to queue %s. error: %s',
                options.queueName,
                err instanceof Error ? err.toString() : err,
            );
            this.emit('error', err);
        }
    }

    public async listen(
        callback: (content: Record<string, any>, message: IMessage, channel: Channel) => void,
        options: IQueueOptions,
    ): Promise<void> {
        options = options || {};

        this.log('listening to queue %j', this.queueName);

        if (!this.initialized) {
            this.on('ready', () => void this.listen.call(this, callback, options));
            return;
        }

        const ok = await this.listenChannel.consume(
            this.queueName,
            (message) => {
                /*
                    Note from http://www.squaremobius.net/amqp.node/doc/channel_api.html
                    & http://www.rabbitmq.com/consumer-cancel.html:
                    If the consumer is cancelled by RabbitMQ, the message callback will be invoked with null.
                */
                if (message === null) {
                    return;
                }

                message.content = options.formatter.deserialize(message.content.toString());
                options.queueType = 'queue';
                this.bus.handleIncoming(this.listenChannel, message, options, (err, channel, message) => {
                    if (err) {
                        this.emit('error', err);
                        return;
                    }
                    // amqplib intercepts errors and closes connections before bubbling up
                    // to domain error handlers when they occur non-asynchronously within
                    // callback. Therefore, if there is a process domain, we try-catch to
                    // redirect the error, assuming the domain creator's intentions.
                    try {
                        callback(message!.content, message!, channel!);
                    } catch (err) {
                        if (process.domain && process.domain.listeners('error')) {
                            process.domain.emit('error', err);
                        } else {
                            this.emit('error', err);
                        }
                    }
                });
            },
            { noAck: !this.ack },
        );

        this.listening = true;
        this.subscription = { consumerTag: ok.consumerTag };
        this.emit('listening');
    }

    public async destroy(_options = {}): Promise<void> {
        this.log('deleting queue %s', this.queueName);
        await this.listenChannel.deleteQueue(this.queueName);

        if (this.errorQueueName && this.ack) {
            await this.listenChannel.deleteQueue(this.errorQueueName, { ifEmpty: true });
        }
    }

    public async unlisten(): Promise<void> {
        if (this.listening && this.subscription) {
            await this.listenChannel.cancel(this.subscription.consumerTag);
            delete this.subscription;
            this.listening = false;
            this.bus.emit('unlistened', this);
        } else {
            this.on('listening', () => void this.unlisten.bind(this));
        }
    }

    public send(event: Record<string, any>, options: IQueueOptions, cb?: (err: any, ok?: Replies.Empty) => void): void {
        options = options || {};

        if (!this.initialized) {
            this.on('ready', this.send.bind(this, event, options, cb));
            return;
        }

        options.contentType = options.contentType || this.contentType;
        options.persistent = Boolean(options.ack || options.acknowledge || options.persistent || this.ack);

        if (cb) {
            this.confirmChannel.sendToQueue(
                this.routingKey || this.queueName,
                Buffer.from(options.formatter.serialize(event)),
                options,
                cb,
            );
        } else {
            this.sendChannel.sendToQueue(
                this.routingKey || this.queueName,
                Buffer.from(options.formatter.serialize(event)),
                options,
            );
        }
    }
}
