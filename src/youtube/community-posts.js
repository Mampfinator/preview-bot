import { ScrapingClient, AttachmentType, DataExtractors } from "@sireatsalot/youtube.js";
import { EmbedBuilder } from "discord.js";
import { unwrap } from "../util.js";
import { CacheMap } from "../cache.js";

const postIdRegex = /(?<=youtube.com\/post\/)Ug[A-z0-9_-]+|(?<=youtube.com\/channel\/.+\/community\?lb=)Ug[A-z0-9_-]+/g;

class CommunityPostPreviewGenerator {
    name = "youtube-community-posts";
    #client = new ScrapingClient();

    #cache = new CacheMap();

    /**
     * @param {string} match
     */
    async generate(match) {
        const postScraper = this.#client.post(match);

        /**
         * @type { import("@sireatsalot/youtube.js").CommunityPost }
         */
        const post = await postScraper.getPost().then(unwrap);
        const channel = await postScraper.getChannelData().then(unwrap);

        this.#cache.set(match, post);

        try {
            return {
                message: {
                    embeds: [postToEmbed(post, channel)],
                },
                images: post.images?.length ?? 0,
            };
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    async getImage(id, imageNo) {
        const post = await this.#client
            .post(id)
            .getPost(true)
            .then((result) => result._unsafeUnwrap());

        return {
            image: post.images?.[imageNo],
            totalImages: post.images?.length ?? 0,
        };
    }

    async init() {
        await this.#client.init();
    }

    async healthCheck() {
        // ideally there would be a `HomeContext` in youtube.js for us to use here, but this will do for now.
        // if we can reach YouTube and we get served valid `ytInitialData`, we should be fine.
        const result = await this.#client.orchestrator.fetch({ method: "GET", url: "https://www.youtube.com/" });
        if (!result.isOk()) return false;

        const data = DataExtractors.ytInitialData(result.value);
        return data.isOk();
    }
}

/**
 * Converts a Community Post into an {@link EmbedBuilder}.
 * @param { import("@sireatsalot/youtube.js").CommunityPost } post
 * @param { import("@sireatsalot/youtube.js").ChannelData } channel
 */
export function postToEmbed(post, channel) {
    const { content, attachmentType, id: postId } = post;

    const { avatar, name, id: channelId } = channel;

    const embed = new EmbedBuilder().setAuthor({
        name,
        iconURL: avatar,
        url: `https://www.youtube.com/channel/${channelId}`,
    });

    let embedContent;

    if (content && content.length > 0)
        embedContent = content.map(({ text, url }) => `${url ? "[" : ""}${text}${url ? `](${url})` : ""}`).join(" ");

    embed
        .setURL(`https://youtube.com/post/${postId}`)
        .setColor("#ff0000")
        .setFooter({
            iconURL: "https://www.youtube.com/img/favicon_144.png",
            text: `ID: ${postId}`,
        });

    switch (attachmentType) {
        case AttachmentType.None:
            break;
        case AttachmentType.Image:
            embed.setImage(post.images[0]);
            break;
        case AttachmentType.Video: {
            const { video } = post;
            embed.addFields({
                name: "Video",
                value: `${video.title}\n[Click here](https://youtube.com/watch?v=${video.id})`,
            });
            embed.setImage(video.thumbnail);
            break;
        }
        case AttachmentType.Playlist: {
            const { playlist } = post;
            embedContent += `\n\nPlaylist: ${playlist.title} [link](https://youtube.com/playlist?list=${playlist.id})`;
            embed.setImage(playlist.thumbail);
            break;
        }
        case AttachmentType.Poll:
        case AttachmentType.Quiz:
            embedContent += "\n\u200b\n\u200b";
            embed.addFields({
                name: "Poll",
                value: post.choices.map((choice) => `\u2022 \u200b ${choice.text}`).join("\n"),
            });
            break;
    }

    if (embedContent && embedContent.length > 0) embed.setDescription(embedContent);

    return embed;
}

export class YouTubeCommunityPostPreview {
    name = "youtube-community-posts";

    constructor(client) {
        this.generators = [new CommunityPostPreviewGenerator(client)];
    }

    /**
     * @returns { string[] }
     */
    match(content) {
        return [...content.matchAll(postIdRegex)].map((match) => (typeof match == "string" ? match : match[0]));
    }
    getImage(id, imageNo) {
        return this.generators[0].getImage(id, imageNo);
    }
}
