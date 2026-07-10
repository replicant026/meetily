# Meetily i18n Glossary

> **Purpose:** Unify the standard Chinese translation of English UI terms. Translators must translate according to this table; PR modifications require Chinese native speaker reviewer approval.
>
> **Maintenance:** See `docs/i18n/README.md`.

## Status Levels

- `proposed` — suggested, awaiting review
- `approved` — approved, available for use in JSON
- `deprecated` — deprecated, must be replaced in all JSON files within next PR cycle

## Core Terms

| English | Chinese (Simplified) | Definition | Scope | Notes | Status |
|---|---|---|---|---|---|
| Recording | 录音 | The process of capturing audio | Recording module | | approved |
| Transcription | 转写 | The process and output of converting speech to text | Transcription module | Verb "to transcribe" is rendered as 转写 | approved |
| Summary | 总结 | Concise overview of meeting content | Summary module | Avoid 摘要 to prevent ambiguity | approved |
| Speaker | 说话人 | Participant in a meeting | Transcript view | Distinct from 发言者: 发言 leans toward statement | approved |
| Diarization | 说话人分离 | Technique to distinguish different speakers | Advanced settings | Professional term, may include English | proposed |
| Parakeet | Parakeet | NVIDIA model name | Model selection | Keep English proper noun | approved |
| Whisper | Whisper | OpenAI model name | Model selection | Keep English proper noun | approved |
| Meeting | 会议 | Multi-person discussion | Global | Avoid 会面 to prevent ambiguity | approved |
| Live | 实时 | Synchronous and low-latency | Feature description | Avoid 现场 | approved |
| Microphone | 麦克风 | Sound pickup device | Device selection | | approved |
| System Audio | 系统音频 | Audio output of the operating system | Device selection | | approved |
| Device | 设备 | Hardware peripheral | Device management | | approved |
| Model | 模型 | AI model | Model management | | approved |
| Download | 下载 | Retrieve a resource | Model management | | approved |
| Settings | 设置 | Preferences configuration | Settings center | Avoid 配置 to prevent confusion with `config` | approved |
| Profile | 个人资料 | User information | Settings center | | proposed |
| Notification | 通知 | System prompt | Notification settings | | approved |
| Permission | 权限 | OS authorization | Permission request | | approved |
| Update | 更新 | Upgrade to new version | Auto-update | | approved |
| Cancel | 取消 | Terminate an operation | Global | | approved |

## How to Add a New Term

1. Add a row at the bottom of the table with status `proposed`
2. Open a PR with tags `i18n` + `glossary`
3. At least 1 Chinese native-speaker reviewer must approve
4. After merge, change status to `approved`; only then is the corresponding JSON permitted to use it