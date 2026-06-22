import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { DATA_DIR } from "../config.js";
import type { Company, CompanyId, Contact, Event, Lead, Suppression } from "../types.js";
import type { Store } from "./store.js";

interface Db {
  companies: Record<CompanyId, Company>;
  contacts: Record<string, Contact>;
  leads: Record<CompanyId, Lead>;
  events: Event[];
  suppressions: Record<string, Suppression>;
}

const EMPTY: Db = { companies: {}, contacts: {}, leads: {}, events: [], suppressions: {} };

/**
 * Enkel fil-basert lagring for utvikling. Holder hele databasen i minnet og
 * skriver til disk ved hver endring. Bra nok for titusener av rader; byttes
 * til Postgres når volumet vokser (samme Store-grensesnitt).
 */
export class JsonStore implements Store {
  private path: string;
  private db: Db;

  constructor(file = join(DATA_DIR, "db.json")) {
    this.path = file;
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    this.db = existsSync(file)
      ? { ...EMPTY, ...(JSON.parse(readFileSync(file, "utf8")) as Partial<Db>) }
      : structuredClone(EMPTY);
  }

  private flush(): void {
    writeFileSync(this.path, JSON.stringify(this.db, null, 2));
  }

  async upsertCompany(c: Company): Promise<boolean> {
    const isNew = !this.db.companies[c.id];
    // Bevar opprinnelig sourcedAt ved oppdatering.
    const existing = this.db.companies[c.id];
    this.db.companies[c.id] = existing ? { ...c, sourcedAt: existing.sourcedAt } : c;
    this.flush();
    return isNew;
  }

  async getCompany(id: CompanyId): Promise<Company | undefined> {
    return this.db.companies[id];
  }

  async listCompanies(): Promise<Company[]> {
    return Object.values(this.db.companies);
  }

  async upsertContact(c: Contact): Promise<void> {
    this.db.contacts[c.id] = c;
    this.flush();
  }

  async listContacts(companyId: CompanyId): Promise<Contact[]> {
    return Object.values(this.db.contacts).filter((c) => c.companyId === companyId);
  }

  async upsertLead(l: Lead): Promise<void> {
    this.db.leads[l.companyId] = l;
    this.flush();
  }

  async getLead(companyId: CompanyId): Promise<Lead | undefined> {
    return this.db.leads[companyId];
  }

  async listLeads(stage?: Lead["stage"]): Promise<Lead[]> {
    const all = Object.values(this.db.leads);
    return stage ? all.filter((l) => l.stage === stage) : all;
  }

  async addEvent(e: Event): Promise<void> {
    this.db.events.push(e);
    this.flush();
  }

  async countEvents(type: string, sinceIso: string): Promise<number> {
    return this.db.events.filter((e) => e.type === type && e.at >= sinceIso).length;
  }

  async isSuppressed(emailOrDomain: string): Promise<boolean> {
    const v = emailOrDomain.toLowerCase().trim();
    if (this.db.suppressions[v]) return true;
    const domain = v.includes("@") ? v.split("@")[1] : undefined;
    return domain ? Boolean(this.db.suppressions[domain]) : false;
  }

  async suppress(value: string, reason: string): Promise<void> {
    const v = value.toLowerCase().trim();
    this.db.suppressions[v] = { value: v, reason, at: new Date().toISOString() };
    this.flush();
  }

  async listSuppressions(): Promise<Suppression[]> {
    return Object.values(this.db.suppressions);
  }
}
