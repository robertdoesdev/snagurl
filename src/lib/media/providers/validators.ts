import type { UrlCheck } from "./types";

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
const DIGITS = /^\d{5,25}$/;
const SHORT_CODE = /^[A-Za-z0-9_-]{4,40}$/;

function segments(url: URL): string[] {
  return url.pathname.split("/").filter((part) => part !== "");
}

function hostIs(url: URL, domain: string): boolean {
  const host = url.hostname.toLowerCase();
  return host === domain || host.endsWith(`.${domain}`);
}

function ok(reference: string): UrlCheck {
  return { ok: true, reference };
}

function fail(message: string): UrlCheck {
  return { ok: false, message };
}

export function validateYoutube(url: URL): UrlCheck {
  const message = "This doesn’t look like a link to a specific YouTube video.";
  const parts = segments(url);

  if (hostIs(url, "youtu.be")) {
    const id = parts[0];
    return id !== undefined && YOUTUBE_ID.test(id) ? ok(`video:${id}`) : fail(message);
  }

  const first = parts[0];
  if (first === "watch") {
    const id = url.searchParams.get("v");
    return id !== null && YOUTUBE_ID.test(id) ? ok(`video:${id}`) : fail(message);
  }
  if (first === "shorts" || first === "live" || first === "embed" || first === "v") {
    const id = parts[1];
    return id !== undefined && YOUTUBE_ID.test(id) ? ok(`video:${id}`) : fail(message);
  }
  return fail(message);
}

export function validateTiktok(url: URL): UrlCheck {
  const message = "This doesn’t look like a link to a specific TikTok post.";
  const parts = segments(url);
  const host = url.hostname.toLowerCase();

  if (host === "vm.tiktok.com" || host === "vt.tiktok.com") {
    const code = parts[0];
    return code !== undefined && SHORT_CODE.test(code) ? ok(`short:${code}`) : fail(message);
  }

  const first = parts[0] ?? "";
  if (first.startsWith("@") && first.length > 1 && (parts[1] === "video" || parts[1] === "photo")) {
    const id = parts[2];
    return id !== undefined && DIGITS.test(id) ? ok(`${parts[1]}:${id}`) : fail(message);
  }
  if (first === "t") {
    const code = parts[1];
    return code !== undefined && SHORT_CODE.test(code) ? ok(`short:${code}`) : fail(message);
  }
  if (first === "v") {
    const id = parts[1]?.replace(/\.html$/, "");
    return id !== undefined && DIGITS.test(id) ? ok(`video:${id}`) : fail(message);
  }
  return fail(message);
}

export function validateX(url: URL): UrlCheck {
  const message = "This doesn’t look like a link to a specific post on X.";
  if (hostIs(url, "t.co")) {
    return fail("This is a shortened t.co link. Open it and paste the full post address instead.");
  }
  const parts = segments(url);
  const index = parts.findIndex((part) => part === "status" || part === "statuses");
  if (index < 1) return fail(message);
  const id = parts[index + 1];
  return id !== undefined && DIGITS.test(id) ? ok(`post:${id}`) : fail(message);
}

export function validateInstagram(url: URL): UrlCheck {
  const message = "This doesn’t look like a link to an Instagram post or reel.";
  const parts = segments(url);
  const index = parts.findIndex(
    (part) => part === "p" || part === "reel" || part === "reels" || part === "tv",
  );
  if (index < 0) return fail(message);
  const code = parts[index + 1];
  return code !== undefined && SHORT_CODE.test(code) ? ok(`${parts[index]}:${code}`) : fail(message);
}

export function validateFacebook(url: URL): UrlCheck {
  const message = "This doesn’t look like a link to a specific Facebook post or video.";
  const host = url.hostname.toLowerCase();
  const parts = segments(url);
  if (host === "fb.watch") {
    const code = parts[0];
    return code !== undefined && SHORT_CODE.test(code) ? ok(`short:${code}`) : fail(message);
  }
  if (parts.length === 0) return fail(message);
  const hasContent =
    url.searchParams.has("v") ||
    url.searchParams.has("story_fbid") ||
    parts.some((part) =>
      ["videos", "posts", "reel", "watch", "share", "photo", "photos", "permalink.php"].includes(part),
    );
  return hasContent ? ok(`path:${url.pathname}`) : fail(message);
}

export function validatePinterest(url: URL): UrlCheck {
  const message = "This doesn’t look like a link to a specific pin.";
  const parts = segments(url);
  if (hostIs(url, "pin.it")) {
    const code = parts[0];
    return code !== undefined && SHORT_CODE.test(code) ? ok(`short:${code}`) : fail(message);
  }
  if (parts[0] !== "pin") return fail(message);
  const slug = parts[1] ?? "";
  const id = slug.includes("--") ? (slug.split("--").pop() ?? "") : slug;
  return DIGITS.test(id) ? ok(`pin:${id}`) : fail(message);
}
