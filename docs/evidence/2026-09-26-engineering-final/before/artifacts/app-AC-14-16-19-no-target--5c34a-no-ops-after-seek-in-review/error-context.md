# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: app.spec.ts >> AC-14/16/19 no-target shortcuts are no-ops after seek in review
- Location: tests/e2e/app.spec.ts:259:3

# Error details

```
Error: expect(received).toEqual(expected) // deep equality

- Expected  -  1
+ Received  + 23

@@ -75,17 +75,39 @@
        "session_elapsed_ms": 48,
        "session_id": "92be6a83-a139-4369-a068-15f5e4e3f2e2",
        "track_id": "b22706314b415a626bc8f9eb6cbdc2c515f8cb239581a5dea629eb24d1f416f6",
        "type": "seek",
      },
+     Object {
+       "action_cue_id": null,
+       "at_utc": "2026-09-26T11:26:44.767Z",
+       "audio_cue_id": null,
+       "delay_ms": 1000,
+       "details": Object {
+         "reason": "review_complete",
+       },
+       "display_cue_id": null,
+       "event_id": "92be6a83-a139-4369-a068-15f5e4e3f2e2:4",
+       "event_schema_version": 1,
+       "media_id": "timing-demo-20s",
+       "media_time_ms": 20000,
+       "mode": "review",
+       "origin": "keyboard",
+       "phase": "review_ready",
+       "seq": 4,
+       "session_elapsed_ms": 208,
+       "session_id": "92be6a83-a139-4369-a068-15f5e4e3f2e2",
+       "track_id": "b22706314b415a626bc8f9eb6cbdc2c515f8cb239581a5dea629eb24d1f416f6",
+       "type": "ended",
+     },
    ],
    "state": Object {
      "media": Object {
        "paused": true,
        "time": 20,
      },
-     "phase": "已到末尾 · 无待播放片段",
+     "phase": "片段练习完成",
      "source": "",
      "target": "操作目标：无",
      "translation": "",
    },
  }
```

# Page snapshot

```yaml
- main [ref=e2]:
  - generic [ref=e3]:
    - generic [ref=e4]:
      - paragraph [ref=e5]: DELAYED LISTENING LAB · 本地原型
      - heading "先听，再核对。" [level=1] [ref=e6]
    - generic [ref=e7]: 文件不上传 · 仅 1 倍速
  - group [ref=e8]:
    - generic "导入练习素材 timing-20s.wav · 7 条" [ref=e9] [cursor=pointer]
  - region "听力练习" [ref=e10]:
    - generic [ref=e11]:
      - generic "本地媒体（通过下方控制操作）" [ref=e13]
      - paragraph [ref=e14]: 音频 · 00:20.0 · 本地播放
    - generic [ref=e15]:
      - generic [ref=e16]: 练习模式
      - combobox "练习模式" [ref=e17]:
        - option "连续延迟 B"
        - option "片段核对" [selected]
      - generic [ref=e18]:
        - text: 学习延迟
        - status [ref=e19]: 1.0 秒
      - slider "学习延迟" [disabled] [ref=e20] [cursor=pointer]: "1000"
      - paragraph [ref=e21]: 听完即暂停，延迟不适用；保留 B 的设置。
      - generic [ref=e22]: 音量
      - slider "音量" [ref=e23] [cursor=pointer]: "0.7"
    - generic [ref=e24]:
      - generic [ref=e25]:
        - status [ref=e26]: 片段练习完成
        - generic [ref=e27]: 操作目标：无
      - generic [ref=e28]:
        - generic "原文，可滚动阅读" [ref=e29]:
          - generic [ref=e30]: 原文
          - paragraph [ref=e31]: 此刻没有显示条目。先听，不预读。
        - generic "译文，可滚动阅读" [ref=e32]:
          - generic [ref=e33]: 译文
          - paragraph [ref=e34]: 原文出现后才可核对译文。
      - generic [ref=e35]:
        - generic [ref=e36]: 播放进度
        - slider "播放进度" [ref=e37] [cursor=pointer]: "20000"
        - status [ref=e38]: 00:20.0 / 00:20.0
      - generic [ref=e39]:
        - button "已完成 Space" [disabled] [ref=e40]
        - button "显示译文 T" [disabled] [ref=e41]
        - button "重听片段 R" [disabled] [ref=e42]
        - button "没听懂 U" [disabled] [ref=e43]
        - status
      - paragraph [ref=e44]: 音频条目：— · 显示条目：— · 1 倍速
  - generic [ref=e45]:
    - generic [ref=e46]:
      - heading "本地练习记录" [level=2] [ref=e47]
      - status [ref=e48]: 已保存 · 本页已提交 4 条；历史可导出。
    - generic [ref=e49]:
      - button "导出本次会话" [active] [ref=e50] [cursor=pointer]
      - button "导出全部会话" [ref=e51] [cursor=pointer]
    - paragraph [ref=e52]: JSONL 每行一条事件，不含字幕正文或媒体内容，但包含文件名。仅存于当前浏览器的本站 IndexedDB；清理网站数据会删除记录，导出前留意隐私。
    - status [ref=e53]: 已导出 4 条已提交记录。
```

# Test source

```ts
  181 |   await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: false }); document.dispatchEvent(new Event('visibilitychange')); });
  182 |   expect(await page.locator('video').evaluate((v: HTMLVideoElement) => v.paused)).toBe(true);
  183 |   expect((await logs(page)).filter(e => e.type === 'pause' && e.details.reason === 'hidden')).toHaveLength(1);
  184 |   await page.locator('video').evaluate((v: HTMLVideoElement) => { v.src = 'data:video/mp4;base64,YmFk'; v.load(); });
  185 |   await expect(page.locator('#player-error')).toContainText('解码失败');
  186 |   expect((await logs(page)).length).toBeGreaterThan(1);
  187 | });
  188 | test('AC-18 no HTML execution or external requests; AC-21 long text, fixed controls, desktop sizes', async ({ page }, testInfo) => {
  189 |   const requests: string[] = []; page.on('request', r => requests.push(`${r.method()} ${r.url()}`));
  190 |   const malicious = structuredClone(basic);
  191 |   const payload = '<img src=x onerror="window.PWNED=1"><script>window.PWNED=2</script>';
  192 |   malicious.cues[0].src = `${payload}\n${'Long text with complete wrapping. '.repeat(100)}`; malicious.cues[0].tgt = `${payload}\n${'长译文完整换行。'.repeat(100)}`;
  193 |   await load(page, undefined, malicious); await range(page, 'progress', 3500);
  194 |   await expect(page.locator('#source')).toContainText(payload);
  195 |   for (const size of [{ width: 1440, height: 900 }, { width: 1024, height: 768 }]) {
  196 |     await page.setViewportSize(size);
  197 |     const before = await page.locator('#play').boundingBox(); await page.locator('#translate').click();
  198 |     expect(await page.locator('#play').boundingBox()).toEqual(before);
  199 |     expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  200 |     await expect(page.locator('#source')).toHaveCSS('white-space', 'pre-wrap'); await expect(page.locator('#source')).toHaveCSS('overflow-wrap', 'anywhere');
  201 |     await page.screenshot({ path: testInfo.outputPath(`layout-${size.width}.png`), fullPage: true });
  202 |     await page.locator('#translate').click();
  203 |   }
  204 |   expect(await page.locator('.captions img, .captions script').count()).toBe(0);
  205 |   expect(await page.evaluate(() => 'PWNED' in window)).toBe(false);
  206 |   expect(requests.filter(r => !r.includes('127.0.0.1:5173') && !r.includes('blob:http://127.0.0.1:5173'))).toEqual([]);
  207 |   expect(requests.some(r => r.startsWith('POST') || r.endsWith('/x'))).toBe(false);
  208 |   writeFileSync(testInfo.outputPath('network.json'), JSON.stringify(requests, null, 2));
  209 | });
  210 | test('AC-20 persistence, multiple sessions and export queue snapshot', async ({ page }) => {
  211 |   await load(page); await range(page, 'progress', 3500); await page.locator('#mark').click();
  212 |   const first = await logs(page); sequence(first);
  213 |   await page.reload(); const historical = await logs(page, 'all'); expect(historical).toEqual(first);
  214 |   await load(page); await range(page, 'progress', 3500); await page.locator('#mark').click();
  215 |   const all = await logs(page, 'all'); sequence(all); expect(new Set(all.map(e => e.session_id)).size).toBe(2);
  216 |   expect((await logs(page)).every(e => e.session_id !== first[0]!.session_id)).toBe(true);
  217 | });
  218 | test('AC-20 IndexedDB write failure, unsaved export and idempotent retry', async ({ page }) => {
  219 |   await page.evaluate(() => {
  220 |     const original = IDBObjectStore.prototype.put;
  221 |     (window as unknown as { restoreStore: () => void }).restoreStore = () => { IDBObjectStore.prototype.put = original; };
  222 |     IDBObjectStore.prototype.put = function() { throw new DOMException('injected quota', 'QuotaExceededError'); };
  223 |   });
  224 |   await load(page); await range(page, 'progress', 3500); await page.locator('#mark').click();
  225 |   await expect(page.locator('#save-status')).toContainText('保存失败');
  226 |   const unsaved = await logs(page, 'unsaved'); sequence(unsaved); expect(unsaved.length).toBeGreaterThan(1);
  227 |   expect(await logs(page)).toEqual([]);
  228 |   await page.evaluate(() => (window as unknown as { restoreStore: () => void }).restoreStore());
  229 |   await page.locator('#retry-save').click(); await expect(page.locator('#save-status')).toContainText('已保存');
  230 |   expect(await logs(page)).toEqual(unsaved); await page.reload(); expect(await logs(page, 'all')).toEqual(unsaved);
  231 | });
  232 | test('AC-16 keyboard-only import and practice, native Enter repeat, editable exclusions', async ({ page }) => {
  233 |   // Only keyboard navigation activates file inputs; the OS picker supplies fixture files.
  234 |   await page.keyboard.press('Tab'); await expect(page.locator('summary')).toBeFocused();
  235 |   await page.keyboard.press('Tab'); await expect(page.locator('#media-file')).toBeFocused();
  236 |   let chooser = page.waitForEvent('filechooser'); await page.keyboard.press('Enter'); await (await chooser).setFiles('generated/timing-20s.wav');
  237 |   await page.keyboard.press('Tab'); await expect(page.locator('#subtitle-file')).toBeFocused();
  238 |   chooser = page.waitForEvent('filechooser'); await page.keyboard.press('Enter'); await (await chooser).setFiles('fixtures/basic.cues.json');
  239 |   await page.keyboard.press('Tab'); await expect(page.locator('#check-import')).toBeFocused(); await page.keyboard.press('Enter');
  240 |   await expect(page.locator('#confirmation')).toBeVisible(); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
  241 |   await expect(page.locator('#confirm-import')).toBeFocused(); await page.keyboard.press('Enter');
  242 |   await expect(page.locator('#play')).toBeFocused(); await page.keyboard.press('Space');
  243 |   await expect(page.locator('#source')).toHaveText('Listen first.'); await page.keyboard.press('Space');
  244 |   await page.keyboard.press('Tab'); await expect(page.locator('#translate')).toBeFocused(); await page.keyboard.press('Enter');
  245 |   await expect(page.locator('#translation')).toHaveText('先听。'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter');
  246 |   await expect(page.locator('#phase')).toContainText('重听核对'); await page.keyboard.press('Tab');
  247 |   await expect(page.locator('#mark')).toBeFocused(); await page.keyboard.down('Enter'); await page.keyboard.down('Enter'); await page.keyboard.up('Enter');
  248 |   expect((await logs(page)).filter(e => e.type === 'not_understood')).toHaveLength(1);
  249 |   for (const tag of ['input', 'textarea', 'div']) {
  250 |     await page.evaluate(t => { const node = document.createElement(t); node.id = 'editable-test'; if (t === 'div') node.contentEditable = 'true'; document.body.append(node); node.focus(); }, tag);
  251 |     await page.keyboard.press('t'); await page.keyboard.press('r'); await page.keyboard.press('u');
  252 |     await expect(page.locator('#phase')).toContainText('重听核对'); await expect(page.locator('#translation')).toBeEmpty();
  253 |     await page.locator('#editable-test').evaluate(node => node.remove());
  254 |   }
  255 |   expect((await logs(page)).filter(e => e.type === 'not_understood')).toHaveLength(1);
  256 | });
  257 | 
  258 | for (const entry of ['seek in review', 'switch mode at end']) {
  259 |   test(`AC-14/16/19 no-target shortcuts are no-ops after ${entry}`, async ({ page }, testInfo) => {
  260 |     await load(page);
  261 |     if (entry === 'seek in review') await page.locator('#mode').selectOption('review');
  262 |     await range(page, 'progress', 20000);
  263 |     if (entry === 'switch mode at end') await page.locator('#mode').selectOption('review');
  264 |     await expect(page.locator('#phase')).toHaveText('已到末尾 · 无待播放片段');
  265 |     for (const id of ['play', 'translate', 'replay', 'mark']) await expect(page.locator(`#${id}`)).toBeDisabled();
  266 |     const state = async () => ({
  267 |       phase: await page.locator('#phase').textContent(),
  268 |       target: await page.locator('#target').textContent(),
  269 |       source: await page.locator('#source').textContent(),
  270 |       translation: await page.locator('#translation').textContent(),
  271 |       media: await page.locator('video').evaluate((v: HTMLVideoElement) => ({ time: v.currentTime, paused: v.paused })),
  272 |     });
  273 |     const before = { state: await state(), events: await logs(page) };
  274 |     await page.locator('body').click({ position: { x: 3, y: 3 } });
  275 |     await page.keyboard.press('Space');
  276 |     await page.keyboard.press('Space');
  277 |     await page.keyboard.down('Space'); await page.keyboard.down('Space'); await page.keyboard.up('Space');
  278 |     for (const key of ['t', 'r', 'u']) await page.keyboard.press(key);
  279 |     const after = { state: await state(), events: await logs(page) };
  280 |     writeFileSync(testInfo.outputPath('no-target-shortcuts.json'), JSON.stringify({ entry, before, after }, null, 2));
> 281 |     expect(after).toEqual(before);
      |                   ^ Error: expect(received).toEqual(expected) // deep equality
  282 |     expect(after.events.some(e => e.type === 'ended')).toBe(false);
  283 |     sequence(after.events);
  284 |     for (const id of ['play', 'translate', 'replay', 'mark']) await expect(page.locator(`#${id}`)).toBeDisabled();
  285 |   });
  286 | }
  287 | 
```