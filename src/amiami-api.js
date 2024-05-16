const axios = require("axios");
const https = require("https");

class AmiAmiApiClient {
    #instance;

    constructor(options) {
        const domain = options?.domain ?? AMIAMI_IP;
        const version = options?.version ?? "v1.0";

        const url = `https://${domain}/api/${version}/`;

        this.#instance = axios.create({
            baseURL: url,
            headers: {
                "X-User-Key": "amiami_dev",
                Host: "api.amiami.com",
                Origin: "https://www.amiami.com",
                Referer: "https://www.amiami.com",
            },
            withCredentials: true,
            httpsAgent: new https.Agent({
                // since we're making a request to the raw IP, we'd get a cert domain mismatch. But we don't care.
                rejectUnauthorized: true,
            }),
        });
    }


    async item(code, codeType = "gcode") {
        try {
            const response = await this.#instance.get(`/item`, {
                params: {
                    [codeType]: code,
                    lang: "eng"
                }
            });

            const data = response.data;
            return new Item(data);
        } catch (error) {
            if (!(error instanceof axios.AxiosError)) throw error;

            if (error.response.status == 404) {
                // TODO: if we're getting an nginx "not found" page, amiami has rotated their IP/we're making a request to the wrong machine!
                // We'll want to eventually handle that and fall back to quarter guesstimating, but for now we don't bother and ignore it.
                return null;
            }

            throw error;
        }
    }

    async currencylayer() {
        return this.#instance.get("/files/currencylayer.json", {
            headers: {
                Host: "amiami.com",
            }
        }).then(res => res.data);
    }
}


class Item {
    #item
    #embedded;

    constructor(data) {
        if (!data.RSuccess) throw new Error(`Attempt to construct Item from failed request.`);

        this.#item = data.item;
        this.#embedded = data._embedded;
    }


    /**
     * @returns {number} the total discount rate.
     */
    discountRate() {
        return this.#item.discountrate1 +
            this.#item.discountrate2 +
            this.#item.discountrate3 + 
            this.#item.discountrate4 +
            this.#item.discountrate5;
    }

    get gcode() {
        return this.#item.gcode;
    }

    /**
     * @type {string}
     */
    get name() {
        return this.#item.sname_simple
    }

    /**
     * @type { number }
     */
    get fullPrice() {
        return this.#item.c_price_taxed;
    }

    /**
     * @type { number }
     */
    get price() {
        return this.#item.price;
    }

    get saleStatus() {
        return this.#item.salestatus;
    }

    get makerName() {
        return this.#item.makername;
    }

    get modeler() {
        return this.#item.modeler;
    }

    get spec() {
        return this.#item.spec;
    }

    get stock() {
        return this.#item.stock;
    }

    get image() {
        return `https://img.amiami.com/${this.#item.main_image_url}`;
    }

    toRaw() {
        return { item: this.#item, _embedded: this.#embedded }; 
    }
}


module.exports = { AmiAmiApiClient, Item };