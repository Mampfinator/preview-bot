const axios = require("axios");
const https = require("https");

/**
 * Attempt to recover whatever we can from a broken JSON string.
 * 
 * The algorithm is dead simple, and only cares about closing unmatched brackets and quotes, as well
 * as removing trailing commas and deleting a dangling property name.
 * 
 * @param {string} data
 * @returns {string}
 */
function fixJson(data) {
    // remove trailing commas
    if (data.endsWith(",")) {
        data = data.slice(0, -1);
    }

    // remove trailing incomplete `null`s
    data = data.replace(/(?<!=\")nu?l?(?=\}*$)/, "null");

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
    let escaped = false;

    for (let i = 0; i < data.length; i++) {
        const char = data[i];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (!inString()) {
            if (char === ":" && !inString()) {
                isAssignment = true; 
            // object and array termination
            } else if (char === ",") {
                isAssignment = false;
            } else if (char in closing) {
                const openingChar = closing[char]
                seen[openingChar].shift();
                isAssignment = false;
            // object, array and string start
            } else if (char in seen) {
                if (char === "\"" && !isAssignment) {
                    openDeclaration = true;
                }
                seen[char].unshift(i);
            }
        // string termination
        } else if (char === "\"") {
            seen["\""].shift();
            if (openDeclaration) {
                openDeclaration = false;
            }
        // escape character
        } else if (char === "\\") {
            escaped = true;
        }
    }

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
    
    // Very rarely (like with FIGURE-157860-R), we get a dangling property name that also happens to have the assignment operator at the end.
    // Our default case for dangling properties doesn't seem to handle that, so we add a special case for it here, since it's
    // easy enough to handle with regex alone.
    data = data.replace(/,\"[A-Za-z0-9-_]+\"\:$/, "");

    const closeWith = Object.entries(seen)
        .map(([char, indices]) => indices.
            map(idx => [idx, char])
        ).flat()
        .sort(([a], [b]) => b - a)
        .map(([, char]) => opening[char]);

    const fixed = data + closeWith.join("");

    // For debugging purposes, we don't parse the JSON here, but just return the fixed string.
    // In case of an error, we want to be able to see the original and the fixed string.
    return fixed;
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
            // **partial** response with an incomplete JSON string back.
            // `fixJson` will attempt to fix up what we have and make it valid JSON.
            // Especially the last field 
            if (typeof data === "string") {
                const fixed = fixJson(data);
                try {
                    return new Item(JSON.parse(fixed), true);
                } catch (error) {
                    console.error("Failed to parse partial response from AmiAmi API.");
                    console.error("Data: ", data);
                    console.error("Fixed: ", fixed);
                    throw error;
                }
            }

            const item = new Item(data);

            // Potentially, we could get a partial response without an image in the item object.
            // In that case, there is probably no usable data in the response at all, so
            // we force the fallback client to take over. 
            if (!item.image) {
                throw new Error("Item does not have an image. Forcing fallback client.");
            }
            
            return item;
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

    /**
     * Whether the item was constructed from a partial response.
     * @type {boolean}
     */
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
        // for partial responses, we might not have all discount rates available.
        if (!this.#item.discountrate1) {
            return 0;
        }

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
     * @type { "Released" | "Pre-Order" | undefined }
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
     * @type { number | undefined }
     */
    get fullPrice() {
        return this.#item.c_price_taxed;
    }

    /**
     * The base price for this item.
     * 
     * @type { number | undefined }
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
        const quarter = this.image.split("/").at(-2);
        return Number(quarter);
    }

    /**
     * @returns { string[] }
     */
    get images() {
        // TODO: there should be a way to get images from the fallback client.
        // The preview image URLs are structured like https://img.amiami.com/images/product/review/:quarter/:gcode_:n.jpg
        // where `:n` is a (0-padded, 2 digit) number starting from 1.

        return this.#embedded?.review_images.map(image => `https://img.amiami.com/${image.image_url}`) ?? [];
    }
}


module.exports = { AmiAmiApiClient, Item };