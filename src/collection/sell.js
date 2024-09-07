const { SlashCommandBuilder } = require("discord.js");
const { getDriver } = require("../driver");

module.exports = {
    SELL: {
        data: new SlashCommandBuilder()
            .setName("sell")
            .setDescription("Sell a figure you own.")
            .addStringOption(id => id
                .setName("id")
                .setDescription("The ID of the figure to sell.")
            )
            .setDMPermission(false),

        handler: async (interaction) => {
            const id = interaction.options.getString("id");

            if (!id) {
                await interaction.reply({ content: "Interactive sell menu not yet implemented.", ephemeral: true }).catch(console.error);
                return;
            }

            const code = Number(id.split("-")[1]);

            console.log(code);

            const driver = getDriver();

            const session = driver.session();

            const result = await session.executeWrite(tx => tx.run(`
                MATCH (u:User { id: $userId })<-[r:OWNED_BY { server_id: $serverId }]-(f:Figure { code: $code })
                DELETE r
                SET u.balance = COALESCE(u.balance, 0.0) + f.price
                RETURN f AS figure, u.balance AS balance
            `, { userId: interaction.user.id, serverId: interaction.guild.id, code }));

            await session.close();

            if (result.records.length === 0) {
                await interaction.reply({ content: "You don't own that figure.", ephemeral: true }).catch(console.error);
                return;
            }

            const figure = result.records[0].get("figure").properties;
            const balance = result.records[0].get("balance");

            await interaction.reply({ content: `Sold **${figure.name}** for ¥${figure.price}! You now have ¥${balance}.` }).catch(console.error);
        }
    }
}