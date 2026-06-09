# Prosjekt-overlevering til Claude Code

## Hvem er jeg?
Jeg er en ny Claude-bruker som har planlagt et SEO-nettside-økosystem sammen med Claude
i claude.ai chat. Nå ønsker jeg å fortsette arbeidet her i Claude Code, der du kan
gjøre det tekniske arbeidet direkte på maskinen min.

---

## Hva vi har bygget så langt

### Konseptet
Et økosystem av statiske HTML/CSS-nettsider rettet mot hudpleiebransjen i Norge.
Målet er å rangere høyt på Google ved å ha domener som matcher søkeord + stedsnavn,
f.eks. BotoxDrammen.no, HudpleieDrammen.no, LaserDrammen.no.

Sidene lister klinikker hentet fra Brønnøysundregistrenes åpne API, presentert
på en profesjonell og SEO-optimalisert måte. Ingen betalt plassering – kun
objektiv informasjon fra offentlige registre.

### Tekniske valg
- **Teknologi:** Ren statisk HTML/CSS (ingen rammeverk) – raskest for SEO
- **Hosting:** Vercel Pro (bruker har betalt konto)
- **Versjonskontroll:** GitHub (bruker har konto)
- **Automatisering:** Claude Code med GitHub Actions-integrasjon

### Filene som er klare
Brukeren har lastet ned en zip-fil (`hudpleie-nettsider.zip`) med denne strukturen:
```
hudpleie-nettsider/
├── _shared/
│   └── style.css              ← Felles CSS for alle sider (endre her = alle oppdateres)
├── botoxdrammen/
│   └── index.html             ← BotoxDrammen.no
├── hudpleiedrammen/
│   └── index.html             ← HudpleieDrammen.no
├── laserdrammen/
│   └── index.html             ← LaserDrammen.no
├── CLAUDE.md                  ← Prosjektinstruksjoner (viktig – les denne)
├── vercel.json                ← Vercel-konfigurasjon
└── README.md                  ← Oppsettguide
```

### Design og struktur
Alle sider har identisk design og seksjonsstruktur:
1. Header med logo (søkeord + by)
2. Hero-seksjon med H1, beskrivelse og statistikk
3. Intro-seksjon med tre info-bokser
4. Klinikkgrid med klinikkort (data fra Brønnøysund)
5. SEO-tekstseksjon med H2/H3 og relevante søkeord
6. FAQ-seksjon
7. Footer

Kun disse verdiene er unike per side:
- Søkeord (Botox / Hudpleie / Laser)
- By (Drammen / Oslo / Bergen osv.)
- Domenenavn
- Antall klinikker
- Klinikkdata

---

## Hva som gjenstår å gjøre

### Steg 1 – Sett opp GitHub-repo (gjør dette NÅ)
```bash
# Pakk ut zip-filen til en mappe, naviger dit, kjør:
git init
git add .
git commit -m "Første versjon – tre Drammen-sider"
git remote add origin https://github.com/BRUKERNAVN/hudpleie-nettsider.git
git push -u origin main
```

### Steg 2 – Koble Claude Code til GitHub
```bash
claude
/install-github-app
# Velg hudpleie-nettsider-repoet
```

### Steg 3 – Deploy til Vercel
For hvert domene (BotoxDrammen.no, HudpleieDrammen.no, LaserDrammen.no):
1. Vercel → New Project → importer GitHub-repoet
2. Root Directory: velg riktig mappe (f.eks. `botoxdrammen`)
3. Deploy
4. Settings → Domains → legg til domenet
5. Oppdater DNS hos domeneregistrar

### Steg 4 – Hent ekte klinikkdata fra Brønnøysund
API-URL for klinikker i Drammen:
```
https://data.brreg.no/enhetsregisteret/api/enheter?naeringskode=96.022&kommunenummer=0602
```
Relevante NACE-koder:
- `96.022` – Skjønnhetspleie (hudpleie, velvære)
- `86.210` – Allmenn legevirksomhet (klinikker med medisinsk estetikk/botox)

Kommunenummer for aktuelle byer:
- Drammen: `0602`
- Oslo: `0301`
- Bergen: `4601`
- Trondheim: `5001`
- Stavanger: `1103`

Oppgaven: Lag et Python-script `scripts/hent_klinikker.py` som:
1. Henter bedrifter fra API-et basert på NACE-kode og kommunenummer
2. Filtrerer ut aktive bedrifter
3. Genererer ferdige klinikkort-HTML som kan limes inn i index.html-filene
4. Evt. regenererer hele index.html automatisk

### Steg 5 – Skaler til nye byer og søkeord
Når Drammen-sidene er live og fungerer, skal vi lage tilsvarende sider for:
- Oslo (BotoxOslo.no, HudpleieOslo.no, LaserOslo.no)
- Bergen, Trondheim, Stavanger osv.

Lag et script `scripts/generer_side.py` som tar inn søkeord + by og genererer
en komplett ny index.html basert på malen.

### Steg 6 – Fremtidig: Andre bransjer
Samme struktur skal kunne gjenbrukes for andre bransjer, f.eks.:
- Tannlege (TannlegeDrammen.no)
- Frisør (FrisørDrammen.no)
- Negler (NeglDrammen.no)

---

## Viktige prinsipper å følge

1. **Aldri endre HTML-strukturen** – kun innhold og CSS-variabler
2. **All felles styling** i `_shared/style.css` – aldri inline-stiler i HTML
3. **SEO-krav per side:** `<title>`, `<meta description>`, `<link rel="canonical">`,
   Schema.org JSON-LD med ItemList, H1 med søkeord + by
4. **Klinikkort-malen** er definert i `CLAUDE.md` – følg den nøyaktig
5. **Vercel-deploy:** Hver mappe er en selvstendig side med eget domene

---

## Brukerens tekniske nivå
- Ny med Claude og Claude Code
- Har GitHub-konto og Vercel Pro
- Har Claude Code installert og Pro-abonnement
- Foretrekker at Claude Code gjør mest mulig automatisk
- Trenger tydelige instruksjoner når noe må gjøres manuelt

---

## Første oppgave til Claude Code
Hjelp meg å:
1. Pakke ut zip-filen og sette opp GitHub-repoet
2. Koble til Vercel
3. Hente ekte klinikkdata fra Brønnøysund og oppdatere de tre Drammen-sidene
