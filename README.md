# rentoutbase-sale

Automatisk B2B-kundeanskaffelse for **rentoutbase.com**. Systemet finner
potensielle kunder, kvalifiserer dem, tar kontakt via e-post, booker møter og
gjør alt klart for et salg.

> ⚠️ **Les avsnittet om regelverk før du sender en eneste e-post.** Kald
> B2B-e-post i EU/EØS er regulert av GDPR og ePrivacy-direktivet (ulik
> implementering per land).

## Pipeline

```
1. SOURCE    Finn bedrifter (OpenStreetMap/Overpass: kategori + land i Europa)       ✅
2. ENRICH    Finn kontakt-e-post (e-post fra kilde, ellers skrap nettside)            ✅
3. DRAFT     Lag personaliserte e-poster m/ lovpålagt avmelding + firmaadresse        ✅
4. ENGAGE    Send via SMTP, sendetak, suppression, aldri dobbelt                       ✅
5. CONVERT   Les svar (IMAP) → klassifiser → STOPP/booking → oppdater CRM            ✅
```

Hele rutinen i én kommando:

```bash
npm start            # ingest → enrich → draft → send (TØRRKJØRING, sender ingenting)
npm start -- --live  # samme, men sender på ekte (krever SMTP, se nedenfor)
```

## Kom i gang

```bash
npm install
cp .env.example .env        # fyll ut når du kommer til Fase 4 (e-post)

# Juster målgruppen din:
cp config/icp.example.json config/icp.json   # rediger land (areas) og kategorier

npm run ingest              # henter bedrifter fra OpenStreetMap (Europa)
npm run stats               # antall leads per steg
npm run list -- --stage qualified --limit 25
```

## Slå på ekte sending (gratis)

Tørrkjøring krever ingenting. For å faktisk sende trengs én ting — et gratis
**Gmail app-passord** (det finnes ingen vei utenom; å sende e-post krever
innlogging et sted):

1. Slå på 2-trinns på Google-kontoen → lag et **app-passord** (16 tegn).
2. Fyll ut i `.env`:
   ```
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_USER=din@gmail.com
   SMTP_PASS=<app-passordet>
   COMPANY_POSTAL_ADDRESS=RentOutBase AS, <adresse>
   ```
3. `npm start -- --live`

> ⚠️ Å sende kald e-post i volum fra en personlig Gmail kan få kontoen
> begrenset, og fjerner den manuelle sjekken før noe går ut. Hold deg langt
> under `DAILY_SEND_LIMIT`, eller bruk et eget sende-domene + SMTP-leverandør.

## Automatisk drift (gratis, kjører av seg selv)

`.github/workflows/pipeline.yml` kjører rutinen på GitHub sine maskiner hver
ukedag morgen — gratis, uten egen server. Databasen tas vare på mellom
kjøringer via cache, så samme bedrift kontaktes ikke på nytt.

- **Tørrkjøring** krever ingen oppsett.
- For **live-sending**: legg SMTP-verdiene inn som *repository secrets*
  (Settings → Secrets), og start workflowen manuelt med «live» huket av.

## Konfigurasjon (`config/icp.json`)

Definerer hvem maskinen skal lete etter (Ideal Customer Profile). Standard er
OpenStreetMap-kilden (`sources.osm`):

- `areas` — ISO 3166-1-landkoder, f.eks. `["GB","FR","DE",…]`. Legg til/fjern
  land etter behov.
- `selectors` — OSM-tagger for relevante bedrifter, f.eks. `amenity=car_rental`,
  `amenity=boat_rental`, `amenity=bicycle_rental`, `shop=rental`. Se
  [OSM-wiki](https://wiki.openstreetmap.org/wiki/Map_features) for flere.
- `maxPerArea` — maks antall bedrifter per land per kjøring.
- `scoring.requireWebsite` — krev kontaktinfo (nettside eller e-post) for at en
  lead skal regnes som `qualified`.

> Brønnøysund-kilden (`sources.brreg`) finnes fortsatt i koden for norske
> bedrifter, men er ikke i standardoppsettet.

## Datamodell

`Company` → `Lead` (med `stage`) → `Contact` + `Event`-logg. Lagres via et
`Store`-grensesnitt; nå fil-basert JSON (`data/db.json`), byttes til Postgres
i produksjon uten å endre forretningslogikken.

## Regelverk (må følges)

- **ePrivacy-direktivet** (implementert ulikt per EU/EØS-land) regulerer
  uoppfordret e-postmarkedsføring. Til *fysiske personer* kreves som regel
  samtykke; til bedrifts-/rolleadresser (`post@`, `info@`) står man friere i
  mange land. Hold deg til rolleadresser, og sjekk reglene i landene du
  retter deg mot.
- **GDPR**: prospekt-e-poster er persondata. Lovlig grunnlag er normalt
  berettiget interesse (art. 6(1)(f)) — krever interesseavveining, personvern-
  info og enkel reservasjonsrett. Hver lead skal kunne slettes på forespørsel.
- Hver e-post må ha **tydelig avmelding** og **fysisk firmaadresse**.
- Avmeldte/reserverte havner på **suppression-lista** og kontaktes aldri igjen.
- Persondata committes ikke til git (`data/` er ignorert).

## Deliverability

- Bruk et **eget sende-domene** (f.eks. `mail.rentoutbase.com`), ikke
  hoveddomenet — beskytter omdømmet hvis noe går galt.
- Sett opp **SPF, DKIM og DMARC** på sende-domenet.
- Varm opp domenet, og hold deg under `DAILY_SEND_LIMIT`.

## Svarhåndtering (Fase 5)

`npm run replies` leser innboksen via IMAP, klassifiserer svar (regelbasert,
ingen AI-nøkkel) og handler automatisk:

- «STOPP»/avmelding → legges på suppression-lista (skjer alltid, også i tørr).
- «ikke interessert» → suppress + steg `lost`.
- interessert → steg `meeting_booked` og bookinglenke sendes (`--live`).
- autosvar/ukjent → ingen handling.

Krever IMAP i `.env` (`IMAP_HOST=imap.gmail.com`, `IMAP_PORT=993`, samme
app-passord som SMTP) og `BOOKING_URL` (f.eks. en gratis Cal.com-lenke).

## Status

Hele pipelinen (Fase 1–5) er bygget og kjører mot ekte data: sourcing,
enrichment, utkast, SMTP-sending, svarhåndtering/booking — med sikkerhets-
sperrer og en gratis scheduler. `npm start` kjører alt.
