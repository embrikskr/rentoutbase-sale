import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Env } from "../config.js";
import type { Company, Contact } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

export interface Pitch {
  from: { name: string; email: string };
  /** Fallback-emne. Bruk gjerne `subjects` for variasjon. */
  subject: string;
  /** Flere emnelinjer – én velges tilfeldig per e-post. Kan inneholde spintax. */
  subjects?: string[];
  body: string;
  unsubscribeText: string;
  bookingReply: { subject: string; body: string };
}

export function loadPitch(): Pitch {
  const custom = join(ROOT, "config", "pitch.json");
  const example = join(ROOT, "config", "pitch.example.json");
  const path = existsSync(custom) ? custom : example;
  return JSON.parse(readFileSync(path, "utf8")) as Pitch;
}

export interface RenderedMessage {
  to: string;
  fromName: string;
  fromEmail: string;
  subject: string;
  body: string;
}

const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

/** Velger tilfeldig blant spintax-alternativer: "{Hei|Hallo|God dag}". */
function spin(text: string): string {
  return text.replace(/\{([^{}|]+(?:\|[^{}|]+)+)\}/g, (_, group: string) =>
    pick(group.split("|")),
  );
}

/** Setter inn variabler ({{token}}) etter at spintax er løst. */
function render(template: string, vars: Record<string, string>): string {
  return spin(template).replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

/**
 * Bygger en personalisert melding for én lead, med lovpålagt avmelding og
 * fysisk firmaadresse i bunnteksten (markedsføringsregler / GDPR).
 *
 * Emne og tekst varieres (spintax + valg blant `subjects`) slik at ingen to
 * e-poster blir helt like – viktig for å unngå søppelpost-filtrene.
 */
export function renderMessage(
  company: Company,
  contact: Contact,
  pitch: Pitch,
  env: Env,
): RenderedMessage {
  const vars = {
    companyName: company.name,
    city: company.postalCity ?? company.municipality ?? "ditt område",
  };

  const footerLines = [
    "",
    "—",
    pitch.unsubscribeText,
    env.companyPostalAddress ?? "[Sett COMPANY_POSTAL_ADDRESS i .env]",
  ];

  const subjectTemplate =
    pitch.subjects && pitch.subjects.length > 0 ? pick(pitch.subjects) : pitch.subject;

  return {
    to: contact.email!,
    fromName: pitch.from.name,
    fromEmail: pitch.from.email,
    subject: render(subjectTemplate, vars),
    body: `${render(pitch.body, vars)}\n${footerLines.join("\n")}`,
  };
}

/** Bygger svaret med bookinglenke som sendes når noen viser interesse. */
export function renderBookingReply(
  company: Company,
  contact: Contact,
  pitch: Pitch,
  env: Env,
): RenderedMessage {
  const vars = {
    companyName: company.name,
    city: company.postalCity ?? company.municipality ?? "ditt område",
    bookingUrl: env.bookingUrl ?? "[Sett BOOKING_URL i .env]",
  };
  return {
    to: contact.email!,
    fromName: pitch.from.name,
    fromEmail: pitch.from.email,
    subject: render(pitch.bookingReply.subject, vars),
    body: render(pitch.bookingReply.body, vars),
  };
}
