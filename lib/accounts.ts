// Connected social accounts (fetched from OpusClip MCP, stored here since
// the REST API does not expose a /post-accounts endpoint)
// Last synced: 2026-11-15
import { SocialAccount } from "./opusclip";

export const SOCIAL_ACCOUNTS: SocialAccount[] = [
  {
    postAccountId: "6af77f086a152f885ced60ea",
    platform: "YOUTUBE",
    name: "Code with Tanny",
    profileUrl: "https://www.youtube.com/channel/UC3Ak_YwWghdzYLiMZ7eOiRA",
  },
  {
    postAccountId: "6af77ee2d4e85d5a2222f29d",
    platform: "YOUTUBE",
    name: "engineerspride _07",
    profileUrl: "https://www.youtube.com/channel/UCu5863Gv0RE0kjMDEc_gyFw",
  },
  {
    postAccountId: "6af9a601d355c54f33f36311",
    platform: "YOUTUBE",
    name: "rody god",
    profileUrl: "https://www.youtube.com/channel/UCtD-uedCPomV6NnZSVNXEvw",
  },
  {
    postAccountId: "6af762758b1c1f1acd377f17",
    platform: "YOUTUBE",
    name: "tanishk gupta",
    profileUrl: "https://www.youtube.com/channel/UCoMMKwBZsIyeqTLcybUw6yg",
  },
  {
    postAccountId: "6af766b36a152f885ced4bfe",
    platform: "INSTAGRAM_BUSINESS",
    name: "Mahika🦋",
    profileUrl: "https://www.instagram.com/kyayaarmahiii",
    subAccountId: "17841409609334239",
  },
];

export const PLATFORM_ICONS: Record<string, string> = {
  YOUTUBE: "▶",
  INSTAGRAM_BUSINESS: "📸",
  TIKTOK: "🎵",
  LINKEDIN: "💼",
  FACEBOOK: "📘",
  TWITTER: "𝕏",
};
