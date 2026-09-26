import type { MediaPort } from './controller';
export class BrowserMedia implements MediaPort {
  private frame = 0;
  private lifetime = new AbortController();
  onTick: (time: number, ended: boolean) => void = () => {};
  onError: (message: string) => void = () => {};
  constructor(readonly element: HTMLVideoElement) {
    const options = { signal: this.lifetime.signal };
    const tick = () => { if (!element.seeking) this.onTick(this.currentMs, false); };
    const frame = () => { tick(); this.frame = element.paused ? 0 : requestAnimationFrame(frame); };
    element.addEventListener('playing', () => { if (!this.frame) this.frame = requestAnimationFrame(frame); }, options);
    element.addEventListener('pause', () => { cancelAnimationFrame(this.frame); this.frame = 0; }, options);
    element.addEventListener('timeupdate', tick, options);
    element.addEventListener('ended', () => { if (!element.seeking && element.ended) this.onTick(this.currentMs, true); }, options);
    element.addEventListener('error', () => this.onError('媒体解码失败：请选用浏览器支持的音视频编码，已有日志仍保留。'), options);
    element.addEventListener('ratechange', () => { if (element.playbackRate !== 1) element.playbackRate = 1; }, options);
    const disableTracks = () => { for (const track of element.textTracks) track.mode = 'disabled'; };
    element.textTracks.addEventListener('addtrack', disableTracks, options);
    disableTracks();
  }
  get currentMs() { return this.element.currentTime * 1000; }
  get durationMs() { return this.element.duration * 1000; }
  get paused() { return this.element.paused; }
  play() { this.element.playbackRate = 1; return this.element.play(); }
  pause() { this.element.pause(); }
  seek(ms: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.reject(new DOMException('操作已取消', 'AbortError'));
    if (!this.element.seeking && Math.abs(this.currentMs - ms) < 0.01) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timeout);
        this.element.removeEventListener('seeked', done);
        this.element.removeEventListener('error', failed);
        signal.removeEventListener('abort', cancelled);
      };
      const done = () => { if (this.element.seeking) return; cleanup(); resolve(); };
      const failed = () => { cleanup(); reject(new Error('媒体无法定位或解码')); };
      const cancelled = () => { cleanup(); reject(new DOMException('操作已取消', 'AbortError')); };
      const timeout = setTimeout(failed, 10000);
      this.element.addEventListener('seeked', done);
      this.element.addEventListener('error', failed);
      signal.addEventListener('abort', cancelled, { once: true });
      try { this.element.currentTime = ms / 1000; } catch { failed(); }
    });
  }
  dispose() { this.lifetime.abort(); cancelAnimationFrame(this.frame); this.pause(); }
}
export function probeMedia(element: HTMLVideoElement, url: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      element.removeEventListener('loadedmetadata', ready);
      element.removeEventListener('error', failed);
      signal.removeEventListener('abort', cancelled);
    };
    const ready = () => { cleanup(); resolve(); };
    const failed = () => { cleanup(); reject(new Error('媒体解码失败或格式不支持；请尝试 H.264/AAC MP4、PCM WAV 或 MP3。')); };
    const cancelled = () => { cleanup(); reject(new DOMException('操作已取消', 'AbortError')); };
    const timer = setTimeout(failed, 15000);
    element.addEventListener('loadedmetadata', ready);
    element.addEventListener('error', failed);
    signal.addEventListener('abort', cancelled, { once: true });
    element.preload = 'auto'; element.controls = false; element.playsInline = true; element.src = url; element.load();
  });
}
