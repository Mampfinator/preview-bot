const { Client, ContextMenuCommandBuilder, InteractionType, InteractionContextType, ApplicationCommandType, ApplicationIntegrationType, MessageFlags } = require("discord.js");

/**
 * 
 * @param {Client} client 
 */
function registerContextInteractions(client) {
    client.on("interactionCreate", async interaction => {
        if (!interaction.isMessageContextMenuCommand()) return;
        if (!interaction.commandName.startsWith("Preview")) return;

        const flags = interaction.commandName.includes("(Private)") ? MessageFlags.Ephemeral : 0;

        await interaction.deferReply({flags})

        for await (const message of client.previews.generateFromContent(interaction.targetMessage.content)) {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.editReply({...message}).catch(console.error);
            } else {
                await interaction.followUp({...message, flags}).catch(console.error);
            }
        }
    });

    client.application.commands.create(interaction);
    client.application.commands.create(interactionPrivate);
}

const interaction = new ContextMenuCommandBuilder()
    .setName("Preview")
    .setIntegrationTypes([ApplicationIntegrationType.UserInstall, ApplicationIntegrationType.GuildInstall])
    .setType(ApplicationCommandType.Message)
    .setContexts([InteractionContextType.BotDM, InteractionContextType.Guild, InteractionContextType.PrivateChannel]);

// like above, but ephemeral
const interactionPrivate = new ContextMenuCommandBuilder()
    .setName("Preview (Private)")
    .setIntegrationTypes([ApplicationIntegrationType.UserInstall, ApplicationIntegrationType.GuildInstall])
    .setType(ApplicationCommandType.Message)
    .setContexts([InteractionContextType.BotDM, InteractionContextType.PrivateChannel]);

module.exports = { registerContextInteractions };