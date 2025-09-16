type CacheValue<T> = {
    target: string;
    proxy: T;
};

export const immutableProxy = <T extends object>(object: T) => {
    if (typeof object !== 'object' && typeof object !== 'function') {
        throw new TypeError(`Cannot create proxy for non-object`);
    }

    const proxies: Record<string | symbol, CacheValue<T>> = {};

    const proxy = (object: object, property: string | symbol) => {
        const value = (object as any)[property];

        if (typeof value !== 'object' && typeof value !== 'function') {
            // TO DO: or value is already an immutable proxy
            return value;
        }

        const cached = proxies[property];
        if (cached !== undefined && cached.target === value) {
            return cached.proxy;
        }

        const proxy = immutableProxy(value);
        proxies[property] = {
            target: value,
            proxy: proxy as T,
        };

        return proxy;
    };

    const handler: ProxyHandler<T> = {
        get: (target, property) => {
            return proxy(target, property);
        },

        getOwnPropertyDescriptor: (target, property) => {
            // if (property === 'constructor') return undefined;
            if (!target.hasOwnProperty(property)) return undefined;

            const descriptor: any = Object.getOwnPropertyDescriptor(target, property);

            return Object.assign(descriptor, {
                value: proxy(target, property),
                // writable: false,
            });
        },

        set: (target, property, value) => {
            throw new TypeError(
                `Cannot set property of read-only object: ${target.constructor.name}.${String(property)}`,
            );
        },

        defineProperty: (target, property, descriptor) => {
            throw new TypeError(
                `Cannot add properties to read-only object: ${target.constructor.name}.${String(property)}`,
            );
        },

        deleteProperty: (target, property) => {
            throw new TypeError(
                `Cannot delete property of read-only object: ${target.constructor.name}.${String(property)}`,
            );
        },

        preventExtensions: (target) => {
            return true;
        },

        apply(target, thisArg: any, argArray: any[]): any {
            return Reflect.apply(target as any, thisArg, argArray);
        },
    };

    return new Proxy<T>(object, handler);
};
