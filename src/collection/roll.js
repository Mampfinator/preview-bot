const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { int } = require("neo4j-driver");
const { getSession } = require("../driver");

/**
 * Roll random claimable figures.
 * @param {string} serverId
 * @returns {Promise<{
 *  figure: ReturnType<import("../amiami/amiami-db").toDbItem>,
 *  characters: { name: string, id: number }[],
 *  franchises: { name: string, id: number }[],
 * }[]>>}
 */
async function roll(serverId, amount = 1) {
    const session = getSession();

    const rolled = await session.executeRead(tx => tx.run(`
        MATCH (f:Figure:Full) WHERE NOT (f)-[:OWNED_BY { serverId: $serverId }]->(:User)
        WITH f, rand() AS r
        ORDER BY r
        LIMIT $amount
        WITH f OPTIONAL MATCH (f)-[:BELONGS_TO]-(fr:Franchise)
        WITH f, collect(fr) as franchises OPTIONAL MATCH (f)-[:DISPLAYS]-(c)
        RETURN f as figure, collect(c) as characters, franchises
    `, { amount: int(amount), serverId }));

    await session.close();

    return rolled.records.map(record => (
        { 
            figure: record.get("figure").properties,
            characters: record.get("characters")?.map(c => c.properties),
            franchises: record.get("franchises")?.map(fr => fr.properties), 
        }
    ));
}


module.exports = {
    roll,
}

function generateMessage(figure, characters, franchises) {
    const embed = new EmbedBuilder()
        .setTitle(figure.name)
        .setURL(`https://www.amiami.com/eng/detail?gcode=${figure.type}-${figure.code}`)
        .setColor("#f68329")
        .setImage(figure.main_image ?? figure.images?.[0])
        .setFooter({ text: `Value: ¥${figure.price} | ID: ${figure.type}-${figure.code}` })
        .setTimestamp()

    if (characters && characters.length > 0) {
        embed.addFields({ name: "Characters", value: characters.map(character => character.name).join("\n"), inline: true });
    }

    if (franchises && franchises.length > 0) {
        embed.addFields({ name: "Franchises", value: franchises.map(franchise => franchise.name).join("\n"), inline: true });
    }


    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`claim:${figure.type}-${figure.code}`)
                    .setLabel("Claim")
                    .setEmoji("💰")
                    .setStyle(ButtonStyle.Success)
            )
        ]
    }
}

module.exports = {
    ROLL_COMMAND: {
        data: new SlashCommandBuilder()
            .setName("roll")
            .setDescription("Roll random claimable figures.")
            .setDMPermission(false)
            .addIntegerOption(option => option
                .setName("amount")
                .setDescription("The amount of figures to roll.")
                .setMinValue(1)
                .setMaxValue(10)
                .setRequired(false)
            ),
        /**
         * @param {import("discord.js").Interaction} interaction
         */
        handler: async (interaction) => {
            const amount = interaction.options.getInteger("amount", false) ?? 1;
            const messages = (await roll(amount)).map(roll => generateMessage(roll.figure, roll.characters, roll.franchises));

            const first = messages.shift();
            if (!first) {
                await interaction.reply({ content: "Something went wrong.", ephemeral: true });
                return;
            }

            await interaction.reply(first)

            for (const message of messages) {
                await interaction.followUp(message);
            }
        }
    }
}