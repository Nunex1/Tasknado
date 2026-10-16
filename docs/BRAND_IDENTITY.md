# Identidade oficial Tasknado — 16/10/2026

## Implementação

- Fontes fornecidas preservadas em `docs/brand-sources/`.
- PNGs transparentes derivados das referências em `public/brand/`. Não são vetores; não há reconstrução da tipografia com fonte.
- `BrandLogo`, `BrandSymbol` e `BrandWordmark` em `src/components/brand.tsx`.
- Tamanhos `sm`, `md` e `lg`; composições horizontal, vertical e compacta.
- A máscara alfa da tipografia é compartilhada: `tone="white"` usa `--text`, `tone="blue"` usa `--primary` (#0466c8), sem duplicar o desenho.
- Símbolo solicitado com os azuis existentes (#001233, #001845, #002855, #023e7d, #0353a4, #0466c8), branco e realces #b8e0ff. O PNG contém gradações e antialiasing; não é uma imagem de cores indexadas. A adaptação por imagem generativa não comprova identidade pixel a pixel com as fontes.
- Nenhum PRD separado encontrado; os tokens existentes foram mantidos como referência.
- Autenticação em todos os modos, sidebar compartilhada entre as telas, abertura, erro, boas-vindas e retomada usam os novos elementos.
- Favicon de 32 e 192 px e Apple Touch de 180 px usam somente o símbolo.
- Silhuetas SVG antigas removidas. Textos informativos, fluxos, persistência e regras de negócio preservados.

## Verificação

- TypeScript sem erros, 2 testes existentes aprovados e build de produção aprovado.
- Tela de acesso inspecionada no navegador em desktop e viewport de 390 × 844. Sem overflow horizontal (clientWidth e scrollWidth: 375 px).
- Imagens carregadas, transparência e proporções conferidas visualmente.
- Componentes reais renderizados em prancha de revisão: sidebar de 220 px, fundo claro, vertical e compacta.
- Evidências: `test-results/brand/login-desktop.jpg`, `login-mobile.jpg` e `variants.jpg`.
- `node scripts/brand-review.cjs` gera uma prancha temporária em `public/brand-review.html`; remover após a conferência.
- O ambiente não tem Supabase configurado. A inspeção autenticada das telas e os testes de integração com dados reais continuam pendentes. A atualização dessas telas foi conferida pelo uso dos componentes e estilos compartilhados.
