#!/usr/bin/env node
'use strict';

// Samlet klikk-rapport: hvor mange klikk har hver klinikk fått fra sidene våre?
//
// Leser GA4-eventene som sidene sender:
//   klinikk_klikk       – klikk på «Besøk nettside»
//   klinikk_kart_klikk  – klikk på «Kart»
// fra ALLE GA4-properties (én per side) og lager én samlet rapport (HTML + CSV).
//
// Kjør:    node scripts/klikk_rapport.js [--dager 30] [--fra 2026-09-01 --til 2026-09-30] [--ut rapporter] [--pdf]
//          --pdf lager også en PDF (bruker Edge/Chrome i usynlig modus; sett CHROME_PATH i .env hvis den ikke finnes automatisk)
// Engangsoppsett (se også CLAUDE.md → «Klikk-rapport»):
//   node scripts/klikk_rapport.js --opprett-dimensjoner
//     oppretter custom dimension «klinikk_navn» i alle properties som mangler den
//     (krever at tjenestekontoen har Editor-rolle; kjøres kun én gang).
//
// Krever GA_SERVICE_ACCOUNT_FILE i .env (sti til JSON-nøkkel for en Google-tjenestekonto),
// og at «Google Analytics Data API» + «Google Analytics Admin API» er aktivert i samme Cloud-prosjekt.
// Ingen eksterne avhengigheter.

const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');
const { execFile } = require('child_process');
const { pathToFileURL } = require('url');

const ROOT = path.join(__dirname, '..');

const EVENT_WEB = 'klinikk_klikk';
const EVENT_MAP = 'klinikk_kart_klikk';
const DIMENSION = 'klinikk_navn';
const SCOPE_READ = 'https://www.googleapis.com/auth/analytics.readonly';
const SCOPE_EDIT = 'https://www.googleapis.com/auth/analytics.edit';
const NO_NAME = '(ukjent klinikk)';
const KEYWORD_ORDER = ['botox', 'hudpleie', 'laser'];

// ─── .env ────────────────────────────────────────────────────────────────────

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^([^=#][^=]*)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim();
  });
}

// ─── Argumenter ──────────────────────────────────────────────────────────────

const USAGE = `Bruk: node scripts/klikk_rapport.js [valg]

  --dager N               Siste N dager (standard 30)
  --fra YYYY-MM-DD        Startdato (sammen med --til, overstyrer --dager)
  --til YYYY-MM-DD        Sluttdato
  --ut MAPPE              Hvor rapporten lagres (standard: rapporter/)
  --pdf                   Lag også en PDF av rapporten (krever Edge eller Chrome installert)
  --opprett-dimensjoner   Opprett custom dimension «${DIMENSION}» i alle properties som mangler den, og avslutt
  --hjelp                 Vis denne hjelpen`;

function parseArgs(argv) {
  const args = { dager: 30, fra: null, til: null, ut: 'rapporter', pdf: false, opprettDimensjoner: false, hjelp: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => {
      if (i + 1 >= argv.length) throw new Error(`Mangler verdi etter ${a}`);
      return argv[++i];
    };
    if (a === '--dager') args.dager = Number(next());
    else if (a === '--fra') args.fra = next();
    else if (a === '--til') args.til = next();
    else if (a === '--ut') args.ut = next();
    else if (a === '--pdf') args.pdf = true;
    else if (a === '--opprett-dimensjoner') args.opprettDimensjoner = true;
    else if (a === '--hjelp' || a === '-h') args.hjelp = true;
    else throw new Error(`Ukjent valg: ${a}\n\n${USAGE}`);
  }
  if (!Number.isInteger(args.dager) || args.dager < 1 || args.dager > 3650) {
    throw new Error('--dager må være et helt tall mellom 1 og 3650');
  }
  const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s);
  if (args.fra || args.til) {
    if (!args.fra || !args.til) throw new Error('--fra og --til må brukes sammen');
    if (!isDate(args.fra) || !isDate(args.til)) throw new Error('Datoer må være på formen YYYY-MM-DD');
    if (args.fra > args.til) throw new Error('--fra kan ikke være etter --til');
  }
  return args;
}

function dateRange(args, now = new Date()) {
  const iso = d => d.toISOString().slice(0, 10);
  if (args.fra) return { startDate: args.fra, endDate: args.til, label: `${args.fra} – ${args.til}` };
  const start = new Date(now.getTime() - args.dager * 86400000);
  return {
    startDate: `${args.dager}daysAgo`,
    endDate: 'today',
    label: `siste ${args.dager} dager (${iso(start)} – ${iso(now)})`,
  };
}

// ─── Finn sidene ─────────────────────────────────────────────────────────────

function decodeEntities(s) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

// GA4 rapporterer vertsnavn slik nettleseren sender det (punycode for æøå), så begge sider normaliseres.
function normHost(h) {
  try { return new URL('https://' + h).hostname; } catch { return String(h).toLowerCase(); }
}

function discoverSites(root = ROOT) {
  const sites = [];
  for (const d of fs.readdirSync(root, { withFileTypes: true })) {
    if (!d.isDirectory() || /^[_.{]/.test(d.name)) continue;
    const file = path.join(root, d.name, 'index.html');
    if (!fs.existsSync(file)) continue;
    const html = fs.readFileSync(file, 'utf8');

    const folderMatch = d.name.match(/^(botox|hudpleie|laser)(.+)$/);
    const keyword = folderMatch ? folderMatch[1] : d.name;
    const city = decodeEntities((html.match(/<div class="hero-tag">([^<]*?)\s*&amp;\s*omegn<\/div>/) || [])[1] ||
      (folderMatch ? folderMatch[2][0].toUpperCase() + folderMatch[2].slice(1) : d.name));
    const domain = (html.match(/<link rel="canonical" href="https?:\/\/([^\/"]+)\/?"/) || [])[1] || d.name;
    const measurementId = (html.match(/var ID='([^']*)'/) || [])[1] || '';
    const validId = /^G-[A-Z0-9]{10}$/.test(measurementId);

    const clinics = [];
    const seen = new Set();
    for (const m of html.matchAll(/data-klinikk(?:-kart)?="([^"]*)"/g)) {
      const name = decodeEntities(m[1]).trim();
      if (name && !seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); clinics.push(name); }
    }

    sites.push({
      folder: d.name,
      keyword,
      city,
      domain,
      hostnames: [normHost(domain), normHost('www.' + domain)],
      measurementId,
      clinics,
      active: validId,
      inactiveReason: validId ? '' : `Ingen gyldig GA4-ID (${measurementId || 'mangler'})`,
    });
  }
  sites.sort((a, b) => a.city.localeCompare(b.city, 'nb') ||
    KEYWORD_ORDER.indexOf(a.keyword) - KEYWORD_ORDER.indexOf(b.keyword));
  return sites;
}

// ─── HTTP + Google-autentisering ─────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

function request(method, url, { token, body, form } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = form ? new URLSearchParams(form).toString() : body ? JSON.stringify(body) : null;
    const headers = {};
    if (token) headers.Authorization = 'Bearer ' + token;
    if (payload) {
      headers['Content-Type'] = form ? 'application/x-www-form-urlencoded' : 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload);
    }
    const req = https.request({ hostname: u.hostname, path: u.pathname + u.search, method, headers }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        let json = null;
        try { json = JSON.parse(data); } catch { /* ikke-JSON svar */ }
        resolve({ status: res.statusCode, json, text: data });
      });
    });
    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

// Prøver på nytt ved 429/5xx (kvote- og forbigående feil).
async function call(method, url, opts) {
  for (let attempt = 0; ; attempt++) {
    const res = await request(method, url, opts);
    if ((res.status === 429 || res.status >= 500) && attempt < 3) {
      await sleep(1000 * 2 ** attempt);
      continue;
    }
    return res;
  }
}

function apiError(res, what) {
  const msg = (res.json && res.json.error && res.json.error.message) || res.text.slice(0, 300);
  const err = new Error(`${what}: HTTP ${res.status} – ${msg}`);
  err.status = res.status;
  err.apiMessage = msg;
  return err;
}

function loadServiceAccount() {
  const file = process.env.GA_SERVICE_ACCOUNT_FILE;
  if (!file) {
    throw new Error('GA_SERVICE_ACCOUNT_FILE mangler i .env. Se «Klikk-rapport» i CLAUDE.md for oppsett.');
  }
  const abs = path.isAbsolute(file) ? file : path.join(ROOT, file);
  if (!fs.existsSync(abs)) throw new Error(`Finner ikke nøkkelfilen: ${abs}`);
  const sa = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if (!sa.client_email || !sa.private_key) {
    throw new Error('Nøkkelfilen mangler client_email/private_key – er det en JSON-nøkkel for en tjenestekonto?');
  }
  return sa;
}

const b64url = x => Buffer.from(x).toString('base64url');

function makeJwt(sa, scopes, now = Math.floor(Date.now() / 1000)) {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: scopes.join(' '),
    aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const signature = crypto.createSign('RSA-SHA256').update(`${header}.${claims}`).sign(sa.private_key, 'base64url');
  return `${header}.${claims}.${signature}`;
}

async function getAccessToken(sa, scopes) {
  const res = await call('POST', sa.token_uri || 'https://oauth2.googleapis.com/token', {
    form: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: makeJwt(sa, scopes) },
  });
  if (res.status !== 200 || !res.json || !res.json.access_token) throw apiError(res, 'Innlogging hos Google feilet');
  return res.json.access_token;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

// ─── Google Analytics API ────────────────────────────────────────────────────

const ADMIN = 'https://analyticsadmin.googleapis.com/v1beta';
const DATA = 'https://analyticsdata.googleapis.com/v1beta';

async function paged(url, listKey, token, what) {
  const items = [];
  let pageToken = '';
  do {
    const sep = url.includes('?') ? '&' : '?';
    const res = await call('GET', `${url}${sep}pageSize=200${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`, { token });
    if (res.status !== 200) throw apiError(res, what);
    items.push(...((res.json && res.json[listKey]) || []));
    pageToken = (res.json && res.json.nextPageToken) || '';
  } while (pageToken);
  return items;
}

// Returnerer Map: målings-ID (G-XXXX) → { id, name } for alle properties tjenestekontoen har tilgang til.
async function listPropertiesByMeasurementId(token) {
  const summaries = await paged(`${ADMIN}/accountSummaries`, 'accountSummaries', token, 'Henting av GA4-kontoer');
  const props = summaries.flatMap(a => (a.propertySummaries || []).map(p => ({
    id: p.property.replace('properties/', ''),
    name: p.displayName,
  })));
  const byMeasurementId = new Map();
  await mapLimit(props, 5, async p => {
    const streams = await paged(`${ADMIN}/properties/${p.id}/dataStreams`, 'dataStreams', token, `Datastrømmer for property ${p.id}`);
    for (const s of streams) {
      const mid = s.webStreamData && s.webStreamData.measurementId;
      if (mid) byMeasurementId.set(mid, p);
    }
  });
  return byMeasurementId;
}

async function fetchClicks(token, propertyId, range) {
  const res = await call('POST', `${DATA}/properties/${propertyId}:runReport`, {
    token,
    body: {
      dateRanges: [{ startDate: range.startDate, endDate: range.endDate }],
      dimensions: [{ name: 'eventName' }, { name: `customEvent:${DIMENSION}` }, { name: 'hostName' }],
      metrics: [{ name: 'eventCount' }],
      dimensionFilter: { filter: { fieldName: 'eventName', inListFilter: { values: [EVENT_WEB, EVENT_MAP] } } },
      limit: 10000,
    },
  });
  if (res.status !== 200) {
    const err = apiError(res, `Rapport for property ${propertyId}`);
    err.missingDimension = res.status === 400 && new RegExp(DIMENSION).test(err.apiMessage);
    throw err;
  }
  return ((res.json && res.json.rows) || []).map(r => ({
    event: r.dimensionValues[0].value,
    clinic: r.dimensionValues[1].value,
    host: r.dimensionValues[2].value,
    count: Number(r.metricValues[0].value) || 0,
  }));
}

async function ensureDimension(token, propertyId) {
  const existing = await paged(`${ADMIN}/properties/${propertyId}/customDimensions`, 'customDimensions', token, `Custom dimensions for property ${propertyId}`);
  if (existing.some(d => d.parameterName === DIMENSION)) return 'fantes';
  const res = await call('POST', `${ADMIN}/properties/${propertyId}/customDimensions`, {
    token,
    body: {
      parameterName: DIMENSION,
      displayName: 'Klinikknavn',
      description: 'Navn på klinikken det ble klikket på (klinikk_klikk og klinikk_kart_klikk)',
      scope: 'EVENT',
    },
  });
  if (res.status !== 200) throw apiError(res, `Oppretting av dimensjon i property ${propertyId}`);
  return 'opprettet';
}

// ─── Aggregering ─────────────────────────────────────────────────────────────

const keyOf = name => name.trim().toLowerCase();

// results: Map folder → { status: 'ok'|'ingen_property'|'mangler_dimensjon'|'feil', rows?, message? }
function buildReport(sites, results) {
  const warnings = [];
  const siteReports = [];
  const byClinic = new Map();
  let excludedHostClicks = 0;

  for (const site of sites) {
    const res = site.active ? (results.get(site.folder) || { status: 'feil', message: 'Ingen resultat' })
      : { status: 'inaktiv', message: site.inactiveReason };

    const clinics = new Map();
    const entry = name => {
      if (!clinics.has(keyOf(name))) clinics.set(keyOf(name), { name, nettside: 0, kart: 0, listed: false });
      return clinics.get(keyOf(name));
    };

    if (res.status === 'ok') {
      site.clinics.forEach(n => { entry(n).listed = true; });
      for (const row of res.rows) {
        if (!site.hostnames.includes(normHost(row.host))) { excludedHostClicks += row.count; continue; }
        const name = row.clinic && row.clinic !== '(not set)' ? row.clinic : NO_NAME;
        const c = entry(name);
        if (row.event === EVENT_MAP) c.kart += row.count; else c.nettside += row.count;
      }
    } else {
      warnings.push(`${site.domain}: ${res.message}`);
    }

    const list = [...clinics.values()].map(c => ({ ...c, total: c.nettside + c.kart }))
      .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'nb'));
    const totals = list.reduce((t, c) => ({ nettside: t.nettside + c.nettside, kart: t.kart + c.kart }), { nettside: 0, kart: 0 });
    siteReports.push({ site, status: res.status, message: res.message || '', clinics: list, totals: { ...totals, total: totals.nettside + totals.kart } });

    for (const c of list) {
      const k = keyOf(c.name);
      if (!byClinic.has(k)) byClinic.set(k, { name: c.name, nettside: 0, kart: 0, total: 0, sites: [] });
      const agg = byClinic.get(k);
      agg.nettside += c.nettside; agg.kart += c.kart; agg.total += c.total;
      agg.sites.push({ domain: site.domain, nettside: c.nettside, kart: c.kart, total: c.total });
    }
  }

  if (excludedHostClicks > 0) {
    warnings.push(`${excludedHostClicks} klikk fra andre vertsnavn (f.eks. forhåndsvisninger/localhost) er holdt utenfor.`);
  }

  const clinics = [...byClinic.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name, 'nb'));
  const totals = clinics.reduce((t, c) => ({ nettside: t.nettside + c.nettside, kart: t.kart + c.kart }), { nettside: 0, kart: 0 });
  return {
    siteReports,
    clinics,
    warnings,
    totals: { ...totals, total: totals.nettside + totals.kart },
    clinicsWithClicks: clinics.filter(c => c.total > 0).length,
    sitesWithData: siteReports.filter(s => s.status === 'ok').length,
  };
}

// ─── Utskrift: CSV og HTML ───────────────────────────────────────────────────

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const nf = n => new Intl.NumberFormat('nb-NO').format(n);

function renderCsv(report) {
  const cell = v => {
    const s = String(v);
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [['Side', 'By', 'Søkeord', 'Klinikk', 'Nettside-klikk', 'Kart-klikk', 'Totalt'].join(';')];
  for (const sr of report.siteReports) {
    if (sr.status !== 'ok') continue;
    for (const c of sr.clinics) {
      lines.push([sr.site.domain, sr.site.city, sr.site.keyword, c.name, c.nettside, c.kart, c.total].map(cell).join(';'));
    }
  }
  return '﻿' + lines.join('\r\n') + '\r\n'; // BOM så Excel leser æøå riktig
}

const CSS = `
:root{color-scheme:light dark;--bg:#faf8f5;--fg:#2a2420;--muted:#7a6f66;--card:#fff;--line:#e6dfd6;--accent:#8b6b4a;--warn-bg:#fff4e0;--warn-line:#e8c27a}
@media (prefers-color-scheme:dark){:root{--bg:#1d1a17;--fg:#efe9e2;--muted:#a89d92;--card:#272320;--line:#3a342f;--accent:#c9a57e;--warn-bg:#332a18;--warn-line:#7a6030}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px 16px}
main{max-width:1000px;margin:0 auto}
h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 10px}
.sub{color:var(--muted);margin:0 0 20px}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:8px}
.card{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:14px 16px}
.card b{display:block;font-size:26px;color:var(--accent)}.card span{color:var(--muted);font-size:13px}
.warn{background:var(--warn-bg);border:1px solid var(--warn-line);border-radius:10px;padding:12px 16px;margin:16px 0}
.warn ul{margin:6px 0 0;padding-left:20px}
.note{color:var(--muted);font-size:13px;margin-top:6px}
.tablewrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:10px}
table{border-collapse:collapse;width:100%}
th,td{padding:8px 12px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap}
td.n,th.n{text-align:right;font-variant-numeric:tabular-nums}
th{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--muted);cursor:pointer;user-select:none}
tbody tr:last-child td{border-bottom:0}
td.name{white-space:normal;min-width:200px}
.sites{color:var(--muted);font-size:12px;white-space:normal}
.tag{font-size:11px;color:var(--muted);border:1px solid var(--line);border-radius:999px;padding:1px 8px;margin-left:6px}
details{background:var(--card);border:1px solid var(--line);border-radius:10px;margin-bottom:8px}
summary{padding:10px 16px;cursor:pointer;display:flex;gap:12px;justify-content:space-between;flex-wrap:wrap}
summary .meta{color:var(--muted)}
details .tablewrap{border:0;border-top:1px solid var(--line);border-radius:0}
@page{size:A4;margin:14mm}
@media print{
*{-webkit-print-color-adjust:exact;print-color-adjust:exact}
body{padding:0;font-size:11px}
th,td{white-space:normal;padding:4px 8px}
.tablewrap{overflow:visible}
thead{display:table-header-group}
tr,details{break-inside:avoid}
h2{break-after:avoid}
.sub,.note{font-size:11px}
.cards{grid-template-columns:repeat(4,1fr);gap:8px}
.card{padding:10px 12px}
.card b{font-size:20px}
.card span{font-size:11px}
}
`;

// Ren JS uten malstrenger, så den kan ligge trygt i en vanlig streng.
const SORT_JS = `
document.querySelectorAll('table.sortable').forEach(function(t){
  t.querySelectorAll('th').forEach(function(th,i){
    th.addEventListener('click',function(){
      var asc=th.getAttribute('data-asc')!=='1';
      th.setAttribute('data-asc',asc?'1':'0');
      var tb=t.tBodies[0],rows=[].slice.call(tb.rows),num=th.classList.contains('n');
      rows.sort(function(a,b){
        var x=a.cells[i].getAttribute('data-v'),y=b.cells[i].getAttribute('data-v');
        if(x===null){x=a.cells[i].textContent;y=b.cells[i].textContent;}
        if(num){return asc?x-y:y-x;}
        return asc?x.localeCompare(y,'nb'):y.localeCompare(x,'nb');
      });
      rows.forEach(function(r){tb.appendChild(r);});
    });
  });
});`;

// forPrint: alle «per side»-seksjoner åpnes, siden lukkede <details> ikke havner i en PDF.
function renderHtml(report, rangeLabel, generated = new Date(), { forPrint = false } = {}) {
  const openAttr = forPrint ? ' open' : '';
  const numCell = n => `<td class="n" data-v="${n}">${nf(n)}</td>`;
  const header = cols => `<thead><tr>${cols.map(([t, num]) => `<th${num ? ' class="n"' : ''}>${esc(t)}</th>`).join('')}</tr></thead>`;

  const clinicRows = report.clinics.map(c => {
    const where = c.sites.filter(s => s.total > 0).map(s => `${esc(s.domain)} (${nf(s.total)})`).join(', ') ||
      c.sites.map(s => esc(s.domain)).join(', ');
    return `<tr><td class="name" data-v="${esc(c.name)}">${esc(c.name)}<div class="sites">${where}</div></td>` +
      `${numCell(c.nettside)}${numCell(c.kart)}${numCell(c.total)}</tr>`;
  }).join('\n');

  const siteSections = report.siteReports.map(sr => {
    const title = `<span><strong>${esc(sr.site.domain)}</strong> <span class="meta">· ${esc(sr.site.city)} · ${esc(sr.site.keyword)}</span></span>`;
    if (sr.status !== 'ok') {
      return `<details${openAttr}><summary>${title}<span class="meta">Ikke med: ${esc(sr.message)}</span></summary></details>`;
    }
    const rows = sr.clinics.map(c => `<tr><td class="name" data-v="${esc(c.name)}">${esc(c.name)}${c.listed ? '' : '<span class="tag">ikke lenger på siden</span>'}</td>` +
      `${numCell(c.nettside)}${numCell(c.kart)}${numCell(c.total)}</tr>`).join('\n');
    return `<details${openAttr}><summary>${title}<span class="meta">${nf(sr.totals.nettside)} nettside · ${nf(sr.totals.kart)} kart · ${nf(sr.totals.total)} totalt</span></summary>` +
      `<div class="tablewrap"><table class="sortable">${header([['Klinikk'], ['Nettside', 1], ['Kart', 1], ['Totalt', 1]])}<tbody>${rows}</tbody></table></div></details>`;
  }).join('\n');

  const warnings = report.warnings.length
    ? `<div class="warn"><strong>Merk</strong><ul>${report.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul></div>` : '';

  return `<!DOCTYPE html>
<html lang="no">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex">
<title>Klikk-rapport</title>
<style>${CSS}</style>
</head>
<body>
<main>
<h1>Klikk-rapport</h1>
<p class="sub">${esc(rangeLabel)} · laget ${esc(generated.toLocaleString('nb-NO'))}</p>
<div class="cards">
  <div class="card"><b>${nf(report.totals.nettside)}</b><span>klikk på «Besøk nettside»</span></div>
  <div class="card"><b>${nf(report.totals.kart)}</b><span>klikk på «Kart»</span></div>
  <div class="card"><b>${nf(report.clinicsWithClicks)} / ${nf(report.clinics.length)}</b><span>klinikker med minst ett klikk</span></div>
  <div class="card"><b>${nf(report.sitesWithData)}</b><span>sider med data</span></div>
</div>
<p class="note">Kun besøkende som har godtatt informasjonskapsler telles, så tallene er lavere enn faktiske klikk. Bruk dem til å sammenligne klinikker, ikke som absolutte tall.</p>
${warnings}
<h2>Alle klinikker – samlet</h2>
<p class="note">Klikk på en kolonneoverskrift for å sortere. Samme klinikk på flere sider er slått sammen.</p>
<div class="tablewrap"><table class="sortable">${header([['Klinikk'], ['Nettside', 1], ['Kart', 1], ['Totalt', 1]])}<tbody>
${clinicRows}
</tbody></table></div>
<h2>Per side</h2>
${siteSections}
</main>
<script>${SORT_JS}</script>
</body>
</html>
`;
}

// ─── PDF (via Edge/Chrome i usynlig modus) ───────────────────────────────────

function findBrowser() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv) {
    if (fs.existsSync(fromEnv)) return fromEnv;
    throw new Error(`CHROME_PATH peker på en fil som ikke finnes: ${fromEnv}`);
  }
  const pf = process.env.ProgramFiles, pf86 = process.env['ProgramFiles(x86)'], local = process.env.LOCALAPPDATA;
  const candidates = process.platform === 'win32' ? [
    pf86 && path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    pf && path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    pf && path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    pf86 && path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    local && path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ] : process.platform === 'darwin' ? [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  ] : ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge'];
  const found = candidates.filter(Boolean).find(p => fs.existsSync(p));
  if (!found) throw new Error('Fant verken Edge eller Chrome. Installer en av dem, eller sett CHROME_PATH i .env til nettleserens .exe-fil.');
  return found;
}

// Egen midlertidig profilmappe, ellers kan en allerede åpen Edge/Chrome ta over kommandoen og aldri avslutte.
async function makePdf(report, rangeLabel, pdfPath) {
  const browser = findBrowser();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'klikk-rapport-'));
  try {
    const htmlFile = path.join(tmp, 'rapport.html');
    fs.writeFileSync(htmlFile, renderHtml(report, rangeLabel, new Date(), { forPrint: true }), 'utf8');
    fs.rmSync(pdfPath, { force: true }); // ikke la en gammel PDF se ut som en ny
    await new Promise((resolve, reject) => {
      execFile(browser, [
        '--headless', '--disable-gpu', '--no-first-run',
        `--user-data-dir=${path.join(tmp, 'profil')}`,
        '--no-pdf-header-footer',
        `--print-to-pdf=${pdfPath}`,
        pathToFileURL(htmlFile).href,
      ], { timeout: 90000, windowsHide: true }, err => (err ? reject(new Error(`Nettleseren feilet: ${err.message}`)) : resolve()));
    });
    if (!fs.existsSync(pdfPath) || fs.statSync(pdfPath).size === 0) throw new Error('Nettleseren lagde ingen PDF');
  } finally {
    try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* temp-filer, ufarlig */ }
  }
}

// ─── Konsollutskrift ─────────────────────────────────────────────────────────

function printSummary(report, rangeLabel, files) {
  console.log(`\nKlikk-rapport – ${rangeLabel}`);
  console.log(`  Nettside-klikk: ${nf(report.totals.nettside)}   Kart-klikk: ${nf(report.totals.kart)}   ` +
    `Klinikker med klikk: ${report.clinicsWithClicks} av ${report.clinics.length}   Sider med data: ${report.sitesWithData}`);
  const top = report.clinics.filter(c => c.total > 0).slice(0, 15);
  if (top.length) {
    console.log('\n  Topp klinikker:');
    const w = Math.min(46, Math.max(...top.map(c => c.name.length)));
    console.log(`  ${'Klinikk'.padEnd(w)}  ${'Nettside'.padStart(8)}  ${'Kart'.padStart(6)}  ${'Totalt'.padStart(6)}`);
    for (const c of top) {
      console.log(`  ${c.name.slice(0, w).padEnd(w)}  ${String(c.nettside).padStart(8)}  ${String(c.kart).padStart(6)}  ${String(c.total).padStart(6)}`);
    }
  } else {
    console.log('\n  Ingen klikk registrert i perioden.');
  }
  if (report.warnings.length) {
    console.log('\n  Merk:');
    report.warnings.forEach(w => console.log('   - ' + w));
  }
  console.log('\n  Kun besøkende som har godtatt cookies telles – tallene er lavere enn faktiske klikk.');
  console.log(`\n  Rapport: ${files.html}\n  CSV:     ${files.csv}${files.pdf ? `\n  PDF:     ${files.pdf}` : ''}\n`);
}

// ─── Hovedløp ────────────────────────────────────────────────────────────────

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.hjelp) { console.log(USAGE); return; }

  loadEnv();
  const sa = loadServiceAccount();
  const token = await getAccessToken(sa, args.opprettDimensjoner ? [SCOPE_READ, SCOPE_EDIT] : [SCOPE_READ]);

  const sites = discoverSites();
  const active = sites.filter(s => s.active);
  console.log(`Fant ${sites.length} sider (${active.length} med gyldig GA4-ID). Henter GA4-properties...`);
  const propertyByMeasurementId = await listPropertiesByMeasurementId(token);

  const results = new Map();
  const withProperty = [];
  for (const s of active) {
    const p = propertyByMeasurementId.get(s.measurementId);
    if (p) withProperty.push({ site: s, property: p });
    else results.set(s.folder, { status: 'ingen_property', message: `Fant ingen GA4-property med ${s.measurementId} som tjenestekontoen har tilgang til` });
  }

  if (args.opprettDimensjoner) {
    console.log(`Sjekker/oppretter custom dimension «${DIMENSION}» i ${withProperty.length} properties...`);
    let failed = 0;
    await mapLimit(withProperty, 3, async ({ site, property }) => {
      try {
        console.log(`  ${(await ensureDimension(token, property.id)).padEnd(9)} ${site.domain}`);
      } catch (e) {
        failed++;
        console.log(`  FEIL      ${site.domain}: ${e.message}`);
      }
    });
    for (const [folder, r] of results) console.log(`  hoppet over ${folder}: ${r.message}`);
    console.log(`\nFerdig.${failed ? ` ${failed} feilet (se over).` : ''} Merk: dimensjonen teller bare klikk fra og med nå – eldre klikk kan ikke hentes i etterkant.`);
    return;
  }

  const range = dateRange(args);
  console.log(`Henter klikk for ${withProperty.length} sider (${range.label})...`);
  await mapLimit(withProperty, 4, async ({ site, property }) => {
    try {
      results.set(site.folder, { status: 'ok', rows: await fetchClicks(token, property.id, range) });
    } catch (e) {
      results.set(site.folder, e.missingDimension
        ? { status: 'mangler_dimensjon', message: `Custom dimension «${DIMENSION}» er ikke opprettet i GA4 (kjør med --opprett-dimensjoner)` }
        : { status: 'feil', message: e.message });
    }
  });

  const report = buildReport(sites, results);
  const outDir = path.isAbsolute(args.ut) ? args.ut : path.join(ROOT, args.ut);
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const files = {
    html: path.join(outDir, `klikk-rapport-${stamp}.html`),
    csv: path.join(outDir, `klikk-rapport-${stamp}.csv`),
  };
  fs.writeFileSync(files.html, renderHtml(report, range.label), 'utf8');
  fs.writeFileSync(files.csv, renderCsv(report), 'utf8');
  if (args.pdf) {
    files.pdf = path.join(outDir, `klikk-rapport-${stamp}.pdf`);
    try {
      await makePdf(report, range.label, files.pdf);
    } catch (e) {
      console.warn(`\nKunne ikke lage PDF: ${e.message}\n(HTML- og CSV-rapporten er laget.)`);
      delete files.pdf;
    }
  }
  printSummary(report, range.label, files);
}

if (require.main === module) {
  main().catch(err => {
    console.error('\nFeil:', err.message);
    process.exit(1);
  });
}

module.exports = {
  parseArgs, dateRange, discoverSites, decodeEntities, normHost, makeJwt,
  buildReport, renderCsv, renderHtml, makePdf, findBrowser, main,
};
