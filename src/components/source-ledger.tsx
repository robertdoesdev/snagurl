import { capabilityLabel, sources } from "@/lib/media/sources";

const dotClass = {
  download: "bg-tape",
  preview: "bg-tape/50",
  none: "bg-line-strong",
} as const;

export function SourceLedger() {
  return (
    <section
      id="sources"
      aria-labelledby="sources-heading"
      className="mx-auto w-full max-w-[920px] px-5 pt-20 sm:px-8"
    >
      <h2 id="sources-heading" className="font-display text-2xl font-semibold tracking-tight">
        Supported sources
      </h2>
      <p className="mt-2 max-w-[60ch] text-muted">
        SnagUrl only downloads where a permitted method exists. Everywhere else it says so, instead of
        pretending.
      </p>
      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {sources.map((source) => (
          <li
            key={source.id}
            className="space-y-2 rounded-2xl border border-line bg-raised px-5 py-4"
          >
            <div className="flex items-center justify-between gap-4">
              <span className="font-medium">{source.label}</span>
              <span
                className={`flex items-center gap-2 text-sm ${source.capability === "none" ? "text-muted" : "text-ink"}`}
              >
                <span
                  aria-hidden="true"
                  className={`size-2 rounded-full ${dotClass[source.capability]}`}
                />
                {capabilityLabel(source.capability)}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted">{source.summary}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
