# Operação segura do Tasknado

Este runbook é um projeto operacional para homologação e aprovação. Nenhum agendamento, backup, alerta ou scanner de produção foi configurado por esta entrega. Não executar testes locais contra produção.

## Responsabilidade e condições de publicação

O mantenedor deve nomear responsáveis por operação, resposta a incidentes e restauração antes de publicar. O PR não deve ser aprovado para deploy até existir evidência de scanner real, fila saudável, restauração e parâmetros Auth/TLS verificados. Os testes do repositório não conferem certificação ASVS.

As migrações 202611100001–003 são incrementais. A terceira põe todos os anexos existentes em quarentena; planejar a janela e capacidade de reprocessamento. Não editar migrações já aplicadas. Conferir dry-run, backup restaurável e destino antes de qualquer aplicação remota. Esta entrega não executa db push remoto. Para rollback, manter o controle de quarentena e corrigir adiante; não reabrir leitura de arquivos pendentes como atalho.

## Workers de arquivos

Usar host confiável existente, Node 24, dependências do lock, usuário de sistema sem privilégio administrativo e acesso de saída apenas ao projeto e às atualizações do antivírus. Nunca executar workers com credenciais de produção em CI de pull request.

Configurar no secret store do host:
- SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY, sem prefixo NEXT_PUBLIC.
- TASKNADO_WORKER_TARGET igual à URL exata aprovada (evita destino acidental).
- CLAMSCAN_PATH absoluto para binário ClamAV instalado e verificado.

O worker usa execFile sem shell e não grava credenciais. O arquivo temporário recebe nome aleatório e modo restritivo onde suportado. No Windows, aplicar ACL do usuário de serviço no TEMP; no Linux usar diretório privado e disco criptografado. Executar o parser/antivírus com limites de memória, CPU e tempo no supervisor; as checagens de assinatura não substituem sandbox de codecs.

Atualizar assinaturas com freshclam em rotina própria. Antes de habilitar aprovação, validar versão, data das assinaturas, arquivo limpo, EICAR, timeout, ausência de scanner, ZIP excessivo e indisponibilidade do Storage. Definir alerta para assinaturas com mais de 24 horas. Os testes entregues simulam falha do executável, não comprovam ClamAV instalado.

Proposta inicial de agenda no supervisor do host:
- A cada minuto: node scripts/scan-uploads.mjs (dez elegíveis; retries aguardam cinco minutos).
- A cada minuto: node scripts/cleanup-storage.mjs (até cem objetos).
- A cada cinco minutos: node scripts/security-health.mjs.

Não disparar execuções sobrepostas desnecessárias. Falha de consulta, scanner ou timeout mantém quarentena. Health retorna código não zero quando há pendências antigas (>15 minutos); conectar esse resultado ao canal operacional escolhido, com deduplicação e escalonamento após duas ocorrências. Não há envio automático de e-mail/Slack implementado.

Uploads abandonados continuam pendentes com backoff, consumindo a quota da própria conta. Revisar após 24 horas e excluir metadata pela operação autorizada, preservando auditoria e cleanup; não apagar bytes pelo SQL. Rejeitados continuam bloqueados e reservados até o usuário/operador excluir o registro e o cleanup remover fisicamente. Não marcar clean manualmente em produção para contornar falha do scanner.

Links já assinados são bearer tokens válidos por até 60 segundos. Não registrar URL completa. Depois de apagar metadata, novas leituras são negadas; um link existente pode continuar funcionando até expirar ou remover o objeto.

## Backup e restauração

Objetivos propostos, ainda não SLA comprovado: RPO <=24h e RTO <=4h. Medir em ensaio completo com volume representativo antes de assumir compromisso.

1. Inventariar dados: public, Auth/roles/configuração, migrações, políticas/grants, objetos de Storage e seus hashes, configurações de deploy e segredos recuperáveis pelo secret store. Os snapshots de workspace_events contêm conteúdo privado; incluí-los no inventário e na política de retenção.
2. Produzir backup lógico consistente por ferramenta compatível com o serviço, com conta restrita de backup, e exportar separadamente os bytes de Storage pela API. Banco sozinho não contém os bytes. Quiescer uploads/cleanup ou registrar um manifesto consistente e reconciliar objetos criados/deletados durante a janela.
3. Criptografar antes de armazenar fora do host. Separar chave de criptografia e backup. Não colocar SQL dumps, hashes vinculados a pessoas, tokens ou bytes privados em GitHub Actions artifacts públicos.
4. Proposta de retenção: sete diários e quatro semanais, sujeita à decisão de privacidade. Manter segunda cópia em mídia/local separado e verificar checksum. Definir expiração/eliminação de backups para contas excluídas; não prometer remoção instantânea em backups imutáveis.
5. Restaurar primeiro em projeto isolado, sem SMTP real, webhooks, jobs ou tráfego de usuários. Aplicar roles/extensões compatíveis, restaurar schema/dados/grants, importar bytes e reconciliar manifesto/checksums. Nunca usar produção como destino de ensaio.
6. Validar login/recuperação com contas de teste, duas contas isoladas, RPCs, notas, eventos, auditoria, quarentena, downloads e cleanup. Verificar contagens e amostras de hashes; medir tempos e perda de janela. Só após aprovação humana planejar cutover DNS/deploy e rollback.
7. Executar ensaio mensal e após alterações de schema/Storage. Registrar responsável, versão, início/fim, RPO/RTO medidos e desvios.

O script test-security-postgres realiza pg_dump/restore de dados sintéticos e verifica isolamento na base restaurada. Não restaura Auth real, SMTP, segredos ou arquivos. Não substitui o procedimento acima.

Alternativa gratuita: host já existente, PostgreSQL/Supabase CLI, ClamAV e ferramenta de backup criptografado para mídia existente em local separado. Não foi contratado recurso pago; software tem custo de licença incremental zero, mas operação, energia, armazenamento e disponibilidade não são gratuitos. Se a capacidade existente não atender o RPO/RTO, apresentar proposta separada com preço vigente antes de contratar. PITR gerenciado é opcional e depende do plano; não assumido.

## Observabilidade e resposta a incidentes

Monitorar: taxa de erros/latência, disponibilidade HTTPS, erros Auth e tentativas de login, quantidade/idade de pendências, rejeições do scanner, versão/idade de assinaturas, bytes reservados, backlog de cleanup, falhas de backup, último restore, alertas de dependências e resultado da CI. Logs devem conter timestamp, tipo de evento, resultado e correlação não sensível; nunca JWT, senha, service role, conteúdo de notas ou URLs assinadas.

As métricas dos workers são contadores de batch. Elas não são um sistema centralizado de auditoria imutável. Configurar retenção e acesso aos logs no host e revisar auditoria de ações administrativas separadamente.

Procedimento de incidente:
1. Registrar horário, evidências e escopo sem copiar segredos. Designar responsável e canal privado.
2. Conter a superfície afetada: suspender uploads/scanner/deploy conforme o caso; preservar leitura autorizada quando possível. Manter quarentena fail-closed.
3. Se houver suspeita de chave privilegiada exposta, rotacionar no provedor, substituir nos workers e validar operações. Se sessão exposta, revogar refresh tokens; considerar validade residual de access tokens/URLs. Não destruir evidência.
4. Corrigir causa, reprocessar arquivos quando necessário e avaliar acesso entre contas com logs. Restaurar somente de cópia verificada em ambiente isolado.
5. Preparar comunicação baseada em impacto confirmado, com revisão do responsável de privacidade/jurídico para obrigações aplicáveis; não inventar prazos legais.
6. Documentar causa, linha do tempo, alcance, contenção, recuperação e ações preventivas com responsáveis/datas. Adicionar regressão antes de reabrir.

## Auth, HTTPS e CI

Conferir no projeto hospedado: confirmação de e-mail, redirects exatos HTTPS, SMTP, rotação/reuso de refresh, limites de login/OTP/e-mail e notificações de mudanças sensíveis. Avaliar proteção de senha vazada e CAPTCHA conforme abuso observado. Alterações de senha/conta com reautenticação exigem fluxo e teste de UX próprios; não supor que confirmação no navegador seja uma fronteira de segurança.

CSP com nonce exige renderização dinâmica e proíbe cache público do HTML. Verificar header final no CDN, nonce nos scripts, navegação, recursos do Supabase e previews após cada deploy. HSTS não força HTTPS no servidor: configurar redirect HTTP -> HTTPS no provedor. Não habilitar preload/includeSubDomains sem inventário.

Exigir os jobs Security and regression na proteção de main; não habilitar auto-merge. CI usa lock congelado, versões/SHAs fixados e nenhuma credencial de produção. Gitleaks local examinou o estado atual; revisar também resultados do job de histórico. Dependabot abre propostas para revisão humana. Uma CI verde não elimina os gates operacionais.
