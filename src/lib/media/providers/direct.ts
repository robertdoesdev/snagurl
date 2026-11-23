import { limits } from "../../security/config";
import { safeFetch } from "../../security/safe-fetch";
import { signTarget } from "../../security/signing";
import { MediaError } from "../errors";
import { deriveFilename } from "../filename";
import { describeMime, normalizeMime } from "../mime";
import type { MediaInfo } from "../types";
import type { MediaProvider } from "./types";

function parseLength(value: string | undefined): number | null {
  if (value === undefined) return null;
  const length = Number(value);
  return Number.isInteger(length) && length >= 0 ? length : null;
}

export function buildDownloadPath(url: string): string {
  const { expires, signature } = signTarget(url);
  const params = new URLSearchParams({
    url,
    exp: String(expires),
    sig: signature,
  });
  return `/api/download?${params.toString()}`;
}

export const directProvider: MediaProvider = {
  id: "direct",

  async resolve(url, { signal }): Promise<MediaInfo> {
    const { response, finalUrl } = await safeFetch(url, { signal });

    try {
      const status = response.statusCode ?? 0;
      if (status < 200 || status >= 300) {
        throw new MediaError(
          "upstream_status",
          `The host answered with status ${status}, so SnagUrl can’t read this file.`,
          502,
        );
      }

      const mime = normalizeMime(response.headers["content-type"]);
      const entry = describeMime(mime);
      if (!entry) {
        const found = mime === "" ? "no content type" : mime;
        throw new MediaError(
          "not_media",
          `This link doesn’t point to a supported media file. The host reported ${found}.`,
          422,
        );
      }

      const bytes = parseLength(response.headers["content-length"]);
      if (bytes !== null && bytes > limits.maxFileBytes) {
        throw new MediaError(
          "too_large",
          "This file is larger than SnagUrl’s download limit.",
          413,
        );
      }

      const title = deriveFilename(
        finalUrl,
        mime,
        response.headers["content-disposition"],
      );

      return {
        source: "direct",
        sourceLabel: "Direct link",
        originUrl: url.href,
        host: url.hostname,
        title,
        author: null,
        kind: entry.kind,
        mime,
        bytes,
        previewUrl: finalUrl.protocol === "https:" ? finalUrl.href : null,
        thumbnailUrl:
          entry.kind === "image" && finalUrl.protocol === "https:" ? finalUrl.href : null,
        downloadable: true,
        notice: null,
        formats: [
          {
            id: "original",
            label: "Original file",
            container: entry.extension.toUpperCase(),
            mime,
            bytes,
            quality: null,
            downloadPath: buildDownloadPath(url.href),
          },
        ],
      };
    } finally {
      response.destroy();
    }
  },
};
