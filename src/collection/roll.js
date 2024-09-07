const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { roll } = require(".");

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