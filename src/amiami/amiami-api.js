const axios = require("axios");
const https = require("https");

class AmiAmiApiClient {
    /**
     * Used to make requests to the AmiAmi API.
     * 
     * @type {import("axios").AxiosInstance}
     */
    #instance;

    /**
     * @param {object} [options] Options to configure the client.
     * @param {string} [options.domain] API domain to use. Defaults to "api.amiami.com".
     * @param {string} [options.version] API version to use. Defaults to "v1.0" (current).
     */
    constructor(options) {
        const domain = options?.domain ?? "api.amiami.com"
        const version = options?.version ?? "v1.0";

        const url = `https://${domain}/api/${version}/`;

        this.#instance = axios.create({
            baseURL: url,
            headers: {
                "X-User-Key": "amiami_dev",
                // this is important even if we don't go through api.amiami.com!
                Host: "api.amiami.com",
                Origin: "https://www.amiami.com",
                Referer: "https://www.amiami.com",
            },
            withCredentials: true,
            httpsAgent: new https.Agent({
                rejectUnauthorized: true,
            }),
        });
    }


    /**
     * Fetch an item from the API.
     * 
     * @param {string} code 
     * @param {"scode" | "gcode"} codeType 
     * @returns { Promise<Item | null> } The item, or null if it doesn't exist.
     */
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
}

/**
 * Represents an item from the AmiAmi API.
 */
class Item {
    #item
    #embedded;

    /**
     * @returns {string}
     */
    get code() {
        return this.#item.gcode ?? this.#item.scode;
    }

    constructor(data) {
        if (!data.RSuccess) throw new Error(`Attempt to construct Item from failed request.`);

        this.#item = data.item;
        this.#embedded = data._embedded;
    }

    /**
     * Whether an item is currently available for order
     */
    orderable() {
        return Boolean(this.#item.stock);
    }

    /**
     * Whether an item is unavailable in any regions.
     * 
     * This currently only works for items requested in English.
     */
    regionLocked() {
        // This should work for all current known cases:
        // - "This product cannot be shipped to the following area: [...]"
        // - "This product cannot be shipped to the following areas: [...]"
        // - "This product cannot be shipped to some areas."
        return this.remarks?.includes("This product cannot be shipped to") ?? false;
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

    /**
     * Additional remarks for this item. This is usually information about regions this item is unavailable in.
     * @type {string | undefined}
     */
    get remarks() {
        const remarks = this.#item.remarks;
        
        return remarks && remarks.length > 0 ? remarks : undefined;
    }

    /**
     * @type { "Released" | "Pre-Order" }
     */
    get saleStatus() {
        return this.#item.salestatus
    }

    /**
     * The (English) name of the item.
     * 
     * @type {string}
     */
    get name() {
        return this.#item.sname_simple
    }

    /**
     * The full price with taxes and all discounts applied.
     * 
     * @type { number }
     */
    get fullPrice() {
        return this.#item.c_price_taxed;
    }

    /**
     * The base price for this item.
     * 
     * @type { number }
     */
    get price() {
        return this.#item.price;
    }

    get spec() {
        return this.#item.spec;
    }

    /**
     * The main image URL for this item.
     */
    get image() {
        return `https://img.amiami.com/${this.#item.main_image_url}`;
    }

    /**
     * The quarter this item was added to the catalog.
     * 
     * This is mainly used for fallback previews.
     */
    get quarter() {
        return Number(this.#item.image_category.replaceAll("/", ""));
    }

    /**
     * @returns { string[] }
     */
    get images() {
        return this.#embedded.review_images.map(image => `https://img.amiami.com/${image.image_url}`);
    }
}


module.exports = { AmiAmiApiClient, Item };