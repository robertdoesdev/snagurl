import dns from "node:dns";
import { createWriteStream } from "node:fs";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { JobError } from "./errors.ts";
import { isPublicAddress, stripBrackets } from "./ip.ts";

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const MAX_REDIRECTS = 3;

class BlockedAddressError extends Error {
  readonly code = "SNAGURL_BLOCKED";
}

type Resolver = (
  hostname: string,
  options: dns.LookupOptions,
  callback: (error: NodeJS.ErrnoException | null, addresses: dns.LookupAddress[]) => void,
) => void;

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | dns.LookupAddress[],
  family?: number,
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
      if (addresses.length === 0 || !addresses.every((entry) => isPublicAddress(entry.address))) {
        callback(new BlockedAddressError(`Blocked address for ${hostname}`), []);
        return;
      }
      if (options.all) {
        callback(null, addresses);
        return;
      }
      const first = addresses[0];
      if (!first) {
        callback(new BlockedAddressError(`Blocked address for ${hostname}`), []);
        return;
      }
      callback(null, first.address, first.family);
    });
  };
}

const guardedLookup = createGuardedLookup(systemResolver);

const blocked = () =>
  new JobError("blocked_address", "The worker can’t fetch from that address.");

export function assertAllowedSource(url: URL): void {
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new JobError("invalid_source", "Only http and https sources are supported.");
  }
  if (url.username !== "" || url.password !== "" || url.port !== "") {
    throw new JobError("invalid_source", "That source address isn’t supported.");
  }
  const hostname = stripBrackets(url.hostname);
  if (hostname === "") throw new JobError("invalid_source", "That source has no host.");
  if (isIP(hostname) !== 0 && !isPublicAddress(hostname)) throw blocked();
}

function translate(error: unknown): JobError {
  if (error instanceof JobError) return error;
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  const name = (error as Error | undefined)?.name;
  if (code === "SNAGURL_BLOCKED") return blocked();
  if (name === "TimeoutError" || code === "ETIMEDOUT") {
    return new JobError("timeout", "The source took too long to respond.", true);
  }
  if (name === "AbortError") return new JobError("cancelled", "The job was stopped.");
  return new JobError("unreachable", "The worker couldn’t reach the source.", true);
}

function requestOnce(url: URL, idleMs: number, signal: AbortSignal): Promise<IncomingMessage> {
  assertAllowedSource(url);
  const transport = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = transport.request(
      url,
      {
        method: "GET",
        headers: { "user-agent": "SnagUrl-Worker/2.0", accept: "*/*", "accept-encoding": "identity" },
        lookup: guardedLookup,
        agent: false,
        timeout: idleMs,
        signal,
      },
      resolve,
    );
    request.on("timeout", () => {
      const error = new Error("timeout");
      error.name = "TimeoutError";
      request.destroy(error);
    });
    request.on("error", (error) => reject(translate(error)));
    request.end();
  });
}

export interface FetchOptions {
  signal: AbortSignal;
  maxBytes: number;
  idleTimeoutMs: number;
}

export type SourceFetcher = (url: URL, destination: string, options: FetchOptions) => Promise<number>;

export const fetchToFile: SourceFetcher = async (target, destination, options) => {
  let current = target;
  let response: IncomingMessage | null = null;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const candidate = await requestOnce(current, options.idleTimeoutMs, options.signal);
    const status = candidate.statusCode ?? 0;
    if (!REDIRECT_STATUSES.has(status)) {
      response = candidate;
      break;
    }
    const location = candidate.headers.location;
    candidate.resume();
    if (!location) throw new JobError("upstream_status", "The source sent a bad redirect.");
    try {
      current = new URL(location, current);
    } catch {
      throw new JobError("upstream_status", "The source sent a bad redirect.");
    }
  }
  if (!response) throw new JobError("upstream_status", "The source redirected too many times.");

  const status = response.statusCode ?? 0;
  if (status < 200 || status >= 300) {
    response.destroy();
    const retryable = status >= 500 || status === 429;
    throw new JobError("upstream_status", `The source answered with status ${status}.`, retryable);
  }

  const declared = Number(response.headers["content-length"]);
  if (Number.isFinite(declared) && declared > options.maxBytes) {
    response.destroy();
    throw new JobError("too_large", "The source file is larger than the worker allows.");
  }

  let received = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      received += chunk.length;
      if (received > options.maxBytes) {
        callback(new JobError("too_large", "The source file is larger than the worker allows."));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(response, limiter, createWriteStream(destination, { flags: "wx", mode: 0o600 }), {
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof JobError) throw error;
    if (options.signal.aborted) throw new JobError("cancelled", "The job was stopped.");
    throw new JobError("unreachable", "The download from the source was interrupted.", true);
  }
  return received;
};
