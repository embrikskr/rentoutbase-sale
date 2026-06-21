// Domenemodell for salgs-pipelinen.

/** Organisasjonsnummer brukes som unik ID for en bedrift. */
export type CompanyId = string;

export interface Company {
  /** Organisasjonsnummer (9 siffer). */
  id: CompanyId;
  name: string;
  orgForm?: string;
  naceCode?: string;
  naceDescription?: string;
  employees?: number;
  website?: string;
  municipality?: string;
  municipalityCode?: string;
  postalCode?: string;
  postalCity?: string;
  /** Hvor bedriften ble funnet, f.eks. "brreg". */
  source: string;
  /** ISO-tidspunkt for når den ble hentet inn. */
  sourcedAt: string;
}

export type EmailStatus = "unknown" | "guessed" | "verified" | "bounced";

export interface Contact {
  id: string;
  companyId: CompanyId;
  name?: string;
  title?: string;
  email?: string;
  emailStatus: EmailStatus;
  source?: string;
}

/** Stegene en lead beveger seg gjennom i pipelinen. */
export type LeadStage =
  | "sourced" // funnet, ikke vurdert
  | "qualified" // matcher ICP
  | "enriched" // har kontakt/e-post
  | "queued" // klar for utsending
  | "contacted" // e-post sendt
  | "replied" // har svart
  | "meeting_booked" // møte avtalt
  | "won"
  | "lost"
  | "suppressed"; // skal ikke kontaktes

export interface Lead {
  companyId: CompanyId;
  stage: LeadStage;
  /** 0–100, hvor godt den matcher ICP. */
  score?: number;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

/** Hendelseslogg — også grunnlag for GDPR-sporbarhet. */
export interface Event {
  id: string;
  companyId: CompanyId;
  type: string; // "sourced" | "qualified" | "email_sent" | "reply" | "meeting_booked" | "suppressed" ...
  at: string;
  data?: Record<string, unknown>;
}

/** En oppføring på suppression-/reservasjonslista (skal aldri kontaktes). */
export interface Suppression {
  /** E-post eller domene, lowercased. */
  value: string;
  reason: string;
  at: string;
}
