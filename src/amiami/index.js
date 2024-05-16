const { EmbedBuilder, AttachmentBuilder } = require("discord.js");
const { AmiAmiApiClient } = require("./amiami-api");
const { AmiAmiFallbackClient } = require("./amiami-fallback");

const AMIAMI_ITEM_REGEX = /(?<=amiami\.com\/eng\/detail(\/)?\?)([sg]code)\=([A-Za-z0-9\-]+)/g;

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

        const discountRate = item.discountRate();
        const priceJpy = item.price;
        const priceUsd = priceJpy / 155;
        
        const embed = new EmbedBuilder()
            .setURL(`https://amiami.com/eng/detail/${codeType}=${code}`)
            .setDescription(`**Price**: ¥${Math.trunc(priceJpy)} / $${priceUsd.toFixed(2)} ${discountRate > 0 ? `(${discountRate}% off)` : ""}`)
            .setTitle(item.name)
            .setImage(item.image)
            // random color from the amiami logo
            .setColor("#f68329")
            .setFooter({
                iconURL: process.env.AMIAMI_FAVICON_URL ?? "https://www.amiami.com/favicon.png",
                text: `USD price is an estimate based on 1 USD = 155 JPY.`
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
    #client = new AmiAmiFallbackClient();

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
                    .setURL(`https://amiami.com/eng/detail/gcode=${code}`)
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

    async init() {
        await this.#client.init();
    }
}

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
}


module.exports = {
    AmiAmiPreview,
};