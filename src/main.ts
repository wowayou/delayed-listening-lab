import './ui/style.css';
import { hashTrack, readSubtitle, validateDuration } from './subtitles/parse';
import type { Track } from './subtitles/parse';
import { Controller } from './player/controller';
import { BrowserMedia, probeMedia } from './player/media';
import { EventQueue, IndexedEventStore, jsonl, SessionLog } from './events/log';
import { handleShortcut } from './ui/keyboard';
const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const button = (id: string) => el<HTMLButtonElement>(id);
const input = (id: string) => el<HTMLInputElement>(id);
const text = (id: string, value: string) => { const node = el(id); if (node.textContent !== value) node.textContent = value; };
const clock = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${(ms / 1000 % 60).toFixed(1).padStart(4, '0')}`;
const queue = new EventQueue(new IndexedEventStore());
let controller: Controller | undefined;
let adapter: BrowserMedia | undefined;
let session: SessionLog | undefined;
let activeUrl: string | undefined;
let loading = new AbortController();
let selectedMedia: File | undefined;
let selectedSubtitle: File | undefined;
let candidate: { file: File; track: Track; trackId: string; video: HTMLVideoElement; url: string } | undefined;
let tailKey = '';
let feedbackTimer: ReturnType<typeof setTimeout> | undefined;
let lastFeedback = '';
function disposeCandidate() {
  loading.abort(); loading = new AbortController();
  if (candidate) {
    candidate.video.pause(); candidate.video.removeAttribute('src'); candidate.video.load();
    URL.revokeObjectURL(candidate.url); candidate = undefined;
  }
  el('confirmation').hidden = true;
  button('check-import').disabled = false;
}
for (const id of ['media-file', 'subtitle-file']) {
  input(id).addEventListener('click', () => controller?.pause('import'));
  input(id).addEventListener('change', () => {
    controller?.pause('import'); disposeCandidate();
    const file = input(id).files?.[0];
    if (id === 'media-file') selectedMedia = file;
    else selectedSubtitle = file;
    text('import-status', '待检查。取消或校验失败不会替换已加载会话。');
  });
}
button('cancel-import').onclick = () => {
  controller?.pause('import'); disposeCandidate(); selectedMedia = selectedSubtitle = undefined;
  input('media-file').value = input('subtitle-file').value = '';
  text('import-status', '已取消，原会话保留并保持暂停。');
};
button('check-import').onclick = async () => {
  controller?.pause('import'); disposeCandidate();
  if (!selectedMedia || !selectedSubtitle) { text('import-status', '请选择一对音视频与字幕文件。'); return; }
  const signal = loading.signal;
  button('check-import').disabled = true; text('import-status', '正在校验字幕与媒体时长…');
  const file = selectedMedia, subtitleFile = selectedSubtitle;
  const video = document.createElement('video');
  let url: string | undefined;
  try {
    const track = await readSubtitle(subtitleFile);
    if (signal.aborted) return;
    url = URL.createObjectURL(file);
    await probeMedia(video, url, signal);
    validateDuration(track, video.duration * 1000);
    const trackId = await hashTrack(track);
    if (signal.aborted) return;
    candidate = { file, track, trackId, video, url }; url = undefined;
    text('pair-summary', `媒体：${file.name} · ${clock(video.duration * 1000)}；字幕：${subtitleFile.name} · ${track.cues.length} 条 · ${clock(track.cues[0]!.start_ms)}—${clock(track.cues.at(-1)!.end_ms)}。逻辑媒体 ID：${track.media_id}（不代表已匹配）。请确认声音与字幕对应。`);
    el('confirmation').hidden = false;
    text('import-status', '校验通过，等待确认；尚未替换会话。');
  } catch (e) { if (!signal.aborted) text('import-status', e instanceof Error ? e.message : String(e)); }
  finally {
    if (url) { video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); }
    if (!signal.aborted) button('check-import').disabled = false;
  }
};
button('confirm-import').onclick = () => {
  if (!candidate) return;
  const { file, track, trackId, video, url } = candidate;
  candidate = undefined; disposeCandidate();
  controller?.dispose(); adapter?.dispose();
  const previous = el('media-host').querySelector('video');
  if (previous) { previous.removeAttribute('src'); previous.load(); }
  if (activeUrl) URL.revokeObjectURL(activeUrl);
  activeUrl = url;
  video.volume = Number(input('volume').value);
  video.setAttribute('aria-label', '本地媒体（通过下方控制操作）');
  video.className = file.type.startsWith('audio/') || /\.(wav|mp3|ogg|m4a|flac)$/i.test(file.name) ? 'audio-only' : '';
  el('media-host').replaceChildren(video);
  adapter = new BrowserMedia(video);
  session = new SessionLog(queue, track, trackId);
  controller = new Controller(track, adapter, session.emit);
  adapter.onTick = (t, ended) => controller?.tick(t, ended);
  adapter.onError = message => controller?.fail(message);
  controller.onChange = render;
  session.emit('session_start', 'system', { media_metadata: { name: file.name, size: file.size, last_modified: file.lastModified, duration_ms: video.duration * 1000 }, track_revision: track.track_revision, source_language: track.source_language, target_language: track.target_language }, controller.context());
  selectedMedia = selectedSubtitle = undefined;
  input('media-file').value = input('subtitle-file').value = '';
  text('loaded-summary', `${file.name} · ${track.cues.length} 条`);
  text('media-info', `${video.className ? '音频' : '视频'} · ${clock(video.duration * 1000)} · 本地播放`);
  text('import-status', '会话已创建。请主动按播放开始。');
  el<HTMLDetailsElement>('import-panel').open = false;
  tailKey = ''; button('export-current').disabled = false;
  render(); button('play').focus();
};
function render() {
  const c = controller;
  if (!c) return;
  const { audio, display, action } = c.view();
  const n = action ? c.track.cues.indexOf(action) + 1 : 0;
  let phase = c.playing ? '连续播放中' : '已暂停';
  if (c.phase === 'review_ready') phase = action ? `待播放第 ${n} 条` : '已到末尾 · 无待播放片段';
  if (c.phase === 'focused_listening') phase = `${c.playing ? '正在听' : '聆听已暂停'}第 ${n} 条${c.focusReason === 'replay' ? ' · 重听' : ''}`;
  if (c.phase === 'focused_review') phase = c.focusReason === 'replay' ? '重听核对' : '片段核对 · 已听完';
  if (c.phase === 'ended') phase = c.tails.length ? '片尾补看' : c.mode === 'review' ? '片段练习完成' : '播放结束';
  if (c.busy) phase += ' · 正在定位/启动';
  text('phase', phase);
  text('target', action ? `操作目标：第 ${n} 条 / ${c.track.cues.length}（${action.id}）` : '操作目标：无');
  text('source', display?.src ?? '');
  text('source-note', display ? '' : c.phase === 'focused_listening' || c.phase === 'review_ready' ? '听完这个片段，再核对原文。' : '此刻没有显示条目。先听，不预读。');
  text('translation', c.translation ? display?.tgt ?? '' : '');
  text('translation-note', c.translation ? '' : display ? display.tgt ? '译文已隐藏，按需查看。' : '此条无译文' : '原文出现后才可核对译文。');
  const primary = c.playing ? '暂停' : c.busy ? '取消等待' : c.phase === 'focused_review' ? '继续' : c.phase === 'ended' && c.mode === 'review' ? '已完成' : c.mode === 'continuous' && c.time >= c.media.durationMs ? '从头播放' : '播放';
  text('play', `${primary}  Space`);
  button('play').disabled = c.mode === 'review' && (c.phase === 'ended' || c.phase === 'review_ready' && !action);
  button('replay').disabled = !action;
  button('translate').disabled = !display?.tgt;
  button('mark').disabled = !display;
  text('translate', `${c.translation ? '隐藏' : '显示'}译文  T`);
  el<HTMLSelectElement>('mode').disabled = false; el<HTMLSelectElement>('mode').value = c.mode;
  input('delay').disabled = c.mode === 'review' || c.phase.startsWith('focused_');
  if (document.activeElement !== input('delay')) input('delay').value = String(c.delay);
  text('delay-value', `${(c.delay / 1000).toFixed(1)} 秒`);
  text('delay-note', c.mode === 'review' ? '听完即暂停，延迟不适用；保留 B 的设置。' : c.phase.startsWith('focused_') ? '重听期间延迟不适用，继续后恢复 B。' : '原文整体后移；0 秒即正常字幕。');
  input('progress').disabled = false; input('progress').max = String(c.media.durationMs);
  if (document.activeElement !== input('progress')) input('progress').value = String(c.time);
  text('time', `${clock(c.time)} / ${clock(c.media.durationMs)}`);
  text('cue-debug', `音频条目：${audio?.id ?? '—'} · 显示条目：${display?.id ?? '—'} · 1 倍速`);
  text('player-error', c.error);
  text('feedback', c.feedback);
  if (c.feedback !== lastFeedback) {
    lastFeedback = c.feedback; clearTimeout(feedbackTimer);
    if (c.feedback) feedbackTimer = setTimeout(() => { if (controller === c) { c.feedback = ''; render(); } }, 2500);
  }
  el('tail-panel').hidden = !c.tails.length;
  const key = JSON.stringify(c.tails.map(cue => cue.id));
  if (key !== tailKey) {
    tailKey = key;
    el('tail-list').replaceChildren(...c.tails.map(cue => {
      const b = document.createElement('button');
      b.textContent = `第 ${c.track.cues.indexOf(cue) + 1} 条 · ${cue.src}`;
      b.dataset.cueId = cue.id;
      b.onclick = () => c.selectTail(cue.id);
      return b;
    }));
  }
  for (const b of el('tail-list').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.cueId === c.selectedTail?.id));
}
button('play').onclick = () => { void controller?.toggle(); };
button('replay').onclick = () => { void controller?.replay(); };
button('translate').onclick = () => controller?.toggleTranslation();
button('mark').onclick = () => controller?.mark();
el<HTMLSelectElement>('mode').onchange = () => controller?.setMode(el<HTMLSelectElement>('mode').value as 'continuous' | 'review');
input('delay').oninput = () => text('delay-value', `${(Number(input('delay').value) / 1000).toFixed(1)} 秒（松开后生效）`);
input('delay').onchange = () => controller?.setDelay(Number(input('delay').value));
input('progress').onchange = () => { void controller?.seek(Number(input('progress').value)); };
input('progress').oninput = () => text('time', `${clock(Number(input('progress').value))} / ${clock(controller?.media.durationMs ?? 0)}`);
input('volume').oninput = () => { if (adapter) adapter.element.volume = Number(input('volume').value); };
document.addEventListener('keydown', e => handleShortcut(e, controller));
document.addEventListener('visibilitychange', () => { if (document.hidden) controller?.pause('hidden'); });
queue.onChange = () => {
  text('save-status', queue.failure ? `保存失败：${queue.failure}。${queue.unsaved.length} 条仅在内存，关闭页面会丢失；请重试或下载未保存记录。` : queue.unsaved.length ? `待保存 ${queue.unsaved.length} 条 · 本页已提交 ${queue.saved} 条` : `已保存 · 本页已提交 ${queue.saved} 条；历史可导出。`);
  el('save-status').classList.toggle('error', !!queue.failure);
  button('retry-save').hidden = !queue.failure; button('export-unsaved').hidden = !queue.failure;
};
function download(content: string, name: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/x-ndjson;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function exportEvents(scope: 'all' | 'current' | 'unsaved') {
  if (scope === 'current' && !session) return;
  try {
    const events = scope === 'unsaved' ? await queue.unsavedSnapshot() : await queue.snapshot(scope === 'current' ? session!.id : undefined);
    download(jsonl(events), `listening-${scope}-${new Date().toISOString().replace(/[:.]/g, '-')}.jsonl`);
    text('export-status', `已导出 ${events.length} 条${scope === 'unsaved' ? '未保存' : '已提交'}记录。${queue.failure && scope !== 'unsaved' ? '另有未保存记录，请单独下载。' : ''}`);
  } catch (e) { text('export-status', `导出失败：${String(e)}。若存在内存记录，请下载未保存记录。`); }
}
button('export-current').onclick = () => { void exportEvents('current'); };
button('export-all').onclick = () => { void exportEvents('all'); };
button('export-unsaved').onclick = () => { void exportEvents('unsaved'); };
button('retry-save').onclick = () => { void queue.retry(); };
window.addEventListener('beforeunload', e => { if (queue.unsaved.length) { e.preventDefault(); e.returnValue = ''; } });
