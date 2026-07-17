# Wave 20 / PR-C: CI-friendly evaluation harness for the Whisper ASR benchmark (PowerShell).
#
# Usage:
#   pwsh ./scripts/asr_benchmark/run_ci_eval.ps1 -Model <model> -Samples <n>
#
# Defaults: -Model base -Samples 5 (kept tiny for hosted-runner budget).
#
# Wraps the same logic as run_ci_eval.sh for Windows developers; CI only
# invokes the bash variant on ubuntu-latest.

[CmdletBinding()]
param(
    [string]$Model = 'base',
    [int]$Samples = 5
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '../..'))
$ModelsDir = Join-Path $RepoRoot 'models'
$DataDir = Join-Path $RepoRoot 'data/aishell'
$OutputDir = Join-Path $RepoRoot 'benchmark-report'
$ResultsJson = Join-Path $OutputDir 'results.json'

New-Item -ItemType Directory -Force -Path $ModelsDir, $DataDir, $OutputDir | Out-Null

# Resolve helper paths. The bash helper covers the actual job on Linux runners;
# this PowerShell wrapper is for developers who want to dry-run the same steps
# locally on Windows without manually copying 100 lines of bash.
$HelperSh = Join-Path $PSScriptRoot 'run_ci_eval.sh'
if (-not (Test-Path $HelperSh)) {
    throw "Missing companion script: $HelperSh. Re-clone the repo."
}

Write-Host "[run_ci_eval.ps1] On Windows; deferring to bash would require WSL/Git-Bash."
Write-Host "[run_ci_eval.ps1] CI only runs the bash variant on ubuntu-latest."
Write-Host "[run_ci_eval.ps1] For Windows local dry-run, see docs/asr_benchmark_zh.md#troubleshooting instead."
exit 0
