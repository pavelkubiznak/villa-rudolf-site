/* Villa Rudolf — Podmínky a ochrana osobních údajů (/podminky/).
   Vanilla JS, no framework. Renders the page from a 4-language data object and
   inherits the seasonal theme (?season → localStorage vrSeason → léto, mirroring
   the homepage) plus the language cascade (?lang → localStorage vrLang → navigator). */
(function () {
  'use strict';

  var T = {
    cs: {
      badge: 'Podmínky',
      title: 'Podmínky a ochrana osobních údajů',
      intro: 'Storno podmínky, zpracování osobních údajů a kontakt na provozovatele. Střízlivě a přehledně.',
      stornoTitle: 'Storno podmínky',
      stornoLead: 'Záloha ve výši 30 % z celkové ceny je splatná po potvrzení termínu a započítává se do konečné ceny pobytu. Při zrušení rezervace účtujeme storno poplatek podle toho, kolik dní před příjezdem k zrušení dojde:',
      colWhen: 'Zrušení pobytu',
      colFee: 'Storno poplatek',
      stornoRows: [
        ['Do 60 dnů před příjezdem', '10 % z celkové ceny'],
        ['59–35 dní před příjezdem', '35 %'],
        ['34–21 dní před příjezdem', '50 %'],
        ['20–11 dní před příjezdem', '70 %'],
        ['Méně než 10 dní před příjezdem', '100 %'],
      ],
      gdprTitle: 'Ochrana osobních údajů',
      gdprRows: [
        ['Účel', 'Vaše údaje zpracováváme výhradně kvůli vyřízení žádosti o rezervaci a komunikaci s vámi ohledně pobytu.'],
        ['Rozsah údajů', 'Jméno, e-mail, telefon, termín pobytu a text vaší zprávy.'],
        ['Uložení', 'Údaje jsou bezpečně uloženy u zpracovatele Supabase (datová centra v EU) a uchováváme je jen po nezbytně nutnou dobu.'],
        ['Vaše práva', 'Máte právo na přístup k údajům, jejich opravu i výmaz, na omezení zpracování a na vznesení námitky. Stačí nás kontaktovat.'],
        ['Kontakt', '<a href="mailto:rezervace@villarudolf.com">rezervace@villarudolf.com</a>'],
      ],
      cookies: 'Web nepoužívá žádné sledovací cookies. Návštěvnost měříme anonymně nástrojem Umami, který funguje zcela bez cookies.',
      operatorTitle: 'Provozovatel',
      operatorRows: [
        ['Provozovatel', 'Pavel Kubizňák'],
        ['Objekt', 'Villa Rudolf — soukromé horské sídlo'],
        ['Adresa', 'Svoboda nad Úpou, Krkonoše, Česká republika'],
        ['E-mail', '<a href="mailto:rezervace@villarudolf.com">rezervace@villarudolf.com</a>'],
        ['Telefon', '<a href="tel:+420775220785">+420 775 220 785</a>'],
      ],
      back: 'Zpět na web vily',
      footBrand: 'Villa Rudolf · Svoboda nad Úpou, Krkonoše',
    },
    en: {
      badge: 'Terms',
      title: 'Terms & privacy',
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
        ['Fewer than 10 days before arrival', '100%'],
      ],
      gdprTitle: 'Privacy (personal data)',
      gdprRows: [
        ['Purpose', 'We process your data solely to handle your booking request and to communicate with you about your stay.'],
        ['Data collected', 'Name, email, phone, dates of stay and the text of your message.'],
        ['Storage', 'Data is stored securely with our processor Supabase (data centres in the EU) and kept only for as long as necessary.'],
        ['Your rights', 'You have the right to access, correct or erase your data, to restrict processing and to object. Just get in touch.'],
        ['Contact', '<a href="mailto:rezervace@villarudolf.com">rezervace@villarudolf.com</a>'],
      ],
      cookies: 'The site uses no tracking cookies. We measure traffic anonymously with Umami, which works entirely without cookies.',
      operatorTitle: 'Operator',
      operatorRows: [
        ['Operator', 'Pavel Kubizňák'],
        ['Property', 'Villa Rudolf — a private mountain estate'],
        ['Address', 'Svoboda nad Úpou, Krkonoše, Czech Republic'],
        ['Email', '<a href="mailto:rezervace@villarudolf.com">rezervace@villarudolf.com</a>'],
        ['Phone', '<a href="tel:+420775220785">+420 775 220 785</a>'],
      ],
      back: 'Back to the villa site',
      footBrand: 'Villa Rudolf · Svoboda nad Úpou, Krkonoše',
    },
    de: {
      badge: 'Bedingungen',
      title: 'Bedingungen & Datenschutz',
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
        ['Weniger als 10 Tage vor Anreise', '100 %'],
      ],
      gdprTitle: 'Datenschutz',
      gdprRows: [
        ['Zweck', 'Wir verarbeiten eure Daten ausschließlich zur Bearbeitung der Buchungsanfrage und zur Kommunikation über euren Aufenthalt.'],
        ['Umfang', 'Name, E-Mail, Telefon, Aufenthaltstermin und der Text eurer Nachricht.'],
        ['Speicherung', 'Die Daten werden sicher beim Auftragsverarbeiter Supabase (Rechenzentren in der EU) gespeichert und nur so lange wie nötig aufbewahrt.'],
        ['Eure Rechte', 'Ihr habt das Recht auf Auskunft, Berichtigung und Löschung, auf Einschränkung der Verarbeitung und auf Widerspruch. Kontaktiert uns einfach.'],
        ['Kontakt', '<a href="mailto:rezervace@villarudolf.com">rezervace@villarudolf.com</a>'],
      ],
      cookies: 'Die Website verwendet keine Tracking-Cookies. Die Besucherzahl messen wir anonym mit Umami, das ganz ohne Cookies funktioniert.',
      operatorTitle: 'Betreiber',
      operatorRows: [
        ['Betreiber', 'Pavel Kubizňák'],
        ['Objekt', 'Villa Rudolf — ein privates Berganwesen'],
        ['Adresse', 'Svoboda nad Úpou, Riesengebirge, Tschechien'],
        ['E-Mail', '<a href="mailto:rezervace@villarudolf.com">rezervace@villarudolf.com</a>'],
        ['Telefon', '<a href="tel:+420775220785">+420 775 220 785</a>'],
      ],
      back: 'Zurück zur Villa-Website',
      footBrand: 'Villa Rudolf · Svoboda nad Úpou, Riesengebirge',
    },
    pl: {
      badge: 'Warunki',
      title: 'Warunki i ochrona danych',
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
        ['Mniej niż 10 dni przed przyjazdem', '100 %'],
      ],
      gdprTitle: 'Ochrona danych osobowych',
      gdprRows: [
        ['Cel', 'Wasze dane przetwarzamy wyłącznie w celu obsługi prośby o rezerwację i komunikacji w sprawie pobytu.'],
        ['Zakres', 'Imię, e-mail, telefon, termin pobytu i treść wiadomości.'],
        ['Przechowywanie', 'Dane są bezpiecznie przechowywane u podmiotu przetwarzającego Supabase (centra danych w UE) i przechowujemy je tylko przez niezbędny czas.'],
        ['Wasze prawa', 'Macie prawo dostępu do danych, ich sprostowania i usunięcia, ograniczenia przetwarzania oraz wniesienia sprzeciwu. Wystarczy się skontaktować.'],
        ['Kontakt', '<a href="mailto:rezervace@villarudolf.com">rezervace@villarudolf.com</a>'],
      ],
      cookies: 'Strona nie używa żadnych plików cookie śledzących. Ruch mierzymy anonimowo narzędziem Umami, które działa całkowicie bez cookies.',
      operatorTitle: 'Operator',
      operatorRows: [
        ['Operator', 'Pavel Kubizňák'],
        ['Obiekt', 'Villa Rudolf — prywatna górska rezydencja'],
        ['Adres', 'Svoboda nad Úpou, Karkonosze, Czechy'],
        ['E-mail', '<a href="mailto:rezervace@villarudolf.com">rezervace@villarudolf.com</a>'],
        ['Telefon', '<a href="tel:+420775220785">+420 775 220 785</a>'],
      ],
      back: 'Powrót na stronę willi',
      footBrand: 'Villa Rudolf · Svoboda nad Úpou, Karkonosze',
    },
  };

  var META = {
    cs: 'Podmínky a ochrana osobních údajů | Villa Rudolf',
    en: 'Terms & privacy | Villa Rudolf',
    de: 'Bedingungen & Datenschutz | Villa Rudolf',
    pl: 'Warunki i ochrona danych | Villa Rudolf',
  };

  var qs = new URLSearchParams(location.search);
  var state = { lang: 'cs', season: 'leto' };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function resolveLang() {
    var q = (qs.get('lang') || '').toLowerCase();
    if (T[q]) return q;
    try { var s = localStorage.getItem('vrLang'); if (s && T[s]) return s; } catch (e) {}
    var nav = (navigator.language || navigator.userLanguage || '').slice(0, 2).toLowerCase();
    return T[nav] ? nav : 'cs';
  }
  function resolveSeason() {
    var q = (qs.get('season') || '').toLowerCase();
    if (q === 'leto' || q === 'zima') return q;
    try { var s = localStorage.getItem('vrSeason'); if (s === 'leto' || s === 'zima') return s; } catch (e) {}
    return 'leto';
  }

  function render() {
    var L = T[state.lang];
    document.documentElement.lang = state.lang;
    document.title = META[state.lang] || META.cs;
    var langs = ['cs', 'en', 'de', 'pl'].map(function (l) {
      return '<button type="button" class="pd-lang" data-lang="' + l + '" data-on="' + (l === state.lang) + '">' + l.toUpperCase() + '</button>';
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
      '<div class="pd-wrap">'
      + '<header class="pd-header"><a class="pd-brand" href="../"><span class="nm">Villa Rudolf</span><span class="bd">' + esc(L.badge) + '</span></a>'
      + '<nav class="pd-langs" aria-label="Jazyk / Language">' + langs + '</nav></header>'
      + '<section class="pd-hero"><p class="pd-eyebrow">Villa Rudolf · Krkonoše</p><h1 class="pd-title">' + esc(L.title) + '</h1><p class="pd-intro">' + esc(L.intro) + '</p></section>'
      + '<main class="pd-main">'
      + '<section class="pd-sec"><h2 class="pd-h2">' + esc(L.stornoTitle) + '</h2><p class="pd-lead">' + esc(L.stornoLead) + '</p>'
      + '<div class="pd-tablewrap"><table class="pd-table"><thead><tr><th>' + esc(L.colWhen) + '</th><th style="text-align:right">' + esc(L.colFee) + '</th></tr></thead><tbody>' + stornoBody + '</tbody></table></div></section>'
      + '<section class="pd-sec"><h2 class="pd-h2">' + esc(L.gdprTitle) + '</h2><div class="pd-rows">' + gdprBody + '</div>'
      + '<div class="pd-note">' + lockIcon + '<p>' + esc(L.cookies) + '</p></div></section>'
      + '<section class="pd-sec"><h2 class="pd-h2">' + esc(L.operatorTitle) + '</h2><div class="pd-rows">' + opBody + '</div></section>'
      + '</main>'
      + '<footer class="pd-footer"><a class="pd-back" href="../">' + arrowL + '<span>' + esc(L.back) + '</span></a><span class="pd-foot-brand">' + esc(L.footBrand) + '</span></footer>'
      + '</div>';

    Array.prototype.forEach.call(document.querySelectorAll('.pd-lang'), function (b) {
      b.addEventListener('click', function () {
        state.lang = b.dataset.lang;
        try { localStorage.setItem('vrLang', state.lang); } catch (e) {}
        try { var u = new URL(location.href); u.searchParams.set('lang', state.lang); history.replaceState(null, '', u.pathname + u.search + u.hash); } catch (e) {}
        render();
      });
    });
  }

  state.lang = resolveLang();
  state.season = resolveSeason();
  try { localStorage.setItem('vrLang', state.lang); } catch (e) {}
  try { localStorage.setItem('vrSeason', state.season); } catch (e) {}
  document.querySelector('.pd-root').setAttribute('data-season', state.season);
  var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', state.season === 'zima' ? '#eef2f6' : '#0E1311');
  render();
})();
