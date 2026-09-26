import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';
import type { LogEvent } from '../../src/events/log';
const basic = JSON.parse(readFileSync('fixtures/basic.cues.json', 'utf8'));
async function choose(page: Page, media = 'generated/timing-20s.wav', subtitle: object | string = 'fixtures/basic.cues.json') {
  await page.locator('#import-panel').evaluate((e: HTMLDetailsElement) => { e.open = true; });
  await page.locator('#media-file').setInputFiles(media);
  await page.locator('#subtitle-file').setInputFiles(typeof subtitle === 'string' ? subtitle : { name: 'test.cues.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(subtitle)) });
  await page.locator('#check-import').click();
}
async function load(page: Page, media?: string, subtitle?: object | string) {
  await choose(page, media, subtitle);
  await expect(page.locator('#confirmation')).toBeVisible();
  await page.locator('#confirm-import').click();
  await expect(page.locator('#phase')).toHaveText('已暂停');
}
async function range(page: Page, id: string, value: number) {
  await page.locator(`#${id}`).evaluate((node: HTMLInputElement, v) => {
    node.value = String(v); node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true }));
  }, value);
  await expect(page.locator('#phase')).not.toContainText('正在定位/启动');
}
async function logs(page: Page, scope = 'current'): Promise<LogEvent[]> {
  const downloaded = page.waitForEvent('download');
  await page.locator(`#export-${scope}`).click();
  const file = await downloaded;
  const content = readFileSync((await file.path())!, 'utf8').trim();
  return content ? content.split('\n').map(line => JSON.parse(line)) : [];
}
function sequence(events: LogEvent[]) {
  expect(new Set(events.map(e => e.event_id)).size).toBe(events.length);
  for (const id of new Set(events.map(e => e.session_id))) {
    const group = events.filter(e => e.session_id === id);
    expect(group.map(e => e.seq)).toEqual(group.map((_, i) => i + 1));
    for (const e of group) expect(e.event_id).toBe(`${id}:${e.seq}`);
  }
}
test.beforeEach(async ({ page }) => { await page.goto('/'); });
for (const format of ['wav', 'mp4']) {
  test(`AC-05/11/12 real ${format} playback, continuous and short boundaries`, async ({ page, browser }, testInfo) => {
    await load(page, `generated/timing-20s.${format}`);
    await page.locator('#mode').selectOption('review');
    await page.locator('#play').click();
    await expect(page.locator('#phase')).toContainText('正在听第 1 条');
    await expect.poll(() => page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBeGreaterThan(1.15);
    await page.locator('#play').click();
    await expect(page.locator('#source')).toBeEmpty();
    await page.locator('#play').click();
    await expect(page.locator('#phase')).toContainText('已听完');
    await expect(page.locator('#source')).toHaveText('Listen first.');
    await page.locator('#translate').click(); await expect(page.locator('#translation')).toHaveText('先听。');
    await page.locator('#play').click();
    await expect(page.locator('#phase')).toContainText('正在听第 2 条');
    await expect(page.locator('#source')).toBeEmpty();
    await expect(page.locator('#phase')).toContainText('已听完');
    await expect(page.locator('#source')).toContainText('Then check');
    await range(page, 'progress', 14000);
    await page.locator('#play').click();
    await expect(page.locator('#phase')).toContainText('已听完');
    await expect(page.locator('#source')).toHaveText('All right.');
    const events = await logs(page);
    const boundaries = events.filter(e => e.type === 'review_pause');
    expect(boundaries.map(e => e.details.target_cue_id)).toEqual(['c0001', 'c0002', 'c0005']);
    for (const e of boundaries) {
      const cue = basic.cues.find((c: {id: string}) => c.id === e.details.target_cue_id);
      expect(Number(e.details.observed_boundary_ms)).toBeGreaterThanOrEqual(cue.end_ms);
      expect(Number(e.details.overshoot_ms)).toBeLessThanOrEqual(150);
    }
    sequence(events);
    writeFileSync(testInfo.outputPath(`real-playback-${format}.json`), JSON.stringify({ browser: browser.version(), media: `synthetic 20s ${format}, tone only, no speech`, boundaries }, null, 2));
  });
}
test('AC-01/04/05 invalid pairing, tolerance, cancellation, repeat import and URL lifetime', async ({ page }) => {
  await page.addInitScript(() => {
    const revoke = URL.revokeObjectURL;
    (window as unknown as { revoked: string[] }).revoked = [];
    URL.revokeObjectURL = url => { (window as unknown as { revoked: string[] }).revoked.push(url); revoke(url); };
  });
  await page.reload(); await load(page);
  const oldUrl = await page.locator('video').getAttribute('src');
  const first = (await logs(page))[0]!.session_id;
  const invalid = structuredClone(basic); invalid.cues[6].end_ms = 20101;
  await choose(page, undefined, invalid); await expect(page.locator('#import-status')).toContainText('超出媒体');
  expect(await page.locator('video').getAttribute('src')).toBe(oldUrl);
  await choose(page); await page.locator('#cancel-import').click(); expect((await logs(page))[0]!.session_id).toBe(first);
  const tolerated = structuredClone(basic); tolerated.cues[6].end_ms = 20080;
  await load(page, undefined, tolerated); await page.locator('#mode').selectOption('review');
  await range(page, 'progress', 19500); await page.locator('#play').click();
  await expect(page.locator('#phase')).toContainText('已听完'); await expect(page.locator('#source')).toHaveText('Goodbye.');
  await page.locator('#play').click(); await expect(page.locator('#phase')).toContainText('完成');
  const second = await logs(page); expect(second[0]!.session_id).not.toBe(first);
  expect(second.filter(e => e.type === 'review_pause')).toHaveLength(1);
  expect(await page.evaluate(url => (window as unknown as { revoked: string[] }).revoked.includes(url!), oldUrl)).toBe(true);
  await page.locator('#import-panel').evaluate((e: HTMLDetailsElement) => { e.open = true; });
  await page.locator('#media-file').setInputFiles({ name: 'broken.mp4', mimeType: 'video/mp4', buffer: Buffer.from('not a media file') });
  await page.locator('#subtitle-file').setInputFiles('fixtures/basic.cues.json'); await page.locator('#check-import').click();
  await expect(page.locator('#import-status')).toContainText('解码失败'); expect((await logs(page))[0]!.session_id).toBe(second[0]!.session_id);
});
test('AC-02/03 browser SRT and location errors', async ({ page }) => {
  await load(page, undefined, 'fixtures/basic.en.srt'); await range(page, 'progress', 2000);
  await expect(page.locator('#source')).toHaveText('Listen first.'); await expect(page.locator('#translation-note')).toHaveText('此条无译文');
  const invalid = structuredClone(basic); invalid.cues[1].id = 'c0001';
  await choose(page, undefined, invalid); await expect(page.locator('#import-status')).toContainText('第 2 条 (c0001)：重复 ID');
  await expect(page.locator('#source')).toHaveText('Listen first.');
});
test('AC-06–09/13/15/19 precise seeks, delay, replay target and explanatory logs', async ({ page }, testInfo) => {
  await load(page);
  for (const t of [0, 1000, 1999]) { await range(page, 'progress', t); await expect(page.locator('#source')).toBeEmpty(); expect(await page.getByText('Listen first.', { exact: true }).count()).toBe(0); }
  expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.controls || Array.from(v.textTracks).some(t => t.mode !== 'disabled'))).toBe(false);
  await range(page, 'progress', 3500); await expect(page.locator('#cue-debug')).toContainText('音频条目：c0002 · 显示条目：c0001');
  await page.locator('#translate').click(); await page.locator('#mark').click(); await expect(page.locator('#feedback')).toContainText('第 1 条');
  const frozen = await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime);
  await page.waitForTimeout(200); expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(frozen);
  await page.locator('#replay').click(); await expect(page.locator('#source')).toBeEmpty(); await expect(page.locator('#translation')).toBeEmpty();
  await expect(page.locator('#phase')).toContainText('重听核对'); await expect(page.locator('#source')).toHaveText('Listen first.');
  await page.locator('#play').click(); await expect(page.locator('#phase')).toContainText('连续播放中');
  await page.locator('#play').click(); await range(page, 'progress', 3500);
  await range(page, 'delay', 0); await expect(page.locator('#source')).toContainText('Then check');
  await range(page, 'delay', 3000); await expect(page.locator('#source')).toBeEmpty();
  expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(3.5);
  await range(page, 'delay', 1000); await range(page, 'progress', 6000); await expect(page.locator('#source')).toBeEmpty();
  await range(page, 'progress', 15000); await expect(page.locator('#source')).toHaveText('All right.');
  await range(page, 'progress', 15499); await expect(page.locator('#source')).toHaveText('All right.');
  await range(page, 'progress', 15500); await expect(page.locator('#source')).toBeEmpty();
  await range(page, 'progress', 7500); await expect(page.locator('#translation-note')).toHaveText('此条无译文');
  await page.locator('#mode').selectOption('review'); await range(page, 'progress', 5500);
  await expect(page.locator('#phase')).toContainText('待播放第 3 条'); await expect(page.locator('#delay')).toBeDisabled();
  const events = await logs(page); sequence(events);
  expect(events.find(e => e.type === 'replay')).toMatchObject({ media_time_ms: 3500, audio_cue_id: 'c0002', display_cue_id: 'c0001', action_cue_id: 'c0001', details: { target_cue_id: 'c0001' } });
  expect(events.find(e => e.type === 'delay_change')).toMatchObject({ delay_ms: 1000, details: { from_ms: 1000, to_ms: 0 } });
  expect(events.find(e => e.type === 'mode_change')).toMatchObject({ mode: 'continuous', details: { from: 'continuous', to: 'review' } });
  expect(events.filter(e => e.type === 'review_pause')).toHaveLength(1);
  writeFileSync(testInfo.outputPath('interaction-log.jsonl'), events.map(e => JSON.stringify(e)).join('\n') + '\n');
});
test('AC-10 natural ended tails versus explicit seek, per-target actions and restart', async ({ page }) => {
  await load(page); await range(page, 'progress', 20000); await expect(page.locator('#tail-panel')).toBeHidden();
  await expect(page.locator('#play')).toContainText('从头播放'); await page.locator('#play').click();
  await expect(page.locator('#phase')).toHaveText('片尾补看', { timeout: 25000 });
  await expect(page.locator('#tail-list button')).toHaveCount(2); await expect(page.locator('#translation')).toBeEmpty();
  await page.locator('#tail-list button').nth(1).click(); await expect(page.locator('#target')).toContainText('c0007');
  await page.locator('#translate').click(); await expect(page.locator('#translation')).toHaveText('再见。');
  await page.locator('#mark').click(); await page.locator('#replay').click();
  await expect(page.locator('#phase')).toContainText('重听核对'); await page.locator('#play').click();
  await expect(page.locator('#phase')).toHaveText('片尾补看'); expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.currentTime)).toBe(20);
  await range(page, 'delay', 0); await expect(page.locator('#tail-panel')).toBeHidden();
  await expect(page.locator('#phase')).toHaveText('播放结束');
  const events = await logs(page); expect(events.filter(e => e.type === 'review_pause')).toHaveLength(1);
});
test('AC-14/16 keyboard, repeat, editable exclusions, rapid cancellation and replacement', async ({ page }) => {
  await load(page); await range(page, 'progress', 3500);
  await page.locator('body').click({ position: { x: 3, y: 3 } });
  await page.keyboard.press('t'); await expect(page.locator('#translation')).toHaveText('先听。');
  await page.keyboard.down('u'); await page.keyboard.down('u'); await page.keyboard.up('u');
  expect((await logs(page)).filter(e => e.type === 'not_understood')).toHaveLength(1);
  await page.locator('#delay').focus(); await page.keyboard.press('t'); await expect(page.locator('#translation')).toHaveText('先听。');
  await page.locator('#mode').focus(); await page.keyboard.press('r'); expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  await page.locator('#mark').focus(); await page.keyboard.press('Space');
  expect((await logs(page)).filter(e => e.type === 'not_understood')).toHaveLength(2);
  await page.locator('#translate').focus(); await page.keyboard.press('Enter'); await expect(page.locator('#translation')).toBeEmpty();
  await page.locator('body').click({ position: { x: 3, y: 3 } }); await page.keyboard.press('Control+t');
  await page.keyboard.press('r'); await page.keyboard.press('r');
  await range(page, 'progress', 5500); await page.locator('#mode').selectOption('review');
  await page.locator('#play').click(); await expect(page.locator('#phase')).toContainText('正在听第 3 条');
  await page.locator('body').click({ position: { x: 3, y: 3 } }); await page.keyboard.press('t'); await page.keyboard.press('u');
  await expect(page.locator('#translation')).toBeEmpty();
  await page.keyboard.press('Space'); await expect(page.locator('#source')).toBeEmpty();
  await load(page); await page.waitForTimeout(400); await expect(page.locator('#phase')).toHaveText('已暂停');
  await expect(page.locator('#source')).toBeEmpty();
});
test('AC-17 rejected play, decode failure and hidden handler preserve committed logs', async ({ page }) => {
  await load(page);
  await page.evaluate(() => { HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('test blocked', 'NotAllowedError')); });
  await page.locator('#play').click(); await expect(page.locator('#player-error')).toContainText('test blocked');
  await expect(page.locator('#phase')).not.toContainText('连续播放中');
  expect((await logs(page)).filter(e => e.type === 'play')).toHaveLength(0);
  await page.reload(); await load(page); await page.locator('#play').click();
  // Fault injection: exercise visibility policy separately from actual OS tab switching.
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await expect(page.locator('#phase')).toHaveText('已暂停');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  expect((await logs(page)).filter(e => e.type === 'pause' && e.details.reason === 'hidden')).toHaveLength(1);
  await page.locator('video').evaluate((v: HTMLVideoElement) => { v.src = 'data:video/mp4;base64,YmFk'; v.load(); });
  await expect(page.locator('#player-error')).toContainText('解码失败');
  expect((await logs(page)).length).toBeGreaterThan(1);
});
test('AC-18 no HTML execution or external requests; AC-21 long text, fixed controls, desktop sizes', async ({ page }, testInfo) => {
  const requests: string[] = []; page.on('request', r => requests.push(`${r.method()} ${r.url()}`));
  const malicious = structuredClone(basic);
  const payload = '<img src=x onerror="window.PWNED=1"><script>window.PWNED=2</script>';
  malicious.cues[0].src = `${payload}\n${'Long text with complete wrapping. '.repeat(100)}`; malicious.cues[0].tgt = `${payload}\n${'长译文完整换行。'.repeat(100)}`;
  await load(page, undefined, malicious); await range(page, 'progress', 3500);
  await expect(page.locator('#source')).toContainText(payload);
  for (const size of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(size);
    const before = await page.locator('#play').boundingBox(); await page.locator('#translate').click();
    expect(await page.locator('#play').boundingBox()).toEqual(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(page.locator('#source')).toHaveCSS('white-space', 'pre-wrap'); await expect(page.locator('#source')).toHaveCSS('overflow-wrap', 'anywhere');
    await page.screenshot({ path: testInfo.outputPath(`layout-${size.width}.png`), fullPage: true });
    await page.locator('#translate').click();
  }
  expect(await page.locator('.captions img, .captions script').count()).toBe(0);
  expect(await page.evaluate(() => 'PWNED' in window)).toBe(false);
  expect(requests.filter(r => !r.includes('127.0.0.1:5173') && !r.includes('blob:http://127.0.0.1:5173'))).toEqual([]);
  expect(requests.some(r => r.startsWith('POST') || r.endsWith('/x'))).toBe(false);
  writeFileSync(testInfo.outputPath('network.json'), JSON.stringify(requests, null, 2));
});
test('AC-20 persistence, multiple sessions and export queue snapshot', async ({ page }) => {
  await load(page); await range(page, 'progress', 3500); await page.locator('#mark').click();
  const first = await logs(page); sequence(first);
  await page.reload(); const historical = await logs(page, 'all'); expect(historical).toEqual(first);
  await load(page); await range(page, 'progress', 3500); await page.locator('#mark').click();
  const all = await logs(page, 'all'); sequence(all); expect(new Set(all.map(e => e.session_id)).size).toBe(2);
  expect((await logs(page)).every(e => e.session_id !== first[0]!.session_id)).toBe(true);
});
test('AC-20 IndexedDB write failure, unsaved export and idempotent retry', async ({ page }) => {
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    (window as unknown as { restoreStore: () => void }).restoreStore = () => { IDBObjectStore.prototype.put = original; };
    IDBObjectStore.prototype.put = function() { throw new DOMException('injected quota', 'QuotaExceededError'); };
  });
  await load(page); await range(page, 'progress', 3500); await page.locator('#mark').click();
  await expect(page.locator('#save-status')).toContainText('保存失败');
  const unsaved = await logs(page, 'unsaved'); sequence(unsaved); expect(unsaved.length).toBeGreaterThan(1);
  expect(await logs(page)).toEqual([]);
  await page.evaluate(() => (window as unknown as { restoreStore: () => void }).restoreStore());
  await page.locator('#retry-save').click(); await expect(page.locator('#save-status')).toContainText('已保存');
  expect(await logs(page)).toEqual(unsaved); await page.reload(); expect(await logs(page, 'all')).toEqual(unsaved);
});
test('AC-16 keyboard-only import and practice, native Enter repeat, editable exclusions', async ({ page }) => {
  // Only keyboard navigation activates file inputs; the OS picker supplies fixture files.
  await page.keyboard.press('Tab'); await expect(page.locator('summary')).toBeFocused();
  await page.keyboard.press('Tab'); await expect(page.locator('#media-file')).toBeFocused();
  let chooser = page.waitForEvent('filechooser'); await page.keyboard.press('Enter'); await (await chooser).setFiles('generated/timing-20s.wav');
  await page.keyboard.press('Tab'); await expect(page.locator('#subtitle-file')).toBeFocused();
  chooser = page.waitForEvent('filechooser'); await page.keyboard.press('Enter'); await (await chooser).setFiles('fixtures/basic.cues.json');
  await page.keyboard.press('Tab'); await expect(page.locator('#check-import')).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page.locator('#confirmation')).toBeVisible(); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  await expect(page.locator('#confirm-import')).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page.locator('#play')).toBeFocused(); await page.keyboard.press('Space');
  await expect(page.locator('#source')).toHaveText('Listen first.'); await page.keyboard.press('Space');
  await page.keyboard.press('Tab'); await expect(page.locator('#translate')).toBeFocused(); await page.keyboard.press('Enter');
  await expect(page.locator('#translation')).toHaveText('先听。'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  await expect(page.locator('#phase')).toContainText('重听核对'); await page.keyboard.press('Tab');
  await expect(page.locator('#mark')).toBeFocused(); await page.keyboard.down('Enter'); await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
  expect((await logs(page)).filter(e => e.type === 'not_understood')).toHaveLength(1);
  for (const tag of ['input', 'textarea', 'div']) {
    await page.evaluate(t => { const node = document.createElement(t); node.id = 'editable-test'; if (t === 'div') node.contentEditable = 'true'; document.body.append(node); node.focus(); }, tag);
    await page.keyboard.press('t'); await page.keyboard.press('r'); await page.keyboard.press('u');
    await expect(page.locator('#phase')).toContainText('重听核对'); await expect(page.locator('#translation')).toBeEmpty();
    await page.locator('#editable-test').evaluate(node => node.remove());
  }
  expect((await logs(page)).filter(e => e.type === 'not_understood')).toHaveLength(1);
});

for (const entry of ['seek in review', 'switch mode at end']) {
  test(`AC-14/16/19 no-target shortcuts are no-ops after ${entry}`, async ({ page }, testInfo) => {
    await load(page);
    if (entry === 'seek in review') await page.locator('#mode').selectOption('review');
    await range(page, 'progress', 20000);
    if (entry === 'switch mode at end') await page.locator('#mode').selectOption('review');
    await expect(page.locator('#phase')).toHaveText('已到末尾 · 无待播放片段');
    for (const id of ['play', 'translate', 'replay', 'mark']) await expect(page.locator(`#${id}`)).toBeDisabled();
    const state = async () => ({
      phase: await page.locator('#phase').textContent(),
      target: await page.locator('#target').textContent(),
      source: await page.locator('#source').textContent(),
      translation: await page.locator('#translation').textContent(),
      media: await page.locator('video').evaluate((v: HTMLVideoElement) => ({ time: v.currentTime, paused: v.paused })),
    });
    const before = { state: await state(), events: await logs(page) };
    await page.locator('body').click({ position: { x: 3, y: 3 } });
    await page.keyboard.press('Space');
    await page.keyboard.press('Space');
    await page.keyboard.down('Space'); await page.keyboard.down('Space'); await page.keyboard.up('Space');
    for (const key of ['t', 'r', 'u']) await page.keyboard.press(key);
    const after = { state: await state(), events: await logs(page) };
    writeFileSync(testInfo.outputPath('no-target-shortcuts.json'), JSON.stringify({ entry, before, after }, null, 2));
    expect(after).toEqual(before);
    expect(after.events.some(e => e.type === 'ended')).toBe(false);
    sequence(after.events);
    for (const id of ['play', 'translate', 'replay', 'mark']) await expect(page.locator(`#${id}`)).toBeDisabled();
  });
}
