/**
 * Demo: Typed Climate Service Usage
 *
 * This demonstrates how the generic service types provide type safety
 * for entity-specific enum values.
 */

import { ClimateServices } from '../generated/types/services/climate';
import {
    TypedClimateServices,
    ClimateFanModes,
    ClimateHvacModes,
    ClimatePresetModes,
    ClimateSwingModes,
} from '../generated/types/entities/climate';

// Generic service interface (accepts any string)
const genericClimate: ClimateServices = {} as any;

// This compiles - generic interface accepts any string
genericClimate.set_fan_mode({ fan_mode: 'invalid_mode' });
genericClimate.set_hvac_mode({ hvac_mode: 'wrong_mode' });

// Typed service interface (only accepts valid enum values)
const typedClimate: TypedClimateServices = {} as any;

// ✅ These compile - valid enum values
typedClimate.set_fan_mode({ fan_mode: 'auto' });
typedClimate.set_fan_mode({ fan_mode: 'low' });
typedClimate.set_fan_mode({ fan_mode: 'medium' });
typedClimate.set_fan_mode({ fan_mode: 'high' });

typedClimate.set_hvac_mode({ hvac_mode: 'heat' });
typedClimate.set_hvac_mode({ hvac_mode: 'cool' });
typedClimate.set_hvac_mode({ hvac_mode: 'off' });

typedClimate.set_swing_mode({ swing_mode: 'vertical' });
typedClimate.set_swing_mode({ swing_mode: 'horizontal' });

typedClimate.set_preset_mode({ preset_mode: 'away' });

// ❌ These would cause compile errors - invalid enum values
// typedClimate.set_fan_mode({ fan_mode: 'invalid_mode' });
//                                       ^^^^^^^^^^^^^^^
// Type '"invalid_mode"' is not assignable to type 'ClimateFanModes'

// typedClimate.set_hvac_mode({ hvac_mode: 'wrong_mode' });
//                                         ^^^^^^^^^^^^
// Type '"wrong_mode"' is not assignable to type 'ClimateHvacModes'

// Type inference also works
const fanMode: ClimateFanModes = 'auto'; // ✅
// const badMode: ClimateFanModes = 'invalid'; // ❌ Error

console.log('Valid fan modes:', ['auto', 'low', 'medium', 'high', 'middle', 'quiet']);
console.log('Valid HVAC modes:', ['auto', 'cool', 'dry', 'fan_only', 'heat', 'off']);
console.log('Valid swing modes:', ['both', 'horizontal', 'off', 'vertical']);
console.log('Valid preset modes:', ['Energy heat', 'away', 'hold', 'none']);
