const { SlashCommandBuilder } = require("discord.js");
const { getDriver } = require("../driver");
const { EmbedBuilder } = require("@discordjs/builders");

module.exports = {
    COLLECTION: {
        data: new SlashCommandBuilder()
            .setName("collection")
            .setDescription("View your collection.")
            .addStringOption(mode => mode
                .setName("mode")
                .setDescription("Whether to display an overview or details of your collection.")
                .addChoices({name: "Overview", value: "overview"}, { name: "Details", value: "details" })),
        /**
         * @param {import("discord.js").Interaction} interaction
         */
        handler: async (interaction) => {
            const driver = getDriver();

            const session = driver.session();

            const result = await session.executeRead(tx => tx.run(`
                MATCH (u:User { id: $userId })<-[:OWNED_BY { server_id: $serverId }]-(f:Figure)
                RETURN collect(f) as figures
            `, { userId: interaction.user.id, serverId: interaction.guild.id }));

            await session.close();

            if (result.records.length === 0) {
                await interaction.reply({ content: "You don't own any figures. Go claim some and try again!", ephemeral: true }).catch(console.error);
                return;
            }

            const figures = result.records[0].get("figures").map(node => node.properties);

            const mode = interaction.options.getString("mode", false) ?? "overview";

            if (mode === "overview") {
                const totalValue = figures.reduce((total, figure) => total + figure.price, 0);

                const embed = new EmbedBuilder()
                    .setDescription(`You have ${figures.length} figures in your collection worth ¥${totalValue}.`)
                    .addFields({
                        name: "Figures",
                        value: figures
                            .map(figure => `**${figure.name}**: ${figure.type}-${figure.code} - ¥${figure.price}`)
                            .join("\n")
                    });

                await interaction.reply({
                    embeds: [embed]
                }).catch(console.error);
            } else {
                await interaction.reply({ content: "Not implemented yet.", ephemeral: true }).catch(console.error);
            }
        }
    }
}