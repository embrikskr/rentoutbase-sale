import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

export interface BrregSourceConfig {
  naeringskoder: string[];
  kommunenummer: string[];
  fraAntallAnsatte?: number;
  tilAntallAnsatte?: number;
  organisasjonsformer?: string[];
  maxPerNaeringskode: number;
}

export interface IcpConfig {
  name: string;
  description?: string;
  sources: { brreg: BrregSourceConfig };
  scoring: {
    minEmployees?: number;
    requireWebsite?: boolean;
  };
}

/** Leser config/icp.json hvis den finnes, ellers config/icp.example.json. */
export function loadIcp(): IcpConfig {
  const custom = join(ROOT, "config", "icp.json");
  const example = join(ROOT, "config", "icp.example.json");
  const path = existsSync(custom) ? custom : example;
  return JSON.parse(readFileSync(path, "utf8")) as IcpConfig;
}

export interface Env {
  dailySendLimit: number;
  companyPostalAddress?: string;
  bookingUrl?: string;
}

export function loadEnv(): Env {
  return {
    dailySendLimit: Number(process.env.DAILY_SEND_LIMIT ?? 40),
    companyPostalAddress: process.env.COMPANY_POSTAL_ADDRESS,
    bookingUrl: process.env.BOOKING_URL,
  };
}

export const DATA_DIR = join(ROOT, "data");
