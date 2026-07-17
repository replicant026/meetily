#!/usr/bin/env python3
"""Wave 20 / PR-C: generate a hermetic smoke-test fixture.

We synthesize short sine-wave clips labelled with simple English sentences and
write them out as <id>.wav + <id>.txt pairs. The pair layout matches what
benchmark.py's iter_custom expects on disk, so CI never needs an internet
connection beyond the official GGML model download.

Why English rather than Chinese? This is a regression smoke test (does the
harness still run end-to-end?), not a quality benchmark. Real Chinese
quality checks stay in the local benchmark workflow described in
docs/asr_benchmark_zh.md.
"""
from __future__ import annotations

import argparse
import math
import struct
import wave
from pathlib import Path


PHRASES = [
    "hello world",
    "the quick brown fox",
    "one two three four five",
    "smoke test signal",
    "seven eight nine ten",
]


def synthesize(path: Path, text: str, freq: int = 440, duration_s: float = 0.6) -> None:
    """Write a 16-bit mono 16 kHz WAV containing a tone burst for `text`."""
    sample_rate = 16_000
    n_samples = int(duration_s * sample_rate)
    frames = bytearray()
    for i in range(n_samples):
        sample = int(0.3 * 32767 * math.sin(2 * math.pi * freq * (i / sample_rate)))
        frames += struct.pack("<h", sample)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(bytes(frames))


def main() -> int:
    p = argparse.ArgumentParser(description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--out-dir", required=True, type=Path,
                   help="Directory to write <id>.wav + <id>.txt pairs into (created if missing).")
    p.add_argument("--num-clips", type=int, default=5,
                   help="Number of clips to generate (clamped to len(PHRASES)).")
    args = p.parse_args()

    args.out_dir.mkdir(parents=True, exist_ok=True)
    n = max(1, min(args.num_clips, len(PHRASES)))
    for i in range(n):
        wav_path = args.out_dir / ("clip_{:02d}.wav".format(i))
        text = PHRASES[i]
        synthesize(wav_path, text, freq=440 + i * 110)
        # benchmark.py iter_custom reads sibling <id>.txt files for the
        # reference text. Keep these co-located with each WAV.
        txt_path = wav_path.with_suffix(".txt")
        txt_path.write_text(text, encoding="utf-8")
    print("Wrote {} clip pairs to {}".format(n, args.out_dir))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())