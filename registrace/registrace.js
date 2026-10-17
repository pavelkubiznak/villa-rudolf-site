/* Villa Rudolf — předregistrace hostů PO OSOBÁCH (/registrace/)
 * Vanilla JS. Supabase RPC (SECURITY DEFINER, jen anon klíč, RLS deny-all).
 *  - s ?t=TOKEN  -> vr_verify_token (hlavička), vr_persons_list (seznam),
 *                   vr_persons_add / vr_persons_delete
 *  - bez tokenu  -> lednicová cesta: kód od dveří → vr_fridge_open → klíč relace,
 *                   dál stejné RPC jako s odkazem (vr_persons_add_by_date je zavřené)
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
      delConfirm: 'Odebrat tuto osobu ze seznamu?', delLabel: 'Odebrat osobu',
      formTitle: 'Přidat osobu',
      fFirst: 'Jméno', fLast: 'Příjmení', fBirth: 'Datum narození',
      fCitizenship: 'Občanství', fDoc: 'Číslo dokladu', fDocOptional: '(nepovinné)',
      fResCity: 'Bydliště – město', fResCountry: 'Bydliště – země',
      fStay: 'Termín pobytu', fFrom: 'Od', fTo: 'Do',
      docHintCz: 'Občanský průkaz nebo pas. U dětí bez dokladu nechte prázdné.',
      docHintForeign: 'Zákonná evidence pro cizineckou policii — u cizinců povinné.',
      stayHint: 'Předvyplněno termínem pobytu — upravte, pokud přijíždíte nebo odjíždíte jindy.',
      stayHintFridge: 'Zadejte datum svého příjezdu a odjezdu.',
      submit: 'Přidat osobu', sending: 'Ukládám…',
      okAdded: 'Osoba přidána. Můžete zadat další.',
      addHint: 'Po přidání zůstane formulář otevřený — rovnou zadejte další osobu.',
      docWarnFix: 'Opravit', delLabel: 'Odebrat osobu', docWarnContinue: 'Je to správně, pokračovat',
      gdprTitle: 'Ochrana údajů',
      gdprBody: 'Údaje sbíráme jen kvůli zákonné evidenci ubytovaných a místnímu poplatku. Leží v zabezpečené databázi u zpracovatele Supabase (AWS Londýn, Spojené království — země s rozhodnutím EU o odpovídající ochraně). Čísla dokladů nevidí nikdo další z vaší skupiny — v přehledu se ukazuje jen, že je doklad vyplněný.',
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
      errLoad: 'Seznam se nepodařilo načíst. Zkuste prosím obnovit stránku.',
      codeTitle: 'Zadejte kód od dveří',
      codeBody: 'Registraci otevřete stejným kódem, kterým odemykáte vchodové dveře. Uvidíte pak celou svou skupinu a termín pobytu bude předvyplněný.',
      codeLabel: 'Kód od dveří', codeSubmit: 'Pokračovat',
      errCode: 'Kód nesedí. Zadejte prosím kód, kterým otevíráte vchodové dveře. Kdyby to nešlo, napište nám.',
      errCodeRate: 'Příliš mnoho pokusů. Zkuste to prosím za hodinu, nebo použijte odkaz ze zprávy.',
      fStreet: 'Ulice a číslo domu',
      fDocType: 'Druh dokladu',
      dtID: 'Občanský průkaz',
      dtP: 'Cestovní pas',
      dtO: 'Jiný doklad',
      fZtp: 'Osvobození od poplatku: jsem nevidomý/á, držitel/ka průkazu ZTP/P nebo jeho průvodce, nebo osoba závislá na pomoci jiné osoby',
      ztpHint: 'Průkaz si můžeme vyžádat k nahlédnutí.',
      errBirthReq: 'Vyplňte prosím datum narození — je povinné pro evidenci ubytovaných.',
      errDocAdult: 'U dospělých je číslo dokladu povinné (evidence ubytovaných).',
      errStreet: 'Vyplňte prosím ulici a číslo domu.',
      fDay: 'Den', fMonth: 'Měsíc', fYear: 'Rok', phDay: 'DD', phMonth: 'MM', phYear: 'RRRR',
      errBirthBad: 'Takové datum neexistuje. Zadejte den, měsíc a celý rok narození (čtyři číslice).',
      errBirthFuture: 'Datum narození je v budoucnosti — zkontrolujte prosím rok.',
      errBirthOld: 'Podle tohoto data by hostovi bylo přes 110 let — zkontrolujte prosím rok.',
      birthAsk: 'Opravdu je hostovi {age}?',
      ageMonths: ['{n} měsíc', '{n} měsíce', '{n} měsíců'], ageNewborn: 'méně než měsíc',
      birthFix: 'Opravit datum', birthYes: 'Ano, je to správně',
      docShape: 'Tvar čísla: {shape}, například {ex}. {where}',
      shapeL: ['písmeno', 'písmena', 'písmen'], shapeD: ['číslice', 'číslice', 'číslic'], shapeA: ['znak', 'znaky', 'znaků'],
      shapeANote: '(písmena a číslice)',
      where_idFrontTopRight: 'Najdete ho vpravo nahoře na přední straně průkazu.',
      where_idFront: 'Najdete ho na přední straně průkazu.',
      where_idFrontCard: 'Najdete ho na přední straně průkazu jako číslo karty (ne rodné číslo nad ním).',
      where_idPl: 'Najdete ho na přední straně pod občanstvím, u starších průkazů na zadní straně vpravo nahoře.',
      where_passTopRight: 'Najdete ho vpravo nahoře na stránce s fotografií.',
      docCan: 'Šestimístné číslo na průkazu to není.',
      errDocFormat: 'Tohle neodpovídá dokladu „{type}“ ({country}). Jeho číslo má {shape}, například {ex}. {where}',
      errDocOther: 'Tohle číslo odpovídá dokladu „{other}“, ne „{type}“. Vyberte prosím správný druh dokladu.',
      errDocChecksum: 'V čísle je nejspíš překlep — nesedí jeho kontrolní číslice. Zkontrolujte ho prosím znak po znaku. {where}',
      docEscape: 'Máte jiný nebo starší doklad? Vyberte druh „Jiný doklad“.',
      errDocLong: 'Číslo dokladu je příliš dlouhé — zkontrolujte ho prosím.',
      docSure: 'Číslo jsem opsal(a) přesně podle dokladu.',
      errDocSure: 'Potvrďte prosím, že je číslo opsané přesně podle dokladu.',
      docSoft: 'Kontrolní číslo na konci nesedí — v čísle je nejspíš překlep. Zkontrolujte ho prosím podle dokladu.',
      scanBtn: 'Načíst údaje z dokladu foťákem',
      scanBtnHint: 'Nepovinné. Foťák přečte řádky se znaky <<< na pasu nebo na zadní straně průkazu. Obraz zůstává ve vašem telefonu.',
      scanTitle: 'Namiřte na řádky se znaky <<<',
      scanStarting: 'Spouštím foťák…',
      scanLoading: 'Načítám čtečku (asi 3 MB)…',
      scanAim: 'Dejte řádky se znaky <<< do rámečku. Pas: dole na stránce s fotografií. Průkaz: zadní strana.',
      scanHold: 'Čtu… držte telefon v klidu.',
      scanSlow: 'Nejde to? Zkuste víc světla, bez odlesku a o kousek blíž. Nebo údaje vyplňte ručně.',
      scanErrDenied: 'Foťák není povolený. Nevadí — údaje vyplňte ručně.',
      scanErrNoCam: 'Foťák se nepodařilo spustit. Údaje vyplňte prosím ručně.',
      scanErrLoad: 'Čtečku se nepodařilo načíst. Údaje vyplňte prosím ručně.',
      scanManual: 'Zavřít a vyplnit ručně',
      scanPrivacy: 'Obraz z foťáku se zpracovává jen v tomto telefonu. Nikam se neodesílá ani neukládá.',
      scanDone: 'Načteno z dokladu: číslo a druh dokladu, datum narození, občanství{names}. Zkontrolujte je prosím, než osobu přidáte.',
      scanDoneNames: ' a jméno (v této části dokladu je bez diakritiky — opravte ho prosím)',
      gdprScan: 'Čtečka dokladu: obraz z foťáku zpracuje prohlížeč přímo ve vašem telefonu, nikam se neodesílá ani neukládá. Do formuláře se přepíše jen přečtený text (číslo a druh dokladu, datum narození, občanství, jméno), který před odesláním vidíte a můžete opravit.',
      citCommon: 'Časté', citOthers: 'Ostatní země'
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
      delConfirm: 'Remove this person from the list?', delLabel: 'Remove person',
      formTitle: 'Add a person',
      fFirst: 'First name', fLast: 'Last name', fBirth: 'Date of birth',
      fCitizenship: 'Citizenship', fDoc: 'Document number', fDocOptional: '(optional)',
      fResCity: 'Residence – city', fResCountry: 'Residence – country',
      fStay: 'Dates of stay', fFrom: 'From', fTo: 'To',
      docHintCz: 'ID card or passport. Leave empty for children without a document.',
      docHintForeign: 'Legal record for the foreign police — required for non-Czech guests.',
      stayHint: 'Pre-filled from the booking — adjust if you arrive or leave on different dates.',
      stayHintFridge: 'Enter your own arrival and departure dates.',
      submit: 'Add person', sending: 'Saving…',
      okAdded: 'Person added. You can add another.',
      addHint: 'The form stays open after adding — go straight on to the next person.',
      docWarnFix: 'Fix it', delLabel: 'Remove person', docWarnContinue: 'It’s correct, continue',
      gdprTitle: 'Data protection',
      gdprBody: 'We collect these details only for the legal guest register and the local fee. They’re stored in a secure database with our processor Supabase (AWS London, United Kingdom — a country covered by an EU adequacy decision). No one else in your group sees the document numbers — the overview only shows whether a document is filled in.',
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
      errLoad: 'The list couldn’t be loaded. Please reload the page.',
      codeTitle: 'Enter the door code',
      codeBody: 'Open the registration with the same code you use to unlock the front door. You will then see your whole group, with your stay dates already filled in.',
      codeLabel: 'Door code', codeSubmit: 'Continue',
      errCode: 'That code doesn’t match. Please enter the code you use to open the front door. If it doesn’t work, send us a message.',
      errCodeRate: 'Too many attempts. Please try again in an hour, or use the link from your message.',
      fStreet: 'Street and house number',
      fDocType: 'Document type',
      dtID: 'ID card',
      dtP: 'Passport',
      dtO: 'Other document',
      fZtp: 'Exempt from the tourist fee: I am blind, hold a Czech ZTP/P disability card or accompany its holder, or depend on another person’s care',
      ztpHint: 'We may ask to see the card.',
      errBirthReq: 'Please enter the date of birth — it is required for the guest register.',
      errDocAdult: 'A document number is required for adults (guest register).',
      errStreet: 'Please enter street and house number.',
      fDay: 'Day', fMonth: 'Month', fYear: 'Year', phDay: 'DD', phMonth: 'MM', phYear: 'YYYY',
      errBirthBad: 'That date doesn’t exist. Please enter the day, month and full year of birth (four digits).',
      errBirthFuture: 'The date of birth is in the future — please check the year.',
      errBirthOld: 'With this date the guest would be over 110 years old — please check the year.',
      birthAsk: 'Is the guest really {age} old?',
      ageMonths: ['{n} month', '{n} months', '{n} months'], ageNewborn: 'less than a month',
      birthFix: 'Fix the date', birthYes: 'Yes, that’s correct',
      docShape: 'Number format: {shape}, for example {ex}. {where}',
      shapeL: ['letter', 'letters', 'letters'], shapeD: ['digit', 'digits', 'digits'], shapeA: ['character', 'characters', 'characters'],
      shapeANote: '(letters and digits)',
      where_idFrontTopRight: 'You’ll find it at the top right on the front of the card.',
      where_idFront: 'You’ll find it on the front of the card.',
      where_idFrontCard: 'You’ll find it on the front of the card as the card number (not the national number above it).',
      where_idPl: 'You’ll find it on the front below the nationality; on older cards at the top right on the back.',
      where_passTopRight: 'You’ll find it at the top right of the photo page.',
      docCan: 'It is not the six-digit number on the card.',
      errDocFormat: 'This doesn’t match a “{type}” ({country}). Its number has {shape}, for example {ex}. {where}',
      errDocOther: 'This number matches a “{other}”, not a “{type}”. Please choose the correct document type.',
      errDocChecksum: 'There is probably a typo — the number’s check digit doesn’t match. Please check it character by character. {where}',
      docEscape: 'Do you have a different or older document? Choose “Other document”.',
      errDocLong: 'The document number is too long — please check it.',
      docSure: 'I have copied the number exactly as it appears on the document.',
      errDocSure: 'Please confirm that the number is copied exactly from the document.',
      docSoft: 'The check number at the end doesn’t match — there is probably a typo. Please check the number against the document.',
      scanBtn: 'Read the details from the document with the camera',
      scanBtnHint: 'Optional. The camera reads the lines with <<< characters in a passport or on the back of an ID card. The image stays on your phone.',
      scanTitle: 'Point at the lines with <<< characters',
      scanStarting: 'Starting the camera…',
      scanLoading: 'Loading the reader (about 3 MB)…',
      scanAim: 'Put the lines with <<< characters inside the frame. Passport: bottom of the photo page. ID card: the back.',
      scanHold: 'Reading… hold the phone still.',
      scanSlow: 'Not working? Try more light, no glare and a little closer. Or fill in the details by hand.',
      scanErrDenied: 'The camera isn’t allowed. No problem — please fill in the details by hand.',
      scanErrNoCam: 'The camera couldn’t be started. Please fill in the details by hand.',
      scanErrLoad: 'The reader couldn’t be loaded. Please fill in the details by hand.',
      scanManual: 'Close and fill in by hand',
      scanPrivacy: 'The camera image is processed only on this phone. It is not sent or stored anywhere.',
      scanDone: 'Read from the document: document number and type, date of birth, citizenship{names}. Please check them before adding the person.',
      scanDoneNames: ' and name (this part of the document has no accents — please correct it)',
      gdprScan: 'Document reader: the camera image is processed by the browser on your phone; it is not sent or stored anywhere. Only the text that was read (document number and type, date of birth, citizenship, name) is copied into the form, where you can see and correct it before submitting.',
      citCommon: 'Common', citOthers: 'Other countries'
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
      delConfirm: 'Diese Person aus der Liste entfernen?', delLabel: 'Person entfernen',
      formTitle: 'Person hinzufügen',
      fFirst: 'Vorname', fLast: 'Nachname', fBirth: 'Geburtsdatum',
      fCitizenship: 'Staatsangehörigkeit', fDoc: 'Dokumentnummer', fDocOptional: '(optional)',
      fResCity: 'Wohnort – Stadt', fResCountry: 'Wohnort – Land',
      fStay: 'Aufenthaltszeitraum', fFrom: 'Von', fTo: 'Bis',
      docHintCz: 'Personalausweis oder Reisepass. Bei Kindern ohne Ausweis leer lassen.',
      docHintForeign: 'Gesetzlicher Nachweis für die Fremdenpolizei — für ausländische Gäste erforderlich.',
      stayHint: 'Aus der Buchung vorausgefüllt — passen Sie an, falls Sie anders an- oder abreisen.',
      stayHintFridge: 'Bitte Ihr An- und Abreisedatum eingeben.',
      submit: 'Person hinzufügen', sending: 'Speichern…',
      okAdded: 'Person hinzugefügt. Sie können eine weitere eintragen.',
      addHint: 'Das Formular bleibt offen — tragen Sie gleich die nächste Person ein.',
      docWarnFix: 'Korrigieren', delLabel: 'Person entfernen', docWarnContinue: 'Stimmt so, weiter',
      gdprTitle: 'Datenschutz',
      gdprBody: 'Wir erheben diese Daten nur für das gesetzliche Gästeregister und die Kurtaxe. Sie liegen in einer sicheren Datenbank beim Auftragsverarbeiter Supabase (AWS London, Vereinigtes Königreich — ein Land mit EU-Angemessenheitsbeschluss). Die Dokumentnummern sieht niemand sonst aus Ihrer Gruppe — die Übersicht zeigt nur, ob ein Dokument eingetragen ist.',
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
      errLoad: 'Die Liste konnte nicht geladen werden. Bitte die Seite neu laden.',
      codeTitle: 'Türcode eingeben',
      codeBody: 'Öffnen Sie die Registrierung mit demselben Code, mit dem Sie die Haustür aufschließen. Danach sehen Sie Ihre ganze Gruppe, und der Aufenthalt ist bereits eingetragen.',
      codeLabel: 'Türcode', codeSubmit: 'Weiter',
      errCode: 'Der Code passt nicht. Bitte geben Sie den Code ein, mit dem Sie die Haustür öffnen. Falls es nicht klappt, schreiben Sie uns.',
      errCodeRate: 'Zu viele Versuche. Bitte in einer Stunde erneut versuchen oder den Link aus Ihrer Nachricht nutzen.',
      fStreet: 'Straße und Hausnummer',
      fDocType: 'Art des Ausweises',
      dtID: 'Personalausweis',
      dtP: 'Reisepass',
      dtO: 'Anderes Dokument',
      fZtp: 'Befreiung von der Kurtaxe: Ich bin blind, Inhaber eines tschechischen ZTP/P-Ausweises bzw. dessen Begleitperson oder auf fremde Hilfe angewiesen',
      ztpHint: 'Wir können Sie bitten, den Ausweis vorzuzeigen.',
      errBirthReq: 'Bitte das Geburtsdatum angeben — es ist für das Gästeverzeichnis erforderlich.',
      errDocAdult: 'Für Erwachsene ist die Ausweisnummer Pflicht (Gästeverzeichnis).',
      errStreet: 'Bitte Straße und Hausnummer angeben.',
      fDay: 'Tag', fMonth: 'Monat', fYear: 'Jahr', phDay: 'TT', phMonth: 'MM', phYear: 'JJJJ',
      errBirthBad: 'Dieses Datum gibt es nicht. Bitte Tag, Monat und das vollständige Geburtsjahr (vier Ziffern) eingeben.',
      errBirthFuture: 'Das Geburtsdatum liegt in der Zukunft — bitte das Jahr prüfen.',
      errBirthOld: 'Mit diesem Datum wäre der Gast über 110 Jahre alt — bitte das Jahr prüfen.',
      birthAsk: 'Ist der Gast wirklich {age} alt?',
      ageMonths: ['{n} Monat', '{n} Monate', '{n} Monate'], ageNewborn: 'weniger als einen Monat',
      birthFix: 'Datum korrigieren', birthYes: 'Ja, das stimmt',
      docShape: 'Aufbau der Nummer: {shape}, zum Beispiel {ex}. {where}',
      shapeL: ['Buchstabe', 'Buchstaben', 'Buchstaben'], shapeD: ['Ziffer', 'Ziffern', 'Ziffern'], shapeA: ['Zeichen', 'Zeichen', 'Zeichen'],
      shapeANote: '(Buchstaben und Ziffern)',
      where_idFrontTopRight: 'Sie steht oben rechts auf der Vorderseite des Ausweises.',
      where_idFront: 'Sie steht auf der Vorderseite des Ausweises.',
      where_idFrontCard: 'Sie steht auf der Vorderseite als Kartennummer (nicht die Nationalregisternummer darüber).',
      where_idPl: 'Sie steht auf der Vorderseite unter der Staatsangehörigkeit, bei älteren Ausweisen oben rechts auf der Rückseite.',
      where_passTopRight: 'Sie steht oben rechts auf der Seite mit dem Foto.',
      docCan: 'Die sechsstellige Nummer auf dem Ausweis ist es nicht.',
      errDocFormat: 'Das passt nicht zum Dokument „{type}“ ({country}). Dessen Nummer hat {shape}, zum Beispiel {ex}. {where}',
      errDocOther: 'Diese Nummer passt zu „{other}“, nicht zu „{type}“. Bitte die richtige Art des Ausweises wählen.',
      errDocChecksum: 'In der Nummer ist vermutlich ein Tippfehler — die Prüfziffer stimmt nicht. Bitte Zeichen für Zeichen prüfen. {where}',
      docEscape: 'Haben Sie ein anderes oder älteres Dokument? Wählen Sie „Anderes Dokument“.',
      errDocLong: 'Die Dokumentnummer ist zu lang — bitte prüfen.',
      docSure: 'Ich habe die Nummer genau vom Dokument abgeschrieben.',
      errDocSure: 'Bitte bestätigen Sie, dass die Nummer genau vom Dokument abgeschrieben ist.',
      docSoft: 'Die Prüfnummer am Ende stimmt nicht — vermutlich ein Tippfehler. Bitte die Nummer mit dem Dokument vergleichen.',
      scanBtn: 'Daten mit der Kamera vom Ausweis ablesen',
      scanBtnHint: 'Optional. Die Kamera liest die Zeilen mit den Zeichen <<< im Reisepass oder auf der Rückseite des Ausweises. Das Bild bleibt auf Ihrem Telefon.',
      scanTitle: 'Auf die Zeilen mit den Zeichen <<< richten',
      scanStarting: 'Kamera wird gestartet…',
      scanLoading: 'Lesegerät wird geladen (ca. 3 MB)…',
      scanAim: 'Bringen Sie die Zeilen mit den Zeichen <<< in den Rahmen. Reisepass: unten auf der Seite mit dem Foto. Ausweis: Rückseite.',
      scanHold: 'Lese… bitte das Telefon ruhig halten.',
      scanSlow: 'Klappt es nicht? Mehr Licht, keine Spiegelung und etwas näher. Oder die Daten von Hand eintragen.',
      scanErrDenied: 'Die Kamera ist nicht freigegeben. Kein Problem — bitte die Daten von Hand eintragen.',
      scanErrNoCam: 'Die Kamera konnte nicht gestartet werden. Bitte die Daten von Hand eintragen.',
      scanErrLoad: 'Das Lesegerät konnte nicht geladen werden. Bitte die Daten von Hand eintragen.',
      scanManual: 'Schließen und von Hand eintragen',
      scanPrivacy: 'Das Kamerabild wird nur auf diesem Telefon verarbeitet. Es wird nirgendwohin gesendet und nicht gespeichert.',
      scanDone: 'Vom Dokument gelesen: Nummer und Art des Dokuments, Geburtsdatum, Staatsangehörigkeit{names}. Bitte prüfen Sie die Angaben, bevor Sie die Person hinzufügen.',
      scanDoneNames: ' und Name (in diesem Teil des Dokuments ohne Umlaute — bitte korrigieren)',
      gdprScan: 'Ausweisleser: Das Kamerabild verarbeitet der Browser direkt auf Ihrem Telefon; es wird nirgendwohin gesendet und nicht gespeichert. In das Formular wird nur der gelesene Text übernommen (Nummer und Art des Dokuments, Geburtsdatum, Staatsangehörigkeit, Name), den Sie vor dem Absenden sehen und korrigieren können.',
      citCommon: 'Häufig', citOthers: 'Weitere Länder'
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
      delConfirm: 'Usunąć tę osobę z listy?', delLabel: 'Usuń osobę',
      formTitle: 'Dodaj osobę',
      fFirst: 'Imię', fLast: 'Nazwisko', fBirth: 'Data urodzenia',
      fCitizenship: 'Obywatelstwo', fDoc: 'Numer dokumentu', fDocOptional: '(opcjonalnie)',
      fResCity: 'Miejsce zamieszkania – miasto', fResCountry: 'Miejsce zamieszkania – kraj',
      fStay: 'Termin pobytu', fFrom: 'Od', fTo: 'Do',
      docHintCz: 'Dowód osobisty lub paszport. U dzieci bez dokumentu zostaw puste.',
      docHintForeign: 'Ustawowa ewidencja dla policji ds. cudzoziemców — dla cudzoziemców obowiązkowe.',
      stayHint: 'Wstępnie wypełnione terminem rezerwacji — zmień, jeśli przyjeżdżasz lub wyjeżdżasz inaczej.',
      stayHintFridge: 'Podaj datę swojego przyjazdu i wyjazdu.',
      submit: 'Dodaj osobę', sending: 'Zapisywanie…',
      okAdded: 'Osoba dodana. Możesz dodać kolejną.',
      addHint: 'Po dodaniu formularz zostaje otwarty — od razu wpisz kolejną osobę.',
      docWarnFix: 'Popraw', delLabel: 'Usuń osobę', docWarnContinue: 'Jest poprawny, kontynuuj',
      gdprTitle: 'Ochrona danych',
      gdprBody: 'Dane zbieramy wyłącznie do ustawowej ewidencji gości i opłaty miejscowej. Przechowujemy je w bezpiecznej bazie u podmiotu przetwarzającego Supabase (AWS Londyn, Wielka Brytania — kraj objęty decyzją UE o odpowiednim stopniu ochrony). Numerów dokumentów nie widzi nikt inny z grupy — w podglądzie widać tylko, czy dokument jest wpisany.',
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
      errLoad: 'Nie udało się wczytać listy. Odśwież proszę stronę.',
      codeTitle: 'Wpisz kod do drzwi',
      codeBody: 'Rejestrację otworzysz tym samym kodem, którym otwierasz drzwi wejściowe. Zobaczysz wtedy całą swoją grupę, a termin pobytu będzie już wpisany.',
      codeLabel: 'Kod do drzwi', codeSubmit: 'Dalej',
      errCode: 'Kod się nie zgadza. Wpisz kod, którym otwierasz drzwi wejściowe. Jeśli to nie działa, napisz do nas.',
      errCodeRate: 'Zbyt wiele prób. Spróbuj ponownie za godzinę albo skorzystaj z linku z wiadomości.',
      fStreet: 'Ulica i numer domu',
      fDocType: 'Rodzaj dokumentu',
      dtID: 'Dowód osobisty',
      dtP: 'Paszport',
      dtO: 'Inny dokument',
      fZtp: 'Zwolnienie z opłaty: jestem osobą niewidomą, posiadaczem czeskiej legitymacji ZTP/P lub jej opiekunem, albo osobą zależną od pomocy innych',
      ztpHint: 'Możemy poprosić o okazanie legitymacji.',
      errBirthReq: 'Podaj datę urodzenia — jest wymagana w ewidencji gości.',
      errDocAdult: 'U dorosłych numer dokumentu jest obowiązkowy (ewidencja gości).',
      errStreet: 'Podaj ulicę i numer domu.',
      fDay: 'Dzień', fMonth: 'Miesiąc', fYear: 'Rok', phDay: 'DD', phMonth: 'MM', phYear: 'RRRR',
      errBirthBad: 'Taka data nie istnieje. Podaj dzień, miesiąc i pełny rok urodzenia (cztery cyfry).',
      errBirthFuture: 'Data urodzenia jest w przyszłości — sprawdź proszę rok.',
      errBirthOld: 'Według tej daty gość miałby ponad 110 lat — sprawdź proszę rok.',
      birthAsk: 'Czy gość naprawdę ma {age}?',
      ageMonths: ['{n} miesiąc', '{n} miesiące', '{n} miesięcy'], ageNewborn: 'mniej niż miesiąc',
      birthFix: 'Popraw datę', birthYes: 'Tak, to prawda',
      docShape: 'Format numeru: {shape}, na przykład {ex}. {where}',
      shapeL: ['litera', 'litery', 'liter'], shapeD: ['cyfra', 'cyfry', 'cyfr'], shapeA: ['znak', 'znaki', 'znaków'],
      shapeANote: '(litery i cyfry)',
      where_idFrontTopRight: 'Znajdziesz go w prawym górnym rogu na przedniej stronie dowodu.',
      where_idFront: 'Znajdziesz go na przedniej stronie dowodu.',
      where_idFrontCard: 'Znajdziesz go na przedniej stronie jako numer karty (nie numer rejestru nad nim).',
      where_idPl: 'Znajdziesz go na przedniej stronie pod obywatelstwem, w starszych dowodach na odwrocie w prawym górnym rogu.',
      where_passTopRight: 'Znajdziesz go w prawym górnym rogu strony ze zdjęciem.',
      docCan: 'To nie jest sześciocyfrowy numer na dowodzie.',
      errDocFormat: 'To nie pasuje do dokumentu „{type}” ({country}). Jego numer ma {shape}, na przykład {ex}. {where}',
      errDocOther: 'Ten numer pasuje do dokumentu „{other}”, a nie „{type}”. Wybierz proszę właściwy rodzaj dokumentu.',
      errDocChecksum: 'W numerze jest prawdopodobnie literówka — nie zgadza się cyfra kontrolna. Sprawdź go proszę znak po znaku. {where}',
      docEscape: 'Masz inny lub starszy dokument? Wybierz „Inny dokument”.',
      errDocLong: 'Numer dokumentu jest za długi — sprawdź proszę.',
      docSure: 'Numer przepisałem(-am) dokładnie z dokumentu.',
      errDocSure: 'Potwierdź proszę, że numer jest przepisany dokładnie z dokumentu.',
      docSoft: 'Numer kontrolny na końcu się nie zgadza — w numerze jest prawdopodobnie literówka. Sprawdź go proszę z dokumentem.',
      scanBtn: 'Odczytaj dane z dokumentu aparatem',
      scanBtnHint: 'Opcjonalnie. Aparat odczyta wiersze ze znakami <<< w paszporcie lub na odwrocie dowodu. Obraz zostaje w Twoim telefonie.',
      scanTitle: 'Skieruj aparat na wiersze ze znakami <<<',
      scanStarting: 'Uruchamiam aparat…',
      scanLoading: 'Wczytuję czytnik (ok. 3 MB)…',
      scanAim: 'Umieść wiersze ze znakami <<< w ramce. Paszport: na dole strony ze zdjęciem. Dowód: odwrót.',
      scanHold: 'Czytam… trzymaj telefon nieruchomo.',
      scanSlow: 'Nie działa? Spróbuj przy lepszym świetle, bez odblasku i trochę bliżej. Albo wpisz dane ręcznie.',
      scanErrDenied: 'Aparat nie jest dozwolony. Nic nie szkodzi — wpisz dane ręcznie.',
      scanErrNoCam: 'Nie udało się uruchomić aparatu. Wpisz proszę dane ręcznie.',
      scanErrLoad: 'Nie udało się wczytać czytnika. Wpisz proszę dane ręcznie.',
      scanManual: 'Zamknij i wpisz ręcznie',
      scanPrivacy: 'Obraz z aparatu jest przetwarzany tylko w tym telefonie. Nie jest nigdzie wysyłany ani zapisywany.',
      scanDone: 'Odczytano z dokumentu: numer i rodzaj dokumentu, datę urodzenia, obywatelstwo{names}. Sprawdź je proszę przed dodaniem osoby.',
      scanDoneNames: ' oraz imię i nazwisko (w tej części dokumentu bez polskich znaków — popraw je proszę)',
      gdprScan: 'Czytnik dokumentu: obraz z aparatu przetwarza przeglądarka bezpośrednio w Twoim telefonie; nie jest nigdzie wysyłany ani zapisywany. Do formularza trafia tylko odczytany tekst (numer i rodzaj dokumentu, data urodzenia, obywatelstwo, imię i nazwisko), który widzisz i możesz poprawić przed wysłaniem.',
      citCommon: 'Częste', citOthers: 'Pozostałe kraje'
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

  /* ===================== doklad a datum narození ===================== */
  // Pravidla (formáty čísel podle států, kontrolní číslice, meze data narození) jsou
  // v doklady.js – čisté funkce, které zkouší tools/test-doklady.mjs.
  var D = window.VRDoklady;

  // Doklad je povinný u cizinců (UbyPort) a u dospělých (evidenční kniha § 3g).
  // Bez data narození bereme osobu jako dospělou — datum je stejně povinné.
  function isAdultAt(birth, at) {
    if (!birth) return true;
    var b = new Date(birth + 'T00:00:00'), a = new Date((at || isoToday()) + 'T00:00:00');
    b.setFullYear(b.getFullYear() + 18);
    return b <= a;
  }
  function docRequired(cit) { return cit !== 'CZ' || isAdultAt($('f-birth').value, $('f-from').value); }
  function plural(n, forms) {
    if (n === 1) return forms[0];
    if (lang === 'cs') return n >= 2 && n <= 4 ? forms[1] : forms[2];
    if (lang === 'pl') return (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? forms[1] : forms[2];
    return forms[1];
  }
  // „2 písmena + 7 číslic“ z masky pravidla
  function shapeText(form) {
    var L = T[lang], runs = D.shape(form);
    var txt = runs.map(function (r) {
      return r[0] + ' ' + plural(r[0], L['shape' + r[1]]);
    }).join(' + ');
    if (runs.length === 1 && runs[0][1] === 'A') txt += ' ' + L.shapeANote;
    return txt;
  }
  function whereText(rule) {
    var L = T[lang];
    return L['where_' + rule.where] + (rule.can ? ' ' + L.docCan : '');
  }
  function fill(tpl, map) {
    return tpl.replace(/\{(\w+)\}/g, function (m, k) { return map[k] != null ? map[k] : m; });
  }
  function typeName(t) { return T[lang]['dt' + t] || t; }

  /* ===================== helpers ===================== */
  var $ = function (id) { return document.getElementById(id); };
  var qs = new URLSearchParams(location.search);
  var token = (qs.get('t') || '').trim();
  var lang = 'cs';
  var booking = null;         // { arrival, departure, lastName }
  var fridge = false;         // token je klíč relace z kódu od dveří, ne osobní odkaz
  var SESSION_KEY = 'vr_reg_session';
  var docConfirmed = false;   // uživatel odklikl „je to správně, pokračovat" (jen měkká kontrolní číslice)
  var birthConfirmed = '';    // datum, u kterého host potvrdil „ano, je to miminko"

  /* Whitelist přes hasOwnProperty — `T['constructor']` by jinak prošel. */
  function isLang(x) { return typeof x === 'string' && Object.prototype.hasOwnProperty.call(T, x); }
  /* ?lang → jazyk zvolený jinde na webu (localStorage vrLang) → prohlížeč → cs.
     Host, který si na homepage přepnul němčinu, dostane formulář německy. */
  function pickInitialLang() {
    var q = (qs.get('lang') || '').toLowerCase();
    if (isLang(q)) return q;
    try { var s = (localStorage.getItem('vrLang') || '').toLowerCase(); if (isLang(s)) return s; } catch (e) {}
    var nav = (navigator.language || navigator.userLanguage || '').slice(0, 2).toLowerCase();
    if (isLang(nav)) return nav;
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
    lang = isLang(l) ? l : 'cs';
    var L = T[lang];
    document.documentElement.lang = L.htmlLang;

    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var k = el.getAttribute('data-i18n');
      if (L[k] != null) el.textContent = L[k];
    });
    document.querySelectorAll('[data-i18n-ph]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-ph');
      if (L[k] != null) el.placeholder = L[k];
    });
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      var k = el.getAttribute('data-i18n-aria');
      if (L[k] != null) el.setAttribute('aria-label', L[k]);
    });
    document.querySelectorAll('.vp-lang').forEach(function (b) {
      b.setAttribute('data-on', String(b.getAttribute('data-lang') === lang));
    });

    fillCountrySelects();
    updateDocUi();
    hideBirthWarn(); hideDocErr(); hideDocWarn();     // hlášky jsou v jazyce, který právě odešel
    renderHeader();
    // pokud už je seznam načtený, přerenderuj kvůli lokalizaci
    if (lastPersons) renderList(lastPersons);
    // submit label (mimo busy stav)
    var sl = $('submit').querySelector('.vp-submit-label');   // ne tlačítko u kódu od dveří
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

  /* ===================== datum narození ===================== */
  var BIRTH_IDS = ['f-bd', 'f-bm', 'f-by'];
  // Tři políčka → skryté #f-birth (RRRR-MM-DD, nebo prázdné, dokud datum není celé a platné).
  function syncBirth() {
    var iso = D.birthFromParts($('f-bd').value, $('f-bm').value, $('f-by').value);
    $('f-birth').value = iso || '';
    return iso;
  }
  function birthEmpty() { return BIRTH_IDS.every(function (id) { return $(id).value.trim() === ''; }); }
  function hideBirthWarn() { $('birthWarn').hidden = true; }
  function showBirthWarn(msg, canConfirm) {
    $('birthWarnMsg').textContent = msg;
    $('birthWarnOk').hidden = !canConfirm;
    $('birthWarn').classList.toggle('vp-docwarn-hard', !canConfirm);
    $('birthWarn').hidden = false;
  }
  function ageText(months) {
    var L = T[lang];
    return months < 1 ? L.ageNewborn : fill(plural(months, L.ageMonths), { n: months });
  }
  /**
   * Zkontroluje datum narození a případnou hlášku ukáže přímo u pole.
   * Vrací datum RRRR-MM-DD, nebo null (nejde dál). quiet = jen průběžná kontrola po opuštění
   * pole: neúplné datum mlčí, na miminko se ptá.
   */
  function validateBirth(quiet) {
    var L = T[lang];
    if (birthEmpty()) {
      if (!quiet) { showBirthWarn(L.errBirthReq, false); markInvalid(BIRTH_IDS); }
      return null;
    }
    var iso = syncBirth();
    if (!iso) {
      if (quiet && BIRTH_IDS.some(function (id) { return $(id).value.trim() === ''; })) return null;
      showBirthWarn(L.errBirthBad, false); markInvalid(BIRTH_IDS);
      return null;
    }
    var c = D.checkBirth(iso, isoToday());
    if (c.code === 'future') { showBirthWarn(L.errBirthFuture, false); markInvalid(['f-by']); return null; }
    if (c.code === 'old') { showBirthWarn(L.errBirthOld, false); markInvalid(['f-by']); return null; }
    if (c.code === 'confirm' && birthConfirmed !== iso) {
      showBirthWarn(fill(L.birthAsk, { age: ageText(c.months) }), true);
      return null;
    }
    hideBirthWarn();
    return iso;
  }
  function onBirthInput(ev) {
    var el = ev.target, i = BIRTH_IDS.indexOf(el.id);
    // vložené celé datum („15.3.1985“, „15/03/1985“) se rozdělí do políček
    var m = /^\s*(\d{1,2})[.\/\- ]+(\d{1,2})[.\/\- ]+(\d{4})\s*$/.exec(el.value);
    if (m) { $('f-bd').value = m[1]; $('f-bm').value = m[2]; $('f-by').value = m[3]; $('f-by').focus(); }
    else {
      el.value = el.value.replace(/\D/g, '');
      // plné políčko → skok na další (den 4–9 a měsíc 2–9 jsou jasné už z jedné číslice)
      var v = el.value, full = v.length >= el.maxLength || (i === 0 && v.length === 1 && +v > 3) || (i === 1 && v.length === 1 && +v > 1);
      if (full && i < 2 && ev.inputType !== 'deleteContentBackward') $(BIRTH_IDS[i + 1]).focus();
    }
    birthConfirmed = '';
    hideBirthWarn();
    BIRTH_IDS.forEach(function (id) { $(id).removeAttribute('aria-invalid'); });
    syncBirth();
    updateDocUi();
  }
  function setBirth(iso) {
    $('f-bd').value = iso ? String(+iso.slice(8, 10)) : '';
    $('f-bm').value = iso ? String(+iso.slice(5, 7)) : '';
    $('f-by').value = iso ? iso.slice(0, 4) : '';
    birthConfirmed = '';
    hideBirthWarn();
    syncBirth();
  }

  /* ===================== doc UI ===================== */
  function currentCit() { return ($('f-cit').value || 'CZ').toUpperCase(); }
  function currentDtype() { return $('f-dtype').value || 'ID'; }
  function updateDocUi() {
    var L = T[lang];
    var foreign = currentCit() !== 'CZ';
    var req = docRequired(currentCit());
    $('docStar').hidden = !req;                  // povinné: cizinec nebo dospělý
    $('docOpt').hidden = req;                    // „(nepovinné)" jen u dětí z ČR
    $('docHint').textContent = foreign ? L.docHintForeign : L.docHintCz;
    // stát s přesným pravidlem: ukaž tvar čísla a kde na dokladu je, ještě než host začne psát
    var rule = D.ruleFor(currentCit(), currentDtype()), sh = $('docShape');
    if (rule) {
      sh.textContent = '';
      var parts = fill(L.docShape, { shape: shapeText(rule.forms[0]), where: whereText(rule) }).split('{ex}');
      sh.appendChild(document.createTextNode(parts[0]));
      var b = document.createElement('b'); b.textContent = rule.forms[0].ex; sh.appendChild(b);
      sh.appendChild(document.createTextNode(parts[1] || ''));
    }
    sh.hidden = !rule;
    updateDocSure();
  }
  // „Opsal jsem přesně“ se chce jen tam, kde číslo neumíme zkontrolovat sami.
  function updateDocSure() {
    var r = D.checkDoc($('f-doc').value, currentCit(), currentDtype());
    var need = r.code === 'generic';
    $('docSureRow').hidden = !need;
    if (!need) $('f-docsure').checked = false;
    return r;
  }
  function hideDocWarn() { $('docWarn').hidden = true; $('f-doc').classList.remove('warn'); }
  function hideDocErr() {
    $('docErr').hidden = true; $('docErr').textContent = '';
    $('docShape').hidden = !D.ruleFor(currentCit(), currentDtype());
  }
  // Chyba tvaru nese vzor i místo na dokladu sama, nápověda nad ní by se jen opakovala.
  function showDocErr(msg, ids, keepShape) {
    $('docErr').textContent = msg; $('docErr').hidden = false;
    if (!keepShape) $('docShape').hidden = true;
    markInvalid(ids || ['f-doc']);
  }
  // Hláška k výsledku kontroly; null = číslo je v pořádku (nebo čeká jen na potvrzení).
  function docMessage(r) {
    var L = T[lang], cit = currentCit(), t = currentDtype();
    switch (r.code) {
      case 'chars': return L.errDocChars;
      case 'short': return L.errDocShort;
      case 'long': return L.errDocLong;
      case 'format':
        return fill(L.errDocFormat, { type: typeName(t), country: countryName(cit, lang),
          shape: shapeText(r.rule.forms[0]), ex: r.rule.forms[0].ex, where: whereText(r.rule) }) + '\n' + L.docEscape;
      case 'other': return fill(L.errDocOther, { type: typeName(t), other: typeName(r.other) });
      case 'checksum': return fill(L.errDocChecksum, { where: whereText(r.rule) }) + '\n' + L.docEscape;
    }
    return null;
  }
  // Průběžná kontrola, když host pole opustí nebo změní stát / druh dokladu.
  function checkDocLive() {
    hideDocErr(); $('f-doc').removeAttribute('aria-invalid');
    var r = updateDocSure();
    if (r.code === 'empty') return r;
    var msg = docMessage(r);
    if (msg) showDocErr(msg);
    else if (r.value !== $('f-doc').value) $('f-doc').value = r.value;   // velká písmena, bez mezer a pomlček
    return r;
  }

  /* ===================== čtečka dokladu (volitelná) ===================== */
  // Foťák přečte strojově čitelnou zónu; obraz neopouští prohlížeč (viz hlavička ctecka.js).
  // ZKUŠEBNÍ PROVOZ: tlačítko je vidět jen s ?ctecka=1 — na skutečném telefonu zatím neměřeno.
  // Po ověření stačí SCAN_ON nastavit na true.
  var SCAN_ON = qs.get('ctecka') === '1';
  function scanSupported() {
    try {
      return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.Worker &&
        window.WebAssembly && WebAssembly.validate(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123,
          3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 253, 98, 11])));       // WebAssembly SIMD
    } catch (e) { return false; }
  }
  function loadScript(src) {
    return new Promise(function (ok, fail) {
      var el = document.createElement('script');
      el.src = src; el.onload = ok; el.onerror = function () { fail(new Error(src)); };
      document.head.appendChild(el);
    });
  }
  var readerP = null;             // mrz.js + ctecka.js se načtou až po prvním klepnutí
  function loadReader() {
    if (!readerP) {
      readerP = loadScript('mrz.js?v=1').then(function () { return loadScript('ctecka.js?v=1'); });
      readerP.catch(function () { readerP = null; });
    }
    return readerP;
  }
  function scanNote(msg) { var n = $('scanNote'); n.textContent = msg || ''; n.hidden = !msg; }
  function openScan() {
    scanNote('');
    loadReader().then(function () {
      window.VRCtecka.open({ texts: T[lang], onResult: applyScan });
    }).catch(function () { scanNote(T[lang].scanErrLoad); });
  }
  // Přečtené údaje do formuláře. Host je vidí a může opravit; kontroly běží stejně jako u psaní.
  function applyScan(r) {
    var L = T[lang], named = false, cit = $('f-cit');
    if (r.citizenship && cit.querySelector('option[value="' + r.citizenship + '"]')) {
      cit.value = r.citizenship;
      if ($('f-rescnt').getAttribute('data-touched') !== 'true') $('f-rescnt').value = r.citizenship;
    }
    $('f-dtype').value = r.docType;
    $('f-doc').value = r.docNumber;
    setBirth(r.birth);
    // jméno jen do prázdných políček: strojová zóna nemá diakritiku (MUELLER, NOVAK)
    if (!$('f-first').value.trim() && !$('f-last').value.trim() && r.lastName) {
      $('f-first').value = r.firstName; $('f-last').value = r.lastName; named = true;
    }
    clearError();
    docConfirmed = false; $('f-docsure').checked = false;
    updateDocUi(); hideDocWarn(); checkDocLive(); validateBirth(true);
    scanNote(fill(L.scanDone, { names: named ? L.scanDoneNames : '' }));
    $('scanRow').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ===================== error/ok ===================== */
  // aria-invalid: zvýrazní dotčené pole (CSS [aria-invalid="true"]) a čtečka ho ohlásí.
  // Maže se při dalším pokusu (clearError) i jakmile uživatel do pole sáhne (init).
  function markInvalid(ids) {
    ids.forEach(function (id) { var el = $(id); if (el) el.setAttribute('aria-invalid', 'true'); });
  }
  function clearInvalid() {
    document.querySelectorAll('.vp-form [aria-invalid]').forEach(function (el) { el.removeAttribute('aria-invalid'); });
  }
  function showError(msg, ids) {
    var e = $('err'); e.textContent = msg; e.hidden = false;
    $('okToast').hidden = true;
    if (ids) markInvalid(ids);
    e.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  function clearError() { var e = $('err'); e.hidden = true; e.textContent = ''; clearInvalid(); }
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
      case 'birth_required': return L.errBirthReq;
      case 'dates_invalid': return L.errDates;
      case 'out_of_window': return L.errWindow;
      case 'rate_limited': return L.errRate;
      case 'booking_full': return L.errBookingFull;
      case 'token_invalid': case 'token_required': return L.errToken;
      default: return L.errGeneric;
    }
  }
  // které pole patří k chybovému kódu ze serveru (pro aria-invalid)
  var ERR_FIELD = {
    first_required: ['f-first'], last_required: ['f-last'], citizenship_invalid: ['f-cit'],
    doc_required: ['f-doc'], doc_invalid: ['f-doc'], birth_invalid: BIRTH_IDS, birth_required: BIRTH_IDS,
    dates_invalid: ['f-from', 'f-to'], out_of_window: ['f-from', 'f-to']
  };

  /* ===================== list ===================== */
  var lastPersons = null;

  function loadList() {
    if (!token) return;
    rpc('vr_persons_list', { p_token: token }).then(function (res) {
      var d = res.data || {};
      if (d.ok === true) { renderList(d.persons || []); return; }
      // Neplatný / prošlý odkaz: řekni to hned při načtení, ne až po odeslání
      // formuláře. Prázdná hlavička „Zaregistrovaní" by jinak tvrdila, že je vše OK.
      if (d.error === 'token_invalid' || d.error === 'token_required') {
        // relace z lednice vypršela (po odjezdu) → zpátky na zadání kódu
        if (fridge) { clearSession(); showCodeGate(); return; }
        $('listSection').hidden = true;
        showError(T[lang].errToken);
        return;
      }
      showError(T[lang].errLoad);
    }).catch(function () { showError(T[lang].errLoad); });
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
      del.type = 'button'; del.className = 'vp-del'; del.setAttribute('aria-label', L.delLabel); del.title = L.delLabel;
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
    setBirth(''); $('f-doc').value = '';
    $('f-ztp').checked = false; $('f-docsure').checked = false;
    // občanství, adresu i termín necháme — skupina bývá rodina z jednoho místa
    updateDocUi();
    hideDocWarn(); hideDocErr(); scanNote('');
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

    var street = $('f-street').value.trim();
    var dtype = $('f-dtype').value || null;
    var ztp = $('f-ztp').checked;
    var first = $('f-first').value.trim();
    var last = $('f-last').value.trim();
    var cit = currentCit();
    var doc = $('f-doc').value.trim();
    var city = $('f-city').value.trim();
    var rescnt = ($('f-rescnt').value || '').toUpperCase();
    var from = $('f-from').value;
    var to = $('f-to').value;

    if (!first) { showError(L.errFirst, ['f-first']); return; }
    if (!last) { showError(L.errLast, ['f-last']); return; }
    // datum narození: hláška (i dotaz na miminko) se ukáže přímo u pole
    var birth = validateBirth(false);
    if (!birth) { $('birthWarn').scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (!street) { showError(L.errStreet, ['f-street']); $('f-street').focus(); return; }
    if (!from || !to) { showError(L.errStay, [].concat(from ? [] : ['f-from'], to ? [] : ['f-to'])); return; }
    if (to < from) { showError(L.errDates, ['f-to']); return; }

    // --- validace dokladu (pravidla podle státu a druhu: doklady.js) ---
    hideDocErr();
    var dc = D.checkDoc(doc, cit, dtype || 'ID');
    var docMsg = dc.code === 'empty'
      ? (docRequired(cit) ? (cit !== 'CZ' ? L.errDocRequired : L.errDocAdult) : null)
      : docMessage(dc);
    if (docMsg) {
      showDocErr(docMsg, null, dc.code === 'empty');
      $('docErr').scrollIntoView({ behavior: 'smooth', block: 'center' });
      $('f-doc').focus({ preventScroll: true });
      return;
    }
    if (dc.code === 'checksoft' && !docConfirmed) {
      // kontrolní číslice nesedí, ale algoritmus není doložen úředně — host může potvrdit
      $('docWarnMsg').textContent = L.docSoft;
      $('docWarn').hidden = false;
      $('f-doc').classList.add('warn');
      $('docWarn').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    if (dc.code === 'generic' && !$('f-docsure').checked) {
      $('docSureRow').hidden = false;
      showDocErr(L.errDocSure, ['f-docsure'], true);
      $('docSureRow').scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    doc = dc.value;                              // velká písmena, bez mezer a pomlček

    setBusy(true);
    hideDocWarn();

    var payload = {
      p_first: first, p_last: last, p_birth: birth, p_citizenship: cit,
      p_doc: doc, p_res_city: city, p_res_country: rescnt, p_from: from, p_to: to,
      p_res_street: street, p_doc_type: doc ? dtype : null, p_fee_exempt: ztp ? 'ztp' : null
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
      // stará lednicová cesta bez kódu je zavřená; prošlá relace z lednice
      if (d.error === 'code_required' || (fridge && d.error === 'token_invalid')) { clearSession(); showCodeGate(); return; }
      showError(mapError(d.error), ERR_FIELD[d.error]);
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
    $('codeSection').hidden = true;
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

  /* ===================== lednice: kód od dveří ===================== */
  // Statický QR na lednici nemá token. Host zadá kód od dveří (zná ho jen skupina
  // ve vile), vr_fridge_open vrátí klíč relace platný do dne odjezdu a dál se
  // chová stejně jako osobní odkaz — seznam skupiny, termín z rezervace.
  function loadSession() {
    try {
      var s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (s && s.token && s.booking && s.booking.departure >= isoToday()) return s;
    } catch (e) {}
    return null;
  }
  function saveSession(s) { try { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch (e) {} }
  function clearSession() { try { sessionStorage.removeItem(SESSION_KEY); } catch (e) {} }
  function useSession(s) {
    token = s.token; fridge = true;
    booking = { arrival: s.booking.arrival, departure: s.booking.departure, lastName: s.booking.last_name || '' };
    renderHeader(); setStayDefaults(); showForm(); loadList();
  }
  function showCodeGate(msg) {
    token = ''; fridge = false; booking = null;
    $('codeSection').hidden = false;
    $('formSection').hidden = true;
    $('listSection').hidden = true;
    $('closedView').hidden = true;
    $('gdprSection').hidden = false;
    renderHeader();
    var e = $('codeErr');
    if (msg) { e.textContent = msg; e.hidden = false; } else { e.hidden = true; }
  }
  function submitCode(ev) {
    ev.preventDefault();
    var L = T[lang], code = $('f-code').value.trim(), e = $('codeErr');
    e.hidden = true;
    if (!code) { e.textContent = L.errCode; e.hidden = false; $('f-code').focus(); return; }
    var btn = $('codeSubmit');
    btn.disabled = true; btn.setAttribute('data-busy', 'true');
    rpc('vr_fridge_open', { p_code: code }).then(function (res) {
      btn.disabled = false; btn.removeAttribute('data-busy');
      var d = res.data || {};
      if (d.ok === true && d.token) {
        var s = { token: d.token, booking: d.booking || {} };
        saveSession(s);
        $('f-code').value = '';
        useSession(s);
        return;
      }
      e.textContent = d.error === 'rate_limited' ? L.errCodeRate : L.errCode;
      e.hidden = false;
      $('f-code').select();
    }).catch(function () {
      btn.disabled = false; btn.removeAttribute('data-busy');
      e.textContent = L.errGeneric; e.hidden = false;
    });
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
      updateDocUi(); hideDocWarn(); docConfirmed = false; checkDocLive();
    });
    $('f-rescnt').addEventListener('change', function () { this.setAttribute('data-touched', 'true'); });
    $('f-dtype').addEventListener('change', function () { updateDocUi(); hideDocWarn(); docConfirmed = false; checkDocLive(); });
    $('f-doc').addEventListener('input', function () {
      hideDocWarn(); hideDocErr(); docConfirmed = false;
      $('f-docsure').checked = false;              // změněné číslo = potvrdit znovu
      updateDocSure();
    });
    $('f-doc').addEventListener('blur', checkDocLive);
    $('f-docsure').addEventListener('change', hideDocErr);
    $('f-from').addEventListener('change', updateDocUi);

    // datum narození: tři políčka
    BIRTH_IDS.forEach(function (id) {
      $(id).addEventListener('input', onBirthInput);
      $(id).addEventListener('keydown', function (ev) {      // Backspace v prázdném políčku → zpět
        var i = BIRTH_IDS.indexOf(id);
        if (ev.key === 'Backspace' && this.value === '' && i > 0) $(BIRTH_IDS[i - 1]).focus();
      });
    });
    $('f-by').addEventListener('blur', function () { validateBirth(true); });
    $('birthWarnFix').addEventListener('click', function () { hideBirthWarn(); $('f-by').focus(); $('f-by').select(); });
    $('birthWarnOk').addEventListener('click', function () { birthConfirmed = syncBirth() || ''; hideBirthWarn(); });

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

    // čtečka dokladu: jen zkušebně a jen když ji telefon umí
    if (SCAN_ON && scanSupported()) {
      $('scanRow').hidden = false; $('gdprScan').hidden = false;
      $('scanBtn').addEventListener('click', openScan);
    }

    $('form').addEventListener('submit', submit);
    $('codeForm').addEventListener('submit', submitCode);
    // pole označené aria-invalid se odznačí, jakmile do něj uživatel sáhne
    ['input', 'change'].forEach(function (evName) {
      $('form').addEventListener(evName, function (ev) {
        var el = ev.target;
        if (el && el.getAttribute && el.getAttribute('aria-invalid')) el.removeAttribute('aria-invalid');
      });
    });

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
      // lednice: platná relace z dřívějška (reload stránky), jinak kód od dveří
      var sess = loadSession();
      if (sess) useSession(sess); else showCodeGate();
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
