# Hudpleie Nettsider

Økosystem av statiske SEO-sider for hudpleiebransjen i Norge.

## Sider i prosjektet
| Domene | Søkeord | By | Status |
|---|---|---|---|
| BotoxDrammen.no | Botox | Drammen | ✅ Klar |
| HudpleieDrammen.no | Hudpleie | Drammen | ✅ Klar |
| LaserDrammen.no | Laser | Drammen | ✅ Klar |

## Teknisk oppsett

### Krav
- Ingen! Ren HTML/CSS, ingen rammeverk

### Lokal forhåndsvisning
Åpne hvilken som helst `index.html` direkte i nettleseren, eller bruk:
```bash
npx serve .
```

## Deploy til Vercel

### Første gang (per domene)
1. Gå til [vercel.com](https://vercel.com) → New Project
2. Importer dette GitHub-repoet
3. Under **Root Directory**, velg f.eks. `botoxdrammen`
4. Klikk Deploy
5. Gå til Settings → Domains → legg til `botoxdrammen.no`
6. Oppdater DNS hos din domeneregistrar

Gjenta for hvert domene.

### Automatisk deploy
Hver gang du pusher til `main`-branchen deployer Vercel automatisk alle sider.

## Claude Code GitHub-integrasjon

### Installer GitHub-appen (én gang)
```bash
claude
/install-github-app
```
Velg dette repoet og følg instruksjonene.

### Be Claude Code gjøre endringer
Etter oppsett kan du tagge `@claude` i et GitHub-issue:
```
@claude Oppdater alle klinikkort til å vise åpningstider
```
Claude Code lager en pull request med endringene automatisk.

## Oppdatere klinikkdata fra Brønnøysund

API-eksempel for klinikker i Drammen (NACE 96.022):
```
https://data.brreg.no/enhetsregisteret/api/enheter?naeringskode=96.022&kommunenummer=0602
```

## Legge til ny side

```bash
cp -r botoxdrammen/ botoxbergen/
# Rediger botoxbergen/index.html – bytt ut Drammen → Bergen
```

## Legge til ny bransje
Se `CLAUDE.md` for instruksjoner.
