import { loadIcp } from "./config.js";
import { enrich } from "./pipeline/enrich.js";
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

async function cmdEnrich(): Promise<void> {
  const store = new JsonStore();
  const limit = Number(arg("limit") ?? 50);
  console.log(`Beriker inntil ${limit} kvalifiserte leads (finner kontakt-e-post)…\n`);
  const res = await enrich(store, limit);
  console.log(`Ferdig.`);
  console.log(`  Behandlet:          ${res.processed}`);
  console.log(`  E-post fra nettside: ${res.found}`);
  console.log(`  Gjettet rolleadresse: ${res.guessed}`);
  console.log(`  Hoppet over:         ${res.skipped}`);
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
    const contacts = await store.listContacts(lead.companyId);
    const email = contacts[0]?.email ?? c.website ?? "—";
    console.log(
      `  [${lead.stage}] ${c.name} (${c.id}) · ${emp} · ${c.postalCity ?? ""} · ${email}`,
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
    case "enrich":
      await cmdEnrich();
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
  npm run enrich -- --limit 50    Finn kontakt-e-post for kvalifiserte leads (steg 2)
  npm run list -- --stage enriched --limit 25
  npm run stats                   Antall leads per steg
`);
  }
}

main().catch((err) => {
  console.error("Feil:", err.message);
  process.exit(1);
});
