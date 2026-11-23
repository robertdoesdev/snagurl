"use client";

import Image from "next/image";
import { useState } from "react";
import { formatBytes, formatDuration } from "@/lib/media/format";
import { describeMime } from "@/lib/media/mime";
import type { MediaFormat, MediaInfo } from "@/lib/media/types";
import { DownloadIcon } from "./icons";

interface ResultCardProps {
  media: MediaInfo;
  onDownloadStarted: (media: MediaInfo) => void;
  onReset: () => void;
}

const optionClass =
  "flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-line-strong px-4 py-3 text-sm transition-colors peer-checked:border-tape peer-checked:bg-tape/10 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--focus)] hover:border-ink";

const primaryAction =
  "flex h-14 w-full items-center justify-center gap-2.5 rounded-xl bg-tape text-base font-semibold text-tape-ink transition-[filter] hover:brightness-110";

function unique<T>(values: readonly T[]): T[] {
  return [...new Set(values)];
}

function formatLabel(format: MediaFormat): string {
  return format.bytes === null
    ? `${format.label}, ${format.container}`
    : `${format.label}, ${format.container}, ${formatBytes(format.bytes)}`;
}

function PreviewMessage({ children }: { children: string }) {
  return <p className="max-w-[32ch] px-4 text-center text-sm text-muted">{children}</p>;
}

function Preview({
  media,
  onDuration,
}: {
  media: MediaInfo;
  onDuration: (seconds: number) => void;
}) {
  const [failed, setFailed] = useState(false);
  const url = media.previewUrl ?? media.thumbnailUrl;

  if (url === null) {
    return (
      <PreviewMessage>
        {media.downloadable
          ? "A preview isn’t available because this file isn’t served over HTTPS. You can still download it."
          : "This source doesn’t provide a preview image."}
      </PreviewMessage>
    );
  }
  if (failed) {
    return (
      <PreviewMessage>
        {media.downloadable
          ? "The preview couldn’t load, but the file can still be downloaded."
          : "The preview image couldn’t load."}
      </PreviewMessage>
    );
  }

  if (media.previewUrl !== null && media.kind === "video") {
    return (
      <video
        src={url}
        controls
        preload="metadata"
        playsInline
        onLoadedMetadata={(event) => onDuration(event.currentTarget.duration)}
        onError={() => setFailed(true)}
        className="size-full bg-black object-contain"
      />
    );
  }
  if (media.previewUrl !== null && media.kind === "audio") {
    return (
      <audio
        src={url}
        controls
        preload="metadata"
        onLoadedMetadata={(event) => onDuration(event.currentTarget.duration)}
        onError={() => setFailed(true)}
        className="w-[min(100%,26rem)] px-4"
      />
    );
  }
  return (
    <div className="relative size-full min-h-56">
      <Image
        src={url}
        alt={media.title}
        fill
        unoptimized
        sizes="(min-width: 1024px) 560px, 100vw"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="object-contain"
      />
    </div>
  );
}

function DownloadPanel({
  media,
  durationText,
  onDownloadStarted,
  onReset,
}: {
  media: MediaInfo;
  durationText: string;
  onDownloadStarted: (media: MediaInfo) => void;
  onReset: () => void;
}) {
  const [formatId, setFormatId] = useState(media.formats[0]?.id ?? "");
  const [started, setStarted] = useState(false);

  const selected = media.formats.find((format) => format.id === formatId) ?? media.formats[0];
  if (!selected) return null;

  const qualities = unique(
    media.formats.flatMap((format) => (format.quality === null ? [] : [format.quality])),
  );
  const visibleFormats =
    selected.quality === null
      ? media.formats
      : media.formats.filter((format) => format.quality === selected.quality);
  const typeLabel = describeMime(media.mime)?.label ?? media.mime;

  function chooseQuality(quality: string) {
    const sameContainer = media.formats.find(
      (format) => format.quality === quality && format.container === selected?.container,
    );
    const fallback = media.formats.find((format) => format.quality === quality);
    const next = sameContainer ?? fallback;
    if (next) setFormatId(next.id);
    setStarted(false);
  }

  return (
    <>
      <dl className="text-sm">
        <div className="flex justify-between gap-6 border-t border-line py-2.5">
          <dt className="text-muted">Type</dt>
          <dd>{typeLabel}</dd>
        </div>
        <div className="flex justify-between gap-6 border-t border-line py-2.5">
          <dt className="text-muted">Size</dt>
          <dd>{media.bytes === null ? "Not reported by the host" : formatBytes(media.bytes)}</dd>
        </div>
        {durationText !== "" && (
          <div className="flex justify-between gap-6 border-t border-line py-2.5">
            <dt className="text-muted">Duration</dt>
            <dd>{durationText}</dd>
          </div>
        )}
        {qualities.length === 0 && (
          <div className="flex justify-between gap-6 border-y border-line py-2.5">
            <dt className="text-muted">Quality</dt>
            <dd>Original, as served by the host</dd>
          </div>
        )}
      </dl>

      {qualities.length > 1 && (
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">Quality</legend>
          {qualities.map((quality) => (
            <label key={quality} className="block">
              <input
                type="radio"
                name="quality"
                value={quality}
                checked={selected.quality === quality}
                onChange={() => chooseQuality(quality)}
                className="peer sr-only"
              />
              <span className={optionClass}>{quality}</span>
            </label>
          ))}
        </fieldset>
      )}

      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Format</legend>
        {visibleFormats.map((format) => (
          <label key={format.id} className="block">
            <input
              type="radio"
              name="format"
              value={format.id}
              checked={selected.id === format.id}
              onChange={() => {
                setFormatId(format.id);
                setStarted(false);
              }}
              className="peer sr-only"
            />
            <span className={optionClass}>{formatLabel(format)}</span>
          </label>
        ))}
      </fieldset>

      <div className="mt-auto space-y-3">
        <a
          href={selected.downloadPath}
          download
          onClick={() => {
            setStarted(true);
            onDownloadStarted(media);
          }}
          className={primaryAction}
        >
          <DownloadIcon />
          {selected.bytes === null
            ? `Download ${selected.container}`
            : `Download ${selected.container} (${formatBytes(selected.bytes)})`}
        </a>
        <div className="flex min-h-6 items-center justify-between gap-4 text-sm">
          <p role="status" className="text-muted">
            {started ? "Download started. Your browser will show its progress." : ""}
          </p>
          <button
            type="button"
            onClick={onReset}
            className="shrink-0 text-muted underline underline-offset-4 transition-colors hover:text-ink"
          >
            Check another link
          </button>
        </div>
      </div>
    </>
  );
}

function PreviewOnlyPanel({ media, onReset }: { media: MediaInfo; onReset: () => void }) {
  return (
    <>
      <p className="rounded-xl bg-sunken px-4 py-3 text-[15px] leading-relaxed text-muted">
        {media.notice ?? `Downloads from ${media.sourceLabel} aren’t offered.`}
      </p>
      <div className="mt-auto space-y-3">
        <a
          href={media.originUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={primaryAction}
        >
          Open on {media.sourceLabel}
        </a>
        <div className="flex justify-end text-sm">
          <button
            type="button"
            onClick={onReset}
            className="text-muted underline underline-offset-4 transition-colors hover:text-ink"
          >
            Check another link
          </button>
        </div>
      </div>
    </>
  );
}

export function ResultCard({ media, onDownloadStarted, onReset }: ResultCardProps) {
  const [duration, setDuration] = useState<number | null>(null);
  const durationText = duration === null ? "" : formatDuration(duration);

  return (
    <section
      aria-label="Media details"
      className="animate-reveal mt-10 grid overflow-hidden rounded-2xl border border-line bg-raised lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
    >
      <div className="grid min-h-56 place-items-center border-b border-line bg-sunken lg:aspect-auto lg:border-b-0 lg:border-r">
        <div className="grid aspect-video w-full place-items-center lg:h-full lg:aspect-auto">
          <Preview media={media} onDuration={setDuration} />
        </div>
      </div>

      <div className="flex flex-col gap-6 p-6 sm:p-8">
        <div className="space-y-2">
          <p className="text-sm text-muted">
            {media.downloadable
              ? `${media.sourceLabel} from ${media.host}`
              : `${media.sourceLabel}, preview only`}
          </p>
          <h2 className="break-words font-display text-2xl font-semibold leading-tight tracking-tight">
            {media.title}
          </h2>
          {media.author !== null && <p className="text-[15px] text-muted">By {media.author}</p>}
        </div>

        {media.downloadable ? (
          <DownloadPanel
            media={media}
            durationText={durationText}
            onDownloadStarted={onDownloadStarted}
            onReset={onReset}
          />
        ) : (
          <PreviewOnlyPanel media={media} onReset={onReset} />
        )}
      </div>
    </section>
  );
}
