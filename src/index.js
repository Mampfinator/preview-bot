require("dotenv").config();
const { Client, IntentsBitField: {Flags: IntentsFlags} } = require("discord.js");

const client = new Client({
    intents: [IntentsFlags.Guilds, IntentsFlags.GuildMessages, IntentsFlags.MessageContent],
});

const AMIAMI_FIGURE_REGEX = /(?<=amiami\.com\/eng\/detail\/\?gcode=)FIGURE-[0-9]+/g;

client.on("messageCreate", async message => {
    const matches = [...message.content.matchAll(AMIAMI_FIGURE_REGEX)];
    if (!matches || matches.length <= 0) return;

    const gcodes = matches.map(match => typeof match == "string" ? match : match[0]).filter(gcode => !!gcode);
    if (gcodes.length <= 0) return;

    const imageUrls = gcodes.map(gcode => `https://img.amiami.com/images/product/main/242/${gcode}.jpg`);
    
    console.log(imageUrls);

    if (imageUrls.length <= 0) return;

    await message.reply({
        files: imageUrls,
        allowedMentions: {
            parse: []
        }
    }).catch(console.error);
});



client.login(process.env.DISCORD_TOKEN);