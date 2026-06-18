# MCP IBGE Natal — Design

**Data:** 2026-06-18
**Autor:** Fabio Farias Figueirôa (assistido por Claude)
**Status:** Aprovado para implementação

## Objetivo

Transformar a planilha `endpoints_api_ibge_natal.xlsx` (endpoints públicos do IBGE/SIDRA) e o
descritivo por bairro (Google Sheets) em um **servidor MCP** que dá a assistentes de IA acesso
estruturado a dados do Censo 2022, PIB e estimativas populacionais de **Natal (RN)**.

O projeto espelha fielmente o servidor irmão já existente
`~/Desktop/MCP IBGE Mossoró` (mcp-ibge-mossoro), trocando os parâmetros para Natal.

## Decisões (confirmadas com o usuário)

- **Runtime:** TypeScript + `@modelcontextprotocol/sdk` (igual ao Mossoró). Transporte **stdio**.
- **Estratégia de dados:** **híbrida** — 10 tools chamam a API do IBGE ao vivo; 4 tools leem CSVs locais (Censo por bairro, dado estático).
- **Escopo:** as 13 tools do Mossoró + 1 tool extra `get_literacy_rate` (endpoint 4.1 da planilha) = **14 tools**.
- **Local/entrega:** criar em `~/Desktop/mcp-ibge-natal`; `git init`, testar localmente, depois commit e push para um **novo repositório público**.

## Arquitetura

Servidor MCP single-file em `src/index.ts` (classe `NatalMcpServer`), idêntico em estrutura ao Mossoró:

- `ListToolsRequestSchema` → declara as 14 tools.
- `CallToolRequestSchema` → `switch(name)` com um case por tool.
- `fetchJson(url)` → wrapper de `fetch` com header `User-Agent` (exigido pela API do IBGE) + checagem de status.
- `parseCSV(path)` → parser CSV simples (com suporte a aspas) para os dados de bairro.
- Transporte: `StdioServerTransport`.

Código IBGE de Natal: **2408102** | UF RN: **24**.

### Estrutura de pastas

```
mcp-ibge-natal/
├── data/
│   ├── bairros_natal.csv                 # 36 bairros: pop, área, densidade, domicílios
│   └── esgotamento_por_bairro_natal.csv  # esgotamento por bairro + % adequado
├── scripts/
│   └── extract_natal_bairros.py          # baixa as 2 abas do Google Sheet → CSVs normalizados
├── src/
│   └── index.ts                          # servidor MCP
├── build/
│   └── index.js                          # compilado (gerado por `npm run build`)
├── endpoints_api_ibge_natal.xlsx         # já presente (fonte dos endpoints)
├── package.json
├── tsconfig.json
├── .gitignore                            # node_modules, build opcional
└── README.md
```

## Tools (14)

### Live IBGE API (10)

| Tool | Endpoint (agregado / variável) | Observação Natal |
|---|---|---|
| `get_total_population` | 9514 / 93 | esperado ≈ 751.300 hab |
| `get_population_by_age_group` | 9514 / 93 + classif. 2[6794]\|287[...] | pirâmide quinquenal |
| `get_population_history` | 6579 / 9324 (`/periodos/-6`) | 2018–2021, 2024–2025 (faltam 2022/2023) |
| `get_gdp_pib` | 5938 / 37 | ≈ R$ 27,5 bi |
| `compare_gdp_neighbors` | 5938 / 37 — `N6[2408102,2403251,2412005,2408003]` | Natal, Parnamirim, São Gonçalo do Amarante, Mossoró |
| `get_average_income` | 10280 / 13536\|13537 | média R$ 3.331,36 / mediana R$ 1.400,00 |
| `get_households_count` | 4712 / 381 | ≈ 270.045 domicílios |
| `get_density_area` | 4714 / 614\|6318 | ≈ 4.488 hab/km² em 167,4 km² |
| `get_city_sanitation` | 6805 / 381 + classif. 11558[all] | panorama de esgotamento do município |
| `get_literacy_rate` *(nova)* | 9543 / 2513 | taxa de alfabetização 15+ ≈ 93,36% |

### Dados locais por bairro (4)

| Tool | Parâmetros | Fonte |
|---|---|---|
| `list_neighborhoods` | — | `bairros_natal.csv` (36 bairros, ordenado por população) |
| `get_neighborhood_demographics` | `query` (nome ou código de 10 dígitos) | `bairros_natal.csv` |
| `get_neighborhood_sanitation` | `query` | `esgotamento_por_bairro_natal.csv` |
| `compare_neighborhoods` | `bairros` (array, mínimo 2) | ambos os CSVs |

As descrições das tools são as do Mossoró com "Mossoró"→"Natal" e "27 bairros"→"36 bairros".

## Pipeline de dados por bairro

A planilha de endpoints aponta o descritivo por bairro para um Google Sheets público
(`12EQIogWde6yLfqpXWp1aI-R_r3fGUik4vBvgXudGeQk`) com 2 abas, exportáveis em CSV:

- Aba **Bairros de Natal** — `gid=1717684106`
  Colunas: Código do bairro, Bairro, Área (km²), População residente, Densidade (hab/km²),
  Domicílios particulares, Ocupados, Uso ocasional, Vagos, % não ocupados, Média moradores/domicílio.
- Aba **Esgotamento** — `gid=1560455754`
  Colunas: Código, Bairro, Rede geral ou pluvial, Fossa séptica ligada à rede,
  Fossa séptica não ligada à rede, Fossa rudimentar ou buraco, Vala, Rio/lago/córrego/mar,
  Outra forma, Sem banheiro/sanitário, Total, % adequado.

O script `scripts/extract_natal_bairros.py`:
1. Baixa cada aba via `https://docs.google.com/spreadsheets/d/<id>/export?format=csv&gid=<gid>`.
2. Pula as 4 linhas de cabeçalho/título de cada aba.
3. **Normaliza o formato brasileiro**: `"10,27"`→`10.27`, `"7.416,8"`→`7416.8`, `"17,2%"`→`0.172`.
4. Grava `data/bairros_natal.csv` e `data/esgotamento_por_bairro_natal.csv` com o **mesmo schema de colunas** que o `index.ts` do Mossoró espera (`codigo_bairro,bairro,area_km2,populacao_residente,densidade_hab_km2,domicilios_particulares_total,domicilios_ocupados,domicilios_uso_ocasional,domicilios_vagos,pct_nao_ocupados,media_moradores_domicilio` e `codigo_bairro,bairro,rede_geral_ou_pluvial,...,total_domicilios_esgotamento,pct_adequado`).

Os CSVs são commitados no repositório (dados estáticos do Censo 2022); o script fica versionado para reprodutibilidade.

## Tratamento de erros

- Cada tool roda dentro de try/catch; em falha retorna `{ content:[{type:"text", text:"Erro..."}], isError:true }`.
- `fetchJson` lança em status != 2xx.
- Tools de bairro retornam mensagem amigável quando o `query` não casa nenhum bairro.

## Estratégia de testes / verificação

1. **Build:** `npm run build` compila sem erros de TypeScript.
2. **Endpoints ao vivo:** rodar cada uma das 10 tools de API e conferir contra os valores "OK" anotados na planilha (ex.: população 751.300; PIB R$ 27,5 bi; renda mediana R$ 1.400; alfabetização 93,36%).
3. **Tools de bairro:** `list_neighborhoods` retorna 36 linhas; `get_neighborhood_demographics`/`get_neighborhood_sanitation` resolvem por nome (ex.: "Pajuçara") e por código (ex.: "2408102034"); `compare_neighborhoods` com ≥2 bairros gera as tabelas lado a lado.
4. **Smoke test MCP:** registrar o servidor e listar/chamar tools via cliente (Claude Desktop/Cursor) ou script de verificação.

## Entrega

1. `git init` + `.gitignore` (node_modules; build opcional).
2. Testar localmente (build + chamadas das tools).
3. Commit inicial e push para um **novo repositório público** dedicado a este MCP.
4. README com instalação, configuração (Claude Desktop / Cursor), tabela das 14 tools e exemplos de perguntas — espelhando o README do Mossoró.

## Fora de escopo (YAGNI)

- Parametrizar o município (servidor é específico de Natal, como o do Mossoró).
- Camada de cache persistente para a API (o Censo é estável; estimativas/PIB ao vivo bastam).
- Transporte HTTP/SSE (stdio atende o uso local em Claude Desktop/Cursor).
- Tool da referência visual 5.1 (página web do Cidades@, não é API/JSON).
