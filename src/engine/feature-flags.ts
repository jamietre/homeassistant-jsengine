/**
 * Feature flag constants for Home Assistant entities.
 *
 * These constants correspond to the supported_features bitmask that indicates
 * which services/capabilities an entity supports.
 *
 * Usage:
 *   if (hasFeature(entity, CLIMATE_SUPPORT_TARGET_TEMPERATURE)) {
 *     await entity.set_temperature({ temperature: 72 });
 *   }
 */

// Climate domain features
export const CLIMATE_SUPPORT_TARGET_TEMPERATURE = 1;
export const CLIMATE_SUPPORT_TARGET_TEMPERATURE_RANGE = 2;
export const CLIMATE_SUPPORT_TARGET_HUMIDITY = 4;
export const CLIMATE_SUPPORT_FAN_MODE = 8;
export const CLIMATE_SUPPORT_PRESET_MODE = 16;
export const CLIMATE_SUPPORT_SWING_MODE = 32;
export const CLIMATE_SUPPORT_AUX_HEAT = 64;
export const CLIMATE_SUPPORT_TURN_OFF = 128;
export const CLIMATE_SUPPORT_TURN_ON = 256;

// Light domain features
export const LIGHT_SUPPORT_BRIGHTNESS = 1;
export const LIGHT_SUPPORT_COLOR_TEMP = 2;
export const LIGHT_SUPPORT_EFFECT = 4;
export const LIGHT_SUPPORT_FLASH = 8;
export const LIGHT_SUPPORT_COLOR = 16;
export const LIGHT_SUPPORT_TRANSITION = 32;
export const LIGHT_SUPPORT_WHITE_VALUE = 128;

// Cover domain features
export const COVER_SUPPORT_OPEN = 1;
export const COVER_SUPPORT_CLOSE = 2;
export const COVER_SUPPORT_SET_POSITION = 4;
export const COVER_SUPPORT_STOP = 8;
export const COVER_SUPPORT_OPEN_TILT = 16;
export const COVER_SUPPORT_CLOSE_TILT = 32;
export const COVER_SUPPORT_STOP_TILT = 64;
export const COVER_SUPPORT_SET_TILT_POSITION = 128;

// Fan domain features
export const FAN_SUPPORT_SET_SPEED = 1;
export const FAN_SUPPORT_OSCILLATE = 2;
export const FAN_SUPPORT_DIRECTION = 4;
export const FAN_SUPPORT_PRESET_MODE = 8;

// Vacuum domain features
export const VACUUM_SUPPORT_TURN_ON = 1;
export const VACUUM_SUPPORT_TURN_OFF = 2;
export const VACUUM_SUPPORT_PAUSE = 4;
export const VACUUM_SUPPORT_STOP = 8;
export const VACUUM_SUPPORT_RETURN_HOME = 16;
export const VACUUM_SUPPORT_FAN_SPEED = 32;
export const VACUUM_SUPPORT_BATTERY = 64;
export const VACUUM_SUPPORT_STATUS = 128;
export const VACUUM_SUPPORT_SEND_COMMAND = 256;
export const VACUUM_SUPPORT_LOCATE = 512;
export const VACUUM_SUPPORT_CLEAN_SPOT = 1024;
export const VACUUM_SUPPORT_MAP = 2048;
export const VACUUM_SUPPORT_STATE = 4096;
export const VACUUM_SUPPORT_START = 8192;

// Media Player domain features
export const MEDIA_PLAYER_SUPPORT_PAUSE = 1;
export const MEDIA_PLAYER_SUPPORT_SEEK = 2;
export const MEDIA_PLAYER_SUPPORT_VOLUME_SET = 4;
export const MEDIA_PLAYER_SUPPORT_VOLUME_MUTE = 8;
export const MEDIA_PLAYER_SUPPORT_PREVIOUS_TRACK = 16;
export const MEDIA_PLAYER_SUPPORT_NEXT_TRACK = 32;
export const MEDIA_PLAYER_SUPPORT_TURN_ON = 128;
export const MEDIA_PLAYER_SUPPORT_TURN_OFF = 256;
export const MEDIA_PLAYER_SUPPORT_PLAY_MEDIA = 512;
export const MEDIA_PLAYER_SUPPORT_VOLUME_STEP = 1024;
export const MEDIA_PLAYER_SUPPORT_SELECT_SOURCE = 2048;
export const MEDIA_PLAYER_SUPPORT_STOP = 4096;
export const MEDIA_PLAYER_SUPPORT_CLEAR_PLAYLIST = 8192;
export const MEDIA_PLAYER_SUPPORT_PLAY = 16384;
export const MEDIA_PLAYER_SUPPORT_SHUFFLE_SET = 32768;
export const MEDIA_PLAYER_SUPPORT_SELECT_SOUND_MODE = 65536;
export const MEDIA_PLAYER_SUPPORT_BROWSE_MEDIA = 131072;
export const MEDIA_PLAYER_SUPPORT_REPEAT_SET = 262144;
export const MEDIA_PLAYER_SUPPORT_GROUPING = 524288;

// Water Heater domain features
export const WATER_HEATER_SUPPORT_TARGET_TEMPERATURE = 1;
export const WATER_HEATER_SUPPORT_OPERATION_MODE = 2;
export const WATER_HEATER_SUPPORT_AWAY_MODE = 4;

// Lock domain features
export const LOCK_SUPPORT_OPEN = 1;

// Humidifier domain features
export const HUMIDIFIER_SUPPORT_MODES = 1;

/**
 * Check if an entity supports a specific feature.
 *
 * @param entity - The entity to check
 * @param feature - The feature flag constant to check for
 * @returns true if the entity supports the feature
 *
 * @example
 * const climate = typed.getEntity('climate.basement');
 * if (hasFeature(climate, CLIMATE_SUPPORT_TARGET_TEMPERATURE)) {
 *   await climate.set_temperature({ temperature: 72 });
 * }
 */
export function hasFeature(
    entity: { attributes: { supported_features?: number } },
    feature: number
): boolean {
    const supported = entity.attributes.supported_features ?? 0;
    return (supported & feature) !== 0;
}

/**
 * Get all supported features for an entity as an array of feature names.
 *
 * @param entity - The entity to check
 * @param featureMap - Map of feature constants to names
 * @returns Array of supported feature names
 *
 * @example
 * const climate = typed.getEntity('climate.basement');
 * const features = getSupportedFeatures(climate, CLIMATE_FEATURES);
 * console.log('Supported features:', features);
 * // ['TARGET_TEMPERATURE', 'FAN_MODE', 'PRESET_MODE']
 */
export function getSupportedFeatures(
    entity: { attributes: { supported_features?: number } },
    featureMap: Record<string, number>
): string[] {
    const supported = entity.attributes.supported_features ?? 0;
    const features: string[] = [];

    for (const [name, flag] of Object.entries(featureMap)) {
        if ((supported & flag) !== 0) {
            features.push(name);
        }
    }

    return features;
}

/**
 * Feature maps for common domains.
 * Used with getSupportedFeatures() to get human-readable feature names.
 */
export const CLIMATE_FEATURES = {
    TARGET_TEMPERATURE: CLIMATE_SUPPORT_TARGET_TEMPERATURE,
    TARGET_TEMPERATURE_RANGE: CLIMATE_SUPPORT_TARGET_TEMPERATURE_RANGE,
    TARGET_HUMIDITY: CLIMATE_SUPPORT_TARGET_HUMIDITY,
    FAN_MODE: CLIMATE_SUPPORT_FAN_MODE,
    PRESET_MODE: CLIMATE_SUPPORT_PRESET_MODE,
    SWING_MODE: CLIMATE_SUPPORT_SWING_MODE,
    AUX_HEAT: CLIMATE_SUPPORT_AUX_HEAT,
    TURN_OFF: CLIMATE_SUPPORT_TURN_OFF,
    TURN_ON: CLIMATE_SUPPORT_TURN_ON,
} as const;

export const LIGHT_FEATURES = {
    BRIGHTNESS: LIGHT_SUPPORT_BRIGHTNESS,
    COLOR_TEMP: LIGHT_SUPPORT_COLOR_TEMP,
    EFFECT: LIGHT_SUPPORT_EFFECT,
    FLASH: LIGHT_SUPPORT_FLASH,
    COLOR: LIGHT_SUPPORT_COLOR,
    TRANSITION: LIGHT_SUPPORT_TRANSITION,
    WHITE_VALUE: LIGHT_SUPPORT_WHITE_VALUE,
} as const;

export const COVER_FEATURES = {
    OPEN: COVER_SUPPORT_OPEN,
    CLOSE: COVER_SUPPORT_CLOSE,
    SET_POSITION: COVER_SUPPORT_SET_POSITION,
    STOP: COVER_SUPPORT_STOP,
    OPEN_TILT: COVER_SUPPORT_OPEN_TILT,
    CLOSE_TILT: COVER_SUPPORT_CLOSE_TILT,
    STOP_TILT: COVER_SUPPORT_STOP_TILT,
    SET_TILT_POSITION: COVER_SUPPORT_SET_TILT_POSITION,
} as const;

export const MEDIA_PLAYER_FEATURES = {
    PAUSE: MEDIA_PLAYER_SUPPORT_PAUSE,
    SEEK: MEDIA_PLAYER_SUPPORT_SEEK,
    VOLUME_SET: MEDIA_PLAYER_SUPPORT_VOLUME_SET,
    VOLUME_MUTE: MEDIA_PLAYER_SUPPORT_VOLUME_MUTE,
    PREVIOUS_TRACK: MEDIA_PLAYER_SUPPORT_PREVIOUS_TRACK,
    NEXT_TRACK: MEDIA_PLAYER_SUPPORT_NEXT_TRACK,
    TURN_ON: MEDIA_PLAYER_SUPPORT_TURN_ON,
    TURN_OFF: MEDIA_PLAYER_SUPPORT_TURN_OFF,
    PLAY_MEDIA: MEDIA_PLAYER_SUPPORT_PLAY_MEDIA,
    VOLUME_STEP: MEDIA_PLAYER_SUPPORT_VOLUME_STEP,
    SELECT_SOURCE: MEDIA_PLAYER_SUPPORT_SELECT_SOURCE,
    STOP: MEDIA_PLAYER_SUPPORT_STOP,
    CLEAR_PLAYLIST: MEDIA_PLAYER_SUPPORT_CLEAR_PLAYLIST,
    PLAY: MEDIA_PLAYER_SUPPORT_PLAY,
    SHUFFLE_SET: MEDIA_PLAYER_SUPPORT_SHUFFLE_SET,
    SELECT_SOUND_MODE: MEDIA_PLAYER_SUPPORT_SELECT_SOUND_MODE,
    BROWSE_MEDIA: MEDIA_PLAYER_SUPPORT_BROWSE_MEDIA,
    REPEAT_SET: MEDIA_PLAYER_SUPPORT_REPEAT_SET,
    GROUPING: MEDIA_PLAYER_SUPPORT_GROUPING,
} as const;
