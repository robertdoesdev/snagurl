import Link from "next/link";
import { Logo } from "./logo";
import { ThemeToggle } from "./theme-toggle";

const links = [
  { href: "/#sources", label: "Supported sources" },
  { href: "/#how", label: "How it works" },
  { href: "/#faq", label: "FAQ" },
] as const;

export function SiteHeader() {
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex w-full max-w-[920px] flex-wrap items-center justify-between gap-x-8 px-5 sm:px-8">
        <div className="flex h-16 items-center">
          <Logo />
        </div>
        <nav
          aria-label="Primary"
          className="order-3 -mx-5 flex w-[calc(100%+2.5rem)] gap-6 overflow-x-auto border-t border-line px-5 sm:order-none sm:mx-0 sm:ml-auto sm:w-auto sm:border-t-0 sm:px-0"
        >
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="flex h-12 shrink-0 items-center text-sm text-muted transition-colors hover:text-ink sm:h-16"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}
