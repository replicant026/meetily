# src-tauri (Module)

## Overview
`src-tauri` é a camada de integração de infraestrutura do Tauri — gerencia adaptadores de provedores LLM, utilitários de console, estado global do app, e processamento pós-transcrição. Consuma configurações de API e áudio cru; produza respostas formatadas de modelo e comandos de UI.

## Public API Summary
- **Anthropic Adapter**: `get_anthropic_models()`, `clear_cache()`, `is_chat_model()` — discovery & cache de modelos Claude.
- **Groq Adapter**: `fetch_groq_models()` — busca metadados de chat-capable models via REST.
- **OpenAI Adapter**: `get_openai_models()`, `get_fallback_models()` — discovery de modelos OpenAI w/ fallback local.
- **Ollama Metadata**: 9 public symbols — parsing de modelos Ollama locais (depende de 37 módulos internos).
- **OpenRouter**: `get_openrouter_models()` — discovery de modelos OpenRouter.
- **Console Utils**: `hide_console()`, `show_console()`, `toggle_console()` — controle de console Windows via `SW_HIDE`/`SW_SHOW`.
- **State**: `AppState`, `RecordingState` — gerenciamento de estado global w/ `Arc<AtomicBool>` & `mpsc` channels.
- **LLM Postprocess**: 22 public symbols — normalização, extração de seções, e formatação de respostas LLM.

## Architecture Notes
- **Adapter Pattern**: provedores LLM seguem interface consistente → `Vec<Model>` com cache local (TTL-based).
- **Fallback Strategy**: `anthropic`, `groq`, & `openai` usam `FALLBACK_MODELS` hardcoded quando API falha.
- **Platform Specific**: `console_utils` é Windows-only (`SW_HIDE`/`SW_SHOW` constants).
- **State Management**: `AppState` usa `Arc<RwLock<T>>` cross-thread; `RecordingState` usa `AtomicBool` para flags.
- **Postprocessing Pipeline**: `llm_postprocess.rs` é o hotspot (6 commits/90d) — processa saída bruta LLM em estruturas tipadas.
- **Ownership**: Replicant026 mantém 100% dos arquivos; alta atividade em `llm_postprocess.rs`.
