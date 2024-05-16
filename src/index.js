require("dotenv").config();
const { Client, IntentsBitField: {Flags: IntentsFlags} } = require("discord.js");
const { AmiAmiMatcher } = require("./amiami");

const client = new Client({
    intents: [IntentsFlags.Guilds, IntentsFlags.GuildMessages, IntentsFlags.MessageContent],
});

/**
 *  for different preview-less platforms.
 */
client.previews = [
    AmiAmiMatcher,
];

client.on("messageCreate", async message => {
    if (message.author.bot) return;

    for (const group of client.previews) {
        const matches = group.match(message.content);
        matches: for (const match of matches) {
            for (const generator of group.generators) {
                try {
                    const preview = await generator.generate(match);
                    if (!preview) continue;
                    await message.reply({...preview, allowedMentions: { parse: [] }}).catch(() => {});
                    // we take the first result for every match.
                    continue matches;
                } catch (error) {
                    continue;
                }
            }
        }
    }
})

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