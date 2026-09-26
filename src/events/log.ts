import type { Context, Origin } from '../player/controller';
import type { Track } from '../subtitles/parse';
export interface LogEvent extends Context {
  event_schema_version: 1;
  event_id: string;
  session_id: string;
  seq: number;
  at_utc: string;
  session_elapsed_ms: number;
  type: string;
  media_id: string;
  track_id: string;
  origin: Origin;
  details: Record<string, unknown>;
}
export interface EventStore { put(event: LogEvent): Promise<void>; all(): Promise<LogEvent[]> }
export class IndexedEventStore implements EventStore {
  private database?: Promise<IDBDatabase>;
  private open(): Promise<IDBDatabase> {
    if (!this.database) this.database = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('delayed-listening-lab', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('events', { keyPath: 'event_id' });
      request.onerror = () => reject(request.error ?? new Error('IndexedDB 无法打开'));
      request.onblocked = () => reject(new Error('IndexedDB 被其他标签页阻塞'));
      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => { db.close(); this.database = undefined; };
        resolve(db);
      };
    }).catch(e => { this.database = undefined; throw e; });
    return this.database;
  }
  async put(event: LogEvent): Promise<void> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('events', 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 写入失败'));
      // Upsert by event_id makes retries idempotent; success means transaction committed.
      tx.objectStore('events').put(event);
    });
  }
  async all(): Promise<LogEvent[]> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('events', 'readonly');
      const request = tx.objectStore('events').getAll();
      tx.oncomplete = () => resolve(request.result as LogEvent[]);
      tx.onabort = tx.onerror = () => reject(tx.error ?? new Error('IndexedDB 读取失败'));
    });
  }
}
export function ordered(events: LogEvent[]): LogEvent[] {
  const sessions = new Map<string, { seq: number; time: string }>();
  for (const e of events) {
    const first = sessions.get(e.session_id);
    if (!first || e.seq < first.seq) sessions.set(e.session_id, { seq: e.seq, time: e.at_utc });
  }
  return [...events].sort((a, b) => a.session_id === b.session_id ? a.seq - b.seq : sessions.get(a.session_id)!.time.localeCompare(sessions.get(b.session_id)!.time) || a.session_id.localeCompare(b.session_id));
}
export function jsonl(events: LogEvent[]): string { return ordered(events).map(e => JSON.stringify(e)).join('\n') + (events.length ? '\n' : ''); }
export class EventQueue {
  private chain: Promise<void> = Promise.resolve();
  private pending = new Map<string, LogEvent>();
  saved = 0;
  failure = '';
  onChange = () => {};
  constructor(private store: EventStore) {}
  get unsaved() { return ordered([...this.pending.values()]); }
  enqueue(event: LogEvent) {
    this.pending.set(event.event_id, event); this.onChange();
    this.chain = this.chain.then(() => this.commit(event));
  }
  private async commit(event: LogEvent) {
    if (this.failure || !this.pending.has(event.event_id)) return;
    try { await this.store.put(event); this.pending.delete(event.event_id); this.saved++; }
    catch (e) { this.failure = e instanceof Error ? e.message : String(e); }
    this.onChange();
  }
  async retry() {
    this.chain = this.chain.then(async () => {
      this.failure = '';
      for (const event of this.unsaved) await this.commit(event);
    });
    await this.chain;
  }
  snapshot(sessionId?: string): Promise<LogEvent[]> {
    // Insert the read into the same queue. Later enqueue calls cannot leak into this snapshot.
    const snapshot = this.chain.then(() => this.store.all()).then(events => ordered(events.filter(e => !sessionId || e.session_id === sessionId)));
    this.chain = snapshot.then(() => {}, () => {});
    return snapshot;
  }
  async unsavedSnapshot(): Promise<LogEvent[]> {
    const snapshot = this.chain.then(() => this.unsaved);
    this.chain = snapshot.then(() => {});
    return snapshot;
  }
}
export class SessionLog {
  readonly id = crypto.randomUUID();
  private seq = 0;
  private started = performance.now();
  constructor(private queue: EventQueue, private track: Track, private trackId: string) {}
  emit = (type: string, origin: Origin, details: Record<string, unknown>, context: Context) => {
    const seq = ++this.seq;
    this.queue.enqueue({
      event_schema_version: 1, event_id: `${this.id}:${seq}`, session_id: this.id, seq,
      at_utc: new Date().toISOString(), session_elapsed_ms: Math.round(performance.now() - this.started),
      type, media_id: this.track.media_id, track_id: this.trackId, ...context, origin, details,
    });
  };
}
