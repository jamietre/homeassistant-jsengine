/**
 * Typed JSEngine - Runtime integration with generated types (Phase 4)
 *
 * This provides type-safe wrappers around JSEngine that use the generated
 * MyEntities interface for compile-time type checking.
 */

import { JSEngine } from './js-engine';
import type { MyEntities, AllEntityIds } from '../../generated/types/my-entities';
import type { ClimateEntity } from '../../generated/types/entities/climate';
import type { LightEntity } from '../../generated/types/entities/light';
import type { SwitchEntity } from '../../generated/types/entities/switch';
import type { SensorEntity } from '../../generated/types/entities/sensor';

/**
 * Type-safe entity accessor for JSEngine.
 * Provides compile-time type checking for entity access.
 *
 * Usage:
 *   const engine = new JSEngine(...);
 *   const typed = new TypedEngine(engine);
 *   const climate = typed.getEntity('climate.heatpump_office');
 *   climate.set_temperature({ temperature: 72 }); // Type-safe!
 */
export class TypedEngine {
    #engine: JSEngine;

    constructor(engine: JSEngine) {
        this.#engine = engine;
    }

    /**
     * Get an entity by ID with full type safety.
     * The return type is automatically inferred from the entity ID.
     *
     * @example
     * const climate = typed.getEntity('climate.heatpump_office');
     * // climate is typed as ClimateEntity
     * climate.set_temperature({ temperature: 72 });
     */
    getEntity<T extends AllEntityIds>(entityId: T): MyEntities[T] {
        // At runtime, JSEngine.entities is a plain object
        // We cast it to match the generated types
        return (this.#engine as any).entities[entityId] as MyEntities[T];
    }

    /**
     * Access all entities with the MyEntities type.
     * Provides type-safe access to the entire entity map.
     *
     * @example
     * const entities = typed.entities;
     * entities['climate.basement'].set_temperature({ temperature: 70 });
     */
    get entities(): MyEntities {
        return (this.#engine as any).entities as MyEntities;
    }

    /**
     * Check if an entity exists at runtime.
     * Type guard that narrows string to AllEntityIds.
     */
    hasEntity(entityId: string): entityId is AllEntityIds {
        return entityId in (this.#engine as any).entities;
    }

    /**
     * Get all entity IDs for a specific domain.
     * Returns a typed array of entity IDs.
     */
    getEntityIdsByDomain(domain: string): AllEntityIds[] {
        const entities = (this.#engine as any).entities;
        return Object.keys(entities).filter(id =>
            id.startsWith(`${domain}.`)
        ) as AllEntityIds[];
    }

    /**
     * Access the underlying JSEngine instance for non-typed operations.
     */
    get raw(): JSEngine {
        return this.#engine;
    }
}

/**
 * Domain-specific typed accessors for common entity types.
 * Provides convenient access to entities by domain.
 */
export class DomainAccessors {
    #typed: TypedEngine;

    constructor(typed: TypedEngine) {
        this.#typed = typed;
    }

    /**
     * Get all climate entities.
     */
    get climate(): Map<string, ClimateEntity> {
        const map = new Map<string, ClimateEntity>();
        const entityIds = this.#typed.getEntityIdsByDomain('climate');

        for (const id of entityIds) {
            const entity = this.#typed.getEntity(id);
            if (id.startsWith('climate.')) {
                map.set(id, entity as ClimateEntity);
            }
        }

        return map;
    }

    /**
     * Get all light entities.
     */
    get lights(): Map<string, LightEntity> {
        const map = new Map<string, LightEntity>();
        const entityIds = this.#typed.getEntityIdsByDomain('light');

        for (const id of entityIds) {
            const entity = this.#typed.getEntity(id);
            if (id.startsWith('light.')) {
                map.set(id, entity as LightEntity);
            }
        }

        return map;
    }

    /**
     * Get all switch entities.
     */
    get switches(): Map<string, SwitchEntity> {
        const map = new Map<string, SwitchEntity>();
        const entityIds = this.#typed.getEntityIdsByDomain('switch');

        for (const id of entityIds) {
            const entity = this.#typed.getEntity(id);
            if (id.startsWith('switch.')) {
                map.set(id, entity as SwitchEntity);
            }
        }

        return map;
    }

    /**
     * Get all sensor entities.
     */
    get sensors(): Map<string, SensorEntity> {
        const map = new Map<string, SensorEntity>();
        const entityIds = this.#typed.getEntityIdsByDomain('sensor');

        for (const id of entityIds) {
            const entity = this.#typed.getEntity(id);
            if (id.startsWith('sensor.')) {
                map.set(id, entity as SensorEntity);
            }
        }

        return map;
    }
}

/**
 * Helper function to create a typed engine instance.
 *
 * @example
 * const engine = new JSEngine({ dir, token, url }, logger);
 * const typed = createTypedEngine(engine);
 * const climate = typed.getEntity('climate.heatpump_office');
 */
export function createTypedEngine(engine: JSEngine): TypedEngine {
    return new TypedEngine(engine);
}

/**
 * Helper function to create domain accessors.
 *
 * @example
 * const domains = createDomainAccessors(typed);
 * for (const [id, climate] of domains.climate) {
 *   console.log(`${id}: ${climate.attributes.current_temperature}°F`);
 * }
 */
export function createDomainAccessors(typed: TypedEngine): DomainAccessors {
    return new DomainAccessors(typed);
}
