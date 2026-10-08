#!/usr/bin/env node
// Test kalkulačky ceníku na webu. Spusť: node tools/test-cenik-web.mjs [<cesta k villa-rudolf-portal>]
//
// Hlídá tři věci:
//  1. vzorové pobyty (špička, léto pod minimem, Vánoce, Silvestr, pobyt přes hranici sezón)
//     spočítá computeQuote() ze site.js podle ceníku,
//  2. /smlouvy/ přečte VR_PRICING stejným regexem jako v prohlížeči a dá stejnou cenu za noc,
//  3. s cestou k portálu: KAŽDÁ noc vygenerovaného rozsahu sedí s `cenik.mjs kalendar`
//     (přímý kanál) — tedy že blok CENIK v site.js není zastaralý vůči cenik.json.
// Ceník se mění v cenik.json a přegeneruje příkazem node tools/gen-cenik-web.mjs <portál>.

import { readFileSync, mkdtempSync, openSync, closeSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const site = readFileSync(join(root, 'assets/site.js'), 'utf8');

// Kód se vytáhne přímo ze zdrojů, ať se netestuje zastaralá kopie.
function slice(src, from, to) {
  const a = src.indexOf(from), b = src.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error('blok nenalezen: ' + from + ' … ' + to);
  return src.slice(a, b);
}
const code = [
  slice(site, 'const VR_PRICING = {', '\n};') + '\n};',
  slice(site, 'function dkey(d)', '\n') ,
  slice(site, 'function toD(k)', '\n'),
  slice(site, 'const VR_PERIODS =', 'function fmtM('),
].join('\n');
const W = new Function(code + '\nreturn { VR_PRICING, computeQuote, vrSeasonForKey };')();

let chyby = 0;
const ok = (podminka, popis) => { if (!podminka) { chyby++; console.log('✗ ' + popis); } else console.log('✓ ' + popis); };
const key = (iso) => +iso.replace(/-/g, '');

// ---------- 1. vzorové pobyty ----------
const q = (a, b, ad = 10) => W.computeQuote(key(a), key(b), ad, 0, 0);
let r = q('2027-02-06', '2027-02-09');
ok(r.valid && r.accommodation === 3 * 16400, 'zimní špička 6.–9. 2. 2027: 3 × 16 400 Kč');
r = q('2027-07-03', '2027-07-07');
ok(!r.valid && r.minNights === 5, 'léto: 4 noci jsou pod minimem 5');
r = q('2027-07-03', '2027-07-08');
ok(r.valid && r.accommodation === 5 * 14900, 'léto: 5 nocí × 14 900 Kč');
r = q('2027-12-18', '2027-12-24');
ok(r.valid && r.accommodation === 6 * 18000, 'Vánoce 2027: 6 × 18 000 Kč');
r = q('2027-12-25', '2027-12-31');
ok(r.valid && r.accommodation === 6 * 20000, 'Silvestr 2027: 6 × 20 000 Kč');
r = q('2027-03-12', '2027-03-16');
ok(r.valid && r.accommodation === 2 * 14900 + 2 * 13400 && r.groups.length === 2, 'přes hranici zimy: 2 × 14 900 + 2 × 13 400 Kč');
r = q('2027-03-26', '2027-03-28');
ok(!r.valid && r.minNights === 3, 'Velikonoce: 2 noci jsou pod minimem 3');
r = q('2026-11-13', '2026-11-15');
ok(r.valid && r.accommodation === 2 * 13400 && !r.weekend, 'víkend mimo sezónu: 2 × 13 400 Kč, žádná víkendová sazba');
r = q('2030-07-06', '2030-07-11');
ok(r.valid && r.accommodation === 5 * 14900, 'za koncem úseků platí záloha podle měsíců (léto 2030)');

// ---------- 2. /smlouvy/ čte stejný ceník ----------
const m = /const VR_PRICING = (\{[\s\S]*?\n\});/.exec(site);
const P = m && new Function('return ' + m[1])();
ok(P && P.periods && P.periods.length === W.VR_PRICING.periods.length, '/smlouvy/ regexem přečte VR_PRICING i s úseky');
const smlouvy = readFileSync(join(root, 'smlouvy/smlouvy.js'), 'utf8');
const nightlyFor = new Function('PRICING', slice(smlouvy, '  function nightlyFor(iso) {', '\n  /* ============ Data') + '\nreturn nightlyFor;')(P);
ok(nightlyFor('2027-12-27') === 20000 && nightlyFor('2027-02-07') === 16400 && nightlyFor('2026-11-01') === 13400,
  '/smlouvy/ nightlyFor: Silvestr 20 000, špička 16 400, mimo 13 400');

// ---------- 3. noc po noci proti cenik.mjs ----------
const portal = process.argv[2] && resolve(process.argv[2]);
if (portal) {
  const per = W.VR_PRICING.periods;
  const tmp = mkdtempSync(join(tmpdir(), 'vr-cenik-test-'));
  const soubor = join(tmp, 'k.json');
  const fd = openSync(soubor, 'w');
  try {
    execFileSync(process.execPath, ['scripts/cenik.mjs', 'kalendar', '--json', '--od', per[0].from, '--do', per[per.length - 1].to],
      { cwd: portal, stdio: ['ignore', fd, 'inherit'] });
  } finally { closeSync(fd); }
  const kal = JSON.parse(readFileSync(soubor, 'utf8'));
  rmSync(tmp, { recursive: true, force: true });
  const primy = Object.keys(kal.kanaly).find((k) => kal.kanaly[k].primy);
  const zle = kal.dny.filter((x) => {
    const s = W.vrSeasonForKey(key(x.d));
    return s.nightly !== x.ceny[primy] || s.minNights !== x.min;
  });
  ok(zle.length === 0, `všech ${kal.dny.length} nocí sedí s cenik.json verze ${kal.verze}` + (zle.length ? ` — nesedí např. ${zle.slice(0, 3).map((x) => x.d).join(', ')} (přegeneruj: node tools/gen-cenik-web.mjs ${process.argv[2]})` : ''));
} else {
  console.log('· noc po noci proti cenik.json: přeskočeno (zadej cestu k villa-rudolf-portal)');
}

if (chyby) { console.log(`\n${chyby} chyb`); process.exit(1); }
console.log('\nVše v pořádku.');
