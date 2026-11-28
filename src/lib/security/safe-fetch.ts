import dns from "node:dns";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { MediaError } from "../media/errors";
import { limits } from "./config";
import { isPublicAddress, stripBrackets } from "./ip";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

class BlockedAddressError extends Error {
  readonly code = "SNAGURL_BLOCKED";

  constructor(hostname: string) {
    super(`Blocked address for ${hostname}`);
  }
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
) => void;

type Resolver = (
  hostname: string,
  options: dns.LookupOptions,
  callback: (error: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void,
) => void;

const systemResolver: Resolver = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, callback);
};

export function createGuardedLookup(resolve: Resolver) {
  return function guardedLookup(
    hostname: string,
    options: dns.LookupOptions,
    callback: LookupCallback,
  ): void {
    resolve(hostname, options, (error, addresses) => {
      if (error) {
        callback(error, []);
        return;
      }
      if (
        addresses.length === 0 ||
        !addresses.every((entry) => isPublicAddress(entry.address))
      ) {
        callback(new BlockedAddressError(hostname), []);
        return;
      }
      if (options.all) {
        callback(null, addresses);
        return;
      }
      const first = addresses[0];
      if (!first) {
        callback(new BlockedAddressError(hostname), []);
        return;
      }
      callback(null, first.address, first.family);
    });
  };
}

const guardedLookup = createGuardedLookup(systemResolver);

export function assertAllowedTarget(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new MediaError("invalid_url", "Only http and https links are supported.", 400);
  }
  if (url.username !== "" || url.password !== "") {
    throw new MediaError("invalid_url", "Links with credentials aren’t supported.", 400);
  }
  if (url.port !== "") {
    throw new MediaError("invalid_url", "Links with a custom port aren’t supported.", 400);
  }
  const hostname = stripBrackets(url.hostname);
  if (hostname === "") {
    throw new MediaError("invalid_url", "That link has no website address.", 400);
  }
  if (isIP(hostname) !== 0 && !isPublicAddress(hostname)) {
    throw new MediaError(
      "blocked_address",
      "SnagUrl can’t fetch from that address.",
      422,
    );
  }
}

function translateError(error: unknown): MediaError {
  if (error instanceof MediaError) return error;
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  const name = (error as Error | undefined)?.name;
  if (code === "SNAGURL_BLOCKED") {
    return new MediaError(
      "blocked_address",
      "SnagUrl can’t fetch from that address.",
      422,
    );
  }
  if (name === "TimeoutError" || name === "AbortError" || code === "ETIMEDOUT") {
    return new MediaError("timeout", "The host took too long to respond.", 504);
  }
  return new MediaError(
    "unreachable",
    "SnagUrl couldn’t reach that host. Check the link and try again.",
    502,
  );
}

interface RequestOptions {
  headers: Record<string, string>;
  idleTimeoutMs: number;
  totalTimeoutMs: number;
  signal?: AbortSignal;
}

function requestOnce(url: URL, options: RequestOptions): Promise<IncomingMessage> {
  assertAllowedTarget(url);
  const transport = url.protocol === "https:" ? https : http;
  const timeout = AbortSignal.timeout(options.totalTimeoutMs);
  const signal = options.signal
    ? AbortSignal.any([options.signal, timeout])
    : timeout;

  return new Promise((resolve, reject) => {
    const request = transport.request(
      url,
      {
        method: "GET",
        headers: options.headers,
        lookup: guardedLookup,
        agent: false,
        timeout: options.idleTimeoutMs,
        signal,
      },
      resolve,
    );
    request.on("timeout", () => {
      const timeoutError = new Error("timeout");
      timeoutError.name = "TimeoutError";
      request.destroy(timeoutError);
    });
    request.on("error", (error) => reject(translateError(error)));
    request.end();
  });
}

export interface SafeResponse {
  response: IncomingMessage;
  finalUrl: URL;
}

export interface SafeFetchOptions {
  idleTimeoutMs?: number;
  totalTimeoutMs?: number;
  signal?: AbortSignal;
}

export async function safeFetch(
  target: URL,
  options: SafeFetchOptions = {},
): Promise<SafeResponse> {
  let current = target;
  const requestOptions: RequestOptions = {
    headers: {
      "user-agent": "SnagUrl/1.0",
      accept: "*/*",
      "accept-encoding": "identity",
    },
    idleTimeoutMs: options.idleTimeoutMs ?? limits.connectTimeoutMs,
    totalTimeoutMs: options.totalTimeoutMs ?? limits.totalTimeoutMs,
    signal: options.signal,
  };

  for (let hop = 0; hop <= limits.maxRedirects; hop += 1) {
    const response = await requestOnce(current, requestOptions);
    const status = response.statusCode ?? 0;

    if (!REDIRECT_STATUSES.has(status)) {
      return { response, finalUrl: current };
    }

    const location = response.headers.location;
    response.resume();
    if (!location) {
      throw new MediaError(
        "upstream_status",
        "The host sent a redirect without a destination.",
        502,
      );
    }

    try {
      current = new URL(location, current);
    } catch {
      throw new MediaError("upstream_status", "The host sent an invalid redirect.", 502);
    }
  }

  throw new MediaError(
    "too_many_redirects",
    "The link redirected too many times.",
    502,
  );
}
