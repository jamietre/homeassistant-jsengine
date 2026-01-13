/**
 * Demo: Complete Entity Interfaces (Phase 1.3)
 *
 * This demonstrates the complete entity interfaces that combine:
 * - Entity metadata (entity_id, domain, last_changed, etc.)
 * - Typed state
 * - Typed attributes
 * - Service methods
 */

import {
    ClimateEntity,
    ClimateState,
    ClimateAttributes,
    ClimateFanModes,
    ClimateHvacModes,
} from '../generated/types/entities/climate';

import { LightEntity, LightState } from '../generated/types/entities/light';
import { SensorEntity } from '../generated/types/entities/sensor';

// Example 1: Climate entity with full type safety
const climateEntity: ClimateEntity = {
    entity_id: 'climate.heatpump_office',
    domain: 'climate',
    state: 'heat',  // ✅ Typed as ClimateState
    attributes: {
        current_temperature: 68,
        temperature: 70,
        hvac_modes: ['off', 'heat', 'cool', 'auto'],
        fan_modes: ['auto', 'low', 'medium', 'high'],
        swing_modes: ['off', 'vertical', 'horizontal', 'both'],
        min_temp: 40,
        max_temp: 90,
        supported_features: 403,
        friendly_name: 'Office Heat Pump',
    },
    last_changed: '2026-01-12T10:00:00',
    last_updated: '2026-01-12T10:00:00',
    // Service methods are available via TypedClimateServices
    turn_on: async () => { /* implementation */ },
    turn_off: async () => { /* implementation */ },
    set_temperature: async (params) => { /* implementation */ },
    set_fan_mode: async (params) => { /* implementation */ },
    set_hvac_mode: async (params) => { /* implementation */ },
    toggle: async () => { /* implementation */ },
    set_preset_mode: async (params) => { /* implementation */ },
    set_humidity: async (params) => { /* implementation */ },
    set_swing_mode: async (params) => { /* implementation */ },
    set_swing_horizontal_mode: async (params) => { /* implementation */ },
};

// Type-safe service calls with enum validation
async function controlClimate(entity: ClimateEntity) {
    // ✅ Valid fan modes
    await entity.set_fan_mode({ fan_mode: 'auto' });
    await entity.set_fan_mode({ fan_mode: 'low' });

    // ❌ This would be a type error:
    // await entity.set_fan_mode({ fan_mode: 'invalid_mode' });
    //                                       ^^^^^^^^^^^^^^
    // Type '"invalid_mode"' is not assignable to type 'ClimateFanModes'

    // ✅ Valid HVAC modes
    await entity.set_hvac_mode({ hvac_mode: 'heat' });
    await entity.set_hvac_mode({ hvac_mode: 'cool' });

    // ✅ Type-safe temperature control
    await entity.set_temperature({ temperature: 72 });
}

// Example 2: Light entity
const lightEntity: LightEntity = {
    entity_id: 'light.s31_id1_switch',
    domain: 'light',
    state: 'on',  // ✅ Typed as LightState
    attributes: {
        friendly_name: 'Couch Lamp',
        supported_features: 8,
        supported_color_modes: ['onoff'],
        color_mode: 'onoff',
    },
    last_changed: '2026-01-12T10:00:00',
    // Service methods from LightServices
    turn_on: async (params) => { /* implementation */ },
    turn_off: async (params) => { /* implementation */ },
    toggle: async () => { /* implementation */ },
};

async function controlLight(entity: LightEntity) {
    // Service methods available with typed parameters
    await entity.turn_on({ brightness: 255 });
    await entity.toggle();
}

// Example 3: Sensor entity (no services)
const sensorEntity: SensorEntity = {
    entity_id: 'sensor.outdoor_temperature',
    domain: 'sensor',
    state: '42.5',  // Sensor state is string
    attributes: {
        friendly_name: 'Outdoor Temperature',
        unit_of_measurement: '°F',
        device_class: 'temperature',
    },
    last_changed: '2026-01-12T10:00:00',
};

// Sensors have no service methods, only readonly properties
function readSensor(entity: SensorEntity) {
    console.log(`${entity.attributes.friendly_name}: ${entity.state}${entity.attributes.unit_of_measurement}`);
}

// Example 4: Type guards for entity types
function isClimateEntity(entity: ClimateEntity | LightEntity | SensorEntity): entity is ClimateEntity {
    return entity.domain === 'climate';
}

function handleEntity(entity: ClimateEntity | LightEntity | SensorEntity) {
    if (isClimateEntity(entity)) {
        // TypeScript knows this is a ClimateEntity
        entity.set_temperature({ temperature: 70 });
    }
}

// Example 5: Accessing typed attributes
function analyzeClimateCapabilities(entity: ClimateEntity) {
    const supportedModes: ClimateFanModes[] = entity.attributes.fan_modes || [];
    const currentTemp: number = entity.attributes.current_temperature;
    const currentState: ClimateState = entity.state;

    console.log(`Current: ${currentTemp}°F, State: ${currentState}`);
    console.log(`Supported fan modes: ${supportedModes.join(', ')}`);
}

export {
    controlClimate,
    controlLight,
    readSensor,
    handleEntity,
    analyzeClimateCapabilities,
};
