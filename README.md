# rentoutbase-sale

Automatisk B2B-kundeanskaffelse for **rentoutbase.com**. Systemet finner
potensielle kunder, kvalifiserer dem, tar kontakt via e-post, booker møter og
gjør alt klart for et salg.

> ⚠️ **Les avsnittet om regelverk før du sender en eneste e-post.** Kald
> e-post i Norge er regulert av markedsføringsloven og GDPR.

## Pipeline

```
1. SOURCE    Finn bedrifter (Brønnøysund åpne API: bransje/NACE, sted, størrelse)   ✅ bygget
2. ENRICH    Finn e-post + beslutningstaker (nettside / Hunter / mønster)            ⏳ neste
3. QUALIFY   Scoring mot ICP, dedupe, sjekk suppression-liste                         ✅ grunnlag
4. ENGAGE    E-postsekvens m/ personalisering, sendetak, stopp ved svar               ⏳
5. CONVERT   Oppdag svar (IMAP) → klassifiser m/ AI → send bookinglenke → CRM         ⏳
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

Fase 1 (sourcing + lagring + scoring + CLI) er bygget og kjører mot ekte data.
Fase 2–5 er stubbet i arkitekturen og bygges videre.
