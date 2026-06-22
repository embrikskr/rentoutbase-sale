import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import type { Env } from "../config.js";
import type { Company, Contact } from "../types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..", "..");

export interface Pitch {
  from: { name: string; email: string };
  subject: string;
  body: string;
  unsubscribeText: string;
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

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

/**
 * Bygger en personalisert melding for én lead, med lovpålagt avmelding og
 * fysisk firmaadresse i bunnteksten (markedsføringsloven / e-handelsloven).
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

  return {
    to: contact.email!,
    fromName: pitch.from.name,
    fromEmail: pitch.from.email,
    subject: fill(pitch.subject, vars),
    body: `${fill(pitch.body, vars)}\n${footerLines.join("\n")}`,
  };
}
