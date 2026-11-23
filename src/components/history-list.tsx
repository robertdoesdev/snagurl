"use client";

import { useSyncExternalStore } from "react";
import {
  clearHistory,
  getHistorySnapshot,
  getServerHistorySnapshot,
  removeHistoryEntry,
  subscribeHistory,
} from "@/lib/history";
import { formatBytes } from "@/lib/media/format";

const dateFormat = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  year: "numeric",
});

export function HistoryList({ onPick }: { onPick: (url: string) => void }) {
  const entries = useSyncExternalStore(
    subscribeHistory,
    getHistorySnapshot,
    getServerHistorySnapshot,
  );

  return (
    <section aria-labelledby="history-heading" className="mt-14">
      <div className="flex items-baseline justify-between gap-4">
        <h2 id="history-heading" className="font-display text-lg font-semibold">
          Recent downloads
        </h2>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={clearHistory}
            className="text-sm text-muted underline underline-offset-4 transition-colors hover:text-ink"
          >
            Delete all
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-muted">
          No downloads yet. Files you download appear here.
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-muted">Saved only in this browser.</p>
          <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-raised">
            {entries.map((entry) => (
              <li key={entry.id} className="flex items-center justify-between gap-4 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px]">{entry.title}</p>
                  <p className="truncate text-sm text-muted">
                    {entry.sourceLabel} from {entry.host}
                    {entry.bytes === null ? "" : `, ${formatBytes(entry.bytes)}`},{" "}
                    {dateFormat.format(entry.at)}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => onPick(entry.url)}
                    className="h-9 rounded-xl border border-line-strong px-3 text-sm transition-colors hover:border-ink"
                  >
                    Use again
                  </button>
                  <button
                    type="button"
                    onClick={() => removeHistoryEntry(entry.id)}
                    aria-label={`Remove ${entry.title} from history`}
                    className="h-9 rounded-xl px-3 text-sm text-muted transition-colors hover:text-ink"
                  >
                    Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
