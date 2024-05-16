require("dotenv").config();
const { Client, IntentsBitField: {Flags: IntentsFlags}, AttachmentBuilder, EmbedBuilder } = require("discord.js");
const { sleep } = require("./util");

const client = new Client({
    intents: [IntentsFlags.Guilds, IntentsFlags.GuildMessages, IntentsFlags.MessageContent],
});

if (Boolean(process.env.USE_AMIAMI_FALLBACK)) {
    const { AmiAmiFallbackClient } = require("./amiami-fallback");

    console.log("Using fallback logic for AmiAmi previews.");
    
    const AMIAMI_FIGURE_REGEX = /(?<=amiami\.com\/eng\/detail(\/)?\?[A-Za-z0-9_]*?code=FIGURE-)[0-9]+(-R)?/g;
    
    const amiamiFallback = new AmiAmiFallbackClient();

    client.on("ready", async () => {
        await amiamiFallback.init();
    });

    client.on("messageCreate", async message => {
        const matches = [...message.content.matchAll(AMIAMI_FIGURE_REGEX)];
        if (!matches || matches.length <= 0) return;

        const codes = matches.map(match => typeof match == "string" ? match : match[0]).filter(gcode => !!gcode);
        if (codes.length <= 0) return;

        const images = [];

        for (const code of codes) {
            const imageBuffer = await amiamiFallback.getImage(code);
            images.push(new AttachmentBuilder(imageBuffer, { name: `FIGURE-${code}.jpg` }));
        }

        if (images.length <= 0) return console.error(`No images to send for ${message.id} (${codes.join(", ")}).`);

        await message.reply({
            files: images,
            allowedMentions: {
                parse: []
            }
        }).catch(console.error);
    });
} else {
    console.log("Using API logic for AmiAmi previews.");

    const { AmiAmiApiClient } = require("./amiami-api");
    const AMIAMI_ITEM_REGEX = /(?<=amiami\.com\/eng\/detail(\/)?\?)([sg]code)\=([A-Za-z0-9\-]+)/g;

    const amiamiClient = new AmiAmiApiClient({
        domain: process.env.AMIAMI_DOMAIN ?? "amiami.com",
    });

    client.on("messageCreate", async message => {
        const matches = [...message.content.matchAll(AMIAMI_ITEM_REGEX)];
        if (!matches || matches.length <= 0) return;

        const itemParams = matches.filter(match => !!match).map(([,, codeType, code]) => ({codeType, code}));
        if (itemParams.length <= 0) return;

        const embeds = [];

        await sleep(250);

        for (const { code, codeType } of itemParams) {
            const item = await amiamiClient.item(code, codeType).catch(console.error);
            if (!item) continue; 

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
                    iconURL: process.env.AMIAMI_FAVICON_URL,
                    text: `USD price is an estimate of 1 USD = 155 JPY.`
                });

            if (item.spec && item.spec.length > 0) {
                embed.addFields({
                    name: "\u200b",
                    value: item.spec,
                });
            }
            
            embeds.push(
                embed
            )

            await sleep(250);
        }

        for (const embed of embeds) {
            await message.reply({
                embeds: [embed],
                allowedMentions: {
                    parse: [],
                },
            }).catch(() => {});
        }
    });
}

async function main() {
    await client.login(process.env.DISCORD_TOKEN);
    console.log(`Logged into Discord as ${client.user.tag}.`);
}

main()