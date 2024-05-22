const { Client, IntentsBitField: {Flags: IntentsFlags} } = require("discord.js");
const { AmiAmiPreview } = require("./amiami");
const { YouTubePreview } = require("./youtube");
const sqlite = require("sqlite3");

const client = new Client({
    intents: [IntentsFlags.Guilds, IntentsFlags.GuildMessages, IntentsFlags.MessageContent],
});

client.db = new sqlite.Database(process.env.DB_PATH ?? "./data.db");

client.previews = [
    AmiAmiPreview,
    YouTubePreview,
];

function getClient() {
    return client;
}

module.exports = { getClient };