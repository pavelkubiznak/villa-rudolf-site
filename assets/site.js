/* Villa Rudolf — homepage behaviour. Vanilla JS, no framework.
   Re-implements the Claude Design handoff prototype (.dc runtime NOT ported).
   T translation object is ported verbatim from the prototype; the Stripe note
   is replaced (v1 has no Stripe) and a localized placeholder label added. */
'use strict';

/* ============================ CENÍK — ke schválení majitelem ============================ */
/* ceník ke schválení majitelem — upravit zde.
   Hodnoty vycházejí z reálného Airbnb/Booking listingu Villa Rudolf:
     • letní sezóna (čer–srp): ~11 000 Kč/noc, min. 6 nocí (týdenní pronájmy)
     • zimní sezóna (svátky + lyžování): ~13 500 Kč/noc, min. 3 noci
     • mimo sezónu: ~13 900 Kč/noc, min. 2 noci
     • krátký pobyt na 1 noc (jen mimo sezónu): 16 600 Kč/noc
     • jednorázový úklid: 3 633 Kč
     • městský/lázeňský poplatek: 24,22 Kč za dospělého a noc (děti neplatí)
     • záloha po potvrzení termínu: 30 % z celkové ceny
   Sezóny se zapisují jako MM-DD. 'zimni' přechází přes Nový rok (12-20 → 03-15).
   Poslední sezóna bez from/to ('mimo') je výchozí pro všechny ostatní dny v roce. */
const VR_PRICING = {
  seasons: [
    { name: 'letni', from: '07-01', to: '08-31', nightly: 11000, minNights: 6 },
    { name: 'zimni', from: '12-20', to: '03-15', nightly: 13500, minNights: 3 },
    { name: 'mimo', nightly: 13900, minNights: 2 },
  ],
  shortStayNightly: 16600,   // sazba za krátký (1noční) pobyt — jen mimo sezónu
  shortStayMax: 1,           // do kolika nocí platí krátkodobá sazba
  cleaning: 3633,            // jednorázový úklidový poplatek (Kč)
  cityTaxAdultNight: 24.22,  // městský poplatek na dospělého a noc (Kč)
  depositPct: 30,            // záloha v % z celkové ceny (splatná až po potvrzení)
  maxGuests: 22,             // maximální počet hostů (dospělí + děti)
};

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

/* Vzdálenosti pro blok Lokalita (ilustrativní mapa + výpis). Editovatelné zde. */
const VR_DISTANCES = [
  { place: 'Janské Lázně', km: 4 },
  { place: 'Pec pod Sněžkou', km: 10 },
  { place: 'Trutnov', km: 11 },
];

/* ============================ Translations (verbatim from prototype) ============================ */
const T = {
  cs: {
    photoSoon: 'Fotku doplníme',
    nav: { dum: 'Dům', interier: 'Interiér', vybaveni: 'Vybavení', recenze: 'Recenze', ohniste: 'Ohniště', sezony: 'Sezóny', lokalita: 'Lokalita', vylety: 'Výlety', info: 'Praktické info', cta: 'Rezervovat termín' },
    hero: {
      eyebrow: 'Celý dům jen pro vaši skupinu · Krkonoše',
      eyebrowWinter: 'Lyžování za rohem · Krkonoše',
      h1: 'Soukromá vila v Krkonoších pro 6–22 hostů',
      sub: 'Celé to místo — dům i rozlehlý pozemek — je <em>jen vaše</em>.',
      subWinter: 'Lyžování hned za rohem — <em>skibus u domu</em>, Černá hora 4 km.',
      ctaSec: 'Prohlédnout dům', badge: 'Volné termíny 2026', video: 'Přehrát video',
      summer: 'Léto', winter: 'Zima', scroll: 'Scroll',
      tipSummer: 'Bazén, pergola a večery u otevřeného ohně.',
      tipWinter: 'Bez řetězů až k domu, skibus zdarma v docházkové vzdálenosti.',
      nightLine: 'Setmělo se. Ohniště, gabiony i bazén se rozsvítily samy — večer tady teprve začíná.',
    },
    ratings: { eyebrow: 'Hodnocení hostů', reviewsWord: 'recenzí', verified: 'ověřeno', teaserMore: 'Přečíst recenze' },
    direct: {
      badge: '<b>Přímá rezervace = nejlepší cena.</b> O 5 % výhodněji než na platformách. Osobní přístup a férové storno podmínky.',
      book: '<b>Přímá rezervace = nejlepší cena.</b> O 5 % výhodněji než na platformách. Osobní přístup a férové storno podmínky.',
      sidebar: 'Přímá rezervace — o 5 % výhodněji než na platformách.',
    },
    statement: {
      eyebrow: 'Není to dům. Je to celé místo.',
      lead: 'Jinde dostanete pokoje a kousek zahrady sdílený s cizími lidmi. Tady si berete celý pozemek — rozlehlý, nerozdělený, jen pro vaši skupinu.',
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
      winter: { tag: 'Zima', title: 'Lyžovačka bez starostí', desc: 'Příjezd autem bez řetězů — stačí zimní pneumatiky. Skibus zdarma v docházkové vzdálenosti vás odveze rovnou k vlekům, žádné hledání parkování.',
        list: ['Ski Resort Černá hora 4 km, skibus u domu', 'Vyhřívaný krytý bazén a sauna', 'Lyžárna a příjezd bez řetězů'] },
    },
    lokalita: {
      eyebrow: 'Lokalita', title: 'V horách, ale bez kompromisů', mapcap: 'Sem přijde mapa / Mapy.cz',
      facts: [
        { k: 'Region', v: 'Krkonoše, Česká republika' },
        { k: 'Příjezd v zimě', v: 'Bez řetězů, stačí zimní pneumatiky' },
        { k: 'Skibus', v: 'Zdarma, v docházkové vzdálenosti' },
        { k: 'Parkování', v: 'Přímo u domu, bez řešení u vleků' },
      ],
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
        { name: 'Ložnice', desc: 'Jedna z ložnic s kamennou stěnou za čelním panelem — pohodlné spaní pro celou partu.' },
        { name: 'Zastřešený bazén', desc: 'Vyhřívaný bazén pod posuvným zastřešením — tady se koupete i uprostřed zimy.' },
        { name: 'Pergola', desc: 'Mohutná dřevěná pergola s posezením pro celou skupinu — večer se tu sedí, i když venku leží sníh.' },
        { name: 'Zimní pozemek', desc: 'Rozlehlý zasněžený pozemek jen pro vás — od domu k bazénu, hřišti a dál.' },
      ],
    },
    gallery: { eyebrow: 'Galerie', title: 'Dům, pozemek, okolí', note: 'Klepnutím zvětšíte', all: 'Vše', leto: 'Léto', zima: 'Zima', vecer: 'Večer', interier: 'Interiér' },
    vylety: {
      eyebrow: 'Kam na výlet', title: 'Hory začínají za dveřmi', note: 'Tipy obměňujeme podle sezóny.', drop: 'Sem přijde fotka z výletu', cta: 'Otevřít průvodce výlety',
      items: [
        { tag: 'Celoročně', name: 'Sněžka', desc: 'Nejvyšší hora Česka — pěšky po hřebenech, nebo lanovkou z Pece pod Sněžkou.' },
        { tag: 'Léto', name: 'Hřebenovky a vodopády', desc: 'Značené trasy od pohodových okruhů po celodenní přechody. Mumlavský vodopád zvládnou i děti.' },
        { tag: 'Zima', name: 'Lyžování v okolí', desc: 'Skibus zdarma v docházkové vzdálenosti — k vlekům bez auta a bez hledání parkování.' },
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
      free: 'Volno', booked: 'Obsazeno', chosen: 'Váš pobyt', demo: 'Ukázková dostupnost — napojíme na rezervační systém',
      availFail: 'Dostupnost se nepodařilo načíst.',
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
    lokdist: { title: 'Vzdálenosti od domu', skibus: 'Skibus', skibusVal: 'zastávka u domu', unit: 'km' },
    video: { eyebrow: 'Video', title: 'Prohlédněte si vilu na videu', summer: 'Dům, zahrada, bazén a příjezd', winter: 'Prohlídka domu, sauna a skibus' },
    share: { eyebrow: 'Sdílejte', title: 'Byli jste u nás? Pochlubte se.', body: 'Odvezli jste si hezké fotky? Sdílejte je, označte @villarudolfretreat a přidejte #villarudolf — ať je uvidí i další. Ty nejhezčí se můžou objevit přímo tady na webu.', ig: 'Sledovat na Instagramu' },
    cta: {
      eyebrow: 'Rezervace', title: 'Rezervujte celý dům pro svou skupinu',
      body: 'Vyberte v kalendáři příjezd a odjezd, uvidíte rozpis ceny a pošlete nám nezávaznou žádost o pobyt. Termín vám osobně potvrdíme.',
      lblAdults: 'Dospělí', lblChildren: 'Děti',
      lblName: 'Jméno', phName: 'Vaše jméno',
      lblEmail: 'E-mail', phEmail: 'vas@email.cz',
      lblPhone: 'Telefon / WhatsApp', phPhone: '+420… (nepovinné)',
    },
    mail: { subject: 'Villa Rudolf — žádost o pobyt', dates: 'Termín', nights: 'Počet nocí', breakdown: 'Rozpis ceny', cleaning: 'Úklidový poplatek', cityTax: 'Městský poplatek', guests: 'Hosté', adults: 'Dospělí', children: 'Děti', total: 'Celkem', deposit: 'Záloha 30 % (po potvrzení)', from: 'Kontaktní e-mail', phone: 'Telefon / WhatsApp', greeting: 'Dobrý den, rád(a) bych požádal(a) o pobyt ve Villa Rudolf v tomto termínu:' },
    footer: { tagline: 'Soukromé horské sídlo pro velké skupiny v srdci Krkonoš.', langLabel: 'Jazyk', contact: 'Kontakt', rights: '© 2026 Villa Rudolf', social: 'Sledujte nás', host: 'Pavel — váš hostitel', region: 'Krkonoše, Česko' },
  },

  en: {
    photoSoon: 'Photo coming soon',
    nav: { dum: 'The House', interier: 'Interior', vybaveni: 'Amenities', recenze: 'Reviews', ohniste: 'Fire Pit', sezony: 'Seasons', lokalita: 'Location', vylety: 'Trips', info: 'Guest info', cta: 'Book dates' },
    hero: {
      eyebrow: 'The whole house, just for your group · Krkonoše',
      eyebrowWinter: 'Skiing just around the corner · Krkonoše',
      h1: 'A private villa in the Krkonoše mountains for 6–22 guests',
      sub: 'The whole place — the house and its sweeping grounds — is <em>yours alone</em>.',
      subWinter: 'Skiing just around the corner — <em>ski bus at the door</em>, Černá hora 4 km.',
      ctaSec: 'Explore the house', badge: 'Open dates 2026', video: 'Play video',
      summer: 'Summer', winter: 'Winter', scroll: 'Scroll',
      tipSummer: 'Pool, pergola and evenings around the open fire.',
      tipWinter: 'No chains to the door, free ski bus within walking distance.',
      nightLine: 'Night has fallen. The fire pit, gabion wall and pool have lit themselves — the evening is just beginning.',
    },
    ratings: { eyebrow: 'Guest ratings', reviewsWord: 'reviews', verified: 'verified', teaserMore: 'Read the reviews' },
    direct: {
      badge: '<b>Book direct = best price.</b> 5% better than the platforms. Personal service and fair cancellation terms.',
      book: '<b>Book direct = best price.</b> 5% better than the platforms. Personal service and fair cancellation terms.',
      sidebar: 'Booking direct — 5% better than the platforms.',
    },
    statement: {
      eyebrow: 'Not a house. A whole place.',
      lead: 'Elsewhere you get rooms and a patch of shared garden. Here you take the entire grounds — vast, undivided, yours alone.',
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
      winter: { tag: 'Winter', title: 'Skiing without the hassle', desc: 'Drive up without snow chains — winter tyres are enough. A free ski bus within walking distance takes you straight to the lifts, no parking to hunt for.',
        list: ['Ski Resort Černá hora 4 km, ski bus at the house', 'Heated covered pool and sauna', 'Ski room and access without snow chains'] },
    },
    lokalita: {
      eyebrow: 'Location', title: 'In the mountains, without compromise', mapcap: 'Map / Mapy.cz goes here',
      facts: [
        { k: 'Region', v: 'Krkonoše, Czech Republic' },
        { k: 'Winter access', v: 'No chains, winter tyres are enough' },
        { k: 'Ski bus', v: 'Free, within walking distance' },
        { k: 'Parking', v: 'At the house, none to solve at the lifts' },
      ],
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
        { name: 'Bedroom', desc: 'One of the bedrooms with a stone accent wall behind the headboard — comfortable sleeping for the whole party.' },
        { name: 'Covered pool', desc: 'A heated pool under a sliding cover — you swim here even in midwinter.' },
        { name: 'Pergola', desc: 'A massive timber pergola with seating for the whole group — evenings happen here even with snow on the ground.' },
        { name: 'Winter grounds', desc: 'Sweeping snowbound grounds, all yours — from the house to the pool, the playground and beyond.' },
      ],
    },
    gallery: { eyebrow: 'Gallery', title: 'The house, grounds, surroundings', note: 'Click to enlarge', all: 'All', leto: 'Summer', zima: 'Winter', vecer: 'Evening', interier: 'Interior' },
    vylety: {
      eyebrow: 'Day trips', title: 'The mountains start at the door', note: 'Tips rotate with the season.', drop: 'A trip photo goes here', cta: 'Open the trips guide',
      items: [
        { tag: 'Year-round', name: 'Sněžka', desc: 'The highest peak in Czechia — hike the ridges, or take the cable car from Pec pod Sněžkou.' },
        { tag: 'Summer', name: 'Ridge trails & waterfalls', desc: 'Marked routes from easy loops to full-day traverses. The Mumlava waterfall works with kids too.' },
        { tag: 'Winter', name: 'Skiing nearby', desc: 'A free ski bus within walking distance — reach the lifts without the car or the parking hunt.' },
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
      free: 'Available', booked: 'Booked', chosen: 'Your stay', demo: 'Sample availability — will connect to the booking system',
      availFail: 'Availability could not be loaded.',
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
    lokdist: { title: 'Distances from the house', skibus: 'Ski bus', skibusVal: 'stop at the house', unit: 'km' },
    video: { eyebrow: 'Video', title: 'See the villa on video', summer: 'House, garden, pool & arrival', winter: 'House tour, sauna & ski bus' },
    share: { eyebrow: 'Share', title: 'Stayed with us? Show it off.', body: 'Took some nice photos? Share them, tag @villarudolfretreat and add #villarudolf so others can see them too. The best ones may appear right here on the site.', ig: 'Follow on Instagram' },
    cta: {
      eyebrow: 'Booking', title: 'Book the whole house for your group',
      body: 'Pick arrival and departure in the calendar, see the price breakdown and send us a non-binding stay request. We’ll confirm your dates personally.',
      lblAdults: 'Adults', lblChildren: 'Children',
      lblName: 'Name', phName: 'Your name',
      lblEmail: 'Email', phEmail: 'you@email.com',
      lblPhone: 'Phone / WhatsApp', phPhone: '+420… (optional)',
    },
    mail: { subject: 'Villa Rudolf — stay request', dates: 'Dates', nights: 'Nights', breakdown: 'Price breakdown', cleaning: 'Cleaning fee', cityTax: 'City tax', guests: 'Guests', adults: 'Adults', children: 'Children', total: 'Total', deposit: '30% deposit (after confirmation)', from: 'Contact email', phone: 'Phone / WhatsApp', greeting: 'Hello, I’d like to request a stay at Villa Rudolf for these dates:' },
    footer: { tagline: 'A private mountain estate for large groups in the heart of Krkonoše.', langLabel: 'Language', contact: 'Contact', rights: '© 2026 Villa Rudolf', social: 'Follow us', host: 'Pavel — your host', region: 'Krkonoše, Czechia' },
  },

  de: {
    photoSoon: 'Foto folgt',
    nav: { dum: 'Das Haus', interier: 'Innen', vybaveni: 'Ausstattung', recenze: 'Bewertungen', ohniste: 'Feuerstelle', sezony: 'Jahreszeiten', lokalita: 'Lage', vylety: 'Ausflüge', info: 'Gäste-Infos', cta: 'Termin buchen' },
    hero: {
      eyebrow: 'Das ganze Haus, nur für eure Gruppe · Riesengebirge',
      eyebrowWinter: 'Skifahren gleich um die Ecke · Riesengebirge',
      h1: 'Eine private Villa im Riesengebirge für 6–22 Gäste',
      sub: 'Der ganze Ort — Haus und weitläufiges Grundstück — gehört <em>nur euch</em>.',
      subWinter: 'Skifahren gleich um die Ecke — <em>Skibus am Haus</em>, Černá hora 4 km.',
      ctaSec: 'Haus ansehen', badge: 'Freie Termine 2026', video: 'Video abspielen',
      summer: 'Sommer', winter: 'Winter', scroll: 'Scrollen',
      tipSummer: 'Pool, Pergola und Abende am offenen Feuer.',
      tipWinter: 'Ohne Ketten bis zur Tür, kostenloser Skibus in Gehweite.',
      nightLine: 'Es ist dunkel geworden. Feuerstelle, Gabionenwand und Pool leuchten von selbst — der Abend fängt gerade erst an.',
    },
    ratings: { eyebrow: 'Gästebewertungen', reviewsWord: 'Bewertungen', verified: 'geprüft', teaserMore: 'Bewertungen lesen' },
    direct: {
      badge: '<b>Direkt buchen = bester Preis.</b> 5 % günstiger als über die Plattformen. Persönlicher Service und faire Stornobedingungen.',
      book: '<b>Direkt buchen = bester Preis.</b> 5 % günstiger als über die Plattformen. Persönlicher Service und faire Stornobedingungen.',
      sidebar: 'Direkt buchen — 5 % günstiger als über die Plattformen.',
    },
    statement: {
      eyebrow: 'Kein Haus. Ein ganzer Ort.',
      lead: 'Anderswo bekommt ihr Zimmer und ein Stück geteilten Garten. Hier nehmt ihr das ganze Grundstück — weitläufig, ungeteilt, nur für euch.',
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
      winter: { tag: 'Winter', title: 'Skifahren ohne Stress', desc: 'Anfahrt ohne Schneeketten — Winterreifen genügen. Ein kostenloser Skibus in Gehweite bringt euch direkt zu den Liften, keine Parkplatzsuche.',
        list: ['Skigebiet Černá hora 4 km, Skibus am Haus', 'Beheizter überdachter Pool und Sauna', 'Skiraum und Anfahrt ohne Ketten'] },
    },
    lokalita: {
      eyebrow: 'Lage', title: 'In den Bergen, ohne Kompromiss', mapcap: 'Karte / Mapy.cz hier',
      facts: [
        { k: 'Region', v: 'Riesengebirge, Tschechien' },
        { k: 'Anfahrt im Winter', v: 'Ohne Ketten, Winterreifen genügen' },
        { k: 'Skibus', v: 'Kostenlos, in Gehweite' },
        { k: 'Parken', v: 'Am Haus, kein Problem an den Liften' },
      ],
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
        { name: 'Schlafzimmer', desc: 'Eines der Schlafzimmer mit Steinwand hinter dem Kopfteil — bequemes Schlafen für die ganze Runde.' },
        { name: 'Überdachter Pool', desc: 'Ein beheizter Pool unter verschiebbarer Überdachung — hier badet ihr selbst mitten im Winter.' },
        { name: 'Pergola', desc: 'Eine massive Holzpergola mit Sitzplätzen für die ganze Gruppe — Abende finden hier statt, auch wenn Schnee liegt.' },
        { name: 'Wintergrundstück', desc: 'Ein weitläufiges verschneites Grundstück, nur für euch — vom Haus zum Pool, zum Spielplatz und weiter.' },
      ],
    },
    gallery: { eyebrow: 'Galerie', title: 'Haus, Grundstück, Umgebung', note: 'Klicken zum Vergrößern', all: 'Alle', leto: 'Sommer', zima: 'Winter', vecer: 'Abend', interier: 'Innen' },
    vylety: {
      eyebrow: 'Ausflüge', title: 'Die Berge beginnen vor der Tür', note: 'Tipps je nach Saison.', drop: 'Hier kommt ein Ausflugsfoto', cta: 'Ausflugsführer öffnen',
      items: [
        { tag: 'Ganzjährig', name: 'Schneekoppe', desc: 'Der höchste Gipfel Tschechiens — zu Fuß über die Kämme oder mit der Seilbahn ab Pec pod Sněžkou.' },
        { tag: 'Sommer', name: 'Kammwege & Wasserfälle', desc: 'Markierte Routen von leichten Runden bis zu Tagestouren. Der Mumlava-Wasserfall klappt auch mit Kindern.' },
        { tag: 'Winter', name: 'Skifahren in der Nähe', desc: 'Kostenloser Skibus in Gehweite — zu den Liften ohne Auto und Parkplatzsuche.' },
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
      free: 'Frei', booked: 'Belegt', chosen: 'Euer Aufenthalt', demo: 'Beispielverfügbarkeit — wird ans Buchungssystem angebunden',
      availFail: 'Verfügbarkeit konnte nicht geladen werden.',
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
    lokdist: { title: 'Entfernungen vom Haus', skibus: 'Skibus', skibusVal: 'Haltestelle am Haus', unit: 'km' },
    video: { eyebrow: 'Video', title: 'Sehen Sie die Villa im Video', summer: 'Haus, Garten, Pool & Anreise', winter: 'Hausführung, Sauna & Skibus' },
    share: { eyebrow: 'Teilen', title: 'Bei uns gewesen? Zeigt es her.', body: 'Schöne Fotos gemacht? Teilt sie, markiert @villarudolfretreat und fügt #villarudolf hinzu — damit sie auch andere sehen. Die schönsten erscheinen vielleicht direkt hier auf der Website.', ig: 'Auf Instagram folgen' },
    cta: {
      eyebrow: 'Buchung', title: 'Bucht das ganze Haus für eure Gruppe',
      body: 'Wählt An- und Abreise im Kalender, seht die Preisaufstellung und sendet uns eine unverbindliche Aufenthaltsanfrage. Wir bestätigen euren Termin persönlich.',
      lblAdults: 'Erwachsene', lblChildren: 'Kinder',
      lblName: 'Name', phName: 'Euer Name',
      lblEmail: 'E-Mail', phEmail: 'du@email.de',
      lblPhone: 'Telefon / WhatsApp', phPhone: '+420… (optional)',
    },
    mail: { subject: 'Villa Rudolf — Aufenthaltsanfrage', dates: 'Termin', nights: 'Nächte', breakdown: 'Preisaufstellung', cleaning: 'Endreinigung', cityTax: 'Kurtaxe', guests: 'Gäste', adults: 'Erwachsene', children: 'Kinder', total: 'Gesamt', deposit: '30 % Anzahlung (nach Bestätigung)', from: 'Kontakt-E-Mail', phone: 'Telefon / WhatsApp', greeting: 'Guten Tag, ich möchte einen Aufenthalt in der Villa Rudolf zu diesem Termin anfragen:' },
    footer: { tagline: 'Ein privates Berganwesen für große Gruppen im Herzen des Riesengebirges.', langLabel: 'Sprache', contact: 'Kontakt', rights: '© 2026 Villa Rudolf', social: 'Folgt uns', host: 'Pavel — euer Gastgeber', region: 'Riesengebirge, Tschechien' },
  },

  pl: {
    photoSoon: 'Zdjęcie wkrótce',
    nav: { dum: 'Dom', interier: 'Wnętrze', vybaveni: 'Udogodnienia', recenze: 'Recenzje', ohniste: 'Palenisko', sezony: 'Sezony', lokalita: 'Lokalizacja', vylety: 'Wycieczki', info: 'Informacje praktyczne', cta: 'Zarezerwuj termin' },
    hero: {
      eyebrow: 'Cały dom tylko dla waszej grupy · Karkonosze',
      eyebrowWinter: 'Narty tuż za rogiem · Karkonosze',
      h1: 'Prywatna willa w Karkonoszach dla 6–22 gości',
      sub: 'Całe to miejsce — dom i rozległa posesja — jest <em>tylko wasze</em>.',
      subWinter: 'Narty tuż za rogiem — <em>skibus przy domu</em>, Černá hora 4 km.',
      ctaSec: 'Zobacz dom', badge: 'Wolne terminy 2026', video: 'Odtwórz wideo',
      summer: 'Lato', winter: 'Zima', scroll: 'Scroll',
      tipSummer: 'Basen, pergola i wieczory przy otwartym ogniu.',
      tipWinter: 'Bez łańcuchów pod same drzwi, darmowy skibus w zasięgu spaceru.',
      nightLine: 'Zapadła noc. Palenisko, ściana gabionowa i basen zapaliły się same — wieczór dopiero się zaczyna.',
    },
    ratings: { eyebrow: 'Oceny gości', reviewsWord: 'recenzji', verified: 'zweryfikowano', teaserMore: 'Przeczytaj recenzje' },
    direct: {
      badge: '<b>Rezerwacja bezpośrednia = najlepsza cena.</b> O 5% taniej niż na platformach. Osobiste podejście i uczciwe warunki anulacji.',
      book: '<b>Rezerwacja bezpośrednia = najlepsza cena.</b> O 5% taniej niż na platformach. Osobiste podejście i uczciwe warunki anulacji.',
      sidebar: 'Rezerwacja bezpośrednia — o 5% taniej niż na platformach.',
    },
    statement: {
      eyebrow: 'To nie dom. To całe miejsce.',
      lead: 'Gdzie indziej dostajecie pokoje i kawałek wspólnego ogrodu. Tu bierzecie całą posesję — rozległą, niepodzieloną, tylko dla was.',
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
      winter: { tag: 'Zima', title: 'Narty bez kłopotów', desc: 'Dojazd bez łańcuchów — wystarczą opony zimowe. Darmowy skibus w zasięgu spaceru zawiezie was prosto pod wyciągi, bez szukania parkingu.',
        list: ['Ośrodek Černá hora 4 km, skibus przy domu', 'Podgrzewany kryty basen i sauna', 'Narciarnia i dojazd bez łańcuchów'] },
    },
    lokalita: {
      eyebrow: 'Lokalizacja', title: 'W górach, bez kompromisów', mapcap: 'Tu mapa / Mapy.cz',
      facts: [
        { k: 'Region', v: 'Karkonosze, Czechy' },
        { k: 'Dojazd zimą', v: 'Bez łańcuchów, wystarczą opony zimowe' },
        { k: 'Skibus', v: 'Darmowy, w zasięgu spaceru' },
        { k: 'Parking', v: 'Przy domu, bez kłopotu pod wyciągami' },
      ],
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
        { name: 'Sypialnia', desc: 'Jedna z sypialni z kamienną ścianą za zagłówkiem — wygodny sen dla całej ekipy.' },
        { name: 'Zadaszony basen', desc: 'Podgrzewany basen pod przesuwnym zadaszeniem — kąpiel nawet w środku zimy.' },
        { name: 'Pergola', desc: 'Masywna drewniana pergola z miejscem dla całej grupy — wieczory trwają tu nawet przy śniegu.' },
        { name: 'Zimowa posesja', desc: 'Rozległa zaśnieżona posesja tylko dla was — od domu po basen, plac zabaw i dalej.' },
      ],
    },
    gallery: { eyebrow: 'Galeria', title: 'Dom, posesja, okolica', note: 'Kliknij, by powiększyć', all: 'Wszystko', leto: 'Lato', zima: 'Zima', vecer: 'Wieczór', interier: 'Wnętrze' },
    vylety: {
      eyebrow: 'Wycieczki', title: 'Góry zaczynają się za drzwiami', note: 'Wskazówki zmieniamy według sezonu.', drop: 'Tu trafi zdjęcie z wycieczki', cta: 'Otwórz przewodnik wycieczek',
      items: [
        { tag: 'Cały rok', name: 'Śnieżka', desc: 'Najwyższy szczyt Czech — pieszo graniami albo kolejką z Pecu pod Śnieżką.' },
        { tag: 'Lato', name: 'Szlaki grzbietowe i wodospady', desc: 'Znakowane trasy od spokojnych pętli po całodniowe przejścia. Wodospad Mumlawy da się przejść z dziećmi.' },
        { tag: 'Zima', name: 'Narty w okolicy', desc: 'Darmowy skibus w zasięgu spaceru — pod wyciągi bez auta i szukania parkingu.' },
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
      free: 'Wolne', booked: 'Zajęte', chosen: 'Wasz pobyt', demo: 'Przykładowa dostępność — podłączymy system rezerwacji',
      availFail: 'Nie udało się wczytać dostępności.',
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
    lokdist: { title: 'Odległości od domu', skibus: 'Skibus', skibusVal: 'przystanek przy domu', unit: 'km' },
    video: { eyebrow: 'Wideo', title: 'Zobacz willę na wideo', summer: 'Dom, ogród, basen i przyjazd', winter: 'Zwiedzanie domu, sauna i skibus' },
    share: { eyebrow: 'Udostępnij', title: 'Byliście u nas? Pochwalcie się.', body: 'Macie ładne zdjęcia? Udostępnijcie je, oznaczcie @villarudolfretreat i dodajcie #villarudolf — niech zobaczą je też inni. Najlepsze mogą pojawić się właśnie tu, na stronie.', ig: 'Obserwuj na Instagramie' },
    cta: {
      eyebrow: 'Rezerwacja', title: 'Zarezerwuj cały dom dla swojej grupy',
      body: 'Wybierz w kalendarzu przyjazd i wyjazd, zobacz rozpiskę ceny i wyślij nam niezobowiązującą prośbę o pobyt. Termin potwierdzimy osobiście.',
      lblAdults: 'Dorośli', lblChildren: 'Dzieci',
      lblName: 'Imię', phName: 'Wasze imię',
      lblEmail: 'E-mail', phEmail: 'ty@email.pl',
      lblPhone: 'Telefon / WhatsApp', phPhone: '+420… (opcjonalnie)',
    },
    mail: { subject: 'Villa Rudolf — prośba o pobyt', dates: 'Termin', nights: 'Noce', breakdown: 'Rozpiska ceny', cleaning: 'Opłata za sprzątanie', cityTax: 'Opłata miejscowa', guests: 'Goście', adults: 'Dorośli', children: 'Dzieci', total: 'Razem', deposit: 'Zaliczka 30% (po potwierdzeniu)', from: 'E-mail kontaktowy', phone: 'Telefon / WhatsApp', greeting: 'Dzień dobry, chciałbym/chciałabym poprosić o pobyt w Villa Rudolf w tym terminie:' },
    footer: { tagline: 'Prywatna górska rezydencja dla dużych grup w sercu Karkonoszy.', langLabel: 'Język', contact: 'Kontakt', rights: '© 2026 Villa Rudolf', social: 'Obserwuj nas', host: 'Pavel — wasz gospodarz', region: 'Karkonosze, Czechy' },
  },
};

/* ============================ State + helpers ============================ */
const state = { lang: 'cs', season: 'leto', scrolled: false, scene: 0, lb: -1, lbList: [], galFilter: 'all', selStart: 0, selEnd: 0, mob: false, calOffset: 0 };
/* Kalendář: okno 2 měsíců lze posouvat 0 .. CAL_MAX_OFFSET (dnešek .. +18 měsíců). */
const CAL_MAX_OFFSET = 17;
/* Ceny řídí VR_PRICING (nahoře v souboru). */
const CONTACT_EMAIL = 'pavel.kubiznak@gmail.com';
const PANO_FILES = ['living', 'kitchen', 'sauna', 'saunahot', 'bed1', 'pool', 'pergola', 'grounds'];

/* Per-pano horizontal start point (fraction 0–1 across the equirect image; 0.5 =
   image centre). Vision-scored "most attractive view" per scene. Mapped to camera
   yaw in loadPano() so the viewer first faces the described subject. */
const PANO_YAWF = { living: 0.76, kitchen: 0.4, sauna: 0.5, saunahot: 0.9, bed1: 0.48, bed2: 0.15, pool: 0.42, pergola: 0.49, grounds: 0.65 };

/* Gallery: curated real photos. c = filter category (leto/zima/vecer/interier).
   Order below is the "Vše" order (greatest-hits interleave). Files live at
   media/gallery/{slug}.jpg (1600px) and media/gallery/t/{slug}.jpg (640px thumb). */
const GALLERY = [
  { s: 'firepit-sunset', c: 'vecer', alt: 'Ohniště a prosvětlená gabionová stěna při západu slunce' },
  { s: 'winter-snow', c: 'zima', alt: 'Villa Rudolf ve sněhu' },
  { s: 'pool-day', c: 'leto', alt: 'Zastřešený bazén — pohled prosklenym tunelem' },
  { s: 'room4-beams', c: 'interier', alt: 'Ložnice s postelí mezi dřevěnými trámy' },
  { s: 'areal-night', c: 'vecer', alt: 'Celý areál v noci — dům, zářící bazén i ohniště' },
  { s: 'pergola-exterior', c: 'leto', alt: 'Dřevěná pergola zvenčí' },
  { s: 'winter-night', c: 'zima', alt: 'Villa Rudolf v noci se sněhem a měsícem' },
  { s: 'dining-kitchen', c: 'interier', alt: 'Kuchyně a velký jídelní stůl' },
  { s: 'pool-sunbeds', c: 'leto', alt: 'Bazén s řadou lehátek a domem' },
  { s: 'aerial-night', c: 'vecer', alt: 'Noční pohled shora na zářící bazén a ohniště' },
  { s: 'winter-twin-snow', c: 'zima', alt: 'Ložnice se zasněženým výhledem z oken' },
  { s: 'room2-lamps', c: 'interier', alt: 'Postel s rozsvícenými nočními lampičkami' },
  { s: 'summer-drive', c: 'leto', alt: 'Příjezdová alej ke vile' },
  { s: 'pool-night', c: 'vecer', alt: 'Noční bazén pod hvězdnou oblohou' },
  { s: 'winter-forest', c: 'zima', alt: 'Vila v průhledu mezi zasněženými smrky' },
  { s: 'suite-billiard', c: 'interier', alt: 'Společenský prostor s kulečníkovým stolem' },
  { s: 'pergola-view', c: 'leto', alt: 'Výhled z pergoly na bazén a hlavní vilu' },
  { s: 'firepit-dusk', c: 'vecer', alt: 'Bazén a zahrada za soumraku' },
  { s: 'winter-night-close', c: 'zima', alt: 'Detailní noční pohled na fasádu vily' },
  { s: 'room1-corner', c: 'interier', alt: 'Rohová ložnice s výhledem do zeleně' },
  { s: 'pool-storm', c: 'leto', alt: 'Bazén a dům pod dramatickou oblohou' },
  { s: 'pergola-night', c: 'vecer', alt: 'Nasvícený altán s prostřeným stolem večer' },
  { s: 'winter-room-snow', c: 'zima', alt: 'Rohová ložnice se sněhem za okny' },
  { s: 'sauna-hall', c: 'interier', alt: 'Chodba k sauně s prosklenými dveřmi' },
  { s: 'summer-house', c: 'leto', alt: 'Villa Rudolf pod korunou stromu v létě' },
];
const GAL_FILTERS = ['all', 'leto', 'zima', 'vecer', 'interier'];

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

/* Blok vzdáleností pro sekci Lokalita (ilustrativní mapa je statická v HTML). */
function renderLokDistances() {
  const t = tt();
  const host = $('#vr-mapdist'); if (!host) return; host.innerHTML = '';
  host.appendChild(el('div', { class: 'vr-mapdist-title', text: t.lokdist.title }));
  const list = el('div', { class: 'vr-mapdist-list' });
  VR_DISTANCES.forEach((d) => list.appendChild(el('div', { class: 'vr-mapdist-row' }, [
    el('span', { class: 'p', text: d.place }), el('span', { class: 'd', text: d.km + ' ' + t.lokdist.unit }),
  ])));
  list.appendChild(el('div', { class: 'vr-mapdist-row' }, [
    el('span', { class: 'p', text: t.lokdist.skibus }), el('span', { class: 'd', text: t.lokdist.skibusVal }),
  ]));
  host.appendChild(list);
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
    ? ['media/gallery/sauna-hall.jpg', 'media/gallery/firepit-sunset.jpg', 'media/gallery/pool-night.jpg']
    : ['media/gallery/sauna-hall.jpg', 'media/gallery/pergola-exterior.jpg', 'media/sections/playground.jpg'];
  const host = $('#vr-amen3'); host.innerHTML = '';
  A.cards.forEach((it, i) => {
    const art = el('article');
    const src = imgs[i];
    if (src) art.appendChild(el('img', { src: src, alt: it.name, loading: 'lazy' }));
    else art.appendChild(slot(t.photoSoon));
    art.appendChild(el('span', { class: 'vr-tag', text: it.tag }));
    art.appendChild(el('h3', { text: it.name }));
    art.appendChild(el('p', { text: it.desc }));
    host.appendChild(art);
  });
}

function renderThumbs() {
  const t = tt();
  const host = $('#vr-thumbs'); host.innerHTML = '';
  t.tour.scenes.forEach((s, i) => {
    const b = el('button', {
      class: 'vrp-thumb', type: 'button', 'data-active': i === state.scene ? 'true' : 'false',
      onclick: () => { panoLastInteract = Date.now(); if (state.scene !== i) { state.scene = i; renderScene(); loadPano(i); } },
    }, [el('img', { src: 'media/pano/' + PANO_FILES[i] + '_t.jpg', alt: s.name, loading: 'lazy' }), el('span', { text: s.name })]);
    host.appendChild(b);
  });
}

function renderScene() {
  const t = tt();
  const sc = state.scene;
  const s = t.tour.scenes[sc] || t.tour.scenes[0];
  $('#vrp-capname').textContent = s.name;
  $('#vr-scene-name').textContent = s.name;
  $('#vr-scene-desc').textContent = s.desc;
  const pad = (n) => (n < 10 ? '0' + n : '' + n);
  $('#vr-scene-idx').textContent = pad(sc + 1);
  $('#vr-scene-count').textContent = pad(PANO_FILES.length);
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

function renderLokFacts() {
  const t = tt();
  const host = $('#vr-lokfacts'); host.innerHTML = '';
  t.lokalita.facts.forEach((f) => host.appendChild(el('div', { class: 'vr-lok-fact' }, [
    el('div', { class: 'k', text: f.k }), el('div', { class: 'v', text: f.v }),
  ])));
}

function renderTrips() {
  const t = tt();
  const host = $('#vr-vyl'); host.innerHTML = '';
  t.vylety.items.forEach((it) => {
    const art = el('article');
    art.appendChild(slot(t.photoSoon));
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
  items.forEach((g, i) => host.appendChild(el('img', {
    src: 'media/gallery/t/' + g.s + '.jpg', alt: g.alt, loading: 'lazy',
    onclick: () => lbOpen(items, i),
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
function pickDay(k) {
  const s0 = state.selStart, s1 = state.selEnd;
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
  cs: { letni: 'letní sezóna', zimni: 'zimní sezóna', mimo: 'mimo sezónu', short: 'krátký pobyt' },
  en: { letni: 'summer', zimni: 'winter', mimo: 'off-season', short: 'short stay' },
  de: { letni: 'Sommer', zimni: 'Winter', mimo: 'Nebensaison', short: 'Kurzaufenthalt' },
  pl: { letni: 'sezon letni', zimni: 'sezon zimowy', mimo: 'poza sezonem', short: 'krótki pobyt' },
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
function computeQuote(s0, s1, adults, children) {
  const nights = (s0 && s1) ? Math.round((toD(s1) - toD(s0)) / 86400000) : 0;
  adults = Math.max(0, adults | 0); children = Math.max(0, children | 0);
  const q = {
    nights: nights, adults: adults, children: children, groups: [],
    accommodation: 0, cleaning: 0, cityTax: 0, total: 0, deposit: 0,
    valid: false, reason: 'no-range', arrival: null, minNights: 0, shortStay: false,
    guestOver: (adults + children) > VR_PRICING.maxGuests, noAdults: adults < 1,
  };
  if (nights <= 0) return q;
  const arrival = vrSeasonForKey(s0);
  const isFallback = !arrival.from || !arrival.to;
  q.arrival = arrival; q.minNights = arrival.minNights || 1;
  const shortStay = nights <= VR_PRICING.shortStayMax && VR_PRICING.shortStayMax >= 1 && isFallback;
  q.shortStay = shortStay;
  if (shortStay) {
    q.groups.push({ name: 'short', nights: nights, rate: VR_PRICING.shortStayNightly, subtotal: nights * VR_PRICING.shortStayNightly });
  } else {
    const order = [], map = {};
    vrEachNight(s0, s1, (k) => {
      const s = vrSeasonForKey(k);
      if (!map[s.name]) { map[s.name] = { name: s.name, rate: s.nightly, nights: 0, subtotal: 0 }; order.push(s.name); }
      map[s.name].nights++; map[s.name].subtotal += s.nightly;
    });
    order.forEach((n) => q.groups.push(map[n]));
  }
  q.accommodation = q.groups.reduce((a, g) => a + g.subtotal, 0);
  q.cleaning = VR_PRICING.cleaning;
  q.cityTax = Math.round(adults * nights * VR_PRICING.cityTaxAdultNight);
  q.total = q.accommodation + q.cleaning + q.cityTax;
  q.deposit = Math.round(q.total * VR_PRICING.depositPct / 100);
  q.valid = shortStay || nights >= q.minNights;
  q.reason = q.valid ? 'ok' : 'min-stay';
  return q;
}

function fmtM(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' Kč'; }
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
      let st = isPast ? 'p' : bk ? 'b' : 'f';
      if (st === 'f') { if (k === s0 || k === s1) st = 's'; else if (s0 && s1 && k > s0 && k < s1) st = 'r'; }
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
  };
}
/* Srovná hodnoty do mezí (dospělí 1..max, děti 0..max-1). Překročení součtu
   se neupravuje tvrdě — jen se ukáže hláška a odeslání se zablokuje. */
function clampGuests() {
  const a = $('#vr-adults'), c = $('#vr-children'); if (!a || !c) return;
  let av = parseInt(a.value, 10), cv = parseInt(c.value, 10);
  if (isNaN(av)) av = 1; if (isNaN(cv)) cv = 0;
  a.value = Math.max(1, Math.min(VR_PRICING.maxGuests, av));
  c.value = Math.max(0, Math.min(VR_PRICING.maxGuests - 1, cv));
}
function renderBookingPanel() {
  const t = tt(), lang = state.lang;
  const s0 = state.selStart, s1 = state.selEnd;
  const nights = nightsCount();
  $('#vr-sel-label').textContent = s0 ? fmtK(s0) + ' — ' + (s1 ? fmtK(s1) : '…') : t.book.pick;
  $('#vr-sel-nights').textContent = nights ? '· ' + nights + ' ' + (NBf[lang] || NBf.cs)(nights) : '';

  const g = readGuests();
  const q = computeQuote(s0, s1, g.adults, g.children);
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
      let lbl = grp.nights + ' ' + (NBf[lang] || NBf.cs)(grp.nights) + ' × ' + fmtM(grp.rate);
      if (multi || grp.name === 'short') lbl += ' · ' + (SL[grp.name] || '');
      brk.appendChild(rowEl(lbl, fmtM(grp.subtotal)));
    });
    brk.appendChild(rowEl(t.book.cleaning, fmtM(q.cleaning)));
    const adWord = (ADf[lang] || ADf.cs)(q.adults), nbWord = (NBf[lang] || NBf.cs)(q.nights);
    brk.appendChild(rowEl(t.book.cityTax + ' (' + q.adults + ' ' + adWord + ' × ' + q.nights + ' ' + nbWord + ')', fmtM(q.cityTax)));
    brk.appendChild(rowEl(t.book.total, fmtM(q.total), 'brk-total'));
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
    const gl = t.cta.lblAdults + ': ' + q.adults + (q.children ? ' · ' + t.cta.lblChildren + ': ' + q.children : '');
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
  const q = computeQuote(s0, s1, g.adults, g.children);
  if (!q.valid || q.guestOver || q.noAdults || !name || !email) { setBookMsg(t.book.errRequired); return; }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setBookMsg(t.book.errEmail); return; }
  setBookMsg('');
  setBookSending(true);
  const breakdown = {
    nights: q.nights,
    groups: q.groups.map((grp) => ({ name: grp.name, nights: grp.nights, rate: grp.rate, subtotal: grp.subtotal })),
    cleaning: q.cleaning, cityTax: q.cityTax, total: q.total, deposit: q.deposit, shortStay: q.shortStay,
  };
  const iso = (k) => Math.floor(k / 10000) + '-' + String(Math.floor(k / 100) % 100).padStart(2, '0') + '-' + String(k % 100).padStart(2, '0');
  const payload = {
    p_arrival: iso(s0), p_departure: iso(s1),
    p_adults: q.adults, p_children: q.children,
    p_name: name, p_email: email, p_phone: phone,
    p_lang: lang, p_breakdown: breakdown, p_total: q.total,
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
             || code === 'guests_invalid' || code === 'name_required' || code === 'email_required') msg = t.book.errRequired;
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
  });
}
function applyTip() { $('#vrim-tip').textContent = state.season === 'zima' ? tt().hero.tipWinter : tt().hero.tipSummer; }

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
  teaserList = VR_REVIEWS.items.map((r) => ({ q: teaserTrim(reviewText(r)), a: r.author })).filter((x) => x.q);
}
function paintTeaser() {
  const host = $('#vr-teaser'); if (!host) return;
  const t = tt();
  const item = teaserList[teaserIdx] || null;
  host.innerHTML = '';
  if (!item) { host.style.display = 'none'; return; }
  host.style.display = '';
  host.appendChild(el('span', { class: 'vr-teaser-q', text: item.q }));
  host.appendChild(el('span', { class: 'vr-teaser-cap' }, [
    el('span', { text: '— ' + item.a }),
    el('span', { class: 'vr-teaser-more', text: t.ratings.teaserMore + ' →' }),
  ]));
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

function setLang(lang) {
  if (!T[lang] || state.lang === lang) return;
  state.lang = lang;
  try { localStorage.setItem('vrLang', lang); } catch (e) {}
  applyLangButtons(); setTexts();
  renderFacts(); renderRatings(); renderReviews(); renderAmenities(); renderThumbs(); renderScene();
  renderSeasonsCards(); renderLokFacts(); renderLokDistances(); renderTrips(); renderGallery();
  renderCalendar(); renderBookingPanel(); applyTip(); applyHeroSeason();
  renderDirectBook(); renderTeaser(); renderFooterContact();
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
  applySeasonButtons(); renderSeasonsCards(); applyTip(); applyHeroSeason();
  renderAmenities(); // hero amenity card (bazén ↔ lyžování) + 3 cards swap by season
  // Season → default gallery filter (Zima preselects the winter set; user can
  // still switch). If the lightbox is open, keep it in sync with the new filter.
  state.galFilter = season === 'zima' ? 'zima' : 'all';
  renderGallery();
  if (state.lb >= 0) lbSet(-1);
}

/* ============================ Lightbox ============================ */
function lbOpen(list, i) { state.lbList = (list || []).map((g) => g.s); lbSet(i); }
function lbSet(i) {
  const lb = $('#vr-lb');
  const list = state.lbList || [];
  if (i < 0 || !list.length) { state.lb = -1; lb.style.display = 'none'; lb.setAttribute('aria-hidden', 'true'); document.body.style.overflow = ''; return; }
  state.lb = i;
  $('#vr-lb-img').src = 'media/gallery/' + list[i] + '.jpg';
  $('#vr-lb-count').textContent = (i + 1) + ' / ' + list.length;
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
function initPano() {
  if (panoInited) return;
  if (typeof THREE === 'undefined') { setTimeout(initPano, 80); return; }
  const mount = $('#vrpCanvas'), stage = $('#vrpStage');
  if (!mount || !stage) return;
  panoInited = true;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(72, mount.clientWidth / mount.clientHeight, 0.1, 1100);
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
    const f = PANO_FILES[i] || PANO_FILES[0];
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
      tex.minFilter = THREE.LinearFilter;
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
  const onR = () => { const w = stage.clientWidth, h = stage.clientHeight; camera.aspect = w / h; camera.updateProjectionMatrix(); renderer.setSize(w, h, false); };
  window.addEventListener('resize', onR, { passive: true });

  // auto-cycle scenes if idle
  setInterval(() => {
    if (dragging) return;
    if (Date.now() - panoLastInteract < 12000) return;
    const n = ((state.scene || 0) + 1) % PANO_FILES.length;
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
}

/* ============================ Hero scroll parallax + nav state (rAF) ============================ */
/* Mouse-position parallax odstraněn (dle UX kritiky). Zůstává jen jemný scroll
   parallax hero fotky a stmívání scroll-hintu; nav se přepíná při odscrollování. */
function startRaf() {
  const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const $id = (id) => document.getElementById(id);
  const render = () => {
    requestAnimationFrame(render);
    try {
      const vh = window.innerHeight || 1;
      const heroPhoto = $id('vrhPhoto'), hint = $id('vrimHint');
      const hp = clamp(window.scrollY / vh);
      if (heroPhoto) heroPhoto.style.transform = 'scale(1.08) translateY(' + (hp * 46).toFixed(1) + 'px)';
      if (hint) hint.style.opacity = clamp(1 - hp / 0.5);
      const s = window.scrollY > 8;
      if (s !== state.scrolled) { state.scrolled = s; $('.vr-nav').setAttribute('data-scrolled', s ? 'true' : 'false'); }
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
  // restore saved language + season
  try { const saved = localStorage.getItem('vrLang'); if (saved && T[saved]) state.lang = saved; } catch (e) {}
  try { const s = localStorage.getItem('vrSeason'); if (s === 'leto' || s === 'zima') state.season = s; } catch (e) {}

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

  // booking
  $('#vr-pay').addEventListener('click', submitBooking);
  // kalendář — posun 2měsíčního okna (‹ ›)
  const calPrev = $('#vr-cal-prev'), calNext = $('#vr-cal-next');
  if (calPrev) calPrev.addEventListener('click', () => shiftCal(-1));
  if (calNext) calNext.addEventListener('click', () => shiftCal(1));
  // „Odeslat další žádost" — reset úspěšné žádosti zpět na formulář
  const again = $('#vr-book-again');
  if (again) again.addEventListener('click', resetBookForm);
  // počty hostů — rozpis se přepočítá živě; na blur se hodnoty srovnají do mezí
  ['#vr-adults', '#vr-children'].forEach((sel) => {
    const inp = $(sel); if (!inp) return;
    inp.addEventListener('input', renderBookingPanel);
    inp.addEventListener('change', () => { clampGuests(); renderBookingPanel(); });
  });
  // mobile menu
  $('#vr-burger').addEventListener('click', () => toggleMob());
  $all('#vr-mob a').forEach((a) => a.addEventListener('click', () => toggleMob(false)));

  // initial render
  document.querySelector('.vr-root').setAttribute('data-season', state.season);
  applyThemeColor();
  state.galFilter = state.season === 'zima' ? 'zima' : 'all';
  applyLangButtons(); applySeasonButtons(); setTexts();
  renderFacts(); renderRatings(); renderReviews(); renderAmenities(); renderThumbs(); renderScene();
  renderSeasonsCards(); renderLokFacts(); renderLokDistances(); renderTrips(); renderGallery();
  renderCalendar(); renderBookingPanel(); applyTip(); applyHeroSeason();
  renderDirectBook(); renderTeaser(); renderFooterContact();
  loadAvailability();

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
