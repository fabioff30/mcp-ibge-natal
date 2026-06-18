#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from "@modelcontextprotocol/sdk/types.js";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths to CSV files (compiled JS is in build/, CSVs are in ../data/)
const CSV_BAIRROS_PATH = path.resolve(__dirname, "..", "data", "bairros_natal.csv");
const CSV_ESGOTAMENTO_PATH = path.resolve(__dirname, "..", "data", "esgotamento_por_bairro_natal.csv");

// Helper to parse CSV simply
function parseCSV(filePath: string): Record<string, string>[] {
  try {
    if (!fs.existsSync(filePath)) {
      console.error(`CSV file not found: ${filePath}`);
      return [];
    }
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.trim().split("\n");
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map(h => h.trim().replace(/^"|"$/g, ""));
    const results: Record<string, string>[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;

      const values: string[] = [];
      let current = "";
      let inQuotes = false;
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === "," && !inQuotes) {
          values.push(current.trim().replace(/^"|"$/g, ""));
          current = "";
        } else {
          current += char;
        }
      }
      values.push(current.trim().replace(/^"|"$/g, ""));

      const row: Record<string, string> = {};
      headers.forEach((h, idx) => {
        row[h] = values[idx] || "";
      });
      results.push(row);
    }
    return results;
  } catch (error) {
    console.error(`Error parsing CSV ${filePath}:`, error);
    return [];
  }
}

// User-Agent required for IBGE calls
const FETCH_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) MCP-Natal-Server/1.0"
};

// Interface for API call wrapper
async function fetchJson(url: string): Promise<any> {
  const response = await fetch(url, { headers: FETCH_HEADERS });
  if (!response.ok) {
    throw new Error(`IBGE API returned status ${response.status}`);
  }
  return response.json();
}

/**
 * Main Server Class
 */
class NatalMcpServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "mcp-ibge-natal",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();

    // Error handling
    this.server.onerror = (error) => console.error("[MCP Error]", error);
  }

  private setupToolHandlers() {
    // 1. List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // DEMOGRAPHICS & POPULATION
          {
            name: "get_total_population",
            description: "Obtém a população total residente de Natal (Censo 2022).",
            inputSchema: { type: "object", properties: {} },
          },
          {
            name: "get_population_by_age_group",
            description: "Obtém a população de Natal desaggregada por faixas etárias (Censo 2022).",
            inputSchema: { type: "object", properties: {} },
          },
          {
            name: "get_population_history",
            description: "Obtém a série histórica de estimativas populacionais de Natal dos últimos anos.",
            inputSchema: { type: "object", properties: {} },
          },
          // ECONOMY & INCOME
          {
            name: "get_gdp_pib",
            description: "Obtém o Produto Interno Bruto (PIB) a preços correntes de Natal (2022).",
            inputSchema: { type: "object", properties: {} },
          },
          {
            name: "compare_gdp_neighbors",
            description: "Compara o PIB de Natal com municípios vizinhos da RM e Mossoró (2022).",
            inputSchema: { type: "object", properties: {} },
          },
          {
            name: "get_average_income",
            description: "Obtém a renda nominal média e mediana mensal do trabalhador de 14 anos ou mais em Natal (Censo 2022).",
            inputSchema: { type: "object", properties: {} },
          },
          // HOUSING & SANITATION
          {
            name: "get_households_count",
            description: "Obtém o número de domicílios particulares permanentes ocupados de Natal (Censo 2022).",
            inputSchema: { type: "object", properties: {} },
          },
          {
            name: "get_density_area",
            description: "Obtém a densidade demográfica (hab/km2) e a área territorial total (km2) de Natal (Censo 2022).",
            inputSchema: { type: "object", properties: {} },
          },
          {
            name: "get_city_sanitation",
            description: "Obtém o panorama geral de cobertura do esgotamento sanitário de Natal (Censo 2022).",
            inputSchema: { type: "object", properties: {} },
          },
          // NEIGHBORHOODS (OFFLINE LOCAL DATA)
          {
            name: "list_neighborhoods",
            description: "Lista todos os 36 bairros de Natal com sua área, população total, densidade demográfica e número de domicílios.",
            inputSchema: { type: "object", properties: {} },
          },
          {
            name: "get_neighborhood_demographics",
            description: "Obtém dados detalhados de demografia e domicílios (ocupados, vagos, uso ocasional) de um bairro específico de Natal.",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Nome do bairro (ex: 'Abolição', 'Centro') ou o código de 10 dígitos do bairro (ex: '2408102010').",
                },
              },
              required: ["query"],
            },
          },
          {
            name: "get_neighborhood_sanitation",
            description: "Obtém o detalhamento completo dos tipos de esgotamento sanitário e porcentagem de adequação de um bairro específico de Natal.",
            inputSchema: {
              type: "object",
              properties: {
                query: {
                  type: "string",
                  description: "Nome do bairro ou código de 10 dígitos.",
                },
              },
              required: ["query"],
            },
          },
          {
            name: "compare_neighborhoods",
            description: "Compara dados demográficos, habitacionais e de saneamento de múltiplos bairros de Natal.",
            inputSchema: {
              type: "object",
              properties: {
                bairros: {
                  type: "array",
                  items: { type: "string" },
                  description: "Lista de nomes ou códigos de bairros para comparação (mínimo 2).",
                },
              },
              required: ["bairros"],
            },
          },
        ],
      };
    });

    // 2. Call tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          // ======================= LIVE API CALLS =======================
          case "get_total_population": {
            const url = "https://servicodados.ibge.gov.br/api/v3/agregados/9514/periodos/2022/variaveis/93?localidades=N6[2408102]";
            const data = await fetchJson(url);
            const val = data[0]?.resultados[0]?.series[0]?.serie?.["2022"] || "N/A";
            return {
              content: [
                {
                  type: "text",
                  text: `**População Residente de Natal (Censo 2022)**: ${Number(val).toLocaleString("pt-BR")} pessoas.\n\n*Fonte: IBGE - Censo Demográfico 2022 (Agregado 9514)*`,
                },
              ],
            };
          }

          case "get_population_by_age_group": {
            const url = "https://servicodados.ibge.gov.br/api/v3/agregados/9514/periodos/2022/variaveis/93?localidades=N6[2408102]&classificacao=2[6794]|287[93070,93084,93085,93086,93087,93088,93089,93090,93091,93092,93093,93094,93095,93096,93097,93098,49108,49109,60040,60041,6653]";
            const data = await fetchJson(url);
            const resultados = data[0]?.resultados || [];

            let mdTable = "| Faixa Etária | População (2022) | Proporção (%) |\n| --- | --- | --- |\n";
            let totalPop = 0;

            // First calculate total to show proportions
            const list = resultados.map((r: any) => {
              const label = Object.values(r.classificacoes.find((c: any) => c.id === "287")?.categoria || {})[0] as string;
              const val = Number(r.series[0]?.serie?.["2022"] || 0);
              totalPop += val;
              return { label, val };
            });

            list.forEach((item: any) => {
              const prop = totalPop > 0 ? ((item.val / totalPop) * 100).toFixed(2) : "0";
              mdTable += `| ${item.label} | ${item.val.toLocaleString("pt-BR")} | ${prop}% |\n`;
            });

            mdTable += `| **Total Analisado** | **${totalPop.toLocaleString("pt-BR")}** | **100.00%** |\n`;

            return {
              content: [
                {
                  type: "text",
                  text: `### Pirâmide/Faixa Etária de Natal (Censo 2022)\n\n${mdTable}\n\n*Fonte: IBGE - Censo Demográfico 2022 (Agregado 9514)*`,
                },
              ],
            };
          }

          case "get_population_history": {
            const url = "https://servicodados.ibge.gov.br/api/v3/agregados/6579/periodos/-6/variaveis/9324?localidades=N6[2408102]";
            const data = await fetchJson(url);
            const series = data[0]?.resultados[0]?.series[0]?.serie || {};

            let mdTable = "| Ano | Estimativa Populacional |\n| --- | --- |\n";
            Object.entries(series)
              .sort(([yearA], [yearB]) => yearA.localeCompare(yearB))
              .forEach(([year, val]) => {
                mdTable += `| ${year} | ${Number(val).toLocaleString("pt-BR")} hab. |\n`;
              });

            return {
              content: [
                {
                  type: "text",
                  text: `### Evolução Populacional de Natal (Estimativas Anuais)\n\n${mdTable}\n\n*Nota: Em anos censitários (ex: 2022), as estimativas podem sofrer correções substanciais baseadas na contagem real.*\n*Fonte: IBGE - Estimativas de População (Agregado 6579)*`,
                },
              ],
            };
          }

          case "get_gdp_pib": {
            const url = "https://servicodados.ibge.gov.br/api/v3/agregados/5938/periodos/2022/variaveis/37?localidades=N6[2408102]";
            const data = await fetchJson(url);
            const valThousandReais = Number(data[0]?.resultados[0]?.series[0]?.serie?.["2022"] || 0);
            const valBillion = (valThousandReais / 1000000).toFixed(2);

            return {
              content: [
                {
                  type: "text",
                  text: `**Produto Interno Bruto (PIB) de Natal (2022)**:\n- R$ ${valThousandReais.toLocaleString("pt-BR")} mil\n- **R$ ${valBillion} bilhões** (PIB a preços correntes).\n\n*Fonte: IBGE - Produto Interno Bruto dos Municípios (Agregado 5938)*`,
                },
              ],
            };
          }

          case "compare_gdp_neighbors": {
            const url = "https://servicodados.ibge.gov.br/api/v3/agregados/5938/periodos/2022/variaveis/37?localidades=N6[2408102,2403251,2412005,2408003]";
            const data = await fetchJson(url);
            const seriesList = data[0]?.resultados[0]?.series || [];

            let mdTable = "| Município | PIB 2022 (Mil R$) | PIB 2022 (Bilhões R$) | Comparativo com Natal |\n| --- | --- | --- | --- |\n";
            let natalPib = 0;

            const list = seriesList.map((s: any) => {
              const name = s.localidade.nome;
              const val = Number(s.serie?.["2022"] || 0);
              if (name.includes("Natal")) natalPib = val;
              return { name, val };
            });

            list.sort((a: any, b: any) => b.val - a.val).forEach((item: any) => {
              const billion = (item.val / 1000000).toFixed(2);
              let ratioStr = "";
              if (natalPib > 0) {
                if (item.name.includes("Natal")) {
                  ratioStr = "Referência (1.0x)";
                } else {
                  const ratio = (item.val / natalPib).toFixed(2);
                  ratioStr = `${ratio}x o PIB de Natal`;
                }
              }
              mdTable += `| ${item.name} | R$ ${item.val.toLocaleString("pt-BR")} | R$ ${billion} | ${ratioStr} |\n`;
            });

            return {
              content: [
                {
                  type: "text",
                  text: `### Comparativo de PIB - Natal vs. Vizinhos da RM & Mossoró (2022)\n\n${mdTable}\n\n*Fonte: IBGE - PIB dos Municípios (Agregado 5938)*`,
                },
              ],
            };
          }

          case "get_average_income": {
            const url = "https://servicodados.ibge.gov.br/api/v3/agregados/10280/periodos/2022/variaveis/13536|13537?localidades=N6[2408102]&classificacao=2[6794]|11913[96165]";
            const data = await fetchJson(url);

            const mediaObj = data.find((v: any) => v.id === "13536");
            const medianaObj = data.find((v: any) => v.id === "13537");

            const mediaVal = Number(mediaObj?.resultados[0]?.series[0]?.serie?.["2022"] || 0);
            const medianaVal = Number(medianaObj?.resultados[0]?.series[0]?.serie?.["2022"] || 0);

            return {
              content: [
                {
                  type: "text",
                  text: `### Rendimento Mensal do Trabalhador em Natal (Censo 2022)\n\nBase: Pessoas de 14 anos ou mais de idade, ocupadas na semana de referência com rendimento.\n\n- **Rendimento Nominal Médio**: R$ ${mediaVal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n- **Rendimento Nominal Mediano**: R$ ${medianaVal.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}\n\n*O rendimento mediano indica que metade dos trabalhadores recebe até R$ ${medianaVal.toLocaleString("pt-BR")}, sendo um forte indicador da realidade distributiva local.*\n*Fonte: IBGE - Censo Demográfico 2022 (Agregado 10280)*`,
                },
              ],
            };
          }

          case "get_households_count": {
            const url = "https://servicodados.ibge.gov.br/api/v3/agregados/4712/periodos/2022/variaveis/381?localidades=N6[2408102]";
            const data = await fetchJson(url);
            const val = data[0]?.resultados[0]?.series[0]?.serie?.["2022"] || "N/A";

            return {
              content: [
                {
                  type: "text",
                  text: `**Domicílios Particulares Permanentes Ocupados em Natal (Censo 2022)**: ${Number(val).toLocaleString("pt-BR")} domicílios.\n\n*Fonte: IBGE - Censo Demográfico 2022 (Agregado 4712)*`,
                },
              ],
            };
          }

          case "get_density_area": {
            const url = "https://servicodados.ibge.gov.br/api/v3/agregados/4714/periodos/2022/variaveis/614|6318?localidades=N6[2408102]";
            const data = await fetchJson(url);

            const densObj = data.find((v: any) => v.id === "614");
            const areaObj = data.find((v: any) => v.id === "6318");

            const density = Number(densObj?.resultados[0]?.series[0]?.serie?.["2022"] || 0);
            const area = Number(areaObj?.resultados[0]?.series[0]?.serie?.["2022"] || 0);

            return {
              content: [
                {
                  type: "text",
                  text: `### Território e Densidade - Natal (RN)\n\n- **Área Territorial**: ${area.toLocaleString("pt-BR")} km²\n- **Densidade Demográfica**: ${density.toLocaleString("pt-BR")} hab/km²\n\n*Fonte: IBGE - Censo Demográfico 2022 (Agregado 4714)*`,
                },
              ],
            };
          }

          case "get_city_sanitation": {
            const url = "https://servicodados.ibge.gov.br/api/v3/agregados/6805/periodos/2022/variaveis/381?localidades=N6[2408102]&classificacao=11558[all]";
            const data = await fetchJson(url);
            const resultados = data[0]?.resultados || [];

            let mdTable = "| Tipo de Esgotamento | Domicílios Ocupados | Proporção (%) |\n| --- | --- | --- |\n";
            let totalDom = 0;

            // Extract the list
            const list = resultados.map((r: any) => {
              const label = Object.values(r.classificacoes[0]?.categoria || {})[0] as string;
              const val = Number(r.series[0]?.serie?.["2022"] || 0);
              return { label, val };
            });

            // Find total
            const totalItem = list.find((item: any) => item.label.toLowerCase() === "total") || { val: 0 };
            totalDom = totalItem.val;

            // Filter out 'Total' for details
            list.filter((item: any) => item.label.toLowerCase() !== "total")
              .sort((a: any, b: any) => b.val - a.val)
              .forEach((item: any) => {
                const prop = totalDom > 0 ? ((item.val / totalDom) * 100).toFixed(2) : "0";
                mdTable += `| ${item.label} | ${item.val.toLocaleString("pt-BR")} | ${prop}% |\n`;
              });

            mdTable += `| **Total Geral de Domicílios** | **${totalDom.toLocaleString("pt-BR")}** | **100.00%** |\n`;

            // Calculate "Adequado" (Rede geral, rede pluvial ou fossa ligada à rede)
            const redeGeralItem = list.find((item: any) => item.label.includes("Rede geral"));
            const redeVal = redeGeralItem ? redeGeralItem.val : 0;
            const pctAdeq = totalDom > 0 ? ((redeVal / totalDom) * 100).toFixed(2) : "0";

            return {
              content: [
                {
                  type: "text",
                  text: `### Cobertura de Esgotamento Sanitário em Natal (Censo 2022)\n\n${mdTable}\n\n- **Esgotamento Sanitário Adequado (Rede geral/pluvial/fossa ligada à rede)**: **${pctAdeq}%** de cobertura.\n\n*Fonte: IBGE - Censo Demográfico 2022 (Agregado 6805)*`,
                },
              ],
            };
          }

          // ======================= LOCAL CSV TOOLS =======================
          case "list_neighborhoods": {
            const bairros = parseCSV(CSV_BAIRROS_PATH);
            if (bairros.length === 0) {
              return {
                content: [{ type: "text", text: "Erro: Não foi possível carregar a lista de bairros local." }],
              };
            }

            let mdTable = "| Código | Bairro | Área (km²) | População | Densidade (hab/km²) | Média Moradores/Dom. |\n| --- | --- | --- | --- | --- | --- |\n";
            bairros
              .sort((a, b) => Number(b.populacao_residente) - Number(a.populacao_residente))
              .forEach((b) => {
                mdTable += `| ${b.codigo_bairro} | ${b.bairro} | ${Number(b.area_km2).toFixed(4)} | ${Number(b.populacao_residente).toLocaleString("pt-BR")} | ${Number(b.densidade_hab_km2).toFixed(2)} | ${b.media_moradores_domicilio} |\n`;
              });

            return {
              content: [
                {
                  type: "text",
                  text: `### Lista de Bairros de Natal (Ordenada por População)\n\nEsta tabela lista os 36 bairros de Natal, que somam **751.300 habitantes** — total que coincide com a população do município no Censo 2022.\n\n${mdTable}\n\n*Fonte: Planilha Local com Dados Preprocessados do Censo 2022*`,
                },
              ],
            };
          }

          case "get_neighborhood_demographics": {
            const query = (args as { query: string }).query.toLowerCase().trim();
            const bairros = parseCSV(CSV_BAIRROS_PATH);

            const b = bairros.find(
              (x) => x.codigo_bairro === query || x.bairro.toLowerCase().includes(query)
            );

            if (!b) {
              return {
                content: [{ type: "text", text: `Bairro '${query}' não encontrado. Use nomes como 'Abolição', 'Centro' ou 'Aeroporto'.` }],
              };
            }

            const pop = Number(b.populacao_residente).toLocaleString("pt-BR");
            const dens = Number(b.densidade_hab_km2).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
            const area = Number(b.area_km2).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
            const totalDom = Number(b.domicilios_particulares_total).toLocaleString("pt-BR");
            const ocup = Number(b.domicilios_ocupados).toLocaleString("pt-BR");
            const ocas = Number(b.domicilios_uso_ocasional).toLocaleString("pt-BR");
            const vagos = Number(b.domicilios_vagos).toLocaleString("pt-BR");
            const pctVagos = (Number(b.pct_nao_ocupados) * 100).toFixed(2);

            return {
              content: [
                {
                  type: "text",
                  text: `### Perfil Demográfico: Bairro **${b.bairro}** (Censo 2022)\n` +
                        `- **Código IBGE**: ${b.codigo_bairro}\n` +
                        `- **Área**: ${area} km²\n` +
                        `- **População Residente**: ${pop} habitantes\n` +
                        `- **Densidade Demográfica**: ${dens} hab/km²\n` +
                        `- **Média de moradores por domicílio**: ${b.media_moradores_domicilio}\n\n` +
                        `#### Estatísticas de Domicílios Particulares:\n` +
                        `- **Total de Domicílios**: ${totalDom}\n` +
                        `  - **Ocupados (Permanentes)**: ${ocup} (${( (Number(b.domicilios_ocupados)/Number(b.domicilios_particulares_total))*100 ).toFixed(1)}%)\n` +
                        `  - **Uso Ocasional**: ${ocas} (${( (Number(b.domicilios_uso_ocasional)/Number(b.domicilios_particulares_total))*100 ).toFixed(1)}%)\n` +
                        `  - **Vagos**: ${vagos} (${( (Number(b.domicilios_vagos)/Number(b.domicilios_particulares_total))*100 ).toFixed(1)}%)\n` +
                        `- **Percentual de Domicílios Não-Ocupados**: **${pctVagos}%**\n\n` +
                        `*Fonte: Planilha Local / Censo Demográfico 2022*`,
                },
              ],
            };
          }

          case "get_neighborhood_sanitation": {
            const query = (args as { query: string }).query.toLowerCase().trim();
            const esgotamentos = parseCSV(CSV_ESGOTAMENTO_PATH);

            const esg = esgotamentos.find(
              (x) => x.codigo_bairro === query || x.bairro.toLowerCase().includes(query)
            );

            if (!esg) {
              return {
                content: [{ type: "text", text: `Bairro '${query}' não encontrado no banco de esgotamento.` }],
              };
            }

            const pctAdeq = (Number(esg.pct_adequado) * 100).toFixed(2);
            const total = Number(esg.total_domicilios_esgotamento).toLocaleString("pt-BR");

            let mdTable = "| Tipo de Esgotamento | Domicílios | Proporção (%) |\n| --- | --- | --- |\n";
            const keys = [
              { name: "Rede geral ou pluvial", val: Number(esg.rede_geral_ou_pluvial) },
              { name: "Fossa séptica ligada à rede", val: Number(esg.fossa_septica_ligada_rede) },
              { name: "Fossa séptica não ligada à rede", val: Number(esg.fossa_septica_nao_ligada_rede) },
              { name: "Fossa rudimentar ou buraco", val: Number(esg.fossa_rudimentar_ou_buraco) },
              { name: "Vala aberta", val: Number(esg.vala) },
              { name: "Rio/lago/córrego/mar", val: Number(esg.rio_lago_corrego_mar) },
              { name: "Outra forma de descarte", val: Number(esg.outra_forma) },
              { name: "Sem banheiro ou sanitário", val: Number(esg.sem_banheiro_sanitario) },
            ];

            keys.sort((a, b) => b.val - a.val).forEach((k) => {
              const prop = Number(esg.total_domicilios_esgotamento) > 0
                ? ((k.val / Number(esg.total_domicilios_esgotamento)) * 100).toFixed(2)
                : "0";
              mdTable += `| ${k.name} | ${k.val.toLocaleString("pt-BR")} | ${prop}% |\n`;
            });

            return {
              content: [
                {
                  type: "text",
                  text: `### Perfil de Esgotamento Sanitário: Bairro **${esg.bairro}** (Censo 2022)\n\n` +
                        `- **Esgotamento Sanitário Adequado**: **${pctAdeq}%** de cobertura\n` +
                        `- **Total de Domicílios Mapeados**: ${total}\n\n` +
                        `#### Detalhamento da Rede:\n${mdTable}\n` +
                        `*(O esgotamento adequado considera a soma de domicílios ligados à Rede Geral ou Pluvial e Fossa Séptica Ligada à Rede, seguindo a metodologia oficial do IBGE).*\n\n` +
                        `*Fonte: Planilha Local / Censo Demográfico 2022*`,
                },
              ],
            };
          }

          case "compare_neighborhoods": {
            const queryList = (args as { bairros: string[] }).bairros;
            if (!queryList || queryList.length < 2) {
              return {
                content: [{ type: "text", text: "Erro: Insira no mínimo dois bairros para comparação." }],
              };
            }

            const bairrosData = parseCSV(CSV_BAIRROS_PATH);
            const esgotamentoData = parseCSV(CSV_ESGOTAMENTO_PATH);

            const results: any[] = [];

            for (const q of queryList) {
              const qClean = q.toLowerCase().trim();
              const b = bairrosData.find(
                (x) => x.codigo_bairro === qClean || x.bairro.toLowerCase().includes(qClean)
              );
              const esg = esgotamentoData.find(
                (x) => x.codigo_bairro === qClean || x.bairro.toLowerCase().includes(qClean)
              );

              if (b && esg) {
                results.push({ b, esg });
              }
            }

            if (results.length < 2) {
              return {
                content: [{ type: "text", text: `Erro: Não foi possível localizar bairros suficientes no banco de dados para comparação (localizados: ${results.length}).` }],
              };
            }

            let mdDemographics = "| Indicador | " + results.map(r => r.b.bairro).join(" | ") + " |\n";
            mdDemographics += "| --- | " + results.map(() => "---").join(" | ") + " |\n";
            mdDemographics += "| População | " + results.map(r => Number(r.b.populacao_residente).toLocaleString("pt-BR")).join(" | ") + " |\n";
            mdDemographics += "| Área (km²) | " + results.map(r => Number(r.b.area_km2).toFixed(4)).join(" | ") + " |\n";
            mdDemographics += "| Densidade (hab/km²) | " + results.map(r => Number(r.b.densidade_hab_km2).toFixed(2)).join(" | ") + " |\n";
            mdDemographics += "| Média Moradores/Dom | " + results.map(r => r.b.media_moradores_domicilio).join(" | ") + " |\n";
            mdDemographics += "| Domicílios Totais | " + results.map(r => Number(r.b.domicilios_particulares_total).toLocaleString("pt-BR")).join(" | ") + " |\n";
            mdDemographics += "| % Domicílios Não-Ocupados | " + results.map(r => (Number(r.b.pct_nao_ocupados) * 100).toFixed(2) + "%").join(" | ") + " |\n";

            let mdSanitation = "| Indicador de Saneamento | " + results.map(r => r.esg.bairro).join(" | ") + " |\n";
            mdSanitation += "| --- | " + results.map(() => "---").join(" | ") + " |\n";
            mdSanitation += "| % Esgotamento Adequado | " + results.map(r => (Number(r.esg.pct_adequado) * 100).toFixed(2) + "%").join(" | ") + " |\n";
            mdSanitation += "| Rede Geral ou Pluvial (Dom.) | " + results.map(r => Number(r.esg.rede_geral_ou_pluvial).toLocaleString("pt-BR")).join(" | ") + " |\n";
            mdSanitation += "| Fossa Séptica Ligada Rede (Dom.) | " + results.map(r => Number(r.esg.fossa_septica_ligada_rede).toLocaleString("pt-BR")).join(" | ") + " |\n";
            mdSanitation += "| Fossa Rudimentar/Buraco (Dom.) | " + results.map(r => Number(r.esg.fossa_rudimentar_ou_buraco).toLocaleString("pt-BR")).join(" | ") + " |\n";
            mdSanitation += "| Sem Banheiro/Sanitário (Dom.) | " + results.map(r => Number(r.esg.sem_banheiro_sanitario).toLocaleString("pt-BR")).join(" | ") + " |\n";

            return {
              content: [
                {
                  type: "text",
                  text: `### Tabela Comparativa de Bairros de Natal\n\n` +
                        `#### Comparativo Demográfico e Habitacional:\n\n${mdDemographics}\n\n` +
                        `#### Comparativo de Saneamento Básico (Esgotamento):\n\n${mdSanitation}\n\n` +
                        `*Fonte: Planilha Local / Censo Demográfico 2022*`,
                },
              ],
            };
          }

          default:
            throw new McpError(ErrorCode.MethodNotFound, `Tool ${name} not found`);
        }
      } catch (error: any) {
        console.error(`Error executing tool ${name}:`, error);
        return {
          content: [
            {
              type: "text",
              text: `Erro ao executar a ferramenta '${name}': ${error?.message || error}`,
            },
          ],
          isError: true,
        };
      }
    });
  }

  public async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("Natal IBGE MCP Server running on Stdio!");
  }
}

const server = new NatalMcpServer();
server.run().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
