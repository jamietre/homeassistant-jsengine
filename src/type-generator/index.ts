#!/usr/bin/env node
/**
 * Home Assistant Type Generator CLI
 *
 * Generates TypeScript types from Home Assistant services.json and entities.json.
 *
 * Usage:
 *   npx ts-node src/type-generator/index.ts [options]
 *
 * Options:
 *   --services <path>   Path to services.json (default: ./generated/services.json)
 *   --entities <path>   Path to entities.json (default: ./generated/entities.json)
 *   --output <path>     Output directory (default: ./generated/types)
 *   --force             Force regeneration even if unchanged
 *   --dry-run           Show what would be generated without writing files
 */

import * as fs from 'fs';
import * as path from 'path';
import { generateDomainServices, generateServicesIndex, ServicesJson } from './service-generator';
import { analyzeDomain, generateDomainEntityTypes, generateEntitiesIndex, EntitiesJson } from './entity-generator';
import { generateMyEntitiesInterface, generateEntityIdsFile, generateEntityHelpers } from './instance-generator';
import {
    loadManifest,
    saveManifest,
    createManifest,
    detectChanges,
    printChanges,
    getDomainsToRegenerate,
} from './manifest';

interface CliOptions {
    servicesPath: string;
    entitiesPath: string;
    outputDir: string;
    force: boolean;
    dryRun: boolean;
}

function parseArgs(): CliOptions {
    const args = process.argv.slice(2);
    const options: CliOptions = {
        servicesPath: './generated/services.json',
        entitiesPath: './generated/entities.json',
        outputDir: './generated/types',
        force: false,
        dryRun: false,
    };

    for (let i = 0; i < args.length; i++) {
        switch (args[i]) {
            case '--services':
                options.servicesPath = args[++i];
                break;
            case '--entities':
                options.entitiesPath = args[++i];
                break;
            case '--output':
                options.outputDir = args[++i];
                break;
            case '--force':
                options.force = true;
                break;
            case '--dry-run':
                options.dryRun = true;
                break;
            case '--help':
            case '-h':
                printHelp();
                process.exit(0);
        }
    }

    return options;
}

function printHelp(): void {
    console.log(`
Home Assistant Type Generator

Usage:
  npx ts-node src/type-generator/index.ts [options]

Options:
  --services <path>   Path to services.json (default: ./generated/services.json)
  --entities <path>   Path to entities.json (default: ./generated/entities.json)
  --output <path>     Output directory (default: ./generated/types)
  --force             Force regeneration even if unchanged
  --dry-run           Show what would be generated without writing files
  --help, -h          Show this help message
`);
}

function ensureDir(dir: string): void {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function writeFile(filePath: string, content: string, dryRun: boolean): void {
    if (dryRun) {
        console.log(`[dry-run] Would write: ${filePath}`);
        console.log(`  ${content.split('\n').length} lines`);
    } else {
        fs.writeFileSync(filePath, content, 'utf-8');
        console.log(`Written: ${filePath}`);
    }
}

async function main(): Promise<void> {
    const options = parseArgs();

    console.log('Home Assistant Type Generator');
    console.log('=============================');
    console.log(`Services: ${options.servicesPath}`);
    console.log(`Entities: ${options.entitiesPath}`);
    console.log(`Output:   ${options.outputDir}`);
    console.log(`Force:    ${options.force}`);
    console.log(`Dry Run:  ${options.dryRun}`);
    console.log('');

    // Read services.json
    if (!fs.existsSync(options.servicesPath)) {
        console.error(`Error: Services file not found: ${options.servicesPath}`);
        process.exit(1);
    }

    const servicesJson: ServicesJson = JSON.parse(fs.readFileSync(options.servicesPath, 'utf-8'));
    console.log(`Loaded ${Object.keys(servicesJson).length} domains from services.json`);

    // Read entities.json early for manifest creation
    let entitiesJson: EntitiesJson | null = null;
    if (fs.existsSync(options.entitiesPath)) {
        entitiesJson = JSON.parse(fs.readFileSync(options.entitiesPath, 'utf-8'));
    }

    // Load existing manifest and detect changes
    const manifestPath = path.join(options.outputDir, '.typegen-manifest.json');
    const oldManifest = options.force ? null : loadManifest(manifestPath);
    const newManifest = createManifest(servicesJson, entitiesJson || {});
    const changes = detectChanges(oldManifest, newManifest);

    if (!options.force) {
        printChanges(changes);
        console.log('');

        if (!changes.needsRegeneration) {
            console.log('Skipping regeneration - use --force to regenerate anyway');
            return;
        }
    }

    // Determine which domains need regeneration
    const allServiceDomains = Object.keys(servicesJson);
    const allEntityDomains = entitiesJson ? Array.from(new Set(Object.keys(entitiesJson).map(id => id.split('.')[0]))) : [];

    const { serviceDomains: domainsToRegenerateServices, entityDomains: domainsToRegenerateEntities } =
        options.force ? { serviceDomains: allServiceDomains, entityDomains: allEntityDomains } : getDomainsToRegenerate(changes, allServiceDomains);

    // Create output directory structure
    const servicesDir = path.join(options.outputDir, 'services');
    if (!options.dryRun) {
        ensureDir(servicesDir);
    }

    // Generate service types for each domain (only changed domains if incremental)
    const generatedDomains: string[] = [];

    for (const [domain, services] of Object.entries(servicesJson)) {
        const serviceCount = Object.keys(services).length;
        if (serviceCount === 0) continue;

        // Skip if not in domains to regenerate (unless force)
        if (!options.force && !domainsToRegenerateServices.includes(domain)) {
            generatedDomains.push(domain); // Still track it for index
            continue;
        }

        const code = generateDomainServices(domain, services);
        const filePath = path.join(servicesDir, `${domain}.ts`);

        writeFile(filePath, code, options.dryRun);
        generatedDomains.push(domain);
    }

    // Generate services index file
    const servicesIndexCode = generateServicesIndex(generatedDomains);
    const servicesIndexPath = path.join(servicesDir, 'index.ts');
    writeFile(servicesIndexPath, servicesIndexCode, options.dryRun);

    console.log(`Generated service types for ${generatedDomains.length} domains`);
    console.log('');

    // Generate entity types (only if entities.json exists)
    if (!entitiesJson) {
        console.warn(`Warning: Entities file not found: ${options.entitiesPath}`);
        console.warn('Skipping entity type generation.');
    } else {
        const entityCount = Object.keys(entitiesJson).length;
        if (oldManifest) {
            console.log(`Loaded ${entityCount} entities from entities.json`);
        }

        // Create entities output directory
        const entitiesDir = path.join(options.outputDir, 'entities');
        if (!options.dryRun) {
            ensureDir(entitiesDir);
        }

        // Get unique domains from entities
        const allEntities = Object.values(entitiesJson);
        const entityDomains = new Set(allEntities.map(e => e.entity_id.split('.')[0]));
        const generatedEntityDomains: string[] = [];

        // Track which domains have services for proper imports
        const domainsWithServices = new Set(Object.keys(servicesJson));

        for (const domain of entityDomains) {
            const analysis = analyzeDomain(entitiesJson, domain);
            if (analysis.entityCount === 0) continue;

            // Skip if not in domains to regenerate (unless force)
            if (!options.force && !domainsToRegenerateEntities.includes(domain)) {
                generatedEntityDomains.push(domain); // Still track it for index
                continue;
            }

            const hasServices = domainsWithServices.has(domain);
            const code = generateDomainEntityTypes(analysis, hasServices);
            const filePath = path.join(entitiesDir, `${domain}.ts`);

            writeFile(filePath, code, options.dryRun);
            generatedEntityDomains.push(domain);

            // Log profile info for domains with multiple profiles
            if (analysis.profiles.length > 1) {
                console.log(`  ${domain}: ${analysis.profiles.length} distinct entity profiles`);
            }

            // Log enum types found
            if (analysis.enumTypes.size > 0) {
                const enumNames = Array.from(analysis.enumTypes.keys()).join(', ');
                console.log(`  ${domain}: enums extracted for ${enumNames}`);
            }
        }

        // Generate entities index file
        const entitiesIndexCode = generateEntitiesIndex(generatedEntityDomains);
        const entitiesIndexPath = path.join(entitiesDir, 'index.ts');
        writeFile(entitiesIndexPath, entitiesIndexCode, options.dryRun);

        console.log('');
        console.log(`Generated entity types for ${generatedEntityDomains.length} domains`);

        // Generate Phase 2: Entity instance types (only if entities changed)
        if (options.force || changes.needsInstanceRegeneration) {
            console.log('');
            console.log('Generating entity instance types...');

            // Group entities by domain
            const domainMap = new Map<string, string[]>();
            for (const entityId of Object.keys(entitiesJson)) {
                const domain = entityId.split('.')[0];
                if (!domainMap.has(domain)) {
                    domainMap.set(domain, []);
                }
                domainMap.get(domain)!.push(entityId);
            }

            // Sort entity IDs within each domain
            for (const entityIds of domainMap.values()) {
                entityIds.sort();
            }

            // Generate my-entities.ts (MyEntities interface)
            const myEntitiesCode = generateMyEntitiesInterface(domainMap);
            const myEntitiesPath = path.join(options.outputDir, 'my-entities.ts');
            writeFile(myEntitiesPath, myEntitiesCode, options.dryRun);

            // Generate entity-ids.ts (EntityId union types per domain)
            const entityIdsCode = generateEntityIdsFile(domainMap);
            const entityIdsPath = path.join(options.outputDir, 'entity-ids.ts');
            writeFile(entityIdsPath, entityIdsCode, options.dryRun);

            // Generate entity-helpers.ts (helper functions)
            const entityHelpersCode = generateEntityHelpers();
            const entityHelpersPath = path.join(options.outputDir, 'entity-helpers.ts');
            writeFile(entityHelpersPath, entityHelpersCode, options.dryRun);

            const totalEntities = Array.from(domainMap.values()).reduce((sum, ids) => sum + ids.length, 0);
            console.log(`Generated instance types for ${totalEntities} entities`);
        } else {
            console.log('');
            console.log('Instance types unchanged - skipping regeneration');
        }
    }

    // Save manifest
    if (!options.dryRun) {
        saveManifest(manifestPath, newManifest);
        console.log('');
        console.log(`Manifest saved: ${manifestPath}`);
    }

    console.log('');
    console.log('Type generation complete!');
}

main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
