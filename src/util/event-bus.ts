export type EventBusData<T extends string = string> = Record<T, unknown>;

export type Handler<TData = any> = (evt: TData) => void;

export class EventBus<T extends EventBusData<string> = EventBusData<string>> {
    private maxEventHistory = 10;
    private subscribers = new Map<keyof T, Set<Handler>>();
    private allSubscribers = new Set<Handler>();
    private events: any[] = [];

    publish<TKey extends keyof T>(eventName: TKey, data: T[TKey]) {
        this.events.push(data);
        if (this.events.length > this.maxEventHistory) {
            this.events.pop();
        }

        for (const handler of this.allSubscribers) {
            handler(data);
        }

        const handlers = this.subscribers.get(eventName as string);
        if (!handlers) {
            return;
        }

        for (const handler of handlers) {
            handler(data);
        }
    }

    subscribe<TKey extends keyof T>(eventName: TKey, cb: Handler<T[TKey]>) {
        let subs = this.subscribers.get(eventName);
        if (!subs) {
            subs = new Set();
            this.subscribers.set(eventName as string, subs);
        }
        subs.add(cb);
        this.replayEvents(eventName, cb);
    }

    subscribeAll(cb: (evt: T[keyof T]) => void) {
        let has = this.allSubscribers.has(cb);
        if (!has) {
            this.allSubscribers.add(cb);
        }
        this.replayEvents(undefined, cb);
    }

    private replayEvents(eventName: keyof T | undefined, cb: Handler) {
        for (const event of this.events) {
            if (eventName === event.event || eventName === undefined) {
                cb(event);
            }
        }
    }
}
