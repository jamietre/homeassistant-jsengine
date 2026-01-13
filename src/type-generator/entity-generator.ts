/**
 * Entity type generator - extracts attribute types from entities.json
 *
 * This generates:
 * 1. Domain-level attribute interfaces (aggregated across all entities)
 * 2. Enum union types extracted from array attributes (fan_modes, hvac_modes, etc.)
 * 3. Entity "profiles" for grouping similar entities
 */

import { createHash } from 'crypto';

// Entity structure from Home Assistant API
export interface HaEntity {
    entity_id: string;
    state: string;
    attributes: Record<string, unknown>;
    last_changed?: string;
    last_updated?: string;
    context?: { id: string; parent_id: string | null; user_id: string | null };
}

// EntitiesJson is an object keyed by entity_id
export type EntitiesJson = Record<string, HaEntity>;

// Detected attribute type information
interface AttributeInfo {
    name: string;
    types: Set<string>;              // JS types observed: 'string', 'number', 'boolean', 'array', 'object', 'null'
    isOptional: boolean;             // true if not present in all entities
    enumValues?: Set<string>;        // For array attributes that look like enums (fan_modes, etc.)
    arrayElementType?: string;       // Type of array elements
    sampleValues?: unknown[];        // Sample values for documentation
}

// Entity profile - a unique combination of attributes
interface EntityProfile {
    hash: string;
    entityIds: string[];
    attributes: Map<string, AttributeInfo>;
}

// Domain analysis result
export interface DomainAnalysis {
    domain: string;
    entityCount: number;
    profiles: EntityProfile[];
    aggregatedAttributes: Map<string, AttributeInfo>;
    enumTypes: Map<string, string[]>;  // attribute name -> enum values
}

/**
 * Extract domain from entity_id
 */
function getDomain(entityId: string): string {
    return entityId.split('.')[0];
}

/**
 * Get the JavaScript type of a value
 */
function getValueType(value: unknown): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
}

/**
 * Check if an array looks like an enum (array of strings, typically mode options)
 */
function isEnumArray(value: unknown): value is string[] {
    if (!Array.isArray(value)) return false;
    if (value.length === 0) return false;
    return value.every(item => typeof item === 'string');
}

/**
 * Common attribute names that are known to contain enum arrays
 */
const KNOWN_ENUM_ATTRIBUTES = new Set([
    'fan_modes',
    'hvac_modes',
    'swing_modes',
    'preset_modes',
    'hvac_action',
    'supported_color_modes',
    'effect_list',
    'source_list',
    'sound_mode_list',
    'options',          // input_select, select
    'operation_list',   // water_heater
    'fan_speed_list',   // vacuum
]);

/**
 * Analyze a single entity's attributes
 */
function analyzeEntityAttributes(entity: HaEntity): Map<string, AttributeInfo> {
    const attributes = new Map<string, AttributeInfo>();

    for (const [name, value] of Object.entries(entity.attributes)) {
        const type = getValueType(value);
        const info: AttributeInfo = {
            name,
            types: new Set([type]),
            isOptional: false,  // Will be adjusted during aggregation
        };

        if (type === 'array') {
            if (isEnumArray(value)) {
                info.enumValues = new Set(value as string[]);
                info.arrayElementType = 'string';
            } else if (Array.isArray(value) && value.length > 0) {
                info.arrayElementType = getValueType(value[0]);
            }
        }

        // Store sample value for documentation
        info.sampleValues = [value];

        attributes.set(name, info);
    }

    return attributes;
}

/**
 * Create a hash representing an entity's attribute schema
 * Used to group entities with identical attribute structures
 */
function createAttributeSchemaHash(attributes: Map<string, AttributeInfo>): string {
    const schema: Record<string, { types: string[]; enum?: string[] }> = {};

    for (const [name, info] of attributes) {
        schema[name] = {
            types: Array.from(info.types).sort(),
        };
        if (info.enumValues) {
            schema[name].enum = Array.from(info.enumValues).sort();
        }
    }

    const sorted = Object.keys(schema).sort().reduce((acc, key) => {
        acc[key] = schema[key];
        return acc;
    }, {} as typeof schema);

    return createHash('md5').update(JSON.stringify(sorted)).digest('hex').slice(0, 8);
}

/**
 * Merge two attribute infos, combining types and enum values
 */
function mergeAttributeInfo(existing: AttributeInfo, incoming: AttributeInfo): AttributeInfo {
    const merged: AttributeInfo = {
        name: existing.name,
        types: new Set([...existing.types, ...incoming.types]),
        isOptional: existing.isOptional || incoming.isOptional,
    };

    // Merge enum values
    if (existing.enumValues || incoming.enumValues) {
        merged.enumValues = new Set([
            ...(existing.enumValues || []),
            ...(incoming.enumValues || []),
        ]);
    }

    // Keep array element type if consistent
    if (existing.arrayElementType === incoming.arrayElementType) {
        merged.arrayElementType = existing.arrayElementType;
    }

    // Merge sample values (keep up to 3)
    merged.sampleValues = [
        ...(existing.sampleValues || []),
        ...(incoming.sampleValues || []),
    ].slice(0, 3);

    return merged;
}

/**
 * Analyze all entities in a domain
 */
export function analyzeDomain(entities: EntitiesJson, domain: string): DomainAnalysis {
    const allEntities = Object.values(entities);
    const domainEntities = allEntities.filter(e => getDomain(e.entity_id) === domain);

    // Group entities by attribute schema hash
    const profileMap = new Map<string, EntityProfile>();
    const aggregatedAttributes = new Map<string, AttributeInfo>();
    const attributePresence = new Map<string, number>();

    for (const entity of domainEntities) {
        const entityAttrs = analyzeEntityAttributes(entity);
        const hash = createAttributeSchemaHash(entityAttrs);

        // Add to profile
        if (!profileMap.has(hash)) {
            profileMap.set(hash, {
                hash,
                entityIds: [],
                attributes: entityAttrs,
            });
        }
        profileMap.get(hash)!.entityIds.push(entity.entity_id);

        // Aggregate attributes across all entities
        for (const [name, info] of entityAttrs) {
            if (aggregatedAttributes.has(name)) {
                aggregatedAttributes.set(name, mergeAttributeInfo(aggregatedAttributes.get(name)!, info));
            } else {
                aggregatedAttributes.set(name, { ...info });
            }
            attributePresence.set(name, (attributePresence.get(name) || 0) + 1);
        }
    }

    // Mark attributes as optional if not present in all entities
    for (const [name, info] of aggregatedAttributes) {
        info.isOptional = (attributePresence.get(name) || 0) < domainEntities.length;
    }

    // Extract enum types from known enum attributes and detected enum arrays
    const enumTypes = new Map<string, string[]>();
    for (const [name, info] of aggregatedAttributes) {
        if (info.enumValues && info.enumValues.size > 0) {
            // Only create enum types for known enum attributes or reasonably sized enums
            if (KNOWN_ENUM_ATTRIBUTES.has(name) || info.enumValues.size <= 20) {
                enumTypes.set(name, Array.from(info.enumValues).sort());
            }
        }
    }

    return {
        domain,
        entityCount: domainEntities.length,
        profiles: Array.from(profileMap.values()),
        aggregatedAttributes,
        enumTypes,
    };
}

/**
 * Convert attribute info to TypeScript type
 */
function attributeToTsType(info: AttributeInfo, enumTypeName?: string): string {
    const types = Array.from(info.types);

    // If we have an enum type, use it
    if (enumTypeName) {
        return enumTypeName;
    }

    // Handle mixed types
    const tsTypes: string[] = [];

    for (const type of types) {
        switch (type) {
            case 'string':
                tsTypes.push('string');
                break;
            case 'number':
                tsTypes.push('number');
                break;
            case 'boolean':
                tsTypes.push('boolean');
                break;
            case 'null':
                tsTypes.push('null');
                break;
            case 'array':
                if (info.enumValues) {
                    // Array of enum values - the attribute IS the array
                    tsTypes.push(`string[]`);
                } else if (info.arrayElementType) {
                    tsTypes.push(`${info.arrayElementType}[]`);
                } else {
                    tsTypes.push('unknown[]');
                }
                break;
            case 'object':
                tsTypes.push('Record<string, unknown>');
                break;
            default:
                tsTypes.push('unknown');
        }
    }

    // Deduplicate
    const unique = [...new Set(tsTypes)];
    return unique.join(' | ') || 'unknown';
}

/**
 * Convert attribute name to PascalCase type name
 */
function toPascalCase(str: string): string {
    return str
        .split(/[_-]/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join('');
}

/**
 * Extract a meaningful profile name from an entity_id.
 * Examples:
 *   climate.heatpump_guest_room_heat_pump_guest_room -> Heatpump
 *   climate.t6_pro_z_wave_programmable_thermostat_with_smartstart -> T6Pro
 *   light.s31_id1_switch -> S31
 */
function extractProfileName(entityId: string, domain: string): string {
    // Remove domain prefix
    const withoutDomain = entityId.replace(`${domain}.`, '');

    // Split into parts
    let parts = withoutDomain.split('_');

    // Remove common suffixes and location identifiers
    const filteredParts = parts.filter(part =>
        !['switch', 'light', 'sensor', 'binary', 'id1', 'id2', 'id3', 'id4'].includes(part.toLowerCase()) &&
        !part.match(/^(guest|office|garage|loft|basement|kitchen|bedroom|living|room)$/i)
    );

    // Remove duplicate words (keep first occurrence)
    // Also detect compound words: if we've seen "heatpump", skip "heat" and "pump"
    const seen = new Set<string>();
    const deduplicated: string[] = [];
    for (const part of filteredParts) {
        const lower = part.toLowerCase();

        // Skip if we've seen this exact word
        if (seen.has(lower)) {
            continue;
        }

        // Skip if any previously seen word contains this word
        // (e.g., if we've seen "heatpump", skip "heat" and "pump")
        const isSubwordOfSeen = Array.from(seen).some(seenWord => seenWord.includes(lower));
        if (isSubwordOfSeen) {
            continue;
        }

        seen.add(lower);
        deduplicated.push(part);
    }

    // Take first 3 meaningful parts to avoid overly long names
    const significantParts = deduplicated.slice(0, 3);

    // Convert to PascalCase
    const name = significantParts
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join('');

    return name || 'Default';
}

/**
 * Generate unique profile names for a domain, avoiding collisions.
 */
function generateProfileNames(profiles: EntityProfile[], domain: string): Map<string, string> {
    const nameMap = new Map<string, string>();
    const nameCount = new Map<string, number>();

    for (const profile of profiles) {
        // Extract base name from first entity
        const firstEntityId = profile.entityIds[0];
        const baseName = extractProfileName(firstEntityId, domain);

        // Handle collisions by adding numeric suffix
        const count = nameCount.get(baseName) || 0;
        nameCount.set(baseName, count + 1);

        const uniqueName = count > 0 ? `${baseName}${count + 1}` : baseName;
        nameMap.set(profile.hash, uniqueName);
    }

    return nameMap;
}

/**
 * Mapping of entity attribute names to service generic type parameters.
 * Used to match entity enums with service generics.
 */
const ATTRIBUTE_TO_SERVICE_GENERIC_MAP: Record<string, string> = {
    'hvac_modes': 'THvacMode',
    'fan_modes': 'TFanMode',
    'swing_modes': 'TSwingMode',
    'swing_horizontal_modes': 'TSwingHorizontalMode',
    'swing_vertical_modes': 'TSwingVerticalMode',
    'preset_modes': 'TPresetMode',
    'operation_list': 'TOperationMode',
    'sound_mode_list': 'TSoundMode',
    'effect_list': 'TEffect',
    'source_list': 'TSource',
    'options': 'TOption',
};

/**
 * Known generic type parameters for each domain, in the order they appear in the service interface.
 * This ensures we provide generic parameters in the correct positional order.
 */
const DOMAIN_GENERIC_PARAMS: Record<string, string[]> = {
    'climate': ['TFanMode', 'THvacMode', 'TPresetMode', 'TSwingHorizontalMode', 'TSwingMode'],
    'media_player': ['TSource', 'TSoundMode'],
    'water_heater': ['TOperationMode'],
    'select': ['TOption'],
    'input_select': ['TOption'],
    'light': ['TEffect'],
};

/**
 * Generate TypeScript code for a domain's entity attributes
 */
export function generateDomainEntityTypes(analysis: DomainAnalysis, hasServices: boolean = true): string {
    const lines: string[] = [];
    const domainPascal = toPascalCase(analysis.domain);

    lines.push('/**');
    lines.push(` * Generated entity types for the "${analysis.domain}" domain.`);
    lines.push(' * DO NOT EDIT - This file is auto-generated.');
    lines.push(' */');
    lines.push('');

    // Import service interface if this domain has services with enum types
    const hasServiceGenerics = hasServices && analysis.enumTypes.size > 0 &&
        Array.from(analysis.enumTypes.keys()).some(attr => ATTRIBUTE_TO_SERVICE_GENERIC_MAP[attr]);

    if (hasServiceGenerics) {
        lines.push(`import { ${domainPascal}Services } from '../services/${analysis.domain}';`);
        lines.push('');
    }

    // Generate enum types first
    const enumTypeNames = new Map<string, string>();
    for (const [attrName, values] of analysis.enumTypes) {
        const typeName = `${domainPascal}${toPascalCase(attrName)}`;
        enumTypeNames.set(attrName, typeName);

        lines.push(`/** Possible values for ${attrName} attribute */`);
        lines.push(`export type ${typeName} = ${values.map(v => `'${v}'`).join(' | ')};`);
        lines.push('');
    }

    // Generate state type if we can infer it
    const states = new Set<string>();
    // We'd need to track states during analysis - for now, use common patterns
    const commonStates: Record<string, string[]> = {
        light: ['on', 'off', 'unavailable', 'unknown'],
        switch: ['on', 'off', 'unavailable', 'unknown'],
        binary_sensor: ['on', 'off', 'unavailable', 'unknown'],
        climate: ['off', 'heat', 'cool', 'heat_cool', 'auto', 'dry', 'fan_only', 'unavailable', 'unknown'],
        cover: ['open', 'closed', 'opening', 'closing', 'stopped', 'unavailable', 'unknown'],
        lock: ['locked', 'unlocked', 'locking', 'unlocking', 'jammed', 'unavailable', 'unknown'],
        media_player: ['on', 'off', 'playing', 'paused', 'idle', 'standby', 'buffering', 'unavailable', 'unknown'],
        vacuum: ['cleaning', 'docked', 'paused', 'idle', 'returning', 'error', 'unavailable', 'unknown'],
        fan: ['on', 'off', 'unavailable', 'unknown'],
        alarm_control_panel: ['disarmed', 'armed_home', 'armed_away', 'armed_night', 'armed_custom_bypass', 'pending', 'arming', 'disarming', 'triggered', 'unavailable', 'unknown'],
    };

    if (commonStates[analysis.domain]) {
        lines.push(`/** Possible states for ${analysis.domain} entities */`);
        lines.push(`export type ${domainPascal}State = ${commonStates[analysis.domain].map(s => `'${s}'`).join(' | ')};`);
        lines.push('');
    }

    // Generate attributes interface
    lines.push(`/** Attributes for ${analysis.domain} entities */`);
    lines.push(`export interface ${domainPascal}Attributes {`);

    // Sort attributes: required first, then alphabetically
    const sortedAttrs = Array.from(analysis.aggregatedAttributes.entries())
        .sort((a, b) => {
            if (a[1].isOptional !== b[1].isOptional) {
                return a[1].isOptional ? 1 : -1;
            }
            return a[0].localeCompare(b[0]);
        });

    for (const [name, info] of sortedAttrs) {
        const enumTypeName = enumTypeNames.get(name);
        const tsType = attributeToTsType(info, enumTypeName ? `${enumTypeName}[]` : undefined);
        const optional = info.isOptional ? '?' : '';

        // Add JSDoc if we have sample values
        if (info.sampleValues && info.sampleValues.length > 0) {
            const sample = JSON.stringify(info.sampleValues[0]);
            if (sample.length < 60) {
                lines.push(`    /** Example: ${sample} */`);
            }
        }

        lines.push(`    ${name}${optional}: ${tsType};`);
    }

    lines.push('}');
    lines.push('');

    // Generate entity profiles if there are multiple distinct types
    if (analysis.profiles.length > 1) {
        lines.push('/**');
        lines.push(` * Entity profiles detected in the ${analysis.domain} domain.`);
        lines.push(` * ${analysis.profiles.length} distinct attribute schemas found.`);
        lines.push(' */');
        lines.push('');

        // Generate meaningful names for each profile
        const profileNames = generateProfileNames(analysis.profiles, analysis.domain);

        for (const profile of analysis.profiles) {
            const profileName = `${domainPascal}${profileNames.get(profile.hash)}`;
            lines.push(`/** ${profileNames.get(profile.hash)} profile - ${profile.entityIds.length} entities */`);
            lines.push(`// Entities: ${profile.entityIds.slice(0, 3).join(', ')}${profile.entityIds.length > 3 ? '...' : ''}`);
            lines.push(`export interface ${profileName}Attributes {`);

            for (const [name, info] of profile.attributes) {
                const enumTypeName = enumTypeNames.get(name);
                const tsType = attributeToTsType(info, enumTypeName ? `${enumTypeName}[]` : undefined);
                lines.push(`    ${name}: ${tsType};`);
            }

            lines.push('}');
            lines.push('');
        }
    }

    // Generate typed service variant if this domain has services
    if (hasServices && analysis.enumTypes.size > 0) {
        // Build mapping of generic param -> concrete type
        const genericTypeMap = new Map<string, string>();

        for (const [attrName, values] of analysis.enumTypes) {
            const genericParam = ATTRIBUTE_TO_SERVICE_GENERIC_MAP[attrName];
            if (genericParam) {
                const enumTypeName = `${domainPascal}${toPascalCase(attrName)}`;
                // The enum type is already a union of string literals, not an array
                // (e.g., ClimateFanModes = 'auto' | 'low' | ...)
                genericTypeMap.set(genericParam, enumTypeName);
            }
        }

        // Get the expected parameter order for this domain
        const expectedParams = DOMAIN_GENERIC_PARAMS[analysis.domain];

        if (expectedParams && genericTypeMap.size > 0) {
            lines.push('/**');
            lines.push(` * Typed service interface for ${analysis.domain} entities.`);
            lines.push(' * Combines the generic services interface with domain-specific enum types.');
            lines.push(' */');

            // Provide all parameters in the correct order, using string as default for missing ones
            const orderedTypes = expectedParams.map(param => genericTypeMap.get(param) || 'string');

            lines.push(`export type Typed${domainPascal}Services = ${domainPascal}Services<`);
            lines.push('    ' + orderedTypes.join(',\n    '));
            lines.push('>;');
            lines.push('');
        }
    }

    return lines.join('\n');
}

/**
 * Generate entity types for all domains
 */
export function generateAllEntityTypes(entities: EntitiesJson): Map<string, string> {
    const result = new Map<string, string>();

    // Get unique domains
    const allEntities = Object.values(entities);
    const domains = new Set(allEntities.map(e => getDomain(e.entity_id)));

    for (const domain of domains) {
        const analysis = analyzeDomain(entities, domain);
        if (analysis.entityCount > 0) {
            result.set(domain, generateDomainEntityTypes(analysis));
        }
    }

    return result;
}

/**
 * Generate index file exporting all entity types
 */
export function generateEntitiesIndex(domains: string[]): string {
    const lines: string[] = [];

    lines.push('/**');
    lines.push(' * Generated entity types index.');
    lines.push(' * DO NOT EDIT - This file is auto-generated.');
    lines.push(' */');
    lines.push('');

    for (const domain of domains.sort()) {
        lines.push(`export * from './${domain}';`);
    }

    return lines.join('\n');
}
