/* Villa Rudolf — registrace hosta (/checkin/)
 * Vanilla JS. Odesílá do Supabase RPC vr_checkin (SECURITY DEFINER, jen anon klíč).
 * RPC vrátí osobní token průvodce -> odkaz na /pruvodce/?t=<token>.
 */
(function () {
  'use strict';

  var CFG = {
    SUPABASE_URL: 'https://fpknbrzbqpalguajskut.supabase.co',
    // Veřejný anon klíč (chráněný RLS) — stejný jako v průvodci / guest portálu.
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwa25icnpicXBhbGd1YWpza3V0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDEyMTAsImV4cCI6MjA5Mjg3NzIxMH0.goat1c7Y1YnpTq7_XyMD3LROElkVI6E27f0B3EG8btA',
    GUIDE_URL: 'https://pavelkubiznak.github.io/villa-rudolf-site/pruvodce/'
  };

  /* ===================== i18n ===================== */
  var T = {
    cs: {
      htmlLang: 'cs',
      brandBadge: 'Registrace',
      eyebrow: 'Villa Rudolf · Krkonoše',
      title: 'Registrace hosta',
      intro: 'Vyplňte prosím pár údajů. Připravíme vám podle nich personalizovaného průvodce výlety, pošleme informace před příjezdem i kód k zámku.',
      noticeConfirmed: 'Tento formulář je pro hosty s potvrzenou rezervací.',
      noticeNoDate: 'Ještě nemáte termín? Rezervovat termín →',
      fName: 'Jméno a příjmení', fPhone: 'Telefon', fEmail: 'E-mail',
      fStay: 'Termín pobytu', fFrom: 'Od', fTo: 'Do',
      fAdults: 'Počet dospělých', fChildren: 'Věky dětí',
      fLang: 'Jazyk komunikace', fNote: 'Poznámka',
      emailPh: 'vas@email.cz', childrenPh: 'např. 6, 9',
      notePh: 'Cokoli, co bychom měli vědět (nepovinné)',
      submit: 'Odeslat registraci', sending: 'Odesílám…',
      privacy: 'Vaše údaje použijeme jen pro komunikaci k vašemu pobytu ve Villa Rudolf. Nikam je nepřeprodáváme.',
      errRequired: 'Vyplňte prosím povinná pole označená hvězdičkou.',
      errEmail: 'Zkontrolujte prosím e-mailovou adresu.',
      errDates: 'Datum odjezdu musí být po datu příjezdu.',
      errAdults: 'Zadejte prosím počet dospělých (1–30).',
      errRate: 'Registrací je z tohoto e-mailu příliš mnoho. Zkuste to prosím později nebo nám napište.',
      errGeneric: 'Registraci se nepodařilo odeslat. Zkuste to prosím znovu.',
      okTitle: 'Děkujeme!',
      okBody: 'Registrace je hotová. Před příjezdem vám na e-mail pošleme kód k zámku i praktické informace k pobytu.',
      okGuide: 'Otevřít průvodce výlety',
      okHint: 'Průvodce jsme vám připravili na míru — podle termínu pobytu, počtu hostů a věku dětí.',
      terms: 'Podmínky a ochrana údajů'
    },
    en: {
      htmlLang: 'en',
      brandBadge: 'Check-in',
      eyebrow: 'Villa Rudolf · Krkonoše, Czechia',
      title: 'Guest registration',
      intro: 'Please share a few details. We’ll use them to prepare your personalised trip guide and to send arrival info and the lock code before you come.',
      noticeConfirmed: 'This form is for guests with a confirmed booking.',
      noticeNoDate: 'No dates yet? Book your stay →',
      fName: 'Full name', fPhone: 'Phone', fEmail: 'E-mail',
      fStay: 'Dates of stay', fFrom: 'From', fTo: 'To',
      fAdults: 'Number of adults', fChildren: 'Children’s ages',
      fLang: 'Preferred language', fNote: 'Note',
      emailPh: 'you@email.com', childrenPh: 'e.g. 6, 9',
      notePh: 'Anything we should know (optional)',
      submit: 'Send registration', sending: 'Sending…',
      privacy: 'We use your details only to communicate about your stay at Villa Rudolf. We never resell them.',
      errRequired: 'Please fill in the required fields marked with a star.',
      errEmail: 'Please check the e-mail address.',
      errDates: 'The departure date must be after the arrival date.',
      errAdults: 'Please enter the number of adults (1–30).',
      errRate: 'Too many registrations from this e-mail. Please try again later or write to us.',
      errGeneric: 'We couldn’t send the registration. Please try again.',
      okTitle: 'Thank you!',
      okBody: 'You’re registered. Before arrival we’ll e-mail you the lock code and practical info for your stay.',
      okGuide: 'Open the trip guide',
      okHint: 'We’ve tailored the guide to you — based on your dates, party size and children’s ages.',
      terms: 'Terms & privacy'
    },
    de: {
      htmlLang: 'de',
      brandBadge: 'Anmeldung',
      eyebrow: 'Villa Rudolf · Riesengebirge, Tschechien',
      title: 'Gästeregistrierung',
      intro: 'Bitte geben Sie ein paar Angaben ein. Damit erstellen wir Ihren persönlichen Ausflugsguide und senden Ihnen vor der Anreise Infos und den Türcode.',
      noticeConfirmed: 'Dieses Formular ist für Gäste mit bestätigter Buchung.',
      noticeNoDate: 'Noch kein Termin? Jetzt buchen →',
      fName: 'Vor- und Nachname', fPhone: 'Telefon', fEmail: 'E-Mail',
      fStay: 'Aufenthaltszeitraum', fFrom: 'Von', fTo: 'Bis',
      fAdults: 'Anzahl Erwachsene', fChildren: 'Alter der Kinder',
      fLang: 'Sprache', fNote: 'Anmerkung',
      emailPh: 'sie@email.de', childrenPh: 'z. B. 6, 9',
      notePh: 'Alles, was wir wissen sollten (optional)',
      submit: 'Registrierung senden', sending: 'Senden…',
      privacy: 'Ihre Daten nutzen wir nur für die Kommunikation zu Ihrem Aufenthalt in der Villa Rudolf. Wir geben sie nicht weiter.',
      errRequired: 'Bitte füllen Sie die mit Stern markierten Pflichtfelder aus.',
      errEmail: 'Bitte überprüfen Sie die E-Mail-Adresse.',
      errDates: 'Das Abreisedatum muss nach dem Anreisedatum liegen.',
      errAdults: 'Bitte geben Sie die Anzahl der Erwachsenen an (1–30).',
      errRate: 'Zu viele Registrierungen von dieser E-Mail. Bitte später erneut versuchen oder uns schreiben.',
      errGeneric: 'Die Registrierung konnte nicht gesendet werden. Bitte erneut versuchen.',
      okTitle: 'Vielen Dank!',
      okBody: 'Sie sind registriert. Vor der Anreise senden wir Ihnen den Türcode und praktische Infos per E-Mail.',
      okGuide: 'Ausflugsguide öffnen',
      okHint: 'Den Guide haben wir für Sie zugeschnitten — nach Zeitraum, Personenzahl und Alter der Kinder.',
      terms: 'Bedingungen & Datenschutz'
    },
    pl: {
      htmlLang: 'pl',
      brandBadge: 'Rejestracja',
      eyebrow: 'Villa Rudolf · Karkonosze, Czechy',
      title: 'Rejestracja gościa',
      intro: 'Prosimy o kilka danych. Na ich podstawie przygotujemy spersonalizowany przewodnik po wycieczkach oraz wyślemy informacje przed przyjazdem i kod do zamka.',
      noticeConfirmed: 'Ten formularz jest dla gości z potwierdzoną rezerwacją.',
      noticeNoDate: 'Nie masz jeszcze terminu? Zarezerwuj →',
      fName: 'Imię i nazwisko', fPhone: 'Telefon', fEmail: 'E-mail',
      fStay: 'Termin pobytu', fFrom: 'Od', fTo: 'Do',
      fAdults: 'Liczba dorosłych', fChildren: 'Wiek dzieci',
      fLang: 'Język komunikacji', fNote: 'Uwaga',
      emailPh: 'ty@email.pl', childrenPh: 'np. 6, 9',
      notePh: 'Cokolwiek, co powinniśmy wiedzieć (opcjonalnie)',
      submit: 'Wyślij rejestrację', sending: 'Wysyłanie…',
      privacy: 'Twoich danych używamy wyłącznie do komunikacji dotyczącej pobytu w Villa Rudolf. Nie odsprzedajemy ich.',
      errRequired: 'Prosimy wypełnić pola wymagane oznaczone gwiazdką.',
      errEmail: 'Sprawdź proszę adres e-mail.',
      errDates: 'Data wyjazdu musi być po dacie przyjazdu.',
      errAdults: 'Podaj proszę liczbę dorosłych (1–30).',
      errRate: 'Zbyt wiele rejestracji z tego e-maila. Spróbuj później lub napisz do nas.',
      errGeneric: 'Nie udało się wysłać rejestracji. Spróbuj ponownie.',
      okTitle: 'Dziękujemy!',
      okBody: 'Rejestracja gotowa. Przed przyjazdem wyślemy e-mailem kod do zamka i praktyczne informacje.',
      okGuide: 'Otwórz przewodnik po wycieczkach',
      okHint: 'Przewodnik przygotowaliśmy pod Ciebie — według terminu, liczby osób i wieku dzieci.',
      terms: 'Warunki i ochrona danych'
    }
  };

  var $ = function (id) { return document.getElementById(id); };
  var qs = new URLSearchParams(location.search);
  var lang = 'cs';

  function pickInitialLang() {
    var q = (qs.get('lang') || '').toLowerCase();
    if (T[q]) return q;
    var nav = (navigator.language || navigator.userLanguage || '').slice(0, 2).toLowerCase();
    if (T[nav]) return nav;
    return 'cs';
  }

  function applyLang(l) {
    lang = T[l] ? l : 'cs';
    var L = T[lang];
    document.documentElement.lang = L.htmlLang;
    // textContent
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (L[k] != null) el.textContent = L[k];
    });
    // placeholders
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-ph');
      if (L[k] != null) el.setAttribute('placeholder', L[k]);
    });
    // lang pills
    document.querySelectorAll('.vc-lang').forEach(function (b) {
      b.setAttribute('data-on', String(b.getAttribute('data-lang') === lang));
    });
    // submit label (may have been swapped to "sending")
    var sl = document.querySelector('.vc-submit-label');
    if (sl && $('submit').getAttribute('data-busy') !== 'true') sl.textContent = L.submit;
  }

  function showError(msg) {
    var e = $('err');
    e.textContent = msg;
    e.hidden = false;
    e.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function clearError() { var e = $('err'); e.hidden = true; e.textContent = ''; }

  function setBusy(on) {
    var btn = $('submit');
    btn.setAttribute('data-busy', String(on));
    btn.disabled = on;
    var sl = btn.querySelector('.vc-submit-label');
    sl.textContent = on ? T[lang].sending : T[lang].submit;
  }

  var EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

  function showSuccess(token) {
    $('formView').hidden = true;
    $('successView').hidden = false;
    var btn = $('guideBtn');
    if (token) {
      btn.href = CFG.GUIDE_URL + '?t=' + encodeURIComponent(token) + '&lang=' + encodeURIComponent(lang);
      btn.hidden = false;
    } else {
      btn.hidden = true; // honeypot / no token
    }
    window.scrollTo(0, 0);
  }

  function submit(ev) {
    ev.preventDefault();
    clearError();
    var L = T[lang];

    // Honeypot: pokud je vyplněný, "tvař se" úspěšně, ale nevolej RPC.
    if ($('hp').value.trim() !== '') { showSuccess(null); return; }

    var name = $('f-name').value.trim();
    var phone = $('f-phone').value.trim();
    var email = $('f-email').value.trim();
    var arrival = $('f-arrival').value;      // YYYY-MM-DD nebo ''
    var departure = $('f-departure').value;
    var adults = parseInt($('f-adults').value, 10);
    var children = $('f-children').value.trim();
    var commlang = $('f-commlang').value;
    var note = $('f-note').value.trim();

    // klient-side validace (server validuje znovu)
    if (!name || !phone || !email || !arrival || !departure) { showError(L.errRequired); return; }
    if (!EMAIL_RE.test(email)) { showError(L.errEmail); return; }
    if (arrival >= departure) { showError(L.errDates); return; }
    if (!(adults >= 1 && adults <= 30)) { showError(L.errAdults); return; }

    setBusy(true);

    fetch(CFG.SUPABASE_URL + '/rest/v1/rpc/vr_checkin', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: CFG.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + CFG.SUPABASE_ANON_KEY
      },
      body: JSON.stringify({
        p_name: name, p_phone: phone, p_email: email,
        p_arrival: arrival, p_departure: departure,
        p_adults: adults, p_children: children,
        p_lang: commlang, p_note: note
      })
    }).then(function (r) {
      return r.json().then(function (data) { return { ok: r.ok, data: data }; });
    }).then(function (res) {
      var d = res.data || {};
      if (res.ok && d && d.ok === true && d.token) {
        showSuccess(d.token);
        return;
      }
      // mapuj chybové kódy z RPC
      var code = d && d.error;
      var msg = L.errGeneric;
      if (code === 'email_invalid') msg = L.errEmail;
      else if (code === 'dates_invalid') msg = L.errDates;
      else if (code === 'adults_invalid') msg = L.errAdults;
      else if (code === 'rate_limited') msg = L.errRate;
      else if (code === 'name_required' || code === 'phone_required' || code === 'email_required') msg = L.errRequired;
      setBusy(false);
      showError(msg);
    }).catch(function () {
      setBusy(false);
      showError(L.errGeneric);
    });
  }

  /* ===================== init ===================== */
  function init() {
    // min datum = dnes; departure se posouvá za arrival
    var today = new Date();
    var iso = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
    var arr = $('f-arrival'), dep = $('f-departure');
    arr.min = iso; dep.min = iso;
    arr.addEventListener('change', function () {
      if (arr.value) { dep.min = arr.value; if (dep.value && dep.value <= arr.value) dep.value = ''; }
    });

    applyLang(pickInitialLang());
    // prefill jazyk komunikace podle UI jazyka
    $('f-commlang').value = T[lang] ? lang : 'cs';

    document.querySelectorAll('.vc-lang').forEach(function (b) {
      b.addEventListener('click', function () {
        var prevCommDefault = lang;
        var newLang = b.getAttribute('data-lang');
        // pokud uživatel nezměnil jazyk komunikace ručně, drž ho synchronně s UI
        if ($('f-commlang').value === prevCommDefault) $('f-commlang').value = newLang;
        applyLang(newLang);
      });
    });

    $('form').addEventListener('submit', submit);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
