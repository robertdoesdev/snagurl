import type { SourceId } from "../types";
import { directProvider } from "./direct";
import { createOembedProvider } from "./oembed";
import type { MediaProvider } from "./types";

const registered: readonly MediaProvider[] = [
  directProvider,
  createOembedProvider({
    id: "youtube",
    endpoint: "https://www.youtube.com/oembed",
    fallbackTitle: () => "YouTube video",
  }),
  createOembedProvider({
    id: "tiktok",
    endpoint: "https://www.tiktok.com/oembed",
    fallbackTitle: (author) => (author ? `TikTok video by ${author}` : "TikTok video"),
  }),
  createOembedProvider({
    id: "x",
    endpoint: "https://publish.x.com/oembed",
    fallbackTitle: (author) => (author ? `Post by ${author}` : "Post on X"),
  }),
];

export const providers: ReadonlyMap<SourceId, MediaProvider> = new Map(
  registered.map((provider) => [provider.id, provider]),
);
