# Experiência mobile first e temas — entrega de 11/11/2026

Continuação do [Tasknado Design System](DESIGN-SYSTEM.md). Esta entrega acrescenta a navegação para celular, a troca de workspace a partir de qualquer tela e os temas claro, escuro e do sistema. Nenhum schema, migration, política RLS, endpoint, fluxo de autenticação ou regra de negócio foi alterado; nenhuma dependência foi adicionada.

## 1. Resumo

- **Celular (até 767 px)**: nenhuma navegação fica na tela. O cabeçalho de 56 px tem o botão de menu, o lugar atual (workspace e módulo, ou a seção) e a ação principal da tela. Todo o resto abre em um drawer sobre o conteúdo. A barra inferior foi removida.
- **Troca de workspace**: no drawer (celular) e no cabeçalho (tablet e desktop), de qualquer tela, mantendo o módulo em que a pessoa está.
- **Temas**: Claro, Escuro e Sistema, com a mesma folha de componentes. A escolha persiste no navegador e é aplicada antes da primeira pintura.
- **Tarefas no celular**: cartões enxutos, filtros de categoria recolhidos atrás de "Filtros", formulários como folha inferior com as ações fixas.
- **Landing**: capturas reais também no tema escuro; a página mostra as do tema ativo.

## 2. Componentes criados

| Arquivo | Papel |
|---|---|
| `src/lib/theme.ts` | Preferência de aparência: leitura, validação, aplicação no documento e o script que roda no `<head>` |
| `src/lib/theme-provider.tsx` | `ThemeProvider` e `useTheme()` (modo escolhido, tema resolvido, erro de armazenamento) |
| `src/components/theme.tsx` | `ThemeControl` (grupo de rádios Claro/Escuro/Sistema) e `ThemeSettings` (painel em Configurações) |
| `src/components/nav-drawer.tsx` | Drawer de navegação do celular, sobre o `Dialog` do Radix já usado nos modais |
| `src/components/workspace-switcher.tsx` | `WorkspaceOptions` (lista de workspaces como links) e `WorkspaceSwitcher` (controle do cabeçalho) |
| `src/components/nav-items.ts` | Módulos do workspace e destinos globais, compartilhados entre trilho, painel e drawer |
| `src/lib/theme.test.ts`, `src/styles/tokens.test.ts` | Testes unitários do tema, da troca de workspace e do contraste dos tokens |

Componentes de estilo novos: `.segmented` (controle segmentado), `.workspace-switch`/`.workspace-popover`/`.workspace-option`, `.nav-drawer` e partes, `.header-title`/`.header-action`, folha inferior (`.modal` em telas estreitas), `.filter-toggle`.

## 3. Componentes modificados

| Arquivo | Mudança |
|---|---|
| `src/components/desktop-shell.tsx` | Três layouts escolhidos por `matchMedia` (celular, tablet, desktop); cabeçalho do celular; drawer; seletor de workspace no cabeçalho; anúncio da troca de workspace para leitores de tela |
| `src/components/app.tsx` | Ação principal da tela enviada ao cabeçalho do celular; painel Aparência em Configurações; filtros de categoria recolhíveis; cabeçalho do workspace reduzido fora da visão geral |
| `src/components/profile-menu.tsx` | Aparência no menu da conta, como `menuitemradio`, na ordem das setas |
| `src/components/ui/dialog.tsx` | Ao fechar, o foco volta ao elemento que abriu o modal quando nenhum outro é indicado |
| `src/components/landing.tsx`, `landing-shots.ts` | Capturas por tema; controle de aparência no rodapé |
| `src/components/notes.tsx`, `workspace-overview.tsx` | Botão de criação marcado para sair do topo da página no celular |
| `src/app/layout.tsx` | Script de tema no `<head>`, `ThemeProvider`, `theme-color` por esquema, `interactive-widget=resizes-content` |
| `src/lib/navigation.ts` | `switchWorkspacePath()` |
| `src/styles/*.css` | Tokens do tema escuro e novos tokens semânticos; estilos acima |
| `scripts/capture-landing.mjs`, `scripts/test-responsive.mjs` | Captura nos dois temas; matriz de testes desta entrega |

## 4. Arquitetura de temas

```
localStorage["tasknado.theme"]  →  "light" | "dark" | "system" (ausente = system)
<head><script>                  →  põe data-theme="light|dark" em <html> antes de <body> existir
tokens.css                      →  :root (claro)
                                   @media (prefers-color-scheme: dark) :root:not([data-theme="light"])
                                   :root[data-theme="dark"]
ThemeProvider                   →  estado, gravação, sincronização entre abas, <meta name="theme-color">
```

- **Sistema não depende de JavaScript**: sem `data-theme`, a folha de estilos segue `prefers-color-scheme` sozinha e acompanha a mudança do dispositivo ao vivo.
- **Sem flash**: a escolha explícita é lida por um script síncrono no `<head>`, como recomenda o guia do Next.js incluído no projeto (`preventing-flash-before-hydration`). O teste confirma que o atributo existe antes de o `<body>` ser analisado.
- **Persistência por navegador, não por conta.** O tema precisa ser conhecido antes da sessão e costuma depender do aparelho; por isso usa `localStorage`, a alternativa mais simples, e não o metadado de usuário usado pelo idioma. Se o armazenamento estiver bloqueado, o tema vale para a sessão e Configurações informa.
- **Tokens semânticos.** Componentes não citam cores. Tokens acrescentados: `--panel` (cartões), `--surface-elevated` e `--surface-elevated-hover` (menus, modais, toasts), `--row-hover`, `--glass`, `--mark`, `--swatch-border`, `--select-chevron`, e a separação entre `--primary` (texto, ícones, bordas, indicadores) e `--primary-fill`/`--primary-fill-hover` (fundo de controles preenchidos com texto branco).
- **O bloco escuro aparece duas vezes em `tokens.css`** (Sistema e escolha explícita). `tokens.test.ts` falha se os dois divergirem.

Paleta escura: fundo `#0B1220`, superfície e cartões `#111827`, superfície elevada `#1E293B`, Primary `#60A5FA`, Primary forte `#93C5FD`, Royal `#678CF8`, preenchimento `#2563EB` (hover `#1D4ED8`), texto `#F8FAFC`, texto secundário `#CBD5E1`, borda `#334155`, borda de controle `#7385A0`. Estados: informação `#93C5FD`, sucesso `#4ADE80`, aviso `#FBBF24`, perigo `#F87171`, cada um com superfície e borda próprias. A paleta clara não mudou.

Onde escolher: Configurações → Aparência (todas as larguras), menu da conta (tablet e desktop), rodapé do drawer (celular) e rodapé da landing.

## 5. Navegação em cada largura

| Largura | Cabeçalho | Navegação global | Workspace |
|---|---|---|---|
| até 767 px | 56 px: menu, lugar atual, pesquisa, ação principal | Drawer, fechado por padrão | No drawer: workspace ativo, seletor, módulos, recentes |
| 768–899 px | 64 px: marca, seletor de workspace, busca, idioma, conta | Trilho de ícones | Painel abre sobre o conteúdo |
| 900 px ou mais | Igual; a palavra TASKNADO aparece a partir de 1024 px | Trilho de ícones | Painel fixo, recolhível (preferência salva) |

Os pontos de 767 e 899 px foram mantidos do redesign anterior em vez dos 639/1023 de referência: a suíte desktop existente exige o painel fixo em 960 px (200% de zoom em Full HD) e as regras de cartões já usavam 767 px. Eles existem em `shell.css` e em `desktop-shell.tsx`; altere os dois juntos.

Drawer do celular:

- abre só pelo botão de menu; fecha com Escape, toque fora, botão Fechar ou ao escolher um destino;
- é um diálogo modal: foco preso dentro, página de fundo fora da árvore de acessibilidade e sem rolagem, foco devolvido ao botão de menu;
- não desloca nem rola o conteúdo; entra em 220 ms e sai em 180 ms, sem animação com movimento reduzido;
- alvos de pelo menos 44 px.

Ação principal no cabeçalho do celular: Nova atividade (Início, visão geral, Tarefas, Matriz), Nova nota (Notas), Criar workspace (Workspaces, Configurações, conta sem workspaces). Nas demais telas não há ação. O botão equivalente no topo da página é ocultado no celular para não duplicar. Um botão flutuante foi descartado: cobriria a lista e os avisos, e o cabeçalho fixo já mantém a ação à mão.

## 6. Seleção de workspaces

- O workspace ativo é o da URL (`/workspaces/<id>/…`); não há estado paralelo. Recarregar a página mantém o contexto.
- A lista vem das linhas que o banco devolveu para a conta. Workspaces arquivados só aparecem quando são o atual.
- `switchWorkspacePath()` decide o destino: mesmo módulo no workspace escolhido (Tarefas, Notas, Observações, Histórico; Matriz só se o destino for da categoria Trabalho), senão a visão geral. "Todos os workspaces" leva às visões globais (`/activities`, `/notes` ou `/`).
- A troca muda apenas o endereço. Os dados continuam vindo das consultas com `workspace_id` e das políticas RLS; nada é filtrado só na tela.
- Depois da troca: título do cabeçalho, lista, contadores e painel atualizados; item marcado com ícone de seleção e `aria-current`; anúncio "Workspace ativo: …" em região `aria-live`.
- Sem workspaces: a lista mostra "Você ainda não tem workspaces." e "Criar workspace"; a tela continua com o estado vazio de boas-vindas.

## 7. Resultado dos testes

Build de produção (`next build` + `next start`), Supabase local, Microsoft Edge (Chromium) via Playwright, em 11/11/2026.

| Verificação | Resultado |
|---|---|
| `tsc --noEmit` | Sem erros |
| `vitest run` | 54 testes em 10 arquivos (12 novos) |
| `next build` | Aprovado |
| `scripts/test-database.mjs` | Aprovado |
| `pnpm test:integration` | Aprovado |
| `pnpm test:desktop` (script sem alterações) | 22 verificações |
| `pnpm test:notes` (script sem alterações) | 12 verificações |
| `pnpm test:responsive` (ampliado) | 13 verificações |

`test:responsive`, por cenário da matriz:

| Cenário | O que foi verificado |
|---|---|
| Celular 375 px | Sem trilho, painel ou drawer na abertura; conteúdo com 375 px; drawer abre, prende o foco, isola a página, não rola nem desloca o conteúdo; fecha com Escape, toque fora e ao navegar; foco volta ao botão; sem animação com movimento reduzido |
| Troca de workspace | Lista igual à dos workspaces da conta; módulo preservado; cabeçalho, lista e contador atualizados; títulos na tela iguais aos devolvidos pela API para aquele workspace; requisições com filtro `workspace_id` |
| Criar e editar tarefa | Folha inferior ocupa a largura e encosta na base; Salvar visível; campo obrigatório vazio é apontado no campo; criação com prioridade, edição, Check In e presença em Prioridades conferidos no banco |
| Tema no celular | Escuro aplica sem mudar endereço, filtro ou lista; após recarregar, `data-theme` existe antes do `<body>`; segue na navegação e em novo contexto do navegador com o mesmo armazenamento; Sistema acompanha o dispositivo |
| Tablet 768 px | Trilho no lugar do drawer; indicadores em três colunas; painel sobre o conteúdo; formulário em diálogo centralizado; troca de workspace pelo cabeçalho e de tema pelo menu da conta |
| Desktop 1440 px | Painel ao lado do conteúdo, recolhível; tabela de seis colunas; seletor de workspace e menu da conta só por teclado; os três modos em Configurações; Claro prevalece sobre dispositivo escuro e sobrevive à recarga |
| Segurança | Workspace de outra conta não aparece nem é oferecido; o endereço direto responde "Workspace indisponível." e nenhuma resposta traz seus dados; leitura, alteração e inserção contra ele são recusadas pelo banco |
| Geral | 76 capturas sem rolagem horizontal; nenhum erro de console e nenhuma resposta HTTP ≥ 400 |

Acessibilidade automática: 68 execuções do axe-core (WCAG 2.0/2.1/2.2 A e AA), 26 delas no tema escuro, sem violações. O teste de tokens calcula 51 pares de cor em cada tema (texto ≥ 4,5:1; bordas de controle, foco e ícones ≥ 3:1).

Medições do navegador, máquina local, sem limitação de rede ou CPU, em duas execuções: LCP da landing de 112 e 120 ms, CLS 0; o toque que abre o drawer levou 48 e 80 ms (Event Timing API, uma amostra por execução). São diagnósticos locais, não medições de campo.

## 8. Problemas encontrados e corrigidos

- **Foco perdido ao fechar o drawer.** O `Dialog` do Radix devolve o foco ao seu próprio gatilho; como o botão de menu fica fora dele, o foco ia para o `<body>`. Corrigido no drawer e, pelo mesmo motivo, nos modais abertos sem elemento de retorno (criar e editar).
- **Realce de linha invisível no escuro**: o hover usava a mesma cor do cartão. Passou a usar `--row-hover`, translúcido.
- **Azul de texto usado como fundo de botão**: no escuro, branco sobre `#60A5FA` ficaria abaixo de 4,5:1. Separado em `--primary` e `--primary-fill`.
- **Seta dos campos de seleção** e **marcação da busca** tinham cor fixa; viraram tokens.
- **Topo das telas de workspace no celular** repetia nome, descrição e botão antes do conteúdo; fora da visão geral, o cabeçalho do app já informa o lugar.
- **Filtros de Tarefas ocupavam a primeira tela inteira no celular**; os de categoria ficam atrás de "Filtros", com contador dos ativos.
- **Cartões de tarefa** mostravam data de atualização e o texto de descrição vazia; agora trazem título, prazo, status, classificação e contagem de observações.
- **Capturas claras na landing escura**: geradas também no tema escuro.
- **Troca de tema em pedaços**: elementos com transição de cor mudavam aos poucos enquanto o restante já tinha mudado. As transições ficam suspensas durante a troca e a página repinta de uma vez.

## 9. Pendências técnicas

- **Lighthouse não foi executado** (não está instalado e não foi baixado). LCP ≤ 2,5 s, INP ≤ 200 ms e CLS ≤ 0,1 não estão comprovados em condições reais; há apenas as medições locais acima.
- **Sem teste em aparelho físico.** Teclado virtual, áreas seguras (`env(safe-area-inset-*)`), gesto de voltar e rolagem com inércia não foram verificados. `interactive-widget=resizes-content` é ignorado pelo Safari do iOS.
- **Somente Chromium.** Safari e Firefox não foram testados.
- **Sem leitor de tela.** A estrutura do drawer foi conferida pelo axe e por asserções de foco e `aria-hidden`, não com VoiceOver, TalkBack ou NVDA.
- **Contraste em revisão manual**: o axe não calcula contraste sobre gradientes, fundos translúcidos e campos com imagem de fundo (271 nós marcados). Os pares de tokens foram calculados, a composição final não.
- **Zoom**: 200% está coberto no desktop pela suíte existente; 400% e ampliação de texto no celular não foram testados.
- **Tema por navegador**: não acompanha a conta em outro aparelho.
- **Fechamento dos modais** continua sem animação; `prompt()`/`confirm()` do navegador continuam em três exclusões e não seguem o tema.
- **Erros de gravação** aparecem no aviso flutuante, não junto ao campo; só a validação do navegador é exibida no campo.
- **Avatares** com as cores padrão escuras têm pouco destaque sobre o fundo escuro; a cor pertence aos dados do usuário.
- **Painel do tablet** (768–899 px) é uma sobreposição simples: fecha com Escape e devolve o foco, mas não prende o foco como o drawer do celular.

## 10. Oportunidades

1. Rodar Lighthouse e medir Web Vitals em produção, com rede e CPU limitadas.
2. Testar em iPhone e Android reais, com VoiceOver e TalkBack.
3. Sincronizar o tema com a conta, mantendo o `localStorage` como cache para a primeira pintura.
4. Unificar o painel do tablet com o drawer do celular.
5. Trocar `prompt()`/`confirm()` pelo `ConfirmDialog` e exibir erros de gravação dentro do formulário.
6. Gesto de arrastar para fechar o drawer e as folhas.
7. Atalho de teclado para o seletor de workspace.
8. Se uma política CSP com nonce for adotada, o script de tema em `layout.tsx` precisa receber o nonce; sem isso, o tema explícito só seria aplicado depois da hidratação.

## Manutenção

- Cor nova entra em `tokens.css` nos três blocos (claro e os dois escuros); `pnpm test` confere igualdade e contraste.
- Mudança visual: `pnpm capture:landing` refaz as 24 capturas (dois idiomas, dois temas).
- `pnpm test:responsive` deve passar antes de publicar mudanças de layout, navegação ou tema.
