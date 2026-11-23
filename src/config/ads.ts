export type AdPlacement = "top" | "secondary" | "footer";

interface AdPlacementConfig {
  enabled: boolean;
  minHeight: number;
}

interface AdsConfig {
  enabled: boolean;
  consentRequired: boolean;
  placements: Record<AdPlacement, AdPlacementConfig>;
}

export const ads: AdsConfig = {
  enabled: false,
  consentRequired: true,
  placements: {
    top: { enabled: true, minHeight: 90 },
    secondary: { enabled: true, minHeight: 250 },
    footer: { enabled: true, minHeight: 90 },
  },
};
