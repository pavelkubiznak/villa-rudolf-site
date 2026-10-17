/* Villa Rudolf — kontrola data narození a čísla dokladu (/registrace/).
 *
 * Čisté funkce bez DOM a bez sítě; pravidla jsou tabulka přímo tady (žádná databáze).
 * Běží v prohlížeči (window.VRDoklady) i v Node (tools/test-doklady.mjs).
 *
 * PROČ: za správnost údajů v knize hostů ručí ubytovatel. Hosté zadávali rok narození
 * 2026 (kolečko v telefonu začíná dneškem) a čísla dokladů, která svému státu neodpovídala.
 *
 * Formáty NEJSOU z paměti — u každého pravidla je zdroj (ověřeno 13. 10. 2026). Pravidlo
 * je tvrdé (číslo, které nesedí, formulář nepřijme) jen tam, kde je formát doložený úředně.
 * Všude jinde platí obecná kontrola a host potvrzuje, že číslo opsal přesně.
 */
(function (root) {
  'use strict';

  /* ===================== datum narození ===================== */
  var MAX_AGE = 110;

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  /** Tři políčka (den, měsíc, rok) → 'RRRR-MM-DD', nebo null. Rok musí mít 4 číslice. */
  function birthFromParts(d, m, y) {
    d = String(d || '').trim(); m = String(m || '').trim(); y = String(y || '').trim();
    if (!/^[0-9]{1,2}$/.test(d) || !/^[0-9]{1,2}$/.test(m) || !/^[0-9]{4}$/.test(y)) return null;
    var dd = +d, mm = +m, yy = +y;
    if (mm < 1 || mm > 12 || dd < 1) return null;
    var last = new Date(Date.UTC(yy, mm, 0)).getUTCDate();      // poslední den měsíce
    if (dd > last) return null;
    return y + '-' + pad2(mm) + '-' + pad2(dd);
  }

  function parts(iso) { return { y: +iso.slice(0, 4), m: +iso.slice(5, 7), d: +iso.slice(8, 10) }; }
  /** Celé měsíce mezi narozením a dneškem. */
  function monthsOld(birth, today) {
    var b = parts(birth), t = parts(today);
    return (t.y - b.y) * 12 + (t.m - b.m) - (t.d < b.d ? 1 : 0);
  }

  /**
   * 'future'  – datum v budoucnosti (odmítnout)
   * 'old'     – věk nad 110 let (odmítnout)
   * 'confirm' – mladší než rok, nebo rok narození letošní či loňský: zeptat se („opravdu
   *             je hostovi X měsíců?“) – typický překlep je správný den a měsíc, rok dnešní
   * 'ok'
   */
  function checkBirth(birth, today) {
    if (birth > today) return { code: 'future' };
    // stejná mez jako v databázi: p_birth < current_date - interval '110 years'
    if (birth < (parts(today).y - MAX_AGE) + today.slice(4)) return { code: 'old' };
    var months = monthsOld(birth, today);
    if (months < 12 || parts(birth).y >= parts(today).y - 1) return { code: 'confirm', months: months };
    return { code: 'ok' };
  }

  /* ===================== čísla dokladů ===================== */
  // Kontrolní číslice podle ICAO Doc 9303, část 3, odd. 4.9: váhy 7-3-1 dokola,
  // číslice = hodnota, A–Z = 10–35, součet mod 10.
  function val(c) { return c >= 'A' ? c.charCodeAt(0) - 55 : c.charCodeAt(0) - 48; }
  function icao(s) {
    var w = [7, 3, 1], sum = 0;
    for (var i = 0; i < s.length; i++) sum += val(s.charAt(i)) * w[i % 3];
    return String(sum % 10);
  }
  // Vážený součet (písmena A=10…Z=35) mod 10 – polské doklady.
  function weighted(s, w) {
    var sum = 0;
    for (var i = 0; i < s.length; i++) sum += val(s.charAt(i)) * w[i];
    return sum % 10;
  }

  // Německá sada znaků: jen tato písmena + číslice (bez samohlásek a bez B, D, Q, S).
  var DE9 = /^[CFGHJKLMNPRTVWXYZ][0-9CFGHJKLMNPRTVWXYZ]{8}$/;

  /*
   * Pravidla: RULES[stát][druh] = { forms, where, can, o0, mrz10, check, soft }
   *   forms  – přípustné tvary; první se ukazuje hostovi jako vzor
   *            mask: L = písmeno, D = číslice, A = písmeno nebo číslice; re = přesnější regex
   *            ex   = vymyšlené / vzorové číslo (ze specimenu), žádný skutečný doklad
   *   where  – klíč textu „kde na dokladu číslo je“ (texty v registrace.js)
   *   can    – na dokladu je i šestimístné přístupové číslo CAN, které se s číslem plete
   *   o0     – písmeno O se v čísle nepoužívá → napsané O je nula (opraví se samo)
   *   mrz10  – host mohl opsat číslo ze strojové zóny i s kontrolní číslicí (9 + 1 znak):
   *            když sedí, poslední znak se odřízne
   *   check  – funkce(číslo) → true/false: kontrolní číslice uvnitř čísla
   *   soft   – nesedící kontrolní číslice jen varuje (algoritmus není doložen úředně)
   * Druh: ID = občanský průkaz, P = cestovní pas. „Jiný doklad“ pravidlo nemá nikdy.
   */
  var RULES = {
    /* NĚMECKO
     * Personalausweisverordnung (PAuswV), příloha 3, pozn. 9: číslo jen z písmen
     *   C F G H J K L M N P R T V W X Y Z a číslic – https://www.gesetze-im-internet.de/pauswv/BJNR146000010.html
     * PAuswG § 2 odst. 8: 4 znaky kód úřadu + 5 znaků náhodně; prozatímní průkaz 1 písmeno + 7 číslic
     *   – https://www.gesetze-im-internet.de/pauswg/__2.html
     * PassG § 4 odst. 2 č. 5 (pas; prozatímní a dětský pas 1 písmeno + 7 číslic)
     *   – https://www.gesetze-im-internet.de/pa_g_1986/__4.html
     * BMI, „Die Dokumentennummer in deutschen Ausweisen und Pässen“ (3/2025): číslo začíná
     *   písmenem, písmeno O se nepoužívá – https://www.bmi.bund.de/SharedDocs/downloads/DE/veroeffentlichungen/themen/moderne-verwaltung/ausweise/personalausweis-seriennummer.pdf
     * Kontrolní číslice NENÍ součást čísla na přední straně, je jen ve strojové zóně
     *   (BMI, „Die maschinenlesbare Zone“, 3/2025) → počítá se, když host opíše 10 znaků, a ve čtečce.
     * Vzory: L01XPVM8J (PRADO DEU-BO-02004), C01X00T47 (PRADO DEU-AO-04004).
     */
    DE: {
      ID: { forms: [{ mask: 'AAAAAAAAA', re: DE9, ex: 'L01XPVM8J' }, { mask: 'LDDDDDDD', ex: 'A0000000' }],
        where: 'idFrontTopRight', can: true, o0: true, mrz10: true },
      P: { forms: [{ mask: 'AAAAAAAAA', re: DE9, ex: 'C01X00T47' }, { mask: 'LDDDDDDD', ex: 'A0000000' }],
        where: 'passTopRight', o0: true, mrz10: true }
    },
    /* RAKOUSKO
     * Stadt Wien, „Hinweise zu Dokumentnummern“ (úřední, ale obecní zdroj – spolkový se nenašel):
     *   pas 1 písmeno + 7 číslic, nově 2 písmena + 7 číslic; průkaz 8 číslic, nově 2 písmena + 7 číslic
     *   – https://www.wien.gv.at/politik/wahlkartenantraege-hinweise-dokumentnummern
     * PRADO AUT-AO-02003, AUT-AO-03001 (pas), AUT-BO-02003, AUT-BO-03001 (průkaz): data přechodu
     *   (průkaz 2. 8. 2021, pas 1. 12. 2023) a vzory U6740967, AP1234567, X0001001, PA1234567.
     * Starý průkaz: Wien říká 8 číslic, specimen PRADO začíná písmenem → bere se obojí.
     */
    AT: {
      ID: { forms: [{ mask: 'LLDDDDDDD', ex: 'PA1234567' }, { mask: 'ADDDDDDD', ex: '10001001' }],
        where: 'idFront', can: true },
      P: { forms: [{ mask: 'LLDDDDDDD', ex: 'AP1234567' }, { mask: 'LDDDDDDD', ex: 'U6740967' }],
        where: 'passTopRight' }
    },
    /* NIZOZEMSKO
     * RvIG (Rijksdienst voor Identiteitsgegevens), Kenmerkenbrochure paspoorten en
     *   identiteitskaarten model 2014, odd. 5 Documentnummer: 9 pozic, 1–2 písmena, 3–8 písmena
     *   nebo číslice, 9 číslice; písmeno O se nepoužívá
     *   – https://www.rvig.nl/sites/default/files/2023-02/Kenmerkenbrochure%20paspoorten%20en%20identiteitskaarten%20model%202014%20NL.pdf
     * Model 2021/2024 navíc bez číslice 0 (brožura k průkazu 2024, s. 7)
     *   – https://www.rvig.nl/sites/default/files/2024-12/Kenmerkenbrochure%20Nederlandse%20identiteitskaart%20model%202024%20-%20EN.pdf
     * Model 2014 platí do 2031 a nulu mít může → pravidlo ji povoluje. Vzor: SPECI2014.
     */
    NL: {
      ID: { forms: [{ mask: 'LLAAAAAAD', re: /^[A-NP-Z]{2}[A-NP-Z0-9]{6}[0-9]$/, ex: 'SPECI2014' }],
        where: 'idFrontTopRight', can: true, o0: true, mrz10: true },
      P: { forms: [{ mask: 'LLAAAAAAD', re: /^[A-NP-Z]{2}[A-NP-Z0-9]{6}[0-9]$/, ex: 'SPECI2014' }],
        where: 'passTopRight', o0: true, mrz10: true }
    },
    /* BELGIE
     * Národní registr (Rijksregister / Registre national), instrukce TI180 a IT195: číslo karty
     *   má 12 číslic – prefix, sedmimístné pořadové číslo, dvoumístné kontrolní číslo; tiskne se
     *   000-0000000-00 – https://www.rijksregister.fgov.be/sites/default/files/documents/fr/registre-national/instructions/liste-TI/TI180_CertificatsCIE.pdf
     * Kontrola: poslední 2 číslice = prvních 10 mod 97 (0 se píše 97). IT195 jmenuje „modulo 97“
     *   jen u konzulárních karet; přesný postup je z knihovny python-stdnum (neúřední) a na dvou
     *   úředních vzorech nesedí → nesedící kontrola JEN VARUJE (soft).
     * Pas: PRADO BEL-AO-08001 „AA NNNNNN“ (do 6. 2. 2022), model 2022 má 2 písmena + 7 číslic
     *   (specimen PRADO BEL-AO-11001). Vzory: 000-0010900-36, EP000000.
     */
    BE: {
      ID: { forms: [{ mask: 'DDDDDDDDDDDD', ex: '000-0010900-36' }], where: 'idFrontCard',
        check: function (s) { var r = +s.slice(0, 10) % 97; return +s.slice(10) === (r === 0 ? 97 : r); }, soft: true },
      P: { forms: [{ mask: 'LLDDDDDD', ex: 'EP000000' }, { mask: 'LLDDDDDDD', ex: 'GA0000000' }], where: 'passTopRight' }
    },
    /* POLSKO
     * Tvar: PRADO POL-BO-05001 / 04001 / 03001 / 02003 (dowód 2021, 2019, 2015, 2013) a
     *   POL-AO-07001 / 06001 / 05002 (pas 2022, 2018, 2011) – https://www.consilium.europa.eu/prado/en/POL-BO-05001/index.html
     * Kontrolní číslice = první číslice za písmeny. U dowodu to potvrzuje školicí materiál policie
     *   (CSP Legionowo, 2013): „z trzech liter i sześciu cyfr, z których jedna (pierwsza cyfra) to
     *   cyfra kontrolna“ – https://www.csp.edu.pl/download/6/16750/Dowodosobisty-zabezpieczeniastwierdzajaceautentycznosdokumentuDSledziewskinr103.pdf
     * Váhy NEJSOU v žádném právním předpisu (nařízení o vzoru dowodu ani pasový zákon tvar čísla
     *   neurčují). Dowód 7,3,1,9,7,3,1,7,3 uvádí pl.wikipedia (neúřední); pas 7,3,9,1,7,3,1,7,3
     *   drží jen na vzorech. Obojí ověřeno výpočtem na všech 7 úředních vzorech z PRADO:
     *   ZZC708926, ZZC301730, ZZC900146, ZZA002204 (dowód), ZF6000482, ZE3012230, ZE8010075 (pas)
     *   – součet mod 10 = 0 u všech. Písmena A = 10 … Z = 35 (stejně jako ICAO 9303-3, odd. 4.9).
     * Dowód vzor 2015 (platí do 3/2029) má číslo JEN na zadní straně.
     */
    PL: {
      ID: { forms: [{ mask: 'LLLDDDDDD', ex: 'ZZC708926' }], where: 'idPl', can: true,
        check: function (s) { return weighted(s, [7, 3, 1, 9, 7, 3, 1, 7, 3]) === 0; } },
      P: { forms: [{ mask: 'LLDDDDDDD', ex: 'ZF6000482' }], where: 'passTopRight',
        check: function (s) { return weighted(s, [7, 3, 9, 1, 7, 3, 1, 7, 3]) === 0; } }
    },
    /* ČESKO
     * Ministerstvo vnitra, popis databáze neplatných dokladů: „Číslo dokladu je tvořeno devíti
     *   číslicemi, první z nich nesmí být nula“ (občanský průkaz), „osmi číslicemi…“ (pas)
     *   – https://mv.gov.cz/neplatne-doklady-ve-formatu-xml
     * PRADO CZE-BO-04002 „Composition: NNNNNNNNN“, CZE-AO-04002 (pas). Kontrolní číslice jen
     *   ve strojové zóně (vyhl. 281/2021 Sb. § 7). Průkazy se sérií (do 30. 6. 2000) pozbyly
     *   platnosti 2. 8. 2026 (zák. 269/2021 Sb. § 72). Vzory jsou vymyšlené.
     */
    CZ: {
      ID: { forms: [{ mask: 'DDDDDDDDD', re: /^[1-9][0-9]{8}$/, ex: '123456789' }], where: 'idFront', can: true },
      P: { forms: [{ mask: 'DDDDDDDD', re: /^[1-9][0-9]{7}$/, ex: '12345678' }], where: 'passTopRight' }
    },
    /* SLOVENSKO
     * Ministerstvo vnútra SR, formulář stratených a odcudzených dokladov: „Číslo cestovného pasu
     *   zadajte vo formáte XX1234567“, u občianskeho preukazu série + 6 číslic
     *   – https://www.minv.sk/?stratene-a-odcudzene-doklady
     * PRADO SVK-BO-07001 … 01001 (průkaz 1993–2024: 2 písmena + 6 číslic), SVK-AO-05001 / 04001 /
     *   03001 (pas). Kontrolní číslice jen ve strojové zóně. Vzory jsou vymyšlené.
     */
    SK: {
      ID: { forms: [{ mask: 'LLDDDDDD', ex: 'XX123456' }], where: 'idFront', can: true },
      P: { forms: [{ mask: 'LLDDDDDDD', ex: 'XX1234567' }], where: 'passTopRight' }
    },
    /* SPOJENÉ KRÁLOVSTVÍ (jen pas – občanský průkaz neexistuje)
     * HM Passport Office, „Basic passport checks“: číslo pasu má 9 číslic
     *   – https://www.gov.uk/government/publications/basic-passport-checks/basic-passport-checks-accessible
     * PRADO GBR-AO-06001, GBR-AO-07001. Vzor: 999313765.
     */
    GB: {
      P: { forms: [{ mask: 'DDDDDDDDD', ex: '999313765' }], where: 'passTopRight' }
    },
    /* ITÁLIE (jen pas)
     * PRADO ITA-AO-02004 uvádí složení čísla textem „AANNNNNNN“; ITA-AO-02005 (model 2023) stejné.
     *   – https://www.consilium.europa.eu/prado/en/ITA-AO-02004/index.html  Vzor: YA0000000.
     */
    IT: {
      P: { forms: [{ mask: 'LLDDDDDDD', ex: 'YA0000000' }], where: 'passTopRight' }
    }
  };

  var CLASS = { L: '[A-Z]', D: '[0-9]', A: '[A-Z0-9]' };
  function formRe(f) {
    if (f.re) return f.re;
    if (!f._re) f._re = new RegExp('^' + f.mask.split('').map(function (c) { return CLASS[c]; }).join('') + '$');
    return f._re;
  }
  function matches(rule, v) {
    return rule.forms.some(function (f) { return formRe(f).test(v); });
  }

  /** Na co se číslo zjednoduší před kontrolou i před uložením: velká písmena, jen A–Z a 0–9. */
  function normalize(raw) {
    return String(raw || '').toUpperCase().replace(/[\s.\-\/]/g, '');
  }

  function ruleFor(country, type) {
    var c = Object.prototype.hasOwnProperty.call(RULES, country) ? RULES[country] : null;
    return c && Object.prototype.hasOwnProperty.call(c, type) ? c[type] : null;
  }

  // Zkusí číslo dostat do tvaru pravidla: O → 0 a odříznutí kontrolní číslice ze strojové zóny.
  function fitRule(rule, v) {
    var tries = [v];
    if (rule.o0) tries.push(v.charAt(0) + v.slice(1).replace(/O/g, '0'));
    for (var i = 0; i < tries.length; i++) {
      var t = tries[i];
      if (matches(rule, t)) return t;
      if (rule.mrz10 && t.length === 10 && matches(rule, t.slice(0, 9)) && icao(t.slice(0, 9)) === t.charAt(9)) {
        return t.slice(0, 9);
      }
    }
    return null;
  }

  /**
   * Kontrola čísla dokladu. country = ISO alpha-2 občanství, type = 'ID' | 'P' | 'O'.
   * Vrací { code, value, rule?, other? }:
   *   'empty'    – nic nezadáno (jestli je doklad povinný, řeší formulář)
   *   'chars'    – jiné znaky než písmena a číslice
   *   'ok'       – sedí na pravidlo státu (value = číslo k uložení)
   *   'format'   – stát pravidlo má a číslo na něj nesedí → nepřijmout
   *   'other'    – nesedí na zvolený druh, ale sedí na druhý (other = 'ID' | 'P') → přepnout druh
   *   'checksum' – tvar sedí, kontrolní číslice ne → nepřijmout
   *   'checksoft'– totéž, ale algoritmus není doložen úředně → jen se zeptat
   *   'generic'  – stát/druh pravidlo nemá, obecná kontrola prošla → chtít potvrzení hosta
   *   'short' / 'long' – obecná kontrola neprošla (5–20 znaků)
   */
  function checkDoc(raw, country, type) {
    var v = normalize(raw);
    if (v === '') return { code: 'empty', value: '' };
    if (!/^[A-Z0-9]+$/.test(v)) return { code: 'chars', value: v };
    var rule = ruleFor(country, type);
    if (rule) {
      var fit = fitRule(rule, v);
      if (fit) {
        if (rule.check && !rule.check(fit)) return { code: rule.soft ? 'checksoft' : 'checksum', value: fit, rule: rule };
        return { code: 'ok', value: fit, rule: rule };
      }
      var otherType = type === 'ID' ? 'P' : 'ID', o = ruleFor(country, otherType);
      if (o) {
        var of = fitRule(o, v);
        if (of && (!o.check || o.soft || o.check(of))) return { code: 'other', value: v, rule: rule, other: otherType };
      }
      return { code: 'format', value: v, rule: rule };
    }
    // stát má pravidlo jen pro druhý druh dokladu (např. britský pas) a číslo na něj sedí
    if (type === 'ID' || type === 'P') {
      var t2 = type === 'ID' ? 'P' : 'ID', r2 = ruleFor(country, t2);
      if (r2 && fitRule(r2, v)) return { code: 'other', value: v, other: t2 };
    }
    if (v.length < 5) return { code: 'short', value: v };
    if (v.length > 20) return { code: 'long', value: v };
    return { code: 'generic', value: v };
  }

  /** Popis tvaru pro hosta: [[počet, 'L' | 'D' | 'A'], …] – slova doplní registrace.js. */
  function shape(form) {
    var out = [], m = form.mask;
    for (var i = 0; i < m.length; i++) {
      if (out.length && out[out.length - 1][1] === m.charAt(i)) out[out.length - 1][0]++;
      else out.push([1, m.charAt(i)]);
    }
    return out;
  }

  var api = {
    birthFromParts: birthFromParts, checkBirth: checkBirth, monthsOld: monthsOld,
    checkDoc: checkDoc, ruleFor: ruleFor, normalize: normalize, shape: shape,
    icaoCheckDigit: icao, RULES: RULES, MAX_AGE: MAX_AGE
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VRDoklady = api;
})(typeof window !== 'undefined' ? window : this);
