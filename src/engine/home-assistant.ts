import { Logger } from '../logger/logger';
import {
    createConnection,
    createLongLivedTokenAuth,
    getUser,
    callService,
    subscribeServices,
    subscribeEntities,
    Connection,
} from 'home-assistant-js-websocket';

export class HomeAssistant {
    connection: Connection | undefined = undefined;
    handlers: { [key: string]: any[] } = {};
    events: Promise<any> = Promise.resolve();
    token: string;
    url: string;
    logger: Logger;

    constructor(options: { token: string; url: string }, logger: Logger) {
        // this.api = haWebsocket
        this.token = options.token;
        this.url = options.url;
        this.logger = logger;
    }

    async notify(event: string, ...args: any[]) {
        const handlers = this.handlers[event];
        if (!handlers) return;

        for (const handler of handlers) {
            this.events = this.events
                .then(() => {
                    return handler(...args);
                })
                .catch((e) => {
                    this.logger.error(e);
                });
            /*
			Promise.resolve(handler(...args)).catch((e) => {
				error(e);
			});
*/
        }
    }

    onConnectionReady() {
        return this.notify('connection-ready');
    }

    onConnectionDisconnected() {
        return this.notify('connection-disconnected');
    }

    onConnectionReconnectError() {
        return this.notify('connection-reconnect-error');
    }

    onServicesUpdated(services: any) {
        return this.notify('services-updated', services);
    }

    onEntitiesUpdated(entities: any) {
        return this.notify('entities-updated', entities);
    }

    /*
	collectPanels() {
		const panelRegistered = (state, event) => {
			log('Panel registered:', state, event);
  			// Returning null means no change.
  			if (state === undefined) return null;

  			// This will be merged with the existing state.
  			return {
    				panels: state.panels.concat(event.data.panel),
			};
		}

		const fetchPanels = () => this.connection.sendMessagePromise({ type: 'get_panels' });
		const subscribeUpdates = (conn, store) => { return conn.subscribeEvents(store.action(panelRegistered), 'panel_registered'); };
		const panelsColl = this.api.getCollection(this.connection, '_pnl', fetchPanels, subscribeUpdates);

		// Now use collection
		panelsColl.refresh().then(() => log('Panel refresh:', panelsColl.state));
		panelsColl.subscribe((panels) => console.log('Panel update:', panels));
	}
*/
    subscribeEvent(callback: (event: any) => void, event_type: string) {
        return this.connection!.subscribeEvents((event: any) => callback(event));
    }

    subscribeMqtt(callback: (topic: string, event: any) => void, topic = '#') {
        return this.connection!.subscribeMessage((event: any) => callback(topic, event), {
            type: 'subscribe_trigger',
            trigger: {
                platform: 'mqtt',
                topic,
                // payload: "on",
                // encoding: "utf-8",
            },
        });
    }

    subscribeWebhook(callback: (webhook_id: string, event: any) => void, webhook_id: string, local_only = true) {
        if (webhook_id === undefined) {
            return Promise.reject(new Error('Webhook id required'));
        }

        return this.connection!.subscribeMessage((event: any) => callback(webhook_id, event), {
            type: 'subscribe_trigger',
            trigger: {
                platform: 'webhook',
                allowed_methods: 'POST',
                webhook_id,
                local_only,
            },
        });
    }

    async connect() {
        try {
            const auth = createLongLivedTokenAuth(this.url, this.token);

            const connection = await createConnection({ auth });
            this.connection = connection;

            connection.addEventListener('ready', () => this.onConnectionReady());
            connection.addEventListener('disconnected', () => this.onConnectionDisconnected());
            connection.addEventListener('reconnect-error', () => this.onConnectionReconnectError());

            subscribeServices(connection, (services: any) => this.onServicesUpdated(services));
            subscribeEntities(connection, (entities: any) => this.onEntitiesUpdated(entities));

            // this.subscribeEvent((event) => log('Event:', event));
            // this.subscribeMqtt((...triggered) => log('MQTT:', ...triggered)).catch((e) => error(e));
            // this.subscribeWebhook((...triggered) => log('Webhook:', ...triggered), 'test').catch((e) => error(e));
            // this.collectPanels();

            const result = await connection.sendMessagePromise({
                type: 'call_service',
                domain: 'switch',
                service: 'toggle',
                // Optional
                target: {
                    entity_id: 'switch.s31_id3_relay',
                },
            });
            console.log(result);

            return this.onConnectionReady();
        } catch (e) {
            this.logger.error(`Error connecting to Home Assistant WebSocket backend`);
            this.logger.error(e);
            return Promise.reject(e);
        }
    }

    connected() {
        return this.connection && this.connection.connected;
    }

    getCurrentUser() {
        return getUser(this.connection!);
    }

    callService(domain: string, service: string, data?: any, target?: any) {
        return callService(this.connection!, domain, service, data, target).catch((e: any) => {
            this.logger.error('Service error: ', e);
            return Promise.reject(e);
        });
    }

    stop() {
        return Promise.resolve(this.connection?.close());
    }

    on(event: string, handler: any) {
        if (!this.handlers[event]) this.handlers[event] = [];
        this.handlers[event].push(handler);
    }
}
