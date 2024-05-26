require("dotenv").config();
const { getClient } = require("./client");
const { Settings, settingsHandler } = require("./settings");

const client = getClient();

client.on("messageCreate", async message => {
    if (message.author.bot) return;
    if (!message.inGuild()) return;

    const settings = await Settings.forGuild(client.db, message.guildId);

    const disabled = settings.disabled;

    const enabledPreviews = client.previews.filter(preview => !disabled.has(preview.name));

    for (const group of enabledPreviews) {
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
                    console.error(error);
                    continue;
                }
            }
        }
    }
})

client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === "settings") {
        await settingsHandler(interaction);
    }
});



async function main() {
    for (const matcher of client.previews) {
        console.log(`Initializing ${matcher.generators.length} generators for "${matcher.name}".`);
        await matcher.init?.();

        for (const generator of matcher.generators) {
            await generator.init?.();
        }
    }

    console.log(`Initializing settings.`);
    await Settings.init(client.db);

    await client.login(process.env.DISCORD_TOKEN);
    console.log(`Logged into Discord as ${client.user.tag}.`);
}

main();