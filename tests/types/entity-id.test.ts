import { describe, it, expectTypeOf } from 'vitest';
import type { EntityId, HaEntity, PowerState, AvailabilityState, LockState } from '../../src/types/ha-types';
import type { HaEventMap } from '../../src/types/jsmodule';

describe('EntityId phantom type', () => {
  it('is assignable from a cast string', () => {
    type TestEntity = HaEntity & { state: PowerState };
    const id = 'light.test' as EntityId<TestEntity>;
    expectTypeOf(id).toMatchTypeOf<string>();
  });

  it('PowerState is on | off', () => {
    expectTypeOf<PowerState>().toEqualTypeOf<'on' | 'off'>();
  });

  it('AvailabilityState is available | unavailable', () => {
    expectTypeOf<AvailabilityState>().toEqualTypeOf<'available' | 'unavailable'>();
  });

  it('LockState is locked | unlocked', () => {
    expectTypeOf<LockState>().toEqualTypeOf<'locked' | 'unlocked'>();
  });
});

describe('HaEventMap generic', () => {
  it('narrows entity and state to T', () => {
    type TestEntity = HaEntity & { state: 'on' | 'off'; domain: 'light' };
    type StateChanged = HaEventMap<TestEntity>['state-changed'];

    expectTypeOf<StateChanged['state']>().toEqualTypeOf<'on' | 'off'>();
    expectTypeOf<StateChanged['entity']>().toEqualTypeOf<TestEntity>();
  });
});
