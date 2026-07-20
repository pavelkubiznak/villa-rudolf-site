/* Villa Rudolf — homepage behaviour. Vanilla JS, no framework.
   Re-implements the Claude Design handoff prototype (.dc runtime NOT ported).
   T translation object is ported verbatim from the prototype; the Stripe note
   is replaced (v1 has no Stripe) and a localized placeholder label added. */
'use strict';

/* ============================ Translations (verbatim from prototype) ============================ */
const T = {
  cs: {
    photoSoon: 'Fotku doplníme',
    nav: { dum: 'Dům', interier: 'Interiér', vybaveni: 'Vybavení', ohniste: 'Ohniště', sezony: 'Sezóny', lokalita: 'Lokalita', vylety: 'Výlety', cta: 'Rezervovat termín' },
    hero: {
      eyebrow: 'Soukromé sídlo s vlastním pozemkem · Krkonoše',
      h1a: 'Celé to místo', h1b: 'je jen vaše',
      sub: 'Dům i celý rozlehlý pozemek si berete jen pro sebe. Žádné ploty mezi rodinami, žádné sdílení — jen vaše parta, oheň, bazén a hora kolem dokola.',
      ctaSec: 'Prohlédnout dům', badge: 'Volné termíny 2025', video: 'Přehrát video',
      summer: 'Léto', winter: 'Zima', scroll: 'Scroll',
      tipSummer: 'Bazén, pergola a večery u otevřeného ohně.',
      tipWinter: 'Bez řetězů až k domu, skibus zdarma v docházkové vzdálenosti.',
      nightLine: 'Setmělo se. Ohniště, gabiony i bazén se rozsvítily samy — večer tady teprve začíná.',
    },
    statement: {
      eyebrow: 'Není to dům. Je to celé místo.',
      lead: 'Jinde dostanete pokoje a kousek zahrady sdílený s cizími lidmi. Tady si berete celý pozemek — rozlehlý, nerozdělený, jen pro vaši skupinu. Děti běhají v bezpečí na dohled, vy si večer rozděláte oheň, sednete pod pergolu a skočíte do bazénu, kdykoli se vám zachce.',
    },
    band: { eyebrow: 'Jeden večer tady' },
    amenities: {
      eyebrow: 'Vybavení', title: 'Komfort, který drží skupinu pohromadě', drop: 'Přetáhněte sem fotku',
      items: [
        { tag: 'Wellness', name: 'Zastřešený vyhřívaný bazén', desc: 'Bazén pod střechou s ohřevem vody — v provozu za každého počasí, od letního odpoledne po mrazivý zimní večer. Po koupeli rovnou do sauny.' },
        { tag: 'Wellness', name: 'Privátní sauna', desc: 'Finská sauna jen pro vaši skupinu. Žádné sdílení, žádné časové sloty.' },
        { tag: 'Venkovní život', name: 'Velká pergola', desc: 'Kryté posezení, kam se vejde celá skupina najednou. Společné večeře venku i za deště.' },
        { tag: 'Pro rodiny', name: 'Dětské hřiště', desc: 'Prolézačky, malá lezecká a lanová stěna. Děti mají svůj prostor na dohled od pergoly.' },
      ],
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
      eyebrow: 'Léto i zima', title: 'Jedno místo, dvě atmosféry',
      summer: { tag: 'Léto', title: 'Dlouhé večery venku', desc: 'Bazén, pergola, ohniště a velký pozemek pro děti i dospělé. Turistika a výlety přímo od domu.' },
      winter: { tag: 'Zima', title: 'Lyžovačka bez starostí', desc: 'Příjezd autem bez řetězů — stačí zimní pneumatiky. Skibus zdarma v docházkové vzdálenosti vás odveze rovnou k vlekům, žádné hledání parkování.' },
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
      total: 'Celkem za pobyt', deposit: 'Záloha 30 %',
      pay: 'Odeslat nezávaznou poptávku', stripeNote: 'Nezávazná poptávka — žádná platba předem. Termín vám osobně potvrdíme e-mailem.',
      free: 'Volno', booked: 'Obsazeno', chosen: 'Váš pobyt', demo: 'Ukázková dostupnost — napojíme na rezervační systém',
      availFail: 'Dostupnost se nepodařilo načíst.',
    },
    video: { eyebrow: 'Video', title: 'Prohlédněte si vilu na videu', summer: 'Dům, zahrada, bazén a příjezd', winter: 'Prohlídka domu, sauna a skibus' },
    share: { eyebrow: 'Sdílejte', title: 'Byli jste u nás? Pochlubte se.', body: 'Odvezli jste si hezké fotky? Sdílejte je, označte @villarudolfretreat a přidejte #villarudolf — ať je uvidí i další. Ty nejhezčí se můžou objevit přímo tady na webu.', ig: 'Sledovat na Instagramu' },
    cta: {
      eyebrow: 'Rezervace', title: 'Rezervujte celý dům pro svou skupinu',
      body: 'Vyberte v kalendáři příjezd a odjezd a pošlete nám nezávaznou poptávku. Termín vám osobně potvrdíme e-mailem.',
      lblGuests: 'Počet hostů', phGuests: 'Dospělí + děti',
      lblEmail: 'E-mail', phEmail: 'vas@email.cz',
    },
    mail: { subject: 'Villa Rudolf — poptávka termínu', dates: 'Termín', nights: 'Počet nocí', guests: 'Hosté', total: 'Celkem', deposit: 'Záloha 30 %', from: 'Kontaktní e-mail', greeting: 'Dobrý den, rád(a) bych rezervoval(a) Villa Rudolf.' },
    footer: { tagline: 'Soukromé horské sídlo pro velké skupiny v srdci Krkonoš.', langLabel: 'Jazyk', contact: 'Kontakt', rights: '© 2025 Villa Rudolf' },
  },

  en: {
    photoSoon: 'Photo coming soon',
    nav: { dum: 'The House', interier: 'Interior', vybaveni: 'Amenities', ohniste: 'Fire Pit', sezony: 'Seasons', lokalita: 'Location', vylety: 'Trips', cta: 'Book dates' },
    hero: {
      eyebrow: 'A private estate with its own grounds · Krkonoše',
      h1a: 'The whole place', h1b: 'is yours alone',
      sub: 'The house and the entire sweeping grounds, taken just for you. No fences between families, no sharing — only your group, the fire, the pool and the mountain all around.',
      ctaSec: 'Explore the house', badge: 'Open dates 2025', video: 'Play video',
      summer: 'Summer', winter: 'Winter', scroll: 'Scroll',
      tipSummer: 'Pool, pergola and evenings around the open fire.',
      tipWinter: 'No chains to the door, free ski bus within walking distance.',
      nightLine: 'Night has fallen. The fire pit, gabion wall and pool have lit themselves — the evening is just beginning.',
    },
    statement: {
      eyebrow: 'Not a house. A whole place.',
      lead: 'Elsewhere you get rooms and a patch of shared garden. Here you take the entire grounds — vast, undivided, yours alone. Children run free and safe in sight, while you light the fire, settle under the pergola and slip into the pool whenever you please.',
    },
    band: { eyebrow: 'One evening here' },
    amenities: {
      eyebrow: 'Amenities', title: 'Comfort that keeps the group together', drop: 'Drop a photo here',
      items: [
        { tag: 'Wellness', name: 'Covered heated pool', desc: 'An indoor pool with heated water — open in any weather, from summer afternoons to frozen winter nights. Straight from the water into the sauna.' },
        { tag: 'Wellness', name: 'Private sauna', desc: 'A Finnish sauna for your group only. No sharing, no time slots.' },
        { tag: 'Outdoor living', name: 'Large pergola', desc: 'Covered seating big enough for the whole group at once. Shared dinners outside, even in the rain.' },
        { tag: 'For families', name: 'Children’s playground', desc: 'Climbing frames, a small climbing wall and a rope wall. The kids get their own space in sight of the pergola.' },
      ],
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
      eyebrow: 'Summer & winter', title: 'One place, two atmospheres',
      summer: { tag: 'Summer', title: 'Long evenings outside', desc: 'Pool, pergola, fire pit and a large grounds for kids and adults alike. Hiking and trips straight from the house.' },
      winter: { tag: 'Winter', title: 'Skiing without the hassle', desc: 'Drive up without snow chains — winter tyres are enough. A free ski bus within walking distance takes you straight to the lifts, no parking to hunt for.' },
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
      total: 'Total for the stay', deposit: '30% deposit',
      pay: 'Send non-binding inquiry', stripeNote: 'Non-binding inquiry — no payment upfront. We’ll confirm your dates personally by email.',
      free: 'Available', booked: 'Booked', chosen: 'Your stay', demo: 'Sample availability — will connect to the booking system',
      availFail: 'Availability could not be loaded.',
    },
    video: { eyebrow: 'Video', title: 'See the villa on video', summer: 'House, garden, pool & arrival', winter: 'House tour, sauna & ski bus' },
    share: { eyebrow: 'Share', title: 'Stayed with us? Show it off.', body: 'Took some nice photos? Share them, tag @villarudolfretreat and add #villarudolf so others can see them too. The best ones may appear right here on the site.', ig: 'Follow on Instagram' },
    cta: {
      eyebrow: 'Booking', title: 'Book the whole house for your group',
      body: 'Pick arrival and departure in the calendar and send us a non-binding inquiry. We’ll confirm your dates personally by email.',
      lblGuests: 'Guests', phGuests: 'Adults + children',
      lblEmail: 'Email', phEmail: 'you@email.com',
    },
    mail: { subject: 'Villa Rudolf — booking enquiry', dates: 'Dates', nights: 'Nights', guests: 'Guests', total: 'Total', deposit: '30% deposit', from: 'Contact email', greeting: 'Hello, I’d like to book Villa Rudolf.' },
    footer: { tagline: 'A private mountain estate for large groups in the heart of Krkonoše.', langLabel: 'Language', contact: 'Contact', rights: '© 2025 Villa Rudolf' },
  },

  de: {
    photoSoon: 'Foto folgt',
    nav: { dum: 'Das Haus', interier: 'Innen', vybaveni: 'Ausstattung', ohniste: 'Feuerstelle', sezony: 'Jahreszeiten', lokalita: 'Lage', vylety: 'Ausflüge', cta: 'Termin buchen' },
    hero: {
      eyebrow: 'Ein privates Anwesen mit eigenem Grundstück · Riesengebirge',
      h1a: 'Der ganze Ort', h1b: 'gehört nur euch',
      sub: 'Das Haus und das gesamte weitläufige Grundstück, nur für euch. Keine Zäune zwischen Familien, kein Teilen — nur eure Gruppe, das Feuer, der Pool und der Berg ringsum.',
      ctaSec: 'Haus ansehen', badge: 'Freie Termine 2025', video: 'Video abspielen',
      summer: 'Sommer', winter: 'Winter', scroll: 'Scrollen',
      tipSummer: 'Pool, Pergola und Abende am offenen Feuer.',
      tipWinter: 'Ohne Ketten bis zur Tür, kostenloser Skibus in Gehweite.',
      nightLine: 'Es ist dunkel geworden. Feuerstelle, Gabionenwand und Pool leuchten von selbst — der Abend fängt gerade erst an.',
    },
    statement: {
      eyebrow: 'Kein Haus. Ein ganzer Ort.',
      lead: 'Anderswo bekommt ihr Zimmer und ein Stück geteilten Garten. Hier nehmt ihr das ganze Grundstück — weitläufig, ungeteilt, nur für euch. Kinder laufen sicher in Sichtweite, während ihr das Feuer entzündet, euch unter die Pergola setzt und in den Pool springt, wann immer ihr wollt.',
    },
    band: { eyebrow: 'Ein Abend hier' },
    amenities: {
      eyebrow: 'Ausstattung', title: 'Komfort, der die Gruppe zusammenhält', drop: 'Foto hierher ziehen',
      items: [
        { tag: 'Wellness', name: 'Überdachter beheizter Pool', desc: 'Ein Innenpool mit beheiztem Wasser — bei jedem Wetter nutzbar, vom Sommernachmittag bis zur frostigen Winternacht. Aus dem Wasser direkt in die Sauna.' },
        { tag: 'Wellness', name: 'Private Sauna', desc: 'Eine finnische Sauna nur für eure Gruppe. Kein Teilen, keine Zeitfenster.' },
        { tag: 'Draußen leben', name: 'Große Pergola', desc: 'Überdachte Sitzplätze für die ganze Gruppe auf einmal. Gemeinsame Abendessen draußen, auch bei Regen.' },
        { tag: 'Für Familien', name: 'Kinderspielplatz', desc: 'Klettergerüste, eine kleine Kletterwand und eine Seilwand. Die Kinder haben ihren eigenen Bereich in Sichtweite der Pergola.' },
      ],
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
      eyebrow: 'Sommer & Winter', title: 'Ein Ort, zwei Atmosphären',
      summer: { tag: 'Sommer', title: 'Lange Abende draußen', desc: 'Pool, Pergola, Feuerstelle und ein großes Grundstück für Kinder wie Erwachsene. Wandern und Ausflüge direkt vom Haus.' },
      winter: { tag: 'Winter', title: 'Skifahren ohne Stress', desc: 'Anfahrt ohne Schneeketten — Winterreifen genügen. Ein kostenloser Skibus in Gehweite bringt euch direkt zu den Liften, keine Parkplatzsuche.' },
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
      total: 'Gesamt für den Aufenthalt', deposit: '30 % Anzahlung',
      pay: 'Unverbindliche Anfrage senden', stripeNote: 'Unverbindliche Anfrage — keine Vorauszahlung. Wir bestätigen euren Termin persönlich per E-Mail.',
      free: 'Frei', booked: 'Belegt', chosen: 'Euer Aufenthalt', demo: 'Beispielverfügbarkeit — wird ans Buchungssystem angebunden',
      availFail: 'Verfügbarkeit konnte nicht geladen werden.',
    },
    video: { eyebrow: 'Video', title: 'Sehen Sie die Villa im Video', summer: 'Haus, Garten, Pool & Anreise', winter: 'Hausführung, Sauna & Skibus' },
    share: { eyebrow: 'Teilen', title: 'Bei uns gewesen? Zeigt es her.', body: 'Schöne Fotos gemacht? Teilt sie, markiert @villarudolfretreat und fügt #villarudolf hinzu — damit sie auch andere sehen. Die schönsten erscheinen vielleicht direkt hier auf der Website.', ig: 'Auf Instagram folgen' },
    cta: {
      eyebrow: 'Buchung', title: 'Bucht das ganze Haus für eure Gruppe',
      body: 'Wählt An- und Abreise im Kalender und sendet uns eine unverbindliche Anfrage. Wir bestätigen euren Termin persönlich per E-Mail.',
      lblGuests: 'Gäste', phGuests: 'Erwachsene + Kinder',
      lblEmail: 'E-Mail', phEmail: 'du@email.de',
    },
    mail: { subject: 'Villa Rudolf — Terminanfrage', dates: 'Termin', nights: 'Nächte', guests: 'Gäste', total: 'Gesamt', deposit: '30 % Anzahlung', from: 'Kontakt-E-Mail', greeting: 'Guten Tag, ich möchte Villa Rudolf buchen.' },
    footer: { tagline: 'Ein privates Berganwesen für große Gruppen im Herzen des Riesengebirges.', langLabel: 'Sprache', contact: 'Kontakt', rights: '© 2025 Villa Rudolf' },
  },

  pl: {
    photoSoon: 'Zdjęcie wkrótce',
    nav: { dum: 'Dom', interier: 'Wnętrze', vybaveni: 'Udogodnienia', ohniste: 'Palenisko', sezony: 'Sezony', lokalita: 'Lokalizacja', vylety: 'Wycieczki', cta: 'Zarezerwuj termin' },
    hero: {
      eyebrow: 'Prywatna posiadłość z własną posesją · Karkonosze',
      h1a: 'Całe to miejsce', h1b: 'jest tylko wasze',
      sub: 'Dom i cała rozległa posesja, wzięte tylko dla was. Żadnych płotów między rodzinami, żadnego dzielenia — tylko wasza grupa, ogień, basen i góra dookoła.',
      ctaSec: 'Zobacz dom', badge: 'Wolne terminy 2025', video: 'Odtwórz wideo',
      summer: 'Lato', winter: 'Zima', scroll: 'Scroll',
      tipSummer: 'Basen, pergola i wieczory przy otwartym ogniu.',
      tipWinter: 'Bez łańcuchów pod same drzwi, darmowy skibus w zasięgu spaceru.',
      nightLine: 'Zapadła noc. Palenisko, ściana gabionowa i basen zapaliły się same — wieczór dopiero się zaczyna.',
    },
    statement: {
      eyebrow: 'To nie dom. To całe miejsce.',
      lead: 'Gdzie indziej dostajecie pokoje i kawałek wspólnego ogrodu. Tu bierzecie całą posesję — rozległą, niepodzieloną, tylko dla was. Dzieci biegają bezpiecznie w zasięgu wzroku, a wy rozpalacie ogień, siadacie pod pergolą i wskakujecie do basenu, kiedy tylko chcecie.',
    },
    band: { eyebrow: 'Jeden wieczór tutaj' },
    amenities: {
      eyebrow: 'Udogodnienia', title: 'Komfort, który trzyma grupę razem', drop: 'Przeciągnij tu zdjęcie',
      items: [
        { tag: 'Wellness', name: 'Zadaszony podgrzewany basen', desc: 'Kryty basen z podgrzewaną wodą — czynny w każdą pogodę, od letniego popołudnia po mroźny zimowy wieczór. Prosto z wody do sauny.' },
        { tag: 'Wellness', name: 'Prywatna sauna', desc: 'Fińska sauna tylko dla waszej grupy. Bez dzielenia, bez okienek czasowych.' },
        { tag: 'Życie na zewnątrz', name: 'Duża pergola', desc: 'Zadaszone miejsce dla całej grupy naraz. Wspólne kolacje na świeżym powietrzu, nawet w deszcz.' },
        { tag: 'Dla rodzin', name: 'Plac zabaw', desc: 'Drabinki, mała ścianka wspinaczkowa i ścianka linowa. Dzieci mają własną przestrzeń w zasięgu wzroku od pergoli.' },
      ],
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
      eyebrow: 'Lato i zima', title: 'Jedno miejsce, dwie atmosfery',
      summer: { tag: 'Lato', title: 'Długie wieczory na zewnątrz', desc: 'Basen, pergola, palenisko i duża posesja dla dzieci i dorosłych. Wędrówki i wycieczki prosto z domu.' },
      winter: { tag: 'Zima', title: 'Narty bez kłopotów', desc: 'Dojazd bez łańcuchów — wystarczą opony zimowe. Darmowy skibus w zasięgu spaceru zawiezie was prosto pod wyciągi, bez szukania parkingu.' },
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
      total: 'Razem za pobyt', deposit: 'Zaliczka 30%',
      pay: 'Wyślij niezobowiązujące zapytanie', stripeNote: 'Niezobowiązujące zapytanie — bez płatności z góry. Termin potwierdzimy osobiście e-mailem.',
      free: 'Wolne', booked: 'Zajęte', chosen: 'Wasz pobyt', demo: 'Przykładowa dostępność — podłączymy system rezerwacji',
      availFail: 'Nie udało się wczytać dostępności.',
    },
    video: { eyebrow: 'Wideo', title: 'Zobacz willę na wideo', summer: 'Dom, ogród, basen i przyjazd', winter: 'Zwiedzanie domu, sauna i skibus' },
    share: { eyebrow: 'Udostępnij', title: 'Byliście u nas? Pochwalcie się.', body: 'Macie ładne zdjęcia? Udostępnijcie je, oznaczcie @villarudolfretreat i dodajcie #villarudolf — niech zobaczą je też inni. Najlepsze mogą pojawić się właśnie tu, na stronie.', ig: 'Obserwuj na Instagramie' },
    cta: {
      eyebrow: 'Rezerwacja', title: 'Zarezerwuj cały dom dla swojej grupy',
      body: 'Wybierz w kalendarzu przyjazd i wyjazd i wyślij nam niezobowiązujące zapytanie. Termin potwierdzimy osobiście e-mailem.',
      lblGuests: 'Goście', phGuests: 'Dorośli + dzieci',
      lblEmail: 'E-mail', phEmail: 'ty@email.pl',
    },
    mail: { subject: 'Villa Rudolf — zapytanie o termin', dates: 'Termin', nights: 'Noce', guests: 'Goście', total: 'Razem', deposit: 'Zaliczka 30%', from: 'E-mail kontaktowy', greeting: 'Dzień dobry, chciałbym/chciałabym zarezerwować Villa Rudolf.' },
    footer: { tagline: 'Prywatna górska rezydencja dla dużych grup w sercu Karkonoszy.', langLabel: 'Język', contact: 'Kontakt', rights: '© 2025 Villa Rudolf' },
  },
};

/* ============================ State + helpers ============================ */
const state = { lang: 'cs', season: 'leto', scrolled: false, scene: 0, lb: -1, lbList: [], galFilter: 'all', selStart: 0, selEnd: 0, mob: false };
const NIGHT_RATE = 20000;
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
  document.documentElement.lang = state.lang;
}

/* ============================ Dynamic list renders ============================ */
function renderFacts() {
  const t = tt();
  const fl = ({
    cs: ['celý pozemek jen pro vás', 'plotů a sdílení', 'dní v roce'],
    en: ['the whole grounds, all yours', 'fences, no sharing', 'days a year'],
    de: ['das ganze Grundstück, für euch', 'Zäune, kein Teilen', 'Tage im Jahr'],
    pl: ['cała posesja dla was', 'płotów i dzielenia', 'dni w roku'],
  })[state.lang] || ['the whole grounds, all yours', 'fences, no sharing', 'days a year'];
  const facts = [
    { k: '1', v: fl[0] }, { k: '6–22', v: t.skupina.eyebrow }, { k: '0', v: fl[1] }, { k: '365', v: fl[2] },
  ];
  const host = $('#vr-facts'); host.innerHTML = '';
  facts.forEach((f) => host.appendChild(el('div', null, [
    el('div', { class: 'vr-fact-k', text: f.k }), el('div', { class: 'vr-fact-v', text: f.v }),
  ])));
}

function renderAmenities() {
  const t = tt();
  // pool hero text
  $('#am-pool-tag').textContent = t.amenities.items[0].tag;
  $('#am-pool-name').textContent = t.amenities.items[0].name;
  $('#am-pool-desc').textContent = t.amenities.items[0].desc;
  // three cards: sauna (placeholder — no fitting photo curated), pergola (photo), playground (photo)
  const cards = [
    { i: 1, img: null }, { i: 2, img: 'media/gallery/pergola-exterior.jpg' }, { i: 3, img: 'media/sections/playground.jpg' },
  ];
  const host = $('#vr-amen3'); host.innerHTML = '';
  cards.forEach((c) => {
    const it = t.amenities.items[c.i];
    const art = el('article');
    if (c.img) art.appendChild(el('img', { src: c.img, alt: it.name, loading: 'lazy' }));
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

function renderSeasonsCards() {
  const t = tt();
  $('#sez-sum-tag').textContent = t.sezony.summer.tag;
  $('#sez-sum-title').textContent = t.sezony.summer.title;
  $('#sez-sum-desc').textContent = t.sezony.summer.desc;
  $('#sez-win-tag').textContent = t.sezony.winter.tag;
  $('#sez-win-title').textContent = t.sezony.winter.title;
  $('#sez-win-desc').textContent = t.sezony.winter.desc;
  const leto = state.season === 'leto';
  $('#sez-sum').setAttribute('data-on', leto ? 'true' : 'false');
  $('#sez-win').setAttribute('data-on', leto ? 'false' : 'true');
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
function fmtM(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' Kč'; }
function fmtK(k) { return (k % 100) + '. ' + (Math.floor(k / 100) % 100) + '.'; }
function nightsCount() {
  const s0 = state.selStart, s1 = state.selEnd;
  return s0 && s1 ? Math.round((toD(s1) - toD(s0)) / 86400000) : 0;
}

function renderCalendar() {
  const lang = state.lang;
  const MN = MN_ALL[lang] || MN_ALL.cs;
  const DW = DW_ALL[lang] || DW_ALL.cs;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const s0 = state.selStart, s1 = state.selEnd;
  const host = $('#vr-cal'); host.innerHTML = '';
  [0, 1].forEach((off) => {
    const base = new Date(today.getFullYear(), today.getMonth() + off, 1);
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
  updateAvailNote();
}

function renderBookingPanel() {
  const t = tt();
  const s0 = state.selStart, s1 = state.selEnd;
  const nights = nightsCount();
  $('#vr-sel-label').textContent = s0 ? fmtK(s0) + ' — ' + (s1 ? fmtK(s1) : '…') : t.book.pick;
  $('#vr-sel-nights').textContent = nights ? '· ' + nights + ' ' + (NBf[state.lang] || NBf.cs)(nights) : '';
  const priceWrap = $('#vr-price');
  if (nights > 0) {
    priceWrap.style.display = '';
    $('#vr-price-total').textContent = fmtM(nights * NIGHT_RATE);
    $('#vr-price-deposit').textContent = fmtM(Math.round(nights * NIGHT_RATE * 0.3));
  } else priceWrap.style.display = 'none';
}

function submitBooking() {
  const t = tt();
  const s0 = state.selStart, s1 = state.selEnd;
  const nights = nightsCount();
  const guests = ($('#vr-guests').value || '').trim();
  const email = ($('#vr-email').value || '').trim();
  const m = t.mail;
  const lines = [m.greeting, ''];
  if (s0 && s1) {
    lines.push(m.dates + ': ' + fmtK(s0) + ' — ' + fmtK(s1));
    lines.push(m.nights + ': ' + nights + ' ' + (NBf[state.lang] || NBf.cs)(nights));
    lines.push(m.total + ': ' + fmtM(nights * NIGHT_RATE).replace(/ /g, ' '));
    lines.push(m.deposit + ': ' + fmtM(Math.round(nights * NIGHT_RATE * 0.3)).replace(/ /g, ' '));
  }
  if (guests) lines.push(m.guests + ': ' + guests);
  if (email) lines.push(m.from + ': ' + email);
  const href = 'mailto:' + CONTACT_EMAIL + '?subject=' + encodeURIComponent(m.subject) + '&body=' + encodeURIComponent(lines.join('\n'));
  window.location.href = href;
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

function setLang(lang) {
  if (!T[lang] || state.lang === lang) return;
  state.lang = lang;
  try { localStorage.setItem('vrLang', lang); } catch (e) {}
  applyLangButtons(); setTexts();
  renderFacts(); renderAmenities(); renderThumbs(); renderScene();
  renderSeasonsCards(); renderLokFacts(); renderTrips(); renderGallery();
  renderCalendar(); renderBookingPanel(); applyTip();
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
  eagerLoadSeason(season);
  document.querySelector('.vr-root').setAttribute('data-season', season);
  applySeasonButtons(); renderSeasonsCards(); applyTip();
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

/* ============================ Hero parallax + nav state (rAF) ============================ */
function startRaf() {
  const clamp = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let mx = 0, my = 0, cmx = 0, cmy = 0;
  if (!reduce) window.addEventListener('mousemove', (e) => {
    mx = (e.clientX / window.innerWidth - 0.5) * 2;
    my = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  const $id = (id) => document.getElementById(id);
  const render = () => {
    requestAnimationFrame(render);
    try {
      const vh = window.innerHeight || 1;
      cmx += (mx - cmx) * 0.06; cmy += (my - cmy) * 0.06;
      const heroPhoto = $id('vrhPhoto'), hint = $id('vrimHint');
      const hp = clamp(window.scrollY / vh);
      if (heroPhoto) heroPhoto.style.transform = 'scale(1.08) translate(' + (cmx * -8).toFixed(1) + 'px,' + (hp * 46 + cmy * -6).toFixed(1) + 'px)';
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
  // restore saved language
  try { const saved = localStorage.getItem('vrLang'); if (saved && T[saved]) state.lang = saved; } catch (e) {}

  // language buttons
  $all('.vr-lang').forEach((b) => b.addEventListener('click', () => setLang(b.getAttribute('data-lang'))));
  // season buttons
  $all('.vr-segbtn').forEach((b) => b.addEventListener('click', () => setSeason(b.getAttribute('data-season'))));
  // season card click toggles season
  $('#sez-sum').addEventListener('click', () => setSeason('leto'));
  $('#sez-win').addEventListener('click', () => setSeason('zima'));

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
  // mobile menu
  $('#vr-burger').addEventListener('click', () => toggleMob());
  $all('#vr-mob a').forEach((a) => a.addEventListener('click', () => toggleMob(false)));

  // initial render
  document.querySelector('.vr-root').setAttribute('data-season', state.season);
  state.galFilter = state.season === 'zima' ? 'zima' : 'all';
  applyLangButtons(); applySeasonButtons(); setTexts();
  renderFacts(); renderAmenities(); renderThumbs(); renderScene();
  renderSeasonsCards(); renderLokFacts(); renderTrips(); renderGallery();
  renderCalendar(); renderBookingPanel(); applyTip();
  loadAvailability();

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
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
