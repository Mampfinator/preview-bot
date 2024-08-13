require("dotenv").config();
const { Client, IntentsBitField: {Flags: IntentsFlags}, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { AmiAmiPreview } = require("./amiami");
const { YouTubePreview } = require("./youtube");

const client = new Client({
    intents: [IntentsFlags.Guilds, IntentsFlags.GuildMessages, IntentsFlags.MessageContent],
});


client.previews = [
    AmiAmiPreview,
    YouTubePreview,
];

client.on("messageCreate", async message => {
    if (message.author.bot) return;

    for (const group of client.previews) {
        // Dedupe matches. Messages may contain the same item multiple times, 
        // but we only want to preview it once.
        const matches = new Set(group.match(message.content));
        matches: for (const match of matches) {
            for (const generator of group.generators) {
                try {
                    const preview = await generator.generate(match);
                    if (!preview) continue;

                    const { message: messageContent, images } = preview;
                    if (!messageContent) continue;

                    if (images && images > 0) {
                        const components = messageContent.components ??= []; 

                        const row = new ActionRowBuilder();

                        if (images > 2) {
                            row.addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`${group.name}:${match}:${images - 1}`)
                                    .setEmoji("◀️")
                                    .setStyle(ButtonStyle.Secondary)
                            );
                        }

                        row.addComponents(
                            new ButtonBuilder()
                                .setCustomId(`${group.name}:${match}:${1}`)
                                .setEmoji("▶️")
                                .setStyle(ButtonStyle.Secondary)
                        );

                        components.push(row);
                    }

                    await message.reply({...messageContent, allowedMentions: { parse: [] }}).catch(console.error);
                    // we take the first result for every match.
                    continue matches;
                } catch (error) {
                    console.error(error);
                    continue;
                }
            }
        }
    }
})

client.on("interactionCreate", async interaction => {
    if (!interaction.isButton()) return;

    const [service, id, imageNoStr] = interaction.customId.split(":");

    const preview = client.previews.find(g => g.name === service);
    if (!preview) {
        await interaction.reply({ content: "Unknown service.", ephemeral: true }).catch(console.error);
        return;
    }

    const imageNo = Number(imageNoStr);

    const { image, totalImages } = await preview.getImage(id, imageNo);

    if (!image) {
        await interaction.reply({ content: "Failed to fetch image.", ephemeral: true }).catch(console.error);
        return;
    }

    const embed = new EmbedBuilder(interaction.message.embeds[0]);
    if (!embed) {
        await interaction.reply({ content: "Unknown failure.", ephemeral: true }).catch(console.error);
        return;
    }

    const components = (interaction.message.components ??= []).slice(0, -1);

    if (totalImages > 2) {
        components.push(
            new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`${service}:${id}:${imageNo === 0 ? totalImages - 1 : imageNo - 1 }`)
                        .setEmoji("◀️")
                        .setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder()
                        .setCustomId(`${service}:${id}:${imageNo === totalImages - 1 ? 0 : imageNo + 1 }`)
                        .setEmoji("▶️")
                        .setStyle(ButtonStyle.Secondary),
                )
        );
    } else if (totalImages === 2) {
        components.push(
            new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`${service}:${id}:${imageNo === 0 ? 1 : 0 }`)
                        .setEmoji(imageNo === 0 ? "▶️" : "◀️")
                        .setStyle(ButtonStyle.Secondary)
                )
        );
    }

    await interaction.update({ 
        embeds: [embed.setImage(image)], 
        components
    }).catch(console.error);
});

async function main() {
    for (const matcher of client.previews) {
        for (const generator of matcher.generators) {
            await generator.init?.();
        }
    }

    await client.login(process.env.DISCORD_TOKEN);
    console.log(`Logged into Discord as ${client.user.tag}.`);
}

main();