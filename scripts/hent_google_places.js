#!/usr/bin/env node
'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');

// Load .env without external dependencies
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^([^=#][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  });
}

const API_KEY = process.env.GOOGLE_PLACES_API_KEY;
if (!API_KEY) {
  console.error('Feil: GOOGLE_PLACES_API_KEY mangler. Opprett en .env-fil basert på .env.example.');
  process.exit(1);
}

const SERVICE_TAGS = {
  botox:    ['Botox', 'Fillers', 'Estetisk medisin'],
  hudpleie: ['Hudpleie', 'Ansiktsbehandling', 'Peeling'],
  laser:    ['Laserbehandling', 'Hårfjerning', 'Hudforynging'],
};

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON-parsefeil: ' + e.message + '\nRå respons: ' + data.slice(0, 200))); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function getInitials(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2)
    .map(w => w[0].toUpperCase()).join('');
}

async function textSearch(query) {
  const body = JSON.stringify({
    textQuery: query,
    languageCode: 'no',
    regionCode: 'NO',
    maxResultCount: 5,
  });

  const res = await httpsRequest({
    hostname: 'places.googleapis.com',
    path: '/v1/places:searchText',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'places.id,places.name,places.displayName',
    },
  }, body);

  if (res.error) {
    throw new Error('Places API feil: ' + res.error.message);
  }
  return res.places || [];
}

async function getDetails(resourceName) {
  const res = await httpsRequest({
    hostname: 'places.googleapis.com',
    path: '/v1/' + resourceName,
    method: 'GET',
    headers: {
      'X-Goog-Api-Key': API_KEY,
      'X-Goog-FieldMask': 'displayName,formattedAddress,nationalPhoneNumber,websiteUri',
    },
  });

  if (res.error) {
    throw new Error('Places Details feil for ' + placeId + ': ' + res.error.message);
  }
  return res;
}

function buildClinicCard(place, tags) {
  const name     = place.displayName?.text || 'Ukjent';
  const initials = getInitials(name);
  const addr     = (place.formattedAddress || '').replace(/, (Norge|Norway)$/, '');
  const phone    = place.nationalPhoneNumber || '';
  const web      = place.websiteUri || '';
  const displayWeb = web.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

  const addrRow  = addr  ? `\n          <div class="detail-row">📍 <span>${addr}</span></div>` : '';
  const phoneRow = phone ? `\n          <div class="detail-row">📞 <span>${phone}</span></div>` : '';
  const webRow   = web   ? `\n          <div class="detail-row">🌐 <span>${displayWeb}</span></div>` : '';
  const tagHtml  = tags.map(t => `<span class="service-tag">${t}</span>`).join('\n          ');
  const cta      = web
    ? `<a href="${web}" target="_blank" class="btn-primary">Besøk nettside</a>`
    : `<button class="btn-primary">Se mer</button>`;

  return `      <div class="clinic-card">
        <div class="card-header">
          <div class="clinic-initials">${initials}</div>
        </div>
        <div class="clinic-name">${name}</div>
        <div class="card-details">${addrRow}${phoneRow}${webRow}
        </div>
        <div class="services-row">
          ${tagHtml}
        </div>
        <div class="card-footer">
          ${cta}
          <button class="btn-secondary">Kart</button>
        </div>
      </div>`;
}

function buildLedigCard() {
  return `      <div class="clinic-card clinic-card--available">
        <div class="card-header">
          <div class="clinic-initials">+</div>
        </div>
        <div class="clinic-name">Ledig annonseplass</div>
        <p class="available-text">Ønsker du å vises her? Ta kontakt.</p>
        <div class="card-footer">
          <a href="mailto:Hello@HaraHorn.com" class="btn-primary">Ta kontakt</a>
        </div>
      </div>`;
}

async function main() {
  const [,, sokeord, by] = process.argv;
  if (!sokeord || !by) {
    console.error('Bruk:     node scripts/hent_google_places.js <søkeord> <by>');
    console.error('Eksempel: node scripts/hent_google_places.js botox drammen');
    process.exit(1);
  }

  const sokeordLower = sokeord.toLowerCase();
  const byLower = by.toLowerCase();
  const tags = SERVICE_TAGS[sokeordLower] || [sokeord];

  const htmlPath = path.join(__dirname, '..', `${sokeordLower}${byLower}`, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    console.error('Fant ikke HTML-fil:', htmlPath);
    process.exit(1);
  }

  console.log(`\nSøker Google Places (New): "${sokeord} klinikk ${by}"...`);
  const results = await textSearch(`${sokeord} klinikk ${by}`);

  if (results.length === 0) {
    console.log('Ingen resultater funnet.');
    process.exit(0);
  }

  console.log(`Fant ${results.length} treff. Henter detaljer...\n`);
  const places = [];
  for (const r of results) {
    const details = await getDetails(r.name);
    places.push(details);
    console.log(`  ✓ ${details.displayName?.text}`);
  }

  const cardsHtml = [
    ...places.map(p => buildClinicCard(p, tags)),
    buildLedigCard(),
  ].join('\n\n');

  let html = fs.readFileSync(htmlPath, 'utf8');

  const START = '<!-- KLINIKKER START -->';
  const END   = '<!-- KLINIKKER SLUTT -->';
  if (!html.includes(START) || !html.includes(END)) {
    console.error('Fant ikke markørene <!-- KLINIKKER START/SLUTT --> i', htmlPath);
    process.exit(1);
  }

  html = html.replace(
    new RegExp(START + '[\\s\\S]*?' + END),
    START + '\n\n' + cardsHtml + '\n\n      ' + END
  );

  html = html.replace(
    /<span class="result-count">[^<]*<\/span>/,
    `<span class="result-count">Viser ${places.length} klinikker</span>`
  );

  fs.writeFileSync(htmlPath, html, 'utf8');
  console.log(`\n✅ Ferdig! ${htmlPath} oppdatert med ${places.length} klinikker + 1 ledig plass.`);
}

main().catch(err => {
  console.error('\nFeil:', err.message);
  process.exit(1);
});
