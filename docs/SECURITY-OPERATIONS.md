# Operação segura do Tasknado

Runbook para homologação e operação. Ele descreve o que o repositório entrega e o que depende do proprietário. Nada aqui foi ativado em produção por um commit: agendamentos, backups, alertas e o scanner só existem depois que alguém os configura no ambiente.

Achados, evidências e riscos residuais estão em [SECURITY-AUDIT-2026-11.md](SECURITY-AUDIT-2026-11.md). O relatório da entrega anterior continua em [SECURITY-DELIVERY.md](SECURITY-DELIVERY.md).

## 1. Estado dos ambientes e ordem de implantação

Situação verificada em 13/11/2026 por requisições anônimas de leitura:

- O site publicado (Netlify) já serve o frontend do PR #5, com CSP por nonce.
- O banco de produção **não** tem a migração de quarentena (`attachments.scan_status` não existe).
- O banco de produção também **não** tem as tabelas do módulo de PDI e Plano de Carreira (`career_targets` não existe), embora o frontend do PR #14 já esteja em `main`. Até a migração `202611140001` ser aplicada, esses dois módulos e a exportação de dados falham em produção.

O frontend desta entrega funciona nos dois estados do banco. Sem a coluna de quarentena, os anexos abrem como antes e nenhum é apresentado como verificado. Com a coluna, só arquivos `clean` abrem. Por isso o código pode ser publicado antes das migrações.

Ordem recomendada:

1. Revisar e fazer merge do PR. O Netlify publica o frontend. Conferir com a sonda (seção 6).
2. Fazer backup do banco e do Storage e ensaiar a restauração (seção 5).
3. Decidir se o módulo profissional entra antes da quarentena (seção 2) ou junto com as demais migrações.
4. Preparar o host do scanner e homologar com o banco de homologação (seção 3).
5. Conferir `pnpm exec supabase migration list` e `db push --dry-run` contra o projeto vinculado.
6. Registrar a homologação no banco e aplicar as migrações (seção 2).
7. Ativar os agendamentos dos workers e do health check (seções 3 e 6).

Não editar migrações já aplicadas em um ambiente. Nenhuma etapa deste runbook executa `db push` remoto por conta própria.

## 2. Trava da migração de quarentena

`202611100003_upload_quarantine.sql` torna todos os anexos existentes ilegíveis até a inspeção. Ela se recusa a rodar em um banco que já tem anexos enquanto o operador não registrar, naquele banco, que o worker foi homologado:

```sql
comment on table public.attachments is 'tasknado:scanner-validated';
```

Sem esse registro a migração falha com `Deployment gate: ...` e nada é alterado (schema e políticas ficam como estavam). Como as migrações são aplicadas em ordem, as três migrações seguintes também aguardam. Bancos sem anexos (local, CI) não são afetados.

### Módulo profissional antes da quarentena

`supabase db push` aplica as migrações pendentes em ordem e não pula nenhuma. Em produção estão pendentes, nesta ordem: `202611100001`–`003`, `202611130001`–`003`, `202611140001` (PDI e Plano de Carreira) e `202611140002`. Portanto um `db push` comum só entrega o módulo profissional depois de passar pela trava da quarentena.

Se o módulo profissional precisar entrar antes de o scanner estar homologado, a `202611140001` pode ser aplicada sozinha: ela depende apenas de tabelas e funções que a produção já tem. Verificado em PostgreSQL descartável partindo do nível `202611090002`: a migração aplica, o cliente autenticado grava, a exportação não fica acessível a `anon`, e as migrações puladas aplicam depois sem erro. O procedimento, com backup feito e em homologação primeiro:

1. Executar o conteúdo de `202611140001_professional_plans.sql` no banco (SQL editor ou `psql`), em uma transação.
2. Registrar no histórico: `pnpm exec supabase migration repair --status applied 202611140001`.
3. Mais tarde, com o scanner homologado, aplicar as demais com `pnpm exec supabase db push --include-all` (necessário porque elas têm versão anterior à última registrada). Revisar antes com `--dry-run`.

Enquanto a `202611140002` não for aplicada, as tabelas do módulo profissional ficam sem os limites por conta da seção 4.

### Quando registrar o marcador

Registre o marcador somente depois de:

- o daemon ClamAV estar em execução no host do worker, com assinaturas atualizadas;
- `pnpm scan:uploads` ter processado arquivos de teste no ambiente de homologação (limpo liberado, arquivo de teste EICAR rejeitado, daemon parado mantém pendente);
- a capacidade ter sido estimada: o worker processa dez arquivos por execução; com uma execução por minuto, um acervo de N anexos leva cerca de N/10 minutos, durante os quais os arquivos ainda não inspecionados ficam indisponíveis.

O marcador não aprova arquivo algum. Se ele for registrado sem scanner funcionando, os anexos ficam em quarentena indefinidamente. Não existe, neste repositório, caminho para marcar um arquivo como limpo sem inspeção; não crie um.

Rollback: as migrações `202611130001`–`003` e `202611140002` podem ser desfeitas removendo os gatilhos `account_limits` (oito tabelas), a função `enforce_account_limits`, a função `security_metrics` e restaurando `category_guard` da migração `202610210001` (com `search_path=pg_catalog,public,pg_temp`). A quarentena não deve ser revertida reabrindo a leitura de arquivos pendentes: mantenha o controle e corrija adiante. Para reverter o frontend, republique o deploy anterior no Netlify.

## 3. Worker de inspeção de arquivos

O worker (`scripts/scan-uploads.mjs`) conversa com o daemon `clamd` pelo protocolo INSTREAM. Ele não grava os arquivos em disco.

### Daemon

```bash
docker compose -f ops/clamav/docker-compose.yml up -d
```

- Imagem oficial fixada por digest. O motor só muda quando o digest muda em um commit revisado (o Dependabot propõe a atualização). As assinaturas são atualizadas em execução pelo `freshclam`, de hora em hora, em um volume.
- Publicado apenas em `127.0.0.1`. O `clamd` não tem autenticação e aceita o comando `SHUTDOWN` de qualquer cliente que o alcance: nunca o exponha em interface pública. Se o daemon ficar em outro host, o caminho de rede precisa ser privado e o worker exige `CLAMD_TRUSTED_NETWORK=yes`.
- Precisa de cerca de 1,5 GB de memória para carregar as assinaturas.
- Na primeira subida o `clamd` pode carregar as assinaturas embutidas na imagem antes de o `freshclam` terminar. Ele recarrega sozinho em até dez minutos; `docker compose exec clamav clamdscan --reload` antecipa. Enquanto as assinaturas estiverem velhas o worker não aprova nada.
- Arquivos cifrados, com macros OLE2 ou que excedem os limites de inspeção são reportados pelo motor e, portanto, rejeitados. Documente os falsos positivos antes de afrouxar qualquer limite.

### Configuração do worker

No secret store do host, nunca em variáveis `NEXT_PUBLIC_*` nem em CI de pull request:

| Variável | Valor |
|---|---|
| `SUPABASE_URL` | URL do projeto |
| `SUPABASE_SERVICE_ROLE_KEY` | chave privilegiada do projeto |
| `TASKNADO_WORKER_TARGET` | exatamente a mesma URL (evita destino acidental) |
| `CLAMD_HOST`, `CLAMD_PORT` | `127.0.0.1`, `3310` |
| `CLAMAV_MAX_SIGNATURE_AGE_HOURS` | opcional, padrão 72 |

Use Node 24, as dependências do lockfile e um usuário de sistema sem privilégio administrativo, com saída de rede apenas para o projeto Supabase.

### O que o worker garante

Antes de ler qualquer arquivo, a cada execução:

1. o serviço na porta responde como ClamAV com banco de assinaturas carregado;
2. as assinaturas têm no máximo 72 horas;
3. o daemon detecta o arquivo de teste padrão (EICAR) enviado pelo mesmo canal.

Se qualquer verificação falhar, o worker registra `{"scanner":"unavailable","reason":...}`, termina com código 1 e não altera nada. Depois do lote, o teste de detecção é repetido antes de publicar as aprovações. Um arquivo só fica `clean` quando a inspeção de formato (tamanho real, assinatura do tipo, estrutura Office, conteúdo ativo) e o motor aprovam os mesmos bytes. Timeout, conexão encerrada e resposta desconhecida contam como falha, nunca como veredito.

Um upload cujo arquivo nunca chegou ao Storage é reavaliado a cada cinco minutos e, depois de 24 horas, é encerrado como `rejected` (nunca `clean`). Ele deixa de ocupar uma das dez vagas pendentes; a reserva de bytes é liberada quando o registro é excluído e o cleanup roda.

### Agenda proposta no supervisor do host

- A cada minuto: `pnpm scan:uploads` (até dez arquivos).
- A cada minuto: `node scripts/cleanup-storage.mjs` (até cem objetos).
- A cada cinco minutos: `pnpm security:health`.

Evite execuções sobrepostas. Links assinados já emitidos valem por até 60 segundos, inclusive depois de o registro ser excluído; não registre URLs completas em logs.

## 4. Limites por conta

As migrações `202611130001_account_limits.sql` e `202611140002_professional_plan_limits.sql` limitam o que uma conta autenticada cria e a que velocidade altera dados. Backends com chave privilegiada não são limitados.

| Limite | Valor | Mensagem ao usuário |
|---|---|---|
| Alterações auditadas por minuto, por conta | 1.200 | Aguarde um momento antes de tentar novamente. |
| Workspaces | 200 | Limite de registros da conta atingido. |
| Tarefas | 10.000 | idem |
| Notas | 2.000 | idem |
| Blocos de nota | 20.000 | idem |
| Observações de workspace | 20.000 | idem |
| Alvos de carreira | 1.000 | idem |
| Itens de PDI | 5.000 | idem |
| Eventos de atividade | 60 por minuto (já existente) | Aguarde um momento antes de tentar novamente. |
| Uploads | 20 MiB por arquivo, 10 pendentes, 1 GiB reservado (já existente) | Limite de armazenamento atingido. |

O limite de velocidade conta linhas de `audit_logs` do último minuto. Uma ação do usuário gera de uma a três linhas; o uso contínuo mais intenso da interface (salvamento automático de notas) fica em torno de 255 por minuto. A contagem é feita sem bloqueios, então requisições simultâneas da mesma conta podem ultrapassar o teto em poucas unidades. Os tetos de linhas são exatos. A exclusão da própria conta nunca é bloqueada.

Esses limites freiam abuso e clientes defeituosos. Eles não são uma cota de bytes: cada linha ainda pode ter até 20–50 KB. Acompanhe `database_bytes` no health check.

## 5. Backup e recuperação de desastres

Objetivos propostos, **ainda não medidos em produção**: RPO de 24 horas e RTO de 4 horas. Só assuma esses números depois de um ensaio completo com volume real.

### O que precisa de cópia

| Item | Onde está | Como copiar |
|---|---|---|
| Dados e schema (`public`), usuários (`auth`), metadados de objetos (`storage`) | PostgreSQL do projeto | dump lógico (abaixo); backups gerenciados do Supabase conforme o plano |
| Bytes dos anexos | Supabase Storage | `scripts/backup-storage.mjs` — os backups de banco **não** contêm esses bytes |
| Migrações, políticas, grants, funções | este repositório | Git |
| Configuração de Auth (URLs de redirecionamento, SMTP, limites, provedores) | painel Supabase | registrar em documento privado a cada alteração; `GET /auth/v1/settings` mostra a parte pública |
| Variáveis de build e deploy | Netlify | registrar nomes e origem dos valores; os valores ficam no gerenciador de senhas |
| Chave de backup, chave privilegiada, senha do banco | gerenciador de senhas | duas cópias em locais separados |

### Procedimento

1. Gere a chave uma única vez, fora do diretório de backup: `pnpm backup:storage keygen /caminho/seguro/backup.key`. Sem ela o backup não pode ser lido por ninguém.
2. Banco, em host confiável com a CLI vinculada ao projeto:
   ```bash
   pnpm exec supabase db dump --role-only -f roles.sql
   pnpm exec supabase db dump -f schema.sql
   pnpm exec supabase db dump --data-only --use-copy -f data.sql
   ```
   Cifre cada arquivo e apague o original: `BACKUP_KEY_FILE=... pnpm backup:storage seal data.sql data.sql.enc`. O dump contém notas, e-mails e hashes de senha.
3. Storage, em diretório vazio por execução: `BACKUP_DIR=/backups/2026-11-13 BACKUP_KEY_FILE=... pnpm backup:storage export`. O relatório traz contagens; `failed` diferente de zero significa cópia incompleta e o comando termina com erro. `absent` são reservas cujo upload nunca terminou.
4. Verifique sem rede: `pnpm backup:storage verify`. Cada objeto é decifrado e comparado com tamanho e SHA-256 do manifesto.
5. Copie o diretório para um segundo local (outra mídia ou provedor). Os arquivos já estão cifrados com AES-256-GCM; nomes e manifesto não revelam contas nem conteúdo.
6. Retenção proposta: sete cópias diárias e quatro semanais. Defina o descarte de cópias antigas e lembre que dados de contas excluídas permanecem nas cópias até elas expirarem.

Faça a cópia do banco e a do Storage na mesma janela. Objetos enviados ou apagados entre as duas aparecem como divergência na conferência do ensaio.

### Restauração (sempre em ambiente isolado primeiro)

1. Crie um projeto Supabase novo, sem SMTP real, sem domínio de produção e sem tráfego.
2. Aplique as migrações deste repositório e restaure `roles.sql`, `schema.sql` e `data.sql` (decifre com `pnpm backup:storage open`).
3. Restaure os bytes apontando as variáveis do worker para o projeto isolado: `pnpm backup:storage restore`. O comando envia apenas objetos ausentes, nunca sobrescreve nem apaga, e pode ser repetido.
4. Valide com duas contas de teste: login, isolamento entre contas, tarefas, notas, histórico, download de anexos limpos, quarentena dos demais. Compare contagens de linhas e uma amostra de hashes.
5. Registre data, responsável, duração e perda de janela observada. Só então planeje, com aprovação, a troca de produção.

Exclusão acidental de objetos: `restore` contra o próprio projeto recoloca somente os objetos que faltam. Exclusão acidental de registros: restaure o dump em projeto isolado e recupere as linhas necessárias; não restaure um dump inteiro sobre a produção.

Nunca execute `db reset`, `restore` de dump completo ou qualquer operação destrutiva em produção como ensaio.

O que foi testado: exportação, verificação, detecção de corrupção, chave errada e recuperação de objeto apagado, com dados sintéticos no stack isolado (`pnpm test:security:backup`); dump e restauração sintéticos de PostgreSQL (`pnpm test:security:postgres`). **Não** foi testado: backup e restauração do projeto de produção, restauração de `auth` em projeto hospedado, tempos reais.

## 6. Monitoramento e alertas

Implementado no repositório; passa a valer quando for agendado.

### Health check interno (`pnpm security:health`)

Roda no host do worker com as mesmas variáveis. Imprime uma linha JSON com contadores agregados (função `security_metrics()`, executável só por `service_role`) e termina com código 1 quando há alerta. O agendador transforma o código de saída em notificação; o script não envia mensagens.

| Código | Condição | Ação |
|---|---|---|
| `metrics_unavailable` | banco ou API indisponível, ou migração de métricas ausente | verificar status do projeto |
| `scan_queue_overdue` | upload pendente há mais de 15 minutos | verificar worker e daemon |
| `scanner_unavailable` / `signatures_stale` | daemon inacessível, sem detecção, ou assinaturas com mais de 24 h | verificar `freshclam` e o container |
| `cleanup_overdue` | objeto aguardando remoção há mais de 15 minutos | verificar `cleanup-storage` |
| `rejections_spike` | mais de 20 rejeições em 24 h | investigar abuso ou falso positivo |
| `storage_quota_near` | conta com 90% da reserva de 1 GiB | acompanhar |
| `database_size` | banco acima de 400 MB (ajustável) | planejar capacidade; investigar crescimento |
| `write_rate_ceiling` | conta no teto de alterações por minuto | investigar abuso |

Os limiares são ajustáveis por `HEALTH_DATABASE_BYTES`, `HEALTH_REJECTIONS_24H` e `HEALTH_SIGNATURE_AGE_HOURS`. A saída não contém nomes de arquivo, caminhos, identificadores de conta, tokens ou conteúdo.

### Sonda externa (`pnpm security:probe`)

Faz apenas requisições anônimas de leitura ao site publicado: disponibilidade, redirecionamento HTTP→HTTPS, CSP com nonce que muda a cada resposta, HSTS, demais cabeçalhos, `nosniff` em arquivos estáticos. Com a chave pública do navegador em `TASKNADO_SUPABASE_PUBLISHABLE_KEY`, também confere que a confirmação de e-mail continua obrigatória, que só o provedor de e-mail está ativo e que a API recusa acesso anônimo às tabelas. A sonda recusa qualquer chave que não seja a pública.

O workflow `.github/workflows/monitor.yml` executa a sonda a cada seis horas depois que este código estiver em `main`. Uma execução com falha é o alerta: o GitHub notifica o proprietário. Para incluir as verificações de Auth, crie a *variável* de repositório `TASKNADO_SUPABASE_PUBLISHABLE_KEY` (não é segredo: é a mesma chave entregue ao navegador). Para desativar, desabilite o workflow.

### O que continua no painel dos provedores

Não há como coletar pelo repositório, sem credencial administrativa: falhas de login e bloqueios por limite de requisições (Supabase → Logs → Auth), erros 4xx/5xx da API e respostas `permission denied` (Logs → API/Postgres), uso de banco, Storage e banda (Usage), e falhas de build/deploy (Netlify). Configure os alertas de uso e de e-mail desses painéis e revise os logs de Auth semanalmente.

Logs devem conter horário, tipo de evento, resultado e correlação não sensível. Nunca JWT, senha, chave privilegiada, conteúdo de notas ou URLs assinadas.

## 7. Autenticação (painel Supabase)

Verificado publicamente em 13/11/2026: cadastro aberto, apenas provedor de e-mail, confirmação de e-mail obrigatória, login anônimo desativado. O restante só é visível no painel e continua **pendente de conferência**:

- Site URL e Redirect URLs com o domínio final exato, sem curingas.
- SMTP próprio. O serviço padrão limita o envio a poucos e-mails por hora.
- Limites de requisição de login, cadastro, verificação e renovação de token.
- Rotação de refresh token e intervalo de reuso.
- Comprimento mínimo de senha (o formulário pede 8) e, quando o plano permitir, proteção contra senhas vazadas.
- `Secure password change` (reautenticação recente para trocar a senha).
- CAPTCHA (hCaptcha ou Turnstile) se houver abuso de cadastro ou login. Exige também uma mudança no formulário.

A aplicação não usa cookies: a sessão fica no `localStorage`, gerenciada pelo SDK, e a renovação é por refresh token com rotação. A consequência é que um script injetado na página leria o token; a CSP com nonce, a ausência de HTML de usuário executável e os cabeçalhos de isolamento são a defesa. Migrar para sessão em cookie `HttpOnly` exige renderização de dados no servidor e é uma mudança de arquitetura.

Autenticação multifator (TOTP) não está implementada. Para ativar é preciso: habilitar TOTP no painel, criar as telas de cadastro e verificação do fator (`supabase.auth.mfa.*`), exigir `aal2` nas operações sensíveis por política de banco e testar a recuperação de quem perde o dispositivo. É um trabalho de produto com testes de regressão próprios.

A exclusão de conta pede que o usuário digite o e-mail, mas não exige reautenticação: um token de acesso roubado, válido por até uma hora, consegue excluir a conta. Recomenda-se exigir senha recente quando o fluxo for revisto.

## 8. GitHub

Estado verificado em 13/11/2026: `main` sem proteção de branch e sem rulesets; secret scanning e push protection ativos; alertas e atualizações de segurança do Dependabot desativados; Actions com permissão padrão somente leitura.

Recomendações para o proprietário (nenhuma foi aplicada):

1. Proteger `main`: exigir pull request, pelo menos uma aprovação, branch atualizada e os checks `regression`, `isolation`, `secrets`, `static-analysis` e `analyze`; bloquear force push e exclusão. O check `antivirus` depende do espelho público de assinaturas e deve ficar informativo.
2. Ativar *Dependabot alerts* e *Dependabot security updates* (Settings → Advanced Security).
3. Manter *Code scanning* com o workflow CodeQL deste repositório; revisar os alertas após o primeiro resultado em `main`.
4. Em Settings → Actions, permitir apenas actions do GitHub e as verificadas, e exigir fixação por SHA.
5. Não habilitar auto-merge. Uma CI verde não substitui as etapas operacionais deste runbook.

A CI não usa credenciais de produção. Os jobs `isolation` e `antivirus` sobem serviços Supabase locais dentro do runner, com chaves descartáveis. Nunca coloque a chave privilegiada do projeto em secrets acessíveis a pull requests.

## 9. Resposta a incidentes

1. Registre horário, evidências e escopo sem copiar segredos. Designe responsável e canal privado.
2. Contenha: suspenda uploads, scanner ou deploy conforme o caso, preservando a leitura autorizada quando possível. A quarentena permanece fechada.
3. Chave privilegiada exposta: rotacione no provedor, substitua nos workers e valide. Sessão exposta: revogue os refresh tokens do usuário; tokens de acesso e URLs assinadas já emitidos valem até expirar.
4. Corrija a causa, reprocesse arquivos se necessário e avalie acesso entre contas pelos logs. Restaure somente de cópia verificada, em ambiente isolado.
5. Comunique com base em impacto confirmado, com revisão do responsável por privacidade para as obrigações aplicáveis.
6. Documente causa, linha do tempo, alcance, contenção, recuperação e ações preventivas. Adicione um teste de regressão antes de reabrir.
