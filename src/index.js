import "dotenv/config";

import {
    Client,
    IntentsBitField,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    Partials,
} from "discord.js";
import { AmiAmiPreview } from "./amiami/index.js";
import { youTubeCommunityPostPreview, youTubeCommentPreview } from "./youtube/index.js";
import { BlueskyPreview } from "./bluesky/index.js";
import { registerContextInteractions } from "./context-interaction.js";
import { DebugPreviewGroup } from "./debug-preview.js";
import process from "node:process";

const { Flags: IntentsFlags } = IntentsBitField;

const client = new Client({
    intents: [
        IntentsFlags.Guilds,
        IntentsFlags.GuildMessages,
        IntentsFlags.MessageContent,
        IntentsFlags.DirectMessages,
    ],
    partials: [Partials.Channel],
});

class ClientPreviews {
    /**
     * @type { Client }
     */
    client;

    constructor(client, providers) {
        this.client = client;
        this.previewProviders = providers;
    }

    async init() {
        for (const matcher of this.previewProviders) {
            await matcher.init?.();
            for (const generator of matcher.generators) {
                await generator.init?.();
            }
        }
    }

    /**
     *
     * @param {string} content
     * @returns {AsyncGenerator<import("discord.js").MessageCreateOptions>}
     */
    async *generateFromContent(content) {
        for (const group of this.previewProviders) {
            // Dedupe matches. Messages may contain the same item multiple times,
            // but we only want to preview it once.
            const matches = new Set(group.match(content));
            matches: for (const match of matches) {
                for (const generator of group.generators) {
                    try {
                        const preview = await generator.generate(match);
                        if (!preview) continue;

                        const { message: messageContent, images } = preview;
                        if (!messageContent) continue;

                        if (images && images > 1) {
                            const components = (messageContent.components ??= []);

                            const row = new ActionRowBuilder();

                            if (images > 2) {
                                row.addComponents(
                                    new ButtonBuilder()
                                        .setCustomId(`${group.name}:${match}:${images - 1}`)
                                        .setEmoji("◀️")
                                        .setStyle(ButtonStyle.Secondary),
                                );
                            }

                            row.addComponents(
                                new ButtonBuilder()
                                    .setCustomId(`${group.name}:${match}:${1}`)
                                    .setEmoji("▶️")
                                    .setStyle(ButtonStyle.Secondary),
                            );

                            components.push(row);
                        }

                        yield messageContent;
                        // we take the first result for every match.
                        continue matches;
                    } catch (error) {
                        if (group.reportErrors || generator.reportErrors) {
                            const owner = await this.client.users.fetch(process.env.BOT_OWNER_ID).catch(console.error);
                            if (owner) {
                                const errorChunks = splitIntoChunks(`${error.stack}`, 1900);
                                for (const [i, chunk] of errorChunks.entries()) {
                                    const embed = new EmbedBuilder()
                                        .setColor("Red")
                                        .setTitle(`Error in preview generator (${group.name}/${generator.name})`)
                                        .setDescription(`\`\`\`${chunk}\`\`\``)
                                        .setTimestamp()
                                        .setFooter({ text: `Part ${i + 1} of ${errorChunks.length}` });

                                    await owner.send({ embeds: [embed] }).catch(console.error);
                                }
                            }
                        }
                        console.error(error);
                        continue;
                    }
                }
            }
        }
    }
}

function splitIntoChunks(string, chunkSize) {
    const chunks = [];
    for (let i = 0; i < string.length; i += chunkSize) {
        chunks.push(string.slice(i, i + chunkSize));
    }
    return chunks;
}

const previewProviders = [AmiAmiPreview, youTubeCommunityPostPreview, youTubeCommentPreview, BlueskyPreview];

client.previews = new ClientPreviews(client, previewProviders);

if (process.env.NODE_ENV !== "production") {
    client.previews.previewProviders.push(new DebugPreviewGroup(client.previews));
} else {
    const debugPreview = new DebugPreviewGroup(client.previews);

    client.on("messageCreate", async (message) => {
        if (message.inGuild()) return;
        if (message.author.id !== process.env.BOT_OWNER_ID) return;

        const matches = debugPreview.match(message.content);
        for (const match of matches) {
            // DebugPreviewGroup only has one generator
            const { message: reply } = await debugPreview.generators[0].generate(match);
            await message.reply(reply);
        }
    });
}

client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    for await (const preview of client.previews.generateFromContent(message.content)) {
        await message.reply({ ...preview, allowedMentions: { parse: [] } }).catch(console.error);
    }
});

client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const [service, id, imageNoStr] = interaction.customId.split(":");

    const preview = client.previews.previewProviders.find((g) => g.name === service);
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
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`${service}:${id}:${imageNo === 0 ? totalImages - 1 : imageNo - 1}`)
                    .setEmoji("◀️")
                    .setStyle(ButtonStyle.Secondary),
                new ButtonBuilder()
                    .setCustomId(`${service}:${id}:${imageNo === totalImages - 1 ? 0 : imageNo + 1}`)
                    .setEmoji("▶️")
                    .setStyle(ButtonStyle.Secondary),
            ),
        );
    } else if (totalImages === 2) {
        components.push(
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`${service}:${id}:${imageNo === 0 ? 1 : 0}`)
                    .setEmoji(imageNo === 0 ? "▶️" : "◀️")
                    .setStyle(ButtonStyle.Secondary),
            ),
        );
    }

    await interaction
        .update({
            embeds: [embed.setImage(image)],
            components,
        })
        .catch(console.error);
});

async function main() {
    await client.previews.init();
    await client.login(process.env.DISCORD_TOKEN);
    console.log(`Logged into Discord as ${client.user.tag}.`);

    registerContextInteractions(client);
}

main();
