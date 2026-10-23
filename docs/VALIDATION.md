# Evidências de validação

> Registro histórico do MVP. Para a situação atual, consulte [Desktop: relatório e evidências](DESKTOP-DELIVERY.md) e [R01–R50](DESKTOP-TRACEABILITY.md). Os bloqueios de Docker descritos abaixo foram resolvidos para os testes locais; a edição atual é exclusivamente desktop. As referências a celular são evidências antigas, não requisitos nem testes da entrega atual.

Execução em 14/10/2026 (America/Sao_Paulo).

## Implementado

Código da aplicação Next.js e integração com Supabase: autenticação, workspaces, atividades, eventos, notas, autosave, anexos privados, busca, exportação e exclusão. Cinco migrações PostgreSQL, tipos TypeScript do contrato de dados, tokens de interface, layout responsivo, documentação de operação e scripts de testes.

## Testado com resultado positivo

- `tsc --noEmit`: tipagem estrita passou.
- `vitest run`: 2 testes passaram (transições disponíveis e limites/formatos de arquivos).
- `node scripts/test-database.mjs`: 9 verificações passaram em PostgreSQL real embarcado:
  1. Todas as migrações executam.
  2. RLS e vínculos compostos isolam duas contas.
  3. Transições, idempotência, cronologia e imutabilidade.
  4. Revisões de notas rejeitam sobrescrita antiga.
  5. Políticas de Storage, RPCs e busca bloqueiam outro proprietário.
  6. Busca portuguesa, filtros e auditoria.
  7. Exclusão em cascata revoga acesso e enfileira limpeza de objetos.
  8. Operações anônimas são negadas.
  9. Exclusão de conta remove registros sem recriar auditoria órfã.
- `next build`: compilação de produção passou.
- Tela de acesso inspecionada no navegador desktop; alternância para cadastro validada em 390 × 844. `clientWidth`, `scrollWidth` e largura do corpo retornaram 390 px. Não houve transbordamento horizontal nessa tela.
- Captura local: `test-results/access-desktop.jpg`.

O teste PostgreSQL usa um esquema mínimo de `auth` e `storage` para exercer as políticas. Isso não comprova a operação HTTP do Supabase Auth, entrega de e-mails ou upload/download do serviço Storage.

## Bloqueado nesta execução

O Docker inicialmente respondeu, mas depois passou a retornar `Docker Desktop is unable to start`. Diagnóstico: WSL Service parado, Docker sinalizando atualização de WSL; tentativa de iniciar o serviço foi recusada por falta de acesso. O usuário informou que vai ativar Docker/WSL. Não houve reset nem alteração dos dados do outro projeto local.

Sem o engine, não foi possível iniciar o Supabase Tasknado, gerar as chaves locais, executar `test:integration` ou validar os módulos autenticados no navegador. O frontend mostra explicitamente a conexão pendente e desabilita o envio de login/cadastro.

## Próxima validação necessária

1. Executar `pnpm local:setup` com Docker funcionando.
2. Executar `pnpm test:integration` (duas contas reais, autenticação, transições concorrentes, logout/login, notas, upload/download e isolamento).
3. Cadastro e confirmação de e-mail pela caixa SMTP local; testar também recuperação de senha.
4. Jornada no navegador: workspace → atividade → Check In → pausa → retomada → Check Out → consulta; nota → autosave → reload; upload → download; busca → destino.
5. Inspecionar dashboard, histórico, notas e busca em desktop e celular; verificar teclado e foco.
6. Testar interrupção de rede durante salvamento e upload e conflito entre duas abas.
7. Configurar Supabase/Vercel, SMTP, backups e limpeza de Storage no ambiente do proprietário; validar em homologação antes da produção.

## Limitações que permanecem

- Nenhum deploy publicado; nenhum projeto Supabase na nuvem criado.
- Logo original e imagens de referência ausentes; apenas nome em texto.
- Scanner antimalware, quarentena, rotina agendada de limpeza, retenção de backups/PITR e restauração ainda precisam ser configurados e validados.
- Ordenação e filtros das listas de atividades/notas atuam nos itens carregados; a busca global filtra no banco. Carregar mais amplia o conjunto; os indicadores sinalizam páginas adicionais com `+`.
- Conflitos de notas preservam o texto local e exigem decisão manual. O texto não salvo não é recuperável se o processo do navegador for encerrado à força.
- Não declarar o MVP completo, seguro para produção ou integralmente testado com base apenas neste build e nos testes embarcados.
