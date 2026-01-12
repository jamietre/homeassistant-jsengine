# Type Generation System Plan

## Goal

Generate TypeScript types and classes from `services.json` and `entities.json` that provide:
1. **Type-safe entity access** with domain-specific properties and states
2. **Type-safe service calls** with proper parameter types
3. **Autocomplete support** for entity IDs and service methods
4. **Runtime validation** based on supported_features

---

## Phase 1: Foundation

### 1.1 Service Type Generation

Generate types from `services.json`:

```typescript
// generated/services/climate.ts
export interface ClimateSetTemperatureParams {
  temperature?: number;        // min: 0, max: 250
  target_temp_high?: number;
  target_temp_low?: number;
  hvac_mode?: "off" | "auto" | "cool" | "dry" | "fan_only" | "heat_cool" | "heat";
}

export interface ClimateSetHvacModeParams {
  hvac_mode?: string;  // Dynamic based on entity's hvac_modes attribute
}

export interface ClimateServices {
  turn_on(): Promise<void>;
  turn_off(): Promise<void>;
  toggle(): Promise<void>;
  set_temperature(params: ClimateSetTemperatureParams): Promise<void>;
  set_hvac_mode(params: ClimateSetHvacModeParams): Promise<void>;
  set_preset_mode(params: { preset_mode: string }): Promise<void>;
  set_humidity(params: { humidity: number }): Promise<void>;
  set_fan_mode(params: { fan_mode: string }): Promise<void>;
  set_swing_mode(params: { swing_mode: string }): Promise<void>;
}
```

### 1.2 Entity Attribute Types

Generate attribute interfaces per domain from `entities.json`:

```typescript
// generated/entities/climate.ts
export type ClimateHvacMode = "off" | "heat" | "cool" | "heat_cool" | "auto" | "dry" | "fan_only";
export type ClimateHvacAction = "idle" | "heating" | "cooling" | "drying" | "off";

export interface ClimateAttributes {
  hvac_modes: ClimateHvacMode[];
  hvac_action?: ClimateHvacAction;
  min_temp: number;
  max_temp: number;
  current_temperature: number;
  temperature: number;
  target_temp_high?: number;
  target_temp_low?: number;
  current_humidity?: number;
  preset_mode?: string;
  preset_modes?: string[];
  fan_mode?: string;
  fan_modes?: string[];
  swing_mode?: string;
  swing_modes?: string[];
  friendly_name: string;
  supported_features: number;
}
```

### 1.3 Domain Entity Classes

Combine attributes and services:

```typescript
// generated/entities/climate.ts
export interface ClimateEntity extends BaseEntity {
  domain: "climate";
  state: ClimateHvacMode;
  attributes: ClimateAttributes;

  // Service methods (from ClimateServices)
  turn_on(): Promise<void>;
  turn_off(): Promise<void>;
  toggle(): Promise<void>;
  set_temperature(params: ClimateSetTemperatureParams): Promise<void>;
  // ...
}
```

---

## Phase 2: Entity Instance Types

### 2.1 Specific Entity Types

Generate types for actual entities in the user's HA instance:

```typescript
// generated/my-entities.ts
export interface MyEntities {
  "climate.basement": ClimateEntity;
  "climate.great_room": ClimateEntity;
  "light.s31_id1_switch": LightEntity;
  "switch.garage_door": SwitchEntity;
  // ... all entities
}

// Type-safe entity access
declare const entities: MyEntities;
entities["climate.basement"].set_temperature({ temperature: 72 });
```

### 2.2 Entity ID Literals

Generate string literal union types:

```typescript
export type ClimateEntityId =
  | "climate.basement"
  | "climate.great_room"
  | "climate.heatpump_garage_heat_pump_garage";

export type LightEntityId =
  | "light.s31_id1_switch"
  | "light.living_room";

export type AllEntityIds = ClimateEntityId | LightEntityId | SwitchEntityId | ...;
```

---

## Phase 3: Selector Type Mapping

Map HA selector types to TypeScript:

```typescript
// src/type-generator/selector-mapper.ts
function selectorToType(selector: Selector): string {
  if ('number' in selector) {
    return 'number';
  }
  if ('text' in selector) {
    return 'string';
  }
  if ('select' in selector) {
    const options = selector.select.options;
    if (Array.isArray(options)) {
      return options.map(o => `"${o}"`).join(' | ');
    }
    return 'string';
  }
  if ('boolean' in selector) {
    return 'boolean';
  }
  if ('entity' in selector) {
    return 'string'; // or EntityId type
  }
  if ('color_rgb' in selector) {
    return '[number, number, number]';
  }
  // ... etc
  return 'unknown';
}
```

### Selector Reference

| HA Selector | TypeScript Type |
|-------------|-----------------|
| `number: { min, max }` | `number` |
| `text: {}` | `string` |
| `select: { options }` | `"opt1" \| "opt2" \| ...` |
| `boolean: {}` | `boolean` |
| `entity: { domain }` | `string` (or `EntityId` type) |
| `color_rgb: {}` | `[number, number, number]` |
| `color_temp: { unit }` | `number` |
| `object: {}` | `Record<string, unknown>` |
| `time: {}` | `string` |
| `date: {}` | `string` |

---

## Phase 4: Runtime Integration

### 4.1 Typed JSEngine

Update JSEngine to use generated types:

```typescript
// src/engine/js-engine.ts
import { MyEntities } from '../generated/my-entities';

class JSEngine {
  Entities: MyEntities;
  // ...
}
```

### 4.2 Feature-Based Method Filtering

Use `supported_features` bitmask to determine available methods:

```typescript
// Climate supported features
const CLIMATE_SUPPORT_TARGET_TEMPERATURE = 1;
const CLIMATE_SUPPORT_TARGET_TEMPERATURE_RANGE = 2;
const CLIMATE_SUPPORT_TARGET_HUMIDITY = 4;
const CLIMATE_SUPPORT_FAN_MODE = 8;
const CLIMATE_SUPPORT_PRESET_MODE = 16;
const CLIMATE_SUPPORT_SWING_MODE = 32;
const CLIMATE_SUPPORT_AUX_HEAT = 64;
const CLIMATE_SUPPORT_TURN_OFF = 128;
const CLIMATE_SUPPORT_TURN_ON = 256;

// At runtime, filter methods based on entity.attributes.supported_features
function hasFeature(entity: ClimateEntity, feature: number): boolean {
  return (entity.attributes.supported_features & feature) !== 0;
}
```

---

## Phase 5: Generator Implementation

### 5.1 CLI Tool

```bash
npx ha-codegen --services ./generated/services.json \
               --entities ./generated/entities.json \
               --output ./generated/types
```

### 5.2 Generator Structure

```
src/type-generator/
├── index.ts              # CLI entry point
├── service-generator.ts  # Generate service interfaces
├── entity-generator.ts   # Generate entity interfaces
├── instance-generator.ts # Generate user-specific entity types
├── selector-mapper.ts    # Map HA selectors to TS types
├── utils.ts              # Naming helpers, file writers
└── templates/            # Code templates (optional)
    ├── service.ts.hbs
    └── entity.ts.hbs
```

### 5.3 Generator Flow

```
┌─────────────────┐     ┌──────────────────┐
│  services.json  │────▶│ service-generator │────┐
└─────────────────┘     └──────────────────┘    │
                                                 │
┌─────────────────┐     ┌──────────────────┐    │    ┌─────────────────┐
│  entities.json  │────▶│ entity-generator  │────┼───▶│ generated/types │
└─────────────────┘     └──────────────────┘    │    └─────────────────┘
                                                 │
                        ┌──────────────────┐    │
                        │instance-generator │────┘
                        └──────────────────┘
```

---

## Phase 6: Watch Mode / Package Distribution

### 6.1 Runtime Regeneration

Option to regenerate types when entities/services update:
- On connection, fetch latest services/entities
- Compare with cached versions
- Regenerate if changed (requires restart for type updates)

### 6.2 npm Package

Publish generated types as `@yourorg/ha-types`:
- Base domain types (light, switch, climate, sensor, etc.)
- Utility types
- Runtime helpers

```json
{
  "name": "@yourorg/ha-types",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": "./dist/index.js",
    "./climate": "./dist/domains/climate.js",
    "./light": "./dist/domains/light.js"
  }
}
```

---

## Implementation Priority

| Priority | Task | Reason |
|----------|------|--------|
| 1 | Service type generation | Most value, defines the API contract |
| 2 | Core domain entity types | light, switch, climate, sensor, binary_sensor |
| 3 | Selector-to-TypeScript mapping | Accurate parameter types |
| 4 | CLI generator tool | User can regenerate from their HA instance |
| 5 | Entity instance types | Autocomplete for specific entity IDs |
| 6 | Runtime validation | supported_features checking |

---

## Files to Create/Modify

### New Files
- `src/type-generator/index.ts` - CLI entry point
- `src/type-generator/service-generator.ts`
- `src/type-generator/entity-generator.ts`
- `src/type-generator/instance-generator.ts`
- `src/type-generator/selector-mapper.ts`
- `generated/types/` - Output directory

### Modify
- `src/types/ha-types.ts` - Expand with base types or import generated
- `src/engine/entity.ts` - Integrate generated types
- `src/engine/service.ts` - Type the handler system
- `package.json` - Add `generate` script

---

## Open Questions

1. **Static vs Dynamic Types**: Should entity instance types be generated once (static) or at connection time?
2. **Strict Mode**: Should missing attributes error or be optional (`?`)?
3. **Service Validation**: Runtime validation of service params, or trust types?
4. **Versioning**: How to handle HA API changes across versions?
