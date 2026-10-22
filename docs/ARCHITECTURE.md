# Tasknado — arquitetura e plano

Aplicação individual Next.js/React/TypeScript, tokens Tailwind e componentes acessíveis baseados em Radix (padrão shadcn). Supabase Auth, PostgreSQL com RLS e Storage privado. O cliente acessa o Supabase com JWT do usuário e chave pública; não existe chave privilegiada no frontend. Rotas de interface são um shell sem dados privados; toda leitura e escrita exige autorização no banco.

## Entregas e validação
1. Fundação e migração: entidades, índices, RLS, funções transacionais e auditoria.
2. Conta: cadastro, confirmação de e-mail, login, logout e recuperação.
3. Workspaces e atividades: CRUD, arquivamento, eventos permanentes e transições atômicas.
4. Notas: entradas cronológicas, debounce, revisão otimista e recuperação de erros.
5. Arquivos: bucket privado, limites, formatos permitidos e links temporários.
6. Busca: FTS português, filtros e navegação contextual.
7. Testes de integração: duas contas, isolamento, concorrência, persistência, arquivos e busca; build e inspeção de navegador.

## Decisões iniciais revisáveis
- Nome de trabalho: Tasknado (nome da pasta). Nova orientação do usuário: identidade oceânica com símbolo vetorial de tubarão-martelo, implementada sobre a base Deep Sea Blue.
- Eventos são imutáveis; correções devem ser novas observações. Exclusão de workspace exige confirmação e remove seus dados.
- Até 20 MB por arquivo. PDF, imagens PNG/JPEG/WebP, vídeos MP4/WebM, TXT/CSV e documentos Office Open XML. SVG/HTML/executáveis não são aceitos.
- Upload sem scanner antivírus externo: formatos restritos, download isolado e bucket privado reduzem superfície; inspeção antimalware de produção permanece pendente.
- Timestamps timestamptz do servidor; apresentação no fuso do navegador.
- Sem dados demonstrativos e sem persistência simulada.
- Banco local para validação; nuvem e publicação dependem dos projetos do proprietário.
- Backups: documentar restauração; retenção e PITR dependem do plano Supabase escolhido. Não declarar backup de produção configurado.

## Relações
auth.users → workspaces → activities → activity_events.
workspaces → notes → note_entries. attachments possui vínculo exclusivo com atividade ou nota. Todas as entidades incluem owner_id e os vínculos são validados pelo banco. audit_logs guarda operações sensíveis, sem copiar conteúdo privado.
