/**
 * Demo: Type-safe Entity Instance Access (Phase 2)
 *
 * This demonstrates:
 * - MyEntities interface with all entity IDs mapped to types
 * - Type-safe entity access by ID
 * - Entity ID literal types per domain
 * - Helper functions for entity operations
 */

import { MyEntities, AllEntityIds } from '../generated/types/my-entities';
import { ClimateEntityId, LightEntityId, SensorEntityId } from '../generated/types/entity-ids';
import { getEntity, hasEntity, getEntityIdsByDomain } from '../generated/types/entity-helpers';
import { ClimateEntity } from '../generated/types/entities/climate';
import { LightEntity } from '../generated/types/entities/light';

// Example 1: Type-safe entity map
declare const entities: MyEntities;

// ✅ Type-safe access - TypeScript knows this is a ClimateEntity
const office = entities['climate.heatpump_office_heat_pump_office'];
office.set_temperature({ temperature: 72 });
office.set_fan_mode({ fan_mode: 'auto' });

// ✅ Type-safe access - TypeScript knows this is a LightEntity
const couchLamp = entities['light.s31_id1_switch'];
couchLamp.turn_on({ brightness: 255 });
couchLamp.toggle();

// ❌ This would be a compile error - invalid entity ID
// const invalid = entities['climate.does_not_exist'];
//                          ^^^^^^^^^^^^^^^^^^^^^^^
// Type '"climate.does_not_exist"' is not assignable to type 'keyof MyEntities'

// Example 2: Using entity ID literal types
function controlClimate(entityId: ClimateEntityId) {
    const entity = entities[entityId];

    // TypeScript knows entity is ClimateEntity
    entity.set_hvac_mode({ hvac_mode: 'heat' });
}

// ✅ Valid climate entity ID
controlClimate('climate.heatpump_office_heat_pump_office');

// ❌ This would be a compile error - not a climate entity
// controlClimate('light.s31_id1_switch');
//                ^^^^^^^^^^^^^^^^^^^^^^
// Argument of type '"light.s31_id1_switch"' is not assignable to parameter of type 'ClimateEntityId'

// Example 3: Using helper functions
function demonstrateHelpers() {
    // Type-safe entity accessor
    const entity = getEntity(entities, 'climate.heatpump_office_heat_pump_office');
    // entity is typed as ClimateEntity
    entity.set_temperature({ temperature: 70 });

    // Check if entity exists
    if (hasEntity(entities, 'climate.basement')) {
        const basement = entities['climate.basement'];
        console.log(`Basement temp: ${basement.attributes.current_temperature}`);
    }

    // Get all entity IDs for a domain
    const climateIds = getEntityIdsByDomain(entities, 'climate');
    console.log(`Found ${climateIds.length} climate entities`);

    for (const entityId of climateIds) {
        const climate = entities[entityId] as ClimateEntity;
        console.log(`${entityId}: ${climate.state}, ${climate.attributes.current_temperature}°F`);
    }
}

// Example 4: Generic functions with entity type constraints
function logEntityState<T extends AllEntityIds>(entityId: T) {
    const entity = entities[entityId];
    console.log(`${entityId}: ${entity.state}`);
}

// Works with any valid entity ID
logEntityState('climate.heatpump_office_heat_pump_office');
logEntityState('light.s31_id1_switch');
logEntityState('sensor.44cran_energy_today');

// Example 5: Domain-specific operations
function adjustAllClimates(temperature: number) {
    const climateIds: ClimateEntityId[] = [
        'climate.basement',
        'climate.heatpump_garage_heat_pump_garage',
        'climate.heatpump_guest_room_heat_pump_guest_room',
        'climate.heatpump_loft_heat_pump_loft',
        'climate.heatpump_office_heat_pump_office',
        'climate.t6_pro_z_wave_programmable_thermostat_with_smartstart',
    ];

    for (const entityId of climateIds) {
        const climate = entities[entityId];
        climate.set_temperature({ temperature });
    }
}

// Example 6: Type narrowing
function handleEntity(entityId: AllEntityIds) {
    const entity = entities[entityId];

    // Check domain via entity_id
    if (entityId.startsWith('climate.')) {
        // We know it's a ClimateEntity
        const climate = entity as ClimateEntity;
        console.log(`Climate: ${climate.attributes.current_temperature}°F`);
    } else if (entityId.startsWith('light.')) {
        // We know it's a LightEntity
        const light = entity as LightEntity;
        console.log(`Light: ${light.state}`);
    }
}

// Example 7: Building entity collections
interface HomeZones {
    upstairs: {
        climates: ClimateEntityId[];
        lights: LightEntityId[];
    };
    downstairs: {
        climates: ClimateEntityId[];
        lights: LightEntityId[];
    };
}

const homeLayout: HomeZones = {
    upstairs: {
        climates: ['climate.heatpump_loft_heat_pump_loft'],
        lights: ['light.s31_id1_switch'],
    },
    downstairs: {
        climates: ['climate.basement', 'climate.heatpump_office_heat_pump_office'],
        lights: [],
    },
};

function setZoneTemperature(zone: keyof HomeZones, temperature: number) {
    const zoneConfig = homeLayout[zone];
    for (const climateId of zoneConfig.climates) {
        entities[climateId].set_temperature({ temperature });
    }
}

// Example 8: Auto-complete demonstration
// When you type: entities['
// Your IDE will show ALL 440 entity IDs with auto-complete!

// When you type: entities['climate.
// Your IDE will show only the 6 climate entity IDs!

export {
    controlClimate,
    demonstrateHelpers,
    logEntityState,
    adjustAllClimates,
    handleEntity,
    setZoneTemperature,
};
