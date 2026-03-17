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
- Execute user scripts in a watched directory, hot-reloading on change
- Expose a REST API for script deployment
- Serve a web dashboard for script management
- Track a hash of live HA data to detect type staleness

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

The `typesHash` is stored per deploy so the dashboard can show whether running scripts were built against current HA data.

> **Security:** Authentication on the REST API is out of scope for MVP. The engine is not expected to be exposed publicly; access control is left to the service owner.

### Script Registry

A `registry.json` file persisted alongside scripts. Tracks per-script: `name`, `enabled`, `lastDeployedAt`, `typesHash`. Survives restarts.

### Dashboard UI

Minimal web UI, server-rendered or single-page (no heavy framework):

- Script list: name, status (running / stopped / error / disabled), last deployed
- Per-script log tail
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

### Bootstrap

A shell script handles first-time setup:

```sh
curl -fsSL .../bootstrap.sh | sh
# Prompts: HA URL, HA token, Engine URL, project name
# Connects to HA, fetches entities + services
# Generates ha.d.ts and .ha-types-hash
# Scaffolds project structure
```

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

---

## Type Generation (`sync-types`)

Connects directly to HA (not via the engine) using credentials from `.env`. Fetches the live services and entities collections, generates `ha.d.ts`, and writes a hash of the source data to `.ha-types-hash`.

### Generated Output Shape

**Branded EntityId** — carries the entity's specific type as a phantom type parameter:

```typescript
// Defined in the engine package (static)
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

Naming: HA domain names are camelCased directly (`binary_sensor` → `binarySensor`). Entity names within a domain are camelCased from the portion after the dot.

**Per-domain entity types** — attributes from entity data, state as a union of known values, actions from the matching services domain:

```typescript
export type LightEntity = {
  domain: 'light';
  state: 'on' | 'off';
  attributes: {
    brightness?: number;
    rgb_color?: [number, number, number];
    color_temp?: number;
    supported_features?: number;
  };
  turn_on(params?: { brightness?: number; transition?: number; rgb_color?: [number, number, number] }): void;
  turn_off(params?: { transition?: number }): void;
  toggle(): void;
};
```

### Staleness Detection

On `pnpm dev` startup, the engine CLI connects to HA, fetches current services+entities, hashes them, and compares to `.ha-types-hash`. If they differ:

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
      // event.entity is BinarySensorEntity — fully typed
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

**Key signatures in the engine package:**

```typescript
// getTopic infers entity type from the branded value
getTopic<T extends HaEntity>(entity: EntityId<T>): EventBus<HaEventMap<T>>

// engine.entity() returns the specific type without casting
engine.entity<T extends HaEntity>(id: EntityId<T>): T
```

The engine package defines `EntityId<T>`, `HaEntity`, `JsModuleConfig`, and the event map generics. It does not need to know about specific entity types at build time — the phantom type does that work at the call site.

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

# Develop
pnpm dev              # connects to HA, hot-reloads scripts on save

# When HA changes
pnpm sync-types       # regenerates ha.d.ts, TS errors surface immediately

# Deploy
pnpm deploy           # tsc + POST bundle to engine
```

---

## Out of Scope (MVP)

- REST API authentication
- Home Assistant Supervisor add-on packaging (Phase 2)
- Dashboard UI (add-on after REST API ships)
- HACS integration (Phase 2)
- Multi-engine / multi-HA-instance support
