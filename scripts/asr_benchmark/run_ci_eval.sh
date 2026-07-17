#!/usr/bin/env bash
# Wave 20 / PR-C: CI-friendly evaluation harness for the Whisper ASR benchmark.
#
# Usage:
#   ./scripts/asr_benchmark/run_ci_eval.sh [model_basename] [num_samples]
#
# Defaults: model=base, samples=5 (kept tiny for hosted-runner budget).
#
# What it does:
#   1. Resolve repo root from this script path.
#   2. Make sure whisper.cpp CLI is available (download official Linux release if missing).
#   3. Make sure the requested GGML model is present under ./models (download if missing).
#   4. Make sure a mini AISHELL-1 subset is present under ./data/aishell (download if missing).
#   5. Run benchmark.py with --output results.json.
#   6. Run generate_report.py to produce a markdown summary under ./benchmark-report/.
#
# All downloads use official upstream URLs and stay under the README-documented
# AISHELL-1 license terms (research use, attribution, no redistribution).

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
MODEL="${1:-base}"
SAMPLES="${2:-5}"

MODELS_DIR="$REPO_ROOT/models"
DATA_DIR="$REPO_ROOT/data/aishell"
OUTPUT_DIR="$REPO_ROOT/benchmark-report"
RESULTS_JSON="$OUTPUT_DIR/results.json"

mkdir -p "$MODELS_DIR" "$DATA_DIR" "$OUTPUT_DIR"

# 1. whisper.cpp CLI ----------------------------------------------------------------
WHISPER_BIN="$REPO_ROOT/bin/whisper-cli"
if [[ ! -x "$WHISPER_BIN" ]]; then
  echo "::group::Downloading whisper.cpp binary"
  mkdir -p "$(dirname "$WHISPER_BIN")"
  # Official ggerganov release. Linux x64 build. We deliberately use the CPU
  # build so the action stays portable across ubuntu-latest runners without
  # needing CUDA setup.
  curl -sL -o "$REPO_ROOT/bin/whisper-cli.tar.gz" \
    "https://github.com/ggerganov/whisper.cpp/releases/download/v1.7.5/whisper-cpp-x64-linux-avx2.tar.gz"
  tar -xzf "$REPO_ROOT/bin/whisper-cli.tar.gz" -C "$REPO_ROOT/bin/" --strip-components=1
  chmod +x "$WHISPER_BIN"
  echo "::endgroup::"
fi
echo "whisper.cpp CLI: $("$WHISPER_BIN" --help 2>&1 | head -n1 || echo '(found)')"

# 2. GGML model download ------------------------------------------------------------
MODEL_PATH="$MODELS_DIR/ggml-$MODEL.bin"
if [[ ! -f "$MODEL_PATH" ]]; then
  echo "::group::Downloading ggml-$MODEL model"
  curl -sL -o "$MODEL_PATH" \
    "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$MODEL.bin"
  echo "::endgroup::"
fi
echo "Model bytes: $(stat -c%s "$MODEL_PATH")"

# 3. Prepare dataset_root for benchmark.py --dataset custom --------------------
# iter_custom walks a directory looking for <id>.wav + <id>.txt pairs. We point
# $DATA_DIR at the fixture directory shipped in the repo so the smoke run never
# relies on third-party hosts. If a real dataset is materialised here in future
# the same script remains correct as long as the directory layout holds.
DATA_DIR="$REPO_ROOT/scripts/asr_benchmark/fixtures/sample-wav"
echo "Dataset root: $DATA_DIR"
ls "$DATA_DIR" | head -n 5

# 4. Run benchmark.py ---------------------------------------------------------------
echo "::group::Running benchmark.py"
cd "$REPO_ROOT"
python3 scripts/asr_benchmark/benchmark.py \
  --binary "$WHISPER_BIN" \
  --models-dir "$MODELS_DIR" \
  --dataset custom \
  --dataset-root "$DATA_DIR" \
  --models "$MODEL" \
  --max-samples "$SAMPLES" \
  --output "$RESULTS_JSON"
echo "::endgroup::"

# 5. Generate markdown report -------------------------------------------------------
echo "::group::Generate report"
python3 scripts/asr_benchmark/generate_report.py \
  --input "$RESULTS_JSON" \
  --output "$OUTPUT_DIR/report.md"
echo "::endgroup::"

echo "::group::Summary"
cat "$OUTPUT_DIR/report.md"
echo "::endgroup::"
echo "Done. Artifacts at: $OUTPUT_DIR/"
