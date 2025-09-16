type CacheData = Record<string, unknown>;

export class Cache {
    #data: Record<string, CacheData> = {};
    #pending = 0;
    #assigned: Record<string, boolean> = {};

    #empty(object: CacheData) {
        for (const property in object) {
            if (object.hasOwnProperty(property)) {
                delete object[property];
            }
        }
    }

    ready() {
        return !this.#pending;
    }

    empty(target: string): void {
        const data = this.#assigned[target];
        if (data === undefined) {
            throw new Error(`Not cached: ${target}`);
        }

        this.#empty(this.#data[target]);

        if (!this.#assigned[target]) {
            this.#assigned[target] = true;
            this.#pending--;
        }
    }

    add(target: string): CacheData {
        if (this.#assigned[target] !== undefined) {
            throw new Error(`Already cached: ${target}`);
        }

        const cached = {};

        this.#data[target] = cached;
        this.#assigned[target] = false;
        this.#pending++;

        return cached;
    }

    get<T extends CacheData>(target: string): T {
        const data = this.#data[target];
        if (!data) {
            throw new Error(`Cache miss: "${target}"`);
        }
        return data as T;
    }

    reset(): void {
        for (const target in this.#assigned) {
            if (this.#assigned[target]) {
                this.#empty(this.#data[target]);
                this.#assigned[target] = false;
                this.#pending++;
            }
        }
    }

    assign(target: string, data: CacheData) {
        if (this.#assigned[target] === undefined) {
            throw new Error(`Not cached: ${target}`);
        }

        const cached = this.#data[target];

        if (this.#assigned[target]) {
            this.#empty(cached);
        } else {
            this.#assigned[target] = true;
            this.#pending--;
        }

        Object.assign(cached, data);
    }
}
