/* ============================================================================
   Villa Rudolf — VÝCHOZÍ SEZÓNA (jediný zdroj pravdy pro celý web)

   Tenhle soubor rozhoduje, jestli se stránka otevře v LÉTĚ, nebo v ZIMĚ.
   Načítá ho index.html i všechny podstránky (/vylety/, /pruvodce/, /info/,
   /podminky/), aby se sezóna nikde nerozhodovala podruhé a jinak.
   Musí být načtený SYNCHRONNĚ v <head> (bez defer) — hned pod otevírací
   značkou .vr-root ho volá krátký inline skript, aby se sezóna promítla
   do DOM ještě před prvním vykreslením a nezablikalo léto v lednu.

   POŘADÍ PRIORIT (záměrné, neměnit bez důvodu):
     1) ?season=leto|zima v adrese — sdílený odkaz i ruční přepnutí vždy vyhrají.
        Všechny vnitřní odkazy si parametr nesou s sebou, takže volba hosta
        přežije i přechod na podstránku.
     2) DATUM — kdo přijde v lednu, uvidí zimní web, ne bazén.
     3) uložená volba — pojistka, když by 1) i 2) selhaly. Drží se JEN po dobu
        návštěvy (sessionStorage), aby host, který si v srpnu klikl na zimu,
        neviděl zimu i příští červen.
   ========================================================================== */
(function (w) {
  'use strict';
  if (w.VRSeason) return;

  /* ------------------------------------------------------------------------
     HRANICE SEZÓN — TADY SE TO LADÍ, nikde jinde v kódu.

       ZIMA: 15. 10. – 31. 3.        LÉTO: 1. 4. – 14. 10.

     Proč 15. října a ne 1. prosince: zimní pobyt pro velkou skupinu se poptává
     2–3 měsíce dopředu (Silvestr, jarní prázdniny, firemní akce). Kdo hledá
     v půlce října, plánuje lyže — ne bazén. A naopak od 1. dubna se poptává
     léto, i když na hřebenech ještě leží sníh.
     Posun hranice = změna JEN těchto dvou konstant (měsíc + den).
     ---------------------------------------------------------------------- */
  var WINTER_FROM = { month: 10, day: 15 };  // od 15. 10. včetně je ZIMA
  var WINTER_TO   = { month: 3,  day: 31 };  // do 31. 3. včetně je ZIMA

  var STORE_KEY = 'vrSeason';

  function valid(s) { return s === 'leto' || s === 'zima'; }

  /* Sezóna podle data. Interval přechází přes Nový rok, proto OR, ne AND. */
  function forDate(d) {
    var m = d.getMonth() + 1, day = d.getDate();
    var afterStart = m > WINTER_FROM.month || (m === WINTER_FROM.month && day >= WINTER_FROM.day);
    var beforeEnd  = m < WINTER_TO.month   || (m === WINTER_TO.month   && day <= WINTER_TO.day);
    return (afterStart || beforeEnd) ? 'zima' : 'leto';
  }

  function stored() {
    try {
      var s = w.sessionStorage.getItem(STORE_KEY);
      return valid(s) ? s : null;
    } catch (e) { return null; }
  }

  /* Uložení jen na dobu návštěvy. Zároveň uklidíme starý trvalý klíč
     z localStorage — dřív se tam sezóna držela napořád a to je právě ta chyba,
     kterou tenhle soubor odstraňuje. */
  function remember(s) {
    if (!valid(s)) return;
    try { w.sessionStorage.setItem(STORE_KEY, s); } catch (e) {}
    try { w.localStorage.removeItem(STORE_KEY); } catch (e) {}
  }

  function fromQuery(search) {
    var raw = search != null ? search : (w.location ? w.location.search : '');
    var m = /[?&]season=([^&#]*)/.exec(String(raw));
    if (!m) return null;
    var q = decodeURIComponent(m[1] || '').toLowerCase();
    return valid(q) ? q : null;
  }

  /* Hlavní vstupní bod: vrátí 'leto' | 'zima' podle pořadí priorit výše. */
  function resolve(search) {
    var q = fromQuery(search);
    if (q) { remember(q); return q; }
    var d = forDate(new Date());
    if (valid(d)) return d;
    return stored() || 'leto';
  }

  w.VRSeason = {
    resolve: resolve,
    forDate: forDate,
    remember: remember,
    valid: valid,
    /* Vystaveno kvůli testům a případnému ladění hranic z konzole. */
    bounds: { winterFrom: WINTER_FROM, winterTo: WINTER_TO },
  };
})(window);
