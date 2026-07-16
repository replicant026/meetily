#!/usr/bin/env python3
"""
ASR Benchmark Report Generator (Wave 18 PR-53)

Read a benchmark.py JSON output and emit a markdown table sorted by
mean CER. Pure stdlib, no third-party dependencies.

Usage:
    python generate_report.py results.json
    python generate_report.py results.json --output report.md
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path


def _mean(m: dict, key: str) -> float:
    vals = [s[key] for s in m.get("samples", []) if key in s]
    return sum(vals) / len(vals) if vals else 0.0


def _sum(m: dict, key: str) -> float:
    return sum(s.get(key, 0.0) for s in m.get("samples", []))


def render(models: list[dict], title: str = "ASR 基准报告") -> str:
    rows: list[str] = []
    rows.append(f"# {title}")
    rows.append("")
    if not models:
        rows.append("_无模型数据。_")
        return "\n".join(rows) + "\n"
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


def main(argv) -> int:
    parser = argparse.ArgumentParser(
        description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
    )
    parser.add_argument("input", type=Path, help="Path to results.json from benchmark.py")
    parser.add_argument("--output", type=Path, default=None, help="Write to file instead of stdout")
    parser.add_argument("--title", default="ASR 基准报告", help="Markdown heading")
    args = parser.parse_args(argv)

    # utf-8-sig strips a leading BOM if present (PowerShell Add-Content writes one).
    data = json.loads(args.input.read_text(encoding="utf-8-sig"))
    if not isinstance(data, list):
        print("Expected a JSON array of model results", file=sys.stderr)
        return 2

    out = render(data, title=args.title)
    if args.output:
        args.output.write_text(out, encoding="utf-8")
        print(f"Wrote {args.output}", file=sys.stderr)
    else:
        print(out, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
