import { LoggerFactory } from '../logger/logger';
import { HaEntity } from './ha-types';

export type JSEngine = {
    CurrentUser: string;
    // todo
    Services: any;
    Entities: Record<string, HaEntity>;
    started: boolean;
};

export type JsModuleOptions = {
    loggerFactory: LoggerFactory;
    engine: JSEngine;
};

export type JsModule = {
    started: (options: JsModuleOptions) => void;
    stopped: () => void;
    entityAdded: (id: string, entity: HaEntity) => void;
    entityRemoved: (id: string, entity: HaEntity) => void;
    entityUpdated: (id: string, state: string, changed: boolean, entity: HaEntity, oldEntity: HaEntity) => void;
    entityStateChanged: (id: string, state: string, oldState: string, entity: HaEntity, oldEntity: HaEntity) => void;
};

export type JsModuleConstructor = {
    new (options: JsModuleOptions): JsModule;
};
