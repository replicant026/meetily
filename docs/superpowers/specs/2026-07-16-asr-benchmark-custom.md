# Wave 18 / PR-53: Real-Meeting ASR Benchmark + Report Generator

> **For agentic workers:** superpowers:executing-plans
> **Base branch:** devtest
> **Parent PR:** Wave 15 PR-45a shipped `scripts/asr_benchmark/benchmark.py`
>                with AISHELL-1 public-dataset support. This PR adds
>                real-meeting support + a markdown report generator.

## Background

PR-45a (Wave 15) shipped a working ASR benchmark tool that runs whisper.cpp
against the AISHELL-1 public Chinese speech dataset. It produces a JSON
file with per-sample CER / WER / RTF.

What's missing:

1. **Real-meeting samples.** AISHELL-1 is read-speech (broadcaster
   narration). Meetily is used in **meetings**: cross-talk, code-switching
   (zh + en), filler words, domain vocabulary. The same Whisper model
   that scores 4.8% CER on AISHELL may score 9-12% on a real meeting.
2. **Human-readable reports.** The JSON output is great for CI but not
   for a human reviewer comparing models. We need a markdown table that
   fits inside a PR description or release note.

This PR adds both, behind two new flags / files.

## Goals

- `--dataset custom` mode: point the benchmark at a directory of
  `*.wav + *.txt` pairs, with no other change to the CLI surface.
- `scripts/asr_benchmark/generate_report.py`: read the JSON output of
  `benchmark.py`, emit a markdown table sorted by mean CER.
- 5-6 new unit tests for both pieces.
- 1-page addition to `docs/asr_benchmark_zh.md`.

## Non-Goals

- Not adding GitHub Actions / CI integration (separate PR if desired).
- Not adding a web dashboard.
- Not changing AISHELL support.
- Not touching any Rust / Tauri / frontend code.
- Not shipping any real-meeting sample audio (those are private; the
  user brings their own).

## Scope

| File | Change | Lines |
|------|--------|-------|
| `scripts/asr_benchmark/benchmark.py` | Add `iter_custom(root)` + register in `DATASETS` + extend `--dataset` choices | +20 |
| `scripts/asr_benchmark/generate_report.py` (new) | JSON -> markdown report | +60 |
| `scripts/asr_benchmark/test_benchmark.py` | Add 6 tests for `iter_custom` + `generate_report` | +60 |
| `docs/asr_benchmark_zh.md` | Add "真实会议样本" section + "报告生成器" usage | +30 |
| `docs/superpowers/specs/2026-07-16-asr-benchmark-custom.md` (new) | This file | +130 |
| `docs/superpowers/plans/2026-07-16-asr-benchmark-custom.md` (new) | Plan | +60 |

**Total estimated diff: ~360 insertions, 0 deletions** (all additive;
backward-compatible with PR-45a JSON output).

## Algorithm

### `iter_custom(root)`

```
For each <id>.wav under root:
    if sibling <id>.txt exists:
        yield (id, wav, txt.read_text().strip())
```

The directory layout is the de-facto standard for ASR datasets
(Librispeech, CommonVoice, AISHELL all use the same shape). No manifest
file is needed.

### `generate_report.py`

```
1. Read input JSON (list of ModelResult dicts).
2. For each model, compute mean_cer / mean_rtf / total_audio_seconds.
3. Sort models by mean_cer (best first).
4. Emit markdown table:
   | Rank | Model | Mean CER | Mean RTF | Samples | Audio (s) |
5. Print to stdout (or --output path).
```

The script is dependency-free: only the stdlib (`json`, `argparse`,
`pathlib`).

## Acceptance

- [ ] `python benchmark.py --dataset custom --dataset-root samples/ ...`
      runs end-to-end on a fixture (3-5 wav/txt pairs).
- [ ] `python generate_report.py results.json` emits a markdown table
      with 4 columns.
- [ ] 6 new unit tests pass.
- [ ] `docs/asr_benchmark_zh.md` describes the new mode + report.
- [ ] No new dependencies; stdlib only.
- [ ] No frontend / i18n changes.

## Risks

| Risk | Mitigation |
|------|-----------|
| Custom dir contains stale `.txt` from prior runs | `iter_custom` reads .txt verbatim; user responsibility to keep pairs in sync |
| Big custom set times out the benchmark | `--max-samples` flag already exists from PR-45a |
| Report generator chokes on malformed JSON | `json.JSONDecodeError` propagates with a clear message |