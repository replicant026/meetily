# Camada de Interface do Usuário

## Overview

Camada de apresentação do Tauri desktop app — renderiza componentes React, gerencia estado visual, e conecta UI ao backend Rust via Tauri commands/events. 135 arquivos, 1 edge connector.

**Responsabilidade principal:** Renderizar interface do usuário, gerenciar interações visuais, e traduzir ações do usuário em chamadas Tauri para o backend Rust.

## Key Components

### Tipos Fundamentais
- `frontend/src/components/MeetingWorkspace/types.ts` — Definições de tipos para workspace: `MeetingWorkspaceTab`, `WorkspaceParticipant`, `WorkspaceAction`, `AudioController`
- Tipos servem como contrato entre componentes de workspace e providers de contexto

### Componentes de Layout
- `frontend/src/components/AppShell/` — Shell principal da aplicação, orquestra layout
- `frontend/src/components/Sidebar/` — Navegação lateral, lista de reuniões, estado global
- `frontend/src/components/MainContent/` — Área principal de conteúdo
- `frontend/src/components/MainNav/` — Navegação principal

### Componentes de Reunião
- `frontend/src/components/MeetingWorkspace/` — Workspace completo da reunião
- `frontend/src/components/MeetingDetails/` — Detalhes e visualização de reuniões
- `frontend/src/components/RecordingControls.tsx` — Controles de gravação
- `frontend/src/components/RecordingStatusBar.tsx` — Status da gravação
- `frontend/src/components/AudioPlayer.tsx` — Player de áudio
- `frontend/src/components/AudioLevelMeter.tsx` — Medidor de nível de áudio

### Transcrição e Resumo
- `frontend/src/components/TranscriptView.tsx` — Visualização de transcrição
- `frontend/src/components/VirtualizedTranscriptView.tsx` — Transcrição virtualizada para performance
- `frontend/src/components/AISummary/` — Componentes de resumo por IA
- `frontend/src/components/TranscriptRecovery/TranscriptRecovery.tsx` — Modal de recuperação de transcrições interrompidas

### Configurações
- `frontend/src/components/settings/` — Painéis de configuração
- `frontend/src/components/SettingTabs.tsx` — Abas de configurações
- `frontend/src/components/PreferenceSettings.tsx` — Preferências do usuário
- `frontend/src/components/ModelSettingsModal.tsx` — Configurações de modelos
- `frontend/src/components/WhisperModelManager.tsx` — Gerenciamento de modelos Whisper
- `frontend/src/components/BuiltInModelManager.tsx` — Modelos embutidos

### Componentes de Áudio
- `frontend/src/components/DeviceSelection.tsx` — Seleção de dispositivos
- `frontend/src/components/AudioBackendSelector.tsx` — Seleção de backend de áudio
- `frontend/src/components/ParakeetModelManager.tsx` — Modelos Parakeet

### Onboarding
- `frontend/src/components/onboarding/OnboardingContainer.tsx` — Container do fluxo de onboarding
- `frontend/src/components/onboarding/steps/index.ts` — Steps do onboarding

### Oratórios
- `frontend/src/components/speakers/SpeakerDirectory.tsx` — **Edge connector** — Diretório de pessoas, importado por outras camadas
- `frontend/src/components/SpeakersSettings.tsx` — Configurações de oratórios

### UI Primitivas
- `frontend/src/components/ui/button.tsx` — Botão base (Radix + CVA variants)
- `frontend/src/components/ui/dialog.tsx` — Diálogo modal (Radix Dialog)
- `frontend/src/components/ui/app-button.tsx` — Botão específico da app
- `frontend/src/components/ui/app-dialog.tsx` — Diálogo específico da app
- `frontend/src/components/ui/visually-hidden.tsx` — Texto visualmente oculto (a11y)
- `frontend/src/components/ui/scroll-area.tsx` — Área de scroll
- `frontend/src/components/ui/input.tsx` — Input de texto
- `frontend/src/components/ui/alert.tsx` — Componente de alerta

### Outros Componentes
- `frontend/src/components/About.tsx` — Página "Sobre", versionamento, updates
- `frontend/src/components/Logo.tsx` — Logo da aplicação
- `frontend/src/components/LanguagePickerPopover.tsx` — Seletor de idioma
- `frontend/src/components/UiLanguagePicker.tsx` — Idioma da interface
- `frontend/src/components/EditableTitle.tsx` — Título editável inline
- `frontend/src/components/ConfirmationModel/` — Modal de confirmação
- `frontend/src/components/CustomDialog.tsx` — Diálogo customizado
- `frontend/src/components/MessageToast.tsx` — Toast de mensagens

## Data Flow

```
Usuário interage com componente React
    ↓
Componente atualiza estado local (useState/useReducer)
    ↓
State muda → React re-renderiza componentes afetados
    ↓
Ações do usuário → invoke('command_name', args) → Backend Rust
    ↓
Backend emite eventos → listen('event-name') → Frontend atualiza estado
    ↓
Sidebar context propaga mudanças globalmente
```

### Fluxos Principais
- **Gravação:** `RecordingControls` → `invoke('start_recording')` → Rust audio pipeline → eventos de status → `RecordingStatusBar`
- **Transcrição:** Rust emite `transcript-update` → `listen()` atualiza estado → `TranscriptView` renderiza
- **Reuniões:** `Sidebar` lista reuniões → navegação → `MeetingWorkspace` renderiza detalhes
- **Configurações:** `PreferenceSettings` → invoke commands → Rust atualiza config → persiste

### Padrão de Estado
- **Local:** `useState` para estado de componente
- **Context:** `SidebarProvider` para estado global (reuniões, gravação, transcrição)
- **Tauri Events:** Bridge entre Rust state e React state
- **IndexedDB:** Persistência local via `indexedDBService`

## Architecture Notes

### Stack
- **Framework:** Next.js 14 + React 18
- **UI Library:** Radix UI primitives + Tailwind CSS
- **Styling:** CVA (class-variance-authority) para variantes
- **State:** React Context + hooks customizados
- **i18n:** next-intl para traduções
- **Icons:** lucide-react

### Padrões Arquiteturais
- **Component Library Pattern:** `ui/` contém primitivas genéricas Radix, `app-button.tsx` e `app-dialog.tsx` são wrappers específicos da app
- **Container/Presenter:** Onboarding usa container + steps separados
- **Provider Pattern:** Context providers para estado global (Sidebar, Onboarding)
- **Edge Connector:** `SpeakerDirectory.tsx` é o único componente exportado publicamente para outras camadas

### Dependências
- **Depende de (3 imports):** Core Services — serviços de backend Rust via Tauri invoke
- **Depende de (2 imports):** Utility Components — utilitários compartilhados
- **Dependem dele (3 imports):** Meeting Processing — camada de processamento importa tipos
- **Dependem dele (2 imports):** Test Suites — testes importam componentes

### Limitações e Gotchas
- **Tauri IPC boundary:** Componentes não podem acessar Rust diretamente — tudo via `invoke()`
- **Event listeners:** Devem ser configurados no mount e limpos no unmount
- **Performance:** `VirtualizedTranscriptView` necessário para reuniões longas
- **i18n:** Todas as strings devem usar `useTranslations()`, nunca hardcodadas
- **Edge connector único:** `SpeakerDirectory.tsx` é o ponto de entrada público — cuidado ao refatorar

### Referências do Tour
- **Step 11: types.ts** — Âncora da camada UI — arquivo mais dependido, define contratos de tipos para workspace
