#!/usr/bin/env node
// Test zpráv hostům. Spusť: node tools/test-zpravy.mjs
//
// Šablony a sekvence jsou schválně na dvou místech — v prohlížeči (/sprava/, sprava.js)
// a v n8n Code node (VrDailyTasks.code.js, denní e-mail) — protože n8n běží bez stránky
// a nemá jak sdílet modul. Tenhle test hlídá, že se kopie nerozejdou, že v textech
// nezůstala neznámá zástupka a že všechny jazyky vykají. Pak pustí kód denního e-mailu nad
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
ok(S1.map(s => s.key).join() === 'first,welcome,update,day2,predeparture,review', 'sekvence: first, welcome, update, day2, predeparture, review');
ok(S1[1].off === -10 && S1[2].off === -2, 'uvítací zpráva je T−10, update T−2');
ok(N1.from <= N1.to && /^\d{4}-\d\d-\d\d$/.test(N1.from), 'NEWS.from/to musí být data RRRR-MM-DD, od ≤ do');
const V1 = literal(sprava, 'var VIDEO = ', 'sprava.js'), V2 = literal(n8n, 'const VIDEO = ', 'VrDailyTasks.code.js');
ok(JSON.stringify(V1) === JSON.stringify(V2), 'VIDEO (letní / zimní video) se liší mezi kopiemi');

/* ---------- 2) šablony ---------- */
const LANGS = ['cs', 'en', 'de', 'pl'];
const KEYS = Object.keys(T1.cs);
const ALLOWED = ['JMENO', 'TERMIN', 'KOD_DVERI', 'WIFI_HESLO', 'KAUCE', 'PRUVODCE_LINK', 'NOVINKA', 'VIDEO', 'VIDEO_OBSAH', 'CAS', 'JAK_SE_PLATI', 'KDY', 'PLATFORMA'];
const WEB = { cs: 'https://villarudolf.com/#', en: 'https://villarudolf.com/en/#', de: 'https://villarudolf.com/de/#', pl: 'https://villarudolf.com/pl/#' };
for (const L of LANGS) {
  const T = T1[L] || {};
  ok(JSON.stringify(Object.keys(T)) === JSON.stringify(KEYS), L + ': jiné klíče šablon než cs');
  ok(!!N1.text[L], L + ': chybí text novinky');
  const all = Object.values(T).join('\n');
  for (const [k, v] of Object.entries(T)) {
    for (const m of v.matchAll(/\{([A-Z_]+)\}/g)) ok(ALLOWED.includes(m[1]), `${L}.${k}: neznámá zástupka {${m[1]}}`);
  }
  // Pavel 13. 10. 2026: hosty vést na web, ne na keypano; registrace až na místě; žádné připomínání
  ok(!/keypano/i.test(all), L + ': v šablonách nemá být odkaz na keypano');
  ok(!/registrace\/\?t=|REGISTRACNI_LINK/.test(all), L + ': žádná šablona nenese odkaz na registraci');
  ok(!('nudge' in T) && !('summer' in T) && !('winter' in T), L + ': připomenutí ani sezónní moduly už nejsou');
  // první ozvěna: novinka, video, web v jazyce hosta; žádný kód, průvodce ani otázky na počty
  ok(T.first.includes('{NOVINKA}') && T.first.includes('{VIDEO}') && !/KOD_DVERI|PRUVODCE_LINK/.test(T.first), L + '.first: má nést {NOVINKA} a {VIDEO}, ne kód ani průvodce');
  ok(T.first.includes(WEB[L] + 'interier') && T.first.includes(WEB[L] + 'loznice'), L + '.first: odkazy na prohlídku a pokoje vedou na web v jazyce hosta');
  ok(!/storn|cancel|rezygn|postýlk|Kinderbett|\bcots?\b|łóżeczk/i.test(T.first), L + '.first: bez storna a bez postýlek');
  ok(!T.first.replace(/https?:\/\/\S+/g, '').includes('?'), L + '.first: žádná otázka na hosta (počty osob se neptáme)');
  // veřejný plánovač výletů (bez tokenu) v jazyce hosta — /vylety/ přepíná jazyk přes ?lang=
  ok(T.first.includes('https://villarudolf.com/vylety/' + (L === 'cs' ? '\n' : '?lang=' + L + '\n')), L + '.first: odkaz na plánovač výletů v jazyce hosta');
  ok(T.first.indexOf('#loznice') < T.first.indexOf('/vylety/') && T.first.indexOf('/vylety/') < T.first.indexOf('🛂'), L + '.first: výlety jsou za prohlídkou domu a před doklady');
  ok(!/pruvodce/.test(T.first), L + '.first: osobní průvodce (/pruvodce/?t=) až v uvítací zprávě');
  // uvítací zpráva: kód, čas, video, průvodce, Wi-Fi, věta o placení
  for (const ph of ['KOD_DVERI', 'CAS', 'VIDEO', 'VIDEO_OBSAH', 'PRUVODCE_LINK', 'WIFI_HESLO', 'JAK_SE_PLATI'])
    ok(T.welcomeCore.includes('{' + ph + '}'), `${L}.welcomeCore: chybí {${ph}}`);
  ok(!/15:00/.test(T.welcomeCore + T.update), L + ': čas příjezdu jen přes {CAS}, ne natvrdo 15:00');
  ok(T.update.includes('{KOD_DVERI}') && T.update.includes('{KDY}') && T.update.includes('{CAS}'), L + '.update: kód, {KDY} a {CAS}');
  ok(T.cover.includes('{PLATFORMA}'), L + '.cover: jmenuje platformu');
  ok(!/pool|bazén|basen/i.test(T.videoWinter), L + '.videoWinter: zimní video neslibuje bazén');
  ok(!/revolut/i.test(T.payOnsite + T.payIncluded + T.payDeposit), L + ': věta o placení poplatku bez Revolutu');
}
// Čeští hosté: kratší odstavec o dokladech bez cizinecké policie; ostatní ho mají celý.
ok(!/cizineck/i.test(T1.cs.first), 'cs.first: bez cizinecké policie');
ok(/Fremdenpolizei/.test(T1.de.first) && /foreign police/.test(T1.en.first) && /cudzoziemc/.test(T1.pl.first), 'de/en/pl.first: vysvětlení o cizinecké policii');
// Němčina VYKÁ (Pavel 13. 10. 2026: „v němčině nebudeme nikomu tykat"). Malé „ihr/euch/euer"
// a tvary sloves 2. os. mn. č. jsou tykání; velké „Ihr/Ihnen/Sie" je vykání.
for (const [k, v] of Object.entries(T1.de).concat([['NEWS', N1.text.de]])) {
  const m = v.match(/\b(ihr|euch|euer|eure[nmrs]?|habt|seid|könnt|schreibt|schaut)\b|Hallo/g);
  ok(!m, 'de.' + k + ' tyká: ' + (m || []).join(', '));
}
for (const k of ['first', 'cover', 'welcomeCore', 'update', 'deposit', 'day2', 'predeparture', 'reviewBody'])
  ok(T1.de[k].startsWith('Guten Tag, {JMENO}'), 'de.' + k + ': začíná „Guten Tag, …"');
ok(/Państw/.test(T1.pl.first + T1.pl.welcomeCore), 'polština vyká („Państwo")');

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

const plain = t => t.replace(/\*([^*\n]+)\*/g, '$1');
ok(html.includes('První ozvěna — 4× na řadě'), 'první ozvěna: čekám 4 pobyty (b5, b6, b8, b12)');
// hosté z platforem mají v e-mailu jen průvodní zprávu na WhatsApp, přímý prodej celý text
const erika = waFor('4915550100105')[0] || '';
ok(erika.startsWith('Guten Tag, Erika Beispiel, hier ist Pavel') && erika.includes('über Booking.com'), 'platforma: průvodní zpráva německy s vykáním a jménem platformy');
const petr = waFor('420600100108')[0] || '';
ok(petr.includes('Váš pobyt 6.–13. února 2027 je potvrzený') && petr.includes('nově upravené schodiště'), 'přímý prodej: celá první ozvěna česky s novinkou');
ok(petr.includes('https://villarudolf.com/#interier') && petr.includes('https://youtu.be/tWCuuovnh2U'), 'první ozvěna: web a zimní video (únor)');
ok(!/\n\n\n/.test(petr), 'žádný prázdný odstavec navíc');
ok(!waFor('420600100111').length, 'pobyt se starým klíčem „confirm" první ozvěnu znovu nedostane');
ok(html.includes('Jana Vzorová') && html.includes('Uvítací zpráva (adresa, kód, video, Wi-Fi)'), 'uvítací zpráva T−10 je v e-mailu jako úkol');
// update T−2: kód, dohodnutý čas 14:00, „übermorgen"
const klara = waFor('4915550100104')[0] || '';
ok(html.includes('Update před příjezdem') && klara.includes('übermorgen sehen wir uns'), 'update T−2 je na řadě a říká „pozítří"');
ok(klara.includes('Der Türcode ist 00104, gültig ab 14:00 Uhr'), 'update: kód z telefonu a dohodnutý čas 14:00 místo 15:00');
ok(!html.includes('bez odpovědi'), 'mlčícímu hostovi se nepřipomíná (úkol „připomenout se" je zrušený)');
ok(/Jan Przykładowy — váhá/.test(html), 'host, který váhá, je v e-mailu zvýrazněný');
ok(!html.includes('není z čeho udělat kód dveří') && !html.includes('chybí kód dveří'), 'kód jde odvodit z telefonu → žádný problém s kódem dveří');
ok(html.includes('Max Mustermann — chybí telefon'), 'pobyt bez telefonu do 30 dnů zůstává v Problémech');
ok(!/\{[A-Z_]+\}/.test(waTexts.map(w => w.text).join('\n')), 'v odesílaných textech nezůstala žádná {ZÁSTUPKA}');
ok(!/undefined|\bnull\b|NaN/.test(html), 'v e-mailu není undefined / null / NaN');
ok(plain('🔑 *Kód*\n*123*, platí') === '🔑 Kód\n123, platí', 'text pro platformu je bez WhatsApp hvězdiček');
ok(html.includes('7× starší úkol už nedává smysl'), 'starší úkoly: čekám 7 (b1 doplatek, ozvěna, uvítací, update a den 2; b4 a b2 ozvěna)');
ok(/dnes: 8 úkolů/.test(mail.subject), 'předmět: 8 úkolů (váhá, 2× uvítací, update, 4× ozvěna) — je „' + mail.subject + '“');

console.log(failed ? `\n${failed} selhalo, ${passed} prošlo` : `✓ zprávy v pořádku (${passed} kontrol)`);
process.exit(failed ? 1 : 0);
