import { Channel, ConfirmChannel, Replies } from 'amqplib';
import { EventEmitter } from 'events';
import { IMessage, IPubSubQueueOptions } from '../../bus.types';
import { RabbitMQBus } from '../bus';
import { Correlator } from '../correlator';

export class PubSubQueue extends EventEmitter {
    ack: boolean | undefined;
    bus: RabbitMQBus;
    confirmChannel: ConfirmChannel;
    correlator: Correlator;
    errorQueueName: string;
    exchangeName: string;
    exchangeOptions: IPubSubQueueOptions['exchangeOptions'];
    formatter: { deserialize: (val: string) => any; serialize: (val: any) => string };
    initialized: boolean;
    listening: boolean;
    listenChannel: Channel;
    log: any;
    maxRetries: number;
    queueName: string;
    queueOptions: any;
    routingKey: string;
    sendChannel: Channel;
    contentType: any;

    constructor(options: IPubSubQueueOptions) {
        super();
        options = options || {};
        const exchangeOptions = options.exchangeOptions || {};
        const queueOptions = options.queueOptions || {};

        Object.assign(queueOptions, {
            autoDelete: options.autoDelete || !(options.ack || options.acknowledge),
            contentType: options.contentType || 'application/json',
            durable: Boolean(options.ack || options.acknowledge),
            exclusive: options.exclusive || false,
            persistent: Boolean(options.ack || options.acknowledge || options.persistent),
        });

        Object.assign(exchangeOptions, {
            type: exchangeOptions.type || 'topic',
            durable: exchangeOptions.durable === false ? false : true,
            autoDelete: exchangeOptions.autoDelete || false,
        });

        this.ack = options.ack || options.acknowledge;
        this.bus = options.bus;
        this.confirmChannel = options.confirmChannel;
        this.correlator = options.correlator;
        this.errorQueueName = options.queueName + '.error';
        this.exchangeName = options.exchangeName || this.bus.exchangeName || 'amq.topic';
        this.exchangeOptions = exchangeOptions;
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
    }

    private async assertExchanges() {
        this.log('asserting exchange %s', this.exchangeName);
        await this.sendChannel.assertExchange(
            this.exchangeName,
            this.exchangeOptions.type || 'topic',
            this.exchangeOptions,
        );

        if (this.confirmChannel) {
            await this.confirmChannel.assertExchange(
                this.exchangeName,
                this.exchangeOptions.type || 'topic',
                this.exchangeOptions,
            );
        }
    }

    public publish(
        event: Record<string, any>,
        options: IPubSubQueueOptions,
        cb?: (err: any, ok: Replies.Empty) => void,
    ): void {
        options = options || {};

        options.contentType = options.contentType || this.contentType;

        const channel = cb ? this.confirmChannel : this.sendChannel;

        channel.publish(
            this.exchangeName,
            this.routingKey || this.queueName,
            Buffer.from(options.formatter.serialize(event)),
            options,
            cb,
        );
    }

    public async subscribe(
        options: IPubSubQueueOptions,
        callback: (content: IMessage['content'], message: IMessage, channel: Channel) => void,
    ): Promise<SubscribeReceipt> {
        let subscribed = false;
        let subscription: null | { consumerTag: string } = null;

        this.log('subscribing to queue %j with routingKey %j', this.queueName, this.routingKey);

        const _unsubscribe = async (cb) => {
            if (subscribed && subscription) {
                // should we prevent multiple cancel calls?
                await this.listenChannel.cancel(subscription.consumerTag);
                this.emit('unlistened');
                if (cb) {
                    cb();
                }
            } else {
                this.on('subscribed', () => void _unsubscribe.call(this, cb));
            }
        };

        const receipt = new SubscribeReceipt(_unsubscribe);

        const _subscribe = async (uniqueName) => {
            const ok = await this.listenChannel.consume(
                uniqueName,
                (message) => {
                    /*
                        Note from http://www.squaremobius.net/amqp.node/doc/channel_api.html
                        & http://www.rabbitmq.com/consumer-cancel.html:
                        If the consumer is cancelled by RabbitMQ, the message callback will be invoked with null.
                    */
                    if (message === null) {
                        return;
                    }
                    // todo: map contentType to default formatters
                    message.content = options.formatter.deserialize(message.content.toString());
                    options.queueType = 'pubsubqueue';
                    this.bus.handleIncoming(
                        this.listenChannel,
                        (message as unknown) as IMessage,
                        options,
                        (err, channel, message) => {
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
                        },
                    );
                },
                { noAck: !this.ack },
            );

            subscribed = true;
            subscription = { consumerTag: ok.consumerTag };
            this.emit('subscribed');
            receipt.emit('subscribed');
        };

        const uniqueName = await this.correlator.queueName(options);

        await this.listenChannel.assertQueue(uniqueName, this.queueOptions);
        await this.listenChannel.bindQueue(uniqueName, this.exchangeName, this.routingKey || this.queueName);

        if (this.ack) {
            this.log('asserting error queue ' + this.errorQueueName);
            const errorQueueOptions = Object.assign(this.queueOptions, {
                autoDelete: options.autoDeleteErrorQueue || false,
            });
            await this.listenChannel.assertQueue(this.errorQueueName, errorQueueOptions);
        }
        await _subscribe(uniqueName);

        return receipt;
    }

    static async create(options: IPubSubQueueOptions): Promise<PubSubQueue> {
        const queue = new PubSubQueue(options);
        await queue.assertExchanges();
        return queue;
    }
}

class SubscribeReceipt extends EventEmitter {
    unsubscribe: any;
    constructor(unsubscribe) {
        super();
        this.unsubscribe = unsubscribe;
    }
}
