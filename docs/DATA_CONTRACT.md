# 数据契约 v1

这些字段是首版接口，不代表要求搭建服务端、JSON Schema 服务或通用 provider 系统。

## 1. cues.json

`fixtures/basic.cues.json` 是可导入的标准样例。

```json
{
  "schema_version": 1,
  "media_id": "sample-001",
  "track_revision": "1",
  "source_language": "en",
  "target_language": "zh-CN",
  "cues": [
    {
      "id": "c0001",
      "start_ms": 1000,
      "end_ms": 3000,
      "src": "Listen first.",
      "tgt": "先听。"
    }
  ]
}
```

### 校验

- schema_version 必须为数字 1；其余版本报不支持，不猜兼容。
- media_id、track_revision、source_language 是非空字符串；target_language 为非空字符串或 null。
- cues 为非空数组；每条 id 非空且全轨唯一。
- start_ms/end_ms 为非负安全整数，start_ms < end_ms。
- 文件顺序即播放顺序；后一条 start_ms >= 前一条 end_ms。相等合法；乱序/重叠拒绝并说明首版限制。
- src 为去首尾空白后非空的字符串，保留内部换行；tgt 是去首尾空白后的字符串或 null。空白译文统一视为 null。
- 不修正时间、不合并条目。文本原样按纯文本渲染；标签字符串不能变成 HTML。
- 未知字段可忽略但不能解释其行为；比如未来 words 字段不启用逐词模式。
- 媒体时长校验在媒体元数据可用之后另做；数据校验与媒体解码错误分开提示。

track_revision 由素材生产者在内容/分句更改时调整；应用不相信该字段足以唯一标识实际文件。

## 2. SRT 子集

- 仅 UTF-8，支持 BOM、LF/CRLF、多行正文，以及末尾有无空行。
- 时间格式 `HH:MM:SS,mmm --> HH:MM:SS,mmm`；分钟/秒 0～59，毫秒三位。
- 可接受常见的纯数字序号行；不使用它作为全局稳定 ID，也不依赖其连续性。
- 按文件条目顺序生成 c0001、c0002……；不把中英混合正文自动拆成两种语言。
- 原文取条目全文，译文设 null。纯数字正文仍是正文，不得被误当成下一条序号。
- 缺时间行、无正文、非法时间、多余非空碎片等报具体条目错误，不跳过坏段。
- media_id 取文件名去扩展名（仅逻辑标识）；track_revision 设 `srt-import-v1`；source_language=en，target_language=null。
- 之后应用与 JSON 相同的顺序/重叠/安全渲染校验。
- 不要求支持定位参数、样式解释或非标准 SRT 扩展。拒绝时提示支持的格式。

## 3. 运行时身份与状态

用于行为与日志；不要求逐字照搬成一个巨大 store。

| 字段 | 含义 |
| --- | --- |
| session_id | 用户确认一对素材后新建的随机会话 ID；刷新重载后再导入则开新会话 |
| track_id | 对规范化字幕内容计算 SHA-256，包含版本/语言/所有条目字段；SRT 与 JSON 分别按规范化后值计算 |
| media_id | 字幕文件逻辑媒体标识，不等价于内容哈希 |
| media_metadata | 所选媒体的 name、size、last_modified、duration_ms；不记录本地完整路径 |
| mode | continuous 或 review |
| phase | normal、focused_listening、focused_review、review_ready、ended；具体内部划分可以等价实现 |
| delay_ms | B 保存的延迟参数；review 中保留但不生效 |
| audio_cue_id | 按未延迟媒体时间查询，允许 null |
| display_cue_id | 正在显示原文的条目，允许 null；片尾区取选中的条目 |
| action_cue_id | 界面明确的操作对象，允许 null |
| focused_cue_id | 一次片段练习/重听锁定的条目，允许 null |

哈希算法的规范化输入：使用固定字段顺序重建对象
`schema_version, media_id, track_revision, source_language, target_language, cues`；
cues 内顺序固定为 `id,start_ms,end_ms,src,tgt`；用无缩进 JSON.stringify 的 UTF-8 字节计算。
规范化先完成空白处理，忽略未知字段。不对整个大视频做哈希。

## 4. 事件日志

JSONL（JSON Lines）是一行一个 JSON 对象。记录实际交互，不采样每一帧。
所有事件都有以下公共字段：

```json
{
  "event_schema_version": 1,
  "event_id": "session-uuid:5",
  "session_id": "session-uuid",
  "seq": 5,
  "at_utc": "2026-09-26T08:00:00.000Z",
  "session_elapsed_ms": 8400,
  "type": "translation_reveal",
  "media_id": "sample-001",
  "track_id": "sha256-hex",
  "media_time_ms": 3500,
  "mode": "continuous",
  "phase": "normal",
  "delay_ms": 1000,
  "audio_cue_id": "c0002",
  "display_cue_id": "c0001",
  "action_cue_id": "c0001",
  "origin": "keyboard",
  "details": {}
}
```

- seq 从 1 单调递增；event_id = session_id + ':' + seq，持久化和重试不能重复追加同一 event_id。
- at_utc 使用 UTC；session_elapsed_ms 使用单调时钟相对本会话起点，不拿系统时钟排序。
- 公共字段捕获操作发生时、改变状态前的上下文；新值放 details，避免重听 seek 后丢失原操作对象。
- session_start 使用新会话的初始状态；媒体自身确认后的 play/pause 事件使用事件发生时的状态。
- origin 为 keyboard、button、pointer、system；媒体事件的触发原因放 details.reason。
- 不记录原文、译文正文，不记录音视频数据；session_start 的媒体文件名也可能涉及隐私，须提示导出者。

### 必须记录的类型

| type | details 最少内容 |
| --- | --- |
| session_start | media_metadata、track_revision、source_language、target_language |
| play | reason：user/resume/replay/review |
| pause | reason：user/seek/mode_change/hidden/import；只有实际从播放到暂停时记录 |
| seek | from_ms、to_ms、reason：user/replay/review_start/review_continue |
| delay_change | from_ms、to_ms；一次用户提交一条，不每帧写日志 |
| mode_change | from、to |
| translation_reveal / translation_hide | 操作目标已由公共字段给出；仅记用户主动切换，不把自动清除当一次按键 |
| replay | target_cue_id；每次实际接受的重听请求一条 |
| not_understood | target_cue_id；用户重复点击可各记一次，但 key repeat 不增加 |
| review_pause | target_cue_id、reason：review/replay、observed_boundary_ms、overshoot_ms |
| ended | reason：media_end/review_complete |

review_pause / ended 不再同时写一条同原因的 pause，避免同一边界重复计数。
边界定位校正不另写 seek，已有 review_pause 记录校正前位置；真正开始重听/练习或用户拖动才写相应 seek。
仅记录有实际效果的操作，禁用按钮和空操作不制造“成功操作”事件。
发生导入/解码等错误可以显示错误，不要求新增遥测错误事件。

## 5. 本地保存与导出

- 事件按顺序写入 IndexedDB；已提交事务才显示“已保存”。
- 导出前等待当下已入队事件提交，然后读该快照；导出过程不写入自身事件，避免递归或不稳定数量。
- 提供“导出本次会话”和“导出全部会话”。每会话按 seq 排序，全部会话按 session_start 时间、session_id 排序后逐组输出。
- 刷新不保证恢复媒体权限/播放会话；必须能从 IndexedDB 导出此前已保存的日志。
- 写入失败必须提示；保留当前内存事件并允许显式下载“未保存记录”，不能伪称已持久化或静默丢弃。
- 不需要自动清库、恢复完整播放器状态、清理历史、远端上传或统计面板。
- IndexedDB 的保存范围是当前浏览器/站点来源，不是文件系统备份；使用稳定端口，浏览器清理数据仍可能删除记录。
