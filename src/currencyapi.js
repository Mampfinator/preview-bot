import axios from "axios";

/**
 * Simple client for https://currencyapi.com/.
 */
export class CurrencyApi {
    #instance;
    #key;

    /**
     * Updates the conversion rate every 12 hours.
     * @type { NodeJS.Timeout | null }
     */
    interval;

    /**
     * Latest known conversion rate from USD to JPY.
     * Cached because currencyapi.com is rate-limited on a per-month basis.
     * @type { number }
     */
    conversionRate = 0;

    /**
     * @type { Promise<CurrencyApi> }
     */
    ready;

    constructor(
        key
    ) {
        key = key ?? process.env.CURRENCYAPI_KEY;

        if (!key) throw new TypeError(`No Currency API key defined.`);

        this.#key = key;

        this.#instance = axios.create({
            baseURL: `https://api.currencyapi.com/v3/`
        });

        this.#start();
    }

    #start() {
        this.ready = (async () => {
            const { data: {JPY: {value}} } = await this.latest("USD", "JPY");

            this.conversionRate = Number(value);

            this.interval = setTimeout(
                async () => {
                    const { data: {JPY: {value}} } = await this.latest("USD", "JPY");
                    this.conversionRate = Number(value);
                }, 
                // 12 hours
                12 * 60 * 60 * 1000
            );

            return this;
        })();
    }

    /**
     * Fetch the latest conversion rate.
     * @param {string} from 
     * @param {string[]} to
     */
    async latest(from, ...to) {
        return this.#instance.get("/latest", {
            params: {
                apikey: this.#key,
                base_currency: from.toUpperCase(),
                currencies: to.map(cur => cur.toUpperCase()).join(",")
            }
        }).then(({data}) => data);
    }

    /**
     * Stop updating the conversion rate.
     */
    async stop() {
        clearTimeout(this.interval);
        this.interval = null;
    }

    /**
     * Start updating the conversion rate again.
     * Also immediately updates the conversion rate.
     */
    async restart() {
        if (!!this.interval) throw new Error("already running");
        this.#start();

    }
}