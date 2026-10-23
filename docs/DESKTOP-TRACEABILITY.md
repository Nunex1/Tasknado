# Matriz de rastreabilidade R01–R50

Complemento do [relatório A–J](DESKTOP-DELIVERY.md). Cada linha registra o requisito, os arquivos, a situação encontrada, a intervenção, a integração e a validação. Nenhuma linha afirma homologação remota.

## Arquivos e integrações

Os grupos abaixo são referências aos arquivos envolvidos em cada linha, não módulos demonstrativos:

- **APP**: `src/components/app.tsx`, `src/lib/domain.ts`.
- **SHELL**: `src/components/desktop-shell.tsx`, `src/components/brand.tsx`, `src/components/profile-menu.tsx`.
- **ROUTE**: `src/lib/navigation.ts`, `src/app/(workspace)/layout.tsx`, páginas `activities`, `notes`, `search`, `settings`, `workspaces/[[...path]]`, `perfil` e raiz.
- **STYLE**: `src/app/desktop.css`, `globals.css`, `ocean.css`, `layout.tsx`.
- **SEARCH**: `src/components/header-search.tsx`, `src/components/search.tsx`.
- **RECORD**: `src/components/workspace-records.tsx`, `workspace-overview.tsx`, `activity-detail.tsx`.
- **CATEGORY**: `src/components/category-fields.tsx`, `priority-matrix.tsx`, `src/lib/domain.ts`, `supabase/migrations/202610210001_categories.sql` (reutilizada, sem edição).
- **PROFILE**: `src/components/profile.tsx`, `profile-menu.tsx`, `src/lib/user-profile.ts`.
- **LANG**: `src/i18n/provider.tsx`, `core.ts`, `pt-BR.json`, `en-US.json`, `src/components/language-settings.tsx`.
- **DATA**: `supabase/migrations/202610220001_desktop.sql`, `202610220002_desktop_timestamps.sql`, `src/lib/database.ts`, `pagination.ts`.
- **OLD**: `src/components/auth.tsx`, `notes.tsx`, `files.tsx`, `src/lib/supabase.ts` e migrações anteriores, preservados.

Integrações: **I0** = Supabase Auth/RLS e tabelas existentes; **I1** = duas migrações desktop; **I2** = metadados persistidos via Auth; **I3** = frontend/Next.js; **I4** = schema de categorias e RPCs existentes. Todas foram exercitadas localmente. I1 ainda precisa ser reconciliada e aplicada no destino remoto antes de publicação.

## Evidências

- **D01–D18**: grupos, na ordem do campo `checks`, em [`desktop.json`](../test-results/desktop.json). Runner: `scripts/test-desktop.mjs`. D18 executa axe-core nas 11 telas principais; zero violações automatizadas e zero itens incompletos na rodada final.
- **L01–L15**: grupos de [`integration.json`](../test-results/integration.json). Runner: `scripts/test-live.mjs` / `integration.mjs`; Auth, PostgreSQL e Storage reais.
- **B01–B12**: grupos de [`database.json`](../test-results/database.json). Runner: `scripts/test-database.mjs`; PostgreSQL embarcado com harness Auth/Storage.
- **U**: [`unit-desktop.json`](../test-results/unit-desktop.json), com o nome de cada teste e resultado.
- **V**: [`capturas desktop`](../test-results/desktop), dez imagens de listas/matriz nas cinco resoluções, Home e viewport efetivo de zoom. Medições estão no campo `visuals` de D.
- **BUILD**: [`build-desktop.txt`](../test-results/build-desktop.txt); **TYPES**: [`typecheck-desktop.txt`](../test-results/typecheck-desktop.txt).

**L = implementado e validado nas verificações locais indicadas. P = implementação presente, validação parcial explicitada.** A rastreabilidade não transforma uma amostra de testes em prova de todos os cenários possíveis.

| ID / requisito | Arquivos | Estado anterior | Implementação realizada | Integração | Teste executado | Resultado | Evidência |
|---|---|---|---|---|---|---|---|
| R01 Pesquisa inteligente | SEARCH, SHELL, DATA | Busca em tela separada | Cabeçalho, sugestões agrupadas, atalhos, destaque e estados | I0, I1 | Consulta real, teclado, navegação e erro/retry | L | D03, D13; L09–L10 |
| R02 Lateral retrátil | SHELL, STYLE | Sidebar única | Rail permanente + contexto recolhível; preferência por conta | I3 | Recolher/expandir nas cinco larguras | L | D14, V |
| R03 Página do Workspace | ROUTE, APP, RECORD | Seleção por estado interno | Rota por Workspace, cabeçalho e abas | I0, I3 | Criar e abrir rota dedicada | L | D01, D11 |
| R04 Animação oceânica | APP, STYLE | Sem transição por Workspace | Onda horizontal de 480 ms e movimento reduzido | I3 | Entrada e desativação com reduced motion | L | D16; STYLE |
| R05 Cinco categorias | CATEGORY, APP, RECORD | Schema e campos já existentes | Preservados e integrados ao diretório/rotas | I0, I4 | Persistência das cinco categorias | L | L06, B04; D01, D06 |
| R06 Dois indicadores | APP, STYLE | Quatro indicadores de status | Não iniciadas e iniciadas não concluídas, conjuntos exclusivos | I0 | Contagem e exatamente dois indicadores | L | D11; U Desktop contracts |
| R07 Atividades universais | APP, RECORD, CATEGORY, DATA | CRUD e status existentes | Listagem com datas, classificação, observações e rotas | I0, I1, I4 | Criar, executar, editar, recarregar e filtrar | L | D01–D02, D12; L04, L06 |
| R08 Observações cronológicas | RECORD, DATA | Timeline editável existente | Preservação, destaque do resultado e visual documental | I0, I1 | Criar/editar/excluir e preservar criação | L | D02, D16; B05 |
| R09 Observações gerais | RECORD, DATA | Ausentes | Tabela, CRUD, pesquisa, ordenação e conflitos | I0, I1 | Operações reais e duas contas | L | D05, D16; L10; B07 |
| R10 Histórico operacional | RECORD, DATA | Histórico por atividade e prioridade | Timeline consolidada de fatos/snapshots persistidos | I0, I1, I4 | Mudanças, exclusão e tentativa de escrita direta | L | D05, D16; L11 |
| R11 Canvas | CATEGORY, APP | Campo booleano explícito já existente | Integrado à criação, detalhes e filtros desktop | I0, I4 | Ausência rejeitada; Não persiste e filtra | L | D06; L06; B04 |
| R12 Agendamento Work | CATEGORY, APP, RECORD | Data/horário já existentes | Datas, filtros, remoção, atraso e histórico | I0, I1, I4 | Criar/remover e preservar status/prioridade | L | D01, D12; L06 |
| R13 Eisenhower | CATEGORY, STYLE, ROUTE | Matriz funcional em estado interno | Rota Work, grid 2 × 2 e listagens compactas | I0, I4 | Quadrantes, não classificadas e persistência | L | D04, D14; B04 |
| R14 Drag and Drop | CATEGORY | Mouse e seletor existentes | Reutilizados no novo layout | I0, I4 | Arraste real e alternativa por teclado | L | D04, D15 |
| R15 Histórico de prioridade | CATEGORY, RECORD, DATA | priority_history existente | Exibido na timeline global do Workspace | I0, I1, I4 | Valores anteriores/novos, persistência, independência | L | D04–D05; L06; B04 |
| R16 Internacionalização | LANG, SHELL, RECORD, PROFILE | Catálogos PT/EN existentes | Novos módulos, validações e preferência autenticada | I2, I3 | Paridade de chaves + troca real/reload/nova sessão | L | U Translation completeness; D09; L10 |
| R17 Seletor junto à pesquisa | SHELL, STYLE, LANG | Seletor em Configurações | Globo + PT/EN imediatamente à direita | I2, I3 | Troca pelo cabeçalho e inspeção das larguras | L | D09, D14, V |
| R18 Navegação pelo tubarão | SHELL, ROUTE | Link independente existente | Preservado no cabeçalho comum | I3 | Retorno à Home em oito contextos | L | D11 |
| R19 Navegação pelo logotipo | SHELL, ROUTE | Link independente existente | Preservado no cabeçalho comum | I3 | Retorno à Home sem recarregar documento | L | D11 |
| R20 Menu do avatar | PROFILE, SHELL | Menu acessível existente | Avatar personalizado e Editar perfil | I2, I3 | Abrir, fora, Escape e restauração de foco | L | D08 |
| R21 Nome | PROFILE | Somente leitura | Editar e salvar full_name | I2 | Preview/salvar/reload/nova sessão | L | D08–D09; L10 |
| R22 Apelido | PROFILE | Sem editor | nickname priorizado na identificação | I2 | Salvar e restaurar em outra sessão | L | D08–D09; U Desktop contracts |
| R23 Inicial personalizada | PROFILE | Derivada do nome | Letra Unicode acentuada, maiúscula e fallback | I2 | Inicial É; validação e recarga | L | D08; U Desktop contracts |
| R24 Cor do avatar | PROFILE, STYLE | Cor fixa | Presets, cor livre e contraste automático | I2 | Cor personalizada e 4.096 amostras de contraste | L | D08; U Desktop contracts |
| R25 Prévia interativa | PROFILE | Ausente | Prévia local sem persistir; cancelar restaura | I3 | Alterar, cancelar e comparar dados salvos | L | D08 |
| R26 Persistência do perfil | PROFILE, APP | Dados lidos de Auth | Atualização de metadados e avatar global | I2 | Recarga e novo login independente | L | D08–D09; L10 |
| R27 Persistência do idioma | LANG | localStorage por conta | Auth + cache local + sincronização entre abas | I2 | Troca imediata, recarga e nova sessão | L | D09; L10; U Locale preferences |
| R28 Integração Supabase | DATA, APP, OLD | Base real existente | Novas tabelas/RPCs e metadados integrados | I0, I1, I2, I4 | Serviços reais; banco remoto não modificado | L, somente local | L01–L15; D01–D18 |
| R29 Segurança/isolamento | DATA, OLD, CATEGORY | RLS, FKs e Storage existentes | RLS e privilégios para novas tabelas; histórico imutável | I0, I1, I4 | Duas contas, forja de proprietário, escrita/anônimo negados | L nos controles testados | L03, L08, L10–L15; B02, B07–B12 |
| R30 Resoluções desktop | STYLE, SHELL | Layout responsivo anterior | Cinco referências e largura máxima central | I3 | Listas, matriz, painel e pesquisa sem overflow | L | D14, V |
| R31 Acessibilidade desktop | SHELL, SEARCH, PROFILE, STYLE, CATEGORY | Semântica/foco em componentes existentes | Combobox, listbox, foco, teclado, contraste e reduced motion | I3 | Teclado, avatar, viewport efetivo, axe em 11 telas; sem NVDA/VoiceOver/zoom nativo | P | D03, D08, D15–D16, D18; U contraste |
| R32 Preservação de funções | APP, OLD, CATEGORY, DATA | Auth, notas, arquivos, estados e exclusões existentes | Integração incremental, sem reset e sem reescrever migrações | I0, I1, I4 | Lifecycle, autosave, Storage, arquivamento e cascatas | L nos fluxos testados | L01–L15; B01–B12; D10 |
| R33 Pesquisa em observações | SEARCH, RECORD, DATA | Observações de atividade pesquisáveis | Gerais incluídas; destino exato e destaque | I0, I1 | Buscar e abrir os dois tipos de observação | L | D03, D05; L10 |
| R34 Categoria sem perda | CATEGORY, APP | Namespaces preservados no banco | Mantidos ao navegar/editar no novo layout | I0, I4 | Work → Sports → Work sem alterar atributos | L | D07; L06; B04 |
| R35 Filtros e ordenação | APP, RECORD, SEARCH, DATA | Filtros parciais existentes | Status, texto, Canvas, agenda, data e observações | I0, I1, I4 | Filtrar/ordenar e ler listas acima de 1.000 registros | L | D05–D06, D12; U Complete persisted lists |
| R36 Bloco de notas | OLD, APP, ROUTE | Editor/autosave existentes | Rotas globais e por Workspace; sem substituir editor | I0, I3 | Criar, escrever, salvar, recarregar | L | D10; L07; B06 |
| R37 Histórico do navegador | ROUTE, APP, SHELL | Módulos por estado interno | Contexto representado em URL e links reais | I3 | Voltar restaura destino; marca não recarrega | L | D11; U Desktop contracts |
| R38 Tratamento de erros | SEARCH, RECORD, PROFILE, APP, LANG | Feedback parcial existente | Erros localizados, retry, salvamento, conflitos e vazio | I0, I2, I3 | Falha de rede/retry e conflitos no banco | L nos erros testados | D13; L07, L10; U Localized service errors |
| R39 Tradução especializada | LANG, CATEGORY, RECORD | Categorias já traduzidas | Novas timelines, perfil, busca e mensagens | I2, I3, I4 | Paridade e chaves especializadas; EN em sessão real | L | U Translation completeness; D09 |
| R40 Sem hiperperformance | APP, STYLE | Quatro cartões de status | Somente dois indicadores operacionais compactos | I0, I3 | DOM contém exatamente dois; revisão visual | L | D11; V home.png |
| R41 Design system minimalista | STYLE, SHELL | Deep Sea Blue dominante | Tokens claros, tipografia e controles compartilhados | I3 | Inspeção de listas/matriz/cabeçalho nas cinco telas | L | V; D14 |
| R42 Branco e neutros | STYLE | Fundo escuro | Branco/neutros dominantes; azul funcional | I3 | Revisão visual das dez capturas | L | V |
| R43 Hierarquia tipográfica | STYLE | Títulos/contrastes anteriores | Escala compartilhada de 26/17/14 px e pesos moderados | I3 | Leitura e consistência entre lista, matriz e Home | L | V; STYLE |
| R44 Redução de redundância | APP, SHELL, STYLE | Cabeçalho/sidebar e quatro indicadores | Cabeçalho funcional, duas métricas, linhas compactas | I3 | Dois indicadores, estrutura e revisão visual | L | D11, V |
| R45 Espaçamento/alinhamento | STYLE | Padrões distribuídos | Tokens de 8 px, dimensões de shell e controles comuns | I3 | Bounds de regiões, tabela e painel | L | D14, V |
| R46 Exclusivamente desktop | SHELL, STYLE | Breakpoints móveis existentes | Shell horizontal contínuo e limites para monitores | I3 | Cinco resoluções e viewport de zoom desktop | L | D14–D15 |
| R47 Sem componentes móveis | SHELL, STYLE, APP | CSS/menu móvel anterior | Removidos menu hamburger e regras específicas móveis | I3 | Ausência de navegação móvel no DOM e código ativo | L | D11; STYLE, SHELL |
| R48 Consistência entre módulos | STYLE, SHELL, RECORD, PROFILE | Componentes em estilos anteriores | Tokens comuns para módulos existentes e novos | I3 | Jornadas entre módulos e inspeção visual | L | D08–D11, D14, V |
| R49 Feedback discreto | STYLE, APP, SEARCH, RECORD, PROFILE | Toasts/estados anteriores | Loading, erro, retry, salvar e onda discreta | I0, I2, I3 | Estados de salvamento, erro/retry e reduced motion | L | D02, D08, D13, D16 |
| R50 Validação desktop | scripts/test-desktop.mjs, STYLE | Sem suíte das cinco resoluções | Suíte com medidas e capturas reais, sem etapa móvel | I0, I1, I2, I3, I4 | 1280/1366/1440/1920/2560; listas e matriz | L | D14; V; desktop.json |

## Situação consolidada

49 requisitos possuem implementação e evidência local nas verificações indicadas. R31 permanece com validação parcial. Publicação, migrações e teste no ambiente remoto estão pendentes e não são presumidos pelas evidências locais. Não há declaração de conclusão integral em produção.
