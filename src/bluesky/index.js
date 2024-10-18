const { Agent, CredentialSession, isDid, asDid } = require("@atproto/api");
const { EmbedBuilder } = require("@discordjs/builders");
const { Colors } = require("discord.js");

const BLUESKY_FEED_URL_REGEX = /https\:\/\/bsky\.app\/profile\/[A-Za-z0-9\-\:\_\.]+\/feed\/[A-Za-z0-9\-]+/g;

/**
 * Previews Bluesky feeds.
 */
class BlueskyFeedPreview {
    /**
     * @type {Agent}
     */
    #agent;

    constructor() {
        this.#agent = new Agent(
            new CredentialSession(
                "https://bsky.social",
            ),
        );
    }

    /**
     * 
     * @param {string} match 
     */
    async generate(match) {
        let [userId, feedId] = match.split("/feed/");

        userId = userId.split("/").pop();
        feedId = feedId.replaceAll("/", "");

        if (!isDid(userId)) {
            const { data, success } = await this.#agent.com.atproto.identity.resolveHandle({
                handle: userId
            });

            if (!success) return console.log(`Failed to resolve DID for ${userId}`);

            const { did } = data;
            userId = asDid(did);
        }

        const { data, success } = await this.#agent.app.bsky.feed.getFeedGenerator({
            feed: `at://${userId}/app.bsky.feed.generator/${feedId}`,
        });

        if (!success) return;

        const { view: feed } = data;

        return {
            message: {
                embeds: [
                    new EmbedBuilder()
                        .setDescription(feed.description)
                        .setThumbnail(feed.avatar)
                        .setTitle(feed.displayName)
                        .setColor(Colors.Blue)
                        .setURL(match)
                        .setTimestamp()
                        .setFooter({
                            text: "Bluesky",
                            iconURL: "https://bsky.app/static/favicon.png"
                        })
                ]
            }
        }
    }

    async init() {
        await this.#agent.sessionManager.login({
            identifier: process.env.BSKY_IDENTIFIER,
            password: process.env.BSKY_PASSWORD,
        });
    }
}

const BlueskyPreview = {
    name: "bluesky",
    /**
     * @param {string} content
     * @returns {string[]} matches
     */
    match(content) {
        return [...content.matchAll(BLUESKY_FEED_URL_REGEX)].map(match => typeof match == "string" ? match : match[0]);
    },
    generators: [
        new BlueskyFeedPreview(),
    ]
}

module.exports = {
    BlueskyPreview,
}
