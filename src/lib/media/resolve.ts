import { MediaError } from "./errors";
import { providers } from "./providers";
import { detectSource, isSupported } from "./sources";
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

  if (!isSupported(source) || !provider) {
    throw new MediaError(
      "source_unavailable",
      source.unavailableReason ?? `${source.label} isn’t available in this release.`,
      422,
      { source: source.id },
    );
  }

  return provider.resolve(parsed.url, { signal });
}
