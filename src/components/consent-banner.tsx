"use client";

import { setConsent, useAdConsent } from "@/lib/consent";

const buttonClass =
  "h-10 flex-1 rounded-xl border border-line-strong px-4 text-sm font-medium transition-colors hover:border-ink";

export function ConsentBanner() {
  const consent = useAdConsent();
  if (consent !== null) return null;

  return (
    <section
      aria-label="Advertising choices"
      className="fixed inset-x-4 bottom-4 z-40 rounded-2xl border border-line-strong bg-raised p-4 shadow-lg sm:left-auto sm:right-4 sm:max-w-sm"
    >
      <p className="text-sm leading-relaxed">
        SnagUrl is free and supported by ads. Ads may use cookies to personalize what you see. SnagUrl
        works the same whichever you choose.
      </p>
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={() => setConsent("denied")} className={buttonClass}>
          Decline
        </button>
        <button type="button" onClick={() => setConsent("granted")} className={buttonClass}>
          Allow
        </button>
      </div>
    </section>
  );
}
