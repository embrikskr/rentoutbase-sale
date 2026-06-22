import { randomUUID } from "node:crypto";
import type { Store } from "../store/store.js";
import type { Contact, Lead } from "../types.js";
import {
  domainFromUrl,
  extractEmails,
  guessRoleEmail,
  isRoleAddress,
  rankEmails,
} from "../enrich/email.js";

export interface EnrichResult {
  processed: number;
  found: number; // e-post funnet på nettsiden
  guessed: number; // måtte gjette rolleadresse
  skipped: number; // ingen nettside, suppression, e.l.
}

// Sider vi prøver i tur og orden for å finne kontakt-e-post.
const CANDIDATE_PATHS = ["", "/kontakt", "/kontakt-oss", "/contact", "/om-oss"];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchText(url: string, timeoutMs = 8000): Promise<string | undefined> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "rentoutbase-sale/0.1 (+kontakt: post@rentoutbase.com)" },
      redirect: "follow",
    });
    if (!res.ok) return undefined;
    return await res.text();
  } catch {
    return undefined;
  } finally {
    clearTimeout(t);
  }
}

/** Leter etter en kontakt-e-post på bedriftens nettside. */
async function findEmailOnSite(website: string, domain: string): Promise<string | undefined> {
  const base = website.replace(/\/+$/, "");
  for (const path of CANDIDATE_PATHS) {
    const html = await fetchText(base + path);
    if (!html) continue;
    const ranked = rankEmails(extractEmails(html), domain);
    if (ranked.length > 0) return ranked[0];
    await sleep(150);
  }
  return undefined;
}

/**
 * Steg 2 (Enrich): for hver kvalifisert lead, finn en kontakt-e-post gratis —
 * først ved å skrape nettsiden, ellers ved å gjette rolleadresse fra domenet.
 */
export async function enrich(store: Store, limit = 50): Promise<EnrichResult> {
  const result: EnrichResult = { processed: 0, found: 0, guessed: 0, skipped: 0 };
  const leads = (await store.listLeads("qualified")).slice(0, limit);

  for (const lead of leads) {
    const company = await store.getCompany(lead.companyId);
    if (!company) {
      result.skipped++;
      continue;
    }
    result.processed++;

    let email: string | undefined;
    let status: Contact["emailStatus"] = "verified";
    let foundVia = "kilde";

    if (company.email) {
      // Kilden (f.eks. OSM) ga e-post direkte – ingen skraping nødvendig.
      email = company.email;
    } else if (company.website) {
      const domain = domainFromUrl(company.website);
      if (domain) {
        email = await findEmailOnSite(company.website, domain);
        foundVia = "nettside";
        if (!email) {
          email = guessRoleEmail(domain);
          status = "guessed";
          foundVia = "gjettet";
        }
      }
    }

    if (!email) {
      result.skipped++;
      continue;
    }

    if (await store.isSuppressed(email)) {
      result.skipped++;
      await updateLead(store, lead, "suppressed", "På suppression-lista");
      continue;
    }

    const note = isRoleAddress(email)
      ? undefined
      : "Kun personlig adresse funnet – vær varsom (ePrivacy/GDPR).";

    const contact: Contact = {
      id: randomUUID(),
      companyId: company.id,
      email,
      emailStatus: status,
      source: foundVia,
    };
    await store.upsertContact(contact);

    if (status === "verified") result.found++;
    else result.guessed++;

    await updateLead(store, lead, "enriched", note);
    await store.addEvent({
      id: randomUUID(),
      companyId: company.id,
      type: "enriched",
      at: new Date().toISOString(),
      data: { email, status, source: contact.source },
    });
  }

  return result;
}

async function updateLead(
  store: Store,
  lead: Lead,
  stage: Lead["stage"],
  note?: string,
): Promise<void> {
  await store.upsertLead({
    ...lead,
    stage,
    notes: note ?? lead.notes,
    updatedAt: new Date().toISOString(),
  });
}
