# Tour Guiado

## Como fazer este tour

Passeio ordenado, entry points → infraestrutura. Cada step usa contexto dos anteriores. Comece pelo README e desça até testes. Camadas: Core Feature Logic → Frontend Components → LLM Analytics & Command API.

## The tour

### Step 1: Visão geral do repositório — `README.md`

Visão geral do projeto. Ponto de partida: captura áudio → transcrição local → resumo via LLM → persistência SQLite. Define stack (Tauri 2.x + Rust + Next.js) e pontos de entrada (`frontend/src-tauri/src/main.rs`, `backend/whisper-custom/server/server.cpp`, `llama-helper/src/main.rs`). Todas as decisões dos steps seguintes derivam deste contrato.

### Step 2: Ponto de entrada C++ — `backend/whisper-custom/server/server.cpp`

Entry point legado — servidor Whisper customizado. Importa modelos de transcrição e expõe endpoints HTTP. Contexto: Step 1 lista `backend/` como legado; este arquivo é a razão — ainda existe como referência para o pipeline de whisper.cpp que o Rust (Step 3) substituiu. Conexão direta com `frontend/src/lib/whisper.ts` (Step 5) que abstrai essa camada.

### Step 3: Entry point Rust — `llama-helper/src/main.rs`

Binário standalone para inferência LLM local via llama_cpp_2. Lê requests JSON sobre stdin, escreve respostas sobre stdout — protocolo de stdio, não Tauri. Não chama `app_lib::run()`. Relação com Step 2: enquanto Step 2 é o servidor C++ legado de transcrição Whisper, Step 3 mostra a camada de LLM em Rust (geração de texto, não transcrição). `whisper.ts` (Step 5) não consome este helper — usa Tauri commands de transcrição diretamente.

### Step 4: Benchmark ASR — `scripts/asr_benchmark/benchmark.py`

Ferramenta de avaliação — benchmark de modelos ASR. Mede latência e qualidade de Whisper/Parakeet vs ground truth. Conexão: Step 2 mostra o servidor Whisper; Step 3 mostra o helper Rust; Step 4 é como você valida qual modelo roda melhor nesses entry points. Âncora da camada Docs & Tooling — mais dependências internas que qualquer outro arquivo de scripts.

### Step 5: Serviço de transcrição — `frontend/src/lib/whisper.ts`

Adapter de serviço — abstrai comunicação com backends de transcrição. Ponte entre React (Steps 6-7, 9, 11) e Rust (Step 3). Exporta funções que o frontend chama; internamente invoca Tauri commands. Step 2 (servidor legado de transcrição) é a origem histórica dos dados que este módulo normaliza; Step 3 (helper LLM) não é consumido aqui. Âncora da camada Service — mais importado que qualquer outro módulo em `frontend/src/lib/`.

### Step 6: Indicador de progresso — `frontend/src/components/onboarding/shared/ProgressIndicator.tsx`

Componente utilitário — barra de progresso do onboarding. Expõe 3 símbolos públicos, depende de 4 módulos internos. Conexão: Step 5 fornece dados de transcrição; Step 6 é como o usuário vê progresso durante setup inicial. Componente reutilizável — aparece em múltiplos flows de onboarding. Âncora da camada Utility.

### Step 7: Seção de configurações — `frontend/src/components/settings/SettingsSection.tsx`

Componente config — painel de settings do usuário. Define campos, validação, persistência local. Conexão: Step 6 mostra progresso; Step 7 permite ao usuário configurar o que afeta esse progresso (modelo ASR, dispositivo de áudio, API keys). Lida com `frontend/src/types/betaFeatures.ts` (Step 9) para features experimentais. Âncora da camada Config.

### Step 8: Repositório de referência de voz — `frontend/src-tauri/src/database/repositories/voice_reference.rs`

Repository pattern — persistência de voice prints para diarização. CRUD para embeddings de voz. Conexão: Step 5 transcreve áudio; Step 8 armazena assinaturas vocais usadas pelo pipeline de diarização (mencionado em Step 1). Dependência direta dos entry points (Steps 2-3) — dados fluem de captura → transcrição → armazenamento aqui. Camada Data Access.

### Step 9: Tipos de features beta — `frontend/src/types/betaFeatures.ts`

Type definitions — tipos TypeScript para features experimentais. Flags e configurações que controlam comportamento. Conexão: Step 7 (SettingsSection) usa estes tipos para renderizar toggles; Step 5 (whisper.ts) consulta flags para decidir qual backend usar. Âncora da camada Types — mais importado que qualquer outro em `frontend/src/types/`.

### Step 10: Hub de API — `frontend/src-tauri/src/api/mod.rs`

Re-export hub — módulo `api` com 124+ símbolos públicos. Structs de request/response, config types, profile types. Conexão: Steps 2-3 definem entry points; Step 8 persiste dados; Step 10 é a superfície de contrato entre Rust e frontend. Tudo que o frontend (Steps 5-7, 9, 11) consome via Tauri IPC passa por aqui. Camada LLM Analytics & Command API.

### Step 11: Tipos do workspace — `frontend/src/components/MeetingWorkspace/types.ts`

Type definitions — tipos TypeScript do workspace de reunião. Definem estrutura de transcript, meeting, UI state. Conexão: Step 10 exporta tipos Rust; Step 11 é o equivalente frontend — a ponte entre dados brutos e componentes React (Steps 6-7). Âncora da camada UI — mais importado em `frontend/src/components/`.

### Step 12: Setup de testes — `frontend/tests/setup.ts`

Test harness — configuração do suite de testes. Mocka módulos, setup de ambiente. Conexão: Steps 1-11 mostram como o sistema funciona; Step 12 é como você verifica que continua funcionando. Suite Rust vive ao lado — testes de tray, diarização, pipeline. Camada de verificação — fecha o loop.

## Onde ir depois

- **`docs/layers/architecture-overview.md`** — diagrama completo com todos os módulos e fluxos de dados entre camadas
- **`docs/architectural-layers/data-access.md`** — profundidade na camada SQLite/`DatabaseManager` usada pelo Step 8
- **`docs/layers/unit-integration-tests.md`** — cobertura de testes Rust e React, detalhes do Step 12
