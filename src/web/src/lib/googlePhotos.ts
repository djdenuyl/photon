// Shared between main.tsx (the OAuth popup tab, landing back on `?gp=connected`) and
// PhotoPicker.tsx (the tab that opened it): a tiny postMessage handshake so connecting
// flows straight into opening the actual Google Photos picker, in the same popup, without
// ever calling `window.open` outside a click handler (that gets blocked by popup blockers).
export const GOOGLE_PHOTOS_SOURCE = "photon-google-photos";

export type GooglePhotosMessage =
  | { source: typeof GOOGLE_PHOTOS_SOURCE; type: "connected" }
  | { source: typeof GOOGLE_PHOTOS_SOURCE; type: "continue"; pickerUri: string }
  | { source: typeof GOOGLE_PHOTOS_SOURCE; type: "close" };

export function isGooglePhotosMessage(data: unknown): data is GooglePhotosMessage {
  return !!data && typeof data === "object" && (data as { source?: unknown }).source === GOOGLE_PHOTOS_SOURCE;
}
