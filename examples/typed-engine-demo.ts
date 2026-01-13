/**
 * Demo: Typed JSEngine Runtime Integration (Phase 4)
 *
 * This demonstrates how to use the typed engine wrapper for
 * compile-time type safety with runtime JSEngine.
 */

import { JSEngine } from '../src/engine/js-engine';
import { createTypedEngine, createDomainAccessors, TypedEngine } from '../src/engine/typed-engine';
import { getLogger } from '../src/logger/logger';

// Example 1: Basic typed engine usage
async function basicExample() {
    const logger = getLogger({ name: 'demo', level: 'info' });

    // Create regular JSEngine
    const engine = new JSEngine(
        {
            dir: './scripts',
            token: process.env.HASS_TOKEN,
            url: 'http://homeassistant.local:8123',
        },
        logger
    );

    // Wrap in typed engine for type safety
    const typed = createTypedEngine(engine);

    await engine.start();

    // ✅ Type-safe entity access
    const office = typed.getEntity('climate.heatpump_office_heat_pump_office');

    // TypeScript knows 'office' is a ClimateEntity
    await office.set_temperature({ temperature: 72 });
    await office.set_fan_mode({ fan_mode: 'auto' });

    console.log(`Office temp: ${office.attributes.current_temperature}°F`);
    console.log(`Office state: ${office.state}`);

    // ❌ Compile error: invalid entity ID
    // const invalid = typed.getEntity('climate.does_not_exist');
}

// Example 2: Using the entities map directly
async function entitiesMapExample(typed: TypedEngine) {
    // Access all entities through the typed map
    const entities = typed.entities;

    // Type-safe access to any entity
    entities['climate.basement'].set_temperature({ temperature: 68 });
    entities['light.s31_id1_switch'].turn_on({ brightness: 255 });

    // Check entity state
    if (entities['climate.heatpump_office_heat_pump_office'].state === 'heat') {
        console.log('Office is heating');
    }
}

// Example 3: Runtime entity validation
async function runtimeValidationExample(typed: TypedEngine) {
    const userInput = 'climate.basement'; // Could come from user input

    // Runtime check with type guard
    if (typed.hasEntity(userInput)) {
        // TypeScript now knows userInput is a valid AllEntityIds
        const entity = typed.getEntity(userInput);
        console.log(`${userInput}: ${entity.state}`);
    } else {
        console.error(`Entity ${userInput} not found`);
    }
}

// Example 4: Domain-specific accessors
async function domainAccessorsExample(typed: TypedEngine) {
    const domains = createDomainAccessors(typed);

    // Get all climate entities
    console.log('=== Climate Entities ===');
    for (const [id, climate] of domains.climate) {
        console.log(`${id}:`);
        console.log(`  State: ${climate.state}`);
        console.log(`  Current: ${climate.attributes.current_temperature}°F`);
        console.log(`  Target: ${climate.attributes.temperature}°F`);
    }

    // Get all lights
    console.log('\n=== Light Entities ===');
    for (const [id, light] of domains.lights) {
        console.log(`${id}: ${light.state}`);
        if (light.attributes.brightness) {
            console.log(`  Brightness: ${light.attributes.brightness}`);
        }
    }

    // Get all sensors
    console.log('\n=== Sensor Entities ===');
    for (const [id, sensor] of domains.sensors) {
        const unit = sensor.attributes.unit_of_measurement || '';
        console.log(`${id}: ${sensor.state}${unit}`);
    }
}

// Example 5: Batch operations with type safety
async function batchOperationsExample(typed: TypedEngine) {
    const domains = createDomainAccessors(typed);

    // Set all climates to away mode
    console.log('Setting all climates to 60°F...');
    for (const [id, climate] of domains.climate) {
        try {
            await climate.set_temperature({ temperature: 60 });
            console.log(`✓ ${id}`);
        } catch (error) {
            console.error(`✗ ${id}: ${error}`);
        }
    }

    // Turn off all lights
    console.log('\nTurning off all lights...');
    for (const [id, light] of domains.lights) {
        try {
            await light.turn_off();
            console.log(`✓ ${id}`);
        } catch (error) {
            console.error(`✗ ${id}: ${error}`);
        }
    }
}

// Example 6: Working with entity IDs by domain
async function entityIdsByDomainExample(typed: TypedEngine) {
    // Get all climate entity IDs
    const climateIds = typed.getEntityIdsByDomain('climate');

    console.log(`Found ${climateIds.length} climate entities:`);
    for (const id of climateIds) {
        const climate = typed.getEntity(id);
        // TypeScript infers the correct type based on the entity ID
        console.log(`  ${id}: ${climate.state}`);
    }
}

// Example 7: Mixing typed and untyped access
async function mixedAccessExample(typed: TypedEngine, engine: JSEngine) {
    // Use typed wrapper for type-safe operations
    const office = typed.getEntity('climate.heatpump_office_heat_pump_office');
    await office.set_temperature({ temperature: 72 });

    // Access raw JSEngine when needed
    const rawEngine = typed.raw;

    // Can still use JSEngine's existing API
    console.log(`Engine started: ${(rawEngine as any).started}`);
}

// Example 8: Type-safe event handling with EventBus
async function eventHandlingExample(typed: TypedEngine) {
    // Access raw JSEngine to get EventBus functionality
    const engine = typed.raw;

    // Get entity for type information
    const office = typed.getEntity('climate.heatpump_office_heat_pump_office');

    // Subscribe to events (EventBus from existing JSEngine)
    // Note: This uses the getTopic functionality from JSEngine
    // which we can extend with types in the future
    console.log(`Monitoring ${office.entity_id}...`);
    console.log(`Current state: ${office.state}`);
    console.log(`Current temp: ${office.attributes.current_temperature}°F`);
}

// Example 9: Type-safe automation logic
async function automationExample(typed: TypedEngine) {
    const office = typed.getEntity('climate.heatpump_office_heat_pump_office');
    const basement = typed.getEntity('climate.basement');

    // Complex logic with full type safety
    const officeTemp = office.attributes.current_temperature;
    const basementTemp = basement.attributes.current_temperature;

    if (officeTemp > basementTemp + 5) {
        console.log('Office is much warmer than basement');
        await office.set_fan_mode({ fan_mode: 'high' });
    }

    // Type-safe comparison of valid enum values
    if (office.state === 'heat' && basement.state === 'off') {
        console.log('Basement is off while office is heating');
        await basement.turn_on();
    }
}

// Example 10: Error handling with type safety
async function errorHandlingExample(typed: TypedEngine) {
    const climate = typed.getEntity('climate.heatpump_office_heat_pump_office');

    try {
        // Type-safe service call
        await climate.set_temperature({
            temperature: 72,
            // TypeScript prevents invalid parameters
            // invalid_param: 'test',  // ❌ Compile error
        });
        console.log('Temperature set successfully');
    } catch (error) {
        console.error('Failed to set temperature:', error);
    }

    // Check supported features before calling services
    const supportedFeatures = climate.attributes.supported_features;
    console.log(`Supported features bitmask: ${supportedFeatures}`);

    // Future: Could add feature detection helpers
    // if (hasFeature(climate, CLIMATE_SUPPORT_TARGET_TEMPERATURE)) { ... }
}

// Main demo runner
async function main() {
    console.log('Typed JSEngine Demo\n');

    const logger = getLogger({ name: 'demo', level: 'info' });

    const engine = new JSEngine(
        {
            dir: './scripts',
            token: process.env.HASS_TOKEN,
            url: process.env.HASS_URL || 'http://homeassistant.local:8123',
        },
        logger
    );

    const typed = createTypedEngine(engine);

    console.log('Starting JSEngine...');
    await engine.start();

    console.log('\nRunning examples...\n');

    // Uncomment to run examples:
    // await entitiesMapExample(typed);
    // await runtimeValidationExample(typed);
    // await domainAccessorsExample(typed);
    // await batchOperationsExample(typed);
    // await entityIdsByDomainExample(typed);
    // await automationExample(typed);
    // await errorHandlingExample(typed);

    console.log('\nDemo complete');
}

// Export for use in other modules
export {
    basicExample,
    entitiesMapExample,
    runtimeValidationExample,
    domainAccessorsExample,
    batchOperationsExample,
    entityIdsByDomainExample,
    mixedAccessExample,
    eventHandlingExample,
    automationExample,
    errorHandlingExample,
};

// Run if executed directly
if (require.main === module) {
    main().catch(console.error);
}
