## O que este sistema faz em uma frase

Meetily captura áudio (mic + sistema), transcreve localmente via Whisper/Parakeet, diariza falantes, gera resumos via LLM, e persiste tudo em SQLite — sem nuvem.

## Um passeio por um exemplo

### Fase 1: Inicialização

- App inicia em `frontend/src-tauri/src/main.rs` → carrega Tauri runtime
- `frontend/src-tauri/src/lib.rs` registra módulos: `audio`, `diarization`, `database`, `ollama`
- Frontend Next.js carrega em `frontend/src/app/page.tsx`

### Fase 2: Captura de Áudio

- Usuário clica "Start Recording" → invoke `start_recording` command
- `frontend/src-tauri/src/audio/pipeline.rs::AudioPipeline::new` cria pipeline
- `AudioMixerRingBuffer::new` inicializa buffers mic + system (600ms window)
- Dois streams paralelos:
  - `capture/microphone.rs` → stream de mic
  - `capture/system.rs` → stream de system audio (WASAPI/BlackHole)
- `AudioMixerRingBuffer::add_samples` sincroniza streams assíncronos

### Fase 3: Processamento de Áudio

- `AudioPipeline::run` processa chunks em loop:
  - `audio_to_mono` converte para mono
  - `HighPassFilter` remove ruído de baixa frequência
  - `NoiseSuppressionProcessor` suprime ruído (RNNoise)
  - `LoudnessNormalizer` normaliza volume
  - `ContinuousVadProcessor` detecta fala ativa (VAD)
- VAD filtra ~70% do áudio (só fala vai para Whisper)

### Fase 4: Transcrição

- `whisper_engine/whisper_engine.rs::WhisperEngine::transcribe` recebe segmentos VAD
- Modelo Whisper/Parakeet carrega via `load_model`
- GPU acceleration automática: Metal (macOS), CUDA (Windows/Linux), Vulkan
- Resultado → evento `transcript-update` emitido via Tauri

### Fase 5: Diarização

- `diarization/voice_references.rs` usa embeddings de voz
- `database/repositories/voice_reference.rs` consulta referências salvas
- Atribui speaker_id a cada segmento transcrito

### Fase 6: Resumo

- `summary/service.rs` gera resumo via LLM
- Opções: Ollama (local), Claude, Groq, OpenRouter, OpenAI-compatible
- Template customizável via `summary/processor.rs`
- Resultado salvo em SQLite local

### Fase 7: Persistência

- `database/mod.rs` gerencia SQLite local
- Tabelas: meetings, transcripts, summaries, voice_references
- Caminhos via Tauri path APIs (cross-platform)
- Modelos em `~/Library/Application Support/Meetily/models/` (macOS) ou `%APPDATA%\Meetily\models\` (Windows)

## Por que está estruturado assim

- **Tauri**: framework nativo → binário leve, sem Electron overhead
- **Pipeline assíncrono**: mic + system audio chegam em rates diferentes → ring buffer sincroniza
- **VAD antes de Whisper**: filtra silêncio → 70% menos carga de transcrição
- **Modularização de áudio**: `devices/`, `capture/`, `pipeline.rs` separados → manutenção facilitada
- **GPU automática**: detecção em build time → zero config para usuário

## Onde ler a seguir

- `frontend/src-tauri/src/audio/pipeline.rs` — onde áudio vira dados estruturados
- `frontend/src-tauri/src/whisper_engine/whisper_engine.rs` — boundary entre áudio e texto
- `frontend/src-tauri/src/diarization/voice_references.rs` — como falantes são identificados
- `frontend/src-tauri/src/summary/service.rs` — como texto vira resumo acionável