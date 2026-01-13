/**
 * Integration test for typed Light entities using GENERATED types.
 *
 * This test demonstrates the complete type generation system working end-to-end:
 * - Uses LightEntity from generated/types/entities/light.ts
 * - Uses LightServices from generated/types/services/light.ts
 * - Uses MyEntities interface mapping all 440 entities
 * - Tests against real Home Assistant instance via WebSocket
 * - Verifies type-safe service calls (turn_on, turn_off, toggle)
 *
 * Prerequisites:
 * - HASS_TOKEN environment variable must be set
 * - Home Assistant must be running and accessible
 * - light.s31_id1_switch (Couch Lamp) entity must exist
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { HomeAssistant } from '../engine/home-assistant';
import { Entity } from '../engine/entity';
import { EventBus } from '../util/event-bus';
import { getLogger } from '../logger/logger';
import { HaEventMap } from '../types/jsmodule';
import { waitForState } from '../engine/typed-entity';

// Import GENERATED types (from Phase 1-5 type generation system)
import type { MyEntities, AllEntityIds } from '../../generated/types/my-entities';
import type { LightEntity, LightState } from '../../generated/types/entities/light';
import type { LightServices } from '../../generated/types/services/light';

const COUCH_LAMP_ID = 'light.s31_id1_switch';
const HA_URL = process.env.HASS_URL || 'http://172.16.2.210:8123';

/**
 * Helper function to add delay between state changes.
 * Gives Home Assistant time to process state transitions.
 */
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('Typed Light Entity Integration (Using Generated Types)', () => {
    let ha: HomeAssistant;
    let services: Record<string, any> = {};
    let entities: Record<string, Entity> = {};
    let couchLampTopic: EventBus<HaEventMap>;

    const logger = getLogger({ source: 'test' });

    beforeAll(async () => {
        const token = process.env.HASS_TOKEN;
        if (!token) {
            throw new Error('HASS_TOKEN environment variable required. Set it before running tests.');
        }

        ha = new HomeAssistant({ token, url: HA_URL }, logger);
        couchLampTopic = new EventBus<HaEventMap>();

        // Set up event handlers and wait for initial data
        await new Promise<void>((resolve, reject) => {
            let servicesReady = false;
            let entitiesReady = false;
            let connectionReady = false;

            // Create service handlers in the format proxiedServices expects
            const createServiceHandlers = (svc: any) => {
                const handlers: Record<string, any> = {};
                for (const domain in svc) {
                    handlers[domain] = {};
                    for (const action in svc[domain]) {
                        const service = svc[domain][action];
                        const handler: any = {
                            name: service.name,
                            description: service.description,
                            fields: service.fields,
                            target: service.target,
                        };

                        // Map domains this service supports
                        if (service.target?.entity) {
                            handler.domain = {};
                            for (const entityTarget of service.target.entity) {
                                if (entityTarget.domain) {
                                    for (const d of entityTarget.domain) {
                                        handler.domain[d] = entityTarget;
                                    }
                                } else {
                                    handler.domain[domain] = entityTarget;
                                }
                            }
                        }

                        // Create the invoke function
                        if (service.target?.entity) {
                            handler.invoke = (entity_id: string, data = {}) => {
                                return ha.callService(domain, action, data, { entity_id });
                            };
                        } else {
                            handler.invoke = (data = {}) => {
                                return ha.callService(domain, action, data);
                            };
                        }

                        handlers[domain][action] = (...args: any[]) => handler.invoke(...args);
                        handlers[domain][action].domain = handler.domain;
                    }
                }
                return handlers;
            };

            let resolved = false;
            const checkReady = () => {
                if (resolved) return;
                if (servicesReady && entitiesReady && connectionReady) {
                    resolved = true;
                    // Re-wrap all entities with services now that both are loaded
                    for (const id in entities) {
                        const entity = entities[id];
                        // Only wrap if not already wrapped (check for proxiedServices method)
                        if (typeof entity.proxiedServices === 'function') {
                            entities[id] = entity.proxiedServices(services);
                        }
                    }
                    resolve();
                }
            };

            ha.on('services-updated', (svc: any) => {
                logger.info('Services updated');
                services = createServiceHandlers(svc) as any;
                servicesReady = true;
                checkReady();
            });

            ha.on('entities-updated', (ents: any) => {
                logger.info(`Entities updated: ${Object.keys(ents).length} entities`);

                for (const id in ents) {
                    let entity = entities[id];
                    const oldState = entity?.state;

                    if (!entity) {
                        entity = new Entity(id);
                        entities[id] = entity;
                    }

                    entity.update(ents[id]);
                    entity.update({ name: ents[id].attributes?.friendly_name });

                    // Publish state change event for Couch Lamp
                    if (id === COUCH_LAMP_ID && oldState !== undefined && oldState !== entity.state) {
                        logger.info(`${id}: ${oldState} -> ${entity.state}`);
                        couchLampTopic.publish('state-changed', {
                            id,
                            event: 'state-changed',
                            state: entity.state,
                            changed: true,
                            entity: entity as any,
                            oldEntity: { ...entity, state: oldState } as any,
                            oldState,
                        });
                    }
                }

                entitiesReady = true;
                checkReady();
            });

            ha.on('connection-ready', () => {
                logger.info('Connection ready');
                connectionReady = true;
                checkReady();
            });

            ha.on('connection-reconnect-error', () => {
                reject(new Error('Failed to connect to Home Assistant'));
            });

            // Connect with timeout
            const timeout = setTimeout(() => reject(new Error('Connection timeout after 15s')), 15000);
            ha.connect()
                .then(() => clearTimeout(timeout))
                .catch(reject);
        });

        logger.info('Test setup complete');
    }, 20000); // 20s timeout for beforeAll

    afterAll(async () => {
        if (ha) {
            logger.info('Stopping Home Assistant connection');
            await ha.stop();
        }
    });

    // Create fresh topic before each test to avoid event history replay issues
    beforeEach(() => {
        couchLampTopic = new EventBus<HaEventMap>();
    });

    // Add delay after each test to prevent rapid light flashing
    afterEach(async () => {
        logger.info('Waiting 1 second between tests...');
        await delay(1000);
    });

    it('should get the Couch Lamp entity with typed state (using generated types)', () => {
        const rawEntity = entities[COUCH_LAMP_ID];
        expect(rawEntity).toBeDefined();

        // Cast to generated LightEntity type
        const couchLamp = rawEntity as unknown as LightEntity;

        // Type assertions - these would fail at compile time if types are wrong
        expect(couchLamp.entity_id).toBe(COUCH_LAMP_ID);
        expect(couchLamp.domain).toBe('light');
        expect(['on', 'off', 'unavailable', 'unknown']).toContain(couchLamp.state);
        expect(couchLamp.attributes.friendly_name).toBe('Couch Lamp');
        expect(couchLamp.attributes.supported_color_modes).toContain('onoff');

        logger.info(`Couch Lamp state: ${couchLamp.state}`);
        logger.info(`Couch Lamp attributes: ${JSON.stringify(couchLamp.attributes)}`);
    });

    it('should have typed service methods on the proxied entity (using generated types)', () => {
        const rawEntity = entities[COUCH_LAMP_ID];
        const couchLamp = rawEntity as unknown as LightEntity;

        // These methods should exist via proxiedServices
        expect(typeof couchLamp.turn_on).toBe('function');
        expect(typeof couchLamp.turn_off).toBe('function');
        expect(typeof couchLamp.toggle).toBe('function');
    });

    it('should toggle the Couch Lamp and verify state changes (using generated types)', async () => {
        const rawEntity = entities[COUCH_LAMP_ID];
        const couchLamp = rawEntity as unknown as LightEntity;

        // Record original state
        const originalState = couchLamp.state as 'on' | 'off';
        expect(['on', 'off']).toContain(originalState);

        const expectedStateAfterToggle: LightState = originalState === 'on' ? 'off' : 'on';

        logger.info(`Couch Lamp current state: ${originalState}`);
        logger.info(`Toggling to: ${expectedStateAfterToggle}`);

        // Set up the state change listener BEFORE triggering the action
        const stateChangePromise = waitForState(couchLampTopic, expectedStateAfterToggle, 10000);

        // Toggle the light (using generated service method)
        await couchLamp.toggle();
        logger.info('Toggle command sent');

        // Wait for state change event
        const event = await stateChangePromise;

        expect(event.state).toBe(expectedStateAfterToggle);
        expect(event.oldState).toBe(originalState);

        logger.info(`State changed: ${event.oldState} -> ${event.state}`);

        // Verify entity state is updated
        expect(couchLamp.state).toBe(expectedStateAfterToggle);

        // Add delay before toggling back
        await delay(1000);
        logger.info('Waiting 1 second before toggling back...');

        // Toggle back to original state
        logger.info(`Toggling back to: ${originalState}`);

        const restorePromise = waitForState(couchLampTopic, originalState, 10000);
        await couchLamp.toggle();
        const restoreEvent = await restorePromise;

        expect(restoreEvent.state).toBe(originalState);
        logger.info(`Restored to original state: ${couchLamp.state}`);
    }, 25000); // 25s timeout for this test

    it('should call turn_on with typed parameters (using generated types)', async () => {
        const rawEntity = entities[COUCH_LAMP_ID];
        const couchLamp = rawEntity as unknown as LightEntity;

        // If already on, turn off first
        if (couchLamp.state === 'on') {
            logger.info('Light is on, turning off first');
            const offPromise = waitForState(couchLampTopic, 'off', 10000);
            await couchLamp.turn_off();
            await offPromise;
            await delay(1000);
            logger.info('Waiting 1 second after turning off...');
        }

        // Now turn on with typed params (empty for onoff-only light)
        logger.info('Calling turn_on()');
        const onPromise = waitForState(couchLampTopic, 'on', 10000);
        await couchLamp.turn_on({}); // TypeScript validates the params shape using generated types
        const event = await onPromise;

        expect(event.state).toBe('on');
        expect(couchLamp.state).toBe('on');
        logger.info('turn_on() succeeded');
    }, 25000);

    it('should call turn_off with typed parameters (using generated types)', async () => {
        const rawEntity = entities[COUCH_LAMP_ID];
        const couchLamp = rawEntity as unknown as LightEntity;

        // Ensure light is on first
        if (couchLamp.state === 'off') {
            logger.info('Light is off, turning on first');
            const onPromise = waitForState(couchLampTopic, 'on', 10000);
            await couchLamp.turn_on();
            await onPromise;
            await delay(1000);
            logger.info('Waiting 1 second after turning on...');
        }

        // Turn off with typed params
        logger.info('Calling turn_off()');
        const offPromise = waitForState(couchLampTopic, 'off', 10000);
        await couchLamp.turn_off({}); // Could also pass { transition: 1 } etc. - validated by generated types
        const event = await offPromise;

        expect(event.state).toBe('off');
        expect(couchLamp.state).toBe('off');
        logger.info('turn_off() succeeded');
    }, 25000);
});
