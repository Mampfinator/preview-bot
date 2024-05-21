const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const { AmiAmiApiClient } = require("./amiami-api");
const { AmiAmiFallbackClient } = require("./amiami-fallback");
const { CurrencyApi } = require("../currencyapi");

/**
 * Matches item links for AmiAmi; the returned matches are of the form "scode=code" or "gcode=code".
 */
const AMIAMI_ITEM_REGEX = /(?<=amiami\.com\/eng\/detail(\/)?\?)([sg]code)\=([A-Za-z0-9\-]+)/g;

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
    #client;

    constructor(
        options
    ) {
        this.#client = new AmiAmiApiClient(options);
    }
    
    /**
     * @param {string} match
     * @returns {  }
     */
    async generate(match) {
        // "matches" are expected to be of the form "scode=code" or "gcode=code".
        const [codeType, code] = match.split("=");

        const item = await this.#client.item(code, codeType);
        if (!item) return null;

        if (code.startsWith("FIGURE-")) await amiamiFallbackClient.insert(Number(code.split("-")[1]), item.quarter, code.endsWith("-R")).catch(console.error);

        const discountRate = item.discountRate();
        const priceJpy = item.price;

        const conversionRate = currencyApi.conversionRate;
        const priceUsd = priceJpy / conversionRate;
        
        const embed = new EmbedBuilder()
            .setURL(`https://www.amiami.com/eng/detail?${codeType}=${code}`)
            .setDescription(`
                **Price**: ¥${Math.trunc(priceJpy)} / $${priceUsd.toFixed(2)} ${discountRate > 0 ? `(${discountRate}% off)` : ""}
                **Status**: ${item.saleStatus} ${!item.orderable() ? "(Out of stock)" : ""}
                ${item.remarks ? "⚠️ This item may not be available in all regions." : ""}
            `.trim())
            .setTitle(item.name)
            .setImage(item.image)
            // random color from the amiami logo
            .setColor("#f68329")
            .setFooter({
                iconURL: process.env.AMIAMI_FAVICON_URL ?? "https://www.amiami.com/favicon.png",
                text: `Price in USD based on a conversion rate of 1 USD ≈ ${conversionRate.toFixed(6)} JPY.`
            });
        
        if (item.spec && item.spec.length > 0) {
            embed.addFields({
                name: "\u200b",
                value: item.spec,
            });
        }

        return {
            embeds: [embed]
        };
    }
}

class AmiAmiFallbackPreview {
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
            files: [
                new AttachmentBuilder(imageBuffer, { name: `${code}.jpg` }),
            ],
            embeds: [
                new EmbedBuilder()
                    .setURL(`https://www.amiami.com/eng/detail?gcode=${code}`)
                    .setTitle(`${code}`)
                    .setImage(`attachment://${code}.jpg`)
                    .setColor("#f68329")
                    .setFooter({
                        iconURL: process.env.AMIAMI_FAVICON_URL ?? "https://www.amiami.com/favicon.png",
                        text: "⚠️ API request failed, so further details are missing."
                    }),
            ]
        }
    }
}

/**
 * Generates a preview of an item in AmiAmi.
 * 
 * @see {@link AmiAmiApiPreview}
 * @see {@link AmiAmiFallbackPreview}
 */
const AmiAmiPreview = {
    /**
     * @param {string} content
     * @returns {string[]} matches
     */
    match(content) {
        const matches = content.matchAll(AMIAMI_ITEM_REGEX);

        return [...matches].map(match => match[0]);
    },
    generators: [
        new AmiAmiApiPreview({
            domain: process.env.AMIAMI_DOMAIN ?? "amiami.com",
        }),
        new AmiAmiFallbackPreview(),
    ],
    async init() {
        await amiamiFallbackClient.init();
        await currencyApi.ready;
    }
}


module.exports = {
    AmiAmiPreview,
};