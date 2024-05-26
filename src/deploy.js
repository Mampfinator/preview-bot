require("dotenv").config();
const { getSettingsCommand } = require("./settings");
const { getClient } = require("./client");


const client = getClient();


client.on("ready", async () => {
    console.log(`Deploying commands for ${client.user.tag}.`);

    const debugGuild = process.env.DEBUG_GUILD;

    if (debugGuild) {
        console.log(`Deploying commands to Guild ${debugGuild}`);
    } else {
        console.log("Deploying commands globally.");
    }

    await client.application.commands.set([
        getSettingsCommand(client), 
    ], debugGuild);

    await client.destroy();

    console.log("Done.");

    process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);