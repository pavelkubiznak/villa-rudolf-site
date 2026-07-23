/* Villa Rudolf — /vylety/ (veřejná, indexovatelná stránka výletů).
   Obsah (nadpisy, popisy highlightů) je server-rendered přímo v HTML v češtině,
   aby ho crawler viděl bez JS. Tenhle skript jen (a) přepíná jazyk přes data-t,
   (b) přepíná sezónu (léto/zima) přes .vr-root[data-season], (c) drží kaskádu
   jazyka/sezóny sdílenou s hlavním webem (?lang / ?season / localStorage vrLang,
   vrSeason). Žádné síťové volání, žádné cookies. */
(function () {
  'use strict';

  var T = {
    cs: {
      nav: { dum: 'Dům', vybaveni: 'Vybavení', galerie: 'Galerie', recenze: 'Recenze', lokalita: 'Lokalita', vylety: 'Výlety', info: 'Praktické info', cta: 'Rezervovat termín' },
      map: { eyebrow: 'Kde nás najdete', title: 'Jak blízko to všechno máme', lead: 'Villa Rudolf leží ve Svobodě nad Úpou, kousek od Janských Lázní. Nejlepší cíle Krkonoš i skalní města máte na dosah — a velká města jsou jen pár hodin cesty.', polsko: 'POLSKO', cesko: 'ČESKO', compass: 'S', villaSub: 'Svoboda n. Úpou', praha: 'Praha', wroclaw: 'Vratislav', dresden: 'Drážďany', dresdenT: '~2,5 h', factSnezka: '20 min autem', factSkibus: '200 m od brány' },
      hero: {
        eyebrow: 'Výlety · Krkonoše',
        h1: 'Výlety z Villa Rudolf: co podniknete v Krkonoších',
        intro: 'Od procházek pěšky od brány po celodenní výpravy autem. Vybrali jsme nejlepší cíle na každou sezónu — přepínačem přepnete mezi létem a zimou. Níž je plánovač — vyberete čas, dopravu a s kým jedete, a my doporučíme cíl.',
        summer: 'Léto', winter: 'Zima', seasonHint: 'Vyberte sezónu:', skip: 'Přeskočit na plánovač ↓',
      },
      summerHead: { eyebrow: 'Léto', title: 'Kam v létě', note: 'Devět tipů, které hostům doporučujeme nejčastěji. Všech {total} cílů s filtry najdete v plánovači níž.' },
      winterHead: { eyebrow: 'Zima', title: 'Kam v zimě', note: 'Šest jistot pro zimní týden. Všech {total} cílů s filtry najdete v plánovači níž.' },
      s: {
        snezka: { name: 'Sněžka (1603 m)', meta: 'Autem 20 min do Pece · lanovkou nebo pěšky', pitch: 'Nejvyšší hora Česka na dosah. Vyjeďte kabinovou lanovkou z Pece na vrchol za čtvrt hodiny, nebo si vyšlápněte hřebeny — nahoře stojíte jednou nohou v Česku a druhou v Polsku, s výhledem přes celé Krkonoše.' },
        adrspach: { name: 'Adršpašské skály', meta: 'Autem 45 min · nutná online rezervace', pitch: 'Největší pískovcové skalní město ve střední Evropě — bludiště věží a soutěsek, dva vodopády a jezírko s vyhlídkovými pramicemi. Výlet na půl dne; v sezóně si vstup i parkování rezervujte online předem.' },
        stezka: { name: 'Stezka korunami stromů', meta: 'Pěšky od vily (~4 km lesem)', pitch: 'Klasika, na kterou dojdete pěšky lesem: kolonáda v Janských Lázních a pak Stezka korunami stromů s 43metrovou věží, tobogánem dolů a Medvědí stezkou. U paty čeká Emilův lesní svět s prolézačkami a minifarmou.' },
        safari: { name: 'Safari Park Dvůr Králové', meta: 'Autem 30 min · na celý den', pitch: 'Africky laděná zoo, kterou projedete safaribusem přímo mezi volně žijícími zvířaty. Areál je rozlehlý — vyrazte hned na otevření. V létě láká i večerní safari za soumraku (nutná rezervace).' },
        cernahora: { name: 'Černá hora — Park Kabinka', meta: 'Autem 15 min · lanovkou z Janských Lázní', pitch: 'Osmimístná kabinková lanovka vyveze celou rodinu (i s kočárkem) na vrchol Černé hory. Nahoře je zábavní Park Kabinka se sedmi atrakcemi a rozhledna Panorama — vstup do parku je v ceně jízdenky.' },
        bobovka: { name: 'Bobová dráha Relaxpark Pec', meta: 'Autem 20 min · jezdí i v dešti · od 8 let sólo', pitch: '900 metrů nerezové bobové dráhy a dvojsedačky až 40 km/h — adrenalin, který funguje za každého počasí. Od osmi let mohou děti jet samy.' },
        aquacentrum: { name: 'Aquacentrum Janské Lázně', meta: 'Pěšky od vily · krytý bazén', pitch: 'Krytý bazén z minerálních pramenů vyhřátý na 27 °C, vířivky, protiproud a saunový svět — hned za kolonádou v Janských Lázních, kam dojdete pěšky. Ideální program na den, kdy nepřeje počasí.' },
        stachelberg: { name: 'Pevnost Stachelberg', meta: 'Autem 15 min · podzemí, stálých 8 °C', pitch: 'Největší dělostřelecká pevnost v Česku. Sestupte 52 metrů pod zem do 3,5 km chodeb, kde je celoročně chladných 8 °C. V areálu je i rozhledna Eliška a dětské hřiště.' },
        karpacz: { name: 'Aquapark Tropikana — Karpacz (PL)', meta: 'Autem 45 min · za hranicí v Polsku', pitch: 'Velký hotelový aquapark hned za polskou hranicí: vlny, skluzavky, osm vířivek a solná i ledová jeskyně. Na cestu do Polska si vezměte doklady i pro děti.' },
      },
      w: {
        lyzovani: { name: 'Lyžování Černá hora–Pec', meta: 'Sjezdovky 4 km · skibus zdarma od brány', pitch: 'Největší lyžařský areál Krkonoš (SkiResort Černá hora–Pec) máte prakticky za rohem. Skibus staví 200 metrů od brány a jezdí zdarma — k vlekům se dostanete bez auta a bez hledání parkování.' },
        bazen: { name: 'Krytý bazén Janské Lázně', meta: 'Pěšky od vily · 27 °C po lyžování', pitch: 'Když si nohy řeknou o teplo, dojdete pěšky do lázeňského Aquacentra: bazén z minerálních pramenů na 27 °C, vířivky a saunový svět. Nejlepší konec lyžařského dne.' },
        snezka: { name: 'Sněžka v zimě', meta: 'Autem 20 min · lanovkou na vrchol', pitch: 'Zasněžený vrchol nejvyšší hory Česka. Kabinová lanovka z Pece vás vyveze nad hřebeny do zimní scenérie — nahoru se jede jen za příznivého počasí, tak sledujte předpověď.' },
        bezky: { name: 'Zimní procházky a běžky na Černé hoře', meta: 'Od horní stanice lanovky · náhorní plošina', pitch: 'Vyvezte se lanovkou na náhorní plošinu Černé hory, kde vede po dřevěných chodníčcích okruh přes prastaré rašeliniště — v zimě klidná bílá krajina a oblíbený terén pro běžky.' },
        karpacz: { name: 'Aquapark Tropikana — Karpacz (PL)', meta: 'Autem 45 min · velký krytý aquapark', pitch: 'Za sychravého dne se hodí velký krytý aquapark hned za polskou hranicí: vlny, skluzavky, osm vířivek a solná i ledová jeskyně. Vezměte doklady i dětem.' },
        sklarna: { name: 'Sklárna Harrachov & Mumlavské vodopády', meta: 'Autem 50 min · prohlídka v teple', pitch: 'Nejstarší fungující sklárna v Čechách — 45minutová prohlídka tavení a foukání skla v příjemném teple. Kousek dál se dá zajít k zamrzajícím Mumlavským vodopádům.' },
      },
      planner: {
        eyebrow: 'Plánovač výletů',
        title: 'Řekněte nám, kolik máte času — výlet vybereme za vás.',
        lead: 'Prošli jsme {total} cílů v okolí a u každého víme, jestli se dá zvládnout pěšky, jestli funguje za deště a od kolika let dává smysl. Vyberte tři věci a plánovač doporučí ten, který vám sedne — a dva náhradní, kdyby první nevyšel.',
        f1: '{total} ověřených cílů', f2: '{foot} pěšky od brány', f3: '20 minut na Sněžku',
        open: 'Otevřít plánovač',
        idleline: '{foot} cílů pěšky od brány · {car} do 30 minut autem · {day} na celý den',
      },
      card: { detail: 'Detail, ceny a otevírací doba \u2192' },
      cta: { eyebrow: 'Rezervace', title: 'Líbí se vám okolí? Zarezervujte si termín.', body: 'Celý dům i pozemek jen pro vaši skupinu 6–22 lidí — a všechny tyhle výlety kousek za bránou.' },
      footer: { tagline: 'Soukromé horské sídlo pro velké skupiny v srdci Krkonoš.', langLabel: 'Jazyk', contact: 'Kontakt', host: 'Pavel — váš hostitel', rights: '© 2026 Villa Rudolf', social: 'Sledujte nás', terms: 'Ubytovací podmínky a ochrana údajů', forGuests: 'Pro hosty', guide: 'Plánovač výletů' },
      meta: { title: 'Výlety v Krkonoších z Villa Rudolf — 38 tipů a plánovač na léto i zimu', desc: 'Nejlepší výlety kousek od Villa Rudolf ve Svobodě nad Úpou: Sněžka, Adršpašské skály, Stezka korunami stromů, Safari Dvůr Králové, lyžování na Černé hoře i aquaparky. Kurátorované tipy na léto i zimu.', locale: 'cs_CZ' },
    },

    en: {
      nav: { dum: 'The House', vybaveni: 'Amenities', galerie: 'Gallery', recenze: 'Reviews', lokalita: 'Location', vylety: 'Trips', info: 'Guest info', cta: 'Book dates' },
      map: { eyebrow: 'Where we are', title: 'How close everything really is', lead: 'Villa Rudolf sits in Svoboda nad Úpou, just below Janské Lázně. The best of the Krkonoše mountains and the sandstone rock towns are within easy reach — and the big cities just a couple of hours away.', polsko: 'POLAND', cesko: 'CZECHIA', compass: 'N', villaSub: 'Svoboda n. Úpou', praha: 'Prague', wroclaw: 'Wrocław', dresden: 'Dresden', dresdenT: '~2.5 h', factSnezka: '20 min by car', factSkibus: '200 m from the gate' },
      hero: {
        eyebrow: 'Trips · Krkonoše',
        h1: 'Trips from Villa Rudolf: what to do in the Krkonoše mountains',
        intro: 'From walks that start at the gate to full-day drives. We picked the best places for each season — use the switch to flip between summer and winter. Below is the planner — pick your time, transport and who’s coming, and we’ll suggest a place.',
        summer: 'Summer', winter: 'Winter', seasonHint: 'Choose a season:', skip: 'Skip to the planner ↓',
      },
      summerHead: { eyebrow: 'Summer', title: 'Where to go in summer', note: 'Nine trips we recommend to guests most often. All {total} places with filters are in the planner below.' },
      winterHead: { eyebrow: 'Winter', title: 'Where to go in winter', note: 'Six safe bets for a winter week. All {total} places with filters are in the planner below.' },
      s: {
        snezka: { name: 'Sněžka (1,603 m)', meta: '20 min drive to Pec · cable car or on foot', pitch: 'The highest peak in Czechia within reach. Ride the cable car up from Pec in fifteen minutes, or hike the ridges — at the top you stand with one foot in Czechia and one in Poland, the whole of Krkonoše at your feet.' },
        adrspach: { name: 'Adršpach Rocks', meta: '45 min drive · online booking required', pitch: 'The largest sandstone rock town in Central Europe — a maze of towers and gorges, two waterfalls and a lake with sightseeing punts. A half-day trip; in season, book entry and parking online ahead.' },
        stezka: { name: 'Treetop Walk', meta: 'On foot from the villa (~4 km through forest)', pitch: 'A classic you can reach on foot through the forest: the Janské Lázně colonnade, then the Treetop Walk with its 43-metre tower, a slide back down and a Bear Trail. At the base, Emil’s Forest World with climbing frames and a mini-farm.' },
        safari: { name: 'Dvůr Králové Safari Park', meta: '30 min drive · a full-day outing', pitch: 'An African-themed zoo you drive through by safari bus, right among free-roaming animals. It’s vast — arrive at opening. In summer there’s a twilight evening safari too (booking required).' },
        cernahora: { name: 'Černá hora — Park Kabinka', meta: '15 min drive · gondola from Janské Lázně', pitch: 'An eight-seat gondola carries the whole family (pram included) to the top of Černá hora. Up top, the Park Kabinka fun park with seven attractions and the Panorama lookout — park entry is included in the lift ticket.' },
        bobovka: { name: 'Relaxpark Pec bobsled', meta: '20 min drive · runs in rain · solo from age 8', pitch: '900 metres of stainless bobsled track and two-seater sleds up to 40 km/h — a thrill that runs in any weather. From age eight, kids can ride solo.' },
        aquacentrum: { name: 'Janské Lázně Aquacentrum', meta: 'On foot from the villa · indoor pool', pitch: 'An indoor pool fed by mineral springs and warmed to 27 °C, with whirlpools, a counter-current and a sauna world — just past the Janské Lázně colonnade, within walking distance. Perfect for a day the weather turns.' },
        stachelberg: { name: 'Stachelberg Fortress', meta: '15 min drive · tunnels at a steady 8 °C', pitch: 'The largest artillery fortress in Czechia. Descend 52 metres underground into 3.5 km of tunnels at a steady 8 °C year-round. The grounds also hold the Eliška lookout tower and a playground.' },
        karpacz: { name: 'Tropikana Water Park — Karpacz (PL)', meta: '45 min drive · across the Polish border', pitch: 'A big hotel water park just across the Polish border: waves, slides, eight whirlpools and a salt and ice cave. Bring ID for the children too when crossing into Poland.' },
      },
      w: {
        lyzovani: { name: 'Skiing at Černá hora–Pec', meta: 'Slopes 4 km · free ski bus from the gate', pitch: 'The largest ski area in Krkonoše (SkiResort Černá hora–Pec) is practically around the corner. The free ski bus stops 200 metres from the gate — reach the lifts without a car or a parking hunt.' },
        bazen: { name: 'Janské Lázně indoor pool', meta: 'On foot from the villa · 27 °C after skiing', pitch: 'When your legs call for warmth, walk over to the spa Aquacentrum: a 27 °C mineral-spring pool, whirlpools and a sauna world. The best end to a ski day.' },
        snezka: { name: 'Sněžka in winter', meta: '20 min drive · cable car to the summit', pitch: 'The snow-clad summit of the highest mountain in Czechia. The cable car from Pec lifts you above the ridges into a winter scene — it runs to the top only in fair weather, so watch the forecast.' },
        bezky: { name: 'Winter walks & cross-country on Černá hora', meta: 'From the top lift station · the plateau', pitch: 'Ride the gondola up to the Černá hora plateau, where a boardwalk loop crosses an ancient peat bog — in winter a quiet white landscape and a favourite for cross-country skiing.' },
        karpacz: { name: 'Tropikana Water Park — Karpacz (PL)', meta: '45 min drive · big indoor water park', pitch: 'On a raw day, the big indoor water park just across the Polish border is just the thing: waves, slides, eight whirlpools and a salt and ice cave. Bring ID for the children too.' },
        sklarna: { name: 'Harrachov Glassworks & Mumlava Falls', meta: '50 min drive · a tour in the warm', pitch: 'The oldest working glassworks in Bohemia — a 45-minute tour of glass melting and blowing in pleasant warmth. A short walk away, the freezing Mumlava Falls.' },
      },
      planner: {
        eyebrow: 'Trip planner',
        title: 'Tell us how much time you have — we’ll pick the trip.',
        lead: 'We went through {total} places nearby and for each one we know whether you can walk there, whether it works in the rain and from what age it makes sense. Choose three things and the planner suggests the one that fits — plus two fallbacks in case the first doesn’t work out.',
        f1: '{total} verified places', f2: '{foot} on foot from the gate', f3: '20 minutes to Sněžka',
        open: 'Open the planner',
        idleline: '{foot} places on foot from the gate · {car} within 30 minutes by car · {day} for a full day',
      },
      card: { detail: 'Details, prices and opening hours \u2192' },
      cta: { eyebrow: 'Booking', title: 'Like the area? Reserve your dates.', body: 'The whole house and grounds just for your group of 6–22 — with all these trips right beyond the gate.' },
      footer: { tagline: 'A private mountain estate for large groups in the heart of Krkonoše.', langLabel: 'Language', contact: 'Contact', host: 'Pavel — your host', rights: '© 2026 Villa Rudolf', social: 'Follow us', terms: 'Booking terms & privacy', forGuests: 'For guests', guide: 'Trip planner' },
      meta: { title: 'Trips in the Krkonoše from Villa Rudolf — 38 ideas and a trip planner', desc: 'The best trips near Villa Rudolf in Svoboda nad Úpou: Sněžka, the Adršpach rocks, the Treetop Walk, Dvůr Králové Safari, skiing on Černá hora and water parks. Curated ideas for summer and winter.', locale: 'en_US' },
    },

    de: {
      nav: { dum: 'Das Haus', vybaveni: 'Ausstattung', galerie: 'Galerie', recenze: 'Bewertungen', lokalita: 'Lage', vylety: 'Ausflüge', info: 'Gäste-Infos', cta: 'Termin buchen' },
      map: { eyebrow: 'Wo Sie uns finden', title: 'Wie nah alles liegt', lead: 'Villa Rudolf liegt in Svoboda nad Úpou, gleich bei Janské Lázně. Die schönsten Ziele des Riesengebirges und die Felsenstädte sind schnell erreichbar — und die großen Städte nur ein paar Stunden entfernt.', polsko: 'POLEN', cesko: 'TSCHECHIEN', compass: 'N', villaSub: 'Svoboda n. Úpou', praha: 'Prag', wroclaw: 'Breslau', dresden: 'Dresden', dresdenT: '~2,5 h', factSnezka: '20 Min. mit dem Auto', factSkibus: '200 m vom Tor' },
      hero: {
        eyebrow: 'Ausflüge · Riesengebirge',
        h1: 'Ausflüge ab Villa Rudolf: was Sie im Riesengebirge unternehmen',
        intro: 'Von Spaziergängen ab dem Tor bis zu Tagesausflügen mit dem Auto. Wir haben die besten Ziele für jede Jahreszeit ausgewählt — mit dem Schalter wechseln Sie zwischen Sommer und Winter. Unten steht der Planer — wählen Sie Zeit, Anfahrt und wer mitkommt, und wir empfehlen ein Ziel.',
        summer: 'Sommer', winter: 'Winter', seasonHint: 'Jahreszeit wählen:', skip: 'Zum Planer springen ↓',
      },
      summerHead: { eyebrow: 'Sommer', title: 'Wohin im Sommer', note: 'Neun Ausflüge, die wir Gästen am häufigsten empfehlen. Alle {total} Ziele mit Filtern finden Sie im Planer unten.' },
      winterHead: { eyebrow: 'Winter', title: 'Wohin im Winter', note: 'Sechs sichere Tipps für eine Winterwoche. Alle {total} Ziele mit Filtern finden Sie im Planer unten.' },
      s: {
        snezka: { name: 'Sněžka (1603 m)', meta: '20 Min. Fahrt nach Pec · Seilbahn oder zu Fuß', pitch: 'Der höchste Berg Tschechiens zum Greifen nah. Mit der Kabinenbahn von Pec in einer Viertelstunde hinauf oder über die Kämme wandern — oben stehen Sie mit einem Fuß in Tschechien, mit dem anderen in Polen, das ganze Riesengebirge zu Füßen.' },
        adrspach: { name: 'Adersbacher Felsen', meta: '45 Min. Fahrt · Online-Reservierung nötig', pitch: 'Die größte Sandstein-Felsenstadt Mitteleuropas — ein Labyrinth aus Türmen und Schluchten, zwei Wasserfälle und ein See mit Ausflugskähnen. Ein Halbtagesausflug; in der Saison Eintritt und Parkplatz vorab online buchen.' },
        stezka: { name: 'Baumwipfelpfad', meta: 'Zu Fuß von der Villa (~4 km durch den Wald)', pitch: 'Ein Klassiker, den Sie zu Fuß durch den Wald erreichen: die Kolonnade in Janské Lázně, dann der Baumwipfelpfad mit 43-Meter-Turm, Rutsche hinab und Bärenpfad. Am Fuß Emils Waldwelt mit Klettergerüsten und Mini-Bauernhof.' },
        safari: { name: 'Safari-Park Dvůr Králové', meta: '30 Min. Fahrt · Ausflug für einen ganzen Tag', pitch: 'Ein afrikanisch geprägter Zoo, den Sie im Safaribus mitten durch frei lebende Tiere durchfahren. Das Areal ist weitläufig — kommen Sie zur Öffnung. Im Sommer lockt zudem die Abendsafari in der Dämmerung (Reservierung nötig).' },
        cernahora: { name: 'Černá hora — Park Kabinka', meta: '15 Min. Fahrt · Gondel aus Janské Lázně', pitch: 'Eine Acht-Personen-Kabinenbahn bringt die ganze Familie (auch mit Kinderwagen) auf den Gipfel der Černá hora. Oben der Freizeitpark Park Kabinka mit sieben Attraktionen und der Aussichtsturm Panorama — der Parkeintritt ist im Ticket enthalten.' },
        bobovka: { name: 'Sommerrodelbahn Relaxpark Pec', meta: '15 Min. Fahrt · fährt auch im Regen · solo ab 8', pitch: '900 Meter Edelstahl-Bobbahn und Doppelsitzer bis 40 km/h — Nervenkitzel bei jedem Wetter. Ab acht Jahren dürfen Kinder allein fahren.' },
        aquacentrum: { name: 'Aquacentrum Janské Lázně', meta: 'Zu Fuß von der Villa · Hallenbad', pitch: 'Ein Hallenbad aus Mineralquellen, auf 27 °C geheizt, mit Whirlpools, Gegenstromanlage und Saunawelt — gleich hinter der Kolonnade in Janské Lázně, zu Fuß erreichbar. Ideal für einen Tag mit schlechtem Wetter.' },
        stachelberg: { name: 'Festung Stachelberg', meta: '15 Min. Fahrt · Gänge mit konstanten 8 °C', pitch: 'Die größte Artilleriefestung Tschechiens. Steigen Sie 52 Meter unter die Erde in 3,5 km Gänge mit ganzjährig kühlen 8 °C. Auf dem Gelände auch der Aussichtsturm Eliška und ein Spielplatz.' },
        karpacz: { name: 'Aquapark Tropikana — Karpacz (PL)', meta: '45 Min. Fahrt · hinter der polnischen Grenze', pitch: 'Ein großer Hotel-Aquapark gleich hinter der polnischen Grenze: Wellen, Rutschen, acht Whirlpools sowie Salz- und Eishöhle. Für die Fahrt nach Polen auch für Kinder Ausweise mitnehmen.' },
      },
      w: {
        lyzovani: { name: 'Skifahren Černá hora–Pec', meta: 'Pisten 4 km · Skibus gratis ab dem Tor', pitch: 'Das größte Skigebiet des Riesengebirges (SkiResort Černá hora–Pec) liegt praktisch um die Ecke. Der kostenlose Skibus hält 200 Meter vom Tor — zu den Liften ohne Auto und ohne Parkplatzsuche.' },
        bazen: { name: 'Hallenbad Janské Lázně', meta: 'Zu Fuß von der Villa · 27 °C nach dem Skifahren', pitch: 'Wenn die Beine nach Wärme rufen, gehen Sie zu Fuß ins Kur-Aquacentrum: 27 °C warmes Mineralquellbad, Whirlpools und Saunawelt. Der beste Abschluss eines Skitags.' },
        snezka: { name: 'Sněžka im Winter', meta: '20 Min. Fahrt · Seilbahn auf den Gipfel', pitch: 'Der verschneite Gipfel des höchsten Bergs Tschechiens. Die Kabinenbahn von Pec hebt Sie über die Kämme in eine Winterszenerie — bis zum Gipfel fährt sie nur bei gutem Wetter, also den Wetterbericht beachten.' },
        bezky: { name: 'Winterwanderung & Langlauf auf der Černá hora', meta: 'Ab der Bergstation · das Plateau', pitch: 'Fahren Sie mit der Bahn auf das Plateau der Černá hora, wo ein Bohlenweg durch ein uraltes Hochmoor führt — im Winter eine stille weiße Landschaft und beliebtes Langlaufterrain.' },
        karpacz: { name: 'Aquapark Tropikana — Karpacz (PL)', meta: '45 Min. Fahrt · großer Hallen-Aquapark', pitch: 'An einem rauen Tag ist der große Hallen-Aquapark gleich hinter der polnischen Grenze genau richtig: Wellen, Rutschen, acht Whirlpools sowie Salz- und Eishöhle. Auch für Kinder Ausweise mitnehmen.' },
        sklarna: { name: 'Glashütte Harrachov & Mumlava-Wasserfälle', meta: '50 Min. Fahrt · Führung im Warmen', pitch: 'Die älteste noch arbeitende Glashütte Böhmens — eine 45-minütige Führung durch Schmelzen und Glasblasen in angenehmer Wärme. Ein kurzer Weg weiter die zufrierenden Mumlava-Wasserfälle.' },
      },
      planner: {
        eyebrow: 'Ausflugsplaner',
        title: 'Sagen Sie uns, wie viel Zeit Sie haben — den Ausflug wählen wir.',
        lead: 'Wir haben {total} Ziele in der Umgebung geprüft und wissen bei jedem, ob es zu Fuß erreichbar ist, ob es bei Regen funktioniert und ab welchem Alter es Sinn ergibt. Wählen Sie drei Dinge und der Planer empfiehlt das passende Ziel — plus zwei Alternativen, falls das erste nicht klappt.',
        f1: '{total} geprüfte Ziele', f2: '{foot} zu Fuß vom Tor', f3: '20 Minuten zur Schneekoppe',
        open: 'Planer öffnen',
        idleline: '{foot} Ziele zu Fuß vom Tor · {car} bis 30 Minuten mit dem Auto · {day} für den ganzen Tag',
      },
      card: { detail: 'Details, Preise und Öffnungszeiten \u2192' },
      cta: { eyebrow: 'Buchung', title: 'Gefällt Ihnen die Gegend? Sichern Sie sich Ihren Termin.', body: 'Das ganze Haus und Grundstück nur für Ihre Gruppe von 6–22 — mit all diesen Ausflügen gleich hinter dem Tor.' },
      footer: { tagline: 'Ein privates Berganwesen für große Gruppen im Herzen des Riesengebirges.', langLabel: 'Sprache', contact: 'Kontakt', host: 'Pavel — euer Gastgeber', rights: '© 2026 Villa Rudolf', social: 'Folgt uns', terms: 'Buchungsbedingungen & Datenschutz', forGuests: 'Für Gäste', guide: 'Ausflugsplaner' },
      meta: { title: 'Ausflüge im Riesengebirge ab Villa Rudolf — 38 Tipps und Ausflugsplaner', desc: 'Die besten Ausflüge nahe Villa Rudolf in Svoboda nad Úpou: Sněžka, die Adersbacher Felsen, der Baumwipfelpfad, Safari Dvůr Králové, Skifahren auf der Černá hora und Aquaparks. Kuratierte Tipps für Sommer und Winter.', locale: 'de_DE' },
    },

    pl: {
      nav: { dum: 'Dom', vybaveni: 'Udogodnienia', galerie: 'Galeria', recenze: 'Recenzje', lokalita: 'Lokalizacja', vylety: 'Wycieczki', info: 'Informacje praktyczne', cta: 'Zarezerwuj termin' },
      map: { eyebrow: 'Gdzie nas znajdziecie', title: 'Jak blisko jest wszystko', lead: 'Villa Rudolf leży w Svobodzie nad Úpou, tuż obok Janských Lázní. Najlepsze cele Karkonoszy i skalne miasta macie w zasięgu ręki — a duże miasta tylko kilka godzin drogi.', polsko: 'POLSKA', cesko: 'CZECHY', compass: 'Pn', villaSub: 'Svoboda n. Úpou', praha: 'Praga', wroclaw: 'Wrocław', dresden: 'Drezno', dresdenT: '~2,5 h', factSnezka: '20 min autem', factSkibus: '200 m od bramy' },
      hero: {
        eyebrow: 'Wycieczki · Karkonosze',
        h1: 'Wycieczki z Villa Rudolf: co robić w Karkonoszach',
        intro: 'Od spacerów zaczynających się przy bramie po całodniowe wyprawy autem. Wybraliśmy najlepsze cele na każdą porę roku — przełącznikiem zmienisz lato na zimę. Niżej jest planer — wybierzecie czas, dojazd i kto jedzie, a my polecimy cel.',
        summer: 'Lato', winter: 'Zima', seasonHint: 'Wybierz porę roku:', skip: 'Przejdź do planera ↓',
      },
      summerHead: { eyebrow: 'Lato', title: 'Dokąd latem', note: 'Dziewięć wycieczek, które polecamy gościom najczęściej. Wszystkie {total} celów z filtrami znajdziecie w planerze niżej.' },
      winterHead: { eyebrow: 'Zima', title: 'Dokąd zimą', note: 'Sześć pewniaków na zimowy tydzień. Wszystkie {total} celów z filtrami znajdziecie w planerze niżej.' },
      s: {
        snezka: { name: 'Śnieżka (1603 m)', meta: 'Autem 20 min do Pecu · kolejką lub pieszo', pitch: 'Najwyższy szczyt Czech w zasięgu ręki. Wjedź kolejką z Pecu w kwadrans albo wejdź graniami — na szczycie stoisz jedną nogą w Czechach, drugą w Polsce, a całe Karkonosze masz u stóp.' },
        adrspach: { name: 'Skały Adršpach', meta: 'Autem 45 min · wymagana rezerwacja online', pitch: 'Największe piaskowcowe skalne miasto w Europie Środkowej — labirynt wież i wąwozów, dwa wodospady i jeziorko z łódkami widokowymi. Wycieczka na pół dnia; w sezonie zarezerwuj wejście i parking online z wyprzedzeniem.' },
        stezka: { name: 'Ścieżka w koronach drzew', meta: 'Pieszo od willi (~4 km lasem)', pitch: 'Klasyk, do którego dojdziesz pieszo przez las: kolonada w Janských Lázních, a potem Ścieżka w koronach drzew z 43-metrową wieżą, zjeżdżalnią w dół i Szlakiem Niedźwiedzi. U podnóża Leśny Świat Emila z placem zabaw i mini-farmą.' },
        safari: { name: 'Safari Park Dvůr Králové', meta: 'Autem 30 min · na cały dzień', pitch: 'Zoo w afrykańskim stylu, przez które przejeżdżasz safaribusem wprost między wolno żyjącymi zwierzętami. Teren jest rozległy — przyjedź na otwarcie. Latem kusi też wieczorne safari o zmierzchu (wymagana rezerwacja).' },
        cernahora: { name: 'Czarna Góra — Park Kabinka', meta: 'Autem 15 min · kolejką z Janských Lázní', pitch: 'Ośmioosobowa kolejka gondolowa wywozi całą rodzinę (także z wózkiem) na szczyt Czarnej Góry. Na górze park rozrywki Park Kabinka z siedmioma atrakcjami i wieża widokowa Panorama — wstęp do parku w cenie biletu.' },
        bobovka: { name: 'Tor saneczkowy Relaxpark Pec', meta: 'Autem 20 min · jeździ też w deszczu · solo od 8 lat', pitch: '900 metrów stalowego toru saneczkowego i dwuosobowe sanki do 40 km/h — adrenalina przy każdej pogodzie. Od ośmiu lat dzieci mogą jechać same.' },
        aquacentrum: { name: 'Aquacentrum Janské Lázně', meta: 'Pieszo od willi · kryty basen', pitch: 'Kryty basen z wód mineralnych ogrzany do 27 °C, jacuzzi, przeciwprąd i świat saun — tuż za kolonadą w Janských Lázních, w zasięgu spaceru. Idealny na dzień, gdy pogoda nie dopisuje.' },
        stachelberg: { name: 'Twierdza Stachelberg', meta: 'Autem 15 min · podziemia, stałe 8 °C', pitch: 'Największa forteca artyleryjska w Czechach. Zejdź 52 metry pod ziemię do 3,5 km korytarzy, gdzie przez cały rok panuje chłodne 8 °C. Na terenie także wieża widokowa Eliška i plac zabaw.' },
        karpacz: { name: 'Aquapark Tropikana — Karpacz (PL)', meta: 'Autem 45 min · tuż za granicą', pitch: 'Duży hotelowy aquapark tuż za polską granicą: fale, zjeżdżalnie, osiem jacuzzi oraz grota solna i lodowa. Na wyjazd do Polski zabierz dokumenty także dla dzieci.' },
      },
      w: {
        lyzovani: { name: 'Narciarstwo Czarna Góra–Pec', meta: 'Stoki 4 km · skibus za darmo od bramy', pitch: 'Największy ośrodek narciarski Karkonoszy (SkiResort Černá hora–Pec) masz praktycznie za rogiem. Darmowy skibus zatrzymuje się 200 metrów od bramy — dojedziesz do wyciągów bez auta i szukania parkingu.' },
        bazen: { name: 'Kryty basen Janské Lázně', meta: 'Pieszo od willi · 27 °C po nartach', pitch: 'Gdy nogi proszą o ciepło, dojdziesz pieszo do uzdrowiskowego Aquacentrum: basen z wód mineralnych 27 °C, jacuzzi i świat saun. Najlepsze zakończenie dnia na nartach.' },
        snezka: { name: 'Śnieżka zimą', meta: 'Autem 20 min · kolejką na szczyt', pitch: 'Ośnieżony szczyt najwyższej góry Czech. Kolejka z Pecu wywozi Cię ponad grzbiety w zimową scenerię — na szczyt jedzie tylko przy sprzyjającej pogodzie, więc śledź prognozę.' },
        bezky: { name: 'Zimowe spacery i biegówki na Czarnej Górze', meta: 'Od górnej stacji kolejki · płaskowyż', pitch: 'Wjedź kolejką na płaskowyż Czarnej Góry, gdzie drewniana kładka prowadzi przez prastare torfowisko — zimą cicha biała kraina i ulubiony teren do biegówek.' },
        karpacz: { name: 'Aquapark Tropikana — Karpacz (PL)', meta: 'Autem 45 min · duży kryty aquapark', pitch: 'W ponury dzień świetnie sprawdzi się duży kryty aquapark tuż za polską granicą: fale, zjeżdżalnie, osiem jacuzzi oraz grota solna i lodowa. Zabierz dokumenty także dla dzieci.' },
        sklarna: { name: 'Huta szkła Harrachov & Wodospady Mumlawy', meta: 'Autem 50 min · zwiedzanie w cieple', pitch: 'Najstarsza czynna huta szkła w Czechach — 45-minutowe zwiedzanie topienia i wydmuchiwania szkła w przyjemnym cieple. Kawałek dalej zamarzające Wodospady Mumlawy.' },
      },
      planner: {
        eyebrow: 'Planer wycieczek',
        title: 'Powiedzcie, ile macie czasu — wycieczkę wybierzemy my.',
        lead: 'Przeszliśmy {total} celów w okolicy i przy każdym wiemy, czy da się dojść pieszo, czy działa w deszcz i od ilu lat ma sens. Wybierzcie trzy rzeczy, a planer poleci ten właściwy — plus dwa zapasowe, gdyby pierwszy nie wypalił.',
        f1: '{total} sprawdzonych celów', f2: '{foot} pieszo od bramy', f3: '20 minut na Śnieżkę',
        open: 'Otwórz planer',
        idleline: '{foot} celów pieszo od bramy · {car} do 30 minut autem · {day} na cały dzień',
      },
      card: { detail: 'Szczegóły, ceny i godziny otwarcia \u2192' },
      cta: { eyebrow: 'Rezerwacja', title: 'Podoba się okolica? Zarezerwuj termin.', body: 'Cały dom i teren tylko dla Waszej grupy 6–22 osób — a wszystkie te wycieczki tuż za bramą.' },
      footer: { tagline: 'Prywatna górska rezydencja dla dużych grup w sercu Karkonoszy.', langLabel: 'Język', contact: 'Kontakt', host: 'Pavel — wasz gospodarz', rights: '© 2026 Villa Rudolf', social: 'Obserwuj nas', terms: 'Warunki pobytu i prywatność', forGuests: 'Dla gości', guide: 'Planer wycieczek' },
      meta: { title: 'Wycieczki w Karkonoszach z Villa Rudolf — 38 pomysłów i planer wycieczek', desc: 'Najlepsze wycieczki blisko Villa Rudolf w Svoboda nad Úpou: Śnieżka, Skały Adršpach, Ścieżka w koronach drzew, Safari Dvůr Králové, narty na Czarnej Górze i aquaparki. Wyselekcjonowane pomysły na lato i zimę.', locale: 'pl_PL' },
    },
  };

  var state = { lang: 'cs', season: 'leto', scrolled: false, mob: false };

  function $(s, r) { return (r || document).querySelector(s); }
  function $all(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function tt() { return T[state.lang] || T.cs; }
  function resolve(obj, path) { return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj); }

  /* Jazyk: ?lang= → localStorage vrLang → navigator.language → cs. */
  function resolveLang(qs) {
    var q = (qs.get('lang') || '').toLowerCase();
    if (T[q]) return q;
    try { var s = localStorage.getItem('vrLang'); if (s && T[s]) return s; } catch (e) {}
    var nav = (navigator.language || navigator.userLanguage || '').slice(0, 2).toLowerCase();
    if (T[nav]) return nav;
    return 'cs';
  }
  /* Sezóna: ?season= → DATUM → uložená volba (jen v rámci návštěvy).
     Logiku i hranice sezón drží assets/season.js — jedno místo pro celý web. */
  function resolveSeason(qs) {
    if (window.VRSeason) return window.VRSeason.resolve(location.search);
    var q = (qs.get('season') || '').toLowerCase();
    return (q === 'leto' || q === 'zima') ? q : 'leto';
  }

  /* Počty cílů — dokud plánovač nenačte katalog, platí fallback; pak se
     přepíšou živými čísly (viz VRPlanner.counts()). Homepage má stejná čísla
     přes VR_TRIP_COUNTS v site.js. */
  var COUNTS = { total: 39, foot: 8, car: 27, day: 4 };
  function fillCounts(s) {
    return s.replace(/\{(total|foot|car|day)\}/g, function (m, k) { return COUNTS[k]; });
  }
  function setTexts() {
    var t = tt();
    $all('[data-t]').forEach(function (n) {
      var v = resolve(t, n.getAttribute('data-t'));
      if (typeof v === 'string') n.textContent = fillCounts(v);
    });
    document.documentElement.lang = state.lang;
  }
  function applyMeta() {
    var m = tt().meta; if (!m) return;
    if (m.title) document.title = m.title;
    var set = function (sel, val) { var n = document.querySelector(sel); if (n && val) n.setAttribute('content', val); };
    set('meta[name="description"]', m.desc);
    set('meta[property="og:title"]', m.title);
    set('meta[property="og:description"]', m.desc);
    set('meta[property="og:locale"]', m.locale);
  }
  function applyLangButtons() {
    $all('.vr-lang').forEach(function (b) { b.setAttribute('data-active', b.getAttribute('data-lang') === state.lang ? 'true' : 'false'); });
  }
  function applySeasonButtons() {
    $all('.vr-segbtn').forEach(function (b) {
      var sn = b.getAttribute('data-season');
      var on = sn === state.season;
      b.setAttribute('data-active', on ? 'true' : 'false');
      if (on) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      if (b.tagName === 'A') b.setAttribute('href', '?season=' + sn + '&lang=' + state.lang);
    });
  }
  /* data-langlink → přidej ?lang&season (a zachovej případný #hash), ať jsou
     odkazy na hlavní web sdílitelné a dědí jazyk i sezónu. */
  function applyLangLinks() {
    $all('a[data-langlink]').forEach(function (a) {
      var raw = a.getAttribute('data-langlink');
      var hi = raw.indexOf('#');
      var hash = hi >= 0 ? raw.slice(hi) : '';
      var path = hi >= 0 ? raw.slice(0, hi) : raw;
      var sep = path.indexOf('?') >= 0 ? '&' : '?';
      a.setAttribute('href', path + sep + 'lang=' + state.lang + '&season=' + state.season + hash);
    });
  }
  function syncUrl() {
    try {
      var u = new URL(location.href);
      u.searchParams.set('lang', state.lang);
      u.searchParams.set('season', state.season);
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) {}
  }
  function applyThemeColor() {
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', state.season === 'zima' ? '#eef2f6' : '#0E1311');
  }

  function setLang(lang) {
    if (!T[lang] || state.lang === lang) return;
    state.lang = lang;
    try { localStorage.setItem('vrLang', lang); } catch (e) {}
    applyLangButtons(); applySeasonButtons(); setTexts(); applyMeta(); applyLangLinks(); syncUrl();
    if (window.VRPlanner) window.VRPlanner.setLang(lang);
  }
  function eagerLoadSeason(season) {
    var cls = season === 'zima' ? 'winter' : 'summer';
    $all('.vr-seasonimg.' + cls).forEach(function (img) { if (img.getAttribute('loading') === 'lazy') img.setAttribute('loading', 'eager'); });
  }
  function setSeason(season) {
    if ((season !== 'leto' && season !== 'zima') || state.season === season) return;
    state.season = season;
    if (window.VRSeason) window.VRSeason.remember(season);
    else { try { sessionStorage.setItem('vrSeason', season); } catch (e) {} }
    eagerLoadSeason(season);
    $('.vr-root').setAttribute('data-season', season);
    applyThemeColor(); applySeasonButtons(); applyLangLinks(); syncUrl();
    // Pás plánovače sezónu jen DĚDÍ — vlastní přepínač nemá (pravidlo 4 v planner.css).
    var pl = $('#vr-planner'); if (pl) pl.setAttribute('data-season', season);
    if (window.VRPlanner) window.VRPlanner.setSeason(season);
  }

  /* ===================== PLÁNOVAČ — líný mount =====================
     Plánovač se montuje, až (a) se pás blíží do viewportu, (b) uživatel klikne
     na „Otevřít plánovač", nebo (c) přišel deep link (#planovac / ?zona= / ?filtr=).
     Do té doby je na stránce jen statický skeleton — LCP zůstává hero obrázek. */
  var ZONES = { pesky: 1, auto: 1, den: 1 };
  var plannerReq = null;

  function mountPlanner(opts) {
    if (plannerReq) return plannerReq;
    var host = $('#vr-planner'); if (!host || !window.VRPlanner) return null;
    var idle = $('#vyl-plan-idle');
    if (idle) idle.setAttribute('data-loading', 'true');
    opts = opts || {};
    plannerReq = window.VRPlanner.mount({
      el: host, lang: state.lang, season: state.season,
      filter: opts.filter, zona: opts.zona
    }).then(function (ok) {
      try {
        var c = window.VRPlanner.counts();
        if (c && c.total) { COUNTS = c; setTexts(); }
      } catch (e) { }
      return ok;
    });
    return plannerReq;
  }

  function initPlanner() {
    var host = $('#vr-planner'); if (!host) return;
    var qs2 = new URLSearchParams(location.search);
    var zona = (qs2.get('zona') || '').toLowerCase(); if (!ZONES[zona]) zona = '';
    var filtr = (qs2.get('filtr') || '').toLowerCase();
    var deep = zona || filtr || location.hash === '#planovac';

    var openBtn = $('#vyl-plan-open');
    if (openBtn) openBtn.addEventListener('click', function () {
      var p = mountPlanner({});
      if (p) p.then(function () { host.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
    });

    // Kurátorovaná karta i katalogová karta otevírají TENTÝŽ bottom-sheet.
    $all('.vyl-card[data-trip]').forEach(function (card) {
      card.addEventListener('click', function (e) {
        if (e.target.closest('a')) return;      // odkaz na oficiální web nechat projít
        var id = card.getAttribute('data-trip'); if (!id) return;
        e.preventDefault();
        mountPlanner({});
        if (window.VRPlanner) window.VRPlanner.openDetail(id);
      });
    });

    if (deep) { mountPlanner({ zona: zona, filter: filtr }); return; }

    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { io.disconnect(); mountPlanner({}); } });
      }, { rootMargin: '600px 0px' });
      io.observe(host);
    } else {
      mountPlanner({});
    }
  }

  /* Mobile menu */
  function toggleMob(open) {
    state.mob = open == null ? !state.mob : open;
    $('#vr-mob').setAttribute('data-open', state.mob ? 'true' : 'false');
    $('#vr-burger').setAttribute('aria-expanded', state.mob ? 'true' : 'false');
    document.body.style.overflow = state.mob ? 'hidden' : '';
  }

  /* Reveal on scroll — fail-safe: obsah je viditelný VŽDY; animaci zapneme
     (html.io-ok) až po ověření, že IntersectionObserver reálně střílí. */
  function startReveal() {
    if (!('IntersectionObserver' in window) || !window.innerHeight) return;
    var items = $all('.vr-reveal');
    var probe = new IntersectionObserver(function () {
      probe.disconnect();
      document.documentElement.classList.add('io-ok');
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add('vr-in'); io.unobserve(en.target); } });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      items.forEach(function (n) { io.observe(n); });
      setTimeout(function () { items.forEach(function (n) { if (n.getBoundingClientRect().top < window.innerHeight) n.classList.add('vr-in'); }); }, 2000);
    });
    probe.observe(document.body);
  }

  function onScroll() {
    var s = window.scrollY > 8;
    if (s !== state.scrolled) { state.scrolled = s; $('.vr-nav').setAttribute('data-scrolled', s ? 'true' : 'false'); }
    var vh = window.innerHeight || 1;
    var sticky = $('#vr-stickycta');
    if (sticky) { var on = window.scrollY > vh * 0.6 ? 'true' : 'false'; if (sticky.getAttribute('data-show') !== on) sticky.setAttribute('data-show', on); }
  }

  function init() {
    document.documentElement.classList.add('js');
    var qs = new URLSearchParams(location.search);
    state.lang = resolveLang(qs);
    state.season = resolveSeason(qs);
    try { localStorage.setItem('vrLang', state.lang); } catch (e) {}
    if (window.VRSeason) window.VRSeason.remember(state.season);

    $all('.vr-lang').forEach(function (b) { b.addEventListener('click', function () { setLang(b.getAttribute('data-lang')); }); });
    // Přepínač sezóny je odkaz — kliknutí přepne bez reloadu, modifikátory nechme projít.
    $all('.vr-segbtn').forEach(function (b) {
      b.addEventListener('click', function (e) {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button > 0) return;
        e.preventDefault();
        setSeason(b.getAttribute('data-season'));
      });
    });
    $('#vr-burger').addEventListener('click', function () { toggleMob(); });
    $all('#vr-mob a').forEach(function (a) { a.addEventListener('click', function () { toggleMob(false); }); });

    $('.vr-root').setAttribute('data-season', state.season);
    if (state.season === 'zima') eagerLoadSeason('zima');
    applyThemeColor();
    applyLangButtons(); applySeasonButtons(); setTexts(); applyMeta(); applyLangLinks(); syncUrl();

    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    startReveal();
    initPlanner();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
