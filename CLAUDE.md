# Hudpleie Nettsider – Prosjektinstruksjoner for Claude Code

## Oversikt
Dette er et økosystem av statiske nettsider om hudpleie i Norge. Alle sider følger
samme design og struktur, men har ulikt innhold basert på søkeord og by.

## Mappestruktur
```
hudpleie-nettsider/
├── _shared/
│   └── style.css          ← FELLES CSS – endre her for å oppdatere alle sider
├── botoxdrammen/
│   └── index.html         ← BotoxDrammen.no
├── hudpleiedrammen/
│   └── index.html         ← HudpleieDrammen.no
├── laserdrammen/
│   └── index.html         ← LaserDrammen.no
├── CLAUDE.md              ← Denne filen
└── README.md
```

## Regler for endringer

### Designendringer (farge, font, layout osv.)
- Endre KUN `_shared/style.css`
- CSS-variabler øverst i filen styrer alle farger
- Aldri legg inline-stiler i HTML-filene

### Innholdsendringer som gjelder ALLE sider
- Oppdater hver index.html individuelt, men hold strukturen identisk
- Seksjoner som alltid skal finnes: header, hero, intro, clinics-section, seo-section, faq-section, footer

### Mal-variabler per side
Hver side har disse unike verdiene:
- `SØKEORD` – f.eks. Botox, Hudpleie, Laser
- `BY` – f.eks. Drammen, Oslo, Bergen
- `DOMENE` – f.eks. BotoxDrammen.no
- `ANTALL_KLINIKKER` – alltid 5 (ekte klinikker) + 1 ledig
- `KLINIKKLISTE` – 5 håndplukkede klinikker + 1 ledig annonseplass-kort
- `BY_INTRO` – unikt avsnitt med befolkningstall, fylke, geografi og sentrale bydeler (skiller siden fra andre byer med samme søkeord)

### Klinikkort-struktur (HTML-mal)
```html
<div class="clinic-card">
  <div class="card-header">
    <div class="clinic-initials">XX</div>
    <span class="verified-badge verified-badge--ok">✓ Anbefalt</span>
  </div>
  <div class="clinic-name">KLINIKKNAVN</div>
  <div class="card-details">
    <div class="detail-row">📍 <span>ADRESSE</span></div>
    <div class="detail-row">📞 <span>TELEFON</span></div>
    <div class="detail-row">🌐 <span>NETTSIDE</span></div>
  </div>
  <div class="services-row">
    <span class="service-tag">TJENESTE 1</span>
    <span class="service-tag">TJENESTE 2</span>
    <span class="service-tag">TJENESTE 3</span>
  </div>
  <div class="card-footer">
    <a href="https://NETTSIDE" target="_blank" class="btn-primary">Besøk nettside</a>
    <button class="btn-secondary">Kart</button>
  </div>
</div>
```

### Ledig annonseplass-kort (siste slot)
```html
<div class="clinic-card clinic-card--available">
  <div class="card-header">
    <div class="clinic-initials">+</div>
  </div>
  <div class="clinic-name">Ledig annonseplass</div>
  <p class="available-text">Driver du klinikk i [BY]? Vi har én ledig plass for en klinikk som ønsker å bli vist her.</p>
  <div class="card-footer">
    <a href="mailto:Hello@HaraHorn.com" class="btn-primary">Ta kontakt</a>
  </div>
</div>
```

## SEO-regler
- Hver side MÅ ha: `<title>`, `<meta description>`, `<link rel="canonical">`, Schema.org JSON-LD (WebPage + FAQPage), `<meta property="og:image">`
- H1 skal inneholde søkeord + bynavn
- Seksjonene `seo-section` og `faq-section` er kritiske for SEO – ikke fjern dem
- `seo-section` skal starte med et `<p class="city-intro">` med unik by-info (innbyggertall, fylke, bydeler)
- `sitemap.xml`, `robots.txt` og `llms.txt` MÅ opprettes i sidens mappe for nye sider
- `dateModified` i WebPage JSON-LD skal oppdateres ved innholdsendringer

## Lenkenett (SEO link ecosystem)

Alle sider har en `<!-- LENKER START --> ... <!-- LENKER SLUTT -->`-seksjon rett over `<footer>` som lenker til:
- Samme søkeord i andre byer (topical cluster)
- Andre søkeord i samme by (city cluster)
- Hub-sider: Korean.no, Antiaging.no (og fremtidige temaspesifikke sider)

### Oppdater lenker etter endringer
```
node scripts/oppdater_lenker.js
```
Kjøres automatisk ved: nye sider, nye hub-sider, domener som aktiveres.

### Legg til en ny hub-side (f.eks. Tannlege.no)
Rediger `scripts/oppdater_lenker.js`, legg til i `HUB_SITES`:
```js
{ display: 'Tannlege.no', url: 'https://www.tannlege.no' },
```
Kjør deretter scriptet. Alle 36+ sider oppdateres automatisk.

### Aktiver et domene som har vært inaktivt (f.eks. HudpleieBergen.no)
Sett `active: true` for riktig entry i `SITES`-arrayen i scriptet, og kjør det på nytt.

## Nye sider
For å legge til en ny side (f.eks. BotoxBergen.no):
1. Kopier en eksisterende mappe (f.eks. `botoxdrammen/`)
2. Endre alle forekomster av "Drammen" → "Bergen" og "drammen" → "bergen"
3. Oppdater canonical URL, og:image, og Schema.org (inkl. dateModified)
4. Oppdater `BY_INTRO`-avsnittet med Bergens innbyggertall, fylke og bydeler
5. Finn 5 ekte klinikker (se prosess nedenfor) og erstatt klinikkdata
6. Oppdater `sitemap.xml` med ny URL, `robots.txt` med nytt domene, og `llms.txt` med ny by/søkeord
7. Legg til siden i `SITES`-arrayen i `scripts/oppdater_lenker.js` og kjør scriptet
8. Sjekk alle sider for skrivefeil før push

## Finn 5 klinikker til en ny side

Hver ny side skal ha **5 ekte klinikker + 1 ledig annonseplass** (slot 6).

### Automatisk via Google Places API (anbefalt)
```
node scripts/hent_google_places.js <søkeord> <by>
```
Eksempel: `node scripts/hent_google_places.js botox bergen`

Scriptet søker Google Places, henter topp 5 resultater med navn/adresse/telefon/nettside og oppdaterer riktig HTML-fil automatisk. Krever `GOOGLE_PLACES_API_KEY` i `.env`-filen (se `.env.example`).

**Forutsetning for API-nøkkel:**
1. Gå til https://console.cloud.google.com/
2. Aktiver Places API
3. Opprett API-nøkkel under Credentials
4. Lagre som `.env`: `GOOGLE_PLACES_API_KEY=din_nøkkel`

### HTML-markører (må finnes i nye sider)
Klinikkgrid-innholdet må ha disse markørene for at scriptet skal fungere:
```html
<!-- KLINIKKER START -->
  ... klinikkort ...
<!-- KLINIKKER SLUTT -->
```

### Hva som oppdateres automatisk av scriptet
- Klinikkortene mellom markørene
- `result-count` span med antall klinikker funnet

## Klikksporing og klikk-rapport

Alle sider sender disse GA4-eventene (kun for besøkende som har godtatt cookies):
- `klinikk_klikk` – klikk på «Besøk nettside» (knappen har `data-klinikk="NAVN"`)
- `klinikk_kart_klikk` – klikk på «Kart» (lenken har `data-klinikk-kart="NAVN"`)

Begge sender `klinikk_navn` og `side`. `scripts/hent_google_places.js` legger på attributtene automatisk;
kopieres en eksisterende side må `data-klinikk-kart` være med på Kart-lenkene, og GA-blokken nederst må inneholde begge lyttere.
Hver side har sin egen unike GA4-ID (`var ID='G-...'`) – aldri gjenbruk en annen sides ID.

### Samlet rapport over klikk per klinikk
```
node scripts/klikk_rapport.js                      # siste 30 dager
node scripts/klikk_rapport.js --dager 7
node scripts/klikk_rapport.js --fra 2026-09-01 --til 2026-09-30
```
Lager `rapporter/klikk-rapport-<dato>.html` (sorterbar, samlet + per side) og `.csv` (åpnes i Excel). `rapporter/` er i .gitignore.
Scriptet finner sidene og GA4-IDene selv fra `index.html`-filene, og slår opp riktig GA4-property via målings-ID-en.

**Engangsoppsett:**
1. Google Cloud Console → aktiver «Google Analytics Data API» og «Google Analytics Admin API».
2. Opprett en tjenestekonto og last ned en JSON-nøkkel. Lagre den utenfor repoet.
3. GA4 → Admin → Kontotilgang: legg tjenestekontoens e-post til med rolle Viewer (Editor trengs bare til steg 5).
4. Sett `GA_SERVICE_ACCOUNT_FILE=<sti til nøkkelen>` i `.env`.
5. `node scripts/klikk_rapport.js --opprett-dimensjoner` oppretter custom dimension `klinikk_navn` i alle properties
   (nødvendig for å kunne bryte ned på klinikk; teller bare klikk fra og med opprettelsen). Etter dette kan rollen senkes til Viewer.

Merk: tallene er lavere enn faktiske klikk fordi kun cookie-godtatte besøk telles. Sider med `G-TODO_...`-ID
(domener som ikke er registrert ennå) hoppes over.

## Skalering til nye bransjer
Samme struktur kan brukes for andre bransjer. Bytt ut:
- Søkeord (Botox/Hudpleie/Laser → Tannlege/Frisør/Negl osv.)
- SEO-tekst og FAQ
- Finn 5 relevante klinikker via Google-søk (se prosess ovenfor)
