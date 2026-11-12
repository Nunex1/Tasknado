# Tasknado Design System — redesign de 10/11/2026

Redesign visual e de experiência da landing page e da área autenticada. Branco predominante, azul Primary para ação e estado, azul Royal para identidade. Nenhum schema, migration, política RLS, endpoint, fluxo de autenticação ou regra de negócio foi alterado.

> Atualização de 11/11/2026: a navegação do celular, o seletor de workspaces e os temas claro, escuro e do sistema estão descritos em [MOBILE-THEMES.md](MOBILE-THEMES.md). Onde este documento e aquele divergirem, vale o mais recente; os trechos alterados estão indicados abaixo.

## 1. Diagnóstico da interface anterior

Problemas comprovados no código e nas capturas anteriores:

| Problema | Evidência |
|---|---|
| Três folhas de estilo sobrepostas (`globals.css` → `ocean.css` → `desktop.css`, 3.361 linhas) em que cada uma desfazia a anterior | Tema escuro declarado em `globals.css` e revertido para claro em `desktop.css`; seletores repetidos até três vezes |
| Valores visuais arbitrários | Tamanhos de fonte de 8 a 11 px, espaçamentos de 3, 5, 13, 17, 23 px, cores em hexadecimal espalhadas |
| Sem tokens de estado | Atraso, pausa, conclusão e os quatro quadrantes usavam variações do mesmo azul ou cinza |
| Interface apenas para desktop | Nenhuma regra abaixo de 700 px; navegação fixa de 88 px + painel de 232 px em qualquer largura |
| Sem página pública | Visitante via apenas a tela de acesso, com texto metafórico e sem demonstração do produto |
| Fonte do sistema sem carregamento controlado | `Aptos`/`Segoe UI`/`-apple-system` conforme a máquina |
| Dois `h1` de mesmo peso dentro de um workspace | Título do workspace e título da seção com 26 px cada |
| Sair, Perfil e Configurações só existiam na barra lateral | Sem caminho alternativo em telas estreitas |
| Ícone escolhido para o workspace nunca era exibido | Mapa `icons` declarado em `app.tsx` e não utilizado |
| Filtros sem estado exposto | Botões de status sem `aria-pressed` |

Hipóteses que dependem de teste com usuários (não verificadas): se a ordem Prioridades → Em andamento → Recentes corresponde à forma como as pessoas planejam o dia; se o trilho com rótulos é preferível a uma barra lateral larga; se o texto da landing converte.

## 2. Arquitetura

```
src/app/globals.css        entrada: importa Tailwind e as camadas abaixo
src/styles/tokens.css      cores, tipografia, espaçamento, raios, sombras, movimento, layout
src/styles/base.css        elementos: tipografia, formulários, foco, movimento reduzido
src/styles/components.css  botões, badges, painéis, modais, toast, menus, estados vazios, calendário
src/styles/shell.css       cabeçalho, busca, navegação, painel de contexto, conteúdo
src/styles/views.css       painel, tarefas, matriz, notas, busca, configurações, perfil
src/styles/public.css      landing, cartão de acesso, carregamento/erro/404
```

Os nomes de classe dos componentes foram mantidos; as suítes existentes rodam sem alteração.

### Tokens

| Token | Valor | Uso |
|---|---|---|
| `--background` | #FFFFFF | Fundo predominante |
| `--primary` | #2563EB | Ações principais, indicador de seção ativa |
| `--primary-strong` | #1D4ED8 | Estados ativos, links, foco |
| `--royal` | #4169E1 | Identidade: destaque do título, ícones de destaque, marcadores |
| `--blue-surface` | #EFF6FF | Seleção e destaques sutis |
| `--surface` | #F8FAFC | Painéis secundários, navegação |
| `--text` | #0F172A | Texto principal |
| `--text-secondary` | #64748B | Texto auxiliar sobre branco e `--surface` |
| `--text-subtle` | #475569 | Texto auxiliar sobre superfícies tingidas (o cinza anterior ficaria abaixo de 4,5:1) |
| `--border` | #E2E8F0 | Divisórias |
| `--border-control` | #8793A6 | Borda de campos (3:1 contra branco, WCAG 1.4.11) |

Estados semânticos, cada um com texto, superfície e borda: `info` (azul, em andamento, Q2), `success` (verde, concluída), `warning` (âmbar, pausada, Q3), `danger` (vermelho, atrasada, exclusão, Q1), `neutral` (cinza, não iniciada, Q4, não classificada).

Tipografia: Inter, auto-hospedada por `next/font` (sem requisição a terceiros em tempo de execução). Escala em `rem`: 12 (metadados), 13, 14 (corpo do app), 16 (corpo da landing), 20 (seção), 24, 28 (título de página), 28–40 (seções da landing), 40–64 (hero). Exceção única: 11 px nos rótulos do trilho de navegação. Pesos 400, 500 e 600.

Espaçamento em múltiplos de 4 px (`--space-1` a `--space-24`). Raios de 8, 12 e 16 px. Três sombras, usadas só em superfícies que flutuam (menus, modais, cartão de acesso, capturas). Transições de 150, 200 e 250 ms com `cubic-bezier(0.2, 0, 0, 1)`; `prefers-reduced-motion` desliga animações e transições.

## 3. Componentes

Criados:

- `src/components/landing.tsx` — página pública: cabeçalho, hero com o cartão de acesso, demonstração, cinco módulos de funcionalidade, privacidade, chamada final, rodapé.
- `src/components/landing-shots.ts` e `src/assets/landing/` — capturas reais do app em PT e EN.
- `src/components/dashboard-focus.tsx` — listas "Prioridades" (atrasadas ou Q1) e "Em andamento" no painel, derivadas das atividades já carregadas.
- `src/components/workspace-icon.tsx` — ícone escolhido no formulário do workspace.
- `scripts/demo-data.mjs`, `scripts/capture-landing.mjs`, `scripts/test-responsive.mjs`.

Modificados:

- `auth.tsx` — o formulário (mesmos campos, modos e chamadas ao Supabase) virou o cartão da landing; na recuperação de senha aparece sozinho.
- `desktop-shell.tsx` — navegação inferior no celular, painel de workspace como gaveta abaixo de 900 px (Escape fecha e devolve o foco), ícones nos links do workspace.
- `profile-menu.tsx` — nome e e-mail, Editar perfil, Configurações e Sair, com setas, Home/End, Escape e Tab.
- `priority-matrix.tsx` — cabeçalho de quadrante em código (Q1–Q4), nome e ação; destaque do quadrante de destino durante o arraste. Regras de classificação e a RPC `set_priority` inalteradas.
- `app.tsx` — ícones nos indicadores, listas de foco, `aria-pressed` nos filtros, rótulos de coluna dentro das células (leitores de tela e cartões no celular).
- `workspace-overview.tsx`, `workspace-records.tsx`, `layout.tsx`, `error.tsx`, `not-found.tsx`, traduções PT/EN.

Removidos: `src/app/ocean.css` e `src/app/desktop.css`, substituídos pelas camadas acima. Dezessete textos da tela de acesso anterior, sem uso, saíram dos arquivos de tradução.

## 4. Páginas atualizadas

Landing (nova, na rota `/` para visitantes), acesso e recuperação de senha, Início, Workspaces, visão geral do workspace, Tarefas, detalhe da tarefa, Observações, Histórico, Matriz de Eisenhower, Notas, Busca, Configurações, Perfil, carregamento, erro e 404.

Comportamento por largura:

| Largura | Navegação | Painel do workspace | Lista de tarefas |
|---|---|---|---|
| ≥ 1100 px | Trilho lateral de 92 px | Fixo, recolhível (preferência salva) | Seis colunas |
| 900–1099 px | Trilho lateral | Fixo, recolhível | Seis colunas compactas; abaixo de 1024 px sai a data de criação |
| 768–899 px | Trilho lateral | Gaveta sobre o conteúdo | Cinco colunas |
| < 768 px | Drawer aberto pelo botão de menu do cabeçalho; nada fica na tela por padrão (substituiu a barra inferior em 11/11/2026) | Dentro do mesmo drawer, com o seletor de workspaces | Cartões |

## 5. Melhorias de usabilidade

- O painel responde, nesta ordem, ao que é prioritário, ao que está em andamento, ao que foi atualizado e ao que foi concluído.
- Status, atraso e quadrantes têm cor própria e sempre um texto ou ícone junto: nada depende só de cor.
- Dentro de um workspace o nome dele é o título; a seção desce um nível.
- Campos e botões têm 36 px (44 px em telas de toque e no acesso); texto de campo com 16 px no celular evita o zoom do iOS.
- Estados vazios, de erro, de sucesso e de carregamento usam os mesmos componentes em todas as telas.
- Visitantes veem o produto e podem trocar o idioma antes de criar a conta.

## 6. Validação executada

Ambiente: Windows 10, Node 24.20, Next.js 16.4.1, Supabase local em Docker, Microsoft Edge (Chromium) via Playwright, contas temporárias criadas e removidas pelos testes. As suítes de navegador foram executadas contra o build de produção (`next build` + `next start`).

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` | Sem erros |
| `vitest run` | 42 testes aprovados em 8 arquivos |
| `next build` | Aprovado |
| `scripts/test-database.mjs` | Aprovado |
| `pnpm test:integration` | Aprovado |
| `pnpm test:desktop` (sem alterações no script) | 22 verificações aprovadas, incluindo cinco resoluções desktop, 200% de zoom e axe em 11 telas |
| `pnpm test:notes` (sem alterações no script) | 12 verificações aprovadas |
| `pnpm test:responsive` (novo) | 8 verificações aprovadas |
| Prettier nos arquivos alterados | Aprovado |

`test:responsive` cobre: landing e doze telas autenticadas em 375, 768, 1024 e 1440 px sem rolagem horizontal nem conteúdo cortado (52 capturas em `test-results/responsive/`); 40 auditorias axe-core (WCAG 2.0/2.1/2.2 A e AA) sem violações; link "Ir para o conteúdo" como primeira parada do teclado; ações do cabeçalho da landing trocando o formulário e focando o campo; troca de idioma sem sessão; navegação inferior com cinco alvos de pelo menos 44 px; menu da conta por teclado; gaveta do workspace em 375 e 768 px; criação de tarefa com prioridade e Check In no celular, com persistência conferida no banco; ausência de erros de console e de respostas HTTP ≥ 400.

Medição do próprio navegador na landing, build de produção, máquina local sem limitação de rede ou CPU: LCP entre 96 e 144 ms em duas execuções e CLS de 0. Imagens servidas em WebP entre 9 e 35 KB. Esses números não são uma pontuação do Lighthouse.

## 7. Limitações e pendências

- **Lighthouse não foi executado.** A ferramenta não está instalada no projeto e não foi baixada. As metas de 90 em desempenho e acessibilidade não estão comprovadas; há apenas a medição local acima e as auditorias axe.
- **Contraste sobre gradientes**: o axe marcou a regra `color-contrast` como "revisão manual" em elementos sobre fundo translúcido ou com gradiente. Os pares de cor dos tokens foram calculados (todos ≥ 4,5:1 para texto), mas não houve conferência com leitor de tela nem com usuários.
- **A landing é renderizada no cliente** depois da checagem de sessão, como já acontecia com a tela de acesso. Isso limita SEO e o LCP em redes lentas. Servi-la pelo servidor exige sessão em cookie (`@supabase/ssr`), uma mudança de arquitetura fora deste escopo.
- **Fechamento de modal sem animação**: a abertura é animada; o fechamento é imediato porque os modais são desmontados pelo componente pai.
- **Confirmações com `prompt()`/`confirm()` do navegador** permanecem na exclusão de workspace, de conta e de observação. Trocá-las pelo `ConfirmDialog` altera os testes existentes.
- **Capturas da landing no celular**: a visão geral é a janela inteira reduzida e fica pouco legível em 375 px.
- ~~Sem tema escuro.~~ Implementado em 11/11/2026 (Claro, Escuro e Sistema); ver [MOBILE-THEMES.md](MOBILE-THEMES.md).
- **Testado apenas em Chromium.** Safari e Firefox não foram verificados; `:has()` e `mask` têm suporte amplo, mas sem evidência local.
- **Ativos sem uso**: `public/images/ocean-depths.png` e `.webp` não são mais referenciados e foram mantidos.
- **Cores de avatar** (`#0353a4` padrão) pertencem aos dados do usuário e não foram migradas para a nova paleta.
- **Símbolo da marca** continua sendo o PNG original, com os azuis anteriores.

## 8. Recomendações

1. Rodar Lighthouse (mobile e desktop) na landing e no painel, em produção, e registrar os números.
2. Capturas dedicadas para celular na landing (`<picture>` com recorte vertical).
3. Substituir `prompt()`/`confirm()` por diálogos do sistema, atualizando as suítes.
4. Teste de usabilidade com cinco pessoas sobre a hierarquia do painel e a navegação no celular.
5. Avaliar sessão em cookie para servir a landing estaticamente a visitantes.
6. Versão vetorial do símbolo com o azul Royal.
7. Verificação manual em Safari iOS e com VoiceOver/NVDA.

## Manutenção

- Novas cores, tamanhos ou espaçamentos entram primeiro em `tokens.css`. Cores têm valor claro e escuro; o bloco escuro é declarado duas vezes e `pnpm test` confere que são iguais e que o contraste se mantém.
- `pnpm capture:landing` refaz as capturas da landing depois de mudanças visuais (requer `pnpm local:setup` e o app em execução).
- `pnpm test:responsive` deve passar antes de publicar mudanças de layout.
- Os pontos de 767 px (celular) e 899 px (painel sobre o conteúdo) existem em `shell.css` e em `desktop-shell.tsx` (`phoneQuery`, `compactQuery`); altere os dois juntos.
