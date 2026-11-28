import type { SourceDefinition } from "@/lib/media/sources";
import { CheckIcon, SpinnerIcon } from "./icons";

interface ProcessingPanelProps {
  source: SourceDefinition;
  host: string;
  onCancel: () => void;
}

export function ProcessingPanel({ source, host, onCancel }: ProcessingPanelProps) {
  return (
    <section
      aria-label="Checking link"
      aria-busy="true"
      className="animate-reveal mt-10 overflow-hidden rounded-2xl border border-line bg-raised"
    >
      <div className="relative h-[2px] overflow-hidden bg-line">
        <div className="animate-sweep absolute inset-y-0 left-0 w-2/5 bg-tape motion-reduce:w-full" />
      </div>
      <div className="flex flex-col gap-6 p-6 sm:flex-row sm:items-start sm:justify-between">
        <ol className="space-y-3 text-[15px]" role="status">
          <li className="flex items-center gap-3 text-muted">
            <CheckIcon className="size-[18px] text-tape" />
            Link checked
          </li>
          <li className="flex items-center gap-3 text-muted">
            <CheckIcon className="size-[18px] text-tape" />
            Source identified: {source.label}
          </li>
          <li className="flex items-center gap-3 text-ink">
            <SpinnerIcon className="size-[18px] text-tape" />
            Asking {host} for details
          </li>
        </ol>
        <button
          type="button"
          onClick={onCancel}
          className="h-10 shrink-0 rounded-xl border border-line-strong px-4 text-sm text-ink transition-colors hover:border-ink"
        >
          Cancel
        </button>
      </div>
    </section>
  );
}
