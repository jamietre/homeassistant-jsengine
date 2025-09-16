type ActionFn = ((entity_id: string, data: object) => void) | ((data: object) => void);
type Handler = {
    invoke: ActionFn;
    domain: any;
    name: string;
    description: string;
    fields: string;
    target: string;
};

type ActionMap = Record<string, Handler>;

export class Service {
    #name: string;
    #handlers: Record<string, Handler> = {};
    constructor(name: string, data: any, api: any) {
        this.#name = name;

        for (const action in data) {
            const service = data[action];
            // const domain = service.target?.entity?.find((check) => check.domain && check.domain.indexOf(name) >= 0);

            let named: ActionMap = {};
            const handler: Partial<Handler> = {};
            if (!service.target?.entity) {
                handler.invoke = (data = {}) => {
                    return api.callService(name, handler, data);
                };
            } else {
                ((handler.invoke = (entity_id: string, data = {}) => {
                    return api.callService(name, handler, data, { entity_id });
                }),
                    (handler.domain = Object.fromEntries(
                        service.target.entity.map((entity: any) => [entity.domain ? entity.domain : null, entity]),
                    )));
            }

            handler.name = service.name;
            handler.description = service.description;
            handler.fields = service.fields;
            handler.target = service.target;

            this.#handlers[action] = handler as Handler;
        }
    }

    get name() {
        return this.#name;
    }
}
