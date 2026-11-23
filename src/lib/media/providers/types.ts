import type { MediaInfo, SourceId } from "../types";

export interface ResolveContext {
  signal?: AbortSignal;
}

export interface MediaProvider {
  id: SourceId;
  resolve(url: URL, context: ResolveContext): Promise<MediaInfo>;
}
