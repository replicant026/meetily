# Wave 18 / PR-53 Implementation Plan

> **Spec:** docs/superpowers/specs/2026-07-16-asr-benchmark-custom.md
> **Base branch:** devtest

## Steps

### 1. Branch setup
- [x] `git switch -c feature/asr-benchmark-aishell` (already on it)

### 2. Add `iter_custom` to `benchmark.py`
File: `scripts/asr_benchmark/benchmark.py`

After `iter_aishell` function (line 185-197), add:

```python
def iter_custom(root: Path):
    """Yield (sample_id, wav_path, reference_text) for a user-supplied
    directory of <id>.wav / <id>.txt pairs."""
    for wav in sorted(root.glob("*.wav")):
        txt = wav.with_suffix(".txt")
        if not txt.exists():
            continue
        yield wav.stem, wav, txt.read_text(encoding="utf-8").strip()
```

Then extend the `DATASETS` dict:
```python
DATASETS = {
    "aishell": iter_aishell,
    "custom": iter_custom,
}
```

### 3. Create `generate_report.py`
File: `scripts/asr_benchmark/generate_report.py` (new, ~60 lines)

```python
#!/usr/bin/env python3
"""Read a benchmark.py JSON output and emit a markdown report.

Usage:
    python generate_report.py results.json
    python generate_report.py results.json --output report.md
"""
from __future__ import annotations
import argparse, json, sys
from pathlib import Path


def render(models: list[dict]) -> str:
    rows = []
    rows.append("# ASR 基准报告")
    rows.append("")
    rows.append("| Rank | Model | Mean CER | Mean RTF | Samples | Audio (s) |")
    rows.append("|------|-------|---------:|---------:|--------:|----------:|")
    sorted_models = sorted(models, key=lambda m: _mean(m, "cer"))
    for i, m in enumerate(sorted_models, 1):
        samples = m.get("samples", [])
        rows.append(
            f"| {i} | `{m.get('model_name', '?')}` "
            f"| {_mean(m, 'cer'):.3f} "
            f"| {_mean(m, 'rtf'):.2f} "
            f"| {len(samples)} "
            f"| {_sum(m, 'audio_seconds'):.1f} |"
        )
    return "\n".join(rows) + "\n"


def _mean(m: dict, key: str) -> float:
    vals = [s[key] for s in m.get("samples", []) if key in s]
    return sum(vals) / len(vals) if vals else 0.0


def _sum(m: dict, key: str) -> float:
    return sum(s.get(key, 0.0) for s in m.get("samples", []))


def main(argv):
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("input", type=Path, help="Path to results.json from benchmark.py")
    parser.add_argument("--output", type=Path, default=None, help="Write to file instead of stdout")
    args = parser.parse_args(argv)
    data = json.loads(args.input.read_text(encoding="utf-8"))
    out = render(data)
    if args.output:
        args.output.write_text(out, encoding="utf-8")
        print(f"Wrote {args.output}", file=sys.stderr)
    else:
        print(out, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
```

### 4. Add unit tests
File: `scripts/asr_benchmark/test_benchmark.py`

Add a new test class:
- `TestIterCustom` (3 tests): basic pair, missing .txt, empty dir
- `TestGenerateReport` (3 tests): sorted by CER, empty list, --output file

### 5. Update docs
File: `docs/asr_benchmark_zh.md`

Add a section "## 真实会议样本" after the "推荐配置" section:

```markdown
## 真实会议样本

`benchmark.py --dataset custom` 接受用户提供的 `*.wav + *.txt` 对：

\`\`\`
samples/
  meeting-001.wav
  meeting-001.txt
  meeting-002.wav
  meeting-002.txt
\`\`\`

每对文件命名一致即可，无需 manifest。

## 报告生成

`generate_report.py` 把 benchmark 输出 JSON 转成 markdown 表格：

\`\`\`bash
python scripts/asr_benchmark/generate_report.py results.json --output report.md
\`\`\`

输出格式：按 mean CER 升序排列，列出 model / CER / RTF / 样本数 / 音频时长。
```

### 6. Verify
- [ ] `python -m unittest discover scripts/asr_benchmark` passes (16 existing + 6 new = 22)
- [ ] Spec: `python benchmark.py --dataset custom --dataset-root tests/fixtures/custom -m tests/fixtures/custom/x.wav` (smoke, expect graceful skip)

### 7. Commit + push
- [ ] `git add -A`
- [ ] `git commit -m "feat(asr-bench): add custom-dataset mode + markdown report (PR-53)"`
- [ ] `git push -u fork feature/asr-benchmark-aishell`

### 8. PR
- URL: https://github.com/LSY1105/meetily/compare/devtest...feature/asr-benchmark-aishell?expand=1
- Title: `feat(asr-bench): add custom-dataset mode + markdown report (PR-53)`