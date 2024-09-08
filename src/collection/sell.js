const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType, ButtonBuilder, ButtonStyle, StringSelectMenuOptionBuilder } = require("discord.js");
const { getDriver } = require("../driver");
const { parseCode } = require("./figure-collection");

const FIGURES_PER_PAGE = 10;

class InteractiveSellMenu {
    /**
     * @type {import("discord.js").ChatInputCommandInteraction}
     */
    interaction;

    /**
     * @type {import("neo4j").Driver}
     */
    driver;

    page = 0;

    constructor(interaction) {
        this.interaction = interaction;
        this.driver = getDriver();
    }

    async send() {
        const message = await this.interaction.deferReply({ ephemeral: true, fetchReply: true }).catch(console.error);

        const userId = this.interaction.user.id;
        const serverId = this.interaction.guild.id;

        const session = this.driver.session();

        const result = await session.executeRead(tx => tx.run(`
            MATCH (u:User { id: $userId })<-[:OWNED_BY { server_id: $serverId }]-(f:Figure)
            RETURN collect(f) as figures
        `, { userId, serverId }));

        await session.close();

        const figures = result.records[0]?.get("figures")?.map(node => node.properties);
        if (!figures || figures.length === 0) {
            await this.interaction.editReply({ content: "You don't own any figures. Go claim some and try again!", ephemeral: true }).catch(console.error);
            return;
        }

        const { resolve, promise } = Promise.withResolvers();

        const pageFigures = figures.slice(this.page * FIGURES_PER_PAGE, (this.page + 1) * FIGURES_PER_PAGE);

        const embed = new EmbedBuilder()
            .setDescription(`**Page ${this.page + 1} of ${Math.ceil(figures.length / FIGURES_PER_PAGE)}**`)
            .addFields(figures.slice(this.page * FIGURES_PER_PAGE, (this.page + 1) * FIGURES_PER_PAGE).map(figure => ({
                name: `**${figure.name}**`,
                value: `¥${figure.price}`,
            })));
        
        const components = [
            new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setPlaceholder("Select figures to sell")
                        .setMinValues(1)
                        .setMaxValues(pageFigures.length)
                        .addOptions(figures.slice(this.page * FIGURES_PER_PAGE, (this.page + 1) * FIGURES_PER_PAGE).map(figure => new StringSelectMenuOptionBuilder()
                            .setLabel(figure.name.length >= 100 ? figure.name.slice(0, 96) + "..." : figure.name)
                            .setValue(`${figure.type}-${figure.code}`)
                            .setEmoji("💰")
                            .setDescription(`Sell for ¥${figure.price}`)))
                        .setCustomId("select-figure"),
                ),
            new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji("💰")
                        .setCustomId(`sell`)
                        .setLabel("Sell Selected"),
                )
        ]

        await this.interaction.editReply({ embeds: [embed], components, ephemeral: true }).catch(console.error);
        if (!message) return;

        const collector = message.createMessageComponentCollector({filter: i => i.user.id === userId });

        let selected = [];

        collector.on("end", async () => {
            resolve();
        });

        collector.on("collect", async interaction => {
            if (interaction.customId === "select-figure") {
                selected = interaction.values;

                await interaction.reply({ content: `Selected ${selected.length} figure${selected.length === 1 ? "" : "s"}`, ephemeral: true }).catch(console.error);
            } else if (interaction.customId === "sell") {
                if (selected.size === 0) {
                    await interaction.reply({ content: "No figures selected.", ephemeral: true }).catch(console.error);
                    return;
                }

                const results = await Promise.allSettled([...selected].map(code => sell(code, userId, serverId)));

                const success = results.filter(result => result.status === "fulfilled").map(result => result.value);
                const failure = results.filter(result => result.status === "rejected").map(result => result.reason);

                const embed = new EmbedBuilder();

                if (success.length > 0) {
                    embed
                        .setColor("Green")
                        .setDescription(`Successfully sold ${success.length} figure${success.length === 1 ? "" : "s"} for ¥${success.reduce((sum, {figure}) => sum + figure.price, 0)}!`);
                }

                if (failure.length > 0) {
                    embed
                        .setColor("Red")
                        .addFields({
                            name: "Failed",
                            value: `Failed to sell ${failure.length} figure${failure.length === 1 ? "" : "s"}!`,
                        });
                }

                await interaction.update({ embeds: [embed], components: [] }).catch(console.error);

                collector.stop();

                return;
            }
        });

        return promise;
    }
}

async function sell(figureCode, userId, serverId, useSession) {
    const shouldClose = !useSession;
    const session = useSession ?? getDriver().session();

    const [_, code] = parseCode(figureCode);

    const result = await session.executeWrite(tx => tx.run(`
        MATCH (u:User { id: $userId })<-[r:OWNED_BY { server_id: $serverId }]-(f:Figure { code: $code })
        DELETE r
        SET u.balance = COALESCE(u.balance, 0.0) + f.price
        RETURN f AS figure, u.balance AS balance
    `, { userId, serverId, code }));

    if (shouldClose) await session.close();

    if (result.records.length === 0) {
        return null;
    }

    return {
        figure: result.records[0].get("figure").properties,
        balance: result.records[0].get("balance"),
    }
}

module.exports = {
    SELL: {
        data: new SlashCommandBuilder()
            .setName("sell")
            .setDescription("Sell a figure you own.")
            .addStringOption(id => id
                // TODO: autocomplete
                .setName("id")
                .setDescription("The ID of the figure to sell.")
            )
            .setDMPermission(false),

        handler: async (interaction) => {
            const id = interaction.options.getString("id");

            if (!id) {
                const menu = new InteractiveSellMenu(interaction);
                return await menu.send();
            }

            await interaction.deferReply().catch(console.error);

            const sold = await sell(id, interaction.user.id, interaction.guildId);

            if (!sold) {
                await interaction.editReply({ content: "You don't own that figure." }).catch(console.error);
                return;
            }

            await interaction.editReply({ content: `Sold **${sold.figure.name}** for ¥${sold.figure.price}! You now have ¥${sold.balance}.` }).catch(console.error);
        }
    }
}