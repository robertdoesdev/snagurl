import { MediaError } from "./errors";
import { conversionsFor } from "../worker/operations";
import { workerEnabled } from "../worker/config";
import { providers } from "./providers";
import { detectSource } from "./sources";
import { parseMediaUrl } from "./url";
import type { MediaInfo } from "./types";

export async function resolveMedia(
  input: string,
  signal?: AbortSignal,
): Promise<MediaInfo> {
  const parsed = parseMediaUrl(input);
  if (!parsed.ok) {
    throw new MediaError("invalid_url", parsed.message, 400);
  }

  const source = detectSource(parsed.url);
  const provider = providers.get(source.id);

  if (!provider) {
    throw new MediaError(
      "source_unavailable",
      source.unavailableReason ?? `${source.label} isn’t available in this release.`,
      422,
      { source: source.id },
    );
  }

  const availability = provider.availability();
  if (availability.state === "restricted") {
    throw new MediaError(
      "source_unavailable",
      availability.reason ?? `${source.label} isn’t available.`,
      422,
      { source: source.id },
    );
  }

  const check = provider.validate(parsed.url);
  if (!check.ok) {
    throw new MediaError("invalid_url", check.message, 400, { source: source.id });
  }

  const media = await provider.resolve(parsed.url, { signal });
  return { ...media, conversions: workerEnabled() ? conversionsFor(media) : [] };
}
