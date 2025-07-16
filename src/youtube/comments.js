const { EmbedBuilder } = require("@discordjs/builders");
const { ScrapingClient } = require("@sireatsalot/youtube.js");

// yes this is excessive.
const REGEX = /https:\/\/(www?\.)youtube\.com\/(watch([^ ]+)?|(post|shorts)\/([^ ]+)?)*&lc=[A-Za-z0-9-_]+/g;

class YouTubeVideoCommentsPreviewGenerator {
    /**
     * @type {ScrapingClient} client
     */
    client;
    
    constructor(client) {
        this.client = client;
    }

    async generate(match) {
        if (!match.includes("watch")) return null;

        const params = new URL(match).searchParams;
        const videoId = params.get("v");
        const commentId = params.get("lc");

        if (!videoId || !commentId) return null;

        const result = await this.client.video(videoId, commentId)
            .fetchComments();

        const comments = result._unsafeUnwrap();

        const comment = await comments.fetchHighlightedComment();

        if (!comment) return null;

        return {
            message: {
                embeds: [
                    new EmbedBuilder()
                        .setAuthor({
                            name: comment.author.name,
                            iconURL: comment.author.avatarUrl,
                            url: `https://www.youtube.com/channel/${comment.author.id}`,
                        })
                        .setDescription(comment.content)
                        .setColor(0xFF0000)
                ]
            }
        };
    }
}

class YouTubeShortsCommentsPreviewGenerator {
    /**
     * @type {ScrapingClient} client
     */
    client;

    constructor(client) {
        this.client = client;
    }

    async generate(match) {
        return null;
    }
}

class YouTubePostCommentsPreviewGenerator {
    /**
     * @type {ScrapingClient} client
     */
    client;

    constructor(client) {
        this.client = client;
    }

    async generate(match) {
        return null;
    }
}


class YouTubeCommentPreview {
    client;
    
    constructor(
        client
    ) {
        this.client = client;
        this.generators = [
            new YouTubeVideoCommentsPreviewGenerator(client),
            new YouTubeShortsCommentsPreviewGenerator(client),
            new YouTubePostCommentsPreviewGenerator(client)
        ]
    }
    
    match(content) {
        const matches = [...content.matchAll(REGEX)].map(m => typeof m === "string" ? m : m[0]);
        return matches;
    }

    async init() {
        await this.client.init();
    }
}

module.exports = {
    YouTubeCommentPreview
}