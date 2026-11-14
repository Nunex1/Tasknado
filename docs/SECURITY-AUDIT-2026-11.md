# Tasknado — auditoria e hardening de segurança (novembro/2026)

Data: 13/11/2026. Branch: `codex/tasknado-security-hardening`, criada a partir de `main` em `4c82991` (merge do PR #5). Nenhum merge, deploy, alteração de banco hospedado ou mudança de configuração administrativa foi feita por esta entrega.

Operação, implantação e rollback estão em [SECURITY-OPERATIONS.md](SECURITY-OPERATIONS.md). O relatório da entrega anterior (PR #5) continua em [SECURITY-DELIVERY.md](SECURITY-DELIVERY.md).

OWASP ASVS 5.0 e OWASP Top 10 foram usados como roteiro de revisão. Isto não é certificação nem declaração de conformidade, e testes aprovados não provam ausência de vulnerabilidades.

## 1. Escopo e método

Revisão de: migrações SQL (RLS, grants, funções, gatilhos), cliente Supabase e fluxos de autenticação, upload e quarentena, proxy/CSP e cabeçalhos, workers de backend, workflows do GitHub, dependências e documentação operacional. Verificações executadas em quatro ambientes, todos locais ou públicos:

- PostgreSQL embarcado (PGlite) e PostgreSQL 16 em container descartável sem rede;
- um stack Supabase local isolado (`tasknado_security`, portas 5643x) com Auth, API e Storage reais;
- o motor ClamAV 1.5.4 real, em container, com assinaturas atualizadas;
- o site publicado, apenas com requisições anônimas de leitura (cabeçalhos, documento público de configuração do Auth e uma consulta que a API recusou).

Nenhum teste escreveu em produção ou usou credencial privilegiada de produção.

## 2. O que já existia e foi mantido

O PR #5 entregou e esta auditoria confirmou, sem reimplementar: RLS com chaves estrangeiras compostas por proprietário; grants mínimos sem `TRUNCATE`/`REFERENCES`/`TRIGGER`; RPCs com verificação de identidade e `search_path` fixo; limite atômico de 60 eventos por minuto; CSP com nonce por resposta e `strict-dynamic`; quarentena de uploads com reserva de bytes e caminhos não reutilizáveis; inspeção de formato dos arquivos; CI com permissões de leitura, actions fixadas por SHA, auditoria de dependências, Semgrep e Gitleaks; Dependabot.

Conferido no ambiente publicado em 13/11/2026: HTTP redireciona para HTTPS (301); HSTS de um ano; CSP com nonce diferente a cada resposta; confirmação de e-mail obrigatória; apenas o provedor de e-mail ativo; login anônimo desativado; a API recusa leitura anônima das tabelas.

## 3. Matriz de riscos

Severidade considera probabilidade, impacto e facilidade de exploração no contexto do Tasknado (aplicação individual, cadastro aberto, planos iniciais de Netlify e Supabase).

| ID | Achado | Severidade | Evidência | Impacto | Tratamento | Validação |
|---|---|---|---|---|---|---|
| A1 | Frontend publicado exige quarentena que o banco de produção não tem | Alta (disponibilidade; já ocorrendo) | Produção responde `column attachments.scan_status does not exist`; `files.tsx` em `main` só abria arquivos com `scan_status = 'clean'` | Todo anexo aparece como "Em verificação" e não abre nem baixa; novos uploads são aceitos e nunca ficam legíveis | A interface distingue banco sem quarentena (abre como antes, sem selo) de banco com quarentena (só `clean` abre; valor desconhecido ou nulo fica fechado) | Testes unitários; navegador real contra os dois bancos |
| A2 | Scanner aprovava por erro de configuração | Média | O worker executava qualquer binário em `CLAMSCAN_PATH` e tratava saída 0 como "limpo"; a suíte anterior usava o próprio `node` como scanner | Um caminho errado (`/bin/true`) ou um motor sem assinaturas liberaria todos os arquivos sem inspeção | Worker reescrito sobre o daemon `clamd`: exige identidade ClamAV, assinaturas com até 72 h e detecção do arquivo de teste EICAR antes e depois de cada lote; qualquer outra resposta é falha | 6 testes de protocolo com daemon simulado; suíte HTTP; ClamAV real |
| A3 | Escritas sem limite por conta | Média | Só eventos (60/min) e uploads tinham limite; inserções diretas em workspaces, tarefas, notas, blocos e observações eram ilimitadas | Qualquer conta cadastrada podia esgotar o banco (500 MB no plano inicial) e derrubar o serviço para todos | Migração `202611130001`: teto de 1.200 alterações auditadas por minuto e limites de linhas por conta; mensagens próprias na interface | PGlite, PostgreSQL real com concorrência, HTTP real |
| A4 | Deadlock entre escritas simultâneas na mesma workspace | Média | Em `main`, 9 de 40 transações concorrentes falharam com `deadlock detected` (PostgreSQL 16): `category_guard` tomava bloqueio compartilhado da workspace e `touch_parent_workspace` precisava do exclusivo | Ações simultâneas legítimas (duas abas, cliques rápidos) falhavam após um segundo com erro genérico | Migração `202611130003`: o guard toma desde o início o bloqueio que a transação vai precisar | 40 escritas concorrentes mistas, 0 falhas, em 3 execuções |
| A5 | Migração de quarentena sem trava técnica | Média | O bloqueio era apenas documental; um `supabase db push` aplicaria a migração e tornaria todos os anexos ilegíveis sem scanner | Indisponibilidade de todos os anexos por erro operacional | A migração recusa rodar em banco com anexos até o operador registrar nele a homologação do scanner | Ensaio em PostgreSQL real: recusa, schema intacto, aplicação após o registro |
| A6 | Next.js 16.4.1 com correções de segurança pendentes | Média | A versão 16.4.5 corrige sete avisos de severidade moderada (cache `use cache`, otimização de imagem, cabeçalho interno no runtime Edge). `pnpm audit` não os listava | A aplicação não usa os recursos afetados; exposição direta não demonstrada | Atualização para 16.4.6 | Typecheck, build, 75 testes unitários e todas as suítes de navegador |
| A7 | Funções novas em `public` nascem executáveis por `anon` | Baixa | No Supabase real, uma função criada em transação revertida recebeu `=X/postgres` e `anon` podia executá-la. O `ALTER DEFAULT PRIVILEGES ... IN SCHEMA` da migração `202611100001` não remove o padrão global de `PUBLIC` | Uma migração futura que esqueça o `REVOKE` exporia uma RPC a visitantes anônimos | Teste de snapshot de privilégios na CI: falha se qualquer função for executável por `PUBLIC`/`anon`, se o conjunto de RPCs ou grants de `authenticated` mudar, se uma tabela ficar sem RLS ou se uma função `SECURITY DEFINER` não fixar `search_path` | PGlite na CI; conferido no Supabase isolado |
| A8 | Arquivos estáticos sem cabeçalhos de segurança; isolamento de origem ausente | Baixa | `/brand/favicon-32.png` em produção sem `X-Content-Type-Options`; páginas sem `Cross-Origin-Opener-Policy` | Defesa em profundidade reduzida | `netlify.toml` para arquivos da CDN; COOP, CORP, `X-Permitted-Cross-Domain-Policies`, `Permissions-Policy` ampliada; CSP com `frame-src`, `worker-src` e `manifest-src` explícitos | Testes unitários; sonda externa; build local |
| A9 | Monitoramento insuficiente | Baixa | O health check contava dois itens e não verificava o scanner; nada detectava mudança de configuração em produção | Falhas e desvios passariam despercebidos | Função `security_metrics()` (só `service_role`), health check com nove alertas, sonda externa agendável | PGlite, HTTP real, 4 testes da sonda, execução contra a produção |
| A10 | Uploads abandonados ocupavam a fila para sempre | Baixa | Registro sem bytes era reavaliado a cada cinco minutos indefinidamente | Vagas pendentes e ciclos do worker consumidos | Encerrado como `rejected` após 24 h (nunca `clean`) | Suíte HTTP |
| A11 | Bytes do Storage sem procedimento de cópia executável | Média (continuidade) | Backups de banco não incluem os objetos; o runbook descrevia o procedimento sem ferramenta | Perda definitiva de anexos em exclusão acidental ou incidente | `scripts/backup-storage.mjs`: exportação cifrada, verificação offline e restauração que nunca sobrescreve | Ensaio no stack isolado |
| A12 | `main` sem proteção; alertas do Dependabot desativados | Média (processo) | API do GitHub: `Branch not protected`; `Dependabot alerts are disabled` | Código sem revisão ou sem CI pode chegar à produção; avisos de dependências não chegam | **Pendente do proprietário.** Recomendações no runbook, seção 8. Workflow CodeQL adicionado | — |
| A13 | Autenticação: MFA ausente, exclusão de conta sem reautenticação, sessão em `localStorage`, limites hospedados não verificados | Baixa a média | Revisão de código e do documento público do Auth | Um token de acesso roubado vale até uma hora, inclusive para excluir a conta | **Pendente / risco residual.** Descrito no runbook, seção 7 | — |

Sem achado nas verificações de: acesso entre contas por API, RPC e Storage; SQL dinâmico com entrada do usuário (o único `EXECUTE` novo usa `%I` sobre o nome da tabela do gatilho); pontos de injeção de HTML (um único `dangerouslySetInnerHTML`, constante e com nonce); links de notas (apenas `http(s)`, com `noopener noreferrer`); redirecionamentos controlados por parâmetro; segredos versionados.

## 4. Alterações

- **Interface:** `attachmentAccess()` em `src/lib/domain.ts` e `src/components/files.tsx`; mensagens para limite de conta e de armazenamento em português e inglês. Nenhuma mudança visual além do selo de verificação, que só aparece quando há veredito.
- **Cabeçalhos:** `src/lib/security-headers.ts`, `next.config.ts`, `netlify.toml`.
- **Scanner:** `scripts/clamav.mjs`, `scripts/scan-uploads.mjs`, `ops/clamav/docker-compose.yml`. `CLAMSCAN_PATH` foi substituído por `CLAMD_HOST` e `CLAMD_PORT`.
- **Banco:** trava no início de `202611100003_upload_quarantine.sql` (migração ainda não aplicada em produção); novas `202611130001_account_limits.sql`, `202611130002_security_metrics.sql` e `202611130003_activity_write_deadlock.sql`, todas reaplicáveis.
- **Operação:** `scripts/security-health.mjs`, `scripts/probe-deployment.mjs`, `scripts/backup-storage.mjs`, `scripts/security-stack.mjs`.
- **CI:** jobs `isolation` e `antivirus`, workflows `codeql.yml` e `monitor.yml`, regra Semgrep contra chave privilegiada em `src/`, espera de sete dias e ecossistema `docker-compose` no Dependabot.
- **Dependências:** `next` 16.4.1 → 16.4.6. Nenhuma dependência nova.

Impacto de desempenho: cada escrita de um cliente autenticado faz uma contagem indexada limitada a 1.201 linhas de `audit_logs`; cada inserção faz também uma contagem limitada ao teto da tabela e toma um bloqueio consultivo por conta. Inserções simultâneas da mesma conta passam a ser serializadas; contas diferentes não se afetam. As escritas em tarefas da mesma workspace já eram serializadas pela atualização da workspace; agora esperam em vez de falhar. Os cabeçalhos novos não alteram cache nem renderização.

## 5. Evidências

Todos os resultados abaixo foram observados nesta máquina em 13/11/2026.

| Verificação | Resultado | Limite |
|---|---|---|
| `pnpm typecheck` | sem erros | — |
| `pnpm test` (Vitest) | 75 testes, 14 arquivos, aprovados (eram 59 em 12) | Não cobre componentes renderizados |
| `pnpm build` (Next.js 16.4.6) | compilado; 8 rotas dinâmicas e Proxy presentes | Build local |
| `node scripts/test-database.mjs` | 22 grupos aprovados (eram 18): inclui limites por conta, métricas e snapshot de privilégios | PostgreSQL embarcado com esquemas mínimos de Auth/Storage |
| `pnpm test:security:postgres` | 7 grupos aprovados em 3 execuções seguidas: limite de eventos sob concorrência, sem `TRUNCATE`, dump/restore sintético, 40 escritas concorrentes sem deadlock, teto de 200 workspaces exato com 12 inserções simultâneas, trava da quarentena, reaplicação das migrações | PostgreSQL 16 em container sem rede; dados sintéticos |
| Mesmo teste de concorrência sem as migrações novas | 9 de 40 transações falharam com `deadlock detected` | Reproduz o achado A4 em `main` |
| `pnpm security:stack reset` | as 17 migrações aplicaram em Supabase real recriado do zero | Stack local |
| `pnpm test:security:http` | 9 grupos aprovados: escrita anônima e leitura/exclusão entre contas recusadas; bytes pendentes ilegíveis até para o dono; veredito não forjável; sobrescrita e reuso de caminho negados; cleanup e reserva; JWT inválido e logout global; fila justa; quatro modos de falha do scanner mantêm quarentena; arquivo limpo liberado, tipo falsificado, arquivo de teste e upload abandonado rejeitados; inserção em massa recusada; métricas só para `service_role` | Scanner simulado em loopback nesta suíte |
| `pnpm test:security:clamav` | 3 grupos aprovados com ClamAV 1.5.4 real, assinaturas 28182: texto, imagem e DOCX limpos liberados só ao dono; EICAR rejeitado como texto e dentro de um DOCX; com o daemon parado nada é aprovado | Homologação local; não substitui a do ambiente de produção |
| `pnpm test:security:backup` | 3 grupos aprovados: exportação cifrada sem identificadores nem conteúdo legíveis; um bit alterado e chave errada detectados; objeto apagado recuperado byte a byte, sem sobrescrever existentes | Dados sintéticos; não mede RPO/RTO |
| Privilégios no Supabase isolado | `anon` sem funções nem tabelas; `authenticated` com exatamente 12 RPCs; nenhuma função via `PUBLIC`; todas as tabelas com RLS; todas as funções `SECURITY DEFINER` com `search_path` fixo | Consulta direta ao catálogo |
| `pnpm test:integration`, `test:notes`, `test:desktop`, `test:responsive` | 18, 12, 22 e 13 grupos aprovados contra o banco de desenvolvimento (sem quarentena, como a produção) **e** contra o stack isolado com todas as migrações | Chromium/Edge; Safari e Firefox não executados |
| `node scripts/test-security-browser.mjs` | aprovado: hidratação, nonce em todos os scripts, rotação, script injetado bloqueado | Página pública |
| Navegador, anexos | Banco sem quarentena: arquivo abre com prévia, sem selo, em desktop e em celular com tema escuro. Banco com quarentena: "Verificado" abre; "Bloqueado" e "Em verificação" não abrem e mostram a mensagem correta | Verificação manual assistida, contas temporárias removidas |
| `pnpm audit` | nenhuma vulnerabilidade conhecida | Consulta pontual ao registro |
| Semgrep 1.145.0, regras do repositório | 97 arquivos, 0 achados | Quatro regras locais |
| Semgrep 1.145.0, regras públicas (`p/default`, `p/owasp-top-ten`, `p/javascript`, `p/typescript`, `p/react`, `p/nextjs`, `p/secrets`, `p/github-actions`, `p/dockerfile`) | 163 arquivos; 1 achado em código novo (tag GCM sem tamanho fixo no backup), corrigido; 2 avisos de espera do Dependabot, atendidos; 2 ocorrências em `.env.local` não versionado com a chave pública do stack local | Execução única; não está na CI |
| Sonda externa contra a produção | Problemas: `opener_policy` e `static_nosniff` — as duas lacunas de A8, que este PR corrige. Demais verificações aprovadas | Estado anterior ao deploy desta entrega |

Gitleaks e os jobs de CI (incluindo `isolation`, `antivirus` e CodeQL, novos) rodam no pull request; consulte os checks do PR para o resultado remoto.

## 6. Não executado

- Qualquer teste autenticado, de escrita ou de carga contra a produção.
- Homologação do scanner, backup e restauração no projeto de produção; medição de RPO e RTO.
- Conferência do painel Supabase (URLs de redirecionamento, SMTP, limites, rotação) e do painel Netlify.
- Recuperação de senha por e-mail de ponta a ponta com SMTP real.
- Safari, Firefox e dispositivos físicos.
- Fuzzing de formatos de arquivo, teste de carga prolongado e teste de intrusão externo.
- Auditoria do código-fonte das dependências.

## 7. Riscos residuais

1. **Crescimento por bytes.** Os limites novos contam linhas e ritmo, não bytes. Uma conta ainda pode gravar textos de até 20–50 KB por linha dentro dos tetos. O alerta `database_size` e os limites de cadastro do Auth são a mitigação; uma cota de bytes por conta exigiria desenho próprio.
2. **Histórico e auditoria sem retenção.** `audit_logs` e `workspace_events` só crescem. Definir política de retenção.
3. **Padrão de privilégios de funções (A7).** Controlado por teste na CI, não pelo banco. Depende de a CI ser obrigatória em `main`.
4. **Sessão no navegador.** Tokens em `localStorage`; a proteção é a CSP. Sem MFA e sem reautenticação para excluir a conta.
5. **Scanner.** ClamAV detecta ameaças conhecidas; não é garantia de ausência de malware. Arquivos cifrados e com macros são rejeitados, o que pode recusar documentos legítimos.
6. **Links assinados.** Válidos por até 60 segundos mesmo após a exclusão do registro.
7. **Deadlock remanescente possível** entre a exclusão de uma workspace e uma escrita simultânea em tarefa dela (ordens de bloqueio opostas). É raro, o PostgreSQL resolve abortando uma das transações, e a operação pode ser repetida.
8. **Proteção de branch e alertas** continuam desativados até o proprietário agir (A12).

## 8. Condições para implantação

O frontend pode ser publicado com o merge: ele é compatível com o banco atual de produção e corrige A1. As migrações exigem, nesta ordem: backup verificado; scanner homologado no ambiente de destino; registro da homologação no banco; `db push --dry-run` revisado. O procedimento, o rollback e as pendências do proprietário estão no [runbook](SECURITY-OPERATIONS.md).
