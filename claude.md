# homeassistant-jsengine

A TypeScript engine for Home Assistant that enables JavaScript-based automations via the WebSocket API.

## Project Overview

This is a fork of [puzzle-star/homeassistant-jsengine](https://github.com/puzzle-star/homeassistant-jsengine) converted to TypeScript. The engine connects to Home Assistant via WebSocket, subscribes to entity and service updates, and allows users to write JavaScript automation scripts with full access to HA entities.

## Architecture

```
src/
├── index.ts              # Entry point, initializes JSEngine
├── engine/
│   ├── js-engine.ts      # Core orchestration: script lifecycle, events, entity management
│   ├── home-assistant.ts # WebSocket connection, service calls, subscriptions
│   ├── entity.ts         # Entity class with Proxy-based service method binding
│   ├── service.ts        # Service wrapper mapping HA services to callable functions
│   ├── cache.ts          # State management for entities/services/user
│   └── immutable-proxy.ts # Read-only proxy wrapper for script safety
├── types/
│   ├── ha-types.ts       # Home Assistant type definitions
│   ├── jsmodule.ts       # Script module interface types
│   └── entities/         # Domain-specific entity types (WIP)
├── type-generator/       # Type generation utilities (to be implemented)
├── logger/               # Logging infrastructure
└── util/
    ├── event-bus.ts      # Generic pub-sub with wildcard support
    └── es-module.ts      # ES module detection helpers
```

## Key Concepts

### Home Assistant API Data Structures

**Entities** (`entities.json`): Runtime state of all HA entities
```typescript
{
  "climate.basement": {
    entity_id: string;          // "climate.basement"
    state: string;              // "heat", "cool", "off", "on", etc.
    attributes: {
      hvac_modes: string[];     // ["off", "heat", "cool"]
      preset_modes: string[];   // ["none", "away", "hold"]
      min_temp: number;
      max_temp: number;
      current_temperature: number;
      temperature: number;      // target
      // ... domain-specific attributes
    };
    context: { id, parent_id, user_id };
    last_changed: string;       // ISO timestamp
    last_updated: string;
  }
}
```

**Services** (`services.json`): Available service calls organized by domain
```typescript
{
  "climate": {
    "set_temperature": {
      name: string;             // "Set target temperature"
      description: string;
      fields: {                 // Parameters for service_data
        temperature: {
          required?: boolean;
          selector: {           // Defines type and validation
            number: { min, max, step, mode }
          };
          name: string;
          description: string;
        }
      };
      target: {                 // Which entities can use this service
        entity: [{ domain: ["climate"], supported_features?: [1, 2] }]
      };
    }
  }
}
```

### Service Call Structure (WebSocket)

```typescript
// Via home-assistant-js-websocket
connection.sendMessagePromise({
  type: "call_service",
  domain: "climate",           // From services.json root keys
  service: "set_temperature",  // From services.json service names
  service_data: {              // From services.json "fields"
    temperature: 72
  },
  target: {                    // Entity targeting
    entity_id: "climate.basement"
  }
});
```

### Selector Types (for type generation)

Services define parameter types via selectors:
- `number`: `{ min, max, step, mode: "box"|"slider" }`
- `text`: `{}`
- `select`: `{ options: string[], multiple: boolean }`
- `state`: `{ hide_states: string[] }` - references entity's possible states
- `entity`: `{ domain: string[], multiple: boolean }`
- `color_rgb`: `{}` - `[number, number, number]`
- `color_temp`: `{ unit: "kelvin"|"mired", min, max }`
- `object`: `{}` - arbitrary object
- `boolean`: `{}`
- `time`: `{}`
- `date`: `{}`

### Entity Domains in Use

From your Home Assistant instance:
- **Entities**: automation, binary_sensor, button, climate, conversation, cover, device_tracker, event, light, lock, media_player, number, person, scene, select, sensor, stt, sun, switch, todo, tts, update, water_heater, weather, zone
- **Services**: 60+ domains including all above plus input_*, mqtt, notify, script, timer, etc.

## Current State

### Working
- WebSocket connection to HA
- Entity state subscriptions
- Service calls (tested with climate.set_temperature, switch.toggle, light.turn_on)
- Event-driven script loading via jsrundir
- Proxy-based method binding on entities (e.g., `entity.toggle()`)

### In Progress
- `sendMessage` abstraction for entity actions
- Scoped pub/sub system

### Type System Gaps
- `HaDomain` only has 'light' | 'plug'
- `HaEntity` is generic, no domain-specific types
- No generated types for actual entities or services
- Many `any` types throughout

---

## Type Generation Plan

See [PLAN.md](./PLAN.md) for the detailed 6-phase type generation system roadmap.

## Development Commands

```bash
pnpm install          # Install dependencies
pnpm run build        # Compile TypeScript
pnpm run dev          # Watch mode with nodemon
```

## Environment Variables

- `HASS_TOKEN` - Long-lived access token from Home Assistant
