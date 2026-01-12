import { HaAttributes, HaEntity, HaGroups } from '../ha-types';

// Light state - derived from actual HA light states
export type LightState = 'on' | 'off' | 'unavailable' | 'unknown';

// Color modes - from entities.json supported_color_modes
export type LightColorMode =
    | 'onoff' // Simple on/off (e.g., Couch Lamp)
    | 'brightness'
    | 'color_temp'
    | 'hs'
    | 'xy'
    | 'rgb'
    | 'rgbw'
    | 'rgbww'
    | 'white';

// Light attributes - from entities.json structure
export interface LightAttributes extends HaAttributes {
    friendly_name: string;
    supported_features: number;
    supported_color_modes: LightColorMode[];
    color_mode?: LightColorMode;

    // Optional based on supported_color_modes
    brightness?: number; // 0-255
    color_temp?: number; // mired
    color_temp_kelvin?: number;
    min_color_temp_kelvin?: number;
    max_color_temp_kelvin?: number;
    hs_color?: [number, number]; // [hue 0-360, saturation 0-100]
    rgb_color?: [number, number, number];
    rgbw_color?: [number, number, number, number];
    rgbww_color?: [number, number, number, number, number];
    xy_color?: [number, number];
    effect?: string;
    effect_list?: string[];
}

// Light turn_on parameters - from services.json fields
export interface LightTurnOnParams {
    transition?: number; // 0-300 seconds
    brightness?: number; // 0-255
    brightness_pct?: number; // 0-100
    brightness_step?: number; // -255 to 255
    brightness_step_pct?: number; // -100 to 100
    rgb_color?: [number, number, number];
    rgbw_color?: [number, number, number, number];
    rgbww_color?: [number, number, number, number, number];
    color_temp?: number; // mired
    color_temp_kelvin?: number; // kelvin
    hs_color?: [number, number];
    xy_color?: [number, number];
    color_name?: string;
    effect?: string;
    flash?: 'short' | 'long';
    profile?: string;
    white?: boolean;
}

// Light turn_off parameters
export interface LightTurnOffParams {
    transition?: number;
    flash?: 'short' | 'long';
}

// Light toggle parameters (same as turn_on)
export interface LightToggleParams extends LightTurnOnParams {}

// Light services interface - methods available on light entities
export interface LightServices {
    turn_on(params?: LightTurnOnParams): Promise<void>;
    turn_off(params?: LightTurnOffParams): Promise<void>;
    toggle(params?: LightToggleParams): Promise<void>;
}

// Complete Light Entity type (without services)
export interface LightEntity extends Omit<HaEntity, 'domain' | 'state' | 'attributes'> {
    domain: 'light';
    state: LightState;
    attributes: LightAttributes;
}

// Light entity with bound services (after proxiedServices)
export type ProxiedLightEntity = LightEntity & LightServices;

// Light supported features bitmask
export const LightSupportedFeatures = {
    EFFECT: 4,
    FLASH: 8,
    TRANSITION: 32,
} as const;

// Helper to check if a light supports a feature
export function lightSupportsFeature(
    entity: LightEntity,
    feature: (typeof LightSupportedFeatures)[keyof typeof LightSupportedFeatures]
): boolean {
    return (entity.attributes.supported_features & feature) !== 0;
}
