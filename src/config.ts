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

export interface OsmSourceConfig {
  /** ISO 3166-1-landkoder, f.eks. ["DE","FR","NL"]. */
  areas: string[];
  /** OSM-taggene som regnes som relevante bedrifter, f.eks. "amenity=car_rental". */
  selectors: string[];
  maxPerArea: number;
}

export interface IcpConfig {
  name: string;
  description?: string;
  // Minst én kilde må være satt. Brreg er kun for Norge.
  sources: { osm?: OsmSourceConfig; brreg?: BrregSourceConfig };
  scoring: {
    minEmployees?: number;
    /** Krev kontaktinfo (nettside eller e-post) for å regnes som kvalifisert. */
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
  /** Sending skjer kun i timene [start, slutt) lokal tid. */
  sendWindowStart: number;
  sendWindowEnd: number;
  /** Maks antall e-poster per kjøring (kombinert med hyppig cron = jevnt tempo). */
  sendPerRun: number;
}

export function loadEnv(): Env {
  return {
    dailySendLimit: Number(process.env.DAILY_SEND_LIMIT ?? 40),
    companyPostalAddress: process.env.COMPANY_POSTAL_ADDRESS,
    bookingUrl: process.env.BOOKING_URL,
    sendWindowStart: Number(process.env.SEND_WINDOW_START ?? 8),
    sendWindowEnd: Number(process.env.SEND_WINDOW_END ?? 15),
    sendPerRun: Number(process.env.SEND_PER_RUN ?? 5),
  };
}

export const DATA_DIR = join(ROOT, "data");
