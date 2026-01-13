/**
 * Manifest-based change detection for incremental type generation.
 *
 * This tracks hashes of services.json and entities.json to determine:
 * 1. If any regeneration is needed at all
 * 2. Which specific domains need regeneration
 *
 * The manifest is stored as JSON and includes:
 * - Global hash of entire services.json
 * - Global hash of entire entities.json
 * - Per-domain hashes for services
 * - Per-domain hashes for entities
 */

import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ServicesJson } from './service-generator';
import { EntitiesJson } from './entity-generator';

export interface DomainManifest {
    servicesHash?: string;
    entitiesHash?: string;
}

export interface TypeManifest {
    version: string;
    generatedAt: string;
    servicesHash: string;
    entitiesHash: string;
    domains: Record<string, DomainManifest>;
}

/**
 * Create MD5 hash of any data structure
 */
function hashData(data: unknown): string {
    const json = JSON.stringify(data, Object.keys(data as any).sort());
    return createHash('md5').update(json).digest('hex');
}

/**
 * Load existing manifest from disk
 */
export function loadManifest(manifestPath: string): TypeManifest | null {
    try {
        if (!fs.existsSync(manifestPath)) {
            return null;
        }
        const content = fs.readFileSync(manifestPath, 'utf-8');
        return JSON.parse(content);
    } catch (error) {
        console.warn(`Failed to load manifest: ${error}`);
        return null;
    }
}

/**
 * Save manifest to disk
 */
export function saveManifest(manifestPath: string, manifest: TypeManifest): void {
    const dir = path.dirname(manifestPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf-8');
}

/**
 * Create a new manifest from current services and entities
 */
export function createManifest(
    servicesJson: ServicesJson,
    entitiesJson: EntitiesJson
): TypeManifest {
    const manifest: TypeManifest = {
        version: '1.0.0',
        generatedAt: new Date().toISOString(),
        servicesHash: hashData(servicesJson),
        entitiesHash: hashData(entitiesJson),
        domains: {},
    };

    // Hash each service domain
    for (const [domain, services] of Object.entries(servicesJson)) {
        if (!manifest.domains[domain]) {
            manifest.domains[domain] = {};
        }
        manifest.domains[domain].servicesHash = hashData(services);
    }

    // Group entities by domain and hash
    const entitiesByDomain: Record<string, Record<string, any>> = {};
    for (const [entityId, entity] of Object.entries(entitiesJson)) {
        const domain = entityId.split('.')[0];
        if (!entitiesByDomain[domain]) {
            entitiesByDomain[domain] = {};
        }
        entitiesByDomain[domain][entityId] = entity;
    }

    for (const [domain, entities] of Object.entries(entitiesByDomain)) {
        if (!manifest.domains[domain]) {
            manifest.domains[domain] = {};
        }
        manifest.domains[domain].entitiesHash = hashData(entities);
    }

    return manifest;
}

/**
 * Determine what needs to be regenerated based on manifest comparison
 */
export interface ChangeDetectionResult {
    needsRegeneration: boolean;
    needsServicesRegeneration: boolean;
    needsEntitiesRegeneration: boolean;
    needsInstanceRegeneration: boolean;
    changedServiceDomains: Set<string>;
    changedEntityDomains: Set<string>;
    newServiceDomains: Set<string>;
    newEntityDomains: Set<string>;
    removedServiceDomains: Set<string>;
    removedEntityDomains: Set<string>;
}

/**
 * Compare manifests to determine what changed
 */
export function detectChanges(
    oldManifest: TypeManifest | null,
    newManifest: TypeManifest
): ChangeDetectionResult {
    const result: ChangeDetectionResult = {
        needsRegeneration: false,
        needsServicesRegeneration: false,
        needsEntitiesRegeneration: false,
        needsInstanceRegeneration: false,
        changedServiceDomains: new Set(),
        changedEntityDomains: new Set(),
        newServiceDomains: new Set(),
        newEntityDomains: new Set(),
        removedServiceDomains: new Set(),
        removedEntityDomains: new Set(),
    };

    // If no old manifest, everything needs regeneration
    if (!oldManifest) {
        result.needsRegeneration = true;
        result.needsServicesRegeneration = true;
        result.needsEntitiesRegeneration = true;
        result.needsInstanceRegeneration = true;

        // All domains are "new"
        for (const domain of Object.keys(newManifest.domains)) {
            if (newManifest.domains[domain].servicesHash) {
                result.newServiceDomains.add(domain);
            }
            if (newManifest.domains[domain].entitiesHash) {
                result.newEntityDomains.add(domain);
            }
        }

        return result;
    }

    // Check global services hash
    if (oldManifest.servicesHash !== newManifest.servicesHash) {
        result.needsServicesRegeneration = true;
        result.needsRegeneration = true;
    }

    // Check global entities hash
    if (oldManifest.entitiesHash !== newManifest.entitiesHash) {
        result.needsEntitiesRegeneration = true;
        result.needsInstanceRegeneration = true;
        result.needsRegeneration = true;
    }

    // Compare per-domain hashes
    const allDomains = new Set([
        ...Object.keys(oldManifest.domains),
        ...Object.keys(newManifest.domains),
    ]);

    for (const domain of allDomains) {
        const oldDomain = oldManifest.domains[domain];
        const newDomain = newManifest.domains[domain];

        // Check services for this domain
        if (!oldDomain?.servicesHash && newDomain?.servicesHash) {
            result.newServiceDomains.add(domain);
        } else if (oldDomain?.servicesHash && !newDomain?.servicesHash) {
            result.removedServiceDomains.add(domain);
        } else if (oldDomain?.servicesHash !== newDomain?.servicesHash) {
            result.changedServiceDomains.add(domain);
        }

        // Check entities for this domain
        if (!oldDomain?.entitiesHash && newDomain?.entitiesHash) {
            result.newEntityDomains.add(domain);
        } else if (oldDomain?.entitiesHash && !newDomain?.entitiesHash) {
            result.removedEntityDomains.add(domain);
        } else if (oldDomain?.entitiesHash !== newDomain?.entitiesHash) {
            result.changedEntityDomains.add(domain);
        }
    }

    return result;
}

/**
 * Pretty-print change detection results
 */
export function printChanges(changes: ChangeDetectionResult): void {
    if (!changes.needsRegeneration) {
        console.log('✓ No changes detected - types are up to date');
        return;
    }

    console.log('Changes detected:');

    if (changes.needsServicesRegeneration) {
        console.log('  • Services changed');

        if (changes.newServiceDomains.size > 0) {
            console.log(`    + New domains: ${Array.from(changes.newServiceDomains).join(', ')}`);
        }

        if (changes.changedServiceDomains.size > 0) {
            console.log(`    ~ Modified domains: ${Array.from(changes.changedServiceDomains).join(', ')}`);
        }

        if (changes.removedServiceDomains.size > 0) {
            console.log(`    - Removed domains: ${Array.from(changes.removedServiceDomains).join(', ')}`);
        }
    }

    if (changes.needsEntitiesRegeneration) {
        console.log('  • Entities changed');

        if (changes.newEntityDomains.size > 0) {
            console.log(`    + New domains: ${Array.from(changes.newEntityDomains).join(', ')}`);
        }

        if (changes.changedEntityDomains.size > 0) {
            console.log(`    ~ Modified domains: ${Array.from(changes.changedEntityDomains).join(', ')}`);
        }

        if (changes.removedEntityDomains.size > 0) {
            console.log(`    - Removed domains: ${Array.from(changes.removedEntityDomains).join(', ')}`);
        }
    }

    if (changes.needsInstanceRegeneration) {
        console.log('  • Instance types need regeneration');
    }
}

/**
 * Get domains that need regeneration
 */
export function getDomainsToRegenerate(
    changes: ChangeDetectionResult,
    allDomains: string[]
): {
    serviceDomains: string[];
    entityDomains: string[];
} {
    const serviceDomains = new Set<string>();
    const entityDomains = new Set<string>();

    // If full regeneration needed, return all domains
    if (!changes.needsRegeneration) {
        return { serviceDomains: [], entityDomains: [] };
    }

    // Services: regenerate changed, new, or if full regeneration needed
    if (changes.needsServicesRegeneration) {
        for (const domain of allDomains) {
            serviceDomains.add(domain);
        }
    } else {
        for (const domain of changes.changedServiceDomains) {
            serviceDomains.add(domain);
        }
        for (const domain of changes.newServiceDomains) {
            serviceDomains.add(domain);
        }
    }

    // Entities: regenerate changed, new, or if full regeneration needed
    if (changes.needsEntitiesRegeneration) {
        for (const domain of allDomains) {
            entityDomains.add(domain);
        }
    } else {
        for (const domain of changes.changedEntityDomains) {
            entityDomains.add(domain);
        }
        for (const domain of changes.newEntityDomains) {
            entityDomains.add(domain);
        }
    }

    return {
        serviceDomains: Array.from(serviceDomains),
        entityDomains: Array.from(entityDomains),
    };
}
