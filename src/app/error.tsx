"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-[920px] px-5 py-24 sm:px-8 sm:py-32">
      <h1 className="font-display text-[clamp(2.5rem,7vw,5rem)] font-semibold leading-none tracking-[-0.04em]">
        Something broke on our side.
      </h1>
      <p className="mt-6 max-w-[44ch] text-lg text-muted">
        The page failed to load. Try again, and if it keeps happening, come back in a few minutes.
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-10 inline-flex h-12 items-center rounded-xl bg-tape px-6 font-semibold text-tape-ink transition-[filter] hover:brightness-95"
      >
        Try again
      </button>
    </main>
  );
}
