// Saves a state map after every change, batched: changes within half a second go out as one PUT,
// one request at a time (so an older version never lands after a newer one), retried on failure,
// and sent with keepalive when the page is closed.
import { fetchJson, jsonBody } from "./api";
import type { StringMap } from "./types";

export type SaveStatus = "saved" | "pending" | "error";

export class Saver {
  private pending: StringMap | null = null;
  private inflight = false;
  private timer: number | undefined;
  private readonly url: string;
  private readonly onStatus: (s: SaveStatus) => void;

  constructor(url: string, onStatus: (s: SaveStatus) => void) {
    this.url = url;
    this.onStatus = onStatus;
  }

  /** Queue the latest version; it is sent after `delay` ms without further changes. */
  save(data: StringMap, delay = 500): void {
    this.pending = data;
    this.onStatus("pending");
    window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => void this.flush(), delay);
  }

  async flush(): Promise<void> {
    window.clearTimeout(this.timer);
    if (this.inflight || !this.pending) return;
    const data = this.pending;
    this.pending = null;
    this.inflight = true;
    try {
      await fetchJson(this.url, jsonBody("PUT", data));
    } catch {
      this.pending ??= data;
      this.inflight = false;
      this.onStatus("error");
      this.timer = window.setTimeout(() => void this.flush(), 3000);
      return;
    }
    this.inflight = false;
    if (this.pending) void this.flush();
    else this.onStatus("saved");
  }

  /** On page hide: whatever is still queued goes out with keepalive. */
  flushOnExit(): void {
    if (!this.pending) return;
    window.clearTimeout(this.timer);
    void fetch(this.url, { ...jsonBody("PUT", this.pending), credentials: "include", keepalive: true });
    this.pending = null;
  }
}
