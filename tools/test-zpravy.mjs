#!/usr/bin/env node
// Test zpráv hostům. Spusť: node tools/test-zpravy.mjs
//
// Šablony a sekvence jsou schválně na dvou místech — v prohlížeči (/sprava/, sprava.js)
// a v n8n Code node (VrDailyTasks.code.js, denní e-mail) — protože n8n běží bez stránky
// a nemá jak sdílet modul. Tenhle test hlídá, že se kopie nerozejdou, že v textech
// nezůstala nevyplněná zástupka a že němčina nevyká. Pak pustí kód denního e-mailu nad
// vymyšlenými pobyty (tools/sprava-harness-data.mjs) a zkontroluje, co v něm je.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { TODAY, BOOKINGS, HOLDS, CALENDAR, VERIFIED } from './sprava-harness-data.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sprava = readFileSync(join(root, 'sprava/sprava.js'), 'utf8');
const n8n = readFileSync(join(root, 'n8n/VrDailyTasks/VrDailyTasks.code.js'), 'utf8');

let failed = 0, passed = 0;
function ok(cond, what) {
  if (cond) { passed++; return; }
  failed++; console.error('✗ ' + what);
}

/* ---------- 1) kopie se neliší ---------- */
// Vyřízne `<start> … ;` (objekt nebo pole) a vyhodnotí ho jako JS výraz.
function literal(src, start, file) {
  const a = src.indexOf(start);
  if (a < 0) throw new Error('nenalezeno „' + start + '“ v ' + file + ' — změnila se kotva?');
  const from = a + start.length, open = src[from];
  const close = open === '{' ? '}' : ']';
  let depth = 0, i = from, str = null;
  for (; i < src.length; i++) {
    const ch = src[i];
    if (str) { if (ch === '\\') i++; else if (ch === str) str = null; continue; }
    if (ch === '"' || ch === "'") str = ch;
    else if (ch === open) depth++;
    else if (ch === close && --depth === 0) break;
  }
  return new Function('return ' + src.slice(from, i + 1))();
}
const T1 = literal(sprava, 'var TPL = ', 'sprava.js'), T2 = literal(n8n, 'const TPL = ', 'VrDailyTasks.code.js');
ok(JSON.stringify(T1) === JSON.stringify(T2), 'TPL (šablony) se liší mezi sprava.js a VrDailyTasks.code.js');
const N1 = literal(sprava, 'var NEWS = ', 'sprava.js'), N2 = literal(n8n, 'const NEWS = ', 'VrDailyTasks.code.js');
ok(JSON.stringify(N1) === JSON.stringify(N2), 'NEWS (novinka v první ozvěně) se liší mezi kopiemi');
const S1 = literal(sprava, 'var SEQUENCE = ', 'sprava.js'), S2 = literal(n8n, 'const SEQUENCE=', 'VrDailyTasks.code.js');
ok(JSON.stringify(S1) === JSON.stringify(S2), 'SEQUENCE (kroky) se liší mezi kopiemi');
ok(S1.map(s => s.key).join() === 'first,welcome,day2,predeparture,review', 'sekvence má mít 5 kroků: first, welcome, day2, predeparture, review');
ok(N1.from <= N1.to && /^\d{4}-\d\d-\d\d$/.test(N1.from), 'NEWS.from/to musí být data RRRR-MM-DD, od ≤ do');

/* ---------- 2) šablony ---------- */
const LANGS = ['cs', 'en', 'de', 'pl'];
const KEYS = Object.keys(T1.cs);
const ALLOWED = ['JMENO', 'TERMIN', 'DOSPELI', 'NOCI', 'CASTKA', 'KOD_DVERI', 'WIFI_HESLO', 'KAUCE', 'REGISTRACNI_LINK', 'PRUVODCE_LINK', 'POPLATEK', 'NOVINKA'];
for (const L of LANGS) {
  ok(JSON.stringify(Object.keys(T1[L] || {})) === JSON.stringify(KEYS), L + ': jiné klíče šablon než cs');
  ok(!!N1.text[L], L + ': chybí text novinky');
  for (const [k, v] of Object.entries(T1[L] || {})) {
    for (const m of v.matchAll(/\{([A-Z_]+)\}/g)) ok(ALLOWED.includes(m[1]), `${L}.${k}: neznámá zástupka {${m[1]}}`);
  }
  // uvítací zpráva nese kód, registraci, průvodce, Wi-Fi a poplatek; první ozvěna NE registraci
  for (const ph of ['KOD_DVERI', 'REGISTRACNI_LINK', 'PRUVODCE_LINK', 'WIFI_HESLO', 'POPLATEK'])
    ok(T1[L].welcomeCore.includes('{' + ph + '}'), `${L}.welcomeCore: chybí {${ph}}`);
  ok(T1[L].first.includes('{NOVINKA}') && !/REGISTRACNI_LINK|PRUVODCE_LINK|KOD_DVERI/.test(T1[L].first), L + '.first: má nést {NOVINKA} a žádný odkaz ani kód');
  ok(!/storn|cancel|rezygn/i.test(T1[L].first + T1[L].nudge), L + ': první ozvěna ani připomenutí nemluví o stornu');
  ok(T1[L].feeDeposit && !/revolut/i.test(T1[L].feeDeposit), L + '.feeDeposit: přímý prodej se neposílá na Revolut');
}
// Němčina tyká v množném čísle („ihr/euch") — zdroj: villa-rudolf-portal/docs/text-villa-rudolf.md.
// Velké „Ihr" na začátku věty je 2. os. mn. č., to se nehlídá.
for (const [k, v] of Object.entries(T1.de).concat([['NEWS', N1.text.de]])) {
  const m = v.match(/\b(Sie|Ihnen|Ihre[nmrs]?)\b/g);
  ok(!m, 'de.' + k + ' vyká: ' + (m || []).join(', '));
}

/* ---------- 3) denní e-mail nad vymyšlenými pobyty ---------- */
const FIXED = Date.parse(TODAY + 'T07:30:00+02:00');
class FakeDate extends Date {
  constructor(...a) { if (a.length) super(...a); else super(FIXED); }
  static now() { return FIXED; }
}
// PostgREST tvar: vnořený log jako vr_msglog, osoby jako vr_persons
const rowsDb = BOOKINGS.map(b => ({ ...b, vr_msglog: b.msglog, msglog: undefined, vr_persons: [] }));
const nodes = {
  'Načíst konfiguraci (service-role)': [{ json: { k: 'wifi_password', v: 'test-heslo' } }],
  'Načíst předrezervace (service-role)': HOLDS.map(h => ({ json: h })),
  'Načíst žádosti (service-role)': [],
  'Načíst hlášení cizinců (service-role)': [{ json: { due: [] } }]
};
const $ = name => ({ all: () => nodes[name] || [], first: () => (nodes[name] || [])[0] || { json: {} } });
const ctx = { helpers: { httpRequest: async ({ url }) => url.includes('verified.json') ? VERIFIED : CALENDAR } };
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const out = await new AsyncFunction('$', '$input', 'Date', n8n).call(ctx, $, { all: () => rowsDb.map(json => ({ json })) }, FakeDate);
ok(Array.isArray(out) && out.length === 1, 'denní e-mail: čekám právě jednu položku');
const mail = out[0] ? out[0].json : { html: '', subject: '' };
const html = mail.html;
// texty zpráv jsou v odkazech wa.me — vytáhnout a dekódovat
const waTexts = [...html.matchAll(/https:\/\/wa\.me\/(\d+)\?text=([^"]+)"/g)].map(m => ({ phone: m[1], text: decodeURIComponent(m[2].replace(/&amp;/g, '&')) }));
const waFor = phone => waTexts.filter(w => w.phone === phone).map(w => w.text);

ok(html.includes('První ozvěna — 4× na řadě'), 'první ozvěna: čekám 4 pobyty (b5, b6, b8, b12)');
const erika = waFor('4915550100105')[0] || '';
ok(erika.startsWith('Hallo Erika Beispiel,') && erika.includes('19.–26. Dezember 2026'), 'první ozvěna DE: oslovení a termín německy');
ok(erika.includes('neu gestaltete Treppe'), 'první ozvěna DE s příjezdem 19. 12. 2026 má nést novinku');
const greta = waFor('4915550100112')[0] || '';
ok(greta.includes('Zwei Dinge vorab') && !greta.includes('Treppe'), 'první ozvěna s příjezdem 2028 je bez novinky');
ok(!/\n\n\n/.test(greta), 'vynechaná novinka nesmí nechat prázdný odstavec');
const petr = waFor('420600100108')[0] || '';
ok(petr.includes('nově upravené schodiště') && petr.includes('6.–13. února 2027'), 'první ozvěna CS: novinka a český termín');
ok(!waFor('420600100111').length, 'pobyt se starým klíčem „confirm" první ozvěnu znovu nedostane');
ok(!waFor('420600100102').some(t => t.includes('tady Pavel z Villy Rudolf')), 'příjezd za 6 dní: první ozvěna už není úkol');
ok(html.includes('Jana Vzorová') && html.includes('Uvítací zpráva (kód, registrace, Wi-Fi)'), 'uvítací zpráva T−7 je v e-mailu jako úkol');
ok(html.includes('12 dní bez odpovědi'), 'host mlčí 12 dní → připomenout se');
ok((waFor('447700900109')[0] || '').includes('just a quick follow-up'), 'připomenutí anglicky');
ok(/Jan Przykładowy — váhá/.test(html), 'host, který váhá, je v e-mailu zvýrazněný');
ok(html.includes('4× starší úkol už nedává smysl'), 'starší úkoly: čekám 4 (b1 ozvěna, uvítací a doplatek; b2 ozvěna)');
ok(!html.includes('není z čeho udělat kód dveří') && !html.includes('chybí kód dveří'), 'kód jde odvodit z telefonu → žádný problém s kódem dveří');
ok(html.includes('Max Mustermann — chybí telefon'), 'pobyt bez telefonu do 30 dnů zůstává v Problémech');
ok(!/\{[A-Z_]+\}/.test(waTexts.map(w => w.text).join('\n')), 'v odesílaných textech nezůstala žádná {ZÁSTUPKA}');
ok(!/undefined|\bnull\b|NaN/.test(html), 'v e-mailu není undefined / null / NaN');
ok(/dnes: 8 úkolů/.test(mail.subject), 'předmět: 8 úkolů (váhá, uvítací, den 2, 4× ozvěna, připomenutí) — je „' + mail.subject + '“');

console.log(failed ? `\n${failed} selhalo, ${passed} prošlo` : `✓ zprávy v pořádku (${passed} kontrol)`);
process.exit(failed ? 1 : 0);
