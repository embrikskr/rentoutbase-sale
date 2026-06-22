import type { IcpConfig } from "../config.js";
import type { Company } from "../types.js";
import { sourceFromBrreg } from "./brreg.js";
import { sourceFromOsm } from "./osm.js";

/** Henter bedrifter fra alle kildene som er satt opp i ICP-konfigurasjonen. */
export async function* sourceCompanies(sources: IcpConfig["sources"]): AsyncGenerator<Company> {
  if (sources.osm) yield* sourceFromOsm(sources.osm);
  if (sources.brreg) yield* sourceFromBrreg(sources.brreg); // kun Norge
}
