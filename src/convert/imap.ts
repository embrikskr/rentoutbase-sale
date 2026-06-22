import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
}

export interface IncomingReply {
  from: string; // avsenderadresse, lowercased
  subject: string;
  text: string;
  date: Date;
}

/** Leser IMAP-oppsett fra miljøet. Returnerer undefined hvis ikke satt opp. */
export function loadImap(): ImapConfig | undefined {
  const { IMAP_HOST, IMAP_PORT, IMAP_USER, IMAP_PASS } = process.env;
  if (!IMAP_HOST || !IMAP_USER || !IMAP_PASS) return undefined;
  return {
    host: IMAP_HOST,
    port: Number(IMAP_PORT ?? 993),
    user: IMAP_USER,
    pass: IMAP_PASS,
  };
}

/** Henter innkommende e-post fra INBOX de siste `sinceDays` dagene. */
export async function fetchReplies(cfg: ImapConfig, sinceDays = 14): Promise<IncomingReply[]> {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 993,
    auth: { user: cfg.user, pass: cfg.pass },
    logger: false,
  });

  const replies: IncomingReply[] = [];
  await client.connect();
  const lock = await client.getMailboxLock("INBOX");
  try {
    const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
    for await (const msg of client.fetch({ since }, { source: true })) {
      if (!msg.source) continue;
      const parsed = await simpleParser(msg.source);
      const from = parsed.from?.value?.[0]?.address?.toLowerCase();
      if (!from) continue;
      replies.push({
        from,
        subject: parsed.subject ?? "",
        text: parsed.text ?? "",
        date: parsed.date ?? new Date(),
      });
    }
  } finally {
    lock.release();
    await client.logout();
  }
  return replies;
}
