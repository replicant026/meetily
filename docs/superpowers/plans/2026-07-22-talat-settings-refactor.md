# Refatoração das configurações no estilo Talat

> **Para implementar:** siga este plano com o skill \`executing-plans\`, executando cada tarefa em ordem e validando antes de avançar.

**Objetivo:** transformar \`/settings\` em uma experiência única, densa e navegável como a do Talat, preservando as configurações já funcionais do Meetily e adicionando as opções equivalentes selecionadas para esta fase.

**Arquitetura:** substituir as abas horizontais atuais por uma navegação lateral fixa de seções e um painel de conteúdo com linhas de preferência (rótulo, descrição e controle). Centralizar novas preferências não sensíveis no Tauri Store; manter dados de gravação, notificação e modelos em seus serviços/commands atuais. Cada comando novo será registrado no Tauri core e chamado pela UI por \`invoke\`.

**Tecnologias:** Next.js 14, React 18, TypeScript, Tailwind, Radix UI, Tauri 2, Rust, \`@tauri-apps/plugin-store\`, \`next-intl\`, Vitest.

## Escopo acordado

Implementar as seções equivalentes ao Talat:

- Geral e aparência: iniciar com o sistema, iniciar oculto/minimizado, tema, escala da interface, idioma e preferência de fixar/ocultar a barra lateral.
- Áudio: microfone e áudio do sistema preferidos, visualização de todos os dispositivos e configuração do backend de áudio quando disponível.
- Gravações: salvar áudio, pasta, formato, padrão de nome e retenção de áudio.
- Atalhos: iniciar/parar gravação e captura de tela.
- Notificações: chave geral e controles granulares de início/fim de gravação, atualizações e supressão durante gravação.
- Transcrição: provedor/modelo, idioma, vocabulário personalizado (hotwords), pós-processamento, limiar para áudio silencioso.
- Falantes: perfis existentes, política de correspondência de falantes anteriores e bloqueio/associação dos canais microfone e sistema.
- LLMs: provedores existentes, criação/edição/remoção de provedor compatível com OpenAI/Ollama e política de modelo local em memória.
- Resumos: LLM selecionado, geração automática, capítulos, pontos de ação, idioma/prompt padrão e aba inicial do detalhe.
- Exportações: padrão de nome, formato de data ISO, metadados YAML/inline e exportação automática local.
- Manter “Experimental” como seção Advanced separada, sem misturá-la às opções do Talat.

Ficam explicitamente fora desta fase: ditado, integração de calendário, detecção/início automático de reuniões, webhooks e MCP. Os controles de calendário, de início automático e de integração remota não devem aparecer na nova tela.

## Inventário e decisões de mapeamento

| Talat | Meetily atual | Decisão |
| --- | --- | --- |
| Preferências gerais e notificações | \`PreferenceSettings.tsx\` + \`ConfigContext\` | Reorganizar e ampliar; não duplicar o carregamento de notificações. |
| Dispositivos, salvar gravações e pasta | \`RecordingSettings.tsx\` + \`recording_preferences.rs\` | Separar visualmente “Áudio” e “Gravações”; manter os commands existentes. |
| Modelo, hotwords e pós-processamento | \`TranscriptSettings.tsx\` | Manter o contrato atual e adicionar idioma/limiar como preferências explícitas. |
| Perfis de voz | \`SpeakersSettings.tsx\` + commands em \`lib.rs\` | Preservar renomear/excluir e acrescentar política de matching/canais. |
| Provedor de resumo | \`SummaryModelSettings.tsx\` | Desmembrar em “LLMs” (cadastro) e “Resumos” (uso padrão). |
| Preferências de resumo por idioma | \`summary-language-preferences.ts\` | Reaproveitar em vez de criar uma segunda chave local. |
| Exportação de transcrição | \`transcript-export.ts\` | Aplicar as novas preferências no exportador, sem webhook. |

## Tarefa 1 — Definir o contrato único das novas preferências

**Arquivos:**
- Criar: \`frontend/src/lib/settings-preferences.ts\`
- Criar: \`frontend/src/lib/settings-preferences.test.ts\`
- Modificar: \`frontend/src/contexts/ConfigContext.tsx\`
- Modificar: \`frontend/messages/en.json\`
- Modificar: \`frontend/messages/pt.json\` e os demais catálogos existentes

1. Criar tipos discriminados para preferências de interface, atalhos, retenção, transcrição, falantes, ciclo de vida do LLM, resumo e exportação.
2. Definir defaults seguros e compatíveis: tema \`system\`; escala \`100\`; gravação local ligada; retenção \`never\`; matching de falante \`suggest\`; canais separados ligados; exportação automática desligada; sem credenciais no Store.
3. Criar helpers puros para validar/migrar uma versão ausente ou antiga de \`settings.json\`; dados inválidos devem voltar apenas o campo inválido ao default.
4. Expor no \`ConfigContext\` um estado carregado uma vez, \`updateAppSettings(patch)\`, indicador de persistência e tratamento de erro. Ele deve persistir no Tauri Store, fazer rollback otimista em erro e nunca serializar API keys.
5. Criar todas as chaves i18n para títulos, descrições, opções, estados de carregamento e mensagens de erro/sucesso. Não deixar textos em inglês hard-coded nos componentes.
6. Cobrir a normalização/migração e o merge parcial com testes Vitest.

**Validação:**

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/lib/settings-preferences.test.ts
pnpm run test:i18n
\`\`\`

## Tarefa 2 — Criar a casca visual de configurações do Talat

**Arquivos:**
- Modificar: \`frontend/src/app/settings/page.tsx\`
- Criar: \`frontend/src/components/settings/SettingsShell.tsx\`
- Criar: \`frontend/src/components/settings/SettingsNavigation.tsx\`
- Criar: \`frontend/src/components/settings/SettingsSection.tsx\`
- Criar: \`frontend/src/components/settings/SettingsRow.tsx\`
- Criar: \`frontend/src/components/settings/settings-sections.ts\`
- Criar: \`frontend/src/components/settings/SettingsShell.test.tsx\`

1. Remover a animação de sublinhado e a faixa de tabs horizontais. A página deverá ter cabeçalho compacto com voltar e título, coluna esquerda de 224–256 px e painel direito rolável.
2. Modelar as seções em uma fonte única: Geral, Áudio, Gravações, Atalhos, Notificações, Transcrição, Falantes, LLMs, Resumos, Exportações e Avançado.
3. Na navegação, usar ícone, nome e estado ativo; em telas estreitas, convertê-la em seletor/Drawer sem perder acesso a todas as seções.
4. Criar \`SettingsSection\` para título, texto de contexto e divisores, e \`SettingsRow\` para alinhar título, ajuda e controles à direita como no Talat.
5. Tratar controles dependentes com disabled state e explicação (por exemplo, retenção indisponível se “Salvar gravações” estiver desligado).
6. Dar foco e atualizar hash/URL (\`/settings#transcription\`, por exemplo) ao trocar de seção, permitindo links diretos e retorno à mesma seção.
7. Renderizar uma única seção ativa por vez e manter dados globais no contexto para evitar que alternar entre seções descarregue/regrave preferências.

**Validação:**

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/components/settings/SettingsShell.test.tsx
pnpm run lint
\`\`\`

## Tarefa 3 — Migrar Geral, áudio e gravações para as seções novas

**Arquivos:**
- Modificar: \`frontend/src/components/PreferenceSettings.tsx\`
- Modificar: \`frontend/src/components/RecordingSettings.tsx\`
- Modificar: \`frontend/src/components/DeviceSelection.tsx\`
- Modificar: \`frontend/src-tauri/src/audio/recording_preferences.rs\`
- Modificar: \`frontend/src-tauri/src/lib.rs\`
- Modificar: \`frontend/src-tauri/Cargo.toml\`
- Modificar: \`frontend/package.json\`
- Criar: \`frontend/src/components/settings/GeneralSettings.tsx\`
- Criar: \`frontend/src/components/settings/AudioSettings.tsx\`
- Criar: \`frontend/src/components/settings/RecordingSettingsSection.tsx\`
- Criar: \`frontend/src-tauri/src/app_preferences.rs\`

1. Extrair idioma, consentimento analítico e locais de dados de \`PreferenceSettings\` para \`GeneralSettings\`; manter as ações de abrir diretórios existentes.
2. Implementar tema (Sistema/Claro/Escuro), escala (80/90/100/110/120%) e preferência de barra lateral. Aplicar tema e escala no elemento raiz antes da primeira pintura possível; integrar a preferência da barra lateral ao \`SidebarProvider\`.
3. Adicionar \`tauri-plugin-autostart\` e um serviço Rust \`app_preferences.rs\` para habilitar/desabilitar “iniciar com o sistema”. Persistir “iniciar oculto” no mesmo serviço e, durante o setup do Tauri, respeitar essa opção sem impedir que o usuário abra a janela pelo tray/atalho.
4. Em \`AudioSettings\`, reutilizar \`DeviceSelection\` para microfone e áudio do sistema e acrescentar “mostrar todos os dispositivos” como filtro da lista, sem mudar a seleção já persistida. Expor o backend de áudio apenas se o command atual o suportar.
5. Em \`RecordingSettingsSection\`, reutilizar \`get_recording_preferences\`/\`set_recording_preferences\` para salvar áudio, pasta e formato. Completar a seleção de pasta com o command existente, incluir padrão de nome seguro e uma política de retenção.
6. Implementar no Rust a limpeza de gravações vencidas: nunca apagar uma gravação aberta/em andamento, só apagar arquivos gerados pelo Meetily dentro da pasta configurada, registrar cada remoção e executar na inicialização e após finalizar uma gravação. O default \`never\` não remove arquivos.
7. Remover os cartões antigos duplicados, mas preservar a compatibilidade de \`RecordingPreferences\` para quem já tenha \`preferences.json\`.

**Validação:**

\`\`\`powershell
cd D:\meetily\frontend
cargo check --manifest-path src-tauri/Cargo.toml
pnpm run lint
pnpm run build
\`\`\`

Teste manual: alterar tema/escala e reiniciar; alternar auto-start e confirmar no sistema; escolher dispositivos, iniciar uma gravação e confirmar que a seleção foi aplicada; confirmar que retenção \`never\` não remove nada.

## Tarefa 4 — Implementar atalhos e notificações granulares

**Arquivos:**
- Criar: \`frontend/src/components/settings/ShortcutSettings.tsx\`
- Criar: \`frontend/src/components/settings/NotificationSettings.tsx\`
- Modificar: \`frontend/src/components/PreferenceSettings.tsx\`
- Modificar: \`frontend/src/contexts/ConfigContext.tsx\`
- Modificar: \`frontend/src-tauri/src/notifications/commands.rs\`
- Modificar: \`frontend/src-tauri/src/notifications/manager.rs\`
- Modificar: \`frontend/src-tauri/src/lib.rs\`
- Modificar: \`frontend/src-tauri/Cargo.toml\`
- Modificar: \`frontend/package.json\`

1. Acrescentar o plugin/integração Tauri de global shortcut e commands para registrar, validar conflito, substituir e limpar atalhos. Os padrões serão \`Ctrl/Cmd+Shift+R\` para iniciar/parar e \`Ctrl/Cmd+Shift+S\` para captura.
2. Conectar o atalho de gravação ao mesmo fluxo de start/stop já usado pela UI; a captura deve chamar a ação de screenshot do desktop somente se a funcionalidade de screenshot estiver disponível, exibindo status “indisponível nesta plataforma” quando não estiver.
3. Migrar a chave geral atual de notificação para a nova seção sem alterar seu significado: ela habilita/desabilita as notificações filhas.
4. Ampliar \`NotificationPreferences\` no Rust e no TypeScript com início, fim, atualização disponível, atualização instalada e supressão durante gravação. Não criar notificações de chamada, calendário ou início automático.
5. Centralizar a decisão de emitir notificação no \`NotificationManager\`, garantindo que cada ponto de emissão consulte a preferência granular e a regra de supressão.
6. Mostrar erros de permissão/registro na linha pertinente e restaurar o último valor confirmado em caso de falha.

**Validação:**

\`\`\`powershell
cd D:\meetily\frontend
cargo check --manifest-path src-tauri/Cargo.toml
pnpm run lint
\`\`\`

Teste manual: registrar e disparar cada atalho, trocar um atalho em conflito e negar permissão de notificação; confirmar que cada toggle altera somente o evento correspondente.

## Tarefa 5 — Reorganizar Transcrição e Falantes sem regressão funcional

**Arquivos:**
- Modificar: \`frontend/src/components/TranscriptSettings.tsx\`
- Modificar: \`frontend/src/components/SpeakersSettings.tsx\`
- Criar: \`frontend/src/components/settings/TranscriptionSettingsSection.tsx\`
- Criar: \`frontend/src/components/settings/SpeakerSettingsSection.tsx\`
- Modificar: \`frontend/src-tauri/src/lib.rs\`
- Modificar: os módulos atuais de diarização/transcrição encontrados pelos commands de perfil e configuração
- Criar: testes unitários nos módulos TypeScript extraídos

1. Preservar os fluxos de provider/modelo, API key, hotwords e pós-processamento de \`TranscriptSettings\`, mas apresentá-los em blocos do Talat: modelo/idioma, vocabulário e qualidade.
2. Incluir seletor de idioma de transcrição e “ignorar áudio silencioso” com valor explicável. Mapear o último ao limiar/VAD já existente; se não houver configuração do limiar, criar command tipado e aplicar somente antes de enviar segmentos ao Whisper.
3. Manter a edição de perfis, renomear, excluir e reprodução do \`SpeakersSettings\`.
4. Adicionar política de matching de reuniões anteriores: desativado, sugerir e automático. Aplicar a política no ponto que consome perfis de voz, não apenas na UI; “sugerir” nunca altera um nome sem confirmação.
5. Adicionar bloqueio de canais microfone/sistema. Quando ligado, o diarizador pode reconhecer um perfil por canal, mas não deve mover falantes entre os dois; quando desligado, usar a estratégia atual.
6. Mostrar uma explicação clara sobre privacidade/localidade dos perfis e preservar perfis existentes em qualquer migração de schema.

**Validação:**

\`\`\`powershell
cd D:\meetily\frontend
cargo check --manifest-path src-tauri/Cargo.toml
pnpm run lint
pnpm run test:i18n
\`\`\`

Teste manual: alterar provider/modelo/hotword, gravar um trecho curto e verificar a transcrição; renomear/excluir um perfil; validar que “sugerir” não renomeia automaticamente e que o bloqueio de canal é respeitado.

## Tarefa 6 — Separar cadastro de LLMs da configuração de Resumos

**Arquivos:**
- Modificar: \`frontend/src/components/ModelSettingsModal.tsx\`
- Modificar: \`frontend/src/components/SummaryModelSettings.tsx\`
- Criar: \`frontend/src/components/settings/LlmProviderSettings.tsx\`
- Criar: \`frontend/src/components/settings/SummarySettingsSection.tsx\`
- Modificar: \`frontend/src/lib/summary-language-preferences.ts\`
- Modificar: os commands Rust que carregam/salvam configuração de LLM e resumo
- Criar: testes para serialização sem segredo e seleção de defaults

1. Tornar \`LLMs\` o local de cadastrar/editar/remover provedores: OpenAI-compatible, OpenRouter, Ollama, DeepSeek, NVIDIA NIM e os provedores já suportados. Mostrar nome, endpoint, modelo e estado de conexão; API key fica no armazenamento já adotado pelo app, nunca no novo Store genérico.
2. Reutilizar \`ModelSettingsModal\` como diálogo de adição/edição chamado pela seção, em vez de deixar configurações de provider espalhadas em modal e abas antigas.
3. Implementar para modelos locais a política Talat: pré-carregar ao abrir o app, manter carregado e descarregar após inatividade. Se a engine não suportar descarregamento seguro, expor o controle como indisponível com razão e não persistir uma preferência sem efeito.
4. Em \`Resumos\`, separar “qual LLM usar” de “como gerar”: automático após transcrição, capítulos, pontos de ação, idioma padrão, prompt de sistema editável e aba padrão (Resumo/Transcrição) para abrir detalhes.
5. Conectar idioma aos helpers já existentes de \`summary-language-preferences.ts\`; conectar prompt/template e flags aos geradores Rust, preservando templates existentes e permitindo restaurar defaults.
6. Garantir que uma alteração de provider atualize resumos novos apenas, sem reprocessar silenciosamente reuniões antigas.

**Validação:**

\`\`\`powershell
cd D:\meetily\frontend
cargo check --manifest-path src-tauri/Cargo.toml
pnpm run lint
pnpm run build
\`\`\`

Teste manual: adicionar um provider sem expor sua chave, selecioná-lo para resumo, gerar uma reunião de teste e verificar capítulos/pontos de ação/prompt; reiniciar e confirmar que a chave continua protegida.

## Tarefa 7 — Aplicar preferências de exportação e preservar Advanced

**Arquivos:**
- Criar: \`frontend/src/components/settings/ExportSettings.tsx\`
- Criar: \`frontend/src/components/settings/AdvancedSettings.tsx\`
- Modificar: \`frontend/src/lib/transcript-export.ts\`
- Modificar: os handlers de exportação de reunião encontrados a partir de \`downloadTranscript\`
- Modificar: \`frontend/src/components/BetaSettings.tsx\`
- Criar: \`frontend/src/lib/export-preferences.test.ts\`

1. Criar a seção Exportações com padrão de nome, formato de data ISO, inclusão de metadados YAML e posição inline. Apresentar preview usando nome de reunião/data fictícios, sempre passando o resultado por \`safeFileName\`.
2. Alterar \`formatTranscriptMarkdown\` e os demais formatos suportados para receber preferências tipadas e adicionar metadados sem alterar o corpo existente quando a opção estiver desligada.
3. Implementar autoexportação somente local e somente depois de a reunião e seus artefatos estarem persistidos; registrar falhas e nunca bloquear a gravação ou transcrição por uma falha de exportação.
4. Não adicionar URL, webhook, calendário ou qualquer integração MCP nesta seção.
5. Mover \`BetaSettings\` para Advanced, mantendo os feature flags existentes e uma mensagem de que são recursos experimentais.
6. Remover imports, tabs, textos e caminhos de UI que ficaram obsoletos após a migração das seis abas antigas.

**Validação:**

\`\`\`powershell
cd D:\meetily\frontend
pnpm exec vitest run src/lib/export-preferences.test.ts
pnpm run test:i18n
pnpm run lint
pnpm run build
cargo check --manifest-path src-tauri/Cargo.toml
git diff --check
\`\`\`

Teste manual: exportar uma reunião com e sem YAML/ISO, verificar o preview e o nome de arquivo, habilitar autoexportação em uma reunião curta e confirmar que nenhuma chamada externa é feita.

## Tarefa 8 — Teste integrado, acessibilidade e migração

**Arquivos:**
- Modificar/criar: testes da tela de configurações sob \`frontend/src/components/settings/\`
- Modificar: catálogos i18n afetados
- Modificar: documentação de preferências do app, se houver documentação de usuário

1. Adicionar testes de renderização para cada seção, hash navigation, controles dependentes e persistência/rollback do estado.
2. Garantir teclado, foco visível, labels associados, descrições via \`aria-describedby\`, controles de switch acessíveis e mensagem de status para gravação/erro.
3. Testar migração de três cenários: instalação limpa, \`preferences.json\` existente com áudio/gravação e Store com dados inválidos.
4. Executar o aplicativo Tauri em Windows e revisar visualmente os estados claro, escuro, escala 80% e 120%, viewport estreito e sessão com permissões de notificação negadas.
5. Conferir que nenhum item excluído está visível nem tem command/código novo: ditado, calendário, início automático, webhook ou MCP.

**Validação final:**

\`\`\`powershell
cd D:\meetily\frontend
pnpm run test:i18n
pnpm run lint
pnpm run build
cargo check --manifest-path src-tauri/Cargo.toml
git diff --check
pnpm run tauri:dev
\`\`\`

## Critérios de aceite

- A navegação e a densidade visual se aproximam do Talat: lista lateral de categorias, painel único de opções e linhas com controles alinhados.
- Todas as opções existentes de gravação, dispositivos, notificações, transcrição, falantes e modelos continuam operando após a migração.
- Preferências novas são persistentes, tipadas, migráveis e não expõem credenciais.
- Os itens adiados não são implementados nem apresentados.
- Atalhos, retenção, matching e exportação têm efeito real no core, não são toggles decorativos.
- O app continua compilando no frontend e no core Rust e as traduções permanecem completas.

