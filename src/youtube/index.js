import { ScrapingClient } from "@sireatsalot/youtube.js";
import { YouTubeCommentPreview } from "./comments.js";
import { YouTubeCommunityPostPreview } from "./community-posts.js";

const client = new ScrapingClient();

export const youTubeCommunityPostPreview = new YouTubeCommunityPostPreview(client);
export const youTubeCommentPreview = new YouTubeCommentPreview(client);
