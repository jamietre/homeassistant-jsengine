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

    // Create output directory structure
    const servicesDir = path.join(options.outputDir, 'services');
    if (!options.dryRun) {
        ensureDir(servicesDir);
    }

    // Generate service types for each domain
    const generatedDomains: string[] = [];

    for (const [domain, services] of Object.entries(servicesJson)) {
        const serviceCount = Object.keys(services).length;
        if (serviceCount === 0) continue;

        const code = generateDomainServices(domain, services);
        const filePath = path.join(servicesDir, `${domain}.ts`);

        writeFile(filePath, code, options.dryRun);
        generatedDomains.push(domain);
    }

    // Generate index file
    const indexCode = generateServicesIndex(generatedDomains);
    const indexPath = path.join(servicesDir, 'index.ts');
    writeFile(indexPath, indexCode, options.dryRun);

    console.log('');
    console.log(`Generated types for ${generatedDomains.length} domains`);
}

main().catch((err) => {
    console.error('Error:', err);
    process.exit(1);
});
