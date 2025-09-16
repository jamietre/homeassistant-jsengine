import { DiffieHellmanGroupConstructor } from 'crypto';
import { HaAttributes, HaDomain, HaEntity, HaGroups } from '../types/ha-types';

export class Entity implements HaEntity {
    id: string;
    entity_id!: string;
    domain: HaDomain;
    name!: string;
    groups!: HaGroups;
    state!: string; // on, off?
    attributes!: HaAttributes;
    last_updated!: Date;
    last_changed!: Date;

    constructor(id: string) {
        this.id = id;
        this.domain = id.substring(0, id.indexOf('.')) as HaDomain;
    }

    update(data: any) {
        Object.assign(this, data);

        for (const property in data) {
            if (data[property] === undefined) {
                delete (this as any)[property];
            }
        }
    }

    clone() {
        return Object.assign({}, this);
    }

    proxiedServices(services: any) {
        const actions = () => {
            // TO DO: filter supported features
            if (!services[this.domain]) return {};

            return Object.fromEntries(
                Object.entries(services[this.domain]).filter(
                    ([name, action]: [string, any]) => action.domain?.[this.domain],
                ),
            );
        };

        const action = (name: string) => {
            // TO DO: filter supported features
            const handler = services[this.domain]?.[name];
            if (!handler?.domain?.[this.domain]) return undefined;

            const named: any = {
                [name]: (...args: any[]) => handler(this.id, ...args),
            };

            return named[name];
        };

        return new Proxy(this, {
            get: (target, property) => {
                if (property == 'proxiedServices') {
                    return undefined;
                }

                if ((target as any)[property] !== undefined) {
                    return (target as any)[property];
                }

                return action(String(property));
            },

            ownKeys: (target) => {
                return Object.keys(target)
                    .filter((property) => property != 'proxiedServices')
                    .concat(Object.keys(actions()));
            },

            has: (target, property) => {
                return property == 'proxiedServices'
                    ? false
                    : target.hasOwnProperty(property) || action(String(property));
            },

            getOwnPropertyDescriptor: (target, property) => {
                if (property == 'proxiedServices') {
                    return undefined;
                }

                if (target.hasOwnProperty(property)) {
                    return Object.getOwnPropertyDescriptor(target, property);
                }

                const handler = action(String(property));
                if (handler) {
                    return {
                        value: action(String(property)),
                        writable: false,
                        configurable: true,
                        enumerable: true,
                    };
                }
            },
        });
    }
}
