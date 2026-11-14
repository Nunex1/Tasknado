# Engenharia de desempenho do Tasknado

## Escopo, diagnóstico e linha de base

Intervenção incremental em branch própria, sem publicar na produção, aplicar migrações remotas ou executar merge do PR. O checkout original foi preservado; o trabalho ocorreu em `Tasknado-performance`, branch `codex/performance-engineering`.

A inspeção inicial usou `origin/main` em `f81edd6`: Next 16.4.1, React 19.3.0, TypeScript 5.9.3, Supabase JS 2.117.3, pnpm 11.25.0. Durante a intervenção, a principal avançou para `bd1c49a` (PR #15). Essas mudanças foram incorporadas, inclusive Next 16.4.6, limites de conta, proteção de uploads e correção de locks. O relatório distingue a linha de base inicial da validação final dessa versão integrada. As APIs de Next foram verificadas nos guias instalados em `node_modules/next/dist/docs/`.

O aplicativo usa App Router, autenticação cliente Supabase, RLS, RPCs transacionais, CSS próprio/Tailwind, temas claro/escuro e catálogos pt-BR/en-US. `loadContent()` fazia leituras amplas em função da navegação, `allActivities()` percorria todas as páginas e `hasMore` ficava falso. Workspaces eram consultados pelo carregador geral e pelo carregador específico. As contagens juntavam todas as atividades com observações. As listas renderizavam todos os registros; a entrada pública importava a interface autenticada e ambos os idiomas. O layout dinâmico, porém, atende à CSP com nonce por resposta: sua presença não era um defeito independente.

As medições usam build de produção local, Edge Chromium headless, Supabase em loopback e PostgreSQL 16 em contêiner descartável, com dados exclusivamente sintéticos. Há cenários com 100, 1.000 e 10.000 atividades, notas longas, observações e históricos proporcionais. A massa de 11.100 atividades do teste SQL é criada por backend de teste, acima do limite atual de 10.000 por conta para clientes; isso testa leituras sem relaxar o limite da aplicação. Anexos reais e seus bytes são verificados pela integração; não foram multiplicados em escala proporcional no benchmark de volume.

Na execução inicial com 10.000 registros, o navegador atingiu aproximadamente 3,9 GB de memória do processo e o percurso foi interrompido. Não existe tempo final comparável desse cenário antes da alteração. Os números locais são amostras de laboratório, não percentis de produção nem comprovação das metas de Core Web Vitals.

## Arquitetura e consistência

Foi escolhido TanStack Query em vez de um cache próprio: deduplicação, cancelamento, estado de paginação, validade e reconexão já têm semântica consolidada. SWR seria adequado para leituras simples, mas exigiria mais coordenação manual para as várias consultas infinitas e invalidações do aplicativo. TanStack Virtual foi a única outra dependência adicionada, para medir alturas e preservar identidade/foco em listas extensas.

`App` confirma a sessão e entrega HTML público útil enquanto isso. `useSession` utiliza `INITIAL_SESSION`, evitando inicialização duplicada. Cada sessão monta um `QueryClient` exclusivo: validade padrão de 60 s, workspaces 5 min, busca 30 s, descarte de consultas inativas após 5 min. Não há persistência de dados privados, cache de servidor dessas entidades ou reutilização entre usuários. Logout desmonta o provider, cancela consultas e limpa o cache. Reconexão atualiza recursos ativos; foco atualiza consultas vencidas. Os sinais de cancelamento chegam ao PostgREST e as notas também verificam sequência e identidade antes de aplicar respostas.

`useAppData`, `data-queries`, `record-queries` e `useSearch` separam recursos, telas e contratos. Listas de atividades usam páginas de 50 mais um registro sentinela, filtros/ordenação no PostgreSQL e contagens independentes. Detalhes têm consulta individual completa; listas recebem descrição de até 300 caracteres. Dashboard usa resumo SQL, seis atividades recentes e listas de foco limitadas. A matriz consulta cada quadrante separadamente.

Atividades têm cursores por `(ordenação, id)` em atualização, criação, título e agendamento. Notas, blocos, eventos, observações, prioridades, histórico e exportação também usam cursores. Os RPCs antigos permanecem para compatibilidade. OFFSET fica em catálogos pequenos de workspaces, anexos de um único registro e busca ranqueada, onde preserva a interface de páginas existente. A busca continua limitada a 50 resultados por página; não se declara tempo constante para deslocamentos arbitrariamente grandes.

Mutações aguardam a confirmação do banco. Não foi introduzida escrita otimista em operações críticas. Invalidação de atividade atinge seu detalhe, listas/contagens do workspace, resumo, histórico e busca; não recarrega notas. Páginas de atividades são reiniciadas após mudanças de ordenação. Observações invalidam seu recurso e a atividade relacionada. Notas conservam debounce de 700 ms, revisão esperada, texto em falhas, proteção de saída e precedência de exclusões. A seleção da nota vizinha após excluir tem proteção contra redirecionamento concorrente da consulta que detecta a nota removida.

## Renderização e entrega

Mapas memoizados substituem buscas repetidas de workspace/atividade. Filtragem, contagem e ordenação de grandes conjuntos saíram da renderização. Componentes opcionais, exportação e inglês são carregados sob demanda. O português pode ser hidratado imediatamente; a preferência salva só é aplicada após a hidratação do limite de Suspense, evitando discrepâncias entre HTML e cliente.

Listas com mais de 100 itens usam linhas medidas, overscan, chaves estáveis, foco retido e navegação por setas/Home/End. Existe modo alternativo de páginas de 50 para leitura assistiva. Blocos editáveis usam sempre uma estrutura estável e páginas de 50, com bloqueio da troca enquanto houver texto pendente; virtualizar editores sujos poderia destruir rascunhos. O cursor da próxima consulta é independente de um bloco recém-adicionado. Os testes verificam que carregar outra página não remonta nem apaga o editor ativo. Leitor de tela real, Safari e Firefox continuam exigindo revisão manual.

Formatadores `Intl` são reutilizados por localidade/opções. O símbolo foi convertido de 1254×1254 PNG para 320×320 WebP lossless, com `next/image` e `sizes` de 34/56/80 px. A máscara passou de 2172×724 PNG para 720×240 WebP lossless, conservando proporção 3:1 e máscara CSS/WebKit. Comparação de pixels com o original redimensionado confirmou igualdade de RGB visível e alfa. Os PNGs originais foram preservados para referência e rollback.

HTML continua `private, no-store`, com nonce diferente por resposta; remover `connection()` ou tornar esse documento estático reutilizaria o nonce. Todos os documentos atuais compartilham esse requisito, inclusive a landing pública. Ativos importados recebem nomes com hash e cache imutável do Next. `/brand/*`, sem hash, recebe cache público de um dia com revalidação de sete dias. Autenticação, RLS, CSP, HSTS e demais cabeçalhos permanecem. Nenhuma configuração remota de Netlify ou Supabase foi alterada.

## PostgreSQL e exportação

As quatro migrações `202611150001`–`202611150004` são aditivas. Introduzem projeções, paginação e agregações com `SECURITY INVOKER`, índices B-tree para os percursos e colunas geradas `search_document` para evitar reconstruir vetores a cada busca. `search_all` mantém busca portuguesa e substring literal, escapa `%`, `_` e barras, preserva filtros, autorização e limite. Índices GIN existentes não foram removidos.

`EXPLAIN (ANALYZE, BUFFERS)` foi executado como `authenticated`, não apenas como administrador. Um GIN `pg_trgm` experimental não foi escolhido pelo planner nesse caminho com RLS e expressões não leakproof. O teste mediu essa hipótese, removeu o índice experimental e a entrega não adiciona extensão nem índices sem benefício demonstrado. Não se marcou função como leakproof nem se converteu a busca para SECURITY DEFINER. A busca parcial ainda pode fazer scan no escopo autorizado; a melhoria comprovada vem da tokenização armazenada e do escopo/filtros, não de uma alegação de uso de índice inexistente.

No-op saves mantêm locks e verificação de revisão, retornando sem nova escrita quando o conteúdo é idêntico. Mudanças reais seguem registradas. Triggers de auditoria e propagação distinguem INSERT/DELETE de UPDATE efetivo. Um evento novo, mesmo sem mudar o estado da atividade, continua avançando sua atualização. Os controles de quota, estados, integridade, histórico factual e concorrência da principal foram preservados.

A exportação executa até três tabelas independentes em paralelo e percorre cada tabela em páginas sequenciais de 500 por chave primária. O caminho de download serializa páginas em partes de Blob, liberando as linhas parseadas. O arquivo ainda ocupa memória proporcional ao tamanho final; não é um streaming direto ao disco. Erro ou troca de sessão aborta o conjunto. Um token de contagem/máximo da auditoria antes/depois rejeita arquivos produzidos durante alterações concorrentes, em vez de entregar relações potencialmente inconsistentes. Não é um snapshot MVCC único. O RPC de planos profissionais mantém a exceção de exportação de dados do próprio usuário em categorias inativas, com allowlist de duas tabelas e `search_path` fixo.

## Matriz dos 24 problemas

“Corrigido” significa implementação e evidência local no escopo indicado; não significa implantação ou validação de p75 na produção.

| ID | Diagnóstico | Solução implementada | Arquivos principais | Validação/evidência | Resultado |
|---|---|---|---|---|---|
| Problema 01 | `loadContent` dependia da navegação | Consultas por recurso e tela; cache retido | `app.tsx`, `authenticated-app.tsx`, `use-app-data.ts` | Retorno à lista/dashboard com zero REST no benchmark | Corrigido |
| Problema 02 | Workspaces carregados por dois caminhos | Uma query de workspaces deduplicada | `data-queries.ts` | Uma consulta de workspaces na entrada; teste de deduplicação | Corrigido |
| Problema 03 | Estado manual sem validade/invalidação compartilhada | QueryClient exclusivo por sessão, reconexão e limpeza | `session-data.tsx`, `query-client.ts`, `performance.test.ts` | Cache, aborto tardio, logout e outra conta | Corrigido |
| Problema 04 | Todas as páginas buscadas para montar a lista | RPC limitado, detalhe individual e agregações | `data-queries.ts`, migração `150001` | Primeira página de 50 com bases de até 10.000 | Corrigido |
| Problema 05 | Listas usavam `select('*')` | Projeções explícitas e descrição curta | `data-queries.ts`, `record-queries.ts`, `files.tsx` | Typecheck, integração; detalhe de plano/export mantêm campos completos intencionalmente | Corrigido |
| Problema 06 | Contagens juntavam todo o workspace | Lotes de até 50 IDs com cache e índice parcial | `use-app-data.ts`, migração `150001` | EXPLAIN: 11.100 resultados → 50 no escopo testado | Corrigido |
| Problema 07 | Respostas antigas podiam chegar após navegação | AbortSignal e guarda de identidade/sequência | hooks, `notes.tsx`, `record-queries.ts` | Filtros com atraso artificial; transporte cancelado e resposta atual preservada | Corrigido |
| Problema 08 | Mutações chamavam carregamento global | Invalidação específica, sem escrita otimista crítica | `data-queries.ts`, detalhes/observações/notas | Testes de CRUD, cache e autosave concorrente | Corrigido |
| Problema 09 | OFFSET e ordem incompleta em percursos extensos | Keyset com ID de desempate; legado mantido | migrações `150001/150004`, `record-queries.ts`, `export-data.ts` | 11.100 IDs únicos em quatro ordenações; exportação de 1.001 linhas | Corrigido |
| Problema 10 | `hasMore` forçado a falso | Sentinela, carga incremental, total separado e busy | `use-app-data.ts`, `authenticated-app.tsx` | Teste percorre 160 atividades e detecta última página | Corrigido |
| Problema 11 | Autenticação, consultas e telas no componente raiz | Boundary de sessão, hooks de dados, módulos opcionais | `app.tsx`, `authenticated-app.tsx`, `src/hooks/*` | Build, desktop, responsivo e regressão de módulos | Corrigido |
| Problema 12 | Filtrar/ordenar/contar em cada render | SQL por escopo e mapas/derivações memoizadas | `use-app-data.ts`, dashboard/matriz | DOM/trabalho de thread medidos; sem contagem inventada de renders | Corrigido |
| Problema 13 | DOM proporcional a todos os itens | Virtualização medida e páginas acessíveis; editores protegidos | `windowed-list.tsx`, listas/notas | Foco End, páginas, DOM limitado e rascunhos com 105 blocos longos | Corrigido |
| Problema 14 | Novos formatadores a cada linha | Reuso por idioma/configuração | `i18n/core.ts`, provider, calendário/date-input | Testes pt-BR/en-US e identidade das instâncias | Corrigido |
| Problema 15 | Provider bloqueava toda apresentação | Português SSR imediato, sessão independente e idioma pós-hidratação | provider, `use-session.ts`, `app.tsx` | Login/idioma/reload sem erro de hidratação | Corrigido |
| Problema 16 | Símbolo PNG de 835.834 bytes | WebP 58.564 bytes, tamanhos responsivos | `brand.tsx`, `src/assets/brand/symbol.webp` | RGB/alfa iguais ao original redimensionado | Corrigido |
| Problema 17 | Máscara PNG de 290.146 bytes | WebP 18.692 bytes com hash e CSS compatível | `shell.css`, `wordmark-mask.webp` | Alfa/proporção preservados; temas claro/escuro | Corrigido |
| Problema 18 | Componentes privados e inglês no grafo inicial | Imports dinâmicos e catálogo inglês sob demanda | `app.tsx`, `authenticated-app.tsx`, `i18n/core.ts` | Analyzer real: 465 → 226 módulos síncronos alcançáveis a partir de App | Corrigido |
| Problema 19 | Suposta renderização dinâmica desnecessária | Necessidade confirmada para nonce em todos os documentos; mantida | `app/layout.tsx` | Nonces rotacionam e script inline sem autorização é bloqueado | Não reproduzido como defeito |
| Problema 20 | Cache público sem política explícita para marca | Categorias separadas; HTML privado, hash imutável, marca com TTL | `next.config.ts`, teste de budgets | Cabeçalhos HTTP reais no build local | Corrigido |
| Problema 21 | `search_all` recalculava tokenização por linha | Vetores armazenados, filtros e resultados limitados | migração `150002` | EXPLAIN ANALYZE BUFFERS e busca funcional/RLS | Corrigido |
| Problema 22 | Substrings sem estratégia medida | Padrão literal, tokenização reutilizada; pg_trgm rejeitado por benchmark | migração `150002`, teste PostgreSQL | Plano conserva scan sob RLS; menor custo medido, sem índice GIN fictício | Corrigido no escopo medido |
| Problema 23 | Saves idênticos propagavam writes/auditoria | No-op após checar revisão; triggers condicionais | migração `150003` | 100 saves iguais: 300 → 0 linhas de auditoria; revisão obsoleta rejeitada | Corrigido |
| Problema 24 | Tabelas e páginas exportadas sequencialmente | Três workers, keyset, Blob por página e token de consistência | `export-data.ts`, migração `150004` | Integridade, erro parcial, mudanças concorrentes e exportação real | Corrigido |

## Resultados medidos

<!-- MEASUREMENTS -->

## Testes e prevenção de regressões

<!-- VALIDATION -->

`pnpm performance:benchmark [rótulo]` gera observações locais de TTFB, LCP, CLS, Event Timing, long tasks, heap, DOM e consultas por percurso. Event Timing aqui é diagnóstico de interações de laboratório, não INP p75. Não há envio de telemetria, identificadores ou conteúdo para terceiros. `pnpm performance:analyze` usa o analyzer nativo do Next. `pnpm performance:budget` verifica JS de entrada e marca, além de cache/CSP. A regressão de CI executa os testes de cache/exportação, planos e paginação em PostgreSQL e budgets após build. O navegador de aceitação requer Playwright/Edge e Supabase local; os scripts recusam endpoints remotos.

Os budgets versionados são 1.050.000 bytes de JS inicial não comprimido, 350.000 bytes de gzip calculado por script, 65.000 bytes de símbolo e 22.000 bytes de máscara. São limites de regressão, não metas de Core Web Vitals. Os valores gzip do checker e `encodedBodySize` do navegador usam transportes diferentes e não devem ser comparados diretamente.

## Limitações e riscos residuais

- Não houve alteração ou medição autenticada na produção. TTFB da Netlify, p75 de LCP/INP/CLS, latência externa do Supabase e custos reais de infraestrutura permanecem sem evidência de campo.
- Não foi coletado contador confiável de commits de renderização React antes/depois. DOM, heap e duração de trabalho do navegador são medidas distintas; não substituem esse contador.
- O benchmark é uma amostra por cenário, sensível a aquecimento, processos concorrentes e versão do framework. O baseline de 10.000 não completou. Valores negativos de duração de tarefa em navegação de documento na versão inicial do harness foram descartados; o harness final considera o reset do contador CDP.
- A primeira abertura de módulo separado pode pagar custo de carregamento do chunk. A abertura de detalhe não é apresentada como ganho onde ficou mais lenta; retornos com cache são avaliados separadamente.
- A busca parcial ainda varre registros autorizados quando o planner não pode usar o predicado antes da barreira RLS. A exportação ainda retém o Blob final em memória. Contagens exatas e token de auditoria custam proporcionalmente ao escopo.
- Cursores não são snapshots. Escritas próprias reiniciam a travessia e resultados de atividades são deduplicados por ID. Mudanças de ordenação por outra sessão podem mover registros entre páginas até a atualização por foco/reconexão/validade; não se promete isolamento MVCC de uma lista interativa.
- As migrações adicionam índices e colunas geradas armazenadas. A construção pode bloquear escrita e consumir espaço durante a aplicação; medir tamanho/tempo em staging e programar janela apropriada. A migração de segurança anterior mantém seu gate de scanner para bases com anexos.
- Validação manual com leitores de tela, navegadores/dispositivos físicos e a infraestrutura publicada permanece operacional. A suíte usa Edge Chromium em desktop e viewports móveis, não iOS/Safari nativos.

## Reprodução, implantação e rollback

1. Checkout da branch, `pnpm install --frozen-lockfile`, Supabase local descartável com todas as migrações. Não usar credenciais de produção. Os testes de SQL criam e removem seus próprios contêineres; suites HTTP/navegador criam e removem usuários sintéticos em loopback.
2. Executar `pnpm typecheck`, `pnpm test`, `pnpm test:database`, `pnpm test:professional:database`, `pnpm test:security:postgres`, `pnpm test:performance`, `pnpm build`, `pnpm performance:budget`. Para UI, iniciar o build local e definir `TASKNADO_TEST_URL`, então executar as suites de integração, desktop, responsiva, notas, profissional e `test:performance:browser`.
3. Em staging, aplicar primeiro as quatro migrações de desempenho, verificar RLS e planos com massa representativa e só então publicar o frontend que usa os novos RPCs. Examinar os gates e pré-requisitos de [SECURITY-OPERATIONS.md](SECURITY-OPERATIONS.md). Nenhuma destas etapas remotas foi executada nesta entrega.
4. Rollback preferencial: retornar o frontend ao commit anterior; RPCs, índices e colunas novos são compatíveis com clientes antigos e podem permanecer. Para restaurar também as rotinas alteradas, executar o script transacional [supabase/rollback/20261115_performance.sql](../supabase/rollback/20261115_performance.sql) após o frontend antigo. Ele preserva linhas, colunas, RLS e índices; não remove anexos ou dados. Esse caminho foi testado em PostgreSQL descartável.
5. Não apagar entradas de histórico de migração nem usar reset em ambiente com dados reais. Qualquer remoção futura de índices/colunas deve ser uma nova migração revisada após confirmar ausência de clientes dependentes.

Os arquivos modificados estão agrupados na matriz e no diff do PR: hooks/query layer; componentes de listas/edição; i18n e marca; quatro migrações e rollback; scripts/testes/CI; este relatório e evidências sintéticas em `docs/performance/`.
