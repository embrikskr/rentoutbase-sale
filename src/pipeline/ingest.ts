import { randomUUID } from "node:crypto";
import type { IcpConfig } from "../config.js";
import { sourceFromBrreg } from "../sources/brreg.js";
import type { Store } from "../store/store.js";
import type { Company, Lead, LeadStage } from "../types.js";

export interface IngestResult {
  fetched: number;
  added: number;
  qualified: number;
}

/** Enkel ICP-scoring: gir poeng for nettside og nok ansatte. */
function score(company: Company, icp: IcpConfig): { score: number; qualified: boolean } {
  let s = 50;
  const reqWebsite = icp.scoring.requireWebsite ?? false;
  const minEmp = icp.scoring.minEmployees ?? 0;

  const hasWebsite = Boolean(company.website);
  const enoughEmployees = (company.employees ?? 0) >= minEmp;

  if (hasWebsite) s += 25;
  if (enoughEmployees) s += 25;

  const qualified = (!reqWebsite || hasWebsite) && enoughEmployees;
  return { score: s, qualified };
}

/**
 * Steg 1–3 i pipelinen: hent bedrifter fra kildene, dedupe mot databasen,
 * scor mot ICP og lagre som leads.
 */
export async function ingest(store: Store, icp: IcpConfig): Promise<IngestResult> {
  const result: IngestResult = { fetched: 0, added: 0, qualified: 0 };

  for await (const company of sourceFromBrreg(icp.sources.brreg)) {
    result.fetched++;
    const isNew = await store.upsertCompany(company);

    const { score: s, qualified } = score(company, icp);
    const stage: LeadStage = qualified ? "qualified" : "sourced";

    if (isNew) {
      result.added++;
      const now = new Date().toISOString();
      const lead: Lead = {
        companyId: company.id,
        stage,
        score: s,
        createdAt: now,
        updatedAt: now,
      };
      await store.upsertLead(lead);
      await store.addEvent({
        id: randomUUID(),
        companyId: company.id,
        type: "sourced",
        at: now,
        data: { source: company.source, qualified, score: s },
      });
    }

    if (qualified) result.qualified++;
  }

  return result;
}
