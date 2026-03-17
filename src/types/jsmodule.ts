import { LoggerFactory } from '../logger/logger';
import { EventBus } from '../util/event-bus';
import { AnyHaEntity, EntityId, HaEntity } from './ha-types';

export type JsEngine = {
  currentUser: string;
  services:    any;
  entities:    Record<string, HaEntity>;
  started:     boolean;
  entity<T extends HaEntity>(id: EntityId<T>): T;
};

export type HaEventMap<T extends HaEntity = HaEntity> = {
  added:           { id: string; entity: T };
  removed:         { id: string; entity: T };
  updated:         { id: string; entity: T; oldEntity?: T; state: T['state']; changed: boolean };
  'state-changed': { id: string; entity: T; oldEntity?: T; state: T['state']; oldState?: T['state']; changed: true };
};

export type HaEntityEvents = keyof HaEventMap<HaEntity>;

export type TopicProvider = <T extends HaEntity>(
  entity: EntityId<T> | RegExp,
) => EventBus<HaEventMap<T>>;

export type JsModuleConfig = {
  loggerFactory: LoggerFactory;
  getTopic:      TopicProvider;
  engine:        JsEngine;
};

export type JsModule = {
  started?: () => void;
  stopped?: () => void;
};

export type JsModuleConstructor = {
  new (options: JsModuleConfig): JsModule;
};
