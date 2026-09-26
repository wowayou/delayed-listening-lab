import type { Cue } from '../subtitles/parse';
export function findCue(cues: readonly Cue[], timeMs: number): Cue | null {
  let lo = 0, hi = cues.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1, cue = cues[mid]!;
    if (timeMs < cue.start_ms) hi = mid - 1;
    else if (timeMs >= cue.end_ms) lo = mid + 1;
    else return cue;
  }
  return null;
}
export function continuousView(cues: readonly Cue[], timeMs: number, delayMs: number) {
  const display = findCue(cues, timeMs - delayMs);
  return { audio: findCue(cues, timeMs), display, action: display };
}
export function nextAt(cues: readonly Cue[], timeMs: number): Cue | null {
  return cues.find(c => c.end_ms > timeMs) ?? null;
}
export function tailCues(cues: readonly Cue[], durationMs: number, delayMs: number): Cue[] {
  return cues.filter(c => c.end_ms + delayMs > durationMs);
}
