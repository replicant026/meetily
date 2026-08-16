# Conceitos-Chave

## Visão Geral

Seis conceitos sustentam Meetily. Três vivem na lógica core em Rust (`AppState`, `TranscriptionProvider`, `DatabaseManager`), dois na camada de UI React (`ErrorBoundary`, `SettingsSection`), um em scripts de benchmark (`ModelResult`). O sistema é app desktop Tauri: Rust backend + Next.js frontend, transcrição local via Whisper/Parakeet, persistência SQLite.

---

## Conceitos centrais

### `AppState`

Contêiner de estado central do Tauri backend. Um struct mínimo que segura `DatabaseManager` — ponto de entrada para toda persistência.

Onde vive: `frontend/src-tauri/src/state.rs`

```rust
pub struct AppState {
    pub db_manager: DatabaseManager,
}
```

Inicializado uma vez via `AppHandle`. Todos os Tauri commands que precisam de banco de dados recebem `AppState` como argumento.

---

### `TranscriptionProvider`

Trait async definindo a interface unificada de transcrição. Todo motor de STT (Whisper local, Parakeet, provedores cloud) implementa esta trait.

Onde vive: `frontend/src-tauri/src/audio/transcription/provider.rs`

Métodos-chave:
- `transcribe(audio, language, initial_prompt)` -> `Result<TranscriptResult, TranscriptionError>`
- `is_model_loaded()` -> `bool`
- `provider_name()` -> `&'static str`

Audio de entrada: 16kHz mono, f32. Resultado inclui texto, confiança opcional, flag de partial. Error types granulares: `ModelNotLoaded`, `AudioTooShort`, `EngineFailed`, `UnsupportedLanguage`.

---

### `DatabaseManager`

Gerencia pool SQLite via sqlx. Duas implementações coexistem:

| Versão | Localização | Status |
|--------|-------------|--------|
| Rust (atual) | `frontend/src-tauri/src/database/manager.rs` | Ativo, suportado |
| Python (legado) | `backend/app/db.py` | Arquivado, sem suporte |

O Rust `DatabaseManager`:
- Cria/migra banco via `sqlx::migrate!("./migrations")`
- Copia `.db` legado para novo `.sqlite` na primeira execução
- Habilita `PRAGMA foreign_keys = ON`
- Segura `SqlitePool` interno (Clone-safe via Arc)

O Python `DatabaseManager` (legado):
- Usa `aiosqlite`, schema validation via `SchemaValidator`
- Inicialização `_legacy_init_db()`
- **Não usar para novo desenvolvimento**

---

### `ErrorBoundary`

Componente React class capturando erros de renderização. Fallback seguro quando componentes filhos crasham.

Onde vive: `frontend/src/components/ErrorBoundary.tsx`

- `getDerivedStateFromError` -> estado `hasError: true`
- `componentDidCatch` -> log via `console.error`
- Botão "Reload App" tenta Tauri `invoke('reload_app')`, fallback para `window.location.reload()`
- Fallback hardcoded em inglês (class components não usam `next-intl` hooks)

---

### `SettingsSection`

Componente React container para seções de configuração. Padrão de UI para agrupar opções com título e descrição.

Onde vive: `frontend/src/components/settings/SettingsSection.tsx`

```typescript
function SettingsSection({ title, description, children, className })
```

Layout: título `<h2>` + descrição opcional + container com borda e divisores entre itens. Usa `cn()` para merge de classes Tailwind.

---

### `ModelResult`

Dataclass Python para resultados de benchmark ASR. Agrega métricas por modelo.

Onde vive: `scripts/asr_benchmark/benchmark.py`

- `model_name`, `language`, lista de `SampleResult`
- Propriedades computadas: `mean_cer`, `mean_rtf`
- Usado apenas em scripts de avaliação, não em runtime

---

## Como se conectam

`AppState` é o nó central: segura `DatabaseManager`, que é injetado em Tauri commands. `TranscriptionProvider` opera independente — não depende de `AppState` nem `DatabaseManager`, mas os transcripts resultantes eventualmente persistem via `DatabaseManager`.

Na camada UI, `SettingsSection` é container puro (sem lógica), usado para configurar preferências que afetam `TranscriptionProvider` (modelo, idioma). `ErrorBoundary` envolve componentes React, protegendo contra crashes que interromperiam a UI inteira.

Fluxo geral:
1. UI captura áudio → Tauri command inicia gravação
2. `TranscriptionProvider.transcribe()` converte áudio em texto
3. Resultado persiste via `DatabaseManager`
4. `AppState` compartilha `DatabaseManager` entre commands
5. `SettingsSection` permite configurar provider, modelo, idioma
6. `ErrorBoundary` garante resiliência da UI

`ModelResult` é isolado — só existe em scripts offline de avaliação de modelos.
