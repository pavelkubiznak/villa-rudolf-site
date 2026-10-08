#!/usr/bin/env node
/* Jazykové verze webu jako statické HTML — pro roboty, kteří nespouštějí JavaScript.

   Proč: AI asistenti (ChatGPT, Claude, Perplexity) JavaScript nespouštějí. Do 10/2026 žily jazyky
   jen ve slovníku T v assets/site.js, takže /?lang=de vracelo robotům totéž české HTML. Tenhle
   skript z T vyrobí skutečné stránky /de/, /pl/, /en/, /nl/ a /fr/ (pořadí podle trhů: DE 34 % hostů,
   PL 16 %, NL 9 % a Vlámsko 6 %, francouzština pro Valonsko, Brusel a Lucembursko, EN pro ostatní)
   a přegeneruje i české výchozí texty v index.html — statická kopie textů tak už nikdy neuteče od T.

   Použití:  node tools/gen-jazyky.mjs           přepíše výstupy (seznam VÝSTUPY níž)
             node tools/gen-jazyky.mjs --check   nic nepíše, jen ověří, že jsou výstupy aktuální

   Kdy pustit: po každé změně T, VR_FACTS, VR_REVIEWS nebo VR_CONTACT v assets/site.js, po změně
   šablony index.html a po změně tools/jazyky-obsah.mjs (alt texty, JSON-LD, Časté dotazy).
   Ceny se mění JEN přes tools/gen-cenik-web.mjs — ten tenhle skript na konci spouští sám.

   Šablona = index.html (česká verze je zároveň šablonou). Skript:
     1. načte assets/site.js do izolovaného vm (bez prohlížeče) a vezme z něj T, VR_* a funkce,
        které kreslí bloky (renderRatings, buildRoster, renderPriceBlock, renderFooterContact) —
        statické HTML je tak totéž, co vykreslí JavaScript,
     2. nahradí obsah prvků s data-t / data-t-html / data-tpl a atributy data-t-ph, data-t-aria
        a data-alt (alt texty z jazyky-obsah.mjs),
     3. hlavičku mezi <!-- JAZYKY:START --> a <!-- JAZYKY:END --> vygeneruje celou: title,
        description, canonical, hreflang, JSON-LD, og:* (a na „/" přesměrování podle jazyka),
     4. u jazykových verzí (/de/, /pl/, /en/, /nl/, /fr/) posune relativní cesty o adresář výš (../assets/…) a nastaví
        <html lang> a data-root="../" (site.js podle něj skládá cesty k fotkám),
     5. vyrobí Časté dotazy (faq/, de/faq/, pl/faq/, en/faq/, nl/faq/, fr/faq/) s FAQPage schema a sitemap.xml
        s jazykovými páry,
     6. zkontroluje, že v cizojazyčných stránkách nezůstala čeština, že JSON-LD je validní JSON
        a že hreflang a canonical sedí. Při chybě skončí kódem 1 a nic nezapíše.

   VÝSTUPY: index.html a <jazyk>/index.html, faq/index.html a <jazyk>/faq/index.html pro každý
            jazyk z JAZYKY v jazyky-obsah.mjs (de, pl, en, nl, fr), sitemap.xml */
import vm from 'node:vm';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as OBSAH from './jazyky-obsah.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'https://villarudolf.com';
const JAZYKY = OBSAH.JAZYKY;                                  // cs, de, pl, en, nl, fr
const DOMOV = Object.fromEntries(JAZYKY.map((L) => [L, L === 'cs' ? '' : L + '/']));   // homepage v každém jazyce
const FAQ = Object.fromEntries(JAZYKY.map((L) => [L, (L === 'cs' ? '' : L + '/') + 'faq/']));
/* x-default = stránka pro jazyky, které web nemá (Italové, Maďaři, Ukrajinci… česky nečtou)
   → anglická verze. */
const X_DEFAULT = 'en';
/* Pořadí v přepínači jazyka — stejné jako na homepage (index.html). */
const PREPINAC = ['cs', 'en', 'de', 'pl', 'nl', 'fr'];
/* Výlety, info a podmínky (a průvodce hosta) mají jazyk jen v JS (?lang=) a umí jen tyhle čtyři.
   Z nizozemské a francouzské stránky se proto otevírají anglicky. Stejnou mapu má site.js (VR_SUB_LANG). */
const PODSTRANKY = ['cs', 'en', 'de', 'pl'];
const jazykPodstranky = (L) => (PODSTRANKY.includes(L) ? L : 'en');
const CHECK = process.argv.includes('--check');
const abs = (rel) => BASE + '/' + rel;

const chyby = [];
const chyba = (s) => { chyby.push(s); };

/* ============================ HTML: escapování a mini-DOM pro vm ============================ */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/* Jen tolik DOMu, kolik potřebují kreslicí funkce ze site.js (el(), $('#id'), innerHTML…). */
class VText { constructor(s) { this.nodeType = 3; this.data = String(s); } get textContent() { return this.data; } }
class VRaw { constructor(h) { this.nodeType = 99; this.html = String(h); } get textContent() { return this.html.replace(/<[^>]*>/g, ''); } }
class VEl {
  constructor(tag) { this.nodeType = 1; this.tag = String(tag).toLowerCase(); this.attrs = new Map(); this.childNodes = []; this.style = {}; this.dataset = {}; }
  get tagName() { return this.tag.toUpperCase(); }
  setAttribute(k, v) { this.attrs.set(String(k), String(v)); }
  getAttribute(k) { return this.attrs.has(k) ? this.attrs.get(k) : null; }
  hasAttribute(k) { return this.attrs.has(k); }
  removeAttribute(k) { this.attrs.delete(k); }
  get className() { return this.attrs.get('class') || ''; }
  set className(v) { this.attrs.set('class', String(v)); }
  get id() { return this.attrs.get('id') || ''; }
  set id(v) { this.attrs.set('id', String(v)); }
  appendChild(c) { this.childNodes.push(c); return c; }
  get textContent() { return this.childNodes.map((c) => c.textContent).join(''); }
  set textContent(v) { this.childNodes = v === '' || v == null ? [] : [new VText(v)]; }
  get innerHTML() { return this.childNodes.map(serialize).join(''); }
  set innerHTML(v) { this.childNodes = v ? [new VRaw(v)] : []; }
  addEventListener() {}
  removeEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  get classList() { const me = this; return { add() {}, remove() {}, toggle() {}, contains: (c) => me.className.split(/\s+/).includes(c) }; }
}
function serialize(n) {
  if (n.nodeType === 3) return escText(n.data);
  if (n.nodeType === 99) return n.html;
  const a = [...n.attrs].map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('');
  return VOID.has(n.tag) ? `<${n.tag}${a}>` : `<${n.tag}${a}>${n.childNodes.map(serialize).join('')}</${n.tag}>`;
}
/* Čitelný zápis bloku do šablony: blokový prvek, který má jen blokové děti, je dá na vlastní
   řádky (prázdné místo mezi blokovými prvky se nevykresluje); vše ostatní zůstává na řádku. */
const BLOKOVE = new Set(['div', 'dl', 'ul', 'ol', 'li', 'p', 'h2', 'h3', 'dt', 'dd', 'section', 'article']);
function serializeHezky(n, odsazeni) {
  if (n.nodeType !== 1 || !BLOKOVE.has(n.tag)) return serialize(n);
  const deti = n.childNodes;
  if (!deti.length || !deti.every((c) => c.nodeType === 1 && BLOKOVE.has(c.tag))) return serialize(n);
  const a = [...n.attrs].map(([k, v]) => ` ${k}="${escAttr(v)}"`).join('');
  const dalsi = odsazeni + '  ';
  return `<${n.tag}${a}>` + deti.map((c) => '\n' + dalsi + serializeHezky(c, dalsi)).join('') + '\n' + odsazeni + `</${n.tag}>`;
}
/* Odebere z podstromu prvky, na které sedí pred(prvek, rodič). */
function odeber(n, pred) {
  n.childNodes = n.childNodes.filter((c) => !(c.nodeType === 1 && pred(c, n)));
  n.childNodes.forEach((c) => { if (c.nodeType === 1) odeber(c, pred); });
}

/* ============================ 1. assets/site.js v izolovaném vm ============================ */
function nactiSite() {
  const ids = new Map();
  const document = {
    readyState: 'loading', documentElement: new VEl('html'),
    addEventListener() {}, removeEventListener() {},
    createElement: (t) => new VEl(t), createTextNode: (s) => new VText(s),
    getElementById: (id) => ids.get(id) || null,
    querySelector: (sel) => { const m = /^#([\w-]+)$/.exec(sel); return m ? ids.get(m[1]) || null : null; },
    querySelectorAll: () => [],
  };
  const ctx = vm.createContext({
    document, window: { addEventListener() {}, matchMedia: () => ({ matches: false }) }, navigator: {},
    console, URL, URLSearchParams, setTimeout: () => 0, clearTimeout() {},
  });
  vm.runInContext(readFileSync(join(ROOT, 'assets/site.js'), 'utf8'), ctx, { filename: 'assets/site.js' });
  const api = vm.runInContext(`({ T, VR_FACTS, VR_PRICING, VR_REVIEWS, VR_CONTACT, VR_TRIP_COUNTS, GALLERY, state, NBf,
    fillFacts, pluralForm, resolve, fmtM, fxLine, renderRatings, buildRoster, renderPriceBlock, renderFooterContact })`, ctx);
  /* Vykreslí blok funkcí ze site.js do prázdného prvku #id a vrátí ho. */
  api.blok = (id, lang, kresli) => {
    const host = new VEl('div'); host.id = id; ids.set(id, host);
    api.state.lang = lang;
    try { kresli(host); } finally { ids.delete(id); }
    return host;
  };
  /* Text z T pro jazyk se zástupnými znaky z VR_FACTS ({loznice}, {cenaOd}…), jako setTexts(). */
  api.text = (lang, klic) => {
    api.state.lang = lang;
    const v = api.resolve(api.T[lang], klic);
    return typeof v === 'string' ? api.fillFacts(v) : null;
  };
  return api;
}

/* ============================ 2. HTML parser s pozicemi ============================
   Šablona je ručně psané, dobře uzavřené HTML, takže stačí jednoduchý tokenizer: komentáře,
   <script> a <style> se přeskočí, u každého prvku si pamatujeme začátek, konec otevírací značky,
   obsah a atributy s pozicemi hodnot. Úpravy se pak dělají přímo v původním textu — diff zůstane
   malý a formátování šablony se nemění. */
function parseHtml(src) {
  const els = [], stack = [], n = src.length;
  let i = 0;
  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    if (src.startsWith('<!--', lt)) { const e = src.indexOf('-->', lt + 4); i = e < 0 ? n : e + 3; continue; }
    if (src[lt + 1] === '!' || src[lt + 1] === '?') { const e = src.indexOf('>', lt); i = e < 0 ? n : e + 1; continue; }
    if (src[lt + 1] === '/') {
      const m = /^<\/([A-Za-z][\w:-]*)\s*>/.exec(src.slice(lt, lt + 80));
      if (!m) { i = lt + 1; continue; }
      const tag = m[1].toLowerCase();
      const top = stack[stack.length - 1];
      if (!top || top.tag !== tag) throw new Error(`HTML: </${tag}> na pozici ${lt} nezavírá <${top ? top.tag : '—'}> (řádek ${src.slice(0, lt).split('\n').length})`);
      stack.pop();
      top.innerEnd = lt; top.end = lt + m[0].length;
      i = top.end;
      continue;
    }
    const m = /^<([A-Za-z][\w:-]*)/.exec(src.slice(lt, lt + 80));
    if (!m) { i = lt + 1; continue; }
    const el = { tag: m[1].toLowerCase(), start: lt, attrs: [], parent: stack[stack.length - 1] || null };
    let j = lt + m[0].length, selfClose = false;
    for (;;) {
      while (j < n && /\s/.test(src[j])) j++;
      if (j >= n) throw new Error('HTML: neukončená značka na pozici ' + lt);
      if (src[j] === '>') { j++; break; }
      if (src[j] === '/' && src[j + 1] === '>') { selfClose = true; j += 2; break; }
      const an = /^[^\s=>/"']+/.exec(src.slice(j, j + 200));
      if (!an) throw new Error('HTML: vadný atribut na pozici ' + j);
      const a = { name: an[0].toLowerCase(), start: j, value: null, vStart: -1, vEnd: -1 };
      j += an[0].length;
      let k = j;
      while (k < n && /\s/.test(src[k])) k++;
      if (src[k] === '=') {
        k++;
        while (k < n && /\s/.test(src[k])) k++;
        const q = src[k];
        if (q === '"' || q === "'") {
          const e = src.indexOf(q, k + 1);
          if (e < 0) throw new Error(`HTML: neukončená uvozovka u atributu ${a.name} (řádek ${src.slice(0, j).split('\n').length})`);
          a.vStart = k + 1; a.vEnd = e; a.uvozovky = true; j = e + 1;
        } else {
          const um = /^[^\s>]+/.exec(src.slice(k, k + 2000));
          if (!um) throw new Error(`HTML: atribut ${a.name} bez hodnoty za „=" (řádek ${src.slice(0, j).split('\n').length})`);
          a.vStart = k; a.vEnd = k + um[0].length; a.uvozovky = false; j = a.vEnd;
        }
        a.value = src.slice(a.vStart, a.vEnd);
      }
      a.end = j;
      el.attrs.push(a);
    }
    el.openEnd = j; el.selfClose = selfClose;
    els.push(el);
    if (selfClose || VOID.has(el.tag)) { el.innerStart = el.innerEnd = el.end = j; i = j; continue; }
    if (el.tag === 'script' || el.tag === 'style') {
      const e = src.toLowerCase().indexOf('</' + el.tag, j);
      el.innerStart = j; el.innerEnd = e; el.end = src.indexOf('>', e) + 1; i = el.end;
      continue;
    }
    el.innerStart = j; stack.push(el); i = j;
  }
  if (stack.length) throw new Error('HTML: neuzavřené prvky ' + stack.map((e) => '<' + e.tag + '>').join(' '));
  return els;
}
const attrOf = (el, name) => { const a = el.attrs.find((x) => x.name === name); return a ? a.value : null; };
const hasAttr = (el, name) => el.attrs.some((x) => x.name === name);
const hasClass = (el, c) => (attrOf(el, 'class') || '').split(/\s+/).includes(c);

/* Úpravy = {start, end, text}; aplikují se odzadu. Úpravy uvnitř nahrazeného obsahu se zahodí. */
function applyEdits(src, edits) {
  const obsah = edits.filter((e) => e.obsah);
  const ok = edits.filter((e) => !obsah.some((o) => o !== e && o.start <= e.start && e.end <= o.end));
  ok.sort((a, b) => a.start - b.start || a.end - b.end);
  let out = '', pos = 0;
  for (const e of ok) {
    if (e.start < pos) throw new Error(`Překrývající se úpravy na pozici ${e.start}`);
    out += src.slice(pos, e.start) + e.text;
    pos = e.end;
  }
  return out + src.slice(pos);
}
function setAttr(el, name, value, edits) {
  const a = el.attrs.find((x) => x.name === name);
  const v = escAttr(value);
  if (a && a.vStart >= 0) {
    // hodnota bez uvozovek (alt=x) dostane uvozovky, jinak by „Villa Rudolf im Winter" rozpadlo atributy
    if (!a.uvozovky) edits.push({ start: a.vStart, end: a.vEnd, text: `"${v}"` });
    else if (a.value !== v) edits.push({ start: a.vStart, end: a.vEnd, text: v });
  }
  else if (a) edits.push({ start: a.end, end: a.end, text: `="${v}"` });
  else { const p = el.selfClose ? el.openEnd - 2 : el.openEnd - 1; edits.push({ start: p, end: p, text: ` ${name}="${v}"` }); }
}
function delAttr(src, el, name, edits) {
  const a = el.attrs.find((x) => x.name === name);
  if (!a) return;
  let s = a.start;
  while (s > 0 && /\s/.test(src[s - 1])) s--;
  edits.push({ start: s, end: a.end, text: '' });
}
const setInner = (el, text, edits) => edits.push({ start: el.innerStart, end: el.innerEnd, text, obsah: true });

/* Relativní cesta mezi dvěma adresáři webu ('' = kořen, 'de/', 'de/faq/'…). */
function relativni(z, kam) {
  const f = z.split('/').filter(Boolean), t = kam.split('/').filter(Boolean);
  let i = 0;
  while (i < f.length && i < t.length && f[i] === t[i]) i++;
  return ('../'.repeat(f.length - i) + t.slice(i).map((s) => s + '/').join('')) || './';
}
/* Relativní odkaz o adresář výš: assets/… → ../assets/…; absolutní, kořenové, #kotvy a ?dotazy beze změny. */
const PRESKOC = /^(?:[a-z][a-z0-9+.-]*:|\/|#|\?)/i;

/* ============================ 3. Hlavička: title, hreflang, JSON-LD, og ============================ */
const ldJson = (o) => JSON.stringify(o, null, 2).replace(/</g, '\\u003c');
/* Na „/" (česky) rozhodne o jazyku ještě před vykreslením. Přesměrovává jen staré odkazy ?lang=,
   uloženou volbu z přepínače a prohlížeč v NĚMČINĚ, POLŠTINĚ, NIZOZEMŠTINĚ nebo FRANCOUZŠTINĚ.
   Angličtinu podle prohlížeče ne: Googlebot má prohlížeč anglický a přesměrování by mu českou
   stránku schovalo. Anglicky mluvícím nabídne anglickou verzi lišta (langSuggest v site.js).
   Zdroj návštěvy musí přesměrování přežít: na /de/ by referrer byla vlastní doména. Proto se tu
   uloží vrZdroj (stejně jako vrZdroj() v site.js — do události poptavka-odeslana) a původní
   referrer pro Umami (vrRef, vrátí ho vrUmamiRef v site.js). */
const PRESMEROVANI = `<script>/* Jazyk (tools/gen-jazyky.mjs): ?lang= ze starých odkazů → volba z přepínače → prohlížeč de/pl/nl/fr. */
(function(){try{var q=location.search,m=/[?&]lang=([a-z]{2})(?![a-z])/i.exec(q),t=m?m[1].toLowerCase():null;
if(!t){try{t=localStorage.getItem('vrLang')}catch(e){}
if(!t){var n=String((navigator.languages&&navigator.languages[0])||navigator.language||'').slice(0,2).toLowerCase();if(n==='de'||n==='pl'||n==='nl'||n==='fr')t=n;}}
if(t==='cs'&&m){try{localStorage.setItem('vrLang','cs')}catch(e){}}
if(t==='de'||t==='pl'||t==='en'||t==='nl'||t==='fr'){
try{var r=document.referrer,h=r?new URL(r).hostname.replace(/^www\\./,''):'',ven=!!h&&h!==location.hostname.replace(/^www\\./,'');
if(ven)sessionStorage.setItem('vrRef',JSON.stringify({r:r,t:Date.now()}));
if(!sessionStorage.getItem('vrZdroj')){var u=new URLSearchParams(q).get('utm_source'),z=u?u.slice(0,40):(ven?h:'');if(z)sessionStorage.setItem('vrZdroj',z);}}catch(e){}
q=q.replace(/([?&])lang=[^&]*(&|$)/i,'$1').replace(/[?&]$/,'');location.replace(t+'/'+q+location.hash);}}catch(e){}})();</script>`;

function hlavicka(api, lang, { cesta, cesty, title, desc, jsonld, presmerovani }) {
  const loc = api.T[lang].meta.locale;
  const out = ['<!-- JAZYKY:START — generuje node tools/gen-jazyky.mjs, ručně neupravovat (texty jsou v T v assets/site.js a v tools/jazyky-obsah.mjs) -->'];
  if (presmerovani) out.push(PRESMEROVANI);
  out.push(`<title>${escText(title)}</title>`);
  out.push(`<meta name="description" content="${escAttr(desc)}">`);
  out.push(`<link rel="canonical" href="${abs(cesta)}">`);
  for (const L of JAZYKY) out.push(`<link rel="alternate" hreflang="${L}" href="${abs(cesty[L])}">`);
  out.push(`<link rel="alternate" hreflang="x-default" href="${abs(cesty[X_DEFAULT])}">`);
  out.push(`<script type="application/ld+json">\n${ldJson(jsonld)}\n</script>`);
  out.push('<meta property="og:type" content="website">');
  out.push('<meta property="og:site_name" content="Villa Rudolf">');
  out.push(`<meta property="og:title" content="${escAttr(title)}">`);
  out.push(`<meta property="og:description" content="${escAttr(desc)}">`);
  out.push(`<meta property="og:url" content="${abs(cesta)}">`);
  out.push('<meta property="og:image" content="https://villarudolf.com/media/photos/hero-summer.jpg">');
  out.push(`<meta property="og:locale" content="${loc}">`);
  for (const L of JAZYKY) if (L !== lang) out.push(`<meta property="og:locale:alternate" content="${api.T[L].meta.locale}">`);
  out.push('<!-- JAZYKY:END -->');
  return out.join('\n');
}
function nahradHlavicku(html, blok) {
  const re = /<!-- JAZYKY:START[\s\S]*?<!-- JAZYKY:END -->/;
  if (!re.test(html)) throw new Error('Šablona nemá blok <!-- JAZYKY:START --> … <!-- JAZYKY:END -->');
  return html.replace(re, () => blok);
}

const kc = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');   // stejně jako fmtNum v site.js
function cenaRozpeti(api) {
  const L = api.VR_PRICING.levels || {};
  const ceny = Object.keys(L).map((k) => L[k].nightly);
  return { od: kc(Math.min(...ceny)), do: kc(Math.max(...ceny)) };
}
const VILA_ID = BASE + '/#villa';
function schemaVila(api, lang) {
  const s = OBSAH.SCHEMA_TEXTY[lang], r = cenaRozpeti(api);
  return Object.assign({ '@type': 'VacationRental', '@id': VILA_ID }, OBSAH.SCHEMA_ZAKLAD, {
    url: abs(DOMOV[lang]),
    description: api.text(lang, 'meta.desc'),
    priceRange: s.cena.replace('{od}', r.od).replace('{do}', r.do),
    containsPlace: {
      '@type': 'House',
      name: s.dum,
      occupancy: { '@type': 'QuantitativeValue', minValue: api.VR_FACTS.minHostu, maxValue: api.VR_FACTS.maxHostu },
      numberOfBedrooms: api.VR_FACTS.loznice,
      numberOfBathroomsTotal: api.VR_FACTS.koupelny,
      floorSize: { '@type': 'QuantitativeValue', value: api.VR_FACTS.plocha, unitCode: 'MTK' },
      bed: Object.entries(OBSAH.SCHEMA_LUZKA).map(([k, n]) => ({ '@type': 'BedDetails', typeOfBed: s.luzka[k], numberOfBeds: n })),
    },
    amenityFeature: s.vybaveni.map((name) => ({ '@type': 'LocationFeatureSpecification', name, value: true })),
  });
}
function schemaDomov(api, lang) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      schemaVila(api, lang),
      { '@type': 'WebPage', '@id': abs(DOMOV[lang]) + '#stranka', url: abs(DOMOV[lang]), name: api.text(lang, 'meta.title'),
        inLanguage: lang, about: { '@id': VILA_ID } },
    ],
  };
}

/* ============================ 4. Homepage v jazyce ============================ */
/* Bloky, které na stránce kreslí JavaScript — staticky je kreslí stejné funkce ze site.js. */
function bloky(api, lang) {
  const t = api.T[lang];
  const cenik = api.blok('vr-priceblock', lang, () => api.renderPriceBlock());
  /* Staticky BEZ řádku o záloze (o záloze 30 % rozhodne Pavel, PR #34) a bez časově omezené
     poznámky o obsazenosti léta — robot by ji četl ještě dlouho po datu. JS je pro lidi doplní. */
  const zaloha = (t.book.priceDeposit || '').replace('%P%', api.VR_PRICING.depositPct);
  odeber(cenik, (n, rodic) => n.className === 'vr-priceblock-note' || (rodic.className === 'vr-priceblock-foot' && n.textContent === zaloha));
  /* „Než dorazíte": JS ukazuje podle sezóny jen část řádků (renderArrive), staticky jdou všechny. */
  const prijezd = new VEl('dl');
  for (const r of t.lokalita.arrive || []) {
    const row = prijezd.appendChild(new VEl('div')); row.className = 'vr-lok-arrive-row';
    row.appendChild(new VEl('dt')).textContent = r.k;
    row.appendChild(new VEl('dd')).textContent = r.v;
  }
  return {
    'vr-ratings': api.blok('vr-ratings', lang, () => api.renderRatings()),
    'vr-roster': api.blok('vr-roster', lang, (h) => api.buildRoster(h)),
    'vr-priceblock': cenik,
    'vr-foot-contact': api.blok('vr-foot-contact', lang, () => api.renderFooterContact()),
    'vr-lok-arrive': prijezd,
  };
}
/* Obsah bloku do šablony; řádkování podle odsazení prvku v šabloně. */
function vnitrek(host, odsazeni) {
  const deti = host.childNodes, dalsi = odsazeni + '  ';
  if (deti.length && deti.every((c) => c.nodeType === 1 && BLOKOVE.has(c.tag))) {
    return deti.map((c) => '\n' + dalsi + serializeHezky(c, dalsi)).join('') + '\n' + odsazeni;
  }
  return deti.map(serialize).join('');
}
/* Zástupné znaky, které v JS dosazuje až jiná funkce než setTexts(). */
function dosad(api, klic, s) {
  if (klic === 'gallery.note') return s.replace('{n}', String(api.GALLERY.length));
  return s;
}

function domovska(api, sablona, lang) {
  const cesta = DOMOV[lang];
  /* --- průchod A: hlavička a bloky kreslené JavaScriptem --- */
  let html = nahradHlavicku(sablona, hlavicka(api, lang, {
    cesta, cesty: DOMOV, title: api.text(lang, 'meta.title'), desc: api.text(lang, 'meta.desc'),
    jsonld: schemaDomov(api, lang), presmerovani: lang === 'cs',
  }));
  const B = bloky(api, lang);
  {
    const edits = [];
    for (const el of parseHtml(html)) {
      const id = attrOf(el, 'id');
      if (id && B[id] != null) {
        const radek = html.slice(html.lastIndexOf('\n', el.start) + 1, el.start);
        setInner(el, vnitrek(B[id], radek.match(/^\s*/)[0]), edits);
      }
      if (el.tag === 'div' && hasClass(el, 'vr-noscript')) {
        const ns = OBSAH.NOSCRIPT[lang], c = api.VR_CONTACT;
        setInner(el, `\n    <p><b>${escText(ns.text)}</b></p>\n    <p>${escText(ns.kontakt)}: <a href="mailto:${c.email}">${c.email}</a> · <a href="tel:${c.phone.replace(/[^\d+]/g, '')}">${escText(c.phone)}</a></p>\n  `, edits);
      }
    }
    for (const id of Object.keys(B)) if (!new RegExp(`id="${id}"`).test(html)) chyba(`index.html: chybí prvek #${id}`);
    html = applyEdits(html, edits);
  }
  /* --- průchod B: texty, atributy, přepínač jazyka, cesty --- */
  const edits = [];
  for (const el of parseHtml(html)) {
    const t = attrOf(el, 'data-t'), th = attrOf(el, 'data-t-html'), tpl = attrOf(el, 'data-tpl');
    if (t != null) {
      const v = api.text(lang, t);
      if (v == null) chyba(`${lang}: v T chybí text „${t}"`);
      else {
        const s = dosad(api, t, v);
        if (/\{[a-zA-Z]+\}/.test(s)) chyba(`${lang}: „${t}" má nedosazený zástupný znak: ${s}`);
        setInner(el, escText(s), edits);
      }
    } else if (th != null) {
      const v = api.text(lang, th);
      if (v == null) chyba(`${lang}: v T chybí text „${th}"`); else setInner(el, v, edits);
    } else if (tpl != null) {
      const v = api.resolve(api.T[lang], tpl), key = attrOf(el, 'data-count');
      const num = api.VR_TRIP_COUNTS[key] != null ? api.VR_TRIP_COUNTS[key] : api.VR_TRIP_COUNTS.total;
      const s = Array.isArray(v) ? v[Math.min(api.pluralForm(lang, num), v.length - 1)] : v;
      if (typeof s !== 'string') chyba(`${lang}: v T chybí šablona „${tpl}"`);
      else { api.state.lang = lang; setInner(el, escText(api.fillFacts(s.replace('{n}', String(num)))), edits); }
    }
    for (const [atr, cil] of [['data-t-ph', 'placeholder'], ['data-t-aria', 'aria-label']]) {
      const k = attrOf(el, atr);
      if (k == null) continue;
      const v = api.text(lang, k);
      if (v == null) chyba(`${lang}: v T chybí text „${k}"`); else setAttr(el, cil, v, edits);
    }
    const alt = attrOf(el, 'data-alt');
    if (alt != null) {
      const v = OBSAH.ALT[lang] && OBSAH.ALT[lang][alt];
      if (v == null) chyba(`${lang}: v jazyky-obsah.mjs chybí alt „${alt}"`); else setAttr(el, 'alt', v, edits);
    }
    if (el.tag === 'html') {
      setAttr(el, 'lang', lang, edits);
      if (lang === 'cs') delAttr(html, el, 'data-root', edits); else setAttr(el, 'data-root', '../', edits);
    }
    /* Přepínač jazyka: skutečné odkazy na jazykové verze (robot je projde, prostřední tlačítko funguje). */
    const dl = attrOf(el, 'data-lang');
    if (el.tag === 'a' && dl != null && hasClass(el, 'vr-lang')) {
      setAttr(el, 'href', relativni(cesta, DOMOV[dl]), edits);
      setAttr(el, 'data-active', dl === lang ? 'true' : 'false', edits);
      if (dl === lang) setAttr(el, 'aria-current', 'page', edits); else delAttr(html, el, 'aria-current', edits);
      continue;
    }
    /* Cesty o adresář výš. Odkazy s data-jazyk-strom vedou na stránku téhož jazyka (faq/) a nemění se. */
    if (lang !== 'cs' && !hasAttr(el, 'data-jazyk-strom')) {
      for (const a of el.attrs) {
        if (!['href', 'src', 'poster', 'data-langlink'].includes(a.name) || a.value == null || a.value === '' || PRESKOC.test(a.value)) continue;
        edits.push({ start: a.vStart, end: a.vEnd, text: '../' + a.value });
      }
    }
  }
  html = applyEdits(html, edits);
  kontrolaStranky(html, lang, cesta, DOMOV);
  return html;
}

/* ============================ 5. Časté dotazy ============================ */
/* Ceny v odpovědích se NEPÍŠOU — dosazují se z VR_PRICING (ceník = cenik.json přes gen-cenik-web):
   {cena:mimo|zimni|svatky|letni|spicka|vanoce|silvestr} cena za noc, {noci:…} minimum nocí,
   {uklid}, {poplatek} (obci, dospělý a noc), {pes}, {kauce}. U DE/EN/PL i přibližně v €/zł. */
function dosadCeny(api, lang, s) {
  const P = api.VR_PRICING, L = P.levels || {};
  const kc = (n, fx) => { const f = fx ? api.fxLine(n, lang) : null; return api.fmtM(n) + (f ? ' (' + f + ')' : ''); };
  return s.replace(/\{(cena|noci):(\w+)\}/g, (m, typ, u) => {
    if (!L[u]) { chyba(`${lang}: Časté dotazy — ceník nemá úroveň „${u}" (${m})`); return m; }
    return typ === 'cena' ? kc(L[u].nightly, true) : L[u].minNights + '\u00a0' + (api.NBf[lang] || api.NBf.cs)(L[u].minNights);
  }).replace(/\{(uklid|poplatek|pes|kauce)\}/g, (m, k) => {
    if (k === 'uklid') return kc(P.cleaning, true);
    if (k === 'poplatek') return kc(P.cityTaxAdultNight, false);
    if (k === 'pes') return kc(P.petPerStay, true);
    return kc(P.bond, true);
  });
}
function faqStranka(api, lang) {
  if (!OBSAH.FAQ || !OBSAH.FAQ_STRANKA) return null;
  const S = OBSAH.FAQ_STRANKA[lang], cesta = FAQ[lang], t = api.T[lang];
  /* Česká homepage dostane ?lang=cs: „/" by jinak prohlížeč v němčině poslal na /de/.
     Výlety, info a podmínky mají jazyk jen v JS (?lang=), statické verze nemají a nizozemsky
     ani francouzsky neumí — odtud vedou anglicky (jazykPodstranky). */
  const domu = relativni(cesta, DOMOV[lang]) + (lang === 'cs' ? '?lang=cs' : ''), koren = relativni(cesta, '');
  const sJazykem = (p) => koren + p + '?lang=' + jazykPodstranky(lang);
  /* {domu} = homepage téhož jazyka, {planovac} = plánovač výletů (relativně), ceny z VR_PRICING. */
  const planovac = sJazykem('vylety/') + '#planovac';
  const q = (x) => {
    if (x[lang] == null) { chyba(`${lang}: Časté dotazy — chybí překlad „${x.cs}"`); return ''; }
    const s = dosadCeny(api, lang, x[lang]).replace(/\{domu\}/g, domu).replace(/\{planovac\}/g, planovac);
    if (/\{[a-z:]+\}/i.test(s)) chyba(`${lang}: Časté dotazy — nedosazený zástupný znak v „${s.slice(0, 80)}"`);
    return s;
  };
  if (lang === 'cs') for (const p of OBSAH.FAQ_PREDPOKLADY || []) {
    const hodnoty = p.urovne.map((u) => (api.VR_PRICING.levels[u] || {})[p.pole]);
    if (new Set(hodnoty).size !== 1) chyba(`Časté dotazy, ${p.kde}: ceník už úrovně ${p.urovne.join('/')} nerozlišuje stejně (${hodnoty.join(' / ')}) — přepiš odpověď v tools/jazyky-obsah.mjs`);
  }
  const sekce = OBSAH.FAQ.map((sk) => {
    const polozky = sk.otazky.map((o) => `        <article class="pi-card faq-q" id="${o.id}">
          <h3 class="pi-name">${escText(q(o.q))}</h3>
          <p class="faq-a">${q(o.a)}</p>
        </article>`).join('\n');
    return `      <section class="pi-sec">
        <div class="pi-sechead"><h2 class="pi-h2">${escText(q(sk.nazev))}</h2></div>
        <div class="faq-list">
${polozky}
        </div>
      </section>`;
  }).join('\n\n');
  const prostyText = (h) => h.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
  const jsonld = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'FAQPage', '@id': abs(cesta) + '#faq', url: abs(cesta), name: S.title, inLanguage: lang,
        about: { '@id': VILA_ID },
        mainEntity: OBSAH.FAQ.flatMap((sk) => sk.otazky.map((o) => ({
          '@type': 'Question', name: q(o.q), acceptedAnswer: { '@type': 'Answer', text: prostyText(q(o.a)) },
        }))) },
      { '@type': 'VacationRental', '@id': VILA_ID, name: 'Villa Rudolf', url: abs(DOMOV[lang]) },
    ],
  };
  const jazyky = PREPINAC.map((L) => `<a class="vr-lang" href="${relativni(cesta, FAQ[L])}" hreflang="${L}" lang="${L}" data-lang="${L}" data-active="${L === lang}"${L === lang ? ' aria-current="page"' : ''}>${L.toUpperCase()}</a>`).join('\n          ');
  const nav = (k, kotva) => `<a href="${domu}#${kotva}">${escText(t.nav[k])}</a>`;
  const c = api.VR_CONTACT;
  const html = `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
${hlavicka(api, lang, { cesta, cesty: FAQ, title: S.title, desc: S.desc, jsonld })}
<meta name="twitter:card" content="summary_large_image">
<meta name="theme-color" content="#0E1311">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='4' fill='%230E1311'/%3E%3Cpath d='M4 25 L12.5 9 L17.5 18 L20.5 12.5 L28 25 Z' fill='%23D68A4C'/%3E%3C/svg%3E">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,300..600;1,6..72,300..500&family=Archivo:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${koren}info/info.css?v=33">
<link rel="stylesheet" href="${koren}assets/faq.css?v=1">
<script src="${koren}assets/season.js?v=54"></script>
</head>
<body>
<!-- Časté dotazy — generuje node tools/gen-jazyky.mjs z tools/jazyky-obsah.mjs. Ručně neupravovat.
     Otázky jsou ze skutečných poptávek hostů, odpovědi jen z text-villa-rudolf.md, kap. 3. -->
<div class="pi-root faq-root" data-season="leto">
<script>(function(){try{var r=document.currentScript.parentNode;var s=window.VRSeason&&window.VRSeason.resolve();if(s)r.setAttribute('data-season',s);}catch(e){}})();</script>
  <header class="vr-nav">
    <div class="vr-nav-inner">
      <a class="vr-brand" href="${domu}"><b>VILLA RUDOLF</b><i>${escText(S.brand)}</i></a>
      <nav class="vr-navlinks" aria-label="${escAttr(t.aria.sections)}">
        ${nav('dum', 'dum')}
        ${nav('vybaveni', 'vybaveni')}
        ${nav('loznice', 'loznice')}
        ${nav('lokalita', 'lokalita')}
        <a href="${sJazykem('vylety/')}">${escText(t.nav.vylety)}</a>
      </nav>
      <div class="vr-navright">
        <div class="vr-langs faq-langs" role="group" aria-label="Jazyk / Language">
          ${jazyky}
        </div>
        <a class="vr-navcta" href="${domu}#rezervace">${escText(t.nav.cta)}</a>
      </div>
    </div>
  </header>

  <div class="pi-wrap">
    <section class="pi-hero">
      <p class="pi-eyebrow">${escText(S.eyebrow)}</p>
      <h1 class="pi-title">${escText(S.h1)}</h1>
      <p class="pi-intro">${S.intro}</p>
    </section>

    <main class="pi-main">
${sekce}

      <section class="pi-sec faq-cta">
        <div class="pi-sechead"><h2 class="pi-h2">${escText(S.dalsi)}</h2></div>
        <p class="faq-a">${S.kontakt.replace('{email}', `<a href="mailto:${c.email}">${c.email}</a>`).replace('{telefon}', `<a href="tel:${c.phone.replace(/[^\d+]/g, '')}">${escText(c.phone)}</a>`)}</p>
        <p><a class="faq-book" href="${domu}#rezervace">${escText(t.nav.cta)} →</a></p>
      </section>
    </main>

    <footer class="pi-footer">
      <a class="pi-back" href="${domu}"><span aria-hidden="true">←</span> ${escText(S.zpet)}</a>
      <a class="pi-terms" href="${sJazykem('info/')}">${escText(t.nav.info)}</a>
      <a class="pi-terms" href="${sJazykem('podminky/')}">${escText(t.footer.terms)}</a>
      <span class="pi-foot-brand">Villa Rudolf · Luční 519, Svoboda nad Úpou · ${escText(t.footer.formerly)}</span>
    </footer>
  </div>
</div>
<script defer src="https://178-104-207-97.sslip.io/script.js" data-website-id="e7532123-5434-44e1-a7ef-6c5d18bed939"></script>
</body>
</html>
`;
  kontrolaStranky(html, lang, cesta, FAQ);
  return html;
}

/* ============================ 6. sitemap.xml ============================ */
const SITEMAP_HLAVA = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generuje node tools/gen-jazyky.mjs — ručně neupravovat (samostatné stránky: SAMOSTATNE v tom skriptu).
     Jen indexovatelné stránky s vlastní canonical. /pruvodce/ (osobní plánovač ubytovaného hosta,
     ?t=TOKEN) a /checkin/ jsou jen pro hosty a mají noindex, proto tu nejsou. Veřejný plánovač je
     /vylety/. Jazykové verze homepage a Častých dotazů jsou spárované přes xhtml:link (hreflang). -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">`;
/* Stránky bez jazykových verzí (jazyk přepíná JS přes ?lang=, robot dostane češtinu). */
const SAMOSTATNE = [
  { cesta: 'vylety/', changefreq: 'monthly', priority: '0.8' },
  { cesta: 'info/', changefreq: 'monthly', priority: '0.7' },
  { cesta: 'podminky/', changefreq: 'yearly', priority: '0.3' },
];
function sitemap(vystupy, dnes) {
  const stara = existsSync(join(ROOT, 'sitemap.xml')) ? readFileSync(join(ROOT, 'sitemap.xml'), 'utf8') : '';
  const lastmod = {};
  for (const m of stara.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)) lastmod[m[1]] = m[2];
  /* lastmod se posune jen u stránky, jejíž obsah se opravdu změnil (jinak by --check neprošel druhý den). */
  const datum = (cesta, soubor) => {
    const u = abs(cesta);
    if (!soubor) return lastmod[u] || dnes;
    const ted = existsSync(join(ROOT, soubor)) ? readFileSync(join(ROOT, soubor), 'utf8') : null;
    return ted === vystupy[soubor] && lastmod[u] ? lastmod[u] : dnes;
  };
  /* Samostatné stránky (bez souboru) lastmod nemají — generátor jejich změny nesleduje a zamrzlé
     datum by bylo horší než žádné (lastmod je nepovinný). */
  const url = (cesta, soubor, changefreq, priority, alt) => [
    '  <url>',
    `    <loc>${abs(cesta)}</loc>`,
    ...(soubor ? [`    <lastmod>${datum(cesta, soubor)}</lastmod>`] : []),
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${priority}</priority>`,
    ...(alt ? JAZYKY.map((L) => `    <xhtml:link rel="alternate" hreflang="${L}" href="${abs(alt[L])}"/>`)
      .concat(`    <xhtml:link rel="alternate" hreflang="x-default" href="${abs(alt[X_DEFAULT])}"/>`) : []),
    '  </url>',
  ].join('\n');
  const radky = [];
  for (const L of JAZYKY) radky.push(url(DOMOV[L], DOMOV[L] + 'index.html', 'weekly', L === 'cs' ? '1.0' : '0.9', DOMOV));
  if (vystupy[FAQ.cs + 'index.html']) for (const L of JAZYKY) radky.push(url(FAQ[L], FAQ[L] + 'index.html', 'monthly', '0.7', FAQ));
  for (const s of SAMOSTATNE) radky.push(url(s.cesta, null, s.changefreq, s.priority));
  return SITEMAP_HLAVA + '\n' + radky.join('\n') + '\n</urlset>\n';
}

/* ============================ 7. Kontroly ============================ */
/* Česká písmena, která v němčině, polštině ani angličtině nejsou. Slovo s nimi je chyba,
   pokud nezačíná kmenem vlastního jména (místa se nepřekládají a polština je skloňuje:
   „Černej hory", „Adršpašskie skały"). Francouzština a nizozemština mají vlastní é
   (été, équipée, één, café), u nich se é nepočítá. */
const CZ_VSE = /[ěščřžůďťňýáíéúĚŠČŘŽŮĎŤŇÝÁÍÉÚ]/;
const CZ_BEZ_E = /[ěščřžůďťňýáíúĚŠČŘŽŮĎŤŇÝÁÍÚ]/;
const ceskaPismena = (lang) => (lang === 'fr' || lang === 'nl' ? CZ_BEZ_E : CZ_VSE);
const JMENA = ['adršp', 'čern', 'krkono', 'sněž', 'úp', 'lázn', 'janské', 'maršov', 'rýchor', 'králov', 'dvůr', 'rudolfův',
  'luční', 'protěž', 'mumlav', 'muchomůrk', 'krakonoš', 'velká', 'malá', 'mladé', 'obří', 'svobod', 'vratislav', 'horní',
  'kč', 'královéhrad', 'důl'];
function kontrolaStranky(html, lang, cesta, cesty) {
  const kde = `${cesta || '/'}index.html`;
  // hreflang: všechny jazyky + x-default, absolutní, canonical = vlastní adresa
  const can = [...html.matchAll(/<link rel="canonical" href="([^"]+)">/g)].map((m) => m[1]);
  if (can.length !== 1 || can[0] !== abs(cesta)) chyba(`${kde}: canonical ${can.join(', ')} ≠ ${abs(cesta)}`);
  const hl = Object.fromEntries([...html.matchAll(/<link rel="alternate" hreflang="([^"]+)" href="([^"]+)">/g)].map((m) => [m[1], m[2]]));
  for (const L of JAZYKY) if (hl[L] !== abs(cesty[L])) chyba(`${kde}: hreflang ${L} = ${hl[L]}`);
  if (hl[lang] !== abs(cesta)) chyba(`${kde}: hreflang vlastního jazyka nemíří na canonical`);
  if (!hl['x-default']) chyba(`${kde}: chybí hreflang x-default`);
  if (!new RegExp(`<html lang="${lang}"`).test(html)) chyba(`${kde}: <html lang> není ${lang}`);
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (e) { chyba(`${kde}: JSON-LD není validní JSON (${e.message})`); }
  }
  if (lang === 'cs') return;
  // zbylá čeština: viditelný text a čitelné atributy, bez komentářů, skriptů a stylů
  let probe = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<(\w+)\b[^>]*\blang="cs"[^>]*>[\s\S]*?<\/\1>/g, '');
  const texty = [...probe.matchAll(/>([^<]+)</g)].map((m) => m[1])
    .concat([...probe.matchAll(/\b(?:alt|title|placeholder|aria-label|content)="([^"]*)"/g)].map((m) => m[1]));
  const zbytek = new Set(), CZ = ceskaPismena(lang);
  for (const s of texty) {
    const zle = s.split(/[\s,.;:!?()„“"'’/–—·«»\u00a0\u202f]+/).filter((w) => CZ.test(w) && !JMENA.some((j) => w.toLowerCase().startsWith(j)));
    if (zle.length) zbytek.add(zle.join(' ') + '  ←  ' + s.trim().replace(/\s+/g, ' ').slice(0, 90));
  }
  for (const z of zbytek) chyba(`${kde}: zbyla čeština: „${z}"`);
}

/* ============================ 8. Hlavní běh ============================ */
const api = nactiSite();
const sablona = readFileSync(join(ROOT, 'index.html'), 'utf8');
const vystupy = {};
for (const L of JAZYKY) vystupy[DOMOV[L] + 'index.html'] = domovska(api, sablona, L);
for (const L of JAZYKY) { const f = faqStranka(api, L); if (f) vystupy[FAQ[L] + 'index.html'] = f; }
vystupy['sitemap.xml'] = sitemap(vystupy, new Date().toISOString().slice(0, 10));

if (chyby.length) {
  console.error(`✗ ${chyby.length} chyb — nic se nezapsalo:\n  - ` + chyby.join('\n  - '));
  process.exit(1);
}
const zmenene = Object.keys(vystupy).filter((f) => !existsSync(join(ROOT, f)) || readFileSync(join(ROOT, f), 'utf8') !== vystupy[f]);
if (CHECK) {
  if (zmenene.length) { console.error('✗ Zastaralé (pusť node tools/gen-jazyky.mjs): ' + zmenene.join(', ')); process.exit(1); }
  console.log('✓ Jazykové stránky jsou aktuální: ' + Object.keys(vystupy).join(', '));
} else {
  for (const f of zmenene) { mkdirSync(dirname(join(ROOT, f)), { recursive: true }); writeFileSync(join(ROOT, f), vystupy[f]); }
  console.log(zmenene.length ? '✓ Zapsáno: ' + zmenene.join(', ') : '✓ Beze změny — vše aktuální.');
}
