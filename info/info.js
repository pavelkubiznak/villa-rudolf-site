/* Villa Rudolf — praktické informace (/info/).
   Statická data-driven i18n, jazyk sdílený s webem přes localStorage 'vrLang'.
   Vanilla JS, bez závislostí. Čeština je výchozí (zapsaná staticky v HTML). */
(function () {
  'use strict';

  var T = {
    cs: {
      htmlLang: 'cs',
      navDum: 'Dům', navVybaveni: 'Vybavení', navGalerie: 'Galerie', navRecenze: 'Recenze', navLokalita: 'Lokalita', navVylety: 'Výlety', navBook: 'Rezervovat',
      brandBadge: 'Praktické info',
      eyebrow: 'Villa Rudolf · Krkonoše',
      title: 'Praktické informace',
      intro: 'Vše, co se hodí vědět k pobytu — příjezd, dům, kde nakoupit, lékárna, pohotovost i služby v okolí.',
      back: 'Zpět na web vily',
      terms: 'Podmínky a ochrana údajů',

      lAddr: 'Adresa', lHours: 'Otevírací doba', lPhone: 'Telefon', lParking: 'Parkování', lMap: 'Najít na mapě', lEmergency: 'Pohotovost',
      verify: 'Otevírací dobu doporučujeme ověřit předem.',
      distWalk: 'pěšky', dist3: '~3 min autem', dist11: '~11 min autem', dist12: '~12 min autem',
      dist14: '~14 min autem', dist6jl: '~6 min autem · Janské Lázně',

      s1: 'Příjezd & dům', s1sub: 'Základní informace k pobytu',
      s2: 'Nákupy', s2sub: 'Velké nákupy v Trutnově, drobné přímo ve Svobodě.',
      s3: 'Lékárna & zdraví', s3sub: 'Kdyby bylo potřeba.',
      s4: 'Služby & okolí', s4sub: 'Palivo a tipy na výlety.',

      c1title: 'Příjezd a odjezd',
      lCheckin: 'Check-in', vCheckin: 'od 15:00',
      lCheckout: 'Check-out', vCheckout: 'do 10:00',
      lCode: 'Kód k zámku', vCode: 'Přijde e-mailem před příjezdem — stačí vyplnit registraci hosta.',
      codeLink: 'Otevřít registraci hosta',
      c2title: 'Adresa a parkování', vParking: 'Zdarma přímo u domu.',
      c3title: 'Ve vile',
      lTowels: 'Ručníky', vTowels: 'Ručník 140×70 cm pro každého hosta.',
      lPool: 'Bazén', vPool: 'Zastřešený; v teplé sezóně vyhřívaný na ~27 °C.',
      lWellness: 'Sauna, altán, ohniště', vWellness: 'Sauna, krytý altán a nasvícené ohniště k dispozici.',
      lGrill: 'Grily', vGrill: 'Dva elektrické grily.',
      c4title: 'Noční klid', vQuiet: 'Po 22:00 prosíme o klid kvůli blízkým sousedům. Svoboda nad Úpou je klidné horské městečko — díky, že ho takové udržíme.',

      hDaily2: 'Denně 7:00–22:00', hDaily20: 'Denně 7:00–20:00',
      hLidl: 'Přibližně 7:00–22:00 denně', hMartin: 'Denně 6:00–20:00',
      hCoop: 'Nonstop, 7 dní v týdnu (mimo dobu s obsluhou samoobslužný režim).',
      nMartin: 'Nejbližší obchod — přímo ve Svobodě.',
      nCoop: 'Samoobslužný nákup i v noci (Janské Lázně).',

      hLekarna: 'Po–pá 8:00–12:00 a 13:00–17:00; víkend zavřeno',
      hNemocnice: 'Pohotovost nonstop (i dětská).',
      c112title: 'Tísňová linka',
      v112: '112 — jednotné evropské číslo tísňového volání. Funguje i bez kreditu a v cizím jazyce; spojí vás se záchrankou, hasiči i policií.',

      hEurobit: 'Denně přibližně 5:00–21:00 (není nonstop)',
      cTripsTitle: 'Výlety v okolí',
      vTrips: 'Tipy na výlety, hory a atrakce najdete v plánovači výletů — mapa, filtry i doporučení na konkrétní den.',
      tripsLink: 'Otevřít plánovač výletů',

      disclaimer: 'Údaje jsme pečlivě ověřovali. Otevírací doby se ale mohou měnit — u obchodů a služeb je před cestou raději ověřte.'
    },

    en: {
      htmlLang: 'en',
      navDum: 'The House', navVybaveni: 'Amenities', navGalerie: 'Gallery', navRecenze: 'Reviews', navLokalita: 'Location', navVylety: 'Trips', navBook: 'Book',
      brandBadge: 'Guest info',
      eyebrow: 'Villa Rudolf · Giant Mountains',
      title: 'Practical information',
      intro: 'Everything worth knowing for your stay — arrival, the house, where to shop, the pharmacy, emergency care and nearby services.',
      back: 'Back to the villa site',
      terms: 'Terms & privacy',

      lAddr: 'Address', lHours: 'Opening hours', lPhone: 'Phone', lParking: 'Parking', lMap: 'Find on map', lEmergency: 'Emergency',
      verify: 'We recommend checking the opening hours in advance.',
      distWalk: 'on foot', dist3: '~3 min by car', dist11: '~11 min by car', dist12: '~12 min by car',
      dist14: '~14 min by car', dist6jl: '~6 min by car · Janské Lázně',

      s1: 'Arrival & the house', s1sub: 'The essentials for your stay',
      s2: 'Groceries', s2sub: 'Big shops in Trutnov, small ones right in Svoboda.',
      s3: 'Pharmacy & health', s3sub: 'Just in case.',
      s4: 'Services & around', s4sub: 'Fuel and trip ideas.',

      c1title: 'Arrival & departure',
      lCheckin: 'Check-in', vCheckin: 'from 15:00',
      lCheckout: 'Check-out', vCheckout: 'by 10:00',
      lCode: 'Door lock code', vCode: 'Sent by e-mail before arrival — just fill in the guest registration.',
      codeLink: 'Open guest registration',
      c2title: 'Address & parking', vParking: 'Free, right by the house.',
      c3title: 'In the villa',
      lTowels: 'Towels', vTowels: 'A 140×70 cm towel for every guest.',
      lPool: 'Pool', vPool: 'Indoor; heated to ~27 °C in the warm season.',
      lWellness: 'Sauna, gazebo, firepit', vWellness: 'Sauna, a covered gazebo and a lit firepit are available.',
      lGrill: 'Grills', vGrill: 'Two electric grills.',
      c4title: 'Quiet at night', vQuiet: 'Please keep it quiet after 22:00 out of respect for our close neighbours. Svoboda nad Úpou is a calm mountain town — thanks for keeping it that way.',

      hDaily2: 'Daily 7:00–22:00', hDaily20: 'Daily 7:00–20:00',
      hLidl: 'Approx. 7:00–22:00 daily', hMartin: 'Daily 6:00–20:00',
      hCoop: 'Open 24/7, all week (self-service outside staffed hours).',
      nMartin: 'The nearest shop — right in Svoboda.',
      nCoop: 'Self-service shopping even at night (Janské Lázně).',

      hLekarna: 'Mon–Fri 8:00–12:00 & 13:00–17:00; closed on weekends',
      hNemocnice: 'Emergency room open 24/7 (incl. children).',
      c112title: 'Emergency line',
      v112: '112 — the single European emergency number. It works with no credit and in your own language; it connects you to the ambulance, fire service and police.',

      hEurobit: 'Approx. 5:00–21:00 daily (not 24/7)',
      cTripsTitle: 'Trips nearby',
      vTrips: 'Trip ideas, mountains and attractions live in the trip planner — map, filters and a pick for a specific day.',
      tripsLink: 'Open the trip planner',

      disclaimer: 'We checked these details carefully. Opening hours can change, though — please verify shops and services before you set off.'
    },

    de: {
      htmlLang: 'de',
      navDum: 'Das Haus', navVybaveni: 'Ausstattung', navGalerie: 'Galerie', navRecenze: 'Bewertungen', navLokalita: 'Lage', navVylety: 'Ausflüge', navBook: 'Buchen',
      brandBadge: 'Gäste-Info',
      eyebrow: 'Villa Rudolf · Riesengebirge',
      title: 'Praktische Informationen',
      intro: 'Alles Wissenswerte für Ihren Aufenthalt — Anreise, Haus, Einkaufen, Apotheke, Notdienst und Services in der Umgebung.',
      back: 'Zurück zur Villa-Website',
      terms: 'Bedingungen & Datenschutz',

      lAddr: 'Adresse', lHours: 'Öffnungszeiten', lPhone: 'Telefon', lParking: 'Parken', lMap: 'Auf der Karte finden', lEmergency: 'Notaufnahme',
      verify: 'Wir empfehlen, die Öffnungszeiten vorab zu prüfen.',
      distWalk: 'zu Fuß', dist3: '~3 Min. mit dem Auto', dist11: '~11 Min. mit dem Auto', dist12: '~12 Min. mit dem Auto',
      dist14: '~14 Min. mit dem Auto', dist6jl: '~6 Min. mit dem Auto · Janské Lázně',

      s1: 'Anreise & Haus', s1sub: 'Das Wichtigste für Ihren Aufenthalt',
      s2: 'Einkaufen', s2sub: 'Große Einkäufe in Trutnov, kleine direkt in Svoboda.',
      s3: 'Apotheke & Gesundheit', s3sub: 'Für alle Fälle.',
      s4: 'Services & Umgebung', s4sub: 'Tanken und Ausflugstipps.',

      c1title: 'An- & Abreise',
      lCheckin: 'Check-in', vCheckin: 'ab 15:00 Uhr',
      lCheckout: 'Check-out', vCheckout: 'bis 10:00 Uhr',
      lCode: 'Schlosscode', vCode: 'Kommt vor der Anreise per E-Mail — bitte die Gästeregistrierung ausfüllen.',
      codeLink: 'Zur Gästeregistrierung',
      c2title: 'Adresse & Parken', vParking: 'Kostenlos direkt am Haus.',
      c3title: 'In der Villa',
      lTowels: 'Handtücher', vTowels: 'Ein Handtuch 140×70 cm für jeden Gast.',
      lPool: 'Pool', vPool: 'Überdacht; in der warmen Saison auf ~27 °C beheizt.',
      lWellness: 'Sauna, Pavillon, Feuerstelle', vWellness: 'Sauna, überdachter Pavillon und eine beleuchtete Feuerstelle stehen bereit.',
      lGrill: 'Grills', vGrill: 'Zwei Elektrogrills.',
      c4title: 'Nachtruhe', vQuiet: 'Bitte ab 22:00 Uhr Ruhe bewahren — wir haben nahe Nachbarn. Svoboda nad Úpou ist ein ruhiges Bergstädtchen — danke, dass es so bleibt.',

      hDaily2: 'Täglich 7:00–22:00', hDaily20: 'Täglich 7:00–20:00',
      hLidl: 'Ca. 7:00–22:00 täglich', hMartin: 'Täglich 6:00–20:00',
      hCoop: 'Rund um die Uhr, 7 Tage (außerhalb der bedienten Zeiten Selbstbedienung).',
      nMartin: 'Das nächste Geschäft — direkt in Svoboda.',
      nCoop: 'Selbstbedienung auch nachts (Janské Lázně).',

      hLekarna: 'Mo–Fr 8:00–12:00 & 13:00–17:00; am Wochenende geschlossen',
      hNemocnice: 'Notaufnahme rund um die Uhr (auch für Kinder).',
      c112title: 'Notruf',
      v112: '112 — die einheitliche europäische Notrufnummer. Sie funktioniert auch ohne Guthaben und mehrsprachig; sie verbindet Sie mit Rettungsdienst, Feuerwehr und Polizei.',

      hEurobit: 'Ca. 5:00–21:00 täglich (nicht rund um die Uhr)',
      cTripsTitle: 'Ausflüge in der Umgebung',
      vTrips: 'Ausflugstipps, Berge und Attraktionen finden Sie im Ausflugsplaner — Karte, Filter und ein Tipp für einen konkreten Tag.',
      tripsLink: 'Ausflugsplaner öffnen',

      disclaimer: 'Wir haben die Angaben sorgfältig geprüft. Öffnungszeiten können sich jedoch ändern — bitte prüfen Sie Geschäfte und Services vor der Fahrt.'
    },

    pl: {
      htmlLang: 'pl',
      navDum: 'Dom', navVybaveni: 'Udogodnienia', navGalerie: 'Galeria', navRecenze: 'Recenzje', navLokalita: 'Lokalizacja', navVylety: 'Wycieczki', navBook: 'Rezerwuj',
      brandBadge: 'Info dla gości',
      eyebrow: 'Villa Rudolf · Karkonosze',
      title: 'Informacje praktyczne',
      intro: 'Wszystko, co warto wiedzieć na pobyt — przyjazd, dom, gdzie zrobić zakupy, apteka, pogotowie i usługi w okolicy.',
      back: 'Powrót na stronę willi',
      terms: 'Warunki i ochrona danych',

      lAddr: 'Adres', lHours: 'Godziny otwarcia', lPhone: 'Telefon', lParking: 'Parking', lMap: 'Znajdź na mapie', lEmergency: 'Pogotowie',
      verify: 'Godziny otwarcia zalecamy sprawdzić z wyprzedzeniem.',
      distWalk: 'pieszo', dist3: '~3 min samochodem', dist11: '~11 min samochodem', dist12: '~12 min samochodem',
      dist14: '~14 min samochodem', dist6jl: '~6 min samochodem · Janské Lázně',

      s1: 'Przyjazd i dom', s1sub: 'Podstawowe informacje o pobycie',
      s2: 'Zakupy', s2sub: 'Duże zakupy w Trutnovie, drobne w samej Svobodzie.',
      s3: 'Apteka i zdrowie', s3sub: 'Na wszelki wypadek.',
      s4: 'Usługi i okolica', s4sub: 'Paliwo i pomysły na wycieczki.',

      c1title: 'Przyjazd i wyjazd',
      lCheckin: 'Zameldowanie', vCheckin: 'od 15:00',
      lCheckout: 'Wymeldowanie', vCheckout: 'do 10:00',
      lCode: 'Kod do zamka', vCode: 'Przyjdzie e-mailem przed przyjazdem — wystarczy wypełnić rejestrację gościa.',
      codeLink: 'Otwórz rejestrację gościa',
      c2title: 'Adres i parking', vParking: 'Bezpłatny, tuż przy domu.',
      c3title: 'W willi',
      lTowels: 'Ręczniki', vTowels: 'Ręcznik 140×70 cm dla każdego gościa.',
      lPool: 'Basen', vPool: 'Zadaszony; w ciepłym sezonie ogrzewany do ~27 °C.',
      lWellness: 'Sauna, altana, palenisko', vWellness: 'Do dyspozycji sauna, zadaszona altana i podświetlane palenisko.',
      lGrill: 'Grille', vGrill: 'Dwa grille elektryczne.',
      c4title: 'Cisza nocna', vQuiet: 'Po 22:00 prosimy o ciszę ze względu na bliskich sąsiadów. Svoboda nad Úpou to spokojne górskie miasteczko — dziękujemy, że takie pozostanie.',

      hDaily2: 'Codziennie 7:00–22:00', hDaily20: 'Codziennie 7:00–20:00',
      hLidl: 'Ok. 7:00–22:00 codziennie', hMartin: 'Codziennie 6:00–20:00',
      hCoop: 'Nonstop, 7 dni w tygodniu (poza godzinami z obsługą tryb samoobsługowy).',
      nMartin: 'Najbliższy sklep — w samej Svobodzie.',
      nCoop: 'Zakupy samoobsługowe także nocą (Janské Lázně).',

      hLekarna: 'Pon–pt 8:00–12:00 i 13:00–17:00; weekend zamknięte',
      hNemocnice: 'Pogotowie non-stop (także dziecięce).',
      c112title: 'Numer alarmowy',
      v112: '112 — jednolity europejski numer alarmowy. Działa bez środków na koncie i w obcym języku; łączy z pogotowiem, strażą i policją.',

      hEurobit: 'Codziennie ok. 5:00–21:00 (nie całodobowo)',
      cTripsTitle: 'Wycieczki w okolicy',
      vTrips: 'Pomysły na wycieczki, góry i atrakcje znajdziecie w planerze wycieczek — mapa, filtry i tip na konkretny dzień.',
      tripsLink: 'Otwórz planer wycieczek',

      disclaimer: 'Dane sprawdziliśmy starannie. Godziny otwarcia mogą się jednak zmieniać — sklepy i usługi lepiej sprawdzić przed wyjazdem.'
    }
  };

  var LS_KEY = 'vrLang';
  var qs = new URLSearchParams(location.search);
  var lang = 'cs';

  function pickInitialLang() {
    var q = (qs.get('lang') || '').toLowerCase();
    if (T[q]) return q;
    try { var s = (localStorage.getItem(LS_KEY) || '').toLowerCase(); if (T[s]) return s; } catch (e) {}
    var nav = (navigator.language || navigator.userLanguage || '').slice(0, 2).toLowerCase();
    if (T[nav]) return nav;
    return 'cs';
  }

  function applyLang(l) {
    lang = T[l] ? l : 'cs';
    var L = T[lang];
    document.documentElement.lang = L.htmlLang;
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (L[k] != null) el.textContent = L[k];
    });
    document.querySelectorAll('.vr-lang').forEach(function (b) {
      b.setAttribute('data-active', String(b.getAttribute('data-lang') === lang));
    });
    try { localStorage.setItem(LS_KEY, lang); } catch (e) {}
    syncSiteLinks();
  }

  /* Odkazy zpět na hlavní web nesou jazyk i sezónu, ať se dědičnost nerozbije.
     Výlety míří na samostatnou stránku ../vylety/, ostatní na kotvy homepage. */
  function syncSiteLinks() {
    var q = '?lang=' + encodeURIComponent(lang) + '&season=' + encodeURIComponent(season);
    document.querySelectorAll('[data-site]').forEach(function (a) {
      var s = a.getAttribute('data-site');
      a.setAttribute('href', s === 'vylety' ? '../vylety/' + q : '../' + q + '#' + s);
    });
    document.querySelectorAll('.vr-brand').forEach(function (b) { b.setAttribute('href', '../' + q); });
  }

  document.querySelectorAll('.vr-lang').forEach(function (b) {
    b.addEventListener('click', function () { applyLang(b.getAttribute('data-lang')); });
  });

  /* Mobilní menu (burger) */
  (function () {
    var burger = document.getElementById('vr-burger');
    var mob = document.getElementById('vr-mob');
    if (!burger || !mob) return;
    function toggleMob(open) {
      var o = open == null ? mob.getAttribute('data-open') !== 'true' : open;
      mob.setAttribute('data-open', o ? 'true' : 'false');
      burger.setAttribute('aria-expanded', o ? 'true' : 'false');
      document.body.style.overflow = o ? 'hidden' : '';
    }
    burger.addEventListener('click', function () { toggleMob(); });
    mob.querySelectorAll('a').forEach(function (a) { a.addEventListener('click', function () { toggleMob(false); }); });
  })();

  /* Sezóna dědí z webu — ?season → localStorage vrSeason → léto (stejná logika jako index/site.js). */
  var season = 'leto';
  (function () {
    var q = (qs.get('season') || '').toLowerCase();
    if (q === 'leto' || q === 'zima') season = q;
    else { try { var s = localStorage.getItem('vrSeason'); if (s === 'leto' || s === 'zima') season = s; } catch (e) {} }
    var root = document.querySelector('.pi-root'); if (root) root.setAttribute('data-season', season);
    try { localStorage.setItem('vrSeason', season); } catch (e) {}
    var m = document.querySelector('meta[name="theme-color"]'); if (m) m.setAttribute('content', season === 'zima' ? '#eef2f6' : '#0E1311');
  })();

  applyLang(pickInitialLang());
})();
