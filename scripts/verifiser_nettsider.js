/**
 * Fase 2: Sjekk om klinikkenes nettsider faktisk tilbyr relevante tjenester.
 * Bruk: node scripts/verifiser_nettsider.js --kommunenavn drammen
 *
 * Leser klinikker_[kommunenavn]_enriched.json og legger til verifisering-felt.
 * Kan avbrytes og gjenopptas – hopper over allerede behandlede.
 */

const fs = require("fs");
const path = require("path");

const NØKKELORD = {
  botox: [
    "botox", "botulinum", "filler", "fillers", "injeksjon", "estetisk medisin",
    "anti-aging", "rynke", "wrinkle", "estetikk", "estetisk behandling",
  ],
  laser: [
    "laser", "ipl ", "hårfjerning", "epilering", "lysbehandling", "pigment",
    "hudforyngelse", "photoepilation", "laserepilering", "laserklinikk",
  ],
  hudpleie: [
    "hudpleie", "ansiktsbehandling", "peeling", "masker", "ansiktskur",
    "fuktighet", "rens", "eksfoliering", "skjønnhetspleie", "skjønnhetssalong",
    "beauty", "behandling", "spa", "massasje",
  ],
};

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function hentNettside(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(8000),
    headers: {
      "User-Agent": "Mozilla/5.0 (compatible; HudpleieBot/1.0)",
      Accept: "text/html",
      "Accept-Language": "no,nb;q=0.9,en;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = await res.arrayBuffer();
  return Buffer.from(buf).toString("utf-8");
}

function trekkUtTekst(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normaliserTelefon(rånum) {
  const bare = rånum.replace(/\D/g, "");
  if (bare.startsWith("47") && bare.length === 10) return bare.slice(2);
  if (bare.length === 8) return bare;
  return null;
}

function trekkUtTelefon(html) {
  // 1. tel:-lenker er mest pålitelige (brukes av de fleste norske nettsider)
  const telLenke = html.match(/href=["']tel:([^"']+)["']/i);
  if (telLenke) {
    const num = normaliserTelefon(telLenke[1]);
    if (num) return num;
  }

  // 2. Vanlig norsk mobilnummer (4xx eller 9xx) i tekst – kun 8 sifre
  const mobilMønster = /\b([49]\d[\s\-.]?\d{2}[\s\-.]?\d{2}[\s\-.]?\d{2})\b/g;
  let match;
  while ((match = mobilMønster.exec(html)) !== null) {
    const num = normaliserTelefon(match[1]);
    if (num) return num;
  }

  // 3. +47-prefiks fulgt av 8 sifre
  const internasjonalt = html.match(/\+47[\s\-.]?(\d[\s\-.]?\d[\s\-.]?\d{2}[\s\-.]?\d{2}[\s\-.]?\d{2})/);
  if (internasjonalt) {
    const num = normaliserTelefon(internasjonalt[1]);
    if (num) return num;
  }

  return null;
}

function sjekkNøkkelord(tekst) {
  const treff = {};
  for (const [side, ord] of Object.entries(NØKKELORD)) {
    const funnet = ord.filter((o) => tekst.includes(o));
    treff[side] = funnet.length > 0;
  }
  return treff;
}

async function verifiserEnhet(enhet) {
  const url = enhet.nettside_funnet;
  if (!url) return { status: "INGEN_URL", nøkkelord_treff: null, telefon_funnet: null };

  try {
    const html = await hentNettside(url);
    const tekst = trekkUtTekst(html);
    const nøkkelord_treff = sjekkNøkkelord(tekst);
    const harTreff = Object.values(nøkkelord_treff).some(Boolean);

    // Hent telefon fra nettsiden hvis ikke registrert i Brønnøysund
    const manglerTelefon = !enhet.telefon && !enhet.mobil;
    const telefon_funnet = manglerTelefon ? trekkUtTelefon(html) : null;

    return { status: harTreff ? "VERIFISERT" : "IKKE_TREFF", nøkkelord_treff, telefon_funnet };
  } catch (e) {
    return { status: "FEIL", feilmelding: e.message, nøkkelord_treff: null, telefon_funnet: null };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--kommunenavn");
  const kommunenavn = (idx >= 0 ? args[idx + 1] : "drammen").toLowerCase();

  const dataMappe = path.join(__dirname, "data");
  const enrichedFil = path.join(dataMappe, `klinikker_${kommunenavn}_enriched.json`);

  if (!fs.existsSync(enrichedFil)) {
    console.error(`Finner ikke ${enrichedFil} – kjør finn_nettsider.js først`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(enrichedFil, "utf-8"));
  const ubehandlet = data.filter((e) => !e.verifisering?.status && e.nettside_funnet);
  console.log(`\nVerifiserer ${ubehandlet.length} nettsider (${data.length} totalt)...`);

  let verifisert = 0, ikkeTreff = 0, feil = 0, ingenUrl = 0;

  for (let i = 0; i < data.length; i++) {
    const enhet = data[i];

    // Allerede behandlet
    if (enhet.verifisering?.status) {
      const s = enhet.verifisering.status;
      if (s === "VERIFISERT") verifisert++;
      else if (s === "IKKE_TREFF") ikkeTreff++;
      else if (s === "FEIL") feil++;
      else ingenUrl++;
      continue;
    }

    if (!enhet.nettside_funnet) {
      data[i] = { ...enhet, verifisering: { status: "INGEN_URL", nøkkelord_treff: null } };
      ingenUrl++;
      continue;
    }

    const resultat = await verifiserEnhet(enhet);
    data[i] = { ...enhet, verifisering: resultat };

    const s = resultat.status;
    if (s === "VERIFISERT") verifisert++;
    else if (s === "IKKE_TREFF") ikkeTreff++;
    else feil++;

    const treffStr = resultat.nøkkelord_treff
      ? Object.entries(resultat.nøkkelord_treff)
          .filter(([, v]) => v)
          .map(([k]) => k)
          .join(", ") || "–"
      : "–";
    const navn = enhet.navn.slice(0, 35).padEnd(35);
    console.log(`[${String(i + 1).padStart(3)}] ${s.padEnd(11)} ${navn} ${treffStr}`);

    if (i % 5 === 0) {
      fs.writeFileSync(enrichedFil, JSON.stringify(data, null, 2), "utf-8");
    }
    await sleep(300);
  }

  fs.writeFileSync(enrichedFil, JSON.stringify(data, null, 2), "utf-8");

  console.log(`\nResultat:`);
  console.log(`  VERIFISERT:  ${verifisert}`);
  console.log(`  IKKE_TREFF:  ${ikkeTreff}`);
  console.log(`  FEIL:        ${feil}`);
  console.log(`  INGEN_URL:   ${ingenUrl}`);
  console.log(`\n  Lagret: ${enrichedFil}`);
  console.log(`  Kjør neste: node scripts/hent_klinikker.js --kommunenavn ${kommunenavn} --fra-enriched`);
}

main().catch((err) => {
  console.error("Feil:", err.message);
  process.exit(1);
});
