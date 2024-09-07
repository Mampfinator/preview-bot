const { Client } = require("discord.js");
const { config } = require("dotenv");
const { COMMANDS } = require("./src/commands");

config();

async function main() {
    // we don't need any intents for registering commands
    const client = new Client({ intents: []});

    const deployInGuild = process.env.NODE_ENV !== "production" && process.env.DEBUG_GUILD;
    if (deployInGuild) {
        console.log(`Deploying commands in ${deployInGuild}.`);
    } else {
        console.log("Deploying commands globally.");
    }

    await client.login(process.env.DISCORD_TOKEN);

    for (const [_, command] of await client.application.commands.fetch()) {
        await command.delete();
    }

    for (const { data } of COMMANDS) {
        await client.application.commands.create(data, deployInGuild);
    }

    client.destroy();
}

main()