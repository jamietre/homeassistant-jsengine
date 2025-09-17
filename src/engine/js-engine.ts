import { getLogger, Logger } from '../logger/logger';
import RunDir from 'jsrundir';
import { Cache } from './cache';
import { error } from 'console';
import { Service } from './service';
import { Entity } from './entity';
import { HomeAssistant } from './home-assistant';
import { HaEntityEvents, HaEventMap, JsModuleConstructor } from '../types/jsmodule';
import { immutableProxy } from './immutable-proxy';
import { AnyHaEntity, HaEntity, HaEvent } from '../types/ha-types';
import { isEsModule, ModuleExport } from '../util/es-module';
import { EventBus, EventBusData } from '../util/event-bus';

const match = (pattern: string, str: string) => {
    return new RegExp(
        '^' +
            pattern
                .split('*')
                .map((str) => str.replace(/([.*+?^=!:${}()|\[\]\/\\])/g, '\\$1'))
                .join('.*') +
            '$',
    ).test(str);
};

type SystemBusEvents = {
    started: void;
    stopped: void;
};

export class JSEngine {
    #dir: string | null = null;
    #rundir: any = null;
    #ha: HomeAssistant | null = null;

    #scripts: string[] = [];
    #modules: { [key: string]: any } = {};
    #queue: { [key: string]: Promise<any> } = {};

    #cached = new Cache();

    #ready = false;
    #currentUser: any = immutableProxy(this.#cached.add('currentUser'));
    #services: any = immutableProxy(this.#cached.add('services'));
    #entities: any = immutableProxy(this.#cached.add('entities'));
    #groups: any = {};

    #engine: any;
    #logger: Logger;

    topics = new Map<string, EventBus<any>>();
    topicsRegex: Array<{ regex: RegExp; topic: EventBus<any> }> = [];

    systemTopic = this.getOrCreateTopic<SystemBusEvents>('system');

    constructor(options: { dir: string; token: string | undefined; url: string }, logger: Logger) {
        const { token, dir, url } = options;
        this.#logger = logger;
        this.#dir = dir;
        this.#logger.info(`Loading scripts from '${this.#dir}'`);
        this.#rundir = new RunDir(this.#dir);
        this.#rundir.on('load', (name: string, module: any) => this.#scriptLoaded(name, module));
        this.#rundir.on('unload', (name: string, module: any) => this.#scriptUnloaded(name, module));

        if (token) {
            this.#ha = new HomeAssistant({ token, url }, this.#logger);
            this.#ha.on('connection-ready', () => this.#connectionReady());
            this.#ha.on('connection-disconnected', () => this.#connectionDisconnected());
            this.#ha.on('connection-reconnect-error', () => this.#connectionReconnectError());
            this.#ha.on('services-updated', (services: any) => this.#servicesUpdated(services));
            this.#ha.on('entities-updated', (entities: any) => this.#entitiesUpdated(entities));
        }

        const self = this;

        this.#engine = immutableProxy({
            get currentUser() {
                return self.#currentUser;
            },

            get services() {
                return self.#services;
            },

            get entities() {
                return self.#entities;
            },

            get started() {
                return self.#ready;
            },
        });

        if ((globalThis as any).JSEngine === undefined) {
            (globalThis as any).JSEngine = this.#engine;
        }
    }

    #reset() {
        this.#ready = false;
        this.#cached.reset();
    }

    async publishEvent(topic: string, event: HaEvent, data: unknown) {
        const bus = this.topics.get(topic);
        if (!bus) return;
        bus.publish(event, data);
    }
    async #notify(script: string, event: string, ...args: any[]) {
        const module = this.#modules[script];
        if (typeof module !== 'object') {
            return;
        }

        const handler = module[event];
        if (!handler) {
            return;
        }

        try {
            const queue = await this.#queue[script];
            this.#queue[script] = queue;
            return handler.apply(module, args);
        } catch (e) {
            error(e);
        }
    }

    #notifyMatch(script: string, events: string | string[], ...args: any[]) {
        let queue: Promise<any> = Promise.resolve();

        const mod = this.#modules[script];

        for (const event of Array.isArray(events) ? events : [events]) {
            if (mod[event]) {
                queue = queue.then(() => this.#notify(script, event, ...args));
                break;
            }
        }

        return queue;
    }

    #notifyAll(event: string, ...args: any[]) {
        const batch: Promise<any>[] = [];

        for (const script of this.#scripts) {
            batch.push(this.#notify(script, event, ...args));
        }

        return Promise.all(batch);
    }

    async #notifyAllMatch(events: string | string[], ...args: any[]): Promise<void> {
        const batch: Promise<any>[] = [];

        for (const script of this.#scripts) {
            batch.push(this.#notifyMatch(script, events, ...args));
        }

        await Promise.all(batch);
    }

    #updateConnection() {
        if (this.#ready || !this.#cached.ready()) return;

        this.#logger.info(`Connected to Home Assistant as ${this.#currentUser.name}`);
        this.#ready = true;

        this.systemTopic.publish(`started`, undefined);

        //return this.#notifyAll('started');
    }

    #connectionReady() {
        return this.#ha!.getCurrentUser().then((user: any) => {
            this.#cached.assign('currentUser', user);
            return this.#updateConnection();
        });
    }

    #connectionDisconnected() {
        this.#logger.info('Disconnected from Home Assistant');
        this.#reset();
        return this.#notifyAll('stopped');
    }

    #connectionReconnectError() {
        this.#logger.info('Error reconnecting to Home Assistant');
        return this.#notifyAll('error');
    }

    #servicesUpdated(services: any) {
        this.#cached.empty('services');
        for (const service in services) {
            const services = this.#cached.get('services');
            services[service] = new Service(service, services[service], this.#ha);
        }

        return this.#updateConnection();
    }

    #entity(id: string, data?: any) {
        const entities = this.#cached.get<Record<string, Entity>>('entities');
        let entity = entities[id];
        if (!entity) {
            const services = this.#cached.get('services');
            entity = new Entity(id).proxiedServices(services);
            entities[id] = entity;
        }

        const merged: any = {};

        if (data) {
            Object.assign(merged, structuredClone(data));
            merged.name = data.attributes?.friendly_name;
            merged.members = data.attributes?.entity_id ? {} : undefined;

            if (entity.attributes?.entity_id) {
                const entity_ids = entity.attributes.entity_id as string[];

                for (const member_id of entity_ids) {
                    const entities = this.#cached.get<Record<string, Entity>>('entities');
                    const member_entity = entities[member_id];

                    if (member_entity?.groups?.[id]) {
                        delete member_entity.groups[id];
                    }
                }
            }

            if (data.attributes?.entity_id) {
                for (const member_id of data.attributes.entity_id) {
                    const member_entity = this.#entity(member_id);

                    merged.members[member_id] = member_entity;
                    member_entity.groups[id] = entity;
                }
            }
        }

        merged.groups = entity.groups || {};

        entity.update(merged); // TO DO: remove 'undefined' properties in entity.update()

        return entity;
    }

    #entitiesUpdated(updatedEntities: Record<string, HaEntity>) {
        this.#logger.debug('entities updated');

        if (!this.#ready) {
            this.#cached.empty('entities');
            for (const entity in updatedEntities) {
                this.#entity(entity, updatedEntities[entity]);
            }

            return this.#updateConnection();
        }

        let queue: Promise<any> = Promise.resolve();

        const entities = this.#cached.get<Record<string, Entity>>('entities');
        for (const entity of Object.values(entities)) {
            const id = entity.id;
            if (entities[id]) continue;

            queue = queue.then(() => {
                this.#logger.debug(`${id}: [removed]`);

                // TO DO: remove group from members

                delete entities[id];

                return this.#notifyAllMatch(['entityRemoved', `entity-{${id}}-removed`], id, entity);
            });
        }

        for (const entity of Object.values(updatedEntities).sort((a: any, b: any) =>
            a.last_updated == b.last_updated ? 0 : a.last_updated < b.last_updated ? -1 : 1,
        )) {
            const id = entity.entity_id;
            let current = entities[id];

            if (current && (entity as any).last_updated <= current.last_updated) {
                continue;
            }

            const previous = current ? immutableProxy(current.clone()) : undefined; // TO DO: members and groups
            const changed = !previous || (entity as any).last_changed > previous.last_changed;
            const old_state = previous?.state;

            queue = queue
                .then(() => {
                    this.#logger.debug(`entity: ${id} -> ${(entity as any).last_updated}`);

                    current = this.#entity(id, entity);

                    if (!previous) {
                        this.#logger.debug(`${id}: [added]`);

                        return this.#notifyAllMatch(['entityAdded', `entity-{${id}}-added`], id, current);
                    }
                })
                .then(() => {
                    const topic = this.getOrCreateTopic<HaEventMap>(id);
                    topic.publish('updated', {
                        id,
                        event: 'updated',
                        state: current.state,
                        changed,
                        entity: current as AnyHaEntity,
                        oldEntity: previous as AnyHaEntity,
                    });
                    this.#logger.debug(`${id}: ${current.state}${changed ? ' [changed]' : ''}`);

                    return this.#notifyAllMatch(
                        ['entityUpdated', `entity-{${id}}-updated`],
                        id,
                        current.state,
                        changed,
                        old_state,
                        current,
                        previous,
                    );
                })
                .then(() => {
                    if (changed) {
                        this.publish(id, 'state-changed', {
                            id,
                            event: 'state-changed',
                            state: current.state,
                            changed: true,
                            entity: current,
                            oldEntity: previous,
                            oldState: old_state,
                        });

                        this.#logger.debug(`${id}: ${old_state ? old_state : '()'} -> ${current.state}`);

                        return this.#notifyAllMatch(
                            [
                                'entityStateChanged',
                                `entity-{${id}}-state-changed`,
                                `entity-{${id}}-state-changed-to-{${current.state}}`,
                                `entity-{${id}}-state-changed-from-{${old_state}}-to-{${current.state}}`,
                            ],
                            id,
                            current.state,
                            old_state,
                            current,
                            previous,
                        );
                    }
                });
        }

        return queue;
    }

    publish(id: string, event: HaEntityEvents, data: unknown) {
        const topic = this.getOrCreateTopic<HaEventMap>(id);
        topic.publish(event, data as any);
        for (const item of this.topicsRegex) {
            if (item.regex.test(id)) {
                item.topic.publish(event, data as any);
            }
        }
    }
    async #scriptLoaded(name: string, jsModuleExport: ModuleExport<JsModuleConstructor>): Promise<void> {
        // TO DO: wait for pending notifications if previously unloaded (is this needed?)
        this.#logger.info(`Loaded: ${name}`);

        const Cotr = isEsModule(jsModuleExport) ? jsModuleExport.default : jsModuleExport;
        const module = new Cotr({
            engine: this.#engine,
            loggerFactory: getLogger,
            getTopic: (entity: string | RegExp) => {
                if (typeof entity === 'string') {
                    let topic = this.topics.get(entity) as unknown as EventBus<HaEventMap>;
                    if (!topic) {
                        topic = new EventBus<HaEventMap>();
                        this.topics.set(entity, topic);
                    }
                    return topic;
                }
                const topic = new EventBus<HaEventMap>();
                this.topicsRegex.push({ regex: entity, topic });
                return topic;
            },
        });

        await this.#notifyAllMatch(['moduleLoaded', `module-{${name}}-loaded`], name, module);
        this.#modules[name] = module;
        this.#scripts.push(name);
        this.#queue[name] = Promise.resolve();

        const batch: Promise<any>[] = [];

        for (const script of this.#scripts) {
            batch.push(
                this.#notifyMatch(name, ['moduleLoaded', `module-{${script}}-loaded`], script, this.#modules[script]),
            );
        }

        await Promise.all(batch);

        if (module.started) {
            this.systemTopic.subscribe('started', (evt) => {
                module.started!();
            });
        }
        if (module.stopped) {
            this.systemTopic.subscribe('stopped', (evt) => {
                module.started!();
            });
        }
    }

    private getOrCreateTopic<T extends EventBusData>(name: string) {
        let topic: EventBus | undefined = this.topics.get(name);
        if (!topic) {
            topic = new EventBus();
            this.topics.set(name, topic);
        }
        return topic as EventBus<T>;
    }

    async #scriptUnloaded(name: string, module: any) {
        // TO DO: wait for pending notifications (is this needed?)
        this.#logger.info(`Unloaded: ${name}`);

        this.systemTopic.publish('stopped', undefined);

        module.JSEngine = null;

        delete this.#modules[name];
        this.#scripts.splice(this.#scripts.indexOf(name), 1);
        delete this.#queue[name];
        return this.#notifyAllMatch(['module-unloaded', `module-{${name}}-unloaded`], name, module);
    }

    start() {
        // TO DO: maybe rundir.run() should return a promise to indicate init completion
        this.#rundir.run();
        return this.#ha!.connect();
    }

    stop() {
        // TO DO: maybe rundir.stop() should return a promise to indicate stop completion
        this.#ha!.stop().then(() => {
            this.#rundir.stop();
        });
    }
}
