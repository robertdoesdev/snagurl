import type { SourceId } from "../types";
import { directProvider } from "./direct";
import { createOembedProvider } from "./oembed";
import { createRestrictedProvider } from "./restricted";
import type { MediaProvider, ProviderAvailability } from "./types";
import {
  validateFacebook,
  validateInstagram,
  validatePinterest,
  validateTiktok,
  validateX,
  validateYoutube,
} from "./validators";

const registered: readonly MediaProvider[] = [
  directProvider,
  createOembedProvider({
    id: "youtube",
    endpoint: "https://www.youtube.com/oembed",
    fallbackTitle: () => "YouTube video",
    validate: validateYoutube,
  }),
  createOembedProvider({
    id: "tiktok",
    endpoint: "https://www.tiktok.com/oembed",
    fallbackTitle: (author) => (author ? `TikTok video by ${author}` : "TikTok video"),
    validate: validateTiktok,
  }),
  createOembedProvider({
    id: "x",
    endpoint: "https://publish.x.com/oembed",
    fallbackTitle: (author) => (author ? `Post by ${author}` : "Post on X"),
    validate: validateX,
  }),
  createRestrictedProvider("instagram", validateInstagram),
  createRestrictedProvider("facebook", validateFacebook),
  createRestrictedProvider("pinterest", validatePinterest),
];

export const providers: ReadonlyMap<SourceId, MediaProvider> = new Map(
  registered.map((provider) => [provider.id, provider]),
);

export interface ProviderStatus extends ProviderAvailability {
  id: SourceId;
}

export function describeProviders(): ProviderStatus[] {
  return registered.map((provider) => ({ id: provider.id, ...provider.availability() }));
}
