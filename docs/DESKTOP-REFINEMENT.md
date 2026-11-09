# Refinamento Desktop — 9 de novembro de 2026

## Resumo executivo

Implementadas e validadas localmente as quatro alterações: indicador de tarefas finalizadas, oito acessos diretos na navegação principal, Notas nas abas do Workspace e título da nota centralizado. Interface e dados reais foram exercitados no build de produção, com Supabase local e Microsoft Edge. Nenhum deploy ou alteração no banco remoto foi realizado.

## Reconhecimento e decisões de arquitetura

Versões instaladas verificadas: Next.js 16.4.1, React 19.3.0, TypeScript 5.9.3, Supabase JS 2.117.3 e i18next 26.4.5. O projeto usa pnpm, React state/effects, react-i18next, Lucide, Radix Dialog, CSS global e Tailwind 4. Guias locais de Link e useSearchParams do Next.js foram consultados antes das alterações.

- Rotas App Router em `src/app/(workspace)`: `/`, `/workspaces/[[...path]]`, `/activities`, `/notes`, `/search`, `/settings`, `/perfil`. O layout compartilhado mantém App montado; routeState/workspacePath interpretam as URLs.
- `DesktopShell` concentra cabeçalho, barra principal e contexto dos Workspaces. O array workspaceTabs agora alimenta ambas as navegações sem duplicar Notas. A matriz continua exclusiva da categoria Trabalho, conforme regra existente.
- `App` consulta atividades, notas, workspaces e contagens de observações via cliente Supabase autenticado e paginação fetchPages. Os indicadores usam as mesmas atividades da listagem, sem novas consultas de contagem.
- Status persistidos: not_started, in_progress, paused, completed. Aberto significa not_started; em andamento inclui in_progress e paused. Esses dois indicadores excluem arquivadas. Finalizadas inclui completed com ou sem arquivamento. O banco já exige status completed para arquivar uma atividade; a contagem ainda verifica explicitamente o status.
- `Notes` já suporta acesso global e seleciona a nota por URL no Workspace original. `NoteEntry` mantém autosave de 700 ms e controle de revisão em save_entry. Não foi criado armazenamento paralelo nem traduzido conteúdo pessoal.
- Idioma persiste em metadados da conta/localStorage pelo provider existente. Catálogos PT/EN foram atualizados.
- Autenticação e RLS continuam intactas. owner_id/auth.uid(), chaves estrangeiras compostas e RPCs existentes asseguram isolamento. Nenhuma chave privilegiada foi incluída no frontend.

## Alterações por arquivo

| Arquivo | Finalidade |
| --- | --- |
| src/components/app.tsx | Terceiro indicador; filtro de status na URL; inclusão de arquivadas finalizadas; preservação do filtro ao abrir/voltar do detalhe |
| src/components/desktop-shell.tsx | Sete links e ação Sair; remoção de Mais e seus listeners; Notas no array compartilhado; aria-current contextual |
| src/components/notes.tsx | Cabeçalho específico; título integral acessível por foco e tooltip |
| src/app/desktop.css | Barra compacta com rolagem em alturas reduzidas; grid de título com laterais simétricas; truncamento e revelação por foco |
| src/lib/domain.ts | Predicado compartilhado de indicadores; ação de retomada após conclusão |
| src/components/activity-detail.tsx | Rótulo Reabrir tarefa no seletor de eventos de tarefas concluídas |
| src/i18n/provider.tsx e i18n.test.ts | Inclui as correções locais de persistência remota do idioma, hidratação e reconhecimento dos rótulos PT/EN, ainda ausentes da main |
| src/i18n/pt-BR.json e en-US.json | Novos rótulos e mensagens, incluindo Completed Tasks e Sign Out |
| supabase/migrations/202611090001_reopen_completed.sql | Amplia a transição resume na função add_event para completed |
| src/lib/domain.test.ts e desktop.test.ts | Contratos de transição e classificação de indicadores |
| scripts/test-database.mjs | Reabertura, idempotência, isolamento e inclusão de arquivadas no PostgreSQL |
| scripts/test-desktop.mjs | Fluxos reais de conclusão/reabertura, oito acessos, Notas, títulos e dimensões |

## Situação dos quatro requisitos

1. **Finalizadas: validado localmente.** Home agrega os Workspaces do usuário; Overview usa o Workspace atual. Clique abre status=completed, inclusive após recarga. Arquivamento não reduz a contagem. Reabertura registrada no histórico reduz finalizadas e aumenta em andamento. Filtros adicionais e ordenação existentes continuam disponíveis e podem restringir a lista explicitamente.
2. **Barra lateral: validada localmente.** Início, Workspaces, Tarefas, Pesquisar, Notas, Configurações, Perfil e Sair acessíveis diretamente. Rotas, seleção ativa, proteção de alterações não salvas e logotipo preservados.
3. **Notas nas abas: validado localmente.** Mesmo array e componente Link das demais seções; sincronização com contexto, URL da nota e voltar do navegador verificados.
4. **Título: validado localmente.** Grid 44px / minmax(0,1fr) / 44px, alinhamento vertical e horizontal com erro geométrico inferior a 1px. Títulos curtos, médios e longos testados em 1280, 1440 e 1920. O botão não desloca o centro. Título completo acessível por foco e title; corpo, datas e lista lateral mantêm o alinhamento original.

## Banco de dados

Nenhuma tabela, coluna, índice, política RLS ou registro existente foi alterado pela migração. A única mudança de banco é a substituição incremental da função add_event para aceitar resume de completed, mantendo assinatura, privilégios, bloqueio de linha, validação de proprietário, limitação de frequência, deduplicação por request_id e registro cronológico. Arquivadas devem primeiro ser desarquivadas; não há reabertura silenciosa nem sobrescrita direta de status.

Migração aplicada e exercitada **somente no Supabase local**. Para publicação, aplicar essa migração antes de disponibilizar o frontend atualizado; sem ela, o servidor remoto continuará rejeitando a nova transição. Nenhum deploy foi feito.

## Validação e evidências

Comandos do projeto executados com o launcher pnpm via Node, pois o alias pnpm disponível neste Windows é um script sh:

| Verificação | Resultado |
| --- | --- |
| pnpm typecheck | Aprovado |
| pnpm test | 27 testes em 7 arquivos aprovados |
| pnpm build | Aprovado; rotas estáticas e rota dinâmica geradas |
| pnpm test:database | 13 grupos aprovados no PostgreSQL embarcado/PGlite |
| pnpm test:integration | 15 grupos aprovados com duas contas reais no Supabase local |
| pnpm test:desktop | 22 grupos aprovados com Edge e build de produção |
| Prettier --check dos arquivos alterados | Aprovado |
| Lint | Não executável: não há script lint nem configuração de ESLint no projeto; Prettier não substitui lint |

Evidências completas: `docs/validation/desktop-refinement/database.json`, `docs/validation/desktop-refinement/integration.json`, `docs/validation/desktop-refinement/desktop.json`. As contas de teste foram criadas no ambiente local e removidas pelos testes; nenhum dado de produção foi usado ou substituído por mocks.

Os 15 cenários pedidos têm cobertura local: conclusão; reabertura; escopo de Workspace; navegação global; ausência de Mais; aba Notas; sincronização; alinhamento; persistência; PT/EN; URLs diretas; resoluções Desktop; segurança; autosave/edição; regressão de busca, histórico, matriz e perfil. A revisão de código confirmou reaproveitamento de rotas, estado, consultas e RLS. As falhas intermediárias de teste por espera de navegação foram corrigidas antes da execução final, que terminou sem falhas.

Verificação visual: capturas da Home e de Notas em 1280, 1440 e 1920 foram inspecionadas. O teste também mede geometria de títulos curtos/médios/longos nas três larguras, ausência de sobreposição e de overflow. Capturas: `test-results/desktop/home.png` e `refinement-notes-{1280,1440,1920}.png`. A suíte existente cobre ainda 1366 e 2560, tabelas, matriz e contexto recolhido.

Acessibilidade automatizada: axe em 11 telas autenticadas, sem violações A/AA, sem itens inconclusivos nessa execução e sem erros de runtime no navegador. Isso não substitui auditoria manual com leitor de tela ou zoom nativo.

## Pendências e limites

- Publicação em Netlify e aplicação/verificação da migração no Supabase remoto não realizadas.
- Firefox, Safari, macOS e leitor de tela manual não foram avaliados nesta entrega. O teste de 200% usa viewport efetivo, não zoom nativo.
- O checkout já apresentava todos os arquivos como não rastreados no início. Não foi criado commit nem reconstruído um baseline Git; git diff --check, isoladamente, não comprova um diff neste estado.
- Os testes visuais usam a interface atual do repositório; não havia anexos de imagens de referência além do pedido textual.
