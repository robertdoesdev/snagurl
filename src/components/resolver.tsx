"use client";

import { useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { addHistoryEntry } from "@/lib/history";
import { detectSource, isSupported, type SourceDefinition } from "@/lib/media/sources";
import type {
  ApiErrorBody,
  ApiErrorCode,
  MediaInfo,
  ResolveSuccessBody,
} from "@/lib/media/types";
import { parseMediaUrl } from "@/lib/media/url";
import { HistoryList } from "./history-list";
import { ProcessingPanel } from "./processing-panel";
import { ResultCard } from "./result-card";
import { StatusPanel } from "./status-panel";
import { UrlForm } from "./url-form";

type View =
  | { kind: "idle" }
  | { kind: "resolving"; source: SourceDefinition; host: string }
  | { kind: "ready"; media: MediaInfo }
  | { kind: "failed"; title: string; message: string; retryable: boolean };

const failureTitles: Partial<Record<ApiErrorCode, string>> = {
  source_unavailable: "This source isn’t available yet",
  not_media: "This isn’t a supported media file",
  too_large: "This file is too large",
  blocked_address: "SnagUrl can’t fetch from that address",
  timeout: "The host took too long to respond",
  unreachable: "SnagUrl couldn’t reach the host",
  upstream_status: "The source didn’t return details",
  too_many_redirects: "The link redirects too many times",
  rate_limited: "Too many requests",
  busy: "SnagUrl is busy",
  invalid_url: "That link can’t be used",
};

const retryableCodes: ReadonlySet<ApiErrorCode> = new Set([
  "timeout",
  "unreachable",
  "rate_limited",
  "busy",
  "internal",
]);

function isErrorBody(body: unknown): body is ApiErrorBody {
  return typeof body === "object" && body !== null && "error" in body;
}

function isSuccessBody(body: unknown): body is ResolveSuccessBody {
  return typeof body === "object" && body !== null && "media" in body;
}

export function Resolver() {
  const [value, setValue] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [view, setView] = useState<View>({ kind: "idle" });
  const controller = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const detected = useMemo(() => {
    const parsed = parseMediaUrl(value);
    return parsed.ok ? detectSource(parsed.url) : null;
  }, [value]);

  async function submit() {
    const parsed = parseMediaUrl(value);
    if (!parsed.ok) {
      setFieldError(parsed.message);
      setView({ kind: "idle" });
      return;
    }
    setFieldError(null);

    const source = detectSource(parsed.url);
    if (!isSupported(source)) {
      setView({
        kind: "failed",
        title: `${source.label} isn’t available`,
        message:
          source.unavailableReason ?? `${source.label} isn’t available in this release.`,
        retryable: false,
      });
      return;
    }

    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setView({ kind: "resolving", source, host: parsed.url.hostname });

    try {
      const response = await fetch("/api/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: parsed.url.href }),
        signal: current.signal,
      });
      const body: unknown = await response.json();

      if (response.ok && isSuccessBody(body)) {
        setView({ kind: "ready", media: body.media });
        return;
      }
      if (isErrorBody(body)) {
        setView({
          kind: "failed",
          title: failureTitles[body.error.code] ?? "SnagUrl couldn’t read that link",
          message: body.error.message,
          retryable: retryableCodes.has(body.error.code),
        });
        return;
      }
      throw new Error("Unexpected response");
    } catch (error) {
      if (current.signal.aborted) return;
      setView({
        kind: "failed",
        title: "SnagUrl couldn’t be reached",
        message:
          error instanceof SyntaxError || error instanceof TypeError
            ? "Check your connection and try again."
            : "Something went wrong while checking the link. Try again.",
        retryable: true,
      });
    }
  }

  function cancel() {
    controller.current?.abort();
    flushSync(() => setView({ kind: "idle" }));
    inputRef.current?.focus();
  }

  function reset() {
    controller.current?.abort();
    flushSync(() => {
      setValue("");
      setFieldError(null);
      setView({ kind: "idle" });
    });
    inputRef.current?.focus();
  }

  function pickFromHistory(url: string) {
    flushSync(() => {
      setValue(url);
      setFieldError(null);
      setView({ kind: "idle" });
    });
    inputRef.current?.focus();
  }

  function recordDownload(media: MediaInfo) {
    addHistoryEntry({
      title: media.title,
      url: media.originUrl,
      host: media.host,
      sourceLabel: media.sourceLabel,
      kind: media.kind,
      bytes: media.bytes,
    });
  }

  return (
    <div>
      <UrlForm
        value={value}
        onChange={(next) => {
          setValue(next);
          setFieldError(null);
        }}
        onSubmit={submit}
        busy={view.kind === "resolving"}
        error={fieldError}
        detected={detected}
        inputRef={inputRef}
      />

      {view.kind === "resolving" && (
        <ProcessingPanel source={view.source} host={view.host} onCancel={cancel} />
      )}
      {view.kind === "failed" && (
        <StatusPanel
          title={view.title}
          message={view.message}
          onRetry={view.retryable ? submit : undefined}
          onReset={reset}
        />
      )}
      {view.kind === "ready" && (
        <ResultCard
          key={view.media.originUrl}
          media={view.media}
          onDownloadStarted={recordDownload}
          onReset={reset}
        />
      )}

      <HistoryList onPick={pickFromHistory} />
    </div>
  );
}
