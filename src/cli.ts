import { loadIcp } from "./config.js";
import { draft } from "./pipeline/draft.js";
import { enrich } from "./pipeline/enrich.js";
import { ingest } from "./pipeline/ingest.js";
import { processReplies } from "./pipeline/replies.js";
import { send } from "./pipeline/send.js";
import { JsonStore } from "./store/jsonStore.js";
import type { LeadStage } from "./types.js";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function cmdIngest(): Promise<void> {
  const icp = loadIcp();
  const store = new JsonStore();
  console.log(`Henter inn leads for ICP: "${icp.name}"`);
  if (icp.sources.osm) console.log(`Land: ${icp.sources.osm.areas.join(", ")}`);
  if (icp.sources.brreg) console.log(`Næringskoder: ${icp.sources.brreg.naeringskoder.join(", ")}`);
  console.log();

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

async function cmdDraft(): Promise<void> {
  const store = new JsonStore();
  const limit = Number(arg("limit") ?? 100);
  console.log(`Lager e-postutkast for berikede leads…\n`);
  const res = await draft(store, limit);
  console.log(`Ferdig.`);
  console.log(`  Utkast laget: ${res.drafted}`);
  console.log(`  Hoppet over:  ${res.skipped}`);
  console.log(`  Mappe:        ${res.outDir}`);
}

async function cmdRun(): Promise<void> {
  const store = new JsonStore();
  const icp = loadIcp();
  const live = hasFlag("live");

  console.log(`=== RentOutBase salgsrutine ===`);
  console.log(`ICP: "${icp.name}" · sending: ${live ? "LIVE" : "tørrkjøring"}\n`);

  console.log("1/5 Henter inn leads…");
  const ing = await ingest(store, icp);
  console.log(`     +${ing.added} nye, ${ing.qualified} kvalifiserte`);

  console.log("2/5 Beriker (finner e-post)…");
  const enr = await enrich(store);
  console.log(`     ${enr.found} fra nettside, ${enr.guessed} gjettet`);

  console.log("3/5 Lager utkast…");
  const dr = await draft(store);
  console.log(`     ${dr.drafted} utkast`);

  console.log("4/5 Behandler svar…");
  const rep = await processReplies(store, { live });
  if (rep.notConfigured) console.log("     (IMAP ikke satt opp – hopper over)");
  else
    console.log(
      `     ${rep.unsubscribed} avmeldt, ${rep.interested} interessert, ${rep.bookingSent} bookinglenker`,
    );

  console.log("5/5 Sender…");
  const sn = await send(store, { live });
  console.log(`     ${live ? "sendt" : "ville sendt"}: ${sn.sent}`);

  console.log(`\nFerdig. Kjør 'npm run stats' for status.`);
}

async function cmdSend(): Promise<void> {
  const store = new JsonStore();
  const live = hasFlag("live");
  if (!live) {
    console.log("TØRRKJØRING (ingenting sendes). Legg til --live for å sende på ekte.\n");
  } else {
    console.log("⚠️  LIVE-SENDING aktivert.\n");
  }
  const res = await send(store, { live });
  console.log(`\nFerdig.`);
  console.log(`  ${live ? "Sendt" : "Ville sendt"}: ${res.sent}`);
  console.log(`  Hoppet over:  ${res.skipped}`);
  if (res.capReached) console.log(`  (Daglig tak nådd – kjør igjen senere.)`);
}

async function cmdReplies(): Promise<void> {
  const store = new JsonStore();
  const live = hasFlag("live");
  console.log(live ? "Behandler svar (LIVE)…\n" : "Behandler svar (tørrkjøring)…\n");
  const res = await processReplies(store, { live });
  if (res.notConfigured) {
    console.log("IMAP er ikke satt opp (IMAP_HOST/USER/PASS i .env). Hopper over.");
    return;
  }
  console.log(`Ferdig.`);
  console.log(`  Hentet:        ${res.fetched}`);
  console.log(`  Matchet lead:  ${res.matched}`);
  console.log(`  Avmeldt:       ${res.unsubscribed}`);
  console.log(`  Ikke interessert: ${res.notInterested}`);
  console.log(`  Interessert:   ${res.interested}`);
  console.log(`  Bookinglenker sendt: ${res.bookingSent}`);
}

async function cmdSuppress(): Promise<void> {
  const store = new JsonStore();
  const value = process.argv[3];
  if (!value) {
    console.error("Bruk: npm run cli -- suppress <e-post-eller-domene> [grunn]");
    process.exit(1);
  }
  const reason = process.argv.slice(4).join(" ") || "manuelt lagt til";
  await store.suppress(value, reason);
  console.log(`La til ${value} på suppression-lista (${reason}). Kontaktes aldri igjen.`);
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
    case "run":
      await cmdRun();
      break;
    case "ingest":
      await cmdIngest();
      break;
    case "enrich":
      await cmdEnrich();
      break;
    case "draft":
      await cmdDraft();
      break;
    case "send":
      await cmdSend();
      break;
    case "replies":
      await cmdReplies();
      break;
    case "suppress":
      await cmdSuppress();
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
  npm start                       Kjør HELE rutinen (ingest→enrich→draft→send, tørr)
  npm start -- --live             Kjør hele rutinen og send på ekte
  npm run ingest                  Hent inn leads fra kilden (OSM/Europa) (steg 1–3)
  npm run enrich -- --limit 50    Finn kontakt-e-post for kvalifiserte leads (steg 2)
  npm run draft                   Lag personaliserte e-postutkast (steg 3 → data/outbox/)
  npm run send                    Tørrkjøring av utsending (viser hva som ville sendt)
  npm run send -- --live          Send på ekte (krever SMTP i .env)
  npm run replies                 Les innboks, respekter STOPP, finn interesserte
  npm run replies -- --live       Samme, og send bookinglenke til interesserte
  npm run cli -- suppress <e-post> [grunn]   Legg til på reservasjonsliste
  npm run list -- --stage enriched --limit 25
  npm run stats                   Antall leads per steg
`);
  }
}

main().catch((err) => {
  console.error("Feil:", err.message);
  process.exit(1);
});
