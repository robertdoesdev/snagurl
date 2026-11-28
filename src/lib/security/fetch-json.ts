import { MediaError } from "../media/errors";
import { safeFetch } from "./safe-fetch";

const DEFAULT_MAX_BYTES = 256 * 1024;

export interface JsonResult {
  status: number;
  body: unknown;
}

export async function fetchJson(
  url: URL,
  options: { signal?: AbortSignal; maxBytes?: number } = {},
): Promise<JsonResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  const { response } = await safeFetch(url, { signal: options.signal });

  try {
    const status = response.statusCode ?? 0;
    const chunks: Buffer[] = [];
    let size = 0;

    for await (const chunk of response) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
      size += buffer.length;
      if (size > maxBytes) {
        throw new MediaError(
          "upstream_status",
          "The host sent a much larger response than expected.",
          502,
        );
      }
      chunks.push(buffer);
    }

    try {
      return { status, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) };
    } catch {
      return { status, body: null };
    }
  } finally {
    response.destroy();
  }
}
