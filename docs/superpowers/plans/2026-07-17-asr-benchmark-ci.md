# Wave 20 / PR-C: ASR 评测 CI 自动化 - 实施计划

## 阶段 1: helper script (本地可跑通)
- 创建 `scripts/asr_benchmark/run_ci_eval.sh` (bash, ~40 lines)
- 创建 `scripts/asr_benchmark/run_ci_eval.ps1` (PowerShell, ~40 lines)
- 行为：检查 whisper.cpp binary → 下载小模型 (ggml-base) → 下载 5 个 AISHELL utterances → 调 benchmark.py → 调 generate_report.py → 输出 `benchmark-report/` 目录 + `results.json`
- 验证：本地 dry run，跑通 base model + 5 utterances

## 阶段 2: GitHub Actions workflow
- 创建 `.github/workflows/asr-benchmark.yml`
- job: `bench` on `ubuntu-latest`, timeout 30 minutes
- steps:
  1. actions/checkout@v4
  2. actions/setup-python@v5 (Python 3.11)
  3. ./scripts/asr_benchmark/run_ci_eval.sh ${{ github.event.inputs.model }} ${{ github.event.inputs.samples }}
  4. actions/upload-artifact@v4 (path: `benchmark-report/`)
- 触发: workflow_dispatch (manual) + schedule (weekly Sunday 09:00 UTC)
- concurrency: asr-bench (不取消,避免漏报)

## 阶段 3: docs 补充
- 在 `docs/asr_benchmark_zh.md` 末尾加 "## CI 自动化" 章节
- 链接到 workflow file + helper script
- 在 `CHANGELOG.md` 加 Wave 20 条目（独立提交 PR 一起合并）

## 阶段 4: 文档同步
- `docs/INDEX.md` 加入 asr_benchmark_zh.md 的新增章节引用
- 同时在 `CHANGELOG.md` 的 Unreleased 写 PR-C 条目

## 每个阶段的验证点

| 阶段 | 验证 |
|------|------|
| 1 | helper script 在本地 dry run，输出 benchmark-report/ |
| 2 | GitHub workflow yaml 通过 schema；manual dispatch 能跑到 stage 4 |
| 3 | docs 内容上下连贯，无 broken link |
| 4 | CHANGELOG.md Unreleased 段存在 PR-C 条目 |
