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
}

export interface SendOptions {
  /** Uten live=true gjøres ingenting reelt (tørrkjøring). */
  live?: boolean;
}

/**
 * Steg 4 (Engage): sender e-post til leads i steg "queued".
 *
 * Sikkerhetssperrer:
 *  - Tørrkjøring som standard (live=false).
 *  - Nekter live-sending uten lovpålagt firmaadresse i bunnteksten.
 *  - Respekterer DAILY_SEND_LIMIT.
 *  - Hopper over suppression-treff; sender aldri til samme lead to ganger.
 */
export async function send(store: Store, opts: SendOptions = {}): Promise<SendResult> {
  const env = loadEnv();
  const pitch = loadPitch();
  const live = opts.live ?? false;
  const result: SendResult = { sent: 0, skipped: 0, dryRun: !live, capReached: false };

  if (live && !env.companyPostalAddress) {
    throw new Error(
      "Nekter å sende live uten fysisk firmaadresse. Sett COMPANY_POSTAL_ADDRESS i .env " +
        "(lovpålagt i markedsføring).",
    );
  }

  const sender = new Sender(loadSmtp());
  const queued = await store.listLeads("queued");

  for (const lead of queued) {
    if (result.sent >= env.dailySendLimit) {
      result.capReached = true;
      break;
    }

    const company = await store.getCompany(lead.companyId);
    const contact = (await store.listContacts(lead.companyId)).find((c) => c.email);
    if (!company || !contact?.email || (await store.isSuppressed(contact.email))) {
      result.skipped++;
      continue;
    }

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
