import Link from "next/link";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-[920px] px-5 py-24 sm:px-8 sm:py-32">
      <h1 className="font-display text-[clamp(2.5rem,7vw,5rem)] font-semibold leading-none tracking-[-0.04em]">
        That page doesn’t exist.
      </h1>
      <p className="mt-6 max-w-[44ch] text-lg text-muted">
        The link may be broken or the page may have moved. Head back and paste a
        media link instead.
      </p>
      <Link
        href="/"
        className="mt-10 inline-flex h-12 items-center rounded-xl bg-tape px-6 font-semibold text-tape-ink transition-[filter] hover:brightness-95"
      >
        Back to SnagUrl
      </Link>
    </main>
  );
}
