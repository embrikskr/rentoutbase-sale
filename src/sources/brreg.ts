import type { BrregSourceConfig } from "../config.js";
import type { Company } from "../types.js";

const BASE = "https://data.brreg.no/enhetsregisteret/api/enheter";

/** Delmengde av Enhetsregisterets enhet-objekt som vi bruker. */
interface BrregEnhet {
  organisasjonsnummer: string;
  navn: string;
  organisasjonsform?: { kode?: string; beskrivelse?: string };
  naeringskode1?: { kode?: string; beskrivelse?: string };
  antallAnsatte?: number;
  hjemmeside?: string;
  forretningsadresse?: {
    kommune?: string;
    kommunenummer?: string;
    postnummer?: string;
    poststed?: string;
  };
}

interface BrregResponse {
  _embedded?: { enheter?: BrregEnhet[] };
  page?: { totalPages?: number; number?: number };
}

function toCompany(e: BrregEnhet): Company {
  let website = e.hjemmeside?.trim();
  if (website && !/^https?:\/\//i.test(website)) website = `https://${website}`;
  return {
    id: e.organisasjonsnummer,
    name: e.navn,
    orgForm: e.organisasjonsform?.kode,
    naceCode: e.naeringskode1?.kode,
    naceDescription: e.naeringskode1?.beskrivelse,
    employees: e.antallAnsatte,
    website: website || undefined,
    municipality: e.forretningsadresse?.kommune,
    municipalityCode: e.forretningsadresse?.kommunenummer,
    postalCode: e.forretningsadresse?.postnummer,
    postalCity: e.forretningsadresse?.poststed,
    source: "brreg",
    sourcedAt: new Date().toISOString(),
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Henter bedrifter fra Enhetsregisteret for én næringskode, side for side,
 * inntil `max` er nådd. Yielder bedrifter etter hvert som de hentes.
 */
async function* fetchByNace(
  nace: string,
  cfg: BrregSourceConfig,
  max: number,
): AsyncGenerator<Company> {
  const pageSize = Math.min(100, max);
  let page = 0;
  let yielded = 0;

  while (yielded < max) {
    const params = new URLSearchParams();
    params.set("naeringskode", nace);
    params.set("size", String(pageSize));
    params.set("page", String(page));
    if (cfg.fraAntallAnsatte != null) {
      // Brønnøysund avviser søk i intervallet 1–4 ansatte (personvern).
      // Løft derfor 1–4 opp til 5.
      const fra = cfg.fraAntallAnsatte >= 1 && cfg.fraAntallAnsatte <= 4 ? 5 : cfg.fraAntallAnsatte;
      params.set("fraAntallAnsatte", String(fra));
    }
    if (cfg.tilAntallAnsatte != null) params.set("tilAntallAnsatte", String(cfg.tilAntallAnsatte));
    for (const k of cfg.kommunenummer ?? []) params.append("kommunenummer", k);
    for (const f of cfg.organisasjonsformer ?? []) params.append("organisasjonsform", f);

    const res = await fetch(`${BASE}?${params}`, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      throw new Error(`Brønnøysund svarte ${res.status} for næringskode ${nace}`);
    }
    const json = (await res.json()) as BrregResponse;
    const enheter = json._embedded?.enheter ?? [];
    if (enheter.length === 0) return;

    for (const e of enheter) {
      yield toCompany(e);
      if (++yielded >= max) return;
    }

    const totalPages = json.page?.totalPages ?? 1;
    if (page + 1 >= totalPages) return;
    page++;
    await sleep(200); // vær snill mot API-et
  }
}

/** Henter alle bedrifter for alle næringskodene i ICP-konfigurasjonen. */
export async function* sourceFromBrreg(cfg: BrregSourceConfig): AsyncGenerator<Company> {
  for (const nace of cfg.naeringskoder) {
    yield* fetchByNace(nace, cfg, cfg.maxPerNaeringskode);
  }
}
