# Tasknado

Plataforma individual de produtividade para computadores e celulares. Next.js, React, TypeScript, Radix, Supabase Auth, PostgreSQL e Storage privado. Interface responsiva, pensada primeiro para o celular, em PT/EN, com temas claro, escuro e do sistema e landing page pública na rota `/`. Não há dados demonstrativos ou backend simulado na aplicação; as capturas da landing vêm de uma conta temporária de demonstração.

A entrega atual está documentada no [relatório Desktop A–J](docs/DESKTOP-DELIVERY.md) e na [rastreabilidade R01–R50](docs/DESKTOP-TRACEABILITY.md), com evidências locais, arquivos, migrações e limites da validação.

## Executar localmente

Requisitos: Node 22+ (validado com 24), pnpm, Docker Desktop com engine Linux e WSL funcionando.

```powershell
pnpm install
pnpm local:setup
```

O projeto Supabase local chama-se `tasknado`, com portas próprias para não interferir em outros projetos:

| Serviço | Endereço |
|---|---|
| API | http://127.0.0.1:55431 |
| PostgreSQL | 127.0.0.1:55432 |
| Studio | http://127.0.0.1:55433 |
| E-mail de desenvolvimento | http://127.0.0.1:55434 |

O script `local:setup` inicia apenas o stack Tasknado, aplica migrações locais e cria `.env.local` com URL e chave pública. Não sobrescreve configurações existentes diferentes. Alternativa manual: copie `.env.example` e use os valores públicos de `pnpm exec supabase status`. Nunca coloque `service_role` em variável `NEXT_PUBLIC_*`.

```powershell
pnpm dev
```

Acesse http://127.0.0.1:3000. Crie sua conta e confirme o e-mail na caixa local. O serviço local captura e-mails; ele não envia mensagens para sua caixa real. Recuperação de senha usa a mesma caixa.

As migrações são aplicadas no primeiro `supabase start`. Em banco local já inicializado, aplique novas migrações com `pnpm exec supabase migration up --local`. Não use reset em banco com dados que deseja preservar.

## Testes

```powershell
pnpm typecheck
pnpm test
node scripts/test-database.mjs
pnpm build
pnpm test:integration
pnpm test:desktop
pnpm test:notes
pnpm test:responsive
```

`test:responsive` percorre a landing e doze telas autenticadas em 375, 768, 1024 e 1440 px: rolagem horizontal, axe-core (WCAG A/AA) nos temas claro e escuro, drawer de navegação e troca de workspace no celular, criação e edição de tarefa em tela pequena, os três modos de aparência com persistência, navegação por teclado no desktop e isolamento entre contas. `pnpm capture:landing` refaz as capturas reais usadas na landing (`src/assets/landing/`), em dois idiomas e dois temas, com uma conta temporária e o conteúdo de `scripts/demo-data.mjs`.

`test:notes` percorre no navegador a exclusão de blocos e notas (confirmação, autosave pendente, falha de rede, rotas e estados vazios), com conta temporária na instância local e a aplicação em execução.

`test-database.mjs` executa PostgreSQL real embarcado (PGlite), com esquemas mínimos de Auth/Storage somente no teste. Valida SQL, RLS, transições, idempotência, buscas, concorrência otimista e cascatas. Não substitui a integração HTTP do Supabase.

Testes de segurança que precisam de serviços reais usam um segundo stack Supabase local, isolado do de desenvolvimento (projeto `tasknado_security`, portas 5643x):

```powershell
pnpm test:security:postgres   # PostgreSQL real descartável: concorrência, trava da quarentena, dump/restore
pnpm security:stack start     # sobe o stack isolado (reset | migrate | stop)
pnpm test:security:http       # isolamento entre contas, quarentena, limites e métricas por HTTP real
pnpm test:security:backup     # backup cifrado do Storage, verificação e recuperação
pnpm test:security:clamav     # quarentena de ponta a ponta com o motor ClamAV real (Docker e rede)
```

Para a integração completa, com a instância local em execução, execute `pnpm test:integration`. O runner obtém a chave privilegiada local da CLI e a passa somente ao processo de testes, sem gravá-la ou exibi-la. O script recusa URLs que não sejam loopback na porta 55431. Cria duas contas temporárias, testa os serviços reais e as remove no final. Evidências são gravadas em `test-results/` (ignorado pelo Git).

## Criar o projeto Supabase na nuvem

1. No painel Supabase da sua conta, crie um projeto e escolha região e plano. Guarde a senha do banco em gerenciador de senhas.
2. Autentique a CLI: `pnpm exec supabase login`.
3. Vincule o projeto: `pnpm exec supabase link --project-ref SEU_PROJECT_REF`.
4. Confira o destino e o histórico remoto, inspecione as migrações pendentes e execute `pnpm exec supabase db push --dry-run`. Somente depois de revisar os efeitos, aplique as migrações com `pnpm exec supabase db push`.
5. Em Authentication, configure Site URL e Redirect URLs com o domínio final. Ative confirmação de e-mail e configure SMTP próprio para entrega real.
6. Confira políticas e bucket privado `attachments`. As migrações criam as regras e o limite de 20 MB.
7. Execute os testes de duas contas em um ambiente de homologação antes de uso real. O script local não deve ser apontado para produção.

## Publicar

A aplicação publicada hoje está no Netlify (https://tasknado.netlify.app), que constrói `main` com o runtime Next.js. O arquivo `netlify.toml` apenas acrescenta cabeçalhos de segurança aos arquivos estáticos servidos pela CDN; as configurações de build ficam no projeto Netlify. Em qualquer provedor (Netlify ou Vercel), importe este repositório, selecione Next.js e configure `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` com os valores públicos do projeto na nuvem. Publique e use o domínio final nos redirecionamentos de Auth. As variáveis públicas são incorporadas no build: qualquer mudança exige novo deploy.

Nenhum projeto na nuvem ou publicação é criado por estes arquivos. Há etapas de conta, região, plano e credenciais que precisam do proprietário.

## Operação, arquivos e privacidade

- Eventos de execução são permanentes. Observações permitem edição e exclusão explícitas; o histórico operacional mantém os snapshots dessas alterações. As transições são validadas e gravadas atomicamente no banco; identificadores de requisição evitam duplicação em tentativas repetidas.
- Notas usam debounce de 700 ms e revisão otimista. `Salvo` aparece somente após retorno do banco. O aplicativo bloqueia navegação interna enquanto existe texto não salvo e avisa antes de fechar a aba. Em conflito, o texto fica visível para cópia; não há mesclagem automática.
- Datas são geradas pelo banco e exibidas no fuso do navegador. Todos os registros usam `timestamptz`.
- Atividades e contagens são lidas em páginas de 500 até completar o conjunto autorizado. O dashboard mostra apenas atividades não iniciadas e atividades iniciadas ainda não concluídas. Busca, notas, observações e histórico oferecem paginação própria.
- Links de download expiram em 60 segundos. Depois de emitidos, podem continuar válidos até expirar mesmo após excluir o vínculo.
- Exclusão de workspace exige digitar o nome. Remove registros em cascata e revoga imediatamente o acesso por RLS. Os objetos ficam em fila `storage_cleanup` para remoção física.
- Agende `node scripts/cleanup-storage.mjs` em um backend confiável, com `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` e `TASKNADO_WORKER_TARGET` como configuração de destino explícita. O script remove até 100 objetos por execução e pode ser repetido. Não há agendamento de produção configurado neste repositório.
- A exportação em Configurações gera JSON dos registros do proprietário; anexos devem ser baixados separadamente. A exclusão da conta exige digitar o e-mail e remove os registros em cascata; objetos entram na fila de limpeza.
- Anexos permitidos: PDF, PNG/JPEG/WebP, MP4/WebM, TXT/CSV, DOCX/XLSX/PPTX. SVG, HTML e executáveis são recusados. Com a migração de quarentena aplicada, uploads ficam indisponíveis até a validação de conteúdo e a aprovação por um daemon ClamAV (`ops/clamav/docker-compose.yml`), que precisa provar detecção a cada execução do worker. Em um banco sem essa migração a interface abre os anexos como antes e não exibe selo de verificação. O scanner e seu agendamento precisam ser provisionados e homologados antes de aplicar a migração em produção; ela se recusa a rodar sobre anexos existentes sem esse registro.
- Auth possui limites de requisição configurados no Supabase. A RPC de eventos limita a 60 registros por minuto por conta. Uploads reservam até 1 GiB por conta, com até dez pendentes. As demais escritas têm teto de 1.200 alterações auditadas por minuto e limites de linhas por conta (200 workspaces, 10.000 tarefas, 2.000 notas, 20.000 blocos, 20.000 observações). Retenção depende da política de produção.
- Sem service role no cliente. Dados são protegidos por JWT, RLS e chaves estrangeiras compostas por proprietário. O shell da rota `/` é público, mas o conteúdo privado só é obtido após autenticação e autorização no Supabase.
- Sessão gerenciada pelo SDK Supabase no navegador. Nenhum conteúdo HTML de nota é executado; links abrem com `noopener noreferrer`. CSP com nonce por resposta limita scripts; produção exige HTTPS e verificação dos headers no provedor.

## Backups e recuperação

Escolha a retenção e, se necessário, PITR no projeto Supabase. Faça backup separado dos objetos de Storage; backup de banco não inclui seus bytes. `pnpm backup:storage` exporta, verifica e restaura esses bytes cifrados (AES-256-GCM) e cifra os dumps do banco; o procedimento completo está no [runbook](docs/SECURITY-OPERATIONS.md#5-backup-e-recuperação-de-desastres). Antes de produção, execute uma restauração em projeto isolado e verifique contas, tarefas, notas e downloads. Não há backup de produção configurado nem teste de restauração de produção concluído.

## Referências

- [Arquitetura e decisões](docs/ARCHITECTURE.md)
- [Validação e limites](docs/VALIDATION.md)
- [Fluxo local oficial do Supabase](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Autenticação no Next.js](https://nextjs.org/docs/app/guides/authentication)

O design system atual está documentado em [docs/DESIGN-SYSTEM.md](docs/DESIGN-SYSTEM.md): tokens em `src/styles/tokens.css` e camadas de estilo em `src/styles/`, importadas por `src/app/globals.css`. Branco predomina no tema claro; o azul Primary indica ação e estado e o azul Royal reforça a identidade. A navegação do celular, o seletor de workspaces e os temas (Claro, Escuro, Sistema) estão em [docs/MOBILE-THEMES.md](docs/MOBILE-THEMES.md). A marca reutilizável permanece em `src/components/brand.tsx`. Os documentos de entrega Desktop e de identidade oceânica são registros históricos e citam arquivos de estilo que foram substituídos.

Identidade oficial atual: [tubarão e logotipo gráfico TASKNADO](docs/BRAND_IDENTITY.md), com componentes compartilhados e variantes clara e escura.

## Engenharia de segurança

Consulte a [auditoria de novembro/2026](docs/SECURITY-AUDIT-2026-11.md) (achados, evidências, riscos residuais), o [runbook operacional](docs/SECURITY-OPERATIONS.md) (implantação, scanner, backups, monitoramento) e a [entrega anterior](docs/SECURITY-DELIVERY.md). A migração de quarentena torna anexos existentes pendentes até a inspeção e só roda em um banco com anexos depois que a homologação do scanner é registrada nele.
