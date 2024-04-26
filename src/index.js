require("dotenv").config();
const { default: axios } = require("axios");
const { Client, IntentsBitField: {Flags: IntentsFlags} } = require("discord.js");

const client = new Client({
    intents: [IntentsFlags.Guilds, IntentsFlags.GuildMessages, IntentsFlags.MessageContent],
});

const AMIAMI_FIGURE_REGEX = /(?<=amiami\.com\/eng\/detail(\/)?\?[A-Za-z0-9_]*?code=)FIGURE-[0-9]+/g;

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const instance = axios.create({
    method: "GET",
    baseURL: `https://api.amiami.com/api/v1.0`,
    headers: {
        "Accept": "application/json, text/plain, */*",
        "Accept-Encoding": "gzip, deflate, br",
        "Accept-Language": "en-US,en;q=0.5",
        "Connection": "keep-alive",
        "DNT": "1",
        "Host": "api.amiami.com",
        "Origin": "https://www.amiami.com",
        "Sec-Fetch-Dest": "empty",
        "Sec-Fetch-Mode": "cors",
        "Sec-Fetch-Site": "same-site",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0",
        "X-User-Key": "amiami_dev"
    },
    with_credentials: true
});

client.on("messageCreate", async message => {
    const matches = [...message.content.matchAll(AMIAMI_FIGURE_REGEX)];
    if (!matches || matches.length <= 0) return;

    const codes = matches.map(match => typeof match == "string" ? match : match[0]).filter(gcode => !!gcode);
    if (codes.length <= 0) return;

    const imageUrls = [];

    for (const code of codes) {
        // fetch metadata from API; X-User-Key seems to be static from the website.
        const response = await instance.get("/item", {
            headers: {
                "Referrer": `https://www.amiami.com/eng/detail/?gcode=${code}`,
            },
            params: {
                gcode: code,
                lang: "eng"
            }
        }).catch(err => {
            console.error(`Failed to fetch metadata for ${code}`, err);
            return null;
        });

        if (!response) continue;

        const {data} = response;

        const imageUrl = data.item?.main_image_url;


        if (!imageUrl) {
            console.warn(`No image URL found for ${code}`);
            continue;
        }

        imageUrls.push(
            `https://img.amiami.com${imageUrl}`
        );

        await sleep(250);
    }

    if (imageUrls.length <= 0) return;

    await message.reply({
        files: imageUrls,
        allowedMentions: {
            parse: []
        }
    }).catch(console.error);
});

client.login(process.env.DISCORD_TOKEN);