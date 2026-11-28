import Link from "next/link";
import { site } from "@/config/site";
import { AdSlot } from "./ad-slot";
import { Logo } from "./logo";

export function SiteFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="mt-24 border-t border-line">
      <AdSlot placement="footer" />
      <div className="mx-auto flex w-full max-w-[920px] flex-col gap-8 px-5 py-10 sm:flex-row sm:items-end sm:justify-between sm:px-8">
        <div className="space-y-3">
          <Logo />
          <p className="max-w-[40ch] text-sm text-muted">
            A media link checker and downloader. No accounts, and converted files
            are deleted automatically.
          </p>
        </div>
        <div className="space-y-3 sm:text-right">
          <nav aria-label="Legal" className="flex gap-6 text-sm sm:justify-end">
            <Link href="/privacy" className="text-muted transition-colors hover:text-ink">
              Privacy
            </Link>
            <Link href="/terms" className="text-muted transition-colors hover:text-ink">
              Terms
            </Link>
            {site.contactEmail !== "" && (
              <a
                href={`mailto:${site.contactEmail}`}
                className="text-muted transition-colors hover:text-ink"
              >
                Contact
              </a>
            )}
          </nav>
          <p className="text-xs text-muted">
            © {year} {site.name}
          </p>
        </div>
      </div>
    </footer>
  );
}
