import type { Capability, SourceId } from "./types";

export interface SourceDefinition {
  id: SourceId;
  label: string;
  hosts: readonly string[];
  capability: Capability;
  summary: string;
  notice?: string;
  unavailableReason?: string;
}

export function isSupported(source: SourceDefinition): boolean {
  return source.capability !== "none";
}

export function capabilityLabel(capability: Capability): string {
  if (capability === "download") return "Download";
  if (capability === "preview") return "Preview only";
  return "Not available";
}

export const sources: readonly SourceDefinition[] = [
  {
    id: "direct",
    label: "Direct links",
    hosts: [],
    capability: "download",
    summary:
      "Links that point straight to a video, audio or image file, such as an MP4, WebM, MP3, JPEG or PNG.",
  },
  {
    id: "youtube",
    label: "YouTube",
    hosts: ["youtube.com", "youtu.be", "youtube-nocookie.com"],
    capability: "preview",
    summary:
      "Shows the title, channel and thumbnail. YouTube doesn’t permit downloading its videos without written approval.",
    notice:
      "Downloads from YouTube aren’t offered. YouTube’s developer policies don’t allow downloading or storing its videos without written approval.",
  },
  {
    id: "tiktok",
    label: "TikTok",
    hosts: ["tiktok.com"],
    capability: "preview",
    summary:
      "Shows what TikTok’s public embed service returns. That service provides previews only, not downloadable files.",
    notice:
      "Downloads from TikTok aren’t offered. TikTok’s public embed service provides previews, not files.",
  },
  {
    id: "x",
    label: "X",
    hosts: ["x.com", "twitter.com", "t.co"],
    capability: "preview",
    summary:
      "Confirms the post exists and shows its author. X’s public embed service provides previews only, not files.",
    notice:
      "Downloads from X aren’t offered. X’s public embed service provides previews, not files.",
  },
  {
    id: "instagram",
    label: "Instagram",
    hosts: ["instagram.com", "instagr.am"],
    capability: "none",
    summary:
      "Meta’s public embed service returns only embed code, with no title, thumbnail or media file.",
    unavailableReason:
      "Instagram isn’t available. Meta’s public embed service returns only embed code, and it provides no permitted way to download the media.",
  },
  {
    id: "facebook",
    label: "Facebook",
    hosts: ["facebook.com", "fb.watch", "fb.com"],
    capability: "none",
    summary:
      "Meta’s public embed service returns only embed code, with no title, thumbnail or media file.",
    unavailableReason:
      "Facebook isn’t available. Meta’s public embed service returns only embed code, and it provides no permitted way to download the media.",
  },
  {
    id: "pinterest",
    label: "Pinterest",
    hosts: ["pinterest.com", "pin.it", "pinterest.co.uk", "pinterest.ca", "pinterest.de", "pinterest.fr", "pinterest.es", "pinterest.it", "pinterest.com.au"],
    capability: "none",
    summary:
      "Pinterest only provides pin data through an approved, sign-in based API. There is no permitted way to fetch a pin from a link alone.",
    unavailableReason:
      "Pinterest isn’t available. Pinterest provides pin data through an API that needs an approved app and the account owner’s sign-in, and SnagUrl has no permitted way to fetch a pin’s media from a link alone.",
  },
];

const directSource = sources[0] as SourceDefinition;

export function getSource(id: SourceId): SourceDefinition {
  return sources.find((source) => source.id === id) ?? directSource;
}

function hostMatches(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith(`.${domain}`);
}

export function detectSource(url: URL): SourceDefinition {
  const hostname = url.hostname.toLowerCase();
  const match = sources.find((source) =>
    source.hosts.some((domain) => hostMatches(hostname, domain)),
  );
  return match ?? directSource;
}
