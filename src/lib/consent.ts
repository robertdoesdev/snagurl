import { useSyncExternalStore } from "react";

export type Consent = "granted" | "denied" | null;

const STORAGE_KEY = "snagurl:ad-consent:v1";
const CHANGE_EVENT = "snagurl:consent-change";

export function getConsentSnapshot(): Consent {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "granted" || value === "denied" ? value : null;
  } catch {
    return null;
  }
}

export function getServerConsentSnapshot(): Consent {
  return "denied";
}

export function subscribeConsent(onChange: () => void): () => void {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function setConsent(value: "granted" | "denied"): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
  } catch {
    return;
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useAdConsent(): Consent {
  return useSyncExternalStore(subscribeConsent, getConsentSnapshot, getServerConsentSnapshot);
}
