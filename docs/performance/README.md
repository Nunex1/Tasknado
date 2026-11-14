# Evidências locais de desempenho

Capturas com dados sintéticos e serviços locais, realizadas em 14/11/2026. O relatório principal é [PERFORMANCE-OPTIMIZATION.md](../PERFORMANCE-OPTIMIZATION.md).

| Arquivo                              | Conteúdo                                                                                                                                                      |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `browser-benchmarks.json`            | Percursos antes/depois, pedidos REST, DOM, heap, trabalho CDP e observações das APIs de performance do navegador. O cenário inicial de 10.000 não terminou.   |
| `postgres.json`                      | Planos completos `EXPLAIN (ANALYZE, BUFFERS)` sob RLS, ensaio de pg_trgm e contagem de escritas evitadas.                                                     |
| `export.json`                        | Comparação dos exportadores sobre os mesmos registros reais de teste e atraso explícito de 100 ms por pedido; integridade de cada linha/campo.                |
| `bundles.json`                       | Resumo dos grafos efetivamente produzidos por `next analyze export`, com os módulos síncronos alcançados por `App`. Não inclui os grafos brutos de vários MB. |
| `assets.json`                        | Dimensões, bytes e igualdade de RGB visível/alfa em relação ao original redimensionado.                                                                       |
| `budgets.json`                       | JS referenciado pelo HTML de produção, gzip calculado, ativos e categorias de cache/CSP.                                                                      |
| `acceptance.json`                    | Grupos de aceitação de UI, autenticação, banco, isolamento, concorrência, exportação e persistência.                                                          |
| `static-analysis.json`, `audit.json` | Escopo e resultados das quatro regras Semgrep e da auditoria de dependências.                                                                                 |

Os arquivos preservam observações de execuções identificadas, não garantias de produção. Reexecutar os scripts escreve novos resultados em `test-results/`; não modifica estas capturas históricas automaticamente. Métricas do navegador incluem as atualizações intervenientes de framework e navegação da principal, conforme explicado no relatório. Não existem tokens, credenciais, e-mails de usuários ou conteúdo real de produção nestas evidências.

Reprodução: build local + Supabase com as migrações, `TASKNADO_TEST_URL` apontando para esse build, seguido de `pnpm performance:benchmark after`, `pnpm test:performance`, `pnpm performance:export`, `pnpm performance:analyze` e `pnpm performance:budget`. O comparativo de exportação usa `git show 44633c6:src/lib/export-data.ts`; esse commit precisa existir no clone. Os testes de aceitação de navegador usam Edge/Playwright e usuários temporários. Pré-requisitos e limitações adicionais estão no relatório principal.
