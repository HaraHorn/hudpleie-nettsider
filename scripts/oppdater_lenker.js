#!/usr/bin/env node
// Generer og injiser lenkenett-seksjonen i alle HTML-filer.
// Kjør: node scripts/oppdater_lenker.js
// Legg til nye sider i SITES, og nye hub-sider i HUB_SITES, og kjør på nytt.

const fs = require('fs');
const path = require('path');

// ─── KONFIG ──────────────────────────────────────────────────────────────────

const SITES = [
  // Drammen
  { folder: 'botoxdrammen',        keyword: 'botox',    city: 'Drammen',       url: 'https://botoxdrammen.no',          display: 'BotoxDrammen.no',        active: true  },
  { folder: 'hudpleiedrammen',     keyword: 'hudpleie', city: 'Drammen',       url: 'https://hudpleiedrammen.no',       display: 'HudpleieDrammen.no',     active: true  },
  { folder: 'laserdrammen',        keyword: 'laser',    city: 'Drammen',       url: 'https://laserdrammen.no',          display: 'LaserDrammen.no',        active: true  },
  // Asker
  { folder: 'botoxasker',          keyword: 'botox',    city: 'Asker',         url: 'https://botoxasker.no',            display: 'BotoxAsker.no',          active: true  },
  { folder: 'hudpleieasker',       keyword: 'hudpleie', city: 'Asker',         url: 'https://hudpleieasker.no',         display: 'HudpleieAsker.no',       active: true  },
  { folder: 'laserasker',          keyword: 'laser',    city: 'Asker',         url: 'https://laserasker.no',            display: 'LaserAsker.no',          active: true  },
  // Bergen
  { folder: 'botoxbergen',         keyword: 'botox',    city: 'Bergen',        url: 'https://botoxbergen.no',           display: 'BotoxBergen.no',         active: true  },
  { folder: 'hudpleiebergen',      keyword: 'hudpleie', city: 'Bergen',        url: 'https://hudpleiebergen.no',        display: 'HudpleieBergen.no',      active: false },
  { folder: 'laserbergen',         keyword: 'laser',    city: 'Bergen',        url: 'https://laserbergen.no',           display: 'LaserBergen.no',         active: true  },
  // Stavanger
  { folder: 'botoxstavanger',      keyword: 'botox',    city: 'Stavanger',     url: 'https://botoxstavanger.no',        display: 'BotoxStavanger.no',      active: true  },
  { folder: 'hudpleiestavanger',   keyword: 'hudpleie', city: 'Stavanger',     url: 'https://hudpleiestavanger.no',     display: 'HudpleieStavanger.no',   active: true  },
  { folder: 'laserstavanger',      keyword: 'laser',    city: 'Stavanger',     url: 'https://laserstavanger.no',        display: 'LaserStavanger.no',      active: true  },
  // Trondheim
  { folder: 'botoxtrondheim',      keyword: 'botox',    city: 'Trondheim',     url: 'https://botoxtrondheim.no',        display: 'BotoxTrondheim.no',      active: false },
  { folder: 'hudpleietrondheim',   keyword: 'hudpleie', city: 'Trondheim',     url: 'https://hudpleietrondheim.no',     display: 'HudpleieTrondheim.no',   active: false },
  { folder: 'lasertrondheim',      keyword: 'laser',    city: 'Trondheim',     url: 'https://lasertrondheim.no',        display: 'LaserTrondheim.no',      active: true  },
  // Bærum
  { folder: 'botoxbærum',          keyword: 'botox',    city: 'Bærum',         url: 'https://botoxbærum.no',            display: 'BotoxBærum.no',          active: true  },
  { folder: 'hudpleiebærum',       keyword: 'hudpleie', city: 'Bærum',         url: 'https://hudpleiebærum.no',         display: 'HudpleieBærum.no',       active: true  },
  { folder: 'laserbærum',          keyword: 'laser',    city: 'Bærum',         url: 'https://laserbærum.no',            display: 'LaserBærum.no',          active: true  },
  // Tromsø
  { folder: 'botoxtromsø',         keyword: 'botox',    city: 'Tromsø',        url: 'https://botoxtromsø.no',           display: 'BotoxTromsø.no',         active: true  },
  { folder: 'hudpleietromsø',      keyword: 'hudpleie', city: 'Tromsø',        url: 'https://hudpleietromsø.no',        display: 'HudpleieTromsø.no',      active: true  },
  { folder: 'lasertromsø',         keyword: 'laser',    city: 'Tromsø',        url: 'https://lasertromsø.no',           display: 'LaserTromsø.no',         active: true  },
  // Fredrikstad
  { folder: 'botoxfredrikstad',    keyword: 'botox',    city: 'Fredrikstad',   url: 'https://botoxfredrikstad.no',      display: 'BotoxFredrikstad.no',    active: true  },
  { folder: 'hudpleiefredrikstad', keyword: 'hudpleie', city: 'Fredrikstad',   url: 'https://hudpleiefredrikstad.no',   display: 'HudpleieFredrikstad.no', active: true  },
  { folder: 'laserfredrikstad',    keyword: 'laser',    city: 'Fredrikstad',   url: 'https://laserfredrikstad.no',      display: 'LaserFredrikstad.no',    active: true  },
  // Kristiansand
  { folder: 'botoxkristiansand',   keyword: 'botox',    city: 'Kristiansand',  url: 'https://botoxkristiansand.no',     display: 'BotoxKristiansand.no',   active: true  },
  { folder: 'hudpleiekristiansand',keyword: 'hudpleie', city: 'Kristiansand',  url: 'https://hudpleiekristiansand.no',  display: 'HudpleieKristiansand.no',active: true  },
  { folder: 'laserkristiansand',   keyword: 'laser',    city: 'Kristiansand',  url: 'https://laserkristiansand.no',     display: 'LaserKristiansand.no',   active: true  },
  // Sarpsborg
  { folder: 'botoxsarpsborg',      keyword: 'botox',    city: 'Sarpsborg',     url: 'https://botoxsarpsborg.no',        display: 'BotoxSarpsborg.no',      active: true  },
  { folder: 'hudpleiesarpsborg',   keyword: 'hudpleie', city: 'Sarpsborg',     url: 'https://hudpleiesarpsborg.no',     display: 'HudpleieSarpsborg.no',   active: true  },
  { folder: 'lasersarpsborg',      keyword: 'laser',    city: 'Sarpsborg',     url: 'https://lasersarpsborg.no',        display: 'LaserSarpsborg.no',      active: true  },
  // Oslo
  { folder: 'botoxoslo',           keyword: 'botox',    city: 'Oslo',          url: 'https://botoxoslo.com',            display: 'BotoxOslo.com',          active: true  },
  { folder: 'hudpleieoslo',        keyword: 'hudpleie', city: 'Oslo',          url: 'https://hudpleieoslo.com',         display: 'HudpleieOslo.com',       active: true  },
  { folder: 'laseroslo',           keyword: 'laser',    city: 'Oslo',          url: 'https://laseroslo.com',            display: 'LaserOslo.com',          active: true  },
  // Arendal
  { folder: 'botoxarendal',        keyword: 'botox',    city: 'Arendal',       url: 'https://botoxarendal.no',          display: 'BotoxArendal.no',        active: true  },
  { folder: 'hudpleiearendal',     keyword: 'hudpleie', city: 'Arendal',       url: 'https://hudpleiearendal.no',       display: 'HudpleieArendal.no',     active: true  },
  { folder: 'laserarendal',        keyword: 'laser',    city: 'Arendal',       url: 'https://laserarendal.no',          display: 'LaserArendal.no',        active: true  },
];

// Legg til nye hub-sider her når de opprettes
const HUB_SITES = [
  { label: 'Koreansk hudpleie',       url: 'https://www.korean.no' },
  { label: 'Anti-aging behandlinger', url: 'https://www.antiaging.no' },
];

// ─── GENERERING ──────────────────────────────────────────────────────────────

const KEYWORD_GROUPS = [
  { keyword: 'botox',    label: 'Botox i Norge' },
  { keyword: 'hudpleie', label: 'Hudpleie i Norge' },
  { keyword: 'laser',    label: 'Laser i Norge' },
];

function buildLinksHtml(site) {
  const lines = [];
  lines.push('<!-- LENKER START -->');
  lines.push('<section class="site-links">');
  lines.push('  <div class="site-links-inner">');

  // Gruppe 1–3: alle søkeord × alle byer (kun aktive, ikke seg selv)
  for (const group of KEYWORD_GROUPS) {
    const sites = SITES.filter(s => s.active && s.keyword === group.keyword && s.folder !== site.folder);
    if (sites.length === 0) continue;
    const links = sites.map(s => `<a href="${s.url}">${s.display}</a>`).join('\n      ');
    lines.push('    <div class="site-links-group">');
    lines.push(`      <span class="site-links-label">${group.label}:</span>`);
    lines.push(`      ${links}`);
    lines.push('    </div>');
  }

  // Hub-sider (alltid, synligere)
  if (HUB_SITES.length > 0) {
    const links = HUB_SITES.map(s => `<a href="${s.url}" class="site-links-hub">${s.label}</a>`).join('\n      ');
    lines.push('    <div class="site-links-group site-links-group--hub">');
    lines.push('      <span class="site-links-label">Se også:</span>');
    lines.push(`      ${links}`);
    lines.push('    </div>');
  }

  lines.push('  </div>');
  lines.push('</section>');
  lines.push('<!-- LENKER SLUTT -->');
  return lines.join('\n');
}

// ─── INJEKSJON ───────────────────────────────────────────────────────────────

const ROOT = path.join(__dirname, '..');
const START = '<!-- LENKER START -->';
const END   = '<!-- LENKER SLUTT -->';

let updated = 0;
let skipped = 0;

for (const site of SITES) {
  const filePath = path.join(ROOT, site.folder, 'index.html');
  if (!fs.existsSync(filePath)) {
    console.log(`  MANGLER: ${site.folder}/index.html`);
    skipped++;
    continue;
  }

  let html = fs.readFileSync(filePath, 'utf8');
  const newBlock = buildLinksHtml(site);

  if (html.includes(START) && html.includes(END)) {
    // Erstatt eksisterende blokk
    const before = html.indexOf(START);
    const after  = html.indexOf(END) + END.length;
    html = html.slice(0, before) + newBlock + html.slice(after);
  } else {
    // Sett inn rett før <footer>
    if (!html.includes('<footer>')) {
      console.log(`  ADVARSEL: Finner ikke <footer> i ${site.folder}/index.html`);
      skipped++;
      continue;
    }
    html = html.replace('<footer>', newBlock + '\n<footer>');
  }

  fs.writeFileSync(filePath, html, 'utf8');
  console.log(`  ✓ ${site.folder}/index.html`);
  updated++;
}

console.log(`\nFerdig: ${updated} sider oppdatert, ${skipped} hoppet over.`);
