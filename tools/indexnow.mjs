#!/usr/bin/env node
/* IndexNow: ohlásí změněné stránky vyhledávačům (Bing, Seznam, Yandex, Naver…) hned po nasazení.
   Proč: ChatGPT (a Copilot) hledají přes index Bingu. Bez ohlášení Bing změnu najde až při dalším
   procházení (dny až týdny); takhle se o ní dozví během minut. Seznam je bonus pro české hosty.
   Převzato ze sintera.cz (build/indexnow.mjs), 10/2026.

   Spouští ho .github/workflows/indexnow.yml po pushi do main, až GitHub Pages nasadí commit.
   Argument = git revize, od které se změny počítají (výchozí HEAD~1). Ručně:
     node tools/indexnow.mjs <revize>           ohlásí změny od revize
     node tools/indexnow.mjs <revize> --dry     jen vypíše, co by ohlásil
   Klíč: soubor <KLIC>.txt v kořeni webu (IndexNow si ho stáhne a ověří, že web patří nám).
   Není tajný — prokazuje jen vlastnictví domény.
   Nikdy neshodí nasazení: při jakékoli chybě jen vypíše varování a skončí 0. */
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const KLIC = 'b8aed3a3195400dd83f225996cdf03cb';
const BASE = 'https://villarudolf.com';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Soubor v repu → veřejná URL. Jen indexovatelné stránky: homepage a Časté dotazy ve všech
   jazycích, výlety, praktické info, podmínky a llms.txt. Stránky pro hosty a majitele
   (/sprava/, /registrace/, /checkin/, /album/, /smlouvy/, /pruvodce/, /tv/, /metrika/) mají
   noindex a neohlašují se. */
function naUrl(f) {
  if (/^(?:(?:de|pl|en)\/)?(?:faq\/)?index\.html$/.test(f)) return BASE + '/' + f.replace(/index\.html$/, '');
  if (/^(?:vylety|info|podminky)\/index\.html$/.test(f)) return BASE + '/' + f.replace(/index\.html$/, '');
  if (/^(?:(?:de|pl|en)\/)?llms\.txt$/.test(f)) return BASE + '/' + f;
  return null;
}

try {
  const od = process.argv[2] || 'HEAD~1';
  const nanecisto = process.argv.includes('--dry');
  const soubory = execFileSync('git', ['diff', '--name-only', od, 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).split('\n').filter(Boolean);
  const urlList = [...new Set(soubory.map(naUrl).filter(Boolean))];
  if (!urlList.length) { console.log('IndexNow: žádná změněná stránka, nic se neohlašuje.'); process.exit(0); }
  if (nanecisto) { console.log('IndexNow (nanečisto):\n  ' + urlList.join('\n  ')); process.exit(0); }
  const res = await fetch('https://api.indexnow.org/indexnow', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host: new URL(BASE).host, key: KLIC, keyLocation: `${BASE}/${KLIC}.txt`, urlList }),
  });
  console.log(`IndexNow: ${urlList.length} URL → HTTP ${res.status}`);   // 200/202 = přijato
  for (const u of urlList) console.log('  ' + u);
  if (res.status >= 400) console.log('  ! ' + (await res.text()).slice(0, 300));
} catch (e) {
  console.log('IndexNow: ! přeskočeno (' + e.message + ')');
}
