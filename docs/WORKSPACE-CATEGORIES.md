# Categorias, observações e Matriz de Eisenhower

## Implementação

- Workspaces: `category` com cinco valores estáveis (`personal_life`, `university`, `work`, `self_study`, `sports`). Criação exige escolha; configurações permitem alteração. Workspaces anteriores recebem Vida Pessoal, sem inferência pelo nome.
- Atividades: `category_attributes` em JSONB, com namespaces validados no PostgreSQL. Categorias sem extensão não recebem campos vazios. A categoria inativa permanece armazenada, mas fica oculta e não pode ser modificada. Retornar à categoria restaura seus dados.
- Faculdade: `university.openedInCanvas` exige booleano explícito em novas atividades. Atividades preexistentes após uma troca para Faculdade podem ficar sem resposta até serem editadas; aparecem em Não definida. Canvas não altera execução.
- Trabalho: `work` armazena agendamento e os dois critérios independentes de prioridade. Data sem horário é uma data local, vencendo ao final daquele dia. Horário é local, sem conversão para UTC; timestamps de auditoria continuam timestamptz. Remover o agendamento limpa data e horário.
- Observações: os registros `activity_events` de tipo `observation` foram ampliados com `edited_at`. Não há migração destrutiva nem duplicação do histórico. A timeline mostra os mais recentes primeiro, permite inverter a ordem, filtrar observações e carregar registros anteriores. Edição preserva criação; exclusão explícita preserva anexos. RPCs detectam edição concorrente pelo conteúdo esperado. Eventos de execução permanecem imutáveis.
- Prioridade: `priority_history` registra valores anterior/novo e horário do servidor por trigger, inclusive quando a classificação é alterada pelo formulário. Alterações sem mudança real não criam histórico. Matriz inclui quatro quadrantes e Não classificadas; arrastar e soltar e seletor por teclado usam a mesma RPC. Classificação parcial permanece Não classificadas.
- Segurança: RLS por proprietário, chaves estrangeiras compostas, validação de namespaces ativos, histórico de prioridade somente leitura e RPCs autenticadas. Exclusões de workspace/conta continuam em cascata.
- Exportação JSON inclui atributos, observações e histórico de prioridade. Busca existente continua indexando observações editadas.
- A matriz e os filtros usam todas as atividades do workspace, obtidas em páginas de 500. Para volumes muito grandes, mover filtros e contagens para consultas paginadas no servidor é uma evolução futura.

## Ativação

Aplicar `supabase/migrations/202610210001_categories.sql` no mesmo banco configurado para a aplicação, antes de publicar o frontend. Não aplicar apenas o frontend contra o schema antigo.

No ambiente local isolado, com Docker disponível: `pnpm local:setup`, seguido de `pnpm test:integration`. O script aplica migrações e configura `.env.local`, sem sobrescrever configurações divergentes. Nenhuma migração foi aplicada a um projeto remoto nesta execução.

## Validação nesta execução

- 18 testes unitários: regras de quadrante, atraso local, traduções, domínio e verificações anteriores.
- 11 grupos de testes em PostgreSQL embarcado com harness de Auth/Storage: migrações, RLS, Canvas obrigatório, datas inválidas, preservação por troca de categoria, prioridade independente, edição/exclusão de observações, conflitos e regressões de busca/exclusão.
- TypeScript: sem erros. Build de produção Next.js concluído, preservando as rotas `/` e `/perfil`.
- Integração real local concluída após iniciar Docker: `node scripts/local-setup.mjs` aplicou as migrações e criou `.env.local`. `node scripts/test-live.mjs` passou 13 grupos de verificações com contas reais, incluindo as cinco categorias, observações entre sessões, prioridade e Storage privado. Evidência: `test-results/integration.json`.
- Navegador: 7 grupos de verificações passaram em Edge/Chromium headless contra Supabase local real: login, agendamento, atraso, observações CRUD, seletor e drag-and-drop da matriz, persistência após reload, Canvas obrigatório e filtros, troca PT/EN e persistência do idioma. Evidência: `test-results/browser.json`, `work-matrix.png` e `activity-observations.png`. Contas temporárias removidas ao terminar.
- Aplicação disponível em `http://127.0.0.1:3000`. Nenhum deploy remoto realizado.
- Para repetir o teste de navegador com o servidor local ativo: `node scripts/test-browser.mjs`. Requer Playwright (defina `PLAYWRIGHT_MODULE` se não estiver no runtime local do Codex) e Microsoft Edge instalado.
