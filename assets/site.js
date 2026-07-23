/* Villa Rudolf — homepage behaviour. Vanilla JS, no framework.
   Re-implements the Claude Design handoff prototype (.dc runtime NOT ported).
   T translation object is ported verbatim from the prototype; the Stripe note
   is replaced (v1 has no Stripe) and a localized placeholder label added. */
'use strict';

/* ============================ CENÍK ============================ */
/* JEDINÉ místo, kde se ceny upravují.
   Hodnoty převzaty z vlastního inzerátu majitele na e-chalupy.cz (objekt 18852)
   a ověřeny proti němu 21. 7. 2026:
     • letní sezóna 1. 5. – 31. 10.: 12 900 Kč/noc, víkend (2 noci) 25 800 Kč
     • zimní sezóna 15. 12. – 31. 3.: 12 900 Kč/noc, víkend (2 noci) 25 800 Kč
     • mimo sezónu (duben, listopad, 1.–14. 12.): 11 900 Kč/noc,
       víkend (2 noci) 22 800 Kč — víkend mimo sezónu je zvýhodněný
     • minimální pobyt: 2 noci ve všech obdobích
     • úklid a prádlo: 3 500 Kč za pobyt
     • městský poplatek: 25 Kč za dospělou osobu a noc (děti neplatí)
     • pes / domácí mazlíček: 500 Kč za pobyt
     • vratná kauce: 5 000 Kč (úklid se z ní odečítá)
     • záloha po potvrzení termínu: 30 % z celkové ceny
     • Vánoce a Silvestr: individuální cena (2026: 94 900 / 99 900 Kč za týden,
       oba termíny už obsazené) — v ceníku jen jako „poptejte se"
   Sezóny se zapisují jako MM-DD. 'zimni' přechází přes Nový rok (12-15 → 03-31).
   Poslední sezóna bez from/to ('mimo') je výchozí pro všechny ostatní dny v roce. */
const VR_PRICING = {
  seasons: [
    { name: 'letni', from: '05-01', to: '10-31', nightly: 12900, minNights: 2, weekend2: 25800 },
    { name: 'zimni', from: '12-15', to: '03-31', nightly: 12900, minNights: 2, weekend2: 25800 },
    { name: 'mimo', nightly: 11900, minNights: 2, weekend2: 22800 },
  ],
  cleaning: 3500,            // úklid a prádlo za pobyt (Kč)
  cityTaxAdultNight: 25,     // městský poplatek na dospělého a noc (Kč)
  petPerStay: 500,           // pes / domácí mazlíček za pobyt (Kč)
  bond: 5000,                // vratná kauce (Kč) — jen informace, nepočítá se do ceny
  depositPct: 30,            // záloha v % z celkové ceny (splatná až po potvrzení)
  maxGuests: 22,             // maximální počet hostů (dospělí + děti)
  maxPets: 5,                // horní mez číselníku mazlíčků ve formuláři
};

/* Které léto právě prodáváme a které je (téměř) plné.
   VĚDOMĚ ručně — ať web nikdy sám netvrdí něco, co neplatí.
   Ověřeno 21. 7. 2026 proti kalendáři obsazenosti (history.json):
   léto 2026 bylo obsazené ze 71 % (hlavní sezóna VI–IX ze 77 %), volné zbývaly
   jen jednotlivé kratší termíny → formulace „téměř obsazeno", NE „plně obsazeno".
   Poznámka se sama přestane zobrazovat po datu noteUntil. */
const VR_SEASON_NOTE = { summerYear: 2027, almostFullYear: 2026, noteUntil: '2026-11-01' };

/* Orientační přepočet měn pro cizojazyčné verze webu. Ceny se vždy platí v CZK;
   € / zł se ukazují jen jako přibližný odhad. Pevné kurzy — upravit zde. */
const VR_FX = { EUR: 25, PLN: 5.9 };

/* ============================ Supabase (žádost o pobyt → RPC vr_request) ============================ */
/* Veřejný anon klíč (chráněný RLS) — stejný jako v průvodci / guest portálu / check-inu.
   Zápis jde JEN přes SECURITY DEFINER funkci public.vr_request; přímý select je RLS zakázán. */
const VR_SUPABASE = {
  URL: 'https://fpknbrzbqpalguajskut.supabase.co',
  ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwa25icnpicXBhbGd1YWpza3V0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDEyMTAsImV4cCI6MjA5Mjg3NzIxMH0.goat1c7Y1YnpTq7_XyMD3LROElkVI6E27f0B3EG8btA',
};

/* ============================ RECENZE + HODNOCENÍ — jediný editovatelný blok ============================ */
/* VŠECHNA data hodnocení a recenzí na webu se upravují ZDE. Po každé kontrole ratingů
   aktualizuj `checkedAt` (ISO datum) — zobrazí se jako „ověřeno DD. M. YYYY".
   Recenze jsou SKUTEČNÉ, veřejně ověřené citace (Airbnb / Booking.com / Google Maps).
   quote = originál v jazyce recenze; quote_cs = český překlad (null = originál je česky).
   NIKDY neměň smysl citace; zkrácení je vyznačeno „…". */
const VR_REVIEWS = {
  checkedAt: '2026-07-20',
  platforms: [
    { key: 'google',  name: 'Google',      rating: 5.0, outOf: 5,  count: 20, url: 'https://www.google.com/maps/place/Villa+Rudolf/@50.6254426,15.8135792,17z/data=!3m1!4b1!4m6!3m5!1s0x470eed010c87db09:0xb1476ac6b6a154e!8m2!3d50.6254426!4d15.8135792!16s%2Fg%2F11l_3ztv_k' },
    { key: 'airbnb',  name: 'Airbnb',      rating: 5.0, outOf: 5,  count: 7,  url: 'https://www.airbnb.com/rooms/1122389326464885565' },
    { key: 'booking', name: 'Booking.com', rating: 9.6, outOf: 10, count: 17, url: 'https://www.booking.com/hotel/cz/villa-with-a-covered-pool-park-and-playground.html' },
  ],
  items: [
    { author: 'Ryan', platform: 'airbnb', lang: 'en',
      quote: "I stayed at Pavel's place with a huge group of friends and it was the perfect accommodation! … We fit a ton of people comfortably and never felt crowded … everything was spotless.",
      quote_cs: "Bydleli jsme u Pavla s obrovskou partou přátel a bylo to dokonalé ubytování! … Pohodlně jsme se vešli všichni a nikdy jsme se necítili nahusto … všechno bylo bez poskvrnky." },
    { author: 'Torsten', platform: 'booking', lang: 'de', pool: true,
      quote: "Rundum sehr gut. Der Pool, die Sauna, die Küche, die Zimmeraufteilung – super. Die Betten waren, wie von allen neun Personen bestätigt, sehr gut. Pavel war immer erreichbar…",
      quote_cs: "Vynikající celkově. Bazén, sauna, kuchyň i uspořádání pokoje byly skvělé. Jak potvrdilo všech devět z nás, postele byly velmi pohodlné. Pavel byl vždy k dispozici…" },
    { author: 'Marta', platform: 'booking', lang: 'pl',
      quote: "Duża, wyposażona kuchnia oraz czyste przestrzenie idealnie dla dużej grupy. Dodatkowe atrakcje – sauna, stół bilardowy, wieszak na odzież narciarską – strzał w 10 na zimowe wyjazdy!",
      quote_cs: "Velká, plně vybavená kuchyň a čisté prostory jsou ideální pro velkou skupinu. Sauna, kulečníkový stůl a věšák na lyžařské oblečení jsou perfektním doplňkem zimního pobytu!" },
    { author: 'Evžen', platform: 'booking', lang: 'cs',
      quote: "Moc se nám tu líbilo. Ubytování bylo krásné, čisté a velmi dobře vybavené. … Majitel byl naprosto úžasný - velmi milý, ochotný a ve všem nám pomohl. Komunikace byla perfektní.",
      quote_cs: null },
    { author: 'Martina', platform: 'google', lang: 'cs', pool: true,
      quote: "Perfektní servis, skvělé zázemí, ochotný majitel, spousta výletů pro každé počasí a všechny věkové kategorie, bazén se dá využít i za deště - super výhoda!",
      quote_cs: null },
    { author: 'Grzegorz', platform: 'google', lang: 'pl',
      quote: null,
      quote_cs: "Velmi pěkné místo, prostorné pokoje, čisté a dobře udržované, velká kuchyň, plně vybavená, ideální pro větší skupinu. Bylo nás 18 lidí a bylo to velmi relaxační. … Navíc je tam sauna." },
  ],
};
/* ============================ Kontakt (patička) ============================ */
/* Telefon hostitele. Zobrazí se v patičce jako klikací tel: odkaz jen tehdy,
   když je vyplněný — když je prázdný, řádek s telefonem se vůbec nevykreslí. */
const VR_CONTACT = {
  email: 'rezervace@villarudolf.com',
  phone: '+420 775 220 785', // doplní majitel — prázdné '' = řádek skrytý
};

/* POČTY VÝLETŮ V OKRUZÍCH (sekce Lokalita).
   Jediný zdroj pravdy je katalog průvodce — trips.json, pole `zone`:
     villa = pěšky od brány · near = do 30 minut autem · far = na celý den.
   Načítá se za běhu (a kešuje na 6 h); hodnoty níže jsou POUZE fallback,
   když se fetch nepovede nebo běží web bez sítě. */
/* Katalog plánovače = trips.json + lokální doplňky z assets/planner.js
   (dnes jeden: RK masáže, zóna villa). Aby počty na homepage souhlasily
   s tím, co plánovač reálně ukáže, přičítáme je i tady. */
const VR_LOCAL_EXTRA = { foot: 1, car: 0, day: 0 };
/* Fallback = LETNÍ stav katalogu k 7/2026 (38 cílů + 1 lokální doplněk).
   Používá se jen tehdy, když se katalog nepodaří stáhnout; jinak se počty
   dopočítají pro aktuální sezónu z živých dat (viz loadTripCounts). */
const VR_TRIP_COUNTS = { foot: 8, car: 27, day: 4, total: 39 };
const TRIPS_URL = 'https://pavelkubiznak.github.io/villa-rudolf-portal/data/trips.json';
const TRIPS_CACHE_KEY = 'vr_trips_v3';   // v3 = keš slim katalogu, ne hotových počtů
const TRIPS_TTL = 21600000; // 6 h

/* ============================ FAKTA O DOMĚ — JEDINÝ ZDROJ PRAVDY ============================
   Každé číslo o domě žije JEN tady. Do textů se dosazuje zástupným znakem
   {klic} — stejným mechanismem, jakým se do textů dostávají počty výletů ({n}).
   Když se něco změní (přibude lůžko, ubude koupelna), opravuje se JEN tahle
   konstanta a projeví se to všude: v <title>, v meta popisku, v rychlých
   faktech, v sekci „Za bránou", v rozpisu lůžek i v bloku před formulářem.
   NIKDY nepiš číslo natvrdo do překladu — ve čtyřech jazycích se to rozejde.

   KDE SE Z NÍ DOSAZUJE (kontrolní list):
     meta.title, meta.desc … <title> a popisek ve výsledcích vyhledávání
     hero.h1 …………………………… hlavní nadpis
     facts.* ……………………………… rychlá fakta pod heroem (#vr-facts v index.html)
     statement.stats ……………… číselný panel sekce „Za bránou už jste jen vy"
     bedrooms.note ………………… podnadpis sekce Ložnice a lůžka
     skupina.desc ………………… odstavec „Vaše parta, ať je jakkoli velká"
     prebook.facts ………………… blok „Co potřebujete vědět před rezervací"
   ========================================================================== */
const VR_FACTS = {
  loznice: 7,             // ložnic
  koupelny: 5,            // koupelen a WC
  luzka: 22,              // lůžek celkem
  luzkaDetail: '19 + 3',  // z toho 19 pevných + 3 přistýlky (slovo doplní překlad)
  plocha: 257,            // m² obytné plochy
  pozemek: 4500,          // m² oploceného pozemku (potvrzeno majitelem i inzerátem)
  minHostu: 6,            // dolní hranice skupiny, na kterou dům dává smysl
  maxHostu: 22,           // maximum hostů (= VR_PRICING.maxGuests)
};
/* Oddělovač tisíců podle jazyka — 4 500 / 4,500 / 4.500. */
const VR_NUM_SEP = { cs: '\u00a0', en: ',', de: '.', pl: '\u00a0' };
function factValue(key) {
  const v = VR_FACTS[key];
  if (v == null) return '';
  if (typeof v !== 'number') return String(v);
  if (v < 1000) return String(v);
  const sep = VR_NUM_SEP[state.lang] || VR_NUM_SEP.cs;
  return String(v).replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}
/* Dosadí {klic} z VR_FACTS do libovolného řetězce. Neznámé zástupné znaky
   (např. {n} u počtů výletů) nechává být — o ty se stará applyTripCounts(). */
function fillFacts(str) {
  if (typeof str !== 'string' || str.indexOf('{') < 0) return str;
  return str.replace(/\{([a-zA-Z]+)\}/g, (m, k) => (Object.prototype.hasOwnProperty.call(VR_FACTS, k) ? factValue(k) : m));
}

/* ============================ Translations (verbatim from prototype) ============================ */
const T = {
  cs: {
    photoSoon: 'Fotku doplníme',
    meta: {
      /* Sezónně NEUTRÁLNÍ a faktově husté — musí fungovat v lednu i v červenci
         a nesmí začínat bazénem (v zimě popisuje zavřené zařízení). Čísla se
         dosazují z VR_FACTS. Titulek do ~60 znaků, popisek do ~155. */
      title: 'Villa Rudolf – celý dům pro {minHostu}–{maxHostu} osob, {loznice} ložnic | Krkonoše',
      desc: 'Celý dům i pozemek jen pro vaši skupinu {minHostu}–{maxHostu} osob ve Svobodě nad Úpou. {loznice} ložnic, {koupelny} koupelen, {pozemek} m² pozemku, sauna, lyžárna. Lyžování i bazén sezónně.',
      locale: 'cs_CZ',
    },
    nav: { dum: 'Dům', loznice: 'Interiér', lyzovani: 'Lyžování', vybaveni: 'Vybavení', galerie: 'Galerie', ohniste: 'Ohniště', lokalita: 'Lokalita', vylety: 'Výlety', info: 'Praktické info', cta: 'Rezervovat termín' },
    hero: {
      eyebrow: 'Celý dům jen pro vaši skupinu · Krkonoše',
      eyebrowWinter: 'Lyžování za rohem · Krkonoše',
      h1: 'Soukromá vila v Krkonoších pro {minHostu}–{maxHostu} hostů',
      sub: 'Celé to místo — dům i rozlehlý pozemek — je <em>jen vaše</em>.',
      subWinter: 'Lyžování hned za rohem — <em>skibus u domu</em>, Černá hora 4 km.',
      ctaSec: 'Prohlédnout dům', badge: 'Volné termíny 2026', video: 'Přehrát video',
      summer: 'Léto', winter: 'Zima',
      nightLine: 'Setmělo se. Ohniště, gabiony i bazén se rozsvítily samy — večer tady teprve začíná.',
    },
    /* Rychlá fakta pod heroem (#vr-facts v index.html). Ověřeno z platform
       listingu Villa Rudolf — čísla se dosazují z VR_FACTS, needitovat je tady.
       wellnessSummer / wellnessWinter je SEZÓNNĚ DĚLENÝ SLOT: bazén přes zimu
       není vyhřívaný a nesmí vzbudit dojem, že bude v provozu. */
    facts: {
      loznice:        { k: '{loznice}', v: 'ložnic' },
      koupelny:       { k: '{koupelny}', v: 'koupelen a WC' },
      luzka:          { k: '{luzka}', v: 'lůžek — {luzkaDetail} přistýlky' },
      plocha:         { k: '{plocha} m²', v: 'obytná plocha' },
      wellnessSummer: { k: 'Bazén + sauna', v: 'krytý vyhřívaný bazén a privátní sauna' },
      wellnessWinter: { k: 'Sauna + lyžárna', v: 'privátní sauna, lyžárna přímo v domě' },
      parking:        { k: 'Vlastní parkoviště', v: 'na pozemku hned u vchodu, za vlastní bránou' },
    },
    /* `avg` a `allReviews` ZANIKLY (7/2026): průměr napříč škálami majitel
       zrušil a tlačítko na #recenze nemá kam vést — chipy jsou samy odkazem. */
    ratings: { eyebrow: 'Hodnocení hostů', reviewsWord: 'recenzí', verified: 'ověřeno' },
    direct: {
      badge: '<b>Přímá rezervace = nejlepší cena.</b> O 5 % výhodněji než na platformách. Osobní přístup a férové storno podmínky.',
      book: '<b>Přímá rezervace = nejlepší cena.</b> O 5 % výhodněji než na platformách. Osobní přístup a férové storno podmínky.',
      sidebar: 'Přímá rezervace — o 5 % výhodněji než na platformách.',
    },
    statement: {
      eyebrow: 'Celý areál jen pro vás',
      title: 'Za bránou už jste jen vy.',
      lead: 'Nerezervujete si pokoje v domě, kde bydlí ještě někdo další. Berete si celý pozemek — dům, oplocený park, saunu, altán i ohniště. <span class="vr-sm-hide">Žádná recepce, žádní cizí lidé u snídaně, žádné čekání, až se uvolní sauna.</span>',
      /* Čísla z VR_FACTS. Lůžka ani ložnice se tu ZÁMĚRNĚ neopakují — jsou
         v rychlých faktech kousek nad tím; tenhle panel je o výlučnosti. */
      stats: [
        { num: '{pozemek} m²', label: 'oploceného parku jen pro vaši skupinu' },
        { num: '1 stůl', label: 'dost velký na to, aby si u něj sedla celá parta najednou' },
        { num: '1 skupina', label: 'v areálu je vždycky jen jedna, nikdy dvě najednou' },
        { num: '0', label: 'prostor sdílených s cizími lidmi' },
      ],
    },
    band: { eyebrow: 'Jeden večer tady' },
    /* ===================== VYBAVENÍ — JEDEN SEZNAM, DVĚ ŘAZENÍ =====================
       Oddělený blok „A k tomu celoročně" je zrušen; položky mají jediné znění
       a pořadí jim dává CSS `order` podle sezóny (viz .vr-amen v site.css):
         zima: lyžárna → sauna → kuchyně → ohniště → altán → kulečník → apartmá
         léto: bazén → altán → hřiště → sauna → kuchyně → ohniště → kulečník → apartmá
       Texty jsou CELOROČNÍ (vrstva A): žádné sezónní slovo. Sezónnost je
       vlastností DAT (data-season-only v HTML), ne věty v textu — právě proto
       už nemůže vzniknout další „bazén v mrazu". */
    amenities: {
      eyebrow: 'Vybavení', title: 'Komfort, který drží skupinu pohromadě', drop: 'Přetáhněte sem fotku',
      items: {
        pool:     { tag: 'Wellness', name: 'Zastřešený vyhřívaný bazén', desc: 'Bazén pod střechou s ohřevem vody — v letní sezóně v provozu za každého počasí, i když venku prší. Po koupeli rovnou do sauny.' },
        skiroom:  { tag: 'Lyžování', name: 'Lyžárna', desc: 'Samostatná místnost jen na lyže a boty: stojany na lyže a snowboardy, držáky na boty a omyvatelná podlaha. Mokré vybavení zůstane dole a nemusí do pokojů — v zimě je to nejčastější otázka, kterou dostáváme.' },
        sauna:    { tag: 'Wellness', name: 'Privátní finská sauna', desc: 'Finská sauna jen pro vaši skupinu, s předsálím a sprchou. Žádné sdílení, žádné časové sloty.' },
        kitchen:  { tag: 'Společně', name: 'Kuchyně a stůl pro celou skupinu', desc: 'Plně vybavená kuchyně a velký dřevěný stůl, u kterého se sejdete všichni najednou.' },
        firepit:  { tag: 'Venkovní život', name: 'Ohniště s gabionovou stěnou', desc: 'Nově dokončené otevřené ohniště pojme celou skupinu. Po setmění se samo nasvítí — teplo pod širým nebem.' },
        altan:    { tag: 'Venkovní život', name: 'Velký altán s grilem', desc: 'Kryté posezení s grilovacím pultem a stolem, kam se vejde celá skupina najednou. Střecha drží, ať prší, nebo sněží.' },
        hriste:   { tag: 'Pro rodiny', name: 'Dětské hřiště', desc: 'Prolézačky, malá lezecká a lanová stěna. Děti mají svůj prostor na dohled od altánu.' },
        billiard: { tag: 'Uvnitř', name: 'Kulečník', desc: 'Kulečníkový stůl v apartmá Suite — na líné odpoledne i na turnaj po večeři.' },
        lounge:   { tag: 'Uvnitř', name: 'Obývací část apartmá', desc: 'Dlouhá sedací souprava pod trámy a velký stůl — vlastní společenský prostor apartmá Suite.' },
      },
    },
    /* Sekce se od 7/2026 jmenuje podle toho, co v ní OPRAVDU je. Majitel:
       „Nám to vlastně přerostlo ve fotky veškerých interiérů, a když tam máš
       kuchyni a to, tak už to úplně nesedí." Karusel dnes veze pokoje,
       koupelny, kuchyň, podkroví, saunu i wellness — název „Ložnice a lůžka"
       sliboval míň, než sekce ukazuje. Rozpis lůžek pod karuselem si vzal
       podnadpis „Kde se u nás vyspíte" (interior.rosterTitle) — je to
       rozhodovací tabulka pro organizátora skupiny a musí být k nalezení. */
    bedrooms: {
      eyebrow: 'Interiéry',
      title: 'Dům zevnitř',
      note: '{loznice} ložnic, {koupelny} koupelen, velká kuchyň, sauna i wellness — projděte si celý dům na fotkách.',
      noBunk: 'Žádné patrové postele — klidnější spaní i pro rodiče s malými dětmi.',
      rooms: [
        { name: 'Apartmá Suite', cap: 'až 10 hostů', beds: '3 ložnice s manželskými postelemi, 2 samostatná lůžka a 1 lůžko s výsuvným druhým lůžkem · vlastní kuchyňka a kulečník · koupelna' },
        { name: 'Pokoj 1', cap: '2 hosté', beds: 'Manželská postel · koupelna' },
        { name: 'Pokoj 2', cap: 'až 4 hosté', beds: 'Manželská postel a 2 samostatná lůžka (jedno plnohodnotná přistýlka) · koupelna' },
        { name: 'Pokoj 3', cap: 'až 4 hosté', beds: 'Manželská postel a 2 samostatná lůžka (jedno plnohodnotná přistýlka) · koupelna' },
        { name: 'Pokoj 4', cap: '2 hosté', beds: 'Manželská postel · koupelna' },
      ],
    },
    interior: {
      hint: 'Táhněte myší nebo prstem · klepnutím zvětšíte',
      open360: 'Otevřít ve 360° prohlídce domu',
      rosterTitle: 'Kde se u nás vyspíte',
      rosterNote: '{luzka} lůžek — {luzkaDetail} přistýlky. Rozpis, podle kterého rozdělíte partu do pokojů.',
      items: { kitchen: 'Kuchyně a jídelna', suite: 'Apartmá Suite', room1: 'Pokoj 1', room2: 'Pokoj 2', room3: 'Pokoj 3', room4: 'Pokoj 4', sauna: 'Finská sauna', wellness: 'Wellness a sprcha', bath: 'Sprcha u sauny', bath2: 'Koupelna – Pokoj 2', bath3: 'Koupelna – Pokoj 3', bath4: 'Koupelna – Pokoj 4' },
    },
    ohniste: {
      eyebrow: 'Nová dominanta', caption: 'Detail ohniště a gabionové stěny',
      title: 'Ohniště s gabionovou stěnou, které večer ožívá',
      body: 'Nově dokončené otevřené ohniště pojme celou skupinu. Masivní gabionová stěna s ním tvoří jeden celek a po setmění se automaticky nasvítí — světla se sama rozsvěcují i zhasínají. Centrum večerů pod širým nebem.',
    },
    skupina: {
      eyebrow: 'Vaše parta, ať je jakkoli velká',
      big: 'Šest kamarádů na motorkách, nebo sraz dvaceti dvou. Místo si pokaždé vezme celou partu.',
      desc: 'Nestavíme to na čísle. Pohodlně tu přespí až {maxHostu} lidí, ale stejně dobře sem sednou rodina, parta přátel i menší skupina — celý dům a celý pozemek je vždycky jen váš.',
    },
    /* ===================== JEN ZIMA — „Lyžování odsud" (#lyzovani) =====================
       Zdroj: strukturální rešerše okolních areálů, ověřeno 7/2026.
       DO TÉTO VĚTVE NIKDY NEPIŠ: ceny skipasů, jízdní řády, provozní a otevírací
       doby, počty aktuálně otevřených vleků, „skibus zdarma" jako tvrdé tvrzení,
       „zelené sjezdovky" (všechny tři ve Svobodě jsou MODRÉ), konkrétní dny
       a časy večerního lyžování ani počet areálů na skipas jako tvrdé číslo —
       provozovatel si v těchto údajích na vlastním webu protiřečí a zastaralý
       údaj je horší než žádný (host podle něj plánuje den).
       Čísla u vleků a sjezdovek jsou INSTALOVANÝ stav, ne garance provozu. */
    ski: {
      eyebrow: 'Lyžování · SkiResort Černá hora – Pec',
      title: 'Lyžování odsud',
      note: 'Uvádíme jen to, co se nemění mezi sezónami. Ceny, jízdní řády a provozní doby najdete u provozovatele.',
      local: {
        tag: '1,9 km od domu',
        name: 'Lyžařský areál přímo ve Svobodě nad Úpou',
        desc: 'Nejbližší sjezdovky nejsou „někde v horách" — jsou ve stejném městě jako dům. Autem tam jste za pět minut, pěšky do půl hodiny. Je to nejmenší areál resortu a přesně proto se hodí na první lyžování dětí a začátečníků, zatímco zbytek party vyrazí na velké svahy.',
        specs: [
          'modré (lehké) sjezdovky, každá zhruba 350 m',
          'vleky — lanovka tu není',
          'autem od domu — 1,9 km po silnici',
        ],
        school: 'V areálu je lyžařská škola, půjčovna vybavení i dětský pojízdný koberec.',
        snow: 'Poctivě: je to nejníže položený areál resortu (zhruba 530–600 m), takže jeho provoz stojí a padá se sněhem a zasněžováním a sezóna tu bývá kratší než výš v horách. Než na něj postavíte celý pobyt, ověřte si, že jede.',
      },
      resorts: {
        title: 'Jeden skipas, několik areálů',
        lead: 'Dům leží v oblasti SkiResortu ČERNÁ HORA – PEC, kde podle provozovatele platí jeden skipas napříč několika areály. Dojezdy autem ze Svobody nad Úpou:',
      },
      rows: {
        cernaHora: 'největší areál resortu',
        velkaUpa: 'dětský park u dolní stanice lanovky',
        cernyDul: 'horský přejezd přes sedlo — klikatá silnice, počítejte s rezervou',
        pec: 'druhý největší areál, sjezdovky všech obtížností',
        malaUpa: 'provozuje jiná společnost, platnost skipasu si ověřte',
      },
      notes: {
        connect: { t: 'Areály na sebe nenavazují sjezdovkami',
          b: 'Nečekejte propojený areál. Jediné lyžařské propojení je SkiTour z Černé hory do Pece — funguje jen jedním směrem a na dvou ze čtyř úseků vás táhne rolba; zpátky se jede skibusem. Mezi ostatními areály se přejíždí autem nebo skibusem, spojuje je společný skipas.' },
        skibus: { t: 'Dá se lyžovat i bez auta',
          b: 'Páteřní skibus SkiResortu zastavuje přímo ve Svobodě nad Úpou — mimo jiné Maršov II, Maršov I, Sokolovna, autobusové nádraží a hotel PROM. Rozsah linek i podmínky přepravy se mezi sezónami mění, ověřte si je u provozovatele.' },
        evening: { t: 'Večerní lyžování',
          b: 'V sezóně se vypisuje na uměle osvětlených sjezdovkách; nejdelší z nich je Protěž na Černé hoře — podle provozovatele 1,6 km. Konkrétní dny a časy se mění, aktuální rozpis mívá provozovatel.' },
      },
      plan: {
        title: 'Když se nelyžuje',
        lead: 'Ve větší partě se vždycky někdo lyžovat nechystá — a ze sedmi nocí bývají lyžařské čtyři až pět. Tohle je zbytek programu.',
        tiles: [
          { n: 'Aquacentrum Janské Lázně', m: 'krytý bazén, pěšky od domu' },
          { n: 'Běžecké stopy', m: 'nástupy u Černé hory, ≈ 4 km autem' },
          { n: 'Sklárna Harrachov', m: 'prohlídka v teple, autem ≈ 50 min' },
          { n: 'Pevnost Stachelberg', m: 'podzemí opevnění u Trutnova' },
          { n: 'Aquapark Karpacz (PL)', m: 'velký krytý aquapark, autem ≈ 45 min' },
        ],
      },
      cta: 'Zimní cíle v plánovači',
      ctaSub: 'Mapa, filtry a tip na konkrétní den — bez registrace.',
    },
    lokalita: {
      eyebrow: 'Lokalita · Svoboda nad Úpou',
      title: 'V horách, ne na konci světa.',
      lead: 'Stojíme ve Svobodě nad Úpou, 150 metrů od centra — obchod, restaurace, vlak i autobus zvládnete pěšky. A Sněžka je odsud dvacet minut autem.',
      leadWinter: 'Skibus do SkiResortu Černá hora–Pec staví 200 metrů od brány — k vlekům se dostanete bez auta a bez hledání parkování. Auto pak může stát celý týden na jednom místě přímo na pozemku. Aktuální tarif a jízdní řád najdete u provozovatele.',
      /* PÁS ČÍSEL „od dveří" MÁ DVĚ SADY. Majitel o té původní v LÉTĚ:
         „150 metrů do centra Svobody, 200 metrů k zastávce skibusu — to je
         jim v létě úplně jedno. Praha přibližně dvě hodiny, Vratislav,
         Drážďany tři hodiny — taky. Sjezdovka 4 kilometry, to je na letní
         stránce úplně zbytečný."
         V létě proto zůstalo jen centrum (pěší dostupnost platí celoročně)
         a přibyla letní čísla, která už web publikuje jinde — na mapě
         a v okruzích výletů: Sněžka, Janské Lázně, Trutnov. Nová tvrzení
         se tu NEVYMÝŠLEJÍ. Dojezdy z metropolí nezmizely úplně, smrskly se
         na jediný nenápadný řádek arriveCarSummer v bloku „Než dorazíte".
         ZIMNÍ sada (doorstep níž) se NEMĚNÍ — tam je skibus to hlavní. */
      doorstepSummer: [
        { num: '150 m', label: 'do centra Svobody — obchod, restaurace i nádraží pěšky' },
        { num: '20 min', label: 'autem pod Sněžku — nahoru lanovkou, nebo po svých' },
        { num: '4 km', label: 'Janské Lázně — Stezka korunami stromů a lanovka na Černou horu' },
        { num: '11 km', label: 'Trutnov — koupaliště, lezecká stěna a velké nákupy' },
      ],
      /* Zimní sada — skibus a sjezdovky jsou tu to hlavní. */
      doorstep: [
        { num: '150 m', label: 'do centra Svobody — asi dvě minuty pěšky' },
        { num: '200 m', label: 'k zastávce skibusu — necelé tři minuty pěšky' },
        { num: '2 h', label: 'přibližně z Prahy i z Vratislavi, z Drážďan tři hodiny' },
        { num: '4 km', label: 'na sjezdovky Černá hora — skibus staví u domu' },
      ],
      mapTitle: ['{n} ověřený výlet ve třech okruzích', '{n} ověřené výlety ve třech okruzích', '{n} ověřených výletů ve třech okruzích'],
      mapNote: 'Vzdálenosti na mapě odpovídají skutečnosti, terén je kreslený. Kroužek kolem vily má poloměr tři kilometry vzdušnou čarou.',
      legend: '◆ Villa Rudolf · ○ kam dojdete pěšky · ┄ hranice s Polskem · časy a vzdálenosti jsou po silnici',
      mapAlt: 'Kreslená mapa okolí: Villa Rudolf ve Svobodě nad Úpou, Sněžka, Janské Lázně, Pec pod Sněžkou, Trutnov a hranice s Polskem.',
      rings: [
        { name: 'Pěšky od brány', count: ['{n} cíl', '{n} cíle', '{n} cílů'],
          body: 'Janské Lázně a Stezka korunami stromů, krytý bazén Aquacentrum, lamatreking na rodinné farmě, farmapark Muchomůrka, pohádkové Do Krakonošova, adventure minigolf i střelnice. Na žádný z nich nepotřebujete auto.',
          link: 'Ukázat v plánovači →' },
        { name: 'Do 30 minut autem', count: ['{n} cíl', '{n} cíle', '{n} cílů'],
          body: 'Sněžka lanovkou nebo pěšky, Černá hora kabinkou, Obří důl i s kočárkem, bobová dráha v Peci, rozhledny, bukový prales Rýchory, koupaliště i lezecká stěna v Trutnově.',
          link: 'Ukázat v plánovači →' },
        { name: 'Na celý den', count: ['{n} cíl', '{n} cíle', '{n} cílů'],
          body: 'Adršpašské skály, Safari Park Dvůr Králové, sklárna Harrachov s Mumlavskými vodopády a aquapark Tropikana v polském Karpaczi — na ten si vezměte doklady i dětem.',
          link: 'Ukázat v plánovači →' },
      ],
      arrive: [
        { id: 'praha', k: 'Praha', v: 'přibližně 2 hodiny autem' },
        { id: 'wroclaw', k: 'Vratislav (PL)', v: 'přibližně 2 hodiny autem' },
        { id: 'dresden', k: 'Drážďany', v: 'přibližně 3 hodiny autem' },
        { id: 'train', k: 'Vlakem', v: 'nádraží Svoboda nad Úpou, k domu pěšky' },
        { id: 'bus', k: 'Autobusem', v: 'zastávka ve městě, k domu pěšky' },
        { id: 'skibus', k: 'Skibus', v: 'zastávka 200 m od brány; tarif ověřte u provozovatele' },
        { id: 'parking', k: 'Parkování', v: 'přímo na pozemku, za bránou' },
      ],
      /* V zimě se vlak a autobus slévají do JEDNOHO řádku — nemažeme je
         (vždycky někdo dojíždí zvlášť), jen jim bereme vizuální váhu. */
      arriveTransitWinter: { id: 'transit', k: 'Vlak a autobus', v: 'nádraží i zastávka ve městě, k domu pěšky' },
      /* V LÉTĚ se tři řádky dojezdů (Praha / Vratislav / Drážďany) slévají
         do jednoho nenápadného. Majitel je v letní verzi nechtěl mít nahoře
         v pásu čísel; nechat je zmizet úplně by ale okradlo hosta o odpověď
         na „kolik to je z Prahy", kterou si stejně někdo hledá. */
      arriveCarSummer: { id: 'car', k: 'Autem', v: 'z Prahy i z Vratislavi přibližně 2 hodiny, z Drážďan 3' },
      mapLabels: {
        villa: 'Villa Rudolf', villaSub: 'Svoboda nad Úpou',
        snezka: 'Sněžka', snezkaMeta: '1603 m',
        pec: 'Pec pod Sněžkou', pecMeta: '10 km',
        cernaHora: 'Černá hora', cernaHoraMeta: 'sjezdovky 4 km',
        janskeLazne: 'Janské Lázně', janskeLazneMeta: '4 km',
        trutnov: 'Trutnov', trutnovMeta: '11 km',
        hmarsov: 'Horní Maršov', obriDul: 'Obří důl', rychory: 'Rýchory', mladeBuky: 'Mladé Buky',
        upa: 'Úpa', polsko: 'POLSKO', ring: 'PĚŠKY OD BRÁNY',
        praha: 'Praha ≈ 2 h', vratislav: 'Vratislav ≈ 2 h', drazdany: 'Drážďany ≈ 3 h',
        adrspach: 'Adršpašské skály 45 min', safari: 'Safari Dvůr Králové 30 min',
        scale: '0 — 2 km', north: 'S',
      },
    },
    tour: {
      eyebrow: 'Projděte si dům i pozemek',
      title: 'Rozhlédněte se uvnitř i venku — celých 360°',
      hint: 'Chyťte a táhněte myší nebo prstem. Dole přepínate místnosti, scény se i samy střídají.',
      drag: 'Chyť a otáčej',
      scenes: [
        { name: 'Zasněžený dvůr', desc: 'Dvůr po vydatném sněžení — projetá cesta mezi zapadanými smrky, rampouchy na střeše a místo, kam zaparkuje celá skupina.' },
        { name: 'Vstupní hala', desc: 'Vstupní hala s botníkem a schodištěm do patra — odtud se jde do jídelny i do pokojů v přízemí.' },
        { name: 'Botník a schodiště', desc: 'Vysoký dřevěný botník hned za dveřmi a schodiště do patra. Prosklenými dveřmi se jde rovnou do jídelny — boty celé skupiny zůstanou tady.' },
        { name: 'Hlavní jídelna s kuchyní', desc: 'Společná kuchyně s dlouhým dřevěným stolem pro celou skupinu, linkou podél stěny a velkými okny do zahrady — hlavní společenský prostor domu.' },
        { name: 'Pokoj 1 (2 lůžka)', desc: 'Manželská postel s podsvíceným čelem, kropenatá tapeta a arkýř se třemi okny do zahrady. Vlastní koupelna.' },
        { name: 'Pokoj 1 — koupelna', desc: 'Koupelna Pokoje 1 — sprchový kout, umyvadlo se zrcadlovou skříňkou a toaleta.' },
        { name: 'Pokoj 2 (3+1 lůžko)', desc: 'Manželská postel a samostatné lůžko, šedá tkaná tapeta za podsvíceným čelem, stůl s lavicemi a dvě okna. Vlastní koupelna hned vedle.' },
        { name: 'Pokoj 2 — koupelna', desc: 'Koupelna Pokoje 2 — čtvrtkruhový sprchový kout, umyvadlo na dřevěné skříňce se zrcadlem, toaleta a vyhřívaný žebřík na ručníky.' },
        { name: 'Pokoj 3 (3+1 lůžko)', desc: 'Manželská postel a samostatné lůžko pod šikmým stropem, zlatá listová tapeta za podsvíceným čelem. Vlastní koupelna přímo z pokoje.' },
        { name: 'Pokoj 3 — okno k bazénovému tunelu', desc: 'Týž Pokoj 3 od druhého okna: hluboký tmavočervený parapet a hned za sklem prosklený tunel nad bazénem. Vysoká skříň a dveře přímo do vstupní haly.' },
        { name: 'Pokoj 3 — koupelna', desc: 'Koupelna Pokoje 3 — sprchový kout, umyvadlo a okno do zahrady.' },
        { name: 'Chodba v 1. patře', desc: 'Podesta hlavního schodiště s vestavěnými skříněmi a trojicí oken — odtud vedou dveře do pokoje i do apartmá.' },
        { name: 'Pokoj 4 (2 lůžka)', desc: 'Manželská postel v klenuté nice mezi dřevěnými sloupy, arkýřové okno s dřevěným parapetem. Vlastní koupelna.' },
        { name: 'Pokoj 4 — pohled od postele', desc: 'Týž Pokoj 4 od hlavy postele: klenutá nika s mramorovanou tapetou a podsvícené laťkové čelo zblízka, přes celý pokoj pak okno se závěsy, obrázek hory, okénko v hrázděné stěně a otevřené dveře do vlastní koupelny.' },
        { name: 'Pokoj 4 — koupelna', desc: 'Koupelna Pokoje 4 — sprchový kout, umyvadlo, toaleta a pračka.' },
        { name: 'Apartmá — obývací část', desc: 'Vlastní obývák apartmá Suite: dlouhá sedací souprava pod trámy, velký stůl, televize a schody do podkrovních ložnic.' },
        { name: 'Apartmá — kuchyňský kout', desc: 'Kuchyňská linka apartmá s troubou a varnou deskou — apartmá má vlastní zázemí a nemusí se dělit o hlavní kuchyni.' },
        { name: 'Apartmá — ložnice A', desc: 'První ze tří ložnic apartmá, v 1. patře: manželská postel a geometrická tapeta za podsvíceným čelem.' },
        { name: 'Apartmá — ložnice B', desc: 'Podkrovní ložnice apartmá — manželská postel a samostatné lůžko s výsuvným druhým lůžkem pod šikmým stropem, komoda a noční stolek. Apartmá má díky ní 10 lůžek.' },
        { name: 'Apartmá — ložnice C', desc: 'Největší podkrovní ložnice apartmá: manželská postel a dvě samostatná lůžka pod šikmým stropem, vikýřové okno.' },
        { name: 'Wellness u sauny', desc: 'Předsálí sauny — lavice na vychladnutí, sprcha a vstup do finské sauny. Celé jen pro vaši skupinu.' },
        { name: 'Finská sauna', desc: 'Uvnitř vyhřáté finské sauny — lavice ze světlého dřeva a kamna.' },
        { name: 'Lyžárna', desc: 'Samostatná lyžárna v suterénu — stojany na lyže a snowboardy a držáky na boty. Vybavení zůstane dole a nemusí do pokojů.' },
        { name: 'Zahrada v zimě', desc: 'Zasněžená zahrada od altánu k domu — vzrostlé smrky, prošlapané cestičky a hory nad střechami.' },
        { name: 'Altán s grily', desc: 'Týž altán jako v létě, jen pod sněhem: krov z masivního dřeva, grilovací pult podél stěny a otevřené strany do zahrady.' },
      ],
      scenesSummer: [
        { name: 'Příjezd k vile', desc: 'Plocha za bránou, kam zaparkuje celá skupina, a dům na konci příjezdovky mezi vzrostlými stromy.' },
        { name: 'Zahrada s bazénem', desc: 'Pohled přes trávník na dům, zastřešený bazén s řadou lehátek a gabionové ohniště pod svahem.' },
        { name: 'Zahrada s krytým bazénem', desc: 'Zastřešený vyhřívaný bazén s řadou lehátek hned u domu, kolem dokola vlastní trávník.' },
        { name: 'Terasa s posezením', desc: 'Terasa z dubových fošen nad gabionovou zdí — stůl pro celou partu a výhled na altán a hory.' },
        { name: 'Altán s grily', desc: 'Pod krovem z masivního dřeva: dlouhý stůl, zděný grilovací pult a otevřené strany do zahrady.' },
        { name: 'Dětské hřiště', desc: 'Lanový most, prolézačka a malá lezecká stěna na dohled od domu — děti mají svůj kout uvnitř pozemku.' },
        { name: 'Terasa s ohništěm večer', desc: 'Po setmění se gabiony i schody nasvítí samy — křesílka u ohniště a v pozadí svítící bazén.' },
      ],
      groupsLabel: 'Skupiny scén', groupAll: 'Vše',
      stripLabel: 'Scény 360° prohlídky', stripPrev: 'Předchozí náhledy', stripNext: 'Další náhledy',
      groups: { ground: 'Přízemí', floor1: '1. patro', floor2: 'Podkroví', basement: 'Suterén', extSummer: 'Exteriér léto', extWinter: 'Exteriér zima' },
    },
    gallery: { eyebrow: 'Galerie', title: 'Dům, pozemek, okolí', note: 'Všechny fotky ({n}) · klepnutím zvětšíte' },
    vylety: {
      eyebrow: 'Plánovač výletů', title: 'Hory začínají za dveřmi', note: 'Vybíráme podle sezóny · {n} ověřených cílů do hodiny od domu.', drop: 'Sem přijde fotka z výletu', cta: 'Otevřít plánovač výletů', ctaSub: 'Bez registrace. Mapa, filtry i tip na konkrétní den.',
      /* SEKCE #vylety JE JEN LETNÍ — a od 7/2026 to platí i pro obsah karet.
         Majitel: „Ne v tom mít bobovky a sjezdovky a lyžování v okolí, když se
         bavíme o letní stránce." Vypadly proto karty „Lyžování v okolí"
         a „Bobovky a stezky"; nahradily je letní cíle, které web publikuje
         i v okruzích lokality a ke kterým máme skutečnou letní fotku
         (media/trips/*). Do téhle čtveřice NIKDY nedávej zimní program —
         zimní ekvivalent je exkluzivní sekce #lyzovani. */
      items: [
        { tag: 'Celoročně', name: 'Sněžka', desc: 'Nejvyšší hora Česka — pěšky po hřebenech, nebo lanovkou z Pece pod Sněžkou.' },
        { tag: 'Turistika', name: 'Hřebenovky a vodopády', desc: 'Značené trasy od pohodových okruhů po celodenní přechody. Mumlavský vodopád zvládnou i děti.' },
        { tag: 'Nenáročné', name: 'Černohorské rašeliniště', desc: 'Dřevěné chodníky přes horské rašeliniště na Černé hoře. Nahoru kabinkovou lanovkou, pak procházka po rovině.' },
        { tag: 'S dětmi', name: 'Stezka korunami stromů', desc: 'Vyhlídková stezka nad Janskými Lázněmi — v okruhu cílů, na které nepotřebujete auto.' },
      ],
    },
    book: {
      summary: 'Vaše rezervace', pick: 'Vyberte termín v kalendáři',
      total: 'Celkem', deposit: 'Záloha 30 %',
      cleaning: 'Úklidový poplatek', cityTax: 'Městský poplatek',
      depositReq: 'Záloha %P% % po potvrzení',
      minStay: '%S% přijímáme pobyty od %N% nocí. Vyberte prosím delší termín.',
      guestMax: 'Maximálně %N% hostů (dospělí + děti dohromady).',
      pay: 'Odeslat žádost o pobyt', stripeNote: 'Žádost je nezávazná — nic neplatíte. Termín potvrdíme osobně a poté zašleme platební odkaz na zálohu.',
      consent: 'Odesláním žádosti berete na vědomí <a href="/podminky/" target="_blank" rel="noopener">ubytovací podmínky a zpracování osobních údajů</a>.',
      free: 'Volno', booked: 'Obsazeno', chosen: 'Váš pobyt', checkoutOnly: 'pouze odjezd', demo: 'Ukázková dostupnost — napojíme na rezervační systém',
      availFail: 'Dostupnost se nepodařilo načíst.',
      priceHeading: 'Ceník', pricePerNight: '/ noc', priceMin: 'min.',
      priceWeekend: 'víkend (2 noci)', weekendRate: 'Víkendová cena',
      priceOffRange: 'duben, listopad a 1.–14. 12.',
      priceSummerFull: 'Léto %Y% je téměř obsazené — volné jsou už jen jednotlivé termíny.',
      priceXmas: 'Vánoce a Silvestr', priceXmasVal: 'individuální cena, poptejte se',
      priceMinStay: 'Minimální pobyt %N% %NB%',
      priceCityTax: 'Městský poplatek %A% za dospělou osobu a noc (děti neplatí)',
      pricePet: 'Pes / domácí mazlíček %P% za pobyt',
      priceBond: 'Vratná kauce %B% — úklid se z ní odečítá',
      petFee: 'Pes / domácí mazlíček',
      priceCleaning: 'Úklid (jednorázově)', priceDeposit: 'Záloha %P% % až po potvrzení termínu', priceFxNote: '',
      sending: 'Odesílám…', prevMonths: 'Předchozí měsíce', nextMonths: 'Další měsíce',
      okTitle: 'Žádost přijata',
      okBody: 'Ozveme se vám do 24 hodin. Nic zatím neplatíte — termín potvrdíme osobně e-mailem.',
      okAgain: 'Odeslat další žádost',
      errRequired: 'Vyplňte prosím e-mail a vyberte platný termín.',
      errEmail: 'Zkontrolujte prosím e-mailovou adresu.',
      errRate: 'Přijali jsme příliš mnoho žádostí. Zkuste to prosím později nebo nám napište e-mail.',
      errGeneric: 'Odeslání se nezdařilo. Zkuste to prosím znovu, nebo nám napište na rezervace@villarudolf.com.',
    },
    video: { eyebrow: 'Video', title: 'Prohlédněte si vilu na videu', note: 'Video běží samo a bez zvuku. Titulky jsou přímo v obraze; zvuk zapnete tlačítkem a posunout se můžete na časové ose.', summer: 'Dům, zahrada, bazén a příjezd', winter: 'Prohlídka domu, sauna a skibus', start: 'Přehrát video', soundOn: 'Zapnout zvuk', soundOff: 'Vypnout zvuk', onYoutube: 'Přehrát na YouTube' },
    share: { eyebrow: 'Ze života vily', title: 'Jak to u nás vypadá', body: 'Nakoukněte do každodenního života vily na našem Instagramu — proměny ročních období, večery u ohně i momenty našich hostů. A jestli jste u nás byli, označte @villarudolfretreat a #villarudolf, ať vaše fotky uvidí i další.', ig: 'Sledovat na Instagramu' },
    cta: {
      eyebrow: 'Rezervace', title: 'Rezervujte celý dům pro svou skupinu',
      body: 'Vyberte v kalendáři příjezd a odjezd, uvidíte rozpis ceny a pošlete nám nezávaznou žádost o pobyt. Termín vám osobně potvrdíme.',
      lblAdults: 'Dospělí', lblChildren: 'Děti', lblPets: 'Mazlíčci',
      lblName: 'Jméno', phName: 'Vaše jméno',
      lblEmail: 'E-mail', phEmail: 'vas@email.cz',
      lblPhone: 'Telefon / WhatsApp', phPhone: '+420… (nepovinné)',
      lblMessage: 'Zpráva pro hostitele', phMessage: 'Cokoli, co bychom měli vědět — počet dětí, čas příjezdu, přání… (nepovinné)',
    },
    mail: { subject: 'Villa Rudolf — žádost o pobyt', dates: 'Termín', nights: 'Počet nocí', breakdown: 'Rozpis ceny', cleaning: 'Úklidový poplatek', cityTax: 'Městský poplatek', guests: 'Hosté', adults: 'Dospělí', children: 'Děti', pets: 'Domácí mazlíčci', total: 'Celkem', deposit: 'Záloha 30 % (po potvrzení)', from: 'Kontaktní e-mail', phone: 'Telefon / WhatsApp', greeting: 'Dobrý den, rád(a) bych požádal(a) o pobyt ve Villa Rudolf v tomto termínu:' },
    footer: { tagline: 'Soukromé horské sídlo pro velké skupiny v srdci Krkonoš.', langLabel: 'Jazyk', contact: 'Kontakt', rights: '© 2026 Villa Rudolf', social: 'Sledujte nás', host: 'Pavel — váš hostitel', region: 'Krkonoše, Česko', terms: 'Ubytovací podmínky a ochrana údajů', guide: 'Plánovač výletů' },
    prebook: {
      title: 'Co potřebujete vědět před rezervací', link: 'Vše praktické →',
      facts: [
        { k: 'Kapacita', v: '{minHostu}–{maxHostu} hostů v {loznice} ložnicích' },
        { k: 'Soukromí', v: 'Celý dům i pozemek jen pro vaši skupinu' },
        { k: 'Příjezd / odjezd', v: 'Check-in od 15:00 · check-out do 10:00' },
        { k: 'Mazlíčci', v: 'Pes vítán za poplatek' },
        { k: 'Parkování', v: 'Vlastní parkoviště na pozemku u vchodu, zdarma' },
        { k: 'Lyžování', v: 'Sjezdovky Černá hora 4 km · zastávka skibusu 200 m' },
      ],
    },
  },

  en: {
    photoSoon: 'Photo coming soon',
    meta: {
      title: 'Villa Rudolf – whole house for {minHostu}–{maxHostu}, {loznice} bedrooms | Krkonoše',
      desc: 'Whole house and grounds for a group of {minHostu}–{maxHostu} in Svoboda nad Úpou, Krkonoše. {loznice} bedrooms, {koupelny} bathrooms, {pozemek} m², sauna, ski room. Skiing and pool in season.',
      locale: 'en_GB',
    },
    nav: { dum: 'The House', loznice: 'Interior', lyzovani: 'Skiing', vybaveni: 'Amenities', galerie: 'Gallery', ohniste: 'Fire Pit', lokalita: 'Location', vylety: 'Trips', info: 'Guest info', cta: 'Book dates' },
    hero: {
      eyebrow: 'The whole house, just for your group · Krkonoše',
      eyebrowWinter: 'Skiing just around the corner · Krkonoše',
      h1: 'A private villa in the Krkonoše mountains for {minHostu}–{maxHostu} guests',
      sub: 'The whole place — the house and its sweeping grounds — is <em>yours alone</em>.',
      subWinter: 'Skiing just around the corner — <em>ski bus at the door</em>, Černá hora 4 km.',
      ctaSec: 'Explore the house', badge: 'Open dates 2026', video: 'Play video',
      summer: 'Summer', winter: 'Winter',
      nightLine: 'Night has fallen. The fire pit, gabion wall and pool have lit themselves — the evening is just beginning.',
    },
    facts: {
      loznice:        { k: '{loznice}', v: 'bedrooms' },
      koupelny:       { k: '{koupelny}', v: 'bathrooms & WCs' },
      luzka:          { k: '{luzka}', v: 'beds — {luzkaDetail} extra' },
      plocha:         { k: '{plocha} m²', v: 'living area' },
      wellnessSummer: { k: 'Pool + sauna', v: 'covered heated pool and private sauna' },
      wellnessWinter: { k: 'Sauna + ski room', v: 'private sauna, ski room inside the house' },
      parking:        { k: 'Private parking', v: 'on the grounds by the door, behind your own gate' },
    },
    ratings: { eyebrow: 'Guest ratings', reviewsWord: 'reviews', verified: 'verified' },
    direct: {
      badge: '<b>Book direct = best price.</b> 5% better than the platforms. Personal service and fair cancellation terms.',
      book: '<b>Book direct = best price.</b> 5% better than the platforms. Personal service and fair cancellation terms.',
      sidebar: 'Booking direct — 5% better than the platforms.',
    },
    statement: {
      eyebrow: 'The whole estate, only yours',
      title: 'Past the gate, it\'s just you.',
      lead: 'You are not booking rooms in a house where somebody else is staying too. You take the whole place — the house, the fenced grounds, the sauna, the gazebo and the fire pit. <span class="vr-sm-hide">No reception desk, no strangers at breakfast, no waiting for the sauna to free up.</span>',
      stats: [
        { num: '{pozemek} m²', label: 'of fenced grounds for your group alone' },
        { num: '1 table', label: 'big enough for the whole party to sit down at once' },
        { num: '1 group', label: 'there is only ever one on the estate, never two at once' },
        { num: '0', label: 'spaces shared with strangers' },
      ],
    },
    band: { eyebrow: 'One evening here' },
    /* ===================== VYBAVENÍ — JEDEN SEZNAM, DVĚ ŘAZENÍ =====================
       Oddělený blok „A k tomu celoročně" je zrušen; položky mají jediné znění
       a pořadí jim dává CSS `order` podle sezóny (viz .vr-amen v site.css):
         zima: lyžárna → sauna → kuchyně → ohniště → altán → kulečník → apartmá
         léto: bazén → altán → hřiště → sauna → kuchyně → ohniště → kulečník → apartmá
       Texty jsou CELOROČNÍ (vrstva A): žádné sezónní slovo. Sezónnost je
       vlastností DAT (data-season-only v HTML), ne věty v textu — právě proto
       už nemůže vzniknout další „bazén v mrazu". */
    amenities: {
      eyebrow: 'Amenities', title: 'Comfort that keeps a group together', drop: 'Drop a photo here',
      items: {
        pool:     { tag: 'Wellness', name: 'Covered heated pool', desc: 'An indoor pool with heated water — open right through the summer season in any weather, rain included. Straight from the water into the sauna.' },
        skiroom:  { tag: 'Skiing', name: 'Ski room', desc: 'A separate room just for skis and boots: racks for skis and snowboards, boot holders and a washable floor. Wet gear stays downstairs and never goes into the bedrooms — in winter this is the question we get most often.' },
        sauna:    { tag: 'Wellness', name: 'Private Finnish sauna', desc: 'A Finnish sauna for your group alone, with an anteroom and a shower. No sharing, no time slots.' },
        kitchen:  { tag: 'Together', name: 'Kitchen and a table for everyone', desc: 'A fully equipped kitchen and a big wooden table that seats the whole group at once.' },
        firepit:  { tag: 'Outdoor life', name: 'Fire pit with a gabion wall', desc: 'A newly finished open fire pit that takes the whole group. After dark it lights itself — warmth under an open sky.' },
        altan:    { tag: 'Outdoor life', name: 'Large gazebo with a grill', desc: 'Covered seating with a grill counter and a table big enough for everyone at once. The roof holds, whether it rains or snows.' },
        hriste:   { tag: 'For families', name: 'Playground', desc: 'Climbing frames, a small climbing wall and a rope wall. The kids get their own corner within sight of the gazebo.' },
        billiard: { tag: 'Indoors', name: 'Billiards', desc: 'A billiard table in the Suite apartment — for a lazy afternoon or a tournament after dinner.' },
        lounge:   { tag: 'Indoors', name: 'Suite living area', desc: 'A long sofa under the beams and a big table — the Suite apartment has its own social space.' },
      },
    },
    bedrooms: {
      eyebrow: 'Interiors',
      title: 'Inside the house',
      note: '{loznice} bedrooms, {koupelny} bathrooms, a large kitchen, sauna and wellness — walk through the whole house in photos.',
      noBunk: 'No bunk beds — a calmer night, ideal for parents with small children too.',
      rooms: [
        { name: 'Apartment Suite', cap: 'up to 10 guests', beds: '3 bedrooms with double beds, 2 single beds and 1 bed with a pull-out second bed · own kitchenette and billiard table · bathroom' },
        { name: 'Room 1', cap: '2 guests', beds: 'Double bed · bathroom' },
        { name: 'Room 2', cap: 'up to 4 guests', beds: 'Double bed and 2 separate beds (one a full-size extra bed) · bathroom' },
        { name: 'Room 3', cap: 'up to 4 guests', beds: 'Double bed and 2 separate beds (one a full-size extra bed) · bathroom' },
        { name: 'Room 4', cap: '2 guests', beds: 'Double bed · bathroom' },
      ],
    },
    interior: {
      hint: 'Drag with mouse or finger · tap to enlarge',
      open360: 'Open in the 360° house tour',
      rosterTitle: 'Where you’ll sleep',
      rosterNote: '{luzka} beds — {luzkaDetail} extra beds. The layout you’ll split the group by.',
      items: { kitchen: 'Kitchen & dining', suite: 'Apartment Suite', room1: 'Bedroom 1', room2: 'Bedroom 2', room3: 'Bedroom 3', room4: 'Bedroom 4', sauna: 'Finnish sauna', wellness: 'Wellness & shower', bath: 'Shower by the sauna', bath2: 'Bathroom – Room 2', bath3: 'Bathroom – Room 3', bath4: 'Bathroom – Room 4' },
    },
    ohniste: {
      eyebrow: 'New centrepiece', caption: 'Detail of the fire pit and gabion wall',
      title: 'A fire pit with a gabion wall that comes alive at night',
      body: 'The newly finished open fire pit holds the whole group. A massive gabion wall forms a single composition with it and lights up automatically after dark — the lights switch on and off on their own. The heart of open-air evenings.',
    },
    skupina: {
      eyebrow: 'Your group, whatever its size',
      big: 'Six friends on motorbikes, or a reunion of twenty-two. The place always takes the whole party.',
      desc: 'It isn’t about the number. Up to {maxHostu} sleep here in comfort, but a family, a circle of friends or a smaller group fit just as well — the whole house and grounds are always yours alone.',
    },
    /* ===================== JEN ZIMA — „Lyžování odsud" (#lyzovani) =====================
       Zdroj: strukturální rešerše okolních areálů, ověřeno 7/2026.
       DO TÉTO VĚTVE NIKDY NEPIŠ: ceny skipasů, jízdní řády, provozní a otevírací
       doby, počty aktuálně otevřených vleků, „skibus zdarma" jako tvrdé tvrzení,
       „zelené sjezdovky" (všechny tři ve Svobodě jsou MODRÉ), konkrétní dny
       a časy večerního lyžování ani počet areálů na skipas jako tvrdé číslo —
       provozovatel si v těchto údajích na vlastním webu protiřečí a zastaralý
       údaj je horší než žádný (host podle něj plánuje den).
       Čísla u vleků a sjezdovek jsou INSTALOVANÝ stav, ne garance provozu. */
    ski: {
      eyebrow: 'Skiing · SkiResort Černá hora – Pec',
      title: 'Skiing from here',
      note: 'We only publish what does not change between seasons. Prices, timetables and opening hours are with the operator.',
      local: {
        tag: '1.9 km from the house',
        name: 'A ski area right in Svoboda nad Úpou',
        desc: 'The nearest slopes are not "somewhere up in the mountains" — they are in the same small town as the house. Five minutes by car, under half an hour on foot. It is the smallest area in the resort, and that is exactly why it suits children and first-timers while the rest of the group heads for the big slopes.',
        specs: [
          'blue (easy) runs, each about 350 m',
          'lifts — there is no cable car here',
          'by car from the house — 1.9 km by road',
        ],
        school: 'The area has a ski school, an equipment rental and a magic carpet for children.',
        snow: 'Honestly: this is the lowest-lying area in the resort (roughly 530–600 m), so it depends entirely on snow and snowmaking and its season tends to be shorter than higher up. Before you build a whole stay around it, check that it is running.',
      },
      resorts: {
        title: 'One ski pass, several areas',
        lead: 'The house sits in the SkiResort ČERNÁ HORA – PEC area, where, according to the operator, a single ski pass covers several ski areas. Driving times from Svoboda nad Úpou:',
      },
      rows: {
        cernaHora: 'the largest area in the resort',
        velkaUpa: "children's park at the bottom lift station",
        cernyDul: 'a mountain crossing over a saddle — winding road, allow extra time',
        pec: 'the second largest area, runs of every grade',
        malaUpa: 'run by a different company — check that your pass is valid',
      },
      notes: {
        connect: { t: 'The areas are not linked by pistes',
          b: 'Do not expect one connected ski area. The only skiing link is the SkiTour from Černá hora to Pec — it works in one direction only and on two of its four sections a snowcat tows you; you come back by ski bus. Between the other areas you drive or take the ski bus; what joins them is the shared pass.' },
        skibus: { t: 'You can ski without a car',
          b: 'The SkiResort trunk ski bus stops right in Svoboda nad Úpou — among others Maršov II, Maršov I, Sokolovna, the bus station and Hotel PROM. The number of lines and the terms of carriage change from season to season, so check them with the operator.' },
        evening: { t: 'Night skiing',
          b: 'In season it runs on floodlit pistes; the longest of them is Protěž on Černá hora — 1.6 km according to the operator. The exact days and times change, so look for the current schedule at the operator.' },
      },
      plan: {
        title: 'When nobody is skiing',
        lead: 'In a larger group somebody always skips the skiing — and out of seven nights, four or five are realistically ski days. This is the rest of the programme.',
        tiles: [
          { n: 'Aquacentrum Janské Lázně', m: 'indoor pool, walking distance' },
          { n: 'Cross-country trails', m: 'trailheads by Černá hora, ≈ 4 km by car' },
          { n: 'Harrachov glassworks', m: 'a tour in the warm, ≈ 50 min by car' },
          { n: 'Stachelberg fortress', m: 'underground fortifications near Trutnov' },
          { n: 'Karpacz water park (PL)', m: 'large indoor water park, ≈ 45 min by car' },
        ],
      },
      cta: 'Winter trips in the planner',
      ctaSub: 'Map, filters and a tip for a particular day — no sign-up.',
    },
    lokalita: {
      eyebrow: 'Location · Svoboda nad Úpou',
      title: 'In the mountains, not at the end of the world.',
      lead: 'We are in Svoboda nad Úpou, 150 metres from the centre — shop, restaurant, train and bus are all within walking distance. And Sněžka is twenty minutes away by car.',
      leadWinter: 'The ski bus to SkiResort Černá hora–Pec stops 200 metres from the gate — you reach the lifts without the car and without hunting for a parking space. The car can then stay put on the grounds all week. Current fares and timetables are published by the operator.',
      /* Letní sada — viz komentář u české větve (doorstepSummer). */
      doorstepSummer: [
        { num: '150 m', label: 'to the centre of Svoboda — shop, restaurant and station on foot' },
        { num: '20 min', label: 'by car to Sněžka — up by cable car, or on your own two feet' },
        { num: '4 km', label: 'Janské Lázně — the Treetop Walk and the Černá hora cable car' },
        { num: '11 km', label: 'Trutnov — outdoor pool, climbing wall and the big shops' },
      ],
      /* Zimní sada — skibus a sjezdovky jsou tu to hlavní. */
      doorstep: [
        { num: '150 m', label: 'to the centre of Svoboda — about a two-minute walk' },
        { num: '200 m', label: 'to the ski-bus stop — under three minutes on foot' },
        { num: '2 h', label: 'roughly from Prague and from Wrocław, three from Dresden' },
        { num: '4 km', label: 'to the Černá hora slopes — the ski bus stops by the house' },
      ],
      mapTitle: ['{n} tried-and-tested trip in three rings', '{n} tried-and-tested trips in three rings'],
      mapNote: 'Distances on the map are true to life; the terrain is drawn by hand. The ring around the villa has a radius of three kilometres as the crow flies.',
      legend: '◆ Villa Rudolf · ○ within walking distance · ┄ the Polish border · times and distances are by road',
      mapAlt: 'A hand-drawn map of the area: Villa Rudolf in Svoboda nad Úpou, Sněžka, Janské Lázně, Pec pod Sněžkou, Trutnov and the Polish border.',
      rings: [
        { name: 'On foot from the gate', count: ['{n} destination', '{n} destinations'],
          body: 'Janské Lázně and the Treetop Walk, the Aquacentrum indoor pool, llama trekking at a family farm, the Muchomůrka farm park, the Do Krakonošova fairy-tale exhibition, adventure minigolf and a shooting range. Not one of them needs a car.',
          link: 'See it in the planner →' },
        { name: 'Within a 30-minute drive', count: ['{n} destination', '{n} destinations'],
          body: 'Sněžka by cable car or on foot, Černá hora by gondola, Obří důl even with a pushchair, the bobsled track in Pec, lookout towers, the Rýchory beech forest, the lido and the climbing wall in Trutnov.',
          link: 'See it in the planner →' },
        { name: 'A full day out', count: ['{n} destination', '{n} destinations'],
          body: 'The Adršpach rock town, Safari Park Dvůr Králové, the Harrachov glassworks with the Mumlava waterfalls, and the Tropikana aquapark in Karpacz, Poland — take everyone\'s ID for that one, children included.',
          link: 'See it in the planner →' },
      ],
      arrive: [
        { id: 'praha', k: 'Prague', v: 'roughly 2 hours by car' },
        { id: 'wroclaw', k: 'Wrocław (PL)', v: 'roughly 2 hours by car' },
        { id: 'dresden', k: 'Dresden', v: 'roughly 3 hours by car' },
        { id: 'train', k: 'By train', v: 'Svoboda nad Úpou station, then a short walk' },
        { id: 'bus', k: 'By bus', v: 'a stop in town, then a short walk' },
        { id: 'skibus', k: 'Ski bus', v: 'stop 200 m from the gate; check fares with the operator' },
        { id: 'parking', k: 'Parking', v: 'on the grounds, behind the gate' },
      ],
      arriveTransitWinter: { id: 'transit', k: 'Train & bus', v: 'station and stop in town, then a short walk' },
      arriveCarSummer: { id: 'car', k: 'By car', v: 'roughly 2 hours from Prague and Wrocław, 3 from Dresden' },
      mapLabels: {
        villa: 'Villa Rudolf', villaSub: 'Svoboda nad Úpou',
        snezka: 'Sněžka', snezkaMeta: '1603 m',
        pec: 'Pec pod Sněžkou', pecMeta: '10 km',
        cernaHora: 'Černá hora', cernaHoraMeta: 'ski slopes 4 km',
        janskeLazne: 'Janské Lázně', janskeLazneMeta: '4 km',
        trutnov: 'Trutnov', trutnovMeta: '11 km',
        hmarsov: 'Horní Maršov', obriDul: 'Obří důl', rychory: 'Rýchory', mladeBuky: 'Mladé Buky',
        upa: 'Úpa', polsko: 'POLAND', ring: 'WALKING DISTANCE',
        praha: 'Prague ≈ 2 h', vratislav: 'Wrocław ≈ 2 h', drazdany: 'Dresden ≈ 3 h',
        adrspach: 'Adršpach Rocks 45 min', safari: 'Safari Dvůr Králové 30 min',
        scale: '0 — 2 km', north: 'N',
      },
    },
    tour: {
      eyebrow: 'Step inside & out',
      title: 'Look around inside and out — in full 360°',
      hint: 'Grab and drag with mouse or finger. Switch rooms below; the scenes also drift on their own.',
      drag: 'Grab to look',
      scenes: [
        { name: 'Snowy courtyard', desc: 'The courtyard after heavy snowfall — a cleared track between laden spruces, icicles along the roof and room for the whole group to park.' },
        { name: 'Entrance hall', desc: 'The entrance hall with the boot rack and the staircase up — the dining room and the ground-floor bedrooms both open from here.' },
        { name: 'Boot rack and stairs', desc: 'A tall wooden boot rack just inside the door and the staircase up. The glazed door leads straight into the dining room — the whole group’s boots stay here.' },
        { name: 'Main kitchen & dining room', desc: 'The shared kitchen with a long wooden table for the whole group, a run of units along the wall and big windows to the garden — the social heart of the house.' },
        { name: 'Room 1 (2 beds)', desc: 'A double bed with a backlit headboard, mottled wallpaper and a bay of three windows onto the garden. Its own bathroom.' },
        { name: 'Room 1 — bathroom', desc: 'Room 1’s bathroom — shower enclosure, basin with a mirror cabinet and a toilet.' },
        { name: 'Room 2 (3+1 beds)', desc: 'A double bed and a single, grey woven wallpaper behind the backlit headboard, a table with benches and two windows. Its own bathroom next door.' },
        { name: 'Room 2 — bathroom', desc: 'Room 2’s bathroom — a quadrant shower enclosure, a basin on a wooden vanity with a mirror, a toilet and a heated towel ladder.' },
        { name: 'Room 3 (3+1 beds)', desc: 'A double bed and a single under the sloping ceiling, gold-leaf wallpaper behind the backlit headboard. Its own bathroom straight off the room.' },
        { name: 'Room 3 — the window over the pool tunnel', desc: 'The same Room 3 from its second window: a deep dark-red sill and, just beyond the glass, the glazed tunnel over the pool. A tall wardrobe and a door straight into the entrance hall.' },
        { name: 'Room 3 — bathroom', desc: 'Room 3’s bathroom — shower enclosure, basin and a window to the garden.' },
        { name: 'First-floor landing', desc: 'The main staircase landing with fitted wardrobes and three windows — doors lead on to a bedroom and to the Suite.' },
        { name: 'Room 4 (2 beds)', desc: 'A double bed in a vaulted alcove between timber posts, a bay window with a wooden sill. Its own bathroom.' },
        { name: 'Room 4 — the view from the bed', desc: 'The same Room 4 from the head of the bed: the vaulted alcove with its marbled wallpaper and the backlit slatted headboard up close, then the length of the room to the curtained window, the mountain print, the little window in the timbered wall and the open door to the en-suite bathroom.' },
        { name: 'Room 4 — bathroom', desc: 'Room 4’s bathroom — shower enclosure, basin, toilet and a washing machine.' },
        { name: 'Suite — living area', desc: 'The Suite apartment’s own lounge: a long sofa under the beams, a big table, a TV and the stairs up to the attic bedrooms.' },
        { name: 'Suite — kitchenette', desc: 'The Suite’s own kitchen units with an oven and hob — the apartment is self-contained and doesn’t share the main kitchen.' },
        { name: 'Suite — bedroom A', desc: 'The first of the Suite’s three bedrooms, on the first floor: a double bed and geometric wallpaper behind the backlit headboard.' },
        { name: 'Suite — bedroom B', desc: 'An attic bedroom of the Suite — a double bed and a single with a pull-out second bed under the sloping ceiling, a chest of drawers and a bedside table. It is what takes the Suite to 10 beds.' },
        { name: 'Suite — bedroom C', desc: 'The Suite’s largest attic bedroom: a double bed and two singles under the sloping ceiling, and a dormer window.' },
        { name: 'Wellness by the sauna', desc: 'The room in front of the sauna — a bench to cool down on, a shower and the door into the Finnish sauna. All yours alone.' },
        { name: 'Inside the sauna', desc: 'Inside the heated Finnish sauna — pale timber benches and the stove.' },
        { name: 'Ski room', desc: 'A ski room of its own downstairs — racks for skis and snowboards and holders for boots. The kit stays down here instead of in the bedrooms.' },
        { name: 'The garden in winter', desc: 'The snowbound garden from the gazebo back to the house — tall spruces, trodden paths and the mountains above the roofs.' },
        { name: 'The gazebo with the grills', desc: 'The same gazebo as in summer, only under snow: a solid timber roof, the grill counter along the wall and open sides onto the garden.' },
      ],
      scenesSummer: [
        { name: 'Arriving at the villa', desc: 'The parking area behind the gate with room for the whole group, and the house at the end of the drive among tall trees.' },
        { name: 'Garden and pool', desc: 'Across the lawn to the house, the covered pool with its row of loungers and the gabion fire pit below the slope.' },
        { name: 'The covered pool', desc: 'The covered heated pool and its row of sun loungers, right by the house and ringed by your own lawn.' },
        { name: 'The wooden deck', desc: 'An oak deck above the gabion wall — a table for the whole group, looking out to the gazebo and the hills.' },
        { name: 'The gazebo with the grills', desc: 'Under a solid timber roof: the long table, a built-in grill counter and open sides onto the garden.' },
        { name: 'The playground', desc: 'A rope bridge, a climbing frame and a small climbing wall in sight of the house — the children have their own corner inside the grounds.' },
        { name: 'The fire pit after dark', desc: 'Once the sun is down the gabions and steps light themselves — chairs around the fire pit, the glowing pool behind.' },
      ],
      groupsLabel: 'Scene groups', groupAll: 'All',
      stripLabel: '360° tour scenes', stripPrev: 'Previous thumbnails', stripNext: 'Next thumbnails',
      groups: { ground: 'Ground floor', floor1: 'First floor', floor2: 'Attic', basement: 'Basement', extSummer: 'Outside — summer', extWinter: 'Outside — winter' },
    },
    gallery: { eyebrow: 'Gallery', title: 'The house, grounds, surroundings', note: 'All photos ({n}) · click to enlarge' },
    vylety: {
      eyebrow: 'Trip planner', title: 'The mountains start at the door', note: 'We pick by season · {n} verified places within an hour of the house.', drop: 'A trip photo goes here', cta: 'Open the trip planner', ctaSub: 'No sign-up. Map, filters and a tip for a specific day.',
      items: [
        { tag: 'Year-round', name: 'Sněžka', desc: 'The highest peak in Czechia — hike the ridges, or take the cable car from Pec pod Sněžkou.' },
        { tag: 'Hiking', name: 'Ridge trails & waterfalls', desc: 'Marked routes from easy loops to full-day traverses. The Mumlava waterfall works with kids too.' },
        { tag: 'Easy going', name: 'Černá hora peat bog', desc: 'Boardwalks across a mountain peat bog on Černá hora. Up by cabin lift, then a level walk.' },
        { tag: 'With kids', name: 'The Treetop Walk', desc: 'A walkway above Janské Lázně — in the ring of places you can reach without the car.' },
      ],
    },
    book: {
      summary: 'Your stay', pick: 'Pick your dates in the calendar',
      total: 'Total', deposit: '30% deposit',
      cleaning: 'Cleaning fee', cityTax: 'City tax',
      depositReq: '%P%% deposit after confirmation',
      minStay: '%S% we accept stays from %N% nights. Please pick a longer range.',
      guestMax: 'Up to %N% guests (adults + children combined).',
      pay: 'Send stay request', stripeNote: 'This request is non-binding — you pay nothing now. We’ll confirm the dates personally and then send a payment link for the deposit.',
      consent: 'By sending this request you acknowledge our <a href="/podminky/" target="_blank" rel="noopener">booking terms and the processing of your personal data</a>.',
      free: 'Available', booked: 'Booked', chosen: 'Your stay', checkoutOnly: 'checkout only', demo: 'Sample availability — will connect to the booking system',
      availFail: 'Availability could not be loaded.',
      priceHeading: 'Price list', pricePerNight: '/ night', priceMin: 'min.',
      priceWeekend: 'weekend (2 nights)', weekendRate: 'Weekend rate',
      priceOffRange: 'April, November and 1–14 December',
      priceSummerFull: 'Summer %Y% is almost fully booked — only a few dates are left.',
      priceXmas: 'Christmas & New Year', priceXmasVal: 'individual price, please ask',
      priceMinStay: 'Minimum stay %N% %NB%',
      priceCityTax: 'City tax %A% per adult per night (children exempt)',
      pricePet: 'Dog / pet %P% per stay',
      priceBond: 'Refundable deposit %B% — the cleaning fee is deducted from it',
      petFee: 'Dog / pet',
      priceCleaning: 'Cleaning (one-off)', priceDeposit: '%P%% deposit, only after we confirm your dates', priceFxNote: 'approximate, paid in CZK',
      sending: 'Sending…', prevMonths: 'Previous months', nextMonths: 'Next months',
      okTitle: 'Request received',
      okBody: 'We’ll get back to you within 24 hours. You pay nothing yet — we confirm the dates personally by email.',
      okAgain: 'Send another request',
      errRequired: 'Please enter your email and pick a valid date range.',
      errEmail: 'Please check your email address.',
      errRate: 'We received too many requests. Please try again later or email us.',
      errGeneric: 'Sending failed. Please try again, or email us at rezervace@villarudolf.com.',
    },
    video: { eyebrow: 'Video', title: 'See the villa on video', note: 'The video plays on its own, without sound. Subtitles are part of the picture; switch the sound on with the button and use the timeline to skip around.', summer: 'House, garden, pool & arrival', winter: 'House tour, sauna & ski bus', start: 'Play video', soundOn: 'Sound on', soundOff: 'Mute', onYoutube: 'Watch on YouTube' },
    share: { eyebrow: 'Life at the villa', title: 'See what it’s really like', body: 'Take a look at everyday life at the villa on our Instagram — the change of seasons, evenings by the fire and moments from our guests. And if you’ve stayed with us, tag @villarudolfretreat and #villarudolf so others can see your photos too.', ig: 'Follow on Instagram' },
    cta: {
      eyebrow: 'Booking', title: 'Book the whole house for your group',
      body: 'Pick arrival and departure in the calendar, see the price breakdown and send us a non-binding stay request. We’ll confirm your dates personally.',
      lblAdults: 'Adults', lblChildren: 'Children', lblPets: 'Pets',
      lblName: 'Name', phName: 'Your name',
      lblEmail: 'Email', phEmail: 'you@email.com',
      lblPhone: 'Phone / WhatsApp', phPhone: '+420… (optional)',
      lblMessage: 'Message to the host', phMessage: 'Anything we should know — number of children, arrival time, requests… (optional)',
    },
    mail: { subject: 'Villa Rudolf — stay request', dates: 'Dates', nights: 'Nights', breakdown: 'Price breakdown', cleaning: 'Cleaning fee', cityTax: 'City tax', guests: 'Guests', adults: 'Adults', children: 'Children', pets: 'Pets', total: 'Total', deposit: '30% deposit (after confirmation)', from: 'Contact email', phone: 'Phone / WhatsApp', greeting: 'Hello, I’d like to request a stay at Villa Rudolf for these dates:' },
    footer: { tagline: 'A private mountain estate for large groups in the heart of Krkonoše.', langLabel: 'Language', contact: 'Contact', rights: '© 2026 Villa Rudolf', social: 'Follow us', host: 'Pavel — your host', region: 'Krkonoše, Czechia', terms: 'Booking terms & privacy', guide: 'Trip planner' },
    prebook: {
      title: 'What to know before you book', link: 'All the practical info →',
      facts: [
        { k: 'Capacity', v: '{minHostu}–{maxHostu} guests across {loznice} bedrooms' },
        { k: 'Privacy', v: 'The whole house and grounds, just your group' },
        { k: 'Check-in / out', v: 'Check-in from 15:00 · check-out by 10:00' },
        { k: 'Pets', v: 'Dogs welcome for a fee' },
        { k: 'Parking', v: 'Free, right on the property behind the gate' },
        { k: 'Skiing', v: 'Černá hora slopes 4 km · ski-bus stop 200 m' },
      ],
    },
  },

  de: {
    photoSoon: 'Foto folgt',
    meta: {
      title: 'Villa Rudolf – ganzes Haus für {minHostu}–{maxHostu} Gäste | Riesengebirge',
      desc: 'Ganzes Haus und Grundstück nur für eure Gruppe von {minHostu}–{maxHostu} in Svoboda nad Úpou. {loznice} Schlafzimmer, {koupelny} Bäder, {pozemek} m², Sauna, Skiraum. Ski und Pool saisonal.',
      locale: 'de_DE',
    },
    nav: { dum: 'Das Haus', loznice: 'Innenräume', lyzovani: 'Skifahren', vybaveni: 'Ausstattung', galerie: 'Galerie', ohniste: 'Feuerstelle', lokalita: 'Lage', vylety: 'Ausflüge', info: 'Gäste-Infos', cta: 'Termin buchen' },
    hero: {
      eyebrow: 'Das ganze Haus, nur für eure Gruppe · Riesengebirge',
      eyebrowWinter: 'Skifahren gleich um die Ecke · Riesengebirge',
      h1: 'Eine private Villa im Riesengebirge für {minHostu}–{maxHostu} Gäste',
      sub: 'Der ganze Ort — Haus und weitläufiges Grundstück — gehört <em>nur euch</em>.',
      subWinter: 'Skifahren gleich um die Ecke — <em>Skibus am Haus</em>, Černá hora 4 km.',
      ctaSec: 'Haus ansehen', badge: 'Freie Termine 2026', video: 'Video abspielen',
      summer: 'Sommer', winter: 'Winter',
      nightLine: 'Es ist dunkel geworden. Feuerstelle, Gabionenwand und Pool leuchten von selbst — der Abend fängt gerade erst an.',
    },
    facts: {
      loznice:        { k: '{loznice}', v: 'Schlafzimmer' },
      koupelny:       { k: '{koupelny}', v: 'Bäder & WCs' },
      luzka:          { k: '{luzka}', v: 'Betten — {luzkaDetail} Zusatz' },
      plocha:         { k: '{plocha} m²', v: 'Wohnfläche' },
      wellnessSummer: { k: 'Pool + Sauna', v: 'überdachter beheizter Pool und private Sauna' },
      wellnessWinter: { k: 'Sauna + Skiraum', v: 'private Sauna, Skiraum direkt im Haus' },
      parking:        { k: 'Eigener Parkplatz', v: 'auf dem Grundstück direkt am Eingang, hinter dem eigenen Tor' },
    },
    ratings: { eyebrow: 'Gästebewertungen', reviewsWord: 'Bewertungen', verified: 'geprüft' },
    direct: {
      badge: '<b>Direkt buchen = bester Preis.</b> 5 % günstiger als über die Plattformen. Persönlicher Service und faire Stornobedingungen.',
      book: '<b>Direkt buchen = bester Preis.</b> 5 % günstiger als über die Plattformen. Persönlicher Service und faire Stornobedingungen.',
      sidebar: 'Direkt buchen — 5 % günstiger als über die Plattformen.',
    },
    statement: {
      eyebrow: 'Das ganze Anwesen nur für euch',
      title: 'Hinter dem Tor seid ihr unter euch.',
      lead: 'Ihr bucht keine Zimmer in einem Haus, in dem noch jemand anderes wohnt. Ihr nehmt das ganze Grundstück — das Haus, den eingezäunten Park, Sauna, Pavillon und Feuerstelle. <span class="vr-sm-hide">Keine Rezeption, keine Fremden beim Frühstück, kein Warten, bis die Sauna frei wird.</span>',
      stats: [
        { num: '{pozemek} m²', label: 'eingezäunter Park nur für eure Gruppe' },
        { num: '1 Tisch', label: 'groß genug für die ganze Runde auf einmal' },
        { num: '1 Gruppe', label: 'auf dem Anwesen ist immer nur eine, nie zwei gleichzeitig' },
        { num: '0', label: 'Räume, die ihr mit Fremden teilt' },
      ],
    },
    band: { eyebrow: 'Ein Abend hier' },
    /* ===================== VYBAVENÍ — JEDEN SEZNAM, DVĚ ŘAZENÍ =====================
       Oddělený blok „A k tomu celoročně" je zrušen; položky mají jediné znění
       a pořadí jim dává CSS `order` podle sezóny (viz .vr-amen v site.css):
         zima: lyžárna → sauna → kuchyně → ohniště → altán → kulečník → apartmá
         léto: bazén → altán → hřiště → sauna → kuchyně → ohniště → kulečník → apartmá
       Texty jsou CELOROČNÍ (vrstva A): žádné sezónní slovo. Sezónnost je
       vlastností DAT (data-season-only v HTML), ne věty v textu — právě proto
       už nemůže vzniknout další „bazén v mrazu". */
    amenities: {
      eyebrow: 'Ausstattung', title: 'Komfort, der die Gruppe zusammenhält', drop: 'Foto hierher ziehen',
      items: {
        pool:     { tag: 'Wellness', name: 'Überdachter beheizter Pool', desc: 'Ein Innenpool mit beheiztem Wasser — in der Sommersaison bei jedem Wetter nutzbar, auch wenn es draußen regnet. Aus dem Wasser direkt in die Sauna.' },
        skiroom:  { tag: 'Skifahren', name: 'Skiraum', desc: 'Ein eigener Raum nur für Ski und Schuhe: Ständer für Ski und Snowboards, Schuhhalter und ein abwaschbarer Boden. Nasse Ausrüstung bleibt unten und muss nicht in die Zimmer — im Winter ist das die häufigste Frage, die wir bekommen.' },
        sauna:    { tag: 'Wellness', name: 'Private finnische Sauna', desc: 'Eine finnische Sauna nur für eure Gruppe, mit Vorraum und Dusche. Kein Teilen, keine Zeitfenster.' },
        kitchen:  { tag: 'Gemeinsam', name: 'Küche und ein Tisch für alle', desc: 'Eine voll ausgestattete Küche und ein großer Holztisch, an dem die ganze Gruppe auf einmal sitzt.' },
        firepit:  { tag: 'Draußen', name: 'Feuerstelle mit Gabionenwand', desc: 'Die neu fertiggestellte offene Feuerstelle fasst die ganze Gruppe. Nach Einbruch der Dunkelheit leuchtet sie von selbst — Wärme unter freiem Himmel.' },
        altan:    { tag: 'Draußen', name: 'Großer Pavillon mit Grill', desc: 'Überdachte Sitzplätze mit Grilltheke und einem Tisch, an dem die ganze Gruppe auf einmal Platz hat. Das Dach hält, ob es regnet oder schneit.' },
        hriste:   { tag: 'Für Familien', name: 'Spielplatz', desc: 'Klettergerüst, eine kleine Kletter- und eine Seilwand. Die Kinder haben ihre Ecke in Sichtweite des Pavillons.' },
        billiard: { tag: 'Drinnen', name: 'Billard', desc: 'Ein Billardtisch im Apartment Suite — für einen faulen Nachmittag oder ein Turnier nach dem Abendessen.' },
        lounge:   { tag: 'Drinnen', name: 'Wohnbereich des Apartments', desc: 'Eine lange Sitzgruppe unter den Balken und ein großer Tisch — das Apartment Suite hat seinen eigenen Aufenthaltsraum.' },
      },
    },
    bedrooms: {
      eyebrow: 'Innenräume',
      title: 'Das Haus von innen',
      note: '{loznice} Schlafzimmer, {koupelny} Bäder, große Küche, Sauna und Wellness — das ganze Haus in Fotos.',
      noBunk: 'Keine Etagenbetten — ruhigerer Schlaf, auch ideal für Eltern mit kleinen Kindern.',
      rooms: [
        { name: 'Apartment-Suite', cap: 'bis zu 10 Gäste', beds: '3 Schlafzimmer mit Doppelbetten, 2 Einzelbetten und 1 Bett mit ausziehbarem Zweitbett · eigene Küchenzeile und Billardtisch · Bad' },
        { name: 'Zimmer 1', cap: '2 Gäste', beds: 'Doppelbett · Bad' },
        { name: 'Zimmer 2', cap: 'bis zu 4 Gäste', beds: 'Doppelbett und 2 Einzelbetten (eines ein vollwertiges Zustellbett) · Bad' },
        { name: 'Zimmer 3', cap: 'bis zu 4 Gäste', beds: 'Doppelbett und 2 Einzelbetten (eines ein vollwertiges Zustellbett) · Bad' },
        { name: 'Zimmer 4', cap: '2 Gäste', beds: 'Doppelbett · Bad' },
      ],
    },
    interior: {
      hint: 'Mit Maus oder Finger ziehen · zum Vergrößern tippen',
      open360: 'In der 360°-Haustour öffnen',
      rosterTitle: 'Wo ihr schlaft',
      rosterNote: '{luzka} Betten — {luzkaDetail} Zustellbetten. Die Aufteilung, nach der ihr die Gruppe verteilt.',
      items: { kitchen: 'Küche & Essbereich', suite: 'Apartment-Suite', room1: 'Zimmer 1', room2: 'Zimmer 2', room3: 'Zimmer 3', room4: 'Zimmer 4', sauna: 'Finnische Sauna', wellness: 'Wellness & Dusche', bath: 'Dusche an der Sauna', bath2: 'Bad – Zimmer 2', bath3: 'Bad – Zimmer 3', bath4: 'Bad – Zimmer 4' },
    },
    ohniste: {
      eyebrow: 'Neues Herzstück', caption: 'Detail der Feuerstelle und Gabionenwand',
      title: 'Eine Feuerstelle mit Gabionenwand, die abends zum Leben erwacht',
      body: 'Die neu fertiggestellte offene Feuerstelle fasst die ganze Gruppe. Eine massive Gabionenwand bildet mit ihr eine Einheit und wird nach Einbruch der Dunkelheit automatisch beleuchtet — die Lichter gehen von selbst an und aus. Das Zentrum der Abende unter freiem Himmel.',
    },
    skupina: {
      eyebrow: 'Eure Gruppe, egal wie groß',
      big: 'Sechs Freunde auf Motorrädern oder ein Treffen mit zweiundzwanzig. Der Ort fasst immer die ganze Runde.',
      desc: 'Es geht nicht um die Zahl. Bis zu {maxHostu} schlafen hier bequem, aber eine Familie, ein Freundeskreis oder eine kleinere Gruppe passen genauso gut — das ganze Haus und Grundstück gehören immer nur euch.',
    },
    /* ===================== JEN ZIMA — „Lyžování odsud" (#lyzovani) =====================
       Zdroj: strukturální rešerše okolních areálů, ověřeno 7/2026.
       DO TÉTO VĚTVE NIKDY NEPIŠ: ceny skipasů, jízdní řády, provozní a otevírací
       doby, počty aktuálně otevřených vleků, „skibus zdarma" jako tvrdé tvrzení,
       „zelené sjezdovky" (všechny tři ve Svobodě jsou MODRÉ), konkrétní dny
       a časy večerního lyžování ani počet areálů na skipas jako tvrdé číslo —
       provozovatel si v těchto údajích na vlastním webu protiřečí a zastaralý
       údaj je horší než žádný (host podle něj plánuje den).
       Čísla u vleků a sjezdovek jsou INSTALOVANÝ stav, ne garance provozu. */
    ski: {
      eyebrow: 'Skifahren · SkiResort Černá hora – Pec',
      title: 'Skifahren von hier aus',
      note: 'Wir veröffentlichen nur, was sich zwischen den Saisons nicht ändert. Preise, Fahrpläne und Öffnungszeiten hat der Betreiber.',
      local: {
        tag: '1,9 km vom Haus',
        name: 'Ein Skigebiet direkt in Svoboda nad Úpou',
        desc: 'Die nächsten Pisten liegen nicht „irgendwo in den Bergen" — sie liegen im selben Städtchen wie das Haus. Mit dem Auto fünf Minuten, zu Fuß unter einer halben Stunde. Es ist das kleinste Gebiet des Resorts, und genau deshalb passt es für Kinder und Anfänger, während der Rest der Gruppe an die großen Hänge fährt.',
        specs: [
          'blaue (leichte) Pisten, je rund 350 m',
          'Schlepplifte — eine Seilbahn gibt es hier nicht',
          'mit dem Auto vom Haus — 1,9 km über die Straße',
        ],
        school: 'Im Gebiet gibt es eine Skischule, einen Verleih und ein Förderband für Kinder.',
        snow: 'Ehrlich gesagt: Es ist das am tiefsten gelegene Gebiet des Resorts (etwa 530–600 m), sein Betrieb hängt also ganz an Schnee und Beschneiung und die Saison ist kürzer als weiter oben. Bevor ihr den ganzen Aufenthalt darauf baut, prüft bitte, ob es läuft.',
      },
      resorts: {
        title: 'Ein Skipass, mehrere Skigebiete',
        lead: 'Das Haus liegt im Gebiet des SkiResorts ČERNÁ HORA – PEC, wo laut Betreiber ein Skipass in mehreren Skigebieten gilt. Fahrzeiten mit dem Auto ab Svoboda nad Úpou:',
      },
      rows: {
        cernaHora: 'das größte Gebiet des Resorts',
        velkaUpa: 'Kinderpark an der Talstation',
        cernyDul: 'Gebirgsübergang über einen Sattel — kurvige Straße, plant Reserve ein',
        pec: 'das zweitgrößte Gebiet, Pisten aller Schwierigkeiten',
        malaUpa: 'anderer Betreiber — bitte die Gültigkeit des Skipasses prüfen',
      },
      notes: {
        connect: { t: 'Die Gebiete sind nicht per Piste verbunden',
          b: 'Erwartet kein zusammenhängendes Skigebiet. Die einzige Skiverbindung ist die SkiTour von der Černá hora nach Pec — sie funktioniert nur in eine Richtung, und auf zwei von vier Abschnitten zieht euch eine Pistenraupe; zurück geht es mit dem Skibus. Zwischen den übrigen Gebieten fährt man mit dem Auto oder dem Skibus, verbunden sind sie durch den gemeinsamen Skipass.' },
        skibus: { t: 'Skifahren geht auch ohne Auto',
          b: 'Der Hauptlinien-Skibus des SkiResorts hält direkt in Svoboda nad Úpou — unter anderem Maršov II, Maršov I, Sokolovna, Busbahnhof und Hotel PROM. Linienumfang und Beförderungsbedingungen ändern sich von Saison zu Saison, bitte beim Betreiber prüfen.' },
        evening: { t: 'Nachtskilauf',
          b: 'In der Saison wird er auf beleuchteten Pisten angeboten; die längste davon ist die Protěž an der Černá hora — laut Betreiber 1,6 km. Konkrete Tage und Zeiten ändern sich, den aktuellen Plan hat der Betreiber.' },
      },
      plan: {
        title: 'Wenn nicht Ski gefahren wird',
        lead: 'In einer größeren Gruppe fährt immer jemand nicht Ski — und von sieben Nächten sind realistisch vier bis fünf Skitage. Das hier ist der Rest des Programms.',
        tiles: [
          { n: 'Aquacentrum Janské Lázně', m: 'Hallenbad, zu Fuß erreichbar' },
          { n: 'Loipen', m: 'Einstiege an der Černá hora, ≈ 4 km mit dem Auto' },
          { n: 'Glashütte Harrachov', m: 'Führung im Warmen, ≈ 50 Min. mit dem Auto' },
          { n: 'Festung Stachelberg', m: 'unterirdische Befestigung bei Trutnov' },
          { n: 'Aquapark Karpacz (PL)', m: 'großes Hallenbad-Erlebnisbad, ≈ 45 Min. mit dem Auto' },
        ],
      },
      cta: 'Winterziele im Planer',
      ctaSub: 'Karte, Filter und ein Tipp für einen konkreten Tag — ohne Anmeldung.',
    },
    lokalita: {
      eyebrow: 'Lage · Svoboda nad Úpou',
      title: 'In den Bergen, nicht am Ende der Welt.',
      lead: 'Wir stehen in Svoboda nad Úpou, 150 Meter vom Zentrum — Laden, Restaurant, Bahn und Bus schafft ihr zu Fuß. Und die Schneekoppe ist zwanzig Autominuten entfernt.',
      leadWinter: 'Der Skibus zum SkiResort Černá hora–Pec hält 200 Meter vom Tor — zu den Liften kommt ihr ohne Auto und ohne Parkplatzsuche. Das Auto kann dann die ganze Woche auf dem Grundstück stehen bleiben. Aktuellen Tarif und Fahrplan veröffentlicht der Betreiber.',
      /* Letní sada — viz komentář u české větve (doorstepSummer). */
      doorstepSummer: [
        { num: '150 m', label: 'ins Zentrum von Svoboda — Laden, Restaurant und Bahnhof zu Fuß' },
        { num: '20 min', label: 'mit dem Auto zur Schneekoppe — hinauf per Seilbahn oder zu Fuß' },
        { num: '4 km', label: 'Janské Lázně — Baumwipfelpfad und Gondel auf die Černá hora' },
        { num: '11 km', label: 'Trutnov — Freibad, Kletterwand und die großen Geschäfte' },
      ],
      /* Zimní sada — skibus a sjezdovky jsou tu to hlavní. */
      doorstep: [
        { num: '150 m', label: 'ins Zentrum von Svoboda — etwa zwei Minuten zu Fuß' },
        { num: '200 m', label: 'zur Skibus-Haltestelle — keine drei Minuten zu Fuß' },
        { num: '2 h', label: 'rund aus Prag und aus Breslau, drei aus Dresden' },
        { num: '4 km', label: 'zu den Pisten der Černá hora — der Skibus hält am Haus' },
      ],
      mapTitle: ['{n} erprobter Ausflug in drei Ringen', '{n} erprobte Ausflüge in drei Ringen'],
      mapNote: 'Die Entfernungen auf der Karte stimmen, das Gelände ist gezeichnet. Der Ring um die Villa hat drei Kilometer Radius Luftlinie.',
      legend: '◆ Villa Rudolf · ○ zu Fuß erreichbar · ┄ Grenze zu Polen · Zeiten und Entfernungen gelten auf der Straße',
      mapAlt: 'Gezeichnete Karte der Umgebung: Villa Rudolf in Svoboda nad Úpou, Schneekoppe, Janské Lázně, Pec pod Sněžkou, Trutnov und die Grenze zu Polen.',
      rings: [
        { name: 'Zu Fuß vom Tor', count: ['{n} Ziel', '{n} Ziele'],
          body: 'Janské Lázně und der Baumwipfelpfad, das Hallenbad Aquacentrum, Lamatrekking auf einer Familienfarm, der Farmapark Muchomůrka, die Märchenausstellung Do Krakonošova, Adventure-Minigolf und ein Schießstand. Für keines davon braucht ihr das Auto.',
          link: 'Im Planer ansehen →' },
        { name: 'Bis 30 Autominuten', count: ['{n} Ziel', '{n} Ziele'],
          body: 'Die Schneekoppe per Seilbahn oder zu Fuß, die Černá hora per Gondel, der Obří důl auch mit Kinderwagen, die Sommerrodelbahn in Pec, Aussichtstürme, der Buchenurwald Rýchory, Freibad und Kletterwand in Trutnov.',
          link: 'Im Planer ansehen →' },
        { name: 'Für einen ganzen Tag', count: ['{n} Ziel', '{n} Ziele'],
          body: 'Die Adersbacher Felsenstadt, der Safari-Park Dvůr Králové, die Glashütte Harrachov mit den Mumlava-Wasserfällen und der Aquapark Tropikana im polnischen Karpacz — dorthin die Ausweise mitnehmen, auch für die Kinder.',
          link: 'Im Planer ansehen →' },
      ],
      arrive: [
        { id: 'praha', k: 'Prag', v: 'rund 2 Stunden mit dem Auto' },
        { id: 'wroclaw', k: 'Breslau (PL)', v: 'rund 2 Stunden mit dem Auto' },
        { id: 'dresden', k: 'Dresden', v: 'rund 3 Stunden mit dem Auto' },
        { id: 'train', k: 'Mit der Bahn', v: 'Bahnhof Svoboda nad Úpou, zu Fuß zum Haus' },
        { id: 'bus', k: 'Mit dem Bus', v: 'Haltestelle im Ort, zu Fuß zum Haus' },
        { id: 'skibus', k: 'Skibus', v: 'Haltestelle 200 m vom Tor; Tarif beim Betreiber prüfen' },
        { id: 'parking', k: 'Parken', v: 'direkt auf dem Grundstück, hinter dem Tor' },
      ],
      arriveTransitWinter: { id: 'transit', k: 'Bahn & Bus', v: 'Bahnhof und Haltestelle im Ort, zu Fuß zum Haus' },
      arriveCarSummer: { id: 'car', k: 'Mit dem Auto', v: 'rund 2 Stunden aus Prag und Breslau, 3 aus Dresden' },
      mapLabels: {
        villa: 'Villa Rudolf', villaSub: 'Svoboda nad Úpou',
        snezka: 'Schneekoppe', snezkaMeta: '1603 m',
        pec: 'Pec pod Sněžkou', pecMeta: '10 km',
        cernaHora: 'Černá hora', cernaHoraMeta: 'Pisten 4 km',
        janskeLazne: 'Janské Lázně', janskeLazneMeta: '4 km',
        trutnov: 'Trutnov', trutnovMeta: '11 km',
        hmarsov: 'Horní Maršov', obriDul: 'Obří důl', rychory: 'Rýchory', mladeBuky: 'Mladé Buky',
        upa: 'Úpa', polsko: 'POLEN', ring: 'ZU FUSS VOM TOR',
        praha: 'Prag ≈ 2 h', vratislav: 'Breslau ≈ 2 h', drazdany: 'Dresden ≈ 3 h',
        adrspach: 'Adersbacher Felsen 45 Min.', safari: 'Safari Dvůr Králové 30 Min.',
        scale: '0 — 2 km', north: 'N',
      },
    },
    tour: {
      eyebrow: 'Drinnen & draußen',
      title: 'Schaut euch drinnen und draußen um — in vollem 360°',
      hint: 'Mit Maus oder Finger greifen und ziehen. Räume unten wechseln; die Szenen wechseln auch von selbst.',
      drag: 'Greifen & umsehen',
      scenes: [
        { name: 'Verschneiter Hof', desc: 'Der Hof nach starkem Schneefall — eine freigefahrene Spur zwischen verschneiten Fichten, Eiszapfen am Dach und Platz für die Autos der ganzen Gruppe.' },
        { name: 'Eingangshalle', desc: 'Die Eingangshalle mit Schuhregal und Treppe nach oben — von hier geht es in den Essbereich und zu den Zimmern im Erdgeschoss.' },
        { name: 'Schuhregal und Treppe', desc: 'Ein hohes Schuhregal gleich hinter der Tür und die Treppe nach oben. Durch die Glastür geht es direkt in den Essbereich — die Schuhe der ganzen Gruppe bleiben hier.' },
        { name: 'Hauptküche mit Essbereich', desc: 'Die gemeinsame Küche mit langem Holztisch für die ganze Gruppe, Küchenzeile entlang der Wand und großen Fenstern zum Garten — das gesellige Herz des Hauses.' },
        { name: 'Zimmer 1 (2 Betten)', desc: 'Doppelbett mit beleuchtetem Kopfteil, gesprenkelte Tapete und ein Erker mit drei Fenstern zum Garten. Eigenes Bad.' },
        { name: 'Zimmer 1 — Bad', desc: 'Das Bad von Zimmer 1 — Duschkabine, Waschbecken mit Spiegelschrank und WC.' },
        { name: 'Zimmer 2 (3+1 Betten)', desc: 'Doppelbett und Einzelbett, graue Webtapete hinter dem beleuchteten Kopfteil, Tisch mit Bänken und zwei Fenster. Eigenes Bad nebenan.' },
        { name: 'Zimmer 2 — Bad', desc: 'Das Bad von Zimmer 2 — Viertelkreis-Duschkabine, Waschbecken auf Holzunterschrank mit Spiegel, WC und beheizter Handtuchhalter.' },
        { name: 'Zimmer 3 (3+1 Betten)', desc: 'Doppelbett und Einzelbett unter der Dachschräge, goldene Blättertapete hinter dem beleuchteten Kopfteil. Eigenes Bad direkt vom Zimmer.' },
        { name: 'Zimmer 3 — Fenster zum Pooltunnel', desc: 'Dasselbe Zimmer 3 vom zweiten Fenster aus: eine tiefe dunkelrote Fensterbank und gleich hinter dem Glas der verglaste Tunnel über dem Pool. Hoher Kleiderschrank und eine Tür direkt in die Eingangshalle.' },
        { name: 'Zimmer 3 — Bad', desc: 'Das Bad von Zimmer 3 — Duschkabine, Waschbecken und ein Fenster zum Garten.' },
        { name: 'Flur im 1. Obergeschoss', desc: 'Der Treppenabsatz mit Einbauschränken und drei Fenstern — von hier führen Türen ins Zimmer und ins Apartment.' },
        { name: 'Zimmer 4 (2 Betten)', desc: 'Doppelbett in einer gewölbten Nische zwischen Holzsäulen, Erkerfenster mit Holzbank. Eigenes Bad.' },
        { name: 'Zimmer 4 — Blick vom Bett', desc: 'Dasselbe Zimmer 4 vom Kopfende des Bettes: die gewölbte Nische mit marmorierter Tapete und das beleuchtete Lattenkopfteil aus der Nähe, dahinter das ganze Zimmer bis zum Fenster mit Vorhängen, dem Bergbild, dem kleinen Fenster in der Fachwerkwand und der offenen Tür ins eigene Bad.' },
        { name: 'Zimmer 4 — Bad', desc: 'Das Bad von Zimmer 4 — Duschkabine, Waschbecken, WC und Waschmaschine.' },
        { name: 'Apartment — Wohnbereich', desc: 'Der eigene Wohnbereich der Suite: eine lange Sitzgruppe unter den Balken, ein großer Tisch, TV und die Treppe zu den Dachzimmern.' },
        { name: 'Apartment — Küchenzeile', desc: 'Die eigene Küchenzeile der Suite mit Backofen und Kochfeld — das Apartment versorgt sich selbst und teilt die Hauptküche nicht.' },
        { name: 'Apartment — Schlafzimmer A', desc: 'Das erste der drei Schlafzimmer der Suite, im 1. Obergeschoss: Doppelbett und geometrische Tapete hinter dem beleuchteten Kopfteil.' },
        { name: 'Apartment — Schlafzimmer B', desc: 'Ein Dachschlafzimmer der Suite — Doppelbett und Einzelbett mit ausziehbarem Zweitbett unter der Schräge, Kommode und Nachttisch. Damit kommt die Suite auf 10 Betten.' },
        { name: 'Apartment — Schlafzimmer C', desc: 'Das größte Dachschlafzimmer der Suite: Doppelbett und zwei Einzelbetten unter der Schräge und ein Gaubenfenster.' },
        { name: 'Wellness an der Sauna', desc: 'Der Raum vor der Sauna — Bank zum Abkühlen, Dusche und die Tür in die finnische Sauna. Ganz allein für eure Gruppe.' },
        { name: 'In der Sauna', desc: 'Im Inneren der geheizten finnischen Sauna — helle Holzbänke und der Ofen.' },
        { name: 'Skiraum', desc: 'Ein eigener Skiraum im Untergeschoss — Ständer für Ski und Snowboards und Halterungen für Skischuhe. Die Ausrüstung bleibt unten statt in den Zimmern.' },
        { name: 'Garten im Winter', desc: 'Der verschneite Garten vom Pavillon zurück zum Haus — hohe Fichten, ausgetretene Pfade und die Berge über den Dächern.' },
        { name: 'Pavillon mit Grills', desc: 'Derselbe Pavillon wie im Sommer, nur unter Schnee: massives Holzdach, der Grilltresen an der Wand und offene Seiten in den Garten.' },
      ],
      scenesSummer: [
        { name: 'Ankunft an der Villa', desc: 'Der Stellplatz hinter dem Tor, auf dem die ganze Gruppe parkt, und das Haus am Ende der Zufahrt zwischen hohen Bäumen.' },
        { name: 'Garten mit Pool', desc: 'Über den Rasen zum Haus, der überdachte Pool mit seiner Liegenreihe und die Feuerstelle aus Gabionen unter dem Hang.' },
        { name: 'Überdachter Pool', desc: 'Der überdachte beheizte Pool mit Liegenreihe direkt am Haus, ringsum euer eigener Rasen.' },
        { name: 'Holzterrasse', desc: 'Eine Eichenterrasse über der Gabionenwand — ein Tisch für die ganze Gruppe mit Blick auf Pavillon und Berge.' },
        { name: 'Pavillon mit Grills', desc: 'Unter massivem Holzdach: der lange Tisch, ein gemauerter Grilltresen und offene Seiten in den Garten.' },
        { name: 'Spielplatz', desc: 'Hängebrücke, Klettergerüst und eine kleine Kletterwand in Sichtweite des Hauses — die Kinder haben ihre eigene Ecke auf dem Grundstück.' },
        { name: 'Feuerstelle am Abend', desc: 'Nach Sonnenuntergang leuchten Gabionen und Stufen von selbst — Sessel um die Feuerstelle, dahinter der beleuchtete Pool.' },
      ],
      groupsLabel: 'Szenengruppen', groupAll: 'Alle',
      stripLabel: 'Szenen der 360°-Tour', stripPrev: 'Vorherige Vorschaubilder', stripNext: 'Nächste Vorschaubilder',
      groups: { ground: 'Erdgeschoss', floor1: '1. Obergeschoss', floor2: 'Dachgeschoss', basement: 'Untergeschoss', extSummer: 'Außen — Sommer', extWinter: 'Außen — Winter' },
    },
    gallery: { eyebrow: 'Galerie', title: 'Haus, Grundstück, Umgebung', note: 'Alle Fotos ({n}) · zum Vergrößern klicken' },
    vylety: {
      eyebrow: 'Ausflugsplaner', title: 'Die Berge beginnen vor der Tür', note: 'Wir wählen nach Saison · {n} geprüfte Ziele bis zu einer Stunde vom Haus.', drop: 'Hier kommt ein Ausflugsfoto', cta: 'Ausflugsplaner öffnen', ctaSub: 'Ohne Registrierung. Karte, Filter und ein Tipp für einen konkreten Tag.',
      items: [
        { tag: 'Ganzjährig', name: 'Schneekoppe', desc: 'Der höchste Gipfel Tschechiens — zu Fuß über die Kämme oder mit der Seilbahn ab Pec pod Sněžkou.' },
        { tag: 'Wandern', name: 'Kammwege & Wasserfälle', desc: 'Markierte Routen von leichten Runden bis zu Tagestouren. Der Mumlava-Wasserfall klappt auch mit Kindern.' },
        { tag: 'Gemütlich', name: 'Hochmoor auf der Černá hora', desc: 'Bohlenwege über ein Bergmoor auf der Černá hora. Hinauf mit der Gondel, dann ein ebener Spaziergang.' },
        { tag: 'Mit Kindern', name: 'Baumwipfelpfad', desc: 'Der Wipfelpfad über Janské Lázně — im Ring der Ziele, für die ihr kein Auto braucht.' },
      ],
    },
    book: {
      summary: 'Euer Aufenthalt', pick: 'Wählt den Termin im Kalender',
      total: 'Gesamt', deposit: '30 % Anzahlung',
      cleaning: 'Endreinigung', cityTax: 'Kurtaxe',
      depositReq: '%P% % Anzahlung nach Bestätigung',
      minStay: '%S% nehmen wir Aufenthalte ab %N% Nächten an. Bitte wählt einen längeren Zeitraum.',
      guestMax: 'Bis zu %N% Gäste (Erwachsene + Kinder zusammen).',
      pay: 'Aufenthaltsanfrage senden', stripeNote: 'Die Anfrage ist unverbindlich — ihr zahlt jetzt nichts. Wir bestätigen den Termin persönlich und senden danach einen Zahlungslink für die Anzahlung.',
      consent: 'Mit dem Absenden der Anfrage akzeptiert ihr die <a href="/podminky/" target="_blank" rel="noopener">Buchungsbedingungen und die Verarbeitung eurer personenbezogenen Daten</a>.',
      free: 'Frei', booked: 'Belegt', chosen: 'Euer Aufenthalt', checkoutOnly: 'nur Abreise', demo: 'Beispielverfügbarkeit — wird ans Buchungssystem angebunden',
      availFail: 'Verfügbarkeit konnte nicht geladen werden.',
      priceHeading: 'Preisliste', pricePerNight: '/ Nacht', priceMin: 'min.',
      priceWeekend: 'Wochenende (2 Nächte)', weekendRate: 'Wochenendpreis',
      priceOffRange: 'April, November und 1.–14. Dezember',
      priceSummerFull: 'Der Sommer %Y% ist fast ausgebucht — es sind nur noch einzelne Termine frei.',
      priceXmas: 'Weihnachten & Silvester', priceXmasVal: 'individueller Preis, bitte anfragen',
      priceMinStay: 'Mindestaufenthalt %N% %NB%',
      priceCityTax: 'Kurtaxe %A% pro Erwachsenem und Nacht (Kinder frei)',
      pricePet: 'Hund / Haustier %P% pro Aufenthalt',
      priceBond: 'Rückzahlbare Kaution %B% — die Endreinigung wird davon abgezogen',
      petFee: 'Hund / Haustier',
      priceCleaning: 'Endreinigung (einmalig)', priceDeposit: '%P%% Anzahlung, erst nach Bestätigung des Termins', priceFxNote: 'ca.-Werte, Zahlung in CZK',
      sending: 'Senden…', prevMonths: 'Vorherige Monate', nextMonths: 'Nächste Monate',
      okTitle: 'Anfrage erhalten',
      okBody: 'Wir melden uns innerhalb von 24 Stunden. Ihr zahlt noch nichts — wir bestätigen den Termin persönlich per E-Mail.',
      okAgain: 'Weitere Anfrage senden',
      errRequired: 'Bitte gebt eure E-Mail an und wählt einen gültigen Zeitraum.',
      errEmail: 'Bitte prüft eure E-Mail-Adresse.',
      errRate: 'Wir haben zu viele Anfragen erhalten. Bitte versucht es später erneut oder schreibt uns eine E-Mail.',
      errGeneric: 'Senden fehlgeschlagen. Bitte versucht es erneut oder schreibt an rezervace@villarudolf.com.',
    },
    video: { eyebrow: 'Video', title: 'Sehen Sie die Villa im Video', note: 'Das Video läuft von selbst und ohne Ton. Die Untertitel sind fest im Bild; den Ton schalten Sie per Taste ein, springen können Sie über die Zeitleiste.', summer: 'Haus, Garten, Pool & Anreise', winter: 'Hausführung, Sauna & Skibus', start: 'Video abspielen', soundOn: 'Ton einschalten', soundOff: 'Ton aus', onYoutube: 'Auf YouTube ansehen' },
    share: { eyebrow: 'Leben in der Villa', title: 'So sieht es bei uns aus', body: 'Werfen Sie auf unserem Instagram einen Blick in den Alltag der Villa — der Wechsel der Jahreszeiten, Abende am Feuer und Momente unserer Gäste. Und wenn Sie bei uns waren, markieren Sie @villarudolfretreat und #villarudolf, damit auch andere Ihre Fotos sehen.', ig: 'Auf Instagram folgen' },
    cta: {
      eyebrow: 'Buchung', title: 'Bucht das ganze Haus für eure Gruppe',
      body: 'Wählt An- und Abreise im Kalender, seht die Preisaufstellung und sendet uns eine unverbindliche Aufenthaltsanfrage. Wir bestätigen euren Termin persönlich.',
      lblAdults: 'Erwachsene', lblChildren: 'Kinder', lblPets: 'Haustiere',
      lblName: 'Name', phName: 'Euer Name',
      lblEmail: 'E-Mail', phEmail: 'du@email.de',
      lblPhone: 'Telefon / WhatsApp', phPhone: '+420… (optional)',
      lblMessage: 'Nachricht an den Gastgeber', phMessage: 'Was wir wissen sollten — Kinderzahl, Ankunftszeit, Wünsche… (optional)',
    },
    mail: { subject: 'Villa Rudolf — Aufenthaltsanfrage', dates: 'Termin', nights: 'Nächte', breakdown: 'Preisaufstellung', cleaning: 'Endreinigung', cityTax: 'Kurtaxe', guests: 'Gäste', adults: 'Erwachsene', children: 'Kinder', pets: 'Haustiere', total: 'Gesamt', deposit: '30 % Anzahlung (nach Bestätigung)', from: 'Kontakt-E-Mail', phone: 'Telefon / WhatsApp', greeting: 'Guten Tag, ich möchte einen Aufenthalt in der Villa Rudolf zu diesem Termin anfragen:' },
    footer: { tagline: 'Ein privates Berganwesen für große Gruppen im Herzen des Riesengebirges.', langLabel: 'Sprache', contact: 'Kontakt', rights: '© 2026 Villa Rudolf', social: 'Folgt uns', host: 'Pavel — euer Gastgeber', region: 'Riesengebirge, Tschechien', terms: 'Buchungsbedingungen & Datenschutz', guide: 'Ausflugsplaner' },
    prebook: {
      title: 'Was Sie vor der Buchung wissen sollten', link: 'Alle Praxis-Infos →',
      facts: [
        { k: 'Kapazität', v: '{minHostu}–{maxHostu} Gäste in {loznice} Schlafzimmern' },
        { k: 'Privatsphäre', v: 'Ganzes Haus und Grundstück, nur Ihre Gruppe' },
        { k: 'Check-in / -out', v: 'Check-in ab 15:00 · Check-out bis 10:00' },
        { k: 'Haustiere', v: 'Hunde gegen Gebühr willkommen' },
        { k: 'Parken', v: 'Kostenlos direkt auf dem Grundstück hinter dem Tor' },
        { k: 'Skifahren', v: 'Pisten Černá hora 4 km · Skibus-Haltestelle 200 m' },
      ],
    },
  },

  pl: {
    photoSoon: 'Zdjęcie wkrótce',
    meta: {
      title: 'Villa Rudolf – cały dom dla {minHostu}–{maxHostu} osób | Karkonosze',
      desc: 'Cały dom i posesja tylko dla grupy {minHostu}–{maxHostu} osób w Svobodzie nad Úpą. {loznice} sypialni, {koupelny} łazienek, {pozemek} m², sauna, narciarnia. Narty i basen sezonowo.',
      locale: 'pl_PL',
    },
    nav: { dum: 'Dom', loznice: 'Wnętrza', lyzovani: 'Narty', vybaveni: 'Udogodnienia', galerie: 'Galeria', ohniste: 'Palenisko', lokalita: 'Lokalizacja', vylety: 'Wycieczki', info: 'Informacje praktyczne', cta: 'Zarezerwuj termin' },
    hero: {
      eyebrow: 'Cały dom tylko dla waszej grupy · Karkonosze',
      eyebrowWinter: 'Narty tuż za rogiem · Karkonosze',
      h1: 'Prywatna willa w Karkonoszach dla {minHostu}–{maxHostu} gości',
      sub: 'Całe to miejsce — dom i rozległa posesja — jest <em>tylko wasze</em>.',
      subWinter: 'Narty tuż za rogiem — <em>skibus przy domu</em>, Černá hora 4 km.',
      ctaSec: 'Zobacz dom', badge: 'Wolne terminy 2026', video: 'Odtwórz wideo',
      summer: 'Lato', winter: 'Zima',
      nightLine: 'Zapadła noc. Palenisko, ściana gabionowa i basen zapaliły się same — wieczór dopiero się zaczyna.',
    },
    facts: {
      loznice:        { k: '{loznice}', v: 'sypialni' },
      koupelny:       { k: '{koupelny}', v: 'łazienek i WC' },
      luzka:          { k: '{luzka}', v: 'miejsc — {luzkaDetail} dostawki' },
      plocha:         { k: '{plocha} m²', v: 'powierzchnia' },
      wellnessSummer: { k: 'Basen + sauna', v: 'kryty ogrzewany basen i prywatna sauna' },
      wellnessWinter: { k: 'Sauna + narciarnia', v: 'prywatna sauna, narciarnia w domu' },
      parking:        { k: 'Własny parking', v: 'na posesji tuż przy wejściu, za własną bramą' },
    },
    ratings: { eyebrow: 'Oceny gości', reviewsWord: 'recenzji', verified: 'zweryfikowano' },
    direct: {
      badge: '<b>Rezerwacja bezpośrednia = najlepsza cena.</b> O 5% taniej niż na platformach. Osobiste podejście i uczciwe warunki anulacji.',
      book: '<b>Rezerwacja bezpośrednia = najlepsza cena.</b> O 5% taniej niż na platformach. Osobiste podejście i uczciwe warunki anulacji.',
      sidebar: 'Rezerwacja bezpośrednia — o 5% taniej niż na platformach.',
    },
    statement: {
      eyebrow: 'Cały teren tylko dla was',
      title: 'Za bramą jesteście tylko wy.',
      lead: 'Nie rezerwujecie pokoi w domu, w którym mieszka jeszcze ktoś inny. Bierzecie całą posesję — dom, ogrodzony park, saunę, altanę i palenisko. <span class="vr-sm-hide">Żadnej recepcji, żadnych obcych przy śniadaniu, żadnego czekania, aż zwolni się sauna.</span>',
      stats: [
        { num: '{pozemek} m²', label: 'ogrodzonego parku tylko dla waszej grupy' },
        { num: '1 stół', label: 'na tyle duży, że siada przy nim cała ekipa naraz' },
        { num: '1 grupa', label: 'na terenie jest zawsze tylko jedna, nigdy dwie naraz' },
        { num: '0', label: 'przestrzeni dzielonych z obcymi' },
      ],
    },
    band: { eyebrow: 'Jeden wieczór tutaj' },
    /* ===================== VYBAVENÍ — JEDEN SEZNAM, DVĚ ŘAZENÍ =====================
       Oddělený blok „A k tomu celoročně" je zrušen; položky mají jediné znění
       a pořadí jim dává CSS `order` podle sezóny (viz .vr-amen v site.css):
         zima: lyžárna → sauna → kuchyně → ohniště → altán → kulečník → apartmá
         léto: bazén → altán → hřiště → sauna → kuchyně → ohniště → kulečník → apartmá
       Texty jsou CELOROČNÍ (vrstva A): žádné sezónní slovo. Sezónnost je
       vlastností DAT (data-season-only v HTML), ne věty v textu — právě proto
       už nemůže vzniknout další „bazén v mrazu". */
    amenities: {
      eyebrow: 'Wyposażenie', title: 'Komfort, który trzyma grupę razem', drop: 'Przeciągnij tu zdjęcie',
      items: {
        pool:     { tag: 'Wellness', name: 'Zadaszony podgrzewany basen', desc: 'Basen pod dachem z podgrzewaną wodą — w sezonie letnim czynny przy każdej pogodzie, nawet gdy pada. Po kąpieli prosto do sauny.' },
        skiroom:  { tag: 'Narty', name: 'Narciarnia', desc: 'Osobne pomieszczenie tylko na narty i buty: stojaki na narty i deski, wieszaki na buty i zmywalna podłoga. Mokry sprzęt zostaje na dole i nie trafia do pokoi — zimą to pytanie, które dostajemy najczęściej.' },
        sauna:    { tag: 'Wellness', name: 'Prywatna sauna fińska', desc: 'Sauna fińska tylko dla waszej grupy, z przedsionkiem i prysznicem. Bez dzielenia, bez okienek czasowych.' },
        kitchen:  { tag: 'Razem', name: 'Kuchnia i stół dla całej grupy', desc: 'W pełni wyposażona kuchnia i duży drewniany stół, przy którym zmieścicie się wszyscy naraz.' },
        firepit:  { tag: 'Na zewnątrz', name: 'Palenisko ze ścianą gabionową', desc: 'Nowo ukończone otwarte palenisko mieści całą grupę. Po zmroku podświetla się samo — ciepło pod gołym niebem.' },
        altan:    { tag: 'Na zewnątrz', name: 'Duża altana z grillem', desc: 'Zadaszone miejsce z blatem grillowym i stołem, przy którym zmieści się cała grupa naraz. Dach trzyma, czy pada deszcz, czy śnieg.' },
        hriste:   { tag: 'Dla rodzin', name: 'Plac zabaw', desc: 'Drabinki, mała ścianka wspinaczkowa i ścianka linowa. Dzieci mają swój kąt w zasięgu wzroku od altany.' },
        billiard: { tag: 'W środku', name: 'Bilard', desc: 'Stół bilardowy w apartamencie Suite — na leniwe popołudnie i na turniej po kolacji.' },
        lounge:   { tag: 'W środku', name: 'Część dzienna apartamentu', desc: 'Długa kanapa pod belkami i duży stół — apartament Suite ma własną przestrzeń wspólną.' },
      },
    },
    bedrooms: {
      eyebrow: 'Wnętrza',
      title: 'Dom od środka',
      note: '{loznice} sypialni, {koupelny} łazienek, duża kuchnia, sauna i wellness — cały dom na zdjęciach.',
      noBunk: 'Bez łóżek piętrowych — spokojniejszy sen, także dla rodziców z małymi dziećmi.',
      rooms: [
        { name: 'Apartament Suite', cap: 'do 10 gości', beds: '3 sypialnie z łóżkami małżeńskimi, 2 pojedyncze łóżka i 1 łóżko z wysuwanym drugim · własny aneks kuchenny i stół bilardowy · łazienka' },
        { name: 'Pokój 1', cap: '2 gości', beds: 'Łóżko małżeńskie · łazienka' },
        { name: 'Pokój 2', cap: 'do 4 gości', beds: 'Łóżko małżeńskie i 2 osobne łóżka (jedno pełnowymiarowa dostawka) · łazienka' },
        { name: 'Pokój 3', cap: 'do 4 gości', beds: 'Łóżko małżeńskie i 2 osobne łóżka (jedno pełnowymiarowa dostawka) · łazienka' },
        { name: 'Pokój 4', cap: '2 gości', beds: 'Łóżko małżeńskie · łazienka' },
      ],
    },
    interior: {
      hint: 'Przeciągnij myszą lub palcem · dotknij, aby powiększyć',
      open360: 'Otwórz w spacerze 360° po domu',
      rosterTitle: 'Gdzie będziecie spać',
      rosterNote: '{luzka} miejsc do spania — {luzkaDetail} dostawki. Rozkład, według którego podzielicie grupę.',
      items: { kitchen: 'Kuchnia i jadalnia', suite: 'Apartament Suite', room1: 'Pokój 1', room2: 'Pokój 2', room3: 'Pokój 3', room4: 'Pokój 4', sauna: 'Sauna fińska', wellness: 'Wellness i prysznic', bath: 'Prysznic przy saunie', bath2: 'Łazienka – Pokój 2', bath3: 'Łazienka – Pokój 3', bath4: 'Łazienka – Pokój 4' },
    },
    ohniste: {
      eyebrow: 'Nowy element', caption: 'Detal paleniska i ściany gabionowej',
      title: 'Palenisko ze ścianą gabionową, które ożywa nocą',
      body: 'Nowo ukończone otwarte palenisko pomieści całą grupę. Masywna ściana gabionowa tworzy z nim jedną całość i po zmroku podświetla się automatycznie — światła same się zapalają i gasną. Centrum wieczorów pod gołym niebem.',
    },
    skupina: {
      eyebrow: 'Wasza grupa, niezależnie od wielkości',
      big: 'Sześciu kolegów na motocyklach albo zjazd dwudziestu dwóch. Miejsce zawsze pomieści całą ekipę.',
      desc: 'Nie chodzi o liczbę. Wygodnie śpi tu do {maxHostu} osób, ale rodzina, grono przyjaciół czy mniejsza grupa zmieszczą się równie dobrze — cały dom i posesja są zawsze tylko wasze.',
    },
    /* ===================== JEN ZIMA — „Lyžování odsud" (#lyzovani) =====================
       Zdroj: strukturální rešerše okolních areálů, ověřeno 7/2026.
       DO TÉTO VĚTVE NIKDY NEPIŠ: ceny skipasů, jízdní řády, provozní a otevírací
       doby, počty aktuálně otevřených vleků, „skibus zdarma" jako tvrdé tvrzení,
       „zelené sjezdovky" (všechny tři ve Svobodě jsou MODRÉ), konkrétní dny
       a časy večerního lyžování ani počet areálů na skipas jako tvrdé číslo —
       provozovatel si v těchto údajích na vlastním webu protiřečí a zastaralý
       údaj je horší než žádný (host podle něj plánuje den).
       Čísla u vleků a sjezdovek jsou INSTALOVANÝ stav, ne garance provozu. */
    ski: {
      eyebrow: 'Narty · SkiResort Černá hora – Pec',
      title: 'Narty stąd',
      note: 'Podajemy tylko to, co nie zmienia się z sezonu na sezon. Ceny, rozkłady i godziny otwarcia są u operatora.',
      local: {
        tag: '1,9 km od domu',
        name: 'Ośrodek narciarski w samej Svobodzie nad Úpou',
        desc: 'Najbliższe stoki nie są „gdzieś w górach" — są w tym samym miasteczku co dom. Autem pięć minut, pieszo niecałe pół godziny. To najmniejszy ośrodek resortu i właśnie dlatego pasuje na pierwsze narty dzieci i początkujących, kiedy reszta ekipy jedzie na duże stoki.',
        specs: [
          'niebieskie (łatwe) stoki, każdy około 350 m',
          'wyciągi orczykowe — kolei linowej tu nie ma',
          'autem od domu — 1,9 km drogą',
        ],
        school: 'W ośrodku działa szkółka narciarska, wypożyczalnia sprzętu i taśma dla dzieci.',
        snow: 'Uczciwie: to najniżej położony ośrodek resortu (mniej więcej 530–600 m), więc jego praca zależy od śniegu i naśnieżania, a sezon bywa krótszy niż wyżej w górach. Zanim oprzecie na nim cały pobyt, sprawdźcie, czy działa.',
      },
      resorts: {
        title: 'Jeden skipas, kilka ośrodków',
        lead: 'Dom leży w rejonie SkiResortu ČERNÁ HORA – PEC, gdzie według operatora jeden skipas obowiązuje w kilku ośrodkach. Dojazdy autem ze Svobody nad Úpou:',
      },
      rows: {
        cernaHora: 'największy ośrodek resortu',
        velkaUpa: 'strefa dziecięca przy dolnej stacji kolei',
        cernyDul: 'górski przejazd przez przełęcz — kręta droga, doliczcie zapas czasu',
        pec: 'drugi co do wielkości ośrodek, stoki wszystkich trudności',
        malaUpa: 'prowadzi go inna spółka — sprawdźcie ważność skipasu',
      },
      notes: {
        connect: { t: 'Ośrodki nie łączą się stokami',
          b: 'Nie liczcie na połączony ośrodek. Jedyne narciarskie połączenie to SkiTour z Černej hory do Pecu — działa tylko w jedną stronę, a na dwóch z czterech odcinków ciągnie was ratrak; z powrotem jedzie się skibusem. Między pozostałymi ośrodkami przejeżdża się autem albo skibusem, łączy je wspólny skipas.' },
        skibus: { t: 'Da się jeździć bez auta',
          b: 'Główna linia skibusu SkiResortu zatrzymuje się w samej Svobodzie nad Úpou — m.in. Maršov II, Maršov I, Sokolovna, dworzec autobusowy i hotel PROM. Liczba linii i warunki przewozu zmieniają się z sezonu na sezon, sprawdźcie je u przewoźnika.' },
        evening: { t: 'Jazda wieczorna',
          b: 'W sezonie odbywa się na oświetlonych stokach; najdłuższy z nich to Protěž na Černej horze — według operatora 1,6 km. Konkretne dni i godziny się zmieniają, aktualny plan ma operator.' },
      },
      plan: {
        title: 'Kiedy się nie jeździ',
        lead: 'W większej ekipie zawsze ktoś nie jeździ — a z siedmiu nocy realnie cztery do pięciu są narciarskie. To jest reszta programu.',
        tiles: [
          { n: 'Aquacentrum Janské Lázně', m: 'kryty basen, pieszo od domu' },
          { n: 'Trasy biegowe', m: 'wejścia przy Černej horze, ≈ 4 km autem' },
          { n: 'Huta szkła Harrachov', m: 'zwiedzanie w cieple, autem ≈ 50 min' },
          { n: 'Twierdza Stachelberg', m: 'podziemia fortyfikacji koło Trutnova' },
          { n: 'Aquapark Karpacz (PL)', m: 'duży kryty aquapark, autem ≈ 45 min' },
        ],
      },
      cta: 'Zimowe cele w planerze',
      ctaSub: 'Mapa, filtry i podpowiedź na konkretny dzień — bez rejestracji.',
    },
    lokalita: {
      eyebrow: 'Lokalizacja · Svoboda nad Úpou',
      title: 'W górach, a nie na końcu świata.',
      lead: 'Stoimy w Svobodzie nad Úpou, 150 metrów od centrum — sklep, restauracja, pociąg i autobus są w zasięgu spaceru. A Śnieżka jest stąd dwadzieścia minut samochodem.',
      leadWinter: 'Skibus do SkiResortu Černá hora–Pec zatrzymuje się 200 metrów od bramy — pod wyciągi dostaniecie się bez auta i bez szukania parkingu. Samochód może potem stać cały tydzień na terenie posesji. Aktualną taryfę i rozkład publikuje przewoźnik.',
      /* Letní sada — viz komentář u české větve (doorstepSummer). */
      doorstepSummer: [
        { num: '150 m', label: 'do centrum Svobody — sklep, restauracja i dworzec pieszo' },
        { num: '20 min', label: 'samochodem pod Śnieżkę — na górę kolejką albo pieszo' },
        { num: '4 km', label: 'Janské Lázně — ścieżka w koronach drzew i kolejka na Černą horę' },
        { num: '11 km', label: 'Trutnov — basen, ścianka wspinaczkowa i duże zakupy' },
      ],
      /* Zimní sada — skibus a sjezdovky jsou tu to hlavní. */
      doorstep: [
        { num: '150 m', label: 'do centrum Svobody — jakieś dwie minuty pieszo' },
        { num: '200 m', label: 'do przystanku skibusu — niecałe trzy minuty pieszo' },
        { num: '2 h', label: 'mniej więcej z Pragi i z Wrocławia, trzy z Drezna' },
        { num: '4 km', label: 'na stoki Černej hory — skibus staje przy domu' },
      ],
      mapTitle: ['{n} sprawdzona wycieczka w trzech kręgach', '{n} sprawdzone wycieczki w trzech kręgach', '{n} sprawdzonych wycieczek w trzech kręgach'],
      mapNote: 'Odległości na mapie są prawdziwe, teren jest rysowany. Krąg wokół willi ma promień trzech kilometrów w linii prostej.',
      legend: '◆ Villa Rudolf · ○ dokąd dojdziecie pieszo · ┄ granica z Polską · czasy i odległości liczone drogą',
      mapAlt: 'Rysowana mapa okolicy: Villa Rudolf w Svobodzie nad Úpou, Śnieżka, Janské Lázně, Pec pod Sněžkou, Trutnov i granica z Polską.',
      rings: [
        { name: 'Pieszo od bramy', count: ['{n} cel', '{n} cele', '{n} celów'],
          body: 'Janské Lázně i Ścieżka w koronach drzew, kryty basen Aquacentrum, trekking z lamami na rodzinnej farmie, farmapark Muchomůrka, bajkowa ekspozycja Do Krakonošova, adventure minigolf i strzelnica. Do żadnego z nich nie potrzebujecie auta.',
          link: 'Pokaż w planerze →' },
        { name: 'Do 30 minut samochodem', count: ['{n} cel', '{n} cele', '{n} celów'],
          body: 'Śnieżka kolejką lub pieszo, Černá hora gondolą, Obří důl nawet z wózkiem, tor saneczkowy w Pecu, wieże widokowe, bukowa puszcza Rýchory, kąpielisko i ścianka wspinaczkowa w Trutnovie.',
          link: 'Pokaż w planerze →' },
        { name: 'Na cały dzień', count: ['{n} cel', '{n} cele', '{n} celów'],
          body: 'Adršpašské skały, Safari Park Dvůr Králové, huta szkła Harrachov z wodospadami Mumlavy i aquapark Tropikana w Karpaczu — tam weźcie dokumenty także dla dzieci.',
          link: 'Pokaż w planerze →' },
      ],
      arrive: [
        { id: 'praha', k: 'Praga', v: 'około 2 godziny samochodem' },
        { id: 'wroclaw', k: 'Wrocław', v: 'około 2 godziny samochodem' },
        { id: 'dresden', k: 'Drezno', v: 'około 3 godziny samochodem' },
        { id: 'train', k: 'Pociągiem', v: 'stacja Svoboda nad Úpou, do domu pieszo' },
        { id: 'bus', k: 'Autobusem', v: 'przystanek w miasteczku, do domu pieszo' },
        { id: 'skibus', k: 'Skibus', v: 'przystanek 200 m od bramy; taryfę sprawdźcie u przewoźnika' },
        { id: 'parking', k: 'Parking', v: 'na terenie posesji, za bramą' },
      ],
      arriveTransitWinter: { id: 'transit', k: 'Pociąg i autobus', v: 'stacja i przystanek w miasteczku, do domu pieszo' },
      arriveCarSummer: { id: 'car', k: 'Samochodem', v: 'z Pragi i z Wrocławia około 2 godziny, z Drezna 3' },
      mapLabels: {
        villa: 'Villa Rudolf', villaSub: 'Svoboda nad Úpou',
        snezka: 'Śnieżka', snezkaMeta: '1603 m',
        pec: 'Pec pod Sněžkou', pecMeta: '10 km',
        cernaHora: 'Černá hora', cernaHoraMeta: 'stoki 4 km',
        janskeLazne: 'Janské Lázně', janskeLazneMeta: '4 km',
        trutnov: 'Trutnov', trutnovMeta: '11 km',
        hmarsov: 'Horní Maršov', obriDul: 'Obří důl', rychory: 'Rýchory', mladeBuky: 'Mladé Buky',
        upa: 'Úpa', polsko: 'POLSKA', ring: 'PIESZO OD BRAMY',
        praha: 'Praga ≈ 2 h', vratislav: 'Wrocław ≈ 2 h', drazdany: 'Drezno ≈ 3 h',
        adrspach: 'Adršpašskie skały 45 min', safari: 'Safari Dvůr Králové 30 min',
        scale: '0 — 2 km', north: 'N',
      },
    },
    tour: {
      eyebrow: 'W środku i na zewnątrz',
      title: 'Rozejrzyj się w środku i na zewnątrz — w pełnym 360°',
      hint: 'Chwyć i przeciągnij myszą lub palcem. Pokoje przełączasz poniżej; sceny zmieniają się też same.',
      drag: 'Chwyć i obracaj',
      scenes: [
        { name: 'Zaśnieżony dziedziniec', desc: 'Dziedziniec po obfitych opadach — przejezdna droga wśród ośnieżonych świerków, sople na dachu i miejsce dla samochodów całej grupy.' },
        { name: 'Hol wejściowy', desc: 'Hol wejściowy z półkami na buty i schodami na piętro — stąd wchodzi się do jadalni i do pokoi na parterze.' },
        { name: 'Szafka na buty i schody', desc: 'Wysoka drewniana szafka na buty tuż za drzwiami i schody na piętro. Przeszklone drzwi prowadzą wprost do jadalni — buty całej grupy zostają tutaj.' },
        { name: 'Główna kuchnia z jadalnią', desc: 'Wspólna kuchnia z długim drewnianym stołem dla całej grupy, zabudową wzdłuż ściany i dużymi oknami do ogrodu — towarzyskie serce domu.' },
        { name: 'Pokój 1 (2 łóżka)', desc: 'Łóżko podwójne z podświetlanym zagłówkiem, cętkowana tapeta i wykusz z trzema oknami do ogrodu. Własna łazienka.' },
        { name: 'Pokój 1 — łazienka', desc: 'Łazienka Pokoju 1 — kabina prysznicowa, umywalka z szafką lustrzaną i toaleta.' },
        { name: 'Pokój 2 (3+1 łóżka)', desc: 'Łóżko podwójne i pojedyncze, szara tkana tapeta za podświetlanym zagłówkiem, stół z ławami i dwa okna. Własna łazienka obok.' },
        { name: 'Pokój 2 — łazienka', desc: 'Łazienka Pokoju 2 — ćwierćkolista kabina prysznicowa, umywalka na drewnianej szafce z lustrem, toaleta i podgrzewana drabinka na ręczniki.' },
        { name: 'Pokój 3 (3+1 łóżka)', desc: 'Łóżko podwójne i pojedyncze pod skosem, złota tapeta w liście za podświetlanym zagłówkiem. Własna łazienka prosto z pokoju.' },
        { name: 'Pokój 3 — okno na tunel basenowy', desc: 'Ten sam Pokój 3 od drugiego okna: głęboki ciemnoczerwony parapet, a tuż za szybą przeszklony tunel nad basenem. Wysoka szafa i drzwi prosto do holu wejściowego.' },
        { name: 'Pokój 3 — łazienka', desc: 'Łazienka Pokoju 3 — kabina prysznicowa, umywalka i okno do ogrodu.' },
        { name: 'Korytarz na 1. piętrze', desc: 'Spocznik głównych schodów z zabudowanymi szafami i trzema oknami — stąd drzwi do pokoju i do apartamentu.' },
        { name: 'Pokój 4 (2 łóżka)', desc: 'Łóżko podwójne w sklepionej wnęce między drewnianymi słupami, okno wykuszowe z drewnianym parapetem. Własna łazienka.' },
        { name: 'Pokój 4 — widok od łóżka', desc: 'Ten sam Pokój 4 od strony wezgłowia: sklepiona wnęka z marmurkową tapetą i podświetlany listwowy zagłówek z bliska, a przez cały pokój okno z zasłonami, obraz z górami, małe okienko w ścianie szachulcowej i otwarte drzwi do własnej łazienki.' },
        { name: 'Pokój 4 — łazienka', desc: 'Łazienka Pokoju 4 — kabina prysznicowa, umywalka, toaleta i pralka.' },
        { name: 'Apartament — część dzienna', desc: 'Własny salon apartamentu Suite: długa sofa pod belkami, duży stół, telewizor i schody do sypialni na poddaszu.' },
        { name: 'Apartament — aneks kuchenny', desc: 'Własna zabudowa kuchenna apartamentu z piekarnikiem i płytą — apartament jest samodzielny i nie dzieli głównej kuchni.' },
        { name: 'Apartament — sypialnia A', desc: 'Pierwsza z trzech sypialni apartamentu, na 1. piętrze: łóżko podwójne i geometryczna tapeta za podświetlanym zagłówkiem.' },
        { name: 'Apartament — sypialnia B', desc: 'Poddaszowa sypialnia apartamentu — łóżko podwójne i pojedyncze z wysuwanym drugim łóżkiem pod skosem, komoda i stolik nocny. Dzięki niemu apartament ma 10 miejsc do spania.' },
        { name: 'Apartament — sypialnia C', desc: 'Największa poddaszowa sypialnia apartamentu: łóżko podwójne i dwa pojedyncze pod skosem oraz okno w lukarnie.' },
        { name: 'Wellness przy saunie', desc: 'Przedsionek sauny — ława do ochłonięcia, prysznic i wejście do sauny fińskiej. Tylko dla waszej grupy.' },
        { name: 'We wnętrzu sauny', desc: 'W środku nagrzanej sauny fińskiej — jasne drewniane ławy i piec.' },
        { name: 'Narciarnia', desc: 'Osobna narciarnia w piwnicy — stojaki na narty i deski oraz uchwyty na buty. Sprzęt zostaje na dole, a nie w pokojach.' },
        { name: 'Ogród zimą', desc: 'Zaśnieżony ogród od altany po dom — wysokie świerki, wydeptane ścieżki i góry nad dachami.' },
        { name: 'Altana z grillami', desc: 'Ta sama altana co latem, tylko pod śniegiem: masywny drewniany dach, blat grillowy przy ścianie i otwarte boki na ogród.' },
      ],
      scenesSummer: [
        { name: 'Podjazd do willi', desc: 'Plac za bramą, na którym zaparkuje cała grupa, i dom na końcu podjazdu wśród wysokich drzew.' },
        { name: 'Ogród z basenem', desc: 'Przez trawnik na dom, zadaszony basen z rzędem leżaków i palenisko z gabionów pod skarpą.' },
        { name: 'Zadaszony basen', desc: 'Podgrzewany basen pod zadaszeniem z rzędem leżaków tuż przy domu, dookoła własny trawnik.' },
        { name: 'Drewniany taras', desc: 'Taras z dębowych desek nad ścianą z gabionów — stół dla całej ekipy i widok na altanę oraz góry.' },
        { name: 'Altana z grillami', desc: 'Pod masywnym drewnianym dachem: długi stół, murowany blat grillowy i otwarte boki na ogród.' },
        { name: 'Plac zabaw', desc: 'Most linowy, drabinki i mała ścianka wspinaczkowa w zasięgu wzroku od domu — dzieci mają swój kąt na terenie posesji.' },
        { name: 'Palenisko wieczorem', desc: 'Po zmroku gabiony i schody podświetlają się same — fotele przy palenisku, a w tle rozświetlony basen.' },
      ],
      groupsLabel: 'Grupy scen', groupAll: 'Wszystko',
      stripLabel: 'Sceny spaceru 360°', stripPrev: 'Poprzednie miniatury', stripNext: 'Następne miniatury',
      groups: { ground: 'Parter', floor1: '1. piętro', floor2: 'Poddasze', basement: 'Piwnica', extSummer: 'Na zewnątrz — lato', extWinter: 'Na zewnątrz — zima' },
    },
    gallery: { eyebrow: 'Galeria', title: 'Dom, posesja, okolica', note: 'Wszystkie zdjęcia ({n}) · kliknij, by powiększyć' },
    vylety: {
      eyebrow: 'Planer wycieczek', title: 'Góry zaczynają się za drzwiami', note: 'Wybieramy według sezonu · {n} sprawdzonych celów do godziny od domu.', drop: 'Tu trafi zdjęcie z wycieczki', cta: 'Otwórz planer wycieczek', ctaSub: 'Bez rejestracji. Mapa, filtry i tip na konkretny dzień.',
      items: [
        { tag: 'Cały rok', name: 'Śnieżka', desc: 'Najwyższy szczyt Czech — pieszo graniami albo kolejką z Pecu pod Śnieżką.' },
        { tag: 'Turystyka', name: 'Szlaki grzbietowe i wodospady', desc: 'Znakowane trasy od spokojnych pętli po całodniowe przejścia. Wodospad Mumlawy da się przejść z dziećmi.' },
        { tag: 'Na spokojnie', name: 'Torfowisko na Černej horze', desc: 'Drewniane kładki przez górskie torfowisko na Černej horze. Na górę kolejką gondolową, potem spacer po płaskim.' },
        { tag: 'Z dziećmi', name: 'Ścieżka w koronach drzew', desc: 'Ścieżka widokowa nad Janskimi Lázněmi — w kręgu celów, do których nie trzeba auta.' },
      ],
    },
    book: {
      summary: 'Wasz pobyt', pick: 'Wybierz termin w kalendarzu',
      total: 'Razem', deposit: 'Zaliczka 30%',
      cleaning: 'Opłata za sprzątanie', cityTax: 'Opłata miejscowa',
      depositReq: 'Zaliczka %P%% po potwierdzeniu',
      minStay: '%S% przyjmujemy pobyty od %N% nocy. Wybierz dłuższy termin.',
      guestMax: 'Maksymalnie %N% gości (dorośli + dzieci razem).',
      pay: 'Wyślij prośbę o pobyt', stripeNote: 'Prośba jest niezobowiązująca — teraz nic nie płacisz. Termin potwierdzimy osobiście, a potem wyślemy link do płatności zaliczki.',
      consent: 'Wysyłając prośbę, akceptujesz <a href="/podminky/" target="_blank" rel="noopener">warunki pobytu i przetwarzanie danych osobowych</a>.',
      free: 'Wolne', booked: 'Zajęte', chosen: 'Wasz pobyt', checkoutOnly: 'tylko wyjazd', demo: 'Przykładowa dostępność — podłączymy system rezerwacji',
      availFail: 'Nie udało się wczytać dostępności.',
      priceHeading: 'Cennik', pricePerNight: '/ noc', priceMin: 'min.',
      priceWeekend: 'weekend (2 noce)', weekendRate: 'Cena weekendowa',
      priceOffRange: 'kwiecień, listopad i 1–14 grudnia',
      priceSummerFull: 'Lato %Y% jest prawie w całości zarezerwowane — wolne są już tylko pojedyncze terminy.',
      priceXmas: 'Boże Narodzenie i Sylwester', priceXmasVal: 'cena indywidualna, zapytaj',
      priceMinStay: 'Minimalny pobyt %N% %NB%',
      priceCityTax: 'Opłata miejscowa %A% za osobę dorosłą i noc (dzieci nie płacą)',
      pricePet: 'Pies / zwierzę %P% za pobyt',
      priceBond: 'Zwrotna kaucja %B% — sprzątanie jest z niej potrącane',
      petFee: 'Pies / zwierzę',
      priceCleaning: 'Sprzątanie (jednorazowo)', priceDeposit: 'Zaliczka %P%% dopiero po potwierdzeniu terminu', priceFxNote: 'orientacyjnie, płatność w CZK',
      sending: 'Wysyłam…', prevMonths: 'Poprzednie miesiące', nextMonths: 'Następne miesiące',
      okTitle: 'Prośba przyjęta',
      okBody: 'Odezwiemy się w ciągu 24 godzin. Na razie nic nie płacisz — termin potwierdzimy osobiście e-mailem.',
      okAgain: 'Wyślij kolejną prośbę',
      errRequired: 'Podaj e-mail i wybierz prawidłowy termin.',
      errEmail: 'Sprawdź adres e-mail.',
      errRate: 'Otrzymaliśmy zbyt wiele próśb. Spróbuj później lub napisz do nas e-mail.',
      errGeneric: 'Wysłanie nie powiodło się. Spróbuj ponownie lub napisz na rezervace@villarudolf.com.',
    },
    video: { eyebrow: 'Wideo', title: 'Zobacz willę na wideo', note: 'Wideo odtwarza się samo i bez dźwięku. Napisy są wtopione w obraz; dźwięk włączysz przyciskiem, a przewiniesz na osi czasu.', summer: 'Dom, ogród, basen i przyjazd', winter: 'Zwiedzanie domu, sauna i skibus', start: 'Odtwórz wideo', soundOn: 'Włącz dźwięk', soundOff: 'Wyłącz dźwięk', onYoutube: 'Obejrzyj na YouTube' },
    share: { eyebrow: 'Życie w willi', title: 'Zobacz, jak jest u nas naprawdę', body: 'Zajrzyj do codziennego życia willi na naszym Instagramie — zmiana pór roku, wieczory przy ogniu i chwile naszych gości. A jeśli u nas byliście, oznaczcie @villarudolfretreat i #villarudolf, żeby wasze zdjęcia zobaczyli też inni.', ig: 'Obserwuj na Instagramie' },
    cta: {
      eyebrow: 'Rezerwacja', title: 'Zarezerwuj cały dom dla swojej grupy',
      body: 'Wybierz w kalendarzu przyjazd i wyjazd, zobacz rozpiskę ceny i wyślij nam niezobowiązującą prośbę o pobyt. Termin potwierdzimy osobiście.',
      lblAdults: 'Dorośli', lblChildren: 'Dzieci', lblPets: 'Zwierzęta',
      lblName: 'Imię', phName: 'Wasze imię',
      lblEmail: 'E-mail', phEmail: 'ty@email.pl',
      lblPhone: 'Telefon / WhatsApp', phPhone: '+420… (opcjonalnie)',
      lblMessage: 'Wiadomość do gospodarza', phMessage: 'Cokolwiek, co powinniśmy wiedzieć — liczba dzieci, godzina przyjazdu, życzenia… (opcjonalnie)',
    },
    mail: { subject: 'Villa Rudolf — prośba o pobyt', dates: 'Termin', nights: 'Noce', breakdown: 'Rozpiska ceny', cleaning: 'Opłata za sprzątanie', cityTax: 'Opłata miejscowa', guests: 'Goście', adults: 'Dorośli', children: 'Dzieci', pets: 'Zwierzęta', total: 'Razem', deposit: 'Zaliczka 30% (po potwierdzeniu)', from: 'E-mail kontaktowy', phone: 'Telefon / WhatsApp', greeting: 'Dzień dobry, chciałbym/chciałabym poprosić o pobyt w Villa Rudolf w tym terminie:' },
    footer: { tagline: 'Prywatna górska rezydencja dla dużych grup w sercu Karkonoszy.', langLabel: 'Język', contact: 'Kontakt', rights: '© 2026 Villa Rudolf', social: 'Obserwuj nas', host: 'Pavel — wasz gospodarz', region: 'Karkonosze, Czechy', terms: 'Warunki pobytu i prywatność', guide: 'Planer wycieczek' },
    prebook: {
      title: 'Co warto wiedzieć przed rezerwacją', link: 'Wszystkie informacje praktyczne →',
      facts: [
        { k: 'Pojemność', v: '{minHostu}–{maxHostu} gości w {loznice} sypialniach' },
        { k: 'Prywatność', v: 'Cały dom i teren tylko dla Waszej grupy' },
        { k: 'Zameldowanie / wym.', v: 'Zameldowanie od 15:00 · wymeldowanie do 10:00' },
        { k: 'Zwierzęta', v: 'Psy mile widziane za opłatą' },
        { k: 'Parking', v: 'Za darmo na terenie, za bramą' },
        { k: 'Narty', v: 'Stoki Czarna Góra 4 km · przystanek skibusu 200 m' },
      ],
    },
  },
};

/* ============================ State + helpers ============================ */
const state = { lang: 'cs', season: 'leto', scrolled: false, scene: 0, panoGroup: 'all', lb: -1, lbList: [], selStart: 0, selEnd: 0, mob: false, calOffset: 0 };
/* Kalendář: okno 2 měsíců lze posouvat 0 .. CAL_MAX_OFFSET (dnešek .. +18 měsíců). */
const CAL_MAX_OFFSET = 17;
/* Ceny řídí VR_PRICING (nahoře v souboru). */
const CONTACT_EMAIL = 'pavel.kubiznak@gmail.com';
/* ===================== 360° scény =====================
   Scény jsou SEZÓNNÍ: zima = celý dům + zasněžený pozemek, léto = pozemek za
   letního podvečera. Pořadí musí přesně odpovídat T[lang].tour.scenes /
   tour.scenesSummer a PANO_GROUPS.

   IDENTITA MÍSTNOSTÍ JE OVĚŘENÁ, ne odhadnutá: každé panorama je spárované
   s majitelovou vlastní keypano prohlídkou (stažené cube-face dlaždice →
   stejná projekce → shoda tapet, oken, dveří i dekorací), zápis v
   vr-pano-mapovani.md. Odtud i zařazení do pater (PANO_GROUPS) — je to
   majitelovo vlastní rozdělení z jeho prohlídky, ne naše domněnka.

   `room3` a `room3b` jsou TÝŽ Pokoj 3 ze dvou stanovišť — `room3b` (out_371) je
   pohled ke druhému oknu s výhledem na prosklený tunel nad bazénem. Identitu
   potvrdil majitel osobně nad fotkami („Všechno je to pokoj číslo 3. Je to
   v přízemí."); sedí i s fotkami: otevřenými dveřmi je odtud vidět vstupní hala
   s dřevěným botníkem — týž prostor jako scény `hall` a `shoerack`. Popisky obou
   scén proto začínají „Pokoj 3", aby v pruhu náhledů nevypadaly jako dva pokoje.

   Stejný vzor má `room4` a `room4b` (out_355) — TÝŽ Pokoj 4 ze dvou stanovišť:
   `room4` je pohled z prostředka pokoje na postel v klenuté nice, `room4b` stojí
   u hlavy postele a dívá se přes pokoj k arkýřovému oknu a otevřeným dveřím do
   vlastní koupelny. Identitu potvrzuje shoda pevných znaků (mramorovaná tapeta
   v nice, podsvícené laťkové čelo, dřevěné sloupy, obrázek hory, okénko
   v hrázděné stěně) — viz vr-pano-mapovani.md, sekce 4.6.
   Panorama pořizujeme 4096×2048 (2:1) — 4096 je strop MAX_TEXTURE_SIZE pro
   WebGL1 na starších mobilech, výš nejít. */
const PANO_SETS = {
  zima: ['courtyard', 'hall', 'shoerack', 'dining', 'room1', 'bath1', 'room2', 'bath2',
         'room3', 'room3b', 'bath3',
         'corridor', 'room4', 'room4b', 'bath4', 'apt-living', 'apt-kitchen', 'apt-bed-a',
         'apt-bed-b', 'apt-bed-c',
         'wellness', 'sauna', 'skiroom', 'garden', 'gazebo'],
  leto: ['s_arrival', 's_garden', 's_pool', 's_terrace', 's_pergola', 's_playground', 's_firepit'],
};
/* Skupina (patro) každé scény — stejné pořadí jako PANO_SETS. Klíče → popisky
   v T[lang].tour.groups. Menu skupin se skryje, když má sezóna jen jednu. */
const PANO_GROUPS = {
  zima: ['extWinter', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground', 'ground',
         'ground', 'ground', 'ground',
         'floor1', 'floor1', 'floor1', 'floor1', 'floor1', 'floor1', 'floor1',
         'floor2', 'floor2',
         'basement', 'basement', 'basement', 'extWinter', 'extWinter'],
  leto: ['extSummer', 'extSummer', 'extSummer', 'extSummer', 'extSummer', 'extSummer', 'extSummer'],
};
const GROUP_ORDER = ['ground', 'floor1', 'floor2', 'basement', 'extSummer', 'extWinter'];
function panoFiles() { return PANO_SETS[state.season] || PANO_SETS.leto; }
function panoGroups() { return PANO_GROUPS[state.season] || PANO_GROUPS.leto; }
/* Skupiny, které v aktuální sezóně skutečně mají scény (v pořadí GROUP_ORDER). */
function seasonGroups() { const g = panoGroups(); return GROUP_ORDER.filter((k) => g.indexOf(k) >= 0); }
/* Indexy scén viditelných v pruhu náhledů podle zvolené skupiny. */
function visibleScenes() {
  const g = panoGroups();
  const all = g.map((_, i) => i);
  if (state.panoGroup === 'all') return all;
  const sel = all.filter((i) => g[i] === state.panoGroup);
  return sel.length ? sel : all;
}
function tourScenes() {
  const t = tt();
  const s = state.season === 'zima' ? t.tour.scenes : (t.tour.scenesSummer || t.tour.scenes);
  return s || [];
}

/* Per-pano horizontal start point (fraction 0–1 across the equirect image; 0.5 =
   image centre). Mapped to camera yaw in loadPano() so the viewer first faces
   the described subject. */
const PANO_YAWF = {
  courtyard: 0.72, hall: 0.75, shoerack: 0.50, dining: 0.12, room1: 0.25, bath1: 0.88,
  room2: 0.50, bath2: 0.68, room3: 0.50, room3b: 0.56, bath3: 0.62,
  corridor: 0.00, room4: 0.50, room4b: 0.54, bath4: 0.22, 'apt-living': 0.50, 'apt-kitchen': 0.75,
  'apt-bed-a': 0.50, 'apt-bed-b': 0.50, 'apt-bed-c': 0.62,
  wellness: 0.50, sauna: 0.25, skiroom: 0.86, garden: 0.25, gazebo: 0.29,
  s_arrival: 0.5, s_garden: 0.75, s_pool: 0.32, s_terrace: 0.12, s_pergola: 0.5, s_playground: 0.72, s_firepit: 0.25,
};
/* Interiérový karusel odkazuje na scény ID-čkem, ne pořadím — jinak by každé
   vložení nové scény tiše rozhodilo tlačítka „Prohlédnout ve 360°". */
function panoIdx(id) { return PANO_SETS.zima.indexOf(id); }

/* GALERIE — VŠECHNY FOTKY, ŽÁDNÉ FILTRY (majitel, 7/2026):
   „ta galerie — dům, pozemek a okolí, léto, zima, večer, interiér… já bych tady
   nechal vše, vůbec bych to nekomplikoval těma filtrama. Udělal bych z toho
   takový trošku Instagram. Ty fotky by tady mohly být všechny, srovnaný,
   a kdo má zájem, dojde až sem, klikne a bude si je prohlížet."

   Pořadí NENÍ náhodné — je to prohlídka: dům a pozemek → bazén a terasa →
   společné prostory → wellness → ložnice a koupelny → zima → večer a noc.
   f = plná fotka (1600 px, otevře se v lightboxu). Náhled je hotový čtverec
   512×512 ve media/gallery/sq/ pod stejným názvem souboru — mřížka tedy stahuje
   ~46 kB na dlaždici, ne 300kB master.

   ROZŠÍŘENÍ (majitel, 7/2026, druhé kolo): „Galerii bych určitě chtěl rozšířit —
   teďka tam dej těch 31 (nikde nepoužitých fotek), já se na to kouknu; pokud je
   to dobrý, necháme, pokud ne, udělám složku s fotkami, které chci." Proto tu
   teď JSOU i dřív vyřazené záběry (noční drony aerial/areal-night, denní i noční
   varianty ohniště, altánu a bazénu, výřezy pozadí sekcí tile-*, starší záběry
   pokojů room1-corner/room2-lamps/room4-beams i wellness am-/int-wellness) —
   ať si majitel sám rozhodne, co nechat. Nekurátorujeme, jen řadíme tematicky.
   Ze 31 nepoužitých souborů se sem nedostalo jen 6 miniatur media/photos/*_t.jpg —
   to jsou zmenšeniny gallery1–6, jejichž plné verze v galerii už jsou. */
const GALLERY = [
  { f: 'media/gallery/01-house-summer.jpg', alt: 'Villa Rudolf z rozlehlé zahrady — hrázděný štít, veranda a terasa' },
  { f: 'media/gallery/summer-house.jpg', alt: 'Vedlejší budova areálu s houpacími sítěmi a příjezdovou cestou v létě' },
  { f: 'media/photos/exterior.jpg', alt: 'Zahrada s houpacími sítěmi a vedlejší budovou areálu z čelního pohledu' },
  { f: 'media/gallery/summer-drive.jpg', alt: 'Příjezdová cesta k vile mezi vzrostlými stromy v létě' },
  { f: 'media/gallery/02-playground-house.jpg', alt: 'Dům z boku s lanovým mostem a prolézačkou dětského hřiště' },
  { f: 'media/sections/tile-playground.jpg', alt: 'Vila s dřevěným lanovým mostem dětského hřiště v popředí' },
  { f: 'media/gallery/pergola-exterior.jpg', alt: 'Dřevěný altán na travnaté ploše pozemku v létě' },
  { f: 'media/photos/pergola.jpg', alt: 'Dřevěný altán se židlemi proti podzimnímu lesu' },
  { f: 'media/sections/tile-pergola.jpg', alt: 'Dřevěný altán na kraji zahrady mezi vzrostlými stromy' },
  { f: 'media/gallery/05-pergola-autumn.jpg', alt: 'Altán z boku na podzim proti žluto-oranžovému listí' },
  { f: 'media/gallery/pergola-view.jpg', alt: 'Uvnitř altánu — dlouhý stůl a židle pod krovem' },
  { f: 'media/photos/gallery1.jpg', alt: 'Uvnitř altánu — dlouhý stůl a židle pod dřevěným krovem s grilem' },
  { f: 'media/photos/gallery3.jpg', alt: 'Posezení v altánu s výhledem na vilu mezi stromy' },
  { f: 'media/photos/gallery5.jpg', alt: 'Pohled z altánu k vile přes zahradu s dětským hřištěm' },
  { f: 'media/photos/season-summer.jpg', alt: 'Terasa u bazénu s lehátky a vila pod dramatickou letní oblohou' },
  { f: 'media/gallery/03-pool-hall-exterior.jpg', alt: 'Prosklená hala bazénu zvenčí a řada lehátek na trávníku' },
  { f: 'media/gallery/pool-storm.jpg', alt: 'Bazén a dům pod bouřkovými mraky' },
  { f: 'media/gallery/07-gabion-pool-day.jpg', alt: 'Gabionová opěrná zeď, trávník a zastřešený bazén ve dne' },
  { f: 'media/sections/tile-firepit.jpg', alt: 'Gabionová terasa s ohništěm a dřevěným molem u bazénu ve dne' },
  { f: 'media/gallery/04-terrace-loungers.jpg', alt: 'Terasa u bazénu s perspektivní řadou lehátek' },
  { f: 'media/gallery/pool-sunbeds.jpg', alt: 'Vila se zastřešeným bazénem a řadou lehátek na trávníku' },
  { f: 'media/photos/gallery2.jpg', alt: 'Prosklené zastřešení bazénu a pískovcová terasa s lehátky' },
  { f: 'media/photos/gallery4.jpg', alt: 'Zastřešený bazén s lehátky na terase a vilou v pozadí' },
  { f: 'media/sections/am-pool-open.jpg', alt: 'Bazén s odsunutým zastřešením v letním dni' },
  { f: 'media/gallery/pool-day.jpg', alt: 'Vyhřívaný bazén pod prosklenou halou' },
  { f: 'media/sections/tile-pool.jpg', alt: 'Hladina vyhřívaného bazénu s lehátky a vilou za ním' },
  { f: 'media/gallery/17-pool-hall-interior.jpg', alt: 'Zastřešený bazén — symetrický pohled prosklenou halou' },
  { f: 'media/gallery/16-dining-room.jpg', alt: 'Jídelna s kuchyňskou linkou a dubovým stolem pro osm' },
  { f: 'media/gallery/dining-kitchen.jpg', alt: 'Kuchyně s jídelním stolem pro osm a okny do zahrady' },
  { f: 'media/sections/am-kitchen.jpg', alt: 'Velká kuchyně s jídelním stolem a okny do zahrady' },
  { f: 'media/gallery/14-table-for-ten.jpg', alt: 'Dlouhý jídelní stůl pro deset s károvaným ubrusem' },
  { f: 'media/sections/room-suite.jpg', alt: 'Společenský prostor apartmá — jídelní stůl, sedačky a schodiště' },
  { f: 'media/sections/room-suite-b.jpg', alt: 'Apartmá z druhé strany — posezení, stůl a dřevěné sloupy' },
  { f: 'media/sections/room-suite-c.jpg', alt: 'Sedací souprava a jídelní stůl v podkrovním apartmá' },
  { f: 'media/gallery/suite-billiard.jpg', alt: 'Kulečníkový sál s bílými stěnami a dubovou podlahou' },
  { f: 'media/sections/playground.jpg', alt: 'Dětský koutek s hracím kobercem a hračkami' },
  { f: 'media/gallery/sauna-hall.jpg', alt: 'Předsíň wellness — vstup do finské sauny a lavice' },
  { f: 'media/gallery/18-sauna-inside.jpg', alt: 'Uvnitř finské sauny — lavice ze světlého dřeva a kamna' },
  { f: 'media/sections/am-wellness.jpg', alt: 'Wellness — vstup do finské sauny a sprchový kout s obklady' },
  { f: 'media/sections/int-wellness.jpg', alt: 'Wellness z druhé strany — sauna, sprcha a lavice na dlažbě' },
  { f: 'media/sections/int-bath.jpg', alt: 'Sprchový kout u sauny s obkladem v hnědém tónu' },
  { f: 'media/sections/room-1.jpg', alt: 'Ložnice s manželskou postelí a tapetovanou stěnou v čele' },
  { f: 'media/gallery/room1-corner.jpg', alt: 'Ložnice s manželskou postelí a rohovými okny do zahrady' },
  { f: 'media/sections/room-1b.jpg', alt: 'Táž ložnice od okna — postel, noční stolky a dřevěná podlaha' },
  { f: 'media/sections/room-1c.jpg', alt: 'Rodinná ložnice se dvěma lůžky vedle sebe a velkými okny' },
  { f: 'media/sections/room-2.jpg', alt: 'Pokoj s vlastní koupelnou za prosklenými dveřmi' },
  { f: 'media/gallery/room2-lamps.jpg', alt: 'Pokoj s manželskou postelí a vlastní koupelnou za prosklenými dveřmi' },
  { f: 'media/sections/room-2b.jpg', alt: 'Pokoj s posezením u okna a manželskou postelí' },
  { f: 'media/sections/room-2d.jpg', alt: 'Podkrovní pokoj se stolem, lavicemi a dvojlůžkem' },
  { f: 'media/sections/room-3.jpg', alt: 'Světlý pokoj s lůžky, lavicí a výhledem do zahrady' },
  { f: 'media/sections/room-3b.jpg', alt: 'Pokoj s vlastní koupelnou a květinami na komodě' },
  { f: 'media/sections/room-4.jpg', alt: 'Podkrovní pokoj s kamennou stěnou za čelem postele' },
  { f: 'media/gallery/room4-beams.jpg', alt: 'Podkrovní pokoj s dvojlůžkem mezi dřevěnými sloupy a trámy' },
  { f: 'media/sections/room-4b.jpg', alt: 'Symetrický pohled na dvojlůžko pod trámovým podkrovím' },
  { f: 'media/sections/room-suite-d.jpg', alt: 'Ložnice apartmá — dvojlůžko u okna se šedou tapetou' },
  { f: 'media/gallery/15-ensuite-bathroom.jpg', alt: 'Koupelna u pokoje — sprchový kout a umyvadlo na dubové skříňce' },
  { f: 'media/sections/bath-room2.jpg', alt: 'Koupelna s rohovým sprchovým koutem a umyvadlem' },
  { f: 'media/sections/bath-room3.jpg', alt: 'Koupelna s WC, žebříkovým radiátorem a dubovou skříňkou' },
  { f: 'media/gallery/11-winter-day.jpg', alt: 'Villa Rudolf v plném zimním slunci pod zasněženými stromy' },
  { f: 'media/gallery/winter-snow.jpg', alt: 'Zasněžená zahrada a vila mezi vzrostlými stromy' },
  { f: 'media/gallery/12-winter-garden.jpg', alt: 'Pohled přes zasněženou zahradu na vilu mezi vysokými smrky' },
  { f: 'media/gallery/winter-forest.jpg', alt: 'Zasněžená cesta a smrkový les u vily' },
  { f: 'media/gallery/13-frozen-apples.jpg', alt: 'Jabloň se zmrzlými jablky ve sněhu v protisvětle' },
  { f: 'media/gallery/winter-room-snow.jpg', alt: 'Pokoj v zimě — zasněžená zahrada za oknem' },
  { f: 'media/gallery/winter-twin-snow.jpg', alt: 'Dvoulůžkový pokoj se stolem a zimním výhledem z okna' },
  { f: 'media/gallery/09-estate-blue-hour.jpg', alt: 'Celý pozemek z patra za modré hodiny — bazén, ohniště, altán a stodola' },
  { f: 'media/gallery/firepit-sunset.jpg', alt: 'Ohniště a bazén při západu slunce nad hřebeny' },
  { f: 'media/gallery/firepit-dusk.jpg', alt: 'Areál za soumraku — nasvícený zastřešený bazén, ohniště a altán' },
  { f: 'media/gallery/08-firepit-night.jpg', alt: 'Ohniště v noci — kruh křesílek a gabiony prosvětlené LED' },
  { f: 'media/gallery/06-pergola-night.jpg', alt: 'Altán v noci — nasvícený vnitřek svítí teple do tmy' },
  { f: 'media/gallery/pergola-night.jpg', alt: 'Altán v noci nasvícený zevnitř na tmavé zahradě' },
  { f: 'media/gallery/pool-night.jpg', alt: 'Nasvícená hala bazénu a dům po setmění' },
  { f: 'media/photos/gallery6.jpg', alt: 'Vila a modře prosvícený bazén po setmění s řadou lehátek' },
  { f: 'media/gallery/aerial-night.jpg', alt: 'Letecký noční pohled na areál — prosvícený bazén a nasvícené cesty' },
  { f: 'media/gallery/areal-night.jpg', alt: 'Noční letecký záběr celého areálu — svítící bazén a altán' },
  { f: 'media/sections/evening-window.jpg', alt: 'Pohled z domu na nasvícený bazén po setmění' },
  { f: 'media/gallery/10-winter-night-framed.jpg', alt: 'Vila v noci rámovaná zasněženými větvemi, teplé světlo na sněhu' },
  { f: 'media/gallery/winter-night.jpg', alt: 'Zimní noc — zasněžená cesta a nasvícený bazén' },
  { f: 'media/gallery/winter-night-close.jpg', alt: 'Vila v zimní noci pod měsícem, teplá okna ve sněhu' },
];
/* Fotky karet „Kam na výlet" (pořadí = vylety.items). JEN skutečné snímky z repa —
   žádné AI/stažené fotky. Sněžka/hory, letní cesta lesem, lyžování, hřiště pro děti. */
/* Fotky ke kartám sekce #vylety. Sekce je JEN LETNÍ, takže tu nesmí být zimní
   záběr — dvě takové tu do 7/2026 byly (winter-forest, winter-snow) a patřily
   ke kartám o lyžování, které majitel z letní stránky nechal odstranit.
   Pořadí odpovídá pořadí v t.vylety.items. */
const TRIP_IMAGES = [
  'media/trips/snezka-cablecar.jpg',
  'media/gallery/summer-drive.jpg',
  'media/trips/cernohorske-raseliniste.jpg',
  'media/trips/baumwipfelpfad.jpg',
];

function tt() { return T[state.lang] || T.cs; }
function resolve(obj, path) { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj); }
function $(sel, root) { return (root || document).querySelector(sel); }
function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
function el(tag, attrs, kids) {
  const n = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    if (k === 'class') n.className = attrs[k];
    else if (k === 'text') n.textContent = attrs[k];
    else if (k === 'html') n.innerHTML = attrs[k];
    else if (k.slice(0, 2) === 'on') n.addEventListener(k.slice(2), attrs[k]);
    else n.setAttribute(k, attrs[k]);
  }
  if (kids) (Array.isArray(kids) ? kids : [kids]).forEach((c) => c != null && n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c));
  return n;
}
const slotIcon = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="5" width="18" height="14" rx="2"></rect><circle cx="8.5" cy="10" r="1.6"></circle><path d="M21 16l-5-5-9 9"></path></svg>';
function slot(label) { return el('div', { class: 'vr-slot', html: slotIcon() + '<span>' + label + '</span>' }); }

/* ============================ i18n text application ============================ */
function setTexts() {
  const t = tt();
  $all('[data-t]').forEach((n) => {
    const v = resolve(t, n.getAttribute('data-t'));
    if (typeof v === 'string') n.textContent = fillFacts(v);
  });
  $all('[data-t-ph]').forEach((n) => {
    const v = resolve(t, n.getAttribute('data-t-ph'));
    if (typeof v === 'string') n.setAttribute('placeholder', fillFacts(v));
  });
  // trusted, first-party HTML strings (e.g. hero sub with <em> accent)
  $all('[data-t-html]').forEach((n) => {
    const v = resolve(t, n.getAttribute('data-t-html'));
    if (typeof v === 'string') n.innerHTML = fillFacts(v);
  });
  applyVideoAria();
  applyGalleryNote();  // „Všechny fotky ({n})" — počet do poznámky galerie
  applyTripCounts();   // {n} v okruzích a v nadpisu mapy (plurály podle jazyka)
  renderArrive();      // blok „Než dorazíte"
  document.documentElement.lang = state.lang;
}

/* ============================ Dynamic list renders ============================ */
/* RYCHLÁ FAKTA POD HEREM se od 7/2026 nevykreslují z JS — jsou staticky
   v index.html (#vr-facts) s klíči facts.* a čísla se do nich dosazují
   z VR_FACTS. Důvod: text, který ve stránce fyzicky není, se neindexuje,
   a sezónní wellness dlaždice tam proto musí být v obou zněních naráz
   (léto: bazén + sauna, zima: sauna + lyžárna — bazén v zimě nejede). */

/* Datum ověření hodnocení — lokalizovaný formát z VR_REVIEWS.checkedAt (ISO). */
function fmtCheckedAt(iso) {
  const p = String(iso).split('-'); if (p.length !== 3) return iso;
  const y = +p[0], m = +p[1], d = +p[2];
  if (state.lang === 'en') {
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][m - 1] || m;
    return mon + ' ' + d + ', ' + y;
  }
  return d + '. ' + m + '. ' + y; // cs / de / pl
}

/* Řádek hodnocení (Google / Airbnb / Booking.com) + poznámka „ověřeno …".
   TOHLE JE ZÁROVEŇ NÁHRADA ZA ZRUŠENÉ TLAČÍTKO „Zobrazit všechny recenze":
   každý chip je proklik na profil dané platformy, kde host uvidí VŠECHNY
   recenze — a to i mnohem víc, než jich kdy bylo ve zrušené sekci #recenze.
   Každá platforma si drží SVOU ŠKÁLU (5★ / 10 bodů), nic se nepřepočítává. */
function renderRatings() {
  const t = tt();
  const host = $('#vr-ratings'); if (!host) return; host.innerHTML = '';
  host.appendChild(el('span', { class: 'vr-eyebrow vr-ratings-eyebrow', text: t.ratings.eyebrow }));
  const row = el('div', { class: 'vr-ratings-row' });
  VR_REVIEWS.platforms.forEach((p) => {
    const dec = state.lang === 'en' ? '.' : ',';
    const num = p.rating.toFixed(1).replace('.', dec);
    const scoreTxt = p.outOf === 5 ? num : num + '/10';
    const link = el('a', {
      class: 'vr-rating', href: p.url, target: '_blank', rel: 'noopener noreferrer',
      'aria-label': p.name + ' ' + scoreTxt + ' (' + p.count + ' ' + t.ratings.reviewsWord + ')',
    }, [
      el('span', { class: 'vr-rating-plat', text: p.name }),
      el('span', { class: 'vr-rating-score' }, [
        el('b', { text: scoreTxt }),
        p.outOf === 5 ? el('i', { class: 'vr-star', 'aria-hidden': 'true', text: '★' }) : null,
      ]),
      el('span', { class: 'vr-rating-count', text: '(' + p.count + ' ' + t.ratings.reviewsWord + ')' }),
      el('span', { class: 'vr-rating-arrow', 'aria-hidden': 'true', text: '↗' }),
    ]);
    row.appendChild(link);
  });
  host.appendChild(row);
  host.appendChild(el('div', { class: 'vr-ratings-note', text: t.ratings.verified + ' ' + fmtCheckedAt(VR_REVIEWS.checkedAt) }));
}

/* Zvolí text recenze pro aktuální UI jazyk:
   – vlastní jazyk recenze → originál; cs → český překlad (jinak originál);
   – ostatní → originál (krátké citace), případně český překlad jako fallback. */
function reviewText(r) {
  const L = state.lang;
  if (r.lang === L && r.quote) return r.quote;
  if (L === 'cs') return r.quote_cs || r.quote;
  return r.quote || r.quote_cs;
}
function platformByKey(k) { return VR_REVIEWS.platforms.find((p) => p.key === k) || {}; }
/* Citace, které stojí na bazénu (`pool: true`), se v ZIMĚ nezobrazují — bazén
   v zimě nejede a recenze začínající „Der Pool…" by vyrobila přesně to
   očekávání, které se při příjezdu rozbije. Nikdy ne na nulu: i po odfiltrování
   zbývají čtyři, a pojezd si sadu stejně několikrát zopakuje. */
function reviewsForSeason() {
  return VR_REVIEWS.items.filter((r) => !(state.season === 'zima' && r.pool));
}
/* Spodní sekce „Co říkají hosté" (#recenze) BYLA ZRUŠENA (7/2026, majitel):
   duplikovala pás pod heroem a stejně odkazovala na platformy. Jediné místo,
   kde recenze na webu žijí, je teď pojezd v pásu — viz renderTrustBand(). */

/* ============================ VIDEO: PŘEHRÁVAČ V PLOŠE ============================
   Majitel (7/2026): „Ten YouTube button vypadá dost hrozně. Co kdybychom ho dali
   úplně pryč, nechali to video přehrávat… chybí tam ty titulky… byl by tam čudlík
   na to, že by se zapnul zvuk… a ještě možnost to přehrát přímo v YouTube.
   A mohl by tam být ještě slider."

   Volba cesty: youtube-nocookie iframe, ne vlastní přehrávač nad mp4.
   · Titulky jsou VYPÁLENÉ v obraze, takže stačí neořezávat snímek (CSS 16:9).
   · Časová osa (slider), hlasitost i celoobrazovka = nativní controls=1.
     Fungují i s vypnutým naším JS a na všech platformách stejně.
   · Zdrojová videa mají 7:36 (116 MB) a 10:33 (74 MB). Vlastní hosting by
     znamenal desítky MB v repu bez adaptivní kvality — proti smyslu zadání
     („ať u toho lidi zůstanou"), protože na mobilních datech by se to nerozjelo.

   ŠETRNOST (nic se nenačte předem):
   · iframe vzniká teprve při vstupu plochy do viewportu (IntersectionObserver).
   · Mimo viewport se přehrávání pauzuje (postMessage pauseVideo).
   · prefers-reduced-motion / spořič dat / displej pod 640 px → žádný autoplay:
     zůstane poster a tlačítko „Přehrát video". Do kliknutí neodejde na YouTube
     jediný požadavek.
   · Přepnutí sezóny zbourá iframe skryté sezóny, aby nehrál na pozadí. */

const YT_ORIGIN = 'https://www.youtube-nocookie.com';
const VID_ICONS = {
  /* reproduktor přeškrtnutý = teď je ticho, klik zapne zvuk */
  off: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.2-3.9v2.1l2.1 2.1c.1-.1.1-.2.1-.3zM19 12c0 .9-.2 1.7-.5 2.4l1.5 1.5A7.9 7.9 0 0 0 21 12a8 8 0 0 0-6.7-7.9v2.1C17 6.8 19 9.2 19 12zM4.3 3 3 4.3 7.7 9H3v6h4l5 5v-6.7l4.3 4.3c-.7.5-1.4.9-2.3 1.1v2.1c1.4-.2 2.6-.8 3.7-1.6l2 2 1.3-1.3-8.7-8.7L4.3 3zM12 4 9.9 6.1 12 8.2V4z"/></svg>',
  /* reproduktor s vlnami = zvuk hraje, klik ho vypne */
  on: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05A4.47 4.47 0 0 0 16.5 12zM14 3.23v2.06A7 7 0 0 1 14 18.7v2.06A9 9 0 0 0 14 3.23z"/></svg>',
};

/* Autoplay smí jen tam, kde nikoho nepřekvapí a nestojí data. */
function vidAutoAllowed() {
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (window.innerWidth && window.innerWidth < 640) return false;
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (c && (c.saveData === true || /(^|-)2g$/.test(c.effectiveType || ''))) return false;
  } catch (e) {}
  return true;
}
/* Příkaz do přehrávače (dokumentované postMessage rozhraní enablejsapi=1). */
function vidCmd(box, func, args) {
  const f = box && box.querySelector('iframe');
  if (!f || !f.contentWindow) return;
  try {
    f.contentWindow.postMessage(JSON.stringify({ event: 'command', func: func, args: args || [] }), YT_ORIGIN);
  } catch (e) {}
}
function vidLabel(box) {
  const l = vidPart(box, '.vr-vid-label');
  return (l && l.textContent) || 'Villa Rudolf';
}
/* Čudlík na zvuk i popisek leží v liště POD plochou, tedy vedle .vr-vidbox
   uvnitř téhož .vr-vid — hledá se proto od společného rodiče. */
function vidPart(box, sel) {
  const wrap = box && box.closest('.vr-vid');
  return wrap ? wrap.querySelector(sel) : null;
}
/* Přepíše text i ikonu čudlíku podle toho, co zrovna platí. */
function vidSyncSound(box) {
  const btn = vidPart(box, '.vr-vid-sound'); if (!btn) return;
  const t = tt(), v = t.video || {};
  const on = btn.getAttribute('data-sound') === 'on';
  const tx = btn.querySelector('.vr-vid-sound-tx');
  const ic = btn.querySelector('.vr-vid-sound-ic');
  const label = on ? (v.soundOff || 'Mute') : (v.soundOn || 'Sound on');
  if (tx) { tx.textContent = label; tx.setAttribute('data-t', on ? 'video.soundOff' : 'video.soundOn'); }
  if (ic) ic.innerHTML = on ? VID_ICONS.on : VID_ICONS.off;
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.setAttribute('aria-label', label + ' — ' + vidLabel(box));
}
/* Vloží přehrávač. muted=true → tichý autoplay při doscrollování;
   muted=false → uživatel sám klikl na „Přehrát video", takže zvuk rovnou hraje. */
function vidMount(box, muted) {
  if (!box || box.dataset.mounted === '1') return;
  const id = box.getAttribute('data-yt'); if (!id) return;
  const slot = box.querySelector('.vr-vid-slot'); if (!slot) return;
  box.dataset.mounted = '1';
  const p = [
    'autoplay=1', 'mute=' + (muted ? '1' : '0'), 'playsinline=1',
    'controls=1',            // časová osa, hlasitost, celoobrazovka — nativní
    'rel=0', 'modestbranding=1', 'enablejsapi=1',
    'origin=' + encodeURIComponent(location.origin),
  ].join('&');
  const frame = el('iframe', {
    src: YT_ORIGIN + '/embed/' + id + '?' + p,
    title: vidLabel(box),
    allow: 'autoplay; encrypted-media; picture-in-picture; fullscreen',
    allowfullscreen: '', frameborder: '0', loading: 'lazy',
  });
  slot.appendChild(frame);
  const start = box.querySelector('.vr-vid-start'); if (start) start.setAttribute('hidden', '');
  const sound = vidPart(box, '.vr-vid-sound');
  if (sound) { sound.setAttribute('data-sound', muted ? 'off' : 'on'); sound.removeAttribute('hidden'); vidSyncSound(box); }
  /* Přihlášení k odběru stavu přehrávače — jen kvůli tomu, aby čudlík neříkal
     „Zapnout zvuk", když si ho host mezitím pustil nativním ovládáním. */
  frame.addEventListener('load', () => {
    try {
      frame.contentWindow.postMessage(JSON.stringify({ event: 'listening', id: id, channel: 'widget' }), YT_ORIGIN);
    } catch (e) {}
  });
}
function vidUnmount(box) {
  if (!box) return;
  const slot = box.querySelector('.vr-vid-slot'); if (slot) slot.innerHTML = '';
  delete box.dataset.mounted; delete box.dataset.autopaused; delete box.dataset.ytState;
  const sound = vidPart(box, '.vr-vid-sound');
  if (sound) { sound.setAttribute('hidden', ''); sound.setAttribute('data-sound', 'off'); }
  const start = box.querySelector('.vr-vid-start');
  if (start && !vidAutoAllowed()) start.removeAttribute('hidden');
}
/* Sezóna se přepnula → zbourat přehrávač té, která zmizela (jinak hraje pod
   stránkou dál). Skrytá plocha má hidden i display:none, takže IO ji nevzkřísí. */
function vidResetHidden() {
  $all('.vr-vid').forEach((v) => {
    if (v.hasAttribute('hidden')) {
      const box = v.querySelector('.vr-vidbox');
      if (box && box.dataset.mounted === '1') vidUnmount(box);
    }
  });
}
function wireVideos() {
  const boxes = $all('.vr-vidbox[data-yt]');
  if (!boxes.length) return;
  const auto = vidAutoAllowed();
  boxes.forEach((box) => {
    const start = box.querySelector('.vr-vid-start');
    const sound = vidPart(box, '.vr-vid-sound');
    if (start) {
      if (!auto) start.removeAttribute('hidden');
      start.addEventListener('click', () => vidMount(box, false));  // gesto = smí i zvuk
    }
    if (sound) {
      sound.addEventListener('click', () => {
        const on = sound.getAttribute('data-sound') === 'on';
        sound.setAttribute('data-sound', on ? 'off' : 'on');
        vidCmd(box, on ? 'mute' : 'unMute');
        if (!on) vidCmd(box, 'setVolume', [100]);
        vidSyncSound(box);
      });
    }
  });
  if (!auto) return;                                   // poster + tlačítko, nic víc
  if (!('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      const box = en.target;
      if (en.isIntersecting) {
        if (box.dataset.mounted !== '1') { vidMount(box, true); return; }
        // Rozjet znovu jen to, co jsme sami uspali. Když si host video zastavil,
        // odscrolloval a vrátil se, nesmí mu to skočit zpátky do přehrávání.
        if (box.dataset.autopaused === '1') { delete box.dataset.autopaused; vidCmd(box, 'playVideo'); }
      } else if (box.dataset.mounted === '1') {
        const st = box.dataset.ytState;                 // '' = přehrávač mlčí, chováme se konzervativně
        if (st === '' || st === undefined || st === '1' || st === '3') {
          vidCmd(box, 'pauseVideo');                    // mimo obraz nemá co hrát
          box.dataset.autopaused = '1';
        }
      }
    });
  }, { threshold: 0.35 });
  boxes.forEach((box) => io.observe(box));
  /* Zprávy z přehrávače. Zajímají nás dvě pole: `muted` (ať čudlík neříká
     „Zapnout zvuk", když si ho host mezitím pustil nativním ovládáním)
     a `playerState` (ať víme, jestli video zastavil host, nebo my). */
  if (!window.__vrVidMsg) {
    window.__vrVidMsg = true;
    window.addEventListener('message', (e) => {
      if (e.origin !== YT_ORIGIN || typeof e.data !== 'string') return;
      let d; try { d = JSON.parse(e.data); } catch (err) { return; }
      const info = d && d.info; if (!info) return;
      $all('.vr-vidbox[data-yt]').forEach((box) => {
        const f = box.querySelector('iframe');
        if (!f || f.contentWindow !== e.source) return;
        if (info.playerState != null) box.dataset.ytState = String(info.playerState);
        if (info.muted != null) {
          const sound = vidPart(box, '.vr-vid-sound'); if (!sound) return;
          const want = (info.muted === true || info.muted === 'true') ? 'off' : 'on';
          if (sound.getAttribute('data-sound') !== want) { sound.setAttribute('data-sound', want); vidSyncSound(box); }
        }
      });
    });
  }
}
/* Lokalizace čudlíku (text se mění podle stavu, takže data-t sám nestačí). */
function applyVideoAria() {
  $all('.vr-vidbox[data-yt]').forEach((box) => {
    vidSyncSound(box);
    const start = box.querySelector('.vr-vid-start');
    if (start) start.setAttribute('aria-label', ((tt().video && tt().video.start) || 'Play') + ': ' + vidLabel(box));
    const frame = box.querySelector('iframe');
    if (frame) frame.setAttribute('title', vidLabel(box));
  });
}

/* Blok vzdáleností pro sekci Lokalita (ilustrativní mapa je statická v HTML). */
/* ---------- Lokalita: počty výletů, okruhy, „Než dorazíte", sezónní lead ---------- */
/* Plurál: čeština a polština mají tři tvary (1 / 2–4 / 5+), angličtina a němčina dva. */
function pluralForm(lang, n) {
  if (lang === 'cs') return n === 1 ? 0 : (n >= 2 && n <= 4 ? 1 : 2);
  if (lang === 'pl') {
    if (n === 1) return 0;
    const d = n % 10, h = n % 100;
    return (d >= 2 && d <= 4 && !(h >= 12 && h <= 14)) ? 1 : 2;
  }
  return n === 1 ? 0 : 1;
}
/* Prvky s data-tpl + data-count nesou šablonu s {n} (řetězec nebo pole tvarů). */
function applyTripCounts() {
  const t = tt();
  $all('[data-tpl][data-count]').forEach((n) => {
    const v = resolve(t, n.getAttribute('data-tpl'));
    const key = n.getAttribute('data-count');
    const num = VR_TRIP_COUNTS[key] != null ? VR_TRIP_COUNTS[key] : VR_TRIP_COUNTS.total;
    let tpl = v;
    if (Array.isArray(v)) tpl = v[Math.min(pluralForm(state.lang, num), v.length - 1)];
    if (typeof tpl !== 'string') return;
    n.textContent = fillFacts(tpl.replace('{n}', String(num)));
  });
}
/* Blok „Než dorazíte". KAŽDÁ SEZÓNA MÁ JINÉ PRIORITY (verdikt, bod e):

   ZIMA — host řeší skibus, parkování a cestu autem. Vlak a autobus se slévají
   do jednoho řádku (nemažou se, vždycky někdo dojíždí zvlášť) a Drážďany
   vypadnou. Ne však na německé verzi: Sasko je reálný zdrojový trh německých
   skupin a tam ta vzdálenost rozhoduje nejvíc (verdikt, chyba č. 13 — „mazat
   Drážďany všude" je chyba, řeší se to variantou, ne mazáním).

   LÉTO (7/2026, majitel) — skibus pryč (v létě nejezdí) a tři řádky dojezdů
   z metropolí se slévají do jediného nenápadného „Autem" na konci seznamu.
   Ten řádek je poslední místo na webu, kde dojezd z Prahy a Vratislavi ještě
   stojí; z pásu čísel nad mapou v létě zmizel úplně. */
function renderArrive() {
  const t = tt();
  const host = $('#vr-lok-arrive'); if (!host) return; host.innerHTML = '';
  const L = t.lokalita || {};
  let rows = (L.arrive || []).slice();
  if (state.season === 'zima') {
    rows = rows.filter((r) => !(r.id === 'dresden' && state.lang !== 'de'));
    const tw = L.arriveTransitWinter;
    if (tw) {
      const at = rows.findIndex((r) => r.id === 'train');
      rows = rows.filter((r) => r.id !== 'train' && r.id !== 'bus');
      if (at >= 0) rows.splice(at, 0, tw);
    }
    // Skibus a parkování nahoru; zbytek si drží pořadí (Array#sort je stabilní).
    const rank = { skibus: 0, parking: 1 };
    rows.sort((a, b) => (rank[a.id] != null ? rank[a.id] : 9) - (rank[b.id] != null ? rank[b.id] : 9));
  } else {
    // LÉTO: skibus v létě nejezdí, tak ho tu nikdo nehledá. A tři samostatné
    // řádky dojezdů (Praha / Vratislav / Drážďany) majitel v letní verzi
    // nechtěl — slévají se do jednoho nenápadného řádku „Autem" úplně dole.
    // Nemažou se úplně: „kolik to je z Prahy" je pořád legitimní otázka.
    rows = rows.filter((r) => r.id !== 'skibus' && r.id !== 'praha' && r.id !== 'wroclaw' && r.id !== 'dresden');
    if (L.arriveCarSummer) rows.push(L.arriveCarSummer);
  }
  rows.forEach((r) => {
    host.appendChild(el('div', { class: 'vr-lok-arrive-row' }, [
      el('dt', { text: r.k }), el('dd', { text: r.v }),
    ]));
  });
}
/* Lead sekce Lokalita je SEZÓNNĚ DĚLENÝ SLOT — obě znění (lokalita.lead /
   lokalita.leadWinter) jsou staticky v index.html a přepínají se stylem. */
/* Živé počty z katalogu průvodce. Selhání je bezbolestné — zůstanou fallback čísla.
   POČTY JSOU SEZÓNNÍ: katalog nese u části cílů pole `seasons` (["summer"] /
   ["winter"]), a plánovač podle něj filtruje. Kdyby homepage počítala všechny
   záznamy, ukazovala by v zimě číslo, které plánovač nikdy nezobrazí. Proto se
   tady používá TÁŽ podmínka jako v assets/planner.js (seasonOk) a počty se
   přepočítají i při přepnutí sezóny. Žádné číslo o katalogu nesmí být natvrdo
   v textu ani v <title> — vždycky by bylo v jedné ze sezón špatně. */
function tripSeasonOk(tr) {
  const s = tr && tr.seasons;
  if (!Array.isArray(s) || !s.length) return true;   // bez značky = celoročně
  return s.indexOf(state.season === 'zima' ? 'winter' : 'summer') >= 0;
}
let TRIPS_RAW = null;   // slim katalog {zone, seasons} — drží se kvůli přepnutí sezóny
function countTrips(trips) {
  const c = { foot: 0, car: 0, day: 0, total: 0 };
  trips.filter(tripSeasonOk).forEach((tr) => {
    if (tr.zone === 'villa') c.foot++;
    else if (tr.zone === 'near') c.car++;
    else if (tr.zone === 'far') c.day++;
  });
  c.foot += VR_LOCAL_EXTRA.foot; c.car += VR_LOCAL_EXTRA.car; c.day += VR_LOCAL_EXTRA.day;
  c.total = c.foot + c.car + c.day;
  return c;
}
/* Přepočítá počty pro AKTUÁLNÍ sezónu (volá se i ze setSeason). */
function applySeasonTripCounts() {
  if (!Array.isArray(TRIPS_RAW) || !TRIPS_RAW.length) { applyTripCounts(); return; }
  const c = countTrips(TRIPS_RAW);
  if (!c.total) { applyTripCounts(); return; }
  VR_TRIP_COUNTS.foot = c.foot; VR_TRIP_COUNTS.car = c.car;
  VR_TRIP_COUNTS.day = c.day; VR_TRIP_COUNTS.total = c.total;
  applyTripCounts();
}
function loadTripCounts() {
  const apply = (list) => {
    if (!Array.isArray(list) || !list.length) return;
    TRIPS_RAW = list;
    applySeasonTripCounts();
  };
  try {
    const raw = localStorage.getItem(TRIPS_CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw);
      if (c && Date.now() - c.at < TRIPS_TTL && Array.isArray(c.list)) { apply(c.list); return; }
    }
  } catch (e) {}
  if (typeof fetch !== 'function') return;
  fetch(TRIPS_URL, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const trips = d && (Array.isArray(d) ? d : d.trips);
      if (!Array.isArray(trips) || !trips.length) return;
      // Do keše jde jen to, co pro počty potřebujeme (zóna + sezónní značka).
      const list = trips.map((tr) => ({ zone: tr.zone, seasons: tr.seasons }));
      if (!countTrips(list).total) return; // neznámý formát → ponech fallback
      try { localStorage.setItem(TRIPS_CACHE_KEY, JSON.stringify({ at: Date.now(), list: list })); } catch (e) {}
      apply(list);
    })
    .catch(() => {});
}

/* VYBAVENÍ SE UŽ Z JS NEVYKRESLUJE.
   Od 7/2026 je celý seznam staticky v index.html (#vr-amen) jako JEDEN zdroj
   položek; sezónní pořadí i velikost karet dává CSS `order` (viz .vr-amen
   v site.css), sezónně neplatné položky schová [data-season-only].
   Důvod: text, který ve stránce fyzicky není, se neindexuje — a hlavně tím
   zmizel oddělený blok „A k tomu celoročně", ve kterém byla zahrabaná LYŽÁRNA.
   BAZÉN JE V ZIMĚ MIMO PROVOZ (majitel 7/2026: „v zimě ho tam vůbec nedávej,
   ať nemají pocit, že přijedou a budou mít bazén") — jeho karta má proto
   data-season-only="leto" a v zimě se vůbec nevykreslí. */

/* Ložnice a lůžka — přehledná mřížka karet (Suite jako široká featured karta +
   4 pokoje). Data potvrzena majitelem; u Suite se drží střízlivé „3 ložnice
   s manželskými postelemi, až 10 hostů" (zbylá lůžka se nevymýšlejí). */
const bedIcon = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 17v-6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v6"></path><path d="M2 17h20"></path><path d="M2 20v-3M22 20v-3"></path><path d="M6 9V7.5A1.5 1.5 0 0 1 7.5 6h9A1.5 1.5 0 0 1 18 7.5V9"></path></svg>';
const guestsIcon = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"></path></svg>';
/* ===================== Interiérový karusel (#loznice) =====================
   Majitel: „hover vypadá klikatelně, klikneš a nic. Chci nekonečný karusel a aby
   z něj pěkně vystoupila 360." Sekce je teď tažný NEKONEČNÝ karusel interiéru
   (pokoje + kuchyně + sauna + wellness + koupelny + podkroví). Klik → lightbox;
   kde existuje zimní 360° scéna, i tlačítko „Prohlédnout ve 360°". Ovládání:
   myš (drag), trackpad/kolečko, dotyk, šipky i klávesnice; při prefers-reduced-
   motion žádné auto-posouvání. Rozpis lůžek zůstává jako textový blok pod ním.
   Fotky VÝHRADNĚ z lednové sady 2026 (generace interiérů se nemíchá).
   pano = ID scény v ZIMNÍ 360° sadě (PANO_SETS.zima), kde daný prostor existuje.
   Schválně ID, ne pořadí: vkládání nových scén do prohlídky nesmí tiše přehodit
   tlačítka „Prohlédnout ve 360°" na jiné místnosti (což se stalo).

   PŘIŘAZENÍ POKOJŮ (opraveno): dřívější rozdělení vzniklo odhadem podle tapet.
   Nově je každá fotka spárovaná s panoramatem, jehož identitu potvrzuje
   majitelova vlastní keypano prohlídka (vr-pano-mapovani.md), a s majitelovými
   per-pokoj složkami fotek (Villa Rudolf_web size/3_VR_Room 1 … 1_VR_Suite):
     Pokoj 1  = kropenatá tapeta, arkýř se třemi okny     → pano IMG…406
     Pokoj 2  = šedá tkaná tapeta, stůl s lavicemi        → pano IMG…424 (`room2`)
     Pokoj 3  = zlaté palmové listy, vlastní koupelna     → pano IMG…415 (`room3`)
     Pokoj 4  = mramorová nika mezi dřevěnými sloupy      → pano IMG…431 (`room4`)
     Apartmá  = obývák se „stromovými" sloupy + ložnice   → pano out_344 (`apt-living`)
   Fotky dřív vedené jako „Pokoj 2" jsou ve skutečnosti Pokoj 1 a fotky vedené
   jako „Apartmá" jsou Pokoj 2 — obě sady jsou proto přeznačené.
   Koupelna Pokoje 2 už má vlastní panorama (`bath2`, IMG…377 — shodné s
   majitelovou keypano scénou „Bedroom no. 2 bathroom"), takže tlačítko do 360°
   u ní zase svítí. */
/* gal = MALÁ GALERIE daného pokoje (majitel: „u každého pokoje máme víc fotek,
   které bysme tam mohli dodat"). První položka je vždy fotka z karty. */
const IV = '?v=34';   // fotky pokojů změnily obsah při stejných názvech → cache-buster
const INTERIOR = [
  { k: 'kitchen',  img: 'media/sections/int-kitchen.jpg',  pano: 'dining' },
  { k: 'suite',    img: 'media/sections/room-suite.jpg' + IV,  pano: 'apt-living',
    gal: ['media/sections/room-suite.jpg' + IV, 'media/sections/room-suite-b.jpg' + IV, 'media/sections/room-suite-c.jpg' + IV, 'media/sections/room-suite-d.jpg' + IV] },
  { k: 'room1',    img: 'media/sections/room-1.jpg' + IV,      pano: 'room1',
    gal: ['media/sections/room-1.jpg' + IV, 'media/sections/room-1b.jpg' + IV, 'media/sections/room-1c.jpg' + IV] },
  { k: 'room2',    img: 'media/sections/room-2.jpg' + IV,      pano: 'room2',
    gal: ['media/sections/room-2.jpg' + IV, 'media/sections/room-2b.jpg' + IV, 'media/sections/room-2c.jpg' + IV, 'media/sections/room-2d.jpg' + IV, 'media/sections/bath-room2.jpg'] },
  { k: 'bath2',    img: 'media/sections/bath-room2.jpg',   pano: 'bath2' },   // koupelna Pokoje 2
  { k: 'room3',    img: 'media/sections/room-3.jpg' + IV,      pano: 'room3',
    gal: ['media/sections/room-3.jpg' + IV, 'media/sections/room-3b.jpg' + IV, 'media/sections/room-3c.jpg' + IV, 'media/sections/bath-room3.jpg'] },
  { k: 'bath3',    img: 'media/sections/bath-room3.jpg',   pano: 'bath3' },   // koupelna Pokoje 3
  { k: 'room4',    img: 'media/sections/room-4.jpg' + IV,      pano: 'room4',
    gal: ['media/sections/room-4.jpg' + IV, 'media/sections/room-4b.jpg' + IV, 'media/sections/room-4c.jpg' + IV, 'media/sections/bath-room4.jpg'] },
  { k: 'bath4',    img: 'media/sections/bath-room4.jpg',   pano: 'bath4' },   // koupelna Pokoje 4
  /* SAUNA / WELLNESS / SPRCHA U SAUNY tu ZÁMĚRNĚ NEJSOU (verdikt, bod a).
     Byly zároveň tady i v sekci Vybavení — a am-wellness.jpg s int-wellness.jpg
     je prakticky týž záběr předsálí sauny. Skutečná duplicita na stránce nebyly
     sekce, ale FOTKY, takže se přesunuly do vybavení (karta „Privátní finská
     sauna" používá int-sauna.jpg) a tenhle karusel je teď opravdu jen o tom,
     kde se spí a kde se koupe. Do 360° prohlídky se scény sauna/wellness
     nesahalo — tam zůstávají. */
];
/* Štítek místnosti přímo NA fotce (karta i lightbox). Majitel: „bylo by dobrý,
   kdyby u každý na každý fotce bylo přímo označení, co to je za pokoj. Asi by to
   stačilo anglicky pro všechny verze." → JEDEN anglický řetězec pro všechny
   jazykové mutace (schváleno majitelem), takže se NEpřekládá přes i18n. */
const ROOM_EN = {
  kitchen: 'Kitchen & dining', suite: 'Suite',
  room1: 'Room 1', room2: 'Room 2', room3: 'Room 3', room4: 'Room 4',
  bath2: 'Bathroom — Room 2', bath3: 'Bathroom — Room 3', bath4: 'Bathroom — Room 4',
  sauna: 'Sauna', wellness: 'Wellness', bath: 'Wellness shower',
};
/* Mapa fotka → štítek. Nejdřív fotky z karet (ty určují jméno prostoru), teprve
   pak fotky z malých galerií — díky tomu má koupelna schovaná v galerii pokoje
   svůj vlastní štítek („Bathroom — Room 3"), ne jméno pokoje. */
const ROOM_LABEL_BY_SRC = (() => {
  const m = {};
  INTERIOR.forEach((it) => { if (it.img && ROOM_EN[it.k]) m[it.img] = ROOM_EN[it.k]; });
  INTERIOR.forEach((it) => (it.gal || []).forEach((s) => { if (!m[s] && ROOM_EN[it.k]) m[s] = ROOM_EN[it.k]; }));
  return m;
})();
const roomTag = (src, k) => ROOM_LABEL_BY_SRC[src] || ROOM_EN[k] || '';
/* Odznak „360" na kartě smí svítit jen tam, kde scéna s tím ID opravdu je. */
const has360 = (it) => it && it.pano != null && panoIdx(it.pano) >= 0;

const zoomIcon = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"></circle><path d="M20.5 20.5 16 16M11 8v6M8 11h6"></path></svg>';
const spinIcon = () => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="12" rx="10" ry="4.6"></ellipse><path d="M6.5 13.5A6 6 0 0 0 17.5 13.5"></path><path d="M16 10.4 17.7 13l-2.9.5"></path></svg>';

function interiorLbList() { return INTERIOR.map((it) => ({ src: it.img, pano: it.pano, tag: roomTag(it.img, it.k) })); }
/* Klik na kartu: má-li prostor víc fotek, otevře se jeho MALÁ GALERIE (šipky
   i Esc jedou jen po ní). Tlačítko „Prohlédnout ve 360°" visí u všech fotek
   pokoje, ať nezmizí při prolistování. Karta s jednou fotkou se chová jako dřív
   — otevře celý interiér, aby šlo listovat dál. */
function interiorLbFor(idx) {
  const it = INTERIOR[idx];
  if (it && it.gal && it.gal.length > 1) {
    const name = (tt().interior && tt().interior.items && tt().interior.items[it.k]) || '';
    return { list: it.gal.map((src) => ({ src: src, pano: it.pano, name: name, tag: roomTag(src, it.k) })), start: 0 };
  }
  return { list: interiorLbList(), start: idx };
}

function buildInteriorCard(it, idx) {
  const t = tt();
  const name = (t.interior && t.interior.items && t.interior.items[it.k]) || '';
  return el('button', { type: 'button', class: 'vr-car-card', 'data-idx': String(idx), 'aria-label': name }, [
    el('img', { src: it.img, alt: name + ' — Villa Rudolf', loading: 'lazy', decoding: 'async', width: '900', height: '1200' }),
    // anglický štítek místnosti přímo na fotce (aria-hidden: čtečka už má aria-label karty)
    el('span', { class: 'vr-car-tag', 'aria-hidden': 'true', text: roomTag(it.img, it.k) }),
    el('span', { class: 'vr-car-badge' + (has360(it) ? ' is360' : ''), 'aria-hidden': 'true', html: has360(it) ? spinIcon() : zoomIcon() }),
    el('span', { class: 'vr-car-cap' }, [el('span', { 'data-t': 'interior.items.' + it.k, text: name })]),
  ]);
}

let interiorBuilt = false;
function renderBedrooms() {
  if (interiorBuilt) return;   // postaví se jednou; texty (data-t) obnoví setTexts()
  const track = $('#vr-car-track');
  if (!track) return;
  interiorBuilt = true;
  const COPIES = 3;            // 3 kopie = plný buffer na obou stranách pro plynulou smyčku
  for (let c = 0; c < COPIES; c++) INTERIOR.forEach((it, i) => track.appendChild(buildInteriorCard(it, i)));
  setupCarousel(track);
  buildRoster($('#vr-roster'));
}

/* ROZPIS LŮŽEK JE ROZHODOVACÍ TABULKA, NE DEKORACE (verdikt, bod a).
   Organizátor podle něj dělí lidi do pokojů a kopíruje ho do skupinového chatu,
   takže musí zůstat zřetelně označeným blokem s VLASTNÍ KOTVOU (#rozpis)
   a položkou v menu (nav.loznice → #loznice). Nikdy ho nerozpouštěj mezi
   dlaždice vybavení — pak přijde e-mail místo rezervace.

   Od 7/2026 nese vlastní podnadpis „Kde se u nás vyspíte" — nadpis celé sekce
   se přejmenoval na „Dům zevnitř" (karusel dávno veze i kuchyň, saunu
   a koupelny), takže slib o spaní se přesunul přesně sem, kde ho web plní. */
function buildRoster(host) {
  if (!host) return;
  const t = tt(); host.innerHTML = '';
  host.appendChild(el('h3', { id: 'rozpis', class: 'vr-roster-title', 'data-t': 'interior.rosterTitle', text: (t.interior && t.interior.rosterTitle) || '' }));
  const note = t.interior && t.interior.rosterNote;
  if (note) host.appendChild(el('p', { class: 'vr-roster-note', 'data-t': 'interior.rosterNote', text: fillFacts(note) }));
  const list = el('dl', { class: 'vr-roster-list' });
  (t.bedrooms.rooms || []).forEach((r, i) => {
    list.appendChild(el('div', { class: 'vr-roster-row' }, [
      el('span', { class: 'vr-roster-ic', 'aria-hidden': 'true', html: bedIcon() }),
      el('dt', {}, [
        el('b', { 'data-t': 'bedrooms.rooms.' + i + '.name', text: r.name }),
        el('span', { class: 'vr-roster-cap', 'data-t': 'bedrooms.rooms.' + i + '.cap', text: r.cap }),
      ]),
      el('dd', { 'data-t': 'bedrooms.rooms.' + i + '.beds', text: r.beds }),
    ]));
  });
  host.appendChild(list);
}

function setupCarousel(track) {
  const car = track.parentElement, per = INTERIOR.length;
  let P = 0, dragging = false, moved = 0, startX = 0, startScroll = 0, lastInteract = 0;
  const measure = () => {
    const kids = track.children;
    if (kids.length < per * 2) { P = 0; return; }
    P = kids[per].offsetLeft - kids[0].offsetLeft;
  };
  const wrap = () => {
    if (P <= 0) return;
    const s = track.scrollLeft;
    if (s >= 2 * P) track.scrollLeft = s - P;
    else if (s < P) track.scrollLeft = s + P;
  };
  const bump = () => { lastInteract = Date.now(); };
  measure();
  track.scrollLeft = P || 0;   // start v prostřední kopii
  window.addEventListener('resize', () => { measure(); wrap(); });
  $all('img', track).forEach((im) => { if (!im.complete) im.addEventListener('load', measure, { once: true }); });
  track.addEventListener('scroll', wrap, { passive: true });

  // auto-drift (zleva doprava), pauza při interakci; reduced-motion → vypnuto
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let hover = false, last = 0;
  const tick = (ts) => {
    requestAnimationFrame(tick);
    const dt = last ? ts - last : 16; last = ts;
    if (reduce || hover || dragging || Date.now() - lastInteract < 2600) return;
    track.scrollLeft += Math.min(dt, 40) * 0.02; wrap();
  };
  if (!reduce) requestAnimationFrame(tick);
  car.addEventListener('mouseenter', () => { hover = true; });
  car.addEventListener('mouseleave', () => { hover = false; });

  /* Myš drag (dotyk necháme nativnímu scrollu). ZÁMĚRNĚ BEZ setPointerCapture:
     pointer capture přesměroval i následný `click` na track, takže v delegované
     obsluze vyšlo e.target = track a closest('.vr-car-card') = null → klik na
     kartu se tiše zahodil (majitel: „klikneš a nic"). Drag proto držíme přes
     window listenery, které si po skončení gesta zase odregistrujeme. */
  let pid = null, startY = 0;
  const onDragMove = (e) => {
    if (!dragging || (pid !== null && e.pointerId !== pid)) return;
    const dx = e.clientX - startX;
    moved = Math.max(moved, Math.abs(dx), Math.abs(e.clientY - startY));
    track.scrollLeft = startScroll - dx; wrap(); bump();
  };
  const endDrag = (e) => {
    if (!dragging) return;
    if (e && pid !== null && e.pointerId != null && e.pointerId !== pid) return;
    dragging = false; pid = null; track.classList.remove('dragging');
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
  };
  track.addEventListener('pointerdown', (e) => {
    moved = 0;                                  // reset i pro dotyk, ať nezůstane starý drag
    if (e.pointerType === 'touch') return;
    if (e.button != null && e.button !== 0) return;
    dragging = true; pid = e.pointerId; startX = e.clientX; startY = e.clientY; startScroll = track.scrollLeft;
    track.classList.add('dragging');
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
  });
  track.addEventListener('touchstart', bump, { passive: true });
  track.addEventListener('touchmove', () => { bump(); wrap(); }, { passive: true });

  // kolečko/trackpad → vodorovně
  track.addEventListener('wheel', (e) => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!d) return;
    track.scrollLeft += d; wrap(); bump(); e.preventDefault();
  }, { passive: false });

  // šipky (tlačítka) + klávesnice
  const step = () => Math.max(220, Math.round(car.clientWidth * 0.5));
  const go = (dir) => { bump(); track.scrollBy({ left: dir * step(), behavior: 'smooth' }); };
  const pv = $('#vr-car-prev'), nx = $('#vr-car-next');
  if (pv) pv.addEventListener('click', () => go(-1));
  if (nx) nx.addEventListener('click', () => go(1));
  track.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { go(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { go(1); e.preventDefault(); }
  });

  /* Klik na kartu → lightbox. Kartu resolvujeme třemi cestami, ať nikdy
     nepropadne: e.target → elementFromPoint (pojistka, kdyby cíl přebral jiný
     prvek) → aktivní prvek (Enter/Space na <button>, kde clientX/Y jsou 0).
     Drag potlačíme až od 10 px — myš při běžném kliknutí mikroskopicky ujede. */
  track.addEventListener('click', (e) => {
    let card = (e.target && e.target.closest) ? e.target.closest('.vr-car-card') : null;
    if (!card && (e.clientX || e.clientY)) {
      const hit = document.elementFromPoint(e.clientX, e.clientY);
      card = (hit && hit.closest) ? hit.closest('.vr-car-card') : null;
    }
    const kb = !e.detail && !e.clientX && !e.clientY;   // klávesnice: Enter/Space
    if (!card && kb) {
      const act = document.activeElement;
      card = (act && act.closest) ? act.closest('.vr-car-card') : null;
    }
    if (!card || !track.contains(card)) return;
    if (!kb && moved > 10) { e.preventDefault(); return; }
    const g = interiorLbFor(+card.getAttribute('data-idx'));
    lbOpen(g.list, g.start);
  });
}

/* Skok z lightboxu do 360°: interiérové scény žijí jen v ZIMNÍ sadě, takže
   přepneme na zimu, zrušíme filtr skupin (ať je scéna vidět i v pruhu),
   nastavíme scénu, doskrolujeme k prohlídce a načteme pano.
   POŘADÍ: nejdřív renderThumbs() (postaví pruh), teprve pak renderScene() —
   ten totiž doroluje AKTIVNÍ náhled do pruhu, a musí k tomu už existovat.
   Dřív bylo pořadí opačné, takže se scéna sice načetla správně, ale její
   náhled mohl zůstat schovaný za okrajem pruhu. */
function openTourScene(idx) {
  panoSkipIntro = true;      // cílený skok na scénu → žádný nájezd
  if (state.season !== 'zima') setSeason('zima');
  state.panoGroup = 'all';
  state.scene = idx;
  renderPanoGroups(); renderThumbs(); renderScene();
  ensureThree(initPano);
  const jump = () => { if (loadPano) loadPano(idx); };
  jump(); setTimeout(jump, 380);
  const sec = document.getElementById('interier');
  if (sec) sec.scrollIntoView({ behavior: prefersReduced() ? 'auto' : 'smooth', block: 'start' });
  // Pruh se rozloží až po přepnutí sezóny/skupiny — dorolování zopakuj, až
  // bude mít strip finální šířku (jinak by scrollLeft počítal ze starého stavu).
  setTimeout(() => { syncStripArrows(); scrollThumbIntoView(false); }, 420);
}

/* Přepnutí scény z pruhu náhledů i z menu skupin. */
function goScene(i) {
  panoLastInteract = Date.now();
  if (state.scene === i) return;
  state.scene = i; renderScene();
  if (loadPano) loadPano(i);
}

/* ===================== Menu skupin (pater) =====================
   Majitel chtěl „malý menu jako na keypanu — exteriéry, interiéry, první patro,
   druhý patro". Skupiny jsou majitelovo VLASTNÍ rozdělení z jeho prohlídky
   (PANO_GROUPS). Je to ovládání JEDNÉ sekce, ne druhá úroveň záložek: chipy
   jen filtrují pruh náhledů a skočí na první scénu skupiny. Skupiny bez scén
   v aktuální sezóně se nezobrazí; když sezóna vystačí s jednou skupinou
   (léto = jen exteriéry), menu se skryje celé. */
function renderPanoGroups() {
  const host = $('#vr-pano-groups'); if (!host) return;
  const t = tt();
  const keys = seasonGroups();
  host.innerHTML = '';
  if (keys.length < 2) { host.hidden = true; return; }
  host.hidden = false;
  host.setAttribute('aria-label', (t.tour && t.tour.groupsLabel) || '');
  const mk = (key, label) => el('button', {
    class: 'vrp-group', type: 'button', 'data-group': key,
    'data-active': state.panoGroup === key ? 'true' : 'false',
    'aria-pressed': state.panoGroup === key ? 'true' : 'false',
    text: label,
    onclick: () => setPanoGroup(key),
  });
  host.appendChild(mk('all', (t.tour && t.tour.groupAll) || 'Vše'));
  keys.forEach((k) => host.appendChild(mk(k, (t.tour && t.tour.groups && t.tour.groups[k]) || k)));
}

function setPanoGroup(key) {
  panoLastInteract = Date.now();
  state.panoGroup = key;
  $all('#vr-pano-groups .vrp-group').forEach((b) => {
    const on = b.getAttribute('data-group') === key;
    b.setAttribute('data-active', on ? 'true' : 'false');
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  const vis = visibleScenes();
  renderThumbs();
  if (vis.indexOf(state.scene) < 0) goScene(vis[0]);
  else renderScene();
  const strip = $('#vr-thumbs'); if (strip) strip.scrollLeft = 0;
}

/* Klávesnice v menu skupin: šipky posouvají fokus po chipech (Enter/Space
   aktivuje nativně, chip je <button>). */
function setupPanoGroupKeys() {
  const host = $('#vr-pano-groups'); if (!host) return;
  host.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight' && e.key !== 'Home' && e.key !== 'End') return;
    const bs = $all('.vrp-group', host); if (!bs.length) return;
    let i = bs.indexOf(document.activeElement); if (i < 0) i = 0;
    if (e.key === 'ArrowLeft') i = (i - 1 + bs.length) % bs.length;
    else if (e.key === 'ArrowRight') i = (i + 1) % bs.length;
    else if (e.key === 'Home') i = 0;
    else i = bs.length - 1;
    bs[i].focus(); e.preventDefault();
  });
}

function renderThumbs() {
  const host = $('#vr-thumbs'); if (!host) return; host.innerHTML = '';
  const files = panoFiles();
  const list = tourScenes();
  visibleScenes().forEach((i) => {
    const s = list[i]; if (!s) return;
    const b = el('button', {
      class: 'vrp-thumb', type: 'button', 'data-idx': String(i),
      'data-active': i === state.scene ? 'true' : 'false',
      onclick: () => goScene(i),
    }, [el('img', { src: 'media/pano/' + files[i] + '_t.jpg', alt: s.name, loading: 'lazy', decoding: 'async', width: '512', height: '256' }), el('span', { text: s.name })]);
    host.appendChild(b);
  });
  syncStripArrows();
}

/* ===================== ŠIPKY U PRUHU NÁHLEDŮ =====================
   Majitel žádal podruhé: „u sekce ‚Rozhlédněte se uvnitř i venku celých 360°',
   dole, jak je ta nabídka se sliderem — bylo by dobrý, kdyby tam byly šipky
   doleva a doprava, aby si to mohli posunout." Chová se to stejně jako šipky
   u karuselu ložnic: posun o ~jednu obrazovku náhledů, na krajích šipka zhasne
   (a nedá se na ni kliknout), klávesnice jede přes ArrowLeft/ArrowRight, dotyk
   a tažení zůstávají nativní. Když se do pruhu vejde všechno, obě šipky zmizí.
   Stav drží data-atributy na .vrp-striprail, takže CSS řeší i okrajový fade —
   z pruhu je na první pohled vidět, že pokračuje. */
function stripStep() {
  const strip = $('#vr-thumbs'); if (!strip) return 240;
  return Math.max(200, Math.round(strip.clientWidth * 0.85));
}
function syncStripArrows() {
  const rail = $('.vrp-striprail'), strip = $('#vr-thumbs');
  if (!rail || !strip) return;
  const max = strip.scrollWidth - strip.clientWidth;
  rail.setAttribute('data-scrollable', max > 4 ? 'true' : 'false');
  rail.setAttribute('data-start', strip.scrollLeft <= 2 ? 'true' : 'false');
  rail.setAttribute('data-end', strip.scrollLeft >= max - 2 ? 'true' : 'false');
}
function setupThumbStrip() {
  const rail = $('.vrp-striprail'), strip = $('#vr-thumbs');
  if (!rail || !strip || rail.dataset.wired) return;
  rail.dataset.wired = '1';
  const go = (dir) => strip.scrollBy({ left: dir * stripStep(), behavior: prefersReduced() ? 'auto' : 'smooth' });
  const pv = $('#vr-strip-prev'), nx = $('#vr-strip-next');
  if (pv) pv.addEventListener('click', () => go(-1));
  if (nx) nx.addEventListener('click', () => go(1));
  strip.addEventListener('scroll', syncStripArrows, { passive: true });
  window.addEventListener('resize', syncStripArrows);
  // Klávesnice: šipky posouvají pruh, když je fokus na některém náhledu.
  // (Náhledy jsou <button>, takže vlastní tab-stop pruh nepotřebuje.)
  rail.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowLeft') { go(-1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { go(1); e.preventDefault(); }
  });
  syncStripArrows();
}
/* Lokalizované popisky pruhu a jeho šipek. */
function applyStripAria() {
  const t = tt().tour || {};
  const set = (sel, v) => { const n = $(sel); if (n && v) n.setAttribute('aria-label', v); };
  set('#vr-thumbs', t.stripLabel);
  set('#vr-strip-prev', t.stripPrev);
  set('#vr-strip-next', t.stripNext);
}
/* Aktivní náhled dorolujeme do pruhu vodorovně (ne scrollIntoView — ten by
   škubl i svisle). Důležité při skoku z lightboxu ložnice: scéna se má
   v pruhu ukázat, ne zůstat schovaná za okrajem. */
function scrollThumbIntoView(smooth) {
  const strip = $('#vr-thumbs'); if (!strip) return;
  const b = strip.querySelector('.vrp-thumb[data-active="true"]'); if (!b) return;
  const l = b.offsetLeft, r = l + b.offsetWidth;
  const vs = strip.scrollLeft, ve = vs + strip.clientWidth;
  const beh = (smooth && !prefersReduced()) ? 'smooth' : 'auto';
  if (l < vs + 8) strip.scrollTo({ left: Math.max(0, l - 16), behavior: beh });
  else if (r > ve - 8) strip.scrollTo({ left: r - strip.clientWidth + 16, behavior: beh });
}

function renderScene() {
  const list = tourScenes();
  const sc = state.scene;
  const s = list[sc] || list[0]; if (!s) return;
  $('#vrp-capname').textContent = s.name;
  $('#vr-scene-name').textContent = s.name;
  $('#vr-scene-desc').textContent = s.desc;
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  /* Číslování odpovídá tomu, co je vidět v pruhu (tj. i zvolené skupině). */
  const vis = visibleScenes();
  const at = vis.indexOf(sc);
  $('#vr-scene-idx').textContent = pad((at < 0 ? 0 : at) + 1);
  $('#vr-scene-count').textContent = pad(vis.length);
  $all('#vr-thumbs .vrp-thumb').forEach((b) => b.setAttribute('data-active', +b.getAttribute('data-idx') === sc ? 'true' : 'false'));
  scrollThumbIntoView(true);
}

/* Sekce „Co vás čeká v každé sezóně" (#sezony) ZANIKLA (7/2026, majitel):
   „Ti, co přijedou na léto, hledají léto, ti, co na zimu, hledají zimu."
   Sezónnost drží celý web sám (data-season) — druhá sekce o tomtéž nebyla
   k ničemu. Nezakládej ji znovu. */

function renderTrips() {
  const t = tt();
  const host = $('#vr-vyl'); host.innerHTML = '';
  t.vylety.items.forEach((it, i) => {
    const art = el('article');
    const src = TRIP_IMAGES[i];
    if (src) art.appendChild(el('img', { src: src, alt: it.name, loading: 'lazy', width: '1200', height: '800' }));
    art.appendChild(el('span', { class: 'vr-tag', text: it.tag }));
    art.appendChild(el('h3', { text: it.name }));
    art.appendChild(el('p', { text: it.desc }));
    host.appendChild(art);
  });
}

/* ============================ Galerie (všechny fotky + lightbox) ============================
   Bez filtrů a bez sezónního předvýběru — jeden souvislý list, jak si majitel
   přál. Mřížka je rychlá i při stovce položek: dlaždice je čtvercový 512px
   náhled s loading="lazy" a pevným width/height (žádný CLS), plná fotka se
   stahuje teprve v lightboxu. */
function galSquare(f) { return 'media/gallery/sq/' + f.slice(f.lastIndexOf('/') + 1); }
function renderGallery() {
  const host = $('#vr-gal'); if (!host) return;
  host.innerHTML = '';
  const lbList = GALLERY.map((g) => ({ src: g.f }));
  const frag = document.createDocumentFragment();
  GALLERY.forEach((g, i) => frag.appendChild(el('img', {
    src: galSquare(g.f), alt: g.alt, loading: 'lazy', decoding: 'async',
    width: '512', height: '512',
    onclick: () => lbOpen(lbList, i),
  })));
  host.appendChild(frag);
  applyGalleryNote();
}
/* Poznámka v hlavičce nese počet — „Všechny fotky (54)" je konkrétnější slib
   než holé „Galerie" a rovnou říká, že se pod tím nic neschovává. Běží i ze
   setTexts(), aby počet přežil přepnutí jazyka. */
function applyGalleryNote() {
  const note = $('.vr-gal-head .vr-sec-note');
  const tpl = (tt().gallery || {}).note;
  if (note && typeof tpl === 'string') note.textContent = tpl.replace('{n}', GALLERY.length);
}

/* ============================ Booking calendar ============================ */
/* Real availability. Booked nights come from the shared booking calendar's
   public history feed (villa-booking-calendar). PRIVACY: only start/end dates
   are ever read, cached or rendered — guest names and platforms are never
   touched. `end` is the departure day, so occupied nights are start..end-1. */
const AVAIL_URL = 'https://pavelkubiznak.github.io/villa-booking-calendar/data/history.json';
const AVAIL_CACHE_KEY = 'vr_avail_v1';
const AVAIL_TTL = 3600000; // 1 h
let BOOKED = new Set();      // integer day-keys (YYYYMMDD) of occupied nights
let availStatus = 'loading'; // 'loading' | 'ok' | 'fail'

function dkey(d) { return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate(); }
function parseISO(s) { const p = String(s).split('-'); return new Date(+p[0], +p[1] - 1, +p[2]); }
/* Add every occupied night [start .. end-1] to the blocked set. */
function addNights(startStr, endStr) {
  const end = parseISO(endStr);
  for (let d = parseISO(startStr); d < end; d.setDate(d.getDate() + 1)) BOOKED.add(dkey(d));
}
function buildBooked(pairs) {
  BOOKED = new Set();
  pairs.forEach((p) => { try { addNights(p.s, p.e); } catch (e) {} });
}
/* Reduce the raw feed to future-only {s,e} date pairs — guest/platform dropped
   here so personal data never reaches the set, the cache, or the DOM. */
function slimFuture(records) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const out = [];
  records.forEach((r) => {
    if (!r || !r.start || !r.end) return;
    if (parseISO(r.end) > today) out.push({ s: r.start, e: r.end });
  });
  return out;
}
function loadAvailability() {
  try {
    const raw = sessionStorage.getItem(AVAIL_CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw);
      if (c && c.t && (Date.now() - c.t) < AVAIL_TTL && Array.isArray(c.pairs)) {
        buildBooked(c.pairs); availStatus = 'ok';
        renderCalendar(); updateAvailNote(); return;
      }
    }
  } catch (e) {}
  fetch(AVAIL_URL, { cache: 'no-store' })
    .then((r) => { if (!r.ok) throw new Error('http ' + r.status); return r.json(); })
    .then((records) => {
      const pairs = slimFuture(Array.isArray(records) ? records : []);
      buildBooked(pairs); availStatus = 'ok';
      try { sessionStorage.setItem(AVAIL_CACHE_KEY, JSON.stringify({ t: Date.now(), pairs: pairs })); } catch (e) {}
      renderCalendar(); updateAvailNote();
    })
    .catch(() => { availStatus = 'fail'; BOOKED = new Set(); renderCalendar(); updateAvailNote(); });
}
function updateAvailNote() {
  const n = $('#vr-avail-note'); if (!n) return;
  n.textContent = availStatus === 'fail' ? (tt().book.availFail || '') : '';
}
function toD(k) { return new Date(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100); }
function rangeBlocked(a, b) {
  let d = toD(a); const end = toD(b);
  while (true) {
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    if (d >= end) return false;
    if (BOOKED.has(dkey(d))) return true;
  }
}
/* Den před day-key k (YYYYMMDD). */
function prevKey(k) { const d = toD(k); d.setDate(d.getDate() - 1); return dkey(d); }
/* „Pouze odjezd" (checkout-only): den je obsazená noc (v BOOKED), ale předchozí den
   je volný → je to PRVNÍ noc nějaké rezervace, tedy něčí příjezd. Odjíždějící host
   tu žádnou noc netráví (ráno odjíždí), takže takový den je pro nového hosta
   použitelný jako DEN ODJEZDU. Tím se dá poptat celý volný týden mezi dvěma pobyty. */
function isCheckoutOnly(k) { return BOOKED.has(k) && !BOOKED.has(prevKey(k)); }
function pickDay(k) {
  const s0 = state.selStart, s1 = state.selEnd;
  if (isCheckoutOnly(k)) {
    // checkout-only den nelze použít jako příjezd — jen jako odjezd k rozpracovanému
    // volnému rozsahu (příjezd s0 zvolen, noci s0..k-1 volné). Jinak klik ignorujeme.
    if (s0 && !s1 && k > s0 && !rangeBlocked(s0, k)) { state.selEnd = k; }
    renderCalendar(); renderBookingPanel();
    return;
  }
  if (!s0 || s1 || k <= s0) { state.selStart = k; state.selEnd = 0; }
  else if (rangeBlocked(s0, k)) { state.selStart = k; state.selEnd = 0; }
  else { state.selEnd = k; }
  renderCalendar(); renderBookingPanel();
}
const MN_ALL = {
  cs: ['Leden', 'Únor', 'Březen', 'Duben', 'Květen', 'Červen', 'Červenec', 'Srpen', 'Září', 'Říjen', 'Listopad', 'Prosinec'],
  en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
  de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
  pl: ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'],
};
const DW_ALL = {
  cs: ['Po', 'Út', 'St', 'Čt', 'Pá', 'So', 'Ne'], en: ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'],
  de: ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'], pl: ['Pn', 'Wt', 'Śr', 'Cz', 'Pt', 'So', 'Nd'],
};
const NBf = {
  cs: (n) => (n === 1 ? 'noc' : n < 5 ? 'noci' : 'nocí'),
  en: (n) => (n === 1 ? 'night' : 'nights'),
  de: (n) => (n === 1 ? 'Nacht' : 'Nächte'),
  pl: (n) => (n === 1 ? 'noc' : n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20) ? 'noce' : 'nocy'),
};
/* Skloňování slova „dospělý" pro řádek městského poplatku. */
const ADf = {
  cs: (n) => (n === 1 ? 'dospělý' : n < 5 ? 'dospělí' : 'dospělých'),
  en: (n) => (n === 1 ? 'adult' : 'adults'),
  de: (n) => (n === 1 ? 'Erwachsener' : 'Erwachsene'),
  pl: (n) => (n === 1 ? 'dorosły' : 'dorosłych'),
};
/* Lokalizované názvy sezón — pro řádky rozpisu (víc sezón v jednom pobytu). */
const SEASON_LABEL = {
  cs: { letni: 'letní sezóna', zimni: 'zimní sezóna', mimo: 'mimo sezónu' },
  en: { letni: 'summer', zimni: 'winter', mimo: 'off-season' },
  de: { letni: 'Sommer', zimni: 'Winter', mimo: 'Nebensaison' },
  pl: { letni: 'sezon letni', zimni: 'sezon zimowy', mimo: 'poza sezonem' },
};
/* Úvod věty o minimální délce pobytu (vkládá se za %S% v book.minStay). */
const SEASON_IN = {
  cs: { letni: 'V létě', zimni: 'V zimě', mimo: 'Mimo hlavní sezónu' },
  en: { letni: 'In summer', zimni: 'In winter', mimo: 'Outside peak season' },
  de: { letni: 'Im Sommer', zimni: 'Im Winter', mimo: 'Außerhalb der Hauptsaison' },
  pl: { letni: 'Latem', zimni: 'Zimą', mimo: 'Poza sezonem' },
};

/* ---------- Ceník: výpočet nabídky (čisté funkce, bez DOM) ---------- */
/* Do které sezóny spadá noc s daným day-key (YYYYMMDD)? */
function vrSeasonForKey(k) {
  const mm = Math.floor(k / 100) % 100, dd = k % 100;
  const md = (mm < 10 ? '0' + mm : '' + mm) + '-' + (dd < 10 ? '0' + dd : '' + dd);
  for (const s of VR_PRICING.seasons) {
    if (!s.from || !s.to) continue;
    if (s.from <= s.to) { if (md >= s.from && md <= s.to) return s; }
    else if (md >= s.from || md <= s.to) return s; // sezóna přes Nový rok (12-20 → 03-15)
  }
  return VR_PRICING.seasons.find((s) => !s.from || !s.to) || VR_PRICING.seasons[VR_PRICING.seasons.length - 1];
}
/* Projde každou noc pobytu [příjezd .. odjezd-1]. */
function vrEachNight(s0, s1, fn) {
  let d = toD(s0); const end = toD(s1);
  while (d < end) { fn(dkey(d)); d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); }
}
/* Kompletní rozpis ceny pro rozsah a počet hostů. Cena každé noci se počítá
   dle sezóny té konkrétní noci (pobyt přes rozhraní sezón se sečte správně).
   Krátký (1noční) pobyt je povolen jen mimo sezónu, za sazbu shortStayNightly. */
function computeQuote(s0, s1, adults, children, pets) {
  const nights = (s0 && s1) ? Math.round((toD(s1) - toD(s0)) / 86400000) : 0;
  adults = Math.max(0, adults | 0); children = Math.max(0, children | 0); pets = Math.max(0, pets | 0);
  const q = {
    nights: nights, adults: adults, children: children, pets: pets, groups: [],
    accommodation: 0, cleaning: 0, cityTax: 0, petFee: 0, total: 0, deposit: 0,
    valid: false, reason: 'no-range', arrival: null, minNights: 0, weekend: false,
    guestOver: (adults + children) > VR_PRICING.maxGuests, noAdults: adults < 1,
  };
  if (nights <= 0) return q;
  const arrival = vrSeasonForKey(s0);
  q.arrival = arrival; q.minNights = arrival.minNights || 1;

  // Ceny po nocích podle sezóny KAŽDÉ noci (pobyt přes rozhraní sezón se sečte správně).
  const order = [], map = {};
  vrEachNight(s0, s1, (k) => {
    const s = vrSeasonForKey(k);
    if (!map[s.name]) { map[s.name] = { name: s.name, rate: s.nightly, nights: 0, subtotal: 0 }; order.push(s.name); }
    map[s.name].nights++; map[s.name].subtotal += s.nightly;
  });
  order.forEach((n) => q.groups.push(map[n]));

  /* Víkendová sazba za 2 noci (příjezd v pátek nebo v sobotu, obě noci v jedné
     sezóně). V sezóně vyjde stejně jako 2× noc, mimo sezónu je zvýhodněná
     (22 800 místo 23 800 Kč). Uplatní se jen když je pro hosta výhodnější. */
  if (nights === 2 && q.groups.length === 1) {
    const dow = toD(s0).getDay(); // 5 = pátek, 6 = sobota
    const w = arrival.weekend2;
    if ((dow === 5 || dow === 6) && w && w < q.groups[0].subtotal) {
      q.groups[0].subtotal = w; q.groups[0].weekend = true; q.weekend = true;
    }
  }

  q.accommodation = q.groups.reduce((a, g) => a + g.subtotal, 0);
  q.cleaning = VR_PRICING.cleaning;
  // Městský poplatek platí jen DOSPĚLÍ; děti se nepočítají.
  q.cityTax = Math.round(adults * nights * VR_PRICING.cityTaxAdultNight);
  // Pes / domácí mazlíček — jednorázově za pobyt, za každé zvíře.
  q.petFee = pets * VR_PRICING.petPerStay;
  q.total = q.accommodation + q.cleaning + q.cityTax + q.petFee;
  q.deposit = Math.round(q.total * VR_PRICING.depositPct / 100);
  q.valid = nights >= q.minNights;
  q.reason = q.valid ? 'ok' : 'min-stay';
  return q;
}

function fmtM(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' Kč'; }
function fmtNum(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
/* Orientační přepočet CZK → €/zł pro cizojazyčné verze (cs → null, platí se v CZK). */
function fxLine(czk, lang) {
  if (lang === 'en' || lang === 'de') return '≈ ' + fmtNum(Math.round(czk / VR_FX.EUR / 5) * 5) + ' €';
  if (lang === 'pl') return '≈ ' + fmtNum(Math.round(czk / VR_FX.PLN / 10) * 10) + ' zł';
  return null;
}
function fmtK(k) { return (k % 100) + '. ' + (Math.floor(k / 100) % 100) + '.'; }
function nightsCount() {
  const s0 = state.selStart, s1 = state.selEnd;
  return s0 && s1 ? Math.round((toD(s1) - toD(s0)) / 86400000) : 0;
}

/* Posun 2měsíčního okna kalendáře (‹ ›), v mezích 0 .. CAL_MAX_OFFSET. */
function shiftCal(dir) {
  const next = Math.max(0, Math.min(CAL_MAX_OFFSET, state.calOffset + dir));
  if (next === state.calOffset) return;
  state.calOffset = next;
  renderCalendar();
}
function updateCalNav() {
  const prev = $('#vr-cal-prev'), next = $('#vr-cal-next'); if (!prev || !next) return;
  const atStart = state.calOffset <= 0, atEnd = state.calOffset >= CAL_MAX_OFFSET;
  prev.disabled = atStart; prev.setAttribute('aria-disabled', atStart ? 'true' : 'false');
  next.disabled = atEnd; next.setAttribute('aria-disabled', atEnd ? 'true' : 'false');
  const t = tt();
  prev.setAttribute('aria-label', t.book.prevMonths || 'Prev');
  next.setAttribute('aria-label', t.book.nextMonths || 'Next');
}
function renderCalendar() {
  const lang = state.lang;
  const MN = MN_ALL[lang] || MN_ALL.cs;
  const DW = DW_ALL[lang] || DW_ALL.cs;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const s0 = state.selStart, s1 = state.selEnd;
  const host = $('#vr-cal'); if (!host) return; host.innerHTML = '';
  [0, 1].forEach((off) => {
    // okno posunuté o state.calOffset měsíců od aktuálního měsíce
    const base = new Date(today.getFullYear(), today.getMonth() + state.calOffset + off, 1);
    const y2 = base.getFullYear(), m = base.getMonth();
    const lead = (base.getDay() + 6) % 7;
    const dim = new Date(y2, m + 1, 0).getDate();
    const monthEl = el('div');
    monthEl.appendChild(el('div', { class: 'vr-cal-title', text: MN[m] + ' ' + y2 }));
    const grid = el('div', { class: 'vr-cal-grid' });
    DW.forEach((w) => grid.appendChild(el('div', { class: 'vr-dow', text: w })));
    for (let i = 0; i < lead; i++) grid.appendChild(el('button', { class: 'vr-day', type: 'button', 'data-st': 'e', tabindex: '-1', 'aria-hidden': 'true' }));
    for (let dd = 1; dd <= dim; dd++) {
      const k = y2 * 10000 + (m + 1) * 100 + dd;
      const isPast = new Date(y2, m, dd) < today;
      const bk = BOOKED.has(k);
      // checkout-only: obsazený den, jehož předchozí den je volný (něčí příjezd) →
      // pro nového hosta použitelný jako den odjezdu (Airbnb „half-shaded" den).
      const checkoutOnly = !isPast && bk && !BOOKED.has(prevKey(k));
      let st = isPast ? 'p' : (bk ? (checkoutOnly ? 'c' : 'b') : 'f');
      if (st === 'f') { if (k === s0 || k === s1) st = 's'; else if (s0 && s1 && k > s0 && k < s1) st = 'r'; }
      else if (st === 'c' && k === s1) st = 's'; // vybraný den odjezdu = konec pobytu
      const attrs = { class: 'vr-day', type: 'button', 'data-st': st, text: String(dd) };
      if (st !== 'p' && st !== 'b' && st !== 'e') attrs.onclick = () => pickDay(k);
      grid.appendChild(el('button', attrs));
    }
    monthEl.appendChild(grid);
    host.appendChild(monthEl);
  });
  updateCalNav();
  updateAvailNote();
}

/* Jeden řádek rozpisu: popisek vlevo, částka vpravo. */
function rowEl(label, value, cls) {
  return el('div', { class: 'row' + (cls ? ' ' + cls : '') }, [
    el('span', { class: 'k', text: label }), el('span', { class: 'v', text: value }),
  ]);
}
function readGuests() {
  return {
    adults: parseInt(($('#vr-adults') || {}).value, 10) || 0,
    children: parseInt(($('#vr-children') || {}).value, 10) || 0,
    pets: parseInt(($('#vr-pets') || {}).value, 10) || 0,
  };
}
/* Srovná hodnoty do mezí (dospělí 1..max, děti 0..max-1, mazlíčci 0..maxPets).
   Překročení součtu dospělí+děti se neupravuje tvrdě — jen se ukáže hláška
   a odeslání se zablokuje. */
function clampGuests() {
  const a = $('#vr-adults'), c = $('#vr-children'), p = $('#vr-pets');
  if (a && c) {
    let av = parseInt(a.value, 10), cv = parseInt(c.value, 10);
    if (isNaN(av)) av = 1; if (isNaN(cv)) cv = 0;
    a.value = Math.max(1, Math.min(VR_PRICING.maxGuests, av));
    c.value = Math.max(0, Math.min(VR_PRICING.maxGuests - 1, cv));
  }
  if (p) {
    let pv = parseInt(p.value, 10); if (isNaN(pv)) pv = 0;
    p.value = String(Math.max(0, Math.min(VR_PRICING.maxPets, pv)));
  }
}
/* Statický orientační ceník nad kalendářem. Hodnoty čerpá z VR_PRICING, aby se
   nikdy nerozešly s výpočtem. U cizojazyčných verzí přidá přibližný přepočet €/zł. */
/* „1. 5. – 31. 10." z MM-DD zápisu sezóny. */
function fmtSeasonRange(s) {
  if (!s.from || !s.to) return '';
  const p = (md) => parseInt(md.slice(3), 10) + '. ' + parseInt(md.slice(0, 2), 10) + '.';
  return p(s.from) + ' – ' + p(s.to);
}
function renderPriceBlock() {
  const host = $('#vr-priceblock'); if (!host) return;
  const t = tt(), lang = state.lang;
  const SL = SEASON_LABEL[lang] || SEASON_LABEL.cs;
  host.innerHTML = '';
  host.appendChild(el('div', { class: 'vr-priceblock-h', text: t.book.priceHeading }));
  const rows = el('div', { class: 'vr-priceblock-rows' });
  const showNote = new Date() < new Date(VR_SEASON_NOTE.noteUntil);
  VR_PRICING.seasons.forEach((s) => {
    // U letní sezóny ukazujeme rok, který právě prodáváme (majitel: „letní sezóna 2027").
    let name = SL[s.name] || s.name;
    if (s.name === 'letni') name += ' ' + VR_SEASON_NOTE.summerYear;
    const range = s.name === 'mimo' ? (t.book.priceOffRange || '') : fmtSeasonRange(s);
    const fx = fxLine(s.nightly, lang);
    let meta = '';
    if (s.weekend2) meta += (t.book.priceWeekend || '') + ' ' + fmtM(s.weekend2);
    if (fx) meta += (meta ? ' · ' : '') + fx + ' ' + t.book.pricePerNight;
    const seasonCell = el('span', { class: 'vr-priceblock-season' }, [
      el('b', { text: name }),
      range ? el('span', { class: 'vr-priceblock-range', text: range }) : null,
      // „Léto 2026 je téměř obsazené" — ověřeno proti reálné obsazenosti.
      (s.name === 'letni' && showNote && t.book.priceSummerFull)
        ? el('span', { class: 'vr-priceblock-note', text: (t.book.priceSummerFull || '').replace('%Y%', VR_SEASON_NOTE.almostFullYear) })
        : null,
    ].filter(Boolean));
    rows.appendChild(el('div', { class: 'vr-priceblock-row' }, [
      seasonCell,
      el('span', { class: 'vr-priceblock-val' }, [
        el('b', { text: fmtM(s.nightly) + ' ' + t.book.pricePerNight }),
        meta ? el('span', { class: 'vr-priceblock-min', text: meta }) : null,
      ].filter(Boolean)),
    ]));
  });
  // Vánoce a Silvestr — individuální cena, poptejte se.
  rows.appendChild(el('div', { class: 'vr-priceblock-row' }, [
    el('span', { class: 'vr-priceblock-season' }, [el('b', { text: t.book.priceXmas })]),
    el('span', { class: 'vr-priceblock-val' }, [el('span', { class: 'vr-priceblock-min', text: t.book.priceXmasVal })]),
  ]));
  host.appendChild(rows);
  const foot = el('div', { class: 'vr-priceblock-foot' });
  const nbWord = (NBf[lang] || NBf.cs)(VR_PRICING.seasons[0].minNights);
  const clFx = fxLine(VR_PRICING.cleaning, lang);
  foot.appendChild(el('span', { text: (t.book.priceMinStay || '').replace('%N%', VR_PRICING.seasons[0].minNights).replace('%NB%', nbWord) }));
  foot.appendChild(el('span', { text: t.book.priceCleaning + ' ' + fmtM(VR_PRICING.cleaning) + (clFx ? ' (' + clFx + ')' : '') }));
  foot.appendChild(el('span', { text: (t.book.priceCityTax || '').replace('%A%', fmtM(VR_PRICING.cityTaxAdultNight)) }));
  foot.appendChild(el('span', { text: (t.book.pricePet || '').replace('%P%', fmtM(VR_PRICING.petPerStay)) }));
  foot.appendChild(el('span', { text: (t.book.priceBond || '').replace('%B%', fmtM(VR_PRICING.bond)) }));
  foot.appendChild(el('span', { text: (t.book.priceDeposit || '').replace('%P%', VR_PRICING.depositPct) }));
  if (t.book.priceFxNote) foot.appendChild(el('span', { class: 'vr-priceblock-fx', text: t.book.priceFxNote }));
  host.appendChild(foot);
}
function renderBookingPanel() {
  const t = tt(), lang = state.lang;
  const s0 = state.selStart, s1 = state.selEnd;
  const nights = nightsCount();
  const yr = s0 ? Math.floor((s1 || s0) / 10000) : 0;
  $('#vr-sel-label').textContent = s0 ? fmtK(s0) + ' — ' + (s1 ? fmtK(s1) : '…') + ' ' + yr : t.book.pick;
  $('#vr-sel-nights').textContent = nights ? '· ' + nights + ' ' + (NBf[lang] || NBf.cs)(nights) : '';

  const g = readGuests();
  const q = computeQuote(s0, s1, g.adults, g.children, g.pets);
  const brk = $('#vr-breakdown'), note = $('#vr-minstay'), gnote = $('#vr-guestnote'), btn = $('#vr-pay');
  if (!brk) return; // panel ještě není v DOM

  // upozornění na překročení kapacity hostů
  if (q.guestOver) { gnote.style.display = ''; gnote.textContent = (t.book.guestMax || '').replace('%N%', VR_PRICING.maxGuests); }
  else gnote.style.display = 'none';

  if (q.nights <= 0) {
    brk.style.display = 'none'; brk.innerHTML = '';
    note.style.display = 'none';
  } else if (!q.valid) {
    // pod minimální délkou pobytu pro sezónu příjezdu → přátelská hláška místo rozpisu
    brk.style.display = 'none'; brk.innerHTML = '';
    note.style.display = '';
    const sName = q.arrival ? q.arrival.name : 'mimo';
    const sIn = (SEASON_IN[lang] || SEASON_IN.cs)[sName] || '';
    note.textContent = (t.book.minStay || '').replace('%S%', sIn).replace('%N%', q.minNights);
  } else {
    note.style.display = 'none';
    brk.style.display = '';
    brk.innerHTML = '';
    const multi = q.groups.length > 1;
    const SL = SEASON_LABEL[lang] || SEASON_LABEL.cs;
    q.groups.forEach((grp) => {
      // Zvýhodněný víkend se ukáže jako víkendová sazba, ne jako 2× noc.
      let lbl = grp.weekend
        ? (t.book.weekendRate || '') + ' (' + grp.nights + ' ' + (NBf[lang] || NBf.cs)(grp.nights) + ')'
        : grp.nights + ' ' + (NBf[lang] || NBf.cs)(grp.nights) + ' × ' + fmtM(grp.rate);
      if (multi) lbl += ' · ' + (SL[grp.name] || '');
      brk.appendChild(rowEl(lbl, fmtM(grp.subtotal)));
    });
    brk.appendChild(rowEl(t.book.cleaning, fmtM(q.cleaning)));
    const adWord = (ADf[lang] || ADf.cs)(q.adults), nbWord = (NBf[lang] || NBf.cs)(q.nights);
    brk.appendChild(rowEl(t.book.cityTax + ' (' + q.adults + ' ' + adWord + ' × ' + q.nights + ' ' + nbWord + ')', fmtM(q.cityTax)));
    // Pes / domácí mazlíček — 500 Kč za pobyt a zvíře, samostatná položka.
    if (q.pets > 0) {
      brk.appendChild(rowEl(t.book.petFee + ' (' + q.pets + ' × ' + fmtM(VR_PRICING.petPerStay) + ')', fmtM(q.petFee)));
    }
    brk.appendChild(rowEl(t.book.total, fmtM(q.total), 'brk-total'));
    const fxTot = fxLine(q.total, lang);
    if (fxTot) brk.appendChild(rowEl(fxTot, t.book.priceFxNote || '', 'brk-fx'));
    brk.appendChild(rowEl((t.book.depositReq || '').replace('%P%', VR_PRICING.depositPct), fmtM(q.deposit), 'brk-dep'));
  }

  // žádost lze odeslat jen při platném rozsahu (splněné minimum) a přípustném počtu hostů
  const ok = q.valid && !q.guestOver && !q.noAdults;
  btn.disabled = !ok;
  btn.setAttribute('aria-disabled', ok ? 'false' : 'true');
}

/* ---------- Odeslani ZADOSTI o pobyt -> Supabase RPC vr_request ----------
   Zadny mailto, zadna platba. Zadost se ulozi do public.vr_requests (RLS, zapis
   jen pres SECURITY DEFINER funkci). Majitel termin potvrdi rucne a teprve pote
   posle platebni odkaz na zalohu. Stavy: klid -> odesilam -> uspech / chyba. */
let bookSending = false;
function bookAside() { return $('.vr-book-aside'); }
function setBookMsg(text) {
  const m = $('#vr-book-msg'); if (!m) return;
  if (!text) { m.style.display = 'none'; m.textContent = ''; }
  else { m.style.display = ''; m.textContent = text; }
}
function setBookSending(on) {
  bookSending = on;
  const btn = $('#vr-pay'), lbl = $('#vr-pay-label'); if (!btn) return;
  btn.disabled = on;
  if (lbl) lbl.textContent = on ? tt().book.sending : tt().book.pay;
  btn.setAttribute('aria-busy', on ? 'true' : 'false');
}
function showBookSuccess(q, s0, s1) {
  const t = tt(), lang = state.lang;
  $('#vr-book-oktitle').textContent = t.book.okTitle;
  $('#vr-book-okbody').textContent = t.book.okBody;
  const again = $('#vr-book-again-lbl'); if (again) again.textContent = t.book.okAgain;
  const sum = $('#vr-book-sum'); if (sum) {
    sum.innerHTML = '';
    const nb = (NBf[lang] || NBf.cs)(q.nights);
    sum.appendChild(el('div', { class: 'row' }, [el('span', { class: 'k', text: fmtK(s0) + ' — ' + fmtK(s1) }), el('span', { class: 'v', text: q.nights + ' ' + nb })]));
    let gl = t.cta.lblAdults + ': ' + q.adults + (q.children ? ' · ' + t.cta.lblChildren + ': ' + q.children : '');
    if (q.pets) gl += ' · ' + t.cta.lblPets + ': ' + q.pets;
    sum.appendChild(el('div', { class: 'row' }, [el('span', { class: 'k', text: gl }), el('span', { class: 'v', text: fmtM(q.total) })]));
  }
  const a = bookAside(); if (a) a.setAttribute('data-state', 'done');
  const su = $('#vr-book-success'); if (su && su.scrollIntoView) { try { su.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) {} }
}
function resetBookForm() {
  const a = bookAside(); if (a) a.setAttribute('data-state', 'form');
  setBookMsg(''); setBookSending(false);
}
function submitBooking() {
  if (bookSending) return;
  const t = tt(), lang = state.lang;
  const s0 = state.selStart, s1 = state.selEnd;
  const g = readGuests();
  const name = (($('#vr-name') && $('#vr-name').value) || '').trim();
  const email = (($('#vr-email') && $('#vr-email').value) || '').trim();
  const phone = (($('#vr-phone') && $('#vr-phone').value) || '').trim();
  const message = (($('#vr-message') && $('#vr-message').value) || '').trim().slice(0, 2000);
  const q = computeQuote(s0, s1, g.adults, g.children, g.pets);
  if (!q.valid || q.guestOver || q.noAdults || !name || !email) { setBookMsg(t.book.errRequired); return; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setBookMsg(t.book.errEmail); return; }
  setBookMsg('');
  setBookSending(true);
  const breakdown = {
    nights: q.nights,
    groups: q.groups.map((grp) => ({ name: grp.name, nights: grp.nights, rate: grp.rate, subtotal: grp.subtotal })),
    cleaning: q.cleaning, cityTax: q.cityTax, petFee: q.petFee, total: q.total, deposit: q.deposit, weekend: q.weekend,
  };
  const iso = (k) => Math.floor(k / 10000) + '-' + String(Math.floor(k / 100) % 100).padStart(2, '0') + '-' + String(k % 100).padStart(2, '0');
  const payload = {
    p_arrival: iso(s0), p_departure: iso(s1),
    p_adults: q.adults, p_children: q.children, p_pets: q.pets,
    p_name: name, p_email: email, p_phone: phone,
    p_lang: lang, p_breakdown: breakdown, p_total: q.total,
    p_message: message || null,
  };
  fetch(VR_SUPABASE.URL + '/rest/v1/rpc/vr_request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: VR_SUPABASE.ANON_KEY, Authorization: 'Bearer ' + VR_SUPABASE.ANON_KEY },
    body: JSON.stringify(payload),
  }).then((r) => r.json().then((data) => ({ ok: r.ok, data: data }))).then((res) => {
    const d = res.data || {};
    if (res.ok && d && d.ok === true && d.id) { showBookSuccess(q, s0, s1); return; }
    const code = d && d.error;
    let msg = t.book.errGeneric;
    if (code === 'email_invalid') msg = t.book.errEmail;
    else if (code === 'rate_limited') msg = t.book.errRate;
    else if (code === 'dates_invalid' || code === 'adults_invalid' || code === 'children_invalid'
             || code === 'guests_invalid' || code === 'pets_invalid' || code === 'name_required' || code === 'email_required') msg = t.book.errRequired;
    setBookSending(false);
    setBookMsg(msg);
  }).catch(() => { setBookSending(false); setBookMsg(t.book.errGeneric); });
}

/* ============================ Language / season / clock ============================ */
function applyLangButtons() {
  $all('.vr-lang').forEach((b) => b.setAttribute('data-active', b.getAttribute('data-lang') === state.lang ? 'true' : 'false'));
}
/* Přepínač sezóny je SKUTEČNÝ odkaz (<a href="?season=…">), aby ho viděl
   i crawler a fungoval bez JS. JS jen zachytí kliknutí a přepne bez reloadu.
   Sémantika: aria-current="true" na aktivní větvi (u odkazů, ne aria-pressed —
   to patří k <button>). Klávesnice funguje nativně (Tab + Enter). */
function applySeasonButtons() {
  $all('.vr-segbtn').forEach((b) => {
    const s = b.getAttribute('data-season');
    const on = s === state.season;
    b.setAttribute('data-active', on ? 'true' : 'false');
    if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
    // href drží i aktuální jazyk, ať je odkaz sdílitelný a bez JS dá totéž
    if (b.tagName === 'A') b.setAttribute('href', '?season=' + s + '&lang=' + state.lang);
  });
}

/* Nadhlavička a podtitul hero jsou SEZÓNNĚ DĚLENÉ SLOTY — obě znění jsou
   staticky v index.html a přepínají se stylem (viz applySeasonBranches). */

/* ============================ SEZÓNNÍ VĚTVE V HTML ============================
   U sezónně dělených slotů jsou ve zdroji stránky OBĚ znění — text schovaný
   stylem se indexuje, text, který ve stránce vůbec není, nikdy. Viditelnost
   řídí CSS podle .vr-root[data-season]; JS k tomu jen doplní hidden +
   aria-hidden, aby čtečka obrazovky nepředčítala obě verze.

   KONTROLNÍ LIST SEZÓNNĚ DĚLENÝCH SLOTŮ (strop je ~12–15, teď jich je 6):
     1. hero.eyebrow      / hero.eyebrowWinter
     2. hero.sub          / hero.subWinter
     3. facts.wellnessSummer / facts.wellnessWinter   (rychlá fakta)
     4. lokalita.lead     / lokalita.leadWinter
     5. lokalita.arrive   / lokalita.arriveTransitWinter + arriveCarSummer
                            (blok „Než dorazíte")
     6. lokalita.doorstepSummer / lokalita.doorstep    (pás čísel „od dveří" —
        v létě nikoho nezajímá skibus ani sjezdovka, v zimě jsou to ta hlavní
        čísla; proto dvě sady, ne jedna okleštěná)
   Slot pro karty sezón ZANIKL se sekcí #sezony (majitel ji zrušil). Sloty pro
   hlavní kartu a tři karty vybavení ZANIKLY taky: vybavení je teď jeden seznam
   s jedním zněním a sezónnost mu dává pořadí v CSS. To je směr, kterým se má
   jít u všeho dalšího — sezónnost jako vlastnost dat, ne druhá věta.

   EXKLUZIVNÍ SEKCE (vrstva C, právě jedna na sezónu, víc jich být NESMÍ):
     zima → #lyzovani  „Lyžování odsud" (+ podblok „Když se nelyžuje")
     léto → #vylety    „Hory začínají za dveřmi"

   Přidáváš sedmý slot? Spočítej si: 1 slot = 4 překlady, z toho dva (DE, PL)
   si nikdy nepřečteš. Nad ~10 se to musí postavit z dat, ne psát do slovníku.
   ========================================================================== */
function applySeasonBranches() {
  $all('[data-season-only]').forEach((n) => {
    if (n.getAttribute('data-season-only') === state.season) {
      n.removeAttribute('hidden'); n.removeAttribute('aria-hidden');
    } else {
      n.setAttribute('hidden', ''); n.setAttribute('aria-hidden', 'true');
    }
  });
}

/* Přímá rezervace = nejlepší cena — badge v hero pásu, u rezervace a řádek v boxu.
   Ceny se NEMĚNÍ, jde jen o sdělení. */
function renderDirectBook() {
  // Vypnuto na přání majitele: výhodnost přímé rezervace nekomunikujeme, hosté na ni přijdou sami.
  return;
  const t = tt();
  const shield = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3l7 3v5c0 4.4-3 7.4-7 9-4-1.6-7-4.6-7-9V6l7-3z"></path><path d="M9 12l2 2 4-4"></path></svg>';
  ['#vr-directbook', '#vr-directbook-book'].forEach((sel) => {
    const host = $(sel); if (!host) return;
    host.innerHTML = '';
    host.appendChild(el('span', { class: 'vr-directbook-ic', 'aria-hidden': 'true', html: shield }));
    host.appendChild(el('span', { class: 'vr-directbook-txt', html: t.direct.badge })); // first-party trusted HTML (<b>)
  });
  const side = $('#vr-book-direct');
  if (side) side.innerHTML = shield + '<span>' + t.direct.sidebar + '</span>';
}

/* ============================ PÁS POD HEREM = NEKONEČNÝ POJEZD RECENZÍ ============================
   Majitel (7/2026): „Kdyby to tam projíždělo, s tím, že když na to najedeš,
   tak se to zastaví a můžeš na to kliknout — a v nekonečné smyčce to projíždí.
   Myslím, že by to mohlo být silnější." Pás proto drží:
     · nahoře ODKAZY NA PLATFORMY (#vr-ratings) — každá se svým hodnocením
       v JEJÍ VLASTNÍ ŠKÁLE (Google a Airbnb 5★, Booking /10),
     · pod nimi POJEZD jednotlivých citací přes celou šířku obrazovky; každá
       karta je odkaz na profil té platformy (nová záložka).

   CO SE SEM NESMÍ VRÁTIT:
     · ZPRŮMĚROVANÁ ZNÁMKA napříč platformami. Majitel ji zrušil sám:
       „Booking se hodnotí do desítky, takže to úplně nesedí, já bych to tady
       nedal." Přepočítávat 9,6/10 na hvězdičky a míchat to s Googlem do
       jednoho čísla je věcně sporné.
     · Tlačítko „Zobrazit všechny recenze". Vedlo na sekci #recenze, která
       zanikla; a pás sám odkazy na platformy nese (chipy nahoře + každá karta).

   JAK POJEZD FUNGUJE (bez knihoven):
     track = DVĚ IDENTICKÉ POLOVINY vedle sebe, animace posune track o -50 %
     jeho šířky a skočí zpět — švy nejsou vidět, protože v tu chvíli je na
     stejném pixelu druhá kopie. Polovina se skládá z REPS opakování sady,
     aby i v zimě (kdy vypadnou citace o bazénu) pás vyplnil širokou obrazovku.
     Rychlost je konstantní v px/s, takže delší pás neprojede rychleji.

   PŘÍSTUPNOST:
     · pauza při najetí myší (:hover) i při fokusu z klávesnice (:focus-within),
     · duplicitní polovina je aria-hidden — čtečka přečte sadu jednou,
     · prefers-reduced-motion → žádná animace, jen nativní vodorovný scroll,
     · na mobilu totéž (nativní scroll), aby šlo na kartu pohodlně klepnout. */
function prefersReduced() {
  return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}
/* Citace se v kartě krátí, ať mají karty srovnatelnou výšku a pás nevypadá
   jako rozsypaný čaj. Zkrácení je vyznačené „…", smysl se nemění. */
const MARQ_MAX = 190;      // znaků na kartu
const MARQ_SPEED = 46;     // px za sekundu — klidné tempo, dá se číst za jízdy
function marqTrim(s) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  if (s.length <= MARQ_MAX) return s;
  let cut = s.slice(0, MARQ_MAX);
  const sp = cut.lastIndexOf(' ');
  if (sp > 90) cut = cut.slice(0, sp);
  return cut.replace(/[…,;:.\-\s]+$/, '') + '…';
}
/* Hodnocení platformy v JEJÍ vlastní škále — nikdy nepřepočítávat.
   Google / Airbnb → „5,0" + hvězdička · Booking.com → „9,6/10". */
function platformScore(p) {
  if (!p || typeof p.rating !== 'number') return null;
  const dec = state.lang === 'en' ? '.' : ',';
  const num = p.rating.toFixed(1).replace('.', dec);
  return { text: p.outOf === 5 ? num : num + '/10', star: p.outOf === 5 };
}
function buildMarqList() {
  return reviewsForSeason().map((r) => {
    const p = platformByKey(r.platform);
    return {
      q: marqTrim(reviewText(r)), a: r.author,
      source: p.name || r.platform, url: p.url || '', score: platformScore(p),
    };
  }).filter((x) => x.q);
}
/* Jedna karta pojezdu. Je-li známé URL platformy, je celá karta odkazem —
   majitel chtěl „můžeš na to kliknout". */
function buildMarqCard(it) {
  const t = tt();
  const badge = el('span', { class: 'vr-revcard-plat' }, [
    el('span', { class: 'vr-revcard-plat-n', text: it.source }),
    it.score ? el('span', { class: 'vr-revcard-score' }, [
      el('span', { text: it.score.text }),
      it.score.star ? el('i', { class: 'vr-star', 'aria-hidden': 'true', text: '★' }) : null,
    ]) : null,
    it.url ? el('span', { class: 'vr-rating-arrow', 'aria-hidden': 'true', text: '↗' }) : null,
  ]);
  const kids = [
    el('blockquote', { class: 'vr-revcard-q', text: it.q }),
    el('div', { class: 'vr-revcard-cap' }, [
      el('span', { class: 'vr-revcard-author', text: it.a }),
      badge,
    ]),
  ];
  if (!it.url) return el('figure', { class: 'vr-revcard' }, kids);
  // aria-label říká nahlas to, co je na kartě vidět jen jako číslo: že skóre
  // patří PLATFORMĚ, ne téhle jedné recenzi.
  const lbl = it.a + ' — ' + it.source
    + (it.score ? ' (' + t.ratings.eyebrow.toLowerCase() + ' ' + it.score.text + ')' : '');
  return el('a', {
    class: 'vr-revcard', href: it.url, target: '_blank', rel: 'noopener noreferrer',
    'aria-label': lbl,
  }, kids);
}
function renderTrustBand() {
  const host = $('#vr-teaser'); if (!host) return;
  host.innerHTML = '';
  const list = buildMarqList();
  if (!list.length) { host.style.display = 'none'; return; }
  host.style.display = '';

  const track = el('div', { class: 'vr-revmarq-track' });
  const half = el('div', { class: 'vr-revmarq-half' });
  list.forEach((it) => half.appendChild(buildMarqCard(it)));
  track.appendChild(half);
  host.appendChild(track);

  // BEZ ANIMACE (mobil, prefers-reduced-motion) je pás obyčejný vodorovný
  // scroll — tam se sada NEOPAKUJE, jinak by host prstem projel tytéž recenze
  // dvakrát. Opakování má smysl jen u běžící smyčky, aby v ní nezela díra.
  if (marqStatic()) { marqWatchResize(host); return; }

  // Kolikrát sadu zopakovat, aby polovina pásu přetekla obrazovku i v zimě
  // (kdy citace o bazénu vypadnou a zbydou čtyři). Měří se až po vložení do
  // DOM, takže se počítá se skutečnou šířkou karet z CSS.
  const vw = host.clientWidth || window.innerWidth || 1280;
  const one = half.scrollWidth || 1;
  const reps = Math.max(2, Math.ceil((vw * 1.25) / one));
  for (let i = 1; i < reps; i++) list.forEach((it) => half.appendChild(buildMarqCard(it)));

  // Druhá, identická polovina dělá smyčku bez švu. Pro čtečku je neviditelná
  // a tabulátor jí projde bez zastávky (odkazy jsou v ní tabindex="-1").
  const dup = half.cloneNode(true);
  dup.setAttribute('aria-hidden', 'true');
  $all('a', dup).forEach((a) => a.setAttribute('tabindex', '-1'));
  dup.classList.add('is-dup');
  track.appendChild(dup);

  // Konstantní rychlost: delší pás = delší doba, ne rychlejší jízda.
  const dur = Math.max(24, Math.round(half.scrollWidth / MARQ_SPEED));
  track.style.setProperty('--vr-marq-dur', dur + 's');
  marqWatchResize(host);
}
/* Kdy pás NEJEDE — musí sedět s mediálními dotazy v site.css (.vr-revmarq). */
function marqStatic() {
  return prefersReduced() || !!(window.matchMedia && window.matchMedia('(max-width: 760px)').matches);
}
/* Po výrazné změně šířky okna se pás přepočítá — na širším monitoru je potřeba
   víc opakování sady, jinak by v pojezdu zela díra. Jen na skutečnou změnu
   šířky (ne na výšku, kterou na mobilu mění lišta prohlížeče). */
let marqW = 0, marqT = null;
function marqWatchResize(host) {
  marqW = host.clientWidth || window.innerWidth;
  if (host.dataset.marqWired) return;
  host.dataset.marqWired = '1';
  window.addEventListener('resize', () => {
    const w = host.clientWidth || window.innerWidth;
    if (Math.abs(w - marqW) < 120) return;
    clearTimeout(marqT);
    marqT = setTimeout(renderTrustBand, 250);
  });
}

/* Patička — kontakt: e-mail (mailto), „Pavel — váš hostitel", region a telefon
   (tel: odkaz jen když je VR_CONTACT.phone vyplněné). */
function renderFooterContact() {
  const t = tt();
  const host = $('#vr-foot-contact'); if (!host) return;
  host.innerHTML = '';
  const email = VR_CONTACT.email || 'rezervace@villarudolf.com';
  host.appendChild(el('a', { href: 'mailto:' + email, text: email }));
  host.appendChild(el('br'));
  host.appendChild(el('span', { class: 'vr-foot-host', text: t.footer.host }));
  const phone = (VR_CONTACT.phone || '').trim();
  if (phone) {
    host.appendChild(el('br'));
    host.appendChild(el('a', { href: 'tel:' + phone.replace(/[^\d+]/g, ''), text: phone }));
  }
  host.appendChild(el('br'));
  host.appendChild(el('span', { text: t.footer.region }));
}

/* Uloží sezónu (jen na dobu návštěvy — viz assets/season.js) a sladí meta
   theme-color s aktuálním motivem. */
function persistSeason() {
  if (window.VRSeason) window.VRSeason.remember(state.season);
  else { try { sessionStorage.setItem('vrSeason', state.season); } catch (e) {} }
}
function applyThemeColor() {
  const m = document.querySelector('meta[name="theme-color"]');
  if (m) m.setAttribute('content', state.season === 'zima' ? '#eef2f6' : '#0E1311');
}

/* Jazyk: ?lang= → localStorage vrLang → navigator.language (cs/en/de/pl) → cs. */
function resolveLang(qs) {
  const q = (qs.get('lang') || '').toLowerCase();
  if (T[q]) return q;
  try { const s = localStorage.getItem('vrLang'); if (s && T[s]) return s; } catch (e) {}
  const nav = (navigator.language || navigator.userLanguage || '').slice(0, 2).toLowerCase();
  if (T[nav]) return nav;
  return 'cs';
}
/* Sezóna: ?season= → DATUM → uložená volba (jen v rámci návštěvy).
   Celá logika i hranice sezón žijí v assets/season.js — jediné místo pro celý
   web včetně podstránek. Tady je jen fallback pro případ, že by se soubor
   nenačetl (pak se chová jako dřív a otevře léto). */
function resolveSeason(qs) {
  if (window.VRSeason) return window.VRSeason.resolve(location.search);
  const q = (qs.get('season') || '').toLowerCase();
  return (q === 'leto' || q === 'zima') ? q : 'leto';
}
/* Přeložený <title> + meta description (+ og) podle aktuálního jazyka. */
function applyMeta() {
  const m = tt().meta; if (!m) return;
  const title = fillFacts(m.title), desc = fillFacts(m.desc);
  if (title) document.title = title;
  const set = (sel, val) => { const n = document.querySelector(sel); if (n && val) n.setAttribute('content', val); };
  set('meta[name="description"]', desc);
  set('meta[property="og:title"]', title);
  set('meta[property="og:description"]', desc);
  set('meta[property="og:locale"]', m.locale);
}
/* Odkazy s data-langlink dostanou ?lang=<aktuální jazyk>, ať jsou sdílitelné
   (např. odkaz na /pruvodce/ z DE webu otevře DE průvodce). */
function applyLangLinks() {
  $all('a[data-langlink]').forEach((a) => {
    const base = a.getAttribute('data-langlink');
    // carry BOTH language and season so subpages (výlety, podmínky) inherit the theme.
    // Musí jít přes URL(), jinak by u odkazů s fragmentem (vylety/?zona=pesky#planovac)
    // parametry spadly dovnitř hashe → ...#planovac&lang=cs.
    try {
      const u = new URL(base, location.href);
      u.searchParams.set('lang', state.lang);
      u.searchParams.set('season', state.season);
      a.setAttribute('href', u.pathname + u.search + u.hash);
    } catch (e) {
      const sep = base.indexOf('?') >= 0 ? '&' : '?';
      a.setAttribute('href', base + sep + 'lang=' + state.lang + '&season=' + state.season);
    }
  });
}
/* Promítni jazyk + sezónu do URL (?lang & ?season), ať jsou odkazy sdílitelné. */
function syncUrl() {
  try {
    const u = new URL(location.href);
    u.searchParams.set('lang', state.lang);
    u.searchParams.set('season', state.season);
    history.replaceState(null, '', u.pathname + u.search + u.hash);
  } catch (e) {}
}

function setLang(lang) {
  if (!T[lang] || state.lang === lang) return;
  state.lang = lang;
  try { localStorage.setItem('vrLang', lang); } catch (e) {}
  applyLangButtons(); applySeasonButtons(); setTexts();
  renderRatings(); renderBedrooms(); renderPanoGroups(); renderThumbs(); renderScene();
  applyStripAria();
  renderTrips(); renderGallery();
  renderPriceBlock(); renderCalendar(); renderBookingPanel();
  renderDirectBook(); renderTrustBand(); renderFooterContact();
  applyMeta(); applyLangLinks(); syncUrl();
  // po přepnutí jazyka aktualizuj i případný success/label/msg stav žádosti
  if ($('#vr-pay-label')) $('#vr-pay-label').textContent = bookSending ? tt().book.sending : tt().book.pay;
}
function eagerLoadSeason(season) {
  // Hero + section photos for a season may be lazy; force them to load so the
  // crossfade has real pixels to show.
  const cls = season === 'zima' ? 'winter' : 'summer';
  $all('.vrim-dayphoto.' + cls + ', .vr-seasonimg.' + cls).forEach((img) => {
    if (img.getAttribute('loading') === 'lazy') img.setAttribute('loading', 'eager');
  });
}
function setSeason(season) {
  if ((season !== 'leto' && season !== 'zima') || state.season === season) return;
  state.season = season;
  persistSeason();
  eagerLoadSeason(season);
  document.querySelector('.vr-root').setAttribute('data-season', season);
  applyThemeColor();
  applySeasonButtons();
  applySeasonBranches();  // přepne, která sezónní větev textů je vidět (obě jsou v HTML)
  // 360° prohlídka má vlastní sadu scén pro každou sezónu — přepni ji celou
  // (náhledy, popisky, čítač) a nahraj první scénu; stará textura se uvolní
  // uvnitř loadPano() přes tex.dispose().
  state.scene = 0;
  state.panoGroup = 'all';   // filtr skupin patří k sadě scén, se sezónou se resetuje
  renderPanoGroups(); renderThumbs(); renderScene();
  if (loadPano) loadPano(0);
  // Galerie je od 7/2026 sezónně neutrální (jeden list bez filtrů), takže se
  // při přepnutí nepřekresluje. Zavírá se jen otevřený lightbox — jinak by
  // zůstal viset nad jinak nasvícenou stránkou.
  if (state.lb >= 0) lbSet(-1);
  // Video: zbourat přehrávač sezóny, která právě zmizela, ať nehraje potmě.
  vidResetHidden();
  // Sezónní jsou i počty cílů v katalogu (zimní a letní se liší) a blok
  // „Než dorazíte" (v zimě nahoru skibus a parkování, vlak+autobus na jeden řádek).
  applySeasonTripCounts();
  renderArrive();
  renderTrustBand();  // v zimě se z pojezdu vynechávají citace, které stojí na bazénu
  applyLangLinks(); // keep ?season on subpage links (průvodce / podmínky) in sync
  syncUrl();
}

/* ============================ Lightbox ============================ */
/* list = pole { src, pano?, tag? } (galerie i interiérový karusel sdílí jeden
   lightbox). pano != null → zobraz tlačítko „Prohlédnout ve 360°".
   tag = anglický štítek místnosti přímo na fotce (jen interiérové fotky). */
function lbOpen(list, i) { state.lbList = list || []; lbSet(i); }
function lbSet(i) {
  const lb = $('#vr-lb');
  const list = state.lbList || [];
  const b360 = $('#vr-lb-360');
  const tag = $('#vr-lb-tag');
  if (i < 0 || !list.length) {
    state.lb = -1; lb.style.display = 'none'; lb.setAttribute('aria-hidden', 'true'); document.body.style.overflow = '';
    if (b360) { b360.style.display = 'none'; b360.onclick = null; }
    if (tag) { tag.textContent = ''; tag.style.display = 'none'; }
    return;
  }
  state.lb = i;
  const it = list[i] || {};
  const im = $('#vr-lb-img');
  im.src = it.src || '';
  im.alt = (it.name ? it.name + ' — ' : '') + 'Villa Rudolf';
  if (tag) { tag.textContent = it.tag || ''; tag.style.display = it.tag ? 'block' : 'none'; }
  $('#vr-lb-count').textContent = (i + 1) + ' / ' + list.length;
  if (b360) {
    const p = it.pano != null ? panoIdx(it.pano) : -1;
    if (p >= 0) {
      /* Majitel: „u těch fotek ložnice, když by bylo to 360, tak by je to
         přehodilo do té naší sekce ‚Projděte si dům i pozemek'." Přesně to
         openTourScene() dělá — a tlačítko to teď říká i navenek: ikona
         panoramatu + text, který jmenuje CÍL („…v 360° prohlídce domu"),
         + šipka dolů, protože skok vede po stránce níž. */
      b360.style.display = 'inline-flex';
      b360.innerHTML = '';
      b360.appendChild(el('span', { class: 'vr-lb-360-ic', 'aria-hidden': 'true', html: spinIcon() }));
      b360.appendChild(el('span', { text: (tt().interior && tt().interior.open360) || 'View in 360°' }));
      b360.appendChild(el('span', { class: 'vr-lb-360-ar', 'aria-hidden': 'true', text: '↓' }));
      b360.onclick = (e) => { e.stopPropagation(); lbSet(-1); openTourScene(p); };
    } else { b360.style.display = 'none'; b360.onclick = null; }
  }
  lb.style.display = 'flex'; lb.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden';
}
function lbNav(dir) { const n = (state.lbList || []).length; if (!n) return; lbSet((state.lb + dir + n) % n); }

/* ============================ 360 panorama (three.js, lazy) ============================ */
let panoInited = false, loadPano = null, panoLastInteract = 0, threeInjected = false;
/* Když host skočí do prohlídky přes „Prohlédnout ve 360°" z lightboxu, chce
   vidět konkrétní pokoj — nájezd „malé planety" se v tom případě přeskočí. */
let panoSkipIntro = false;
function ensureThree(cb) {
  if (typeof THREE !== 'undefined') { cb(); return; }
  if (!threeInjected) {
    threeInjected = true;
    const s = document.createElement('script');
    s.src = 'vendor/three.min.js'; s.async = true;
    s.onload = cb; s.onerror = () => {};
    document.head.appendChild(s);
  } else { setTimeout(() => ensureThree(cb), 80); }
}
/* Když se 360° prohlídku nepodaří inicializovat (WebGL nedostupný / chyba
   kontextu), skryjeme jen prvky prohlídky, aby nezůstal prázdný rám s nadpisem.
   Videa pod prohlídkou zůstávají viditelná. */
function hide360() {
  ['.vr-exphead', '#vrpStage', '.vrp-striprail', '.vr-expdetail'].forEach((sel) => {
    const n = $(sel); if (n) n.style.display = 'none';
  });
}
function initPano() {
  if (panoInited) return;
  if (typeof THREE === 'undefined') { setTimeout(initPano, 80); return; }
  const mount = $('#vrpCanvas'), stage = $('#vrpStage');
  if (!mount || !stage) return;
  panoInited = true;

  try {
  const scene = new THREE.Scene();
  /* Svislý FOV se DOPOČÍTÁVÁ z poměru stran, aby vodorovný záběr zůstal
     velkorysý (~112°, jak byl doteď) a svisle se ukázalo co nejvíc — majitel
     chce „vidět víc stropu a podlahy", ne jiný soubor. Zdroj panoramat proto
     zůstává 2:1 equirect; roztažení na čtverec by obraz jen zdeformovalo.
     Mantinely 72–94° drží rektilineární projekci mimo rybí oko na krajích. */
  const HFOV = 112, FOV_MIN = 72, FOV_MAX = 94;
  const D = Math.PI / 180;
  const fovFor = (aspect) => {
    if (!aspect || !isFinite(aspect)) return FOV_MIN;
    const v = 2 * Math.atan(Math.tan(HFOV * D / 2) / aspect) / D;
    return Math.max(FOV_MIN, Math.min(FOV_MAX, v));
  };
  const camera = new THREE.PerspectiveCamera(fovFor(mount.clientWidth / mount.clientHeight), mount.clientWidth / mount.clientHeight, 0.1, 1100);
  camera.rotation.order = 'YXZ';
  const renderer = new THREE.WebGLRenderer({ antialias: true, canvas: mount, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(mount.clientWidth, mount.clientHeight, false);
  if ('outputColorSpace' in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.SphereGeometry(500, 64, 40); geo.scale(-1, 1, 1);
  const mat = new THREE.MeshBasicMaterial({ color: 0x10140f });
  scene.add(new THREE.Mesh(geo, mat));

  let yaw = 0, userYaw = 0, pitch = 0, idle = 0, dragging = false, swayBase = 0;

  /* ---- „Little planet" nájezd při prvním zobrazení prohlídky ----
     Majitel: „docela dobře vypadá ten nájezd shora do toho prvního, jako že tě
     to do toho vtáhne." Kamera startuje s velmi širokým svislým FOV a míří
     kolmo dolů (efekt malé planety) a během ~1,8 s se srovná k horizontu na
     provozní FOV. Pozn.: krpano používá skutečnou stereografickou projekci,
     tohle je aproximace přes vysoké FOV rektilineární kamery — na 2 s intro
     stačí, pravá „malá planeta" by chtěla vlastní shader.
     Hraje se JEN JEDNOU, při prvním skutečném zobrazení sekce (ne při přepínání
     scén ani při skoku z lightboxu — tam by to otravovalo). prefers-reduced-
     motion ho vypíná úplně. */
  const REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const INTRO_MS = 1800, INTRO_FOV = 160, INTRO_PITCH = -1.45;   // rad ≈ -83° (skoro kolmo dolů)
  let introDone = REDUCED, introArmed = false, texReady = false, introT0 = 0;
  const introRunning = () => !introDone && !panoSkipIntro && introArmed && texReady;
  const endIntro = () => {
    if (introDone) return;
    introDone = true; introT0 = 0;
    camera.fov = fovFor(camera.aspect); camera.updateProjectionMatrix();
    pitch = 0;   // camera.rotation.x dojede plynule ve smyčce (žádný skok)
  };
  /* Sáhne-li host na scénu během nájezdu, nájezd se nezasekne ani neskočí —
     jen se doběhne zkráceně (~260 ms) a ovládání převezme host. */
  const cancelIntro = () => {
    if (introDone) return;
    if (!introT0) { endIntro(); return; }
    const now = performance.now();
    const rem = INTRO_MS - (now - introT0);
    if (rem > 260) introT0 = now - (INTRO_MS - 260);
  };
  /* Sekce se inicializuje s předstihem (rootMargin), takže animaci odpálíme až
     když je scéna opravdu v obraze — jinak by proběhla mimo výřez. */
  if (!introDone && 'IntersectionObserver' in window) {
    try {
      const io2 = new IntersectionObserver((ents) => {
        ents.forEach((en) => { if (en.isIntersecting) { introArmed = true; io2.disconnect(); } });
      }, { threshold: 0.35 });
      io2.observe(stage);
    } catch (e) { introArmed = true; }
  } else { introArmed = true; }

  const loader = new THREE.TextureLoader();
  loadPano = (i) => {
    const files = panoFiles();
    const f = files[i] || files[0];
    const spin = $('#vrpSpin');
    if (spin) spin.style.opacity = '1';
    mount.style.opacity = '0.2';
    // Start each scene facing its curated view. Sphere is inside-out (scale
    // -1,1,1) so camera default (yaw 0) faces texture u=0.75; a target centre at
    // fraction f maps to yaw = PI*(1.5 - 2f). Snap yaw so the first frame is centred.
    const yf = PANO_YAWF[f] != null ? PANO_YAWF[f] : 0.5;
    const iy = Math.PI * (1.5 - 2 * yf);
    userYaw = iy; swayBase = iy; yaw = iy; pitch = 0; idle = 0;
    loader.load('media/pano/' + f + '.jpg', (tex) => {
      if ('colorSpace' in tex) tex.colorSpace = THREE.SRGBColorSpace;
      /* Vyšší svislý záběr ukazuje víc stropu a podlahy, kde je equirect u pólů
         silně stlačený → bez mipmap by to jiskřilo. Textury jsou 4096×2048
         (mocnina dvou), takže mipmapy i anizotropní filtrace fungují i na
         WebGL1. Horizont zůstává ostrý — mipmapa se vybírá až při zmenšení. */
      tex.generateMipmaps = true;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      try { tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy() || 1); } catch (x) {}
      const old = mat.map; mat.map = tex; mat.color.set(0xffffff); mat.needsUpdate = true; if (old) old.dispose();
      if (spin) spin.style.opacity = '0'; mount.style.opacity = '1';
      texReady = true;      // nájezd „malé planety" má na čem proběhnout
    }, undefined, () => { if (spin) spin.style.opacity = '0'; mount.style.opacity = '1'; });
  };
  loadPano(state.scene || 0);

  let dx = 0, dy = 0, bY = 0, bP = 0;
  const press = (e) => { cancelIntro(); dragging = true; idle = 0; panoLastInteract = Date.now(); const p = e.touches ? e.touches[0] : e; dx = p.clientX; dy = p.clientY; bY = userYaw; bP = pitch; const d = $('#vrpDrag'); if (d) d.style.opacity = '0'; };
  const moveE = (e) => { if (!dragging) return; const p = e.touches ? e.touches[0] : e; userYaw = bY + (p.clientX - dx) * 0.005; pitch = Math.max(-0.55, Math.min(0.55, bP + (p.clientY - dy) * 0.004)); };
  const release = () => { dragging = false; idle = 0; swayBase = userYaw; };
  mount.addEventListener('mousedown', press);
  window.addEventListener('mousemove', moveE);
  window.addEventListener('mouseup', release);
  mount.addEventListener('touchstart', press, { passive: true });
  window.addEventListener('touchmove', moveE, { passive: true });
  window.addEventListener('touchend', release);
  /* Scéna je full-bleed přes celou šířku viewportu, takže se její rozměr mění
     nejen při resize okna (scrollbar, otočení mobilu, skrytí URL lišty…).
     ResizeObserver drží drawing buffer i aspect přesně na rozměru stage —
     bez toho by byl canvas rozmazaný nebo deformovaný. */
  const onR = () => {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    camera.aspect = w / h;
    if (!introRunning()) camera.fov = fovFor(camera.aspect);   // během nájezdu FOV řídí animace
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };
  onR(); // srovnej hned po initu (stage už má finální full-bleed šířku)
  window.addEventListener('resize', onR, { passive: true });
  window.addEventListener('orientationchange', onR, { passive: true });
  if ('ResizeObserver' in window) { try { new ResizeObserver(onR).observe(stage); } catch (e) {} }

  // auto-cycle scenes if idle
  setInterval(() => {
    if (dragging) return;
    if (Date.now() - panoLastInteract < 12000) return;
    const vis = visibleScenes();                       // střídají se jen scény vybrané skupiny
    const at = vis.indexOf(state.scene || 0);
    const n = vis[(at < 0 ? 0 : at + 1) % vis.length];
    state.scene = n; renderScene(); loadPano(n);
  }, 9500);

  const easeInOut = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const loop = () => {
    requestAnimationFrame(loop);
    try {
      if (introRunning()) {
        if (!introT0) introT0 = performance.now();
        const k = Math.min(1, (performance.now() - introT0) / INTRO_MS);
        const e = easeInOut(k);
        const fovEnd = fovFor(camera.aspect);
        camera.fov = INTRO_FOV + (fovEnd - INTRO_FOV) * e;
        camera.updateProjectionMatrix();
        yaw = userYaw;                       // vodorovně už na cílovém pohledu
        camera.rotation.y = yaw;
        camera.rotation.x = INTRO_PITCH * (1 - e);
        renderer.render(scene, camera);
        if (k >= 1) endIntro();              // dál pokračuje běžné ovládání, bez skoku
        return;
      }
      if (!dragging) { idle++; if (idle > 150) { const tt2 = performance.now() / 1000; const target = swayBase + Math.sin(tt2 * 0.12) * 0.3; userYaw += (target - userYaw) * 0.008; } }
      yaw += (userYaw - yaw) * 0.08;
      camera.rotation.y = yaw;
      camera.rotation.x += (pitch - camera.rotation.x) * 0.1;
      renderer.render(scene, camera);
    } catch (e) {}
  };
  loop();
  } catch (err) { hide360(); }
}

/* ============================ Hero scroll parallax + nav state (rAF) ============================ */
/* Mouse-position parallax odstraněn (dle UX kritiky). Scroll indikátor odstraněn
   na přání majitele. Zůstává jen jemný scroll parallax hero fotky; nav se
   přepíná při odscrollování. */
function startRaf() {
  const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const $id = (id) => document.getElementById(id);
  const render = () => {
    requestAnimationFrame(render);
    try {
      const vh = window.innerHeight || 1;
      const heroPhoto = $id('vrhPhoto');
      const hp = clamp(window.scrollY / vh);
      if (heroPhoto) heroPhoto.style.transform = 'scale(1.08) translateY(' + (hp * 46).toFixed(1) + 'px)';
      const s = window.scrollY > 8;
      if (s !== state.scrolled) { state.scrolled = s; $('.vr-nav').setAttribute('data-scrolled', s ? 'true' : 'false'); }
      // sticky mobilní CTA se objeví, jakmile host odscrolluje za hero
      const sticky = $id('vr-stickycta');
      if (sticky) { const on = window.scrollY > vh * 0.85 ? 'true' : 'false'; if (sticky.getAttribute('data-show') !== on) sticky.setAttribute('data-show', on); }
    } catch (e) {}
  };
  render();
}

/* ============================ Scrollspy (active nav underline) ============================ */
function startScrollSpy() {
  const links = $all('.vr-navlinks a[href^="#"], .vr-mob a[href^="#"]');
  if (!links.length) return;
  const ids = [];
  links.forEach((a) => {
    const id = a.getAttribute('href').slice(1);
    if (id && document.getElementById(id) && ids.indexOf(id) === -1) ids.push(id);
  });
  if (!ids.length) return;
  // sections in document order, so the topmost visible one wins on overlap
  const sections = ids.map((id) => document.getElementById(id))
    .sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);

  let current = null;
  function setActive(id) {
    if (id === current) return;
    current = id;
    links.forEach((a) => a.setAttribute('data-active', a.getAttribute('href') === '#' + id ? 'true' : 'false'));
  }

  if ('IntersectionObserver' in window && window.innerHeight) {
    const visible = {};
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) visible[en.target.id] = true;
        else delete visible[en.target.id];
      });
      // pick the topmost (document-order) section currently crossing the centre band
      for (let i = 0; i < sections.length; i++) {
        if (visible[sections[i].id]) { setActive(sections[i].id); break; }
      }
    }, { rootMargin: '-45% 0px -45% 0px', threshold: 0 });
    sections.forEach((sec) => io.observe(sec));
  } else {
    const onScroll = () => {
      const y = window.scrollY + (window.innerHeight || 0) * 0.5;
      let best = null;
      sections.forEach((sec) => { if (sec.offsetTop <= y) best = sec.id; });
      if (best) setActive(best);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
}

/* ============================ Reveal on scroll ============================ */
function startReveal() {
  // Fail-safe: obsah je viditelný by default. Animaci zapneme (html.io-ok) až poté,
  // co si sondou ověříme, že IntersectionObserver v tomhle prostředí opravdu střílí
  // (v embedech s nulovým layout viewportem nevystřelí nikdy — pak nic neschováváme).
  if (!('IntersectionObserver' in window) || !innerHeight) return;
  const items = $all('.vr-reveal');
  const probe = new IntersectionObserver(() => {
    probe.disconnect();
    document.documentElement.classList.add('io-ok');
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('vr-in'); io.unobserve(en.target); } });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
    items.forEach((n) => io.observe(n));
    // kdyby po zapnutí animace přesto nic nepřišlo, do 2 s odhal aspoň to, co je ve viewportu
    setTimeout(() => items.forEach((n) => { if (n.getBoundingClientRect().top < innerHeight) n.classList.add('vr-in'); }), 2000);
  });
  probe.observe(document.body);
}

/* ============================ Mobile menu ============================ */
function toggleMob(open) {
  state.mob = open == null ? !state.mob : open;
  $('#vr-mob').setAttribute('data-open', state.mob ? 'true' : 'false');
  $('#vr-burger').setAttribute('aria-expanded', state.mob ? 'true' : 'false');
  document.body.style.overflow = state.mob ? 'hidden' : '';
}

/* ============================ Wire up ============================ */
function init() {
  document.documentElement.classList.add('js');
  // Jazyk + sezóna: ?param → localStorage → navigator.language → výchozí.
  const qsInit = new URLSearchParams(location.search);
  state.lang = resolveLang(qsInit);
  state.season = resolveSeason(qsInit);
  try { localStorage.setItem('vrLang', state.lang); } catch (e) {}
  persistSeason();

  // language buttons
  $all('.vr-lang').forEach((b) => b.addEventListener('click', () => setLang(b.getAttribute('data-lang'))));
  // Přepínač sezóny — odkazy (nav, mobilní menu). Kliknutí přepne bez reloadu;
  // Ctrl/Cmd/prostřední tlačítko necháme projít, ať jde otevřít v novém panelu.
  $all('.vr-segbtn').forEach((b) => b.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0) return;
    e.preventDefault();
    setSeason(b.getAttribute('data-season'));
  }));

  // gallery lightbox (grid thumbs get their own click handlers in renderGallery)
  $('#vr-lb').addEventListener('click', () => lbSet(-1));
  $('#vr-lb-img').addEventListener('click', (e) => e.stopPropagation());
  $('#vr-lb-prev').addEventListener('click', (e) => { e.stopPropagation(); lbNav(-1); });
  $('#vr-lb-next').addEventListener('click', (e) => { e.stopPropagation(); lbNav(1); });
  $('#vr-lb-close').addEventListener('click', (e) => { e.stopPropagation(); lbSet(-1); });
  window.addEventListener('keydown', (e) => {
    if (state.lb < 0) return;
    if (e.key === 'Escape') lbSet(-1);
    else if (e.key === 'ArrowLeft') lbNav(-1);
    else if (e.key === 'ArrowRight') lbNav(1);
  });

  // booking — real <form>: submit (klik na tlačítko i Enter v poli) → JS preventDefault
  const bookForm = $('#vr-book-formEl');
  if (bookForm) bookForm.addEventListener('submit', (e) => { e.preventDefault(); submitBooking(); });
  else $('#vr-pay').addEventListener('click', submitBooking);
  // kalendář — posun 2měsíčního okna (‹ ›)
  const calPrev = $('#vr-cal-prev'), calNext = $('#vr-cal-next');
  if (calPrev) calPrev.addEventListener('click', () => shiftCal(-1));
  if (calNext) calNext.addEventListener('click', () => shiftCal(1));
  // „Odeslat další žádost" — reset úspěšné žádosti zpět na formulář
  const again = $('#vr-book-again');
  if (again) again.addEventListener('click', resetBookForm);
  // počty hostů — rozpis se přepočítá živě; na blur se hodnoty srovnají do mezí
  ['#vr-adults', '#vr-children', '#vr-pets'].forEach((sel) => {
    const inp = $(sel); if (!inp) return;
    inp.addEventListener('input', renderBookingPanel);
    inp.addEventListener('change', () => { clampGuests(); renderBookingPanel(); });
  });
  // mobile menu
  $('#vr-burger').addEventListener('click', () => toggleMob());
  $all('#vr-mob a').forEach((a) => a.addEventListener('click', () => toggleMob(false)));
  // click-to-play videa (inline youtube-nocookie iframe až po kliknutí)
  wireVideos();

  // initial render
  document.querySelector('.vr-root').setAttribute('data-season', state.season);
  applyThemeColor();
  applyLangButtons(); applySeasonButtons(); applySeasonBranches(); setTexts();
  renderRatings(); renderBedrooms(); renderPanoGroups(); renderThumbs(); renderScene();
  setupPanoGroupKeys(); setupThumbStrip(); applyStripAria();
  renderTrips(); renderGallery();
  renderPriceBlock(); renderCalendar(); renderBookingPanel();
  renderDirectBook(); renderTrustBand(); renderFooterContact();
  applyMeta(); applyLangLinks(); syncUrl();
  loadAvailability();
  loadTripCounts();  // živé počty výletů z trips.json (fallback = VR_TRIP_COUNTS)

  startReveal(); startRaf(); startScrollSpy();

  // Background-preload the OFF-season hero image once the page is idle, so the
  // first Léto/Zima toggle crossfades instantly. (Only the current season is
  // eager on first paint.)
  const preloadOff = () => eagerLoadSeason(state.season === 'zima' ? 'leto' : 'zima');
  if ('requestIdleCallback' in window) requestIdleCallback(preloadOff, { timeout: 3000 });
  else setTimeout(preloadOff, 2000);

  // lazy-init pano on first intersection of the 360 section
  const interier = $('#interier');
  if (interier && 'IntersectionObserver' in window) {
    const pio = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { ensureThree(initPano); pio.disconnect(); } });
    }, { rootMargin: '200px' });
    pio.observe(interier);
  } else { ensureThree(initPano); }

  // QA hook — čtení ceníku a výpočtu ceny pro testy (čisté funkce, bez vedlejších efektů).
  try {
    window.__vrTest = {
      pricing: VR_PRICING,
      quote: computeQuote,
      setRange: (a, b) => { state.selStart = a; state.selEnd = b || 0; renderCalendar(); renderBookingPanel(); },
    };
  } catch (e) {}
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
