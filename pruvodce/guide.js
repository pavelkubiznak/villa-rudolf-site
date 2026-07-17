/* Villa Rudolf — průvodce výlety (/pruvodce/)
 * Re-implementace Claude Design prototypu (Vylety Pruvodce.dc.html) v čistém vanilla JS.
 * Data: villa-rudolf-portal (trips.json + forecast.json), jediný zdroj pravdy, fetch za běhu.
 * Doporučovací jádro (partyFlags / eligible / scoreTrip / whyBadges / buildPlan / CAT) je
 * převzato ze sémantiky ostrého guest portálu, aby plán fungoval shodně.
 * Runtime prototypu (support.js) se NEPŘENÁŠÍ — vše je znovu napsáno níže.
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
      badge: 'Průvodce', greet: 'Vítejte', family: 'rodino', heroTitle: 'Váš plán na tenhle týden',
      stayPrefix: 'pobyt', todayTip: 'Dnešní tip', moreArrow: 'detail →',
      planTitle: 'Plán na každý den', planSrc: 'počasí: yr.no · živě',
      pubEyebrow: 'Výlety v okolí', pubTitle: 'Kam z Villy Rudolf',
      pubLead: 'Ověřené výlety do hodiny od domu — od procházek s kočárkem po Sněžku. Hosté s rezervací dostanou plán na míru podle počasí a věku dětí.',
      mapNote: 'Ilustrativní mapa — čísla odpovídají katalogu níže. Cíle v kroužku jsou pěšky od vily.',
      selHint: 'Ťukněte na bod v mapě', zoomFull: 'Celé Krkonoše', zoomNear: 'Okolí vily',
      foodTitle: 'Kam na dobré jídlo', foodSub: 'Prověřeno hosty i majiteli',
      footNote: 'Data z katalogu villa-rudolf-portal · ceny a otevírací doby ověřte před cestou.',
      wxLive: 'počasí: yr.no · živě',
      dOpen: 'Otevřeno', dPrice: 'Vstupné', dTransport: 'Doprava', dWeb: 'Oficiální web', dRoute: 'Trasa z vily',
      chipLabel: 'Rychlý filtr · platí pro mapu i katalog',
      shareTitle: 'Vyfotili jste to tady?', shareSub: 'Označte @villarudolf — nejhezčí fotky (se svolením) ukážeme v průvodci.',
      zones: ['Pěšky od vily', 'V okolí · do 30 min', 'Na celý den'], ringLabel: 'pěšky od vily',
      filters: { vse: 'Vše', pesky: 'Bez auta', dest: 'Za deště', deti: 'Pro děti', zviratka: 'Zvířátka', vyhledy: 'Výhledy', koupani: 'Koupání', nenarocne: 'Nenáročné' },
      reasons: { wet: 'déšť — pod střechu', nice: 'slunečno — ven', mild: 'polojasno' },
      alt: 'alternativy',
      fTitle: 'Najít výlet na den', fWhen: 'Kdy', fDurL: 'Jak dlouho', fDurs: ['Pár hodin', 'Půl dne', 'Celý den'],
      fCarL: 'Doprava', fCars: ['S autem', 'Bez auta'], fGroup: 'Skupina', fGrps: ['S kočárkem', 'S dětmi', 'Bez dětí'],
      fPick: 'Doporučujeme', fKids: 's dětmi', fStroller: 's kočárkem',
      fEmpty: 'Nic nesedí — povolte auto či delší čas, případně odškrtněte „už jsme byli“.',
      visited: 'Už jsme byli', dropPhoto: 'Fotku z výletu doplníme', videoSoon: 'K výletu chystáme video — sestřih z natáčení.',
      footLabel: 'pěšky od vily', carLabel: 'min autem', detail: 'Detail',
      warnReservation: 'Pro skupinu rezervujte předem', warnDocs: 'Do Polska doklad i pro každé dítě',
      warnAge: function (n) { return 'Vhodné od ' + n + ' let'; }, warnCapacity: 'Před cestou ověřte obsazenost online',
      why: { rain: 'ideální za deště', clear: 'krásný den ven', heat: 'osvěžení v horku', teen: 'pro teenagery', kids: 'pro děti', foot: 'bez auta', cold: 'do chladna', adrenalin: 'adrenalin', indoor: 'pod střechu' },
      cats: { walk: 'túra', viewpoint: 'výhledy', animals: 'zvířátka', kids: 'pro děti', water: 'koupání', rain: 'za deště', adrenalin: 'adrenalin', culture: 'kultura' },
      tags: { foot: 'pěšky od vily', rain: 'i za deště', outdoor: 'venku', easy: 'nenáročné', hard: 'náročné', heat: 'do horka', clear: 'za jasna', stairs: 'schody', reservation: 'rezervace', border: 'Polsko · doklady' }
    },
    de: {
      badge: 'Guide', greet: 'Willkommen', family: 'Familie', heroTitle: 'Ihr Plan für diese Woche',
      stayPrefix: 'Aufenthalt', todayTip: 'Tipp für heute', moreArrow: 'Detail →',
      planTitle: 'Plan für jeden Tag', planSrc: 'Wetter: yr.no · live',
      pubEyebrow: 'Ausflüge in der Umgebung', pubTitle: 'Wohin von der Villa Rudolf',
      pubLead: 'Geprüfte Ausflüge bis zu einer Stunde vom Haus — vom Kinderwagenspaziergang bis zur Schneekoppe. Gäste mit Reservierung erhalten einen Plan nach Wetter und Kinderalter.',
      mapNote: 'Illustrative Karte — Nummern entsprechen dem Katalog unten. Ziele im Kreis sind zu Fuß erreichbar.',
      selHint: 'Tippen Sie auf einen Punkt der Karte', zoomFull: 'Ganze Region', zoomNear: 'Rund um die Villa',
      foodTitle: 'Gut essen gehen', foodSub: 'Von Gästen und Gastgebern geprüft',
      footNote: 'Daten aus dem Katalog villa-rudolf-portal · Preise und Öffnungszeiten vorab prüfen.',
      wxLive: 'Wetter: yr.no · live',
      dOpen: 'Geöffnet', dPrice: 'Eintritt', dTransport: 'Anfahrt', dWeb: 'Offizielle Website', dRoute: 'Route ab Villa',
      chipLabel: 'Schnellfilter · gilt für Karte und Katalog',
      shareTitle: 'Hier fotografiert?', shareSub: 'Markieren Sie @villarudolf — die schönsten Fotos zeigen wir (mit Erlaubnis) im Guide.',
      zones: ['Zu Fuß von der Villa', 'In der Nähe · bis 30 Min', 'Für den ganzen Tag'], ringLabel: 'zu Fuß',
      filters: { vse: 'Alle', pesky: 'Ohne Auto', dest: 'Bei Regen', deti: 'Für Kinder', zviratka: 'Tiere', vyhledy: 'Aussichten', koupani: 'Baden', nenarocne: 'Leicht' },
      reasons: { wet: 'Regen — unters Dach', nice: 'sonnig — raus', mild: 'heiter' },
      alt: 'Alternativen',
      fTitle: 'Ausflug für den Tag finden', fWhen: 'Wann', fDurL: 'Wie lange', fDurs: ['Paar Stunden', 'Halber Tag', 'Ganzer Tag'],
      fCarL: 'Anfahrt', fCars: ['Mit Auto', 'Ohne Auto'], fGroup: 'Gruppe', fGrps: ['Mit Kinderwagen', 'Mit Kindern', 'Ohne Kinder'],
      fPick: 'Unser Tipp', fKids: 'mit Kindern', fStroller: 'mit Kinderwagen',
      fEmpty: 'Nichts passt — Auto oder mehr Zeit erlauben, ggf. „waren wir schon“ abwählen.',
      visited: 'Waren wir schon', dropPhoto: 'Foto vom Ausflug folgt', videoSoon: 'Zum Ausflug entsteht ein Video — der Schnitt folgt.',
      footLabel: 'zu Fuß ab Villa', carLabel: 'Min. mit dem Auto', detail: 'Details',
      warnReservation: 'Für die Gruppe vorab reservieren', warnDocs: 'Nach Polen Ausweis auch für jedes Kind',
      warnAge: function (n) { return 'Ab ' + n + ' Jahren'; }, warnCapacity: 'Vor der Fahrt Auslastung online prüfen',
      why: { rain: 'ideal bei Regen', clear: 'schöner Tag draußen', heat: 'Abkühlung bei Hitze', teen: 'für Teenager', kids: 'für Kinder', foot: 'ohne Auto', cold: 'für kühle Tage', adrenalin: 'Adrenalin', indoor: 'überdacht' },
      cats: { walk: 'Wanderung', viewpoint: 'Aussichten', animals: 'Tiere', kids: 'für Kinder', water: 'Baden', rain: 'bei Regen', adrenalin: 'Adrenalin', culture: 'Kultur' },
      tags: { foot: 'zu Fuß', rain: 'auch bei Regen', outdoor: 'draußen', easy: 'leicht', hard: 'anspruchsvoll', heat: 'für heiße Tage', clear: 'bei klarem Wetter', stairs: 'Treppen', reservation: 'Reservierung', border: 'Polen · Ausweis' }
    },
    en: {
      badge: 'Guide', greet: 'Welcome', family: 'family', heroTitle: 'Your plan for this week',
      stayPrefix: 'stay', todayTip: 'Today’s tip', moreArrow: 'detail →',
      planTitle: 'A plan for every day', planSrc: 'weather: yr.no · live',
      pubEyebrow: 'Trips nearby', pubTitle: 'Where to go from Villa Rudolf',
      pubLead: 'Verified trips within an hour of the house — from stroller walks to Sněžka. Guests with a booking get a plan tailored to weather and kids’ ages.',
      mapNote: 'Illustrative map — numbers match the catalogue below. Circled spots are walkable from the villa.',
      selHint: 'Tap a point on the map', zoomFull: 'Whole area', zoomNear: 'Around the villa',
      foodTitle: 'Where to eat well', foodSub: 'Vetted by guests and hosts',
      footNote: 'Data from the villa-rudolf-portal catalogue · verify prices and hours before you go.',
      wxLive: 'weather: yr.no · live',
      dOpen: 'Open', dPrice: 'Tickets', dTransport: 'Getting there', dWeb: 'Official site', dRoute: 'Route from villa',
      chipLabel: 'Quick filter · applies to map and catalogue',
      shareTitle: 'Took a photo here?', shareSub: 'Tag @villarudolf — we feature the best ones (with permission) in this guide.',
      zones: ['Walk from the villa', 'Nearby · under 30 min', 'For a full day'], ringLabel: 'walkable',
      filters: { vse: 'All', pesky: 'No car', dest: 'Rainy day', deti: 'For kids', zviratka: 'Animals', vyhledy: 'Views', koupani: 'Swimming', nenarocne: 'Easy' },
      reasons: { wet: 'rain — head indoors', nice: 'sunny — go out', mild: 'partly cloudy' },
      alt: 'alternatives',
      fTitle: 'Find a trip for the day', fWhen: 'When', fDurL: 'How long', fDurs: ['A few hours', 'Half a day', 'Full day'],
      fCarL: 'Getting there', fCars: ['With a car', 'No car'], fGroup: 'Group', fGrps: ['With a stroller', 'With kids', 'No kids'],
      fPick: 'Our pick', fKids: 'good with kids', fStroller: 'stroller-friendly',
      fEmpty: 'Nothing fits — allow a car or more time, or untick “been there”.',
      visited: 'Been there', dropPhoto: 'A trip photo is coming', videoSoon: 'A trip video is coming — the edit is in progress.',
      footLabel: 'on foot from the villa', carLabel: 'min by car', detail: 'Details',
      warnReservation: 'Book ahead for a group', warnDocs: 'For Poland, ID for every child too',
      warnAge: function (n) { return 'Suitable from age ' + n; }, warnCapacity: 'Check live occupancy before you go',
      why: { rain: 'ideal in rain', clear: 'great day outside', heat: 'cool off in the heat', teen: 'for teens', kids: 'for kids', foot: 'no car needed', cold: 'for cool days', adrenalin: 'adrenaline', indoor: 'indoors' },
      cats: { walk: 'hike', viewpoint: 'views', animals: 'animals', kids: 'for kids', water: 'swimming', rain: 'rainy-day', adrenalin: 'adrenaline', culture: 'culture' },
      tags: { foot: 'walkable', rain: 'rainy-day ok', outdoor: 'outdoors', easy: 'easy', hard: 'strenuous', heat: 'for hot days', clear: 'clear weather', stairs: 'stairs', reservation: 'booking', border: 'Poland · ID' }
    },
    pl: {
      badge: 'Przewodnik', greet: 'Witajcie', family: 'rodzino', heroTitle: 'Wasz plan na ten tydzień',
      stayPrefix: 'pobyt', todayTip: 'Tip na dziś', moreArrow: 'szczegóły →',
      planTitle: 'Plan na każdy dzień', planSrc: 'pogoda: yr.no · na żywo',
      pubEyebrow: 'Wycieczki w okolicy', pubTitle: 'Dokąd z Villi Rudolf',
      pubLead: 'Sprawdzone wycieczki do godziny od domu — od spacerów z wózkiem po Śnieżkę. Goście z rezerwacją dostają plan dopasowany do pogody i wieku dzieci.',
      mapNote: 'Mapa poglądowa — numery odpowiadają katalogowi poniżej. Cele w okręgu są pieszo od willi.',
      selHint: 'Dotknijcie punktu na mapie', zoomFull: 'Cały region', zoomNear: 'Okolice willi',
      foodTitle: 'Gdzie dobrze zjeść', foodSub: 'Sprawdzone przez gości i gospodarzy',
      footNote: 'Dane z katalogu villa-rudolf-portal · ceny i godziny sprawdźcie przed wyjazdem.',
      wxLive: 'pogoda: yr.no · na żywo',
      dOpen: 'Otwarte', dPrice: 'Bilety', dTransport: 'Dojazd', dWeb: 'Oficjalna strona', dRoute: 'Trasa z willi',
      chipLabel: 'Szybki filtr · działa na mapę i katalog',
      shareTitle: 'Macie stąd zdjęcie?', shareSub: 'Oznaczcie @villarudolf — najładniejsze (za zgodą) pokażemy w przewodniku.',
      zones: ['Pieszo od willi', 'W okolicy · do 30 min', 'Na cały dzień'], ringLabel: 'pieszo',
      filters: { vse: 'Wszystko', pesky: 'Bez auta', dest: 'Na deszcz', deti: 'Dla dzieci', zviratka: 'Zwierzęta', vyhledy: 'Widoki', koupani: 'Kąpiel', nenarocne: 'Łatwe' },
      reasons: { wet: 'deszcz — pod dach', nice: 'słonecznie — w teren', mild: 'przejaśnienia' },
      alt: 'alternatywy',
      fTitle: 'Znajdź wycieczkę na dzień', fWhen: 'Kiedy', fDurL: 'Jak długo', fDurs: ['Parę godzin', 'Pół dnia', 'Cały dzień'],
      fCarL: 'Dojazd', fCars: ['Autem', 'Bez auta'], fGroup: 'Grupa', fGrps: ['Z wózkiem', 'Z dziećmi', 'Bez dzieci'],
      fPick: 'Polecamy', fKids: 'z dziećmi', fStroller: 'z wózkiem',
      fEmpty: 'Nic nie pasuje — dopuśćcie auto lub więcej czasu, ew. odznaczcie „już byliśmy”.',
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

  /* ===================== Stav ===================== */
  var S = { lang: 'cs', mode: 'public', filter: 'vse', visited: {}, wiz: { day: 0, dur: 1, car: 'car', grp: 'deti' }, selPin: null, mapZoom: 'full' };
  var DATA = { guest: null, trips: [], food: [], forecast: null };
  var token = qs.get('t') || '';
  var LAST_MAP = { W: 520, H: 360, pins: {}, fullBox: { x: 0, y: 0, w: 520, h: 360 }, zoomBox: null };

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

  /* ===================== Přehledová mapa (geo-projekce z coords, dark restyle dle designu) =====================
   * Projekce a rozmístění pinů vychází z ostrého portálu (renderMapInner):
   * ne-vila zóny geograficky projektované + declutter, vila-zóna schematicky na kroužku „pěšky od vily“. */
  function mapLum(hex) { var n = parseInt(String(hex).replace('#', ''), 16); return (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255; }
  function mapSmooth(pts) {
    if (!pts.length) return '';
    if (pts.length < 2) return 'M' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
    var d = 'M' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || pts[i + 1];
      var c1x = p1.x + (p2.x - p0.x) / 6, c1y = p1.y + (p2.y - p0.y) / 6;
      var c2x = p2.x - (p3.x - p1.x) / 6, c2y = p2.y - (p3.y - p1.y) / 6;
      d += 'C' + c1x.toFixed(1) + ' ' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ' ' + c2y.toFixed(1) + ' ' + p2.x.toFixed(1) + ' ' + p2.y.toFixed(1);
    }
    return d;
  }
  function renderMap(trips, plan, filterId) {
    var lang = S.lang, L = T[lang];
    // Větší mapa: menší okraje + svislé roztažení (YSTRETCH) → vyšší render a víc místa
    // pro namačkaný středový cluster (mapa je ilustrativní, mírná deformace je v pořádku).
    var W = 520, padX = 16, padTop = 24, padBot = 20, YSTRETCH = 1.4, F = 'Archivo,system-ui,sans-serif';
    var VC = CFG.VILLA_COORDS;
    var showPlan = filterId === 'vse' && plan && plan.length;
    var pickIds = {}; if (showPlan) plan.forEach(function (p) { if (p.pick) pickIds[p.pick.id] = 1; });
    var villaZ = [], proj = [];
    trips.forEach(function (t) { (t.zone === 'villa' ? villaZ : proj).push({ t: t, num: t._num }); });
    var vis = function (o) { return matchFilter(o.t, filterId); };
    var kx = Math.cos(VC.lat * Math.PI / 180);
    var projPoint = function (lat, lon) { return { rx: lon * kx, ry: -lat }; };
    var raw = [Object.assign(projPoint(VC.lat, VC.lon), { villa: true })]
      .concat(proj.map(function (o) { return Object.assign(projPoint(o.t.coords.lat, o.t.coords.lon), { villa: false }); }));
    var ctx = [[50.795, 15.44], [50.795, 15.90], [50.600, 15.82], [50.700, 15.41], [50.700, 15.92]].map(function (a) { return projPoint(a[0], a[1]); });
    // Rámec počítáme jen z vily + blízkých cílů + kontextu (zóna „far" se do rozsahu nepočítá,
    // aby pár vzdálených cílů — Safari na jihu, Karpacz na severu — netvořilo prázdné pásy;
    // vzdálené piny se pak přichytí na okraj mapy díky clampu v declutteru níže).
    var extent = [projPoint(VC.lat, VC.lon)]
      .concat(proj.filter(function (o) { return o.t.zone !== 'far'; }).map(function (o) { return projPoint(o.t.coords.lat, o.t.coords.lon); }))
      .concat(ctx);
    var minRx = Infinity, maxRx = -Infinity, minRy = Infinity, maxRy = -Infinity;
    extent.forEach(function (p) { minRx = Math.min(minRx, p.rx); maxRx = Math.max(maxRx, p.rx); minRy = Math.min(minRy, p.ry); maxRy = Math.max(maxRy, p.ry); });
    var rxRange = maxRx - minRx, ryRange = maxRy - minRy;
    var scaleX = (W - 2 * padX) / Math.max(rxRange, 1e-6);
    var scaleY = scaleX * YSTRETCH;
    var H = Math.round(ryRange * scaleY + padTop + padBot);
    var X = function (lon) { return padX + (lon * kx - minRx) * scaleX; };
    var Y = function (lat) { return padTop + (-lat - minRy) * scaleY; };
    var pts = raw.map(function (p) { return { x: padX + (p.rx - minRx) * scaleX, y: padTop + (p.ry - minRy) * scaleY, villa: p.villa }; });
    // declutter projektovaných pinů + „moat“ kolem vily (jako v ostrém portálu)
    var vx0 = pts[0].x, vy0 = pts[0].y, MIN = 21, CLEAR = 48;
    for (var it = 0; it < 170; it++) {
      for (var i = 1; i < pts.length; i++) for (var j = i + 1; j < pts.length; j++) {
        var a = pts[i], b = pts[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.001;
        if (d < MIN) { var push = (MIN - d) / 2, ux = dx / d, uy = dy / d; a.x -= ux * push; a.y -= uy * push; b.x += ux * push; b.y += uy * push; }
      }
      for (var k = 1; k < pts.length; k++) {
        var p = pts[k], ddx = p.x - vx0, ddy = p.y - vy0, dd = Math.hypot(ddx, ddy) || 0.001;
        if (dd < CLEAR) { p.x = vx0 + ddx / dd * CLEAR; p.y = vy0 + ddy / dd * CLEAR; }
        p.x = Math.max(padX, Math.min(W - padX, p.x)); p.y = Math.max(padTop, Math.min(H - padBot, p.y));
      }
    }
    var vx = +pts[0].x.toFixed(1), vy = +pts[0].y.toFixed(1);
    LAST_MAP = { W: W, H: H, pins: {}, fullBox: { x: 0, y: 0, w: W, h: H }, zoomBox: null };
    var zoomPts = [{ x: vx, y: vy }]; // vila + kroužek + blízké cíle (≤ 12 min) → tight box pro zoom

    var svg = '<svg class="map" viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="' + esc(L.planTitle) + '">';
    svg += '<defs><radialGradient id="vgGlow" cx="50%" cy="72%" r="60%"><stop offset="0%" stop-color="#D68A4C" stop-opacity=".1"/><stop offset="100%" stop-color="#D68A4C" stop-opacity="0"/></radialGradient></defs>';
    svg += '<rect x="0" y="0" width="' + W + '" height="' + H + '" fill="#0B100E"/><rect x="0" y="0" width="' + W + '" height="' + H + '" fill="url(#vgGlow)"/>';
    // hranice s Polskem
    var XY = function (la, lo) { return { x: X(lo), y: Y(la) }; };
    var bcp = [[50.792, 15.42], [50.780, 15.58], [50.762, 15.71], [50.750, 15.80], [50.747, 15.92]];
    var borderLatAt = function (lon) {
      if (lon <= bcp[0][1]) return bcp[0][0];
      for (var q = 0; q < bcp.length - 1; q++) { var a0 = bcp[q], a1 = bcp[q + 1]; if (lon >= a0[1] && lon <= a1[1]) return a0[0] + (a1[0] - a0[0]) * (lon - a0[1]) / (a1[1] - a0[1]); }
      return bcp[bcp.length - 1][0];
    };
    var bp = bcp.map(function (a) { return XY(a[0], a[1]); }), nB = bp.length;
    var slR = (bp[nB - 1].x - bp[nB - 2].x) ? (bp[nB - 1].y - bp[nB - 2].y) / (bp[nB - 1].x - bp[nB - 2].x) : 0;
    var slL = (bp[1].x - bp[0].x) ? (bp[1].y - bp[0].y) / (bp[1].x - bp[0].x) : 0;
    var bEnds = [{ x: 0, y: bp[0].y + slL * (0 - bp[0].x) }].concat(bp).concat([{ x: W, y: bp[nB - 1].y + slR * (W - bp[nB - 1].x) }]);
    var borderPath = mapSmooth(bEnds);
    svg += '<path d="' + borderPath + ' L ' + W + ' 0 L 0 0 Z" fill="rgba(240,235,225,.02)"/>';
    // hřeben (silueta se Sněžkou)
    var rN = 30, rTop = [], rBase = [];
    for (var ri = 0; ri <= rN; ri++) {
      var tt2 = ri / rN, lon = 15.42 + (15.92 - 15.42) * tt2, by = Y(borderLatAt(lon)), base = by + 15;
      var win = Math.max(0, Math.min(1, tt2 / 0.12, (1 - tt2) / 0.12));
      var bump = 3.5 + 2.2 * Math.sin(tt2 * Math.PI * 6) + 1.3 * Math.sin(tt2 * Math.PI * 9 + 0.6) + 4.5 * Math.exp(-Math.pow((lon - 15.74) / 0.03, 2));
      rBase.push({ x: X(lon), y: base }); rTop.push({ x: X(lon), y: base - (10 + bump) * win });
    }
    var rBot = rBase.slice().reverse().map(function (p) { return 'L' + p.x.toFixed(1) + ' ' + p.y.toFixed(1); }).join('');
    svg += '<path d="' + mapSmooth(rTop) + ' ' + rBot + ' Z" fill="rgba(240,235,225,.02)"/>';
    svg += '<path d="' + mapSmooth(rTop) + '" fill="none" stroke="#4E5A52" stroke-width="1.6"/>';
    svg += '<path d="' + borderPath + '" fill="none" stroke="#B4BAAD" stroke-width="1.4" stroke-dasharray="7 6" opacity=".5"/>';
    // řeka Úpa
    var river = [[50.690, 15.735], [50.668, 15.775], [50.645, 15.800], [50.6255, 15.8136], [50.612, 15.836], [50.598, 15.858]].map(function (a) { return XY(a[0], a[1]); });
    svg += '<path d="' + mapSmooth(river) + '" fill="none" stroke="#5B7A86" stroke-width="2.2" opacity=".7"/>';
    // popisky (tmavý „halo" přes paint-order kvůli čitelnosti nad piny/hřebenem)
    var HALO = ' paint-order="stroke" stroke="#0B100E" stroke-width="2.8" stroke-linejoin="round"';
    svg += '<text x="' + X(15.5).toFixed(1) + '" y="' + Math.max(16, Y(50.8) - 2).toFixed(1) + '" text-anchor="middle" font-family="' + F + '" font-size="10" letter-spacing="2.5" fill="#79817A"' + HALO + '>POLSKO / POLEN</text>';
    svg += '<text x="' + X(15.74).toFixed(1) + '" y="' + (Y(borderLatAt(15.74)) - 4).toFixed(1) + '" text-anchor="middle" font-family="' + F + '" font-size="10" fill="#B4BAAD"' + HALO + '>Sněžka · 1603</text>';
    svg += '<text x="' + X(15.63).toFixed(1) + '" y="' + (Y(borderLatAt(15.63)) + 14).toFixed(1) + '" text-anchor="middle" font-family="' + F + '" font-size="9" fill="#79817A" opacity=".9"' + HALO + '>Pec p. Sněžkou</text>';
    svg += '<text x="' + X(15.95).toFixed(1) + '" y="' + Y(50.58).toFixed(1) + '" text-anchor="middle" font-family="' + F + '" font-size="9" fill="#79817A" opacity=".9"' + HALO + '>Trutnov</text>';
    svg += '<text class="upariver" x="' + X(15.83).toFixed(1) + '" y="' + Y(50.605).toFixed(1) + '" font-family="' + F + '" font-size="10" font-style="italic" fill="#5B7A86"' + HALO + '>Úpa</text>';

    // kroužek „pěšky od vily“ + piny vila-zóny na spodním půlkruhu (dle designu se nefiltrují pryč, jen ztlumí)
    var R_RING = 34, ringR = 9, vz = villaZ, ringN = vz.length;
    if (ringN > 0) svg += '<circle cx="' + vx + '" cy="' + vy + '" r="' + R_RING + '" fill="none" stroke="#D68A4C" stroke-width="1.1" stroke-dasharray="3 5" opacity=".75"/>';
    // spojnice vila -> naplánované projektované piny
    if (showPlan) proj.forEach(function (o, idx) { if (!pickIds[o.t.id]) return; var p = pts[idx + 1]; svg += '<line x1="' + vx + '" y1="' + vy + '" x2="' + p.x.toFixed(1) + '" y2="' + p.y.toFixed(1) + '" stroke="#D68A4C" stroke-opacity=".4" stroke-width="1" stroke-dasharray="2 3"/>'; });

    function pin(t, x, y, r, dimmable) {
      var op = 1;
      if (!matchFilter(t, filterId)) op = 0.22; else if (S.visited[t.id]) op = 0.35;
      LAST_MAP.pins[t.id] = { x: x, y: y, accent: t.accent, r: r };
      var halo = (showPlan && pickIds[t.id]) ? '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + (r + 2.5).toFixed(1) + '" fill="none" stroke="' + t.accent + '" stroke-opacity=".35" stroke-width="2.4"/>' : '';
      // průhledný větší tap-terč (≥ ~28 px efektivně, ve zoomu „Okolí vily“ výrazně víc)
      var hit = '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + Math.max(r + 4, 14).toFixed(1) + '" fill="transparent"/>';
      return '<g class="pin" data-tid="' + t.id + '" tabindex="0" opacity="' + op + '" style="cursor:pointer">' + hit + halo
        + '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="' + r.toFixed(1) + '" fill="#0E1311" stroke="' + t.accent + '" stroke-width="1.6"/>'
        + '<text x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" dy="3.4" text-anchor="middle" font-family="' + F + '" font-size="10" font-weight="700" fill="' + t.accent + '">' + t._num + '</text></g>';
    }
    // projektované piny (vždy vykreslené; ztlumené když nevyhovují filtru)
    proj.forEach(function (o, idx) {
      var p = pts[idx + 1]; svg += pin(o.t, p.x, p.y, 10.5);
      if (o.t.zone === 'near' && (o.t.travelMin == null || o.t.travelMin <= 12)) zoomPts.push({ x: p.x, y: p.y });
    });
    // piny na kroužku
    vz.forEach(function (o, idx) {
      var ang = (ringN <= 1 ? 90 : 180 * idx / (ringN - 1)) * Math.PI / 180;
      var x = vx + R_RING * Math.cos(ang), y = vy + R_RING * Math.sin(ang);
      svg += pin(o.t, x, y, ringR); zoomPts.push({ x: x, y: y });
    });
    // tight box pro zoom „Okolí vily“ (dorovnaný na poměr stran mapy, ať nevzniknou prázdné pruhy)
    var zminx = Infinity, zminy = Infinity, zmaxx = -Infinity, zmaxy = -Infinity;
    zoomPts.forEach(function (p) { zminx = Math.min(zminx, p.x); zminy = Math.min(zminy, p.y); zmaxx = Math.max(zmaxx, p.x); zmaxy = Math.max(zmaxy, p.y); });
    var zpad = 26;
    zminx -= zpad; zmaxx += zpad; zminy -= (zpad + 16); zmaxy += zpad; // navíc místo nahoře na popisky vily
    var targetAR = W / H, zbw = zmaxx - zminx, zbh = zmaxy - zminy;
    if (zbw / zbh > targetAR) { var nh = zbw / targetAR, cyz = (zminy + zmaxy) / 2; zminy = cyz - nh / 2; zmaxy = cyz + nh / 2; }
    else { var nw = zbh * targetAR, cxz = (zminx + zmaxx) / 2; zminx = cxz - nw / 2; zmaxx = cxz + nw / 2; }
    zminx = Math.max(0, zminx); zminy = Math.max(0, zminy); zmaxx = Math.min(W, zmaxx); zmaxy = Math.min(H, zmaxy);
    LAST_MAP.zoomBox = { x: +zminx.toFixed(1), y: +zminy.toFixed(1), w: +(zmaxx - zminx).toFixed(1), h: +(zmaxy - zminy).toFixed(1) };
    // vila (domeček ember) + popisky
    svg += '<path d="M' + (vx - 5) + ' ' + (vy + 5.5) + ' L' + (vx - 5) + ' ' + (vy - 0.5) + ' L' + vx + ' ' + (vy - 5.5) + ' L' + (vx + 5) + ' ' + (vy - 0.5) + ' L' + (vx + 5) + ' ' + (vy + 5.5) + ' Z" fill="#D68A4C" stroke="#0E1311" stroke-width="1" stroke-linejoin="round"/>';
    if (ringN > 0) svg += '<text x="' + vx + '" y="' + (vy - 40).toFixed(1) + '" text-anchor="middle" font-family="' + F + '" font-size="8.5" font-weight="600" letter-spacing=".03em" fill="#c79a6a"' + HALO + '>' + esc(L.ringLabel) + '</text>';
    svg += '<text x="' + vx + '" y="' + (vy - 28).toFixed(1) + '" text-anchor="middle" font-family="' + F + '" font-size="10.5" font-weight="700" fill="#F0EBE1" paint-order="stroke" stroke="#0B100E" stroke-width="3.2" stroke-linejoin="round">Villa Rudolf</text>';
    svg += '<text x="' + vx + '" y="' + (vy - 17).toFixed(1) + '" text-anchor="middle" font-family="' + F + '" font-size="8" fill="#9aa094"' + HALO + '>Luční 519 · Svoboda n. Úpou</text>';
    // zvýrazňovací kroužek vybraného pinu (polohu nastaví updateSelRing po renderu)
    svg += '<g id="vg-selring" style="display:none;pointer-events:none"><circle fill="none"/><circle fill="none"/></g>';
    svg += '</svg>';
    return svg;
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

  function renderHeaderHTML(L) {
    var langs = ['cs', 'en', 'de', 'pl'].map(function (l) {
      return '<button class="vg-lang" data-lang="' + l + '" data-on="' + (l === S.lang) + '">' + l.toUpperCase() + '</button>';
    }).join('');
    return '<header class="vg-header"><a class="vg-brand" href="../"><span class="nm">Villa Rudolf</span><span class="bd">' + esc(L.badge) + '</span></a>'
      + '<div class="vg-langs" role="group" aria-label="Jazyk / Language">' + langs + '</div></header>';
  }

  function renderHeroHTML(L, plan, tripById) {
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
    var h = '<section class="vg-hero"><p class="vg-hello">' + hello + '</p>'
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

  function renderPublicHTML(L) {
    return '<section class="vg-pub"><span class="eyebrow">' + esc(L.pubEyebrow) + '</span>'
      + '<h1>' + esc(L.pubTitle) + '</h1><p>' + esc(L.pubLead) + '</p></section>';
  }

  function wizFlags() {
    var base = DATA.guest && DATA.guest.party ? DATA.guest.party : { adults: 2, children: [] };
    var kids = S.wiz.grp === 'kocarek' ? [3] : S.wiz.grp === 'deti' ? [8] : [];
    return partyFlags({ adults: base.adults || 2, children: kids });
  }
  function wizDays() {
    var lang = S.lang, out = [];
    if (S.mode === 'guest' && DATA.guest) {
      daysBetween(DATA.guest.arrival, DATA.guest.departure).forEach(function (d) { out.push(Object.assign({ date: d }, wxFor(DATA.forecast, CFG.VILLA, d) || {})); });
    } else {
      var vd = DATA.forecast && DATA.forecast.byLocation && DATA.forecast.byLocation[CFG.VILLA] && DATA.forecast.byLocation[CFG.VILLA].daily || {};
      var keys = Object.keys(vd).sort(); var today = todayISO(); var picked = keys.filter(function (k) { return k >= today; });
      (picked.length ? picked : keys).slice(0, 5).forEach(function (d) { out.push(Object.assign({ date: d }, vd[d])); });
    }
    return out.slice(0, 6);
  }

  function computeWizPool() {
    var days = wizDays(); if (!days.length) return { day: null, pool: [] };
    var di = Math.min(S.wiz.day, days.length - 1); var day = days[di];
    var fl = wizFlags();
    var pool = DATA.trips.filter(function (t) {
      if (S.visited[t.id]) return false;
      if (S.wiz.car === 'nocar' && !t.byFoot) return false;
      if (!durMatch(tripDur(t), S.wiz.dur)) return false;
      return eligible(t, day, fl);
    }).map(function (t) { return { t: t, sc: scoreTrip(t, day, fl) }; }).sort(function (a, b) { return b.sc - a.sc; }).map(function (x) { return x.t; });
    return { day: day, pool: pool, days: days, di: di, fl: fl };
  }

  function renderWizardHTML(L) {
    var lang = S.lang, w = computeWizPool(), days = w.days || wizDays(), di = w.di || 0;
    var dayChips = days.map(function (d, i) {
      var on = i === di;
      var tp = d.max != null ? d.max + '°' : '';
      return '<button class="vg-daychip" data-wiz="day" data-i="' + i + '" data-on="' + on + '">'
        + '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="' + (on ? '#0E1311' : wxColor(d.cat)) + '" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><use href="#' + wxIcon(d.cat) + '"></use></svg>'
        + esc(fmtDow(d.date, lang)) + ' <span class="t">' + esc(tp) + '</span></button>';
    }).join('');
    var durChips = L.fDurs.map(function (lb, i) { return '<button class="vg-pill" data-wiz="dur" data-i="' + i + '" data-on="' + (S.wiz.dur === i) + '">' + esc(lb) + '</button>'; }).join('');
    var carChips = [['car', L.fCars[0]], ['nocar', L.fCars[1]]].map(function (c) { return '<button class="vg-pill" data-wiz="car" data-i="' + c[0] + '" data-on="' + (S.wiz.car === c[0]) + '">' + esc(c[1]) + '</button>'; }).join('');
    var grpChips = [['kocarek', L.fGrps[0]], ['deti', L.fGrps[1]], ['bez', L.fGrps[2]]].map(function (g) { return '<button class="vg-pill" data-wiz="grp" data-i="' + g[0] + '" data-on="' + (S.wiz.grp === g[0]) + '">' + esc(g[1]) + '</button>'; }).join('');

    var result;
    if (w.pool && w.pool.length) {
      var best = w.pool[0];
      var why = [L.reasons[wxClass(w.day.cat)], L.fDurs[S.wiz.dur]];
      if (S.wiz.grp === 'deti' && matchFilter(best, 'deti')) why.push(L.fKids);
      if (S.wiz.grp === 'kocarek') why.push(L.fStroller);
      if (S.wiz.car === 'nocar') why.push(L.fCars[1].toLowerCase());
      var whyHTML = why.map(function (x) { return '<span>' + esc(x) + '</span>'; }).join('');
      var alts = w.pool.slice(1, 3).map(function (t) {
        return '<button class="vg-alt" data-open="' + esc(t.id) + '" style="--acc:' + t.accent + '"><span class="nm"><span class="dot">●</span> ' + esc(tt(t.name, lang)) + '</span><span class="meta">' + esc(transportLabel(t, L) + ' · ' + L.fDurs[tripDur(t)].toLowerCase()) + '</span></button>';
      }).join('');
      result = '<div class="vg-wizpick"><p class="lbl">' + esc(L.fPick) + '</p>'
        + '<button class="vg-best" data-open="' + esc(best.id) + '" style="--acc:' + best.accent + '">'
        + '<span class="vg-iconbox">' + icon(best.icon) + '</span>'
        + '<span class="bd"><h3>' + esc(tt(best.name, lang)) + '</h3><p class="sub">' + esc(tt(best.tagline, lang)) + '</p><span class="vg-why">' + whyHTML + '</span></span>'
        + tinyMini(best, 68, 48) + '</button>'
        + '<div class="vg-alts">' + alts + '</div></div>';
    } else {
      result = '<p class="vg-empty">' + esc(L.fEmpty) + '</p>';
    }

    return '<section class="vg-wiz"><div class="vg-sechead"><h2>' + esc(L.fTitle) + '</h2><span class="vg-srcnote">' + esc(L.planSrc) + '</span></div>'
      + '<p class="vg-fldlbl when">' + esc(L.fWhen) + '</p><div class="vg-daychips">' + dayChips + '</div>'
      + '<div class="vg-wizgrid"><div><p class="vg-fldlbl">' + esc(L.fDurL) + '</p><div class="vg-chiprow">' + durChips + '</div></div>'
      + '<div><p class="vg-fldlbl">' + esc(L.fCarL) + '</p><div class="vg-chiprow">' + carChips + '</div></div></div>'
      + '<div class="vg-wizrow"><p class="vg-fldlbl">' + esc(L.fGroup) + '</p><div class="vg-chiprow">' + grpChips + '</div></div>'
      + result + '</section>';
  }

  function cardWarn(t, L) {
    if (t.group && t.group.reservation) return L.warnReservation;
    if (t.crossBorderId) return L.warnDocs;
    if (t.minAge) return L.warnAge(t.minAge);
    if (t.group && t.group.capacity) return L.warnCapacity;
    return '';
  }
  function hasPhoto(t) { return false; } // fotky zatím nejsou; badge se ukáže, až budou

  function renderCatalogHTML(L, plan) {
    var lang = S.lang, filter = S.filter;
    // vybraný pin, který vypadl z filtru, zruš (panel se vrátí do prázdného stavu)
    if (S.selPin) { var _st = findTrip(S.selPin); if (!_st || !matchFilter(_st, filter)) S.selPin = null; }
    var chipLabels = FILTER_IDS.map(function (f) {
      return '<button class="vg-chip" data-filter="' + f + '" data-on="' + (filter === f) + '">' + esc(L.filters[f]) + '</button>';
    }).join('');
    var mapSvg = renderMap(DATA.trips, plan, filter);
    var zoomBtns = '<div class="vg-zoombtns">'
      + '<button class="vg-zoombtn" data-zoom="full" data-on="' + (S.mapZoom !== 'near') + '">' + esc(L.zoomFull) + '</button>'
      + '<button class="vg-zoombtn" data-zoom="near" data-on="' + (S.mapZoom === 'near') + '">' + esc(L.zoomNear) + '</button></div>';
    var mapHTML = '<div class="vg-map"><div class="mapholder" id="vg-mapholder">' + mapSvg + zoomBtns + '</div>'
      + '<div class="vg-selpanel" id="vg-selpanel">' + selPanelHTML() + '</div>'
      + '<p class="vg-mapnote">' + esc(L.mapNote) + '</p></div>';

    var zones = ['villa', 'near', 'far'];
    var groupsHTML = zones.map(function (z, zi) {
      var items = DATA.trips.filter(function (t) { return t.zone === z; });
      if (!items.length) return '';
      var shown = items.filter(function (t) { return matchFilter(t, filter); });
      if (!shown.length) return '';
      var cards = shown.map(function (t) {
        var warn = cardWarn(t, L);
        var badge = hasPhoto(t) ? '<span class="vg-photobadge">' + icon('camera') + '</span>' : '';
        return '<article class="vg-card" data-open="' + esc(t.id) + '" data-visited="' + (!!S.visited[t.id]) + '" style="--acc:' + t.accent + '">'
          + '<div class="vg-cardicon"><span class="vg-iconbox">' + icon(t.icon) + badge + '</span><span class="vg-cardnum">' + t._num + '</span></div>'
          + '<div class="vg-cardbody"><h3>' + esc(tt(t.name, lang)) + '</h3><p class="sub">' + esc(tt(t.tagline, lang)) + '</p>'
          + '<div class="vg-cardmeta">'
          + '<span>' + icon('clock') + esc(openShort(tt(t.openNote, lang))) + '</span>'
          + '<span>' + icon('ticket') + esc(priceShort(tt(t.price, lang))) + '</span>'
          + '<span class="transport">' + icon('pin') + esc(transportLabel(t, L)) + '</span></div>'
          + (warn ? '<p class="vg-cardwarn">' + icon('alert') + esc(warn) + '</p>' : '')
          + '</div>'
          + '<button class="vg-visit" data-visit="' + esc(t.id) + '" title="' + esc(L.visited) + '" aria-label="' + esc(L.visited) + '">✓</button>'
          + '</article>';
      }).join('');
      return '<div class="vg-group"><div class="vg-grouphead"><h2>' + esc(L.zones[zi]) + '</h2><span class="vg-groupmeta">' + shown.length + ' / ' + items.length + '</span></div>'
        + '<div class="vg-cards">' + cards + '</div></div>';
    }).join('');

    return '<section class="vg-catwrap"><p class="vg-chiplabel">' + esc(L.chipLabel) + '</p>'
      + '<div class="vg-chips">' + chipLabels + '</div>' + mapHTML + groupsHTML + '</section>';
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

  function renderFooterHTML(L) {
    return '<footer class="vg-footer"><p>' + esc(L.footNote) + ' · ' + esc(L.wxLive) + '</p><a href="../">← Villa Rudolf</a></footer>';
  }

  /* ===================== Sestavení celé stránky ===================== */
  function computePlan() {
    if (S.mode !== 'guest' || !DATA.guest) return [];
    var fl = partyFlags(DATA.guest.party || { adults: 2, children: [] });
    var stay = daysBetween(DATA.guest.arrival, DATA.guest.departure);
    var days = stay.map(function (d) { return Object.assign({ date: d }, wxFor(DATA.forecast, CFG.VILLA, d) || {}); });
    return buildPlan(DATA.trips, days, fl, S.visited);
  }

  function renderApp(preserveScroll) {
    var sy = preserveScroll ? window.scrollY : 0;
    var L = T[S.lang];
    document.documentElement.lang = S.lang;
    var plan = computePlan();
    var tripById = {}; DATA.trips.forEach(function (t) { tripById[t.id] = t; });
    var html = '<div class="vg-wrap">';
    html += renderHeaderHTML(L);
    if (S.mode === 'guest') { html += renderHeroHTML(L, plan, tripById); html += renderPlanHTML(L, plan); }
    else { html += renderPublicHTML(L); }
    html += renderWizardHTML(L);
    html += renderCatalogHTML(L, plan);
    html += renderFoodHTML(L);
    html += renderFooterHTML(L);
    html += '</div>';
    document.getElementById('app').innerHTML = html;
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
      + '<div class="vg-photoslot">' + icon('camera') + '<span>' + esc(L.dropPhoto) + '</span></div>'
      + '<div class="vg-videosoon">' + icon('play-c') + '<p>' + esc(L.videoSoon) + '</p></div>'
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
      + '<div class="links"><a href="https://instagram.com/villarudolf" target="_blank" rel="noopener">Instagram</a>'
      + '<a href="https://facebook.com/villarudolf" target="_blank" rel="noopener">Facebook</a><span class="hash">#villarudolf</span></div></div></div>'
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

  /* ===================== Pevný panel vybraného výletu (nahrazuje plovoucí popup) ===================== */
  function selPanelHTML() {
    var L = T[S.lang], lang = S.lang;
    if (!S.selPin) return '<p class="vg-selhint">' + icon('pin') + esc(L.selHint) + '</p>';
    var t = findTrip(S.selPin);
    if (!t) return '<p class="vg-selhint">' + icon('pin') + esc(L.selHint) + '</p>';
    return '<button class="vg-selcard" data-open="' + esc(t.id) + '" style="--acc:' + t.accent + '">'
      + '<span class="vg-selic"><span class="vg-iconbox">' + icon(t.icon) + '</span><span class="vg-selnum">' + t._num + '</span></span>'
      + '<span class="vg-selbd"><h3>' + esc(tt(t.name, lang)) + '</h3><p class="vg-seltag">' + esc(tt(t.tagline, lang)) + '</p>'
      + '<span class="vg-selmeta"><span>' + icon('pin') + esc(transportLabel(t, L)) + '</span><span class="sep">·</span><span>' + icon('ticket') + esc(priceShort(tt(t.price, lang))) + '</span></span></span>'
      + '<span class="vg-seldetail">' + esc(L.detail) + ' →</span></button>';
  }
  function renderSelPanel() {
    var panel = document.getElementById('vg-selpanel'); if (!panel) return;
    panel.innerHTML = selPanelHTML();
    var card = panel.querySelector('[data-open]');
    if (card) card.addEventListener('click', function () { openDetail(card.dataset.open); });
  }
  function selectPin(id) { S.selPin = id; renderSelPanel(); updateSelRing(id); }
  function deselectPin() { S.selPin = null; renderSelPanel(); updateSelRing(null); }
  function updateSelRing(id) {
    var g = document.getElementById('vg-selring'); if (!g) return;
    var p = id && LAST_MAP.pins[id];
    if (!p) { g.style.display = 'none'; return; }
    var cs = g.querySelectorAll('circle'), pr = p.r || 10.5;
    [[pr + 5, 2.2, 0.95], [pr + 9.5, 1, 0.35]].forEach(function (spec, i) {
      var c = cs[i]; if (!c) return;
      c.setAttribute('cx', p.x.toFixed(1)); c.setAttribute('cy', p.y.toFixed(1)); c.setAttribute('r', spec[0].toFixed(1));
      c.setAttribute('stroke', p.accent); c.setAttribute('stroke-width', spec[1]); c.setAttribute('opacity', spec[2]);
    });
    g.style.display = '';
  }

  /* ===================== Zoom mapy (dvě pevné úrovně, animovaný přechod viewBoxu) ===================== */
  function prefersReduced() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
  function applyViewBox(box, animate) {
    var s = document.querySelector('.vg-map svg.map'); if (!s) return;
    var to = [box.x, box.y, box.w, box.h];
    if (!animate || prefersReduced()) { s.setAttribute('viewBox', to.join(' ')); return; }
    var from = (s.getAttribute('viewBox') || '').split(/\s+/).map(Number);
    if (from.length !== 4 || from.some(isNaN)) { s.setAttribute('viewBox', to.join(' ')); return; }
    var t0 = null, dur = 340, done = false;
    function ease(u) { return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; }
    function step(ts) {
      if (done) return;
      if (t0 == null) t0 = ts; var u = Math.min(1, (ts - t0) / dur), e = ease(u);
      var vb = [0, 1, 2, 3].map(function (k) { return from[k] + (to[k] - from[k]) * e; });
      s.setAttribute('viewBox', vb.map(function (n) { return n.toFixed(1); }).join(' '));
      if (u < 1) requestAnimationFrame(step); else done = true;
    }
    requestAnimationFrame(step);
    // pojistka: když rAF neběží (skrytá/uspaná záložka), nastav cílový stav napevno
    setTimeout(function () { if (!done) { done = true; s.setAttribute('viewBox', to.join(' ')); } }, dur + 80);
  }
  function setMapZoom(level, animate) {
    S.mapZoom = level;
    var box = (level === 'near' && LAST_MAP.zoomBox) ? LAST_MAP.zoomBox : LAST_MAP.fullBox;
    applyViewBox(box, animate);
    var wrap = document.querySelector('.vg-zoombtns');
    if (wrap) wrap.querySelectorAll('.vg-zoombtn').forEach(function (b) { b.setAttribute('data-on', String(b.dataset.zoom === level)); });
  }
  function restoreMapView() { // po re-renderu: obnov aktuální zoom (bez animace) + zvýraznění vybraného pinu
    if (S.mapZoom === 'near' && LAST_MAP.zoomBox) applyViewBox(LAST_MAP.zoomBox, false);
    updateSelRing(S.selPin);
  }

  /* ===================== Wiring ===================== */
  function wire() {
    var app = document.getElementById('app');
    // jazyk (výběr pinu zůstává — panel se jen přepíše do nového jazyka)
    app.querySelectorAll('.vg-lang').forEach(function (b) {
      b.addEventListener('click', function () { S.lang = b.dataset.lang; renderApp(true); });
    });
    // filtr (vybraný pin se zruší jen když vypadne z filtru — řeší renderCatalogHTML)
    app.querySelectorAll('.vg-chip').forEach(function (b) {
      b.addEventListener('click', function () { S.filter = b.dataset.filter; renderApp(true); });
    });
    // wizard chipy
    app.querySelectorAll('[data-wiz]').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.dataset.wiz, v = b.dataset.i;
        if (k === 'day') S.wiz.day = parseInt(v, 10);
        else if (k === 'dur') S.wiz.dur = parseInt(v, 10);
        else if (k === 'car') S.wiz.car = v;
        else if (k === 'grp') S.wiz.grp = v;
        savePrefs(); renderApp(true);
      });
    });
    // otevření detailu (karty, plán, tip, wizard, alternativy)
    app.querySelectorAll('[data-open]').forEach(function (el) {
      el.addEventListener('click', function (e) {
        if (e.target.closest('.vg-visit')) return; // klik na ✓ neotevírá detail
        var id = el.dataset.open; if (id) openDetail(id);
      });
    });
    // „už jsme byli“ toggle
    app.querySelectorAll('.vg-visit').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.stopPropagation();
        var id = b.dataset.visit;
        if (S.visited[id]) delete S.visited[id]; else S.visited[id] = true;
        savePrefs(); renderApp(true);
      });
    });
    // piny na mapě: 1. tap = naplní pevný panel + zvýrazní pin, 2. tap téhož = detail
    var holder = document.getElementById('vg-mapholder');
    if (holder) {
      holder.querySelectorAll('.pin').forEach(function (g) {
        var handler = function (e) {
          e.preventDefault(); e.stopPropagation();
          var id = g.dataset.tid;
          if (S.selPin === id) { openDetail(id); }
          else { selectPin(id); }
        };
        g.addEventListener('click', handler);
        g.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') handler(e); });
      });
      // klik do prázdné mapy (mimo pin i zoom pilulky) = zruší výběr
      holder.addEventListener('click', function (e) { if (!e.target.closest('.pin') && !e.target.closest('.vg-zoombtns')) deselectPin(); });
      // zoom pilulky
      holder.querySelectorAll('.vg-zoombtn').forEach(function (b) {
        b.addEventListener('click', function (e) { e.stopPropagation(); setMapZoom(b.dataset.zoom, true); });
      });
      restoreMapView();
    }
  }

  // Esc zavírá detail
  window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && sheetEl) closeDetail(); });

  /* ===================== Načtení hosta (token / demo / public) ===================== */
  function rollDates(g) {
    var lp = function (n) { var x = new Date(); x.setDate(x.getDate() + n); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
    g.arrival = lp(1); g.departure = lp(5); return g;
  }
  function loadGuest() {
    if (!token) return Promise.resolve(null); // žádný token -> public
    if (token === 'demo') {
      return fetch(CFG.DEMO_GUEST_URL).then(function (r) { return r.json(); }).then(function (g) { return rollDates(g); });
    }
    return fetch(CFG.SUPABASE_URL + '/rest/v1/rpc/vr_verify_token', {
      method: 'POST', headers: { 'Content-Type': 'application/json', apikey: CFG.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + CFG.SUPABASE_ANON_KEY }, body: JSON.stringify({ p_token: token })
    }).then(function (r) { if (!r.ok) throw new Error('token'); return r.json(); }).then(function (rows) { return Array.isArray(rows) ? rows[0] : rows; })
      .catch(function () { return null; }); // neplatný token -> public
  }

  /* ===================== Start ===================== */
  loadPrefs();
  Promise.all([
    loadGuest(),
    fetch(CFG.TRIPS_URL).then(function (r) { return r.json(); }),
    fetch(CFG.FORECAST_URL).then(function (r) { return r.json(); }).catch(function () { return null; })
  ]).then(function (res) {
    var guest = res[0], tripsRaw = res[1], forecast = res[2];
    DATA.trips = (tripsRaw.trips || []).map(function (t, i) { t._num = i + 1; return t; });
    DATA.food = tripsRaw.food || [];
    DATA.forecast = forecast;
    if (guest) {
      DATA.guest = guest; S.mode = 'guest';
      S.lang = (guest.lang && T[guest.lang]) ? guest.lang : (T[S.lang] ? S.lang : 'cs');
    } else {
      S.mode = 'public'; S.lang = qs.get('lang') && T[qs.get('lang')] ? qs.get('lang') : 'cs';
    }
    renderApp(false);
  }).catch(function (e) {
    document.getElementById('app').innerHTML = '<div class="vg-loading">Průvodce se nepodařilo načíst. / Der Guide konnte nicht geladen werden.</div>';
    if (window.console) console.error(e);
  });
})();
