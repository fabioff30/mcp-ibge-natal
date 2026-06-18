# Natal IBGE MCP Server

O **Natal IBGE MCP Server** é um servidor implementado seguindo o padrão **Model Context Protocol (MCP)** da Anthropic. Ele disponibiliza a modelos de Inteligência Artificial (como Claude, GPT-4o, Gemini, etc.) acesso estruturado e direto a dados oficiais do **Censo Demográfico 2022** e do **PIB** para a cidade de **Natal (RN)** — código IBGE **2408102**.

O servidor combina consultas dinâmicas às APIs públicas agregadas do IBGE/SIDRA com dados extremamente granulares a nível de bairros fornecidos por planilhas locais preprocessadas, tornando-se uma ferramenta indispensável para análises econômicas, demográficas e habitacionais da capital potiguar.

---

## Requisitos

- [Node.js](https://nodejs.org/) (Versão recomendada: >= 18)
- NPM (incluso com o Node)

---

## Instalação e Configuração

### 1. Clonar e Instalar o Servidor

Clone este repositório no seu computador e instale as dependências:

```bash
git clone <url-do-repositorio>
cd mcp-ibge-natal
npm install
npm run build
```

### 2. Adicionar ao Claude Desktop

Abra o arquivo de configuração do seu Claude Desktop (`claude_desktop_config.json`). No macOS, ele fica em:
`~/Library/Application Support/Claude/claude_desktop_config.json`

Adicione a seguinte configuração no objeto `"mcpServers"`:

```json
{
  "mcpServers": {
    "mcp-ibge-natal": {
      "command": "node",
      "args": ["/Users/fabiofariasfigueiroa/Desktop/mcp-ibge-natal/build/index.js"]
    }
  }
}
```

### 3. Adicionar ao Cursor IDE

1. Abra o Cursor e vá nas configurações (`Settings` -> `Features` -> `MCP`).
2. Clique em **+ Add New MCP Server**.
3. Configure os seguintes valores:
   - **Name**: `mcp-ibge-natal`
   - **Type**: `stdio`
   - **Command**: `node "/Users/fabiofariasfigueiroa/Desktop/mcp-ibge-natal/build/index.js"`
4. Clique em **Save**.

---

## Atualizar dados por bairro

Os arquivos CSV em `data/` são gerados a partir de uma planilha pública do Google Sheets, utilizando o script de extração disponível no projeto:

```bash
python3 scripts/extract_natal_bairros.py
```

> Requer Python 3 instalado na máquina.

Como os dados são provenientes do **Censo 2022** (estáticos), não é necessário rodar o script novamente a menos que a planilha-fonte seja atualizada. Execute-o apenas quando houver uma nova versão dos dados de origem.

---

## Ferramentas Disponíveis (MCP Tools)

| Nome da Ferramenta | Descrição | Parâmetros |
| --- | --- | --- |
| `get_total_population` | População total residente de Natal (Censo 2022). | Nenhum |
| `get_population_by_age_group` | Pirâmide/faixa etária com proporção (%) por faixa. | Nenhum |
| `get_population_history` | Série histórica das estimativas populacionais. | Nenhum |
| `get_gdp_pib` | PIB a preços correntes de Natal (2022). | Nenhum |
| `compare_gdp_neighbors` | Comparativo de PIB: Natal vs. Parnamirim, São Gonçalo do Amarante e Mossoró. | Nenhum |
| `get_average_income` | Renda nominal média e mediana mensal dos trabalhadores (Censo 2022). | Nenhum |
| `get_households_count` | Total de domicílios particulares permanentes ocupados. | Nenhum |
| `get_density_area` | Área territorial (km²) e densidade demográfica (hab/km²). | Nenhum |
| `get_city_sanitation` | Panorama do esgotamento sanitário do município. | Nenhum |
| `get_literacy_rate` | Taxa de alfabetização das pessoas de 15+ anos (Censo 2022). | Nenhum |
| `list_neighborhoods` | Lista os 36 bairros com população, área, densidade e moradores/dom. | Nenhum |
| `get_neighborhood_demographics` | Demografia e ocupação de domicílios de um bairro. | `query` (nome ou código) |
| `get_neighborhood_sanitation` | Detalhamento do esgotamento e % de adequação por bairro. | `query` (nome ou código) |
| `compare_neighborhoods` | Tabelas comparativas lado a lado entre bairros. | `bairros` (array, mín. 2) |

---

## Exemplos de Perguntas

Depois de configurar o servidor MCP, você pode conversar com o assistente e fazer perguntas como:

- *"Qual o PIB de Natal comparado a Parnamirim, São Gonçalo do Amarante e Mossoró?"*
- *"Como é a pirâmide etária de Natal?"*
- *"Qual a taxa de alfabetização de Natal?"*
- *"Quais os 3 bairros mais populosos de Natal e suas densidades?"*
- *"Compare o saneamento (esgotamento adequado) entre Pajuçara e Lagoa Azul."*
- *"Qual a média de moradores por domicílio no bairro Petrópolis?"*

---

## Estrutura de Pastas

```
├── data/
│   ├── bairros_natal.csv                  # Dados demográficos locais por bairro
│   └── esgotamento_por_bairro_natal.csv   # Dados de esgoto locais por bairro
├── scripts/
│   ├── extract_natal_bairros.py           # Script de extração dos dados da planilha
│   └── verify.js                          # Script de verificação dos dados
├── src/
│   └── index.ts                           # Implementação principal do servidor MCP (TypeScript)
├── build/
│   └── index.js                           # Servidor compilado (JavaScript executável)
├── package.json                           # Dependências e scripts do projeto
├── tsconfig.json                          # Configuração do compilador TypeScript
└── README.md                              # Documentação de referência
```

---

## Licença

Este projeto está licenciado sob a licença MIT. Desenvolvido para facilitar o acesso à informação pública e fomentar a cultura de Letramento de Dados.
