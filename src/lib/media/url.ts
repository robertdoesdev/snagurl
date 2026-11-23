export const MAX_URL_LENGTH = 2048;

export type UrlErrorCode =
  | "empty"
  | "too_long"
  | "invalid"
  | "protocol"
  | "credentials"
  | "port";

export type ParsedUrl =
  | { ok: true; url: URL }
  | { ok: false; code: UrlErrorCode; message: string };

const hasScheme = /^[a-z][a-z0-9+.-]*:/i;
const looksLikeHost = /^[^\s/:@]+\.[^\s/:@]{2,}([/:?#]|$)/;

function fail(code: UrlErrorCode, message: string): ParsedUrl {
  return { ok: false, code, message };
}

export function parseMediaUrl(input: string): ParsedUrl {
  const value = input.trim();

  if (value.length === 0) {
    return fail("empty", "Paste a link to get started.");
  }
  if (value.length > MAX_URL_LENGTH) {
    return fail("too_long", "That link is too long to be a valid media URL.");
  }
  if (/\s/.test(value)) {
    return fail("invalid", "Links can’t contain spaces. Check what you pasted.");
  }

  const candidate =
    !hasScheme.test(value) && looksLikeHost.test(value)
      ? `https://${value}`
      : value;

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return fail("invalid", "That doesn’t look like a link. Paste the full address, starting with https://.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return fail("protocol", "Only http and https links are supported.");
  }
  if (url.username !== "" || url.password !== "") {
    return fail("credentials", "Links with a username or password aren’t supported.");
  }
  if (url.port !== "") {
    return fail("port", "Links with a custom port aren’t supported.");
  }
  if (url.hostname === "") {
    return fail("invalid", "That link has no website address.");
  }

  return { ok: true, url };
}
