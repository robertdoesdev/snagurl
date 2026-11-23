import { ads, type AdPlacement } from "@/config/ads";

export function AdSlot({ placement }: { placement: AdPlacement }) {
  const config = ads.placements[placement];
  if (!ads.enabled || !config.enabled) return null;

  return (
    <aside
      aria-label="Advertisement"
      data-ad-placement={placement}
      className="mx-auto w-full max-w-[920px] px-5 py-5 sm:px-8"
    >
      <p className="mb-2 text-xs text-muted">Advertisement</p>
      <div
        id={`ad-${placement}`}
        style={{ minHeight: config.minHeight }}
        className="w-full border border-line bg-sunken"
      />
    </aside>
  );
}
