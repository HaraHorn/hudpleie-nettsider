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
- Hver side MÅ ha: <title>, <meta description>, <link rel="canonical">, Schema.org JSON-LD
- H1 skal inneholde søkeord + bynavn
- Seksjonene `seo-section` og `faq-section` er kritiske for SEO – ikke fjern dem

## Nye sider
For å legge til en ny side (f.eks. BotoxBergen.no):
1. Kopier en eksisterende mappe (f.eks. `botoxdrammen/`)
2. Endre alle forekomster av "Drammen" → "Bergen" og "drammen" → "bergen"
3. Oppdater canonical URL, og-tags, og Schema.org
4. Finn 5 ekte klinikker (se prosess nedenfor) og erstatt klinikkdata

## Finn 5 klinikker til en ny side

Hver ny side skal ha **5 ekte, relevante bedrifter + 1 ledig annonseplass** (slot 6).

### Søkeprosess
1. Søk Google: `[søkeord] [by] klinikk`, `[søkeord] [by] behandling`
2. Sjekk 1881.no eller gulesider.no for adresse og telefon
3. Bekreft at nettsiden er aktiv og at tjenesten faktisk tilbys

### Krav til en klinikk for å bli listet
- Har en fungerende nettside
- Tilbyr den spesifikke tjenesten (ikke bare generell skjønnhetspleie)
- Har adresse i den aktuelle byen (eller nær omegn)
- For botox/fillers: behandling skal utføres av autorisert helsepersonell (lege, sykepleier)

### Hva som oppdateres ved ny klinikk
- Legg til kort i `clinics-section` (bruk kortmal ovenfor)
- Oppdater `result-count` span til riktig antall
- Oppdater hero-stat (`.stat-num` under «Klinikker listet»)
- Legg til `LocalBusiness`-oppføring i Schema.org JSON-LD

## Skalering til nye bransjer
Samme struktur kan brukes for andre bransjer. Bytt ut:
- Søkeord (Botox/Hudpleie/Laser → Tannlege/Frisør/Negl osv.)
- SEO-tekst og FAQ
- Finn 5 relevante klinikker via Google-søk (se prosess ovenfor)
