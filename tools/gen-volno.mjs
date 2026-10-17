#!/usr/bin/env node
/* Volné termíny jako text — pro AI asistenty a vyhledávače, kteří nespouštějí JavaScript.

   Proč: obsazenost vily dřív ukazoval jen kalendář na homepage (assets/site.js), který si data
   stahuje až v prohlížeči. ChatGPT na otázku „volná vila pro 20 lidí na Silvestra" tak nevěděl,
   jestli máme volno. Tenhle skript z kalendáře udělá krátký seznam volných termínů
   a gen-jazyky.mjs ho vypíše staticky: pod kalendářem na homepage ve všech jazycích,
   v Častých dotazech (otázka „Jak zjistíme, jestli je náš termín volný?") a v llms.txt a de/llms.txt.

   Použití:  node tools/gen-volno.mjs                 stáhne kalendář, přepíše assets/volno.json
                                                      a spustí gen-jazyky.mjs (přegeneruje stránky)
             node tools/gen-volno.mjs --soubor <cesta> totéž z uloženého history.json (test, offline)
             node tools/gen-volno.mjs --dnes 2026-10-17 jako by bylo jiné datum (test)

   Kdy běží: sám dvakrát denně (.github/workflows/volno.yml), commit „chore: volné termíny" do main.

   ZDROJ: https://pavelkubiznak.github.io/villa-booking-calendar/data/history.json — stejný soubor,
   ze kterého kreslí kalendář na homepage (a /sprava/). Čtou se JEN data příjezdu a odjezdu;
   jména, platformy ani uidh se nikam nezapisují. Výstup assets/volno.json je veřejný a nese jen data.

   PRAVIDLA (stejná jako kalendář na homepage a /sprava/):
     - obsazené noci = start … end−1 (end je den odjezdu),
     - „duch" (stale: true a pobyt teprve má proběhnout) termín neblokuje — z feedu platformy
       vypadl, tedy byl stornován (sprava.js cancelledOnPlatform / blockedOnPlatform),
     - volné okno se vypíše, jen když se do něj vejde minimální pobyt podle ceníku (VR_PRICING.periods
       v site.js: minimum nocí podle noci příjezdu) — kratší mezery mezi pobyty nikdo zarezervovat nemůže,
     - horizont = poslední noc ceníku (dál kalendář na webu ceny nezná).
   Vánoce (noci 24.–26. 12.) a Silvestr (noc 31. 12.) se hlásí zvlášť — na ty se hosté ptají nejčastěji. */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ZDROJ = 'https://pavelkubiznak.github.io/villa-booking-calendar/data/history.json';
const VYSTUP = 'assets/volno.json';

const args = process.argv.slice(2);
const opt = (k) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : null; };

/* Data jako 'YYYY-MM-DD'; počítá se v UTC, ať letní čas neposune den. */
const plus = (d, n) => { const x = new Date(d + 'T00:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const noci = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 864e5);
const dnesPraha = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Prague' }).format(new Date());

/* Ceník z site.js (blok CENIK:START … CENIK:END) — minimum nocí a horizont. */
function nactiCenik() {
  const src = readFileSync(join(ROOT, 'assets/site.js'), 'utf8');
  const m = /const VR_PRICING = (\{[\s\S]*?\n\});/.exec(src);
  if (!m) throw new Error('assets/site.js: nenašel jsem VR_PRICING');
  const P = vm.runInNewContext('(' + m[1] + ')');
  if (!Array.isArray(P.periods) || !P.periods.length) throw new Error('VR_PRICING.periods je prázdné');
  return P;
}

export function spocitej(zaznamy, P, dnes) {
  const periods = P.periods;
  const horizont = periods[periods.length - 1].to;            // poslední noc s cenou
  const minNoci = (d) => { const p = periods.find((x) => x.from <= d && d <= x.to); return p ? p.minNights : null; };

  const obsazeno = new Set();
  for (const r of zaznamy) {
    if (!r || !/^\d{4}-\d{2}-\d{2}$/.test(r.start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(r.end || '')) continue;
    if (r.stale === true && r.end > dnes) continue;              // duch: stornováno na platformě
    for (let d = r.start; d < r.end; d = plus(d, 1)) obsazeno.add(d);
  }

  /* Souvislé volné noci od dneška do horizontu → okna [od, do) (do = den odjezdu). */
  const okna = [];
  let od = null;
  for (let d = dnes; d <= plus(horizont, 1); d = plus(d, 1)) {
    const volna = d <= horizont && !obsazeno.has(d);
    if (volna && od == null) od = d;
    if (!volna && od != null) { okna.push({ od, do: d }); od = null; }
  }
  /* Jen okna, do kterých se vejde minimální pobyt aspoň pro jeden den příjezdu. */
  const rezervovatelna = okna.filter((o) => {
    for (let d = o.od; d < o.do; d = plus(d, 1)) { const m = minNoci(d); if (m && noci(d, o.do) >= m) return true; }
    return false;
  }).map((o) => ({ od: o.od, do: o.do, noci: noci(o.od, o.do), ...(o.do > horizont ? { konec: true } : {}) }));

  /* Vánoce a Silvestr pro každý rok, jehož 31. 12. je ještě v horizontu a není za námi. */
  const vOkne = (d) => rezervovatelna.some((o) => o.od <= d && d < o.do);
  const svatky = [];
  for (let rok = Number(dnes.slice(0, 4)); `${rok}-12-31` <= horizont; rok++) {
    if (`${rok}-12-31` < dnes) continue;
    const vanoce = [`${rok}-12-24`, `${rok}-12-25`, `${rok}-12-26`].filter((d) => d >= dnes);
    const v = vanoce.filter(vOkne).length;
    svatky.push({
      rok,
      ...(vanoce.length ? { vanoce: v === vanoce.length ? 'volno' : v ? 'castecne' : 'obsazeno' } : {}),
      silvestr: vOkne(`${rok}-12-31`) ? 'volno' : 'obsazeno',
    });
  }
  return { stav: dnes, horizont: plus(horizont, 1), okna: rezervovatelna, svatky };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dnes = opt('dnes') || dnesPraha();
  let zaznamy;
  if (opt('soubor')) zaznamy = JSON.parse(readFileSync(opt('soubor'), 'utf8'));
  else {
    const r = await fetch(ZDROJ, { cache: 'no-store' });
    if (!r.ok) { console.error(`Kalendář nevrátil data (HTTP ${r.status}) — volno.json nechávám beze změny.`); process.exit(1); }
    zaznamy = await r.json();
  }
  if (!Array.isArray(zaznamy) || !zaznamy.length) { console.error('Kalendář je prázdný — volno.json nechávám beze změny.'); process.exit(1); }
  const v = spocitej(zaznamy, nactiCenik(), dnes);
  writeFileSync(join(ROOT, VYSTUP), JSON.stringify(v, null, 2) + '\n');
  console.log(`${VYSTUP}: stav k ${v.stav}, ${v.okna.length} volných termínů do ${v.horizont}`);
  for (const s of v.svatky) console.log(`  ${s.rok}: Vánoce ${s.vanoce || '—'}, Silvestr ${s.silvestr}`);
  execFileSync(process.execPath, [join(ROOT, 'tools/gen-jazyky.mjs')], { cwd: ROOT, stdio: 'inherit' });
}
