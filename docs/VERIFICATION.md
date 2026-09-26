# v0.1.0 验证记录

## 结论与范围

实现版本/日期：`package.json` 的 v0.1.0，2026-09-26（Asia/Shanghai）。
**原型工程自动检查通过，Windows 真实语音人工试用未验证；不是全部验收完成。**

- M1：字幕导入校验、规范化与纯时间查询已实现，解析与精确时间测试通过。
- M2：本地音视频、连续延迟 B、暂停/定位/改延迟、片尾补看已实现，WAV 与 MP4 实际播放通过。
- M3：片段核对、隔离重听、译文/没听懂、快捷键与操作取消已实现；本轮补修尾后无目标的快捷键缺陷并完成回归。
- M4：IndexedDB 事件保存、失败提示、快照导出及交付文档已实现；自动测试通过，人工验收步骤已提供，**AC-24 尚未执行**。

本轮没有引入新依赖、重生成/覆盖媒体、修改字幕样例或放宽验收。`ACCEPTANCE.md` 原清单保持未勾选，结果以本文件为准。

## 环境与运行

| 项目 | 本轮实际环境 |
| --- | --- |
| OS | Linux 6.18.33.2-microsoft-standard-WSL2 x86_64 GNU/Linux |
| 浏览器 | Playwright 启动的 Linux Chromium 153.0.8010.12，headless（无可见窗口），单 worker，0 retries |
| Node / npm | v24.18.0 / 11.16.0 |
| ffmpeg | 6.1.1-3ubuntu5；本轮沿用已有生成媒体 |
| 页面尺寸 | 默认 1440×900；布局用例另测 1024×768 |
| 服务 | `npm run dev`，仅 `127.0.0.1:5173`，strictPort；由浏览器测试启动 |
| 媒体/字幕 | 20 秒正弦提示音 WAV/纯色 MP4；`fixtures/basic.cues.json`、`basic.en.srt` |

版本、命令与退出码原始记录：[environment.txt](evidence/2026-09-26-engineering-final/environment.txt)。
安装、启动、预览、WSL→Windows 访问及数据位置见 [README](../README.md)。本轮使用已有 node_modules 和浏览器，未重新执行 `npm ci` 或安装浏览器；生产构建已执行，`npm run preview` 和 Windows 端连通性未在本轮实测。

## 实际执行的自动检查

以下命令均在当前项目执行。日志末尾保留真实退出码；没有删除失败或通过重跑掩盖失败。

| 阶段 | 命令 | 退出码 / 真实结果 | 日志 |
| --- | --- | --- | --- |
| 修复前回归 | `npm test -- tests/player.test.ts -t 'no-target'` | **1：2 failed**；另 11 项被 `-t` 筛选未运行，不算通过 | [regression-before-unit.log](evidence/2026-09-26-engineering-final/regression-before-unit.log) |
| 修复前回归 | `npm run test:e2e -- --grep no-target` | **1：2 failed**，页面产生多余结束状态与 `ended` 事件 | [regression-before-browser.log](evidence/2026-09-26-engineering-final/regression-before-browser.log) |
| 修复后全量 | `npm run typecheck` | **0：通过** | [typecheck.log](evidence/2026-09-26-engineering-final/typecheck.log) |
| 修复后全量 | `npm test` | **0：3 文件、76 tests passed，无跳过** | [unit.log](evidence/2026-09-26-engineering-final/unit.log) |
| 修复后全量 | `npm run test:e2e` | **0：14 passed，0 skipped / unexpected / flaky，3.2 分钟** | [e2e.log](evidence/2026-09-26-engineering-final/e2e.log) |
| 修复后全量 | `npm run build` | **0：Vite 构建成功** | [build.log](evidence/2026-09-26-engineering-final/build.log) |

日志中的 `NO_COLOR` / `FORCE_COLOR` 提示是测试进程颜色环境警告，并非测试失败。上述测试针对本轮源码改动运行；之后只补交付文档和归档证据。

### 本轮修复：无目标不能假装完成练习

复现：导入 20 秒样例 → 切片段核对 → 拖到 20000ms；或先拖到末尾再切片段核对。状态应为“已到末尾 · 无待播放片段”，四个练习按钮禁用。
修复前全局 Space 仍可进入控制器，将 `review_ready` 的无目标状态误当成已完成最后一条，产生 `ended / review_complete`。这不是用户完成核对，违反 AC-14/16/19。

修复限定在 `Controller.toggle()`：仅已进入 `focused_review` 的最后条目按“继续”才结束；没有待播放目标则返回，不播放、不定位、不写日志。既有最后条目完成后可重听的语义保留。
新增两条参数化单测、两条真实页面按键回归，涵盖 button/keyboard origins、重复及长按 Space、T/R/U；检查状态、媒体位置、暂停、事件均不变。已有末条测试还检查重复完成不双计。
本轮测试数量由 74→76 单元、12→14 浏览器；没有删除或弱化旧断言。

### 证据索引

本轮汇总目录：`docs/evidence/2026-09-26-engineering-final/`。

- 修复前报告：[before/results.json](evidence/2026-09-26-engineering-final/before/results.json)；同级 `artifacts/` 保留两个失败的前后状态 JSON、截图及错误上下文。
- 修复后完整报告：[after/results.json](evidence/2026-09-26-engineering-final/after/results.json)。下表简称“浏览器报告”。
- 修复后原始运行：`test-results/2026-09-26T11-30-22-052Z-7abcc9d1/`。
- 修复前原始运行：`test-results/2026-09-26T11-24-27-771Z-2b68afda/`；失败 trace.zip 仍在该目录 `artifacts/` 下，不复制进 docs。`test-results/` 被忽略，清理后 trace 不再可用；关键失败证据已另存 docs。
- `after/artifacts/` 的逐测试目录保留 `real-playback-wav.json`、`real-playback-mp4.json`、`interaction-log.jsonl`、`network.json`、两张布局截图及两份 `no-target-shortcuts.json`。
- 项目原有 `docs/evidence/` 下更早的报告与截图保持不变，**不冒用为本轮运行结果**。本轮以唯一 runId 输出，避免下一次运行覆盖旧证据。

## AC-01～AC-24 逐项结果

“通过（自动）”只表示下列明确覆盖的工程行为在上述环境通过，不表示 Windows 人工体验通过。
纯时间测试没有浏览器容差；真播放按原定最多 150ms 断言。故障注入与人工限制单独列出。

| 编号 | 结果 | 实际证据与限制 |
| --- | --- | --- |
| AC-01 | 通过（自动） | `tests/core.test.ts` 对规范化 7 条 JSON 全字段与样例作相等断言，c0003 译文为空；浏览器正常导入配对。单元日志、浏览器 `AC-01/04/05` 用例。 |
| AC-02 | 通过（自动） | 单元覆盖 SRT 样例、BOM/CRLF、多行、无尾空行、非连续序号、纯数字正文、正文箭头/多空行；ID 稳定、译文 null。浏览器实际导入 SRT 并显示无译文。 |
| AC-03 | 通过（自动） | 单元覆盖空轨/重复 ID/空原文/错误类型/不安全整数/倒置/乱序/重叠/坏 SRT/版本字段；浏览器重复 ID 明确定位“第 2 条 (c0001)”，不覆盖旧会话。错误变体在测试内构造，未改样例。 |
| AC-04 | 通过（自动） | 纯逻辑验证 100ms 容差且不改原时间；浏览器拒绝 20101ms，接受末条 20080ms 并在真实 native ended 完成 review；配对确认、取消、坏新媒体不替换旧会话。损坏 MP4 返回解码失败。 |
| AC-05 | 通过（自动真播放） | 分别导入并真实解码 WAV、H.264/AAC MP4，播放/暂停/定位、连续和短条边界通过；同一媒体重选、成功替换后旧 object URL 已被释放。见下方真播放数据。Windows/MP3 未测。 |
| AC-06 | 通过（自动） | 浏览器在 0/1000/1999ms 查 DOM 不存在首条原文，原生 controls 关闭且 textTracks 无启用项；译文隐藏。纯时间断言补全区间边界。样例没有内嵌字幕流，实际含内嵌字幕的用户文件未试用。 |
| AC-07 | 通过（自动） | `tests/core.test.ts` 逐一断言 fixtures 的全部 24 个查找点；3500ms 的 audio=c0002、display/action=c0001 等精确成立，浏览器相同目标与日志交叉验证。 |
| AC-08 | 通过（自动） | 单元逐毫秒验证 c0005 在 [15000,15500) 全部可见、14500 原区间末端不包含；浏览器 15000/15499 可见、15500/6000 为空。 |
| AC-09 | 通过（自动） | 单元检验暂停不受墙钟影响、D 非法范围/步长无效、0/3000 立即重算及清除译文、不改原时间；浏览器等待后仍在原位置，改 D 后仍为 3.5 秒。 |
| AC-10 | 通过（自动真播放） | 浏览器 B 实播到 20 秒自然结束，补看 c0006/c0007、选目标/T/U/R；最后条重听后继续不从头隐式播放。直接 seek 到末尾无补看，主动“从头播放”才启动，D=0 清除补看。尾部集合另有精确单测。 |
| AC-11 | 通过（自动真播放） | WAV/MP4 review 从 c0001 起点播放；途中手动暂停仍隐藏；3000ms 边界后显示首条，T 可揭示，继续 c0002 时两行隐藏。单元验证 2999ms 不提前暂停。 |
| AC-12 | 通过（自动真播放） | 连续 c0001→c0002 边界分别产生唯一 review_pause，没有提前显示下一条、重复暂停；真实媒体容差末条完成与单元最后条继续/重听/防重复结束通过。 |
| AC-13 | 通过（自动真播放） | 在 B 的 3500ms 重听 c0001 而非音频 c0002，播放从 1000 至 3000，途中无旧文本、完成原文显示且译文隐藏，继续恢复 B；`interaction-log.jsonl` 与单元核对操作前 ID。 |
| AC-14 | 通过（自动） | 单元异步取消、快速重听/seek/模式切换；浏览器快速操作和换素材不被旧回调改写，review 的 5500ms 选 c0003 并从 6500ms 播放。两条新增尾后无目标回归通过，前后状态和日志完全相等。 |
| AC-15 | 通过（自动） | 显示目标的 T/U 与反馈/日志一致；c0003 提示无译文；重听、切条、seek、切模式、改 D 清除揭示。单元与 `AC-06–09/13/15/19` 浏览器用例。 |
| AC-16 | 通过（自动）；Windows 原生对话框未验证 | 浏览器实际键盘 Space/T/R/U、长按 U/Enter、滑块/选择器/input/textarea/contenteditable 排除、原生按钮防双触发与无目标禁用均通过；Tab/Enter 激活文件选择后，自动化通过 filechooser 提供文件并完成练习。不是人工在 Windows 文件对话框选文件的证据。 |
| AC-17 | 通过（自动策略/故障注入）；真实切后台未验证 | 注入 document.hidden + visibilitychange 后暂停、返回不续播，日志仅一条 hidden pause；注入 play() 拒绝后无成功播放状态；实际损坏媒体解码失败且历史日志保留。未执行 Windows OS 真实标签切换/最小化试验。 |
| AC-18 | 通过（自动，观察范围见限制） | 原文/译文含 img/script 的恶意文本按字面显示，无相应 DOM 节点/执行标记/请求；导入后的网络记录没有 POST 或外部请求。`network.json` 只记录该用例观察窗口，开发资源请求不作上传；不等于对所有浏览器扩展做安全审计。 |
| AC-19 | 通过（自动） | 导入、定位、T/U/R、继续、改 D、切模式等导出为可解析 JSONL，序号按会话连续且 ID 唯一；验证重听前 audio/display/action、配置 from/to 与边界不双计。无目标快捷键不制造 ended。单元、浏览器报告和 `interaction-log.jsonl`。 |
| AC-20 | 通过（自动） | 真实 IndexedDB 刷新后历史一致、两会话区分；单元可控队列验证快照排除后来事件、只有提交才计保存。浏览器注入 put 抛错，提示失败、可导出未保存、恢复并重试后不重复；未模拟实际磁盘耗尽。 |
| AC-21 | 通过（自动几何/截图）；人工可用性未验证 | 1440×900 与 1024×768 页面无横向溢出，长恶意文本/译文完整保留、pre-wrap/anywhere 换行；展开译文前后播放按钮 boundingBox 相等。截图见下方。自动几何不是 Windows 人工视觉与阅读体验验收。 |
| AC-22 | 通过 | 四条全量命令均实际退出 0；76 单元、14 E2E，包含 WAV 与 MP4 真播放到连续/短条边界与 B 自然结束，而非只派发模拟媒体事件。命令/原始报告/边界日志已保留。 |
| AC-23 | 通过（交付说明）；Windows 连通性未验证 | README 包含 Node 要求、npm 安装/运行/测试/预览、固定本机端口、WSL 访问/诊断、编码限制与日志导出/存储/隐私；本机 dev 启动与页面访问已由 E2E 验证。未执行 Windows 访问、不改防火墙或绑定公网。 |
| AC-24 | **未验证** | 本轮没有合法真实英语语音材料配字幕的 5～10 分钟 Windows Chrome/Edge 人工试用，也没有人工听 10 个片段结尾；下面提供步骤及空白记录模板，不能用合成提示音或边界数值代替。 |

## 实际媒体播放与边界观察

来源：`scripts/generate-media.mjs` / [fixtures 配方](../fixtures/README.md)。
媒体为 ffmpeg 本地生成的 20 秒 440Hz 正弦提示音；MP4 是 640×360、30fps 纯色画面、H.264/AAC，WAV 是 48kHz PCM。没有真实语音，不验证字幕语义同步、尾音听感或学习收益。
本轮未重新生成媒体，文件哈希在交付审查清单中记录。

真播放测试从目标 start_ms 启动 HTMLMediaElement，让媒体时钟自行前进至边界；控制器在暂停/seek 校正**之前**记录 observed_boundary_ms。
`overshoot_ms = max(0, observed_boundary_ms - end_ms)`。以下以毫秒显示至 3 位小数，完整浮点值见 JSON：

| 媒体 | 条目 | 原 end_ms | observed_boundary_ms | overshoot_ms | <=150ms |
| --- | --- | ---: | ---: | ---: | --- |
| WAV | c0001 | 3000 | 3008.688 | 8.688 | 通过 |
| WAV | c0002 | 5000 | 5007.835 | 7.835 | 通过 |
| WAV | c0005（500ms 短条） | 14500 | 14513.812 | 13.812 | 通过 |
| MP4 | c0001 | 3000 | 3006.089 | 6.089 | 通过 |
| MP4 | c0002 | 5000 | 5017.175 | 17.175 | 通过 |
| MP4 | c0005（500ms 短条） | 14500 | 14502.583 | 2.583 | 通过 |

本轮六个测量值最大 **17.175ms**；只说明本轮自动测试条件下满足观察误差要求，不保证所有设备/负载，也不等于声音实际没截尾或串入下一条。不能用已经校正回 end_ms 的播放器读数证明听感。

- [WAV 原始边界证据](evidence/2026-09-26-engineering-final/after/artifacts/app-AC-05-11-12-real-wav-p-ddcdc-inuous-and-short-boundaries/real-playback-wav.json)
- [MP4 原始边界证据](evidence/2026-09-26-engineering-final/after/artifacts/app-AC-05-11-12-real-mp4-p-1cbe1-inuous-and-short-boundaries/real-playback-mp4.json)
- [1440×900 长文本布局截图](evidence/2026-09-26-engineering-final/after/artifacts/app-AC-18-no-HTML-executio-71473-ixed-controls-desktop-sizes/layout-1440.png)
- [1024×768 长文本布局截图](evidence/2026-09-26-engineering-final/after/artifacts/app-AC-18-no-HTML-executio-71473-ixed-controls-desktop-sizes/layout-1024.png)

## 人工试用：未执行，复现步骤与空白模板

1. 在 WSL 启动本项目，Windows Chrome 或 Edge 打开 `http://127.0.0.1:5173`。记录 Windows、WSL、浏览器版本、耳机/扬声器与负载。分别检查 1440×900 和 1024×768 的可操作性及长字幕滚动。
2. 使用自己合法持有、**5～10 分钟真实英语语音**及基本同步的字幕，不下载未授权材料、不提交原文件。先以 B、D=0 检查素材配对与同步；记录来源类别和匿名标识，不公开敏感文件名。
3. 同一材料体验正常字幕（B、D=0）、连续延迟 B（先 1 秒，再 0/3 秒对比）、片段核对。确认只改显示，译文初始隐藏、片段聆听中不能偷看。
4. 人工听至少 **10 个不同片段**结尾，覆盖连续边界、短条、长条和末条。每条记录：正常到尾 / 被截尾 / 听到下一条 / 不确定；可重听比较，但不以校正后的 currentTime 代替耳听判断。出现问题记匿名 cue ID、模式和复现位置。
5. 完成暂停/继续、R 重听、T 揭示/隐藏、U 标记、seek、切模式；在 review 拖到末尾连续按 Space/T/R/U，确认保持无目标而不伪造完成。仅最后片段已核对后的“继续”才结束。
6. 真实切到其他标签页或最小化后返回，确认媒体保持暂停，日志有 hidden 原因；检查无鼠标导入及基本练习、长按不重复、标准焦点清晰。
7. 导出本次会话，检查事件 ID 与目标；刷新后导出全部会话核对历史。分享前检查文件名隐私。若有保存失败，先下载未保存记录再刷新。
8. 将真实结果填入本节并更新对应 AC 状态，保留问题，不把“无问题预期”写成已观察结论。

```text
日期 / 执行者：未填写
Windows / WSL / 浏览器版本：未填写
匿名材料标识 / 合法来源类别 / 时长 / 字幕格式：未填写
字幕基本同步确认 / 耳机或扬声器 / 负载：未填写
正常字幕 B(D=0) / 延迟 B / 片段核对：未执行
键盘 / 布局 / 真实隐藏页 / 日志导出与刷新：未执行
整体交互问题与复现步骤：未填写
```

| 序号 | cue ID / 模式 | 截尾？ | 听到下一条？ | 重听后结果 / 备注 |
| --- | --- | --- | --- | --- |
| 1 | 待填写 | 未听 | 未听 | — |
| 2 | 待填写 | 未听 | 未听 | — |
| 3 | 待填写 | 未听 | 未听 | — |
| 4 | 待填写 | 未听 | 未听 | — |
| 5 | 待填写 | 未听 | 未听 | — |
| 6 | 待填写 | 未听 | 未听 | — |
| 7 | 待填写 | 未听 | 未听 | — |
| 8 | 待填写 | 未听 | 未听 | — |
| 9 | 待填写 | 未听 | 未听 | — |
| 10 | 待填写 | 未听 | 未听 | — |

人工试用是可用性记录，不据此宣称长期听力提升。

## 剩余风险与改动审查

- **剩余人工项**：AC-24 全项，以及 AC-16/17/21/23 中明确标出的 Windows 文件对话框、后台切换、体验与连通性。无真实材料和人工执行证据，保持未验证，不伪造通过。
- 媒体兼容性仅以实际测过的 WAV/MP4 为依据；其他编码、内嵌字幕材料与 MP3 未实测。真实语音播放的音频缓冲、截尾/串句听感仍需上述人工步骤确认。
- 目前没有本轮自动测试仍失败的项；这不证明未测试场景没有缺陷。修复前两条单元/两条浏览器失败作为原始证据保留。
- 当前 `.git` 不是有效 Git 仓库，`git status --short` 返回 128。**没有宣称已审 Git diff，也没有初始化或修改 Git。**本轮按原始副本 `/tmp/delayed-listening-implementation-xvhPFl` 与当前文件逐项比较，并审查新增文件。
- 本轮生产代码只修改 `src/player/controller.ts` 的无目标 guard；测试修改 `tests/player.test.ts`、`tests/e2e/app.spec.ts`；`playwright.config.ts` 为独立运行证据路径；交付修改 `README.md`，新增本文件与本轮证据目录。没有改邻近项目、依赖、fixtures、媒体或其他生产文件。
- 构建产物位于被忽略的 `dist/`，运行报告位于被忽略的 `test-results/`；docs 只保存本轮必要文本、JSON 和截图，不包含用户音视频、第三方素材或 trace 二进制。最终文件对比与哈希记录见 [change-review.txt](evidence/2026-09-26-engineering-final/change-review.txt)。
