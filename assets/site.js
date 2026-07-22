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
    { author: 'Torsten', platform: 'booking', lang: 'de',
      quote: "Rundum sehr gut. Der Pool, die Sauna, die Küche, die Zimmeraufteilung – super. Die Betten waren, wie von allen neun Personen bestätigt, sehr gut. Pavel war immer erreichbar…",
      quote_cs: "Vynikající celkově. Bazén, sauna, kuchyň i uspořádání pokoje byly skvělé. Jak potvrdilo všech devět z nás, postele byly velmi pohodlné. Pavel byl vždy k dispozici…" },
    { author: 'Marta', platform: 'booking', lang: 'pl',
      quote: "Duża, wyposażona kuchnia oraz czyste przestrzenie idealnie dla dużej grupy. Dodatkowe atrakcje – sauna, stół bilardowy, wieszak na odzież narciarską – strzał w 10 na zimowe wyjazdy!",
      quote_cs: "Velká, plně vybavená kuchyň a čisté prostory jsou ideální pro velkou skupinu. Sauna, kulečníkový stůl a věšák na lyžařské oblečení jsou perfektním doplňkem zimního pobytu!" },
    { author: 'Evžen', platform: 'booking', lang: 'cs',
      quote: "Moc se nám tu líbilo. Ubytování bylo krásné, čisté a velmi dobře vybavené. … Majitel byl naprosto úžasný - velmi milý, ochotný a ve všem nám pomohl. Komunikace byla perfektní.",
      quote_cs: null },
    { author: 'Martina', platform: 'google', lang: 'cs',
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
const VR_TRIP_COUNTS = { foot: 7, car: 27, day: 4, total: 38 };
const TRIPS_URL = 'https://pavelkubiznak.github.io/villa-rudolf-portal/data/trips.json';
const TRIPS_CACHE_KEY = 'vr_tripcounts_v1';
const TRIPS_TTL = 21600000; // 6 h

/* ============================ Translations (verbatim from prototype) ============================ */
const T = {
  cs: {
    photoSoon: 'Fotku doplníme',
    meta: {
      title: 'Villa Rudolf – celé horské sídlo jen pro vás | Krkonoše',
      desc: 'Villa Rudolf – soukromé horské sídlo v Krkonoších. Celý dům i rozlehlý pozemek jen pro vaši skupinu 6–22 lidí: zastřešený bazén, sauna, pergola, ohniště. Léto i zima. Rezervujte celý dům.',
      locale: 'cs_CZ',
    },
    nav: { dum: 'Dům', interier: 'Interiér', vybaveni: 'Vybavení', galerie: 'Galerie', recenze: 'Recenze', ohniste: 'Ohniště', sezony: 'Sezóny', lokalita: 'Lokalita', vylety: 'Výlety', info: 'Praktické info', cta: 'Rezervovat termín' },
    hero: {
      eyebrow: 'Celý dům jen pro vaši skupinu · Krkonoše',
      eyebrowWinter: 'Lyžování za rohem · Krkonoše',
      h1: 'Soukromá vila v Krkonoších pro 6–22 hostů',
      sub: 'Celé to místo — dům i rozlehlý pozemek — je <em>jen vaše</em>.',
      subWinter: 'Lyžování hned za rohem — <em>skibus u domu</em>, Černá hora 4 km.',
      ctaSec: 'Prohlédnout dům', badge: 'Volné termíny 2026', video: 'Přehrát video',
      summer: 'Léto', winter: 'Zima',
      nightLine: 'Setmělo se. Ohniště, gabiony i bazén se rozsvítily samy — večer tady teprve začíná.',
    },
    ratings: { eyebrow: 'Hodnocení hostů', reviewsWord: 'recenzí', verified: 'ověřeno', teaserMore: 'Přečíst recenze' },
    direct: {
      badge: '<b>Přímá rezervace = nejlepší cena.</b> O 5 % výhodněji než na platformách. Osobní přístup a férové storno podmínky.',
      book: '<b>Přímá rezervace = nejlepší cena.</b> O 5 % výhodněji než na platformách. Osobní přístup a férové storno podmínky.',
      sidebar: 'Přímá rezervace — o 5 % výhodněji než na platformách.',
    },
    statement: {
      eyebrow: 'Celý areál jen pro vás',
      title: 'Za bránou už jste jen vy.',
      lead: 'Nerezervujete si pokoje v domě, kde bydlí ještě někdo další. Berete si celý pozemek — dům, 4 500 m² oploceného parku, bazén, saunu, pergolu i ohniště. <span class="vr-sm-hide">Žádná recepce, žádní cizí lidé u snídaně, žádné čekání, až se uvolní sauna.</span>',
      stats: [
        { num: '4 500 m²', label: 'oploceného parku jen pro vaši skupinu' },
        { num: '22 lůžek', label: 'v sedmi ložnicích — a jeden stůl, u kterého sedí celá parta' },
        { num: '1 skupina', label: 'v areálu je vždycky jen jedna, nikdy dvě najednou' },
        { num: '0', label: 'prostor sdílených s cizími lidmi' },
      ],
    },
    band: { eyebrow: 'Jeden večer tady' },
    amenities: {
      eyebrow: 'Vybavení', title: 'Komfort, který drží skupinu pohromadě', drop: 'Přetáhněte sem fotku',
      summer: {
        hero: { tag: 'Wellness', name: 'Zastřešený vyhřívaný bazén', desc: 'Bazén pod střechou s ohřevem vody — v provozu za každého počasí, od letního odpoledne po mrazivý zimní večer. Po koupeli rovnou do sauny.' },
        cards: [
          { tag: 'Wellness', name: 'Privátní sauna', desc: 'Finská sauna jen pro vaši skupinu. Žádné sdílení, žádné časové sloty.' },
          { tag: 'Venkovní život', name: 'Velká pergola', desc: 'Kryté posezení, kam se vejde celá skupina najednou. Společné večeře venku i za deště.' },
          { tag: 'Pro rodiny', name: 'Dětské hřiště', desc: 'Prolézačky, malá lezecká a lanová stěna. Děti mají svůj prostor na dohled od pergoly.' },
        ],
      },
      winter: {
        hero: { tag: 'Lyžování', name: 'Lyžování hned za rohem', desc: 'Ski Resort Černá hora jen 4 km. Skibus zdarma zastavuje přímo u domu — k vlekům bez auta a hledání parkování. Doma navíc lyžárna na uskladnění vybavení.' },
        cards: [
          { tag: 'Wellness', name: 'Po lyžích do sauny', desc: 'Finská sauna jen pro vaši skupinu — ideální po dni na sjezdovce. Žádné sdílení, žádné časové sloty.' },
          { tag: 'Venkovní život', name: 'Zimní večery u ohniště', desc: 'Nově dokončené ohniště s gabionovou stěnou se po setmění samo nasvítí — teplo pod širým nebem, i když venku mrzne.' },
          { tag: 'Wellness', name: 'Krytý bazén i v mrazu', desc: 'Vyhřívaný bazén pod střechou — plavete i uprostřed zimy, když venku leží sníh.' },
        ],
      },
      extraTitle: 'A k tomu celoročně',
      extra: [
        { name: 'Kuchyně a stůl pro celou skupinu', desc: 'Plně vybavená kuchyně a velký dřevěný stůl, u kterého se sejdete všichni najednou.' },
        { name: 'Společenská místnost v podkroví', desc: 'Dlouhá sedací souprava pod starým trámem a velký stůl u okna — místo pro večery uvnitř.' },
        { name: 'Kulečník', desc: 'Kulečníkový stůl v apartmá Suite — na deštivé odpoledne i na turnaj po večeři.' },
        { name: 'Lyžárna', desc: 'Samostatná místnost jen na lyže a boty — stojany na vybavení a omyvatelná podlaha. Nic se netahá do pokojů.' },
      ],
    },
    bedrooms: {
      eyebrow: 'Ložnice a lůžka',
      title: 'Kde se u nás vyspíte',
      note: '7 ložnic a 22 lůžek — pohodlné spaní pro celou skupinu i pro rodiny.',
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
      open360: 'Prohlédnout ve 360°',
      rosterTitle: 'Rozpis lůžek',
      items: { kitchen: 'Kuchyně a jídelna', lounge: 'Společenská místnost v podkroví', suite: 'Apartmá Suite', room1: 'Pokoj 1', room2: 'Pokoj 2', room3: 'Pokoj 3', room4: 'Pokoj 4', sauna: 'Finská sauna', wellness: 'Wellness a sprcha', bath: 'Koupelna se sprchou', bath2: 'Koupelna – Pokoj 2', bath3: 'Koupelna – Pokoj 3', bath4: 'Koupelna – Pokoj 4' },
    },
    ohniste: {
      eyebrow: 'Nová dominanta', caption: 'Detail ohniště a gabionové stěny',
      title: 'Ohniště s gabionovou stěnou, které večer ožívá',
      body: 'Nově dokončené otevřené ohniště pojme celou skupinu. Masivní gabionová stěna s ním tvoří jeden celek a po setmění se automaticky nasvítí — světla se sama rozsvěcují i zhasínají. Centrum večerů pod širým nebem.',
    },
    skupina: {
      eyebrow: 'Vaše parta, ať je jakkoli velká',
      big: 'Šest kamarádů na motorkách, nebo sraz dvaceti dvou. Místo si pokaždé vezme celou partu.',
      desc: 'Nestavíme to na čísle. Pohodlně tu přespí až 22 lidí, ale stejně dobře sem sednou rodina, parta přátel i menší skupina — celý dům a celý pozemek je vždycky jen váš.',
    },
    sezony: {
      eyebrow: 'Léto vs. Zima', title: 'Co vás čeká v každé sezóně', note: 'Přepněte sezónu nahoře a celý web se promění.',
      summer: { tag: 'Léto', title: 'Dlouhé večery venku', desc: 'Bazén, pergola, ohniště a velký pozemek pro děti i dospělé. Turistika a výlety přímo od domu.',
        list: ['Vyhřívaný bazén, sauna a pergola', 'Ohniště a dlouhé večery na pozemku', 'Turistika a výlety přímo od domu'] },
      winter: { tag: 'Zima', title: 'Lyžovačka bez starostí', desc: 'Ski Resort Černá hora jen 4 km, lyžárna na vybavení přímo v domě a vyhřívaný krytý bazén se saunou na zahřátí po dni na sjezdovce.',
        list: ['Ski Resort Černá hora 4 km, skibus zdarma 200 m', 'Vyhřívaný krytý bazén a sauna', 'Lyžárna na uskladnění vybavení'] },
    },
    lokalita: {
      eyebrow: 'Lokalita · Svoboda nad Úpou',
      title: 'V horách, ne na konci světa.',
      lead: 'Stojíme ve Svobodě nad Úpou, 150 metrů od centra — obchod, restaurace, vlak i autobus zvládnete pěšky. Sněžka je odsud dvacet minut autem. A z Prahy i z Vratislavi sem dojedete přibližně za dvě hodiny.',
      leadWinter: 'Skibus do SkiResortu Černá hora–Pec staví 200 metrů od brány a jezdí zdarma — k vlekům se dostanete bez auta a bez hledání parkování. Auto pak může stát celý týden na jednom místě přímo na pozemku.',
      doorstep: [
        { num: '150 m', label: 'do centra Svobody — asi dvě minuty pěšky' },
        { num: '200 m', label: 'k zastávce skibusu — necelé tři minuty pěšky' },
        { num: '2 h', label: 'přibližně z Prahy i z Vratislavi, z Drážďan tři hodiny' },
        { num: '4 km', label: 'na sjezdovky Černá hora — skibus jezdí zdarma' },
      ],
      mapTitle: ['{n} ověřený výlet ve třech okruzích', '{n} ověřené výlety ve třech okruzích', '{n} ověřených výletů ve třech okruzích'],
      mapNote: 'Vzdálenosti na mapě odpovídají skutečnosti, terén je kreslený. Kroužek kolem vily má poloměr tři kilometry vzdušnou čarou.',
      legend: '◆ Villa Rudolf · ○ kam dojdete pěšky · ┄ hranice s Polskem · časy a vzdálenosti jsou po silnici',
      mapAlt: 'Kreslená mapa okolí: Villa Rudolf ve Svobodě nad Úpou, Sněžka, Janské Lázně, Pec pod Sněžkou, Trutnov a hranice s Polskem.',
      rings: [
        { name: 'Pěšky od brány', count: ['{n} cíl', '{n} cíle', '{n} cílů'],
          body: 'Janské Lázně a Stezka korunami stromů, krytý bazén Aquacentrum, lamatreking na rodinné farmě, farmapark Muchomůrka, pohádkové Do Krakonošova, adventure minigolf i střelnice. Na žádný z nich nepotřebujete auto.',
          link: 'Zobrazit v průvodci →' },
        { name: 'Do 30 minut autem', count: ['{n} cíl', '{n} cíle', '{n} cílů'],
          body: 'Sněžka lanovkou nebo pěšky, Černá hora kabinkou, Obří důl i s kočárkem, bobová dráha v Peci, rozhledny, bukový prales Rýchory, koupaliště i lezecká stěna v Trutnově.',
          link: 'Zobrazit v průvodci →' },
        { name: 'Na celý den', count: ['{n} cíl', '{n} cíle', '{n} cílů'],
          body: 'Adršpašské skály, Safari Park Dvůr Králové, sklárna Harrachov s Mumlavskými vodopády a aquapark Tropikana v polském Karpaczi — na ten si vezměte doklady i dětem.',
          link: 'Zobrazit v průvodci →' },
      ],
      arrive: [
        { k: 'Praha', v: 'přibližně 2 hodiny autem' },
        { k: 'Vratislav (PL)', v: 'přibližně 2 hodiny autem' },
        { k: 'Drážďany', v: 'přibližně 3 hodiny autem' },
        { k: 'Vlakem', v: 'nádraží Svoboda nad Úpou, k domu pěšky' },
        { k: 'Autobusem', v: 'zastávka ve městě, k domu pěšky' },
        { k: 'Skibus', v: 'zastávka 200 m od brány, zdarma' },
        { k: 'Parkování', v: 'přímo na pozemku, za bránou' },
      ],
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
        { name: 'Společenská místnost', desc: 'Velký společný prostor s pohovkou pro celou partu, masivním dřevěným trámem a jídelním koutem — srdce domu.' },
        { name: 'Kuchyně a jídelna', desc: 'Plně vybavená kuchyně s velkým stolem pro společné snídaně i večeře celé skupiny.' },
        { name: 'Sauna a odpočinek', desc: 'Finská sauna s prosklenými dveřmi a odpočinková lávka hned vedle — privátně jen pro vaši skupinu.' },
        { name: 'Ve finské sauně', desc: 'Uvnitř vyhřáté sauny — teplé dřevo a klid po dni na horách.' },
        { name: 'Ložnice – Pokoj 4', desc: 'Jedna z ložnic s kamennou stěnou za čelním panelem — pohodlné spaní pro celou partu.' },
        { name: 'Zastřešený bazén', desc: 'Vyhřívaný bazén pod zastřešením — tady se koupete i uprostřed zimy.' },
        { name: 'Pergola', desc: 'Mohutná dřevěná pergola s posezením pro celou skupinu — večer se tu sedí, i když venku leží sníh.' },
        { name: 'Zimní pozemek', desc: 'Rozlehlý zasněžený pozemek jen pro vás — od domu k bazénu, hřišti a dál.' },
        { name: 'Ložnice – Pokoj 3', desc: 'Ložnice s výraznou grafickou tapetou za podsvíceným čelem postele — až čtyři lůžka.' },
        { name: 'Ložnice – Pokoj 2', desc: 'Rohová ložnice se dvěma okny a tónovanou tapetou za čelem postele — až čtyři lůžka.' },
        { name: 'Koupelna – Pokoj 4', desc: 'Koupelna Pokoje 4 — zaoblený sprchový kout, umyvadlo a toaleta.' },
        { name: 'Koupelna – Pokoj 3', desc: 'Koupelna Pokoje 3 — zaoblený sprchový kout, umyvadlo a toaleta.' },
        { name: 'Koupelna – Pokoj 2', desc: 'Koupelna Pokoje 2 — zaoblený sprchový kout, umyvadlo a toaleta.' },
      ],
      scenesSummer: [
        { name: 'Příjezd k vile', desc: 'Plocha za bránou, kam zaparkuje celá skupina, a dům na konci příjezdovky mezi vzrostlými stromy.' },
        { name: 'Zahrada s dětským hřištěm', desc: 'Lanový most, prolézačka a malá lezecká stěna na dohled od domu — děti mají svůj kout uvnitř pozemku.' },
        { name: 'Bazén u vily', desc: 'Zastřešený vyhřívaný bazén s řadou lehátek hned u domu, kolem dokola vlastní trávník.' },
        { name: 'Louka s houpačkou a ping-pongem', desc: 'Horní část pozemku: houpačka se skluzavkou, ping-pongový stůl a místo na běhání i na míč.' },
        { name: 'Dřevěná terasa s posezením', desc: 'Terasa z dubových fošen nad gabionovou zdí — stůl pro celou partu a výhled na pergolu a hory.' },
        { name: 'Pergola a ohniště', desc: 'Střed pozemku: krytá pergola s grilem vlevo, zapuštěné ohniště s gabionovou stěnou vpravo.' },
        { name: 'Uvnitř pergoly', desc: 'Pod krovem z masivního dřeva: dlouhý stůl, zděný grilovací pult a otevřené strany do zahrady.' },
        { name: 'Večerní terasa', desc: 'Po setmění se gabiony i schody nasvítí samy — křesílka u ohniště a v pozadí svítící bazén.' },
      ],
    },
    gallery: { eyebrow: 'Galerie', title: 'Dům, pozemek, okolí', note: 'Klepnutím zvětšíte', all: 'Vše', leto: 'Léto', zima: 'Zima', vecer: 'Večer', interier: 'Interiér' },
    vylety: {
      eyebrow: 'Kam na výlet', title: 'Hory začínají za dveřmi', note: 'Tipy obměňujeme podle sezóny.', drop: 'Sem přijde fotka z výletu', cta: 'Prohlédnout tipy na výlety',
      items: [
        { tag: 'Celoročně', name: 'Sněžka', desc: 'Nejvyšší hora Česka — pěšky po hřebenech, nebo lanovkou z Pece pod Sněžkou.' },
        { tag: 'Léto', name: 'Hřebenovky a vodopády', desc: 'Značené trasy od pohodových okruhů po celodenní přechody. Mumlavský vodopád zvládnou i děti.' },
        { tag: 'Zima', name: 'Lyžování v okolí', desc: 'Ski Resort Černá hora jen 4 km od domu a lyžárna na uskladnění vybavení přímo v domě.' },
        { tag: 'S dětmi', name: 'Bobovky a stezky', desc: 'Bobové dráhy, lanové parky a stezka v korunách stromů v pohodlném dojezdu.' },
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
    recenze: {
      eyebrow: 'Recenze', title: 'Co říkají hosté', note: 'Skutečné recenze z Airbnb, Booking.com a Google.',
    },
    video: { eyebrow: 'Video', title: 'Prohlédněte si vilu na videu', summer: 'Dům, zahrada, bazén a příjezd', winter: 'Prohlídka domu, sauna a skibus', play: 'Přehrát video' },
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
    footer: { tagline: 'Soukromé horské sídlo pro velké skupiny v srdci Krkonoš.', langLabel: 'Jazyk', contact: 'Kontakt', rights: '© 2026 Villa Rudolf', social: 'Sledujte nás', host: 'Pavel — váš hostitel', region: 'Krkonoše, Česko', terms: 'Ubytovací podmínky a ochrana údajů', guide: 'Průvodce výlety' },
    prebook: {
      title: 'Co potřebujete vědět před rezervací', link: 'Vše praktické →',
      facts: [
        { k: 'Kapacita', v: '6–22 hostů v 7 ložnicích' },
        { k: 'Soukromí', v: 'Celý dům i pozemek jen pro vaši skupinu' },
        { k: 'Příjezd / odjezd', v: 'Check-in od 15:00 · check-out do 10:00' },
        { k: 'Mazlíčci', v: 'Pes vítán za poplatek' },
        { k: 'Parkování', v: 'Zdarma přímo na pozemku, za bránou' },
        { k: 'Lyžování', v: 'Sjezdovky Černá hora 4 km · skibus zdarma 200 m' },
      ],
    },
  },

  en: {
    photoSoon: 'Photo coming soon',
    meta: {
      title: 'Villa Rudolf – the whole mountain estate, just for you | Krkonoše',
      desc: 'Villa Rudolf – a private mountain estate in the Czech Krkonoše. The whole house and grounds for your group of 6–22: covered pool, sauna, pergola, fire pit. Summer and winter. Book the entire house.',
      locale: 'en_GB',
    },
    nav: { dum: 'The House', interier: 'Interior', vybaveni: 'Amenities', galerie: 'Gallery', recenze: 'Reviews', ohniste: 'Fire Pit', sezony: 'Seasons', lokalita: 'Location', vylety: 'Trips', info: 'Guest info', cta: 'Book dates' },
    hero: {
      eyebrow: 'The whole house, just for your group · Krkonoše',
      eyebrowWinter: 'Skiing just around the corner · Krkonoše',
      h1: 'A private villa in the Krkonoše mountains for 6–22 guests',
      sub: 'The whole place — the house and its sweeping grounds — is <em>yours alone</em>.',
      subWinter: 'Skiing just around the corner — <em>ski bus at the door</em>, Černá hora 4 km.',
      ctaSec: 'Explore the house', badge: 'Open dates 2026', video: 'Play video',
      summer: 'Summer', winter: 'Winter',
      nightLine: 'Night has fallen. The fire pit, gabion wall and pool have lit themselves — the evening is just beginning.',
    },
    ratings: { eyebrow: 'Guest ratings', reviewsWord: 'reviews', verified: 'verified', teaserMore: 'Read the reviews' },
    direct: {
      badge: '<b>Book direct = best price.</b> 5% better than the platforms. Personal service and fair cancellation terms.',
      book: '<b>Book direct = best price.</b> 5% better than the platforms. Personal service and fair cancellation terms.',
      sidebar: 'Booking direct — 5% better than the platforms.',
    },
    statement: {
      eyebrow: 'The whole estate, only yours',
      title: 'Past the gate, it\'s just you.',
      lead: 'You are not booking rooms in a house where somebody else is staying too. You take the whole place — the house, 4,500 m² of fenced grounds, the pool, the sauna, the pergola and the fire pit. <span class="vr-sm-hide">No reception desk, no strangers at breakfast, no waiting for the sauna to free up.</span>',
      stats: [
        { num: '4,500 m²', label: 'of fenced grounds for your group alone' },
        { num: '22 beds', label: 'in seven bedrooms — and one table the whole party sits at' },
        { num: '1 group', label: 'there is only ever one on the estate, never two at once' },
        { num: '0', label: 'spaces shared with strangers' },
      ],
    },
    band: { eyebrow: 'One evening here' },
    amenities: {
      eyebrow: 'Amenities', title: 'Comfort that keeps the group together', drop: 'Drop a photo here',
      summer: {
        hero: { tag: 'Wellness', name: 'Covered heated pool', desc: 'An indoor pool with heated water — open in any weather, from summer afternoons to frozen winter nights. Straight from the water into the sauna.' },
        cards: [
          { tag: 'Wellness', name: 'Private sauna', desc: 'A Finnish sauna for your group only. No sharing, no time slots.' },
          { tag: 'Outdoor living', name: 'Large pergola', desc: 'Covered seating big enough for the whole group at once. Shared dinners outside, even in the rain.' },
          { tag: 'For families', name: 'Children’s playground', desc: 'Climbing frames, a small climbing wall and a rope wall. The kids get their own space in sight of the pergola.' },
        ],
      },
      winter: {
        hero: { tag: 'Skiing', name: 'Skiing just around the corner', desc: 'Ski Resort Černá hora just 4 km away. A free ski bus stops right at the house — reach the lifts without the car or the parking hunt. Plus a ski room at home for your gear.' },
        cards: [
          { tag: 'Wellness', name: 'Sauna after the slopes', desc: 'A Finnish sauna for your group only — perfect after a day on the piste. No sharing, no time slots.' },
          { tag: 'Outdoor living', name: 'Winter evenings by the fire', desc: 'The newly finished fire pit with a gabion wall lights up on its own after dark — warmth under the open sky, even in the frost.' },
          { tag: 'Wellness', name: 'Covered pool in the cold', desc: 'A heated pool under cover — swim even in midwinter, with snow lying outside.' },
        ],
      },
      extraTitle: 'And year-round',
      extra: [
        { name: 'Kitchen and a table for everyone', desc: 'A fully equipped kitchen and a large wooden table that seats the whole group at once.' },
        { name: 'Attic lounge', desc: 'A long sofa under an old beam and a big table by the window — the place for evenings indoors.' },
        { name: 'Billiards', desc: 'A billiard table in the Suite apartment — for a rainy afternoon or a tournament after dinner.' },
        { name: 'Ski room', desc: 'A separate room just for skis and boots — racks for your gear and a washable floor. Nothing has to go up to the bedrooms.' },
      ],
    },
    bedrooms: {
      eyebrow: 'Bedrooms & beds',
      title: 'Where you’ll sleep',
      note: '7 bedrooms and 22 beds — comfortable sleeping for the whole group and for families.',
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
      open360: 'View in 360°',
      rosterTitle: 'Bed layout',
      items: { kitchen: 'Kitchen & dining', lounge: 'Attic lounge', suite: 'Apartment Suite', room1: 'Bedroom 1', room2: 'Bedroom 2', room3: 'Bedroom 3', room4: 'Bedroom 4', sauna: 'Finnish sauna', wellness: 'Wellness & shower', bath: 'Bathroom with shower', bath2: 'Bathroom – Room 2', bath3: 'Bathroom – Room 3', bath4: 'Bathroom – Room 4' },
    },
    ohniste: {
      eyebrow: 'New centrepiece', caption: 'Detail of the fire pit and gabion wall',
      title: 'A fire pit with a gabion wall that comes alive at night',
      body: 'The newly finished open fire pit holds the whole group. A massive gabion wall forms a single composition with it and lights up automatically after dark — the lights switch on and off on their own. The heart of open-air evenings.',
    },
    skupina: {
      eyebrow: 'Your group, whatever its size',
      big: 'Six friends on motorbikes, or a reunion of twenty-two. The place always takes the whole party.',
      desc: 'It isn’t about the number. Up to 22 sleep here in comfort, but a family, a circle of friends or a smaller group fit just as well — the whole house and grounds are always yours alone.',
    },
    sezony: {
      eyebrow: 'Summer vs. Winter', title: 'What each season brings', note: 'Switch season above and the whole site transforms.',
      summer: { tag: 'Summer', title: 'Long evenings outside', desc: 'Pool, pergola, fire pit and a large grounds for kids and adults alike. Hiking and trips straight from the house.',
        list: ['Heated pool, sauna and pergola', 'Fire pit and long evenings on the grounds', 'Hiking and trips straight from the house'] },
      winter: { tag: 'Winter', title: 'Skiing without the hassle', desc: 'Ski Resort Černá hora just 4 km away, a ski room for your gear in the house, and a heated indoor pool with sauna to warm up after a day on the slopes.',
        list: ['Ski Resort Černá hora 4 km, free ski bus 200 m', 'Heated covered pool and sauna', 'Ski room for your gear'] },
    },
    lokalita: {
      eyebrow: 'Location · Svoboda nad Úpou',
      title: 'In the mountains, not at the end of the world.',
      lead: 'We are in Svoboda nad Úpou, 150 metres from the centre — shop, restaurant, train and bus are all within walking distance. Sněžka is twenty minutes away by car. And Prague and Wrocław are both roughly two hours from here.',
      leadWinter: 'The free ski bus to SkiResort Černá hora–Pec stops 200 metres from the gate — you reach the lifts without the car and without hunting for a parking space. The car can then stay put on the grounds all week.',
      doorstep: [
        { num: '150 m', label: 'to the centre of Svoboda — about a two-minute walk' },
        { num: '200 m', label: 'to the ski-bus stop — under three minutes on foot' },
        { num: '2 h', label: 'roughly from Prague and from Wrocław, three from Dresden' },
        { num: '4 km', label: 'to the Černá hora slopes — the ski bus is free' },
      ],
      mapTitle: ['{n} tried-and-tested trip in three rings', '{n} tried-and-tested trips in three rings'],
      mapNote: 'Distances on the map are true to life; the terrain is drawn by hand. The ring around the villa has a radius of three kilometres as the crow flies.',
      legend: '◆ Villa Rudolf · ○ within walking distance · ┄ the Polish border · times and distances are by road',
      mapAlt: 'A hand-drawn map of the area: Villa Rudolf in Svoboda nad Úpou, Sněžka, Janské Lázně, Pec pod Sněžkou, Trutnov and the Polish border.',
      rings: [
        { name: 'On foot from the gate', count: ['{n} destination', '{n} destinations'],
          body: 'Janské Lázně and the Treetop Walk, the Aquacentrum indoor pool, llama trekking at a family farm, the Muchomůrka farm park, the Do Krakonošova fairy-tale exhibition, adventure minigolf and a shooting range. Not one of them needs a car.',
          link: 'See them in the guide →' },
        { name: 'Within a 30-minute drive', count: ['{n} destination', '{n} destinations'],
          body: 'Sněžka by cable car or on foot, Černá hora by gondola, Obří důl even with a pushchair, the bobsled track in Pec, lookout towers, the Rýchory beech forest, the lido and the climbing wall in Trutnov.',
          link: 'See them in the guide →' },
        { name: 'A full day out', count: ['{n} destination', '{n} destinations'],
          body: 'The Adršpach rock town, Safari Park Dvůr Králové, the Harrachov glassworks with the Mumlava waterfalls, and the Tropikana aquapark in Karpacz, Poland — take everyone\'s ID for that one, children included.',
          link: 'See them in the guide →' },
      ],
      arrive: [
        { k: 'Prague', v: 'roughly 2 hours by car' },
        { k: 'Wrocław (PL)', v: 'roughly 2 hours by car' },
        { k: 'Dresden', v: 'roughly 3 hours by car' },
        { k: 'By train', v: 'Svoboda nad Úpou station, then a short walk' },
        { k: 'By bus', v: 'a stop in town, then a short walk' },
        { k: 'Ski bus', v: 'stop 200 m from the gate, free of charge' },
        { k: 'Parking', v: 'on the grounds, behind the gate' },
      ],
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
        { name: 'Communal room', desc: 'A large shared space with a sofa for the whole group, a massive timber beam and a dining nook — the heart of the house.' },
        { name: 'Kitchen & dining', desc: 'A fully equipped kitchen with a large table for the whole group’s breakfasts and dinners.' },
        { name: 'Sauna & relaxation', desc: 'A Finnish sauna with a glass door and a relaxation bench beside it — privately, just for your group.' },
        { name: 'Inside the sauna', desc: 'Inside the heated sauna — warm wood and quiet after a day in the mountains.' },
        { name: 'Bedroom – Room 4', desc: 'One of the bedrooms with a stone accent wall behind the headboard — comfortable sleeping for the whole party.' },
        { name: 'Covered pool', desc: 'A heated pool under cover — you swim here even in midwinter.' },
        { name: 'Pergola', desc: 'A massive timber pergola with seating for the whole group — evenings happen here even with snow on the ground.' },
        { name: 'Winter grounds', desc: 'Sweeping snowbound grounds, all yours — from the house to the pool, the playground and beyond.' },
        { name: 'Bedroom – Room 3', desc: 'A bedroom with a bold graphic wallpaper behind the backlit headboard — up to four beds.' },
        { name: 'Bedroom – Room 2', desc: 'A corner bedroom with two windows and a toned wallpaper behind the headboard — up to four beds.' },
        { name: 'Bathroom – Room 4', desc: 'Room 4’s bathroom — rounded corner shower, basin and toilet.' },
        { name: 'Bathroom – Room 3', desc: 'Room 3’s bathroom — rounded corner shower, basin and toilet.' },
        { name: 'Bathroom – Room 2', desc: 'Room 2’s bathroom — rounded corner shower, basin and toilet.' },
      ],
      scenesSummer: [
        { name: 'Arriving at the villa', desc: 'The parking area behind the gate with room for the whole group, and the house at the end of the drive among tall trees.' },
        { name: 'Garden with the playground', desc: 'A rope bridge, a climbing frame and a small climbing wall in sight of the house — the children have their own corner inside the grounds.' },
        { name: 'The pool beside the house', desc: 'The covered heated pool and its row of sun loungers, right by the house and ringed by your own lawn.' },
        { name: 'Meadow with swing and table tennis', desc: 'The upper part of the grounds: a swing with a slide, a table-tennis table and room to run around.' },
        { name: 'The wooden deck', desc: 'An oak deck above the gabion wall — a table for the whole group, looking out to the pergola and the hills.' },
        { name: 'Pergola and fire pit', desc: 'The centre of the grounds: the covered pergola with its grill on the left, the sunken fire pit with its gabion wall on the right.' },
        { name: 'Inside the pergola', desc: 'Under a solid timber roof: the long table, a built-in grill counter and open sides onto the garden.' },
        { name: 'The terrace after dark', desc: 'Once the sun is down the gabions and steps light themselves — chairs around the fire pit, the glowing pool behind.' },
      ],
    },
    gallery: { eyebrow: 'Gallery', title: 'The house, grounds, surroundings', note: 'Click to enlarge', all: 'All', leto: 'Summer', zima: 'Winter', vecer: 'Evening', interier: 'Interior' },
    vylety: {
      eyebrow: 'Day trips', title: 'The mountains start at the door', note: 'Tips rotate with the season.', drop: 'A trip photo goes here', cta: 'See our trip highlights',
      items: [
        { tag: 'Year-round', name: 'Sněžka', desc: 'The highest peak in Czechia — hike the ridges, or take the cable car from Pec pod Sněžkou.' },
        { tag: 'Summer', name: 'Ridge trails & waterfalls', desc: 'Marked routes from easy loops to full-day traverses. The Mumlava waterfall works with kids too.' },
        { tag: 'Winter', name: 'Skiing nearby', desc: 'Ski Resort Černá hora just 4 km away, with a ski room in the house for your gear.' },
        { tag: 'With kids', name: 'Toboggans & trails', desc: 'Mountain toboggan runs, rope parks and a treetop walkway within an easy drive.' },
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
    recenze: {
      eyebrow: 'Reviews', title: 'What guests say', note: 'Real reviews from Airbnb, Booking.com and Google.',
    },
    video: { eyebrow: 'Video', title: 'See the villa on video', summer: 'House, garden, pool & arrival', winter: 'House tour, sauna & ski bus', play: 'Play video' },
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
    footer: { tagline: 'A private mountain estate for large groups in the heart of Krkonoše.', langLabel: 'Language', contact: 'Contact', rights: '© 2026 Villa Rudolf', social: 'Follow us', host: 'Pavel — your host', region: 'Krkonoše, Czechia', terms: 'Booking terms & privacy', guide: 'Trip guide' },
    prebook: {
      title: 'What to know before you book', link: 'All the practical info →',
      facts: [
        { k: 'Capacity', v: '6–22 guests across 7 bedrooms' },
        { k: 'Privacy', v: 'The whole house and grounds, just your group' },
        { k: 'Check-in / out', v: 'Check-in from 15:00 · check-out by 10:00' },
        { k: 'Pets', v: 'Dogs welcome for a fee' },
        { k: 'Parking', v: 'Free, right on the property behind the gate' },
        { k: 'Skiing', v: 'Černá hora slopes 4 km · free ski bus 200 m' },
      ],
    },
  },

  de: {
    photoSoon: 'Foto folgt',
    meta: {
      title: 'Villa Rudolf – das ganze Berganwesen nur für euch | Riesengebirge',
      desc: 'Villa Rudolf – ein privates Berganwesen im Riesengebirge. Das ganze Haus und Grundstück für eure Gruppe von 6–22 Personen: überdachter Pool, Sauna, Pergola, Feuerstelle. Sommer und Winter. Ganzes Haus buchen.',
      locale: 'de_DE',
    },
    nav: { dum: 'Das Haus', interier: 'Innen', vybaveni: 'Ausstattung', galerie: 'Galerie', recenze: 'Bewertungen', ohniste: 'Feuerstelle', sezony: 'Jahreszeiten', lokalita: 'Lage', vylety: 'Ausflüge', info: 'Gäste-Infos', cta: 'Termin buchen' },
    hero: {
      eyebrow: 'Das ganze Haus, nur für eure Gruppe · Riesengebirge',
      eyebrowWinter: 'Skifahren gleich um die Ecke · Riesengebirge',
      h1: 'Eine private Villa im Riesengebirge für 6–22 Gäste',
      sub: 'Der ganze Ort — Haus und weitläufiges Grundstück — gehört <em>nur euch</em>.',
      subWinter: 'Skifahren gleich um die Ecke — <em>Skibus am Haus</em>, Černá hora 4 km.',
      ctaSec: 'Haus ansehen', badge: 'Freie Termine 2026', video: 'Video abspielen',
      summer: 'Sommer', winter: 'Winter',
      nightLine: 'Es ist dunkel geworden. Feuerstelle, Gabionenwand und Pool leuchten von selbst — der Abend fängt gerade erst an.',
    },
    ratings: { eyebrow: 'Gästebewertungen', reviewsWord: 'Bewertungen', verified: 'geprüft', teaserMore: 'Bewertungen lesen' },
    direct: {
      badge: '<b>Direkt buchen = bester Preis.</b> 5 % günstiger als über die Plattformen. Persönlicher Service und faire Stornobedingungen.',
      book: '<b>Direkt buchen = bester Preis.</b> 5 % günstiger als über die Plattformen. Persönlicher Service und faire Stornobedingungen.',
      sidebar: 'Direkt buchen — 5 % günstiger als über die Plattformen.',
    },
    statement: {
      eyebrow: 'Das ganze Anwesen nur für euch',
      title: 'Hinter dem Tor seid ihr unter euch.',
      lead: 'Ihr bucht keine Zimmer in einem Haus, in dem noch jemand anderes wohnt. Ihr nehmt das ganze Grundstück — das Haus, 4.500 m² eingezäunten Park, Pool, Sauna, Pergola und Feuerstelle. <span class="vr-sm-hide">Keine Rezeption, keine Fremden beim Frühstück, kein Warten, bis die Sauna frei wird.</span>',
      stats: [
        { num: '4.500 m²', label: 'eingezäunter Park nur für eure Gruppe' },
        { num: '22 Betten', label: 'in sieben Schlafzimmern — und ein Tisch für die ganze Runde' },
        { num: '1 Gruppe', label: 'auf dem Anwesen ist immer nur eine, nie zwei gleichzeitig' },
        { num: '0', label: 'Räume, die ihr mit Fremden teilt' },
      ],
    },
    band: { eyebrow: 'Ein Abend hier' },
    amenities: {
      eyebrow: 'Ausstattung', title: 'Komfort, der die Gruppe zusammenhält', drop: 'Foto hierher ziehen',
      summer: {
        hero: { tag: 'Wellness', name: 'Überdachter beheizter Pool', desc: 'Ein Innenpool mit beheiztem Wasser — bei jedem Wetter nutzbar, vom Sommernachmittag bis zur frostigen Winternacht. Aus dem Wasser direkt in die Sauna.' },
        cards: [
          { tag: 'Wellness', name: 'Private Sauna', desc: 'Eine finnische Sauna nur für eure Gruppe. Kein Teilen, keine Zeitfenster.' },
          { tag: 'Draußen leben', name: 'Große Pergola', desc: 'Überdachte Sitzplätze für die ganze Gruppe auf einmal. Gemeinsame Abendessen draußen, auch bei Regen.' },
          { tag: 'Für Familien', name: 'Kinderspielplatz', desc: 'Klettergerüste, eine kleine Kletterwand und eine Seilwand. Die Kinder haben ihren eigenen Bereich in Sichtweite der Pergola.' },
        ],
      },
      winter: {
        hero: { tag: 'Skifahren', name: 'Skifahren gleich um die Ecke', desc: 'Skigebiet Černá hora nur 4 km entfernt. Ein kostenloser Skibus hält direkt am Haus — zu den Liften ohne Auto und Parkplatzsuche. Dazu ein Skiraum im Haus für die Ausrüstung.' },
        cards: [
          { tag: 'Wellness', name: 'Nach dem Skifahren in die Sauna', desc: 'Eine finnische Sauna nur für eure Gruppe — perfekt nach einem Tag auf der Piste. Kein Teilen, keine Zeitfenster.' },
          { tag: 'Draußen leben', name: 'Winterabende am Feuer', desc: 'Die neu fertiggestellte Feuerstelle mit Gabionenwand leuchtet nach Einbruch der Dunkelheit von selbst — Wärme unter freiem Himmel, auch bei Frost.' },
          { tag: 'Wellness', name: 'Überdachter Pool auch im Frost', desc: 'Ein beheizter Pool unter Dach — schwimmt selbst mitten im Winter, wenn draußen Schnee liegt.' },
        ],
      },
      extraTitle: 'Und das ganze Jahr über',
      extra: [
        { name: 'Küche und ein Tisch für alle', desc: 'Eine voll ausgestattete Küche und ein großer Holztisch, an dem die ganze Gruppe auf einmal Platz findet.' },
        { name: 'Aufenthaltsraum im Dachgeschoss', desc: 'Eine lange Sitzgruppe unter einem alten Balken und ein großer Tisch am Fenster — der Ort für Abende drinnen.' },
        { name: 'Billard', desc: 'Ein Billardtisch im Suite-Apartment — für einen Regennachmittag oder ein Turnier nach dem Essen.' },
        { name: 'Skiraum', desc: 'Ein eigener Raum nur für Ski und Schuhe — Ständer für die Ausrüstung und abwaschbarer Boden. Nichts muss in die Zimmer.' },
      ],
    },
    bedrooms: {
      eyebrow: 'Schlafzimmer & Betten',
      title: 'Wo ihr schlaft',
      note: '7 Schlafzimmer und 22 Betten — bequemer Schlaf für die ganze Gruppe und für Familien.',
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
      open360: 'In 360° ansehen',
      rosterTitle: 'Bettenaufteilung',
      items: { kitchen: 'Küche & Essbereich', lounge: 'Aufenthaltsraum im Dachgeschoss', suite: 'Apartment-Suite', room1: 'Zimmer 1', room2: 'Zimmer 2', room3: 'Zimmer 3', room4: 'Zimmer 4', sauna: 'Finnische Sauna', wellness: 'Wellness & Dusche', bath: 'Bad mit Dusche', bath2: 'Bad – Zimmer 2', bath3: 'Bad – Zimmer 3', bath4: 'Bad – Zimmer 4' },
    },
    ohniste: {
      eyebrow: 'Neues Herzstück', caption: 'Detail der Feuerstelle und Gabionenwand',
      title: 'Eine Feuerstelle mit Gabionenwand, die abends zum Leben erwacht',
      body: 'Die neu fertiggestellte offene Feuerstelle fasst die ganze Gruppe. Eine massive Gabionenwand bildet mit ihr eine Einheit und wird nach Einbruch der Dunkelheit automatisch beleuchtet — die Lichter gehen von selbst an und aus. Das Zentrum der Abende unter freiem Himmel.',
    },
    skupina: {
      eyebrow: 'Eure Gruppe, egal wie groß',
      big: 'Sechs Freunde auf Motorrädern oder ein Treffen mit zweiundzwanzig. Der Ort fasst immer die ganze Runde.',
      desc: 'Es geht nicht um die Zahl. Bis zu 22 schlafen hier bequem, aber eine Familie, ein Freundeskreis oder eine kleinere Gruppe passen genauso gut — das ganze Haus und Grundstück gehören immer nur euch.',
    },
    sezony: {
      eyebrow: 'Sommer vs. Winter', title: 'Was jede Jahreszeit bietet', note: 'Wechselt oben die Jahreszeit — die ganze Seite verwandelt sich.',
      summer: { tag: 'Sommer', title: 'Lange Abende draußen', desc: 'Pool, Pergola, Feuerstelle und ein großes Grundstück für Kinder wie Erwachsene. Wandern und Ausflüge direkt vom Haus.',
        list: ['Beheizter Pool, Sauna und Pergola', 'Feuerstelle und lange Abende auf dem Grundstück', 'Wandern und Ausflüge direkt vom Haus'] },
      winter: { tag: 'Winter', title: 'Skifahren ohne Stress', desc: 'Skigebiet Černá hora nur 4 km entfernt, ein Skiraum für die Ausrüstung im Haus und ein beheizter Hallenpool mit Sauna zum Aufwärmen nach einem Tag auf der Piste.',
        list: ['Skigebiet Černá hora 4 km, Skibus gratis 200 m', 'Beheizter überdachter Pool und Sauna', 'Skiraum für die Ausrüstung'] },
    },
    lokalita: {
      eyebrow: 'Lage · Svoboda nad Úpou',
      title: 'In den Bergen, nicht am Ende der Welt.',
      lead: 'Wir stehen in Svoboda nad Úpou, 150 Meter vom Zentrum — Laden, Restaurant, Bahn und Bus schafft ihr zu Fuß. Die Schneekoppe ist zwanzig Autominuten entfernt. Und aus Prag wie aus Breslau seid ihr in rund zwei Stunden hier.',
      leadWinter: 'Der kostenlose Skibus zum SkiResort Černá hora–Pec hält 200 Meter vom Tor — zu den Liften kommt ihr ohne Auto und ohne Parkplatzsuche. Das Auto kann dann die ganze Woche auf dem Grundstück stehen bleiben.',
      doorstep: [
        { num: '150 m', label: 'ins Zentrum von Svoboda — etwa zwei Minuten zu Fuß' },
        { num: '200 m', label: 'zur Skibus-Haltestelle — keine drei Minuten zu Fuß' },
        { num: '2 h', label: 'rund aus Prag und aus Breslau, drei aus Dresden' },
        { num: '4 km', label: 'zu den Pisten der Černá hora — der Skibus ist kostenlos' },
      ],
      mapTitle: ['{n} erprobter Ausflug in drei Ringen', '{n} erprobte Ausflüge in drei Ringen'],
      mapNote: 'Die Entfernungen auf der Karte stimmen, das Gelände ist gezeichnet. Der Ring um die Villa hat drei Kilometer Radius Luftlinie.',
      legend: '◆ Villa Rudolf · ○ zu Fuß erreichbar · ┄ Grenze zu Polen · Zeiten und Entfernungen gelten auf der Straße',
      mapAlt: 'Gezeichnete Karte der Umgebung: Villa Rudolf in Svoboda nad Úpou, Schneekoppe, Janské Lázně, Pec pod Sněžkou, Trutnov und die Grenze zu Polen.',
      rings: [
        { name: 'Zu Fuß vom Tor', count: ['{n} Ziel', '{n} Ziele'],
          body: 'Janské Lázně und der Baumwipfelpfad, das Hallenbad Aquacentrum, Lamatrekking auf einer Familienfarm, der Farmapark Muchomůrka, die Märchenausstellung Do Krakonošova, Adventure-Minigolf und ein Schießstand. Für keines davon braucht ihr das Auto.',
          link: 'Im Reiseführer ansehen →' },
        { name: 'Bis 30 Autominuten', count: ['{n} Ziel', '{n} Ziele'],
          body: 'Die Schneekoppe per Seilbahn oder zu Fuß, die Černá hora per Gondel, der Obří důl auch mit Kinderwagen, die Sommerrodelbahn in Pec, Aussichtstürme, der Buchenurwald Rýchory, Freibad und Kletterwand in Trutnov.',
          link: 'Im Reiseführer ansehen →' },
        { name: 'Für einen ganzen Tag', count: ['{n} Ziel', '{n} Ziele'],
          body: 'Die Adersbacher Felsenstadt, der Safari-Park Dvůr Králové, die Glashütte Harrachov mit den Mumlava-Wasserfällen und der Aquapark Tropikana im polnischen Karpacz — dorthin die Ausweise mitnehmen, auch für die Kinder.',
          link: 'Im Reiseführer ansehen →' },
      ],
      arrive: [
        { k: 'Prag', v: 'rund 2 Stunden mit dem Auto' },
        { k: 'Breslau (PL)', v: 'rund 2 Stunden mit dem Auto' },
        { k: 'Dresden', v: 'rund 3 Stunden mit dem Auto' },
        { k: 'Mit der Bahn', v: 'Bahnhof Svoboda nad Úpou, zu Fuß zum Haus' },
        { k: 'Mit dem Bus', v: 'Haltestelle im Ort, zu Fuß zum Haus' },
        { k: 'Skibus', v: 'Haltestelle 200 m vom Tor, kostenlos' },
        { k: 'Parken', v: 'direkt auf dem Grundstück, hinter dem Tor' },
      ],
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
        { name: 'Gemeinschaftsraum', desc: 'Ein großer gemeinsamer Raum mit Sofa für die ganze Gruppe, massivem Holzbalken und Essecke — das Herz des Hauses.' },
        { name: 'Küche & Essbereich', desc: 'Eine voll ausgestattete Küche mit großem Tisch für Frühstück und Abendessen der ganzen Gruppe.' },
        { name: 'Sauna & Ruhe', desc: 'Eine finnische Sauna mit Glastür und Ruhebank daneben — privat, nur für eure Gruppe.' },
        { name: 'In der Sauna', desc: 'Im Inneren der geheizten Sauna — warmes Holz und Ruhe nach einem Tag in den Bergen.' },
        { name: 'Schlafzimmer – Zimmer 4', desc: 'Eines der Schlafzimmer mit Steinwand hinter dem Kopfteil — bequemes Schlafen für die ganze Runde.' },
        { name: 'Überdachter Pool', desc: 'Ein beheizter Pool unter Überdachung — hier badet ihr selbst mitten im Winter.' },
        { name: 'Pergola', desc: 'Eine massive Holzpergola mit Sitzplätzen für die ganze Gruppe — Abende finden hier statt, auch wenn Schnee liegt.' },
        { name: 'Wintergrundstück', desc: 'Ein weitläufiges verschneites Grundstück, nur für euch — vom Haus zum Pool, zum Spielplatz und weiter.' },
        { name: 'Schlafzimmer – Zimmer 3', desc: 'Ein Schlafzimmer mit markanter grafischer Tapete hinter dem beleuchteten Kopfteil — bis zu vier Betten.' },
        { name: 'Schlafzimmer – Zimmer 2', desc: 'Ein Eckschlafzimmer mit zwei Fenstern und getönter Tapete hinter dem Kopfteil — bis zu vier Betten.' },
        { name: 'Bad – Zimmer 4', desc: 'Das Bad von Zimmer 4 — abgerundete Eckdusche, Waschbecken und WC.' },
        { name: 'Bad – Zimmer 3', desc: 'Das Bad von Zimmer 3 — abgerundete Eckdusche, Waschbecken und WC.' },
        { name: 'Bad – Zimmer 2', desc: 'Das Bad von Zimmer 2 — abgerundete Eckdusche, Waschbecken und WC.' },
      ],
      scenesSummer: [
        { name: 'Ankunft an der Villa', desc: 'Der Stellplatz hinter dem Tor, auf dem die ganze Gruppe parkt, und das Haus am Ende der Zufahrt zwischen hohen Bäumen.' },
        { name: 'Garten mit Spielplatz', desc: 'Hängebrücke, Klettergerüst und eine kleine Kletterwand in Sichtweite des Hauses — die Kinder haben ihre eigene Ecke auf dem Grundstück.' },
        { name: 'Pool am Haus', desc: 'Der überdachte beheizte Pool mit seiner Liegenreihe direkt am Haus, ringsum die eigene Wiese.' },
        { name: 'Wiese mit Schaukel und Tischtennis', desc: 'Der obere Teil des Grundstücks: Schaukel mit Rutsche, Tischtennisplatte und Platz zum Herumtoben.' },
        { name: 'Holzterrasse mit Sitzplatz', desc: 'Eine Eichenterrasse über der Gabionenwand — ein Tisch für die ganze Gruppe, Blick auf Pergola und Berge.' },
        { name: 'Pergola und Feuerstelle', desc: 'Die Mitte des Grundstücks: links die überdachte Pergola mit Grill, rechts die abgesenkte Feuerstelle mit Gabionenwand.' },
        { name: 'In der Pergola', desc: 'Unter massivem Holzdach: der lange Tisch, ein gemauerter Grilltresen und offene Seiten zum Garten.' },
        { name: 'Terrasse am Abend', desc: 'Nach Einbruch der Dunkelheit leuchten Gabionen und Stufen von selbst — Sessel an der Feuerstelle, dahinter der beleuchtete Pool.' },
      ],
    },
    gallery: { eyebrow: 'Galerie', title: 'Haus, Grundstück, Umgebung', note: 'Klicken zum Vergrößern', all: 'Alle', leto: 'Sommer', zima: 'Winter', vecer: 'Abend', interier: 'Innen' },
    vylety: {
      eyebrow: 'Ausflüge', title: 'Die Berge beginnen vor der Tür', note: 'Tipps je nach Saison.', drop: 'Hier kommt ein Ausflugsfoto', cta: 'Ausflugstipps ansehen',
      items: [
        { tag: 'Ganzjährig', name: 'Schneekoppe', desc: 'Der höchste Gipfel Tschechiens — zu Fuß über die Kämme oder mit der Seilbahn ab Pec pod Sněžkou.' },
        { tag: 'Sommer', name: 'Kammwege & Wasserfälle', desc: 'Markierte Routen von leichten Runden bis zu Tagestouren. Der Mumlava-Wasserfall klappt auch mit Kindern.' },
        { tag: 'Winter', name: 'Skifahren in der Nähe', desc: 'Skigebiet Černá hora nur 4 km entfernt, mit einem Skiraum im Haus für die Ausrüstung.' },
        { tag: 'Mit Kindern', name: 'Rodelbahnen & Pfade', desc: 'Sommerrodelbahnen, Seilparks und ein Baumwipfelpfad in bequemer Fahrdistanz.' },
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
    recenze: {
      eyebrow: 'Bewertungen', title: 'Was Gäste sagen', note: 'Echte Bewertungen von Airbnb, Booking.com und Google.',
    },
    video: { eyebrow: 'Video', title: 'Sehen Sie die Villa im Video', summer: 'Haus, Garten, Pool & Anreise', winter: 'Hausführung, Sauna & Skibus', play: 'Video abspielen' },
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
    footer: { tagline: 'Ein privates Berganwesen für große Gruppen im Herzen des Riesengebirges.', langLabel: 'Sprache', contact: 'Kontakt', rights: '© 2026 Villa Rudolf', social: 'Folgt uns', host: 'Pavel — euer Gastgeber', region: 'Riesengebirge, Tschechien', terms: 'Buchungsbedingungen & Datenschutz', guide: 'Ausflugsführer' },
    prebook: {
      title: 'Was Sie vor der Buchung wissen sollten', link: 'Alle Praxis-Infos →',
      facts: [
        { k: 'Kapazität', v: '6–22 Gäste in 7 Schlafzimmern' },
        { k: 'Privatsphäre', v: 'Ganzes Haus und Grundstück, nur Ihre Gruppe' },
        { k: 'Check-in / -out', v: 'Check-in ab 15:00 · Check-out bis 10:00' },
        { k: 'Haustiere', v: 'Hunde gegen Gebühr willkommen' },
        { k: 'Parken', v: 'Kostenlos direkt auf dem Grundstück hinter dem Tor' },
        { k: 'Skifahren', v: 'Pisten Černá hora 4 km · Skibus gratis 200 m' },
      ],
    },
  },

  pl: {
    photoSoon: 'Zdjęcie wkrótce',
    meta: {
      title: 'Villa Rudolf – cała górska rezydencja tylko dla was | Karkonosze',
      desc: 'Villa Rudolf – prywatna górska rezydencja w Karkonoszach. Cały dom i posesja dla grupy 6–22 osób: kryty basen, sauna, pergola, palenisko. Lato i zima. Zarezerwuj cały dom.',
      locale: 'pl_PL',
    },
    nav: { dum: 'Dom', interier: 'Wnętrze', vybaveni: 'Udogodnienia', galerie: 'Galeria', recenze: 'Recenzje', ohniste: 'Palenisko', sezony: 'Sezony', lokalita: 'Lokalizacja', vylety: 'Wycieczki', info: 'Informacje praktyczne', cta: 'Zarezerwuj termin' },
    hero: {
      eyebrow: 'Cały dom tylko dla waszej grupy · Karkonosze',
      eyebrowWinter: 'Narty tuż za rogiem · Karkonosze',
      h1: 'Prywatna willa w Karkonoszach dla 6–22 gości',
      sub: 'Całe to miejsce — dom i rozległa posesja — jest <em>tylko wasze</em>.',
      subWinter: 'Narty tuż za rogiem — <em>skibus przy domu</em>, Černá hora 4 km.',
      ctaSec: 'Zobacz dom', badge: 'Wolne terminy 2026', video: 'Odtwórz wideo',
      summer: 'Lato', winter: 'Zima',
      nightLine: 'Zapadła noc. Palenisko, ściana gabionowa i basen zapaliły się same — wieczór dopiero się zaczyna.',
    },
    ratings: { eyebrow: 'Oceny gości', reviewsWord: 'recenzji', verified: 'zweryfikowano', teaserMore: 'Przeczytaj recenzje' },
    direct: {
      badge: '<b>Rezerwacja bezpośrednia = najlepsza cena.</b> O 5% taniej niż na platformach. Osobiste podejście i uczciwe warunki anulacji.',
      book: '<b>Rezerwacja bezpośrednia = najlepsza cena.</b> O 5% taniej niż na platformach. Osobiste podejście i uczciwe warunki anulacji.',
      sidebar: 'Rezerwacja bezpośrednia — o 5% taniej niż na platformach.',
    },
    statement: {
      eyebrow: 'Cały teren tylko dla was',
      title: 'Za bramą jesteście tylko wy.',
      lead: 'Nie rezerwujecie pokoi w domu, w którym mieszka jeszcze ktoś inny. Bierzecie całą posesję — dom, 4500 m² ogrodzonego parku, basen, saunę, pergolę i palenisko. <span class="vr-sm-hide">Żadnej recepcji, żadnych obcych przy śniadaniu, żadnego czekania, aż zwolni się sauna.</span>',
      stats: [
        { num: '4500 m²', label: 'ogrodzonego parku tylko dla waszej grupy' },
        { num: '22 łóżka', label: 'w siedmiu sypialniach — i jeden stół dla całej ekipy' },
        { num: '1 grupa', label: 'na terenie jest zawsze tylko jedna, nigdy dwie naraz' },
        { num: '0', label: 'przestrzeni dzielonych z obcymi' },
      ],
    },
    band: { eyebrow: 'Jeden wieczór tutaj' },
    amenities: {
      eyebrow: 'Udogodnienia', title: 'Komfort, który trzyma grupę razem', drop: 'Przeciągnij tu zdjęcie',
      summer: {
        hero: { tag: 'Wellness', name: 'Zadaszony podgrzewany basen', desc: 'Kryty basen z podgrzewaną wodą — czynny w każdą pogodę, od letniego popołudnia po mroźny zimowy wieczór. Prosto z wody do sauny.' },
        cards: [
          { tag: 'Wellness', name: 'Prywatna sauna', desc: 'Fińska sauna tylko dla waszej grupy. Bez dzielenia, bez okienek czasowych.' },
          { tag: 'Życie na zewnątrz', name: 'Duża pergola', desc: 'Zadaszone miejsce dla całej grupy naraz. Wspólne kolacje na świeżym powietrzu, nawet w deszcz.' },
          { tag: 'Dla rodzin', name: 'Plac zabaw', desc: 'Drabinki, mała ścianka wspinaczkowa i ścianka linowa. Dzieci mają własną przestrzeń w zasięgu wzroku od pergoli.' },
        ],
      },
      winter: {
        hero: { tag: 'Narty', name: 'Narty tuż za rogiem', desc: 'Ośrodek narciarski Černá hora zaledwie 4 km. Darmowy skibus zatrzymuje się przy samym domu — pod wyciągi bez auta i szukania parkingu. W domu dodatkowo narciarnia na sprzęt.' },
        cards: [
          { tag: 'Wellness', name: 'Po nartach do sauny', desc: 'Fińska sauna tylko dla waszej grupy — idealna po dniu na stoku. Bez dzielenia, bez okienek czasowych.' },
          { tag: 'Życie na zewnątrz', name: 'Zimowe wieczory przy ognisku', desc: 'Nowo ukończone palenisko ze ścianą gabionową po zmroku samo się podświetla — ciepło pod gołym niebem, nawet przy mrozie.' },
          { tag: 'Wellness', name: 'Kryty basen nawet w mróz', desc: 'Podgrzewany basen pod dachem — pływacie nawet w środku zimy, gdy na zewnątrz leży śnieg.' },
        ],
      },
      extraTitle: 'A do tego przez cały rok',
      extra: [
        { name: 'Kuchnia i stół dla całej grupy', desc: 'W pełni wyposażona kuchnia i duży drewniany stół, przy którym siądziecie wszyscy naraz.' },
        { name: 'Salon na poddaszu', desc: 'Długa sofa pod starą belką i duży stół przy oknie — miejsce na wieczory w środku.' },
        { name: 'Bilard', desc: 'Stół bilardowy w apartamencie Suite — na deszczowe popołudnie albo turniej po kolacji.' },
        { name: 'Narciarnia', desc: 'Osobne pomieszczenie tylko na narty i buty — stojaki na sprzęt i zmywalna podłoga. Nic nie wędruje do pokoi.' },
      ],
    },
    bedrooms: {
      eyebrow: 'Sypialnie i łóżka',
      title: 'Gdzie będziecie spać',
      note: '7 sypialni i 22 miejsca do spania — wygodny sen dla całej grupy i dla rodzin.',
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
      open360: 'Zobacz w 360°',
      rosterTitle: 'Rozkład łóżek',
      items: { kitchen: 'Kuchnia i jadalnia', lounge: 'Salon na poddaszu', suite: 'Apartament Suite', room1: 'Pokój 1', room2: 'Pokój 2', room3: 'Pokój 3', room4: 'Pokój 4', sauna: 'Sauna fińska', wellness: 'Wellness i prysznic', bath: 'Łazienka z prysznicem', bath2: 'Łazienka – Pokój 2', bath3: 'Łazienka – Pokój 3', bath4: 'Łazienka – Pokój 4' },
    },
    ohniste: {
      eyebrow: 'Nowy element', caption: 'Detal paleniska i ściany gabionowej',
      title: 'Palenisko ze ścianą gabionową, które ożywa nocą',
      body: 'Nowo ukończone otwarte palenisko pomieści całą grupę. Masywna ściana gabionowa tworzy z nim jedną całość i po zmroku podświetla się automatycznie — światła same się zapalają i gasną. Centrum wieczorów pod gołym niebem.',
    },
    skupina: {
      eyebrow: 'Wasza grupa, niezależnie od wielkości',
      big: 'Sześciu kolegów na motocyklach albo zjazd dwudziestu dwóch. Miejsce zawsze pomieści całą ekipę.',
      desc: 'Nie chodzi o liczbę. Wygodnie śpi tu do 22 osób, ale rodzina, grono przyjaciół czy mniejsza grupa zmieszczą się równie dobrze — cały dom i posesja są zawsze tylko wasze.',
    },
    sezony: {
      eyebrow: 'Lato vs. Zima', title: 'Co czeka w każdym sezonie', note: 'Przełącz sezon u góry, a cała strona się zmieni.',
      summer: { tag: 'Lato', title: 'Długie wieczory na zewnątrz', desc: 'Basen, pergola, palenisko i duża posesja dla dzieci i dorosłych. Wędrówki i wycieczki prosto z domu.',
        list: ['Podgrzewany basen, sauna i pergola', 'Palenisko i długie wieczory na posesji', 'Wędrówki i wycieczki prosto z domu'] },
      winter: { tag: 'Zima', title: 'Narty bez kłopotów', desc: 'Ośrodek Černá hora zaledwie 4 km, narciarnia na sprzęt w domu i podgrzewany kryty basen z sauną na rozgrzewkę po dniu na stoku.',
        list: ['Ośrodek Černá hora 4 km, darmowy skibus 200 m', 'Podgrzewany kryty basen i sauna', 'Narciarnia na sprzęt'] },
    },
    lokalita: {
      eyebrow: 'Lokalizacja · Svoboda nad Úpou',
      title: 'W górach, a nie na końcu świata.',
      lead: 'Stoimy w Svobodzie nad Úpou, 150 metrów od centrum — sklep, restauracja, pociąg i autobus są w zasięgu spaceru. Śnieżka jest stąd dwadzieścia minut samochodem. A z Pragi i z Wrocławia dojedziecie tu w mniej więcej dwie godziny.',
      leadWinter: 'Darmowy skibus do SkiResortu Černá hora–Pec zatrzymuje się 200 metrów od bramy — pod wyciągi dostaniecie się bez auta i bez szukania parkingu. Samochód może potem stać cały tydzień na terenie posesji.',
      doorstep: [
        { num: '150 m', label: 'do centrum Svobody — jakieś dwie minuty pieszo' },
        { num: '200 m', label: 'do przystanku skibusu — niecałe trzy minuty pieszo' },
        { num: '2 h', label: 'mniej więcej z Pragi i z Wrocławia, trzy z Drezna' },
        { num: '4 km', label: 'na stoki Černej hory — skibus jeździ za darmo' },
      ],
      mapTitle: ['{n} sprawdzona wycieczka w trzech kręgach', '{n} sprawdzone wycieczki w trzech kręgach', '{n} sprawdzonych wycieczek w trzech kręgach'],
      mapNote: 'Odległości na mapie są prawdziwe, teren jest rysowany. Krąg wokół willi ma promień trzech kilometrów w linii prostej.',
      legend: '◆ Villa Rudolf · ○ dokąd dojdziecie pieszo · ┄ granica z Polską · czasy i odległości liczone drogą',
      mapAlt: 'Rysowana mapa okolicy: Villa Rudolf w Svobodzie nad Úpou, Śnieżka, Janské Lázně, Pec pod Sněžkou, Trutnov i granica z Polską.',
      rings: [
        { name: 'Pieszo od bramy', count: ['{n} cel', '{n} cele', '{n} celów'],
          body: 'Janské Lázně i Ścieżka w koronach drzew, kryty basen Aquacentrum, trekking z lamami na rodzinnej farmie, farmapark Muchomůrka, bajkowa ekspozycja Do Krakonošova, adventure minigolf i strzelnica. Do żadnego z nich nie potrzebujecie auta.',
          link: 'Zobacz w przewodniku →' },
        { name: 'Do 30 minut samochodem', count: ['{n} cel', '{n} cele', '{n} celów'],
          body: 'Śnieżka kolejką lub pieszo, Černá hora gondolą, Obří důl nawet z wózkiem, tor saneczkowy w Pecu, wieże widokowe, bukowa puszcza Rýchory, kąpielisko i ścianka wspinaczkowa w Trutnovie.',
          link: 'Zobacz w przewodniku →' },
        { name: 'Na cały dzień', count: ['{n} cel', '{n} cele', '{n} celów'],
          body: 'Adršpašské skały, Safari Park Dvůr Králové, huta szkła Harrachov z wodospadami Mumlavy i aquapark Tropikana w Karpaczu — tam weźcie dokumenty także dla dzieci.',
          link: 'Zobacz w przewodniku →' },
      ],
      arrive: [
        { k: 'Praga', v: 'około 2 godziny samochodem' },
        { k: 'Wrocław', v: 'około 2 godziny samochodem' },
        { k: 'Drezno', v: 'około 3 godziny samochodem' },
        { k: 'Pociągiem', v: 'stacja Svoboda nad Úpou, do domu pieszo' },
        { k: 'Autobusem', v: 'przystanek w miasteczku, do domu pieszo' },
        { k: 'Skibus', v: 'przystanek 200 m od bramy, za darmo' },
        { k: 'Parking', v: 'na terenie posesji, za bramą' },
      ],
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
        { name: 'Sala wspólna', desc: 'Duża wspólna przestrzeń z sofą dla całej ekipy, masywną drewnianą belką i kącikiem jadalnym — serce domu.' },
        { name: 'Kuchnia i jadalnia', desc: 'W pełni wyposażona kuchnia z dużym stołem na wspólne śniadania i kolacje całej grupy.' },
        { name: 'Sauna i relaks', desc: 'Fińska sauna ze szklanymi drzwiami i ławką do relaksu obok — prywatnie, tylko dla waszej grupy.' },
        { name: 'We wnętrzu sauny', desc: 'W środku nagrzanej sauny — ciepłe drewno i spokój po dniu w górach.' },
        { name: 'Sypialnia – Pokój 4', desc: 'Jedna z sypialni z kamienną ścianą za zagłówkiem — wygodny sen dla całej ekipy.' },
        { name: 'Zadaszony basen', desc: 'Podgrzewany basen pod zadaszeniem — kąpiel nawet w środku zimy.' },
        { name: 'Pergola', desc: 'Masywna drewniana pergola z miejscem dla całej grupy — wieczory trwają tu nawet przy śniegu.' },
        { name: 'Zimowa posesja', desc: 'Rozległa zaśnieżona posesja tylko dla was — od domu po basen, plac zabaw i dalej.' },
        { name: 'Sypialnia – Pokój 3', desc: 'Sypialnia z wyrazistą graficzną tapetą za podświetlanym zagłówkiem — do czterech łóżek.' },
        { name: 'Sypialnia – Pokój 2', desc: 'Narożna sypialnia z dwoma oknami i stonowaną tapetą za zagłówkiem — do czterech łóżek.' },
        { name: 'Łazienka – Pokój 4', desc: 'Łazienka Pokoju 4 — zaokrąglona kabina prysznicowa, umywalka i toaleta.' },
        { name: 'Łazienka – Pokój 3', desc: 'Łazienka Pokoju 3 — zaokrąglona kabina prysznicowa, umywalka i toaleta.' },
        { name: 'Łazienka – Pokój 2', desc: 'Łazienka Pokoju 2 — zaokrąglona kabina prysznicowa, umywalka i toaleta.' },
      ],
      scenesSummer: [
        { name: 'Podjazd do willi', desc: 'Plac za bramą, na którym zaparkuje cała grupa, i dom na końcu podjazdu wśród wysokich drzew.' },
        { name: 'Ogród z placem zabaw', desc: 'Most linowy, drabinki i mała ścianka wspinaczkowa w zasięgu wzroku od domu — dzieci mają swój kąt na posesji.' },
        { name: 'Basen przy willi', desc: 'Zadaszony podgrzewany basen z rzędem leżaków tuż przy domu, dookoła własny trawnik.' },
        { name: 'Łąka z huśtawką i ping-pongiem', desc: 'Górna część posesji: huśtawka ze zjeżdżalnią, stół do ping-ponga i miejsce do biegania.' },
        { name: 'Drewniany taras z siedziskami', desc: 'Dębowy taras nad ścianą gabionową — stół dla całej ekipy i widok na pergolę oraz góry.' },
        { name: 'Pergola i palenisko', desc: 'Środek posesji: po lewej zadaszona pergola z grillem, po prawej wpuszczone palenisko ze ścianą gabionową.' },
        { name: 'We wnętrzu pergoli', desc: 'Pod masywną drewnianą więźbą: długi stół, murowany blat grillowy i otwarte boki na ogród.' },
        { name: 'Wieczorny taras', desc: 'Po zmroku gabiony i schody podświetlają się same — fotele przy palenisku, w tle rozświetlony basen.' },
      ],
    },
    gallery: { eyebrow: 'Galeria', title: 'Dom, posesja, okolica', note: 'Kliknij, by powiększyć', all: 'Wszystko', leto: 'Lato', zima: 'Zima', vecer: 'Wieczór', interier: 'Wnętrze' },
    vylety: {
      eyebrow: 'Wycieczki', title: 'Góry zaczynają się za drzwiami', note: 'Wskazówki zmieniamy według sezonu.', drop: 'Tu trafi zdjęcie z wycieczki', cta: 'Zobacz propozycje wycieczek',
      items: [
        { tag: 'Cały rok', name: 'Śnieżka', desc: 'Najwyższy szczyt Czech — pieszo graniami albo kolejką z Pecu pod Śnieżką.' },
        { tag: 'Lato', name: 'Szlaki grzbietowe i wodospady', desc: 'Znakowane trasy od spokojnych pętli po całodniowe przejścia. Wodospad Mumlawy da się przejść z dziećmi.' },
        { tag: 'Zima', name: 'Narty w okolicy', desc: 'Ośrodek Černá hora zaledwie 4 km od domu, z narciarnią w domu na sprzęt.' },
        { tag: 'Z dziećmi', name: 'Tory saneczkowe i ścieżki', desc: 'Letnie tory bobslejowe, parki linowe i ścieżka w koronach drzew w łatwym dojeździe.' },
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
    recenze: {
      eyebrow: 'Recenzje', title: 'Co mówią goście', note: 'Prawdziwe recenzje z Airbnb, Booking.com i Google.',
    },
    video: { eyebrow: 'Wideo', title: 'Zobacz willę na wideo', summer: 'Dom, ogród, basen i przyjazd', winter: 'Zwiedzanie domu, sauna i skibus', play: 'Odtwórz wideo' },
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
    footer: { tagline: 'Prywatna górska rezydencja dla dużych grup w sercu Karkonoszy.', langLabel: 'Język', contact: 'Kontakt', rights: '© 2026 Villa Rudolf', social: 'Obserwuj nas', host: 'Pavel — wasz gospodarz', region: 'Karkonosze, Czechy', terms: 'Warunki pobytu i prywatność', guide: 'Przewodnik po wycieczkach' },
    prebook: {
      title: 'Co warto wiedzieć przed rezerwacją', link: 'Wszystkie informacje praktyczne →',
      facts: [
        { k: 'Pojemność', v: '6–22 gości w 7 sypialniach' },
        { k: 'Prywatność', v: 'Cały dom i teren tylko dla Waszej grupy' },
        { k: 'Zameldowanie / wym.', v: 'Zameldowanie od 15:00 · wymeldowanie do 10:00' },
        { k: 'Zwierzęta', v: 'Psy mile widziane za opłatą' },
        { k: 'Parking', v: 'Za darmo na terenie, za bramą' },
        { k: 'Narty', v: 'Stoki Czarna Góra 4 km · skibus gratis 200 m' },
      ],
    },
  },
};

/* ============================ State + helpers ============================ */
const state = { lang: 'cs', season: 'leto', scrolled: false, scene: 0, lb: -1, lbList: [], galFilter: 'all', selStart: 0, selEnd: 0, mob: false, calOffset: 0 };
/* Kalendář: okno 2 měsíců lze posouvat 0 .. CAL_MAX_OFFSET (dnešek .. +18 měsíců). */
const CAL_MAX_OFFSET = 17;
/* Ceny řídí VR_PRICING (nahoře v souboru). */
const CONTACT_EMAIL = 'pavel.kubiznak@gmail.com';
/* 360° scény jsou SEZÓNNÍ. Zima = původní sada (interiéry + zasněžený pozemek),
   léto = letní panoramata z Insta360 (celý pozemek za letního podvečera).
   Pořadí musí přesně odpovídat T[lang].tour.scenes / tour.scenesSummer. */
const PANO_SETS = {
  zima: ['living', 'kitchen', 'sauna', 'saunahot', 'bed1', 'pool', 'pergola', 'grounds', 'bed2', 'bedr2', 'bath4', 'bath3', 'bath2'],
  leto: ['s_drive', 's_playground', 's_pool', 's_meadow', 's_deck', 's_firepit', 's_pergola', 's_evening'],
};
function panoFiles() { return PANO_SETS[state.season] || PANO_SETS.leto; }
function tourScenes() {
  const t = tt();
  const s = state.season === 'zima' ? t.tour.scenes : (t.tour.scenesSummer || t.tour.scenes);
  return s || [];
}

/* Per-pano horizontal start point (fraction 0–1 across the equirect image; 0.5 =
   image centre). Vision-scored "most attractive view" per scene. Mapped to camera
   yaw in loadPano() so the viewer first faces the described subject. */
const PANO_YAWF = {
  living: 0.76, kitchen: 0.4, sauna: 0.5, saunahot: 0.9, bed1: 0.48, bed2: 0.72, pool: 0.42, pergola: 0.49, grounds: 0.65,
  bedr2: 0.5, bath4: 0.5, bath3: 0.55, bath2: 0.5,
  s_drive: 0.5, s_playground: 0.72, s_pool: 0.32, s_meadow: 0.62, s_deck: 0.12, s_firepit: 0.55, s_pergola: 0.5, s_evening: 0.25,
};

/* Gallery: curated real photos. c = filter category (leto/zima/vecer/interier).
   Order below is the "Vše" order (greatest-hits interleave). Files live at
   media/gallery/{slug}.jpg (1600px) and media/gallery/t/{slug}.jpg (640px thumb). */
const GALLERY = [
  { s: '01-house-summer', c: 'leto', alt: 'Villa Rudolf z rozlehlé zahrady — hrázděný štít, veranda a terasa' },
  { s: '09-estate-blue-hour', c: 'vecer', alt: 'Celý pozemek z patra za modré hodiny — bazén, ohniště, pergola a stodola' },
  { s: '10-winter-night-framed', c: 'zima', alt: 'Vila v noci rámovaná zasněženými větvemi, teplé světlo na sněhu' },
  { s: '17-pool-hall-interior', c: 'interier', alt: 'Zastřešený bazén — symetrický pohled prosklenou halou' },
  { s: '03-pool-hall-exterior', c: 'leto', alt: 'Prosklená hala bazénu zvenčí a řada lehátek na trávníku' },
  { s: '08-firepit-night', c: 'vecer', alt: 'Ohniště v noci — kruh křesílek a gabiony prosvětlené LED' },
  { s: '11-winter-day', c: 'zima', alt: 'Villa Rudolf v plném zimním slunci pod zasněženými stromy' },
  { s: '14-table-for-ten', c: 'interier', alt: 'Dlouhý jídelní stůl pro deset s károvaným ubrusem' },
  { s: '02-playground-house', c: 'leto', alt: 'Dům z boku s lanovým mostem a prolézačkou dětského hřiště' },
  { s: '06-pergola-night', c: 'vecer', alt: 'Pergola v noci — nasvícený vnitřek svítí teple do tmy' },
  { s: '12-winter-garden', c: 'zima', alt: 'Pohled přes zasněženou zahradu na vilu mezi vysokými smrky' },
  { s: '18-sauna-inside', c: 'interier', alt: 'Uvnitř finské sauny — lavice ze světlého dřeva a kamna' },
  { s: '07-gabion-pool-day', c: 'leto', alt: 'Gabionová opěrná zeď, trávník a zastřešený bazén ve dne' },
  { s: '05-pergola-autumn', c: 'leto', alt: 'Pergola z boku na podzim proti žluto-oranžovému listí' },
  { s: '13-frozen-apples', c: 'zima', alt: 'Jabloň se zmrzlými jablky ve sněhu v protisvětle' },
  { s: '16-dining-room', c: 'interier', alt: 'Jídelna s kuchyňskou linkou a dubovým stolem pro osm' },
  { s: '04-terrace-loungers', c: 'leto', alt: 'Terasa u bazénu s perspektivní řadou lehátek' },
  { s: '15-ensuite-bathroom', c: 'interier', alt: 'Koupelna u pokoje — sprchový kout a umyvadlo na dubové skříňce' },
];
const GAL_FILTERS = ['all', 'leto', 'zima', 'vecer', 'interier'];
/* Fotky karet „Kam na výlet" (pořadí = vylety.items). JEN skutečné snímky z repa —
   žádné AI/stažené fotky. Sněžka/hory, letní cesta lesem, lyžování, hřiště pro děti. */
const TRIP_IMAGES = [
  'media/gallery/winter-forest.jpg',
  'media/gallery/summer-drive.jpg',
  'media/gallery/winter-snow.jpg',
  'media/sections/playground.jpg',
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
    if (typeof v === 'string') n.textContent = v;
  });
  $all('[data-t-ph]').forEach((n) => {
    const v = resolve(t, n.getAttribute('data-t-ph'));
    if (typeof v === 'string') n.setAttribute('placeholder', v);
  });
  // trusted, first-party HTML strings (e.g. hero sub with <em> accent)
  $all('[data-t-html]').forEach((n) => {
    const v = resolve(t, n.getAttribute('data-t-html'));
    if (typeof v === 'string') n.innerHTML = v;
  });
  applyVideoAria();
  applyTripCounts();   // {n} v okruzích a v nadpisu mapy (plurály podle jazyka)
  renderArrive();      // blok „Než dorazíte"
  applyLokLead();      // lead sekce Lokalita je sezónní (léto / zima)
  document.documentElement.lang = state.lang;
}

/* ============================ Dynamic list renders ============================ */
/* Rychlá fakta pod heroem. Ověřeno z platform listingu Villa Rudolf — needitovat
   mimo skutečné hodnoty (7 ložnic, 5 koupelen a WC, 22 lůžek = 19+3 přistýlky,
   257 m², krytý bazén a sauna, soukromý pozemek s parkováním). */
function renderFacts() {
  const F = ({
    cs: [
      { k: '7', v: 'ložnic' },
      { k: '5', v: 'koupelen a WC' },
      { k: '22', v: 'lůžek — 19 + 3 přistýlky' },
      { k: '257 m²', v: 'obytná plocha' },
      { k: 'Bazén + sauna', v: 'krytý a vyhřívaný', wide: true },
      { k: 'Vlastní pozemek', v: 's parkováním u domu', wide: true },
    ],
    en: [
      { k: '7', v: 'bedrooms' },
      { k: '5', v: 'bathrooms & WCs' },
      { k: '22', v: 'beds — 19 + 3 extra' },
      { k: '257 m²', v: 'living area' },
      { k: 'Pool + sauna', v: 'covered & heated', wide: true },
      { k: 'Private grounds', v: 'with parking at the house', wide: true },
    ],
    de: [
      { k: '7', v: 'Schlafzimmer' },
      { k: '5', v: 'Bäder & WCs' },
      { k: '22', v: 'Betten — 19 + 3 Zusatz' },
      { k: '257 m²', v: 'Wohnfläche' },
      { k: 'Pool + Sauna', v: 'überdacht & beheizt', wide: true },
      { k: 'Eigenes Grundstück', v: 'mit Parkplatz am Haus', wide: true },
    ],
    pl: [
      { k: '7', v: 'sypialni' },
      { k: '5', v: 'łazienek i WC' },
      { k: '22', v: 'miejsc — 19 + 3 dostawki' },
      { k: '257 m²', v: 'powierzchnia' },
      { k: 'Basen + sauna', v: 'kryty i podgrzewany', wide: true },
      { k: 'Własna posesja', v: 'z parkingiem przy domu', wide: true },
    ],
  })[state.lang] || null;
  const host = $('#vr-facts'); if (!host) return; host.innerHTML = '';
  (F || []).forEach((f) => host.appendChild(el('div', { class: 'vr-fact' + (f.wide ? ' wide' : '') }, [
    el('div', { class: 'vr-fact-k', text: f.k }), el('div', { class: 'vr-fact-v', text: f.v }),
  ])));
}

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

/* Řádek hodnocení (Google / Airbnb / Booking.com) + poznámka „ověřeno …". */
function renderRatings() {
  const t = tt();
  const host = $('#vr-ratings'); if (!host) return; host.innerHTML = '';
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
function renderReviews() {
  const host = $('#vr-reviews'); if (!host) return; host.innerHTML = '';
  VR_REVIEWS.items.forEach((r) => {
    const p = platformByKey(r.platform);
    const fig = el('figure', { class: 'vr-review' }, [
      el('blockquote', { class: 'vr-review-q', text: reviewText(r) }),
      el('figcaption', { class: 'vr-review-cap' }, [
        el('span', { class: 'vr-review-author', text: r.author }),
        el('a', { class: 'vr-review-badge', href: p.url || '#', target: '_blank', rel: 'noopener noreferrer',
          'aria-label': (p.name || r.platform) + ' — ' + (r.author) }, [
          el('span', { text: p.name || r.platform }),
          el('span', { class: 'vr-rating-arrow', 'aria-hidden': 'true', text: '↗' }),
        ]),
      ]),
    ]);
    host.appendChild(fig);
  });
}

/* ---------- Video: click-to-play FULLSCREEN lightbox (cookie-free až do otevření) ----------
   Po kliknutí na náhled se karta plynule (FLIP transform, bez knihoven) zvětší přes
   celý viewport na tmavém podkladu (rgba(0,0,0,.85)); teprve v otevřeném stavu vložíme
   iframe youtube-nocookie.com s autoplay=1. Zavření: křížek, Esc i klik mimo video —
   s plynulým zmenšením zpět do karty. Na mobilu vyplní obrazovku (16:9 letterbox). */
let vlbThumb = null, vlbAnim = false;
function vlbReduced() { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
function vlbInsertFrame(id, label) {
  const frameHost = $('#vr-vlb-frame'); if (!frameHost) return;
  frameHost.appendChild(el('iframe', {
    src: 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0&modestbranding=1',
    title: label || 'Villa Rudolf',
    allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture',
    allowfullscreen: '', frameborder: '0',
  }));
}
function openVideoLightbox(btn) {
  const id = btn.getAttribute('data-yt'); if (!id) return;
  const lb = $('#vr-vlb'), stage = $('#vr-vlb-stage'), frameHost = $('#vr-vlb-frame'), poster = $('#vr-vlb-poster');
  if (!lb || !stage || lb.getAttribute('aria-hidden') === 'false') return;
  const wrap = btn.closest('.vr-vid');
  const label = wrap && wrap.querySelector('.vr-vid-label');
  const labelTxt = (label && label.textContent) || 'Villa Rudolf';
  // Náhled pro FLIP animaci: buď <img>, nebo poster živé smyčky.
  const img = btn.querySelector('img'), loop = btn.querySelector('.vr-vid-loop');
  vlbThumb = btn;
  if (poster) {
    if (img) poster.src = img.currentSrc || img.src;
    else if (loop && loop.poster) poster.src = loop.poster;
  }
  frameHost.innerHTML = '';
  // Open state is set synchronously (backdrop + close visible immediately). The
  // FLIP grow is a progressive enhancement; the iframe is inserted via an
  // independent timer so playback never depends on the animation.
  const from = btn.getBoundingClientRect();
  lb.style.display = 'flex'; lb.setAttribute('aria-hidden', 'false'); lb.setAttribute('data-open', 'true');
  document.body.style.overflow = 'hidden';
  vlbFocusClose();
  const to = stage.getBoundingClientRect();
  if (!vlbReduced() && to.width && from.width) {
    const dx = from.left - to.left, dy = from.top - to.top;
    const sx = from.width / to.width, sy = from.height / to.height;
    stage.style.transition = 'none';
    stage.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')';
    void stage.offsetWidth; // reflow before animating to identity
    const settle = () => { stage.style.transition = 'transform .34s cubic-bezier(.2,.7,.15,1)'; stage.style.transform = 'none'; };
    requestAnimationFrame(settle);
    setTimeout(settle, 60); // fallback if rAF is throttled
  } else {
    stage.style.transition = 'none'; stage.style.transform = 'none';
  }
  setTimeout(() => vlbInsertFrame(id, labelTxt), vlbReduced() ? 0 : 340);
}
function vlbFocusClose() { const c = $('#vr-vlb-close'); if (c) { try { c.focus(); } catch (e) {} } }
function closeVideoLightbox() {
  const lb = $('#vr-vlb'), stage = $('#vr-vlb-stage'), frameHost = $('#vr-vlb-frame');
  if (!lb || lb.getAttribute('aria-hidden') === 'true') return;
  if (frameHost) frameHost.innerHTML = ''; // stop playback now; poster shows underneath during shrink
  const finish = () => {
    lb.style.display = 'none'; lb.setAttribute('aria-hidden', 'true'); lb.removeAttribute('data-open');
    stage.style.transition = 'none'; stage.style.transform = 'none';
    document.body.style.overflow = '';
    if (vlbThumb) { try { vlbThumb.focus(); } catch (e) {} }
    vlbThumb = null; vlbAnim = false;
  };
  lb.setAttribute('data-open', 'false');
  const from = vlbThumb && vlbThumb.getBoundingClientRect();
  const to = stage.getBoundingClientRect();
  if (vlbReduced() || !from || !from.width || !to.width) { finish(); return; }
  const dx = from.left - to.left, dy = from.top - to.top;
  const sx = from.width / to.width, sy = from.height / to.height;
  vlbAnim = true;
  stage.style.transition = 'transform .3s cubic-bezier(.4,0,.2,1)';
  stage.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')';
  const done = (e) => {
    if (e && e.propertyName && e.propertyName !== 'transform') return;
    stage.removeEventListener('transitionend', done); finish();
  };
  stage.addEventListener('transitionend', done);
  setTimeout(done, 380);
}
/* ---------- Živá video-tapeta v kartách videa ----------
   Ztlumená, zpomalená smyčka místo statického náhledu. Zdroj se nahrává až
   když je karta ve viewportu; mimo viewport se přehrávání pozastaví. Vůbec se
   nepřehrává při prefers-reduced-motion, při zapnutém spořiči dat a na úzkých
   obrazovkách (<640px) — tam zůstane jen poster (mobilní data).
   Klik na kartu dál otevírá fullscreen lightbox s plným videem a zvukem. */
function loopsAllowed() {
  try {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    if (window.innerWidth && window.innerWidth < 640) return false;
    const c = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    if (c && (c.saveData === true || /(^|-)2g$/.test(c.effectiveType || ''))) return false;
  } catch (e) {}
  return true;
}
function wireVideoLoops() {
  const vids = $all('.vr-vid-loop[data-loop-src]');
  if (!vids.length) return;
  if (!loopsAllowed()) return;                    // jen poster, žádné stahování
  if (!('IntersectionObserver' in window) || !window.innerHeight) return;
  // Majitel: „ať video jede od začátku svého úseku a spustí se teprve, když k němu
  // doskroluješ." Proto se přehrávání spouští až při vstupu do viewportu, VŽDY se
  // převine na currentTime = 0 a jede zpomaleně (0,6×). Při opuštění se pauzuje.
  const startFromZero = (v) => {
    v.playbackRate = 0.6;                          // 60 % rychlost (klidná podkladní smyčka)
    try { v.currentTime = 0; } catch (e) {}        // vždy od začátku klipu
    const p = v.play();
    if (p && p.catch) p.catch(() => {});           // autoplay blokován → zůstane poster
  };
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      const v = en.target;
      if (en.isIntersecting) {
        if (!v.src) { v.src = v.getAttribute('data-loop-src'); v.load(); }
        if (v.readyState >= 1) startFromZero(v);
        else v.addEventListener('loadedmetadata', () => startFromZero(v), { once: true });
      } else if (!v.paused) {
        try { v.pause(); } catch (e) {}
      }
    });
  }, { rootMargin: '0px', threshold: 0.25 });      // spustí se teprve po doscrollování k videu
  vids.forEach((v) => { v.muted = true; io.observe(v); });
}
function wireVideos() {
  $all('.vr-vid-thumb[data-yt]').forEach((btn) => btn.addEventListener('click', () => openVideoLightbox(btn)));
  wireVideoLoops();
  const lb = $('#vr-vlb');
  if (lb && !lb.dataset.wired) {
    lb.dataset.wired = '1';
    lb.addEventListener('click', (e) => { if (!e.target.closest('.vr-vlb-stage')) closeVideoLightbox(); });
    const c = $('#vr-vlb-close'); if (c) c.addEventListener('click', closeVideoLightbox);
    window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && lb.getAttribute('aria-hidden') === 'false') closeVideoLightbox(); });
  }
}
/* Lokalizovaný aria-label „Přehrát video: <popis>" na tlačítkách náhledů. */
function applyVideoAria() {
  const t = tt();
  $all('.vr-vid').forEach((v) => {
    const btn = v.querySelector('.vr-vid-thumb[data-yt]'), label = v.querySelector('.vr-vid-label');
    if (btn && label) btn.setAttribute('aria-label', (t.video && t.video.play ? t.video.play : 'Play') + ': ' + label.textContent);
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
    n.textContent = tpl.replace('{n}', String(num));
  });
}
function renderArrive() {
  const t = tt();
  const host = $('#vr-lok-arrive'); if (!host) return; host.innerHTML = '';
  ((t.lokalita && t.lokalita.arrive) || []).forEach((r) => {
    host.appendChild(el('div', { class: 'vr-lok-arrive-row' }, [
      el('dt', { text: r.k }), el('dd', { text: r.v }),
    ]));
  });
}
function applyLokLead() {
  const t = tt();
  const n = $('#vr-lok-lead'); if (!n || !t.lokalita) return;
  n.textContent = state.season === 'zima' && t.lokalita.leadWinter ? t.lokalita.leadWinter : t.lokalita.lead;
}
/* Živé počty z katalogu průvodce. Selhání je bezbolestné — zůstanou fallback čísla. */
function loadTripCounts() {
  const apply = (c) => {
    if (!c || !c.total) return;
    VR_TRIP_COUNTS.foot = c.foot; VR_TRIP_COUNTS.car = c.car;
    VR_TRIP_COUNTS.day = c.day; VR_TRIP_COUNTS.total = c.total;
    applyTripCounts();
  };
  try {
    const raw = localStorage.getItem(TRIPS_CACHE_KEY);
    if (raw) {
      const c = JSON.parse(raw);
      if (c && Date.now() - c.at < TRIPS_TTL) { apply(c); return; }
    }
  } catch (e) {}
  if (typeof fetch !== 'function') return;
  fetch(TRIPS_URL, { cache: 'no-cache' })
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      const trips = d && (Array.isArray(d) ? d : d.trips);
      if (!Array.isArray(trips) || !trips.length) return;
      const c = { foot: 0, car: 0, day: 0, total: trips.length, at: Date.now() };
      trips.forEach((tr) => {
        if (tr.zone === 'villa') c.foot++;
        else if (tr.zone === 'near') c.car++;
        else if (tr.zone === 'far') c.day++;
      });
      if (!c.foot && !c.car && !c.day) return; // neznámý formát → ponech fallback
      try { localStorage.setItem(TRIPS_CACHE_KEY, JSON.stringify(c)); } catch (e) {}
      apply(c);
    })
    .catch(() => {});
}

/* Vybavení je sezónní. Léto: hero = krytý bazén + sauna / pergola / hřiště.
   Zima: hero = „Lyžování za rohem" + sauna po lyžích / ohniště / krytý bazén.
   Všechny fotky jsou naše skutečné (žádné AI/fake ski fotky) — hero zimy používá
   vr-crossfade obrázek winter-forest.jpg definovaný v HTML. */
function renderAmenities() {
  const t = tt();
  const winter = state.season === 'zima';
  const A = winter ? t.amenities.winter : t.amenities.summer;
  // hero card (léto = bazén, zima = lyžování za rohem)
  $('#am-pool-tag').textContent = A.hero.tag;
  $('#am-pool-name').textContent = A.hero.name;
  $('#am-pool-desc').textContent = A.hero.desc;
  // 3 cards — skutečné fotky podle sezóny
  const imgs = winter
    ? ['media/sections/am-wellness.jpg', 'media/gallery/08-firepit-night.jpg', 'media/gallery/17-pool-hall-interior.jpg']
    : ['media/sections/am-wellness.jpg', 'media/sections/am-pergola-table.jpg', 'media/gallery/02-playground-house.jpg'];
  const host = $('#vr-amen3'); host.innerHTML = '';
  A.cards.forEach((it, i) => {
    const art = el('article');
    const src = imgs[i];
    if (src) art.appendChild(el('img', { src: src, alt: it.name, loading: 'lazy', decoding: 'async', width: '1200', height: '900' }));
    else art.appendChild(slot(t.photoSoon));
    art.appendChild(el('span', { class: 'vr-tag', text: it.tag }));
    art.appendChild(el('h3', { text: it.name }));
    art.appendChild(el('p', { text: it.desc }));
    host.appendChild(art);
  });
  renderAmenityExtras();
}

/* Celoroční vybavení — jeden řádek karet, které nemají sezónní variantu. */
const AMEN_EXTRA_IMAGES = [
  { src: 'media/sections/am-kitchen.jpg', w: 1200, h: 900 },
  { src: 'media/sections/am-lounge.jpg', w: 1600, h: 1000 },
  { src: 'media/sections/am-billiard.jpg', w: 1200, h: 900 },
  { src: 'media/sections/am-skiroom.jpg', w: 1600, h: 1068 },
];
function renderAmenityExtras() {
  const t = tt();
  const host = $('#vr-amen4'); if (!host) return; host.innerHTML = '';
  const list = (t.amenities && t.amenities.extra) || [];
  list.forEach((it, i) => {
    const im = AMEN_EXTRA_IMAGES[i]; if (!im) return;
    host.appendChild(el('article', {}, [
      el('img', { src: im.src, alt: it.name, loading: 'lazy', decoding: 'async', width: String(im.w), height: String(im.h) }),
      el('h3', { text: it.name }),
      el('p', { text: it.desc }),
    ]));
  });
}

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
   pano = index scény v ZIMNÍ 360° sadě (PANO_SETS.zima), kde daný prostor existuje.
   Ložnice/koupelny přiřazené k číslům pokojů ověřeny proti zimním kartám téhož
   náletu (room-2 = tkaná tapeta, room-3 = paví tapeta, room-4 = mramor). Pokoj 1
   a Apartmá nemají v zimní sadě 360° → jen lightbox s fotkou (nikdy „klik a nic"). */
/* gal = MALÁ GALERIE daného pokoje (majitel: „u každého pokoje máme víc fotek,
   které bysme tam mohli dodat"). První položka je vždy fotka z karty. Přiřazeno
   okem proti nasazeným kartám: shodná tapeta, postel, dveře i noční stolek —
   VÝHRADNĚ z lednové sady 2026, generace interiérů se nemíchá.
   Pokoj 2 zůstává s jednou fotkou + vlastní koupelnou: jeho ložnice (rohová se
   třemi okny) je v lednové sadě nafocená jen jednou. */
const INTERIOR = [
  { k: 'kitchen',  img: 'media/sections/int-kitchen.jpg',  pano: 1 },
  { k: 'lounge',   img: 'media/sections/int-lounge.jpg',   pano: 0 },
  { k: 'suite',    img: 'media/sections/room-suite.jpg',
    gal: ['media/sections/room-suite.jpg', 'media/sections/room-suite-b.jpg', 'media/sections/room-suite-c.jpg', 'media/sections/room-suite-d.jpg'] },
  { k: 'room1',    img: 'media/sections/room-1.jpg',
    gal: ['media/sections/room-1.jpg', 'media/sections/room-1b.jpg'] },
  { k: 'room2',    img: 'media/sections/room-2.jpg',       pano: 9,    // bedr2 = ložnice Pokoj 2 (tkaná tapeta, 2 okna)
    gal: ['media/sections/room-2.jpg', 'media/sections/bath-room2.jpg'] },
  { k: 'bath2',    img: 'media/sections/bath-room2.jpg',   pano: 12 },  // koupelna Pokoj 2
  { k: 'room3',    img: 'media/sections/room-3.jpg',       pano: 8,    // bed2 = ložnice Pokoj 3 (paví tapeta)
    gal: ['media/sections/room-3.jpg', 'media/sections/room-3b.jpg', 'media/sections/bath-room3.jpg'] },
  { k: 'bath3',    img: 'media/sections/bath-room3.jpg',   pano: 11 },  // koupelna Pokoj 3
  { k: 'room4',    img: 'media/sections/room-4.jpg',       pano: 4,    // bed1 = ložnice Pokoj 4 (mramor, podkroví)
    gal: ['media/sections/room-4.jpg', 'media/sections/room-4b.jpg', 'media/sections/room-4c.jpg', 'media/sections/bath-room4.jpg'] },
  { k: 'bath4',    img: 'media/sections/bath-room4.jpg',   pano: 10 },  // koupelna Pokoj 4
  { k: 'sauna',    img: 'media/sections/int-sauna.jpg',    pano: 3 },
  { k: 'wellness', img: 'media/sections/int-wellness.jpg', pano: 2 },
  { k: 'bath',     img: 'media/sections/int-bath.jpg' },
];
/* Štítek místnosti přímo NA fotce (karta i lightbox). Majitel: „bylo by dobrý,
   kdyby u každý na každý fotce bylo přímo označení, co to je za pokoj. Asi by to
   stačilo anglicky pro všechny verze." → JEDEN anglický řetězec pro všechny
   jazykové mutace (schváleno majitelem), takže se NEpřekládá přes i18n. */
const ROOM_EN = {
  kitchen: 'Kitchen & dining', lounge: 'Attic lounge', suite: 'Suite',
  room1: 'Room 1', room2: 'Room 2', room3: 'Room 3', room4: 'Room 4',
  bath2: 'Bathroom — Room 2', bath3: 'Bathroom — Room 3', bath4: 'Bathroom — Room 4',
  sauna: 'Sauna', wellness: 'Wellness', bath: 'Bathroom & shower',
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
    el('span', { class: 'vr-car-badge' + (it.pano != null ? ' is360' : ''), 'aria-hidden': 'true', html: it.pano != null ? spinIcon() : zoomIcon() }),
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

function buildRoster(host) {
  if (!host) return;
  const t = tt(); host.innerHTML = '';
  host.appendChild(el('h3', { class: 'vr-roster-title', 'data-t': 'interior.rosterTitle', text: (t.interior && t.interior.rosterTitle) || '' }));
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
   přepneme na zimu, nastavíme scénu, doskrolujeme k prohlídce a načteme pano. */
function openTourScene(idx) {
  if (state.season !== 'zima') setSeason('zima');
  state.scene = idx;
  renderScene(); renderThumbs();
  ensureThree(initPano);
  const jump = () => { if (loadPano) loadPano(idx); };
  jump(); setTimeout(jump, 380);
  const sec = document.getElementById('interier');
  if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderThumbs() {
  const host = $('#vr-thumbs'); if (!host) return; host.innerHTML = '';
  const files = panoFiles();
  tourScenes().forEach((s, i) => {
    const b = el('button', {
      class: 'vrp-thumb', type: 'button', 'data-active': i === state.scene ? 'true' : 'false',
      onclick: () => { panoLastInteract = Date.now(); if (state.scene !== i) { state.scene = i; renderScene(); if (loadPano) loadPano(i); } },
    }, [el('img', { src: 'media/pano/' + files[i] + '_t.jpg', alt: s.name, loading: 'lazy', decoding: 'async', width: '320', height: '160' }), el('span', { text: s.name })]);
    host.appendChild(b);
  });
}

function renderScene() {
  const list = tourScenes();
  const sc = state.scene;
  const s = list[sc] || list[0]; if (!s) return;
  $('#vrp-capname').textContent = s.name;
  $('#vr-scene-name').textContent = s.name;
  $('#vr-scene-desc').textContent = s.desc;
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  $('#vr-scene-idx').textContent = pad(sc + 1);
  $('#vr-scene-count').textContent = pad(panoFiles().length);
  $all('#vr-thumbs .vrp-thumb').forEach((b, i) => b.setAttribute('data-active', i === sc ? 'true' : 'false'));
}

/* Sekce Sezóny je teď „Léto vs. Zima" srovnání — obě karty vždy plně viditelné,
   každá s vlastní sezónní tónovanou linkou a seznamem, co je v ní zahrnuté. */
function renderSeasonsCards() {
  const t = tt();
  const S = t.sezony.summer, W = t.sezony.winter;
  $('#sez-sum-tag').textContent = S.tag;
  $('#sez-sum-title').textContent = S.title;
  $('#sez-sum-desc').textContent = S.desc;
  $('#sez-win-tag').textContent = W.tag;
  $('#sez-win-title').textContent = W.title;
  $('#sez-win-desc').textContent = W.desc;
  const fillList = (id, arr) => {
    const host = $(id); if (!host) return; host.innerHTML = '';
    (arr || []).forEach((li) => host.appendChild(el('li', { text: li })));
  };
  fillList('#sez-sum-list', S.list);
  fillList('#sez-win-list', W.list);
  $('#sez-sum').setAttribute('data-on', 'true');
  $('#sez-win').setAttribute('data-on', 'true');
}


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

/* ============================ Gallery (filterable + lightbox) ============================ */
function galItems() {
  return state.galFilter === 'all' ? GALLERY : GALLERY.filter((g) => g.c === state.galFilter);
}
function renderGalleryChips() {
  const t = tt();
  const host = $('#vr-gal-chips'); if (!host) return;
  host.innerHTML = '';
  GAL_FILTERS.forEach((f) => {
    host.appendChild(el('button', {
      class: 'vr-gal-chip', type: 'button', 'data-filter': f,
      'data-active': state.galFilter === f ? 'true' : 'false',
      'aria-pressed': state.galFilter === f ? 'true' : 'false',
      text: t.gallery[f],
      onclick: () => { if (state.galFilter !== f) { state.galFilter = f; renderGallery(); } },
    }));
  });
}
function renderGallery() {
  renderGalleryChips();
  const host = $('#vr-gal'); if (!host) return;
  const items = galItems();
  host.innerHTML = '';
  const lbList = items.map((g) => ({ src: 'media/gallery/' + g.s + '.jpg' }));
  items.forEach((g, i) => host.appendChild(el('img', {
    src: 'media/gallery/t/' + g.s + '.jpg', alt: g.alt, loading: 'lazy', decoding: 'async',
    width: '600', height: '600',
    onclick: () => lbOpen(lbList, i),
  })));
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
function applySeasonButtons() {
  $all('.vr-segbtn').forEach((b) => {
    const on = b.getAttribute('data-season') === state.season;
    b.setAttribute('data-active', on ? 'true' : 'false');
    b.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
}

/* Hero eyebrow + sub se v zimě přepnou na lyžování. (setTexts() je nastaví na
   letní znění přes data-t/data-t-html, proto applyHeroSeason voláme až po něm.) */
function applyHeroSeason() {
  const t = tt(), winter = state.season === 'zima';
  const eb = $('.vrim-eyebrow'), sub = $('.vrim-sub');
  if (eb) eb.textContent = winter ? (t.hero.eyebrowWinter || t.hero.eyebrow) : t.hero.eyebrow;
  if (sub) sub.innerHTML = winter ? (t.hero.subWinter || t.hero.sub) : t.hero.sub; // first-party trusted HTML (<em>)
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

/* Rotující ukázka recenzí pod hodnocením — odkazuje dolů na #recenze. */
let teaserTimer = null, teaserIdx = 0, teaserList = [];
function teaserTrim(s) {
  s = String(s || '').replace(/\s+/g, ' ').trim();
  const MAX = 120;
  if (s.length <= MAX) return s;
  let cut = s.slice(0, MAX);
  const sp = cut.lastIndexOf(' ');
  if (sp > 60) cut = cut.slice(0, sp);
  return cut.replace(/[…,;:.\-\s]+$/, '') + '…';
}
function buildTeaserList() {
  teaserList = VR_REVIEWS.items.map((r) => {
    const p = platformByKey(r.platform);
    return { q: teaserTrim(reviewText(r)), a: r.author, source: p.name || r.platform, url: p.url || '', year: r.year || '' };
  }).filter((x) => x.q);
}
function paintTeaser() {
  const host = $('#vr-teaser'); if (!host) return;
  const t = tt();
  const item = teaserList[teaserIdx] || null;
  host.innerHTML = '';
  if (!item) { host.style.display = 'none'; return; }
  host.style.display = '';
  host.appendChild(el('blockquote', { class: 'vr-quote-q', text: item.q }));
  const srcLabel = item.source + (item.year ? ' · ' + item.year : '');
  const cap = el('div', { class: 'vr-quote-cap' }, [
    el('span', { class: 'vr-quote-author', text: '— ' + item.a }),
    item.url
      ? el('a', { class: 'vr-quote-source', href: item.url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': srcLabel }, [
          el('span', { text: srcLabel }), el('span', { class: 'vr-rating-arrow', 'aria-hidden': 'true', text: '↗' }),
        ])
      : el('span', { class: 'vr-quote-source', text: srcLabel }),
  ]);
  host.appendChild(cap);
  host.appendChild(el('a', { class: 'vr-quote-more', href: '#recenze', text: t.ratings.teaserMore + ' →' }));
}
function renderTeaser() {
  buildTeaserList();
  if (teaserIdx >= teaserList.length) teaserIdx = 0;
  paintTeaser();
}
function startTeaserRotation() {
  const host = $('#vr-teaser'); if (!host) return;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || teaserTimer) return; // no auto-rotation under reduced motion
  teaserTimer = setInterval(() => {
    if (!teaserList.length) return;
    host.setAttribute('data-fade', 'true');
    setTimeout(() => {
      teaserIdx = (teaserIdx + 1) % teaserList.length;
      paintTeaser();
      host.setAttribute('data-fade', 'false');
    }, 350);
  }, 6000);
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

/* Uloží sezónu a sladí meta theme-color s aktuálním motivem. */
function persistSeason() { try { localStorage.setItem('vrSeason', state.season); } catch (e) {} }
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
/* Sezóna: ?season= → localStorage vrSeason → leto. */
function resolveSeason(qs) {
  const q = (qs.get('season') || '').toLowerCase();
  if (q === 'leto' || q === 'zima') return q;
  try { const s = localStorage.getItem('vrSeason'); if (s === 'leto' || s === 'zima') return s; } catch (e) {}
  return 'leto';
}
/* Přeložený <title> + meta description (+ og) podle aktuálního jazyka. */
function applyMeta() {
  const m = tt().meta; if (!m) return;
  if (m.title) document.title = m.title;
  const set = (sel, val) => { const n = document.querySelector(sel); if (n && val) n.setAttribute('content', val); };
  set('meta[name="description"]', m.desc);
  set('meta[property="og:title"]', m.title);
  set('meta[property="og:description"]', m.desc);
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
  applyLangButtons(); setTexts();
  renderFacts(); renderRatings(); renderReviews(); renderAmenities(); renderBedrooms(); renderThumbs(); renderScene();
  renderSeasonsCards(); renderTrips(); renderGallery();
  renderPriceBlock(); renderCalendar(); renderBookingPanel(); applyHeroSeason();
  renderDirectBook(); renderTeaser(); renderFooterContact();
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
  applySeasonButtons(); renderSeasonsCards(); applyHeroSeason();
  applyLokLead();    // lead sekce Lokalita má vlastní zimní znění
  renderAmenities(); // hero amenity card (bazén ↔ lyžování) + 3 cards swap by season
  // 360° prohlídka má vlastní sadu scén pro každou sezónu — přepni ji celou
  // (náhledy, popisky, čítač) a nahraj první scénu; stará textura se uvolní
  // uvnitř loadPano() přes tex.dispose().
  state.scene = 0;
  renderThumbs(); renderScene();
  if (loadPano) loadPano(0);
  // Season → default gallery filter (Zima preselects the winter set; user can
  // still switch). If the lightbox is open, keep it in sync with the new filter.
  state.galFilter = season === 'zima' ? 'zima' : 'all';
  renderGallery();
  if (state.lb >= 0) lbSet(-1);
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
    if (it.pano != null) {
      const p = it.pano;
      b360.style.display = 'inline-flex';
      b360.textContent = (tt().interior && tt().interior.open360) || 'View in 360°';
      b360.onclick = (e) => { e.stopPropagation(); lbSet(-1); openTourScene(p); };
    } else { b360.style.display = 'none'; b360.onclick = null; }
  }
  lb.style.display = 'flex'; lb.setAttribute('aria-hidden', 'false'); document.body.style.overflow = 'hidden';
}
function lbNav(dir) { const n = (state.lbList || []).length; if (!n) return; lbSet((state.lb + dir + n) % n); }

/* ============================ 360 panorama (three.js, lazy) ============================ */
let panoInited = false, loadPano = null, panoLastInteract = 0, threeInjected = false;
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
  ['.vr-exphead', '#vrpStage', '#vr-thumbs', '.vr-expdetail'].forEach((sel) => {
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
    }, undefined, () => { if (spin) spin.style.opacity = '0'; mount.style.opacity = '1'; });
  };
  loadPano(state.scene || 0);

  let dx = 0, dy = 0, bY = 0, bP = 0;
  const press = (e) => { dragging = true; idle = 0; panoLastInteract = Date.now(); const p = e.touches ? e.touches[0] : e; dx = p.clientX; dy = p.clientY; bY = userYaw; bP = pitch; const d = $('#vrpDrag'); if (d) d.style.opacity = '0'; };
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
    camera.fov = fovFor(camera.aspect);   // vyšší/nižší výřez → přepočítaný svislý záběr
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
    const n = ((state.scene || 0) + 1) % panoFiles().length;
    state.scene = n; renderScene(); loadPano(n);
  }, 9500);

  const loop = () => {
    requestAnimationFrame(loop);
    try {
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
  try { localStorage.setItem('vrSeason', state.season); } catch (e) {}

  // language buttons
  $all('.vr-lang').forEach((b) => b.addEventListener('click', () => setLang(b.getAttribute('data-lang'))));
  // season buttons (nav, hero pill, mobile menu — all .vr-segbtn, kept in sync)
  $all('.vr-segbtn').forEach((b) => b.addEventListener('click', () => setSeason(b.getAttribute('data-season'))));

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
  state.galFilter = state.season === 'zima' ? 'zima' : 'all';
  applyLangButtons(); applySeasonButtons(); setTexts();
  renderFacts(); renderRatings(); renderReviews(); renderAmenities(); renderBedrooms(); renderThumbs(); renderScene();
  renderSeasonsCards(); renderTrips(); renderGallery();
  renderPriceBlock(); renderCalendar(); renderBookingPanel(); applyHeroSeason();
  renderDirectBook(); renderTeaser(); renderFooterContact();
  applyMeta(); applyLangLinks(); syncUrl();
  loadAvailability();
  loadTripCounts();  // živé počty výletů z trips.json (fallback = VR_TRIP_COUNTS)

  startReveal(); startRaf(); startScrollSpy(); startTeaserRotation();

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
