import { Entity } from './entity';
import { HaAttributes } from '../types/ha-types';
import { EventBus } from '../util/event-bus';
import { HaEventMap } from '../types/jsmodule';

/**
 * Type assertion function to cast an Entity to a typed entity.
 * Use this when retrieving entities from the JSEngine.
 *
 * @example
 * ```typescript
 * const couchLamp = asTypedEntity<LightState, LightAttributes, LightServices>(
 *   JSEngine.Entities['light.s31_id1_switch']
 * );
 * await couchLamp.toggle(); // Type-safe!
 * ```
 */
export function asTypedEntity<
    TState extends string,
    TAttributes extends HaAttributes,
    TServices,
>(entity: Entity): Entity & { state: TState; attributes: TAttributes } & TServices {
    return entity as any;
}

/**
 * Wait for an entity to reach a specific state.
 * Uses the EventBus subscription pattern with timeout.
 *
 * @param topic - EventBus topic for the entity
 * @param expectedState - The state to wait for
 * @param timeoutMs - Timeout in milliseconds (default 5000)
 * @returns Promise that resolves with the state-changed event
 *
 * @example
 * ```typescript
 * const topic = getTopic('light.s31_id1_switch');
 * await entity.toggle();
 * const event = await waitForState(topic, 'off', 10000);
 * console.log(`Changed from ${event.oldState} to ${event.state}`);
 * ```
 */
export function waitForState(
    topic: EventBus<HaEventMap>,
    expectedState: string,
    timeoutMs = 5000
): Promise<HaEventMap['state-changed']> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Timeout waiting for state "${expectedState}" after ${timeoutMs}ms`));
        }, timeoutMs);

        // Subscribe to state-changed events
        // EventBus will replay recent events, so if state already changed, we'll get it
        const unsubscribe = topic.subscribe('state-changed', (event) => {
            if (event.state === expectedState) {
                clearTimeout(timeout);
                resolve(event);
            }
        });
    });
}

/**
 * Wait for any state change on an entity.
 *
 * @param topic - EventBus topic for the entity
 * @param timeoutMs - Timeout in milliseconds (default 5000)
 * @returns Promise that resolves with the state-changed event
 */
export function waitForAnyStateChange(
    topic: EventBus<HaEventMap>,
    timeoutMs = 5000
): Promise<HaEventMap['state-changed']> {
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            reject(new Error(`Timeout waiting for state change after ${timeoutMs}ms`));
        }, timeoutMs);

        const unsubscribe = topic.subscribe('state-changed', (event) => {
            clearTimeout(timeout);
            resolve(event);
        });
    });
}

/**
 * Create a promise that resolves when the entity reaches a target state,
 * but set up BEFORE triggering the action to avoid race conditions.
 *
 * @example
 * ```typescript
 * const [promise, trigger] = createStateWaiter(topic, 'off');
 * await entity.turn_off();  // Trigger the action
 * trigger();                // Start listening (call after action to avoid replays)
 * await promise;            // Wait for state change
 * ```
 */
export function createStateWaiter(
    topic: EventBus<HaEventMap>,
    expectedState: string,
    timeoutMs = 5000
): [Promise<HaEventMap['state-changed']>, () => void] {
    let startListening: () => void;
    let rejectFn: (err: Error) => void;

    const promise = new Promise<HaEventMap['state-changed']>((resolve, reject) => {
        rejectFn = reject;

        startListening = () => {
            const timeout = setTimeout(() => {
                reject(new Error(`Timeout waiting for state "${expectedState}" after ${timeoutMs}ms`));
            }, timeoutMs);

            topic.subscribe('state-changed', (event) => {
                if (event.state === expectedState) {
                    clearTimeout(timeout);
                    resolve(event);
                }
            });
        };
    });

    return [promise, startListening!];
}
