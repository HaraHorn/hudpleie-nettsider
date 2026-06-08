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
- `ANTALL_KLINIKKER` – oppdateres fra Brønnøysund-data
- `KLINIKKLISTE` – klinikkort generert fra data

### Klinikkort-struktur (HTML-mal)
```html
<div class="clinic-card">
  <div class="card-header">
    <div class="clinic-initials">XX</div>
    <span class="verified-badge">✓ Registrert</span>
  </div>
  <div class="clinic-name">KLINIKKNAVN</div>
  <div class="clinic-orgnr">Org.nr: XXX XXX XXX</div>
  <div class="card-details">
    <div class="detail-row">📍 <span>ADRESSE</span></div>
    <div class="detail-row">📞 <span>TELEFON</span></div>
    <div class="detail-row">🌐 <span>NETTSIDE</span></div>
  </div>
  <div class="services-row">
    <span class="service-tag">TJENESTE 1</span>
  </div>
  <div class="card-footer">
    <button class="btn-primary">Se detaljer</button>
    <button class="btn-secondary">Kart</button>
  </div>
</div>
```

## SEO-regler
- Hver side MÅ ha: <title>, <meta description>, <link rel="canonical">, Schema.org JSON-LD
- H1 skal inneholde søkeord + bynavn
- Seksjonene `seo-section` og `faq-section` er kritiske for SEO – ikke fjern dem

## Nye sider
For å legge til en ny side (f.eks. BotoxBergen.no):
1. Kopier en eksisterende mappe (f.eks. `botoxdrammen/`)
2. Endre alle forekomster av "Drammen" → "Bergen" og "drammen" → "bergen"
3. Oppdater canonical URL, og-tags, og Schema.org
4. Oppdater klinikkdata

## Skalering til nye bransjer
Samme struktur kan brukes for andre bransjer. Bytt ut:
- Søkeord (Botox/Hudpleie/Laser → Tannlege/Frisør/Negl osv.)
- NACE-kode for Brønnøysund-spørringer
- SEO-tekst og FAQ

## Data fra Brønnøysundregistrene
API: `https://data.brreg.no/enhetsregisteret/api/enheter`
Relevante NACE-koder for hudpleie:
- 96.022 – Skjønnhetspleie
- 86.210 – Allmenn legevirksomhet (klinikker med medisinsk estetikk)
Eksempel-spørring: `?naeringskode=96.022&kommunenummer=0602` (Drammen = 0602)
