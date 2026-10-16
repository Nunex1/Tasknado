# Histórico da identidade oceânica

A marca descrita abaixo foi substituída pela identidade oficial. Consulte [BRAND_IDENTITY.md](BRAND_IDENTITY.md).

# Identidade oceânica

Pedido do usuário: melhorar o design, trazer a aparência dos mares para a tela e incluir um símbolo de tubarão-martelo.

## Alterações

- Fundo fotográfico submarino gerado para o projeto: raios de luz, textura de água e azul profundo. O arquivo usado pela interface é `public/images/ocean-depths.webp`, 1536 × 1024, 175.342 bytes. A versão PNG de origem também foi preservada.
- Marca vetorial de tubarão-martelo vista de cima, compartilhada pelo login e sidebar. Versões SVG para máscaras e favicon; ícone PNG de 180 px para dispositivos Apple.
- Tela de acesso com título mais amplo, painel translúcido escuro, hierarquia tipográfica revisada e separação clara entre identidade e formulário.
- Mar também aplicado ao fundo dos workspaces, com superfícies de conteúdo mais opacas para leitura.
- Regras responsivas para telas menores, campos de 16 px em celular e tema sem animação contínua.
- Nenhuma alteração de regras de autenticação, dados, atividades, notas ou arquivos.

## Validação desta alteração

- TypeScript e build Next.js passaram.
- A página e os arquivos visuais respondem na verificação HTTP local.
- A inspeção visual automatizada do novo layout não pôde ser concluída: a aba de prévia estava em uma página interna `data:` de erro de conexão, bloqueada pela política de URLs do navegador. Não foi usada outra ferramenta de controle para contornar o bloqueio.
- As capturas anteriores em `test-results/access-desktop.jpg` mostram o visual anterior, não esta alteração.
- Ainda é necessário inspecionar visualmente esta versão em desktop e celular; não confundir as regras responsivas implementadas com validação visual concluída.

