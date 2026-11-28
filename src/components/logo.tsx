import Link from "next/link";
import { site } from "@/config/site";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 4v11M7 10.5l5 5 5-5M5 20h14" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link
      href="/"
      className="inline-flex items-center gap-2 font-display text-xl font-semibold tracking-tight"
      aria-label={`${site.name} home`}
    >
      <span className="grid size-8 place-items-center rounded-[10px] bg-tape text-tape-ink">
        <LogoMark className="size-[18px]" />
      </span>
      <span>{site.name}</span>
    </Link>
  );
}
