const { ScrapingClient, AttachmentType } = require("@sireatsalot/youtube.js");
const { EmbedBuilder } = require("discord.js");
const { unwrap } = require("../util");
const { Cache } = require("../cache");

const postIdRegex =
/(?<=youtube.com\/post\/)Ug[A-z0-9_\-]+|(?<=youtube.com\/channel\/.+\/community\?lb=)Ug[A-z0-9_\-]+/g;

class YouTubeCommunityPostPreview {
    #client = new ScrapingClient();

    #cache = new Cache();

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
                    embeds: [
                        postToEmbed(post, channel)
                    ],
                },
                images: post.images?.length ?? 0,
            }
        } catch (error) {
            console.error(error);
            return null;
        }
    }

    async getImage(id, imageNo) {
        const post = await this.#client.post(id).getPost(true).then(result => result._unsafeUnwrap());
        
        return {
            image: post.images?.[imageNo],
            totalImages: post.images?.length ?? 0,
        }
    }

    async init() {
        await this.#client.init();
    }
}

/**
 * Converts a Community Post into an {@link EmbedBuilder}.
 * @param { import("@sireatsalot/youtube.js").CommunityPost } post
 * @param { import("@sireatsalot/youtube.js").ChannelData } channel
 */
function postToEmbed(post, channel) {
    const { content, attachmentType, id: postId } = post;

    const { avatar, name, id: channelId } = channel;

    const embed = new EmbedBuilder().setAuthor({
        name,
        iconURL: avatar,
        url: `https://www.youtube.com/channel/${channelId}`,
    });

    let embedContent;

    if (content && content.length > 0)
        embedContent = content
            .map(({ text, url }) => `${url ? "[" : ""}${text}${url ? `](${url})` : ""}`)
            .join(" ");

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
        case AttachmentType.Video:
            const { video } = post;
            embed.addFields({
                name: "Video",
                value: `${video.title}\n[Click here](https://youtube.com/watch?v=${video.id})`,
            });
            embed.setImage(video.thumbnail);
            break;
        case AttachmentType.Playlist:
            const { playlist } = post;
            embedContent += `\n\nPlaylist: ${playlist.title} [link](https://youtube.com/playlist?list=${playlist.id})`;
            embed.setImage(playlist.thumbail);
            break;
        case AttachmentType.Poll:
        case AttachmentType.Quiz:
            const { choices } = post;
            embedContent += "\n\u200b\n\u200b";
            embed.addFields({
                name: "Poll",
                value: choices.map(choice => `\u2022 \u200b ${choice.text}`).join("\n"),
            });
            break;
    }
    
    if (embedContent && embedContent.length > 0) embed.setDescription(embedContent);

    return embed;
}

const YouTubePreview = {
    name: "youtube",
    /**
     * @returns { string[] }
     */
    match(content) {
        return [...content.matchAll(postIdRegex)].map(match => typeof match == "string" ? match : match[0]);
    },
    getImage(id, imageNo) {
        return this.generators[0].getImage(id, imageNo);
    },
    generators: [
        new YouTubeCommunityPostPreview(),
    ]
};


module.exports = {
    YouTubePreview,
}