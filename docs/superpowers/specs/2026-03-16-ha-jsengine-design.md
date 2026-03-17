# Home Assistant JS Engine — System Design

**Date:** 2026-03-16
**Status:** Approved

---

## Overview

A two-artifact system that lets users write statically-typed TypeScript automations against their Home Assistant instance. The engine runs on a server and executes scripts; the developer project is a local TypeScript workspace where users write, test, and deploy those scripts.

The guiding principle: type safety at the point of authorship, not at runtime. The generated types make the full shape of a user's HA installation visible to their editor before a single line executes.

---

## Artifact 1: The Engine (`homeassistant-jsengine`)

The existing codebase, extended with a REST API and dashboard.

### Responsibilities

- Connect to Home Assistant via WebSocket (`home-assistant-js-websocket`)
- Load, execute, and lifecycle-manage user scripts explicitly via the REST API
- Expose a REST API for script deployment and management
- Serve a web dashboard for script management
- Track a hash of live HA data to detect type staleness

Script activation is fully explicit — scripts are loaded when deployed via `POST /deploy` and enabled/disabled via the management API. There is no filesystem watching or automatic hot-reload. The `jsrundir` dependency is removed.

### Environment Variables

The engine reads its configuration from environment variables at startup. The current code hard-codes the HA URL and must be updated as part of this work:

| Variable      | Purpose                              |
|---------------|--------------------------------------|
| `HASS_TOKEN`  | Long-lived HA access token           |
| `HASS_URL`    | URL of the HA instance (e.g. `http://192.168.1.10:8123`) |
| `ENGINE_PORT` | Port the REST API listens on (default `3000`) |
| `LOG_LEVEL`   | Log verbosity                        |

### REST API (MVP)

```
POST /deploy                  Accept a compiled script bundle, write to scripts dir, reload
GET  /scripts                 List scripts with status and types-stale flag
POST /scripts/:name/enable    Enable a script
POST /scripts/:name/disable   Disable a script
GET  /health                  Liveness check
```

**Deploy bundle shape:**
```json
{
  "scripts": [
    { "name": "garage", "code": "..." },
    { "name": "heating", "code": "..." }
  ],
  "typesHash": "sha256:abc123..."
}
```

**Deploy semantics:** a deploy is an upsert by name. Scripts named in the bundle are added or replaced; scripts not named in the bundle are left unchanged. To remove a script, disable it via `POST /scripts/:name/disable` or delete it manually from the scripts directory.

The `typesHash` is stored per script so the dashboard can show whether each script was built against current HA data.

> **Security:** Authentication on the REST API is out of scope for MVP. The engine is not expected to be exposed publicly; access control is left to the service owner.

### Script Registry

A `registry.json` file persisted to disk alongside the scripts directory. Tracks per-script: `name`, `enabled`, `lastDeployedAt`, `typesHash`. This file survives container restarts.

Runtime state (script status: running / stopped / error, and log tail) is **ephemeral in-memory only** — it is not persisted. The `GET /scripts` endpoint serves this live state from memory; on restart, status resets to the engine's initial state and log tails are empty.

### Dashboard UI

Minimal web UI, server-rendered or single-page (no heavy framework):

- Script list: name, status (running / stopped / error / disabled), last deployed
- Per-script log tail (ephemeral — cleared on restart)
- "Types may be stale" banner when live HA data hash differs from the deployed `typesHash`
- Enable/disable toggle

The REST API is the MVP deliverable; the dashboard is a follow-on that can be added once the API is working.

### Deployment (Phase 1)

Docker container:

```sh
docker run \
  -e HASS_TOKEN=... \
  -e HASS_URL=... \
  -p 3000:3000 \
  homeassistant-jsengine
```

Scripts directory is a Docker volume. The REST API is the only way to deploy scripts — no manual file copying required.

Phase 2 (future): proper Home Assistant Supervisor add-on.

### Tooling

`mise.toml` declares Node and pnpm versions. Replaces the existing `.nvmrc`.

---

## Artifact 2: The Developer Project (`homeassistant-jsengine-template`)

A TypeScript starter project that users bootstrap once per HA installation. Contains their scripts, generated types, and CLI tooling.

### Developer Project Environment Variables

Stored in `.env` (gitignored). Required for `dev` and `sync-types`; `ENGINE_URL` is also required for `deploy`.

| Variable      | Purpose                                                       |
|---------------|---------------------------------------------------------------|
| `HASS_TOKEN`  | Long-lived HA access token (same value as the engine's `HASS_TOKEN`) |
| `HASS_URL`    | URL of the HA instance (same value as the engine's `HASS_URL`) |
| `ENGINE_URL`  | URL of the running engine (e.g. `http://192.168.1.10:3000`)  |

### Bootstrap

A shell script handles first-time setup:

```sh
curl -fsSL .../bootstrap.sh | sh
# Prompts: HA URL, HA token, Engine URL, project name
# Connects to HA, fetches entities + services
# Generates ha.d.ts and .ha-types-hash
# Scaffolds project structure
```

> **Security note:** Piping to shell without integrity verification is a known risk. A versioned `npx` alternative (e.g. `npx homeassistant-jsengine-init`) will be provided as a safer option. Checksum verification of the shell script is left to the user for MVP.

### Project Structure

```
my-home-scripts/
  .env                    # HASS_TOKEN, HASS_URL, ENGINE_URL — gitignored
  jsengine.config.json    # project name, engine URL — committed
  .ha-types-hash          # hash of data used for last type gen — committed
  generated/
    ha.d.ts               # auto-generated types — committed
  scripts/
    example.ts            # starter script
  tests/
    example.test.ts       # starter test
  tsconfig.json
  package.json
  mise.toml
```

`generated/ha.d.ts` is committed so teammates share types without needing to run `sync-types` immediately.

### CLI Scripts

```json
{
  "sync-types": "jsengine sync-types",
  "dev":        "jsengine dev",
  "build":      "tsc",
  "test":       "vitest",
  "deploy":     "jsengine deploy"
}
```

The `jsengine` CLI is a dev dependency — not installed globally.

**`pnpm dev`** starts a local development server that connects directly to the live HA instance (using credentials from `.env`), watches `scripts/` for TypeScript changes, recompiles on save, and hot-reloads scripts in-process. This is a live connection — `.env` credentials (`HASS_TOKEN`, `HASS_URL`) are required to run `dev`. On startup it also runs a staleness check (see below).

---

## Type Generation (`sync-types`)

Connects directly to HA (not via the engine) using credentials from `.env`. Fetches the live services and entities collections, generates `ha.d.ts`, and writes a hash of the source data to `.ha-types-hash`.

### Generated Output Shape

**Branded EntityId** — carries the entity's specific type as a phantom type parameter. Defined once in the static engine package; all generated values are cast to this type:

```typescript
// Defined in the engine package (static, not generated)
export type EntityId<T extends HaEntity = HaEntity> =
  string & { readonly _brand: 'EntityId'; readonly _type: T };
```

**Per-domain typed values** — one exported const per HA domain, each value branded with its entity type:

```typescript
// Generated — one block per domain present in the user's HA instance
export const binarySensor = {
  garageDoor: 'binary_sensor.garage_door' as EntityId<BinarySensorEntity>,
  frontDoor:  'binary_sensor.front_door'  as EntityId<BinarySensorEntity>,
} as const;

export const light = {
  livingRoom: 'light.living_room' as EntityId<LightEntity>,
  garage:     'light.garage'      as EntityId<LightEntity>,
} as const;

export const climate = {
  heatpumpOffice: 'climate.heatpump_office' as EntityId<ClimateEntity>,
} as const;
```

**Naming rules:**
- Domain names are camelCased (`binary_sensor` → `binarySensor`)
- Entity names are camelCased from the portion after the domain dot (`living_room` → `livingRoom`)
- Collisions (e.g. `light.living_room` and `light.living_room_2`) are resolved by appending the disambiguating suffix (`livingRoom`, `livingRoom2`)
- If the camelCased entity name starts with a digit, the domain name is prepended (`light.1_living_room` → entity part `1LivingRoom` → `light1LivingRoom`)

**Well-known state types (static, defined in the engine package):**

A small set of universal state types are hardcoded rather than generated, because they appear across many domains and benefit from a stable, human-readable name:

```typescript
export type PowerState        = 'on' | 'off';
export type AvailabilityState = 'available' | 'unavailable';
export type LockState         = 'locked' | 'unlocked';
```

**Generated named types** — the generator inspects `services.json` selector data to produce named types for enum-like values and numeric ranges. Types are named after the field. If the same field name with identical selector shape appears across multiple services or entities, one shared type is emitted and reused:

```typescript
/** 'heat' | 'cool' | 'off' | 'auto' | 'fan_only' | 'dry' | 'heat_cool' */
export type HvacMode = 'heat' | 'cool' | 'off' | 'auto' | 'fan_only' | 'dry' | 'heat_cool';

/** A number from 0 to 255 */
export type Brightness = number;

/** A number from 0 to 100 */
export type BrightnessPct = number;
```

The JSDoc comment is generated from the selector's `min`/`max`/`step`/`options` data in `services.json`. For numeric types this is the valid range; for select types it lists the valid string values.

**Per-domain entity types** — state uses the appropriate named type (well-known or generated), attributes and action parameters reference generated named types with JSDoc:

```typescript
export type LightEntity = {
  domain: 'light';
  state: PowerState;
  attributes: {
    /** A number from 0 to 255 */
    brightness?: Brightness;
    rgb_color?: [number, number, number];
    color_temp?: number;
    supported_features?: number;
  };
  turn_on(params?: LightTurnOnParams): void;
  turn_off(params?: LightTurnOffParams): void;
  toggle(): void;
};

export type LightTurnOnParams = {
  /** A number from 0 to 255 */
  brightness?: Brightness;
  /** A number from 0 to 100 */
  brightness_pct?: BrightnessPct;
  /** Transition duration in seconds */
  transition?: number;
  rgb_color?: [number, number, number];
};
```

**Zod validation** — a Zod schema is generated alongside each service call params type. The engine validates arguments at call time using the schema, rejects invalid data, and logs a structured error:

```typescript
export const LightTurnOnParamsSchema = z.object({
  brightness:     z.number().int().min(0).max(255).optional(),
  brightness_pct: z.number().min(0).max(100).optional(),
  transition:     z.number().min(0).optional(),
  rgb_color:      z.tuple([z.number(), z.number(), z.number()]).optional(),
});
```

When a script calls `light.turn_on({ brightness: 300 })`, the engine validates against the schema, logs `[error] light.turn_on: brightness must be ≤ 255`, and does not forward the call to HA. Schema generation is driven entirely by the `selector` data in `services.json` — no hardcoded knowledge of individual services is required.

### Staleness Detection

On `pnpm dev` startup, the CLI connects to HA, fetches current services+entities, hashes them, and compares to `.ha-types-hash`. If they differ:

```
⚠  Types may be stale — entities or services have changed since last sync.
   Run pnpm sync-types to update.
```

The engine server also tracks a hash of live HA data. When a deploy bundle arrives, the server compares its `typesHash` to the current live hash and surfaces a warning in the dashboard if they differ.

---

## Script Module API

Each script is a TypeScript class exported as default. The constructor receives a `JsModuleConfig` from the engine package.

```typescript
import type { JsModuleConfig } from 'homeassistant-jsengine';
import { binarySensor, light } from '../generated/ha';

export default class GarageAutomation {
  constructor({ engine, getTopic, loggerFactory }: JsModuleConfig) {
    const logger = loggerFactory({ source: 'GarageAutomation' });

    // getTopic infers T from the EntityId<T> brand — no cast needed
    const door = getTopic(binarySensor.garageDoor);

    door.subscribe('state-changed', (event) => {
      // event.entity is BinarySensorEntity — fully typed, no cast
      if (event.state === 'on') {
        logger.info('Garage door opened');
        engine.entity(light.garage).turn_on({ brightness: 255 });
      }
    });
  }

  started() { /* called when engine connects to HA */ }
  stopped() { /* called on disconnect */ }
}
```

### Key Type Signatures (engine package)

```typescript
// getTopic is generic over T, inferred from the branded EntityId<T> value.
// Returns an EventBus whose event data is narrowed to T's shape.
getTopic<T extends HaEntity>(entity: EntityId<T>): EventBus<HaEventMap<T>>

// engine.entity() casts the live runtime Entity to T for the caller's benefit.
// No runtime validation — T must be structurally compatible with what
// the Entity proxy exposes (attributes + proxied service methods).
engine.entity<T extends HaEntity>(id: EntityId<T>): T
```

**`HaEventMap<T>` is generic** — it narrows `entity` and `state` to the specific type `T`:

```typescript
// In the engine package (static)
export type HaEventMap<T extends HaEntity = HaEntity> = {
  added:          { id: string; entity: T };
  removed:        { id: string; entity: T };
  updated:        { id: string; entity: T; oldEntity?: T; state: T['state']; changed: boolean };
  'state-changed':{ id: string; entity: T; oldEntity?: T; state: T['state']; oldState?: T['state']; changed: true };
};
```

**Runtime / type alignment:** The engine's `Entity` class uses a `Proxy` to expose service methods at runtime. The generated per-domain entity types (e.g. `LightEntity`) must be structurally compatible with what this proxy produces — i.e., the attribute fields and method signatures in the generated type must match the methods the proxy will attach at runtime. The type generator is responsible for emitting only the methods that the services data says are available for that domain. There is no runtime enforcement — if the generated types drift from the proxy's actual output, errors will surface at runtime rather than compile time.

### Unit Testing

Scripts are testable without a live HA connection by injecting mocks:

```typescript
import { describe, it, expect, vi } from 'vitest';
import GarageAutomation from '../scripts/garage';

describe('GarageAutomation', () => {
  it('turns on garage light when door opens', () => {
    const turnOn = vi.fn();
    const mockEngine = { entity: () => ({ turn_on: turnOn }) };
    const mockTopic = { subscribe: vi.fn() };
    const getTopic = vi.fn(() => mockTopic);

    new GarageAutomation({ engine: mockEngine, getTopic, loggerFactory: vi.fn(() => ({ info: vi.fn() })) });

    // Simulate state-changed event
    const handler = mockTopic.subscribe.mock.calls[0][1];
    handler({ state: 'on', entity: {} });

    expect(turnOn).toHaveBeenCalledWith({ brightness: 255 });
  });
});
```

---

## End-to-End Workflow

```
# First time
curl -fsSL .../bootstrap.sh | sh

# Develop (requires live HA connection via .env)
pnpm dev              # connects to HA, hot-reloads scripts on save, checks staleness

# When HA changes
pnpm sync-types       # regenerates ha.d.ts, TS errors surface immediately in editor

# Deploy
pnpm deploy           # tsc + POST bundle to engine (upsert by name)
```

---

## Out of Scope (MVP)

- REST API authentication
- Home Assistant Supervisor add-on packaging (Phase 2)
- Dashboard UI (add-on after REST API ships)
- HACS integration (Phase 2)
- Multi-engine / multi-HA-instance support
