import { MediaError } from "../errors";
import { getSource } from "../sources";
import type { SourceId } from "../types";
import type { MediaProvider, UrlCheck } from "./types";

export function createRestrictedProvider(
  id: SourceId,
  validate: (url: URL) => UrlCheck,
): MediaProvider {
  const source = getSource(id);
  const reason = source.unavailableReason ?? `${source.label} isn’t available.`;

  return {
    id,
    validate,
    availability: () => ({ state: "restricted", capability: "none", reason }),
    async resolve(): Promise<never> {
      throw new MediaError("source_unavailable", reason, 422, { source: id });
    },
  };
}
