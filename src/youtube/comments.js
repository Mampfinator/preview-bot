import { EmbedBuilder } from "@discordjs/builders";
import { YouTubeClient } from "@sireatsalot/youtube.js";
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
        return {
            message: {
                embeds: [apiCommentToEmbed(comment)],
            },
        };
    }
}

function apiCommentToEmbed(comment) {
    const { snippet } = comment;
    return new EmbedBuilder()
        .setDescription(snippet.textOriginal)
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

        return {
            message: {
                embeds: [commentToEmbed(comment)],
            },
        };
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

        return {
            message: {
                embeds: [commentToEmbed(comment)],
            },
        };
    }
}

function commentToEmbed(comment) {
    return new EmbedBuilder()
        .setAuthor({
            name: `Comment by ${comment.author.name}`,
            iconURL: comment.author.avatar,
            url: `https://www.youtube.com/channel/${comment.author.id}`,
        })
        .setDescription(comment.content)
        .setColor(0xff0000)
        .setFooter({
            text: "ID: " + comment.id,
            iconURL: "https://www.youtube.com/img/favicon_144.png",
        });
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
