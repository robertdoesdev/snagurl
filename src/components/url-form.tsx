"use client";

import { useState, type FormEvent, type RefObject } from "react";
import { capabilityLabel, type SourceDefinition } from "@/lib/media/sources";
import { ClipboardIcon } from "./icons";

interface UrlFormProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
  error: string | null;
  detected: SourceDefinition | null;
  inputRef: RefObject<HTMLInputElement | null>;
}

export function UrlForm({
  value,
  onChange,
  onSubmit,
  busy,
  error,
  detected,
  inputRef,
}: UrlFormProps) {
  const [pasteNote, setPasteNote] = useState<string | null>(null);

  async function paste() {
    setPasteNote(null);
    if (!navigator.clipboard?.readText) {
      setPasteNote("This browser can’t read the clipboard. Press Ctrl+V or ⌘V in the field instead.");
      return;
    }
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (text === "") {
        setPasteNote("Your clipboard is empty.");
        return;
      }
      onChange(text);
      inputRef.current?.focus();
    } catch {
      setPasteNote("Clipboard access was blocked. Press Ctrl+V or ⌘V in the field instead.");
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!busy) onSubmit();
  }

  const status = error ?? pasteNote;
  const describedBy = status ? "url-status" : detected ? "url-detected" : "url-hint";

  return (
    <form onSubmit={handleSubmit} noValidate className="w-full">
      <div>
        <div className="flex flex-col rounded-2xl border border-line-strong bg-raised shadow-sm transition-colors focus-within:border-tape sm:flex-row sm:items-center">
          <label htmlFor="media-url" className="sr-only">
            Media link
          </label>
          <input
            ref={inputRef}
            id="media-url"
            name="url"
            type="text"
            inputMode="url"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            value={value}
            onChange={(event) => {
              setPasteNote(null);
              onChange(event.target.value);
            }}
            placeholder="https://example.com/clip.mp4"
            aria-invalid={error ? true : undefined}
            aria-describedby={describedBy}
            disabled={busy}
            className="h-14 min-w-0 flex-1 bg-transparent px-5 text-base text-ink outline-none placeholder:text-muted/60 disabled:opacity-60 sm:h-[68px] sm:text-lg"
          />
          <div className="flex gap-2 p-2">
            <button
              type="button"
              onClick={paste}
              disabled={busy}
              className="flex h-12 items-center gap-2 rounded-xl border border-line-strong px-4 text-sm font-medium text-ink transition-colors hover:border-ink disabled:opacity-60"
            >
              <ClipboardIcon className="size-[18px]" />
              Paste
            </button>
            <button
              type="submit"
              disabled={busy}
              className="h-12 flex-1 rounded-xl bg-tape px-7 text-base font-semibold text-tape-ink transition-[filter] hover:brightness-110 disabled:opacity-60 sm:flex-none"
            >
              {busy ? "Checking…" : "Get file"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 min-h-6 text-sm" aria-live="polite">
        {status ? (
          <p
            id="url-status"
            role={error ? "alert" : undefined}
            className={error ? "text-danger" : "text-muted"}
          >
            {status}
          </p>
        ) : detected ? (
          <p id="url-detected" className="flex items-center gap-2 text-muted">
            <span
              aria-hidden="true"
              className={`size-2 rounded-full ${detected.capability === "download" ? "bg-tape" : detected.capability === "preview" ? "bg-tape/50" : "bg-line-strong"}`}
            />
            Source: {detected.label}, {capabilityLabel(detected.capability).toLowerCase()}
          </p>
        ) : (
          <p id="url-hint" className="text-muted">
            Direct links to video, audio and image files.
          </p>
        )}
      </div>
    </form>
  );
}
