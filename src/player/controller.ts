import type { Cue, Track } from '../subtitles/parse';
import { continuousView, findCue, nextAt, tailCues } from '../timeline';
export type Mode = 'continuous' | 'review';
export type Phase = 'normal' | 'review_ready' | 'focused_listening' | 'focused_review' | 'ended';
export type Origin = 'keyboard' | 'button' | 'pointer' | 'system';
export interface MediaPort {
  readonly currentMs: number;
  readonly durationMs: number;
  readonly paused: boolean;
  seek(ms: number, signal: AbortSignal): Promise<void>;
  play(): Promise<void>;
  pause(): void;
}
export interface Context {
  media_time_ms: number;
  mode: Mode;
  phase: Phase;
  delay_ms: number;
  audio_cue_id: string | null;
  display_cue_id: string | null;
  action_cue_id: string | null;
}
export type Emit = (type: string, origin: Origin, details: Record<string, unknown>, context: Context) => void;
export class Controller {
  mode: Mode = 'continuous';
  phase: Phase = 'normal';
  delay = 1000;
  time = 0;
  playing = false;
  busy = false;
  translation = false;
  focused: Cue | null = null;
  focusReason: 'review' | 'replay' = 'review';
  tails: Cue[] = [];
  selectedTail: Cue | null = null;
  error = '';
  feedback = '';
  private operation = new AbortController();
  onChange = () => {};
  constructor(readonly track: Track, readonly media: MediaPort, private emit: Emit) {}
  view() {
    const normal = continuousView(this.track.cues, this.time, this.delay);
    const focused = this.phase === 'focused_listening' || this.phase === 'focused_review' || this.phase === 'review_ready' || (this.phase === 'ended' && this.mode === 'review');
    const display = focused
      ? (this.phase === 'focused_review' || this.phase === 'ended' ? this.focused : null)
      : this.phase === 'ended' ? this.selectedTail : normal.display;
    const action = focused ? this.focused : display;
    return { audio: findCue(this.track.cues, this.time), display, action };
  }
  context(): Context {
    const v = this.view();
    return { media_time_ms: this.time, mode: this.mode, phase: this.phase, delay_ms: this.delay, audio_cue_id: v.audio?.id ?? null, display_cue_id: v.display?.id ?? null, action_cue_id: v.action?.id ?? null };
  }
  private log(type: string, origin: Origin, details: Record<string, unknown>) { this.emit(type, origin, details, this.context()); }
  private change() { this.onChange(); }
  private cancel() {
    this.operation.abort();
    this.operation = new AbortController();
    this.busy = false;
  }
  private sample() { if (this.playing && !this.busy) this.tick(); }
  private clearReveal() { this.translation = false; this.feedback = ''; }
  pause(reason: 'user' | 'seek' | 'mode_change' | 'hidden' | 'import', origin: Origin = 'system') {
    const wasPlaying = !this.media.paused;
    const displayed = this.view().display?.id;
    this.cancel();
    this.media.pause();
    this.time = this.media.currentMs;
    this.playing = false;
    if (displayed !== this.view().display?.id) this.clearReveal();
    if (wasPlaying) this.log('pause', origin, { reason });
    this.change();
  }
  private async move(ms: number, signal: AbortSignal) {
    this.time = ms;
    await this.media.seek(ms, signal);
    if (signal.aborted) throw new DOMException('操作已取消', 'AbortError');
    this.time = this.media.currentMs;
  }
  private async start(reason: string, seekTo?: number, seekReason?: string) {
    this.cancel();
    const signal = this.operation.signal;
    this.error = '';
    this.busy = true;
    this.change();
    try {
      if (seekTo !== undefined) {
        this.log('seek', 'system', { from_ms: this.time, to_ms: seekTo, reason: seekReason });
        await this.move(seekTo, signal);
      }
      if (signal.aborted) return;
      await this.media.play();
      if (signal.aborted) return;
      this.playing = !this.media.paused;
      this.time = this.media.currentMs;
      this.busy = false;
      if (this.playing) this.log('play', 'system', { reason });
    } catch (e) {
      if (!signal.aborted) this.fail(`播放失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (!signal.aborted) { this.busy = false; this.change(); }
    }
  }
  async toggle(origin: Origin = 'button') {
    if (this.playing || this.busy) { this.pause('user', origin); return; }
    if (this.mode === 'continuous' && this.phase !== 'focused_listening' && this.phase !== 'focused_review') {
      if (this.time >= this.media.durationMs) {
        this.phase = 'normal'; this.tails = []; this.selectedTail = null; this.clearReveal();
        await this.start('user', 0, 'user');
      } else await this.start('user');
      return;
    }
    if (this.phase === 'focused_listening') { await this.start('resume'); return; }
    if (this.phase === 'focused_review' && this.mode === 'continuous') {
      const end = Math.min(this.focused!.end_ms, this.media.durationMs);
      this.focused = null; this.phase = 'normal'; this.clearReveal(); this.time = end;
      if (end >= this.media.durationMs) { this.finishContinuous(); this.change(); }
      else await this.start('resume');
      return;
    }
    if (this.phase === 'ended') return;
    let target = this.focused;
    const continuing = this.phase === 'focused_review';
    if (continuing) target = this.track.cues[this.track.cues.indexOf(this.focused!) + 1] ?? null;
    if (!target) {
      // Seeking past the last cue is not completion of a reviewed segment.
      if (!continuing) return;
      this.log('ended', origin, { reason: 'review_complete' });
      this.phase = 'ended'; this.change(); return;
    }
    this.focused = target; this.focusReason = 'review'; this.phase = 'focused_listening'; this.clearReveal();
    await this.start('review', target.start_ms, continuing ? 'review_continue' : 'review_start');
  }
  async seek(ms: number, origin: Origin = 'pointer') {
    if (!Number.isFinite(ms)) return;
    this.sample();
    const to = Math.max(0, Math.min(ms, this.media.durationMs));
    // Capture the action before cancelling a focused practice.
    this.log('seek', origin, { from_ms: this.time, to_ms: to, reason: 'user' });
    this.pause('seek');
    const signal = this.operation.signal;
    this.clearReveal(); this.tails = []; this.selectedTail = null;
    this.focused = this.mode === 'review' ? nextAt(this.track.cues, to) : null;
    this.phase = this.mode === 'review' ? 'review_ready' : 'normal';
    this.busy = true;
    try { await this.move(to, signal); }
    catch (e) { if (!signal.aborted) this.fail(`定位失败：${String(e)}`); }
    finally { if (!signal.aborted) { this.busy = false; this.change(); } }
  }
  setMode(mode: Mode, origin: Origin = 'button') {
    if (mode === this.mode) return;
    this.sample();
    this.log('mode_change', origin, { from: this.mode, to: mode });
    this.pause('mode_change');
    this.mode = mode; this.clearReveal(); this.tails = []; this.selectedTail = null;
    this.focused = mode === 'review' ? nextAt(this.track.cues, this.time) : null;
    this.phase = mode === 'review' ? 'review_ready' : 'normal';
    this.change();
  }
  setDelay(ms: number, origin: Origin = 'pointer') {
    if (this.mode !== 'continuous' || this.phase === 'focused_listening' || this.phase === 'focused_review') return;
    if (!Number.isInteger(ms) || ms < 0 || ms > 3000 || ms % 100 !== 0 || ms === this.delay) return;
    this.sample();
    this.log('delay_change', origin, { from_ms: this.delay, to_ms: ms });
    this.delay = ms; this.clearReveal();
    if (this.phase === 'ended') { this.tails = tailCues(this.track.cues, this.media.durationMs, ms); this.selectedTail = this.tails[0] ?? null; }
    this.change();
  }
  tick(time = this.media.currentMs, nativeEnded = false) {
    if (this.busy || !this.playing) return;
    const before = this.view().display?.id;
    this.time = time;
    if (this.phase === 'focused_listening' && this.focused && (time >= this.focused.end_ms || nativeEnded)) {
      const cue = this.focused;
      this.log('review_pause', 'system', { target_cue_id: cue.id, reason: this.focusReason, observed_boundary_ms: time, overshoot_ms: Math.max(0, time - cue.end_ms) });
      this.media.pause(); this.playing = false; this.phase = 'focused_review'; this.clearReveal();
      this.cancel();
      const signal = this.operation.signal;
      this.busy = true;
      void this.move(Math.min(cue.end_ms, this.media.durationMs), signal).catch(e => {
        if (!signal.aborted) this.fail(`边界定位失败：${String(e)}`);
      }).finally(() => { if (!signal.aborted) { this.busy = false; this.change(); } });
    } else if (nativeEnded && this.mode === 'continuous') this.finishContinuous();
    if (before !== this.view().display?.id) this.clearReveal();
    this.change();
  }
  private finishContinuous() {
    this.log('ended', 'system', { reason: 'media_end' });
    this.playing = false; this.phase = 'ended'; this.focused = null; this.clearReveal();
    this.tails = tailCues(this.track.cues, this.media.durationMs, this.delay);
    this.selectedTail = this.tails[0] ?? null;
  }
  async replay(origin: Origin = 'button') {
    this.sample();
    const target = this.view().action;
    if (!target) return;
    this.log('replay', origin, { target_cue_id: target.id });
    this.cancel(); this.media.pause(); this.playing = false;
    this.focused = target; this.focusReason = 'replay'; this.phase = 'focused_listening';
    this.tails = []; this.selectedTail = null; this.clearReveal();
    await this.start('replay', target.start_ms, 'replay');
  }
  toggleTranslation(origin: Origin = 'button') {
    this.sample();
    if (!this.view().display?.tgt) return;
    this.log(this.translation ? 'translation_hide' : 'translation_reveal', origin, {});
    this.translation = !this.translation; this.change();
  }
  mark(origin: Origin = 'button') {
    this.sample();
    const target = this.view().action;
    if (!target || !this.view().display) return;
    this.log('not_understood', origin, { target_cue_id: target.id });
    this.feedback = `已标记第 ${this.track.cues.indexOf(target) + 1} 条没听懂`; this.change();
  }
  selectTail(id: string) {
    const cue = this.tails.find(c => c.id === id);
    if (!cue || cue === this.selectedTail) return;
    this.selectedTail = cue; this.clearReveal(); this.change();
  }
  fail(message: string) {
    this.cancel(); this.media.pause(); this.playing = false; this.error = message; this.change();
  }
  dispose() { this.cancel(); this.media.pause(); this.playing = false; this.onChange = () => {}; }
}
