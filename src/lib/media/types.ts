export type SourceId =
  | "direct"
  | "youtube"
  | "tiktok"
  | "instagram"
  | "facebook"
  | "x";

export type Capability = "download" | "preview" | "none";

export type MediaKind = "video" | "audio" | "image";

export interface MediaFormat {
  id: string;
  label: string;
  container: string;
  mime: string;
  bytes: number | null;
  quality: string | null;
  downloadPath: string;
}

export interface MediaInfo {
  source: SourceId;
  sourceLabel: string;
  originUrl: string;
  host: string;
  title: string;
  author: string | null;
  kind: MediaKind;
  mime: string;
  bytes: number | null;
  previewUrl: string | null;
  thumbnailUrl: string | null;
  downloadable: boolean;
  notice: string | null;
  formats: MediaFormat[];
}

export type ApiErrorCode =
  | "invalid_request"
  | "invalid_url"
  | "source_unavailable"
  | "blocked_address"
  | "unreachable"
  | "timeout"
  | "too_many_redirects"
  | "upstream_status"
  | "not_media"
  | "too_large"
  | "rate_limited"
  | "busy"
  | "forbidden"
  | "not_configured"
  | "internal";

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    source?: SourceId;
  };
}

export interface ResolveSuccessBody {
  media: MediaInfo;
}
