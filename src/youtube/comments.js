import { EmbedBuilder } from "@discordjs/builders";
import { YouTubeClient } from "@sireatsalot/youtube.js";
import { AttachmentBuilder } from "discord.js";
import process from "node:process";

// yes this is excessive.
const REGEX =
    /https:\/\/(www\.)?youtube\.com\/(post|shorts)\/[^ ]+?lc=[A-Za-z0-9-_]+|https:\/\/(www\.)?youtube\.com\/watch\?v=[A-Za-z0-9-_]+&lc=[A-Za-z0-9-_]+/g;

class YouTubeVideoCommentsPreviewGenerator {
    name = "youtube-video-comments";
    /**
     * @type {ScrapingClient} client
     */
    scrapingClient;

    /**
     *
     * @param {APIClient} client
     */

    constructor(client) {
        this.scrapingClient = client;
        this.apiClient = new YouTubeClient({ key: process.env.YOUTUBE_API_KEY });
    }

    async generate(match) {
        if (!match.includes("watch")) return null;

        const comments = await this.apiClient.comments.list({
            part: ["snippet", "id"],
            id: match.split("lc=")[1],
        });

        if (comments.isErr()) {
            throw comments.error;
        }

        const comment = comments.value[0];

        if (!comment) return null;

        const message = apiCommentToPayload(comment);

        return { message };
    }
}

function apiCommentToPayload(comment) {
    const { snippet } = comment;
    let embed = new EmbedBuilder()
        .setAuthor({
            name: `Comment by ${snippet.authorDisplayName}`,
            iconURL: snippet.authorProfileImageUrl,
            url: `https://www.youtube.com/channel/${snippet.authorChannelId.value}`,
        })
        .setColor(0xff0000)
        .setFooter({
            text: "ID: " + comment.id,
            iconURL: "https://www.youtube.com/img/favicon_144.png",
        });

    if (snippet.textOriginal?.lengh > 0) {
        embed = embed.setDescription(snippet.textOriginal);
    }

    const payload = {};

    if (snippet.imageUrl) {
        payload.files = [new AttachmentBuilder(snippet.imageUrl).setName("attachment.webp")];
        embed = embed.setImage(`attachment://attachment.webp`);
    }

    payload.embeds = [embed];

    return payload;
}

class YouTubeShortsCommentsPreviewGenerator {
    name = "youtube-shorts-comments";
    /**
     * @type {ScrapingClient} client
     */
    client;

    constructor(client) {
        this.client = client;
    }

    async generate(match) {
        if (!match.includes("shorts")) return null;

        const url = new URL(match);

        const videoId = url.pathname.split("/").pop();
        const commentId = url.searchParams.get("lc");

        if (!videoId || !commentId) return null;

        const result = await this.client.short(videoId, commentId).fetchComments();

        const comments = result._unsafeUnwrap();

        const comment = await comments.fetchHighlightedComment();

        if (!comment) return null;

        const message = scrapedCommentToPayload(comment);

        return { message }
    }
}

class YouTubePostCommentsPreviewGenerator {
    name = "youtube-post-comments";
    /**
     * @type {ScrapingClient} client
     */
    client;

    constructor(client) {
        this.client = client;
    }

    async generate(match) {
        if (!match.includes("post")) return null;

        const url = new URL(match);

        const postId = url.pathname.split("/").pop();
        const commentId = url.searchParams.get("lc");

        if (!postId || !commentId) return null;

        const result = await this.client.post(postId, commentId).fetchComments();

        const comments = result._unsafeUnwrap();

        const comment = await comments.fetchHighlightedComment();

        if (!comment) return null;

        const message = scrapedCommentToPayload(comment);

        { message }
    }
}

function scrapedCommentToPayload(comment) {
    const embed = new EmbedBuilder()
        .setAuthor({
            name: `Comment by ${comment.author.name}`,
            iconURL: comment.author.avatar,
            url: `https://www.youtube.com/channel/${comment.author.id}`,
        })
        .setColor(0xff0000)
        .setFooter({
            text: "ID: " + comment.id,
            iconURL: "https://www.youtube.com/img/favicon_144.png",
        });

    if (comment.content?.length > 0) {
        embed.setDescription(comment.content)
    }

    const payload = {};

    if (comment.attachment) {
        payload.files = [new AttachmentBuilder(comment.attachment)
            .setName("attachment.webp")
        ];

        embed.setImage("attachment://attachment.webp");
    }

    payload.embeds = [embed];

    return payload;
}

export class YouTubeCommentPreview {
    name = "youtube-comments";
    client;

    constructor(client) {
        this.client = client;
        this.generators = [
            new YouTubeVideoCommentsPreviewGenerator(client),
            new YouTubeShortsCommentsPreviewGenerator(client),
            new YouTubePostCommentsPreviewGenerator(client),
        ];
    }

    match(content) {
        const matches = [...content.matchAll(REGEX)].map((m) => (typeof m === "string" ? m : m[0]));
        return matches;
    }

    async init() {
        await this.client.init();
    }
}
