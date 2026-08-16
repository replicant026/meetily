# Meetily — Visão Geral do Repositório

## Resumo do Projeto

Meetily captura áudio do microfone e do sistema, transcreve localmente via Whisper/Parakeet com diarização de falantes, gera resumos de reunião via LLM (local ou externo), e persiste tudo em SQLite — sem dados na nuvem.

- Privacidade-first: transcrição e resumo rodam 100% local
- Desktop app: Tauri 2.x (Rust backend + Next.js frontend)
- Pipeline: captura de áudio → mixing profissional → VAD → transcrição → diarização → resumo → persistência

## Stack Tecnológica

| Camada | Tecnologia | Versão |
|--------|-----------|--------|
| Runtime Desktop | Tauri | 2.x |
| Backend Core | Rust | 1.77+ |
| Frontend UI | Next.js + React | 14 / 18 |
| Transcrição | whisper-rs (whisper.cpp) | — |
| Diarização | Proprietário (embeddings + clustering) | — |
| Áudio Capture | cpal + WASAPI/ScreenCaptureKit/ALSA | — |
| LLM | Ollama, Groq, OpenRouter, Anthropic | — |
| UI Components | Radix UI + BlockNote + Tailwind | — |
| Persistência | SQLite (via sqlx) | — |
| Build | Cargo workspace + pnpm | — |

## Pontos de Entrada

Entradas ativas do projeto (excluindo código arquivado/legado listado abaixo da tabela):

| Arquivo | Função |
|---------|--------|
| `frontend/src-tauri/src/main.rs` | Entry point Tauri → `app_lib::run()` |
| `frontend/src-tauri/src/lib.rs` | Registro de Tauri commands & state |
| `llama-helper/src/main.rs` | Servidor helper LLM local |
| `frontend/src/app/page.tsx` | Página principal React |
| `frontend/src/components/Sidebar/index.tsx` | Navegação lateral |
| `frontend/src/components/MainContent/index.tsx` | Área de conteúdo principal |
| `frontend/src/components/AISummary/index.tsx` | Geração de resumo IA |
| `frontend/src/components/TranscriptRecovery/index.ts` | Recuperação de transcrição |
| `frontend/src/components/ImportAudio/index.ts` | Importação de áudio |

Entradas históricas (arquivadas, não suportadas — ver AGENTS.md):
- `backend/app/main.py` — Backend FastAPI legado
- `backend/whisper-custom/server/server.cpp` — Servidor Whisper C++ legado

## Arquitetura

### Visão Geral

```
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (Tauri Desktop)                      │
│  ┌──────────────┐  ┌─────────────────┐  ┌───────────────────┐  │
│  │  Next.js UI  │  │   Rust Core     │  │  Whisper Engine   │  │
│  │  (React/TS)  │←→│  (Áudio + IPC)  │←→│  (Local STT)      │  │
│  └──────────────┘  └─────────────────┘  └───────────────────┘  │
│         ↑ Eventos Tauri          ↑ Pipeline de Áudio            │
└─────────────────────────────────────────────────────────────────┘
```

### Pipeline de Áudio (Crítico)

```
Áudio Raw (Mic + Sistema)
         ↓
┌────────────────────────────────────────────────────────────┐
│              AudioPipelineManager                          │
│  (audio/pipeline.rs)                                       │
└─────────────┬──────────────────────────┬───────────────────┘
              ↓                          ↓
    ┌─────────────────┐        ┌─────────────────────┐
    │  Camada Gravação │        │  Camada Transcrição │
    │  (Pré-mixagem)   │        │  (Filtrada por VAD) │
    └─────────────────┘        └─────────────────────┘
              ↓                          ↓
    RecordingSaver.save()      WhisperEngine.transcribe()
```

- Dois caminhos paralelos com propósitos distintos
- Gravação: mixing profissional (RMS-based ducking, clipping prevention)
- Transcrição: VAD filtra silêncio → apenas fala vai para Whisper (~70% redução de carga)

### Módulos Principais (Rust)

```
frontend/src-tauri/src/
├── audio/                    # Pipeline de áudio completo
│   ├── devices/              # Descoberta e configuração
│   │   ├── discovery.rs      # list_audio_devices
│   │   ├── microphone.rs     # default_input_device
│   │   ├── speakers.rs       # default_output_device
│   │   └── platform/         # windows.rs, macos.rs, linux.rs
│   ├── capture/              # Captura de streams
│   │   ├── system.rs         # Stream de áudio do sistema
│   │   ├── core_audio.rs     # macOS ScreenCaptureKit
│   │   └── backend_config.rs # Configuração de backend
│   ├── pipeline.rs           # Mixing & VAD
│   ├── recording_manager.rs  # Coordenação de gravação
│   └── recording_saver.rs    # Escrita de arquivos
├── whisper_engine/           # Transcrição local
├── parakeet_engine/          # Engine alternativa de transcrição
├── diarization/              # Rotulagem de falantes
├── summary/                  # Geração de resumo via LLM
├── database/                 # SQLite (DatabaseManager)
├── ollama/, groq/,           # Integrações LLM
│   anthropic/, openai/,
│   openrouter/
└── tray/                     # System tray
```

### Comunicação Rust ↔ Frontend

**Comando (Frontend → Rust):**
```typescript
await invoke('start_recording', { mic_device_name: "..." });
```

**Evento (Rust → Frontend):**
```rust
app.emit("transcript-update", payload)?;
```

- State compartilhado: `Arc<RwLock<T>>` para tarefas async, `Arc<AtomicBool>` para flags
- Estado React: SidebarProvider sincroniza com Rust via eventos Tauri

### Stack Frontend

| Componente | Biblioteca |
|-----------|-----------|
| Editor de transcrição | BlockNote |
| UI Primitives | Radix UI |
| Estilos | Tailwind CSS |
| Ícones | Heroicons |
| Estado Global | SidebarProvider (React Context) |
| i18n | next-intl |

### Aceleração GPU

| Plataforma | GPU Backend | Feature Cargo |
|-----------|------------|---------------|
| macOS | Metal + CoreML | `metal`, `coreml` (auto) |
| Windows | NVIDIA CUDA | `cuda` |
| Windows | AMD/Intel Vulkan | `vulkan` |
| Linux | NVIDIA CUDA | `cuda` |
| Linux | AMD ROCm | `hipblas` |

### Database

- SQLite via `sqlx` com `DatabaseManager`
- Local path: `~/Library/Application Support/Meetily/` (macOS), `%APPDATA%\Meetily\` (Windows)
- Modelos Whisper em: `frontend/models/` (dev), `%APPDATA%\Meetily\models\` (prod)

## Sinais de Saúde

| Métrica | Valor |
|---------|-------|
| Arquivos | ~717 |
| LOC Total | ~231.000 |
| Dependências Circulares | 7 |
| Hotspots (churn + complexidade) | 0 |
| Mais alterados (90d) | `page-content.tsx`, `CHANGELOG.md`, `request.ts` |
| Arquivo mais antigo | `backend_config.rs` (318 dias) |
| Locs Rust | 23.9% |
| Locs TypeScript | 45.0% |
| Locs JSON | 14.3% |

## Convenções

- Logging: `perf_debug!()` / `perf_trace!()` → zero overhead em release
- Erros Rust: `anyhow::Result`, frontend: try-catch com mensagens amigáveis
- Nomes: "microphone" e "system" consistentes (não "input"/"output")
- Git: `main` (estável), `fix/*` (bugs), `enhance/*` (features)
- Paths: APIs de path do Tauri para compatibilidade cross-platform — nunca hardcode
- Áudio: sample rate 48kHz, resampling no capture
