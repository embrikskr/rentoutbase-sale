import type { OsmSourceConfig } from "../config.js";
import type { Company } from "../types.js";

const ENDPOINT = "https://overpass-api.de/api/interpreter";

interface OverpassElement {
  type: string;
  id: number;
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements?: OverpassElement[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function normWebsite(w?: string): string | undefined {
  if (!w) return undefined;
  const t = w.trim();
  if (!t) return undefined;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

function buildQuery(area: string, selectors: string[], max: number): string {
  const lines = selectors
    .map((sel) => {
      const [k, v] = sel.split("=");
      return `  nwr["${k}"="${v}"](area.a);`;
    })
    .join("\n");
  return `[out:json][timeout:90];
area["ISO3166-1"="${area}"]->.a;
(
${lines}
);
out tags center ${max};`;
}

function toCompany(el: OverpassElement, area: string): Company | undefined {
  const tags = el.tags ?? {};
  const name = tags.name;
  if (!name) return undefined; // uten navn er den ubrukelig
  return {
    id: `osm:${el.type}/${el.id}`,
    name,
    naceDescription: tags.amenity ?? tags.shop ?? "rental",
    website: normWebsite(tags.website ?? tags["contact:website"]),
    email: (tags.email ?? tags["contact:email"])?.toLowerCase().trim() || undefined,
    municipality: tags["addr:city"],
    postalCity: tags["addr:city"],
    postalCode: tags["addr:postcode"],
    country: (tags["addr:country"] ?? area).toUpperCase(),
    source: "osm",
    sourcedAt: new Date().toISOString(),
  };
}

/**
 * Spør Overpass for ett land. Prøver på nytt med backoff ved 429/504
 * (rate-limiting / timeout), som er vanlig på det offentlige endepunktet.
 */
async function queryArea(
  area: string,
  selectors: string[],
  max: number,
): Promise<OverpassResponse | undefined> {
  const body = new URLSearchParams({ data: buildQuery(area, selectors, max) });
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "rentoutbase-sale/0.1 (+kontakt: post@rentoutbase.com)",
      },
      body,
    });
    if (res.ok) return (await res.json()) as OverpassResponse;
    if (res.status === 429 || res.status === 504) {
      const wait = 5000 * (attempt + 1); // 5s, 10s, 15s …
      console.warn(`  Overpass ${res.status} for ${area} – venter ${wait / 1000}s og prøver igjen.`);
      await sleep(wait);
      continue;
    }
    console.warn(`  Overpass svarte ${res.status} for ${area} – hopper over.`);
    return undefined;
  }
  console.warn(`  Overpass ga seg ikke for ${area} – hopper over.`);
  return undefined;
}

/**
 * Henter bedrifter fra OpenStreetMap via Overpass API – gratis og uten nøkkel,
 * dekker hele Europa. Kjører én spørring per land i konfigurasjonen.
 */
export async function* sourceFromOsm(cfg: OsmSourceConfig): AsyncGenerator<Company> {
  for (const area of cfg.areas) {
    const json = await queryArea(area, cfg.selectors, cfg.maxPerArea);
    if (json) {
      const seen = new Set<string>();
      for (const el of json.elements ?? []) {
        const company = toCompany(el, area);
        if (!company || seen.has(company.id)) continue;
        seen.add(company.id);
        yield company;
      }
    }
    await sleep(2000); // vær snill mot det offentlige Overpass-endepunktet
  }
}
