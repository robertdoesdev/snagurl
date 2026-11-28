import type { Capability, MediaInfo, SourceId } from "../types";

export interface ResolveContext {
  signal?: AbortSignal;
}

export type UrlCheck =
  | { ok: true; reference: string }
  | { ok: false; message: string };

export interface ProviderAvailability {
  state: "active" | "restricted";
  capability: Capability;
  reason: string | null;
}

export type ProviderMedia = Omit<MediaInfo, "conversions">;

export interface MediaProvider {
  id: SourceId;
  validate(url: URL): UrlCheck;
  availability(): ProviderAvailability;
  resolve(url: URL, context: ResolveContext): Promise<ProviderMedia>;
}
