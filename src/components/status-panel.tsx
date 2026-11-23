import { AlertIcon } from "./icons";

interface StatusPanelProps {
  title: string;
  message: string;
  onRetry?: () => void;
  onReset: () => void;
}

export function StatusPanel({ title, message, onRetry, onReset }: StatusPanelProps) {
  return (
    <section
      role="alert"
      className="animate-reveal mt-10 flex flex-col gap-6 rounded-2xl border border-line bg-raised p-6 sm:flex-row sm:items-start sm:justify-between"
    >
      <div className="flex gap-4">
        <AlertIcon className="mt-0.5 size-5 shrink-0 text-danger" />
        <div className="space-y-1.5">
          <h2 className="font-display text-lg font-semibold">{title}</h2>
          <p className="max-w-[60ch] text-[15px] leading-relaxed text-muted">{message}</p>
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="h-10 rounded-xl bg-tape px-4 text-sm font-semibold text-tape-ink transition-[filter] hover:brightness-95"
          >
            Try again
          </button>
        )}
        <button
          type="button"
          onClick={onReset}
          className="h-10 rounded-xl border border-line-strong px-4 text-sm text-ink transition-colors hover:border-ink"
        >
          Use a different link
        </button>
      </div>
    </section>
  );
}
