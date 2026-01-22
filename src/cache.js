export class CacheMap extends Map {
    #interval;

    // an hour, because most services have pretty strict API limits.
    #ttl = 60 * 60 * 1000;

    constructor() {
        super();
        this.#interval = setInterval(() => this.#deleteExpired(), this.#ttl / 2);
    }

    #deleteExpired() {
        for (const [key, value] of super.entries()) {
            if (Date.now() - value.lastAccessed > this.#ttl) this.delete(key);
        }
    }

    get(key) {
        const value = super.get(key);
        if (value) value.lastAccessed = Date.now();
        return value?.value;
    }

    set(key, value) {
        super.set(key, { value, lastAccessed: Date.now() });
    }

    *values() {
        for (const value of super.values()) {
            yield value.value;
        }
    }

    *entries() {
        for (const entry of super.entries()) {
            yield [entry[0], entry[1].value];
        }
    }

    stop() {
        clearInterval(this.#interval);
    }

    restart() {
        this.stop();
        this.#interval = setInterval(() => this.#deleteExpired(), 1000);
    }
}
