export type HaDomain = 'light' | 'plug';

export type HaAttributes = Record<string, unknown>;
export type HaGroups = Record<string, HaEntity>;
export type HaEntity = {
    entity_id: string;
    id: string;
    domain: HaDomain;
    name: string;
    groups: HaGroups;
    state: string; // on, off?
    attributes: HaAttributes;
    last_updated: Date;
    last_changed: Date;
};
