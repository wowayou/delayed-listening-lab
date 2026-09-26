import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Controller } from '../src/player/controller';
import type { Context, MediaPort } from '../src/player/controller';
import { parseJson } from '../src/subtitles/parse';
const track = parseJson(readFileSync('fixtures/basic.cues.json', 'utf8'));
class FakeMedia implements MediaPort {
  currentMs = 0; durationMs = 20000; paused = true;
  async seek(ms: number, signal: AbortSignal) { if (!signal.aborted) this.currentMs = ms; }
  async play() { this.paused = false; }
  pause() { this.paused = true; }
}
function setup() {
  const media = new FakeMedia();
  const events: { type: string; details: Record<string, unknown>; ctx: Context }[] = [];
  const c = new Controller(track, media, (type, _origin, details, ctx) => events.push({ type, details, ctx }));
  return { c, media, events, tick: (t: number, ended = false) => { media.currentMs = t; c.tick(t, ended); } };
}
const settled = async () => { await new Promise(resolve => setTimeout(resolve, 0)); };
describe('M2 / continuous state AC-06–10', () => {
  it('initial state / paused wall time / delay clearing and no time mutation', async () => {
    const { c, media, tick } = setup();
    expect(c.context()).toMatchObject({ phase: 'normal', delay_ms: 1000, display_cue_id: null });
    await c.toggle(); tick(3500); c.pause('user'); c.toggleTranslation();
    expect(c.translation).toBe(true); c.tick(8000); expect(c.time).toBe(3500);
    c.setDelay(0); expect(c.view().display?.id).toBe('c0002'); expect(c.translation).toBe(false);
    c.setDelay(3000); expect(c.view().display).toBeNull(); expect(media.currentMs).toBe(3500);
    for (const d of [-100, 50, 3001, NaN]) c.setDelay(d);
    expect(c.delay).toBe(3000); expect(track.cues[0]!.start_ms).toBe(1000);
  });
  it('natural tail, per-target translation, explicit restart; seek to end has no tail', async () => {
    const { c, tick } = setup();
    await c.toggle(); tick(20000, true);
    expect(c.tails.map(t => t.id)).toEqual(['c0006', 'c0007']);
    c.toggleTranslation(); c.selectTail('c0007'); expect(c.translation).toBe(false);
    expect(c.view().action?.id).toBe('c0007');
    await c.toggle(); expect(c.time).toBe(0); expect(c.playing).toBe(true); expect(c.tails).toEqual([]);
    await c.seek(20000); expect(c.tails).toEqual([]); expect(c.playing).toBe(false);
    c.setDelay(0); await c.toggle(); tick(20000, true); expect(c.tails).toEqual([]);
  });
});
describe('M3 / review and replay AC-11–17', () => {
  it('review hides until complete, never early, pauses once at continuous boundary', async () => {
    const { c, tick, events } = setup(); c.setMode('review');
    expect(c.view().action?.id).toBe('c0001'); await c.toggle(); expect(c.time).toBe(1000);
    tick(2000); c.pause('user'); expect(c.view().display).toBeNull(); c.toggleTranslation(); c.mark();
    expect(events.some(e => e.type === 'not_understood')).toBe(false);
    await c.toggle(); tick(2999); expect(c.playing).toBe(true); expect(c.view().display).toBeNull();
    tick(3012); await settled(); expect(c.time).toBe(3000); expect(c.playing).toBe(false); expect(c.view().display?.id).toBe('c0001');
    tick(3000, true); expect(events.filter(e => e.type === 'review_pause')).toHaveLength(1);
    expect(events.find(e => e.type === 'review_pause')!.details).toMatchObject({ observed_boundary_ms: 3012, overshoot_ms: 12 });
    c.toggleTranslation(); expect(c.translation).toBe(true); await c.toggle();
    expect(c.time).toBe(3000); expect(c.playing).toBe(true); expect(c.view().display).toBeNull(); expect(c.translation).toBe(false);
    tick(3001); expect(c.playing).toBe(true);
  });
  it('replays display target not audio target and resumes B at its end', async () => {
    const { c, tick, events } = setup(); await c.toggle(); tick(3500); c.toggleTranslation(); await c.replay('keyboard');
    const replay = events.find(e => e.type === 'replay')!;
    expect(replay.ctx).toMatchObject({ media_time_ms: 3500, audio_cue_id: 'c0002', display_cue_id: 'c0001', action_cue_id: 'c0001' });
    expect(c.time).toBe(1000); expect(c.view().display).toBeNull(); expect(c.translation).toBe(false);
    c.setDelay(2000); expect(c.delay).toBe(1000);
    tick(3007); await settled(); expect(c.view().display?.id).toBe('c0001'); await c.toggle();
    expect(c.time).toBe(3000); expect(c.phase).toBe('normal'); expect(c.playing).toBe(true);
  });
  it('review gap seeks and tail without a target; cancel replay with mode/seek', async () => {
    const { c, tick } = setup(); c.setMode('review'); await c.seek(5500);
    expect(c.view().action?.id).toBe('c0003'); expect(c.view().display).toBeNull(); await c.toggle(); expect(c.time).toBe(6500);
    await c.replay(); await c.seek(10000); tick(14500); expect(c.playing).toBe(false); expect(c.focused?.id).toBe('c0004');
    c.setMode('continuous'); expect(c.focused).toBeNull(); expect(c.playing).toBe(false);
    c.setMode('review'); await c.seek(20000); expect(c.view().action).toBeNull();
  });
  it.each(['seek in review', 'switch mode at end'])('no-target operations are no-ops after %s', async entry => {
    const { c, media, events } = setup();
    if (entry === 'seek in review') c.setMode('review');
    await c.seek(20000);
    if (entry === 'switch mode at end') c.setMode('review');
    expect(c.phase).toBe('review_ready');
    expect(c.view().action).toBeNull();
    const before = c.context(), recorded = structuredClone(events);
    const play = vi.spyOn(media, 'play'), seek = vi.spyOn(media, 'seek');
    for (const origin of ['button', 'keyboard', 'keyboard'] as const) {
      await c.toggle(origin);
      await c.replay(origin);
      c.toggleTranslation(origin);
      c.mark(origin);
    }
    expect(c.context()).toEqual(before);
    expect(events).toEqual(recorded);
    expect(media.currentMs).toBe(20000);
    expect(media.paused).toBe(true);
    expect(c.playing).toBe(false);
    expect(c.translation).toBe(false);
    expect(play).not.toHaveBeenCalled();
    expect(seek).not.toHaveBeenCalled();
  });
  it('native ended completes tolerated last cue once, continue ends review; replay last stays available', async () => {
    const { c, media, tick, events } = setup(); media.durationMs = 19950;
    c.setMode('review'); await c.seek(19500); await c.toggle(); tick(19950, true); await settled();
    expect(c.phase).toBe('focused_review'); expect(c.time).toBe(19950); expect(c.tails).toEqual([]);
    tick(19950, true); await c.toggle(); expect(c.phase).toBe('ended');
    await c.toggle('keyboard'); await c.toggle('keyboard');
    expect(events.filter(e => e.type === 'review_pause')).toHaveLength(1);
    expect(events.filter(e => e.type === 'ended')).toHaveLength(1);
    await c.replay(); expect(c.playing).toBe(true); expect(c.time).toBe(19500);
  });
  it('B last replay continue does not implicitly restart', async () => {
    const { c, tick } = setup(); await c.toggle(); tick(20000, true); c.selectTail('c0007');
    await c.replay(); tick(20000, true); await settled(); await c.toggle();
    expect(c.playing).toBe(false); expect(c.phase).toBe('ended'); expect(c.time).toBe(20000);
  });
  it('missing translation, changing cue clears reveal; mark targets visible ID', async () => {
    const { c, tick, events } = setup(); await c.toggle(); tick(3500); c.toggleTranslation(); c.mark();
    expect(events.at(-1)!.details.target_cue_id).toBe('c0001'); tick(4000); expect(c.translation).toBe(false);
    tick(7500); c.toggleTranslation(); expect(c.translation).toBe(false);
  });
  it('hidden pauses once and play rejection is recoverable', async () => {
    const { c, media, events } = setup(); await c.toggle(); c.pause('hidden'); c.pause('hidden');
    expect(events.filter(e => e.type === 'pause')).toHaveLength(1); expect(c.playing).toBe(false);
    media.play = () => Promise.reject(new Error('denied')); await c.toggle();
    expect(c.playing).toBe(false); expect(c.busy).toBe(false); expect(c.error).toContain('denied');
  });
  it('rapid R then seek/mode invalidates pending seek and never plays it', async () => {
    const { c, media } = setup(); await c.seek(3500);
    let resolveSeek!: () => void;
    media.seek = () => new Promise<void>(resolve => { resolveSeek = resolve; });
    const replay = c.replay(); c.setMode('review'); resolveSeek(); await replay;
    expect(c.playing).toBe(false); expect(c.phase).toBe('review_ready');
  });
});
it('samples actual media clock for actions, clears a reveal when pausing across a cue boundary', async () => {
  const { c, media, tick, events } = setup(); await c.toggle(); tick(3500); c.toggleTranslation();
  media.currentMs = 4050; c.pause('user'); expect(c.translation).toBe(false);
  await c.toggle(); media.currentMs = 7500; c.mark();
  expect(events.at(-1)!.ctx).toMatchObject({ media_time_ms: 7500, action_cue_id: 'c0003' });
});
