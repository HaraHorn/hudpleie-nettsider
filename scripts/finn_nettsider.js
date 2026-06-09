/**
 * Fase 1: Finn nettsider for klinikker via Brønnøysund-data + DuckDuckGo-søk.
 * Bruk: node scripts/finn_nettsider.js --kommunenavn drammen
 *
 * Output: scripts/data/klinikker_[kommunenavn]_enriched.json
 * Kan avbrytes og gjenopptas – lagrer underveis hvert 10. selskap.
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const RELEVANTE_NACE = ["96.220", "96.230"];

const UTELAT_DOMENER = [
  "brreg.no", "proff.no", "1881.no", "gulesider.no", "finn.no",
  "linkedin.com", "google.", "wikipedia.org", "bedin.no", "purehelp.no",
  "allabolag.se", "retriever.no", "virksomheter.no", "enhetsregisteret",
  "ssb.no", "regjeringen.no", "yelp.com", "foursquare.com",
];

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function hentHTML(url, dybde = 0) {
  return new Promise((resolve, reject) => {
    if (dybde > 3) return reject(new Error("for mange redirects"));
    let parsed;
    try { parsed = new URL(url); } catch { return reject(new Error("ugyldig URL")); }

    const req = https.get(
      {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120",
          Accept: "text/html,application/xhtml+xml",
          "Accept-Language": "no,nb;q=0.9,en;q=0.8",
        },
        timeout: 10000,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          let loc = res.headers.location;
          if (loc.startsWith("/")) loc = `${parsed.protocol}//${parsed.hostname}${loc}`;
          hentHTML(loc, dybde + 1).then(resolve).catch(reject);
          return;
        }
        let data = "";
        res.on("data", (c) => { data += c; if (data.length > 300_000) req.destroy(); });
        res.on("end", () => resolve(data));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function erUtelattDomene(url) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return UTELAT_DOMENER.some((d) => hostname.includes(d));
  } catch {
    return true;
  }
}

async function soekDuckDuckGo(søkestreng) {
  const q = encodeURIComponent(søkestreng);
  try {
    const html = await hentHTML(`https://html.duckduckgo.com/html/?q=${q}`);
    const regex = /href="\/l\/\?uddg=([^&"]+)/g;
    let match;
    while ((match = regex.exec(html)) !== null) {
      try {
        const funnetUrl = decodeURIComponent(match[1]);
        if (funnetUrl.startsWith("http") && !erUtelattDomene(funnetUrl)) {
          const u = new URL(funnetUrl);
          return u.origin + "/";
        }
      } catch {
        continue;
      }
    }
  } catch {
    // Ignorer søkefeil
  }
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const idx = args.indexOf("--kommunenavn");
  const kommunenavn = (idx >= 0 ? args[idx + 1] : "drammen").toLowerCase();
  const by = kommunenavn.charAt(0).toUpperCase() + kommunenavn.slice(1);

  const dataMappe = path.join(__dirname, "data");
  const inputFil = path.join(dataMappe, `klinikker_${kommunenavn}.json`);
  const outputFil = path.join(dataMappe, `klinikker_${kommunenavn}_enriched.json`);

  if (!fs.existsSync(inputFil)) {
    console.error(`Finner ikke ${inputFil}`);
    process.exit(1);
  }

  const alle = JSON.parse(fs.readFileSync(inputFil, "utf-8"));
  const relevante = alle.filter((e) => RELEVANTE_NACE.includes(e.naeringskode1?.kode));
  console.log(`\nBehandler ${relevante.length} klinikker (${RELEVANTE_NACE.join(", ")})...`);

  // Gjenopptak: last inn tidligere enriched data
  const tidligereData = {};
  if (fs.existsSync(outputFil)) {
    const prev = JSON.parse(fs.readFileSync(outputFil, "utf-8"));
    for (const e of prev) {
      if (e.nettside_kilde !== undefined) tidligereData[e.organisasjonsnummer] = e;
    }
    if (Object.keys(tidligereData).length > 0) {
      console.log(`  Gjenopptar – ${Object.keys(tidligereData).length} allerede behandlet`);
    }
  }

  const enriched = [];
  let antallBrreg = 0, antallWebsøk = 0, antallIngen = 0;

  for (let i = 0; i < relevante.length; i++) {
    const enhet = relevante[i];
    const orgnr = enhet.organisasjonsnummer;

    if (tidligereData[orgnr]) {
      enriched.push(tidligereData[orgnr]);
      continue;
    }

    let nettside_kilde = null;
    let nettside_funnet = null;

    if (enhet.hjemmeside) {
      nettside_kilde = "brreg";
      nettside_funnet = enhet.hjemmeside.startsWith("http") ? enhet.hjemmeside : `https://${enhet.hjemmeside}`;
      antallBrreg++;
      console.log(`[${i + 1}/${relevante.length}] BRREG   ${enhet.navn}: ${nettside_funnet}`);
    } else {
      await sleep(1500);
      nettside_funnet = await soekDuckDuckGo(`"${enhet.navn}" ${by}`);
      if (nettside_funnet) {
        nettside_kilde = "websøk";
        antallWebsøk++;
        console.log(`[${i + 1}/${relevante.length}] WEBSØK  ${enhet.navn}: ${nettside_funnet}`);
      } else {
        antallIngen++;
        console.log(`[${i + 1}/${relevante.length}] INGEN   ${enhet.navn}`);
      }
    }

    enriched.push({ ...enhet, nettside_kilde, nettside_funnet });

    if (enriched.length % 10 === 0) {
      fs.writeFileSync(outputFil, JSON.stringify(enriched, null, 2), "utf-8");
    }
  }

  fs.writeFileSync(outputFil, JSON.stringify(enriched, null, 2), "utf-8");

  console.log(`\nFerdig!`);
  console.log(`  Fra Brønnøysund:  ${antallBrreg}`);
  console.log(`  Fra DuckDuckGo:   ${antallWebsøk}`);
  console.log(`  Ingen funnet:     ${antallIngen}`);
  console.log(`\n  Lagret: ${outputFil}`);
  console.log(`  Kjør neste: node scripts/verifiser_nettsider.js --kommunenavn ${kommunenavn}`);
}

main().catch((err) => {
  console.error("Feil:", err.message);
  process.exit(1);
});
