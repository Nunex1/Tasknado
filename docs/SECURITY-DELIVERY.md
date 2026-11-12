# Tasknado — entrega de engenharia de segurança

Data: 12/11/2026, America/Sao_Paulo. Branch: `codex/security-hardening`. Sem merge, deploy ou alteração de dados de produção.

## Resultado e limites

A auditoria começou no commit `7a26ed67ced2128035b0dc0538a79cef477a5802`. Durante o trabalho, a branch foi atualizada sobre `main` `e2b87af37e75d40e59a825f38c2d5a49f7108fd7`; os novos componentes de landing, dashboard, estilos e scripts também receberam revisão independente. As alterações não commitadas do diretório original foram preservadas em outro worktree.

Não foi confirmado acesso entre proprietários nem execução de conteúdo de notas. Foi confirmado um bypass concorrente do limite de eventos, corrigido. O registro de dependências sinalizou cinco avisos no conjunto de testes, incluindo dois críticos em Tinypool; após atualizar Vitest, a consulta retornou zero avisos. Isso não comprova ausência de vulnerabilidades desconhecidas.

A entrega é código e validação local para revisão humana, não uma certificação ASVS nem autorização para publicar. Nenhuma crítica/alta conhecida permanece nas dependências consultadas; nenhuma crítica/alta de aplicação foi confirmada no escopo revisado. Configuração real de produção, scanner antimalware operacional e restauração completa de banco + objetos são gates pendentes. Não foram declarados riscos aceitos em nome do proprietário.

## Achados e evidências

| Item | Classificação e evidência | Tratamento |
|---|---|---|
| Limite de eventos não atômico | Baixa, CWE-362. `202611090001_reopen_completed.sql:6,20-21` bloqueava a atividade, mas contava eventos de toda a conta. Chamadas em workspaces distintos podiam passar simultaneamente. Sem acesso cruzado. | `202611100002_event_quota.sql`: lock transacional por conta antes de consultar/alterar; relógio real; índice owner/created. Teste PostgreSQL: 59 existentes + 12 chamadas concorrentes = exatamente 60. |
| Dependências de teste com avisos | `pnpm-lock.yaml`: Vitest 3.2.7, Tinypool 1.1.1. GHSA-82fw-gwwq-j7x9, GHSA-qxg6-89mg-rqv8, GHSA-5gmw-xhrv-c9v3, GHSA-85c8-ppgw-ccpr. Cinco entradas de registro, quatro advisories únicos; severidade do registro não equivale a exploração da aplicação. Tinypool requer uma primitiva adicional de prototype pollution; servidor de mocks não é usado pelo frontend. | Vitest 5.1.0 e lock atualizado; 47 testes passam; audit final com zero avisos. |
| Privilégios SQL excessivos | Hardening confirmado sob os defaults modelados do Supabase: GRANT ALL deixa TRUNCATE, que ignora RLS. Não foi encontrado endpoint de SQL arbitrário ou credencial SQL de anon/authenticated; não é um bypass remoto demonstrado. | Revogação e concessões mínimas, sem TRUNCATE/REFERENCES/TRIGGER, sem CREATE no public, sem EXECUTE de triggers pelo cliente. pg_temp explícito por último. Testado em PGlite e PostgreSQL. |
| MIME declarado sem inspeção | Lacuna confirmada em `files.tsx`, `domain.ts` e policies antigas. Um usuário podia armazenar bytes com MIME mentido. Bucket privado, ownership e preview img/video limitavam impacto; não foi demonstrada vítima de outra conta. | Quarentena fail-closed, assinatura/conteúdo, tamanho real, scanner obrigatório, sem overwrite/move/delete direto, paths não reutilizáveis. |
| Fila e quota durante implementação | Revisão independente detectou dois problemas médios antes da entrega: dez objetos ausentes bloqueavam a fila; tamanho mentido/rejeição/deleção liberava quota antes de apagar bytes. Detectou ainda corrida baixa entre cleanup e resize. | Backoff persistente antes de I/O; reservas independentes da metadata; zero terminal após remoção física. Regressões SQL/HTTP cobrem esses casos. Não foram publicados sem correção. |

## Controles entregues e impacto operacional

- SQL: migrações incrementais 202611100001–003. RLS e FKs compostas continuam sendo a fronteira de autorização. RPCs preservam checagens de identidade, propriedade, revisão, transição e idempotência. A serialização de eventos ocorre somente dentro da mesma conta.
- CSP: nonce novo por resposta, headers de entrada sobrescritos, `strict-dynamic`, sem unsafe-eval em produção, destinos Supabase limitados à origem configurada, frame/object bloqueados. Layout dinâmico e cache privado/no-store são necessários; aumentam trabalho de renderização e eliminam cache público de HTML. Styles inline permanecem para React/Radix. HSTS de um ano sem preload/includeSubDomains; HTTPS e redirecionamento devem ser verificados no provedor.
- Uploads: 20 MiB por objeto, até dez pendentes por conta e reserva total de 1 GiB. Reservas de rejeitados e excluídos continuam contando até remoção física. Arquivos existentes começam pendentes na migração: ficam indisponíveis até inspeção. Isso exige janela de implantação e worker preparado antes de aplicar.
- `scan-uploads.mjs`: processa dez elegíveis por execução, adia retries por cinco minutos, verifica tamanho real, MIME por assinatura, UTF-8, estrutura Office e conteúdo ativo conhecido; exige ClamAV para aprovar. Erros do scanner não liberam arquivos. Não é CDR completo, parser PDF completo ou garantia de ausência de malware. Office com macros/embeddings/relações externas, texto ativo e certos PDFs serão recusados; documentar falsos positivos e revisar requisitos antes de ampliar allowlists.
- `cleanup-storage.mjs`: destino explicitamente vinculado, ordem por antiguidade, continua após erro, libera reserva somente após Storage confirmar remoção. Tombstones permanecem para impedir reuso; não contêm conteúdo, mas incluem identificador de proprietário/caminho e precisam de política de retenção.
- Auth: revisados cadastro, confirmação, recuperação, SDK de sessão e logout. Testes HTTP verificam JWT inválido e revogação de refresh token após logout global. Tokens de acesso e URLs assinadas já emitidos podem sobreviver até expirar. Não foi alterado o fluxo visual de autenticação.
- CI: permissões read-only, ações fixadas por SHA, lock congelado, testes, build, auditoria de dependências, Semgrep local e Gitleaks; Dependabot semanal. Nenhum secret de produção é necessário. Regras Semgrep são deliberadamente pequenas e não substituem revisão humana.
- Observabilidade: logs de workers contêm contadores, sem nomes de arquivo, tokens ou conteúdo. `security-health.mjs` falha quando há filas com mais de quinze minutos ou falha de consulta. Agendamento/alertas de produção não foram ativados.

## Evidências de testes

| Comando / verificação | Resultado observado | Limite |
|---|---|---|
| Baseline Vitest | 42 testes passaram | Antes do hardening |
| Vitest final 5.1.0 | 47 testes, dez arquivos, passaram após incorporar main | Não cobre todos os navegadores |
| `node scripts/test-database.mjs` | 18 grupos passaram | PostgreSQL embarcado com harness Auth/Storage; não é HTTP |
| `node scripts/test-security-postgres.mjs` | Concorrência 12 transações, privilégios e pg_dump/restore passaram | Container descartável, sem portas/mounts; dados sintéticos |
| `node scripts/test-security-http.mjs` | Seis grupos passaram: acesso cruzado/anônimo, quarentena, assinatura, imutabilidade, reuso, cleanup/resize, JWT/logout e justiça da fila/falha do scanner | Stack exclusivo tasknado_security, porta 56431; aprovação clean de fixture é administrativa, não um scan ClamAV real |
| Replay de URL assinada após apagar metadata | HTTP 200 antes de expirar | Janela residual de 60 segundos documentada; não prometer revogação instantânea |
| `next build --webpack` | Compilação e TypeScript passaram; rotas dinâmicas e Proxy presentes | Build em cópia isolada; Turbopack não aceitou junction node_modules nessa cópia. CI usa build padrão em instalação real |
| `test-security-browser.mjs` | Edge Chromium: hidratação, troca de modo, nonce por script, rotação, HSTS/no-store e bloqueio de script sem nonce passaram | Shell público; não foi repetida toda a jornada visual/autenticada |
| `pnpm install --frozen-lockfile --ignore-scripts` | Lock consistente | Instalação normal anterior executou somente build permitido de esbuild |
| `pnpm audit --json` | Zero info/low/moderate/high/critical | Consulta pontual ao registro, incluindo dev dependencies |
| Gitleaks 8.30.0, diretório atual, redacted | Nenhum segredo encontrado; aproximadamente 1,05 MB examinados na passagem inicial | Não é prova sobre todo o histórico Git; CI configurado com checkout completo |
| Semgrep 1.145.0, três regras locais | 70 arquivos JS/TS, zero achados, linhas parseadas ~100% na passagem inicial | Primeira tentativa sobre worktree montado examinou zero arquivos e foi descartada; repetição usou cópia real |
| Revisão independente | Baseline, arquitetura, upload e revisão das correções | Estática; achados e contraprovas preservados |

Não realizados: scanner ClamAV real com assinaturas atualizadas/EICAR, fuzzing completo de codecs/arquivos, carga prolongada, restauração de produção com objetos/Auth/SMTP, recuperação de senha por e-mail ponta a ponta, verificação de rate limits hospedados/CAPTCHA/MFA, Safari/Firefox, pentest externo e inspeção de configuração de produção. Assets binários e resultados históricos não foram tratados como código auditado; bibliotecas não receberam auditoria integral de fonte vendor.

## Prioridades e gates

1. **P0 antes de publicar:** revisar PR e migrações; executar homologação com worker ClamAV real, assinaturas atualizadas, arquivo limpo e teste EICAR; provar que falha/timeout permanecem em quarentena. Não aplicar a migração de quarentena sem capacidade de processar o acervo.
2. **P1 antes de publicar:** conferir Auth hospedado (confirmação, redirects exatos HTTPS, rotação, limites, SMTP, senha vazada quando disponível), TLS, headers no CDN e proteção da branch exigindo CI. Credenciais privilegiadas em secret store, runner sem acesso de PRs não confiáveis.
3. **P1 antes de publicar:** executar runbook de backup/restauração banco + Storage em destino isolado, medir RPO/RTO, designar responsável por alertas e incidente. Teste sintético não satisfaz esse gate.
4. **P2 contínuo:** monitorar filas, quotas, falhas Auth e custo; revisar retenção de snapshots e tombstones; ampliar testes de formatos e autenticação; repetir auditoria após mudanças relevantes.

## Rastreabilidade de normas

Usados como guias, não como checklist integral certificado: ASVS 5.0 (autenticação, sessão, autorização, arquivos, configuração, comunicação, proteção de dados e logging) e OWASP Top 10:2025 (controle de acesso, configuração, cadeia de suprimentos, autenticação, integridade, logging e tratamento de falhas). RLS/RPC/HTTP cobrem controle de acesso; nonce CSP e escapa React cobrem fronteiras de renderização; quarentena e scanner cobrem arquivos; lock/audit/CI cobrem integridade e abuso; o runbook cobre operação.

Referências primárias: [ASVS 5.0](https://asvs.owasp.org/), [Top 10:2025](https://top10.owasp.org/2025/0x00_2025-Introduction/), [Supabase Storage/RLS](https://supabase.com/docs/guides/storage/security/access-control), [funções e privilégios](https://supabase.com/docs/guides/database/functions), [backups não incluem bytes de Storage](https://supabase.com/docs/guides/platform/backups), [Tinypool advisory](https://github.com/advisories/GHSA-85c8-ppgw-ccpr), [Vitest advisory](https://github.com/advisories/GHSA-qxg6-89mg-rqv8). Para Next.js, foram lidos os guias CSP, Proxy e Route Handlers distribuídos em node_modules/next/dist/docs da versão instalada 16.4.1.
