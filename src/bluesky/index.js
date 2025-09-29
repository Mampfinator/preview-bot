import { Agent, CredentialSession, isDid, asDid } from "@atproto/api";
import { EmbedBuilder } from "@discordjs/builders";
import { Colors } from "discord.js";

const BLUESKY_FEED_URL_REGEX = /https\:\/\/bsky\.app\/profile\/[A-Za-z0-9\-\:\_\.]+\/feed\/[A-Za-z0-9\-]+/g;

/**
 * @param {string} url Bluesky feed URL matching `https://bsky.app/profile/<user>/feed/<feed>`.
 * @returns {[string, string]} a `[userId, feedId]` tuple. `userId` may be a DID or a handle. Handles can be resolved using `agent.com.atproto.identity.resolveHandle`.
 */
function idsFromFeedUrl(url) {
    let [userId, feedId] = url.split("/feed/");

    userId = userId.split("/").pop();
    feedId = feedId.replaceAll("/", "");

    return [userId, feedId];
}

/**
 * Previews Bluesky feeds.
 */
class BlueskyFeedPreview {
    name = "bluesky-feeds";
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
     * @param {string} match 
     */
    async generate(match) {
        let [userId, feedId] = idsFromFeedUrl(match);

        if (!isDid(userId)) {
            const { data, success } = await this.#agent.com.atproto.identity.resolveHandle({
                handle: userId
            });

            if (!success) return console.error(`Failed to resolve DID for ${userId}`);

            const { did } = data;

            // Just to be *absolutely* sure, assert that the returned DID is valid.
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

export const BlueskyPreview = {
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
