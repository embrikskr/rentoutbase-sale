import { randomUUID } from "node:crypto";
import { loadEnv } from "../config.js";
import { classifyReply, type ReplyIntent } from "../convert/classify.js";
import { fetchReplies, loadImap } from "../convert/imap.js";
import { loadPitch, renderBookingReply } from "../engage/template.js";
import { loadSmtp, Sender } from "../engage/sender.js";
import type { Store } from "../store/store.js";
import type { Company, Contact, Lead } from "../types.js";

export interface ReplyResult {
  fetched: number;
  matched: number;
  unsubscribed: number;
  interested: number;
  notInterested: number;
  bookingSent: number;
  notConfigured?: boolean;
}

export interface ReplyOptions {
  /** Uten live=true sendes ingen bookinglenke (suppression skjer alltid). */
  live?: boolean;
  sinceDays?: number;
}

/** Finner leaden som hører til en avsenderadresse (eksakt e-post eller domene). */
async function matchLead(
  store: Store,
  from: string,
): Promise<{ lead: Lead; company: Company; contact: Contact } | undefined> {
  const domain = from.split("@")[1];
  for (const lead of await store.listLeads()) {
    const contacts = await store.listContacts(lead.companyId);
    const contact = contacts.find(
      (c) => c.email === from || (domain && c.email?.endsWith(`@${domain}`)),
    );
    if (contact) {
      const company = await store.getCompany(lead.companyId);
      if (company) return { lead, company, contact };
    }
  }
  return undefined;
}

/**
 * Steg 5 (Convert): leser innboksen, klassifiserer svar og handler:
 *  - «STOPP»/avmelding → legges på suppression-lista (skjer alltid).
 *  - ikke interessert → suppress + steg 'lost'.
 *  - interessert → send bookinglenke (krever live) + steg 'meeting_booked'.
 *  - autosvar/ukjent → ingen handling.
 */
export async function processReplies(store: Store, opts: ReplyOptions = {}): Promise<ReplyResult> {
  const live = opts.live ?? false;
  const result: ReplyResult = {
    fetched: 0,
    matched: 0,
    unsubscribed: 0,
    interested: 0,
    notInterested: 0,
    bookingSent: 0,
  };

  const imap = loadImap();
  if (!imap) {
    result.notConfigured = true;
    return result;
  }

  const env = loadEnv();
  const pitch = loadPitch();
  const sender = new Sender(loadSmtp());

  const replies = await fetchReplies(imap, opts.sinceDays ?? 14);
  result.fetched = replies.length;

  for (const reply of replies) {
    const match = await matchLead(store, reply.from);
    if (!match) continue;
    result.matched++;

    const { lead, company, contact } = match;
    const intent: ReplyIntent = classifyReply(`${reply.subject}\n${reply.text}`);

    if (intent === "unsubscribe" || intent === "not_interested") {
      await store.suppress(reply.from, intent === "unsubscribe" ? "ba om STOPP" : "ikke interessert");
      await setStage(store, lead, intent === "unsubscribe" ? "suppressed" : "lost", reply.from);
      if (intent === "unsubscribe") result.unsubscribed++;
      else result.notInterested++;
      continue;
    }

    if (intent === "interested") {
      result.interested++;
      // Send bookinglenke kun én gang og bare ved live.
      if (lead.stage !== "meeting_booked" && lead.stage !== "replied") {
        if (live) {
          const msg = renderBookingReply(company, contact, pitch, env);
          await sender.send(msg, false);
          result.bookingSent++;
        } else {
          console.log(`  [TØRR] ville sendt bookinglenke til ${contact.email}`);
        }
        await setStage(store, lead, live ? "meeting_booked" : "replied", reply.from, intent);
      }
    }
  }

  return result;
}

async function setStage(
  store: Store,
  lead: Lead,
  stage: Lead["stage"],
  from: string,
  intent?: ReplyIntent,
): Promise<void> {
  await store.upsertLead({ ...lead, stage, updatedAt: new Date().toISOString() });
  await store.addEvent({
    id: randomUUID(),
    companyId: lead.companyId,
    type: "reply",
    at: new Date().toISOString(),
    data: { from, stage, intent },
  });
}
