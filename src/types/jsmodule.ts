import { LoggerFactory } from '../logger/logger';
import { EventBus } from '../util/event-bus';
import { AnyHaEntity, HaEntity } from './ha-types';

export type JsEngine = {
    currentUser: string;

    // todo
    Services: any;
    Entities: Record<string, HaEntity>;
    started: boolean;
};

type EventBase = {
    id: string;
    entity: AnyHaEntity;
};

type AddedEvent = EventBase;
type RemovedEvent = EventBase;
type UpdatedEvent = EventBase & {
    state: string;
    changed: boolean;
    oldEntity?: AnyHaEntity;
};
type StateChangedEvent = EventBase & {
    state: string;
    oldState?: string;
    changed: boolean;
    entity: AnyHaEntity;
    oldEntity?: AnyHaEntity;
};

export type HaEvents = AddedEvent | RemovedEvent | UpdatedEvent | StateChangedEvent;

export type HaEventMap = {
    added: HaEvent<'added', AddedEvent>;
    removed: HaEvent<'removed', RemovedEvent>;
    updated: HaEvent<'updated', UpdatedEvent>;
    'state-changed': HaEvent<'state-changed', StateChangedEvent>;
};

export type HaEvent<TKey, TData> = {
    id: string;
    event: TKey;
} & TData;

export type HaEntityEvents = keyof HaEventMap;
export type TopicProvider = (entity: string | RegExp) => EventBus<HaEventMap>;

export type JsModuleConfig = {
    loggerFactory: LoggerFactory;
    getTopic: TopicProvider;
    engine: JsEngine;
};

export type JsModule = {
    started?: () => void;
    stopped?: () => void;
    // entityAdded: (id: string, entity: HaEntity) => void;
    // entityRemoved: (id: string, entity: HaEntity) => void;
    // entityUpdated: (id: string, state: string, changed: boolean, entity: HaEntity, oldEntity: HaEntity) => void;
    // entityStateChanged: (id: string, state: string, oldState: string, entity: HaEntity, oldEntity: HaEntity) => void;
};

export type JsModuleConstructor = {
    new (options: JsModuleConfig): JsModule;
};
