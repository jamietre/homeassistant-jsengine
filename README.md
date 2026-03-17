# homeassistant-jsengine

A TypeScript automation engine for Home Assistant. Connect to your HA instance, write scripts in TypeScript with full type safety, deploy them via REST API, and manage them from a dashboard.

> **Status:** Plan 1 of 3 complete — the engine and REST API are built. Plans 2 (type generator) and 3 (developer template + CLI) are next.

---

## How it works

The engine runs as a server alongside your Home Assistant instance. It connects to HA via WebSocket, maintains live entity state, and exposes a REST API that accepts compiled JavaScript bundles. Scripts are loaded explicitly via `POST /deploy` and managed (enabled/disabled) via the API.

User scripts are TypeScript classes that receive a typed `engine` and `getTopic` factory via constructor injection. Entity IDs are branded strings produced by a code generator (Plan 2), so `getTopic(light.livingRoom)` returns an `EventBus<HaEventMap<LightEntity>>` — no casting needed.

---

## Running the engine

### Docker

```sh
docker build -t homeassistant-jsengine .

docker run \
  -e HASS_TOKEN=<your-long-lived-token> \
  -e HASS_URL=http://192.168.1.10:8123 \
  -p 3000:3000 \
  homeassistant-jsengine
```

### Directly (requires Node 22 + pnpm via mise)

```sh
mise install
pnpm install
pnpm build

HASS_TOKEN=<token> HASS_URL=http://192.168.1.10:8123 node dist/index.js
```

### Environment variables

| Variable      | Required | Default            | Purpose                            |
|---------------|----------|--------------------|------------------------------------|
| `HASS_TOKEN`  | yes      | —                  | Long-lived HA access token         |
| `HASS_URL`    | yes      | —                  | HA instance URL                    |
| `SCRIPTS_DIR` | no       | `../scripts`       | Directory for deployed script files |
| `ENGINE_PORT` | no       | `3000`             | Port the REST API listens on       |

---

## REST API

### `GET /health`

Liveness check.

```
200 { ok: true }
```

### `POST /deploy`

Deploy a bundle of compiled scripts. Upserts by name — scripts not in the bundle are left unchanged.

```json
{
  "scripts": [
    { "name": "garage", "code": "..." },
    { "name": "heating", "code": "..." }
  ],
  "typesHash": "sha256:abc123"
}
```

```
200 { "loaded": ["garage", "heating"] }
400 { "error": ... }   — invalid bundle shape
500 { "error": ... }   — script failed to load
```

### `GET /scripts`

List all deployed scripts with runtime status and log tail.

```json
[
  {
    "name": "garage",
    "enabled": true,
    "lastDeployedAt": "2026-03-17T00:00:00Z",
    "typesHash": "sha256:abc123",
    "status": "running",
    "logTail": ["Garage door opened"]
  }
]
```

Status values: `running` | `stopped` | `error` | `disabled`

### `POST /scripts/:name/enable`

Enable a script.

```
200 { ok: true }
404 { error: "Unknown script: garage" }
```

### `POST /scripts/:name/disable`

Disable a script. (Currently persists the flag — enforcement is planned for a future update.)

```
200 { ok: true }
404 { error: "Unknown script: garage" }
```

---

## Writing scripts

Scripts are TypeScript classes exported as default. The constructor receives `engine`, `getTopic`, and `loggerFactory`.

```typescript
import type { JsModuleConfig } from 'homeassistant-jsengine';
// EntityId values and per-entity types come from the generated ha.d.ts (Plan 2)
import { binarySensor, light } from '../generated/ha';

export default class GarageAutomation {
  constructor({ engine, getTopic, loggerFactory }: JsModuleConfig) {
    const logger = loggerFactory({ source: 'GarageAutomation' });

    // getTopic infers the entity type from the branded EntityId<T> value
    const door = getTopic(binarySensor.garageDoor);

    door.subscribe('state-changed', (event) => {
      // event.entity is typed as BinarySensorEntity — no cast needed
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

Compile to CommonJS (`"module": "commonjs"` in tsconfig), then deploy:

```sh
curl -X POST http://localhost:3000/deploy \
  -H 'Content-Type: application/json' \
  -d '{
    "scripts": [{ "name": "garage", "code": "<compiled js>" }],
    "typesHash": "manual"
  }'
```

---

## Type system

`EntityId<T>` is a phantom branded string. Values are emitted by the type generator (Plan 2) alongside per-entity and per-domain types derived from live HA `services` and `entities` data.

Well-known state types are defined in the engine package:

```typescript
type PowerState        = 'on' | 'off';
type AvailabilityState = 'available' | 'unavailable';
type LockState         = 'locked' | 'unlocked';
```

Generated types are named after HA field names, with JSDoc from `services.json` selector data, and a Zod schema for runtime validation of service call parameters.

---

## Development

```sh
mise install        # install Node 22 + pnpm 10.16.1
pnpm install
pnpm test           # run test suite (vitest)
pnpm typecheck      # TypeScript check
pnpm build          # compile to dist/
```

### Tests

25 tests across 6 files covering type correctness, ScriptRegistry persistence, JSEngine lifecycle, and all API routes.

---

## Roadmap

- **Plan 2:** Type generator — `sync-types` CLI that connects to HA, fetches live services/entities, and produces a `ha.d.ts` with branded `EntityId<T>` values, typed entity interfaces, and Zod schemas
- **Plan 3:** Developer template — starter project with `jsengine dev`, `jsengine deploy`, bootstrap script, and vitest unit test support
- **Future:** Home Assistant Supervisor add-on, web dashboard
