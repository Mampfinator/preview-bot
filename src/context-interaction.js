import { Client, ContextMenuCommandBuilder, InteractionType, InteractionContextType, ApplicationCommandType, ApplicationIntegrationType, MessageFlags, EmbedBuilder } from "discord.js";

/**
 * 
 * @param {Client} client 
 */
export function registerContextInteractions(client) {
    client.on("interactionCreate", async interaction => {
        if (!interaction.isMessageContextMenuCommand()) return;
        if (!interaction.commandName.startsWith("Preview")) return;

        const flags = interaction.commandName.includes("(Private)") ? MessageFlags.Ephemeral : 0;

        await interaction.deferReply({flags})

        let sentAny = false;

        for await (const message of client.previews.generateFromContent(interaction.targetMessage.content)) {
            if (!interaction.deferred && !interaction.replied) {
                await interaction.editReply({...message}).catch(console.error);
                sentAny = true;
            } else {
                await interaction.followUp({...message, flags}).catch(console.error);
            }
        }

        if (!sentAny) {
            await interaction.editReply({
                embeds: [
                    new EmbedBuilder()
                        .setDescription(":x: Nothing to preview!")
                        .setColor("Red")
                ]
            }).catch(console.error);
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
