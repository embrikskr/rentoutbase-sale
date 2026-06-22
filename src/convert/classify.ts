// Regelbasert klassifisering av svar – gratis, ingen AI-nøkkel.
// Kan senere byttes til AI-klassifisering hvis ønskelig.

export type ReplyIntent =
  | "unsubscribe" // ber om å slippe / «STOPP»
  | "auto" // autosvar / fraværsmelding
  | "not_interested"
  | "interested"
  | "unknown";

const RULES: { intent: ReplyIntent; patterns: string[] }[] = [
  {
    intent: "unsubscribe",
    patterns: [
      "stopp",
      "meld meg av",
      "meld av",
      "fjern meg",
      "avmeld",
      "ikke kontakt",
      "ikke ta kontakt",
      "slett meg",
      "reserver meg",
      "unsubscribe",
      "remove me",
    ],
  },
  {
    intent: "auto",
    patterns: [
      "autosvar",
      "automatisk svar",
      "fraværsassistent",
      "ute av kontoret",
      "ikke til stede",
      "tilbake den",
      "ferie",
      "out of office",
      "automatic reply",
      "currently away",
    ],
  },
  {
    intent: "not_interested",
    patterns: [
      "ikke interessert",
      "nei takk",
      "ikke aktuelt",
      "ikke behov",
      "ingen interesse",
      "ikke relevant",
      "ikke for oss",
    ],
  },
  {
    intent: "interested",
    patterns: [
      "interessert",
      "høres bra",
      "høres spennende",
      "spennende",
      "ja takk",
      "ring meg",
      "ta gjerne kontakt",
      "et møte",
      "møte",
      "demo",
      "når passer",
      "fortell mer",
      "mer info",
      "vil vite mer",
    ],
  },
];

/** Klassifiserer et svar basert på nøkkelord. Rekkefølgen er bevisst. */
export function classifyReply(text: string): ReplyIntent {
  const t = text.toLowerCase();
  for (const rule of RULES) {
    if (rule.patterns.some((p) => t.includes(p))) return rule.intent;
  }
  return "unknown";
}
