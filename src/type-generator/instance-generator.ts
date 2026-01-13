/**
 * Instance type generator - generates MyEntities interface mapping entity IDs to types
 *
 * This generates:
 * 1. Entity ID literal unions per domain (ClimateEntityId, LightEntityId, etc.)
 * 2. MyEntities interface mapping all entity IDs to their entity types
 */

import { EntitiesJson } from './entity-generator';

function getDomain(entityId: string): string {
    return entityId.split('.')[0];
}

function pascalCase(str: string): string {
    return str
        .split(/[_\-\s]+/)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join('');
}

/**
 * Group entity IDs by domain
 */
function groupEntitiesByDomain(entities: EntitiesJson): Map<string, string[]> {
    const domainMap = new Map<string, string[]>();

    for (const entityId of Object.keys(entities)) {
        const domain = getDomain(entityId);
        if (!domainMap.has(domain)) {
            domainMap.set(domain, []);
        }
        domainMap.get(domain)!.push(entityId);
    }

    // Sort entity IDs within each domain
    for (const entityIds of domainMap.values()) {
        entityIds.sort();
    }

    return domainMap;
}

/**
 * Generate entity ID literal type for a single domain
 */
export function generateDomainEntityIdType(domain: string, entityIds: string[]): string {
    const domainPascal = pascalCase(domain);
    const lines: string[] = [];

    lines.push(`/** Entity IDs for ${domain} domain (${entityIds.length} entities) */`);
    lines.push(`export type ${domainPascal}EntityId =`);

    for (let i = 0; i < entityIds.length; i++) {
        const entityId = entityIds[i];
        const isLast = i === entityIds.length - 1;
        lines.push(`    | '${entityId}'${isLast ? ';' : ''}`);
    }

    return lines.join('\n');
}

/**
 * Generate MyEntities interface mapping all entity IDs to their types
 */
export function generateMyEntitiesInterface(domainMap: Map<string, string[]>): string {
    const lines: string[] = [];

    // Import all domain entity types
    lines.push('/**');
    lines.push(' * Type-safe entity map for your Home Assistant instance.');
    lines.push(' * Maps each entity_id to its domain-specific entity type.');
    lines.push(' */');
    lines.push('');

    // Generate imports for each domain
    const domains = Array.from(domainMap.keys()).sort();
    for (const domain of domains) {
        const domainPascal = pascalCase(domain);
        lines.push(`import { ${domainPascal}Entity } from './entities/${domain}';`);
    }
    lines.push('');

    // Generate MyEntities interface
    lines.push('/**');
    lines.push(' * Complete entity map with type-safe access to all entities.');
    lines.push(` * Contains ${Array.from(domainMap.values()).reduce((sum, ids) => sum + ids.length, 0)} entities across ${domains.length} domains.`);
    lines.push(' */');
    lines.push('export interface MyEntities {');

    for (const domain of domains) {
        const entityIds = domainMap.get(domain)!;
        const domainPascal = pascalCase(domain);

        for (const entityId of entityIds) {
            lines.push(`    '${entityId}': ${domainPascal}Entity;`);
        }
    }

    lines.push('}');
    lines.push('');

    // Generate helper type for all entity IDs
    lines.push('/** Union of all entity IDs in your Home Assistant instance */');
    lines.push('export type AllEntityIds = keyof MyEntities;');

    return lines.join('\n');
}

/**
 * Generate entity ID types file (one file with all domain entity ID unions)
 */
export function generateEntityIdsFile(domainMap: Map<string, string[]>): string {
    const lines: string[] = [];

    lines.push('/**');
    lines.push(' * Generated entity ID types.');
    lines.push(' * DO NOT EDIT - This file is auto-generated.');
    lines.push(' */');
    lines.push('');

    const domains = Array.from(domainMap.keys()).sort();

    // Generate entity ID union for each domain
    for (const domain of domains) {
        const entityIds = domainMap.get(domain)!;
        lines.push(generateDomainEntityIdType(domain, entityIds));
        lines.push('');
    }

    // Generate AllEntityIds union
    const domainIdTypes = domains.map(d => `${pascalCase(d)}EntityId`);
    lines.push('/** Union of all entity IDs across all domains */');
    lines.push(`export type AllEntityIds = ${domainIdTypes.join(' | ')};`);

    return lines.join('\n');
}

/**
 * Generate helper functions for type-safe entity access
 */
export function generateEntityHelpers(): string {
    const lines: string[] = [];

    lines.push('/**');
    lines.push(' * Generated entity helper functions.');
    lines.push(' * DO NOT EDIT - This file is auto-generated.');
    lines.push(' */');
    lines.push('');
    lines.push("import { MyEntities, AllEntityIds } from './my-entities';");
    lines.push('');

    lines.push('/**');
    lines.push(' * Type-safe entity accessor.');
    lines.push(' * Usage: const entity = getEntity(entities, "climate.heatpump_office");');
    lines.push(' */');
    lines.push('export function getEntity<T extends AllEntityIds>(');
    lines.push('    entities: MyEntities,');
    lines.push('    entityId: T');
    lines.push('): MyEntities[T] {');
    lines.push('    return entities[entityId];');
    lines.push('}');
    lines.push('');

    lines.push('/**');
    lines.push(' * Check if an entity ID exists in the entity map.');
    lines.push(' */');
    lines.push('export function hasEntity(');
    lines.push('    entities: MyEntities,');
    lines.push('    entityId: string');
    lines.push('): entityId is AllEntityIds {');
    lines.push('    return entityId in entities;');
    lines.push('}');
    lines.push('');

    lines.push('/**');
    lines.push(' * Get entity IDs by domain.');
    lines.push(' */');
    lines.push('export function getEntityIdsByDomain(');
    lines.push('    entities: MyEntities,');
    lines.push('    domain: string');
    lines.push('): AllEntityIds[] {');
    lines.push('    return Object.keys(entities).filter(id => id.startsWith(`${domain}.`)) as AllEntityIds[];');
    lines.push('}');

    return lines.join('\n');
}
