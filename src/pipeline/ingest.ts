import { randomUUID } from "node:crypto";
import type { IcpConfig } from "../config.js";
import { sourceCompanies } from "../sources/index.js";
import type { Store } from "../store/store.js";
import type { Company, Lead, LeadStage } from "../types.js";

export interface IngestResult {
  fetched: number;
  added: number;
  qualified: number;
}

/** Enkel ICP-scoring: gir poeng for kontaktinfo og nok ansatte. */
function score(company: Company, icp: IcpConfig): { score: number; qualified: boolean } {
  let s = 50;
  const reqContact = icp.scoring.requireWebsite ?? false;
  const minEmp = icp.scoring.minEmployees ?? 0;

  const contactable = Boolean(company.website || company.email);
  // Ansatt-tall finnes ikke i alle kilder (f.eks. OSM); da gjelder ikke kravet.
  const enoughEmployees = minEmp === 0 || (company.employees ?? 0) >= minEmp;

  if (contactable) s += 25;
  if (company.employees != null && company.employees >= minEmp) s += 25;

  const qualified = (!reqContact || contactable) && enoughEmployees;
  return { score: s, qualified };
}

/**
 * Steg 1–3 i pipelinen: hent bedrifter fra kildene, dedupe mot databasen,
 * scor mot ICP og lagre som leads.
 */
export async function ingest(store: Store, icp: IcpConfig): Promise<IngestResult> {
  const result: IngestResult = { fetched: 0, added: 0, qualified: 0 };

  for await (const company of sourceCompanies(icp.sources)) {
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
