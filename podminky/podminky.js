/* Villa Rudolf — Podmínky a ochrana osobních údajů (/podminky/).
   Vanilla JS, no framework. Renders the page from a 4-language data object and
   inherits the seasonal theme (?season → localStorage vrSeason → léto, mirroring
   the homepage) plus the language cascade (?lang → localStorage vrLang → navigator). */
(function () {
  'use strict';

  var T = {
    cs: {
      nav: { dum: 'Dům', vybaveni: 'Vybavení', galerie: 'Galerie', loznice: 'Interiér', lokalita: 'Lokalita', vylety: 'Výlety', info: 'Praktické info', book: 'Rezervovat' },
      badge: 'Ubytovací podmínky',
      title: 'Ubytovací podmínky a ochrana údajů',
      intro: 'Storno podmínky, zpracování osobních údajů a kontakt na provozovatele. Střízlivě a přehledně.',
      stornoTitle: 'Storno podmínky',
      stornoLead: 'Záloha ve výši 30 % z celkové ceny je splatná po potvrzení termínu a započítává se do konečné ceny pobytu. Při zrušení rezervace účtujeme storno poplatek podle toho, kolik dní před příjezdem k zrušení dojde:',
      colWhen: 'Zrušení pobytu',
      colFee: 'Storno poplatek',
      stornoRows: [
        ['60 a více dní před příjezdem', '10 % z celkové ceny'],
        ['59–35 dní před příjezdem', '35 %'],
        ['34–21 dní před příjezdem', '50 %'],
        ['20–11 dní před příjezdem', '70 %'],
        ['10 a méně dní před příjezdem', '100 %'],
      ],
      gdprTitle: 'Ochrana osobních údajů',
      gdprRows: [
        ['Správce údajů', 'Sintera Czech s.r.o., IČO 29130336, Orlická 163/18, 500 03 Hradec Králové'],
        ['Poptávka a rezervace', 'Jméno, e-mail, telefon, termín pobytu, počet osob a text vaší zprávy — abychom vyřídili poptávku, uzavřeli ubytovací smlouvu a domluvili s vámi průběh pobytu. Právní základ: plnění smlouvy.'],
        ['Zákonná evidence ubytovaných', 'Jméno, datum narození a adresa, u cizinců také státní občanství a číslo dokladu — pro domovní knihu, poplatek z pobytu a hlášení cizinecké policii (UbyPort). Právní základ: zákonná povinnost; evidenci uchováváme 6 let a nelze ji na žádost vymazat dříve.'],
        ['Osobní průvodce výlety', 'Odkaz s tokenem jen pro vás. Průvodce zná vaše jméno, termín a složení skupiny (počet dospělých a dětí, případně zájmy), aby doporučil výlety na míru. Odkaz platí 14 dní po odjezdu.'],
        ['Provoz vily', 'Kód ke dveřím a lednici a poznámky k pobytu (např. postýlka, dřívější příjezd) — jen po dobu pobytu, aby vše fungovalo bez čekání.'],
        ['Kde údaje jsou', 'U zpracovatele Supabase (servery AWS v Londýně, Spojené království — země s rozhodnutím EU o odpovídající ochraně) a v e-mailu a kalendáři majitele. Rezervační portály (Booking.com, Airbnb, FeWo-direkt, e-chalupy) jsou samostatní správci a řídí se vlastními podmínkami.'],
        ['Doba uchování', 'Kontaktní údaje, poznámky a kód ke dveřím se 30 dní po odjezdu automaticky anonymizují. Evidenci ubytovaných uchováváme 6 let, účetní doklady po dobu stanovenou zákonem.'],
        ['Měření návštěvnosti a externí zdroje', 'Návštěvnost webu i průvodce měříme nástrojem Umami — bez cookies a bez ukládání IP adres. Data o výletech a počasí načítáme z vlastních zdrojů; písma z Google Fonts (Google LLC, USA).'],
        ['Vaše práva', 'Přístup k údajům, oprava, výmaz, omezení zpracování, námitka a přenositelnost. Stížnost můžete podat u Úřadu pro ochranu osobních údajů (uoou.gov.cz). Žádosti vyřídíme do 30 dnů.'],
        ['Kontakt', '<a href="mailto:rezervace@villarudolf.com">rezervace@villarudolf.com</a>'],
      ],
      cookies: 'Web ani průvodce nepoužívají žádné sledovací cookies. Návštěvnost měříme anonymně nástrojem Umami, který funguje bez cookies a neukládá IP adresy.',
      operatorTitle: 'Provozovatel',
      operatorRows: [
        ['Provozovatel', 'Sintera Czech s.r.o.'],
        ['IČO', '29130336'],
        ['Sídlo', 'Orlická 163/18, 500 03 Hradec Králové'],
        ['Objekt', 'Villa Rudolf — soukromé horské sídlo, Svoboda nad Úpou, Krkonoše'],
        ['Kontaktní osoba', 'Pavel Kubizňák'],
        ['E-mail', '<a href="mailto:rezervace@villarudolf.com">rezervace@villarudolf.com</a>'],
        ['Telefon', '<a href="tel:+420775220785">+420 775 220 785</a>'],
      ],
      back: 'Zpět na web vily',
      footBrand: 'Villa Rudolf · Svoboda nad Úpou, Krkonoše',
    },
    en: {
      nav: { dum: 'The House', vybaveni: 'Amenities', galerie: 'Gallery', loznice: 'Interior', lokalita: 'Location', vylety: 'Trips', info: 'Guest info', book: 'Book' },
      badge: 'Booking terms',
      title: 'Booking terms & privacy',
      intro: 'Cancellation terms, how we handle personal data, and the operator’s contact. Kept short and clear.',
      stornoTitle: 'Cancellation terms',
      stornoLead: 'A deposit of 30% of the total price is due after we confirm your dates and counts towards the final price of the stay. If you cancel, a cancellation fee applies depending on how many days before arrival you cancel:',
      colWhen: 'When you cancel',
      colFee: 'Cancellation fee',
      stornoRows: [
        ['60 or more days before arrival', '10% of the total price'],
        ['59–35 days before arrival', '35%'],
        ['34–21 days before arrival', '50%'],
        ['20–11 days before arrival', '70%'],
        ['10 or fewer days before arrival', '100%'],
      ],
      gdprTitle: 'Privacy (personal data)',
      gdprRows: [
        ['Data controller', 'Sintera Czech s.r.o., Company ID 29130336, Orlická 163/18, 500 03 Hradec Králové, Czech Republic'],
        ['Enquiry and booking', 'Name, email, phone, dates of stay, number of guests and the text of your message — to handle your enquiry, conclude the accommodation contract and communicate with you about the stay. Legal basis: performance of a contract.'],
        ['Statutory guest register', 'Name, date of birth and address; for foreign nationals also citizenship and ID document number — for the guest book, the tourist tax and the report to the Czech Foreign Police (UbyPort). Legal basis: legal obligation; kept for 6 years and cannot be erased on request any sooner.'],
        ['Personal trip guide', 'A link with a token just for you. The guide knows your name, dates and party (number of adults and children, optionally interests) so it can recommend trips that fit. The link works for 14 days after departure.'],
        ['Running the villa', 'Door and fridge code and notes about your stay (e.g. a cot, early arrival) — only for the duration of the stay, so everything works without waiting.'],
        ['Where the data is', 'With our processor Supabase (AWS servers in London, United Kingdom — a country with an EU adequacy decision) and in the owner’s email and calendar. Booking platforms (Booking.com, Airbnb, FeWo-direkt, e-chalupy) are independent controllers under their own terms.'],
        ['Retention', 'Contact details, notes and the door code are anonymised automatically 30 days after departure. The guest register is kept for 6 years, accounting records for the period set by law.'],
        ['Analytics and external sources', 'Traffic on the site and in the guide is measured with Umami — no cookies, no IP addresses stored. Trip and weather data come from our own sources; fonts are loaded from Google Fonts (Google LLC, USA).'],
        ['Your rights', 'Access, rectification, erasure, restriction of processing, objection and data portability. You may also lodge a complaint with the Czech Data Protection Office (uoou.gov.cz). We respond to requests within 30 days.'],
        ['Contact', '<a href="mailto:rezervace@villarudolf.com">rezervace@villarudolf.com</a>'],
      ],
      cookies: 'Neither the site nor the guide uses tracking cookies. We measure traffic anonymously with Umami, which works without cookies and does not store IP addresses.',
      operatorTitle: 'Operator',
      operatorRows: [
        ['Operator', 'Sintera Czech s.r.o.'],
        ['Company ID (IČO)', '29130336'],
        ['Registered office', 'Orlická 163/18, 500 03 Hradec Králové, Czech Republic'],
        ['Property', 'Villa Rudolf — a private mountain estate, Svoboda nad Úpou, Krkonoše'],
        ['Contact person', 'Pavel Kubizňák'],
        ['Email', '<a href="mailto:rezervace@villarudolf.com">rezervace@villarudolf.com</a>'],
        ['Phone', '<a href="tel:+420775220785">+420 775 220 785</a>'],
      ],
      back: 'Back to the villa site',
      footBrand: 'Villa Rudolf · Svoboda nad Úpou, Krkonoše',
    },
    de: {
      nav: { dum: 'Das Haus', vybaveni: 'Ausstattung', galerie: 'Galerie', loznice: 'Innenräume', lokalita: 'Lage', vylety: 'Ausflüge', info: 'Gäste-Infos', book: 'Buchen' },
      badge: 'Buchungsbedingungen',
      title: 'Buchungsbedingungen & Datenschutz',
      intro: 'Stornobedingungen, Umgang mit personenbezogenen Daten und Kontakt zum Betreiber. Kurz und klar.',
      stornoTitle: 'Stornobedingungen',
      stornoLead: 'Eine Anzahlung von 30 % des Gesamtpreises ist nach Bestätigung des Termins fällig und wird auf den Endpreis des Aufenthalts angerechnet. Bei Stornierung fällt eine Gebühr an, je nachdem, wie viele Tage vor Anreise storniert wird:',
      colWhen: 'Zeitpunkt der Stornierung',
      colFee: 'Stornogebühr',
      stornoRows: [
        ['60 oder mehr Tage vor Anreise', '10 % des Gesamtpreises'],
        ['59–35 Tage vor Anreise', '35 %'],
        ['34–21 Tage vor Anreise', '50 %'],
        ['20–11 Tage vor Anreise', '70 %'],
        ['10 oder weniger Tage vor Anreise', '100 %'],
      ],
      gdprTitle: 'Datenschutz',
      gdprRows: [
        ['Verantwortlicher', 'Sintera Czech s.r.o., IČO 29130336, Orlická 163/18, 500 03 Hradec Králové, Tschechien'],
        ['Anfrage und Buchung', 'Name, E-Mail, Telefon, Aufenthaltstermin, Personenzahl und der Text eurer Nachricht — um eure Anfrage zu bearbeiten, den Beherbergungsvertrag zu schließen und mit euch über den Aufenthalt zu kommunizieren. Rechtsgrundlage: Vertragserfüllung.'],
        ['Gesetzliches Gästeverzeichnis', 'Name, Geburtsdatum und Anschrift, bei ausländischen Gästen auch Staatsangehörigkeit und Ausweisnummer — für das Hausbuch, die Aufenthaltsabgabe und die Meldung an die tschechische Ausländerpolizei (UbyPort). Rechtsgrundlage: gesetzliche Pflicht; wir bewahren das Verzeichnis 6 Jahre auf, eine frühere Löschung auf Wunsch ist nicht möglich.'],
        ['Persönlicher Ausflugsführer', 'Ein Link mit Token nur für euch. Der Führer kennt euren Namen, den Termin und die Zusammensetzung der Gruppe (Erwachsene, Kinder, optional Interessen), um passende Ausflüge vorzuschlagen. Der Link gilt 14 Tage nach der Abreise.'],
        ['Betrieb der Villa', 'Code für Tür und Kühlschrank sowie Notizen zum Aufenthalt (z. B. Kinderbett, frühere Anreise) — nur während des Aufenthalts, damit alles ohne Warten funktioniert.'],
        ['Wo die Daten liegen', 'Beim Auftragsverarbeiter Supabase (AWS-Server in London, Vereinigtes Königreich — ein Land mit Angemessenheitsbeschluss der EU) sowie in E-Mail und Kalender des Eigentümers. Buchungsportale (Booking.com, Airbnb, FeWo-direkt, e-chalupy) sind eigenständige Verantwortliche mit eigenen Bedingungen.'],
        ['Speicherdauer', 'Kontaktdaten, Notizen und der Türcode werden 30 Tage nach der Abreise automatisch anonymisiert. Das Gästeverzeichnis bewahren wir 6 Jahre auf, Buchungsbelege so lange, wie es das Gesetz verlangt.'],
        ['Messung und externe Quellen', 'Die Besucherzahl der Website und des Führers messen wir mit Umami — ohne Cookies und ohne Speicherung von IP-Adressen. Ausflugs- und Wetterdaten laden wir aus eigenen Quellen; Schriften von Google Fonts (Google LLC, USA).'],
        ['Eure Rechte', 'Auskunft, Berichtigung, Löschung, Einschränkung der Verarbeitung, Widerspruch und Datenübertragbarkeit. Eine Beschwerde könnt ihr bei der tschechischen Datenschutzbehörde ÚOOÚ (uoou.gov.cz) einreichen. Anfragen beantworten wir innerhalb von 30 Tagen.'],
        ['Kontakt', '<a href="mailto:rezervace@villarudolf.com">rezervace@villarudolf.com</a>'],
      ],
      cookies: 'Weder die Website noch der Führer verwenden Tracking-Cookies. Die Besucherzahl messen wir anonym mit Umami, das ohne Cookies arbeitet und keine IP-Adressen speichert.',
      operatorTitle: 'Betreiber',
      operatorRows: [
        ['Betreiber', 'Sintera Czech s.r.o.'],
        ['Ident.-Nr. (IČO)', '29130336'],
        ['Sitz', 'Orlická 163/18, 500 03 Hradec Králové, Tschechien'],
        ['Objekt', 'Villa Rudolf — ein privates Berganwesen, Svoboda nad Úpou, Riesengebirge'],
        ['Ansprechpartner', 'Pavel Kubizňák'],
        ['E-Mail', '<a href="mailto:rezervace@villarudolf.com">rezervace@villarudolf.com</a>'],
        ['Telefon', '<a href="tel:+420775220785">+420 775 220 785</a>'],
      ],
      back: 'Zurück zur Villa-Website',
      footBrand: 'Villa Rudolf · Svoboda nad Úpou, Riesengebirge',
    },
    pl: {
      nav: { dum: 'Dom', vybaveni: 'Udogodnienia', galerie: 'Galeria', loznice: 'Wnętrza', lokalita: 'Lokalizacja', vylety: 'Wycieczki', info: 'Informacje praktyczne', book: 'Rezerwuj' },
      badge: 'Warunki pobytu',
      title: 'Warunki pobytu i prywatność',
      intro: 'Warunki anulowania, przetwarzanie danych osobowych i kontakt do operatora. Krótko i jasno.',
      stornoTitle: 'Warunki anulowania',
      stornoLead: 'Zaliczka w wysokości 30 % ceny całkowitej jest płatna po potwierdzeniu terminu i jest wliczana do ostatecznej ceny pobytu. W razie anulowania pobieramy opłatę zależnie od tego, ile dni przed przyjazdem następuje rezygnacja:',
      colWhen: 'Moment anulowania',
      colFee: 'Opłata za anulowanie',
      stornoRows: [
        ['60 lub więcej dni przed przyjazdem', '10 % ceny całkowitej'],
        ['59–35 dni przed przyjazdem', '35 %'],
        ['34–21 dni przed przyjazdem', '50 %'],
        ['20–11 dni przed przyjazdem', '70 %'],
        ['10 lub mniej dni przed przyjazdem', '100 %'],
      ],
      gdprTitle: 'Ochrona danych osobowych',
      gdprRows: [
        ['Administrator danych', 'Sintera Czech s.r.o., IČO 29130336, Orlická 163/18, 500 03 Hradec Králové, Czechy'],
        ['Zapytanie i rezerwacja', 'Imię i nazwisko, e-mail, telefon, termin pobytu, liczba osób i treść wiadomości — aby obsłużyć Wasze zapytanie, zawrzeć umowę o zakwaterowanie i uzgodnić z Wami przebieg pobytu. Podstawa prawna: wykonanie umowy.'],
        ['Ustawowa ewidencja gości', 'Imię i nazwisko, data urodzenia i adres, u cudzoziemców także obywatelstwo i numer dokumentu — do księgi meldunkowej, opłaty miejscowej i zgłoszenia czeskiej policji ds. cudzoziemców (UbyPort). Podstawa prawna: obowiązek ustawowy; ewidencję przechowujemy 6 lat i nie można jej usunąć wcześniej na żądanie.'],
        ['Osobisty przewodnik po wycieczkach', 'Link z tokenem tylko dla Was. Przewodnik zna Wasze nazwisko, termin i skład grupy (liczba dorosłych i dzieci, ewentualnie zainteresowania), aby polecić wycieczki na miarę. Link działa 14 dni po wyjeździe.'],
        ['Obsługa willi', 'Kod do drzwi i lodówki oraz uwagi do pobytu (np. łóżeczko, wcześniejszy przyjazd) — tylko na czas pobytu, aby wszystko działało bez czekania.'],
        ['Gdzie są dane', 'U podmiotu przetwarzającego Supabase (serwery AWS w Londynie, Wielka Brytania — kraj z decyzją UE o odpowiednim stopniu ochrony) oraz w e-mailu i kalendarzu właściciela. Portale rezerwacyjne (Booking.com, Airbnb, FeWo-direkt, e-chalupy) są odrębnymi administratorami i działają według własnych regulaminów.'],
        ['Okres przechowywania', 'Dane kontaktowe, uwagi i kod do drzwi są automatycznie anonimizowane 30 dni po wyjeździe. Ewidencję gości przechowujemy 6 lat, dokumenty księgowe przez okres określony ustawą.'],
        ['Pomiar ruchu i źródła zewnętrzne', 'Ruch na stronie i w przewodniku mierzymy narzędziem Umami — bez cookies i bez zapisywania adresów IP. Dane o wycieczkach i pogodzie ładujemy z własnych źródeł; czcionki z Google Fonts (Google LLC, USA).'],
        ['Wasze prawa', 'Dostęp do danych, sprostowanie, usunięcie, ograniczenie przetwarzania, sprzeciw i przenoszenie danych. Skargę można wnieść do czeskiego Urzędu Ochrony Danych Osobowych (uoou.gov.cz). Wnioski rozpatrujemy w ciągu 30 dni.'],
        ['Kontakt', '<a href="mailto:rezervace@villarudolf.com">rezervace@villarudolf.com</a>'],
      ],
      cookies: 'Ani strona, ani przewodnik nie używają plików cookie śledzących. Ruch mierzymy anonimowo narzędziem Umami, które działa bez cookies i nie zapisuje adresów IP.',
      operatorTitle: 'Operator',
      operatorRows: [
        ['Operator', 'Sintera Czech s.r.o.'],
        ['Numer identyfikacyjny (IČO)', '29130336'],
        ['Siedziba', 'Orlická 163/18, 500 03 Hradec Králové, Czechy'],
        ['Obiekt', 'Villa Rudolf — prywatna górska rezydencja, Svoboda nad Úpou, Karkonosze'],
        ['Osoba kontaktowa', 'Pavel Kubizňák'],
        ['E-mail', '<a href="mailto:rezervace@villarudolf.com">rezervace@villarudolf.com</a>'],
        ['Telefon', '<a href="tel:+420775220785">+420 775 220 785</a>'],
      ],
      back: 'Powrót na stronę willi',
      footBrand: 'Villa Rudolf · Svoboda nad Úpou, Karkonosze',
    },
  };

  /* Název ať je hned zřejmý — majitel hledal „ubytovací podmínky" a nenašel je. */
  var META = {
    cs: 'Ubytovací podmínky a ochrana údajů | Villa Rudolf',
    en: 'Booking terms & privacy | Villa Rudolf',
    de: 'Buchungsbedingungen & Datenschutz | Villa Rudolf',
    pl: 'Warunki pobytu i prywatność | Villa Rudolf',
  };

  var qs = new URLSearchParams(location.search);
  var state = { lang: 'cs', season: 'leto' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* Whitelist přes hasOwnProperty — `T['constructor']` by jinak prošel a otrávil localStorage. */
  function isLang(x) { return typeof x === 'string' && Object.prototype.hasOwnProperty.call(T, x); }
  /* Nizozemsky a francouzsky tahle stránka není (homepage /nl/ a /fr/ ano) — místo češtiny angličtina. */
  var NAHRADA = { nl: 'en', fr: 'en' };
  function jazyk(x) { x = String(x || '').toLowerCase(); return isLang(x) ? x : (NAHRADA[x] || null); }
  function resolveLang() {
    var q = jazyk(qs.get('lang'));
    if (q) return q;
    try { var s = jazyk(localStorage.getItem('vrLang')); if (s) return s; } catch (e) {}
    var nav = jazyk((navigator.language || navigator.userLanguage || '').slice(0, 2));
    return nav || 'cs';
  }
  /* Sezóna dědí z webu — ?season → DATUM → volba v rámci návštěvy (assets/season.js). */
  function resolveSeason() {
    if (window.VRSeason) return window.VRSeason.resolve(location.search);
    var q = (qs.get('season') || '').toLowerCase();
    return (q === 'leto' || q === 'zima') ? q : 'leto';
  }

  /* Odkaz na hlavní web se nese jazyk + sezónu, aby se dědičnost nerozbila. */
  function hp(hash) {
    var q = '?lang=' + encodeURIComponent(state.lang) + '&season=' + encodeURIComponent(state.season);
    // Homepage má od 10/2026 vlastní adresu pro každý jazyk (/de/, /pl/, /en/) — rovnou tam.
    var home = state.lang === 'cs' ? '../' + q : '../' + state.lang + '/?season=' + encodeURIComponent(state.season);
    return home + (hash ? '#' + hash : '');
  }
  /* 6 hlavních sekcí webu — shodné s hlavičkou homepage. Výlety = samostatná stránka. */
  function siteLinks(L) {
    var n = L.nav;
    var out = [['dum', n.dum], ['vybaveni', n.vybaveni], ['galerie', n.galerie], ['loznice', n.loznice], ['lokalita', n.lokalita]]
      .map(function (x) { return '<a href="' + hp(x[0]) + '">' + esc(x[1]) + '</a>'; }).join('');
    out += '<a href="../vylety/?lang=' + encodeURIComponent(state.lang) + '&season=' + encodeURIComponent(state.season) + '">' + esc(n.vylety) + '</a>';
    return out;
  }
  /* Sjednocená hlavní navigace — shodná s homepage .vr-nav (plná lišta nad obsahem). */
  function renderNav(L, langs) {
    var infoHref = '../info/?lang=' + encodeURIComponent(state.lang) + '&season=' + encodeURIComponent(state.season);
    return '<header class="vr-nav"><div class="vr-nav-inner">'
      + '<a class="vr-brand" href="' + hp('') + '"><b>VILLA RUDOLF</b><i>KRKONOŠE</i></a>'
      + '<nav class="vr-navlinks" aria-label="Sekce webu">' + siteLinks(L) + '</nav>'
      + '<div class="vr-navright"><div class="vr-langs" role="group" aria-label="Jazyk / Language">' + langs + '</div>'
      + '<a class="vr-navcta" href="' + hp('rezervace') + '">' + esc(L.nav.book) + '</a>'
      + '<button class="vr-burger" id="vr-burger" aria-label="Menu" aria-expanded="false" aria-controls="vr-mob"><span></span><span></span><span></span></button>'
      + '</div></div></header>'
      + '<div class="vr-mob" id="vr-mob" data-open="false">' + siteLinks(L)
      + '<a class="vr-mob-cta" href="' + hp('rezervace') + '">' + esc(L.nav.book) + '</a>'
      + '<a class="vr-mob-2nd" href="' + infoHref + '">' + esc(L.nav.info) + '</a>'
      + '<div class="vr-mob-langs" role="group" aria-label="Jazyk / Language">' + langs + '</div></div>';
  }

  function render() {
    var L = T[state.lang];
    document.documentElement.lang = state.lang;
    document.title = META[state.lang] || META.cs;
    var langs = ['cs', 'en', 'de', 'pl'].map(function (l) {
      return '<button type="button" class="vr-lang" data-lang="' + l + '" data-active="' + (l === state.lang) + '">' + l.toUpperCase() + '</button>';
    }).join('');
    var stornoBody = L.stornoRows.map(function (r, i) {
      return '<tr><td class="when">' + esc(r[0]) + '</td><td class="fee">' + esc(r[1]) + '</td></tr>';
    }).join('');
    var gdprBody = L.gdprRows.map(function (r) {
      return '<div class="pd-row"><div class="pd-rk">' + esc(r[0]) + '</div><div class="pd-rv">' + r[1] + '</div></div>';
    }).join('');
    var opBody = L.operatorRows.map(function (r) {
      return '<div class="pd-row"><div class="pd-rk">' + esc(r[0]) + '</div><div class="pd-rv">' + r[1] + '</div></div>';
    }).join('');
    var lockIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="10" width="16" height="10" rx="2"></rect><path d="M8 10V7a4 4 0 0 1 8 0v3"></path></svg>';
    var arrowL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"></path></svg>';

    document.getElementById('app').innerHTML =
      renderNav(L, langs)
      + '<div class="pd-wrap">'
      + '<section class="pd-hero"><p class="pd-eyebrow">Villa Rudolf · Krkonoše</p><h1 class="pd-title">' + esc(L.title) + '</h1><p class="pd-intro">' + esc(L.intro) + '</p></section>'
      + '<main class="pd-main">'
      + '<section class="pd-sec"><h2 class="pd-h2">' + esc(L.stornoTitle) + '</h2><p class="pd-lead">' + esc(L.stornoLead) + '</p>'
      + '<div class="pd-tablewrap"><table class="pd-table"><thead><tr><th>' + esc(L.colWhen) + '</th><th style="text-align:right">' + esc(L.colFee) + '</th></tr></thead><tbody>' + stornoBody + '</tbody></table></div></section>'
      + '<section class="pd-sec" id="udaje"><h2 class="pd-h2">' + esc(L.gdprTitle) + '</h2><div class="pd-rows">' + gdprBody + '</div>'
      + '<div class="pd-note">' + lockIcon + '<p>' + esc(L.cookies) + '</p></div></section>'
      + '<section class="pd-sec"><h2 class="pd-h2">' + esc(L.operatorTitle) + '</h2><div class="pd-rows">' + opBody + '</div></section>'
      + '</main>'
      + '<footer class="pd-footer"><a class="pd-back" href="' + hp('') + '">' + arrowL + '<span>' + esc(L.back) + '</span></a><span class="pd-foot-brand">' + esc(L.footBrand) + '</span></footer>'
      + '</div>';

    document.body.style.overflow = ''; // po re-renderu je mobilní menu zavřené
    Array.prototype.forEach.call(document.querySelectorAll('.vr-lang'), function (b) {
      b.addEventListener('click', function () {
        state.lang = b.dataset.lang;
        try { localStorage.setItem('vrLang', state.lang); } catch (e) {}
        try { var u = new URL(location.href); u.searchParams.set('lang', state.lang); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch (e) {}
        render();
      });
    });
    // burger / mobilní menu
    var burger = document.getElementById('vr-burger'), mob = document.getElementById('vr-mob');
    if (burger && mob) {
      var toggleMob = function (open) {
        var o = open == null ? mob.getAttribute('data-open') !== 'true' : open;
        mob.setAttribute('data-open', o ? 'true' : 'false');
        burger.setAttribute('aria-expanded', o ? 'true' : 'false');
        document.body.style.overflow = o ? 'hidden' : '';
      };
      burger.addEventListener('click', function () { toggleMob(); });
      Array.prototype.forEach.call(mob.querySelectorAll('a'), function (a) { a.addEventListener('click', function () { toggleMob(false); }); });
    }
  }

  state.lang = resolveLang();
  state.season = resolveSeason();
  // vrLang se ukládá jen kliknutím na přepínač — podle něj přesměrovává „/" (10/2026)
  if (window.VRSeason) window.VRSeason.remember(state.season);
  document.querySelector('.pd-root').setAttribute('data-season', state.season);
  var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', state.season === 'zima' ? '#eef2f6' : '#0E1311');
  render();
})();
