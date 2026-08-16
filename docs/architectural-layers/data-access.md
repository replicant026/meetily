# Camada de Acesso a Dados

## Overview

Camada de persistência SQLite — gerencia ciclo de vida do banco, operações CRUD via repositórios, e fornece transações seguras para todos os dados do Meetily.

## Key Components

### `DatabaseManager` (`manager.rs`)
- Pool SQLite compartilhado (`SqlitePool`)
- Migração automática `sqlx::migrate!("./migrations")`
- WAL mode com `PRAGMA foreign_keys = ON`
- Detecção de primeiro lançamento (`is_first_launch`)
- Migração legacy `.db` → `.sqlite` (`import_legacy_database`)
- Recovery de WAL corrompido (cleanup WAL/SHM → retry)
- Transações helper (`with_transaction`)
- Cleanup no shutdown (`wal_checkpoint(TRUNCATE)` → pool close)

### `setup.rs`
- Inicialização na startup (`initialize_database_on_startup`)
- Emite `first-launch-detected` com delay 500ms
- Cria `AppState` com `DatabaseManager`

### `models.rs`
- `MeetingModel` — id, title, created_at, updated_at, folder_path
- `Transcript` — id, meeting_id, transcript, timestamp, audio_start_time/end_time, speaker
- `SummaryProcess` — meeting_id, status, result JSON, chunk_count, processing_time
- `TranscriptChunk` — meeting_id, transcript_text, model, chunk_size
- `Setting` — provider, model, whisper_model, API keys (groq/openai/anthropic/ollama/openrouter)
- `TranscriptSetting` — provider, model, whisper/deepgram/elevenLabs/groq/openai API keys

### Repositórios (`repositories/`)

| Repository | Tabela | Responsabilidade |
|------------|--------|------------------|
| `MeetingsRepository` | `meetings` | CRUD meetings, list_directory_items, delete cascata |
| `TranscriptsRepository` | `transcripts` | save_transcript (transação), search (LIKE), CRUD |
| `SummaryProcessesRepository` | `summary_processes` | get/create/reset/update status e result JSON |
| `SettingsRepository` | `settings` | upsert provider/model/API keys, custom OpenAI config |
| `SpeakerRepository` | `speaker_people`, `speaker_voice_references` | match embedding (cosine), CRUD speakers |
| `VoiceReferenceRepository` | `speaker_voice_references` | create/list/update voice refs, embedding bytes |
| `WorkspaceRepository` | `meeting_workspace_notes`, `meeting_action_states` | notes CRUD, action item states |
| `TranscriptChunksRepository` | `transcript_chunks` | chunks CRUD para processamento |

### `commands.rs`
- Tauri commands: `check_first_launch`, `import_and_initialize_database`, `initialize_fresh_database`
- Legacy DB detection: `select_legacy_database_path`, `detect_legacy_database`, `check_default_legacy_database`
- Recovery: `recover_orphan_meeting_cmd`, `retry_recovery_cmd`, `discard_recovery_cmd`
- Workspace: `get_meeting_note`, `save_meeting_note`, `get_meeting_action_states`, `set_meeting_action_completed`
- Audio: `get_meeting_audio_path` (probing mp4/mp3/m4a/wav)
- Dashboard: `list_home_meetings` (MeetingDirectoryItem)

### `orphan_checkpoints.rs`
- Scan e discard de checkpoints órfãos (WAL recovery)

## Data Flow

```
Frontend (React/TypeScript)
    ↓ invoke('start_recording', {...})
LLM Analytics & Command API (commands.rs)
    ↓ AppState.db_manager.pool()
Repositories (meeting/transcript/summary/settings/speaker/voice_reference/workspace)
    ↓ sqlx::query/query_as
DatabaseManager (manager.rs)
    ↓ SqlitePool
SQLite (meeting_minutes.sqlite)
```

### Fluxo principal — Recording
1. Frontend invoca Tauri command → `commands.rs`
2. Obtém `SqlitePool` via `AppState.db_manager.pool()`
3. Chama Repository específico (ex: `TranscriptsRepository::save_transcript`)
4. Repository usa `sqlx::query` com transação
5. `DatabaseManager` gerencia pool e conexões

### Fluxo — Startup
1. `setup::initialize_database_on_startup` detecta primeiro lançamento
2. Se novo: emite `first-launch-detected` → aguarda UI setup
3. Se existente: `DatabaseManager::new_from_app_handle` → WAL recovery se necessário
4. Cria `AppState` com pool → torna disponível para commands

### Fluxo — Migração Legacy
1. `check_default_legacy_database` detecta `meeting_minutes.db`
2. `import_and_initialize_database` copia → `import_legacy_database`
3. `DatabaseManager::new` copia .db → .sqlite → executa migrations

## Architecture Notes

- **Repository Pattern**: cada entidade tem repository unitário (sem estado, métodos estáticos)
- **Transações explícitas**: operations multi-table usam `conn.begin()` → commit/rollback manual
- **ID generation**: UUID v4 com prefixo (`meeting-{uuid}`, `transcript-{uuid}`, `ref-{uuid}`)
- **Settings single-row**: tabela `settings` usa `id='1'` com `ON CONFLICT` upsert
- **Embedding storage**: `Vec<f32>` serializado como bytes LE em coluna BLOB
- **Legacy compat**: auto-copia `meeting_minutes.db` → `meeting_minutes.sqlite` no primeiro acesso
- **WAL recovery**: defensivo cleanup de WAL/SHM corrompidos antes de retry
- **Audio path probing**: `get_meeting_audio_path` tenta mp4 → mp3 → m4a → wav
- **Edge connectors**: `voice_reference.rs`, `speaker.rs`, `transcript.rs`, `mod.rs` exportados para outras camadas
