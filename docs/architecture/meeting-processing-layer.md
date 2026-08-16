# Camada de Processamento de Reuniões

## Visão Geral

Camada de processamento de reuniões — converte transcrições brutas em resumos estruturados, identifica falantes e extrai itens de ação para persistência local

## Componentes Principais

### summary/
- `processor.rs` → chunking de texto, geração de resumo via LLM, extração de action items, normalização de idioma
- `service.rs` → orquestração async de processamento, cache de fingerprints, cancelamento por token
- `llm_client.rs` → cliente HTTP unificado para OpenAI/Claude/Groq/Ollama/CustomOpenAI, retry com backoff
- `failover.rs` → cadeia de fallback entre provedores, detecção de erros transientes
- `language_detection.rs` → detecção de idioma via `whatlang`, votação ponderada
- `metadata.rs` → persistência de idioma detectado/preferido em `metadata.json`
- `templates/` → sistema de templates para formatos de resumo
  - `types.rs` → `Template`, `TemplateSection` com validação
  - `defaults.rs` → templates embutidos via `include_str!`
  - `loader.rs` → carregamento de templates customizados

### diarization/
- `embedding.rs` → extração de embeddings (WeSpeaker VoxBlink2 ONNX), modelo singleton via `sherpa-onnx`
- `clustering.rs` → NME-SC lite: agrupamento espectral por cosine affinity, dependência `nalgebra`
- `offline.rs` → diarização offline pós-gravação, matching com perfis de voz
- `tracker.rs` → rastreamento de speakers em tempo real
- `voice_references.rs` → gerenciamento de referências de voz
- `speaker_preferences.rs` → preferências de reconhecimento (Automático/Sugestão/Desativado)

### LLM Provider Clients
- `anthropic/anthropic.rs` → cache de modelos Claude, fallback hardcoded
- `groq/groq.rs` → cache de modelos Groq, formato OpenAI-compatível
- `openai/openai.rs` → cache de modelos OpenAI, fallback hardcoded
- `summary_engine/` → engine local BuiltInAI via sidecar llama-helper

### database/
- `manager.rs` → `DatabaseManager` SQLite com WAL, migrações, auto-recuperação
- `repositories/` → camada de acesso:
  - `summary.rs` → `SummaryProcessesRepository`
  - `transcript.rs` → `TranscriptsRepository`
  - `meeting.rs` → `MeetingsRepository`
  - `speaker.rs` → `SpeakerRepository` (reconhecimento de voz)
  - `voice_reference.rs` → `VoiceReferenceRepository`
  - `setting.rs` → `SettingsRepository` (API keys, config)

## Fluxo de Dados

```
Transcrição (texto + labels de falante)
    ↓
┌─────────────────────────────────────┐
│  Pipeline de Resumo                 │
│  processor.rs:                      │
│    1. language_detection            │
│    2. chunk_text (multi-nível)      │
│    3. generate_summary              │
│    4. template rendering            │
│    5. translate/normalize           │
│    6. extract_action_items          │
└─────────┬───────────────────────────┘
          ↓
┌─────────────────────────────────────┐
│  Seleção de Provedor LLM           │
│  llm_client.rs → failover           │
│  Provedores:                        │
│  - BuiltInAI (local)                │
│  - Ollama (local)                   │
│  - OpenAI/Claude/Groq              │
│  - CustomOpenAI                     │
└─────────┬───────────────────────────┘
          ↓
Resumo (markdown + chapters + action items)
    ↓
database/repositories/summary.rs → SQLite
    ↓
Tauri events → Frontend UI
```

### Detalhes do Fluxo de Resumo
```
Texto do transcript → processor.rs:
    1. cached_english check (fingerprint match)
    2. se provedor cloud ou texto curto: single-pass
    3. se Ollama/BuiltInAI + texto longo: chunking multi-nível
       - chunk_text(text, threshold-300, 100)
       - resumo por chunk → combinar resumos
    4. renderização do template → final_report_system_prompt
    5. resolução de idioma:
       - inglês alvo + transcript inglês → pular
       - inglês alvo + transcript não-inglês → normalizar
       - alvo não-inglês → traduzir
    6. extract_action_items → JSON
    7. generate_grounded_chapters → tópicos ancorados em segmentos
```

### Fluxo de Diarização
```
Buffer de áudio → embedding.rs (WeSpeaker VoxBlink2)
    ↓
WindowedEmbedding (256-dim) → EmbeddingBuffer (max 2000)
    ↓
offline.rs (pós-gravação):
    1. sherpa-onnx OfflineSpeakerDiarization (se disponível)
    2. fallback: clustering.rs (NME-SC lite)
    3. speaker_preferences → match com voice_references
    4. labels → transcripts/transcript_chunks
```

## Notas de Arquitetura

- **Idioma**: resumo sempre gera em inglês primeiro, traduz/normaliza depois — cache de fingerprint detecta re-execuções
- **Cache de resumo**: `SummaryCacheSource` com 12 campos de fingerprint, incluindo template_fingerprint, model_provider, ollama_endpoint
- **Cancelamento**: `CancellationToken` por meeting_id, registry global `Lazy<Arc<Mutex<HashMap>>>`
- **Chunking**: baseado em caracteres (~2.85 chars/token), fronteiras de frase/palavra, overlap configurável
- **Glossário**: `<glossary>` block nos prompts LLM para proteção de hotwords (termos próprios)
- **Diarização offline**: O(N³) eigendecomposition limitada a 192 janelas, fallback graceful quando modelos indisponíveis
- **Reconhecimento de voz**: matching por cosine similarity contra `voice_references`, threshold configurável
- **Sidecar BuiltInAI**: processo separado via `llama-helper`, gerenciamento de lifecycle
- **Failover**: detecção de erros transientes (timeout, 5xx, 429), cadeia ordenada de provedores
- **Metadados por pasta**: `metadata.json` em cada pasta de reunião armazena idioma detectado/preferido
- **Database**: SQLite com WAL mode, foreign keys enforcement, auto-migração de `.db` legacy → `.sqlite`
