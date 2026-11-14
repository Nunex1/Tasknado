# Gestão de desenvolvimento profissional

PDI e Plano de Carreira são módulos privados de workspaces `work`. Usam o shell, os menus contextual/recolhível, os tokens claro/escuro e os catálogos `pt-BR`/`en-US` existentes. Os dados são gravados no PostgreSQL pelo cliente Supabase autenticado; não há persistência dos registros ou dos rascunhos no localStorage.

## Uso

- **PDI**: `/workspaces/:workspaceId/development`. Cada registro contém o par obrigatório ponto de desenvolvimento/plano de ação e, opcionalmente, início, prazo, prioridade, status, critério de sucesso, evidências, observações e vínculo a uma oportunidade do mesmo workspace. Campos lado a lado no desktop/tablet e empilhados no celular. O status pode ser alterado diretamente na lista.
- **Carreira**: `/workspaces/:workspaceId/career`; detalhe compartilhável dentro da própria conta em `/workspaces/:workspaceId/career/:targetId`. Empresas são agrupadas em Brasil/Exterior. Empresa, país e cargo são obrigatórios. O país aceita sugestões localizadas e texto livre, inclusive territórios ausentes das sugestões. As exigências preservam espaços e quebras de linha como texto simples; não há geração nem verificação automática de requisitos.
- **Reorganização**: edite “Ordem na lista” e selecione essa ordenação. Números menores aparecem antes; empates têm desempate estável por ID. A organização é por oportunidade, permitindo várias vagas na mesma empresa.
- **Filtros e paginação**: consultas no servidor com páginas de 25 registros, busca com debounce de 300 ms, filtros de prioridade/status/região e ordenação. A busca do PDI usa o ponto de desenvolvimento; a de carreira usa o nome da empresa. Brasil/Exterior são agrupamentos da página atual, explicitados nos estados vazios. O seletor opcional de oportunidades carrega 20 resultados por página somente quando solicitado.
- **Rascunhos**: salvar é explícito. Fechar/Escape/Cancelar pedem confirmação de descarte quando há mudanças. A proteção de navegação do App impede sair por links/logout; recarregar/fechar a aba usa `beforeunload`. O editor permanece montado e visível ao usar Voltar/Avançar dentro do aplicativo, mesmo que a rota ao fundo mude. Não é um salvamento offline: aceitar a saída do navegador descarta o rascunho.
- **Conflitos**: atualizações, status e exclusões enviam `id`, `workspace_id` e a revisão lida. Somente uma gravação concorrente da mesma revisão vence. Em conflito o formulário permanece com o texto digitado; copie-o, cancele e reabra o registro atual antes de conciliar. Não há sobrescrita forçada.

## Banco e segurança

Migração incremental: `supabase/migrations/202611140001_professional_plans.sql`.

- `career_targets`: empresa/oportunidade, região, país livre, cargo, localização, modalidade, prioridade, URL HTTP(S), exigências, notas e ordem.
- `professional_development_items`: par de textos, datas, prioridade, status, critério, evidências, notas e FK opcional para carreira.
- Ambas: `id`, `owner_id`, `workspace_id`, `created_at`, `updated_at`, `revision`; limites de tamanho, enums via CHECK, índices, chave composta para `(workspace_id, owner_id)` e auditoria existente.
- RLS exige `auth.uid() = owner_id` e workspace `work` do mesmo proprietário, tanto na leitura quanto na escrita. Privilégios por coluna impedem forjar identidade, timestamps e revisão. `anon` não recebe privilégios; `TRUNCATE` não é concedido. O trigger do servidor define timestamps e incrementa a revisão.
- O vínculo `(career_target_id, workspace_id, owner_id)` impede associação entre usuários ou workspaces. Excluir a oportunidade remove apenas o vínculo, preserva o PDI e incrementa sua revisão.
- Alterar a categoria oculta os dados e impede CRUD direto. Retornar a `work` restaura a visibilidade. Excluir workspace/conta usa as funções atuais; as FKs removem os novos dados mesmo quando a categoria está incompatível.
- A exportação inclui as duas tabelas, inclusive dados de categorias incompatíveis. A RPC `export_professional_plans` é a única leitura independente da categoria: exige sessão, restringe explicitamente ao proprietário autenticado, aceita somente os dois nomes de tabela e pagina em 500 linhas. Não aceita `owner_id`, SQL ou tabela arbitrária do cliente.
- Textos pessoais são renderizados como texto React, sem HTML; links só são oferecidos para HTTP(S), sem credenciais. Nenhuma chave privilegiada participa do frontend.

## Arquitetura e carregamento

`nav-items.ts` centraliza a disponibilidade; `navigation.ts` resolve rotas e troca de workspace. `App` carrega `ProfessionalPlans` via `next/dynamic` apenas após o primeiro acesso, preservando o editor no layout persistente. As novas tabelas não são consultadas na tela inicial. Consultas de listas abortam respostas obsoletas. `professional.ts` contém os valores/validações compartilhados; `database.ts` mantém a tipagem Supabase; `export-data.ts` reúne a exportação existente e as novas páginas da RPC.

Os campos e seletores usam nomes acessíveis, confirmações Radix com foco inicial seguro, mensagens traduzidas e dimensões de toque de 44 px no celular. As novas regras CSS são restritas às classes dos planos e reutilizam os tokens do design system.

## Validação reproduzível

```powershell
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd test:database
pnpm.cmd test:professional:database
pnpm.cmd test:security:postgres
pnpm.cmd build
```

Os testes de banco aplicam todas as migrações a PostgreSQL embarcado com um harness dos schemas Auth/Storage. O teste de segurança usa um contêiner PostgreSQL descartável. Nenhum desses comandos acessa produção.

O teste de segurança espera o servidor definitivo pelo TCP de loopback dentro do contêiner. Isso evita considerar pronto o servidor temporário de inicialização da imagem PostgreSQL, cujo socket é fechado antes da execução normal; essa corrida foi observada na primeira execução do CI e corrigida no harness.

Para integração/navegador, use o Supabase **local** em `127.0.0.1:55431`, com a migração aplicada, e configure `.env.local` apenas com sua URL e chave pública local. Os testes obtêm a chave administrativa local em memória via CLI, criam contas temporárias e as removem ao terminar. Não executá-los contra produção.

```powershell
pnpm.cmd start --port 3107
# Em outro terminal:
$env:TASKNADO_TEST_URL = 'http://127.0.0.1:3107'
pnpm.cmd test:integration
pnpm.cmd test:professional:live
pnpm.cmd test:responsive
```

Os testes de navegador usam Edge/Chromium e o caminho Playwright já adotado pelo projeto (`PLAYWRIGHT_MODULE` permite fornecer outro caminho instalado). Resultados em `test-results/professional-database.json`, `test-results/professional-live.json` e `test-results/responsive.json`; capturas em `test-results/professional/`. A revisão visual e os testes automatizados não equivalem a homologação com leitor de tela ou dispositivos físicos.

## Aplicação e publicação — somente com autorização

1. Revisar o PR e o SQL. Confirmar backup, projeto alvo e histórico de migrações. Esta entrega **não aplica migração remota, não faz merge e não publica**.
2. Após autorização, conciliar eventuais migrações remotas ausentes no checkout e executar um dry-run da migração no projeto correto. Não usar reset remoto. Testar a migração em homologação antes de produção.
3. Aplicar a migração incremental **antes** de publicar o frontend. Os novos módulos e a exportação precisam das tabelas e da RPC. Nenhuma variável nova de Supabase/Netlify é necessária.
4. Publicar a versão aprovada; validar duas contas, CRUD, exportação, mudança/retorno da categoria e exclusão de workspace no ambiente homologado.
5. Se precisar reverter a interface, voltar ao frontend anterior e manter as tabelas/dados. Não excluir a migração ou as tabelas como rollback automático.

## Limites da evidência

Validação executada em 13/11/2026, Windows + Edge/Chromium, Next.js 16.4.1, com o build de produção servido localmente na rodada final dos planos:

| Procedimento | Resultado observado |
| --- | --- |
| `pnpm typecheck` | Aprovado |
| `pnpm test` | 65 testes em 13 arquivos aprovados |
| `pnpm build` | Build de produção aprovado |
| `pnpm test:database` | 18 grupos aprovados, todas as migrações |
| `pnpm test:professional:database` | 9 grupos aprovados; RLS, vínculos, conflitos, categoria, cascatas e exportação de 501 registros |
| `pnpm test:security:postgres` | 3 grupos aprovados; concorrência, privilégios e restauração em PostgreSQL descartável |
| `pnpm test:integration` | 18 grupos aprovados, Supabase local real |
| `pnpm test:professional:live` | 12 grupos aprovados; CRUD, login, conflitos, exportação, filtros, paginação, exclusão e idiomas |
| Axe nos planos | 34 auditorias, zero violações detectadas, em claro/escuro e quatro larguras |
| `pnpm test:responsive` | 13 grupos de regressão aprovados; 68 auditorias axe sem violações detectadas |

Resumo: [`professional-summary.json`](../test-results/professional-summary.json). Evidência detalhada: [`professional-live.json`](../test-results/professional-live.json), [`professional-database.json`](../test-results/professional-database.json), [`responsive.json`](../test-results/responsive.json). Capturas representativas: [PDI desktop](../test-results/professional/development-1440-light.png), [carreira desktop](../test-results/professional/career-1440-light.png), [PDI celular escuro](../test-results/professional/development-375-dark.png) e [editor tablet](../test-results/professional/editor-development-768-light.png).

As validações desta implementação são locais. A aplicação remota da migração, a publicação e a homologação em produção dependem de autorização e permanecem fora desta execução. Não foram feitas verificações em Safari/Firefox, dispositivos físicos ou leitor de tela.
