import { EmbedBuilder, AttachmentBuilder } from "discord.js";
import { AmiAmiApiClient } from "./amiami-api.js";
import { AmiAmiFallbackClient } from "./amiami-fallback.js";
import { CurrencyApi } from "../currencyapi.js";
import { Cache } from "../cache.js";
import process from "node:process";

/**
 * Matches item links for AmiAmi; the returned matches are of the form "scode=code" or "gcode=code".
 */
const AMIAMI_ITEM_REGEX = /(?<=amiami\.com\/eng\/detail(\/)?\?)([sg]code)=([A-Za-z0-9-]+)/g;

/**
 * Used to convert the price of an item from JPY to USD inside {@link AmiAmiApiPreview}.
 */
const currencyApi = new CurrencyApi();

/**
 * This is scoped outside {@link AmiAmiFallbackPreview} so {@link AmiAmiApiPreview} can access it as well.
 */
const amiamiFallbackClient = new AmiAmiFallbackClient();

/**
 * Generates a preview of an item in AmiAmi.
 */
class AmiAmiApiPreview {
    name = "amiami-api";
    /**
     * @type {AmiAmiApiClient}
     */
    #client;

    #cache = new Cache();

    constructor(options) {
        this.#client = new AmiAmiApiClient(options);
    }

    /**
     * @returns { Promise<ReturnType<AmiAmiApiClient["item"]>> }
     */
    async fetch(codeType, code) {
        if (this.#cache.has(`${codeType}=${code}`)) return this.#cache.get(`${codeType}=${code}`);
        const item = await this.#client.item(code, codeType);
        this.#cache.set(`${codeType}=${code}`, item);
        return item;
    }

    /**
     * @param {string} match
     * @returns {  }
     */
    async generate(match) {
        const [codeType, code] = match.split("=");

        const item = await this.fetch(codeType, code);

        if (!item) return null;
        if (!code) {
            throw new Error("Item has no code!");
        }

        if (code.startsWith("FIGURE-"))
            await amiamiFallbackClient
                .insert(Number(code.split("-")[1]), item.quarter, code.endsWith("-R"))
                .catch(console.error);

        let description = "";
        if (typeof item.price === "number") {
            const discountRate = item.discountRate();
            const priceJpy = item.price;

            const conversionRate = currencyApi.conversionRate;
            const priceUsd = priceJpy / conversionRate;
            description = `**Price**: ¥${Math.trunc(priceJpy)} / $${priceUsd.toFixed(2)} ${discountRate > 0 ? `(${discountRate}% off)` : ""}`;
        }

        if (item.saleStatus) {
            description += `\n**Status**: ${item.saleStatus} ${item.orderable() === undefined ? "" : !item.orderable() ? "(Out of stock)" : ""}`;
        }

        if (item.regionLocked()) {
            description += "⚠️ This item may not be available in all regions.";
        }

        let footerText = `Price in USD based on a conversion rate of 1 USD ≈ ${currencyApi.conversionRate.toFixed(2)} JPY.`;
        if (item.partial) {
            footerText = "⚠️ API only partially available, information may be incomplete · " + footerText;
        }

        const embed = new EmbedBuilder()
            .setURL(`https://www.amiami.com/eng/detail?${codeType}=${code}`)
            .setTitle(item.name)
            .setImage(item.image)
            // random color from the amiami logo
            .setColor("#f68329")
            .setFooter({
                iconURL: process.env.AMIAMI_FAVICON_URL ?? "https://www.amiami.com/favicon.png",
                text: footerText,
            });

        if (description.length > 0) {
            embed.setDescription(description);
        }

        if (item.spec && item.spec.length > 0) {
            embed.addFields({
                name: "\u200b",
                value: item.spec,
            });
        }

        return {
            message: {
                embeds: [embed],
            },
            images: item.images.length,
        };
    }

    async healthCheck() {
        return this.#client.healthy();
    }
}

class AmiAmiFallbackPreview {
    name = "amiami-fallback";
    #client = amiamiFallbackClient;

    /**
     * @param {string} match
     */
    async generate(match) {
        // "matches" are expected to be of the form "scode=code" or "gcode=code".
        const code = match.split("=")[1];

        // the fallback client only supports FIGURE-codes.
        if (!code.startsWith("FIGURE-")) return null;

        // remove the "FIGURE-" prefix
        const figureCode = code.split("-").slice(1).join("-");

        const imageBuffer = await this.#client.getImage(figureCode);

        return {
            message: {
                files: [new AttachmentBuilder(imageBuffer, { name: `${code}.jpg` })],
                embeds: [
                    new EmbedBuilder()
                        .setURL(`https://www.amiami.com/eng/detail?gcode=${code}`)
                        .setTitle(`${code}`)
                        .setImage(`attachment://${code}.jpg`)
                        .setColor("#f68329")
                        .setFooter({
                            iconURL: process.env.AMIAMI_FAVICON_URL ?? "https://www.amiami.com/favicon.png",
                            text: "⚠️ API request failed, so further details are missing.",
                        }),
                ],
            },
            images: 1,
        };
    }

    async healthCheck() {
        return this.#client.healthy();
        // TODO: how do we check health here? Do we just test if we can reach AmiAmi's CDN?
    }
}

const apiPreview = new AmiAmiApiPreview({
    domain: process.env.AMIAMI_DOMAIN ?? "amiami.com",
});

/**
 * Generates a preview of an item in AmiAmi.
 *
 * @see {@link AmiAmiApiPreview}
 * @see {@link AmiAmiFallbackPreview}
 */
export const AmiAmiPreview = {
    name: "amiami",
    // AmiAmi is very prone to breaking, so we want to know when it does.
    reportErrors: true,

    /**
     * @param {string} content
     * @returns {string[]} matches
     */
    match(content) {
        const matches = content.matchAll(AMIAMI_ITEM_REGEX);

        return [...matches].map((match) => match[0]);
    },

    generators: [apiPreview, new AmiAmiFallbackPreview()],
    async init() {
        await amiamiFallbackClient.init();
        await currencyApi.ready;
    },

    /**
     * @param {string} id
     * @param {number} imageNo
     *
     * @returns { Promise<{ image: string | null, totalImages: number }> }
     */
    async getImage(id, imageNo) {
        const [codeType, code] = id.split("=");
        const item = await apiPreview.fetch(codeType, code);
        if (!item) return null;

        const images = item.images;

        const image = imageNo === 0 ? item.image : images[imageNo - 1];

        return {
            image,
            totalImages: images.length + 1,
        };
    },
};
