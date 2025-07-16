const { ScrapingClient } = require("@sireatsalot/youtube.js");
const { YouTubeCommentPreview } = require("./comments");
const { YouTubeCommunityPostPreview } = require("./community-posts");

const client = new ScrapingClient();

module.exports = {
    YouTubeCommunityPostPreview: new YouTubeCommunityPostPreview(client),
    YouTubeCommentPreview: new YouTubeCommentPreview(client)
}