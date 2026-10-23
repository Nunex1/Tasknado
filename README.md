# Tasknado

Plataforma individual de produtividade para computadores. Next.js, React, TypeScript, Radix, Supabase Auth, PostgreSQL e Storage privado. Interface clara, marca oceânica e idiomas PT/EN. Não há dados demonstrativos ou backend simulado na aplicação.

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
```

`test-database.mjs` executa PostgreSQL real embarcado (PGlite), com esquemas mínimos de Auth/Storage somente no teste. Valida SQL, RLS, transições, idempotência, buscas, concorrência otimista e cascatas. Não substitui a integração HTTP do Supabase.

Para a integração completa, com a instância local em execução, execute `pnpm test:integration`. O runner obtém a chave privilegiada local da CLI e a passa somente ao processo de testes, sem gravá-la ou exibi-la. O script recusa URLs que não sejam loopback na porta 55431. Cria duas contas temporárias, testa os serviços reais e as remove no final. Evidências são gravadas em `test-results/` (ignorado pelo Git).

## Criar o projeto Supabase na nuvem

1. No painel Supabase da sua conta, crie um projeto e escolha região e plano. Guarde a senha do banco em gerenciador de senhas.
2. Autentique a CLI: `pnpm exec supabase login`.
3. Vincule o projeto: `pnpm exec supabase link --project-ref SEU_PROJECT_REF`.
4. Confira o destino e o histórico remoto, inspecione as migrações pendentes e execute `pnpm exec supabase db push --dry-run`. Somente depois de revisar os efeitos, aplique as migrações com `pnpm exec supabase db push`.
5. Em Authentication, configure Site URL e Redirect URLs com o domínio final. Ative confirmação de e-mail e configure SMTP próprio para entrega real.
6. Confira políticas e bucket privado `attachments`. As migrações criam as regras e o limite de 20 MB.
7. Execute os testes de duas contas em um ambiente de homologação antes de uso real. O script local não deve ser apontado para produção.

## Publicar na Vercel

Importe este repositório na conta Vercel, selecione Next.js e configure `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` com os valores públicos do projeto na nuvem. Publique e use o domínio final nos redirecionamentos de Auth. As variáveis públicas são incorporadas no build: qualquer mudança exige novo deploy.

Nenhum projeto na nuvem ou publicação é criado por estes arquivos. Há etapas de conta, região, plano e credenciais que precisam do proprietário.

## Operação, arquivos e privacidade

- Eventos de execução são permanentes. Observações permitem edição e exclusão explícitas; o histórico operacional mantém os snapshots dessas alterações. As transições são validadas e gravadas atomicamente no banco; identificadores de requisição evitam duplicação em tentativas repetidas.
- Notas usam debounce de 700 ms e revisão otimista. `Salvo` aparece somente após retorno do banco. O aplicativo bloqueia navegação interna enquanto existe texto não salvo e avisa antes de fechar a aba. Em conflito, o texto fica visível para cópia; não há mesclagem automática.
- Datas são geradas pelo banco e exibidas no fuso do navegador. Todos os registros usam `timestamptz`.
- Atividades e contagens são lidas em páginas de 500 até completar o conjunto autorizado. O dashboard mostra apenas atividades não iniciadas e atividades iniciadas ainda não concluídas. Busca, notas, observações e histórico oferecem paginação própria.
- Links de download expiram em 60 segundos. Depois de emitidos, podem continuar válidos até expirar mesmo após excluir o vínculo.
- Exclusão de workspace exige digitar o nome. Remove registros em cascata e revoga imediatamente o acesso por RLS. Os objetos ficam em fila `storage_cleanup` para remoção física.
- Agende `node scripts/cleanup-storage.mjs` em um backend confiável, com `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` como secrets. O script remove até 100 objetos por execução e pode ser repetido. Não há agendamento de produção configurado neste repositório.
- A exportação em Configurações gera JSON dos registros do proprietário; anexos devem ser baixados separadamente. A exclusão da conta exige digitar o e-mail e remove os registros em cascata; objetos entram na fila de limpeza.
- Anexos permitidos: PDF, PNG/JPEG/WebP, MP4/WebM, TXT/CSV, DOCX/XLSX/PPTX. SVG, HTML e executáveis são recusados. Não existe antivírus integrado: a declaração de MIME não comprova segurança do conteúdo. Antes de produção, integrar scanner/quarentena conforme política de risco.
- Auth possui limites de requisição configurados no Supabase. A RPC de eventos limita a 60 registros por minuto por conta. Quotas gerais de armazenamento e retenção dependem da política de produção.
- Sem service role no cliente. Dados são protegidos por JWT, RLS e chaves estrangeiras compostas por proprietário. O shell da rota `/` é público, mas o conteúdo privado só é obtido após autenticação e autorização no Supabase.
- Sessão gerenciada pelo SDK Supabase no navegador. Nenhum conteúdo HTML de nota é executado; links abrem com `noopener noreferrer`. Produção exige HTTPS e revisão adicional de CSP e ameaças de XSS.

## Backups e recuperação

Escolha a retenção e, se necessário, PITR no projeto Supabase. Faça backup separado dos objetos de Storage; backup de banco não inclui seus bytes. Antes de produção, execute uma restauração em projeto isolado e verifique contas, threads, notas e downloads. Não há backup de produção configurado ou teste de restauração concluído.

## Referências

- [Arquitetura e decisões](docs/ARCHITECTURE.md)
- [Validação e limites](docs/VALIDATION.md)
- [Fluxo local oficial do Supabase](https://supabase.com/docs/guides/local-development/cli-workflows)
- [Autenticação no Next.js](https://nextjs.org/docs/app/guides/authentication)

O design system atual está em `src/app/desktop.css`, carregado após os estilos anteriores para preservar componentes compartilhados. Branco e neutros predominam; o azul institucional indica identidade, seleção, foco e ações. A marca reutilizável permanece em `src/components/brand.tsx`. Os documentos de identidade oceânica descrevem a origem dos ativos preservados.

Identidade oficial atual: [tubarão e logotipo gráfico TASKNADO](docs/BRAND_IDENTITY.md), com componentes compartilhados e variantes clara e escura.
