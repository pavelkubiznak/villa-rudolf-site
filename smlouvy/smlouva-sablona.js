/* Villa Rudolf — šablona ubytovací smlouvy (cs / de / en)
 *
 * Jediný zdroj znění smlouvy. Vstupem je objekt `d` (viz smlouvy.js → buildData),
 * výstupem samostatný HTML dokument (styl inline), který se tiskne do PDF
 * a ukládá do vr_contracts.html jako snapshot.
 *
 * Znění CS je doslova to, co se posílalo od srpna 2026 (Stibalová, Mikoláš,
 * Sabáčková) včetně úprav z 29. 8. 2026: bez počtu osob, bez výčtu koupelen,
 * bez náhradníka. DE/EN vychází z bilingvní smlouvy Rohrberg (8/2026) a je
 * dotažené na stejné paragrafy jako CS.
 *
 * Varianty, které šablona umí:
 *   d.plan  'single' — celá cena jednou zálohovou fakturou
 *           'split'  — 50 % zálohová faktura + 50 % doplatek se splatností
 *                      před skokem storna na 70 % (arrival − 65 dní)
 *   d.currency 'CZK' | 'EUR' — EUR = platba v EUR na eurový účet, částky
 *              se ukazují v CZK s orientačním přepočtem
 */
(function (global) {
  'use strict';

  var LESSOR = {
    name: 'Sintera Czech s.r.o.',
    addr: 'Orlická 163/18, 500 03 Hradec Králové',
    ico: '29130336', dic: 'CZ29130336',
    reg: { cs: 'Městský soud v Praze, oddíl C, vložka 202397',
           de: 'Stadtgericht Prag, Abt. C, Einlage 202397',
           en: 'Municipal Court in Prague, Section C, Insert 202397' },
    rep: 'Mgr. Pavel Kubizňák',
    role: { cs: 'jednatel', de: 'Geschäftsführer', en: 'Managing Director' },
    objectAddr: 'Luční 519, 542 24 Svoboda nad Úpou',
    phone: '+420 775 220 785',
    email: 'pavel.kubiznak@sintera.cz'
  };

  var BANK = {
    CZK: { holder: 'Sintera Czech s.r.o.', acc: '2400716277 / 2010', iban: 'CZ57 2010 0000 0024 0071 6277', bic: 'FIOBCZPPXXX',
           bank: 'Fio banka, a.s., Na Florenci 2139/2, 110 00 Praha' },
    EUR: { holder: 'Sintera Czech s.r.o.', acc: '2602140763 / 2010', iban: 'CZ08 2010 0000 0026 0214 0763', bic: 'FIOBCZPPXXX',
           bank: 'Fio banka, a.s., Na Florenci 2139/2, 110 00 Praha' }
  };

  var COUNTRY = { cs: 'Česká republika', de: 'Tschechien', en: 'Czech Republic' };

  var MONTHS = {
    cs: ['ledna', 'února', 'března', 'dubna', 'května', 'června', 'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'],
    de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  };
  var WEEKDAYS = {
    cs: ['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'],
    de: ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'],
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  };

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function parseISO(s) { return new Date(s + 'T00:00:00'); }
  function addDays(iso, n) {
    var d = parseISO(iso); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function nights(a, b) { return Math.max(0, Math.round((parseISO(b) - parseISO(a)) / 86400000)); }

  /* 21. 8. 2027 / 21.08.2027 / 21 Aug 2027 */
  function fmtD(iso, lang) {
    var d = parseISO(iso);
    if (lang === 'de') return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear();
    if (lang === 'en') return d.getDate() + ' ' + MONTHS.en[d.getMonth()].slice(0, 3) + ' ' + d.getFullYear();
    return d.getDate() + '. ' + (d.getMonth() + 1) + '. ' + d.getFullYear();
  }
  /* sobota 21. srpna 2027 / Samstag, 21. August 2027 / Saturday, 21 August 2027 */
  function fmtLong(iso, lang) {
    var d = parseISO(iso), wd = WEEKDAYS[lang][d.getDay()], m = MONTHS[lang][d.getMonth()];
    if (lang === 'de') return wd + ', ' + String(d.getDate()).padStart(2, '0') + '. ' + m + ' ' + d.getFullYear();
    if (lang === 'en') return wd + ', ' + d.getDate() + ' ' + m + ' ' + d.getFullYear();
    return wd + ' ' + d.getDate() + '. ' + m + ' ' + d.getFullYear();
  }
  /* 21.–28. srpna 2027 / 21.–28. August 2027 / 21–28 August 2027 */
  function fmtSpan(a, b, lang) {
    var da = parseISO(a), db = parseISO(b), M = MONTHS[lang];
    var dot = lang === 'en' ? '' : '.';
    if (da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth())
      return da.getDate() + dot + '–' + db.getDate() + dot + ' ' + M[db.getMonth()] + ' ' + db.getFullYear();
    if (da.getFullYear() === db.getFullYear())
      return da.getDate() + dot + ' ' + M[da.getMonth()] + ' – ' + db.getDate() + dot + ' ' + M[db.getMonth()] + ' ' + db.getFullYear();
    return da.getDate() + dot + ' ' + M[da.getMonth()] + ' ' + da.getFullYear() + ' – ' + db.getDate() + dot + ' ' + M[db.getMonth()] + ' ' + db.getFullYear();
  }
  /* 24. 4. – 23. 5. 2027 (storno období) */
  function fmtRange(a, b, lang) {
    var da = parseISO(a), db = parseISO(b);
    if (lang === 'de') return fmtD(a, 'de') + ' – ' + fmtD(b, 'de');
    if (lang === 'en') return fmtD(a, 'en') + ' – ' + fmtD(b, 'en');
    var sameYear = da.getFullYear() === db.getFullYear();
    return da.getDate() + '. ' + (da.getMonth() + 1) + '.' + (sameYear ? '' : ' ' + da.getFullYear()) + ' – ' + db.getDate() + '. ' + (db.getMonth() + 1) + '. ' + db.getFullYear();
  }

  function num(n, lang) {
    var s = Math.round(Number(n) || 0).toString();
    var sep = lang === 'en' ? ',' : (lang === 'de' ? '.' : ' ');
    return s.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
  }
  function czk(n, lang) { return lang === 'en' ? 'CZK ' + num(n, 'en') : num(n, lang) + ' CZK'; }
  function kc(n, lang) { return lang === 'cs' ? num(n, 'cs') + ' Kč' : czk(n, lang); }
  /* částka v CZK, u EUR smlouvy s orientačním přepočtem */
  function money(n, d) {
    var s = kc(n, d.lang);
    if (d.currency === 'EUR' && d.fx) s += ' <span class="fx">(≈ ' + num(Math.round(n / d.fx), d.lang) + ' EUR)</span>';
    return s;
  }
  function pct(p) { return p + ' %'; }

  /* Storno stupnice — shodná s /podminky/ na webu a s dřívějšími smlouvami. */
  var STORNO = [
    { from: 120, to: null, pct: 10 },
    { from: 90,  to: 119,  pct: 25 },
    { from: 60,  to: 89,   pct: 50 },
    { from: 35,  to: 59,   pct: 70 },
    { from: 11,  to: 34,   pct: 85 },
    { from: 0,   to: 10,   pct: 100 }
  ];
  /* Splatnost doplatku: před skokem storna na 70 % (den 59) — se zálohou 50 %
     držíme jen do 50 %, doplatek musí dorazit dřív. 65 dní = 59 + týden na převod. */
  var BALANCE_DAYS_BEFORE = 65;

  function stornoRows(d) {
    var A = d.arrival;
    return STORNO.map(function (s) {
      var lastDay = addDays(A, -s.from);          // poslední den, kdy stupeň platí
      var firstDay = s.to == null ? null : addDays(A, -s.to);
      return { s: s, first: firstDay, last: lastDay, amount: Math.round(d.price * s.pct / 100) };
    });
  }

  /* ---------- texty ---------- */
  var T = {
    cs: {
      title: 'UBYTOVACÍ SMLOUVA', contractNo: 'Smlouva č.',
      lessor: 'PRONAJÍMATEL', guest: 'HOST', repBy: 'zastoupená:', register: 'Obchodní rejstřík:',
      objectLbl: 'Objekt:', tel: 'Tel. / WhatsApp:', telG: 'Tel.:', email: 'E-mail:',
      guestNote: 'Jako hlavní host a kontaktní osoba skupiny.',
      formation: 'VZNIK SMLOUVY',
      f1: function (d) { return 'Tato smlouva je přílohou zálohové faktury č. <b>' + esc(d.inv1.no) + '</b> a nevyžaduje podpis.'; },
      f2single: 'Pronajímatel činí tímto dokumentem a přiloženou zálohovou fakturou hostovi závaznou nabídku. Smlouva je uzavřena okamžikem, kdy host uhradí celou fakturovanou částku ve lhůtě splatnosti na účet uvedený v § 5.',
      f2split: 'Pronajímatel činí tímto dokumentem a přiloženou zálohovou fakturou hostovi závaznou nabídku. Smlouva je uzavřena okamžikem, kdy host uhradí první splátku ve lhůtě splatnosti na účet uvedený v § 5.',
      f3: 'Úhradou host přijímá veškeré podmínky této smlouvy, zejména storno podmínky podle § 7. Nedojde-li k úhradě, smlouva nevzniká a termín zůstává volně k dispozici.',
      p1: 'Předmět smlouvy',
      p1a: 'Pronajímatel přenechává hostovi celý objekt Villa Rudolf k výhradnímu užívání po dobu uvedenou v § 2. K výhradnímu užívání po celou dobu pobytu patří zejména:',
      p1list: ['obytný dům se sedmi ložnicemi a 22 lůžky,', 'zastřešený vyhřívaný bazén,', 'privátní finská sauna se sprchou,', 'kulečník,',
        'plně vybavená kuchyně s televizí a obývací částí v hlavním domě,',
        'samostatné apartmá Suite s vlastní kuchyní, televizí, sedací soupravou a vlastní koupelnou,',
        'parkování na pozemku,', 'oplocený pozemek 4 500 m² s parkem, pergolou, ohništěm a dětským hřištěm.'],
      p1b: 'Podnájem nebo přenechání objektu třetím osobám není dovoleno.',
      p2: 'Doba pronájmu', arrival: 'Příjezd:', departure: 'Odjezd:', from: 'od', to: 'do', total: 'Celkem:',
      nightsWord: function (n) { return n === 1 ? '1 noc' : (n < 5 ? n + ' noci' : n + ' nocí'); },
      p2b: 'Odlišné časy příjezdu nebo odjezdu jsou možné po předchozí dohodě.',
      p3: 'Počet osob',
      p3a: 'Maximální kapacita objektu je 22 osob.',
      p3b: 'Složení skupiny se předem nesjednává a host ho nemusí hlásit dopředu. Cena za pronájem podle § 4 je pevná a počtem ubytovaných osob se nemění. Celkový počet osob nesmí překročit kapacitu 22 osob; překročení je možné pouze s předchozím písemným souhlasem pronajímatele.',
      p3c: 'Skutečný počet ubytovaných vyplyne ze zápisu do knihy hostů podle § 10 a řídí se podle něj pouze pobytový poplatek obci — viz § 4 a § 6.',
      p3pet: function (d) { return 'Host se s pronajímatelem dohodl na přítomnosti domácího mazlíčka: ' + esc(d.pet) + '. Platí pro něj pravidla podle § 8.'; },
      p4: 'Cena a zahrnuté služby',
      p4price: function (d) { return 'Cena za pronájem: ' + money(d.price, d) + ' za ' + T.cs.nightsWord(d.nights) + ' (' + d.nights + ' × ' + kc(d.nightly, 'cs') + ').'; },
      p4incl: 'V ceně je zahrnuto:',
      p4list: ['pronájem celého objektu i pozemku k výhradnímu užívání,', 'veškeré energie — elektřina, plyn i voda, včetně ohřevu bazénu, bez zvláštního vyúčtování.'],
      p4fixed: 'Tato cena je pevná a nemění se podle počtu ubytovaných osob.',
      p4extra: 'Mimo cenu za pronájem se po skončení pobytu vyúčtují z kauce podle § 6 tyto položky:',
      p4extras: function (d) { return [
        'závěrečný úklid a prádelna — ' + kc(d.cleaning, 'cs') + ' jednorázově,',
        'pobytový poplatek obci — ' + d.cityTax + ' Kč za dospělou osobu a noc, podle skutečného počtu ubytovaných zapsaných do knihy hostů; osoby mladší 18 let poplatku nepodléhají,',
        'poplatek za domácího mazlíčka — ' + kc(d.petFee, 'cs') + ' za zvíře a pobyt, pokud se host na jeho přítomnosti s pronajímatelem předem dohodne.']; },
      p4none: 'Žádné další náklady se neúčtují.',
      p4eur: 'Platba probíhá v EUR na eurový účet pronajímatele. Částka v EUR je závazně stanovena v přiložené zálohové faktuře; jejím uhrazením je příslušná splátka vyrovnána v plné výši a pozdější kurzové dorovnání se neprovádí.',
      p5: 'Platba',
      p5single: function (d) { return 'Cena za pronájem ve výši ' + money(d.price, d) + ' se hradí bankovním převodem podle přiložené zálohové faktury č. <b>' + esc(d.inv1.no) + '</b>, splatné nejpozději <b>' + fmtD(d.inv1.due, 'cs') + '</b>. Připsáním platby je termín závazně blokován pro hosta.'; },
      p5split: function (d) { return 'Cena za pronájem ve výši ' + money(d.price, d) + ' se hradí bankovním převodem ve dvou splátkách:'; },
      p5i1: function (d) { return '<b>1. splátka — ' + money(d.inv1.amount, d) + '</b> (50 %), podle přiložené zálohové faktury č. <b>' + esc(d.inv1.no) + '</b>, splatné nejpozději <b>' + fmtD(d.inv1.due, 'cs') + '</b>. Připsáním této splátky je termín závazně blokován pro hosta.'; },
      p5i2: function (d) { return '<b>2. splátka — ' + money(d.inv2.amount, d) + '</b>, splatná nejpozději <b>' + fmtD(d.inv2.due, 'cs') + '</b>. Zálohovou fakturu na doplatek zašle pronajímatel v dostatečném předstihu.'; },
      p5late: 'Nebude-li kterákoliv splátka připsána včas, může pronajímatel od smlouvy odstoupit a termín znovu uvolnit; tím není dotčen jeho nárok na storno poplatek podle § 7.',
      p5lateSingle: 'Nebude-li platba připsána včas, může pronajímatel termín znovu uvolnit.',
      bank: 'Bankovní spojení:', holder: 'Majitel účtu', accNo: 'Číslo účtu', iban: 'IBAN', bic: 'BIC / SWIFT', bankName: 'Banka', vs: 'Variabilní symbol',
      sepa: 'Platbu proveďte jako SEPA převod v EUR.', qr: 'QR platba',
      p6: 'Kauce',
      p6a: function (d) { return 'Při příjezdu se skládá vratná kauce ve výši ' + kc(d.deposit, 'cs') + '.'; },
      p6b: 'Z kauce se po skončení pobytu hradí:',
      p6list: function (d) { return [
        'závěrečný úklid a prádelna — ' + kc(d.cleaning, 'cs') + ',',
        'pobytový poplatek obci podle skutečného počtu ubytovaných dospělých osob a počtu nocí,',
        'poplatek za domácího mazlíčka — ' + kc(d.petFee, 'cs') + ' za zvíře a pobyt, byl-li sjednán,',
        'případné škody na objektu nebo vybavení.']; },
      p6c: 'Zůstatek kauce bude vrácen nejpozději do 7 dnů od ukončení pobytu, a to na účet, ze kterého byla uhrazena. Přesáhne-li součet uvedených položek výši kauce, uhradí host rozdíl při odjezdu nebo do 7 dnů od ukončení pobytu.',
      p6d: 'Energie jsou zahrnuty v ceně podle § 4 a zvlášť se nevyúčtovávají.',
      p7: 'Storno podmínky',
      p7a: 'Zrušení pobytu je možné kdykoliv v textové podobě (stačí e-mail na ' + LESSOR.email + '). Rozhodující je den doručení pronajímateli. Storno poplatek se počítá z ceny za pronájem podle § 4. Platí následující stupnice:',
      th: ['Zrušení', 'Období', 'Podíl', 'Částka'],
      rowLbl: function (s) {
        if (s.to == null) return s.from + ' dní a více před příjezdem';
        if (s.from === 0) return s.to + ' dní a méně / nedojezd';
        return s.to + '–' + s.from + ' dní před příjezdem';
      },
      rowPeriod: function (r) {
        if (r.first == null) return 'do ' + fmtD(r.last, 'cs');
        if (r.s.from === 0) return 'od ' + fmtD(r.first, 'cs');
        return fmtRange(r.first, r.last, 'cs');
      },
      p7b: 'Storno poplatek se počítá z celé ceny za pronájem podle § 4 bez ohledu na to, jaká její část už byla uhrazena. Přeplatek vrátí pronajímatel do 7 dnů od zrušení pobytu, případný rozdíl je ve stejné lhůtě splatný hostem.',
      p7c: 'Kauce storno poplatkům nepodléhá a v případě zrušení pobytu se vrací v plné výši.',
      p7d: 'Hostovi se doporučuje sjednat si pojištění storna cesty.',
      p8: 'Domovní řád',
      p8list: ['Kouření je ve všech vnitřních prostorách zakázáno.', 'Noční klid od 22:00 do 07:00.', 'Párty a akce s externími hosty nejsou povoleny.',
        'Bazén a sauna se užívají na vlastní nebezpečí; děti pouze pod dohledem dospělé osoby. Bazén musí být uzamčen, pokud se právě nevyužívá. Skleněné nádobí do prostoru bazénu nepatří.',
        'Ohniště se používá pouze na vyhrazeném místě a nenechává se bez dozoru; před odchodem se oheň uhasí.',
        'Domácí mazlíček je možný pouze po předchozí dohodě s pronajímatelem. Nesmí spát v postelích ani na čalouněném nábytku, nezůstává v domě bez dozoru a exkrementy se průběžně odklízejí z celého pozemku — na trávníku si často hrají děti.',
        'Nábytkem se uvnitř ani venku nemanipuluje; vše zůstává na svém místě.',
        'Objekt se při odjezdu předává uklizený a v pořádku — nádobí umyté, odpad vynesený.'],
      p9: 'Odpovědnost a škody',
      p9a: 'Host odpovídá za škody na objektu a vybavení, které zaviněně způsobí on nebo osoby, které s ním přicestovaly. Za děti odpovídají jejich zákonní zástupci; není-li zákonný zástupce přítomen, přebírá tuto odpovědnost osoba, která rezervaci provedla. Škody je nutné pronajímateli neprodleně oznámit.',
      p9b: 'Pronajímatel neodpovídá za přivezené cennosti ani za úrazy při užívání bazénu, sauny a venkovních zařízení, pokud je nezavinil.',
      p10: 'Evidenční povinnost',
      p10a: 'Pronajímatel je podle zákona povinen vést evidenční knihu ubytovaných a cizince hlásit cizinecké policii. Host proto poskytne za všechny účastníky pobytu jméno a příjmení, datum narození, státní příslušnost, adresu místa trvalého pobytu a číslo dokladu totožnosti a zapíše se do knihy hostů.',
      p11: 'Vyšší moc',
      p11a: 'Znemožní-li konání pobytu vyšší moc (úřední omezení cestování, přírodní události, výpadek dodávek energií), obě strany zahájí jednání o přesunutí termínu. Není-li přesun možný, bude uhrazená částka vrácena po odečtení prokázaných nákladů.',
      p12: 'Ochrana osobních údajů',
      p12a: 'Osobní údaje hosta jsou zpracovávány výhradně za účelem plnění této smlouvy a splnění zákonných povinností (evidenční povinnost, účetnictví), v souladu s nařízením (EU) 2016/679 (GDPR). Třetím osobám pro marketingové účely se nepředávají.',
      p13: 'Závěrečná ustanovení',
      p13a: 'Změny a doplňky vyžadují textovou podobu. Smlouva se řídí českým právem.',
      p13b: 'U ubytování sjednaného na určený termín nevzniká zákonné právo odstoupit od smlouvy bez udání důvodu; uplatní se storno podmínky podle § 7.',
      p13c: 'Případná neplatnost jednotlivého ustanovení nemá vliv na platnost zbytku smlouvy.',
      sign: 'Podpis není nutný — smlouva nabývá účinnosti uhrazením zálohové faktury.'
    },

    de: {
      title: 'BEHERBERGUNGSVERTRAG', contractNo: 'Vertrags-Nr.',
      lessor: 'VERMIETER', guest: 'GAST', repBy: 'vertreten durch:', register: 'Handelsregister:',
      objectLbl: 'Objekt:', tel: 'Tel. / WhatsApp:', telG: 'Tel.:', email: 'E-Mail:',
      guestNote: 'Als Hauptgast und Ansprechperson der Gruppe.',
      formation: 'ZUSTANDEKOMMEN DES VERTRAGES',
      f1: function (d) { return 'Dieser Vertrag ist Anlage zur Vorausrechnung Nr. <b>' + esc(d.inv1.no) + '</b> und bedarf keiner Unterschrift.'; },
      f2single: 'Der Vermieter unterbreitet dem Gast mit diesem Dokument und der beigefügten Vorausrechnung ein verbindliches Angebot. Der Vertrag kommt zustande, sobald der Gast den vollständigen Rechnungsbetrag fristgerecht auf das in § 5 genannte Konto überweist.',
      f2split: 'Der Vermieter unterbreitet dem Gast mit diesem Dokument und der beigefügten Vorausrechnung ein verbindliches Angebot. Der Vertrag kommt zustande, sobald der Gast die erste Rate fristgerecht auf das in § 5 genannte Konto überweist.',
      f3: 'Mit der Zahlung erkennt der Gast sämtliche Bedingungen dieses Vertrages an, insbesondere die Stornobedingungen nach § 7. Erfolgt keine Zahlung, kommt kein Vertrag zustande und der Termin bleibt frei verfügbar.',
      p1: 'Vertragsgegenstand',
      p1a: 'Der Vermieter überlässt dem Gast das gesamte Objekt Villa Rudolf zur alleinigen Nutzung für den in § 2 genannten Zeitraum. Zur alleinigen Nutzung während des gesamten Aufenthalts gehören insbesondere:',
      p1list: ['das Wohnhaus mit sieben Schlafzimmern und 22 Betten,', 'der überdachte, beheizte Pool,', 'die private finnische Sauna mit Dusche,', 'der Billardtisch,',
        'die voll ausgestattete Küche mit Fernseher und Wohnbereich im Haupthaus,',
        'das separate Apartment „Suite“ mit eigener Küche, Fernseher, Sitzgruppe und eigenem Bad,',
        'Parkplätze auf dem Grundstück,', 'das eingezäunte Grundstück von 4.500 m² mit Park, Pergola, Feuerstelle und Kinderspielplatz.'],
      p1b: 'Eine Untervermietung oder Überlassung an Dritte ist nicht gestattet.',
      p2: 'Mietzeitraum', arrival: 'Anreise:', departure: 'Abreise:', from: 'ab', to: 'bis', total: 'Gesamt:',
      nightsWord: function (n) { return n === 1 ? '1 Nacht' : n + ' Nächte'; },
      p2b: 'Abweichende An- oder Abreisezeiten sind nach vorheriger Absprache möglich.',
      p3: 'Personenzahl',
      p3a: 'Die maximale Belegung des Objekts beträgt 22 Personen.',
      p3b: 'Die Zusammensetzung der Gruppe wird nicht im Voraus vereinbart und muss nicht vorab gemeldet werden. Der Mietpreis nach § 4 ist fest und ändert sich nicht mit der Personenzahl. Die Gesamtzahl darf 22 Personen nicht überschreiten; eine Überschreitung ist nur mit vorheriger schriftlicher Zustimmung des Vermieters zulässig.',
      p3c: 'Die tatsächliche Personenzahl ergibt sich aus der Eintragung in das Gästebuch nach § 10; nach ihr richtet sich ausschließlich die Kurtaxe der Gemeinde — siehe § 4 und § 6.',
      p3pet: function (d) { return 'Der Gast hat mit dem Vermieter die Mitnahme eines Haustiers vereinbart: ' + esc(d.pet) + '. Es gelten die Regeln nach § 8.'; },
      p4: 'Preis und enthaltene Leistungen',
      p4price: function (d) { return 'Mietpreis: ' + money(d.price, d) + ' für ' + T.de.nightsWord(d.nights) + ' (' + d.nights + ' × ' + kc(d.nightly, 'de') + ').'; },
      p4incl: 'Im Preis enthalten sind:',
      p4list: ['die Miete des gesamten Objekts samt Grundstück zur alleinigen Nutzung,', 'sämtliche Energiekosten — Strom, Gas und Wasser, einschließlich Poolheizung, ohne gesonderte Abrechnung.'],
      p4fixed: 'Dieser Preis ist fest und ändert sich nicht mit der Zahl der Gäste.',
      p4extra: 'Neben dem Mietpreis werden nach dem Aufenthalt folgende Posten über die Kaution nach § 6 abgerechnet:',
      p4extras: function (d) { return [
        'Endreinigung und Wäsche — ' + kc(d.cleaning, 'de') + ' einmalig,',
        'Kurtaxe der Gemeinde — ' + d.cityTax + ' CZK pro Erwachsenem und Nacht, nach der tatsächlichen Zahl der im Gästebuch eingetragenen Personen; Personen unter 18 Jahren sind befreit,',
        'Haustiergebühr — ' + kc(d.petFee, 'de') + ' pro Tier und Aufenthalt, sofern die Mitnahme vorab mit dem Vermieter vereinbart wurde.']; },
      p4none: 'Weitere Nebenkosten fallen nicht an.',
      p4eur: 'Die Zahlung erfolgt in EUR auf das EUR-Konto des Vermieters. Der zu zahlende EUR-Betrag ist in der beigefügten Vorausrechnung verbindlich festgelegt; mit dessen Zahlung ist die jeweilige Rate vollständig beglichen. Ein späterer Wechselkursausgleich findet nicht statt.',
      p5: 'Zahlung',
      p5single: function (d) { return 'Der Mietpreis von ' + money(d.price, d) + ' ist per Überweisung gemäß der beigefügten Vorausrechnung Nr. <b>' + esc(d.inv1.no) + '</b> zu zahlen, spätestens bis <b>' + fmtD(d.inv1.due, 'de') + '</b>. Mit Zahlungseingang ist der Termin verbindlich für den Gast reserviert.'; },
      p5split: function (d) { return 'Der Mietpreis von ' + money(d.price, d) + ' ist per Überweisung in zwei Raten zu zahlen:'; },
      p5i1: function (d) { return '<b>1. Rate — ' + money(d.inv1.amount, d) + '</b> (50 %), gemäß der beigefügten Vorausrechnung Nr. <b>' + esc(d.inv1.no) + '</b>, spätestens bis <b>' + fmtD(d.inv1.due, 'de') + '</b>. Mit Eingang dieser Rate ist der Termin verbindlich für den Gast reserviert.'; },
      p5i2: function (d) { return '<b>2. Rate — ' + money(d.inv2.amount, d) + '</b>, fällig spätestens am <b>' + fmtD(d.inv2.due, 'de') + '</b>. Die Vorausrechnung für die Restzahlung übersendet der Vermieter rechtzeitig vorab.'; },
      p5late: 'Geht eine Rate nicht fristgerecht ein, kann der Vermieter vom Vertrag zurücktreten und den Termin wieder freigeben; sein Anspruch auf die Stornogebühr nach § 7 bleibt unberührt.',
      p5lateSingle: 'Geht die Zahlung nicht fristgerecht ein, kann der Vermieter den Termin wieder freigeben.',
      bank: 'Bankverbindung:', holder: 'Kontoinhaber', accNo: 'Kontonummer', iban: 'IBAN', bic: 'BIC / SWIFT', bankName: 'Bank', vs: 'Verwendungszweck / Variabler Symbol',
      sepa: 'Bitte als SEPA-Überweisung in EUR ausführen.', qr: 'QR-Zahlung',
      p6: 'Kaution',
      p6a: function (d) { return 'Bei Anreise ist eine rückzahlbare Kaution von ' + kc(d.deposit, 'de') + ' zu hinterlegen.'; },
      p6b: 'Aus der Kaution werden nach dem Aufenthalt beglichen:',
      p6list: function (d) { return [
        'Endreinigung und Wäsche — ' + kc(d.cleaning, 'de') + ',',
        'die Kurtaxe der Gemeinde nach der tatsächlichen Zahl der erwachsenen Gäste und Nächte,',
        'die Haustiergebühr — ' + kc(d.petFee, 'de') + ' pro Tier und Aufenthalt, sofern vereinbart,',
        'etwaige Schäden am Objekt oder an der Einrichtung.']; },
      p6c: 'Der Restbetrag der Kaution wird spätestens 7 Tage nach Ende des Aufenthalts auf das Konto zurückerstattet, von dem sie gezahlt wurde. Übersteigt die Summe der genannten Posten die Kaution, zahlt der Gast die Differenz bei Abreise oder innerhalb von 7 Tagen nach Ende des Aufenthalts.',
      p6d: 'Energiekosten sind im Preis nach § 4 enthalten und werden nicht gesondert abgerechnet.',
      p7: 'Stornobedingungen',
      p7a: 'Eine Stornierung ist jederzeit in Textform möglich (E-Mail an ' + LESSOR.email + ' genügt). Maßgeblich ist der Tag des Eingangs beim Vermieter. Die Stornogebühr berechnet sich aus dem Mietpreis nach § 4. Es gilt folgende Staffel:',
      th: ['Stornierung', 'Zeitraum', 'Anteil', 'Betrag'],
      rowLbl: function (s) {
        if (s.to == null) return s.from + ' Tage oder mehr vor Anreise';
        if (s.from === 0) return s.to + ' Tage oder weniger / Nichtanreise';
        return s.to + '–' + s.from + ' Tage vor Anreise';
      },
      rowPeriod: function (r) {
        if (r.first == null) return 'bis ' + fmtD(r.last, 'de');
        if (r.s.from === 0) return 'ab ' + fmtD(r.first, 'de');
        return fmtRange(r.first, r.last, 'de');
      },
      p7b: 'Die Stornogebühr berechnet sich aus dem gesamten Mietpreis nach § 4, unabhängig davon, welcher Teil bereits gezahlt wurde. Ein Überschuss wird vom Vermieter innerhalb von 7 Tagen nach der Stornierung erstattet; ein etwaiger Fehlbetrag ist vom Gast in derselben Frist zu zahlen.',
      p7c: 'Die Kaution unterliegt nicht der Stornogebühr und wird bei Stornierung in voller Höhe erstattet.',
      p7d: 'Dem Gast wird der Abschluss einer Reiserücktrittsversicherung empfohlen.',
      p8: 'Hausordnung',
      p8list: ['Rauchen ist im gesamten Innenbereich untersagt.', 'Nachtruhe von 22:00 bis 07:00 Uhr.', 'Partys und Veranstaltungen mit externen Gästen sind nicht gestattet.',
        'Pool und Sauna werden auf eigene Gefahr genutzt; Kinder nur unter Aufsicht Erwachsener. Der Pool ist abzuschließen, wenn er nicht benutzt wird. Glas gehört nicht in den Poolbereich.',
        'Die Feuerstelle wird nur am vorgesehenen Platz genutzt und nicht unbeaufsichtigt gelassen; vor dem Verlassen wird das Feuer gelöscht.',
        'Haustiere nur nach vorheriger Absprache mit dem Vermieter. Sie dürfen nicht in Betten oder auf Polstermöbeln schlafen, bleiben nicht unbeaufsichtigt im Haus, und Hinterlassenschaften sind auf dem gesamten Grundstück laufend zu entfernen — auf der Wiese spielen häufig Kinder.',
        'Möbel werden weder innen noch außen umgestellt; alles bleibt an seinem Platz.',
        'Das Objekt wird bei Abreise aufgeräumt und in ordentlichem Zustand übergeben — Geschirr gespült, Müll entsorgt.'],
      p9: 'Haftung und Schäden',
      p9a: 'Der Gast haftet für Schäden am Objekt und an der Einrichtung, die er oder Mitreisende schuldhaft verursachen. Für Kinder haften ihre gesetzlichen Vertreter; ist kein gesetzlicher Vertreter anwesend, übernimmt diese Verantwortung die Person, die die Buchung vorgenommen hat. Schäden sind dem Vermieter unverzüglich zu melden.',
      p9b: 'Der Vermieter haftet nicht für mitgebrachte Wertgegenstände sowie für Unfälle bei der Nutzung von Pool, Sauna und Außenanlagen, soweit ihn kein Verschulden trifft.',
      p10: 'Meldepflicht',
      p10a: 'Nach tschechischem Recht ist der Vermieter verpflichtet, ein Gästebuch zu führen und ausländische Gäste bei der Ausländerpolizei zu melden. Der Gast stellt daher für alle Mitreisenden Name, Geburtsdatum, Staatsangehörigkeit, Wohnanschrift sowie Ausweis- bzw. Passnummer zur Verfügung und trägt sich in das Gästebuch ein.',
      p11: 'Höhere Gewalt',
      p11a: 'Wird die Durchführung des Aufenthalts durch höhere Gewalt (behördliche Reisebeschränkungen, Naturereignisse, Ausfall der Versorgung) unmöglich, treten beide Parteien in Verhandlung über eine Terminverschiebung. Ist eine Verschiebung nicht möglich, wird der gezahlte Betrag abzüglich nachgewiesener Aufwendungen erstattet.',
      p12: 'Datenschutz',
      p12a: 'Die personenbezogenen Daten des Gastes werden ausschließlich zur Durchführung dieses Vertrages sowie zur Erfüllung gesetzlicher Pflichten (Meldepflicht, Buchhaltung) verarbeitet, gemäß Verordnung (EU) 2016/679 (DSGVO). Eine Weitergabe an Dritte zu Werbezwecken erfolgt nicht.',
      p13: 'Schlussbestimmungen',
      p13a: 'Änderungen und Ergänzungen bedürfen der Textform. Es gilt tschechisches Recht.',
      p13b: 'Ein gesetzliches Widerrufsrecht besteht bei der Buchung von Beherbergungsleistungen für einen bestimmten Zeitraum nicht (Art. 16 lit. l der Richtlinie 2011/83/EU). Maßgeblich sind die Stornobedingungen nach § 7.',
      p13c: 'Sollte eine Bestimmung unwirksam sein, bleibt der übrige Vertrag wirksam.',
      sign: 'Keine Unterschrift erforderlich — der Vertrag wird mit Zahlung der Vorausrechnung wirksam.'
    },

    en: {
      title: 'ACCOMMODATION AGREEMENT', contractNo: 'Agreement No.',
      lessor: 'PROVIDER', guest: 'GUEST', repBy: 'represented by:', register: 'Commercial Register:',
      objectLbl: 'Property:', tel: 'Tel. / WhatsApp:', telG: 'Tel.:', email: 'E-mail:',
      guestNote: 'Acting as lead guest and contact person for the group.',
      formation: 'CONCLUSION OF THE AGREEMENT',
      f1: function (d) { return 'This Agreement is an annex to advance invoice No. <b>' + esc(d.inv1.no) + '</b> and requires no signature.'; },
      f2single: 'By way of this document and the attached advance invoice, the Provider makes a binding offer to the Guest. The Agreement is concluded as soon as the Guest transfers the full invoice amount within the deadline to the account stated in § 5.',
      f2split: 'By way of this document and the attached advance invoice, the Provider makes a binding offer to the Guest. The Agreement is concluded as soon as the Guest transfers the first instalment within the deadline to the account stated in § 5.',
      f3: 'By making payment the Guest accepts all terms of this Agreement, in particular the cancellation terms under § 7. If no payment is made, no agreement comes into existence and the dates remain freely available.',
      p1: 'Subject of the Agreement',
      p1a: 'The Provider grants the Guest exclusive use of the entire Villa Rudolf property for the period set out in § 2. Exclusive use for the whole stay includes in particular:',
      p1list: ['the house with seven bedrooms and 22 beds,', 'the covered, heated pool,', 'the private Finnish sauna with shower,', 'the billiard table,',
        'the fully equipped kitchen with TV and living area in the main house,',
        'the separate “Suite” apartment with its own kitchen, TV, seating area and private bathroom,',
        'parking on the premises,', 'the fenced 4,500 m² grounds with park, pergola, fire pit and playground.'],
      p1b: 'Subletting or transfer to third parties is not permitted.',
      p2: 'Rental Period', arrival: 'Arrival:', departure: 'Departure:', from: 'from', to: 'by', total: 'Total:',
      nightsWord: function (n) { return n === 1 ? '1 night' : n + ' nights'; },
      p2b: 'Different arrival or departure times are possible by prior arrangement.',
      p3: 'Number of Guests',
      p3a: 'The maximum occupancy of the property is 22 persons.',
      p3b: 'The composition of the group is not agreed in advance and need not be reported beforehand. The rental price under § 4 is fixed and does not change with the number of guests. The total number of persons must not exceed 22; exceeding it requires the Provider’s prior written consent.',
      p3c: 'The actual number of guests follows from the entries in the guest register under § 10 and determines only the local tourist tax — see § 4 and § 6.',
      p3pet: function (d) { return 'The Guest has agreed with the Provider to bring a pet: ' + esc(d.pet) + '. The rules under § 8 apply.'; },
      p4: 'Price and Included Services',
      p4price: function (d) { return 'Rental price: ' + money(d.price, d) + ' for ' + T.en.nightsWord(d.nights) + ' (' + d.nights + ' × ' + kc(d.nightly, 'en') + ').'; },
      p4incl: 'The price includes:',
      p4list: ['rental of the entire property and grounds for exclusive use,', 'all energy — electricity, gas and water, including pool heating, with no separate billing.'],
      p4fixed: 'This price is fixed and does not change with the number of guests.',
      p4extra: 'In addition to the rental price, the following items are settled from the security deposit under § 6 after the stay:',
      p4extras: function (d) { return [
        'final cleaning and laundry — ' + kc(d.cleaning, 'en') + ' one-off,',
        'local tourist tax — CZK ' + d.cityTax + ' per adult per night, according to the actual number of persons entered in the guest register; persons under 18 are exempt,',
        'pet fee — ' + kc(d.petFee, 'en') + ' per animal and stay, if the Guest has agreed the pet’s presence with the Provider in advance.']; },
      p4none: 'No further costs are charged.',
      p4eur: 'Payment is made in EUR to the Provider’s EUR account. The EUR amount payable is fixed bindingly in the attached advance invoice; upon its payment the respective instalment is settled in full and no subsequent exchange-rate adjustment is made.',
      p5: 'Payment',
      p5single: function (d) { return 'The rental price of ' + money(d.price, d) + ' is payable by bank transfer in accordance with the attached advance invoice No. <b>' + esc(d.inv1.no) + '</b>, due no later than <b>' + fmtD(d.inv1.due, 'en') + '</b>. Once payment is received, the dates are firmly reserved for the Guest.'; },
      p5split: function (d) { return 'The rental price of ' + money(d.price, d) + ' is payable by bank transfer in two instalments:'; },
      p5i1: function (d) { return '<b>1st instalment — ' + money(d.inv1.amount, d) + '</b> (50 %), in accordance with the attached advance invoice No. <b>' + esc(d.inv1.no) + '</b>, due no later than <b>' + fmtD(d.inv1.due, 'en') + '</b>. Once this instalment is received, the dates are firmly reserved for the Guest.'; },
      p5i2: function (d) { return '<b>2nd instalment — ' + money(d.inv2.amount, d) + '</b>, due no later than <b>' + fmtD(d.inv2.due, 'en') + '</b>. The Provider will send the advance invoice for the balance well in advance.'; },
      p5late: 'If any instalment is not received on time, the Provider may withdraw from the Agreement and release the dates; this does not affect the Provider’s claim to the cancellation fee under § 7.',
      p5lateSingle: 'If payment is not received on time, the Provider may release the dates.',
      bank: 'Bank details:', holder: 'Account holder', accNo: 'Account number', iban: 'IBAN', bic: 'BIC / SWIFT', bankName: 'Bank', vs: 'Payment reference / variable symbol',
      sepa: 'Please send as a SEPA transfer in EUR.', qr: 'QR payment',
      p6: 'Security Deposit',
      p6a: function (d) { return 'A refundable security deposit of ' + kc(d.deposit, 'en') + ' is payable on arrival.'; },
      p6b: 'The following are settled from the deposit after the stay:',
      p6list: function (d) { return [
        'final cleaning and laundry — ' + kc(d.cleaning, 'en') + ',',
        'the local tourist tax according to the actual number of adult guests and nights,',
        'the pet fee — ' + kc(d.petFee, 'en') + ' per animal and stay, if agreed,',
        'any damage to the property or its furnishings.']; },
      p6c: 'The balance of the deposit is refunded no later than 7 days after the end of the stay, to the account from which it was paid. If the sum of the above items exceeds the deposit, the Guest pays the difference on departure or within 7 days after the end of the stay.',
      p6d: 'Energy is included in the price under § 4 and is not billed separately.',
      p7: 'Cancellation Terms',
      p7a: 'Cancellation is possible at any time in text form (an e-mail to ' + LESSOR.email + ' is sufficient). The date of receipt by the Provider is decisive. The cancellation fee is calculated from the rental price under § 4. The following scale applies:',
      th: ['Cancellation', 'Period', 'Share', 'Amount'],
      rowLbl: function (s) {
        if (s.to == null) return s.from + ' days or more before arrival';
        if (s.from === 0) return s.to + ' days or less / no-show';
        return s.to + '–' + s.from + ' days before arrival';
      },
      rowPeriod: function (r) {
        if (r.first == null) return 'until ' + fmtD(r.last, 'en');
        if (r.s.from === 0) return 'from ' + fmtD(r.first, 'en');
        return fmtRange(r.first, r.last, 'en');
      },
      p7b: 'The cancellation fee is calculated from the full rental price under § 4 regardless of how much of it has already been paid. Any overpayment is refunded by the Provider within 7 days of cancellation; any shortfall is payable by the Guest within the same period.',
      p7c: 'The deposit is not subject to cancellation fees and is refunded in full in the event of cancellation.',
      p7d: 'The Guest is advised to take out travel cancellation insurance.',
      p8: 'House Rules',
      p8list: ['Smoking is prohibited throughout the interior.', 'Quiet hours from 22:00 to 07:00.', 'Parties and events with external guests are not permitted.',
        'The pool and sauna are used at the Guest’s own risk; children only under adult supervision. The pool must be locked when not in use. Glassware does not belong in the pool area.',
        'The fire pit is used only in its designated place and never left unattended; the fire is put out before leaving.',
        'Pets only by prior arrangement with the Provider. They must not sleep in beds or on upholstered furniture, must not be left unattended in the house, and droppings must be removed continuously across the whole property — children often play on the lawn.',
        'Furniture is not moved, indoors or outdoors; everything stays in its place.',
        'The property is handed over tidy and in good order on departure — dishes washed, waste taken out.'],
      p9: 'Liability and Damages',
      p9a: 'The Guest is liable for damage to the property and its furnishings caused culpably by the Guest or fellow travellers. Legal guardians are responsible for children; if no legal guardian is present, the person who made the booking assumes this responsibility. Damage must be reported to the Provider without delay.',
      p9b: 'The Provider is not liable for valuables brought onto the property, nor for accidents arising from use of the pool, sauna and outdoor facilities, save in cases of the Provider’s fault.',
      p10: 'Registration Obligation',
      p10a: 'Under Czech law the Provider is obliged to keep a guest register and to report foreign guests to the Foreigners’ Police. The Guest therefore provides, for all members of the party, name, date of birth, nationality, home address and ID or passport number, and completes the guest register.',
      p11: 'Force Majeure',
      p11a: 'If performance of the stay becomes impossible due to force majeure (official travel restrictions, natural events, failure of utilities), both parties shall negotiate a change of dates. If rescheduling is not possible, the amount paid will be refunded less documented expenses.',
      p12: 'Data Protection',
      p12a: 'The Guest’s personal data is processed solely for the performance of this Agreement and to meet statutory obligations (registration, accounting), in accordance with Regulation (EU) 2016/679 (GDPR). Data is not passed to third parties for marketing purposes.',
      p13: 'Final Provisions',
      p13a: 'Amendments and additions require text form. Czech law applies.',
      p13b: 'There is no statutory right of withdrawal for accommodation booked for a specific period (Art. 16(l) of Directive 2011/83/EU). The cancellation terms under § 7 apply instead.',
      p13c: 'Should any provision be invalid, the remainder of the Agreement remains in force.',
      sign: 'No signature required — the Agreement takes effect upon payment of the advance invoice.'
    }
  };

  var CSS = '@page{size:A4;margin:12mm 13mm 10mm 13mm}' +
    ':root{--navy:#1f3864;--ink:#1a1a1a;--muted:#6b6b6b;--line:#d5d8de;--cream:#fdf6e4}' +
    '*{box-sizing:border-box}' +
    'body{font-family:"Calibri","Carlito","Helvetica Neue",Arial,sans-serif;font-size:8.9pt;line-height:1.3;color:var(--ink);margin:0;background:#fff}' +
    '@media screen{body{padding:14mm 15mm;max-width:210mm;margin:0 auto}}' +
    'h1{font-size:15pt;color:var(--navy);text-align:center;letter-spacing:.04em;margin:0 0 4pt}' +
    '.sub{text-align:center;color:var(--muted);font-size:10.5pt;margin-bottom:2pt}' +
    '.cno{text-align:center;color:var(--muted);font-size:8.4pt;padding-bottom:5pt;border-bottom:1.6pt solid var(--navy);margin-bottom:14pt}' +
    'table{width:100%;border-collapse:collapse}' +
    '.parties{border:.6pt solid var(--line);margin-bottom:14pt}' +
    '.parties th{background:#f1f2f5;color:var(--navy);font-size:7.6pt;letter-spacing:.07em;text-align:left;padding:5pt 8pt;border:.6pt solid var(--line);font-weight:700}' +
    '.parties td{vertical-align:top;padding:7pt;border:.6pt solid var(--line);width:50%}' +
    '.parties td p{margin:0 0 2pt}.parties .name{font-weight:700}.parties .fine{color:var(--muted);font-size:8.6pt}.parties .note{font-style:italic;color:var(--muted)}' +
    '.box{border:1.2pt solid var(--navy);background:var(--cream);padding:8pt 11pt;margin-bottom:13pt}' +
    '.box h2{font-size:8.4pt;letter-spacing:.07em;color:var(--navy);margin:0 0 6pt}.box p{margin:0 0 5pt}.box p:last-child{margin-bottom:0}' +
    'section{border-top:.6pt solid var(--line);padding-top:5pt;margin-top:5pt;page-break-inside:avoid}section:first-of-type{border-top:none}' +
    'h2.par{font-size:10.2pt;color:var(--navy);margin:0 0 4pt}p{margin:0 0 4pt}ul{margin:0 0 5pt;padding-left:14pt}li{margin-bottom:1.5pt}' +
    '.lead{font-weight:700}.fine{color:var(--muted);font-size:8.8pt}.fx{color:var(--muted);font-weight:400}' +
    'table.storno{margin:4pt 0;font-size:8.5pt}' +
    'table.storno th{background:#f1f2f5;color:var(--navy);text-align:left;font-size:8pt;letter-spacing:.04em;padding:4pt 7pt;border:.6pt solid var(--line)}' +
    'table.storno td{padding:3pt 7pt;border:.6pt solid var(--line)}table.storno td.num{text-align:right;white-space:nowrap}' +
    '.pay{display:flex;gap:14pt;align-items:flex-start;margin-top:4pt}.pay .bankwrap{flex:1 1 auto}' +
    '.bank td{padding:1.5pt 0;vertical-align:top}.bank td.k{color:var(--muted);width:38%;padding-right:8pt}' +
    '.qr{flex:0 0 auto;text-align:center;font-size:7.6pt;color:var(--muted)}.qr svg{width:26mm;height:26mm;display:block;margin:0 auto 2pt}' +
    '.close{page-break-inside:avoid;margin-top:7pt;border-top:1.2pt solid var(--navy);padding-top:8pt;text-align:center}' +
    '.close .sign{font-weight:700;color:var(--navy);margin-bottom:4pt}.close .foot{color:var(--muted);font-size:7.8pt}';

  function ul(items) { return '<ul>' + items.map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul>'; }
  function par(n, title, inner) { return '<section><h2 class="par">§ ' + n + ' &nbsp;' + title + '</h2>' + inner + '</section>'; }

  /* QR platba (SPD 1.0 — standard ČBA). Vrací SVG, nebo '' když knihovna chybí. */
  function qrSvg(d) {
    if (typeof qrcode !== 'function' || !d.inv1 || !d.inv1.amount) return '';
    var b = BANK[d.currency] || BANK.CZK;
    var amt = d.currency === 'EUR' && d.inv1.amountEur ? d.inv1.amountEur : d.inv1.amount;
    var msg = ('VILLA RUDOLF ' + d.arrival + ' ' + (d.contractNo || '')).replace(/[^A-Z0-9 .\-]/gi, '').slice(0, 60);
    var spd = 'SPD*1.0*ACC:' + b.iban.replace(/\s/g, '') + '+' + b.bic + '*AM:' + Number(amt).toFixed(2) + '*CC:' + d.currency +
      (d.inv1.vs ? '*X-VS:' + String(d.inv1.vs).replace(/\D/g, '').slice(0, 10) : '') + '*MSG:' + msg;
    try {
      var q = qrcode(0, 'M'); q.addData(spd); q.make();
      return q.createSvgTag({ cellSize: 2, margin: 0, scalable: true });
    } catch (e) { return ''; }
  }

  function render(d) {
    var L = d.lang in T ? d.lang : 'cs', t = T[L];
    var b = BANK[d.currency] || BANK.CZK;
    var split = d.plan === 'split';
    var rows = stornoRows(d);

    var header = '<h1>' + t.title + '</h1>' +
      '<div class="sub">Villa Rudolf, Svoboda nad Úpou &nbsp;·&nbsp; ' + fmtSpan(d.arrival, d.departure, L) + '</div>' +
      '<div class="cno">' + t.contractNo + ' ' + esc(d.contractNo) + '</div>';

    var parties = '<table class="parties"><tr><th>' + t.lessor + '</th><th>' + t.guest + '</th></tr><tr><td>' +
      '<p class="name">' + LESSOR.name + '</p>' +
      '<p>' + LESSOR.addr + ', ' + COUNTRY[L] + '</p>' +
      '<p>IČO: ' + LESSOR.ico + ' &nbsp; DIČ: ' + LESSOR.dic + '</p>' +
      '<p class="fine">' + t.register + ' ' + LESSOR.reg[L] + '</p>' +
      '<p class="fine">' + t.repBy + '</p><p>' + LESSOR.rep + ', ' + LESSOR.role[L] + '</p>' +
      '<p style="margin-top:6pt">' + t.objectLbl + ' Villa Rudolf,<br>' + LESSOR.objectAddr + ', ' + COUNTRY[L] + '</p>' +
      '<p>' + t.tel + ' ' + LESSOR.phone + '</p><p>' + t.email + ' ' + LESSOR.email + '</p>' +
      '</td><td>' +
      '<p class="name">' + esc(d.guest.name) + '</p>' +
      (d.guest.address ? '<p>' + esc(d.guest.address) + '</p>' : '') +
      (d.guest.country ? '<p>' + esc(d.guest.country) + '</p>' : '') +
      (d.guest.phone ? '<p>' + t.telG + ' ' + esc(d.guest.phone) + '</p>' : '') +
      (d.guest.email ? '<p>' + t.email + ' ' + esc(d.guest.email) + '</p>' : '') +
      '<p class="note" style="margin-top:6pt">' + t.guestNote + '</p>' +
      '</td></tr></table>';

    var formation = '<div class="box"><h2>' + t.formation + '</h2><p>' + t.f1(d) + '</p><p>' + (split ? t.f2split : t.f2single) + '</p><p>' + t.f3 + '</p></div>';

    var s1 = par(1, t.p1, '<p>' + t.p1a + '</p>' + ul(t.p1list) + '<p>' + t.p1b + '</p>');
    var s2 = par(2, t.p2,
      '<p class="lead">' + t.arrival + ' ' + fmtLong(d.arrival, L) + ', ' + t.from + ' ' + esc(d.checkin) + '</p>' +
      '<p class="lead">' + t.departure + ' ' + fmtLong(d.departure, L) + ', ' + t.to + ' ' + esc(d.checkout) + '</p>' +
      '<p>' + t.total + ' ' + t.nightsWord(d.nights) + '.</p><p>' + t.p2b + '</p>');
    var s3 = par(3, t.p3, '<p>' + t.p3a + '</p><p>' + t.p3b + '</p><p>' + t.p3c + '</p>' + (d.pet ? '<p>' + t.p3pet(d) + '</p>' : ''));
    var s4 = par(4, t.p4, '<p class="lead">' + t.p4price(d) + '</p><p>' + t.p4incl + '</p>' + ul(t.p4list) + '<p>' + t.p4fixed + '</p>' +
      '<p>' + t.p4extra + '</p>' + ul(t.p4extras(d)) + '<p>' + t.p4none + '</p>' + (d.currency === 'EUR' ? '<p>' + t.p4eur + '</p>' : ''));

    var bankRows = [[t.holder, b.holder], [t.accNo, b.acc], [t.iban, b.iban], [t.bic, b.bic], [t.bankName, b.bank],
      [t.vs, '<b>' + esc(d.inv1.vs || d.inv1.no) + '</b>']];
    var bankTbl = '<table class="bank">' + bankRows.map(function (r) { return '<tr><td class="k">' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }).join('') + '</table>' +
      (d.currency === 'EUR' ? '<p class="fine" style="margin-top:3pt">' + t.sepa + '</p>' : '');
    var qr = qrSvg(d);
    var s5 = par(5, t.p5,
      (split
        ? '<p>' + t.p5split(d) + '</p>' + ul([t.p5i1(d), t.p5i2(d)]) + '<p>' + t.p5late + '</p>'
        : '<p>' + t.p5single(d) + '</p><p>' + t.p5lateSingle + '</p>') +
      '<p style="margin-top:8pt"><span class="lead">' + t.bank + '</span></p>' +
      '<div class="pay"><div class="bankwrap">' + bankTbl + '</div>' +
      (qr ? '<div class="qr">' + qr + t.qr + '</div>' : '') + '</div>');

    var s6 = par(6, t.p6, '<p>' + t.p6a(d) + '</p><p>' + t.p6b + '</p>' + ul(t.p6list(d)) + '<p>' + t.p6c + '</p><p>' + t.p6d + '</p>');

    var storno = '<table class="storno"><tr><th>' + t.th[0] + '</th><th>' + t.th[1] + '</th><th style="text-align:right">' + t.th[2] + '</th><th style="text-align:right">' + t.th[3] + '</th></tr>' +
      rows.map(function (r) {
        return '<tr><td>' + t.rowLbl(r.s) + '</td><td>' + t.rowPeriod(r) + '</td><td class="num">' + pct(r.s.pct) + '</td><td class="num">' + money(r.amount, d) + '</td></tr>';
      }).join('') + '</table>';
    var s7 = par(7, t.p7, '<p>' + t.p7a + '</p>' + storno + '<p>' + t.p7b + '</p><p>' + t.p7c + '</p><p>' + t.p7d + '</p>');
    var s8 = par(8, t.p8, ul(t.p8list));
    var s9 = par(9, t.p9, '<p>' + t.p9a + '</p><p>' + t.p9b + '</p>');
    var s10 = par(10, t.p10, '<p>' + t.p10a + '</p>');
    var s11 = par(11, t.p11, '<p>' + t.p11a + '</p>');
    var s12 = par(12, t.p12, '<p>' + t.p12a + '</p>');
    var s13 = par(13, t.p13, '<p>' + t.p13a + '</p><p>' + t.p13b + '</p><p>' + t.p13c + '</p>');

    var close = '<div class="close"><div class="sign">' + t.sign + '</div>' +
      '<div class="foot">' + LESSOR.name + ', ' + LESSOR.addr + ' · Villa Rudolf, ' + LESSOR.objectAddr + ' · ' + LESSOR.email + ' · ' + LESSOR.phone + '</div></div>';

    var title = t.title.charAt(0) + t.title.slice(1).toLowerCase() + ' — Villa Rudolf — ' + esc(d.guest.lastName || d.guest.name) + ' ' + d.arrival.slice(0, 4);
    return '<!doctype html>\n<html lang="' + L + '">\n<head>\n<meta charset="utf-8">\n<meta name="robots" content="noindex, nofollow">\n' +
      '<title>' + title + '</title>\n<style>' + CSS + '</style>\n</head>\n<body>\n' +
      header + parties + formation + s1 + s2 + s3 + s4 + s5 + s6 + s7 + s8 + s9 + s10 + s11 + s12 + s13 + close +
      '\n</body>\n</html>\n';
  }

  /* Datum splatnosti doplatku pro daný příjezd. */
  function balanceDue(arrival) { return addDays(arrival, -BALANCE_DAYS_BEFORE); }

  global.VR_SMLOUVA = {
    render: render, STORNO: STORNO, BALANCE_DAYS_BEFORE: BALANCE_DAYS_BEFORE, balanceDue: balanceDue,
    stornoRows: stornoRows, BANK: BANK, LESSOR: LESSOR, fmtD: fmtD, fmtSpan: fmtSpan, nights: nights, addDays: addDays
  };
})(typeof window !== 'undefined' ? window : globalThis);
