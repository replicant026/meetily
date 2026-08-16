## Overview

Camada de testes unitários e de integração — valida componentes React, hooks, funções utilitárias, e módulos Rust (tray, diarização) antes de deploy. Não executa em runtime; garante correção por verificação estática + testes isolados.

## Key Components

### Rust (backend nativo)

- `frontend/src-tauri/src/tray/tray_test.rs` — valida labels de tray por estado (`recording`, `idle`, `error`), garante ações contextuais (stop só quando gravando, start oculto se já gravando). 3 testes unitários puros.
- `frontend/src-tauri/src/diarization/voice_references_test.rs` — testa janelas de referência de voz (`select_reference_window`), peaks de waveform (`build_waveform_peaks`), paths seguros (`managed_reference_path`), e criação de WAV em SQLite temporário. 282 linhas, mix unit + integration.

### React (frontend)

| Arquivo | Escopo |
|---------|--------|
| `HomeFlow.test.tsx` | HomeDashboard — quick start visível, empty meetings |
| `AppShell.a11y.test.tsx` | Accessibility — Ctrl+K abre busca, Escape fecha, roles ARIA |
| `SettingsShell.test.tsx` | Navegação de settings — seções General/Audio/Speakers, estado default |
| `AssignSpeakerDialog.test.tsx` | Dialogo de atribuição — lista pessoas, cria pessoa, atribui speaker |
| `SpeakerFlow.test.tsx` | SpeakerDirectory — CRUD completo, reconhecimento prefs, upload áudio |
| `app-status.test.tsx` | Componente status — permission state com ação, danger como alert |
| `useMeetingDirectory.test.tsx` | Hook — invoke `list_home_meetings`, error state |
| `meeting-directory.test.ts` | `groupMeetingsByDate` — today/week/older + empty input |

## Data Flow

```
Test runner (Vitest frontend, cargo test backend)
    |
    ├── React tests: mock @tauri-apps/api/core (invoke) → component render → assert DOM
    │     Mock next/navigation, next-intl, sonner, useMeetingDirectory
    │     userEvent → simulate clicks/keyboard → verify behavior
    │
    └── Rust tests: #[test] fn → call pure functions → assert
          voice_references: SQLite memory pool → migrate → query → assert
          tray: state string → label/actions → assert
```

### Mocks padrão (frontend)

- `@tauri-apps/api/core` → `vi.fn().mockResolvedValue([])`
- `next/navigation` → `useRouter` com push/back mock
- `next-intl` → `useTranslations` retorna key original ou last segment
- `sonner` → `toast.success/error` mock
- `useMeetingDirectory` → retorna `{ meetings, isLoading, error, refetch }`

## Architecture Notes

- **Isolamento Tauri**: Todo invoke Tauri é mockado; testes rodam em Node, não precisam de binário nativo
- **Edge connectors** (Rust test modules) exportam funções testáveis: `tray_label_for_state`, `select_reference_window`, `build_waveform_peaks`
- **SQLite em memória**: `voice_references_test.rs` usa `sqlite::memory:` + `sqlx::migrate!` para testes de integração com DB
- **Accessibility-first**: `AppShell.a11y.test.tsx` valida roles ARIA, keyboard navigation, focus management
- **Hook testing**: `useMeetingDirectory.test.tsx` usa `renderHook` + `waitFor` para async state
- **Função pura**: `meeting-directory.test.ts` testa `groupMeetingsByDate` isoladamente, sem mocks
- **Coverage**: 36 arquivos total, 8 entry points, 2 edge connectors (exportados por outros módulos)
- **Dependências**: importa de Frontend Components (2) e Core Feature Logic (1); Core Feature Logic importa de volta (2)
