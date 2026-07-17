# Wave 20 / PR-C: ASR 评测 CI 自动化

> **For agentic workers:** superpowers:executing-plans
> **Base branch:** devtest
> **Parent waves:**
> - PR-53 (asr-benchmark-aishell) — 提供 benchmark.py + generate_report.py
> - Wave 15 PR-45a — 模型推荐表 (`docs/asr_benchmark_zh.md`)

## Background

PR-53 在仓库内落下了 `scripts/asr_benchmark/{benchmark.py, generate_report.py, test_benchmark.py}`，
可以本地跑中文 ASR 评测。但只能本地跑——没有 CI，把模型回归变成主动行为，
只能靠人工周期跑。

PR-C 把这条链路跑到 GitHub Actions 上，提供 weekly smoke check + 可手动
触发的完整评测。

## Why now

用户反复说"系统稳定 + 识别率"是核心目标。识别率这事不靠单元测试保证——
只有真在中文上跑才能验收。我们要让：`AsrQualityRegression` 在每周 Sunday 09:00 UTC 主动报
（既不烧太多 CI 分钟，也保证在调优时不会漏）。

## Scope

### 1. 新增工作流 `.github/workflows/asr-benchmark.yml`

```yaml
name: ASR Benchmark (Whisper, Chinese)
on:
  workflow_dispatch:
    inputs:
      model:
        description: 'Whisper model basename'
        default: 'large-v3-turbo'
        type: choice
        options: [tiny, base, small, medium, large-v3, large-v3-turbo, large-v3-turbo-q5_0]
      samples:
        description: 'Number of AISHELL-1 eval utterances (max 50 to bound CI minutes)'
        default: '5'
        type: string
  schedule:
    - cron: '0 9 * * 0'   # 每周 Sunday 09:00 UTC, regression smoke check
  workflow_dispatch: {}

concurrency:
  group: asr-bench
  cancel-in-progress: false
```

(详细 job steps 见 plan 文档；意图是下载 small/whisper.cpp 二进制 + base ggml 模型 + 5 个 AISHELL utterances + 跑 benchmark.py + 出 markdown report + upload artifact)

### 2. Helper script

`scripts/asr_benchmark/run_ci_eval.sh` (bash) 与 `run_ci_eval.ps1` (PowerShell)
提供 CLI wrapper，自动安装 whisper.cpp binary + GGML base model + AISHELL mini，
然后调用 `benchmark.py` + `generate_report.py`，输出到 `benchmark-report/`。

CI workflow 调用 helper；用户本地也可以调用：避免手敲多步流程。

### 3. 不在范围内

- **不**自动合并 PR-C 流程到现有 build workflow（避免 i18n-check 与 model download 串行阻断）
- **不**支持 Apple Silicon runner（只 ubuntu-latest，CF 文档已知问题 skip）
- **不**自动把 nightly run 结果发到 Slack / issue（后续 PR）
- **不**把 AISHELL-1 全 400 utterances 跑进 CI（超出 hosted runner budget；用户本地跑）
- **不**新增 model download（依赖 whisper.cpp 官方 GGML 发布地址）

## Acceptance

- [ ] Workflow file 存在并通过 GitHub 语法
- [ ] 手动 `Run workflow` 时至少能在 30 分钟 timeout 内产生 markdown report artifact
- [ ] README 引用 PR-C 的运行说明
- [ ] spec + plan + docs/asr_benchmark_zh.md 增补 CI 段落

## Risks

1. **GitHub Actions 30 分钟 timeout**：完整 large-v3 + 50 utterances 可能超时
   - **缓解**：默认 manual dispatch 跑 small + 5 utterances；large 留给本地
2. **whisper.cpp binary 受版权声明**：必须从官方 upstream 拉，避免误用
   - **缓解**：使用 `ggerganov/whisper.cpp/releases` 的预编译二进制，校验 sha256
3. **AISHELL-1 license 限制**：不能 cache 到 GitHub Actions cache
   - **缓解**：每次跑都从官方 source fresh download，30 秒内完成（mini set）
4. **CI 工时浪费**：weekly 自动跑若 fail，不应轰炸负责人
   - **缓解**：fail 只产生 artifact + workflow status，不开 issue（PR-C 后续可加）
