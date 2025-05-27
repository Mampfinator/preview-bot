const axios = require("axios");
const https = require("https");

/**
 * @param {string} data
 * @returns {object}
 */
function fixJson(data) {
    /**
     * @type { Record<string, number[]>}
     */
    const seen = {
        "{": [],
        "[": [],
        "\"": []
    };

    const closing = {
        "}": "{",
        "]": "[",
    };

    const inString = () => seen["\""].length > 0;

    let openDeclaration = true;
    let isAssignment = false;

    const opening = Object.fromEntries(Object.entries(closing).map(([key, value]) => [value, key]));
    opening["\""] = "\"";

    for (let i = 0; i < data.length; i++) {
        const char = data[i];

        if (char === ":" && !inString()) {
            isAssignment = true; 
        // object and array termination
        } else if (char === ",") {
            isAssignment = false;
        } else if (char in closing) {
            const openingChar = closing[char]
            seen[openingChar].shift();
            isAssignment = false;
        // string termination
        } else if (char === "\"" && inString()) {
            seen["\""].shift();
            if (openDeclaration) {
                openDeclaration = false;
            }
        // object, array and string start
        } else if (char in seen) {
            if (char === "\"" && !isAssignment) {
                openDeclaration = true;
            }
            seen[char].unshift(i);
        }
    }

    console.log(openDeclaration, isAssignment);

    // if we started a property declaration and didn't finish it, 
    // *or* if we finished writing out the property name, but never got any value for it at all, 
    // remove it.
    if (openDeclaration || !isAssignment) {
        seen["\""].shift();
        data = data.replace(/,["a-zA-Z_-]+$/, "");
    }

    // in very rare cases, a string might end with an invalid unicode escape sequence 
    // (like FIGURE-178121, which ends with just `\u`) and thus causes the default JSON parser to throw.
    data = data.replace(/\\u[A-Za-z0-9]{0,3}$/, "");

    const closeWith = Object.entries(seen)
        .map(([char, indices]) => indices.
            map(idx => [idx, char])
        ).flat()
        .sort(([a], [b]) => b - a)
        .map(([, char]) => opening[char]);

    const fixed = data + closeWith.join("");
    
    console.log(fixed);

    return JSON.parse(fixed);
}

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

            // sometimes (especially when normal API access is blocked) we get a
            // **partial** response with an incomplete JSON string back
            // so we fix it up and parse what we can.
            if (typeof data === "string") {
                const parsed = fixJson(data);
                console.log(parsed);
                return new Item(parsed, true);
            }

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
    #item;
    #embedded;
    partial;

    /**
     * @returns {string}
     */
    get code() {
        return this.#item.gcode ?? this.#item.scode;
    }

    constructor(data, partial = false) {
        if (!data.RSuccess) throw new Error(`Attempt to construct Item from failed request.`);

        this.#item = data.item;
        this.#embedded = data._embedded;
        this.partial = partial;
    }

    /**
     * Whether an item is currently available for order.
     * @returns {boolean | undefined}
     */
    orderable() {
        const stock = this.#item?.stock;
        if (stock === undefined) {
            return;
        }
        return Boolean(stock);
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
        const remarks = this.#item?.remarks;
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
        try {
            return Number(this.#item.image_category.replaceAll("/", ""));
        } catch {
            const quarter = this.#item.main_image_url.split("/").at(-2);
            return Number(quarter);
        }
    }

    /**
     * @returns { string[] }
     */
    get images() {
        return this.#embedded?.review_images.map(image => `https://img.amiami.com/${image.image_url}`) ?? [];
    }
}


module.exports = { AmiAmiApiClient, Item };