import {
    ApplicationIntegrationType,
    EmbedBuilder,
    InteractionContextType,
    MessageFlags,
    SlashCommandBuilder,
} from "discord.js";


/**
 * Registers `/preview` and `/private-preview` slash commands and their handler.
 * @param {import("discord.js").Client} client
 */
export function registerSlashCommandInteractions(client) {
    client.on("interactionCreate", async (interaction) => {
        if (!interaction.isChatInputCommand()) return;
        if (interaction.commandName !== "preview" && interaction.commandName !== "private-preview") return;

        const flags = interaction.commandName.includes("private") ? MessageFlags.Ephemeral : 0;

        await interaction.deferReply({ flags });

        const links = interaction.options.getString("links");
        const sendLinks = interaction.options.getBoolean("send-links") ?? true;

        if (sendLinks) {
            await interaction.followUp({
                content: links.replaceAll(" ", "\n")
            });
        }


        let sentAny = false;

        for await (const message of client.previews.generateFromContent(links)) {
            sentAny = true;
            await interaction.followUp({ ...message, flags }).catch(console.error);
        }

        if (!sentAny) {
            await interaction
                .editReply({
                    embeds: [new EmbedBuilder().setDescription(":x: Nothing to preview!").setColor("Red")],
                })
                .catch(console.error);
        }
    });

    client.application.commands.create(command);
    client.application.commands.create(privateCommand);
}

const command = new SlashCommandBuilder()
    .setName("preview")
    .setDescription("Preview links.")
    .addStringOption(links => links.setName("links").setDescription("Space separated links to preview..").setRequired(true))
    .addBooleanOption(sendLinks => sendLinks.setName("send-links").setDescription("Whether to send the requested links in a separate message or not. Defaults to true.").setRequired(false))
    .setIntegrationTypes([ApplicationIntegrationType.UserInstall, ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel]);

const privateCommand = new SlashCommandBuilder()
    .setName("private-preview")
    .setDescription("Preview links, but private.")
    .addStringOption(links => links.setName("links").setDescription("Space separated links to preview..").setRequired(true))
    .addBooleanOption(sendLinks => sendLinks.setName("send-links").setDescription("Whether to send the requested links in a separate message first or not. Defaults to true.").setRequired(false))
    .setIntegrationTypes([ApplicationIntegrationType.UserInstall, ApplicationIntegrationType.GuildInstall])
    .setContexts([InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel]);