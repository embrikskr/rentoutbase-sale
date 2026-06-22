# rentoutbase-sale

Automatisk B2B-kundeanskaffelse for **rentoutbase.com**. Systemet finner
potensielle kunder, kvalifiserer dem, tar kontakt via e-post, booker møter og
gjør alt klart for et salg.

> ⚠️ **Les avsnittet om regelverk før du sender en eneste e-post.** Kald
> e-post i Norge er regulert av markedsføringsloven og GDPR.

## Pipeline

```
1. SOURCE    Finn bedrifter (Brønnøysund åpne API: bransje/NACE, sted, størrelse)   ✅
2. ENRICH    Finn kontakt-e-post (skrap nettside + gjett rolleadresse)                ✅
3. DRAFT     Lag personaliserte e-poster m/ lovpålagt avmelding + firmaadresse        ✅
4. ENGAGE    Send via SMTP, sendetak, suppression, aldri dobbelt                       ✅
5. CONVERT   Oppdag svar (IMAP) → klassifiser m/ AI → send bookinglenke → CRM         ⏳
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
cp config/icp.example.json config/icp.json   # rediger NACE-koder, sted, størrelse

npm run ingest              # henter bedrifter fra Brønnøysund
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

Definerer hvem maskinen skal lete etter (Ideal Customer Profile):

- `naeringskoder` — NACE-koder. `77.x` = utleie/leasing, `68.209` = utleie av
  egen fast eiendom. Finn flere på [SSBs NACE-oversikt](https://www.ssb.no/klass/klassifikasjoner/6).
- `kommunenummer` — begrens til bestemte kommuner (tom = hele landet).
- `fra/tilAntallAnsatte`, `organisasjonsformer` — størrelses- og selskapsfilter.
- `scoring` — krav for at en lead skal regnes som `qualified`.

## Datamodell

`Company` → `Lead` (med `stage`) → `Contact` + `Event`-logg. Lagres via et
`Store`-grensesnitt; nå fil-basert JSON (`data/db.json`), byttes til Postgres
i produksjon uten å endre forretningslogikken.

## Regelverk (må følges)

- **Markedsføringsloven § 15** forbyr uoppfordret e-postmarkedsføring til
  *fysiske personer* uten samtykke. Hold deg til bedrifts-/rolleadresser
  (`post@`, `kontakt@`) framfor personlige adresser.
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

## Status

Fase 1–4 er bygget og kjører mot ekte data (sourcing, enrichment, utkast,
SMTP-sending med sikkerhetssperrer, samt en gratis scheduler).

Gjenstår (Fase 5 – Convert): lese innboksen (IMAP) for svar, klassifisere dem
(interessert / ikke / «STOPP»), legge avmeldte på suppression-lista automatisk,
sende bookinglenke og oppdatere CRM-steget.
