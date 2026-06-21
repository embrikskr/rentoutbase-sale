import type { Company, CompanyId, Contact, Event, Lead, Suppression } from "../types.js";

/**
 * Lagringslag bak et grensesnitt slik at vi kan bytte fra fil-basert
 * JSON (utvikling) til Postgres (produksjon) uten å røre resten av koden.
 */
export interface Store {
  /** Returnerer true hvis bedriften var ny, false hvis den allerede fantes. */
  upsertCompany(c: Company): Promise<boolean>;
  getCompany(id: CompanyId): Promise<Company | undefined>;
  listCompanies(): Promise<Company[]>;

  upsertContact(c: Contact): Promise<void>;
  listContacts(companyId: CompanyId): Promise<Contact[]>;

  upsertLead(l: Lead): Promise<void>;
  getLead(companyId: CompanyId): Promise<Lead | undefined>;
  listLeads(stage?: Lead["stage"]): Promise<Lead[]>;

  addEvent(e: Event): Promise<void>;

  /** True hvis e-post eller dens domene står på suppression-lista. */
  isSuppressed(emailOrDomain: string): Promise<boolean>;
  suppress(value: string, reason: string): Promise<void>;
  listSuppressions(): Promise<Suppression[]>;
}
