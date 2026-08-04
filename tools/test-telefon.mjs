#!/usr/bin/env node
// Test normalizace telefonu. Spusť: node tools/test-telefon.mjs
//
// Logika je schválně na třech místech — v prohlížeči (/sprava/, normPhone)
// a ve dvou n8n Code nodech (VrDailyTasks, VrEchalupyInquiry — intlPhone),
// protože n8n běží bez stránky a Code node nemá jak sdílet modul.
// Tenhle test hlídá, že se kopie nerozejdou. Když měníš jednu, spusť ho.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

// Kód se vytáhne přímo ze zdrojů, ať se netestuje zastaralá kopie.
function extract(file, from, to, exportName) {
  const src = readFileSync(join(root, file), 'utf8');
  const a = src.indexOf(from), b = src.indexOf(to);
  if (a < 0 || b < 0 || b <= a) throw new Error('blok nenalezen v ' + file + ' — změnily se kotvy?');
  return new Function(src.slice(a, b) + '\n return ' + exportName + ';')();
}

const normPhone = extract('sprava/sprava.js',
  '  var DIAL = [', '  /* ============ wa.me ============ */', 'normPhone');
const intlPhone = extract('n8n/VrDailyTasks/VrDailyTasks.code.js',
  'const DIAL=[', 'function waPhone(b)', 'intlPhone');
const intlPhoneEch = extract('n8n/VrEchalupyInquiry/VrEchalupyInquiry.code.js',
  'const DIAL=[', '// ---------- Pomocné ----------', 'intlPhone');

// [vstup, jazyk hosta, očekávaný mezinárodní tvar bez plusu ('' = nepoužitelné), doplnili jsme předvolbu?]
const CASES = [
  // mezinárodní zápis se bere, jak je
  ['+420 775 220 785', 'cs', '420775220785', false],
  ['+49 171 1234567', 'de', '491711234567', false],
  ['00420775220785', 'cs', '420775220785', false],
  ['+48 501 234 567', 'pl', '48501234567', false],
  ['+31 6 12345678', 'en', '31612345678', false],
  ['+1 212 555 1234', 'en', '12125551234', false],

  // jádro opravy: německé číslo psané národně — dřív dalo wa.me/01711234567
  ['0171 1234567', 'de', '491711234567', true],
  ['0171/1234567', 'de', '491711234567', true],
  // bez nuly a bez předvolby nesmí spadnout pod USA (+1)
  ['1711234567', 'de', '491711234567', true],

  // bez předvolby → doplní se podle jazyka hosta
  ['775220785', 'cs', '420775220785', true],
  ['501 234 567', 'pl', '48501234567', true],
  // předvolba tam je, jen bez plusu → druhá se nepředřadí
  ['420775220785', 'de', '420775220785', false],

  // anglicky mluvící host může být odkudkoliv → nehádáme, chceme předvolbu
  ['0171 1234567', 'en', '', null],
  ['501234567', 'en', '', null],

  // vadné vstupy
  ['', 'cs', '', null],
  ['nevím', 'cs', '', null],
  ['+420 775 220', 'cs', '', null],           // Česko má za předvolbou 9 číslic
  ['+420 775 220 785 999', 'cs', '', null],   // moc dlouhé
  ['12345', 'cs', '', null],                  // krátké i po doplnění předvolby
];

let fail = 0;
const bad = (m) => { fail++; console.log('FAIL  ' + m); };

console.log('— normalizace (/sprava/) —');
for (const [input, lang, want, wantGuessed] of CASES) {
  const r = normPhone(input, lang);
  const got = r.ok ? r.e164.slice(1) : '';
  const detail = JSON.stringify(input).padEnd(22) + lang.padEnd(4) + '→ ' +
    (r.ok ? r.e164 + '  ' + r.pretty + ' · ' + (r.country || '?') + (r.guessed ? '  [předvolba doplněna]' : '')
          : (r.empty ? 'prázdné' : 'odmítnuto: ' + r.error));
  if (got !== want) bad(detail + '   — čekal jsem ' + (want || 'odmítnutí'));
  else if (wantGuessed !== null && !!r.guessed !== wantGuessed) bad(detail + '   — nesedí příznak doplněné předvolby');
  else console.log('  ok  ' + detail);
}

console.log('\n— shoda /sprava/ × VrDailyTasks × VrEchalupyInquiry —');
for (const [input, lang] of CASES) {
  const a = normPhone(input, lang), sprava = a.ok ? a.e164.slice(1) : '';
  const daily = intlPhone(input, lang), ech = intlPhoneEch(input, lang);
  if (sprava !== daily || sprava !== ech)
    bad(JSON.stringify(input) + ' ' + lang + ': sprava=' + (sprava || '—') +
        ' daily=' + (daily || '—') + ' echalupy=' + (ech || '—'));
}
if (!fail) console.log('  ok  všechny tři kopie souhlasí na všech vstupech');

// Kód dveří = posledních 5 číslic. Předvolba je prefix, takže normalizace
// nesmí změnit navržený kód u pobytů, které už v DB jsou.
console.log('\n— kód dveří přežije normalizaci —');
const last5 = (s) => String(s).replace(/\D/g, '').slice(-5);
for (const [input, lang] of CASES) {
  const r = normPhone(input, lang);
  if (!r.ok) continue;
  const before = last5(input), after = last5(r.e164);
  if (before.length === 5 && before !== after)
    bad(input + ': kód ' + before + ' → ' + after);
}
if (!fail) console.log('  ok  posledních 5 číslic se nemění');

console.log(fail ? '\n' + fail + ' selhání' : '\nvše prošlo');
process.exit(fail ? 1 : 0);
