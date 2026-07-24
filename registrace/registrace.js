/* Villa Rudolf — předregistrace hostů PO OSOBÁCH (/registrace/)
 * Vanilla JS. Supabase RPC (SECURITY DEFINER, jen anon klíč, RLS deny-all).
 *  - s ?t=TOKEN  -> vr_verify_token (hlavička), vr_persons_list (seznam),
 *                   vr_persons_add / vr_persons_delete
 *  - bez tokenu  -> lednicová cesta: vr_persons_add_by_date (statický QR)
 * Čísla dokladů se NIKDY nevrací (list vrací jen doc_filled bool).
 */
(function () {
  'use strict';

  var CFG = {
    SUPABASE_URL: 'https://fpknbrzbqpalguajskut.supabase.co',
    // Veřejný anon klíč (chráněný RLS) — stejný jako v /checkin/, /album/, průvodci.
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwa25icnpicXBhbGd1YWpza3V0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDEyMTAsImV4cCI6MjA5Mjg3NzIxMH0.goat1c7Y1YnpTq7_XyMD3LROElkVI6E27f0B3EG8btA'
  };

  /* ===================== i18n ===================== */
  var T = {
    cs: {
      htmlLang: 'cs',
      brandBadge: 'Registrace hostů',
      eyebrow: 'Villa Rudolf · Krkonoše',
      title: 'Registrace hostů',
      titleGeneric: 'Registrace hostů — Villa Rudolf',
      introToken: 'Zaregistrujte prosím každou osobu ve skupině. Slouží to k zákonné evidenci ubytovaných (cizinecká policie) a k místnímu poplatku.',
      introFridge: 'Zaregistrujte prosím každou osobu ve skupině. Slouží to k zákonné evidenci ubytovaných a k místnímu poplatku.',
      closedTitle: 'Registrace zatím není otevřená',
      closedBody: 'Registrace se otevírá v den příjezdu. Použijte prosím odkaz, který jste dostali ve zprávě k pobytu.',
      listTitle: 'Zaregistrovaní',
      listEmpty: 'Zatím nikdo. Přidejte první osobu níže.',
      countOne: '{n} osoba', countFew: '{n} osoby', countMany: '{n} osob',
      docOk: 'doklad', docNo: 'bez dokladu',
      delConfirm: 'Odebrat tuto osobu ze seznamu?',
      formTitle: 'Přidat osobu',
      fFirst: 'Jméno', fLast: 'Příjmení', fBirth: 'Datum narození',
      fCitizenship: 'Občanství', fDoc: 'Číslo dokladu', fDocOptional: '(nepovinné)',
      fResCity: 'Bydliště – město', fResCountry: 'Bydliště – země',
      fStay: 'Termín pobytu', fFrom: 'Od', fTo: 'Do',
      docHintCz: 'Cestovní pas nebo občanský průkaz. U českých občanů nepovinné.',
      docHintForeign: 'Zákonná evidence pro cizineckou policii — u cizinců povinné.',
      stayHint: 'Předvyplněno termínem pobytu — upravte, pokud přijíždíte nebo odjíždíte jindy.',
      stayHintFridge: 'Zadejte datum svého příjezdu a odjezdu.',
      submit: 'Přidat osobu', sending: 'Ukládám…',
      okAdded: 'Osoba přidána. Můžete zadat další.',
      addHint: 'Po přidání zůstane formulář otevřený — rovnou zadejte další osobu.',
      docWarn: 'Toto nevypadá jako číslo dokladu ({type}) — zkontrolujte prosím proti dokladu.',
      docWarnFix: 'Opravit', docWarnContinue: 'Je to správně, pokračovat',
      gdprTitle: 'Ochrana údajů',
      gdprBody: 'Údaje sbíráme jen kvůli zákonné evidenci ubytovaných a místnímu poplatku. Leží v zabezpečené databázi v EU. Čísla dokladů nevidí nikdo další z vaší skupiny — v přehledu se ukazuje jen, že je doklad vyplněný.',
      gdprLink: 'Podmínky a ochrana údajů',
      errFirst: 'Vyplňte prosím jméno.',
      errLast: 'Vyplňte prosím příjmení.',
      errCitizenship: 'Vyberte prosím občanství.',
      errDocRequired: 'U cizinců je číslo dokladu povinné (zákonná evidence).',
      errDocShort: 'Číslo dokladu je příliš krátké — zkontrolujte ho prosím.',
      errDocChars: 'Číslo dokladu smí obsahovat jen písmena a číslice, bez mezer a diakritiky.',
      errDates: 'Datum „do“ musí být stejné nebo pozdější než „od“.',
      errWindow: 'Termín pobytu musí spadat do vaší rezervace.',
      errBirth: 'Zkontrolujte prosím datum narození.',
      errStay: 'Vyplňte prosím termín pobytu.',
      errRate: 'Příliš mnoho záznamů za krátkou dobu. Zkuste to prosím za chvíli.',
      errBookingFull: 'Dosáhli jste maxima osob na tento pobyt. Napište nám prosím.',
      errToken: 'Odkaz je neplatný nebo vypršel. Použijte prosím aktuální odkaz ze zprávy.',
      errGeneric: 'Uložení se nepodařilo. Zkuste to prosím znovu.',
      citCommon: 'Časté', citOthers: 'Ostatní země', citOther: 'Jiná země'
    },
    en: {
      htmlLang: 'en',
      brandBadge: 'Guest registration',
      eyebrow: 'Villa Rudolf · Krkonoše, Czechia',
      title: 'Guest registration',
      titleGeneric: 'Guest registration — Villa Rudolf',
      introToken: 'Please register every person in your group. It’s used for the legal guest register (foreign police) and the local tourist fee.',
      introFridge: 'Please register every person in your group. It’s used for the legal guest register and the local tourist fee.',
      closedTitle: 'Registration isn’t open yet',
      closedBody: 'Registration opens on your arrival day. Please use the link you received in your stay message.',
      listTitle: 'Registered',
      listEmpty: 'No one yet. Add the first person below.',
      countOne: '{n} person', countFew: '{n} people', countMany: '{n} people',
      docOk: 'document', docNo: 'no document',
      delConfirm: 'Remove this person from the list?',
      formTitle: 'Add a person',
      fFirst: 'First name', fLast: 'Last name', fBirth: 'Date of birth',
      fCitizenship: 'Citizenship', fDoc: 'Document number', fDocOptional: '(optional)',
      fResCity: 'Residence – city', fResCountry: 'Residence – country',
      fStay: 'Dates of stay', fFrom: 'From', fTo: 'To',
      docHintCz: 'Passport or national ID. Optional for Czech citizens.',
      docHintForeign: 'Legal record for the foreign police — required for non-Czech guests.',
      stayHint: 'Pre-filled from the booking — adjust if you arrive or leave on different dates.',
      stayHintFridge: 'Enter your own arrival and departure dates.',
      submit: 'Add person', sending: 'Saving…',
      okAdded: 'Person added. You can add another.',
      addHint: 'The form stays open after adding — go straight on to the next person.',
      docWarn: 'This doesn’t look like a {type} number — please double-check it against the document.',
      docWarnFix: 'Fix it', docWarnContinue: 'It’s correct, continue',
      gdprTitle: 'Data protection',
      gdprBody: 'We collect these details only for the legal guest register and the local fee. They’re stored in a secure EU database. No one else in your group sees the document numbers — the overview only shows whether a document is filled in.',
      gdprLink: 'Terms & privacy',
      errFirst: 'Please enter the first name.',
      errLast: 'Please enter the last name.',
      errCitizenship: 'Please choose a citizenship.',
      errDocRequired: 'Document number is required for non-Czech guests (legal record).',
      errDocShort: 'The document number is too short — please check it.',
      errDocChars: 'The document number may contain only letters and digits, no spaces or accents.',
      errDates: 'The “to” date must be the same as or later than “from”.',
      errWindow: 'The dates of stay must fall within your booking.',
      errBirth: 'Please check the date of birth.',
      errStay: 'Please fill in the dates of stay.',
      errRate: 'Too many entries in a short time. Please try again shortly.',
      errBookingFull: 'You’ve reached the maximum number of people for this stay. Please contact us.',
      errToken: 'The link is invalid or has expired. Please use the current link from your message.',
      errGeneric: 'Saving failed. Please try again.',
      citCommon: 'Common', citOthers: 'Other countries', citOther: 'Other country'
    },
    de: {
      htmlLang: 'de',
      brandBadge: 'Gästeregistrierung',
      eyebrow: 'Villa Rudolf · Riesengebirge, Tschechien',
      title: 'Gästeregistrierung',
      titleGeneric: 'Gästeregistrierung — Villa Rudolf',
      introToken: 'Bitte registrieren Sie jede Person Ihrer Gruppe. Das dient dem gesetzlichen Gästeregister (Fremdenpolizei) und der Kurtaxe.',
      introFridge: 'Bitte registrieren Sie jede Person Ihrer Gruppe. Das dient dem gesetzlichen Gästeregister und der Kurtaxe.',
      closedTitle: 'Registrierung ist noch nicht offen',
      closedBody: 'Die Registrierung öffnet am Anreisetag. Bitte nutzen Sie den Link aus Ihrer Aufenthaltsnachricht.',
      listTitle: 'Registriert',
      listEmpty: 'Noch niemand. Fügen Sie unten die erste Person hinzu.',
      countOne: '{n} Person', countFew: '{n} Personen', countMany: '{n} Personen',
      docOk: 'Dokument', docNo: 'kein Dokument',
      delConfirm: 'Diese Person aus der Liste entfernen?',
      formTitle: 'Person hinzufügen',
      fFirst: 'Vorname', fLast: 'Nachname', fBirth: 'Geburtsdatum',
      fCitizenship: 'Staatsangehörigkeit', fDoc: 'Dokumentnummer', fDocOptional: '(optional)',
      fResCity: 'Wohnort – Stadt', fResCountry: 'Wohnort – Land',
      fStay: 'Aufenthaltszeitraum', fFrom: 'Von', fTo: 'Bis',
      docHintCz: 'Reisepass oder Personalausweis. Für tschechische Bürger optional.',
      docHintForeign: 'Gesetzlicher Nachweis für die Fremdenpolizei — für ausländische Gäste erforderlich.',
      stayHint: 'Aus der Buchung vorausgefüllt — passen Sie an, falls Sie anders an- oder abreisen.',
      stayHintFridge: 'Bitte Ihr An- und Abreisedatum eingeben.',
      submit: 'Person hinzufügen', sending: 'Speichern…',
      okAdded: 'Person hinzugefügt. Sie können eine weitere eintragen.',
      addHint: 'Das Formular bleibt offen — tragen Sie gleich die nächste Person ein.',
      docWarn: 'Das sieht nicht wie eine {type}-Nummer aus — bitte gegen das Dokument prüfen.',
      docWarnFix: 'Korrigieren', docWarnContinue: 'Stimmt so, weiter',
      gdprTitle: 'Datenschutz',
      gdprBody: 'Wir erheben diese Daten nur für das gesetzliche Gästeregister und die Kurtaxe. Sie liegen in einer sicheren Datenbank in der EU. Die Dokumentnummern sieht niemand sonst aus Ihrer Gruppe — die Übersicht zeigt nur, ob ein Dokument eingetragen ist.',
      gdprLink: 'Bedingungen & Datenschutz',
      errFirst: 'Bitte geben Sie den Vornamen an.',
      errLast: 'Bitte geben Sie den Nachnamen an.',
      errCitizenship: 'Bitte wählen Sie eine Staatsangehörigkeit.',
      errDocRequired: 'Für ausländische Gäste ist die Dokumentnummer Pflicht (gesetzlicher Nachweis).',
      errDocShort: 'Die Dokumentnummer ist zu kurz — bitte prüfen.',
      errDocChars: 'Die Dokumentnummer darf nur Buchstaben und Ziffern enthalten, ohne Leer- oder Sonderzeichen.',
      errDates: 'Das „Bis“-Datum muss gleich oder später als „Von“ sein.',
      errWindow: 'Der Aufenthaltszeitraum muss in Ihre Buchung fallen.',
      errBirth: 'Bitte prüfen Sie das Geburtsdatum.',
      errStay: 'Bitte den Aufenthaltszeitraum ausfüllen.',
      errRate: 'Zu viele Einträge in kurzer Zeit. Bitte gleich noch einmal versuchen.',
      errBookingFull: 'Die maximale Personenzahl für diesen Aufenthalt ist erreicht. Bitte kontaktieren Sie uns.',
      errToken: 'Der Link ist ungültig oder abgelaufen. Bitte den aktuellen Link aus Ihrer Nachricht nutzen.',
      errGeneric: 'Speichern fehlgeschlagen. Bitte erneut versuchen.',
      citCommon: 'Häufig', citOthers: 'Weitere Länder', citOther: 'Anderes Land'
    },
    pl: {
      htmlLang: 'pl',
      brandBadge: 'Rejestracja gości',
      eyebrow: 'Villa Rudolf · Karkonosze, Czechy',
      title: 'Rejestracja gości',
      titleGeneric: 'Rejestracja gości — Villa Rudolf',
      introToken: 'Prosimy zarejestrować każdą osobę w grupie. Służy to ustawowej ewidencji gości (policja ds. cudzoziemców) i opłacie miejscowej.',
      introFridge: 'Prosimy zarejestrować każdą osobę w grupie. Służy to ustawowej ewidencji gości i opłacie miejscowej.',
      closedTitle: 'Rejestracja nie jest jeszcze otwarta',
      closedBody: 'Rejestracja otwiera się w dniu przyjazdu. Skorzystaj z linku otrzymanego w wiadomości o pobycie.',
      listTitle: 'Zarejestrowani',
      listEmpty: 'Jeszcze nikogo. Dodaj pierwszą osobę poniżej.',
      countOne: '{n} osoba', countFew: '{n} osoby', countMany: '{n} osób',
      docOk: 'dokument', docNo: 'bez dokumentu',
      delConfirm: 'Usunąć tę osobę z listy?',
      formTitle: 'Dodaj osobę',
      fFirst: 'Imię', fLast: 'Nazwisko', fBirth: 'Data urodzenia',
      fCitizenship: 'Obywatelstwo', fDoc: 'Numer dokumentu', fDocOptional: '(opcjonalnie)',
      fResCity: 'Miejsce zamieszkania – miasto', fResCountry: 'Miejsce zamieszkania – kraj',
      fStay: 'Termin pobytu', fFrom: 'Od', fTo: 'Do',
      docHintCz: 'Paszport lub dowód osobisty. Dla obywateli Czech opcjonalne.',
      docHintForeign: 'Ustawowa ewidencja dla policji ds. cudzoziemców — dla cudzoziemców obowiązkowe.',
      stayHint: 'Wstępnie wypełnione terminem rezerwacji — zmień, jeśli przyjeżdżasz lub wyjeżdżasz inaczej.',
      stayHintFridge: 'Podaj datę swojego przyjazdu i wyjazdu.',
      submit: 'Dodaj osobę', sending: 'Zapisywanie…',
      okAdded: 'Osoba dodana. Możesz dodać kolejną.',
      addHint: 'Po dodaniu formularz zostaje otwarty — od razu wpisz kolejną osobę.',
      docWarn: 'To nie wygląda jak numer dokumentu ({type}) — sprawdź proszę z dokumentem.',
      docWarnFix: 'Popraw', docWarnContinue: 'Jest poprawny, kontynuuj',
      gdprTitle: 'Ochrona danych',
      gdprBody: 'Dane zbieramy wyłącznie do ustawowej ewidencji gości i opłaty miejscowej. Przechowujemy je w bezpiecznej bazie w UE. Numerów dokumentów nie widzi nikt inny z grupy — w podglądzie widać tylko, czy dokument jest wpisany.',
      gdprLink: 'Warunki i ochrona danych',
      errFirst: 'Podaj proszę imię.',
      errLast: 'Podaj proszę nazwisko.',
      errCitizenship: 'Wybierz proszę obywatelstwo.',
      errDocRequired: 'Dla cudzoziemców numer dokumentu jest obowiązkowy (ewidencja ustawowa).',
      errDocShort: 'Numer dokumentu jest za krótki — sprawdź proszę.',
      errDocChars: 'Numer dokumentu może zawierać tylko litery i cyfry, bez spacji i znaków diakrytycznych.',
      errDates: 'Data „do” musi być taka sama lub późniejsza niż „od”.',
      errWindow: 'Termin pobytu musi mieścić się w Twojej rezerwacji.',
      errBirth: 'Sprawdź proszę datę urodzenia.',
      errStay: 'Wypełnij proszę termin pobytu.',
      errRate: 'Zbyt wiele wpisów w krótkim czasie. Spróbuj za chwilę.',
      errBookingFull: 'Osiągnięto maksymalną liczbę osób dla tego pobytu. Napisz do nas.',
      errToken: 'Link jest nieprawidłowy lub wygasł. Skorzystaj z aktualnego linku z wiadomości.',
      errGeneric: 'Zapis się nie powiódł. Spróbuj ponownie.',
      citCommon: 'Częste', citOthers: 'Pozostałe kraje', citOther: 'Inny kraj'
    }
  };

  /* ===================== země (ISO alpha-2) ===================== */
  // Připnuté nahoru (podle typického složení skupin), zbytek se řadí abecedně
  // podle názvu v jazyce UI (Intl.DisplayNames).
  var PINNED = ['CZ', 'SK', 'DE', 'PL', 'AT', 'NL', 'UA', 'GB'];
  var OTHERS = [
    'AL','AD','AM','AR','AU','AZ','BE','BA','BR','BG','BY','CA','CH','CN','CY',
    'DK','EE','EG','ES','FI','FR','GE','GR','HR','HU','IE','IL','IN','IS','IT',
    'JP','KR','KZ','LI','LT','LU','LV','MD','ME','MK','MT','MX','NO','NZ','PT',
    'RO','RS','RU','SE','SI','TH','TR','US','VN','ZA'
  ];
  // Fallback názvy (kdyby Intl.DisplayNames nebylo; jen připnuté + pár častých).
  var NAME_FALLBACK = {
    cs: { CZ:'Česko', SK:'Slovensko', DE:'Německo', PL:'Polsko', AT:'Rakousko', NL:'Nizozemsko', UA:'Ukrajina', GB:'Spojené království' },
    en: { CZ:'Czechia', SK:'Slovakia', DE:'Germany', PL:'Poland', AT:'Austria', NL:'Netherlands', UA:'Ukraine', GB:'United Kingdom' },
    de: { CZ:'Tschechien', SK:'Slowakei', DE:'Deutschland', PL:'Polen', AT:'Österreich', NL:'Niederlande', UA:'Ukraine', GB:'Vereinigtes Königreich' },
    pl: { CZ:'Czechy', SK:'Słowacja', DE:'Niemcy', PL:'Polska', AT:'Austria', NL:'Holandia', UA:'Ukraina', GB:'Wielka Brytania' }
  };

  function countryName(code, l) {
    try {
      var dn = new Intl.DisplayNames([l], { type: 'region' });
      var n = dn.of(code);
      if (n && n !== code) return n;
    } catch (e) {}
    return (NAME_FALLBACK[l] && NAME_FALLBACK[l][code]) || code;
  }
  function flagEmoji(code) {
    if (!/^[A-Za-z]{2}$/.test(code)) return '🏳️';
    return code.toUpperCase().replace(/./g, function (c) {
      return String.fromCodePoint(0x1F1A5 + c.charCodeAt(0));
    });
  }

  /* ===================== validace čísel dokladů (MĚKKÁ) ===================== */
  // Regexy ověřené proti oficiálním/PRADO a MS Purview zdrojům (červenec 2026).
  // Kontrola je MĚKKÁ: neshoda -> varování s možností „je to správně, pokračovat".
  var DOC_RULES = {
    CZ: { re: [/^[0-9]{8}$/, /^[0-9]{9}$/], type: { cs:'pas / OP', en:'passport / ID', de:'Pass / Ausweis', pl:'paszport / dowód' } },
    SK: { re: [/^[A-Z]{1,2}[0-9]{6,7}$/], type: { cs:'pas / OP', en:'passport / ID', de:'Pass / Ausweis', pl:'paszport / dowód' } },
    PL: { re: [/^[A-Z]{2}[0-9]{7}$/], type: { cs:'pas', en:'passport', de:'Reisepass', pl:'paszport' } },
    DE: { re: [/^[CFGHJKLMNPRTVWXYZ0-9]{9}$/], type: { cs:'Reisepass', en:'passport', de:'Reisepass', pl:'paszport' } },
    AT: { re: [/^[A-Z][0-9]{7,8}$/], type: { cs:'Reisepass', en:'passport', de:'Reisepass', pl:'paszport' } },
    NL: { re: [/^[A-Z]{2}[A-Z0-9][0-9]{5}[0-9]$/], type: { cs:'paspoort', en:'passport', de:'Pass', pl:'paszport' } },
    UA: { re: [/^[A-Z]{2}[0-9]{6}$/], type: { cs:'passport', en:'passport', de:'Pass', pl:'paszport' } },
    GB: { re: [/^[0-9]{9}$/], type: { cs:'passport', en:'passport', de:'Pass', pl:'passport' } }
  };
  var DOC_OTHER_RE = /^[A-Za-z0-9]{5,15}$/;      // měkká kontrola pro „jiné" země
  var DOC_HARD_RE = /^[A-Za-z0-9-]+$/;           // tvrdě: bez mezer/diakritiky

  function docTypeLabel(cit, l) {
    var r = DOC_RULES[cit];
    if (r && r.type) return r.type[l] || r.type.en;
    return { cs:'dokladu', en:'document', de:'Dokument', pl:'dokumentu' }[l];
  }
  // vrátí 'hard-empty' | 'hard-short' | 'hard-chars' | 'soft' | 'ok'
  function checkDoc(val, cit) {
    var v = (val || '').trim();
    var foreign = cit !== 'CZ';
    if (v === '') return foreign ? 'hard-empty' : 'ok';
    if (!DOC_HARD_RE.test(v)) return 'hard-chars';
    if (v.replace(/-/g, '').length < 5) return 'hard-short';
    var up = v.toUpperCase();
    var rule = DOC_RULES[cit];
    if (rule) { return rule.re.some(function (re) { return re.test(up); }) ? 'ok' : 'soft'; }
    return DOC_OTHER_RE.test(up) ? 'ok' : 'soft';
  }

  /* ===================== helpers ===================== */
  var $ = function (id) { return document.getElementById(id); };
  var qs = new URLSearchParams(location.search);
  var token = (qs.get('t') || '').trim();
  var lang = 'cs';
  var booking = null;         // { arrival, departure, lastName }
  var docConfirmed = false;   // uživatel odklikl „je to správně, pokračovat"

  function pickInitialLang() {
    var q = (qs.get('lang') || '').toLowerCase();
    if (T[q]) return q;
    var nav = (navigator.language || navigator.userLanguage || '').slice(0, 2).toLowerCase();
    if (T[nav]) return nav;
    return 'cs';
  }

  function rpc(fn, body) {
    return fetch(CFG.SUPABASE_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: CFG.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + CFG.SUPABASE_ANON_KEY
      },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (d) { return { ok: r.ok, data: d }; })
        .catch(function () { return { ok: r.ok, data: null }; });
    });
  }

  function isoToday() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function addDays(iso, n) {
    if (!iso) return '';
    var d = new Date(iso + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function fmtRange(a, b, l) {
    try {
      var opt = { day: 'numeric', month: 'short', year: 'numeric' };
      var da = new Date(a + 'T00:00:00'), db = new Date(b + 'T00:00:00');
      return da.toLocaleDateString(l, opt) + ' – ' + db.toLocaleDateString(l, opt);
    } catch (e) { return a + ' – ' + b; }
  }
  function pluralCount(n, L) {
    var key = n === 1 ? 'countOne' : (n >= 2 && n <= 4 ? 'countFew' : 'countMany');
    return L[key].replace('{n}', n);
  }

  /* ===================== i18n apply ===================== */
  function fillCountrySelects() {
    var L = T[lang];
    var sorted = OTHERS.map(function (c) { return { c: c, n: countryName(c, lang) }; })
      .sort(function (x, y) { return x.n.localeCompare(y.n, lang); });

    function build(sel, includeOther) {
      var cur = sel.value;
      sel.innerHTML = '';
      var g1 = document.createElement('optgroup'); g1.label = L.citCommon;
      PINNED.forEach(function (c) {
        var o = document.createElement('option'); o.value = c;
        o.textContent = flagEmoji(c) + '  ' + countryName(c, lang);
        g1.appendChild(o);
      });
      sel.appendChild(g1);
      var g2 = document.createElement('optgroup'); g2.label = L.citOthers;
      sorted.forEach(function (it) {
        var o = document.createElement('option'); o.value = it.c;
        o.textContent = flagEmoji(it.c) + '  ' + it.n;
        g2.appendChild(o);
      });
      sel.appendChild(g2);
      if (cur) sel.value = cur;
    }
    build($('f-cit'));
    build($('f-rescnt'));
    if (!$('f-cit').value) $('f-cit').value = 'CZ';
    if (!$('f-rescnt').value) $('f-rescnt').value = 'CZ';
  }

  function applyLang(l) {
    lang = T[l] ? l : 'cs';
    var L = T[lang];
    document.documentElement.lang = L.htmlLang;

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (L[k] != null) el.textContent = L[k];
    });
    document.querySelectorAll('.vp-lang').forEach(function (b) {
      b.setAttribute('data-on', String(b.getAttribute('data-lang') === lang));
    });

    fillCountrySelects();
    updateDocUi();
    renderHeader();
    // pokud už je seznam načtený, přerenderuj kvůli lokalizaci
    if (lastPersons) renderList(lastPersons);
    // submit label (mimo busy stav)
    var sl = document.querySelector('.vp-submit-label');
    if (sl && $('submit').getAttribute('data-busy') !== 'true') sl.textContent = L.submit;
    // stay hint podle režimu
    var sh = document.querySelector('[data-i18n="stayHint"]');
    if (sh) sh.textContent = token ? L.stayHint : L.stayHintFridge;
  }

  function renderHeader() {
    var L = T[lang];
    var h = $('hTitle'), intro = $('hIntro');
    if (token && booking) {
      var last = booking.lastName || 'Villa Rudolf';
      h.textContent = L.title + ' — ' + last + ', ' + fmtRange(booking.arrival, booking.departure, lang);
      intro.textContent = L.introToken;
    } else if (token) {
      h.textContent = L.title;
      intro.textContent = L.introToken;
    } else {
      h.textContent = L.titleGeneric;
      intro.textContent = L.introFridge;
    }
  }

  /* ===================== doc UI ===================== */
  function currentCit() { return ($('f-cit').value || 'CZ').toUpperCase(); }
  function updateDocUi() {
    var L = T[lang];
    var foreign = currentCit() !== 'CZ';
    $('docStar').hidden = !foreign;              // hvězdička jen u cizinců
    $('docOpt').hidden = foreign;                // „(nepovinné)" jen u CZ
    $('docHint').textContent = foreign ? L.docHintForeign : L.docHintCz;
  }
  function hideDocWarn() { $('docWarn').hidden = true; $('f-doc').classList.remove('warn'); }

  /* ===================== error/ok ===================== */
  function showError(msg) {
    var e = $('err'); e.textContent = msg; e.hidden = false;
    $('okToast').hidden = true;
    e.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function clearError() { var e = $('err'); e.hidden = true; e.textContent = ''; }
  function showOk() { var o = $('okToast'); o.textContent = T[lang].okAdded; o.hidden = false; }

  function setBusy(on) {
    var btn = $('submit');
    btn.setAttribute('data-busy', String(on));
    btn.disabled = on;
    btn.querySelector('.vp-submit-label').textContent = on ? T[lang].sending : T[lang].submit;
  }

  function mapError(code) {
    var L = T[lang];
    switch (code) {
      case 'first_required': return L.errFirst;
      case 'last_required': return L.errLast;
      case 'citizenship_invalid': return L.errCitizenship;
      case 'doc_required': return L.errDocRequired;
      case 'doc_invalid': return L.errDocChars;
      case 'birth_invalid': return L.errBirth;
      case 'dates_invalid': return L.errDates;
      case 'out_of_window': return L.errWindow;
      case 'rate_limited': return L.errRate;
      case 'booking_full': return L.errBookingFull;
      case 'token_invalid': case 'token_required': return L.errToken;
      default: return L.errGeneric;
    }
  }

  /* ===================== list ===================== */
  var lastPersons = null;

  function loadList() {
    if (!token) return;
    rpc('vr_persons_list', { p_token: token }).then(function (res) {
      var d = res.data || {};
      if (d.ok === true) { renderList(d.persons || []); }
    });
  }

  function renderList(persons) {
    lastPersons = persons;
    var L = T[lang];
    var wrap = $('list');
    wrap.innerHTML = '';
    $('listCount').textContent = persons.length ? pluralCount(persons.length, L) : '';
    $('listEmpty').hidden = persons.length > 0;
    persons.forEach(function (p) {
      var row = document.createElement('div'); row.className = 'vp-person';
      var flag = document.createElement('span'); flag.className = 'vp-person-flag';
      flag.textContent = flagEmoji(p.citizenship); flag.title = countryName(p.citizenship, lang);
      var main = document.createElement('div'); main.className = 'vp-person-main';
      var nm = document.createElement('div'); nm.className = 'vp-person-nm';
      nm.textContent = (p.first_name + ' ' + p.last_name).trim();
      var meta = document.createElement('div'); meta.className = 'vp-person-meta';
      var dates = document.createElement('span');
      dates.textContent = fmtRange(p.stay_from, p.stay_to, lang);
      var badge = document.createElement('span');
      badge.className = 'vp-badge ' + (p.doc_filled ? 'ok' : 'no');
      if (p.doc_filled) {
        badge.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>';
        badge.appendChild(document.createTextNode(L.docOk));
      } else {
        badge.textContent = L.docNo;
      }
      meta.appendChild(dates); meta.appendChild(badge);
      main.appendChild(nm); main.appendChild(meta);
      var del = document.createElement('button');
      del.type = 'button'; del.className = 'vp-del'; del.setAttribute('aria-label', L.docWarnFix);
      del.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>';
      del.addEventListener('click', function () { deletePerson(p.id, del); });
      row.appendChild(flag); row.appendChild(main); row.appendChild(del);
      wrap.appendChild(row);
    });
  }

  function deletePerson(id, btn) {
    if (!window.confirm(T[lang].delConfirm)) return;
    btn.disabled = true;
    rpc('vr_persons_delete', { p_token: token, p_id: id }).then(function (res) {
      var d = res.data || {};
      if (d.ok === true) { loadList(); }
      else { btn.disabled = false; showError(mapError(d.error)); }
    }).catch(function () { btn.disabled = false; showError(T[lang].errGeneric); });
  }

  /* ===================== submit ===================== */
  function resetPersonFields() {
    $('f-first').value = ''; $('f-last').value = '';
    $('f-birth').value = ''; $('f-doc').value = '';
    $('f-city').value = '';
    // občanství/země bydliště i termín necháme (skupina bývá stejného původu)
    hideDocWarn();
    docConfirmed = false;
    $('f-first').focus();
  }

  function submit(ev) {
    ev.preventDefault();
    clearError();
    $('okToast').hidden = true;
    var L = T[lang];

    // honeypot
    if ($('hp').value.trim() !== '') { resetPersonFields(); showOk(); return; }

    var first = $('f-first').value.trim();
    var last = $('f-last').value.trim();
    var birth = $('f-birth').value || null;
    var cit = currentCit();
    var doc = $('f-doc').value.trim();
    var city = $('f-city').value.trim();
    var rescnt = ($('f-rescnt').value || '').toUpperCase();
    var from = $('f-from').value;
    var to = $('f-to').value;

    if (!first) { showError(L.errFirst); return; }
    if (!last) { showError(L.errLast); return; }
    if (!from || !to) { showError(L.errStay); return; }
    if (to < from) { showError(L.errDates); return; }

    // --- validace dokladu ---
    var dc = checkDoc(doc, cit);
    if (dc === 'hard-empty') { showError(L.errDocRequired); $('f-doc').focus(); return; }
    if (dc === 'hard-chars') { showError(L.errDocChars); $('f-doc').focus(); return; }
    if (dc === 'hard-short') { showError(L.errDocShort); $('f-doc').focus(); return; }
    if (dc === 'soft' && !docConfirmed) {
      // měkké varování — necháme uživatele potvrdit
      var msg = L.docWarn.replace('{type}', docTypeLabel(cit, lang));
      $('docWarnMsg').textContent = msg;
      $('docWarn').hidden = false;
      $('f-doc').classList.add('warn');
      $('docWarn').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setBusy(true);
    hideDocWarn();

    var payload = {
      p_first: first, p_last: last, p_birth: birth, p_citizenship: cit,
      p_doc: doc, p_res_city: city, p_res_country: rescnt, p_from: from, p_to: to
    };
    var fn = 'vr_persons_add_by_date';
    if (token) { payload.p_token = token; fn = 'vr_persons_add'; }

    rpc(fn, payload).then(function (res) {
      var d = res.data || {};
      setBusy(false);
      if (d.ok === true) {
        docConfirmed = false;
        if (token) {
          // optimisticky přidej + refetch
          if (d.person) { renderList((lastPersons || []).concat([d.person])); }
          loadList();
        }
        resetPersonFields();
        showOk();
        $('okToast').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        return;
      }
      if (d.error === 'no_active_stay') { showClosed(); return; }
      showError(mapError(d.error));
    }).catch(function () { setBusy(false); showError(L.errGeneric); });
  }

  /* ===================== view stavy ===================== */
  function showClosed() {
    $('closedView').hidden = false;
    $('formSection').hidden = true;
    $('listSection').hidden = true;
    $('gdprSection').hidden = true;
    window.scrollTo(0, 0);
  }
  function showForm() {
    $('closedView').hidden = true;
    $('formSection').hidden = false;
    $('gdprSection').hidden = false;
    $('listSection').hidden = !token;
  }

  function setStayDefaults() {
    var from = $('f-from'), to = $('f-to');
    if (token && booking) {
      from.value = booking.arrival; to.value = booking.departure;
      from.min = addDays(booking.arrival, -1); from.max = addDays(booking.departure, 1);
      to.min = addDays(booking.arrival, -1); to.max = addDays(booking.departure, 1);
    } else {
      // lednice: neznáme okno klientsky, server ho ohlídá
      var t = isoToday();
      from.value = t; to.value = t;
    }
  }

  /* ===================== init ===================== */
  function init() {
    applyLang(pickInitialLang());
    showForm();

    // jazykové přepínače
    document.querySelectorAll('.vp-lang').forEach(function (b) {
      b.addEventListener('click', function () { applyLang(b.getAttribute('data-lang')); });
    });

    // občanství -> doc UI + reset varování
    $('f-cit').addEventListener('change', function () {
      // srovnej i zemi bydliště, pokud ji uživatel neměnil ručně
      if ($('f-rescnt').getAttribute('data-touched') !== 'true') $('f-rescnt').value = currentCit();
      updateDocUi(); hideDocWarn(); docConfirmed = false;
    });
    $('f-rescnt').addEventListener('change', function () { this.setAttribute('data-touched', 'true'); });
    $('f-doc').addEventListener('input', function () { hideDocWarn(); docConfirmed = false; });

    // doc warning tlačítka
    $('docWarnFix').addEventListener('click', function () { hideDocWarn(); $('f-doc').focus(); });
    $('docWarnOk').addEventListener('click', function () {
      docConfirmed = true; hideDocWarn();
      $('form').requestSubmit ? $('form').requestSubmit() : submit(new Event('submit'));
    });

    // datumy: hlídej to>=from
    $('f-from').addEventListener('change', function () {
      var f = $('f-from'), t = $('f-to');
      if (f.value && t.value && t.value < f.value) t.value = f.value;
      if (f.value) t.min = token ? t.min : f.value;
    });

    $('form').addEventListener('submit', submit);

    // token: ověř + načti seznam; jinak lednicová cesta
    if (token) {
      rpc('vr_verify_token', { p_token: token }).then(function (res) {
        var d = res.data;
        if (res.ok && d && d.name) {
          booking = { arrival: d.arrival, departure: d.departure, lastName: (d.name && d.name.last) || '' };
          // jazyk z bookingu, pokud uživatel/URL neurčil jinak
          if (!qs.get('lang') && d.lang && T[d.lang]) applyLang(d.lang);
        }
        renderHeader();
        setStayDefaults();
        loadList();
      }).catch(function () { renderHeader(); setStayDefaults(); });
      setStayDefaults();
    } else {
      setStayDefaults();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
