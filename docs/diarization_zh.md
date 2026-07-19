# Speaker Diarization Backend (Wave 27 / PR-44b)

## Overview

The Rust offline diarization pass runs after `RecordingSaver::finalize()` and
assigns stable `Speaker N` labels to each transcript row. The realtime hint
(PR-44a) and the offline re-clustering share the same embedding model so the
labels stay self-consistent.

## Model

- Default: **CAM++ ONNX** exported from 3D-Speaker (ModelScope, Apache-2.0)
- Cache path: `~/.cache/meetily/speaker-camplus.onnx`
- Embedding dim: 192 (`diarization::EMBEDDING_DIM`)
- Window: 1.5 s, hop 0.75 s (matches PR-44a realtime phase)

## Install

Run once after pulling this PR:

```bash
# Pick whichever mirror is reachable; the on-disk filename is fixed.
curl -L https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/speaker-camplus.onnx \
  -o ~/.cache/meetily/speaker-camplus.onnx
```

If the download fails (firewall, mirror offline, etc.), realtime + offline
paths both degrade gracefully: `transientSpeaker` stays `None` and the DB
keeps `speaker = NULL`. UI continues to render without speaker labels.

## Configuration

Read at task start via `DiarizationState` and exposed through
`set_diarization_config` (lands in PR-44c):

| Variable / Setting | Default | Effect |
|---|---|---|
| `enabled` | `true` | Master switch; when off, no embedding runs and the UI hides chips |
| `min_speakers` | `2` | Lower bound for spectral-cluster k selection |
| `max_speakers` | `6` | Upper bound; clamp prevents over-splitting overlapping talkers |

## Failure Modes

| Step | Symptom | Fallback |
|---|---|---|
| Model missing / load failure | `transientSpeaker = None`; offline pass warns and returns 0 | Existing UI (no speaker label) |
| `audio.wav` corrupted | Realtime windows still cluster | Stable labels from realtime buffer only |
| Clustering returns 0 speakers | `update_segment_speakers` no-op | UI remains label-free |
| DB write fails | Single warn line; recording itself is unaffected | Same as above |

## References

- Spec: `docs/superpowers/specs/2026-07-21-diarization-realtime-design.md`
- Plan: `docs/superpowers/plans/2026-07-21-diarization-realtime.md`
- sherpa-onnx (Apache-2.0): https://github.com/k2-fsa/sherpa-onnx
- 3D-Speaker CAM++ (Apache-2.0): https://github.com/modelscope/3D-Speaker
