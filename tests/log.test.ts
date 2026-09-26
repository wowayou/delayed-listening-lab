import { describe, expect, it } from 'vitest';
import { EventQueue, jsonl, SessionLog } from '../src/events/log';
import type { EventStore, LogEvent } from '../src/events/log';
import { normalizeTrack } from '../src/subtitles/parse';
const track = normalizeTrack({ schema_version: 1, media_id: 'local', track_revision: '1', source_language: 'en', target_language: null, cues: [{ id: 'c1', start_ms: 0, end_ms: 1000, src: 'private text', tgt: null }] });
const context = { media_time_ms: 0, mode: 'continuous', phase: 'normal', delay_ms: 1000, audio_cue_id: null, display_cue_id: null, action_cue_id: null } as const;
class MemoryStore implements EventStore {
  events = new Map<string, LogEvent>();
  failure = false;
  async put(event: LogEvent) { if (this.failure) throw new Error('quota'); this.events.set(event.event_id, event); }
  async all() { return [...this.events.values()]; }
}
describe('M4 / AC-19–20 durable event queue', () => {
  it('sequence, event identity, privacy and multi-session grouping', async () => {
    const store = new MemoryStore(), queue = new EventQueue(store);
    const first = new SessionLog(queue, track, 'hash'), second = new SessionLog(queue, track, 'hash');
    first.emit('session_start', 'system', {}, context); second.emit('session_start', 'system', {}, context);
    first.emit('not_understood', 'button', { target_cue_id: 'c1' }, context);
    const events = await queue.snapshot();
    expect(events).toHaveLength(3); expect(new Set(events.map(e => e.event_id)).size).toBe(3);
    expect(events.filter(e => e.session_id === first.id).map(e => e.seq)).toEqual([1,2]);
    expect(jsonl(events)).not.toContain('private text');
    expect(jsonl(events).trim().split('\n').map(line => JSON.parse(line))).toEqual(events);
  });
  it('enqueued is not committed, snapshots exclude later events', async () => {
    const store = new MemoryStore();
    let release!: () => void;
    const original = store.put.bind(store);
    store.put = async event => { await new Promise<void>(r => { release = r; }); await original(event); };
    const queue = new EventQueue(store), session = new SessionLog(queue, track, 'hash');
    session.emit('session_start', 'system', {}, context);
    expect(queue.saved).toBe(0); expect(queue.unsaved).toHaveLength(1);
    const snapshot = queue.snapshot();
    session.emit('play', 'system', { reason: 'user' }, context);
    await Promise.resolve(); release();
    expect(await snapshot).toHaveLength(1);
    await Promise.resolve(); release();
    expect(await queue.snapshot()).toHaveLength(2); expect(queue.saved).toBe(2);
  });
  it('failure retains memory, blocks later commits, explicit retry is idempotent', async () => {
    const store = new MemoryStore(), queue = new EventQueue(store), session = new SessionLog(queue, track, 'hash');
    session.emit('session_start', 'system', {}, context); await queue.snapshot();
    store.failure = true; session.emit('play', 'system', { reason: 'user' }, context); session.emit('pause', 'system', { reason: 'user' }, context);
    expect(await queue.snapshot()).toHaveLength(1); expect(queue.failure).toBe('quota'); expect(queue.unsaved).toHaveLength(2); expect(queue.saved).toBe(1);
    store.failure = false; await queue.retry(); await queue.retry();
    expect(await queue.snapshot()).toHaveLength(3); expect(queue.unsaved).toHaveLength(0); expect(queue.saved).toBe(3);
  });
  it('retry after an ambiguous commit cannot duplicate event_id', async () => {
    const store = new MemoryStore(), queue = new EventQueue(store), session = new SessionLog(queue, track, 'hash');
    const put = store.put.bind(store); let once = true;
    store.put = async event => { await put(event); if (once) { once = false; throw new Error('lost acknowledgement'); } };
    session.emit('session_start', 'system', {}, context); await queue.snapshot(); await queue.retry();
    expect(await queue.snapshot()).toHaveLength(1);
  });
});
it('orders sessions by session_start, not a later wall-clock adjustment', async () => {
  const store = new MemoryStore(), queue = new EventQueue(store);
  const first = new SessionLog(queue, track, 'hash'), second = new SessionLog(queue, track, 'hash');
  first.emit('session_start', 'system', {}, context); first.emit('play', 'system', {}, context); second.emit('session_start', 'system', {}, context);
  await queue.snapshot();
  for (const e of store.events.values()) e.at_utc = e.session_id === second.id ? '2026-09-26T01:00:00.000Z' : e.seq === 1 ? '2026-09-26T02:00:00.000Z' : '2026-09-26T00:00:00.000Z';
  expect((await queue.snapshot()).map(e => e.session_id)).toEqual([second.id, first.id, first.id]);
});
