/**
 * Generates TypeScript interfaces for Home Assistant services.
 */

import { Selector, selectorToType, toPascalCase, TypeMapping } from './selector-mapper';

// Types for services.json structure
export interface ServiceField {
    name?: string;
    description?: string;
    required?: boolean;
    example?: string | number | unknown[];
    selector?: Selector;
    filter?: {
        supported_features?: number[];
        attribute?: Record<string, unknown>;
    };
    advanced?: boolean;
    // Nested fields (for advanced_fields)
    collapsed?: boolean;
    fields?: Record<string, ServiceField>;
}

export interface ServiceDefinition {
    name: string;
    description: string;
    fields: Record<string, ServiceField>;
    target?: {
        entity?: Array<{
            domain?: string[];
            supported_features?: number[];
        }>;
    };
}

export interface DomainServices {
    [serviceName: string]: ServiceDefinition;
}

export interface ServicesJson {
    [domain: string]: DomainServices;
}

interface GeneratedParam {
    name: string;
    tsType: string;
    required: boolean;
    description?: string;
    jsDoc?: string;
    isGeneric?: boolean;      // If true, this param uses a generic type
    genericTypeName?: string; // The generic type parameter name (e.g., 'TFanMode')
}

/**
 * Fields that should be generic type parameters (entity-specific enums).
 * These are text selectors that typically have different valid values per entity.
 */
const GENERIC_FIELD_PATTERNS = new Set([
    'hvac_mode',
    'fan_mode',
    'swing_mode',
    'swing_horizontal_mode',
    'swing_vertical_mode',
    'preset_mode',
    'operation_mode',
    'sound_mode',
    'effect',
    'source',
    'option',     // for input_select, select
]);

/**
 * Determines if a field should use a generic type parameter.
 */
function shouldBeGeneric(fieldName: string, tsType: string): boolean {
    // Only make string fields generic
    if (tsType !== 'string') return false;

    // Check exact matches
    if (GENERIC_FIELD_PATTERNS.has(fieldName)) return true;

    // Check if field name ends with _mode (covers custom modes)
    if (fieldName.endsWith('_mode')) return true;

    return false;
}

/**
 * Converts a field name to a generic type parameter name.
 * Example: 'hvac_mode' -> 'THvacMode'
 */
function getGenericTypeName(fieldName: string): string {
    return 'T' + toPascalCase(fieldName);
}

/**
 * Flattens nested fields (like advanced_fields) into a single list.
 */
function flattenFields(fields: Record<string, ServiceField>): Record<string, ServiceField> {
    const result: Record<string, ServiceField> = {};

    for (const [name, field] of Object.entries(fields)) {
        // Check if this is a nested fields container (like advanced_fields)
        if (field.fields && !field.selector) {
            // Recursively flatten nested fields
            const nested = flattenFields(field.fields);
            Object.assign(result, nested);
        } else {
            result[name] = field;
        }
    }

    return result;
}

/**
 * Generates TypeScript interface for service parameters.
 */
function generateParamsInterface(
    domain: string,
    serviceName: string,
    fields: Record<string, ServiceField>
): { interfaceName: string; code: string; params: GeneratedParam[] } | null {
    const flatFields = flattenFields(fields);
    const params: GeneratedParam[] = [];

    for (const [fieldName, field] of Object.entries(flatFields)) {
        const typeMapping = selectorToType(field.selector);
        const isGeneric = shouldBeGeneric(fieldName, typeMapping.tsType);

        params.push({
            name: fieldName,
            tsType: isGeneric ? getGenericTypeName(fieldName) : typeMapping.tsType,
            required: field.required ?? false,
            description: field.description || field.name,
            jsDoc: typeMapping.jsDoc,
            isGeneric,
            genericTypeName: isGeneric ? getGenericTypeName(fieldName) : undefined,
        });
    }

    if (params.length === 0) {
        return null;
    }

    const interfaceName = `${toPascalCase(domain)}${toPascalCase(serviceName)}Params`;

    // Collect generic type parameters for this interface
    const genericParams = params
        .filter(p => p.isGeneric)
        .map(p => `${p.genericTypeName} = string`)
        .filter((v, i, a) => a.indexOf(v) === i); // Deduplicate

    const lines: string[] = [];
    const genericsDecl = genericParams.length > 0 ? `<${genericParams.join(', ')}>` : '';
    lines.push(`export interface ${interfaceName}${genericsDecl} {`);

    for (const param of params) {
        // Add JSDoc comment
        const docParts: string[] = [];
        if (param.description) docParts.push(param.description);
        if (param.jsDoc) docParts.push(param.jsDoc);

        if (docParts.length > 0) {
            lines.push(`    /** ${docParts.join(' - ')} */`);
        }

        const optional = param.required ? '' : '?';
        lines.push(`    ${param.name}${optional}: ${param.tsType};`);
    }

    lines.push('}');

    return {
        interfaceName,
        code: lines.join('\n'),
        params,
    };
}

/**
 * Generates TypeScript interface for a domain's services.
 */
function generateServicesInterface(
    domain: string,
    services: DomainServices,
    paramsInterfaces: Map<string, string>,
    allParams: Map<string, GeneratedParam[]>
): string {
    const interfaceName = `${toPascalCase(domain)}Services`;

    // Collect all unique generic type parameters across all services
    const genericTypeSet = new Set<string>();
    for (const params of allParams.values()) {
        for (const param of params) {
            if (param.isGeneric && param.genericTypeName) {
                genericTypeSet.add(param.genericTypeName);
            }
        }
    }

    const genericTypes = Array.from(genericTypeSet).sort();
    const genericsDecl = genericTypes.length > 0
        ? `<${genericTypes.map(g => `${g} = string`).join(', ')}>`
        : '';

    const lines: string[] = [];
    lines.push(`export interface ${interfaceName}${genericsDecl} {`);

    for (const [serviceName, service] of Object.entries(services)) {
        const methodName = serviceName; // Keep snake_case for method names to match HA

        // Add JSDoc
        if (service.description) {
            lines.push(`    /** ${service.description} */`);
        }

        // Determine parameter type
        const paramsInterfaceName = paramsInterfaces.get(serviceName);
        let paramType = '';

        if (paramsInterfaceName) {
            // Check if this service has generic parameters
            const params = allParams.get(serviceName);
            const serviceGenerics = params
                ?.filter(p => p.isGeneric && p.genericTypeName)
                .map(p => p.genericTypeName)
                .filter((v, i, a) => a.indexOf(v) === i) // Deduplicate
                ?? [];

            const genericsForParams = serviceGenerics.length > 0
                ? `<${serviceGenerics.join(', ')}>`
                : '';

            paramType = `params?: ${paramsInterfaceName}${genericsForParams}`;
        }

        lines.push(`    ${methodName}(${paramType}): Promise<void>;`);
    }

    lines.push('}');

    return lines.join('\n');
}

/**
 * Generates all TypeScript code for a single domain.
 */
export function generateDomainServices(domain: string, services: DomainServices): string {
    const sections: string[] = [];
    const paramsInterfaces = new Map<string, string>();
    const allParams = new Map<string, GeneratedParam[]>();

    // Header
    sections.push(`/**`);
    sections.push(` * Generated service types for the "${domain}" domain.`);
    sections.push(` * DO NOT EDIT - This file is auto-generated.`);
    sections.push(` */`);
    sections.push('');

    // Generate params interfaces for each service
    for (const [serviceName, service] of Object.entries(services)) {
        if (service.fields && Object.keys(service.fields).length > 0) {
            const result = generateParamsInterface(domain, serviceName, service.fields);
            if (result) {
                sections.push(result.code);
                sections.push('');
                paramsInterfaces.set(serviceName, result.interfaceName);
                allParams.set(serviceName, result.params);
            }
        }
    }

    // Generate the services interface
    const servicesInterface = generateServicesInterface(domain, services, paramsInterfaces, allParams);
    sections.push(servicesInterface);

    return sections.join('\n');
}

/**
 * Generates TypeScript code for all domains.
 */
export function generateAllServices(servicesJson: ServicesJson): Map<string, string> {
    const result = new Map<string, string>();

    for (const [domain, services] of Object.entries(servicesJson)) {
        const code = generateDomainServices(domain, services);
        result.set(domain, code);
    }

    return result;
}

/**
 * Generates an index file that re-exports all domain services.
 */
export function generateServicesIndex(domains: string[]): string {
    const lines: string[] = [];

    lines.push('/**');
    lines.push(' * Generated service types index.');
    lines.push(' * DO NOT EDIT - This file is auto-generated.');
    lines.push(' */');
    lines.push('');

    for (const domain of domains.sort()) {
        lines.push(`export * from './${domain}';`);
    }

    return lines.join('\n');
}
