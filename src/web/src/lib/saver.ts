// Saves a state map after every change, batched: changes within half a second go out as one
// request, one request at a time (so an older version never lands after a newer one), retried on
// failure, and sent with keepalive when the page is closed. Only the keys that changed since the
// last known server copy are sent (PATCH), so another tab's changes to other pages survive.
import { fetchJson, jsonBody } from "./api";
import type { StringMap } from "./types";

export type SaveStatus = "saved" | "pending" | "error";

type Changes = Record<string, string | null>;

function diff(base: StringMap, next: StringMap): Changes {
  const out: Changes = {};
  for (const [k, v] of Object.entries(next)) if (base[k] !== v) out[k] = v;
  for (const k of Object.keys(base)) if (!(k in next)) out[k] = null;
  return out;
}

export class Saver {
  private pending: StringMap | null = null;
  private inflight = false;
  private timer: number | undefined;
  /** The server's map as last seen (from a load or a save). */
  private base: StringMap = {};
  private readonly url: string;
  private readonly onStatus: (s: SaveStatus) => void;
  private readonly onSynced: (server: StringMap) => void;

  constructor(url: string, onStatus: (s: SaveStatus) => void, onSynced: (server: StringMap) => void) {
    this.url = url;
    this.onStatus = onStatus;
    this.onSynced = onSynced;
  }

  /** The server copy as loaded; changes are computed against it. */
  setBase(server: StringMap): void {
    if (!this.pending && !this.inflight) this.base = server;
  }

  get idle(): boolean {
    return !this.pending && !this.inflight;
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
    const changes = diff(this.base, data);
    if (!Object.keys(changes).length) {
      if (!this.inflight) this.onStatus("saved");
      return;
    }
    this.inflight = true;
    let server: StringMap;
    try {
      server = await fetchJson<StringMap>(this.url, jsonBody("PATCH", changes));
    } catch {
      this.pending ??= data;
      this.inflight = false;
      this.onStatus("error");
      this.timer = window.setTimeout(() => void this.flush(), 3000);
      return;
    }
    this.inflight = false;
    this.base = server;
    if (this.pending) void this.flush();
    else {
      this.onStatus("saved");
      this.onSynced(server);
    }
  }

  /** On page hide: whatever is still queued goes out with keepalive. */
  flushOnExit(): void {
    if (!this.pending) return;
    window.clearTimeout(this.timer);
    const changes = diff(this.base, this.pending);
    void fetch(this.url, { ...jsonBody("PATCH", changes), credentials: "include", keepalive: true });
    this.pending = null;
  }
}
