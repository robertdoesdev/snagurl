"use client";

import { useEffect, useRef, useState } from "react";
import { formatBytes } from "@/lib/media/format";
import type {
  ApiErrorBody,
  ConversionId,
  ConversionOption,
  JobResponseBody,
  JobView,
  MediaInfo,
} from "@/lib/media/types";
import { DownloadIcon, SpinnerIcon } from "./icons";

const POLL_MS = 1500;
const MAX_POLL_FAILURES = 4;

type State =
  | { phase: "choose" }
  | { phase: "starting"; option: ConversionOption }
  | { phase: "running"; option: ConversionOption; job: JobView }
  | { phase: "done"; option: ConversionOption; job: JobView }
  | { phase: "failed"; option: ConversionOption; message: string };

const optionClass =
  "flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-line-strong px-4 py-3 text-sm transition-colors peer-checked:border-tape peer-checked:bg-tape/10 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)] hover:border-ink";

const secondaryButton =
  "h-11 rounded-xl border border-line-strong px-5 text-sm font-medium text-ink transition-colors hover:border-ink";

function stageText(job: JobView): string {
  if (job.status === "queued") return "Waiting for a free converter";
  if (job.status === "fetching") return "Fetching the source file";
  if (job.progress === null || job.progress === 0) return "Converting";
  return `Converting, ${Math.round(job.progress * 100)}%`;
}

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as ApiErrorBody;
    return body.error.message;
  } catch {
    return "The conversion service didn’t answer. Try again.";
  }
}

export function ConvertPanel({ media }: { media: MediaInfo }) {
  const [optionId, setOptionId] = useState<ConversionId>(media.conversions[0]?.id ?? "mp3");
  const [state, setState] = useState<State>({ phase: "choose" });
  const activeJob = useRef<string | null>(null);
  const loop = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      loop.current?.abort();
      const id = activeJob.current;
      if (id !== null) {
        void fetch(`/api/jobs/${id}`, { method: "DELETE", keepalive: true }).catch(() => undefined);
      }
    },
    [],
  );

  function stopTracking() {
    loop.current?.abort();
    loop.current = null;
  }

  function cancelRemote(id: string) {
    void fetch(`/api/jobs/${id}`, { method: "DELETE", keepalive: true }).catch(() => undefined);
  }

  function pause(ms: number, signal: AbortSignal): Promise<void> {
    return new Promise((resolve) => {
      const handle = setTimeout(resolve, ms);
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(handle);
          resolve();
        },
        { once: true },
      );
    });
  }

  async function track(option: ConversionOption, id: string) {
    stopTracking();
    const controller = new AbortController();
    loop.current = controller;
    let failures = 0;

    while (!controller.signal.aborted) {
      await pause(POLL_MS, controller.signal);
      if (controller.signal.aborted) return;
      try {
        const response = await fetch(`/api/jobs/${id}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error(await readError(response));
        const { job } = (await response.json()) as JobResponseBody;
        failures = 0;

        if (job.status === "done" && job.download) {
          activeJob.current = null;
          setState({ phase: "done", option, job });
          return;
        }
        if (job.status === "failed" || job.status === "expired" || job.status === "cancelled") {
          activeJob.current = null;
          setState({
            phase: "failed",
            option,
            message:
              job.error?.message ??
              (job.status === "expired"
                ? "The converted file expired. Convert it again."
                : "The conversion was stopped."),
          });
          return;
        }
        setState({ phase: "running", option, job });
      } catch (error) {
        if (controller.signal.aborted) return;
        failures += 1;
        if (failures >= MAX_POLL_FAILURES) {
          activeJob.current = null;
          setState({
            phase: "failed",
            option,
            message: error instanceof Error ? error.message : "Lost contact with the conversion service.",
          });
          return;
        }
      }
    }
  }

  async function start() {
    const option = media.conversions.find((entry) => entry.id === optionId);
    if (!option) return;
    stopTracking();
    setState({ phase: "starting", option });
    try {
      const response = await fetch("/api/jobs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url: media.originUrl, operation: option.id }),
      });
      if (!response.ok) {
        setState({ phase: "failed", option, message: await readError(response) });
        return;
      }
      const { job } = (await response.json()) as JobResponseBody;
      activeJob.current = job.id;
      setState({ phase: "running", option, job });
      void track(option, job.id);
    } catch {
      setState({ phase: "failed", option, message: "SnagUrl couldn’t start the conversion. Check your connection and try again." });
    }
  }

  function cancel() {
    stopTracking();
    if (activeJob.current !== null) cancelRemote(activeJob.current);
    activeJob.current = null;
    setState({ phase: "choose" });
  }

  function reset() {
    stopTracking();
    activeJob.current = null;
    setState({ phase: "choose" });
  }

  return (
    <fieldset className="space-y-3 border-t border-line pt-5">
      <legend className="mb-1 text-sm font-medium">Convert</legend>

      {(state.phase === "choose" || state.phase === "starting") && (
        <>
          <div className="space-y-2">
            {media.conversions.map((option) => (
              <label key={option.id} className="block">
                <input
                  type="radio"
                  name="conversion"
                  value={option.id}
                  checked={optionId === option.id}
                  onChange={() => setOptionId(option.id)}
                  className="peer sr-only"
                />
                <span className={optionClass}>
                  <span>{option.label}</span>
                  <span className="text-muted">{option.container}</span>
                </span>
              </label>
            ))}
          </div>
          <p className="text-sm text-muted">
            {media.conversions.find((entry) => entry.id === optionId)?.description}
          </p>
        </>
      )}

      {state.phase === "starting" && (
        <p role="status" className="flex items-center gap-2 text-sm">
          <SpinnerIcon className="size-[18px] text-tape" />
          Starting conversion
        </p>
      )}

      {state.phase === "running" && (
        <div className="space-y-3" role="status">
          <p className="flex items-center gap-2 text-sm">
            <SpinnerIcon className="size-[18px] text-tape" />
            {state.option.label}: {stageText(state.job)}
          </p>
          <div
            role="progressbar"
            aria-label="Conversion progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={state.job.progress === null ? undefined : Math.round(state.job.progress * 100)}
            className="h-1.5 overflow-hidden rounded-full bg-line"
          >
            <div
              className="h-full rounded-full bg-tape transition-[width] duration-500"
              style={{ width: `${Math.max(4, Math.round((state.job.progress ?? 0) * 100))}%` }}
            />
          </div>
        </div>
      )}

      {state.phase === "done" && state.job.download && (
        <div className="space-y-3">
          <a
            href={state.job.download.url}
            download={state.job.download.filename}
            className="flex h-12 w-full items-center justify-center gap-2.5 rounded-xl bg-tape text-base font-semibold text-tape-ink transition-[filter] hover:brightness-110"
          >
            <DownloadIcon />
            Download {state.option.container} ({formatBytes(state.job.download.bytes)})
          </a>
          <p role="status" className="text-sm text-muted">
            Ready. This file is deleted from the converter shortly after.
          </p>
        </div>
      )}

      {state.phase === "failed" && (
        <p role="alert" className="rounded-xl bg-sunken px-4 py-3 text-sm text-muted">
          {state.message}
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        {state.phase === "choose" && (
          <button
            type="button"
            onClick={start}
            className={secondaryButton}
          >
            Convert to {media.conversions.find((entry) => entry.id === optionId)?.container}
          </button>
        )}
        {state.phase === "failed" && (
          <>
            <button type="button" onClick={start} className={secondaryButton}>
              Try again
            </button>
            <button type="button" onClick={reset} className="h-11 px-2 text-sm text-muted underline underline-offset-4 hover:text-ink">
              Pick another
            </button>
          </>
        )}
        {state.phase === "done" && (
          <button type="button" onClick={reset} className="h-11 px-2 text-sm text-muted underline underline-offset-4 hover:text-ink">
            Convert to something else
          </button>
        )}
      </div>
      {state.phase === "running" && (
        <button type="button" onClick={cancel} className={secondaryButton}>
          Cancel
        </button>
      )}
    </fieldset>
  );
}
