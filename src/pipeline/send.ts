import { randomUUID } from "node:crypto";
import { loadEnv } from "../config.js";
import { loadPitch, renderMessage } from "../engage/template.js";
import { loadSmtp, Sender } from "../engage/sender.js";
import type { Store } from "../store/store.js";

export interface SendResult {
  sent: number;
  skipped: number;
  dryRun: boolean;
  capReached: boolean;
  outsideWindow: boolean;
  sentToday: number;
}

export interface SendOptions {
  /** Uten live=true gjøres ingenting reelt (tørrkjøring). */
  live?: boolean;
  /** Hopp over sjekken av sendevindu (for testing/manuell kjøring). */
  ignoreWindow?: boolean;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Tilfeldig pause 30–90 s mellom ekte utsendinger, så de ikke kommer i klynge. */
function jitterMs(): number {
  return 30_000 + Math.floor(Math.random() * 60_000);
}

/**
 * Steg 4 (Engage): sender e-post til leads i steg "queued", men rolig og spredt.
 *
 * For å unngå søppelpost:
 *  - Sender kun innenfor sendevinduet (SEND_WINDOW_START–END, lokal tid).
 *  - Maks SEND_PER_RUN per kjøring; kjør ofte (cron) for jevnt drypp.
 *  - Dagstak (DAILY_SEND_LIMIT) telles på tvers av kjøringer.
 *  - Tilfeldig pause mellom hver e-post.
 *  - Innholdet varieres per e-post (se template.ts / pitch.json).
 *
 * Sikkerhetssperrer beholdt: tørrkjøring som standard, krever firmaadresse,
 * respekterer suppression, sender aldri til samme lead to ganger.
 */
export async function send(store: Store, opts: SendOptions = {}): Promise<SendResult> {
  const env = loadEnv();
  const pitch = loadPitch();
  const live = opts.live ?? false;
  const result: SendResult = {
    sent: 0,
    skipped: 0,
    dryRun: !live,
    capReached: false,
    outsideWindow: false,
    sentToday: 0,
  };

  if (live && !env.companyPostalAddress) {
    throw new Error(
      "Nekter å sende live uten fysisk firmaadresse. Sett COMPANY_POSTAL_ADDRESS i .env " +
        "(lovpålagt i markedsføring).",
    );
  }

  // Sendevindu (lokal tid på maskinen; sett TZ ved behov).
  const hour = new Date().getHours();
  if (!opts.ignoreWindow && (hour < env.sendWindowStart || hour >= env.sendWindowEnd)) {
    result.outsideWindow = true;
    return result;
  }

  // Dagstak på tvers av kjøringer: tell dagens allerede sendte.
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  result.sentToday = await store.countEvents("email_sent", startOfDay.toISOString());
  const remainingToday = Math.max(0, env.dailySendLimit - result.sentToday);
  const budget = Math.min(env.sendPerRun, remainingToday);
  if (budget <= 0) {
    result.capReached = true;
    return result;
  }

  const sender = new Sender(loadSmtp());
  const queued = await store.listLeads("queued");

  for (const lead of queued) {
    if (result.sent >= budget) {
      result.capReached = result.sent + result.sentToday >= env.dailySendLimit;
      break;
    }

    const company = await store.getCompany(lead.companyId);
    const contact = (await store.listContacts(lead.companyId)).find((c) => c.email);
    if (!company || !contact?.email || (await store.isSuppressed(contact.email))) {
      result.skipped++;
      continue;
    }

    // Pause før alle unntatt den første ekte utsendingen.
    if (live && result.sent > 0) await sleep(jitterMs());

    const msg = renderMessage(company, contact, pitch, env);
    await sender.send(msg, !live);

    if (live) {
      await store.upsertLead({
        ...lead,
        stage: "contacted",
        updatedAt: new Date().toISOString(),
      });
      await store.addEvent({
        id: randomUUID(),
        companyId: company.id,
        type: "email_sent",
        at: new Date().toISOString(),
        data: { to: msg.to, subject: msg.subject },
      });
    }
    result.sent++;
  }

  return result;
}
