import { loadIcp } from "./config.js";
import { ingest } from "./pipeline/ingest.js";
import { JsonStore } from "./store/jsonStore.js";
import type { LeadStage } from "./types.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function cmdIngest(): Promise<void> {
  const icp = loadIcp();
  const store = new JsonStore();
  console.log(`Henter inn leads for ICP: "${icp.name}"`);
  console.log(`Næringskoder: ${icp.sources.brreg.naeringskoder.join(", ")}\n`);

  const res = await ingest(store, icp);
  console.log(`\nFerdig.`);
  console.log(`  Hentet fra kilde: ${res.fetched}`);
  console.log(`  Nye bedrifter:    ${res.added}`);
  console.log(`  Kvalifiserte:     ${res.qualified}`);
}

async function cmdList(): Promise<void> {
  const store = new JsonStore();
  const stage = arg("stage") as LeadStage | undefined;
  const limit = Number(arg("limit") ?? 25);
  const leads = await store.listLeads(stage);

  console.log(`${leads.length} leads${stage ? ` i steg "${stage}"` : ""}:\n`);
  for (const lead of leads.slice(0, limit)) {
    const c = await store.getCompany(lead.companyId);
    if (!c) continue;
    const emp = c.employees != null ? `${c.employees} ans.` : "ukjent ant.";
    const web = c.website ?? "—";
    console.log(
      `  [${lead.stage}] ${c.name} (${c.id}) · ${emp} · ${c.postalCity ?? ""} · ${web}`,
    );
  }
  if (leads.length > limit) console.log(`\n  … og ${leads.length - limit} til (bruk --limit).`);
}

async function cmdStats(): Promise<void> {
  const store = new JsonStore();
  const leads = await store.listLeads();
  const byStage = new Map<string, number>();
  for (const l of leads) byStage.set(l.stage, (byStage.get(l.stage) ?? 0) + 1);

  console.log(`Totalt ${leads.length} leads:\n`);
  for (const [stage, n] of [...byStage.entries()].sort()) {
    console.log(`  ${stage.padEnd(16)} ${n}`);
  }
}

async function main(): Promise<void> {
  const cmd = process.argv[2];
  switch (cmd) {
    case "ingest":
      await cmdIngest();
      break;
    case "list":
      await cmdList();
      break;
    case "stats":
      await cmdStats();
      break;
    default:
      console.log(`rentoutbase-sale — salgs-pipeline

Bruk:
  npm run ingest                  Hent inn leads fra Brønnøysund (steg 1–3)
  npm run list -- --stage qualified --limit 25
  npm run stats                   Antall leads per steg
`);
  }
}

main().catch((err) => {
  console.error("Feil:", err.message);
  process.exit(1);
});
