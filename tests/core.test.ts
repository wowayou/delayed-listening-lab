import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { hashTrack, normalizeTrack, parseJson, parseSrt, readSubtitle, validateDuration } from '../src/subtitles/parse';
import { continuousView, findCue, nextAt, tailCues } from '../src/timeline';
const json = readFileSync('fixtures/basic.cues.json', 'utf8');
const srt = readFileSync('fixtures/basic.en.srt', 'utf8');
const track = parseJson(json);
describe('M1 / AC-01–04 parsing', () => {
  it('retains all 7 JSON cues and missing translation', () => {
    expect(track).toEqual(JSON.parse(json));
    expect(track.cues[2]!.tgt).toBeNull();
  });
  it.each([srt, `\uFEFF${srt.replace(/\n/g, '\r\n')}`, srt.trimEnd()])('SRT variants', text => {
    const parsed = parseSrt(text, 'basic.en.srt');
    expect(parsed.cues).toEqual(track.cues.map(c => ({ ...c, tgt: null })));
    expect(parsed.media_id).toBe('basic.en');
  });
  it('nonconsecutive optional indices, multiline and numeric body', () => {
    const input = '99\n00:00:01,000 --> 00:00:02,000\n123\nline two\n\n2\n00:00:02,000 --> 00:00:03,000\n456';
    expect(parseSrt(input, 'x.srt').cues.map(c => [c.id, c.src])).toEqual([['c0001', '123\nline two'], ['c0002', '456']]);
    expect(parseSrt('00:00:01,000 --> 00:00:02,000\n123', 'x.srt').cues[0]!.src).toBe('123');
  });
  it.each([
    [() => ({ ...track, schema_version: '1' }), /schema_version/],
    [() => ({ ...track, cues: [] }), /cues/],
    [() => ({ ...track, media_id: ' ' }), /media_id/],
    [() => ({ ...track, target_language: '' }), /target_language/],
    [() => ({ ...track, cues: [track.cues[0], track.cues[0]] }), /重复 ID/],
    [() => ({ ...track, cues: [track.cues[1], track.cues[0]] }), /乱序或重叠/],
  ] as const)('rejects invalid track', (make, error) => expect(() => normalizeTrack(make())).toThrow(error));
  it.each([
    ['start_ms', -1], ['start_ms', 1.2], ['end_ms', Number.MAX_SAFE_INTEGER + 1],
    ['start_ms', '1'], ['start_ms', 3000], ['end_ms', 999], ['src', ' '], ['src', null], ['tgt', 23], ['id', ''],
  ])('rejects cue field %s=%s with location', (field, value) => {
    expect(() => normalizeTrack({ ...track, cues: [{ ...track.cues[0], [field as string]: value }] })).toThrow(/第 1 条/);
  });
  it('rejects overlap without sorting', () => expect(() => normalizeTrack({ ...track, cues: [track.cues[0], { ...track.cues[1], start_ms: 2999 }] })).toThrow(/第 2 条.*重叠/));
  it.each(['', '1\n00:60:01,000 --> 00:00:03,000\nx', '1\n00:00:01.000 --> 00:00:03,000\nx', '1\n00:00:01,000 --> 00:00:03,000', `${srt}\n\nfragment`, '1\nno time\nx'])('bad SRT %s', text => expect(() => parseSrt(text, 'x.srt')).toThrow());
  it('UTF-8 is required', async () => await expect(readSubtitle(new File([new Uint8Array([0xff])], 'x.srt'))).rejects.toThrow(/UTF-8/));
  it('duration ±100ms does not mutate times', () => {
    expect(() => validateDuration(track, 19900)).not.toThrow();
    expect(() => validateDuration(track, 19899)).toThrow(/c0007/);
    expect(track.cues.at(-1)!.end_ms).toBe(20000);
  });
  it('canonical hashes ignore key order/unknown fields but cover all content', async () => {
    const normalized = normalizeTrack({ ...track, extra: 42, cues: track.cues.map(c => ({ ...c, src: ` ${c.src} `, words: [] })) });
    expect(await hashTrack(normalized)).toBe(await hashTrack(track));
    expect(await hashTrack({ ...track, track_revision: '2' })).not.toBe(await hashTrack(track));
    expect(await hashTrack(track)).toMatch(/^[0-9a-f]{64}$/);
  });
});
describe('M1 / AC-07–10 precise half-open timeline', () => {
  const points: [number, number | null, number | null][] = [
    [0,null,null],[1000,1,null],[1999,1,null],[2000,1,1],[2999,1,1],[3000,2,1],[3500,2,1],
    [3999,2,1],[4000,2,2],[5000,null,2],[5999,null,2],[6000,null,null],[7500,null,3],
    [8000,4,3],[8200,4,null],[9000,4,4],[13000,null,null],[15000,null,5],[15499,null,5],
    [15500,null,null],[17000,6,6],[19500,7,6],[19999,7,6],[20000,null,6],
  ];
  const id = (n: number | null) => n === null ? null : `c${String(n).padStart(4, '0')}`;
  it.each(points)('t=%d audio=%s display/action=%s', (t, a, d) => {
    const view = continuousView(track.cues, t, 1000);
    expect(view.audio?.id ?? null).toBe(id(a));
    expect(view.display?.id ?? null).toBe(id(d));
    expect(view.action).toBe(view.display);
  });
  it('short cue retains the full delayed interval and gap is empty', () => {
    for (let t = 15000; t < 15500; t++) expect(findCue(track.cues, t - 1000)?.id).toBe('c0005');
    expect(findCue(track.cues, 14500)).toBeNull();
  });
  it('tails use end + D > duration, including tolerated overflow', () => {
    expect(tailCues(track.cues, 20000, 1000).map(c => c.id)).toEqual(['c0006','c0007']);
    expect(tailCues(track.cues, 20000, 0)).toEqual([]);
    expect(tailCues(track.cues, 20000, 3000).map(c => c.id)).toEqual(['c0006','c0007']);
    expect(tailCues(track.cues, 19950, 0).map(c => c.id)).toEqual(['c0007']);
    expect(nextAt(track.cues, 5500)?.id).toBe('c0003');
    expect(nextAt(track.cues, 20000)).toBeNull();
  });
});
it('AC-02 SRT preserves textual arrows and accepts multiple blank separators', () => {
  const parsed = parseSrt('1\n00:00:01,000 --> 00:00:02,000\nleft --> right\n\n\n2\n00:00:02,000 --> 00:00:03,000\n123', 'x.srt');
  expect(parsed.cues.map(c => c.src)).toEqual(['left --> right', '123']);
});
