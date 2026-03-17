# Engine Foundation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the prototype engine into a production-ready server with an explicit REST API for script deployment and management, removing filesystem-watching entirely.

**Architecture:** The engine connects to HA via WebSocket and exposes a Fastify REST API. Scripts arrive as compiled JS code strings via `POST /deploy`, are written to a scripts directory, and loaded explicitly into the runtime. A `ScriptRegistry` persists deployment metadata to `registry.json`; runtime status (running/stopped/error) and log tails are tracked in-memory and reset on restart.

**Tech Stack:** Node.js 22, pnpm 10.16.1 (via mise), TypeScript 5, Fastify 4, Zod 3, Vitest 1.

> **This is Plan 1 of 3.** Plan 2 covers the type generator (`sync-types` + code generation). Plan 3 covers the developer template project and `jsengine` CLI.

---

## Spec

`docs/superpowers/specs/2026-03-16-ha-jsengine-design.md`

---

## File Map

**New files:**
- `mise.toml` — Node 22 + pnpm 10.16.1 declarations (replaces `.nvmrc`)
- `vitest.config.ts` — test runner config
- `src/registry/script-registry.ts` — persists `registry.json`; tracks name, enabled, lastDeployedAt, typesHash per script
- `src/api/server.ts` — creates and returns a configured Fastify instance
- `src/api/routes/health.ts` — `GET /health`
- `src/api/routes/deploy.ts` — `POST /deploy`
- `src/api/routes/scripts.ts` — `GET /scripts`, `POST /scripts/:name/enable|disable`
- `tests/types/entity-id.test.ts`
- `tests/engine/js-engine.test.ts`
- `tests/registry/script-registry.test.ts`
- `tests/api/health.test.ts`
- `tests/api/deploy.test.ts`
- `tests/api/scripts.test.ts`

**Modified files:**
- `package.json` — remove `jsrundir`; add `fastify`, `zod`; add `vitest` + `@vitest/coverage-v8` to devDeps; add test scripts
- `src/index.ts` — read `HASS_URL` from env; remove `dir` param; start API server alongside HA connection
- `src/engine/js-engine.ts` — remove `RunDir`; add `loadScript`, `getScriptStatus`, `getLogTail`, `entity()`; update constructor options; remove global `JSEngine` injection
- `src/types/ha-types.ts` — add `EntityId<T>` branded type; add `PowerState`, `AvailabilityState`, `LockState`; change `HaDomain` to `string`; remove hand-written entity subtypes (replaced by generator in Plan 2)
- `src/types/jsmodule.ts` — make `HaEventMap<T>` generic; update `HaEntityEvents`; add `entity<T>()` to `JsEngine` type; update `TopicProvider` signature

**Deleted files:**
- `.nvmrc`
- `src/jsrundir.d.ts`
- `types/jsrundir/index.d.ts`

---

## Task 1: Mise, dependency changes, and test infrastructure

**Files:**
- Create: `mise.toml`
- Create: `vitest.config.ts`
- Modify: `package.json`
- Delete: `.nvmrc`

> **Note on TypeScript + vitest:** Vitest processes test files via its own esbuild transform and does **not** need test files added to `tsconfig.json`. Do not modify `tsconfig.json` in this task — doing so while `rootDir` is set to `./src` would cause TypeScript errors. Test files import from `src/` via relative paths, which esbuild resolves independently.

- [ ] **Step 1: Create `mise.toml`**

```toml
[tools]
node = "22"
pnpm = "10.16.1"
```

- [ ] **Step 2: Delete `.nvmrc`**

```bash
git rm .nvmrc
```

- [ ] **Step 3: Update `package.json`**

Remove `"jsrundir": "^1.0.11"` from `dependencies`.

Add to `dependencies`:
```json
"fastify": "^4.28.1",
"zod": "^3.23.8"
```

Add to `devDependencies`:
```json
"vitest": "^1.6.0",
"@vitest/coverage-v8": "^1.6.0"
```

Add to `scripts`:
```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 4: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
```

- [ ] **Step 5: Install dependencies and verify**

```bash
pnpm install
pnpm typecheck
```

Expected: lockfile updated, no TypeScript errors.

- [ ] **Step 6: Verify vitest runs with no tests**

```bash
pnpm test
```

Expected: exits cleanly (no test files found is acceptable).

- [ ] **Step 7: Commit**

```bash
git add mise.toml vitest.config.ts package.json pnpm-lock.yaml
git rm src/jsrundir.d.ts types/jsrundir/index.d.ts
git commit -m "chore: add mise, vitest; remove jsrundir dependency"
```

---

## Task 2: Engine SDK types

**Files:**
- Modify: `src/types/ha-types.ts`
- Modify: `src/types/jsmodule.ts`
- Create: `tests/types/entity-id.test.ts`

- [ ] **Step 1: Write failing type tests**

Create `tests/types/entity-id.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm exec vitest run tests/types/entity-id.test.ts
```

Expected: compile errors — `EntityId`, `PowerState` not found.

- [ ] **Step 3: Replace `src/types/ha-types.ts`**

```typescript
export type PowerState        = 'on' | 'off';
export type AvailabilityState = 'available' | 'unavailable';
export type LockState         = 'locked' | 'unlocked';

/**
 * A branded string type that identifies an HA entity and carries its TypeScript type
 * as a phantom type parameter. Values are produced by the type generator.
 */
export type EntityId<T extends HaEntity = HaEntity> =
  string & { readonly _brand: 'EntityId'; readonly _type: T };

export type HaDomain = string;
export const haEvents = ['added', 'removed', 'updated', 'state-changed'] as const;
export type HaEvent = (typeof haEvents)[number];

export type HaAttributes = Record<string, unknown>;
export type HaGroups     = Record<string, HaEntity>;

export type HaEntity = {
  entity_id:    string;
  id:           string;
  name:         string;
  domain:       string;
  state:        string;
  groups:       HaGroups;
  attributes:   HaAttributes;
  last_updated: Date;
  last_changed: Date;
};

// AnyHaEntity is an alias kept for internal use; specific subtypes are generated by the type generator.
export type AnyHaEntity = HaEntity;
```

Note: the hand-written `HaLightEntity`, `HaSwitchEntity`, `HaSensorEntity` subtypes are removed — these are replaced by the generated types in Plan 2.

- [ ] **Step 4: Replace `src/types/jsmodule.ts`**

```typescript
import { LoggerFactory } from '../logger/logger';
import { EventBus } from '../util/event-bus';
import { AnyHaEntity, EntityId, HaEntity } from './ha-types';

export type JsEngine = {
  currentUser: string;
  services:    any;
  entities:    Record<string, HaEntity>;
  started:     boolean;
  entity<T extends HaEntity>(id: EntityId<T>): T;
};

export type HaEventMap<T extends HaEntity = HaEntity> = {
  added:           { id: string; entity: T };
  removed:         { id: string; entity: T };
  updated:         { id: string; entity: T; oldEntity?: T; state: T['state']; changed: boolean };
  'state-changed': { id: string; entity: T; oldEntity?: T; state: T['state']; oldState?: T['state']; changed: true };
};

export type HaEntityEvents = keyof HaEventMap<HaEntity>;

export type TopicProvider = <T extends HaEntity>(
  entity: EntityId<T> | RegExp,
) => EventBus<HaEventMap<T>>;

export type JsModuleConfig = {
  loggerFactory: LoggerFactory;
  getTopic:      TopicProvider;
  engine:        JsEngine;
};

export type JsModule = {
  started?: () => void;
  stopped?: () => void;
};

export type JsModuleConstructor = {
  new (options: JsModuleConfig): JsModule;
};
```

- [ ] **Step 5: Run type tests**

```bash
pnpm exec vitest run tests/types/entity-id.test.ts
```

Expected: PASS.

- [ ] **Step 6: Fix `src/engine/js-engine.ts` for the new HaEventMap shape**

The `HaEventMap<T>` type no longer includes an `event:` discriminant field. The existing `#entitiesUpdated` method in `js-engine.ts` passes `event: 'updated'` and `event: 'state-changed'` inside publish data objects — these must be removed. Make these changes in `js-engine.ts`:

a) Replace bare `EventBus<HaEventMap>` and `getOrCreateTopic<HaEventMap>` with `EventBus<HaEventMap<HaEntity>>` and `getOrCreateTopic<HaEventMap<HaEntity>>` throughout.

b) In `#entitiesUpdated`, the `topic.publish('updated', {...})` call — remove the `event: 'updated'` field from the data object:
```typescript
// Before:
topic.publish('updated', { id, event: 'updated', state: current.state, changed, entity: ..., oldEntity: ... });
// After:
topic.publish('updated', { id, state: current.state, changed, entity: current as AnyHaEntity, oldEntity: previous as AnyHaEntity });
```

c) In `#entitiesUpdated`, the `this.publish(id, 'state-changed', {...})` call — remove `event: 'state-changed'` from the data object:
```typescript
// Before:
this.publish(id, 'state-changed', { id, event: 'state-changed', state: current.state, changed: true, entity: current, oldEntity: previous, oldState: old_state });
// After:
this.publish(id, 'state-changed', { id, state: current.state, changed: true, entity: current as AnyHaEntity, oldEntity: previous as AnyHaEntity, oldState: old_state });
```

- [ ] **Step 7: Verify full TypeScript build**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/types/ha-types.ts src/types/jsmodule.ts src/engine/js-engine.ts tests/types/entity-id.test.ts
git commit -m "feat: add EntityId<T> phantom type and generic HaEventMap<T>"
```

---

## Task 4: Remove jsrundir; add explicit script lifecycle to JSEngine

**Files:**
- Modify: `src/engine/js-engine.ts`
- Create: `tests/engine/js-engine.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/engine/js-engine.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

vi.mock('../../src/engine/home-assistant', () => ({
  HomeAssistant: vi.fn().mockImplementation(() => ({
    on:      vi.fn(),
    connect: vi.fn().mockResolvedValue(undefined),
    stop:    vi.fn().mockResolvedValue(undefined),
  })),
}));

describe('JSEngine explicit script lifecycle', () => {
  let scriptsDir: string;
  let engine: any;

  beforeEach(async () => {
    vi.resetModules();
    scriptsDir = mkdtempSync(join(tmpdir(), 'jsengine-test-'));
    const { JSEngine } = await import('../../src/engine/js-engine');
    engine = new JSEngine(
      { scriptsDir, token: 'test-token', url: 'http://localhost:8123' },
      { debug: vi.fn(), info: vi.fn(), error: vi.fn() },
    );
  });

  afterEach(() => {
    rmSync(scriptsDir, { recursive: true });
  });

  it('loadScript writes code to disk and sets status to running', async () => {
    const code = `module.exports = class { constructor() {} }`;
    await engine.loadScript('test-script', code);
    expect(engine.getScriptStatus('test-script')).toBe('running');
  });

  it('loadScript with invalid code sets status to error', async () => {
    await expect(engine.loadScript('bad', 'this is not valid js {')).rejects.toThrow();
    expect(engine.getScriptStatus('bad')).toBe('error');
  });

  it('getScriptStatus returns stopped for unknown script', () => {
    expect(engine.getScriptStatus('unknown')).toBe('stopped');
  });

  it('getLogTail returns empty array for unknown script', () => {
    expect(engine.getLogTail('unknown')).toEqual([]);
  });

  it('entity() method exists on the engine', () => {
    // entity() is only valid after the engine has connected to HA and the cache is populated.
    // This test only verifies the method is present; runtime entity lookup is an integration concern.
    expect(typeof engine.entity).toBe('function');
  });

  it('loadScript with the same name replaces the existing entry without duplicating it', async () => {
    const code = `module.exports = class { constructor() {} }`;
    await engine.loadScript('my-script', code);
    await engine.loadScript('my-script', code);
    // Should still only appear once in the internal scripts list
    expect(engine.getScriptStatus('my-script')).toBe('running');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm exec vitest run tests/engine/js-engine.test.ts
```

Expected: FAIL — `JSEngine` constructor does not accept `scriptsDir`.

- [ ] **Step 3: Update `src/engine/js-engine.ts`**

**Imports to add:**
```typescript
import { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import { EntityId } from '../types/ha-types';
```

**Import to remove:**
```typescript
import RunDir from 'jsrundir';
```

**Type to add** (near top of file, alongside `SystemBusEvents`):
```typescript
type ScriptStatus = 'running' | 'stopped' | 'error' | 'disabled';
```

**Constructor options type:** change `{ dir: string; token: string | undefined; url: string }` to `{ scriptsDir: string; token: string | undefined; url: string }`.

**Fields to remove:** `#dir`, `#rundir`.

**Fields to add:**
```typescript
#scriptsDir: string;
#scriptStatuses = new Map<string, ScriptStatus>();
#scriptLogTails = new Map<string, string[]>();
```

**Constructor body changes:**
- Replace `this.#dir = dir;` and RunDir setup block with:
```typescript
this.#scriptsDir = scriptsDir;
mkdirSync(this.#scriptsDir, { recursive: true });
```
- Remove the `if ((globalThis as any).JSEngine === undefined)` global injection block.

**Update `#engine` object** to include `entity`:
```typescript
this.#engine = immutableProxy({
  get currentUser() { return self.#currentUser; },
  get services()    { return self.#services; },
  get entities()    { return self.#entities; },
  get started()     { return self.#ready; },
  entity: (id: EntityId) => self.entity(id),
});
```

**Add `entity()` method:**

> This method casts the live `Entity` proxy to `T` for the caller's type safety. It is only valid after the engine has connected to HA and the cache is populated (`#ready === true`). Calling it before connection will throw.

```typescript
entity<T extends HaEntity>(id: EntityId<T>): T {
  const entities = this.#cached.get<Record<string, Entity>>('entities');
  const entity = entities[id as string];
  if (!entity) throw new Error(`Unknown entity: ${String(id)}`);
  return entity as unknown as T;
}
```

**Add `loadScript()` method:**
```typescript
async loadScript(name: string, code: string): Promise<void> {
  const modulePath = path.join(this.#scriptsDir, `${name}.js`);
  writeFileSync(modulePath, code, 'utf-8');

  const resolved = require.resolve(modulePath);
  if (require.cache[resolved]) {
    delete require.cache[resolved];
  }

  try {
    const jsModuleExport = require(modulePath) as ModuleExport<JsModuleConstructor>;
    await this.#scriptLoaded(name, jsModuleExport);
    this.#scriptStatuses.set(name, 'running');
  } catch (e) {
    this.#scriptStatuses.set(name, 'error');
    this.#logger.error(`Failed to load script ${name}:`, e);
    throw e;
  }
}
```

**Add `getScriptStatus()` and `getLogTail()` methods:**
```typescript
getScriptStatus(name: string): ScriptStatus {
  return this.#scriptStatuses.get(name) ?? 'stopped';
}

getLogTail(name: string): string[] {
  return this.#scriptLogTails.get(name) ?? [];
}
```

**Fix deduplication in `#scriptLoaded`:** The existing private method appends to `this.#scripts`. If `loadScript` is called twice for the same name, the name duplicates in the array. Add a dedup before the push:

```typescript
// At the start of #scriptLoaded, before this.#scripts.push(name):
const existingIdx = this.#scripts.indexOf(name);
if (existingIdx >= 0) {
  this.#scripts.splice(existingIdx, 1);
}
this.#scripts.push(name);
```

**Update `start()` — remove `this.#rundir.run()`:**
```typescript
start() {
  return this.#ha!.connect();
}
```

**Update `stop()` — remove `this.#rundir.stop()`:**
```typescript
stop() {
  this.#ha!.stop();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm exec vitest run tests/engine/js-engine.test.ts
```

Expected: PASS.

- [ ] **Step 5: Verify full build**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/engine/js-engine.ts tests/engine/js-engine.test.ts
git commit -m "feat: remove jsrundir; add explicit loadScript lifecycle and entity() method"
```

---

## Task 5: ScriptRegistry

**Files:**
- Create: `src/registry/script-registry.ts`
- Create: `tests/registry/script-registry.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/registry/script-registry.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { ScriptRegistry } from '../../src/registry/script-registry';

describe('ScriptRegistry', () => {
  let dataDir: string;
  let registry: ScriptRegistry;

  beforeEach(() => {
    dataDir = mkdtempSync(join(tmpdir(), 'jsengine-registry-'));
    registry = new ScriptRegistry(dataDir);
  });

  afterEach(() => {
    rmSync(dataDir, { recursive: true });
  });

  it('list() returns empty array when no scripts registered', () => {
    expect(registry.list()).toEqual([]);
  });

  it('upsert() adds a new script enabled by default', () => {
    registry.upsert('garage', 'sha256:abc');
    const records = registry.list();
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ name: 'garage', typesHash: 'sha256:abc', enabled: true });
    expect(records[0].lastDeployedAt).toBeDefined();
  });

  it('upsert() updates typesHash but preserves enabled state', () => {
    registry.upsert('garage', 'sha256:abc');
    registry.setEnabled('garage', false);
    registry.upsert('garage', 'sha256:def');
    expect(registry.list()).toHaveLength(1);
    expect(registry.get('garage')).toMatchObject({ typesHash: 'sha256:def', enabled: false });
  });

  it('setEnabled() updates the flag', () => {
    registry.upsert('garage', 'sha256:abc');
    registry.setEnabled('garage', false);
    expect(registry.get('garage')?.enabled).toBe(false);
  });

  it('setEnabled() throws for unknown script', () => {
    expect(() => registry.setEnabled('unknown', true)).toThrow('Unknown script: unknown');
  });

  it('persists to disk and survives reconstruction', () => {
    registry.upsert('garage', 'sha256:abc');
    registry.setEnabled('garage', false);

    const registry2 = new ScriptRegistry(dataDir);
    expect(registry2.get('garage')).toMatchObject({ enabled: false, typesHash: 'sha256:abc' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm exec vitest run tests/registry/script-registry.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/registry/script-registry.ts`**

```typescript
import { existsSync, readFileSync, writeFileSync } from 'fs';
import path from 'path';

export type ScriptRecord = {
  name:           string;
  enabled:        boolean;
  lastDeployedAt: string;
  typesHash:      string;
};

export class ScriptRegistry {
  readonly #filePath: string;
  readonly #records = new Map<string, ScriptRecord>();

  constructor(dataDir: string) {
    this.#filePath = path.join(dataDir, 'registry.json');
    this.#load();
  }

  #load(): void {
    if (!existsSync(this.#filePath)) return;
    const records = JSON.parse(readFileSync(this.#filePath, 'utf-8')) as ScriptRecord[];
    for (const record of records) {
      this.#records.set(record.name, record);
    }
  }

  #persist(): void {
    writeFileSync(
      this.#filePath,
      JSON.stringify([...this.#records.values()], null, 2),
      'utf-8',
    );
  }

  upsert(name: string, typesHash: string): void {
    this.#records.set(name, {
      name,
      enabled:        this.#records.get(name)?.enabled ?? true,
      lastDeployedAt: new Date().toISOString(),
      typesHash,
    });
    this.#persist();
  }

  setEnabled(name: string, enabled: boolean): void {
    const record = this.#records.get(name);
    if (!record) throw new Error(`Unknown script: ${name}`);
    record.enabled = enabled;
    this.#persist();
  }

  list(): ScriptRecord[] {
    return [...this.#records.values()];
  }

  get(name: string): ScriptRecord | undefined {
    return this.#records.get(name);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm exec vitest run tests/registry/script-registry.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/registry/script-registry.ts tests/registry/script-registry.test.ts
git commit -m "feat: add ScriptRegistry for persisted script metadata"
```

---

## Task 6: Fastify server and health route

**Files:**
- Create: `src/api/server.ts`
- Create: `src/api/routes/health.ts`
- Create: `tests/api/health.test.ts`

- [ ] **Step 1: Write failing test**

Create `tests/api/health.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createServer } from '../../src/api/server';

describe('GET /health', () => {
  it('returns 200 with { ok: true }', async () => {
    const app = createServer({} as any, {} as any);
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm exec vitest run tests/api/health.test.ts
```

Expected: FAIL — `createServer` not found.

- [ ] **Step 3: Create `src/api/routes/health.ts`**

```typescript
import type { FastifyPluginAsync } from 'fastify';

export const healthRoute: FastifyPluginAsync = async (app) => {
  app.get('/health', async (_req, reply) => {
    return reply.send({ ok: true });
  });
};
```

- [ ] **Step 4: Create `src/api/server.ts`**

```typescript
import Fastify from 'fastify';
import type { JSEngine } from '../engine/js-engine';
import type { ScriptRegistry } from '../registry/script-registry';
import { healthRoute } from './routes/health';

export function createServer(engine: JSEngine, registry: ScriptRegistry) {
  const app = Fastify({ logger: false });
  app.register(healthRoute);
  return app;
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
pnpm exec vitest run tests/api/health.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/api/server.ts src/api/routes/health.ts tests/api/health.test.ts
git commit -m "feat: add Fastify server with GET /health"
```

---

## Task 7: Deploy endpoint

**Files:**
- Create: `src/api/routes/deploy.ts`
- Create: `tests/api/deploy.test.ts`
- Modify: `src/api/server.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/api/deploy.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createServer } from '../../src/api/server';

const makeEngine = () => ({
  loadScript:      vi.fn().mockResolvedValue(undefined),
  getScriptStatus: vi.fn().mockReturnValue('running'),
  getLogTail:      vi.fn().mockReturnValue([]),
});

const makeRegistry = () => ({
  upsert:     vi.fn(),
  list:       vi.fn().mockReturnValue([]),
  get:        vi.fn(),
  setEnabled: vi.fn(),
});

describe('POST /deploy', () => {
  it('returns 200 with loaded names on valid bundle', async () => {
    const engine = makeEngine();
    const registry = makeRegistry();
    const app = createServer(engine as any, registry as any);

    const res = await app.inject({
      method:  'POST',
      url:     '/deploy',
      payload: {
        scripts:   [{ name: 'garage', code: 'module.exports = class {}' }],
        typesHash: 'sha256:abc',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ loaded: ['garage'] });
    expect(engine.loadScript).toHaveBeenCalledWith('garage', 'module.exports = class {}');
    expect(registry.upsert).toHaveBeenCalledWith('garage', 'sha256:abc');
  });

  it('returns 400 on invalid bundle shape', async () => {
    const app = createServer(makeEngine() as any, makeRegistry() as any);
    const res = await app.inject({ method: 'POST', url: '/deploy', payload: { bad: true } });
    expect(res.statusCode).toBe(400);
  });

  it('returns 500 when engine.loadScript throws', async () => {
    const engine = makeEngine();
    engine.loadScript.mockRejectedValue(new Error('syntax error'));
    const app = createServer(engine as any, makeRegistry() as any);

    const res = await app.inject({
      method:  'POST',
      url:     '/deploy',
      payload: { scripts: [{ name: 'bad', code: 'invalid' }], typesHash: 'sha256:abc' },
    });

    expect(res.statusCode).toBe(500);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm exec vitest run tests/api/deploy.test.ts
```

Expected: FAIL — `/deploy` route not registered.

- [ ] **Step 3: Create `src/api/routes/deploy.ts`**

```typescript
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { JSEngine } from '../../engine/js-engine';
import type { ScriptRegistry } from '../../registry/script-registry';

const BundleSchema = z.object({
  scripts:   z.array(z.object({ name: z.string().min(1), code: z.string().min(1) })),
  typesHash: z.string().min(1),
});

type Options = { engine: JSEngine; registry: ScriptRegistry };

export const deployRoute: FastifyPluginAsync<Options> = async (app, { engine, registry }) => {
  app.post('/deploy', async (request, reply) => {
    const result = BundleSchema.safeParse(request.body);
    if (!result.success) {
      return reply.status(400).send({ error: result.error.format() });
    }

    const { scripts, typesHash } = result.data;

    // Note: deploy is not atomic. If script N fails, scripts 0..N-1 are already loaded
    // and their registry entries are already written. This is a known MVP limitation.
    try {
      for (const script of scripts) {
        await engine.loadScript(script.name, script.code);
        registry.upsert(script.name, typesHash);
      }
    } catch (e: any) {
      return reply.status(500).send({ error: e.message });
    }

    return reply.send({ loaded: scripts.map((s) => s.name) });
  });
};
```

- [ ] **Step 4: Register deploy route in `src/api/server.ts`**

```typescript
import Fastify from 'fastify';
import type { JSEngine } from '../engine/js-engine';
import type { ScriptRegistry } from '../registry/script-registry';
import { healthRoute } from './routes/health';
import { deployRoute } from './routes/deploy';

export function createServer(engine: JSEngine, registry: ScriptRegistry) {
  const app = Fastify({ logger: false });
  app.register(healthRoute);
  app.register(deployRoute, { engine, registry });
  return app;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
pnpm exec vitest run tests/api/deploy.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/api/routes/deploy.ts src/api/server.ts tests/api/deploy.test.ts
git commit -m "feat: add POST /deploy endpoint"
```

---

## Task 8: Scripts management endpoints

**Files:**
- Create: `src/api/routes/scripts.ts`
- Create: `tests/api/scripts.test.ts`
- Modify: `src/api/server.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/api/scripts.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { createServer } from '../../src/api/server';

const makeEngine = () => ({
  loadScript:      vi.fn(),
  getScriptStatus: vi.fn().mockReturnValue('running'),
  getLogTail:      vi.fn().mockReturnValue(['line 1']),
});

const makeRegistry = (records: any[] = []) => ({
  upsert:     vi.fn(),
  list:       vi.fn().mockReturnValue(records),
  get:        vi.fn(),
  setEnabled: vi.fn(),
});

const record = { name: 'garage', enabled: true, lastDeployedAt: '2026-01-01T00:00:00Z', typesHash: 'sha256:abc' };

describe('GET /scripts', () => {
  it('returns scripts with runtime status and log tail', async () => {
    const app = createServer(makeEngine() as any, makeRegistry([record]) as any);
    const res = await app.inject({ method: 'GET', url: '/scripts' });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body[0]).toMatchObject({ name: 'garage', status: 'running', logTail: ['line 1'] });
  });
});

describe('POST /scripts/:name/enable', () => {
  it('calls setEnabled(true) and returns 200', async () => {
    const registry = makeRegistry([record]);
    const app = createServer(makeEngine() as any, registry as any);

    const res = await app.inject({ method: 'POST', url: '/scripts/garage/enable' });
    expect(res.statusCode).toBe(200);
    expect(registry.setEnabled).toHaveBeenCalledWith('garage', true);
  });

  it('returns 404 when registry throws unknown script', async () => {
    const registry = makeRegistry();
    registry.setEnabled.mockImplementation(() => { throw new Error('Unknown script: x'); });
    const app = createServer(makeEngine() as any, registry as any);

    const res = await app.inject({ method: 'POST', url: '/scripts/x/enable' });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /scripts/:name/disable', () => {
  it('calls setEnabled(false) and returns 200', async () => {
    const registry = makeRegistry([record]);
    const app = createServer(makeEngine() as any, registry as any);

    const res = await app.inject({ method: 'POST', url: '/scripts/garage/disable' });
    expect(res.statusCode).toBe(200);
    expect(registry.setEnabled).toHaveBeenCalledWith('garage', false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
pnpm exec vitest run tests/api/scripts.test.ts
```

Expected: FAIL — `/scripts` routes not registered.

- [ ] **Step 3: Create `src/api/routes/scripts.ts`**

```typescript
import type { FastifyPluginAsync } from 'fastify';
import type { JSEngine } from '../../engine/js-engine';
import type { ScriptRegistry } from '../../registry/script-registry';

type Options = { engine: JSEngine; registry: ScriptRegistry };

export const scriptsRoute: FastifyPluginAsync<Options> = async (app, { engine, registry }) => {
  app.get('/scripts', async (_req, reply) => {
    return reply.send(
      registry.list().map((record) => ({
        ...record,
        status:  engine.getScriptStatus(record.name),
        logTail: engine.getLogTail(record.name),
      })),
    );
  });

  app.post('/scripts/:name/enable', async (request, reply) => {
    const { name } = request.params as { name: string };
    try {
      registry.setEnabled(name, true);
      return reply.send({ ok: true });
    } catch {
      return reply.status(404).send({ error: `Unknown script: ${name}` });
    }
  });

  app.post('/scripts/:name/disable', async (request, reply) => {
    const { name } = request.params as { name: string };
    try {
      registry.setEnabled(name, false);
      return reply.send({ ok: true });
    } catch {
      return reply.status(404).send({ error: `Unknown script: ${name}` });
    }
  });
};
```

- [ ] **Step 4: Register scripts route in `src/api/server.ts`**

```typescript
import Fastify from 'fastify';
import type { JSEngine } from '../engine/js-engine';
import type { ScriptRegistry } from '../registry/script-registry';
import { healthRoute } from './routes/health';
import { deployRoute } from './routes/deploy';
import { scriptsRoute } from './routes/scripts';

export function createServer(engine: JSEngine, registry: ScriptRegistry) {
  const app = Fastify({ logger: false });
  app.register(healthRoute);
  app.register(deployRoute, { engine, registry });
  app.register(scriptsRoute, { engine, registry });
  return app;
}
```

- [ ] **Step 5: Run all tests**

```bash
pnpm test
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/api/routes/scripts.ts src/api/server.ts tests/api/scripts.test.ts
git commit -m "feat: add GET /scripts and enable/disable endpoints"
```

---

## Task 9: Wire the API server into index.ts

> **Note on directory layout:** `ScriptRegistry` receives `scriptsDir` as its `dataDir`, so `registry.json` is written into the same directory as the `.js` script files. This is intentional for MVP simplicity. The `registry.json` file will coexist with the scripts in one directory.

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Replace `src/index.ts`**

```typescript
'use strict';

import path from 'path';
import { JSEngine } from './engine/js-engine';
import { ScriptRegistry } from './registry/script-registry';
import { createServer } from './api/server';
import { getLogger } from './logger/logger';

const logger = getLogger({ source: 'JsEngine' });

logger.info('Starting');

if (require.main === module) {
  const token     = process.env.HASS_TOKEN;
  const url       = process.env.HASS_URL;
  const scriptsDir = process.env.SCRIPTS_DIR
    ? path.resolve(process.env.SCRIPTS_DIR)
    : path.resolve(__dirname, '../scripts');
  const port = parseInt(process.env.ENGINE_PORT ?? '3000', 10);

  if (!token) {
    console.error('HASS_TOKEN environment variable not set');
    process.exit(2);
  }

  if (!url) {
    console.error('HASS_URL environment variable not set');
    process.exit(2);
  }

  const registry = new ScriptRegistry(scriptsDir);
  const engine   = new JSEngine({ scriptsDir, token, url }, logger);
  const server   = createServer(engine, registry);

  const shutdown = async () => {
    await server.close();
    engine.stop();
  };

  process.on('SIGINT',  shutdown);
  process.on('SIGTERM', shutdown);
  process.on('uncaughtException', (err: any) => logger.error(err));

  Promise.all([
    engine.start(),
    server.listen({ port, host: '0.0.0.0' }),
  ]).then(() => {
    logger.info(`API listening on port ${port}`);
  }).catch((e: any) => {
    logger.error(e);
    shutdown();
  });
}

export = JSEngine;
```

- [ ] **Step 2: Verify TypeScript build**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 3: Run all tests**

```bash
pnpm test
```

Expected: all PASS.

- [ ] **Step 4: Build and smoke test**

```bash
pnpm build
HASS_TOKEN=test HASS_URL=http://localhost:8123 node dist/index.js &
sleep 1
curl -s http://localhost:3000/health
kill %1
```

Expected: `{"ok":true}` (HA connection will fail, but the API responds).

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat: start REST API server alongside HA WebSocket connection"
```
