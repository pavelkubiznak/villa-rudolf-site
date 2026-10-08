/* Texty statických jazykových stránek, které NEJSOU ve slovníku T v assets/site.js.
   Čte je jen tools/gen-jazyky.mjs (prohlížeč je nestahuje).

   Proč zvlášť: T je runtime slovník, který stahuje každý návštěvník (site.js má přes 300 kB).
   Tady je jen to, co JavaScript nikdy nemění: alt texty statických fotek, <noscript>,
   schema.org (JSON-LD) a stránka Časté dotazy.

   FAKTA jen z villa-rudolf-portal/docs/text-villa-rudolf.md, kap. 3 (potvrzeno Pavlem 21.–25. 9. 2026).
   Hlas a názvy podle kap. 1–2 a 6–7 téhož souboru: apartmá Suite / Apartment Suite, Pokoj 1–4 /
   Zimmer 1–4 / Room 1–4, altán / Pavillon / gazebo; němčina tyká v množném čísle („ihr").
   Česká verze je zároveň zdrojem pro index.html — po změně pusť `node tools/gen-jazyky.mjs`. */

export const JAZYKY = ['cs', 'de', 'pl', 'en'];   // pořadí podle trhů (domovní kniha 2024–26)

/* <noscript> — jen pro hosty bez JavaScriptu (kalendář a poptávka bez něj nejdou). */
export const NOSCRIPT = {
  cs: { text: 'Pro kalendář, poptávku a 360° prohlídku povolte prosím JavaScript.', kontakt: 'Rezervace' },
  de: { text: 'Für Kalender, Buchungsanfrage und 360°-Rundgang aktiviert bitte JavaScript.', kontakt: 'Buchung' },
  pl: { text: 'Aby korzystać z kalendarza, zapytania o pobyt i spaceru 360°, włącz JavaScript.', kontakt: 'Rezerwacja' },
  en: { text: 'Please enable JavaScript for the calendar, the booking request and the 360° tour.', kontakt: 'Booking' },
};

/* Alt texty statických fotek v index.html (atribut data-alt="klíč"). Popisují fotku, nic víc. */
export const ALT = {
  cs: {
    heroLeto: 'Villa Rudolf v plném letním slunci — žlutá vila se zelenou střechou mezi vzrostlými stromy, zahrada s dětským hřištěm a modrá obloha',
    heroZima: 'Villa Rudolf v plném zimním slunci — žlutá vila mezi zasněženými stromy, čerstvý sníh a modrá obloha',
    lyzovani: 'Villa Rudolf v zimě — zasněžená zahrada a prohrnutá cesta k domu',
    arealLeto: 'Villa Rudolf za dne — altán, dům, zastřešený bazén, trampolína a hřiště v celém oploceném areálu',
    arealZima: 'Villa Rudolf a celý zasněžený pozemek za oplocením',
    bazen: 'Zastřešený vyhřívaný bazén — pohled pod střechou bazénu',
    lyzarna: 'Lyžárna ve Villa Rudolf — stojany na lyže a držáky na boty',
    sauna: 'Uvnitř finské sauny — lavice ze světlého dřeva a kamna',
    kuchyne: 'Plně vybavená kuchyně a velký dřevěný stůl pro celou skupinu',
    ohniste: 'Nasvícené ohniště s gabionovou stěnou po setmění',
    altan: 'Krytý altán se dvěma elektrickými grily a stolem pro celou skupinu',
    hriste: 'Dětské hřiště s prolézačkou a lanovými prvky u domu',
    kulecnik: 'Kulečníkový stůl v apartmá Suite',
    obyvak: 'Obývací část apartmá Suite — dlouhá sedací souprava pod trámy',
    vecerLeto: 'Pohled z okna druhého patra Villa Rudolf za soumraku — nasvícený zastřešený bazén, ohniště a altán',
    vecerZima: 'Villa Rudolf — vila v noci se sněhem a měsícem',
  },
  de: {
    heroLeto: 'Villa Rudolf in der Sommersonne — gelbe Villa mit grünem Dach zwischen alten Bäumen, Garten mit Spielplatz und blauer Himmel',
    heroZima: 'Villa Rudolf in der Wintersonne — gelbe Villa zwischen verschneiten Bäumen, frischer Schnee und blauer Himmel',
    lyzovani: 'Villa Rudolf im Winter — verschneiter Garten und geräumter Weg zum Haus',
    arealLeto: 'Villa Rudolf am Tag — Pavillon, Haus, überdachter Pool, Trampolin und Spielplatz auf dem ganzen eingezäunten Gelände',
    arealZima: 'Villa Rudolf und das ganze verschneite Grundstück hinter dem Zaun',
    bazen: 'Überdachter, beheizter Pool — Blick unter das Dach',
    lyzarna: 'Der Skiraum der Villa Rudolf — Ständer für Ski und Halter für Schuhe',
    sauna: 'In der finnischen Sauna — Bänke aus hellem Holz und Ofen',
    kuchyne: 'Voll ausgestattete Küche und großer Holztisch für die ganze Gruppe',
    ohniste: 'Die beleuchtete Feuerstelle mit Gabionenwand nach Einbruch der Dunkelheit',
    altan: 'Überdachter Pavillon mit zwei Elektrogrills und einem Tisch für die ganze Gruppe',
    hriste: 'Spielplatz mit Klettergerüst und Seilelementen am Haus',
    kulecnik: 'Billardtisch im Apartment Suite',
    obyvak: 'Wohnbereich des Apartment Suite — lange Sitzgruppe unter den Balken',
    vecerLeto: 'Blick aus einem Fenster im zweiten Stock der Villa Rudolf in der Dämmerung — beleuchteter überdachter Pool, Feuerstelle und Pavillon',
    vecerZima: 'Villa Rudolf bei Nacht, mit Schnee und Mond',
  },
  pl: {
    heroLeto: 'Villa Rudolf w pełnym letnim słońcu — żółta willa z zielonym dachem wśród wysokich drzew, ogród z placem zabaw i błękitne niebo',
    heroZima: 'Villa Rudolf w pełnym zimowym słońcu — żółta willa wśród ośnieżonych drzew, świeży śnieg i błękitne niebo',
    lyzovani: 'Villa Rudolf zimą — ośnieżony ogród i odśnieżona ścieżka do domu',
    arealLeto: 'Villa Rudolf za dnia — altana, dom, zadaszony basen, trampolina i plac zabaw na całym ogrodzonym terenie',
    arealZima: 'Villa Rudolf i cały ośnieżony teren za ogrodzeniem',
    bazen: 'Zadaszony podgrzewany basen — widok pod dachem basenu',
    lyzarna: 'Narciarnia w Villa Rudolf — stojaki na narty i uchwyty na buty',
    sauna: 'Wnętrze sauny fińskiej — ławy z jasnego drewna i piec',
    kuchyne: 'W pełni wyposażona kuchnia i duży drewniany stół dla całej grupy',
    ohniste: 'Oświetlone palenisko ze ścianą gabionową po zmroku',
    altan: 'Zadaszona altana z dwoma grillami elektrycznymi i stołem dla całej grupy',
    hriste: 'Plac zabaw z drabinkami i elementami linowymi przy domu',
    kulecnik: 'Stół bilardowy w apartamencie Suite',
    obyvak: 'Część dzienna apartamentu Suite — długa kanapa pod belkami',
    vecerLeto: 'Widok z okna na drugim piętrze Villa Rudolf o zmierzchu — oświetlony zadaszony basen, palenisko i altana',
    vecerZima: 'Villa Rudolf nocą, w śniegu i przy księżycu',
  },
  en: {
    heroLeto: 'Villa Rudolf in full summer sun — a yellow villa with a green roof among mature trees, a garden with a playground and blue sky',
    heroZima: 'Villa Rudolf in full winter sun — a yellow villa among snow-covered trees, fresh snow and blue sky',
    lyzovani: 'Villa Rudolf in winter — a snowy garden and a cleared path to the house',
    arealLeto: 'Villa Rudolf by day — gazebo, house, covered pool, trampoline and playground across the fenced grounds',
    arealZima: 'Villa Rudolf and the whole snow-covered grounds behind the fence',
    bazen: 'The covered, heated pool — a view under the roof',
    lyzarna: 'The ski room at Villa Rudolf — racks for skis and holders for boots',
    sauna: 'Inside the Finnish sauna — light wooden benches and the stove',
    kuchyne: 'Fully equipped kitchen and a big wooden table for the whole group',
    ohniste: 'The fire pit with its gabion wall, lit after dark',
    altan: 'Covered gazebo with two electric grills and a table for the whole group',
    hriste: 'Playground with a climbing frame and rope elements by the house',
    kulecnik: 'Billiard table in the Apartment Suite',
    obyvak: 'Living area of the Apartment Suite — a long sofa under the beams',
    vecerLeto: 'View from a second-floor window of Villa Rudolf at dusk — the lit covered pool, fire pit and gazebo',
    vecerZima: 'Villa Rudolf at night, with snow and moonlight',
  },
};

/* ---------- schema.org (JSON-LD v <head>) ----------
   VacationRental = podtyp LodgingBusiness. Jen fakta, která jsou na stránce vidět: adresa, telefon
   a dřívější název (patička), kapacita, lůžka a vybavení (Dům, Vybavení, rozpis lůžek), check-in,
   psi a Wi-Fi (blok před rezervací), ceník. Hodnocení (aggregateRating) schválně chybí — vlastní
   hodnocení Google na stránce nezobrazí a profil na Mapách ještě není náš.
   "description" = meta.desc z T, "priceRange" počítá generátor z VR_PRICING (ceník). */
export const SCHEMA_ZAKLAD = {
  name: 'Villa Rudolf',
  alternateName: ['Villa Rudolf, Svoboda nad Úpou', 'Vila Rudolf', 'Rudolfův dvůr'],
  image: [
    'https://villarudolf.com/media/photos/hero-summer.jpg',
    'https://villarudolf.com/media/photos/hero-winter.jpg',
  ],
  telephone: '+420775220785',
  email: 'rezervace@villarudolf.com',
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Luční 519',
    postalCode: '542 24',
    addressLocality: 'Svoboda nad Úpou',
    addressRegion: 'Královéhradecký kraj',
    addressCountry: 'CZ',
  },
  geo: { '@type': 'GeoCoordinates', latitude: 50.6254426, longitude: 15.8135792 },
  checkinTime: '15:00:00',
  checkoutTime: '10:00:00',
  petsAllowed: true,
  numberOfRooms: 7,
  sameAs: [
    'https://www.instagram.com/villarudolfretreat/',
    'https://www.airbnb.com/rooms/1122389326464885565',
    'https://www.booking.com/hotel/cz/villa-with-a-covered-pool-park-and-playground.html',
    'https://www.e-chalupy.cz/ubytovani-svoboda-nad-upou-vila-rudolf-o18852',
  ],
};
/* Lůžka podle rozpisu (kap. 3): 7 manželských, 5 jednolůžek, 3 výsuvné přistýlky. */
export const SCHEMA_LUZKA = { manzelska: 7, jednoluzko: 5, pristylka: 3 };

export const SCHEMA_TEXTY = {
  cs: {
    dum: 'Villa Rudolf – celý dům',
    luzka: { manzelska: 'manželská postel', jednoluzko: 'jednolůžko', pristylka: 'přistýlka' },
    vybaveni: [
      'Privátní finská sauna',
      'Vyhřívaný zastřešený bazén, květen až konec září',
      'Lyžárna',
      'Dvě plnohodnotné kuchyně',
      'Altán se dvěma elektrickými grily',
      'Ohniště s gabionovou stěnou',
      'Dětské hřiště, trampolína a stolní tenis',
      'Kulečník',
      'Wi-Fi v domě i na pozemku',
      'Parkování zdarma na pozemku',
    ],
    cena: '{od}–{do} Kč za noc za celý dům',
    stranka: 'Domovská stránka',
  },
  de: {
    dum: 'Villa Rudolf – das ganze Haus',
    luzka: { manzelska: 'Doppelbett', jednoluzko: 'Einzelbett', pristylka: 'Zustellbett' },
    vybaveni: [
      'Private finnische Sauna',
      'Beheizter, überdachter Pool, Mai bis Ende September',
      'Skiraum',
      'Zwei voll ausgestattete Küchen',
      'Pavillon mit zwei Elektrogrills',
      'Feuerstelle mit Gabionenwand',
      'Spielplatz, Trampolin und Tischtennis',
      'Billardtisch',
      'WLAN im Haus und auf dem Grundstück',
      'Kostenlose Parkplätze auf dem Grundstück',
    ],
    cena: '{od}–{do} Kč pro Nacht für das ganze Haus',
    stranka: 'Startseite',
  },
  pl: {
    dum: 'Villa Rudolf – cały dom',
    luzka: { manzelska: 'łóżko małżeńskie', jednoluzko: 'łóżko pojedyncze', pristylka: 'dostawka' },
    vybaveni: [
      'Prywatna sauna fińska',
      'Podgrzewany zadaszony basen, od maja do końca września',
      'Narciarnia',
      'Dwie w pełni wyposażone kuchnie',
      'Altana z dwoma grillami elektrycznymi',
      'Palenisko ze ścianą gabionową',
      'Plac zabaw, trampolina i tenis stołowy',
      'Stół bilardowy',
      'Wi-Fi w domu i na terenie',
      'Bezpłatny parking na terenie posesji',
    ],
    cena: '{od}–{do} Kč za noc za cały dom',
    stranka: 'Strona główna',
  },
  en: {
    dum: 'Villa Rudolf – the whole house',
    luzka: { manzelska: 'double bed', jednoluzko: 'single bed', pristylka: 'extra bed' },
    vybaveni: [
      'Private Finnish sauna',
      'Heated covered pool, May to the end of September',
      'Ski room',
      'Two fully equipped kitchens',
      'Gazebo with two electric grills',
      'Fire pit with a gabion wall',
      'Playground, trampoline and table tennis',
      'Billiard table',
      'Wi-Fi in the house and on the grounds',
      'Free parking on the grounds',
    ],
    cena: '{od}–{do} Kč per night for the whole house',
    stranka: 'Home page',
  },
};

/* ---------- Časté dotazy (/faq/, /de/faq/, /pl/faq/, /en/faq/) ----------
   Rám stránky; otázky a odpovědi jsou v FAQ níž. {email} a {telefon} dosadí generátor z VR_CONTACT. */
export const FAQ_STRANKA = {
  cs: {
    title: 'Časté dotazy | Villa Rudolf, Krkonoše',
    desc: 'Na co se hosté Villy Rudolf ptají před rezervací i před příjezdem: volné termíny, cena za celý dům, minimální počet nocí, ložnice, pes, bazén, sauna, gril, příjezd a poplatky.',
    brand: 'KRKONOŠE', eyebrow: 'Villa Rudolf · Svoboda nad Úpou', h1: 'Časté dotazy',
    intro: 'Na co se nás hosté ptají nejčastěji — před rezervací i před příjezdem. Co tu nenajdete, napište nám, odpovídáme rychle.',
    dalsi: 'Nenašli jste odpověď?',
    kontakt: 'Napište na {email}, nebo zavolejte či pošlete WhatsApp na {telefon}. Cenu pro váš termín spočítá kalendář na hlavní stránce.',
    zpet: 'Zpět na hlavní stránku',
  },
  de: {
    title: 'Häufige Fragen | Villa Rudolf, Riesengebirge',
    desc: 'Was Gäste der Villa Rudolf vor der Buchung und vor der Anreise fragen: freie Termine, Preis für das ganze Haus, Mindestaufenthalt, Schlafzimmer, Hund, Pool, Sauna, Grill, Anreise und Gebühren.',
    brand: 'KRKONOŠE', eyebrow: 'Villa Rudolf · Svoboda nad Úpou', h1: 'Häufige Fragen',
    intro: 'Was uns Gäste am häufigsten fragen — vor der Buchung und vor der Anreise. Was hier fehlt, schreibt uns einfach, wir antworten schnell.',
    dalsi: 'Keine Antwort gefunden?',
    kontakt: 'Schreibt an {email} oder ruft an bzw. schickt eine WhatsApp an {telefon}. Den Preis für euren Termin rechnet der Kalender auf der Startseite aus.',
    zpet: 'Zurück zur Startseite',
  },
  pl: {
    title: 'Częste pytania | Villa Rudolf, Karkonosze',
    desc: 'O co goście Villa Rudolf pytają przed rezerwacją i przed przyjazdem: wolne terminy, cena za cały dom, minimalna liczba nocy, sypialnie, pies, basen, sauna, grill, przyjazd i opłaty.',
    brand: 'KRKONOŠE', eyebrow: 'Villa Rudolf · Svoboda nad Úpou', h1: 'Częste pytania',
    intro: 'O co goście pytają nas najczęściej — przed rezerwacją i przed przyjazdem. Jeśli czegoś tu brakuje, napiszcie do nas, odpowiadamy szybko.',
    dalsi: 'Nie ma tu odpowiedzi?',
    kontakt: 'Napiszcie na {email} albo zadzwońcie lub wyślijcie wiadomość WhatsApp na {telefon}. Cenę dla Waszego terminu policzy kalendarz na stronie głównej.',
    zpet: 'Powrót na stronę główną',
  },
  en: {
    title: 'FAQ | Villa Rudolf, Krkonoše',
    desc: 'What guests ask before booking Villa Rudolf and before they arrive: free dates, the price for the whole house, minimum stay, bedrooms, dogs, pool, sauna, grill, arrival and fees.',
    brand: 'KRKONOŠE', eyebrow: 'Villa Rudolf · Svoboda nad Úpou', h1: 'Frequently asked questions',
    intro: 'What guests ask us most often — before they book and before they arrive. If something is missing, just write to us, we reply quickly.',
    dalsi: 'Didn’t find your answer?',
    kontakt: 'Write to {email}, or call or WhatsApp {telefon}. The calendar on the home page works out the price for your dates.',
    zpet: 'Back to the home page',
  },
};

/* ---------- Časté dotazy — otázky a odpovědi ----------
   OTÁZKY jsou ze skutečných dotazů hostů v Gmailu (Booking, FeWo, e-chalupy, web, přímé e-maily;
   98 vláken, 62 s dotazem, rozbor 8. 10. 2026 — u každé je `zdroj` s tématem a počtem vláken).
   ODPOVĚDI jsou jen z text-villa-rudolf.md, kap. 3 (a z bloků A–L, které z ní vycházejí); co tam
   není, tu není — šlo to Pavlovi jako otázka (platba, storno, kauce, povlečení, klíče, dřívější
   příjezd, oplocení…, seznam v PR). Na lyžování, dopravu, praní ani Wi-Fi se hosté v poště
   neptali, proto tu nejsou.
   Zástupné znaky: {cena:úroveň}, {noci:úroveň}, {uklid}, {poplatek}, {kauce} z VR_PRICING,
   {domu} = homepage téhož jazyka, {planovac} = plánovač výletů. ŽÁDNÁ CENA SE NEPÍŠE RUČNĚ. */
export const FAQ = [
  {
    nazev: { cs: 'Rezervace a cena', de: 'Buchung und Preis', pl: 'Rezerwacja i cena', en: 'Booking and price' },
    otazky: [
      {
        id: 'volny-termin', zdroj: 'téma 2 — je termín volný? (10 vláken)',
        q: { cs: 'Jak zjistíme, jestli je náš termín volný?', de: 'Wie sehen wir, ob unser Termin frei ist?', pl: 'Jak sprawdzić, czy nasz termin jest wolny?', en: 'How can we tell whether our dates are free?' },
        a: {
          cs: 'Volné termíny ukazuje kalendář na <a href="{domu}#rezervace">hlavní stránce</a>. Vyberete v něm příjezd a odjezd, uvidíte rozpis ceny a pošlete nám nezávaznou žádost o pobyt. Termín vám potvrdíme osobně.',
          de: 'Freie Termine zeigt der Kalender auf der <a href="{domu}#rezervace">Startseite</a>. Dort wählt ihr An- und Abreise, seht die Preisaufstellung und sendet uns eine unverbindliche Aufenthaltsanfrage. Den Termin bestätigen wir euch persönlich.',
          pl: 'Wolne terminy pokazuje kalendarz na <a href="{domu}#rezervace">stronie głównej</a>. Wybierzcie w nim przyjazd i wyjazd, zobaczycie rozpiskę ceny i wyślecie nam niezobowiązującą prośbę o pobyt. Termin potwierdzimy osobiście.',
          en: 'The calendar on the <a href="{domu}#rezervace">home page</a> shows the free dates. Pick your arrival and departure there, see the price breakdown and send us a non-binding stay request. We’ll confirm your dates personally.',
        },
      },
      {
        id: 'cena', zdroj: 'téma 4 — cena, nabídka, cena za pokoj (8 vláken)',
        q: { cs: 'Kolik stojí pobyt?', de: 'Was kostet ein Aufenthalt?', pl: 'Ile kosztuje pobyt?', en: 'How much does a stay cost?' },
        a: {
          cs: 'Platí se za celý dům a noc, ne za osobu ani za pokoj. Při rezervaci napřímo: {cena:mimo} mimo sezónu, {cena:zimni} v zimě, o svátcích a v létě, {cena:spicka} ve vybraných týdnech v únoru a na začátku ledna, {cena:vanoce} o Vánocích a {cena:silvestr} na Silvestra. Přesnou cenu pro váš termín spočítá kalendář na <a href="{domu}#rezervace">hlavní stránce</a>.',
          de: 'Bezahlt wird für das ganze Haus pro Nacht, nicht pro Person oder Zimmer. Bei Direktbuchung: {cena:mimo} in der Nebensaison, {cena:zimni} im Winter, an Feiertagen und im Sommer, {cena:spicka} in ausgewählten Wochen im Februar und Anfang Januar, {cena:vanoce} an Weihnachten und {cena:silvestr} an Silvester. Den genauen Preis für euren Termin rechnet der Kalender auf der <a href="{domu}#rezervace">Startseite</a> aus.',
          pl: 'Płaci się za cały dom za noc, nie za osobę ani za pokój. Przy rezerwacji bezpośredniej: {cena:mimo} poza sezonem, {cena:zimni} zimą, w święta i latem, {cena:spicka} w wybranych tygodniach w lutym i na początku stycznia, {cena:vanoce} w Boże Narodzenie i {cena:silvestr} w Sylwestra. Dokładną cenę dla Waszego terminu policzy kalendarz na <a href="{domu}#rezervace">stronie głównej</a>.',
          en: 'You pay for the whole house per night, not per person or per room. When you book direct: {cena:mimo} off-season, {cena:zimni} in winter, over public holidays and in summer, {cena:spicka} in selected weeks in February and early January, {cena:vanoce} over Christmas and {cena:silvestr} over New Year. The calendar on the <a href="{domu}#rezervace">home page</a> works out the exact price for your dates.',
        },
      },
      {
        id: 'minimum', zdroj: 'téma 14 — minimální délka pobytu (3 vlákna)',
        q: { cs: 'Na kolik nocí nejméně se dá dům pronajmout?', de: 'Wie viele Nächte muss man mindestens buchen?', pl: 'Na ile nocy minimalnie można wynająć dom?', en: 'What is the minimum stay?' },
        a: {
          cs: 'Mimo sezónu a v zimě {noci:mimo}, o svátcích {noci:svatky}, v létě {noci:letni}, o Vánocích a na Silvestra {noci:vanoce}.',
          de: 'In der Nebensaison und im Winter {noci:mimo}, an Feiertagen {noci:svatky}, im Sommer {noci:letni}, an Weihnachten und Silvester {noci:vanoce}.',
          pl: 'Poza sezonem i zimą {noci:mimo}, w święta {noci:svatky}, latem {noci:letni}, w Boże Narodzenie i Sylwestra {noci:vanoce}.',
          en: 'Off-season and in winter {noci:mimo}, over public holidays {noci:svatky}, in summer {noci:letni}, over Christmas and New Year {noci:vanoce}.',
        },
      },
      {
        id: 'cely-dum', zdroj: 'téma 9 — bude dům jen náš? (5 vláken)',
        q: { cs: 'Pronajímáte celý dům, nebo i jednotlivé pokoje?', de: 'Vermietet ihr das ganze Haus oder auch einzelne Zimmer?', pl: 'Wynajmujecie cały dom czy też pojedyncze pokoje?', en: 'Do you rent out the whole house or single rooms too?' },
        a: {
          cs: 'Vždycky celý dům i s pozemkem a vždycky jen jedné skupině — žádní cizí hosté, žádná recepce. Pohodlně se tu vyspí až dvaadvacet lidí v sedmi ložnicích.',
          de: 'Immer das ganze Haus mit Grundstück und immer nur an eine Gruppe — keine fremden Gäste, keine Rezeption. Bis zu zweiundzwanzig Personen schlafen bequem in sieben Schlafzimmern.',
          pl: 'Zawsze cały dom z posesją i zawsze tylko jednej grupie — żadnych obcych gości, żadnej recepcji. Wygodnie śpi tu do dwudziestu dwóch osób w siedmiu sypialniach.',
          en: 'Always the whole house with its grounds, and always to just one group — no other guests, no reception. Up to twenty-two people sleep comfortably in seven bedrooms.',
        },
      },
    ],
  },
  {
    nazev: { cs: 'Dům, děti a pes', de: 'Haus, Kinder und Hund', pl: 'Dom, dzieci i pies', en: 'The house, children and dogs' },
    otazky: [
      {
        id: 'loznice', zdroj: 'téma 9 — rozdělení ložnic (5 vláken)',
        q: { cs: 'Jak jsou rozdělené ložnice a postele?', de: 'Wie sind Schlafzimmer und Betten aufgeteilt?', pl: 'Jak rozmieszczone są sypialnie i łóżka?', en: 'How are the bedrooms and beds split?' },
        a: {
          cs: 'Devatenáct pevných lůžek a tři plnohodnotné přistýlky v sedmi ložnicích, patrové postele tu nejsou. V přízemí jsou Pokoje 1, 2 a 3, v prvním patře Pokoj 4 a apartmá Suite, které má další dvě ložnice v podkroví. Apartmá Suite pojme až 10 hostů (tři ložnice s manželskými postelemi, dvě samostatná lůžka a jedno lůžko s výsuvným druhým), Pokoj 1 a Pokoj 4 po dvou (manželská postel), Pokoj 2 a Pokoj 3 po čtyřech (manželská postel a dvě samostatná lůžka). Ke každému pokoji patří koupelna se sprchou a WC.',
          de: 'Neunzehn feste Betten und drei vollwertige Zustellbetten in sieben Schlafzimmern, Etagenbetten gibt es keine. Im Erdgeschoss liegen Zimmer 1, 2 und 3, im ersten Stock Zimmer 4 und das Apartment Suite, das zwei weitere Schlafzimmer im Dachgeschoss hat. Das Apartment Suite fasst bis zu 10 Gäste (drei Schlafzimmer mit Doppelbetten, zwei Einzelbetten und ein Bett mit ausziehbarem zweitem Bett), Zimmer 1 und Zimmer 4 je zwei (Doppelbett), Zimmer 2 und Zimmer 3 je vier (Doppelbett und zwei Einzelbetten). Zu jedem Zimmer gehört ein Bad mit Dusche und WC.',
          pl: 'Dziewiętnaście stałych łóżek i trzy pełnowymiarowe dostawki w siedmiu sypialniach, łóżek piętrowych nie ma. Na parterze są Pokoje 1, 2 i 3, na pierwszym piętrze Pokój 4 i apartament Suite, który ma jeszcze dwie sypialnie na poddaszu. Apartament Suite mieści do 10 gości (trzy sypialnie z łóżkami małżeńskimi, dwa pojedyncze łóżka i jedno łóżko z wysuwanym drugim), Pokój 1 i Pokój 4 po dwie osoby (łóżko małżeńskie), Pokój 2 i Pokój 3 po cztery (łóżko małżeńskie i dwa pojedyncze łóżka). Do każdego pokoju należy łazienka z prysznicem i WC.',
          en: 'Nineteen fixed beds and three full-size extra beds in seven bedrooms, with no bunk beds. Rooms 1, 2 and 3 are on the ground floor; on the first floor are Room 4 and the Apartment Suite, which has two more bedrooms in the attic. The Apartment Suite sleeps up to 10 (three bedrooms with double beds, two single beds and one bed with a pull-out second bed), Room 1 and Room 4 two each (double bed), Room 2 and Room 3 four each (double bed and two single beds). Every bedroom comes with a bathroom with a shower and a WC.',
        },
      },
      {
        id: 'postylka', zdroj: 'téma 15 — děti, postýlka, přistýlka (3 vlákna)',
        q: { cs: 'Máte dětskou postýlku?', de: 'Gibt es ein Kinderbett?', pl: 'Czy jest łóżeczko dla dziecka?', en: 'Do you have a cot?' },
        a: {
          cs: 'Ano, dětskou postýlku dostanete zdarma. Tři přistýlky jsou plnohodnotné a patrové postele tu nejsou. Pro děti je na pozemku hřiště s prolézačkami, skluzavkou, houpačkami a lanovými prvky, k tomu trampolína a ping-pong, a bazén se dá zamknout.',
          de: 'Ja, ein Kinderbett bekommt ihr kostenlos. Die drei Zustellbetten sind vollwertig, Etagenbetten gibt es keine. Für die Kinder gibt es auf dem Grundstück einen Spielplatz mit Klettergerüst, Rutsche, Schaukeln und Seilelementen, dazu ein Trampolin und eine Tischtennisplatte, und der Pool lässt sich abschließen.',
          pl: 'Tak, łóżeczko dla dziecka dostaniecie bezpłatnie. Trzy dostawki są pełnowymiarowe, a łóżek piętrowych nie ma. Dla dzieci jest na terenie plac zabaw z drabinkami, zjeżdżalnią, huśtawkami i elementami linowymi, do tego trampolina i ping-pong, a basen można zamknąć na klucz.',
          en: 'Yes, a cot is free. The three extra beds are full-size and there are no bunk beds. For children there is a playground on the grounds with climbing frames, a slide, swings and rope elements, plus a trampoline and table tennis, and the pool can be locked.',
        },
      },
      {
        id: 'pes', zdroj: 'téma 11 — pes (5 vláken, pes u 8 z 50 poptávek)',
        q: { cs: 'Můžeme vzít psa?', de: 'Dürfen wir unseren Hund mitbringen?', pl: 'Czy możemy przyjechać z psem?', en: 'Can we bring our dog?' },
        a: {
          cs: 'Ano, pes je vítaný. Poplatek za psa najdete v ceníku na <a href="{domu}#rezervace">hlavní stránce</a>.',
          de: 'Ja, Hunde sind willkommen. Die Gebühr für den Hund findet ihr in der Preisliste auf der <a href="{domu}#rezervace">Startseite</a>.',
          pl: 'Tak, psy są mile widziane. Opłatę za psa znajdziecie w cenniku na <a href="{domu}#rezervace">stronie głównej</a>.',
          en: 'Yes, dogs are welcome. You’ll find the dog fee in the price list on the <a href="{domu}#rezervace">home page</a>.',
        },
      },
      {
        id: 'kuchyne', zdroj: 'téma 8 — kávovar a vybavení kuchyně (5 vláken)',
        q: { cs: 'Jaký je v kuchyni kávovar a co dalšího tam je?', de: 'Welche Kaffeemaschine gibt es und was ist sonst in der Küche?', pl: 'Jaki ekspres jest w kuchni i co jeszcze tam jest?', en: 'What coffee machine is there, and what else is in the kitchen?' },
        a: {
          cs: 'Kuchyně jsou dvě a obě plnohodnotné — každá má troubu, myčku, dřez a kompletní nádobí. Ve velké kuchyni v přízemí jsou navíc dvě mikrovlnky, velká lednice, kombinovaná lednice s mrazákem, vinotéka a kávovar Nespresso a hned vedle velký dřevěný stůl pro celou partu. V apartmá Suite je mikrovlnka, menší lednice a druhý kávovar Nespresso.',
          de: 'Küchen gibt es zwei, und beide sind voll ausgestattet — jede mit Backofen, Spülmaschine, Spüle und komplettem Geschirr. In der großen Küche im Erdgeschoss stehen zusätzlich zwei Mikrowellen, ein großer Kühlschrank, eine Kühl-Gefrier-Kombination, ein Weinkühlschrank und eine Nespresso-Maschine, gleich daneben ein großer Holztisch für die ganze Runde. Im Apartment Suite gibt es eine Mikrowelle, einen kleineren Kühlschrank und eine zweite Nespresso-Maschine.',
          pl: 'Kuchnie są dwie i obie w pełni wyposażone — każda ma piekarnik, zmywarkę, zlew i komplet naczyń. W dużej kuchni na parterze są dodatkowo dwie mikrofalówki, duża lodówka, lodówka z zamrażarką, chłodziarka do wina i ekspres Nespresso, a tuż obok duży drewniany stół dla całej grupy. W apartamencie Suite jest mikrofalówka, mniejsza lodówka i drugi ekspres Nespresso.',
          en: 'There are two kitchens and both are fully equipped — each with an oven, a dishwasher, a sink and a complete set of cookware. The big ground-floor kitchen adds two microwaves, a large fridge, a fridge-freezer, a wine cooler and a Nespresso machine, with a big wooden table for the whole group right beside it. The Apartment Suite has a microwave, a smaller fridge and a second Nespresso machine.',
        },
      },
    ],
  },
  {
    nazev: { cs: 'Bazén, sauna a zahrada', de: 'Pool, Sauna und Garten', pl: 'Basen, sauna i ogród', en: 'Pool, sauna and garden' },
    otazky: [
      {
        id: 'bazen', zdroj: 'téma 7 — bazén v našem termínu, vyhřívání (5 vláken)',
        q: { cs: 'Bude v našem termínu bazén v provozu? Je vyhřívaný?', de: 'Ist der Pool in unserem Zeitraum in Betrieb? Ist er beheizt?', pl: 'Czy basen będzie czynny w naszym terminie? Czy jest podgrzewany?', en: 'Will the pool be open during our stay? Is it heated?' },
        a: {
          cs: 'Bazén je vyhřívaný a zastřešený, takže se koupete, i když venku prší. Vyhřívá se od května do konce září a v létě drží kolem 27 °C. Na rovinu: na začátku a na konci sezony bývá voda chladnější — poslední slovo má počasí. V zimě je bazén mimo provoz. Když máte malé děti, dá se zamknout.',
          de: 'Der Pool ist beheizt und überdacht — ihr schwimmt also auch, wenn es draußen regnet. Beheizt wird von Mai bis Ende September, im Sommer hat das Wasser um die 27 °C. Ganz ehrlich: zu Saisonbeginn und -ende ist das Wasser kühler — das letzte Wort hat das Wetter. Im Winter ist der Pool außer Betrieb. Wenn ihr kleine Kinder dabeihabt, lässt er sich abschließen.',
          pl: 'Basen jest podgrzewany i zadaszony, więc można pływać nawet wtedy, gdy pada. Podgrzewany jest od maja do końca września, latem woda ma około 27 °C. Uczciwie: na początku i na końcu sezonu woda bywa chłodniejsza — ostatnie słowo ma pogoda. Zimą basen jest nieczynny. Gdy macie małe dzieci, można go zamknąć na klucz.',
          en: 'The pool is heated and covered, so you swim even when it rains. It is heated from May to the end of September and sits around 27 °C in summer. To be honest: early and late in the season the water can be cooler — the weather has the last word. In winter the pool is closed. If you have small children, it can be locked.',
        },
      },
      {
        id: 'sauna', zdroj: 'téma 16 — sauna, je v ceně? (3 vlákna)',
        q: { cs: 'Je sauna v ceně?', de: 'Ist die Sauna im Preis enthalten?', pl: 'Czy sauna jest w cenie?', en: 'Is the sauna included?' },
        a: {
          cs: 'Ano. Sauna je finská a jen vaše, s předsálím a sprchou. Můžete do ní kdykoli, bez rezervací a časových slotů.',
          de: 'Ja. Die Sauna ist finnisch und gehört nur euch, mit Vorraum und Dusche. Ihr könnt jederzeit hinein, ohne Reservierung und ohne Zeitfenster.',
          pl: 'Tak. Sauna jest fińska i tylko Wasza, z przedsionkiem i prysznicem. Możecie z niej korzystać kiedy chcecie, bez rezerwacji i bez przydzielonych godzin.',
          en: 'Yes. The sauna is Finnish and yours alone, with a changing room and a shower. You can use it whenever you like, with no booking and no time slots.',
        },
      },
      {
        id: 'gril', zdroj: 'téma 12 — gril a ohniště (5 vláken)',
        q: { cs: 'Jaký je tam gril?', de: 'Was für einen Grill gibt es?', pl: 'Jaki jest tam grill?', en: 'What kind of grill is there?' },
        a: {
          cs: 'Ve velkém altánu pro dvacet lidí jsou dva velké elektrické grily a stůl, u kterého se sejde celá parta. Griluje se i v dešti a sněhu. Večery pak patří ohništi s gabionovou stěnou.',
          de: 'Im großen Pavillon für zwanzig Personen stehen zwei große Elektrogrills und ein Tisch, an dem die ganze Runde Platz hat. Gegrillt wird auch bei Regen und Schnee. Die Abende gehören dann der Feuerstelle mit der Gabionenwand.',
          pl: 'W dużej altanie dla dwudziestu osób są dwa duże grille elektryczne i stół, przy którym zmieści się cała grupa. Grilluje się nawet w deszczu i śniegu. Wieczory należą potem do paleniska ze ścianą gabionową.',
          en: 'The big gazebo for twenty has two large electric grills and a table where the whole group sits together. You can grill in rain or snow. The evenings then belong to the fire pit with its gabion wall.',
        },
      },
      {
        id: 'hudba', zdroj: 'téma 25 — oslava, hudba (1 vlákno; pravidlo z bloku J)',
        q: { cs: 'Můžeme na zahradě pouštět hudbu?', de: 'Dürfen wir im Garten Musik laufen lassen?', pl: 'Czy możemy puszczać muzykę w ogrodzie?', en: 'Can we play music in the garden?' },
        a: {
          cs: 'Kvůli sousedům na zahradě žádné reproduktory ani jiná zvuková aparatura a večer žádná hudba. Posedět u ohně, povídat si a smát se klidně do noci je v pořádku — to k večerům tady patří.',
          de: 'Wegen der Nachbarn bitte keine Lautsprecher oder andere Musikanlagen im Garten und abends keine Musik. Am Feuer sitzen, reden und lachen bis spät in die Nacht ist in Ordnung — genau dafür sind die Abende hier da.',
          pl: 'Ze względu na sąsiadów w ogrodzie nie używamy głośników ani innego sprzętu nagłaśniającego, a wieczorem nie puszczamy muzyki. Siedzenie przy ognisku, rozmowy i śmiech do późna są w porządku — to część tutejszych wieczorów.',
          en: 'Because of the neighbours: no speakers or any other sound system in the garden, and no music in the evening. Sitting by the fire, talking and laughing late into the night is absolutely fine — that is what evenings here are for.',
        },
      },
    ],
  },
  {
    nazev: { cs: 'Před příjezdem', de: 'Vor der Anreise', pl: 'Przed przyjazdem', en: 'Before you arrive' },
    otazky: [
      {
        id: 'prijezd', zdroj: 'téma 1 — příjezd, od kolika (11 vláken)',
        q: { cs: 'Od kolika můžeme přijet a do kdy odjet?', de: 'Ab wann können wir anreisen und bis wann abreisen?', pl: 'Od której możemy przyjechać i do której wyjechać?', en: 'What time can we arrive and when do we leave?' },
        a: {
          cs: 'Check-in je od 15:00, check-out do 10:00.',
          de: 'Check-in ist ab 15:00, Check-out bis 10:00.',
          pl: 'Zameldowanie od 15:00, wymeldowanie do 10:00.',
          en: 'Check-in is from 15:00, check-out by 10:00.',
        },
      },
      {
        id: 'poplatky', zdroj: 'téma 5 — poplatek obci a co se platí na místě (8 vláken), téma 18 — kauce',
        q: { cs: 'Co se platí navíc k ceně za noc?', de: 'Was kommt zum Übernachtungspreis noch dazu?', pl: 'Co płaci się dodatkowo do ceny za noc?', en: 'What do you pay on top of the nightly price?' },
        a: {
          cs: 'Úklid {uklid} za pobyt a poplatek obci {poplatek} za dospělého a noc; poplatek za psa je v ceníku. Kauce je {kauce}. Energie jsou v ceně, sauna taky a parkování na pozemku je zdarma.',
          de: 'Die Endreinigung von {uklid} pro Aufenthalt und die Kurtaxe von {poplatek} pro Erwachsenen und Nacht; die Gebühr für einen Hund steht in der Preisliste. Die Kaution beträgt {kauce}. Nebenkosten sind im Preis enthalten, die Sauna ebenfalls, und Parken auf dem Grundstück ist kostenlos.',
          pl: 'Sprzątanie {uklid} za pobyt i opłata miejscowa {poplatek} za osobę dorosłą i noc; opłata za psa jest w cenniku. Kaucja wynosi {kauce}. Media są wliczone w cenę, sauna również, a parking na terenie jest bezpłatny.',
          en: 'Cleaning at {uklid} per stay and the municipal tax of {poplatek} per adult per night; the dog fee is in the price list. The deposit is {kauce}. Utilities are included in the price, so is the sauna, and parking on the grounds is free.',
        },
      },
      {
        id: 'parkovani', zdroj: 'téma 27 — auta a obytné auto na pozemku (1 vlákno)',
        q: { cs: 'Kolik aut zaparkujeme?', de: 'Wie viele Autos können wir parken?', pl: 'Ile samochodów możemy zaparkować?', en: 'How many cars can we park?' },
        a: {
          cs: 'Parkuje se zdarma přímo na pozemku, za vlastní bránou. Sedm aut tam stojí v pohodě; když je potřeba, vejde se jich deset až jedenáct, jen už je to těsné.',
          de: 'Geparkt wird kostenlos direkt auf dem Grundstück, hinter dem eigenen Tor. Sieben Autos stehen dort bequem; wenn es sein muss, passen zehn bis elf hin, dann wird es nur eng.',
          pl: 'Parkuje się bezpłatnie na terenie posesji, za własną bramą. Siedem samochodów stoi wygodnie; w razie potrzeby zmieści się dziesięć–jedenaście, tylko jest już ciasno.',
          en: 'Parking is free right on the grounds, behind your own gate. Seven cars park comfortably; ten or eleven fit when you need them to, it just gets tight.',
        },
      },
      {
        id: 'nakupy', zdroj: 'téma 17 — nákupy a restaurace (3 vlákna)',
        q: { cs: 'Kde nakoupíme?', de: 'Wo können wir einkaufen?', pl: 'Gdzie zrobimy zakupy?', en: 'Where can we do our shopping?' },
        a: {
          cs: 'Obchod, restaurace, bowling i půjčovny jsou sto padesát metrů od brány, v centru Svobody nad Úpou.',
          de: 'Laden, Restaurants, Bowling und Verleih sind 150 Meter vom Tor entfernt, im Zentrum von Svoboda nad Úpou.',
          pl: 'Sklep, restauracje, kręgielnia i wypożyczalnie są 150 metrów od bramy, w centrum Svobody nad Úpą.',
          en: 'Shop, restaurants, bowling and rentals are 150 metres from the gate, in the centre of Svoboda nad Úpou.',
        },
      },
      {
        id: 'vylety', zdroj: 'téma 26 — tipy na výlety (1 vlákno)',
        q: { cs: 'Poradíte nám s výlety?', de: 'Habt ihr Tipps für Ausflüge?', pl: 'Pomożecie nam z wycieczkami?', en: 'Can you help us plan trips?' },
        a: {
          cs: 'Ke každému pobytu dostanete odkaz na náš plánovač výletů — ověřené cíle do hodiny od domu, s mapou, filtry a tipem na konkrétní den podle počasí. Projít si ho můžete už teď: <a href="{planovac}">plánovač výletů</a>.',
          de: 'Zu jeder Buchung bekommt ihr den Link zu unserem Ausflugsplaner — erprobte Ziele im Umkreis einer Stunde, mit Karte, Filtern und einem Tipp für den konkreten Tag je nach Wetter. Ansehen könnt ihr ihn schon jetzt: <a href="{planovac}">Ausflugsplaner</a>.',
          pl: 'Do każdej rezerwacji dostaniecie link do naszego planera wycieczek — sprawdzone cele w promieniu godziny od domu, z mapą, filtrami i podpowiedzią na konkretny dzień według pogody. Możecie go przejrzeć już teraz: <a href="{planovac}">planer wycieczek</a>.',
          en: 'Every booking comes with a link to our trip planner — tried-and-tested places within an hour of the house, with a map, filters and a suggestion for a particular day based on the weather. You can browse it right now: <a href="{planovac}">trip planner</a>.',
        },
      },
    ],
  },
];

/* Odpovědi výše slučují úrovně ceníku do jedné věty („{cena:zimni} v zimě, o svátcích a v létě",
   „mimo sezónu a v zimě {noci:mimo}"). Když se ceník rozejde, generátor skončí chybou a odpověď
   se musí přepsat — jinak by Časté dotazy tiše tvrdily špatnou cenu. */
export const FAQ_PREDPOKLADY = [
  { pole: 'nightly', urovne: ['zimni', 'svatky', 'letni'], kde: 'cena („v zimě, o svátcích a v létě")' },
  { pole: 'minNights', urovne: ['mimo', 'zimni'], kde: 'minimum („mimo sezónu a v zimě")' },
  { pole: 'minNights', urovne: ['vanoce', 'silvestr'], kde: 'minimum („o Vánocích a na Silvestra")' },
];
