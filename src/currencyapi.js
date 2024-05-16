const { default: axios } = require("axios");

/**
 * Simple client for https://currencyapi.com/.
 */
class CurrencyApi {
    #instance;
    #key;

    interval;

    /**
     * Latest known conversion rate from USD to JPY.
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

    async latest(from, ...to) {
        return this.#instance.get("/latest", {
            params: {
                apikey: this.#key,
                base_currency: from.toUpperCase(),
                currencies: to.map(cur => cur.toUpperCase()).join(",")
            }
        }).then(({data}) => data);
    }

    async stop() {
        clearTimeout(this.interval);
    }
}

module.exports = {
    CurrencyApi,
}