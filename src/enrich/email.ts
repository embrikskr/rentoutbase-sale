// Gratis e-post-funn uten API-nøkler: trekk ut adresser fra HTML og gjett
// rolleadresser ut fra domenet. Vi foretrekker rolleadresser (post@, kontakt@)
// framfor personlige, av hensyn til markedsføringsloven §15.

const ROLE_PREFIXES = [
  "post",
  "kontakt",
  "firmapost",
  "hei",
  "hallo",
  "salg",
  "sales",
  "info",
  "booking",
  "kundeservice",
  "mail",
];

// Adresser/domener som nesten alltid er støy og ikke ekte kontaktadresser.
const JUNK_FRAGMENTS = [
  "example.com",
  "sentry",
  "wixpress",
  "wix.com",
  "squarespace",
  "godaddy",
  "yourdomain",
  "domain.com",
  "email.com",
  "@2x",
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".svg",
];

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;

export function extractEmails(html: string): string[] {
  const found = new Set<string>();
  for (const raw of html.match(EMAIL_RE) ?? []) {
    const email = raw.toLowerCase();
    if (JUNK_FRAGMENTS.some((j) => email.includes(j))) continue;
    found.add(email);
  }
  return [...found];
}

export function domainFromUrl(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return undefined;
  }
}

export function isRoleAddress(email: string): boolean {
  const local = email.split("@")[0] ?? "";
  return ROLE_PREFIXES.some((p) => local === p || local.startsWith(`${p}@`) || local === p);
}

/** Sorterer adresser: rolleadresse på riktig domene først, så personlige. */
export function rankEmails(emails: string[], domain?: string): string[] {
  return [...emails].sort((a, b) => emailScore(b, domain) - emailScore(a, domain));
}

function emailScore(email: string, domain?: string): number {
  let s = 0;
  const emailDomain = email.split("@")[1] ?? "";
  if (domain && emailDomain.endsWith(domain)) s += 10;
  if (isRoleAddress(email)) s += 5;
  return s;
}

/** Beste gjett på rolleadresse når vi ikke fant noen på nettsiden. */
export function guessRoleEmail(domain: string): string {
  return `post@${domain}`;
}
