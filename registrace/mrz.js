/* Villa Rudolf — strojově čitelná zóna dokladu (MRZ): rozbor textu.
 *
 * Čistá funkce bez DOM a bez sítě: dostane řádky textu (z OCR), vrátí údaje, nebo null.
 * Formáty podle ICAO Doc 9303 (8. vydání, 2021):
 *   část 4 – TD3 (pas, 2 × 44 znaků), část 5 – TD1 (průkaz, 3 × 30), část 6 – TD2 (2 × 36),
 *   část 3 odd. 4.9 – kontrolní číslice: váhy 7, 3, 1 dokola, 0–9 = 0–9, A–Z = 10–35, „<“ = 0,
 *   součet mod 10. https://www.icao.int/publications/pages/publication.aspx?docnum=9303
 *
 * Výsledek se bere, JEN když sedí všechny kontrolní číslice (číslo dokladu, datum narození,
 * platnost a souhrnná). Jedna špatně přečtená číslice tak neprojde – čtečka zkusí další snímek.
 *
 * Běží v prohlížeči (window.VRMrz) i v Node (tools/test-doklady.mjs).
 */
(function (root) {
  'use strict';

  var W = [7, 3, 1];
  function val(c) {
    if (c >= '0' && c <= '9') return c.charCodeAt(0) - 48;
    if (c >= 'A' && c <= 'Z') return c.charCodeAt(0) - 55;
    return 0;                                   // „<“
  }
  function checkDigit(s) {
    var sum = 0;
    for (var i = 0; i < s.length; i++) sum += val(s.charAt(i)) * W[i % 3];
    return String(sum % 10);
  }

  // OCR si v číselných polích plete tvarově podobné znaky. Opravuje se jen tam, kde smí být
  // jen číslice (data, kontrolní číslice) – číslo dokladu se neopravuje, tam rozhodne kontrola.
  var TO_DIGIT = { O: '0', Q: '0', D: '0', I: '1', L: '1', Z: '2', S: '5', G: '6', B: '8' };
  function digits(s) {
    return s.replace(/[A-Z]/g, function (c) { return TO_DIGIT[c] || c; });
  }
  var TO_ALPHA = { '0': 'O', '1': 'I', '2': 'Z', '5': 'S', '8': 'B' };
  function alpha(s) {
    return s.replace(/[0-9]/g, function (c) { return TO_ALPHA[c] || c; });
  }

  // ISO 3166-1 alpha-3 (v MRZ) → alpha-2 (ve formuláři). Německo má v MRZ jen „D“.
  var A3 = {
    D: 'DE', DEU: 'DE', CZE: 'CZ', SVK: 'SK', POL: 'PL', AUT: 'AT', NLD: 'NL', UKR: 'UA', GBR: 'GB',
    ALB: 'AL', AND: 'AD', ARM: 'AM', ARG: 'AR', AUS: 'AU', AZE: 'AZ', BEL: 'BE', BIH: 'BA', BRA: 'BR',
    BGR: 'BG', BLR: 'BY', CAN: 'CA', CHE: 'CH', CHN: 'CN', CYP: 'CY', DNK: 'DK', EST: 'EE', EGY: 'EG',
    ESP: 'ES', FIN: 'FI', FRA: 'FR', GEO: 'GE', GRC: 'GR', HRV: 'HR', HUN: 'HU', IRL: 'IE', ISR: 'IL',
    IND: 'IN', ISL: 'IS', ITA: 'IT', JPN: 'JP', KOR: 'KR', KAZ: 'KZ', LIE: 'LI', LTU: 'LT', LUX: 'LU',
    LVA: 'LV', MDA: 'MD', MNE: 'ME', MKD: 'MK', MLT: 'MT', MEX: 'MX', NOR: 'NO', NZL: 'NZ', PRT: 'PT',
    ROU: 'RO', SRB: 'RS', RUS: 'RU', SWE: 'SE', SVN: 'SI', THA: 'TH', TUR: 'TR', USA: 'US', VNM: 'VN',
    ZAF: 'ZA'
  };
  function country(a3) {
    var k = alpha(a3.replace(/</g, ''));
    return Object.prototype.hasOwnProperty.call(A3, k) ? A3[k] : null;
  }

  // RRMMDD → RRRR-MM-DD. Století: datum narození nesmí být v budoucnosti.
  function birthIso(yymmdd, todayIso) {
    if (!/^[0-9]{6}$/.test(yymmdd)) return null;
    var yy = +yymmdd.slice(0, 2), mm = yymmdd.slice(2, 4), dd = yymmdd.slice(4, 6);
    if (+mm < 1 || +mm > 12 || +dd < 1 || +dd > 31) return null;
    var iso = '20' + yymmdd.slice(0, 2) + '-' + mm + '-' + dd;
    if (iso > todayIso) iso = '19' + (yy < 10 ? '0' + yy : yy) + '-' + mm + '-' + dd;
    return iso;
  }

  // „NOVAK<<JAN<PETR<<<<“ → { last: 'Novak', first: 'Jan Petr' }
  function cap(w) { return w.charAt(0) + w.slice(1).toLowerCase(); }
  function names(field) {
    var s = alpha(field).replace(/<+$/, '');
    var i = s.indexOf('<<');
    var last = i < 0 ? s : s.slice(0, i), first = i < 0 ? '' : s.slice(i + 2);
    function words(x) { return x.split('<').filter(Boolean).map(cap).join(' '); }
    return { last: words(last), first: words(first) };
  }

  // Jeden řádek z OCR → jen znaky MRZ. Mezery pryč, časté náhrady za „<“.
  function clean(line) {
    return String(line || '').toUpperCase().replace(/[«‹⟨<]/g, '<').replace(/[^A-Z0-9<]/g, '');
  }
  // Řádek se jmény nemá kontrolní číslici a OCR v něm často špatně spočítá výplň „<“.
  function fit(line, len) {
    if (line.length > len) return line.slice(0, len);
    while (line.length < len) line += '<';
    return line;
  }

  // Volitelné pole bývá samá výplň „<“ a OCR jich občas přečte o jednu víc nebo míň.
  // Když je mezi pevným začátkem a koncem řádku jen výplň, dá se délka bezpečně srovnat –
  // souhrnná kontrolní číslice případnou chybu stejně odhalí.
  function refill(line, len, head, tail) {
    if (line.length === len || Math.abs(line.length - len) > 3) return line;
    var mid = line.slice(head, line.length - tail);
    if (!/^<*$/.test(mid)) return line;
    return line.slice(0, head) + new Array(len - head - tail + 1).join('<') + line.slice(line.length - tail);
  }

  function td3(l1, l2, today) {
    l2 = refill(l2, 44, 28, 2);
    if (l2.length !== 44 || l1.charAt(0) !== 'P') return null;
    // číselná pole opravit ještě před souhrnnou kontrolou (počítá se z celého řádku)
    l2 = l2.slice(0, 9) + digits(l2.charAt(9)) + l2.slice(10, 13) + digits(l2.slice(13, 20)) + l2.charAt(20) +
      digits(l2.slice(21, 28)) + l2.slice(28, 42) + digits(l2.slice(42));
    var doc = l2.slice(0, 9), dob = digits(l2.slice(13, 19)), exp = digits(l2.slice(21, 27));
    var c = digits(l2.charAt(9) + l2.charAt(19) + l2.charAt(27) + l2.charAt(43));
    var comp = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 43);
    if (checkDigit(doc) !== c.charAt(0) || checkDigit(dob) !== c.charAt(1) ||
        checkDigit(exp) !== c.charAt(2) || checkDigit(comp) !== c.charAt(3)) return null;
    var n = names(fit(l1, 44).slice(5));
    return out('P', doc, dob, l2.slice(10, 13), n, today);
  }

  // První znak karty: I = průkaz totožnosti; A a C mají povolení k pobytu a jiné karty
  // (např. německý Aufenthaltstitel) – ty jdou do formuláře jako „Jiný doklad“.
  function cardType(l1) { return l1.charAt(0) === 'I' ? 'ID' : 'O'; }

  function td1(l1, l2, l3, today) {
    l1 = refill(l1, 30, 15, 0); l2 = refill(l2, 30, 18, 1);
    if (l1.length !== 30 || l2.length !== 30) return null;
    if (!/^[ACI]/.test(l1)) return null;
    l2 = digits(l2.slice(0, 7)) + l2.charAt(7) + digits(l2.slice(8, 15)) + l2.slice(15, 29) + digits(l2.charAt(29));
    var doc = l1.slice(5, 14), cd = digits(l1.charAt(14));
    var dob = digits(l2.slice(0, 6)), exp = digits(l2.slice(8, 14));
    var c = digits(l2.charAt(6) + l2.charAt(14) + l2.charAt(29));
    // Číslo delší než 9 znaků (např. belgický průkaz): místo kontrolní číslice je „<“,
    // zbytek čísla i s kontrolní číslicí pokračuje ve volitelném poli (9303-5, pozn. j).
    if (l1.charAt(14) === '<') {
      var rest = l1.slice(15).replace(/<+$/, '');
      if (rest.length < 2) return null;
      doc = doc + rest.slice(0, -1); cd = digits(rest.slice(-1));
    }
    var comp = l1.slice(5) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29);
    if (checkDigit(doc) !== cd || checkDigit(dob) !== c.charAt(0) ||
        checkDigit(exp) !== c.charAt(1) || checkDigit(comp) !== c.charAt(2)) return null;
    return out(cardType(l1), doc, dob, l2.slice(15, 18), names(fit(l3, 30)), today);
  }

  function td2(l1, l2, today) {
    l2 = refill(l2, 36, 28, 2);
    if (l2.length !== 36 || !/^[ACI]/.test(l1)) return null;
    l2 = l2.slice(0, 9) + digits(l2.charAt(9)) + l2.slice(10, 13) + digits(l2.slice(13, 20)) + l2.charAt(20) +
      digits(l2.slice(21, 28)) + l2.slice(28, 35) + digits(l2.charAt(35));
    var doc = l2.slice(0, 9), dob = digits(l2.slice(13, 19)), exp = digits(l2.slice(21, 27));
    var c = digits(l2.charAt(9) + l2.charAt(19) + l2.charAt(27) + l2.charAt(35));
    var comp = l2.slice(0, 10) + l2.slice(13, 20) + l2.slice(21, 35);
    if (checkDigit(doc) !== c.charAt(0) || checkDigit(dob) !== c.charAt(1) ||
        checkDigit(exp) !== c.charAt(2) || checkDigit(comp) !== c.charAt(3)) return null;
    return out(cardType(l1), doc, dob, l2.slice(10, 13), names(fit(l1, 36).slice(5)), today);
  }

  function out(type, doc, dob, nat, n, today) {
    var b = birthIso(dob, today);
    if (!b) return null;
    return {
      docType: type,                              // 'P' | 'ID' | 'O' – stejné kódy jako ve formuláři
      docNumber: doc.replace(/</g, ''),
      birth: b,
      citizenship: country(nat),                  // null = zemi neznáme, formulář ji nechá být
      firstName: n.first, lastName: n.last        // bez diakritiky – host je opraví podle dokladu
    };
  }

  /** lines: pole řádků textu (jakékoli, i s okolním balastem). today: 'RRRR-MM-DD'. */
  function parseMrz(lines, today) {
    var L = (lines || []).map(clean).filter(function (x) { return x.length >= 27; });
    var i, r;
    for (i = 0; i + 1 < L.length; i++) {
      if (Math.abs(L[i + 1].length - 44) <= 3 && Math.abs(L[i].length - 44) <= 3) {
        r = td3(L[i], L[i + 1], today); if (r) return r;
      }
    }
    for (i = 0; i + 1 < L.length; i++) {
      if (Math.abs(L[i].length - 30) <= 3 && Math.abs(L[i + 1].length - 30) <= 3) {
        r = td1(L[i], L[i + 1], L[i + 2] || '', today); if (r) return r;
      }
    }
    for (i = 0; i + 1 < L.length; i++) {
      if (Math.abs(L[i + 1].length - 36) <= 3 && Math.abs(L[i].length - 36) <= 3) {
        r = td2(L[i], L[i + 1], today); if (r) return r;
      }
    }
    return null;
  }

  var api = { parseMrz: parseMrz, checkDigit: checkDigit };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.VRMrz = api;
})(typeof window !== 'undefined' ? window : this);
