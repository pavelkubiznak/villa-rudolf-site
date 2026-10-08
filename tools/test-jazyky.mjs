#!/usr/bin/env node
// Test jazykových verzí webu. Spusť: node tools/test-jazyky.mjs
//
// Hlídá:
//  1. statické stránky jsou aktuální (node tools/gen-jazyky.mjs --check — ten zároveň kontroluje
//     hreflang, canonical, JSON-LD a zbylou češtinu v DE/PL/EN),
//  2. přesměrování na „/" (skript v <head> index.html, generuje ho gen-jazyky.mjs):
//     staré odkazy ?lang=, uložená volba z přepínače (vrLang) a prohlížeč v němčině nebo polštině
//     vedou na jazykovou verzi; angličtina podle prohlížeče NE (Googlebot má prohlížeč anglický),
//  3. roboti bez JavaScriptu dostanou na /de/, /pl/ a /en/ fakta v daném jazyce (cena, kapacita,
//     adresa, telefon) a odkaz na Časté dotazy,
//  4. relativní odkazy a cesty (assets, fotky, podstránky) ve statických stránkách vedou na
//     existující soubory — na /de/ musí všechno jít o adresář výš.

import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join, posix } from 'node:path';
import vm from 'node:vm';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let chyby = 0;
const ok = (podminka, popis) => { if (!podminka) { chyby++; console.log('✗ ' + popis); } else console.log('✓ ' + popis); };

// ---------- 1. aktuálnost ----------
let aktualni = true;
try { execFileSync(process.execPath, [join(root, 'tools/gen-jazyky.mjs'), '--check'], { cwd: root, stdio: 'pipe' }); }
catch (e) { aktualni = false; console.log(String(e.stderr || e.stdout || e.message).trim()); }
ok(aktualni, 'statické stránky odpovídají site.js a šabloně (gen-jazyky --check)');

// ---------- 2. přesměrování na „/" ----------
const index = readFileSync(join(root, 'index.html'), 'utf8');
const skript = (/<script>(\/\* Jazyk \(tools\/gen-jazyky\.mjs\)[\s\S]*?)<\/script>/.exec(index) || [])[1];
ok(!!skript, 'index.html má v <head> přesměrování podle jazyka');
let ulozil = null, relace = {};
function kam({ search = '', hash = '', ulozeno = null, jazyky = ['cs-CZ'], bezStorage = false, referrer = '', zdroj = null }) {
  let cil = null;
  ulozil = null;
  relace = zdroj ? { vrZdroj: zdroj } : {};
  const ctx = vm.createContext({
    location: { search, hash, hostname: 'villarudolf.com', replace: (u) => { cil = u; } },
    document: { referrer },
    localStorage: {
      getItem: () => { if (bezStorage) throw new Error('blocked'); return ulozeno; },
      setItem: (k, v) => { if (bezStorage) throw new Error('blocked'); ulozil = v; },
    },
    sessionStorage: { getItem: (k) => (k in relace ? relace[k] : null), setItem: (k, v) => { relace[k] = String(v); } },
    navigator: { languages: jazyky, language: jazyky[0] },
    URL, URLSearchParams, JSON, Date,
  });
  vm.runInContext(skript, ctx);
  return cil;
}
const pripady = [
  [{ search: '?lang=de' }, 'de/', 'starý odkaz ?lang=de → /de/'],
  [{ search: '?lang=de&season=zima', hash: '#rezervace' }, 'de/?season=zima#rezervace', '?lang=de&season=zima#rezervace → /de/ i se sezónou a kotvou'],
  [{ search: '?season=zima&lang=pl' }, 'pl/?season=zima', '?season=zima&lang=pl → /pl/?season=zima'],
  [{ search: '?lang=en' }, 'en/', 'starý odkaz ?lang=en → /en/'],
  [{ search: '?lang=cs', ulozeno: 'de', jazyky: ['de-DE'] }, null, '?lang=cs (odkaz z přepínače) má přednost před uloženou němčinou'],
  [{ ulozeno: 'de' }, 'de/', 'uložená volba de → /de/'],
  [{ ulozeno: 'en', jazyky: ['cs'] }, 'en/', 'uložená volba en → /en/'],
  [{ ulozeno: 'cs', jazyky: ['de-DE'] }, null, 'uložená volba cs → zůstává česky i s německým prohlížečem'],
  [{ jazyky: ['de-DE', 'de'] }, 'de/', 'prohlížeč v němčině → /de/'],
  [{ jazyky: ['de-AT'] }, 'de/', 'prohlížeč de-AT → /de/'],
  [{ jazyky: ['pl-PL'] }, 'pl/', 'prohlížeč v polštině → /pl/'],
  [{ jazyky: ['en-US'] }, null, 'prohlížeč v angličtině (i Googlebot) → zůstává česky, nabídne lišta'],
  [{ jazyky: ['nl-NL', 'en'] }, null, 'prohlížeč v nizozemštině → zůstává (lišta nabídne angličtinu)'],
  [{ jazyky: ['cs-CZ'] }, null, 'český prohlížeč → zůstává'],
  [{ jazyky: ['de-DE'], bezStorage: true }, 'de/', 'zablokovaný localStorage nevadí'],
  [{ search: '?lang=constructor', jazyky: ['cs'] }, null, '?lang=constructor nic nerozbije'],
];
for (const [vstup, ocekavam, popis] of pripady) {
  const vysledek = kam(vstup);
  ok(vysledek === ocekavam, `${popis}${vysledek !== ocekavam ? ` (dostal jsem ${vysledek})` : ''}`);
}
kam({ search: '?lang=cs&season=leto', ulozeno: 'de' });
ok(ulozil === 'cs', '?lang=cs si zapamatuje češtinu (odkaz z přepínače nebo z české podstránky)');
// zdroj návštěvy přežije přesměrování (vrZdroj → událost poptavka-odeslana, vrRef → referrer pro Umami)
kam({ jazyky: ['de-DE'], referrer: 'https://www.google.com/' });
ok(relace.vrZdroj === 'google.com' && JSON.parse(relace.vrRef || '{}').r === 'https://www.google.com/', 'přesměrování z Googlu: zdroj google.com a původní referrer zůstanou');
kam({ search: '?utm_source=chatgpt.com', jazyky: ['de-DE'], referrer: 'https://chatgpt.com/' });
ok(relace.vrZdroj === 'chatgpt.com', 'utm_source má přednost před referrerem (ChatGPT)');
kam({ jazyky: ['pl-PL'], referrer: 'https://villarudolf.com/vylety/' });
ok(!relace.vrZdroj && !relace.vrRef, 'vlastní doména jako referrer se za zdroj nepovažuje');
kam({ jazyky: ['de-DE'], referrer: 'https://www.perplexity.ai/', zdroj: 'chatgpt.com' });
ok(relace.vrZdroj === 'chatgpt.com', 'už zapsaný zdroj návštěvy se nepřepisuje');
kam({ jazyky: ['cs-CZ'], referrer: 'https://www.google.com/' });
ok(!relace.vrZdroj && !relace.vrRef, 'bez přesměrování se nic neukládá (zdroj si spočítá site.js)');

// ---------- 3. co dostane robot bez JavaScriptu ----------
const FAKTA = {
  de: ['lang="de"', '13 400 Kč', '6–22 Gäste', 'Luční 519', '+420 775 220 785', 'Check-in ab 15:00', 'Früher Rudolfův dvůr', 'Zimmer 1', 'Apartment Suite'],
  pl: ['lang="pl"', '13 400 Kč', '6–22 gości', 'Luční 519', '+420 775 220 785', 'Zameldowanie od 15:00', 'Dawniej Rudolfův dvůr', 'Pokój 1', 'Apartament Suite'],
  en: ['lang="en"', '13 400 Kč', '6–22 guests', 'Luční 519', '+420 775 220 785', 'Check-in from 15:00', 'Formerly Rudolfův dvůr', 'Room 1', 'Apartment Suite'],
};
for (const [jazyk, fakta] of Object.entries(FAKTA)) {
  const soubor = join(root, jazyk, 'index.html');
  const html = existsSync(soubor) ? readFileSync(soubor, 'utf8').replace(/ /g, ' ') : '';
  const chybi = fakta.filter((f) => !html.includes(f));
  ok(!chybi.length, `/${jazyk}/ bez JavaScriptu nese fakta v jazyce stránky${chybi.length ? ' — chybí: ' + chybi.join(', ') : ''}`);
  ok(html.includes(`<link rel="canonical" href="https://villarudolf.com/${jazyk}/">`), `/${jazyk}/ má canonical sám na sebe`);
}

// ---------- 4. relativní odkazy a cesty ve statických stránkách vedou na existující soubory ----------
const stranky = ['index.html', 'de/index.html', 'pl/index.html', 'en/index.html', 'faq/index.html', 'de/faq/index.html', 'pl/faq/index.html', 'en/faq/index.html'];
for (const s of stranky) {
  if (!existsSync(join(root, s))) continue;
  const html = readFileSync(join(root, s), 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, (m) => m.replace(/>[\s\S]*$/, '>'));
  const adresar = posix.dirname(s);
  const rozbite = new Set();
  for (const m of html.matchAll(/\b(?:href|src|data-langlink)="([^"]+)"/g)) {
    const u = m[1];
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\?)/i.test(u)) continue;
    const cesta = u.replace(/[?#].*$/, '');
    if (!cesta) continue;
    let soubor = cesta.startsWith('/') ? cesta.slice(1) : posix.normalize(posix.join(adresar, cesta));
    if (soubor.startsWith('..')) { rozbite.add(u + ' (mimo web)'); continue; }
    if (soubor === '.' || soubor.endsWith('/')) soubor = posix.join(soubor, 'index.html');
    try { if (statSync(join(root, soubor)).isDirectory()) soubor = posix.join(soubor, 'index.html'); } catch {}
    if (!existsSync(join(root, soubor))) rozbite.add(u);
  }
  ok(!rozbite.size, `${s}: všechny relativní odkazy a cesty vedou na existující soubor${rozbite.size ? ' — rozbité: ' + [...rozbite].slice(0, 6).join(', ') : ''}`);
}

if (chyby) { console.log(`\n${chyby} chyb`); process.exit(1); }
console.log('\nVše v pořádku.');
