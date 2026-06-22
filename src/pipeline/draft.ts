import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR, loadEnv } from "../config.js";
import { loadPitch, renderMessage } from "../engage/template.js";
import type { Store } from "../store/store.js";

export interface DraftResult {
  drafted: number;
  skipped: number;
  outDir: string;
}

/**
 * Steg 3 (Draft): lager ferdige, personaliserte e-postutkast for alle
 * berikede leads og skriver dem til data/outbox/ for gjennomgang. Sender
 * ingenting — det skjer først etter at et menneske har godkjent.
 */
export async function draft(store: Store, limit = 100): Promise<DraftResult> {
  const env = loadEnv();
  const pitch = loadPitch();
  const outDir = join(DATA_DIR, "outbox");
  mkdirSync(outDir, { recursive: true });

  const result: DraftResult = { drafted: 0, skipped: 0, outDir };
  const leads = (await store.listLeads("enriched")).slice(0, limit);

  for (const lead of leads) {
    const company = await store.getCompany(lead.companyId);
    const contact = (await store.listContacts(lead.companyId)).find((c) => c.email);
    if (!company || !contact?.email) {
      result.skipped++;
      continue;
    }
    if (await store.isSuppressed(contact.email)) {
      result.skipped++;
      continue;
    }

    const msg = renderMessage(company, contact, pitch, env);
    const file = join(outDir, `${company.id}.txt`);
    writeFileSync(
      file,
      `Til:      ${msg.to}\nFra:      ${msg.fromName} <${msg.fromEmail}>\nEmne:     ${msg.subject}\n\n${msg.body}\n`,
    );

    await store.upsertLead({ ...lead, stage: "queued", updatedAt: new Date().toISOString() });
    await store.addEvent({
      id: randomUUID(),
      companyId: company.id,
      type: "drafted",
      at: new Date().toISOString(),
      data: { to: msg.to, subject: msg.subject },
    });
    result.drafted++;
  }

  return result;
}
