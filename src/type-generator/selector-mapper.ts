/**
 * Maps Home Assistant selector types to TypeScript types.
 *
 * Selectors define the type and validation for service parameters.
 * See: https://www.home-assistant.io/docs/blueprint/selectors/
 */

export interface NumberSelector {
    number: {
        min?: number;
        max?: number;
        step?: number;
        mode?: 'box' | 'slider';
        unit_of_measurement?: string;
    };
}

export interface TextSelector {
    text: {
        multiline?: boolean;
        type?: 'text' | 'password' | 'email' | 'url';
    };
}

export interface SelectSelector {
    select: {
        options: string[] | { value: string; label: string }[];
        multiple?: boolean;
        custom_value?: boolean;
        sort?: boolean;
        translation_key?: string;
    };
}

export interface BooleanSelector {
    boolean: Record<string, never>;
}

export interface EntitySelector {
    entity: {
        domain?: string | string[];
        device_class?: string | string[];
        integration?: string;
        multiple?: boolean;
    };
}

export interface DeviceSelector {
    device: {
        integration?: string;
        manufacturer?: string;
        model?: string;
        multiple?: boolean;
    };
}

export interface AreaSelector {
    area: {
        multiple?: boolean;
        entity?: EntitySelector['entity'];
        device?: DeviceSelector['device'];
    };
}

export interface ColorRgbSelector {
    color_rgb: Record<string, never>;
}

export interface ColorTempSelector {
    color_temp: {
        unit?: 'kelvin' | 'mired';
        min?: number;
        max?: number;
        min_mireds?: number;
        max_mireds?: number;
    };
}

export interface TimeSelector {
    time: Record<string, never>;
}

export interface DateSelector {
    date: Record<string, never>;
}

export interface DatetimeSelector {
    datetime: Record<string, never>;
}

export interface ObjectSelector {
    object: Record<string, never>;
}

export interface TemplateSelector {
    template: Record<string, never>;
}

export interface StateSelector {
    state: {
        entity_id?: string;
        attribute?: string;
        hide_states?: string[];
        multiple?: boolean;
    };
}

export interface ConstantSelector {
    constant: {
        value: unknown;
        label?: string;
    };
}

export interface MediaSelector {
    media: Record<string, never>;
}

export interface ThemeSelector {
    theme: {
        include_default?: boolean;
    };
}

export interface AddonSelector {
    addon: Record<string, never>;
}

export interface BackupLocationSelector {
    backup_location: Record<string, never>;
}

export interface ConfigEntrySelector {
    config_entry: {
        integration?: string;
    };
}

export interface ConversationAgentSelector {
    conversation_agent: Record<string, never>;
}

export interface StatisticSelector {
    statistic: {
        device_class?: string;
    };
}

export type Selector =
    | NumberSelector
    | TextSelector
    | SelectSelector
    | BooleanSelector
    | EntitySelector
    | DeviceSelector
    | AreaSelector
    | ColorRgbSelector
    | ColorTempSelector
    | TimeSelector
    | DateSelector
    | DatetimeSelector
    | ObjectSelector
    | TemplateSelector
    | StateSelector
    | ConstantSelector
    | MediaSelector
    | ThemeSelector
    | AddonSelector
    | BackupLocationSelector
    | ConfigEntrySelector
    | ConversationAgentSelector
    | StatisticSelector;

export interface TypeMapping {
    tsType: string;
    jsDoc?: string;
}

/**
 * Maps a Home Assistant selector to a TypeScript type string.
 */
export function selectorToType(selector: Selector | undefined): TypeMapping {
    if (!selector) {
        return { tsType: 'unknown' };
    }

    // Number selector
    if ('number' in selector) {
        const { min, max, unit_of_measurement } = selector.number;
        let jsDoc: string | undefined;
        if (min !== undefined || max !== undefined || unit_of_measurement) {
            const parts: string[] = [];
            if (min !== undefined) parts.push(`min: ${min}`);
            if (max !== undefined) parts.push(`max: ${max}`);
            if (unit_of_measurement) parts.push(`unit: ${unit_of_measurement}`);
            jsDoc = parts.join(', ');
        }
        return { tsType: 'number', jsDoc };
    }

    // Text selector
    if ('text' in selector) {
        return { tsType: 'string' };
    }

    // Select selector - generate union type from options
    if ('select' in selector) {
        const { options, multiple } = selector.select;
        if (Array.isArray(options) && options.length > 0) {
            const values = options.map((opt) => (typeof opt === 'string' ? opt : opt.value));
            const unionType = values.map((v) => `'${v}'`).join(' | ');
            return { tsType: multiple ? `(${unionType})[]` : unionType };
        }
        return { tsType: multiple ? 'string[]' : 'string' };
    }

    // Boolean selector
    if ('boolean' in selector) {
        return { tsType: 'boolean' };
    }

    // Entity selector
    if ('entity' in selector) {
        const { multiple, domain } = selector.entity;
        // Could use EntityId type here for better typing
        const baseType = domain ? `string /* ${Array.isArray(domain) ? domain.join(' | ') : domain} entity */` : 'string';
        return { tsType: multiple ? `${baseType}[]` : baseType };
    }

    // Device selector
    if ('device' in selector) {
        const { multiple } = selector.device;
        return { tsType: multiple ? 'string[]' : 'string' };
    }

    // Area selector
    if ('area' in selector) {
        const { multiple } = selector.area;
        return { tsType: multiple ? 'string[]' : 'string' };
    }

    // Color RGB selector - [R, G, B] tuple
    if ('color_rgb' in selector) {
        return { tsType: '[number, number, number]', jsDoc: 'RGB color [0-255, 0-255, 0-255]' };
    }

    // Color temperature selector
    if ('color_temp' in selector) {
        const { unit, min, max } = selector.color_temp;
        const jsDoc = `Color temperature in ${unit || 'mired'}${min !== undefined ? `, min: ${min}` : ''}${max !== undefined ? `, max: ${max}` : ''}`;
        return { tsType: 'number', jsDoc };
    }

    // Time selector - HH:MM:SS format
    if ('time' in selector) {
        return { tsType: 'string', jsDoc: 'Time in HH:MM:SS format' };
    }

    // Date selector - YYYY-MM-DD format
    if ('date' in selector) {
        return { tsType: 'string', jsDoc: 'Date in YYYY-MM-DD format' };
    }

    // Datetime selector - ISO 8601 format
    if ('datetime' in selector) {
        return { tsType: 'string', jsDoc: 'Datetime in ISO 8601 format' };
    }

    // Object selector - arbitrary object
    if ('object' in selector) {
        return { tsType: 'Record<string, unknown>' };
    }

    // Template selector - Jinja2 template string
    if ('template' in selector) {
        return { tsType: 'string', jsDoc: 'Jinja2 template string' };
    }

    // State selector - entity state value
    if ('state' in selector) {
        const { multiple } = selector.state;
        return { tsType: multiple ? 'string[]' : 'string' };
    }

    // Constant selector - fixed value
    if ('constant' in selector) {
        const { value } = selector.constant;
        if (typeof value === 'boolean') {
            return { tsType: String(value) };
        }
        if (typeof value === 'number') {
            return { tsType: String(value) };
        }
        if (typeof value === 'string') {
            return { tsType: `'${value}'` };
        }
        return { tsType: 'unknown' };
    }

    // Media selector
    if ('media' in selector) {
        return {
            tsType: '{ media_content_id: string; media_content_type: string }',
            jsDoc: 'Media content to play',
        };
    }

    // Theme selector
    if ('theme' in selector) {
        return { tsType: 'string', jsDoc: 'Theme name' };
    }

    // Addon selector
    if ('addon' in selector) {
        return { tsType: 'string', jsDoc: 'Add-on slug' };
    }

    // Backup location selector
    if ('backup_location' in selector) {
        return { tsType: 'string', jsDoc: 'Backup location' };
    }

    // Config entry selector
    if ('config_entry' in selector) {
        return { tsType: 'string', jsDoc: 'Config entry ID' };
    }

    // Conversation agent selector
    if ('conversation_agent' in selector) {
        return { tsType: 'string', jsDoc: 'Conversation agent ID' };
    }

    // Statistic selector
    if ('statistic' in selector) {
        return { tsType: 'string', jsDoc: 'Statistic ID' };
    }

    // Unknown selector type
    return { tsType: 'unknown' };
}

/**
 * Converts a snake_case name to PascalCase.
 */
export function toPascalCase(str: string): string {
    return str
        .split(/[_\s-]+/)
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
        .join('');
}

/**
 * Converts a snake_case name to camelCase.
 */
export function toCamelCase(str: string): string {
    const pascal = toPascalCase(str);
    return pascal.charAt(0).toLowerCase() + pascal.slice(1);
}
