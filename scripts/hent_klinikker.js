/**
 * Henter klinikker fra Brønnøysundregistrene og oppdaterer HTML-filene.
 * Bruk: node scripts/hent_klinikker.js --kommunenavn drammen
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const NACE_KODER = ["96.220", "96.230"];

// Poststeder brukt som filter mot Brønnøysund API
const POSTSTEDER = {
  drammen:   "DRAMMEN",
  oslo:      "OSLO",
  bergen:    "BERGEN",
  trondheim: "TRONDHEIM",
  stavanger: "STAVANGER",
};

const BASE_URL = "https://data.brreg.no/enhetsregisteret/api/enheter";

function hentJSON(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { Accept: "application/json" } }, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on("error", reject);
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function hentAlleForNace(naceKode, poststed) {
  const resultater = [];
  let side = 0;
  process.stdout.write(`  Henter NACE ${naceKode} ...`);

  while (true) {
    const params = new URLSearchParams({
      naeringskode: naceKode,
      "forretningsadresse.poststed": poststed,
      size: 100,
      page: side,
    });
    const url = `${BASE_URL}?${params}`;
    const data = await hentJSON(url);
    const enheter = data?._embedded?.enheter ?? [];
    const totalSider = data?.page?.totalPages ?? 0;

    for (const enhet of enheter) {
      if (enhet.konkurs || enhet.underAvvikling) continue;
      resultater.push(enhet);
    }

    side++;
    if (side >= totalSider) break;
    await sleep(200);
  }

  console.log(` ${resultater.length} treff`);
  return resultater;
}

function lagInitialer(navn) {
  const ord = navn.replace(/"/g, "").split(/\s+/);
  return ord.map((o) => o[0]).filter(Boolean).join("").slice(0, 2).toUpperCase() || "??";
}

function formatAdresse(adr) {
  if (!adr) return "Ikke oppgitt";
  const gate = (adr.adresse ?? []).join(", ");
  return [gate, adr.postnummer, adr.poststed].filter(Boolean).join(" ").trim() || "Ikke oppgitt";
}

function finnTjenester(enhet) {
  const nace = enhet.naeringskode1?.kode ?? "";
  const base = {
    "96.220": ["Hudpleie", "Ansiktsbehandling"],
    "96.230": ["Spa", "Massasje"],
    "86.210": ["Medisinsk estetikk", "Botox"],
  }[nace] ?? ["Skjønnhetspleie"];

  const extra = (enhet.aktivitet ?? [])
    .slice(0, 2)
    .map((a) => a.replace(/\.$/, "").trim())
    .filter((a) => a && !base.includes(a));

  return [...base, ...extra].slice(0, 4);
}

function genererKlinikkort(enhet, verifisert = false) {
  const navn = enhet.navn ?? "Ukjent";
  const orgnrRaa = enhet.organisasjonsnummer ?? "";
  const orgnr = orgnrRaa.length === 9
    ? `${orgnrRaa.slice(0, 3)} ${orgnrRaa.slice(3, 6)} ${orgnrRaa.slice(6)}`
    : orgnrRaa;
  const initialer = lagInitialer(navn);
  const adresse = formatAdresse(enhet.forretningsadresse);
  const telefon = enhet.telefon || enhet.mobil || enhet.verifisering?.telefon_funnet || "Ikke oppgitt";
  const nettside = enhet.nettside_funnet || enhet.hjemmeside || "Ikke oppgitt";
  const tjenester = finnTjenester(enhet);
  const navnTittel = navn.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  const badge = verifisert ? "✓ Verifisert" : "✓ Registrert";
  const badgeKlasse = verifisert ? "verified-badge verified-badge--ok" : "verified-badge";

  const tjenesteTags = tjenester
    .map((t) => `            <span class="service-tag">${t}</span>`)
    .join("\n");

  return `        <div class="clinic-card">
          <div class="card-header">
            <div class="clinic-initials">${initialer}</div>
            <span class="${badgeKlasse}">${badge}</span>
          </div>
          <div class="clinic-name">${navnTittel}</div>
          <div class="clinic-orgnr">Org.nr: ${orgnr}</div>
          <div class="card-details">
            <div class="detail-row">📍 <span>${adresse}</span></div>
            <div class="detail-row">📞 <span>${telefon}</span></div>
            <div class="detail-row">🌐 <span>${nettside}</span></div>
          </div>
          <div class="services-row">
${tjenesteTags}
          </div>
          <div class="card-footer">
            <button class="btn-primary">Se detaljer</button>
            <button class="btn-secondary">Kart</button>
          </div>
        </div>`;
}

// Konfigurasjon per sidetype: hvilke NACE-koder og nøkkelord som er relevante
const SITE_CONFIG = {
  botox:    { nace: ["96.220", "96.230"], nøkkelord: "botox"    },
  laser:    { nace: ["96.220", "96.230"], nøkkelord: "laser"    },
  hudpleie: { nace: ["96.220", "96.230"], nøkkelord: "hudpleie" },
};

async function oppdaterFraEnriched(kommunenavn) {
  const dataMappe = path.join(__dirname, "data");
  const enrichedFil = path.join(dataMappe, `klinikker_${kommunenavn}_enriched.json`);

  if (!fs.existsSync(enrichedFil)) {
    console.error(`Finner ikke ${enrichedFil} – kjør finn_nettsider.js og verifiser_nettsider.js først`);
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(enrichedFil, "utf-8"));
  const rot = path.resolve(__dirname, "..");

  for (const mappe of fs.readdirSync(rot)) {
    if (mappe.startsWith("_") || mappe.startsWith(".")) continue;
    if (!mappe.toLowerCase().includes(kommunenavn.toLowerCase())) continue;

    const mappeLower = mappe.toLowerCase();
    let sidetype = null;
    for (const type of Object.keys(SITE_CONFIG)) {
      if (mappeLower.startsWith(type)) { sidetype = type; break; }
    }
    if (!sidetype) continue;

    const config = SITE_CONFIG[sidetype];
    const filtrert = data.filter(
      (e) =>
        config.nace.includes(e.naeringskode1?.kode) &&
        e.verifisering?.nøkkelord_treff?.[config.nøkkelord] === true
    );
    filtrert.sort((a, b) => a.navn.localeCompare(b.navn));

    const kort = filtrert.map((e) => genererKlinikkort(e, true)).join("\n");
    const htmlFil = path.join(rot, mappe, "index.html");
    if (fs.existsSync(htmlFil)) {
      oppdaterHTML(htmlFil, kort, filtrert.length);
      console.log(`  ${mappe}: ${filtrert.length} verifiserte klinikker`);
    }
  }
}

function oppdaterHTML(htmlFil, klinikkortHTML, antall) {
  let innhold = fs.readFileSync(htmlFil, "utf-8");

  // Erstatt klinikkgrid – bruker unik avslutnings-kontekst som anker
  innhold = innhold.replace(
    /(<div class="clinic-grid">)[\s\S]*?(    <\/div>\n  <\/div>\n<\/section>)/,
    `$1\n\n${klinikkortHTML}\n\n    </div>\n  </div>\n</section>`
  );

  // Oppdater antall i hero-statistikk: <div class="stat-num">12</div>
  innhold = innhold.replace(
    /(<div class="stat-num">)\d+(<\/div>)/,
    `$1${antall}$2`
  );

  // Oppdater result-count
  innhold = innhold.replace(
    /(<span class="result-count">Viser )\d+( klinikker<\/span>)/,
    `$1${antall}$2`
  );

  fs.writeFileSync(htmlFil, innhold, "utf-8");
  console.log(`  Oppdatert: ${htmlFil}`);
}

async function main() {
  const args = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const next = argv[i + 1];
      args[key] = next && !next.startsWith("--") ? (i++, next) : true;
    }
  }

  const kommunenavn = (args.kommunenavn ?? args.by ?? "").toLowerCase();
  let poststed = args.poststed ?? POSTSTEDER[kommunenavn];

  if (!kommunenavn) {
    console.log("Bruk: node scripts/hent_klinikker.js --kommunenavn drammen [--fra-enriched]");
    console.log(`Kjente byer: ${Object.keys(POSTSTEDER).join(", ")}`);
    process.exit(1);
  }

  if ("fra-enriched" in args) {
    console.log(`\nOppdaterer HTML fra enriched data for ${kommunenavn}...`);
    await oppdaterFraEnriched(kommunenavn);
    console.log("\nFerdig!");
    return;
  }

  if (!poststed) poststed = kommunenavn.toUpperCase();

  console.log(`\nHenter klinikker for ${poststed}...`);

  const alle = [];
  for (const nace of NACE_KODER) {
    const treff = await hentAlleForNace(nace, poststed);
    alle.push(...treff);
  }

  // Dedupliser på org.nr
  const sett = new Map();
  for (const e of alle) sett.set(e.organisasjonsnummer, e);
  const unike = [...sett.values()].sort((a, b) => a.navn.localeCompare(b.navn));

  console.log(`\nTotalt ${unike.length} unike klinikker funnet.`);

  // Lagre rådata
  const rot = path.resolve(__dirname, "..");
  const dataMappe = path.join(__dirname, "data");
  if (!fs.existsSync(dataMappe)) fs.mkdirSync(dataMappe, { recursive: true });

  const jsonFil = path.join(dataMappe, `klinikker_${kommunenavn || poststed.toLowerCase()}.json`);
  fs.writeFileSync(jsonFil, JSON.stringify(unike, null, 2), "utf-8");
  console.log(`  Rådata lagret: ${jsonFil}`);

  // Generer HTML-klinikkort
  const alleKort = unike.map(genererKlinikkort).join("\n");

  // Finn og oppdater relevante HTML-filer
  for (const mappe of fs.readdirSync(rot)) {
    if (mappe.startsWith("_") || mappe.startsWith(".")) continue;
    const mappeNavnLower = mappe.toLowerCase();
    if (!kommunenavn || !mappeNavnLower.includes(kommunenavn.toLowerCase())) continue;
    const htmlFil = path.join(rot, mappe, "index.html");
    if (fs.existsSync(htmlFil)) {
      oppdaterHTML(htmlFil, alleKort, unike.length);
    }
  }

  console.log("\nFerdig!");
}

main().catch((err) => {
  console.error("Feil:", err.message);
  process.exit(1);
});
