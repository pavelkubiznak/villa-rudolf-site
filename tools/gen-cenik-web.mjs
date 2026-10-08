#!/usr/bin/env node
/* Ceník na web: přepíše kalkulačku (VR_PRICING v assets/site.js) a ceny v HTML homepage podle
   docs/cenik.json v repu villa-rudolf-portal. Tam je jediný zdroj pravdy pro ceny a minimální
   počet nocí na všech kanálech; web je přímý kanál (cena = čistý výnos, bez provize).

   Použití:  node tools/gen-cenik-web.mjs <cesta k villa-rudolf-portal> [--od YYYY-MM-DD] [--do YYYY-MM-DD]
   Výchozí rozsah: dnes → 10. 1. o tři roky dál (pokryje všechno, co ceník otevírá, i Vánoce za horizontem).

   Co dělá:
     1. spustí `node scripts/cenik.mjs kalendar --json` v portálu (den po dni: cena, min. noci),
     2. sloučí dny do úseků a pojmenuje je (mimo / zimni / svatky / spicka / letni / vanoce / silvestr),
     3. přepíše blok CENIK:START … CENIK:END ve VR_PRICING (assets/site.js),
     4. přepíše ceny a minima v elementech data-cenik / data-cenik-min / data-cenik-noci v index.html
        a "priceRange" ve schema.org,
     5. zkontroluje, že llms.txt uvádí stejné ceny (jen hlásí, nepřepisuje).
   Nic nenasazuje. Výsledek zkontroluj (`git diff`) a commitni. */
import { execFileSync } from "node:child_process";
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = {};
const pos = [];
for (let i = 0; i < args.length; i++) {
  if (args[i].startsWith("--")) opt[args[i].slice(2)] = args[++i];
  else pos.push(args[i]);
}
if (!pos[0]) {
  console.error("Použití: node tools/gen-cenik-web.mjs <cesta k villa-rudolf-portal> [--od YYYY-MM-DD] [--do YYYY-MM-DD]");
  process.exit(1);
}
const portal = resolve(pos[0]);
const dnes = new Date().toISOString().slice(0, 10);
const od = opt.od || dnes;
const do_ = opt.do || `${Number(od.slice(0, 4)) + 3}-01-10`;

const cenik = JSON.parse(readFileSync(join(portal, "docs/cenik.json"), "utf8"));
// Výstup do souboru, ne do roury: cenik.mjs končí process.exit() a velký výpis do roury
// by se uřízl dřív, než ho Node stihne odeslat (do souboru Node zapisuje synchronně).
const tmp = mkdtempSync(join(tmpdir(), "vr-cenik-"));
const tmpSoubor = join(tmp, "kalendar.json");
const fd = openSync(tmpSoubor, "w");
try {
  execFileSync(process.execPath, ["scripts/cenik.mjs", "kalendar", "--json", "--od", od, "--do", do_], { cwd: portal, stdio: ["ignore", fd, "inherit"] });
} finally { closeSync(fd); }
const kal = JSON.parse(readFileSync(tmpSoubor, "utf8"));
rmSync(tmp, { recursive: true, force: true });
const primy = Object.keys(kal.kanaly).find((k) => kal.kanaly[k].primy);
if (!primy) throw new Error("V ceníku chybí přímý kanál (primy: true).");

// Pojmenování noci podle pravidla, ze kterého cena vzešla. Výjimky se čtou z cenik.json,
// aby rozhodoval typ výjimky (jako + koef), ne text důvodu.
const zima = cenik.sezony.zima, mimo = cenik.sezony.mimo;
function nazev(x) {
  if (x.s === "mimo") return "mimo";
  if (/^zima /.test(x.s)) return "zimni";
  if (/^leto /.test(x.s)) return "letni";
  if (/^vanoce /.test(x.s)) return "vanoce";
  if (/^výjimka/.test(x.s)) {
    const v = cenik.vyjimky.find((v) => x.d >= v.od && x.d <= v.do);
    if (!v) throw new Error(`Výjimka pro ${x.d} není v cenik.json`);
    const koef = v.koef ?? 1;
    if (v.jako === "vanoce") return koef > 1 ? "silvestr" : "vanoce";
    if (v.jako === "leto") return "letni";
    if (v.jako === "mimo") return "mimo";
    const cena = x.ceny[primy];
    if (koef > 1 || (!v.jako && cena > zima.noc)) return "spicka";
    return (x.min ?? zima.min_noci) > zima.min_noci ? "svatky" : (v.jako ? "zimni" : "mimo");
  }
  throw new Error(`Neznámá sezóna „${x.s}“ (${x.d})`);
}

const periods = [];
for (const x of kal.dny) {
  const p = { from: x.d, to: x.d, name: nazev(x), nightly: x.ceny[primy], minNights: x.min };
  const last = periods[periods.length - 1];
  if (last && last.name === p.name && last.nightly === p.nightly && last.minNights === p.minNights) last.to = x.d;
  else periods.push(p);
}

const ORDER = ["mimo", "zimni", "svatky", "letni", "spicka", "vanoce", "silvestr"];
const levels = {};
for (const n of ORDER) {
  const ps = periods.filter((p) => p.name === n);
  if (ps.length) levels[n] = { nightly: Math.min(...ps.map((p) => p.nightly)), minNights: Math.min(...ps.map((p) => p.minNights)) };
}
const seasons = [
  { name: "letni", from: "07-01", to: "08-31", nightly: cenik.sezony.leto.noc, minNights: cenik.sezony.leto.min_noci },
  { name: "zimni", from: "01-01", to: "02-28", nightly: zima.noc, minNights: zima.min_noci },
  { name: "mimo", nightly: mimo.noc, minNights: mimo.min_noci },
];

// ---------- 1. assets/site.js ----------
const q = (s) => `'${s}'`;
const blok = [
  `/* CENIK:START — vygenerováno příkazem \`node tools/gen-cenik-web.mjs <villa-rudolf-portal>\``,
  `     z docs/cenik.json verze ${cenik.verze} dne ${dnes}. NEUPRAVOVAT RUČNĚ: ceník se mění v cenik.json`,
  `     a tenhle blok se přegeneruje. periods = noci od–do včetně (cena za noc, min. nocí podle noci příjezdu),`,
  `     levels = přehled pro ceník nad kalendářem, seasons = záloha pro noci za koncem periods. */`,
  `  periods: [`,
  ...periods.map((p) => `    { from: ${q(p.from)}, to: ${q(p.to)}, name: ${q(p.name)}, nightly: ${p.nightly}, minNights: ${p.minNights} },`),
  `  ],`,
  `  levels: {`,
  ...Object.entries(levels).map(([n, l]) => `    ${n}: { nightly: ${l.nightly}, minNights: ${l.minNights} },`),
  `  },`,
  `  seasons: [`,
  ...seasons.map((s) => `    { name: ${q(s.name)}${s.from ? `, from: ${q(s.from)}, to: ${q(s.to)}` : ""}, nightly: ${s.nightly}, minNights: ${s.minNights} },`),
  `  ],`,
  `  /* CENIK:END */`,
].join("\n");
const sitePath = join(root, "assets/site.js");
const site = readFileSync(sitePath, "utf8");
const reBlok = /\/\* CENIK:START[\s\S]*?\/\* CENIK:END \*\//;
if (!reBlok.test(site)) throw new Error("assets/site.js: nenašel jsem blok CENIK:START … CENIK:END ve VR_PRICING");
writeFileSync(sitePath, site.replace(reBlok, blok));

// ---------- 2. index.html ----------
const kc = (n) => `${String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ")} Kč`;
const noci = (n) => `${n} ${n === 1 ? "noc" : n < 5 ? "noci" : "nocí"}`;
const vse = Object.values(levels).map((l) => l.nightly);
const od_ = Math.min(...vse), do__ = Math.max(...vse);
const htmlPath = join(root, "index.html");
let html = readFileSync(htmlPath, "utf8");
const chybi = new Set();
html = html.replace(/(data-cenik="(\w+)"[^>]*>)[^<]*(<)/g, (m, a, n, b) => {
  if (n === "od") return a + kc(od_) + b;
  if (!levels[n]) { chybi.add(n); return m; }
  return a + kc(levels[n].nightly) + b;
});
html = html.replace(/(data-cenik-(min|noci)="(\w+)"[^>]*>)[^<]*(<)/g, (m, a, typ, n, b) => {
  if (!levels[n]) { chybi.add(n); return m; }
  return a + (typ === "min" ? "min. " : "") + noci(levels[n].minNights) + b;
});
html = html.replace(/"priceRange": "[^"]*"/, `"priceRange": "${kc(od_).replace(" Kč", "")}–${kc(do__)} za noc za celý dům"`);
writeFileSync(htmlPath, html);

// ---------- 3. kontrola llms.txt ----------
const llms = readFileSync(join(root, "llms.txt"), "utf8");
const nesedi = Object.entries(levels).filter(([, l]) => !llms.includes(kc(l.nightly).replace(" Kč", "")));

console.log(`Ceník ${cenik.verze} → web (${od} až ${do_}, přímý kanál „${kal.kanaly[primy].nazev}“): ${periods.length} úseků`);
for (const p of periods) console.log(`  ${p.from} – ${p.to}  ${p.name.padEnd(8)} ${String(p.nightly).padStart(6)} Kč  min. ${p.minNights}`);
console.log("Úrovně: " + Object.entries(levels).map(([n, l]) => `${n} ${l.nightly}/${l.minNights}`).join(", "));
if (chybi.size) console.log(`! index.html odkazuje na úrovně, které ceník nemá: ${[...chybi].join(", ")}`);
if (nesedi.length) console.log(`! llms.txt neuvádí ceny: ${nesedi.map(([n, l]) => `${n} ${l.nightly}`).join(", ")} — uprav ručně`);
