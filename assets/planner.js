/* Villa Rudolf — PLÁNOVAČ VÝLETŮ (assets/planner.js)
 *
 * JEDEN SOUBOR, DVA MOUNT POINTY:
 *   /vylety/#planovac  → veřejný režim (wizard + filtry + katalog 38 cílů + detail).
 *   /pruvodce/?t=TOKEN → osobní režim ubytovaného hosta (navíc plán na každý den
 *                        pobytu, reálná předpověď, oslovení, „už jsme byli").
 * Režim rozhoduje přítomnost platného ?t= — žádná druhá kopie kódu.
 *
 * Data: villa-rudolf-portal (trips.json + forecast.json), jediný zdroj pravdy, fetch
 * za běhu. Doporučovací jádro (partyFlags / eligible / scoreTrip / whyBadges /
 * buildPlan / CAT) je převzato ze sémantiky ostrého guest portálu.
 *
 * OSOBNÍ DATA (jméno, termín pobytu, věky dětí) se renderují VÝHRADNĚ v režimu
 * 'guest' — na indexované /vylety/ se nikdy neobjeví (viz renderHeroHTML,
 * renderPlanHTML: obojí volá jen větev S.mode === 'guest').
 *
 * Veřejné API: window.VRPlanner = { mount, openDetail, setFilter, setLang, setSeason }.
 */
(function () {
  'use strict';

  /* ===================== Konfigurace ===================== */
  var CFG = {
    TRIPS_URL: 'https://pavelkubiznak.github.io/villa-rudolf-portal/data/trips.json',
    FORECAST_URL: 'https://pavelkubiznak.github.io/villa-rudolf-portal/data/forecast.json',
    DEMO_GUEST_URL: 'https://pavelkubiznak.github.io/villa-rudolf-portal/data/demo-guest.json',
    SUPABASE_URL: 'https://fpknbrzbqpalguajskut.supabase.co',
    // Veřejný anon klíč (read-only, chráněný RLS) — stejný jako v ostrém guest portálu.
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwa25icnpicXBhbGd1YWpza3V0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDEyMTAsImV4cCI6MjA5Mjg3NzIxMH0.goat1c7Y1YnpTq7_XyMD3LROElkVI6E27f0B3EG8btA',
    VILLA: 'villa',
    VILLA_COORDS: { lat: 50.6255, lon: 15.8136 },
    // Restaurace — majitel je zatím neověřil. Data zůstávají v trips.json, sekce se ukáže až na true.
    SHOW_FOOD: false
  };

  /* ===================== i18n — pouze "chrome" (rámec UI) ===================== *
   * Obsah výletů (name/tagline/desc/price/openNote/links) chodí lokalizovaný z trips.json
   * přes tt(v,lang) = v[lang] || v.cs. Tady jsou jen texty rozhraní ve 4 jazycích. */
  var T = {
    cs: {
      brand: 'Plánovač výletů', navVylety: 'Výlety', navInfo: 'Praktické info',
      footNote: 'Ceny a otevírací doby ověřte před cestou · počasí: yr.no',
      badge: 'Váš plánovač', greet: 'Vítejte', family: 'rodino', heroTitle: 'Váš plán na tenhle týden',
      stayPrefix: 'pobyt', todayTip: 'Dnešní tip', moreArrow: 'detail →',
      planTitle: 'Plán na každý den', planSrc: 'počasí: yr.no · živě',
      foodTitle: 'Kam na dobré jídlo', foodSub: 'Prověřeno hosty i majiteli',
      photosTitle: 'Fotografie a zdroje', photosSub: 'Fotky cílů pocházejí z Wikimedia Commons pod licencemi CC. Uvádíme autora, licenci a odkaz na originál.', photosCommons: 'Wikimedia Commons',
      wxLive: 'počasí: yr.no · živě',
      dOpen: 'Otevřeno', dPrice: 'Vstupné', dTransport: 'Doprava', dWeb: 'Oficiální web', dRoute: 'Trasa z vily',
      chipLabel: 'Rychlý filtr · platí pro celý katalog',
      shareTitle: 'Vyfotili jste to tady?', shareSub: 'Označte @villarudolfretreat — nejhezčí fotky (se svolením) ukážeme v plánovači.',
      zones: ['Pěšky od vily', 'V okolí do 30 minut', 'Na celý den'], ringLabel: 'pěšky od vily',
      filters: { vse: 'Vše', pesky: 'Bez auta', dest: 'Za deště', deti: 'Pro děti', zviratka: 'Zvířátka', vyhledy: 'Výhledy', koupani: 'Koupání', nenarocne: 'Nenáročné' },
      reasons: { wet: 'déšť — pod střechu', nice: 'slunečno — ven', mild: 'polojasno' },
      alt: 'alternativy',
      fTitle: 'Najít výlet na den', fWhen: 'Kdy', fDurL: 'Kolik máte času', fDurs: ['Pár hodin', 'Půl dne', 'Celý den'],
      fCarL: 'Doprava', fCars: ['S autem', 'Bez auta'], fGroup: 'Kdo jede', fGrps: ['S kočárkem', 'S dětmi', 'Bez dětí'],
      fWx: 'Jaké je počasí', fWxs: ['Hezky', 'Prší'],
      fPick: 'Doporučujeme', fAlts: 'Kdyby se to nehodilo', fKids: 's dětmi', fStroller: 's kočárkem',
      fEmpty: 'Nic nesedí — povolte auto či delší čas, případně odškrtněte „už jsme byli“.',
      fEmptyPub: 'Tomuhle zadání nic neodpovídá. Zkuste povolit auto nebo delší čas.',
      openPlanner: 'Otevřít plánovač',
      catTitle: 'Celý katalog · {n} ověřených cílů',
      counter: 'Ukazujeme {n} z {m} cílů', clearFilter: 'Zrušit filtr',
      catNote: 'Ceny a otevírací doby ověřte před cestou — u každého cíle je odkaz na oficiální web.',
      stripTitle: 'Počasí u vily · živě z yr.no', stripSub: 'Takhle to u nás vypadá tenhle týden.',
      bridgeTitle: 'Máte u nás rezervovaný termín?',
      bridgeBody: 'Hostům plánovač sestaví plán na každý den pobytu — podle skutečné předpovědi a věku vašich dětí. Odkaz dostanete v potvrzení rezervace.',
      bridgeCta: 'Ukázat na příkladu →',
      showAll: 'Zobrazit všech {n} →', showLess: 'Skrýt zbytek',
      guestInfo: 'Praktické informace pro hosty →',
      visited: 'Už jsme byli', dropPhoto: 'Fotku z výletu doplníme', videoSoon: 'K výletu chystáme video — sestřih z natáčení.',
      footLabel: 'pěšky od vily', carLabel: 'min autem', detail: 'Detail',
      warnReservation: 'Pro skupinu rezervujte předem', warnDocs: 'Do Polska doklad i pro každé dítě',
      warnAge: function (n) { return 'Vhodné od ' + n + ' let'; }, warnCapacity: 'Před cestou ověřte obsazenost online',
      why: { rain: 'ideální za deště', clear: 'krásný den ven', heat: 'osvěžení v horku', teen: 'pro teenagery', kids: 'pro děti', foot: 'bez auta', cold: 'do chladna', adrenalin: 'adrenalin', indoor: 'pod střechu' },
      cats: { walk: 'túra', viewpoint: 'výhledy', animals: 'zvířátka', kids: 'pro děti', water: 'koupání', rain: 'za deště', adrenalin: 'adrenalin', culture: 'kultura' },
      tags: { foot: 'pěšky od vily', rain: 'i za deště', outdoor: 'venku', easy: 'nenáročné', hard: 'náročné', heat: 'do horka', clear: 'za jasna', stairs: 'schody', reservation: 'rezervace', border: 'Polsko · doklady' }
    },
    de: {
      brand: 'Ausflugsplaner', navVylety: 'Ausflüge', navInfo: 'Gäste-Infos',
      footNote: 'Preise und Öffnungszeiten vor der Fahrt prüfen · Wetter: yr.no',
      badge: 'Ihr Planer', greet: 'Willkommen', family: 'Familie', heroTitle: 'Ihr Plan für diese Woche',
      stayPrefix: 'Aufenthalt', todayTip: 'Tipp für heute', moreArrow: 'Detail →',
      planTitle: 'Plan für jeden Tag', planSrc: 'Wetter: yr.no · live',
      foodTitle: 'Gut essen gehen', foodSub: 'Von Gästen und Gastgebern geprüft',
      photosTitle: 'Fotos und Quellen', photosSub: 'Die Zielfotos stammen von Wikimedia Commons unter CC-Lizenzen. Wir nennen Autor, Lizenz und einen Link zum Original.', photosCommons: 'Wikimedia Commons',
      wxLive: 'Wetter: yr.no · live',
      dOpen: 'Geöffnet', dPrice: 'Eintritt', dTransport: 'Anfahrt', dWeb: 'Offizielle Website', dRoute: 'Route ab Villa',
      chipLabel: 'Schnellfilter · gilt für den ganzen Katalog',
      shareTitle: 'Hier fotografiert?', shareSub: 'Markieren Sie @villarudolfretreat — die schönsten Fotos zeigen wir (mit Erlaubnis) im Planer.',
      zones: ['Zu Fuß von der Villa', 'In der Nähe bis 30 Minuten', 'Für den ganzen Tag'], ringLabel: 'zu Fuß',
      filters: { vse: 'Alle', pesky: 'Ohne Auto', dest: 'Bei Regen', deti: 'Für Kinder', zviratka: 'Tiere', vyhledy: 'Aussichten', koupani: 'Baden', nenarocne: 'Leicht' },
      reasons: { wet: 'Regen — unters Dach', nice: 'sonnig — raus', mild: 'heiter' },
      alt: 'Alternativen',
      fTitle: 'Ausflug für den Tag finden', fWhen: 'Wann', fDurL: 'Wie viel Zeit haben Sie', fDurs: ['Paar Stunden', 'Halber Tag', 'Ganzer Tag'],
      fCarL: 'Anfahrt', fCars: ['Mit Auto', 'Ohne Auto'], fGroup: 'Wer kommt mit', fGrps: ['Mit Kinderwagen', 'Mit Kindern', 'Ohne Kinder'],
      fWx: 'Wie ist das Wetter', fWxs: ['Schön', 'Regen'],
      fPick: 'Unser Tipp', fAlts: 'Falls es nicht passt', fKids: 'mit Kindern', fStroller: 'mit Kinderwagen',
      fEmpty: 'Nichts passt — Auto oder mehr Zeit erlauben, ggf. „waren wir schon“ abwählen.',
      fEmptyPub: 'Zu dieser Auswahl passt nichts. Erlauben Sie ein Auto oder mehr Zeit.',
      openPlanner: 'Planer öffnen',
      catTitle: 'Ganzer Katalog · {n} geprüfte Ziele',
      counter: 'Wir zeigen {n} von {m} Zielen', clearFilter: 'Filter zurücksetzen',
      catNote: 'Preise und Öffnungszeiten vor der Fahrt prüfen — bei jedem Ziel steht der Link zur offiziellen Website.',
      stripTitle: 'Wetter an der Villa · live von yr.no', stripSub: 'So sieht es bei uns diese Woche aus.',
      bridgeTitle: 'Haben Sie bei uns schon gebucht?',
      bridgeBody: 'Gästen stellt der Planer einen Plan für jeden Aufenthaltstag zusammen — nach echter Vorhersage und dem Alter Ihrer Kinder. Den Link erhalten Sie mit der Buchungsbestätigung.',
      bridgeCta: 'Beispiel ansehen →',
      showAll: 'Alle {n} anzeigen →', showLess: 'Rest ausblenden',
      guestInfo: 'Praktische Infos für Gäste →',
      visited: 'Waren wir schon', dropPhoto: 'Foto vom Ausflug folgt', videoSoon: 'Zum Ausflug entsteht ein Video — der Schnitt folgt.',
      footLabel: 'zu Fuß ab Villa', carLabel: 'Min. mit dem Auto', detail: 'Details',
      warnReservation: 'Für die Gruppe vorab reservieren', warnDocs: 'Nach Polen Ausweis auch für jedes Kind',
      warnAge: function (n) { return 'Ab ' + n + ' Jahren'; }, warnCapacity: 'Vor der Fahrt Auslastung online prüfen',
      why: { rain: 'ideal bei Regen', clear: 'schöner Tag draußen', heat: 'Abkühlung bei Hitze', teen: 'für Teenager', kids: 'für Kinder', foot: 'ohne Auto', cold: 'für kühle Tage', adrenalin: 'Adrenalin', indoor: 'überdacht' },
      cats: { walk: 'Wanderung', viewpoint: 'Aussichten', animals: 'Tiere', kids: 'für Kinder', water: 'Baden', rain: 'bei Regen', adrenalin: 'Adrenalin', culture: 'Kultur' },
      tags: { foot: 'zu Fuß', rain: 'auch bei Regen', outdoor: 'draußen', easy: 'leicht', hard: 'anspruchsvoll', heat: 'für heiße Tage', clear: 'bei klarem Wetter', stairs: 'Treppen', reservation: 'Reservierung', border: 'Polen · Ausweis' }
    },
    en: {
      brand: 'Trip planner', navVylety: 'Trips', navInfo: 'Guest info',
      footNote: 'Check prices and opening hours before you go · weather: yr.no',
      badge: 'Your planner', greet: 'Welcome', family: 'family', heroTitle: 'Your plan for this week',
      stayPrefix: 'stay', todayTip: 'Today’s tip', moreArrow: 'detail →',
      planTitle: 'A plan for every day', planSrc: 'weather: yr.no · live',
      foodTitle: 'Where to eat well', foodSub: 'Vetted by guests and hosts',
      photosTitle: 'Photos and sources', photosSub: 'Destination photos come from Wikimedia Commons under CC licences. We credit the author, licence and a link to the original.', photosCommons: 'Wikimedia Commons',
      wxLive: 'weather: yr.no · live',
      dOpen: 'Open', dPrice: 'Tickets', dTransport: 'Getting there', dWeb: 'Official site', dRoute: 'Route from villa',
      chipLabel: 'Quick filter · applies to the whole catalogue',
      shareTitle: 'Took a photo here?', shareSub: 'Tag @villarudolfretreat — we feature the best ones (with permission) in this planner.',
      zones: ['Walk from the villa', 'Nearby, under 30 min', 'For a full day'], ringLabel: 'walkable',
      filters: { vse: 'All', pesky: 'No car', dest: 'Rainy day', deti: 'For kids', zviratka: 'Animals', vyhledy: 'Views', koupani: 'Swimming', nenarocne: 'Easy' },
      reasons: { wet: 'rain — head indoors', nice: 'sunny — go out', mild: 'partly cloudy' },
      alt: 'alternatives',
      fTitle: 'Find a trip for the day', fWhen: 'When', fDurL: 'How much time you have', fDurs: ['A few hours', 'Half a day', 'Full day'],
      fCarL: 'Getting there', fCars: ['With a car', 'No car'], fGroup: 'Who’s coming', fGrps: ['With a stroller', 'With kids', 'No kids'],
      fWx: 'What’s the weather', fWxs: ['Fine', 'Raining'],
      fPick: 'Our pick', fAlts: 'If that doesn’t suit', fKids: 'good with kids', fStroller: 'stroller-friendly',
      fEmpty: 'Nothing fits — allow a car or more time, or untick “been there”.',
      fEmptyPub: 'Nothing matches that combination. Try allowing a car or more time.',
      openPlanner: 'Open the planner',
      catTitle: 'Full catalogue · {n} verified places',
      counter: 'Showing {n} of {m} places', clearFilter: 'Clear filter',
      catNote: 'Check prices and opening hours before you go — every place links to its official site.',
      stripTitle: 'Weather at the villa · live from yr.no', stripSub: 'This is what it looks like here this week.',
      bridgeTitle: 'Already booked a stay with us?',
      bridgeBody: 'For guests the planner builds a plan for every day of the stay — based on the real forecast and your children’s ages. You get the link with your booking confirmation.',
      bridgeCta: 'See an example →',
      showAll: 'Show all {n} →', showLess: 'Hide the rest',
      guestInfo: 'Practical guest information →',
      visited: 'Been there', dropPhoto: 'A trip photo is coming', videoSoon: 'A trip video is coming — the edit is in progress.',
      footLabel: 'on foot from the villa', carLabel: 'min by car', detail: 'Details',
      warnReservation: 'Book ahead for a group', warnDocs: 'For Poland, ID for every child too',
      warnAge: function (n) { return 'Suitable from age ' + n; }, warnCapacity: 'Check live occupancy before you go',
      why: { rain: 'ideal in rain', clear: 'great day outside', heat: 'cool off in the heat', teen: 'for teens', kids: 'for kids', foot: 'no car needed', cold: 'for cool days', adrenalin: 'adrenaline', indoor: 'indoors' },
      cats: { walk: 'hike', viewpoint: 'views', animals: 'animals', kids: 'for kids', water: 'swimming', rain: 'rainy-day', adrenalin: 'adrenaline', culture: 'culture' },
      tags: { foot: 'walkable', rain: 'rainy-day ok', outdoor: 'outdoors', easy: 'easy', hard: 'strenuous', heat: 'for hot days', clear: 'clear weather', stairs: 'stairs', reservation: 'booking', border: 'Poland · ID' }
    },
    pl: {
      brand: 'Planer wycieczek', navVylety: 'Wycieczki', navInfo: 'Informacje praktyczne',
      footNote: 'Ceny i godziny otwarcia sprawdźcie przed wyjazdem · pogoda: yr.no',
      badge: 'Wasz planer', greet: 'Witajcie', family: 'rodzino', heroTitle: 'Wasz plan na ten tydzień',
      stayPrefix: 'pobyt', todayTip: 'Tip na dziś', moreArrow: 'szczegóły →',
      planTitle: 'Plan na każdy dzień', planSrc: 'pogoda: yr.no · na żywo',
      foodTitle: 'Gdzie dobrze zjeść', foodSub: 'Sprawdzone przez gości i gospodarzy',
      photosTitle: 'Zdjęcia i źródła', photosSub: 'Zdjęcia celów pochodzą z Wikimedia Commons na licencjach CC. Podajemy autora, licencję i link do oryginału.', photosCommons: 'Wikimedia Commons',
      wxLive: 'pogoda: yr.no · na żywo',
      dOpen: 'Otwarte', dPrice: 'Bilety', dTransport: 'Dojazd', dWeb: 'Oficjalna strona', dRoute: 'Trasa z willi',
      chipLabel: 'Szybki filtr · działa na cały katalog',
      shareTitle: 'Macie stąd zdjęcie?', shareSub: 'Oznaczcie @villarudolfretreat — najładniejsze (za zgodą) pokażemy w planerze.',
      zones: ['Pieszo od willi', 'W okolicy do 30 minut', 'Na cały dzień'], ringLabel: 'pieszo',
      filters: { vse: 'Wszystko', pesky: 'Bez auta', dest: 'Na deszcz', deti: 'Dla dzieci', zviratka: 'Zwierzęta', vyhledy: 'Widoki', koupani: 'Kąpiel', nenarocne: 'Łatwe' },
      reasons: { wet: 'deszcz — pod dach', nice: 'słonecznie — w teren', mild: 'przejaśnienia' },
      alt: 'alternatywy',
      fTitle: 'Znajdź wycieczkę na dzień', fWhen: 'Kiedy', fDurL: 'Ile macie czasu', fDurs: ['Parę godzin', 'Pół dnia', 'Cały dzień'],
      fCarL: 'Dojazd', fCars: ['Autem', 'Bez auta'], fGroup: 'Kto jedzie', fGrps: ['Z wózkiem', 'Z dziećmi', 'Bez dzieci'],
      fWx: 'Jaka jest pogoda', fWxs: ['Ładnie', 'Pada'],
      fPick: 'Polecamy', fAlts: 'Gdyby to nie pasowało', fKids: 'z dziećmi', fStroller: 'z wózkiem',
      fEmpty: 'Nic nie pasuje — dopuśćcie auto lub więcej czasu, ew. odznaczcie „już byliśmy”.',
      fEmptyPub: 'Nic nie pasuje do tych ustawień. Dopuśćcie auto albo więcej czasu.',
      openPlanner: 'Otwórz planer',
      catTitle: 'Cały katalog · {n} sprawdzonych celów',
      counter: 'Pokazujemy {n} z {m} celów', clearFilter: 'Wyczyść filtr',
      catNote: 'Ceny i godziny otwarcia sprawdźcie przed wyjazdem — przy każdym celu jest link do oficjalnej strony.',
      stripTitle: 'Pogoda przy willi · na żywo z yr.no', stripSub: 'Tak wygląda u nas w tym tygodniu.',
      bridgeTitle: 'Macie u nas zarezerwowany termin?',
      bridgeBody: 'Gościom planer ułoży plan na każdy dzień pobytu — według prawdziwej prognozy i wieku dzieci. Link dostaniecie w potwierdzeniu rezerwacji.',
      bridgeCta: 'Zobacz na przykładzie →',
      showAll: 'Pokaż wszystkie {n} →', showLess: 'Ukryj resztę',
      guestInfo: 'Informacje praktyczne dla gości →',
      visited: 'Już byliśmy', dropPhoto: 'Zdjęcie z wycieczki dodamy', videoSoon: 'Szykujemy wideo z wycieczki — montaż w toku.',
      footLabel: 'pieszo od willi', carLabel: 'min samochodem', detail: 'Szczegóły',
      warnReservation: 'Dla grupy rezerwujcie wcześniej', warnDocs: 'Do Polski dokument także dla dziecka',
      warnAge: function (n) { return 'Od ' + n + ' lat'; }, warnCapacity: 'Przed wyjazdem sprawdźcie obłożenie online',
      why: { rain: 'idealne na deszcz', clear: 'piękny dzień na zewnątrz', heat: 'ochłoda w upale', teen: 'dla nastolatków', kids: 'dla dzieci', foot: 'bez auta', cold: 'na chłód', adrenalin: 'adrenalina', indoor: 'pod dachem' },
      cats: { walk: 'wędrówka', viewpoint: 'widoki', animals: 'zwierzęta', kids: 'dla dzieci', water: 'kąpiel', rain: 'na deszcz', adrenalin: 'adrenalina', culture: 'kultura' },
      tags: { foot: 'pieszo od willi', rain: 'także na deszcz', outdoor: 'na zewnątrz', easy: 'łatwe', hard: 'wymagające', heat: 'na upały', clear: 'przy pogodzie', stairs: 'schody', reservation: 'rezerwacja', border: 'Polska · dokumenty' }
    }
  };
  var FILTER_IDS = ['vse', 'pesky', 'dest', 'deti', 'zviratka', 'vyhledy', 'koupani', 'nenarocne'];

  /* ===================== Fotografie na kartách katalogu (task 4) =====================
   * Skutečné fotky nejvýznamnějších cílů. Zdroj: Wikimedia Commons, jen povolené
   * licence (CC0 / public domain / CC BY / CC BY-SA). Kredity (autor + licence +
   * odkaz) jsou v PHOTO_CREDITS a vypisují se v sekci „Fotografie" na konci stránky.
   * U CC BY / CC BY-SA je uvedení autora povinné. */
  var TRIP_PHOTOS = {
    'snezka-cablecar': '../media/trips/snezka-cablecar.jpg',
    'adrspach': '../media/trips/adrspach.jpg',
    'cerna-hora-kabinka': '../media/trips/cerna-hora-kabinka.jpg',
    'safari-dvur-kralove': '../media/trips/safari-dvur-kralove.jpg',
    'baumwipfelpfad': '../media/trips/baumwipfelpfad.jpg',
    'harrachov-glass': '../media/trips/harrachov-glass.jpg',
    'cernohorske-raseliniste': '../media/trips/cernohorske-raseliniste.jpg',
    'obri-dul': '../media/trips/obri-dul.jpg',
    'stachelberg': '../media/trips/stachelberg.jpg',
    'koupaliste-trutnov': '../media/trips/koupaliste-trutnov.jpg',
    'janske-hallenbad': '../media/trips/janske-hallenbad.jpg',
    'rozhledna-hnedy-vrch': '../media/trips/rozhledna-hnedy-vrch.jpg',
    'bobsled-pec': '../media/trips/bobsled-pec.jpg',
    'rychory': '../media/trips/rychory.jpg',
    'spaleny-mlyn': '../media/trips/spaleny-mlyn.jpg',
    'aquapark-karpacz': '../media/trips/aquapark-karpacz.jpg'
  };
  var PHOTO_CREDITS = [
    { subject: 'Sněžka', author: 'Jojo', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', source: 'https://commons.wikimedia.org/wiki/File:Sniezka_Summit.jpg' },
    { subject: 'Adršpašské skály', author: 'Lestat (Jan Mehlich)', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', source: 'https://commons.wikimedia.org/wiki/File:Adr%C5%A1pa%C5%A1skoteplick%C3%A9_sk%C3%A1ly_02.JPG' },
    { subject: 'Černá hora – rozhledna', author: 'ŠJů', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0', source: 'https://commons.wikimedia.org/wiki/File:Jansk%C3%A9_L%C3%A1zn%C4%9B,_%C4%8Cern%C3%A1_hora,_rozhledna_(02).jpg' },
    { subject: 'Safari Park Dvůr Králové', author: 'Mistvan', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0', source: 'https://commons.wikimedia.org/wiki/File:Equus.grevyi-01-ZOO.Dvur.Kralove.jpg' },
    { subject: 'Stezka korunami stromů', author: 'Susankovav', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0', source: 'https://commons.wikimedia.org/wiki/File:Stezka_korunami_strom%C5%AF_Krkono%C5%A1e_2024.jpg' },
    { subject: 'Mumlavské vodopády', author: 'V0lkanic', license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', source: 'https://commons.wikimedia.org/wiki/File:Mumlavsk%C3%A9_vodop%C3%A1dy_2025.jpg' },
    { subject: 'Černohorské rašeliniště', author: 'Petr Vilgus', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0', source: 'https://commons.wikimedia.org/wiki/File:%C4%8Cernohorsk%C3%A9_ra%C5%A1elini%C5%A1t%C4%9B_5.JPG' },
    { subject: 'Obří důl', author: 'Pudelek', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0', source: 'https://commons.wikimedia.org/wiki/File:Ob%C5%99%C3%AD_d%C5%AFl_v_zim%C4%9B.jpg' },
    { subject: 'Pevnost Stachelberg', author: 'Harold', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0', source: 'https://commons.wikimedia.org/wiki/File:Stachelberg,_podzem%C3%AD_(rok_2008;_03).jpg' },
    { subject: 'Trutnov – Krakonošovo náměstí', author: 'Vlach Pavel', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0', source: 'https://commons.wikimedia.org/wiki/File:Trutnov,_Krakono%C5%A1ovo_n%C3%A1m%C4%9Bst%C3%AD_(1).jpg' },
    { subject: 'Janské Lázně – kolonáda', author: 'ŠJů', license: 'CC BY 4.0', licenseUrl: 'https://creativecommons.org/licenses/by/4.0', source: 'https://commons.wikimedia.org/wiki/File:Jansk%C3%A9_L%C3%A1zn%C4%9B,_kolon%C3%A1da.jpg' },
    { subject: 'Pec pod Sněžkou', author: 'Sashenka7', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0', source: 'https://commons.wikimedia.org/wiki/File:Pec_pod_Sn%C4%9B%C5%BEkou_2013.jpg' },
    { subject: 'Pec pod Sněžkou – Horizont', author: 'Ladabohac', license: 'CC0', licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', source: 'https://commons.wikimedia.org/wiki/File:Vyhl%C3%ADdka_na_Horizont_v_Peci_pod_Sn%C4%9B%C5%BEkou.jpg' },
    { subject: 'Rýchorská bouda', author: 'Dezidor', license: 'CC BY 3.0', licenseUrl: 'https://creativecommons.org/licenses/by/3.0', source: 'https://commons.wikimedia.org/wiki/File:R%C3%BDchorsk%C3%A1_bouda.jpg' },
    { subject: 'Malá Úpa', author: 'Pudelek', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0', source: 'https://commons.wikimedia.org/wiki/File:Mal%C3%A1_%C3%9Apa_-_Klein_Aupa.jpg' },
    { subject: 'Karpacz (PL)', author: 'Stefan Kühn', license: 'CC BY-SA 3.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/3.0/', source: 'https://commons.wikimedia.org/wiki/File:Karpacz_Poland_Snezka.jpg' }
  ];

  /* Doplněk katalogu: masérské studio RK masáže ve Svobodě nad Úpou (studio kamaráda
   * majitele). Reálné údaje z rkmasaze.cz. Fotku z jejich webu nebereme (autorská
   * práva) — ponecháváme piktogram. Wellness/relax, ideální „za deště". */
  var EXTRA_TRIPS = [{
    id: 'rk-masaze',
    name: { cs: 'RK masáže — relaxační studio', de: 'RK Massagen — Wellnessstudio', en: 'RK massages — relaxation studio', pl: 'RK masaże — studio relaksu' },
    tagline: { cs: 'Klasické, lávové kameny i lymfatické masáže přímo ve Svobodě', de: 'Klassische, Hot-Stone- und Lymphmassagen direkt in Svoboda', en: 'Classic, hot-stone and lymphatic massages right in Svoboda', pl: 'Masaże klasyczne, gorącymi kamieniami i limfatyczne w Svobodzie' },
    desc: {
      cs: 'Masérské studio přímo ve Svobodě nad Úpou (Kostelní 417) — studio kamaráda majitele. Klasická masáž, lávové kameny, lymfodrenáž, maderoterapie i čínská Tuina — po dni na horách ideální. Objednání předem, nejlépe SMS nebo přes Messenger; rezervovat lze i online.',
      de: 'Massagestudio direkt in Svoboda nad Úpou (Kostelní 417) — das Studio eines Freundes des Gastgebers. Klassische Massage, Hot Stones, Lymphdrainage, Maderotherapie und chinesisches Tuina — perfekt nach einem Tag in den Bergen. Vorher reservieren, am besten per SMS oder Messenger; auch online buchbar.',
      en: 'A massage studio right in Svoboda nad Úpou (Kostelní 417) — run by a friend of the host. Classic massage, hot stones, lymphatic drainage, maderotherapy and Chinese Tuina — perfect after a day in the mountains. Book ahead, ideally by SMS or Messenger; online booking is available too.',
      pl: 'Studio masażu w samej Svobodzie nad Úpou (Kostelní 417) — prowadzone przez przyjaciela gospodarza. Masaż klasyczny, gorące kamienie, drenaż limfatyczny, maderoterapia i chińskie Tuina — idealne po dniu w górach. Rezerwacja z wyprzedzeniem, najlepiej SMS lub Messenger; także online.'
    },
    coords: { lat: 50.6285, lon: 15.8127, alt: 520 },
    zone: 'villa', byFoot: true, travelMin: 0, effort: 'easy',
    category: 'rain', indoorOrCovered: true, rainOk: true, outdoor: false,
    accent: '#A67BB0', icon: 'spa',
    openNote: { cs: 'Objednání předem · rezervace i online', de: 'Vorher reservieren · auch online', en: 'Book ahead · online booking too', pl: 'Rezerwacja wcześniej · także online' },
    price: { cs: 'Dle typu a délky masáže', de: 'Je nach Art und Dauer', en: 'By massage type and length', pl: 'Zależnie od rodzaju i długości' },
    links: [{ icon: 'globe', url: 'https://rkmasaze.cz' }, { icon: 'calendar', url: 'https://rkmasaze.notado.cz' }]
  }];

  /* ===================== Počasí: kategorie -> ikona + text (z ostrého portálu) ===================== */
  var CAT = {
    thunder: { ic: 'i-cloud-rain', cs: 'bouřky', de: 'Gewitter', en: 'thunder', pl: 'burze', wet: 1 },
    heavyrain: { ic: 'i-cloud-rain', cs: 'silný déšť', de: 'kräftiger Regen', en: 'heavy rain', pl: 'silny deszcz', wet: 1 },
    rain: { ic: 'i-cloud-rain', cs: 'déšť', de: 'Regen', en: 'rain', pl: 'deszcz', wet: 1 },
    showers: { ic: 'i-cloud-rain', cs: 'přeháňky', de: 'Schauer', en: 'showers', pl: 'przelotne opady', wet: 0.5 },
    snow: { ic: 'i-cloud-rain', cs: 'sníh', de: 'Schnee', en: 'snow', pl: 'śnieg', wet: 1 },
    fog: { ic: 'i-cloud', cs: 'mlha', de: 'Nebel', en: 'fog', pl: 'mgła', wet: 0 },
    cloudy: { ic: 'i-cloud', cs: 'zataženo', de: 'bedeckt', en: 'cloudy', pl: 'pochmurno', wet: 0 },
    partly: { ic: 'i-cloud-sun', cs: 'polojasno', de: 'wolkig', en: 'partly cloudy', pl: 'zachmurzenie', wet: 0 },
    fair: { ic: 'i-cloud-sun', cs: 'skoro jasno', de: 'meist sonnig', en: 'mostly sunny', pl: 'przeważnie słonecznie', wet: 0 },
    clear: { ic: 'i-sun', cs: 'jasno', de: 'sonnig', en: 'sunny', pl: 'słonecznie', wet: 0 }
  };
  function isWet(c) { return CAT[c] ? CAT[c].wet : 0; }
  function isNice(c) { return ['clear', 'fair', 'partly'].indexOf(c) >= 0; }
  function wxClass(c) { if (!c) return 'mild'; if (['rain', 'heavyrain', 'thunder', 'showers', 'snow'].indexOf(c) >= 0) return 'wet'; if (isNice(c)) return 'nice'; return 'mild'; }
  function wxColor(c) { var k = wxClass(c); return k === 'wet' ? '#7E93B8' : (['clear', 'fair'].indexOf(c) >= 0 ? '#D6B25C' : '#B4BAAD'); }
  function wxIcon(c) { return (CAT[c] && CAT[c].ic) || 'i-cloud'; }
  function wxText(c, lang) { var m = CAT[c] || CAT.cloudy; return m[lang] || m.cs; }

  /* ===================== Doporučovací jádro (shodné s ostrým portálem) ===================== */
  function partyFlags(p) {
    var kids = (p && p.children) || [];
    var adults = (p && p.adults) || 0;
    return {
      size: adults + kids.length,
      minKidAge: kids.length ? Math.min.apply(null, kids) : null,
      hasToddler: kids.some(function (a) { return a <= 4; }),
      hasYoungKid: kids.some(function (a) { return a >= 5 && a <= 9; }),
      hasKid: kids.some(function (a) { return a <= 11; }),
      hasTeen: kids.some(function (a) { return a >= 12; }) || (kids.length === 0),
      isGroup: (adults + kids.length) >= 8
    };
  }
  // tvrdé filtry pro daný den
  function eligible(trip, day, fl) {
    if (trip.needsClearLowWind) { if (day && (isWet(day.cat) || day.cat === 'fog' || (day.windKmh && day.windKmh >= 45))) return false; }
    if (fl.hasToddler && trip.effort === 'hard') return false;
    if (trip.minAge && fl.minKidAge != null && fl.minKidAge < trip.minAge) return false;
    return true;
  }
  var KIDS_POOL = ['janske-hallenbad', 'baumwipfelpfad', 'aqua-vrchlabi', 'aquapark-karpacz', 'hricky-buky'];
  var TEEN_POOL = ['bobsled-pec', 'ebikes', 'snezka-cablecar'];
  function scoreTrip(trip, day, fl) {
    var s = 0, c = day ? day.cat : null, hot = day && day.max >= 28, cold = day && day.max <= 12;
    if (c) {
      if (['rain', 'heavyrain', 'thunder'].indexOf(c) >= 0) { s += (trip.indoorOrCovered || trip.rainOk) ? 3 : -3.5; }
      else if (c === 'showers') { s += (trip.indoorOrCovered || trip.rainOk) ? 1 : -1; }
      else if (isNice(c)) { s += trip.outdoor ? 2 : (trip.lovesHeat ? 0 : -1); }
    }
    if (hot) { if (trip.lovesHeat) s += 3; else if (trip.outdoor && trip.effort !== 'easy') s -= 1.5; }
    if (cold) { s += trip.indoorOrCovered ? 1 : -1; }
    if (fl.hasTeen) { if (['adrenalin', 'active', 'viewpoint'].indexOf(trip.category) >= 0 || TEEN_POOL.indexOf(trip.id) >= 0) s += 1.5; }
    if (fl.hasToddler || fl.hasYoungKid) { if (KIDS_POOL.indexOf(trip.id) >= 0) s += 1.5; if (trip.stairs) s -= 1; }
    if (trip.byFoot) s += 0.6;
    return s;
  }
  function whyBadges(trip, day, fl, L) {
    var w = L.why, out = [], c = day ? day.cat : null, hot = day && day.max >= 28, cold = day && day.max <= 12;
    if (c && ['rain', 'heavyrain', 'thunder', 'showers'].indexOf(c) >= 0 && (trip.indoorOrCovered || trip.rainOk)) out.push(w.rain);
    else if (hot && trip.lovesHeat) out.push(w.heat);
    else if (c && isNice(c) && trip.outdoor) out.push(w.clear);
    else if (cold && trip.indoorOrCovered) out.push(w.cold);
    if (fl.hasTeen && TEEN_POOL.indexOf(trip.id) >= 0) out.push(w.adrenalin);
    if ((fl.hasToddler || fl.hasYoungKid) && ['janske-hallenbad', 'baumwipfelpfad', 'hricky-buky'].indexOf(trip.id) >= 0) out.push(w.kids);
    if (trip.byFoot) out.push(w.foot);
    return out.slice(0, 3);
  }
  // plán na celý pobyt: anti-opakování + přeskočení navštívených
  function buildPlan(trips, days, fl, visited) {
    var used = {}, plan = [];
    for (var i = 0; i < days.length; i++) {
      var day = days[i];
      var pool = trips.filter(function (t) { return eligible(t, day, fl) && !visited[t.id]; });
      if (!pool.length) pool = trips.filter(function (t) { return eligible(t, day, fl); }); // pojistka, když je vše odškrtnuté
      var ranked = pool.map(function (t) { return { t: t, sc: scoreTrip(t, day, fl) }; }).sort(function (a, b) { return b.sc - a.sc; });
      var pick = null;
      for (var r = 0; r < ranked.length; r++) { if (!used[ranked[r].t.id]) { pick = ranked[r]; break; } }
      if (!pick) pick = ranked[0];
      if (pick) used[pick.t.id] = 1;
      var alts = ranked.filter(function (r2) { return pick && r2.t.id !== pick.t.id && r2.sc > 0; }).slice(0, 2).map(function (r2) { return r2.t; });
      plan.push({ day: day, pick: pick ? pick.t : null, alts: alts });
    }
    return plan;
  }

  /* ===================== Odvození délky výletu (pro wizard „Jak dlouho“) =====================
   * Pravidlo (0 = pár hodin, 1 = půl dne, 2 = celý den):
   *   zone==='far'  OR  travelMin>=40  OR  effort==='hard'                       -> celý den (2)
   *   indoorOrCovered & category∈{water,rain,kids} & travelMin<25                -> pár hodin (0)
   *   jinak                                                                       -> půl dne (1)
   * Match na chip: „Celý den“ => dur===2 · „Půl dne“ => dur<=1 · „Pár hodin“ => dur===0. */
  function tripDur(t) {
    if (t.zone === 'far' || t.travelMin >= 40 || t.effort === 'hard') return 2;
    if (t.indoorOrCovered && ['water', 'rain', 'kids'].indexOf(t.category) >= 0 && t.travelMin < 25) return 0;
    return 1;
  }
  function durMatch(dur, sel) { return sel === 2 ? dur === 2 : sel === 1 ? dur <= 1 : dur === 0; }

  /* ===================== Filtrační logika (jediný zdroj pro mapu i katalog) ===================== */
  function matchFilter(t, f) {
    switch (f) {
      case 'pesky': return t.byFoot === true;
      case 'dest': return !!(t.indoorOrCovered || t.rainOk);
      case 'deti': return t.category === 'kids' || t.category === 'animals' || (t.minAge <= 4 && t.effort === 'easy');
      case 'zviratka': return t.category === 'animals';
      case 'vyhledy': return t.category === 'viewpoint';
      case 'koupani': return t.category === 'water';
      case 'nenarocne': return t.effort === 'easy';
      default: return true;
    }
  }

  /* ===================== Pomocné ===================== */
  var qs = new URLSearchParams(location.search);
  function tt(v, lang) { return v == null ? '' : (typeof v === 'string' ? v : (v[lang] || v.cs || v.de || v.en || v.pl || '')); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function localeOf(lang) { return { cs: 'cs-CZ', de: 'de-DE', en: 'en-GB', pl: 'pl-PL' }[lang] || 'cs-CZ'; }
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function fmtDow(iso, lang) { try { return cap(new Date(iso + 'T00:00:00').toLocaleDateString(localeOf(lang), { weekday: 'short' }).replace('.', '')); } catch (e) { return iso; } }
  function fmtDMY(iso) { var d = new Date(iso + 'T00:00:00'); return d.getDate() + '. ' + (d.getMonth() + 1) + '.'; }
  function fmtRange(a, b) { var da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00'); if (da.getMonth() === db.getMonth()) return da.getDate() + '.–' + db.getDate() + '. ' + (db.getMonth() + 1) + '.'; return fmtDMY(a) + ' – ' + fmtDMY(b); }
  function daysBetween(a, b) { var out = []; var d = new Date(a + 'T00:00:00Z'), e = new Date(b + 'T00:00:00Z'); var g = 0; while (d <= e && g < 60) { out.push(d.toISOString().slice(0, 10)); d.setUTCDate(d.getUTCDate() + 1); g++; } return out; }
  function todayISO() { var x = new Date(); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); }
  function icon(name, cls) { var id = name.indexOf('i-') === 0 ? name : 'i-' + name; return '<svg class="icon ' + (cls || '') + '"><use href="#' + id + '"></use></svg>'; }
  function firstSeg(s, seps) { if (!s) return s; var idx = -1; for (var i = 0; i < seps.length; i++) { var j = s.indexOf(seps[i]); if (j >= 0 && (idx < 0 || j < idx)) idx = j; } return (idx >= 0 ? s.slice(0, idx) : s).trim(); }
  function openShort(s) { return firstSeg(s, [';']); }
  function priceShort(s) { return firstSeg(s, ['·', ';']); }
  function transportLabel(t, L) { return t.byFoot ? L.footLabel : (t.travelMin + ' ' + L.carLabel); }
  function wxFor(forecast, loc, date) { var l = forecast && forecast.byLocation && forecast.byLocation[loc]; return l && l.daily ? l.daily[date] : null; }
  function findTrip(id) { for (var i = 0; i < DATA.trips.length; i++) if (DATA.trips[i].id === id) return DATA.trips[i]; return null; }
  /* Šablona s {klíč} → hodnota (počty v nadpisech katalogu a v počítadle). */
  function fill(s, vals) { return String(s == null ? '' : s).replace(/\{(\w+)\}/g, function (m, k) { return vals[k] == null ? m : vals[k]; }); }

  /* ===================== Sezónní filtr =====================
   * trips.json může (ale nemusí) nést pole `seasons`: ["summer"] / ["winter"] /
   * obojí. Cíl BEZ toho pole se považuje za celoroční — díky tomu funguje
   * plánovač i před tím, než majitel pole do katalogu doplní. */
  function seasonOk(t) {
    var s = t && t.seasons;
    if (!s || !s.length) return true;
    return s.indexOf(S.season === 'zima' ? 'winter' : 'summer') >= 0;
  }

  /* ===================== Stav ===================== */
  var S = { lang: 'cs', season: 'leto', mode: 'public', filter: 'vse', visited: {}, wiz: { day: 0, dur: 1, car: 'car', grp: 'deti', wx: 'nice' } };
  var DATA = { guest: null, trips: [], food: [], forecast: null };
  var token = qs.get('t') || '';
  var MOUNT = null;      // element, do kterého se plánovač renderuje

  /* Sezóna dědí z webu — ?season → localStorage vrSeason → léto (stejná logika jako index/site.js).
     Aplikuje se hned, aby i loading stav a celý průvodce ladil se zimním/letním tématem. */
  function resolveSeason() {
    var q = (qs.get('season') || '').toLowerCase();
    if (q === 'leto' || q === 'zima') return q;
    try { var s = localStorage.getItem('vrSeason'); if (s === 'leto' || s === 'zima') return s; } catch (e) {}
    return 'leto';
  }
  S.season = resolveSeason();

  function loadPrefs() {
    try {
      var p = JSON.parse(localStorage.getItem('vrGuide') || '{}');
      S.visited = p.visited || {};
      S.wiz.grp = p.fGrp || 'deti';
      S.wiz.car = p.fCar || 'car';
      S.wiz.dur = (p.fDur == null ? 1 : p.fDur);
    } catch (e) { }
  }
  function savePrefs() {
    try { localStorage.setItem('vrGuide', JSON.stringify({ visited: S.visited, fGrp: S.wiz.grp, fCar: S.wiz.car, fDur: S.wiz.dur })); } catch (e) { }
  }

  /* ===================== Render sekcí ===================== */
  function tinyMini(t, w, h) {
    var VC = CFG.VILLA_COORDS, kx = Math.cos(VC.lat * Math.PI / 180);
    var cx = w * 0.48, cy = h * 0.56, R = Math.min(w, h) * 0.34;
    var dx = (t.coords.lon - VC.lon) * kx, dy = -(t.coords.lat - VC.lat), d = Math.hypot(dx, dy) || 1;
    var ex = cx + dx / d * R, ey = cy + dy / d * R;
    return '<svg class="mm" viewBox="0 0 ' + w + ' ' + h + '" style="width:' + w + 'px;height:auto">'
      + '<line x1="' + cx.toFixed(1) + '" y1="' + cy.toFixed(1) + '" x2="' + ex.toFixed(1) + '" y2="' + ey.toFixed(1) + '" stroke="' + t.accent + '" stroke-width="1" stroke-dasharray="2 3"/>'
      + '<circle cx="' + cx.toFixed(1) + '" cy="' + cy.toFixed(1) + '" r="2.5" fill="#D68A4C"/>'
      + '<circle cx="' + ex.toFixed(1) + '" cy="' + ey.toFixed(1) + '" r="3.5" fill="none" stroke="' + t.accent + '" stroke-width="1.5"/></svg>';
  }

  /* HOSTOVSKÝ režim: oslovení jménem, termín pobytu, dnešní tip.
     Nikdy se nerenderuje na veřejné /vylety/ (viz renderApp). */
  function renderHeroHTML(L, plan) {
    var guest = DATA.guest, lang = S.lang;
    var last = guest && guest.name && guest.name.last ? guest.name.last : '';
    var hello = esc(L.greet + ', ' + L.family + (last ? ' ' + last : ''));
    var today = todayISO();
    var heroDay = null;
    for (var i = 0; i < plan.length; i++) { if (plan[i].day.date === today) { heroDay = plan[i]; break; } }
    if (!heroDay && plan.length) { if (today < guest.arrival) heroDay = plan[0]; }
    var wxD = wxFor(DATA.forecast, CFG.VILLA, today) || (plan[0] && plan[0].day);
    var wxNow = wxD && wxD.max != null ? (wxD.max + ' °C') : '—';
    var wxIco = icon(wxIcon(wxD && wxD.cat), '');
    var stay = guest ? (L.stayPrefix + ' ' + fmtRange(guest.arrival, guest.departure)) : '';
    var h = '<section class="vg-hero"><p class="vg-badge">' + esc(L.badge) + '</p>'
      + '<p class="vg-hello">' + hello + '</p>'
      + '<h1 class="vg-herotitle">' + esc(L.heroTitle) + '</h1>'
      + '<div class="vg-herometa"><span class="wx">' + wxIco + esc(wxNow) + '</span><span class="sep">·</span><span>' + esc(stay) + '</span></div>';
    if (heroDay && heroDay.pick) {
      var t = heroDay.pick, reason = L.reasons[wxClass(heroDay.day.cat)];
      h += '<button class="vg-tip" data-open="' + esc(t.id) + '" style="--acc:' + t.accent + '"><span class="glow"></span><span class="in">'
        + '<span class="top"><span class="lbl">' + esc(L.todayTip) + '</span><span class="reason">' + esc(reason) + '</span></span>'
        + '<span class="row"><span class="vg-iconbox">' + icon(t.icon) + '</span><span><h2>' + esc(tt(t.name, lang)) + '</h2><p class="sub">' + esc(tt(t.tagline, lang)) + '</p></span></span>'
        + '<span class="foot"><span>' + esc(transportLabel(t, L)) + '</span><span>' + esc(openShort(tt(t.openNote, lang))) + '</span><span class="more">' + esc(L.moreArrow) + '</span></span>'
        + '</span></button>';
    }
    h += '</section>';
    return h;
  }

  function renderPlanHTML(L, plan) {
    var lang = S.lang;
    var rows = plan.map(function (p) {
      var t = p.pick;
      var acc = t ? t.accent : '#79817A';
      var why = L.reasons[wxClass(p.day.cat)];
      var altNames = p.alts.map(function (a) { return tt(a.name, lang).split('–')[0].split('(')[0].trim(); });
      var altTxt = altNames.length ? (L.alt + ': ' + altNames.join(', ')) : '';
      var temp = (p.day.max != null) ? (p.day.max + '° / ' + p.day.min + '°') : '–';
      return '<button class="vg-planrow" data-open="' + (t ? esc(t.id) : '') + '" style="--acc:' + acc + '">'
        + '<div><p class="dow">' + esc(fmtDow(p.day.date, lang)) + '</p><p class="date">' + esc(fmtDMY(p.day.date)) + '</p></div>'
        + '<svg class="wxic" viewBox="0 0 24 24" fill="none" stroke="' + wxColor(p.day.cat) + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><use href="#' + wxIcon(p.day.cat) + '"></use></svg>'
        + '<p class="temp">' + esc(temp) + '</p>'
        + '<div class="pk"><p class="trip"><span class="dot">●</span> ' + esc(t ? tt(t.name, lang) : '–') + '</p><p class="why">' + esc(why + (altTxt ? ' · ' + altTxt : '')) + '</p></div>'
        + '</button>';
    }).join('');
    return '<section class="vg-sec"><div class="vg-sechead"><h2>' + esc(L.planTitle) + '</h2><span class="vg-srcnote">' + esc(L.planSrc) + '</span></div>'
      + '<div class="vg-plan">' + rows + '</div></section>';
  }

  function wizFlags() {
    var base = DATA.guest && DATA.guest.party ? DATA.guest.party : { adults: 2, children: [] };
    var kids = S.wiz.grp === 'kocarek' ? [3] : S.wiz.grp === 'deti' ? [8] : [];
    return partyFlags({ adults: base.adults || 2, children: kids });
  }
  /* Dny s reálnou předpovědí — jen host. Veřejná osa počasí je syntetická (viz synthDay). */
  function wizDays() {
    var out = [];
    if (S.mode === 'guest' && DATA.guest) {
      daysBetween(DATA.guest.arrival, DATA.guest.departure).forEach(function (d) { out.push(Object.assign({ date: d }, wxFor(DATA.forecast, CFG.VILLA, d) || {})); });
    }
    return out.slice(0, 6);
  }
  /* Pruh počasí u vily (5 dní, pasivní) — společný oběma režimům. */
  function forecastDays(n) {
    var vd = DATA.forecast && DATA.forecast.byLocation && DATA.forecast.byLocation[CFG.VILLA] && DATA.forecast.byLocation[CFG.VILLA].daily || {};
    var keys = Object.keys(vd).sort(); var today = todayISO();
    var picked = keys.filter(function (k) { return k >= today; });
    return (picked.length ? picked : keys).slice(0, n || 5).map(function (d) { return Object.assign({ date: d }, vd[d]); });
  }
  /* VEŘEJNÁ osa počasí: dvě hodnoty (Hezky / Prší) mapované přímo na rainOk + outdoor.
     Vědomě BEZ reálné předpovědi — návštěvník v únoru rezervuje na srpen a denní
     předpověď je odměna za rezervaci (host-režim). */
  function synthDay() {
    var winter = S.season === 'zima';
    if (S.wiz.wx === 'rain') return { date: null, cat: 'rain', max: winter ? 0 : 17, min: winter ? -5 : 11, windKmh: 20 };
    return { date: null, cat: 'clear', max: winter ? 1 : 23, min: winter ? -6 : 13, windKmh: 8 };
  }

  function computeWizPool() {
    var day, days = [], di = 0;
    if (S.mode === 'guest') {
      days = wizDays(); if (!days.length) return { day: null, pool: [] };
      di = Math.min(S.wiz.day, days.length - 1); day = days[di];
    } else {
      day = synthDay();
    }
    var fl = wizFlags();
    var pool = DATA.trips.filter(function (t) {
      if (S.visited[t.id]) return false;
      if (!seasonOk(t)) return false;
      if (S.wiz.car === 'nocar' && !t.byFoot) return false;
      if (!durMatch(tripDur(t), S.wiz.dur)) return false;
      return eligible(t, day, fl);
    }).map(function (t) { return { t: t, sc: scoreTrip(t, day, fl) }; }).sort(function (a, b) { return b.sc - a.sc; }).map(function (x) { return x.t; });
    return { day: day, pool: pool, days: days, di: di, fl: fl };
  }

  function renderWizardHTML(L) {
    var lang = S.lang, guest = S.mode === 'guest';
    var w = computeWizPool(), days = w.days || [], di = w.di || 0;

    /* Osa „Kdy" — jen host (reálná předpověď po dnech). Veřejnost dostane
       osu „Jaké je počasí" se dvěma hodnotami. */
    var whenAxis = '';
    if (guest && days.length) {
      var dayChips = days.map(function (d, i) {
        var on = i === di;
        var tp = d.max != null ? d.max + '°' : '';
        return '<button class="vg-daychip" data-wiz="day" data-i="' + i + '" data-on="' + on + '">'
          + '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="' + (on ? '#0E1311' : wxColor(d.cat)) + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><use href="#' + wxIcon(d.cat) + '"></use></svg>'
          + esc(fmtDow(d.date, lang)) + ' <span class="t">' + esc(tp) + '</span></button>';
      }).join('');
      whenAxis = '<p class="vg-fldlbl when">' + esc(L.fWhen) + '</p><div class="vg-daychips">' + dayChips + '</div>';
    }

    var durChips = L.fDurs.map(function (lb, i) { return '<button class="vg-pill" data-wiz="dur" data-i="' + i + '" data-on="' + (S.wiz.dur === i) + '">' + esc(lb) + '</button>'; }).join('');
    var carChips = [['car', L.fCars[0]], ['nocar', L.fCars[1]]].map(function (c) { return '<button class="vg-pill" data-wiz="car" data-i="' + c[0] + '" data-on="' + (S.wiz.car === c[0]) + '">' + esc(c[1]) + '</button>'; }).join('');
    var grpChips = [['kocarek', L.fGrps[0]], ['deti', L.fGrps[1]], ['bez', L.fGrps[2]]].map(function (g) { return '<button class="vg-pill" data-wiz="grp" data-i="' + g[0] + '" data-on="' + (S.wiz.grp === g[0]) + '">' + esc(g[1]) + '</button>'; }).join('');
    var wxAxis = guest ? '' : ('<div class="vg-wizrow"><p class="vg-fldlbl">' + esc(L.fWx) + '</p><div class="vg-chiprow">'
      + [['nice', L.fWxs[0]], ['rain', L.fWxs[1]]].map(function (x) {
        return '<button class="vg-pill" data-wiz="wx" data-i="' + x[0] + '" data-on="' + (S.wiz.wx === x[0]) + '">'
          + icon(x[0] === 'rain' ? 'i-cloud-rain' : 'i-sun') + esc(x[1]) + '</button>';
      }).join('') + '</div></div>');

    var result;
    if (w.pool && w.pool.length) {
      var best = w.pool[0];
      // Odůvodnění je cennější než doporučení — 3 chipy „proč zrovna tenhle".
      var why = whyBadges(best, w.day, w.fl, L).concat([L.fDurs[S.wiz.dur]]);
      if (S.wiz.grp === 'deti' && matchFilter(best, 'deti')) why.push(L.fKids);
      if (S.wiz.grp === 'kocarek') why.push(L.fStroller);
      if (S.wiz.car === 'nocar') why.push(L.fCars[1].toLowerCase());
      why = why.filter(function (x, i) { return x && why.indexOf(x) === i; }).slice(0, 3);
      var whyHTML = why.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('');
      var alts = w.pool.slice(1, 3).map(function (t) {
        return '<button class="vg-alt" data-open="' + esc(t.id) + '" style="--acc:' + t.accent + '"><span class="nm"><span class="dot">●</span> ' + esc(tt(t.name, lang)) + '</span><span class="meta">' + esc(transportLabel(t, L) + ' · ' + L.fDurs[tripDur(t)].toLowerCase()) + '</span></button>';
      }).join('');
      result = '<div class="vg-wizpick">'
        + '<div class="vg-pickmain"><p class="lbl">' + esc(L.fPick) + '</p>'
        + '<button class="vg-best" data-open="' + esc(best.id) + '" style="--acc:' + best.accent + '">'
        + '<span class="vg-iconbox">' + icon(best.icon) + '</span>'
        + '<span class="bd"><h3>' + esc(tt(best.name, lang)) + '</h3><p class="sub">' + esc(tt(best.tagline, lang)) + '</p><span class="vg-why">' + whyHTML + '</span></span>'
        + tinyMini(best, 68, 48) + '</button></div>'
        + (alts ? '<div class="vg-altbox"><p class="lbl">' + esc(L.fAlts) + '</p><div class="vg-alts">' + alts + '</div></div>' : '')
        + '</div>';
    } else {
      result = '<p class="vg-empty">' + esc(guest ? L.fEmpty : L.fEmptyPub) + '</p>';
    }

    var head = guest
      ? '<div class="vg-sechead"><h2>' + esc(L.fTitle) + '</h2><span class="vg-srcnote">' + esc(L.planSrc) + '</span></div>'
      : '';
    return '<section class="vg-wiz">' + head + whenAxis
      + '<div class="vg-wizgrid"><div><p class="vg-fldlbl">' + esc(L.fDurL) + '</p><div class="vg-chiprow">' + durChips + '</div></div>'
      + '<div><p class="vg-fldlbl">' + esc(L.fCarL) + '</p><div class="vg-chiprow">' + carChips + '</div></div>'
      + '<div><p class="vg-fldlbl">' + esc(L.fGroup) + '</p><div class="vg-chiprow">' + grpChips + '</div></div></div>'
      + wxAxis + result + '</section>';
  }

  /* Konverzní můstek — jen veřejný režim. Odkaz na demo hostovského plánovače. */
  function renderBridgeHTML(L) {
    if (S.mode === 'guest') return '';
    return '<div class="vg-bridge"><p class="t">' + esc(L.bridgeTitle) + '</p>'
      + '<p class="b">' + esc(L.bridgeBody) + '</p>'
      + '<a class="c" href="../pruvodce/?t=demo&amp;lang=' + encodeURIComponent(S.lang) + '&amp;season=' + encodeURIComponent(S.season) + '" rel="nofollow">' + esc(L.bridgeCta) + '</a></div>';
  }

  /* Pruh počasí u vily — pasivní důkaz „takhle to u nás vypadá tenhle týden". */
  function renderWxStripHTML(L) {
    var days = forecastDays(5); if (!days.length) return '';
    var lang = S.lang;
    var cells = days.map(function (d) {
      return '<div class="vg-wxday"><span class="dw">' + esc(fmtDow(d.date, lang)) + '</span>'
        + '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="' + wxColor(d.cat) + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><use href="#' + wxIcon(d.cat) + '"></use></svg>'
        + '<span class="tp">' + esc(d.max != null ? d.max + '°' : '–') + '</span>'
        + '<span class="ct">' + esc(wxText(d.cat, lang)) + '</span></div>';
    }).join('');
    return '<section class="vg-wxstrip"><div class="vg-wxhead"><p class="t">' + esc(L.stripTitle) + '</p>'
      + '<p class="s">' + esc(L.stripSub) + '</p></div><div class="vg-wxdays">' + cells + '</div></section>';
  }

  function cardWarn(t, L) {
    if (t.group && t.group.reservation) return L.warnReservation;
    if (t.crossBorderId) return L.warnDocs;
    if (t.minAge) return L.warnAge(t.minAge);
    if (t.group && t.group.capacity) return L.warnCapacity;
    return '';
  }
  function hasPhoto(t) { return false; } // fotky zatím nejsou; badge se ukáže, až budou

  function renderCatalogHTML(L) {
    var lang = S.lang, filter = S.filter;
    var chipLabels = FILTER_IDS.map(function (f) {
      return '<button class="vg-chip" data-filter="' + f + '" data-on="' + (filter === f) + '">' + esc(L.filters[f]) + '</button>';
    }).join('');

    var inSeason = DATA.trips.filter(seasonOk);
    var visible = inSeason.filter(function (t) { return matchFilter(t, filter); });
    var counter = '<div class="vg-count"><span>' + esc(fill(L.counter, { n: visible.length, m: inSeason.length })) + '</span>'
      + (filter !== 'vse' ? '<button class="vg-clear" data-filter="vse">' + esc(L.clearFilter) + '</button>' : '') + '</div>';

    var zones = ['villa', 'near', 'far'];
    var groupsHTML = zones.map(function (z, zi) {
      var items = inSeason.filter(function (t) { return t.zone === z; });
      if (!items.length) return '';
      var shown = items.filter(function (t) { return matchFilter(t, filter); });
      if (!shown.length) return '';
      var cards = shown.map(function (t, i) {
        var warn = cardWarn(t, L);
        var photo = TRIP_PHOTOS[t.id]
          ? '<div class="vg-cardphoto"><img src="' + esc(TRIP_PHOTOS[t.id]) + '" alt="' + esc(tt(t.name, lang)) + '" loading="lazy" width="1200" height="150"></div>'
          : '';
        var badge = (!photo && hasPhoto(t)) ? '<span class="vg-photobadge">' + icon('camera') + '</span>' : '';
        return '<article class="vg-card' + (photo ? ' has-photo' : '') + '" data-open="' + esc(t.id) + '" data-i="' + i + '" data-visited="' + (!!S.visited[t.id]) + '" style="--acc:' + t.accent + '">'
          + photo
          + '<div class="vg-cardicon"><span class="vg-iconbox">' + icon(t.icon) + badge + '</span></div>'
          + '<div class="vg-cardbody"><h3>' + esc(tt(t.name, lang)) + '</h3><p class="sub">' + esc(tt(t.tagline, lang)) + '</p>'
          + '<div class="vg-cardmeta">'
          + '<span>' + icon('clock') + esc(openShort(tt(t.openNote, lang))) + '</span>'
          + '<span>' + icon('ticket') + esc(priceShort(tt(t.price, lang))) + '</span>'
          + '<span class="transport">' + icon('pin') + esc(transportLabel(t, L)) + '</span></div>'
          + (warn ? '<p class="vg-cardwarn">' + icon('alert') + esc(warn) + '</p>' : '')
          + '</div>'
          + (S.mode === 'guest' ? '<button class="vg-visit" data-visit="' + esc(t.id) + '" title="' + esc(L.visited) + '" aria-label="' + esc(L.visited) + '">✓</button>' : '')
          + '</article>';
      }).join('');
      // Mobil: v každém okruhu první 4 karty + „Zobrazit všech N →" (expanduje na místě).
      var more = shown.length > 4
        ? '<button class="vg-more" data-more="' + z + '" aria-expanded="false"><span class="on">' + esc(fill(L.showAll, { n: shown.length })) + '</span><span class="off">' + esc(L.showLess) + '</span></button>'
        : '';
      return '<div class="vg-group" id="vg-zone-' + z + '" data-expanded="false"><div class="vg-grouphead"><h3>' + esc(L.zones[zi]) + ' · ' + shown.length + '</h3></div>'
        + '<div class="vg-cards">' + cards + '</div>' + more + '</div>';
    }).join('');

    return '<section class="vg-catwrap" data-nosnippet><p class="vg-chiplabel">' + esc(L.chipLabel) + '</p>'
      + '<div class="vg-chips">' + chipLabels + '</div>' + counter
      + '<h3 class="vg-cattitle">' + esc(fill(L.catTitle, { n: inSeason.length })) + '</h3>'
      + groupsHTML
      + '<p class="vg-catnote">' + esc(L.catNote) + '</p></section>';
  }

  function renderFoodHTML(L) {
    if (!CFG.SHOW_FOOD || !DATA.food.length) return '';
    var lang = S.lang;
    var rows = DATA.food.map(function (f) {
      var url = (f.links && f.links[f.links.length - 1] && f.links[f.links.length - 1].url) || '#';
      var dist = f.byFoot ? L.footLabel : (f.travelMin + ' ' + L.carLabel);
      return '<a class="vg-foodrow" href="' + esc(url) + '" target="_blank" rel="noopener">'
        + '<div><p class="nm">' + esc(tt(f.name, lang)) + '</p><p class="fs">' + esc(tt(f.tagline, lang)) + '</p></div>'
        + '<span class="dist">' + esc(dist) + ' ↗</span></a>';
    }).join('');
    return '<section class="vg-food"><h2>' + esc(L.foodTitle) + '</h2><p class="sub">' + esc(L.foodSub) + '</p><div class="vg-foodlist">' + rows + '</div></section>';
  }

  /* Sekce „Fotografie" — kredity fotek z Wikimedia Commons (autor + licence + odkaz).
     U CC BY / CC BY-SA je uvedení autora povinné; uvádíme ho u všech. */
  function renderCreditsHTML(L) {
    if (!PHOTO_CREDITS.length) return '';
    var items = PHOTO_CREDITS.map(function (c) {
      return '<li><span class="who">' + esc(c.subject) + '</span> — ' + esc(c.author)
        + ' · <a href="' + esc(c.licenseUrl) + '" target="_blank" rel="noopener">' + esc(c.license) + '</a>'
        + ' · <a href="' + esc(c.source) + '" target="_blank" rel="noopener">' + esc(L.photosCommons) + ' ↗</a></li>';
    }).join('');
    return '<details class="vg-credits"><summary>' + esc(L.photosTitle) + '</summary>'
      + '<p class="sub">' + esc(L.photosSub) + '</p>'
      + '<ul class="vg-creditlist">' + items + '</ul></details>';
  }

  /* ===================== Sestavení plánovače ===================== */
  function computePlan() {
    if (S.mode !== 'guest' || !DATA.guest) return [];
    var fl = partyFlags(DATA.guest.party || { adults: 2, children: [] });
    var stay = daysBetween(DATA.guest.arrival, DATA.guest.departure);
    var days = stay.map(function (d) { return Object.assign({ date: d }, wxFor(DATA.forecast, CFG.VILLA, d) || {}); });
    return buildPlan(DATA.trips.filter(seasonOk), days, fl, S.visited);
  }

  function renderApp(preserveScroll) {
    if (!MOUNT) return;
    var sy = preserveScroll ? window.scrollY : 0;
    var L = T[S.lang];
    if (S.mode === 'guest') document.documentElement.lang = S.lang;
    var plan = computePlan();
    var html = '<div class="vg-wrap">';
    // Osobní data (oslovení, termín pobytu, denní plán) JEN v hostovském režimu.
    if (S.mode === 'guest') { html += renderHeroHTML(L, plan); html += renderPlanHTML(L, plan); }
    html += renderWizardHTML(L);
    html += renderBridgeHTML(L);
    html += renderWxStripHTML(L);
    html += renderCatalogHTML(L);
    html += renderFoodHTML(L);
    html += renderCreditsHTML(L);
    html += '</div>';
    MOUNT.innerHTML = html;
    MOUNT.setAttribute('data-mode', S.mode);
    MOUNT.setAttribute('data-season', S.season);
    wire();
    if (preserveScroll) window.scrollTo(0, sy);
  }

  /* ===================== Detail (bottom-sheet) ===================== */
  var sheetEl = null;
  function openDetail(id) {
    var t = null; for (var i = 0; i < DATA.trips.length; i++) if (DATA.trips[i].id === id) { t = DATA.trips[i]; break; }
    if (!t) return;
    var L = T[S.lang], lang = S.lang;
    var VC = CFG.VILLA_COORDS;
    var routeType = t.byFoot ? 'foot_fast' : 'car_fast';
    var mapy = 'https://mapy.cz/fnc/v1/route?mapset=outdoor&start=' + VC.lon + ',' + VC.lat + '&end=' + t.coords.lon + ',' + t.coords.lat + '&routeType=' + routeType;
    var webLink = (t.links || []).filter(function (l) { return l.icon === 'globe'; })[0] || (t.links || [])[0];
    var gps = t.coords.lat.toFixed(3) + ' N, ' + t.coords.lon.toFixed(3) + ' E';
    var tags = tagsFor(t, L);
    var warns = detailWarns(t, L);

    var body = '<div class="vg-sheetbody">'
      + '<div class="vg-sheethd"><span class="vg-iconbox">' + icon(t.icon) + '</span><div>'
      + '<span class="cat">' + esc((L.cats[t.category] || t.category) + ' · ' + L.zones[t.zone === 'villa' ? 0 : t.zone === 'near' ? 1 : 2]) + '</span>'
      + '<h2>' + esc(tt(t.name, lang)) + '</h2><p class="sub">' + esc(tt(t.tagline, lang)) + '</p></div></div>'
      + (TRIP_PHOTOS[t.id]
          ? '<img class="vg-sheetphoto" src="' + esc(TRIP_PHOTOS[t.id]) + '" alt="' + esc(tt(t.name, lang)) + '" loading="lazy">'
          : '<div class="vg-photoslot">' + icon('camera') + '<span>' + esc(L.dropPhoto) + '</span></div>'
            + '<div class="vg-videosoon">' + icon('play-c') + '<p>' + esc(L.videoSoon) + '</p></div>')
      + '<p class="vg-desc">' + esc(tt(t.desc, lang)) + '</p>'
      + '<div class="vg-facts">'
      + '<div class="vg-fact"><p class="k">' + esc(L.dOpen) + '</p><p class="v">' + esc(tt(t.openNote, lang)) + '</p></div>'
      + '<div class="vg-fact"><p class="k">' + esc(L.dPrice) + '</p><p class="v">' + esc(tt(t.price, lang)) + '</p></div>'
      + '<div class="vg-fact"><p class="k">' + esc(L.dTransport) + '</p><p class="v">' + esc(transportLabel(t, L)) + '</p></div>'
      + '<div class="vg-fact"><p class="k">GPS</p><p class="v">' + esc(gps) + '</p></div></div>';
    if (tags.length) body += '<div class="vg-tags">' + tags.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('') + '</div>';
    warns.forEach(function (wn) { body += '<div class="vg-warnbox">' + icon('alert') + esc(wn) + '</div>'; });
    body += '<div class="vg-route">' + tinyMini(t, 84, 66)
      + '<div class="btns"><a class="vg-routebtn" href="' + esc(mapy) + '" target="_blank" rel="noopener">' + esc(L.dRoute) + ' ↗</a>'
      + (webLink ? '<a class="vg-webbtn" href="' + esc(webLink.url) + '" target="_blank" rel="noopener">' + esc(L.dWeb) + ' ↗</a>' : '') + '</div></div>'
      + '<div class="vg-share">' + icon('camera') + '<div class="bd"><p class="t">' + esc(L.shareTitle) + '</p><p class="s">' + esc(L.shareSub) + '</p>'
      + '<div class="links"><a href="https://www.instagram.com/villarudolfretreat/" target="_blank" rel="noopener">Instagram</a>'
      + '<span class="hash">#villarudolf</span></div></div></div>'
      + '</div>';

    var ov = document.createElement('div');
    ov.className = 'vg-overlay'; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    ov.innerHTML = '<div class="vg-sheet" style="--acc:' + t.accent + '"><div class="grip"><span></span></div>' + body + '</div>';
    ov.addEventListener('click', function (e) { if (e.target === ov) closeDetail(); });
    document.body.appendChild(ov); document.body.style.overflow = 'hidden'; sheetEl = ov;
    if (window.umami) try { window.umami.track('Detail-výlet', { ausflug: tt(t.name, lang).slice(0, 48) }); } catch (e) { }
  }
  function closeDetail() { if (sheetEl) { sheetEl.remove(); sheetEl = null; } document.body.style.overflow = ''; }

  function tagsFor(t, L) {
    var out = [], g = L.tags;
    if (t.byFoot) out.push(g.foot);
    if (t.indoorOrCovered || t.rainOk) out.push(g.rain);
    else if (t.outdoor) out.push(g.outdoor);
    if (t.effort === 'easy') out.push(g.easy); else if (t.effort === 'hard') out.push(g.hard);
    if (t.lovesHeat) out.push(g.heat);
    if (t.needsClearLowWind) out.push(g.clear);
    if (t.stairs) out.push(g.stairs);
    if (t.minAge) out.push(L.warnAge(t.minAge));
    return out.slice(0, 6);
  }
  function detailWarns(t, L) {
    var out = [];
    if (t.group && t.group.reservation) out.push(L.warnReservation);
    if (t.crossBorderId) out.push(L.warnDocs);
    if (t.group && t.group.capacity) out.push(L.warnCapacity);
    return out;
  }

  /* ===================== Wiring ===================== */
  function wire() {
    var app = MOUNT;
    // filtr
    app.querySelectorAll('.vg-chip, .vg-clear').forEach(function (b) {
      b.addEventListener('click', function () {
        S.filter = b.dataset.filter; renderApp(true);
        track('planner_filter', { filtr: S.filter });
      });
    });
    // wizard chipy
    app.querySelectorAll('[data-wiz]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.dataset.wiz, v = b.dataset.i;
        if (k === 'day') S.wiz.day = parseInt(v, 10);
        else if (k === 'dur') S.wiz.dur = parseInt(v, 10);
        else if (k === 'car') S.wiz.car = v;
        else if (k === 'grp') S.wiz.grp = v;
        else if (k === 'wx') S.wiz.wx = v;
        savePrefs(); renderApp(true);
        track('planner_result', { osa: k });
      });
    });
    // otevření detailu (karty, plán, tip, wizard, alternativy)
    app.querySelectorAll('[data-open]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        if (e.target.closest('.vg-visit')) return; // klik na ✓ neotevírá detail
        var id = el.dataset.open; if (id) openDetail(id);
      });
    });
    // „už jsme byli“ toggle (jen host)
    app.querySelectorAll('.vg-visit').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = b.dataset.visit;
        if (S.visited[id]) delete S.visited[id]; else S.visited[id] = true;
        savePrefs(); renderApp(true);
      });
    });
    // mobil: „Zobrazit všech N →“ expanduje okruh na místě (max-height, ne display:none)
    app.querySelectorAll('[data-more]').forEach(function (b) {
      b.addEventListener('click', function () {
        var g = app.querySelector('#vg-zone-' + b.dataset.more); if (!g) return;
        var on = g.getAttribute('data-expanded') !== 'true';
        g.setAttribute('data-expanded', on ? 'true' : 'false');
        b.setAttribute('aria-expanded', on ? 'true' : 'false');
      });
    });
    // konverzní můstek
    app.querySelectorAll('.vg-bridge .c').forEach(function (a) {
      a.addEventListener('click', function () { track('planner_demo', {}); });
    });
  }

  function track(name, props) {
    if (!window.umami) return;
    try { window.umami.track(name, props || {}); } catch (e) { }
  }

  // Esc zavírá detail
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sheetEl) closeDetail(); });

  /* ===================== Ikonový sprite =====================
   * Plánovač běží na dvou stránkách s různou sadou symbolů v HTML. Chybějící
   * doplníme za běhu — žádná duplicita ve zdrojích stránek. */
  var SPRITE = {
    'i-sun': '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"/>',
    'i-cloud': '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
    'i-cloud-sun': '<path d="M12 2v2M4.93 4.93l1.41 1.41M20 12h2M19.07 4.93l-1.41 1.41M15.947 12.65a4 4 0 0 0-5.925-4.128M13 22H7a5 5 0 1 1 4.9-6H13a3 3 0 0 1 0 6Z"/>',
    'i-cloud-rain': '<path d="M20 16.6A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25M16 13v5M8 13v5M12 15v5"/>',
    'i-mountain': '<path d="m8 3 4 8 5-5 5 15H2L8 3z"/>',
    'i-fort': '<path d="M22 20v-9H2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2ZM18 11V4H6v7M15 22v-4a3 3 0 0 0-6 0v4M6 4V2M18 4V2M10 4V2M14 4V2"/>',
    'i-tree': '<path d="m17 14 3 3.3a1 1 0 0 1-.7 1.7H4.7a1 1 0 0 1-.7-1.7L7 14h-.3a1 1 0 0 1-.7-1.7L9 9h-.2A1 1 0 0 1 8 7.3L12 3l4 4.3a1 1 0 0 1-.8 1.7H15l3 3.3a1 1 0 0 1-.7 1.7H17ZM12 22v-3"/>',
    'i-waves': '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
    'i-flame': '<path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/>',
    'i-zap': '<path d="M4 14a1 1 0 0 1-.78-1.63l9.9-10.2a.5.5 0 0 1 .86.46l-1.92 6.02A1 1 0 0 0 13 10h7a1 1 0 0 1 .78 1.63l-9.9 10.2a.5.5 0 0 1-.86-.46l1.92-6.02A1 1 0 0 0 11 14z"/>',
    'i-bike': '<circle cx="18.5" cy="17.5" r="3.5"/><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="15" cy="5" r="1"/><path d="M12 17.5V14l-3-3 4-3 2 3h2"/>',
    'i-play': '<path d="M8.3 10a.7.7 0 0 1-.626-1.079L11.4 3a.7.7 0 0 1 1.198-.043L16.3 8.9a.7.7 0 0 1-.572 1.1Z"/><rect x="3" y="14" width="7" height="7" rx="1"/><circle cx="17.5" cy="17.5" r="3.5"/>',
    'i-pin': '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    'i-globe': '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20M2 12h20"/>',
    'i-ticket': '<path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2ZM13 5v2M13 17v2M13 11v2"/>',
    'i-info': '<circle cx="12" cy="12" r="10"/><path d="M12 16v-5M12 8h.01"/>',
    'i-alert': '<path d="M12 3 2 20h20L12 3zM12 10v4M12 17.5v.5"/>',
    'i-clock': '<circle cx="12" cy="12" r="10"/><path d="M12 7v5l3 2"/>',
    'i-calendar': '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    'i-route': '<circle cx="6" cy="19" r="2"/><path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16"/><circle cx="18" cy="5" r="2"/>',
    'i-map': '<path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3ZM9 3v15M15 6v15"/>',
    'i-camera': '<path d="M4 8 h3 l2-3 h6 l2 3 h3 v11 H4 Z"/><circle cx="12" cy="13" r="3.4"/>',
    'i-play-c': '<circle cx="12" cy="12" r="9"/><path d="M10 8.5 l6 3.5 -6 3.5 Z" fill="currentColor" stroke="none"/>',
    'i-spa': '<path d="M12 3c1.6 2 2.6 3.9 2.6 5.8a2.6 2.6 0 0 1-5.2 0C9.4 6.9 10.4 5 12 3Z"/><path d="M4.5 10.5c2.2.2 4 1 5.4 2.4M19.5 10.5c-2.2.2-4 1-5.4 2.4"/><path d="M5 20c3-1 5-3.6 7-8 2 4.4 4 7 7 8Z"/>'
  };
  function ensureSprite() {
    var missing = Object.keys(SPRITE).filter(function (id) { return !document.getElementById(id); });
    if (!missing.length) return;
    var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('aria-hidden', 'true'); svg.style.display = 'none';
    svg.innerHTML = missing.map(function (id) {
      return '<symbol id="' + id + '" viewBox="0 0 24 24">' + SPRITE[id] + '</symbol>';
    }).join('');
    document.body.appendChild(svg);
  }

  /* ===================== Načtení hosta (token / demo / public) ===================== */
  function rollDates(g) {
    var lp = function (n) { var x = new Date(); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
    g.arrival = lp(1); g.departure = lp(5); return g;
  }
  function loadGuest() {
    if (!token) return Promise.resolve(null); // žádný token -> public
    if (token === 'demo') {
      return fetch(CFG.DEMO_GUEST_URL).then(function (r) { return r.json(); }).then(function (g) { return rollDates(g); }).catch(function () { return null; });
    }
    return fetch(CFG.SUPABASE_URL + '/rest/v1/rpc/vr_verify_token', {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + CFG.SUPABASE_ANON_KEY }, body: JSON.stringify({ p_token: token })
    }).then(function (r) { if (!r.ok) throw new Error('token'); return r.json(); }).then(function (rows) { return Array.isArray(rows) ? rows[0] : rows; })
      .catch(function () { return null; }); // neplatný token -> public
  }

  /* ===================== Načtení dat (sessionStorage cache, TTL 6 h) ===================== */
  var TRIPS_KEY = 'vr_trips_v1', TTL = 21600000;
  function cached(key, url) {
    try {
      var raw = sessionStorage.getItem(key);
      if (raw) { var o = JSON.parse(raw); if (o && o.t && (Date.now() - o.t) < TTL && o.d) return Promise.resolve(o.d); }
    } catch (e) { }
    return fetch(url).then(function (r) { return r.json(); }).then(function (d) {
      try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), d: d })); } catch (e) { }
      return d;
    });
  }

  /* ===================== Start ===================== */
  var booted = false, booting = null;
  function boot() {
    if (booting) return booting;
    loadPrefs();
    booting = Promise.all([
      loadGuest(),
      cached(TRIPS_KEY, CFG.TRIPS_URL),
      cached('vr_forecast_v1', CFG.FORECAST_URL).catch(function () { return null; })
    ]).then(function (res) {
      var guest = res[0], tripsRaw = res[1], forecast = res[2];
      // katalog z portálu + lokální doplňky (RK masáže); číslování až po sloučení
      DATA.trips = (tripsRaw.trips || []).concat(EXTRA_TRIPS).map(function (t, i) { t._num = i + 1; return t; });
      DATA.food = tripsRaw.food || [];
      DATA.forecast = forecast;
      if (guest) {
        DATA.guest = guest; S.mode = 'guest';
        // Reálný host má jazyk z rezervace. U ukázky (?t=demo) rozhoduje ?lang=,
        // jinak by Čech kliknuvší na „Ukázat na příkladu →" dostal němčinu.
        var qLang = (qs.get('lang') || '').toLowerCase();
        S.lang = (token === 'demo' && T[qLang]) ? qLang
          : ((guest.lang && T[guest.lang]) ? guest.lang : (T[S.lang] ? S.lang : 'cs'));
      } else {
        S.mode = 'public';
      }
      ensureSprite();
      booted = true;
      renderApp(false);
      track('planner_open', { rezim: S.mode });
      return true;
    });
    return booting;
  }

  function resolveLangFromPage() {
    var qLang = (qs.get('lang') || '').toLowerCase();
    var lsLang = null; try { lsLang = localStorage.getItem('vrLang'); } catch (e) { }
    var navLang = (navigator.language || navigator.userLanguage || '').slice(0, 2).toLowerCase();
    return T[qLang] ? qLang : ((lsLang && T[lsLang]) ? lsLang : (T[navLang] ? navLang : 'cs'));
  }

  /* ===================== Veřejné API ===================== */
  window.VRPlanner = {
    /* mount({ el, lang, season, filter, zona }) — /vylety/ volá líně (IntersectionObserver
       / klik / #planovac), /pruvodce/ hned po načtení. */
    mount: function (opts) {
      opts = opts || {};
      var el = typeof opts.el === 'string' ? document.querySelector(opts.el) : opts.el;
      if (!el) return Promise.resolve(false);
      MOUNT = el;
      if (opts.lang && T[opts.lang]) S.lang = opts.lang;
      if (opts.season === 'leto' || opts.season === 'zima') S.season = opts.season;
      if (opts.filter && FILTER_IDS.indexOf(opts.filter) >= 0) S.filter = opts.filter;
      el.setAttribute('data-season', S.season);
      return boot().then(function () {
        if (opts.zona) {
          var z = { pesky: 'villa', auto: 'near', den: 'far' }[opts.zona];
          var g = z && MOUNT.querySelector('#vg-zone-' + z);
          if (g) setTimeout(function () { try { g.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { g.scrollIntoView(); } }, 160);
        }
        return true;
      });
    },
    isMounted: function () { return booted; },
    /* Živé počty z katalogu (trips.json + lokální doplňky) — statická čísla
       v pásu na /vylety/ se jimi po načtení přepíšou, ať nikdy nelžou. */
    counts: function () {
      var z = { villa: 0, near: 0, far: 0 };
      DATA.trips.filter(seasonOk).forEach(function (t) { if (z[t.zone] != null) z[t.zone]++; });
      return { total: z.villa + z.near + z.far, foot: z.villa, car: z.near, day: z.far };
    },
    openDetail: function (id) { if (booted) openDetail(id); else boot().then(function () { openDetail(id); }); },
    setFilter: function (f) { if (FILTER_IDS.indexOf(f) < 0) return; S.filter = f; if (booted) renderApp(true); },
    setLang: function (l) { if (!T[l] || S.lang === l) return; S.lang = l; if (booted) renderApp(true); },
    setSeason: function (s) {
      if ((s !== 'leto' && s !== 'zima') || S.season === s) return;
      S.season = s; if (MOUNT) MOUNT.setAttribute('data-season', s);
      if (booted) renderApp(true);
    }
  };

  /* Autostart na /pruvodce/ — guest shell má #vr-planner rovnou v HTML.
     /vylety/ si mount řídí samo (líně) přes VRPlanner.mount(). */
  (function autostart() {
    var el = document.getElementById('vr-planner');
    if (!el || !el.hasAttribute('data-autostart')) return;
    S.lang = resolveLangFromPage();
    var page = document.querySelector('.vg-page');
    if (page) page.setAttribute('data-season', S.season);
    var syncShell = function () {
      document.documentElement.lang = S.lang;
      document.querySelectorAll('.vg-lang').forEach(function (b) {
        b.setAttribute('data-active', b.getAttribute('data-lang') === S.lang ? 'true' : 'false');
      });
      var L = T[S.lang] || T.cs;
      document.querySelectorAll('[data-shellt]').forEach(function (n) {
        var v = L[n.getAttribute('data-shellt')];
        if (typeof v === 'string') n.textContent = v;
      });
      document.querySelectorAll('a[data-shelllink]').forEach(function (a) {
        try {
          var u = new URL(a.getAttribute('data-shelllink'), location.href);
          u.searchParams.set('lang', S.lang); u.searchParams.set('season', S.season);
          a.setAttribute('href', u.pathname + u.search + u.hash);
        } catch (e) { }
      });
    };
    document.querySelectorAll('.vg-lang').forEach(function (b) {
      b.addEventListener('click', function () {
        var l = b.getAttribute('data-lang'); if (!T[l] || S.lang === l) return;
        try { localStorage.setItem('vrLang', l); } catch (e) { }
        try { var u = new URL(location.href); u.searchParams.set('lang', l); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch (e) { }
        window.VRPlanner.setLang(l);
        syncShell();
      });
    });
    syncShell();
    // Host má jazyk z rezervace — po načtení srovnej i rám stránky.
    window.VRPlanner.mount({ el: el, lang: S.lang, season: S.season }).then(syncShell).catch(function (e) {
      el.innerHTML = '<div class="vg-loading">Plánovač se nepodařilo načíst. / The planner could not be loaded.</div>';
      if (window.console) console.error(e);
    });
  })();
})();
