export type SourceId =
  | "direct"
  | "youtube"
  | "tiktok"
  | "instagram"
  | "facebook"
  | "pinterest"
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

export type ConversionId =
  | "mp3"
  | "m4a"
  | "mp4-720"
  | "mp4-480"
  | "gif"
  | "jpg"
  | "png"
  | "webp";

export interface ConversionOption {
  id: ConversionId;
  label: string;
  container: string;
  mime: string;
  description: string;
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
  conversions: ConversionOption[];
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
  | "not_found"
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

export type JobStatus =
  | "queued"
  | "fetching"
  | "processing"
  | "done"
  | "failed"
  | "cancelled"
  | "expired";

export interface JobDownload {
  url: string;
  filename: string;
  mime: string;
  bytes: number;
}

export interface JobView {
  id: string;
  status: JobStatus;
  progress: number | null;
  operation: ConversionId;
  error: { code: string; message: string } | null;
  download: JobDownload | null;
}

export interface JobResponseBody {
  job: JobView;
}
