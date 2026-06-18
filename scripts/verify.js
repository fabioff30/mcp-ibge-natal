// Integration check: spawn the built server over stdio, list tools, call a
// local tool and a live tool. Run AFTER `npm run build`.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function assert(cond, msg) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exit(1);
  }
  console.log("PASS:", msg);
}

const transport = new StdioClientTransport({ command: "node", args: ["build/index.js"] });
const client = new Client({ name: "verify", version: "1.0.0" }, { capabilities: {} });
await client.connect(transport);

const { tools } = await client.listTools();
assert(tools.length === 16, `expected 16 tools, got ${tools.length}`);
assert(tools.some((t) => t.name === "get_literacy_rate"), "get_literacy_rate present");
assert(tools.some((t) => t.name === "get_neighborhood_income"), "get_neighborhood_income present");
assert(tools.some((t) => t.name === "rank_neighborhoods_by_income"), "rank_neighborhoods_by_income present");

// Local CSV tool (no network)
const list = await client.callTool({ name: "list_neighborhoods", arguments: {} });
const listText = list.content[0].text;
assert(listText.includes("36 bairros"), "list_neighborhoods mentions 36 bairros");
assert(listText.includes("Pajuçara"), "list_neighborhoods includes a known bairro");

// Local lookup by code
const demo = await client.callTool({
  name: "get_neighborhood_demographics",
  arguments: { query: "2408102034" },
});
assert(demo.content[0].text.includes("Pajuçara"), "demographics resolves bairro by code");

// Income: specific bairro (Tirol médio = R$ 12.251,79)
const inc = await client.callTool({
  name: "get_neighborhood_income",
  arguments: { query: "Tirol" },
});
assert(inc.content[0].text.includes("12.251"), "income for Tirol shows R$ 12.251 (médio)");

// Income: ranking top should put Tirol (highest médio) at the top
const rank = await client.callTool({
  name: "rank_neighborhoods_by_income",
  arguments: { order: "top", limit: 3 },
});
assert(rank.content[0].text.includes("Tirol"), "income ranking top includes Tirol");

// list_neighborhoods now carries an income column
assert(/[Rr]enda/.test(listText), "list_neighborhoods includes an income column");

// Live API tool (requires network)
try {
  const pop = await client.callTool({ name: "get_total_population", arguments: {} });
  console.log("LIVE get_total_population ->", pop.content[0].text.split("\n")[0]);
  assert(pop.content[0].text.includes("751.300"), "live population matches 751.300");
} catch (e) {
  console.warn("WARN: live API check skipped (network?):", e.message);
}

await client.close();
console.log("\nAll verification checks passed.");
