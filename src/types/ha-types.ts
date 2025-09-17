export type HaDomain = 'light' | 'plug';
export const haEvents = ['added', 'removed', 'updated', 'state-changed'] as const;
export type HaEvent = (typeof haEvents)[number];

export type HaAttributes = Record<string, unknown>;
export type HaGroups = Record<string, HaEntity>;

export type HaEntity = {
    entity_id: string;
    id: string;
    name: string;
    domain: string;
    state: string;
    groups: HaGroups;
    attributes: HaAttributes;
    last_updated: Date;
    last_changed: Date;
};

export type HaLightEntity = Omit<HaEntity, 'domain' | 'state'> & {
    domain: 'light';
    state: 'on' | 'off';
    toggle: () => void;
};

export type HaSwitchEntity = Omit<HaEntity, 'domain' | 'state'> & {
    domain: 'switch';
    state: 'on' | 'off';
    toggle: () => void;
};

export type HaSensorEntity = Omit<HaEntity, 'domain' | 'state'> & {
    domain: 'plug';
};

export type AnyHaEntity = HaLightEntity | HaSwitchEntity | HaSensorEntity;
