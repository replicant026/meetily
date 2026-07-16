# 转写页热词高亮 + 点击复制

> Wave 18 / PR-52。本页描述 PR-50（热词设置）落地后，在转写页加的视觉闭环。

## 功能概述

在 PR-50 中，用户可以在"设置 → 会议转写 → 中文会议热词"里维护
最多 500 字符的项目名 / 公司名 / 人名清单。这些热词被注入到
`whisper.cpp` 的 `params.set_initial_prompt`，让 ASR 引擎在转写
时偏向这些词。

PR-52 让用户**直接看到**热词是否在转写中命中：
- 转写文本中所有命中热词的片段被包成 `<mark>` 标签，黄色背景
- 鼠标悬停：浏览器原生 `title` 显示热词原文
- 单击：复制热词到剪贴板，并弹出成功 toast

## 实现要点

### 1. 数据流

```
Tauri Store (transcription-preferences.json)
    |
    | get_transcription_hotwords (PR-50 命令)
    v
useHotwords() hook (frontend/src/hooks/useHotwords.ts)
    |
    | HotwordRule[] (value + RegExp)
    v
wrapHotwords(text, rules, onMatch) (frontend/src/lib/wrapHotwords.tsx)
    |
    | React.ReactNode[] (普通文本 + <mark>)
    v
TranscriptView / VirtualizedTranscriptView 渲染
```

### 2. 匹配算法

`wrapHotwords` 用贪心 leftmost-wins：
- 对每个剩余位置，遍历所有规则找最早匹配
- 同位置多规则匹配时，匹配长度更长的优先
- 匹配段被包成 `<mark>`，其余原样保留
- 匹配计数器（matchedCount）目前只用于潜在的统计扩展，未在 UI 暴露

### 3. 中文支持

`\b` 是 ASCII 边界，对中文（CJK 字符）无效。我们用 `new RegExp(escapeRegExp(value), 'gi')`：
- 没有 `\b`，匹配用户输入的任意子串
- `regex::escape` 防止用户输入的正则元字符（`. * + ?` 等）破坏匹配
- `gi` 标志：全局、忽略大小写（对人名拼音 / 英文术语友好）

### 4. 性能

- 热词列表 ≤ 50 条，转写文本 ≤ 200 字符
- 最坏情况 O(n × rules) ≈ 10,000 次 RegExp.exec，仍 < 1ms
- `useHotwords` 用 `useMemo` 按内容 hash 缓存，只有热词字符串变化才重新解析

## i18n 键

| 路径 | 含义 |
|------|------|
| `settings.transcript.hotword_copy_success` | "已复制：{value}" |

新增到 6 个 `frontend/locales/*/settings.json`，文案：
- en-US / en-GB: "Copied: {value}"
- zh-CN: "已复制：{value}"
- zh-TW: "已複製：{value}"
- ja-JP: "コピーしました：{value}"
- ko-KR: "복사됨: {value}"

## 已知限制

- 贪心 leftmost-wins：两个热词有重叠时，先声明的优先。例如列表里
  先有"张"后有"张三"，转写中"张三"会高亮成两段（"张"+"三"）。
  建议在热词设置里把较长的放前面，或拆分列表。
- 同一转写段落里点击复制只复制**原始热词**，不是上下文里
  命中片段（因为 ASR 输出可能省略空格 / 标点，复制原始列表值更
  实用）。
- 不区分繁简体（"张" 与 "張" 不会被识别为同一词）。如需繁简
  归一化，可以在 `useHotwords` 内部加 OpenCC，但当前 PR 不做。

## 验收

- 三道闸已通过：
  - `pnpm check:i18n` ✅
  - `pnpm test:i18n` ✅（19 tests pass）
  - `pnpm build` ✅