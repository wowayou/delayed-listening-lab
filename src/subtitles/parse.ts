export interface Cue {
  id: string;
  start_ms: number;
  end_ms: number;
  src: string;
  tgt: string | null;
}
export interface Track {
  schema_version: 1;
  media_id: string;
  track_revision: string;
  source_language: string;
  target_language: string | null;
  cues: Cue[];
}
function object(value: unknown, where: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${where}：必须是对象`);
  return value as Record<string, unknown>;
}
function text(value: unknown, where: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${where}：必须是非空字符串`);
  return value.trim();
}
function optionalText(value: unknown, where: string): string | null {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error(`${where}：必须是字符串或 null`);
  return value.trim() || null;
}
export function normalizeTrack(input: unknown): Track {
  const data = object(input, '字幕');
  if (data.schema_version !== 1) throw new Error('schema_version：不支持的版本，仅支持数字 1');
  const media_id = text(data.media_id, 'media_id');
  const track_revision = text(data.track_revision, 'track_revision');
  const source_language = text(data.source_language, 'source_language');
  const target_language = data.target_language === null ? null : text(data.target_language, 'target_language');
  if (!Array.isArray(data.cues) || !data.cues.length) throw new Error('cues：必须是非空数组');
  const seen = new Set<string>();
  let previousEnd = -1;
  const cues = data.cues.map((value: unknown, i: number): Cue => {
    const row = object(value, `第 ${i + 1} 条`);
    const id = text(row.id, `第 ${i + 1} 条 id`);
    const where = `第 ${i + 1} 条 (${id})`;
    if (seen.has(id)) throw new Error(`${where}：重复 ID`);
    seen.add(id);
    const { start_ms, end_ms } = row;
    for (const [name, time] of Object.entries({ start_ms, end_ms })) {
      if (typeof time !== 'number' || !Number.isSafeInteger(time) || time < 0) throw new Error(`${where} ${name}：必须是非负安全整数`);
    }
    const start = start_ms as number, end = end_ms as number;
    if (start >= end) throw new Error(`${where}：start_ms 必须小于 end_ms`);
    if (start < previousEnd) throw new Error(`${where}：乱序或重叠；首版不支持，不会自动排序或合并`);
    previousEnd = end;
    return { id, start_ms: start, end_ms: end, src: text(row.src, `${where} src`), tgt: optionalText(row.tgt, `${where} tgt`) };
  });
  // This field order is the canonical SHA-256 input, not the input object's order.
  return { schema_version: 1, media_id, track_revision, source_language, target_language, cues };
}
export function parseJson(source: string): Track {
  let data: unknown;
  try { data = JSON.parse(source.replace(/^\uFEFF/, '')); }
  catch { throw new Error('JSON 语法错误：请检查文件内容'); }
  return normalizeTrack(data);
}
const timestamp = '(\\d{2,}):([0-5]\\d):([0-5]\\d),(\\d{3})';
const timeLine = new RegExp(`^${timestamp} --> ${timestamp}$`);
export function parseSrt(source: string, filename: string): Track {
  const cleaned = source.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
  if (!cleaned) throw new Error('SRT：空轨');
  const cues = cleaned.split(/\n(?:[ \t]*\n)+/).map((block, i) => {
    const lines = block.split('\n');
    let timeIndex = 0;
    if (/^\d+$/.test(lines[0]!.trim())) timeIndex = 1;
    const match = timeLine.exec(lines[timeIndex]?.trim() ?? '');
    if (!match) throw new Error(`SRT 第 ${i + 1} 条：缺失或非法时间行；仅支持 HH:MM:SS,mmm --> HH:MM:SS,mmm`);
    const ms = (offset: number) => Number(match[offset]) * 3600000 + Number(match[offset + 1]) * 60000 + Number(match[offset + 2]) * 1000 + Number(match[offset + 3]);
    const body = lines.slice(timeIndex + 1).join('\n').trim();
    if (!body) throw new Error(`SRT 第 ${i + 1} 条：缺少正文`);
    if (lines.slice(timeIndex + 1).some(line => timeLine.test(line.trim()))) throw new Error(`SRT 第 ${i + 1} 条：多余时间行或缺少条目空行`);
    return { id: `c${String(i + 1).padStart(4, '0')}`, start_ms: ms(1), end_ms: ms(5), src: body, tgt: null };
  });
  return normalizeTrack({ schema_version: 1, media_id: filename.replace(/\.[^.]+$/, ''), track_revision: 'srt-import-v1', source_language: 'en', target_language: null, cues });
}
export async function readSubtitle(file: File): Promise<Track> {
  let source: string;
  try { source = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()); }
  catch { throw new Error('字幕必须是有效 UTF-8 文本'); }
  if (/\.srt$/i.test(file.name)) return parseSrt(source, file.name);
  if (/\.json$/i.test(file.name)) return parseJson(source);
  throw new Error('仅支持 UTF-8 .srt 或 .json 字幕；视频内嵌字幕请先在外部提取为 .srt');
}
export function validateDuration(track: Track, durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('媒体时长无效，无法解码该媒体');
  const last = track.cues.at(-1)!;
  if (last.end_ms > durationMs + 100) throw new Error(`条目 ${last.id} 结束于 ${last.end_ms}ms，超出媒体时长 ${Math.round(durationMs)}ms + 100ms；请检查配对`);
}
export async function hashTrack(track: Track): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(normalizeTrack(track)));
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, '0')).join('');
}
