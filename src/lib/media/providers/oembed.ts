import { fetchJson } from "../../security/fetch-json";
import { MediaError } from "../errors";
import { getSource } from "../sources";
import type { SourceId } from "../types";
import type { MediaProvider, ProviderMedia, UrlCheck } from "./types";

interface OembedConfig {
  id: SourceId;
  endpoint: string;
  fallbackTitle: (author: string | null) => string;
  validate: (url: URL) => UrlCheck;
}

const missingStatuses = new Set([400, 401, 403, 404]);
const MAX_TITLE_LENGTH = 200;

function readText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed === "" ? null : trimmed.slice(0, MAX_TITLE_LENGTH);
}

function readHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" ? url.href : null;
  } catch {
    return null;
  }
}

export function createOembedProvider(config: OembedConfig): MediaProvider {
  const source = getSource(config.id);

  return {
    id: config.id,
    validate: config.validate,
    availability: () => ({ state: "active", capability: "preview", reason: source.notice ?? null }),

    async resolve(url, { signal }): Promise<ProviderMedia> {
      const endpoint = new URL(config.endpoint);
      endpoint.searchParams.set("url", url.href);
      endpoint.searchParams.set("format", "json");

      const { status, body } = await fetchJson(endpoint, { signal });

      if (missingStatuses.has(status)) {
        throw new MediaError(
          "upstream_status",
          `${source.label} has no public post at this link. It may be private, removed, or not a post address.`,
          422,
          { source: config.id },
        );
      }
      if (status < 200 || status >= 300 || typeof body !== "object" || body === null) {
        throw new MediaError(
          "upstream_status",
          `${source.label} didn’t return details for this link. Try again later.`,
          502,
          { source: config.id },
        );
      }

      const fields = body as Record<string, unknown>;
      const author = readText(fields.author_name);
      const title = readText(fields.title) ?? config.fallbackTitle(author);

      return {
        source: config.id,
        sourceLabel: source.label,
        originUrl: url.href,
        host: url.hostname,
        title,
        author,
        kind: "video",
        mime: "",
        bytes: null,
        previewUrl: null,
        thumbnailUrl: readHttpsUrl(fields.thumbnail_url),
        downloadable: false,
        notice: source.notice ?? null,
        formats: [],
      };
    },
  };
}
