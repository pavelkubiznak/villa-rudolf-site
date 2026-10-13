/* Villa Rudolf — ovládací stránka majitele (/sprava/)
 * Jen majitel, jen česky, mobile-first.
 *  - Brána: sha256(token) === TOKEN_HASH (klient), token = admin_key pro RPC.
 *  - Pobyty: history.json (kalendář úklidu, READ-ONLY) párovaný přes uidh na vr_bookings.
 *  - Admin RPC (SECURITY DEFINER, hash admin_key v vr_admin_config, rate-limit 120/h).
 *  - Sekvence zpráv se schválenými šablonami (doslova) + wa.me + log odeslání.
 * Token samotný v tomto souboru NENÍ — jen jeho sha256.
 */
(function () {
  'use strict';

  /* ============ Config ============ */
  var CFG = {
    SUPABASE_URL: 'https://fpknbrzbqpalguajskut.supabase.co',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwa25icnpicXBhbGd1YWpza3V0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDEyMTAsImV4cCI6MjA5Mjg3NzIxMH0.goat1c7Y1YnpTq7_XyMD3LROElkVI6E27f0B3EG8btA',
    CALENDAR_URL: 'https://pavelkubiznak.github.io/villa-booking-calendar/data/history.json'
  };
  // sha256 přístupového tokenu. Token samotný se sem NIKDY nepíše.
  var TOKEN_HASH = 'b887a4a499dc6306d51fd15138f4235e680ae721edec15712c7030a589367430';

  // Heslo Wi-Fi se sem NEPÍŠE (repo je veřejné) — čte se z vr_admin_config, klíč
  // wifi_password (vyplní se v Nastavení, migrace 20260915_vr_admin_config_wifi.sql).
  // Když chybí, zůstane v náhledu zprávy viditelně {WIFI_HESLO}, uvítací zpráva nejde
  // odeslat a „Co doplnit" to hlásí nahoře.
  function wifiPassword() { return String((adminConfig || {}).wifi_password || '').trim(); }
  var STORE_KEY = 'vr_sprava_key';   // admin token (session nebo local)
  var STORE_GT = 'vr_sprava_gt';     // guest tokeny (jen sessionStorage, per-zařízení)

  var adminKey = null;
  var calendar = [];   // [{uidh,start,end,platform}]
  var bookings = [];   // z vr_admin_list_bookings
  var stays = [];       // sloučený pohled
  var expandedStays = false;
  var adminConfig = {}; // konfigurace z vr_admin_config: ubyport_* + wifi_password (Nastavení)
  var serverConflicts = []; // stav hlídače z vr_admin_conflicts (resolved/known)
  var holds = [];           // předrezervace + přímé rezervace (vr_admin_list_holds)
  var holdsShowClosed = false;  // propadlé a zrušené jsou schované, dokud si je nevyžádáš
  var lastHolds = [];       // právě vykreslené pořadí (pro obsluhu tlačítek)
  var payments = [];        // bankovní pohyby z Fia (vr_admin_list_payments)
  var lastPays = [];        // právě vykreslené pořadí (pro obsluhu tlačítek)
  var requests = [];        // žádosti z webového formuláře (vr_admin_list_requests)
  var verified = {};        // verified.json kalendáře: 'start..end' → {status} (service = blok majitele)
  var doorCodes = null;     // kódy v zámku Yale, jak je hlásí Home Assistant (vr_admin_door_codes)
  var requestsShowDone = false; // vyřízené žádosti jsou schované, dokud si je nevyžádáš
  var lastRequests = [];    // právě vykreslené pořadí (pro obsluhu tlačítek)
  var lastDetect = null;    // poslední klientská detekce (pro obsluhu tlačítek banneru)
  var lastProblems = [];    // poslední seznam konfiguračních děr (sekce „Problémy")
  // Známý červencový konflikt (majitel ho už řeší) — jen pro popisek „řeší se".
  var KNOWN_UIDH = ['44f67225fb4ecfb9', '0dcf556ecb298ab7'];

  var DEPOSIT_CZK = 5000;             // vratná kauce (Kč)
  var REVOLUT_URL = 'https://revolut.me/pavelhuqh';

  /* ============ DOM helpers ============ */
  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg) {
    var t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
    requestAnimationFrame(function () { t.classList.add('show'); });
    setTimeout(function () { t.classList.remove('show'); setTimeout(function () { t.remove(); }, 250); }, 2200);
  }

  /* ============ Datum ============ */
  var MONTH_GEN = ['ledna', 'února', 'března', 'dubna', 'května', 'června',
    'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
  function isoToday() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function parseISO(s) { return new Date(s + 'T00:00:00'); }
  function addDaysISO(iso, n) {
    var d = parseISO(iso); d.setDate(d.getDate() + n);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function addMonthsISO(iso, m) {
    var d = parseISO(iso); d.setMonth(d.getMonth() + m);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function nights(a, b) { return Math.max(0, Math.round((parseISO(b) - parseISO(a)) / 86400000)); }
  function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
  /* Měsíce pro {TERMIN} ve zprávách hostům — v jazyce pobytu, ne česky.
     Admin UI (konflikty, seznam pobytů) zůstává česky (lang vynechán). */
  var MONTH_BY_LANG = {
    en: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'],
    de: ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'],
    pl: ['stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca', 'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia']
  };
  function fmtTermin(a, b, lang) {
    var da = parseISO(a), db = parseISO(b);
    var d1 = da.getDate(), m1 = da.getMonth(), y1 = da.getFullYear();
    var d2 = db.getDate(), m2 = db.getMonth(), y2 = db.getFullYear();
    var M = MONTH_BY_LANG[lang] || MONTH_GEN;
    var dot = (lang === 'en' || lang === 'pl') ? '' : '.';   // en/pl bez tečky za dnem
    if (y1 === y2 && m1 === m2) return d1 + dot + '–' + d2 + dot + ' ' + M[m2] + ' ' + y2;
    if (y1 === y2) return d1 + dot + ' ' + M[m1] + ' – ' + d2 + dot + ' ' + M[m2] + ' ' + y2;
    return d1 + dot + ' ' + M[m1] + ' ' + y1 + ' – ' + d2 + dot + ' ' + M[m2] + ' ' + y2;
  }
  function fmtDayShort(iso) {
    var d = parseISO(iso);
    return isNaN(d) ? String(iso || '') : (d.getDate() + '. ' + (d.getMonth() + 1) + '. ' + d.getFullYear());
  }
  function fmtShort(a, b) {
    var da = parseISO(a), db = parseISO(b);
    return da.getDate() + '. ' + (da.getMonth() + 1) + '. – ' + db.getDate() + '. ' + (db.getMonth() + 1) + '. ' + db.getFullYear();
  }
  function isWinter(iso) {
    var d = parseISO(iso), m = d.getMonth() + 1, day = d.getDate();
    // zima 15.10–31.3
    return (m === 1 || m === 2 || m === 3) || (m === 11 || m === 12) || (m === 10 && day >= 15);
  }

  /* ============ Crypto brána ============ */
  function sha256hex(str) {
    return crypto.subtle.digest('SHA-256', new TextEncoder().encode(str)).then(function (buf) {
      return Array.prototype.map.call(new Uint8Array(buf), function (b) {
        return b.toString(16).padStart(2, '0');
      }).join('');
    });
  }

  /* ============ Storage ============ */
  function readStoredKey() {
    try { return localStorage.getItem(STORE_KEY) || sessionStorage.getItem(STORE_KEY); } catch (e) { return null; }
  }
  function storeKey(tok, remember) {
    try {
      sessionStorage.setItem(STORE_KEY, tok);
      if (remember) localStorage.setItem(STORE_KEY, tok);
    } catch (e) {}
  }
  function clearKey() {
    try { sessionStorage.removeItem(STORE_KEY); localStorage.removeItem(STORE_KEY); } catch (e) {}
  }
  function guestTokens() {
    try { return JSON.parse(sessionStorage.getItem(STORE_GT) || '{}'); } catch (e) { return {}; }
  }
  function setGuestToken(id, tok) {
    var m = guestTokens(); m[id] = tok;
    try { sessionStorage.setItem(STORE_GT, JSON.stringify(m)); } catch (e) {}
  }
  // Od 15. 9. 2026 vrací vr_admin_list_bookings token hosta (sloupec token_enc, šifrovaný
  // admin klíčem) — odkazy tak fungují na každém zařízení. sessionStorage zůstává jen pro
  // pobyty založené před migrací a jako záloha hned po založení.
  function tokenFor(id) {
    for (var i = 0; i < bookings.length; i++) { if (bookings[i].id === id && bookings[i].token) return bookings[i].token; }
    return guestTokens()[id] || null;
  }

  /* ============ RPC ============ */
  function rpc(fn, body) {
    body = body || {};
    body.p_admin_key = adminKey;
    return fetch(CFG.SUPABASE_URL + '/rest/v1/rpc/' + fn, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: CFG.SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + CFG.SUPABASE_ANON_KEY
      },
      body: JSON.stringify(body)
    }).then(function (r) {
      return r.json().then(function (d) { return { ok: r.ok, status: r.status, data: d }; })
        .catch(function () { return { ok: r.ok, status: r.status, data: null }; });
    });
  }

  /* ============ ŠABLONY ZPRÁV — 4 jazyky cs/en/de/pl ============ */
  // Přístup TPL[lang][key]. STEJNÝ blok má n8n/VrDailyTasks/VrDailyTasks.code.js —
  // kdo mění text tady, mění ho i tam (hlídá tools/test-zpravy.mjs).
  // Znění schválil Pavel 13. 10. 2026 (čeština je předloha, de/en/pl jsou z ní přeložené):
  //  first       první ozvěna hned po rezervaci — bez registrace, bez otázek na počty,
  //              odkazy vedou na web v jazyce hosta (ne na keypano). Čeští hosté mají
  //              kratší odstavec o dokladech bez cizinecké policie.
  //  cover       krátká průvodní zpráva na WhatsApp, když celý text šel přes platformu
  //  welcomeCore uvítací zpráva (T−10): adresa, kód, video, průvodce, Wi-Fi, kniha hostů
  //              a poplatek. BEZ odkazu na registraci — zapisuje se až na místě přes QR
  //              na lednici (kdo se zapíše předem a nepřijede, za toho se pak platí).
  //  video*      co je ve videu (léto / zima), pay* věta o placení poplatku ({JAK_SE_PLATI})
  //  update      krátká zpráva T−2 s kódem; inDays* = „pozítří / zítra / dnes" ({KDY})
  // Všechny jazyky VYKAJÍ, i němčina („Sie", „Guten Tag") — Pavel: „v němčině nebudeme
  // nikomu tykat". Web a inzeráty německy tykají (text-villa-rudolf.md), zprávy ne.
  // Letní a zimní modul (druhá část uvítací zprávy) zanikl — je to ve videu.
  var TPL = {
    "cs": {
      "first": "Dobrý den, {JMENO},\n\ntady Pavel z Villy Rudolf. Váš pobyt {TERMIN} je potvrzený a už se na vás těšíme.\n\n{NOVINKA}🏠 *Podívejte se, kde budete bydlet*\nDům si můžete projít už teď a v klidu si rozdělit pokoje:\n360° prohlídka: https://villarudolf.com/#interier\nPokoje a lůžka: https://villarudolf.com/#loznice\nVideo: {VIDEO}\n\n🛂 *Doklady*\nStejně jako v každém hotelu se u nás všichni hosté po příjezdu zapisují do knihy hostů, město ji vyžaduje kvůli místnímu poplatku. Vezměte si proto prosím doklady.\n\nVšechno praktické (adresa, kód ke dveřím, Wi-Fi) vám pošlu asi deset dní před příjezdem. Kdybyste se chtěli na cokoliv zeptat už teď nebo se u vás něco měnilo, napište nebo zavolejte, rád poradím.\n\nPavel",
      "cover": "Dobrý den, {JMENO}, tady Pavel z Villy Rudolf. Informace k pobytu jsem vám poslal přes {PLATFORMA}. Kdyby cokoliv, jsem i tady.",
      "welcomeCore": "Dobrý den, {JMENO},\n\nuž se na vás těšíme, {TERMIN} bude Villa Rudolf jen vaše. Posílám všechno důležité v jedné zprávě.\n\n📍 *Adresa a příjezd*\nVilla Rudolf, Luční 519, Svoboda nad Úpou. Parkujete přímo na pozemku u domu. Dům je váš od {CAS} v den příjezdu.\n\n🔑 *Kód ke dveřím*\n*{KOD_DVERI}*, platí od {CAS} v den příjezdu do 10:00 v den odjezdu. Nechte si ho prosím jen ve své skupině.\n\n🎬 *Všechno je ve videu*\n{VIDEO}\n{VIDEO_OBSAH} Pusťte si ho prosím ještě před cestou.\n\n🥾 *Výlety podle počasí*\n{PRUVODCE_LINK}\n\n📶 *Wi-Fi*\nSíť „Rudolf Wi-Fi\", heslo {WIFI_HESLO}.\n\n📝 *Kniha hostů a místní poplatek*\nPo příjezdu se prosím všichni zapište do knihy hostů. QR kód je na lednici a zabere to pár minut. Zapisují se i děti, každý pod svým vlastním dokladem. Městu se platí místní poplatek 25 Kč / 1 € za dospělého od 18 let a noc, děti neplatí.{JAK_SE_PLATI}\n\n🌙 *Večer a noční klid*\nJsme v horském údolí, které nese zvuk daleko, a sousedé tu žijí celý rok. Hudbu proto prosím jen uvnitř domu a po desáté večer venku potichu. Uvnitř si poseďte, jak dlouho chcete.\n\n📞 *Kdyby cokoliv*\nPavel: +420 775 220 785\nNemocnice Trutnov: +420 499 866 111, Maxima Gorkého 77\nTíseň 112 · záchranka 155 · policie 158 · horská služba +420 602 448 338\n\nŠťastnou cestu!\nPavel",
      "videoSummer": "Kde zaparkovat, jak se dostat do domu, sauna, bazén, dřevo a nářadí a krátká prohlídka domu.",
      "videoWinter": "Krátká prohlídka domu, zápis do knihy hostů přes QR kód, sauna a cesta na skibus.",
      "payOnsite": " Zaplatíte ho na místě kartou nebo hotově, částku spočítáme podle zapsaných hostů.",
      "payIncluded": " Máte ho zaplacený v ceně rezervace, nic dalšího se neplatí.",
      "payDeposit": " Podle smlouvy ho vyúčtujeme z kauce.",
      "payEnergy": " Stejně tak elektřinu a plyn podle odečtu při příjezdu a odjezdu.",
      "update": "Dobrý den, {JMENO}, {KDY} se uvidíme. Dům bude připravený a všechno z minulé zprávy platí. Kód ke dveřím je {KOD_DVERI}, od {CAS}. Šťastnou cestu!\nPavel",
      "inDays2": "pozítří",
      "inDays1": "zítra",
      "inDays0": "dnes",
      "deposit": "Dobrý den, {JMENO}, ještě jedna praktická věc k pobytu {TERMIN}. Vybíráme vratnou kauci {KAUCE} Kč — je to jen jistota pro případ škody, po odjezdu a rychlé kontrole domu vám ji obratem vracíme zpět v plné výši. Pošlete ji prosím pohodlně kartou přes Revolut: https://revolut.me/pavelhuqh ({KAUCE} Kč). Díky moc a těšíme se na vás!\nPavel",
      "day2": "Dobrý den, {JMENO}, jen se hlásím po první noci — máte všechno, jak má být? 🙂 Kdyby cokoliv drhlo nebo jste něco nemohli najít, napište mi nebo rovnou zavolejte (+420 775 220 785) — vyřeším to hned. Užívejte hory!\nPavel",
      "predeparture": "Dobrý den, {JMENO}, zítra se budeme loučit — snad vám bylo u Rudolfa dobře! Než vyrazíte, poprosím o pár drobností (dohromady tak 10 minut) — o všechno ostatní se postará úklidová služba:\n\n🍽 nádobí do myčky a zapnout ji\n🗑 odpadky do označených nádob — díky za základní roztřídění\n🛏 povlečení svléknout a spolu s ručníky nechat na určeném místě\n🧺 půjčené vybavení vrátit tam, kde jste ho našli\n🔍 mrknout na zavřená okna a dveře, vypnuté spotřebiče (v létě i zamčený bazén)\n\nDům prosím předejte do 10:00 — v deset nastupuje úklid, aby v 15:00 přebírala další parta dům stejně nachystaný, jako jste ho přebírali vy.\n\nDíky moc, že to s námi dotáhnete do konce. Šťastnou cestu!\nPavel",
      "reviewBody": "Dobrý den, {JMENO}, dnes se loučíme — a moc rádi jsme vás u Rudolfa měli. Snad si z hor odvážíte přesně to, pro co jste jeli.\n\nJen drobná připomínka: dům prosím předejte do 10:00. Nechceme vás vyhánět, slibuju 🙂 — jen v deset nastupuje úklidová služba, aby v 15:00 mohla vítat další hosty.\n\nA pak jedna prosba, která pro nás znamená opravdu hodně. Jsme malý rodinný pronájem a hodnocení jsou to hlavní, podle čeho si Rudolfa najdou další party a rodiny.\n",
      "reviewAirbnb": "\nPokud cítíte, že si zasloužíme plných 5 hvězdiček, budeme moc vděční, když nám je na Airbnb dáte — pomáhá nám to víc, než se zdá. A kdyby cokoliv, byť maličkost, nebylo stoprocentní, napište to prosím rovnou mně sem na WhatsApp — já to totiž můžu napravit, recenze už ne. 🙂\n\nŠťastnou cestu domů — a kdykoli se budete chtít do Krkonoš vrátit, Rudolf i my tu budeme!\nPavel",
      "reviewBooking": "\nPokud cítíte, že si zasloužíme plných 10 z 10, budeme moc vděční, když nám je na Bookingu dáte — pomáhá nám to víc, než se zdá. A kdyby cokoliv, byť maličkost, nebylo stoprocentní, napište to prosím rovnou mně sem na WhatsApp — já to totiž můžu napravit, recenze už ne. 🙂\n\nŠťastnou cestu domů — a kdykoli se budete chtít do Krkonoš vrátit, Rudolf i my tu budeme!\nPavel",
      "reviewGoogle": "\nPokud cítíte, že si zasloužíme plné hodnocení, budeme moc vděční za recenzi na Googlu — pomáhá nám to víc, než se zdá. A kdyby cokoliv, byť maličkost, nebylo stoprocentní, napište to prosím rovnou mně sem na WhatsApp — já to totiž můžu napravit, recenze už ne. 🙂\n\nŠťastnou cestu domů — a kdykoli se budete chtít do Krkonoš vrátit, Rudolf i my tu budeme!\nPavel"
    },
    "en": {
      "first": "Hello {JMENO},\n\nthis is Pavel from Villa Rudolf. Your stay for {TERMIN} is confirmed and we're already looking forward to having you.\n\n{NOVINKA}🏠 *See where you'll be staying*\nYou can walk through the house right now and sort out the rooms at your leisure:\n360° tour: https://villarudolf.com/en/#interier\nRooms and beds: https://villarudolf.com/en/#loznice\nVideo: {VIDEO}\n\n🛂 *Travel documents – for the children too*\nOne practical thing, so nothing catches you out on arrival. As in any hotel, all our guests sign the guest book when they arrive. For guests from abroad we are then required by law to pass the details on to the foreign police. Every accommodation provider in Czechia does this, from a guesthouse to a five-star hotel – there it is usually just handled by reception with your passport in hand. That is why everyone travelling with you needs their own travel document, children included. Children entered in a parent's passport are no longer accepted. If anyone is missing a document, there is still plenty of time to sort it out.\n\nI'll send you everything practical (address, door code, Wi-Fi) about ten days before you arrive. If you'd like to ask anything now, or if something changes on your side, just message or call me – happy to help.\n\nPavel",
      "cover": "Hello {JMENO}, this is Pavel from Villa Rudolf. I've sent you the information about your stay via {PLATFORMA}. If you need anything, you can reach me here too.",
      "welcomeCore": "Hello {JMENO},\n\nwe're looking forward to having you – for {TERMIN}, Villa Rudolf will be all yours. Here's everything important in one message.\n\n📍 *Address and arrival*\nVilla Rudolf, Luční 519, Svoboda nad Úpou. You park right on the property, next to the house. The house is yours from {CAS} on your arrival day.\n\n🔑 *Door code*\n*{KOD_DVERI}*, valid from {CAS} on your arrival day until 10:00 on the day you leave. Please keep it within your group only.\n\n🎬 *It's all in the video*\n{VIDEO}\n{VIDEO_OBSAH} Please watch it before you set off.\n\n🥾 *Trips to suit the weather*\n{PRUVODCE_LINK}\n\n📶 *Wi-Fi*\nNetwork \"Rudolf Wi-Fi\", password {WIFI_HESLO}.\n\n📝 *Guest book and local fee*\nAfter you arrive, please all sign the guest book. The QR code is on the fridge and it takes a few minutes. Children are entered too, each with their own document. The town charges a local fee of 25 Kč / 1 € per adult aged 18 or over per night; children don't pay.{JAK_SE_PLATI}\n\n🌙 *Evenings and quiet hours*\nWe're in a mountain valley that carries sound a long way, and the neighbours live here all year round. So please keep music inside the house only, and be quiet outdoors after ten in the evening. Inside, sit up as long as you like.\n\n📞 *If you need anything*\nPavel: +420 775 220 785\nTrutnov Hospital: +420 499 866 111, Maxima Gorkého 77\nEmergency 112 · ambulance 155 · police 158 · mountain rescue +420 602 448 338\n\nSafe travels!\nPavel",
      "videoSummer": "Where to park, how to get into the house, the sauna, the pool, firewood and tools, and a short tour of the house.",
      "videoWinter": "A short tour of the house, signing the guest book via the QR code, the sauna and the way to the ski bus.",
      "payOnsite": " You pay it on the spot by card or in cash; we work out the amount from the guests entered.",
      "payIncluded": " It's already included in the price of your booking, so there's nothing more to pay.",
      "payDeposit": " As set out in the contract, we settle it from your deposit.",
      "payEnergy": " The same goes for electricity and gas, by the meter readings on arrival and departure.",
      "update": "Hello {JMENO}, see you {KDY}. The house will be ready and everything in my last message still applies. Your door code is {KOD_DVERI}, valid from {CAS}. Safe travels!\nPavel",
      "inDays2": "the day after tomorrow",
      "inDays1": "tomorrow",
      "inDays0": "today",
      "deposit": "Hello {JMENO}, one more practical thing about your stay {TERMIN}. We collect a refundable security deposit of {KAUCE} CZK — it is simply a safeguard in case of damage; after your departure and a quick check of the house, we return it to you in full right away. The easiest way to send it is by card via Revolut: https://revolut.me/pavelhuqh ({KAUCE} CZK). Thank you so much — we're looking forward to having you!\nPavel",
      "day2": "Hello {JMENO}, just checking in after your first night — is everything just as it should be? 🙂 If anything's not quite right or you can't find something, message me or simply call (+420 775 220 785) — I'll sort it out straight away. Enjoy the mountains!\nPavel",
      "predeparture": "Hello {JMENO}, tomorrow it's time to say goodbye — we hope you've felt at home at Rudolf's! Before you set off, could I ask for a few small things (about 10 minutes all together)? The cleaning team will take care of everything else:\n\n🍽 dishes into the dishwasher and switch it on\n🗑 rubbish into the marked bins — thanks for a bit of basic sorting\n🛏 strip the bed linen and leave it, together with the towels, in the designated spot\n🧺 return any borrowed equipment to where you found it\n🔍 a quick check that windows and doors are closed and appliances switched off (and in summer, the pool locked)\n\nPlease hand the house over by 10:00 — the cleaners start at ten, so that at 15:00 the next group can take over the house just as ready as you found it.\n\nThank you so much for seeing it through with us. Safe travels!\nPavel",
      "reviewBody": "Hello {JMENO}, today we say goodbye — and we've truly loved having you at Rudolf's. We hope you're taking home from the mountains exactly what you came for.\n\nJust a gentle reminder: please hand the house over by 10:00. We're not chasing you out, I promise 🙂 — it's just that the cleaning team arrives at ten so they can welcome the next guests at 15:00.\n\nAnd then one request that means a great deal to us. We're a small family-run rental, and reviews are the main way new groups and families find Rudolf.\n",
      "reviewAirbnb": "\nIf you feel we've earned the full 5 stars, we'd be so grateful if you gave them to us on Airbnb — it helps us more than you might think. And if anything at all, even the smallest thing, wasn't quite one hundred percent, please write it straight to me here on WhatsApp — because that I can put right; a review, I can't. 🙂\n\nSafe travels home — and whenever you feel like coming back to the Krkonoše, Rudolf will be here, and so will we!\nPavel",
      "reviewBooking": "\nIf you feel we've earned the full 10 out of 10, we'd be so grateful if you gave it to us on Booking — it helps us more than you might think. And if anything at all, even the smallest thing, wasn't quite one hundred percent, please write it straight to me here on WhatsApp — because that I can put right; a review, I can't. 🙂\n\nSafe travels home — and whenever you feel like coming back to the Krkonoše, Rudolf will be here, and so will we!\nPavel",
      "reviewGoogle": "\nIf you feel we've earned the full rating, we'd be so grateful for a review on Google — it helps us more than you might think. And if anything at all, even the smallest thing, wasn't quite one hundred percent, please write it straight to me here on WhatsApp — because that I can put right; a review, I can't. 🙂\n\nSafe travels home — and whenever you feel like coming back to the Krkonoše, Rudolf will be here, and so will we!\nPavel"
    },
    "de": {
      "first": "Guten Tag, {JMENO},\n\nhier ist Pavel von der Villa Rudolf. Ihr Aufenthalt {TERMIN} ist bestätigt und wir freuen uns schon auf Sie.\n\n{NOVINKA}🏠 *Schauen Sie sich an, wo Sie wohnen werden*\nSie können das Haus schon jetzt erkunden und in Ruhe die Zimmer aufteilen:\n360°-Rundgang: https://villarudolf.com/de/#interier\nZimmer und Betten: https://villarudolf.com/de/#loznice\nVideo: {VIDEO}\n\n🛂 *Ausweise – auch für die Kinder*\nEine praktische Sache, damit Sie bei der Anreise nichts überrascht. Wie in jedem Hotel tragen sich bei uns alle Gäste nach der Ankunft ins Gästebuch ein. Die Angaben der Gäste aus dem Ausland leiten wir dann, wie gesetzlich vorgeschrieben, an die Fremdenpolizei weiter. Das macht jeder Gastgeber in Tschechien, von der Pension bis zum Fünf-Sterne-Hotel, nur erledigt es dort meist die Rezeption mit Ihrem Pass in der Hand. Deshalb braucht jeder, der mit Ihnen anreist, ein eigenes Reisedokument, auch die Kinder. Ein Eintrag der Kinder im Pass der Eltern gilt heute nicht mehr. Sollte jemandem ein Ausweis fehlen, ist jetzt noch genug Zeit, ihn in Ruhe zu beantragen.\n\nAlles Praktische (Adresse, Türcode, WLAN) schicke ich Ihnen etwa zehn Tage vor der Anreise. Wenn Sie schon jetzt etwas fragen möchten oder sich bei Ihnen etwas ändert, schreiben Sie mir oder rufen Sie an, ich helfe gern.\n\nPavel",
      "cover": "Guten Tag, {JMENO}, hier ist Pavel von der Villa Rudolf. Die Informationen zu Ihrem Aufenthalt habe ich Ihnen über {PLATFORMA} geschickt. Falls irgendetwas ist, bin ich auch hier erreichbar.",
      "welcomeCore": "Guten Tag, {JMENO},\n\nwir freuen uns schon auf Sie, {TERMIN} gehört die Villa Rudolf nur Ihnen. Hier kommt alles Wichtige in einer Nachricht.\n\n📍 *Adresse und Anreise*\nVilla Rudolf, Luční 519, Svoboda nad Úpou. Geparkt wird direkt auf dem Grundstück am Haus. Das Haus gehört Ihnen ab {CAS} Uhr am Anreisetag.\n\n🔑 *Türcode*\n*{KOD_DVERI}*, gültig ab {CAS} Uhr am Anreisetag bis 10:00 Uhr am Abreisetag. Bitte behalten Sie ihn nur innerhalb Ihrer Gruppe.\n\n🎬 *Alles im Video*\n{VIDEO}\n{VIDEO_OBSAH} Schauen Sie es sich bitte noch vor der Anreise an.\n\n🥾 *Ausflüge je nach Wetter*\n{PRUVODCE_LINK}\n\n📶 *WLAN*\nNetz „Rudolf Wi-Fi\", Passwort {WIFI_HESLO}.\n\n📝 *Gästebuch und Kurtaxe*\nBitte tragen Sie sich nach der Ankunft alle ins Gästebuch ein. Der QR-Code hängt am Kühlschrank, es dauert nur ein paar Minuten. Auch die Kinder werden eingetragen, jeder mit seinem eigenen Ausweis. An die Stadt geht eine Kurtaxe von 25 Kč / 1 € pro Erwachsenen ab 18 Jahren und Nacht, Kinder zahlen nichts.{JAK_SE_PLATI}\n\n🌙 *Abend und Nachtruhe*\nWir liegen in einem Bergtal, das den Schall weit trägt, und die Nachbarn wohnen hier das ganze Jahr. Musik deshalb bitte nur im Haus, und nach zehn Uhr abends draußen bitte leise. Drinnen können Sie zusammensitzen, so lange Sie möchten.\n\n📞 *Falls irgendetwas ist*\nPavel: +420 775 220 785\nKrankenhaus Trutnov: +420 499 866 111, Maxima Gorkého 77\nNotruf 112 · Rettungsdienst 155 · Polizei 158 · Bergwacht +420 602 448 338\n\nGute Reise!\nPavel",
      "videoSummer": "Wo Sie parken, wie Sie ins Haus kommen, Sauna, Pool, Holz und Werkzeug und ein kurzer Rundgang durchs Haus.",
      "videoWinter": "Ein kurzer Rundgang durchs Haus, der Eintrag ins Gästebuch per QR-Code, die Sauna und der Weg zum Skibus.",
      "payOnsite": " Sie zahlen sie vor Ort per Karte oder bar, den Betrag berechnen wir nach den eingetragenen Gästen.",
      "payIncluded": " Sie ist bereits im Buchungspreis enthalten, es ist nichts weiter zu zahlen.",
      "payDeposit": " Laut Vertrag verrechnen wir sie mit der Kaution.",
      "payEnergy": " Ebenso Strom und Gas nach dem Zählerstand bei An- und Abreise.",
      "update": "Guten Tag, {JMENO}, {KDY} sehen wir uns. Das Haus wird bereit sein und alles aus meiner letzten Nachricht gilt weiterhin. Der Türcode ist {KOD_DVERI}, gültig ab {CAS} Uhr. Gute Reise!\nPavel",
      "inDays2": "übermorgen",
      "inDays1": "morgen",
      "inDays0": "heute",
      "deposit": "Guten Tag, {JMENO}, noch eine praktische Sache zu Ihrem Aufenthalt {TERMIN}. Wir erheben eine rückzahlbare Kaution von {KAUCE} CZK — sie ist lediglich eine Sicherheit für den Fall eines Schadens; nach Ihrer Abreise und einer kurzen Kontrolle des Hauses erhalten Sie sie umgehend in voller Höhe zurück. Am einfachsten senden Sie sie per Karte über Revolut: https://revolut.me/pavelhuqh ({KAUCE} CZK). Vielen Dank — wir freuen uns auf Sie!\nPavel",
      "day2": "Guten Tag, {JMENO}, ich melde mich kurz nach der ersten Nacht — ist alles so, wie es sein soll? 🙂 Falls irgendetwas hakt oder Sie etwas nicht finden konnten, schreiben Sie mir oder rufen Sie einfach direkt an (+420 775 220 785) — ich kümmere mich sofort darum. Genießen Sie die Berge!\nPavel",
      "predeparture": "Guten Tag, {JMENO}, morgen heißt es Abschied nehmen — hoffentlich haben Sie sich bei Rudolf wohlgefühlt! Bevor Sie aufbrechen, bitte ich Sie noch um ein paar Kleinigkeiten (insgesamt etwa 10 Minuten) — um alles andere kümmert sich der Reinigungsservice:\n\n🍽 Geschirr in die Spülmaschine räumen und sie einschalten\n🗑 Müll in die gekennzeichneten Behälter bringen — danke fürs grobe Vorsortieren\n🛏 Bettwäsche abziehen und zusammen mit den Handtüchern am vorgesehenen Platz ablegen\n🧺 ausgeliehene Ausstattung dorthin zurücklegen, wo Sie sie gefunden haben\n🔍 kurz prüfen: Fenster und Türen geschlossen, Geräte ausgeschaltet (im Sommer auch der Pool abgeschlossen)\n\nÜbergeben Sie das Haus bitte bis 10:00 Uhr — um zehn beginnt die Reinigung, damit die nächste Gruppe das Haus um 15:00 Uhr genauso vorbereitet übernimmt, wie Sie es übernommen haben.\n\nVielen Dank, dass Sie das mit uns gemeinsam zu Ende bringen. Gute Reise!\nPavel",
      "reviewBody": "Guten Tag, {JMENO}, heute heißt es Abschied nehmen — und wir hatten Sie sehr gerne bei Rudolf zu Gast. Hoffentlich nehmen Sie aus den Bergen genau das mit, wofür Sie gekommen sind.\n\nNur eine kleine Erinnerung: Übergeben Sie das Haus bitte bis 10:00 Uhr. Wir wollen Sie nicht hinausdrängen, versprochen 🙂 — nur beginnt um zehn der Reinigungsservice, damit um 15:00 Uhr schon die nächsten Gäste begrüßt werden können.\n\nUnd dann noch eine Bitte, die uns wirklich viel bedeutet. Wir sind eine kleine Familienvermietung, und die Bewertungen sind das Wichtigste, wodurch andere Gruppen und Familien Rudolf finden.\n",
      "reviewAirbnb": "\nWenn Sie das Gefühl haben, dass wir die vollen 5 Sterne verdienen, wären wir sehr dankbar, wenn Sie sie uns auf Airbnb geben — das hilft uns mehr, als man denkt. Und sollte irgendetwas, und sei es nur eine Kleinigkeit, nicht hundertprozentig gewesen sein, schreiben Sie es bitte direkt mir hier auf WhatsApp — denn ich kann es noch in Ordnung bringen, eine Bewertung nicht mehr. 🙂\n\nGute Heimreise — und wann immer Sie ins Riesengebirge zurückkehren möchten: Rudolf und wir sind für Sie da!\nPavel",
      "reviewBooking": "\nWenn Sie das Gefühl haben, dass wir die vollen 10 von 10 verdienen, wären wir sehr dankbar, wenn Sie sie uns auf Booking geben — das hilft uns mehr, als man denkt. Und sollte irgendetwas, und sei es nur eine Kleinigkeit, nicht hundertprozentig gewesen sein, schreiben Sie es bitte direkt mir hier auf WhatsApp — denn ich kann es noch in Ordnung bringen, eine Bewertung nicht mehr. 🙂\n\nGute Heimreise — und wann immer Sie ins Riesengebirge zurückkehren möchten: Rudolf und wir sind für Sie da!\nPavel",
      "reviewGoogle": "\nWenn Sie das Gefühl haben, dass wir die volle Bewertung verdienen, wären wir für eine Rezension auf Google sehr dankbar — das hilft uns mehr, als man denkt. Und sollte irgendetwas, und sei es nur eine Kleinigkeit, nicht hundertprozentig gewesen sein, schreiben Sie es bitte direkt mir hier auf WhatsApp — denn ich kann es noch in Ordnung bringen, eine Bewertung nicht mehr. 🙂\n\nGute Heimreise — und wann immer Sie ins Riesengebirge zurückkehren möchten: Rudolf und wir sind für Sie da!\nPavel"
    },
    "pl": {
      "first": "Dzień dobry, {JMENO},\n\ntu Pavel z Villa Rudolf. Państwa pobyt w terminie {TERMIN} jest potwierdzony i już na Państwa czekamy.\n\n{NOVINKA}🏠 *Proszę zobaczyć, gdzie będą Państwo mieszkać*\nDom można obejrzeć już teraz i spokojnie podzielić pokoje:\nSpacer 360°: https://villarudolf.com/pl/#interier\nPokoje i łóżka: https://villarudolf.com/pl/#loznice\nFilm: {VIDEO}\n\n🛂 *Dokumenty – także dla dzieci*\nJedna praktyczna sprawa, żeby przy przyjeździe nic Państwa nie zaskoczyło. Tak jak w każdym hotelu, wszyscy goście po przyjeździe wpisują się u nas do księgi gości. Dane gości z zagranicy przekazujemy następnie, zgodnie z prawem, policji ds. cudzoziemców. Robi to każdy obiekt noclegowy w Czechach, od pensjonatu po pięciogwiazdkowy hotel, tylko tam zwykle załatwia to recepcja z Państwa paszportem w ręku. Dlatego każdy, kto z Państwem przyjedzie, potrzebuje własnego dokumentu podróży, także dzieci. Wpis dziecka w paszporcie rodzica nie jest już ważny. Gdyby komuś brakowało dokumentu, jest teraz dość czasu, żeby go spokojnie wyrobić.\n\nWszystko, co praktyczne (adres, kod do drzwi, Wi-Fi), wyślę około dziesięciu dni przed przyjazdem. Gdyby chcieli Państwo o coś zapytać już teraz albo gdyby coś się u Państwa zmieniało, proszę napisać lub zadzwonić, chętnie pomogę.\n\nPavel",
      "cover": "Dzień dobry, {JMENO}, tu Pavel z Villa Rudolf. Informacje dotyczące pobytu wysłałem Państwu przez {PLATFORMA}. Gdyby cokolwiek, jestem także tutaj.",
      "welcomeCore": "Dzień dobry, {JMENO},\n\njuż na Państwa czekamy, w terminie {TERMIN} Villa Rudolf będzie tylko dla Państwa. Przesyłam wszystko, co ważne, w jednej wiadomości.\n\n📍 *Adres i przyjazd*\nVilla Rudolf, Luční 519, Svoboda nad Úpou. Parkują Państwo bezpośrednio na posesji przy domu. Dom jest Państwa od {CAS} w dniu przyjazdu.\n\n🔑 *Kod do drzwi*\n*{KOD_DVERI}*, działa od {CAS} w dniu przyjazdu do 10:00 w dniu wyjazdu. Prosimy zachować go wyłącznie w swojej grupie.\n\n🎬 *Wszystko jest na filmie*\n{VIDEO}\n{VIDEO_OBSAH} Prosimy obejrzeć go jeszcze przed podróżą.\n\n🥾 *Wycieczki według pogody*\n{PRUVODCE_LINK}\n\n📶 *Wi-Fi*\nSieć „Rudolf Wi-Fi\", hasło {WIFI_HESLO}.\n\n📝 *Księga gości i opłata miejscowa*\nPo przyjeździe prosimy, aby wszyscy wpisali się do księgi gości. Kod QR jest na lodówce, zajmie to kilka minut. Wpisuje się także dzieci, każde na podstawie własnego dokumentu. Miastu płaci się opłatę miejscową 25 Kč / 1 € od osoby dorosłej od 18 lat za noc, dzieci nie płacą.{JAK_SE_PLATI}\n\n🌙 *Wieczór i cisza nocna*\nJesteśmy w górskiej dolinie, która niesie dźwięk daleko, a sąsiedzi mieszkają tu cały rok. Dlatego prosimy o muzykę tylko wewnątrz domu, a po dziesiątej wieczorem o ciszę na zewnątrz. W środku mogą Państwo posiedzieć, jak długo zechcą.\n\n📞 *Gdyby cokolwiek*\nPavel: +420 775 220 785\nSzpital Trutnov: +420 499 866 111, Maxima Gorkého 77\nNumer alarmowy 112 · pogotowie 155 · policja 158 · pogotowie górskie +420 602 448 338\n\nSzczęśliwej podróży!\nPavel",
      "videoSummer": "Gdzie zaparkować, jak wejść do domu, sauna, basen, drewno i narzędzia oraz krótki spacer po domu.",
      "videoWinter": "Krótki spacer po domu, wpis do księgi gości przez kod QR, sauna i droga na skibus.",
      "payOnsite": " Zapłacą ją Państwo na miejscu kartą lub gotówką, kwotę wyliczymy według wpisanych gości.",
      "payIncluded": " Jest już opłacona w cenie rezerwacji, nic więcej się nie płaci.",
      "payDeposit": " Zgodnie z umową rozliczymy ją z kaucji.",
      "payEnergy": " Tak samo prąd i gaz według odczytu liczników przy przyjeździe i wyjeździe.",
      "update": "Dzień dobry, {JMENO}, {KDY} się widzimy. Dom będzie gotowy i wszystko z poprzedniej wiadomości jest aktualne. Kod do drzwi to {KOD_DVERI}, działa od {CAS}. Szczęśliwej podróży!\nPavel",
      "inDays2": "pojutrze",
      "inDays1": "jutro",
      "inDays0": "dziś",
      "deposit": "Dzień dobry, {JMENO}, jeszcze jedna praktyczna sprawa dotycząca pobytu {TERMIN}. Pobieramy zwrotną kaucję {KAUCE} CZK — to wyłącznie zabezpieczenie na wypadek szkody; po wyjeździe i szybkim sprawdzeniu domu od razu zwracamy ją Państwu w całości. Najwygodniej przesłać ją kartą przez Revolut: https://revolut.me/pavelhuqh ({KAUCE} CZK). Bardzo dziękujemy — czekamy na Państwa!\nPavel",
      "day2": "Dzień dobry, {JMENO}, melduję się po pierwszej nocy — czy wszystko jest tak, jak powinno być? 🙂 Gdyby coś nie działało albo nie mogli Państwo czegoś znaleźć, proszę do mnie napisać lub od razu zadzwonić (+420 775 220 785) — załatwię to od ręki. Miłych chwil w górach!\nPavel",
      "predeparture": "Dzień dobry, {JMENO}, jutro będziemy się żegnać — mamy nadzieję, że było Państwu u Rudolfa dobrze! Zanim Państwo wyruszą, poproszę o kilka drobiazgów (razem jakieś 10 minut) — o całą resztę zadba serwis sprzątający:\n\n🍽 naczynia włożyć do zmywarki i ją włączyć\n🗑 śmieci do oznaczonych pojemników — dziękujemy za podstawową segregację\n🛏 pościel zdjąć i razem z ręcznikami zostawić w wyznaczonym miejscu\n🧺 wypożyczony sprzęt odłożyć tam, gdzie go Państwo znaleźli\n🔍 rzucić okiem, czy okna i drzwi są zamknięte, a urządzenia wyłączone (latem także czy basen jest zamknięty na klucz)\n\nDom prosimy przekazać do 10:00 — o dziesiątej wchodzi ekipa sprzątająca, żeby o 15:00 kolejna grupa mogła przejąć dom tak samo przygotowany, jak przejmowali go Państwo.\n\nBardzo dziękujemy, że doprowadzą to Państwo z nami do końca. Szczęśliwej podróży!\nPavel",
      "reviewBody": "Dzień dobry, {JMENO}, dziś się żegnamy — i bardzo się cieszymy, że mogliśmy gościć Państwa u Rudolfa. Mamy nadzieję, że wywożą Państwo z gór dokładnie to, po co Państwo przyjechali.\n\nTylko drobne przypomnienie: dom prosimy przekazać do 10:00. Nie chcemy Państwa wyganiać, obiecuję 🙂 — po prostu o dziesiątej wchodzi serwis sprzątający, żeby o 15:00 móc powitać kolejnych gości.\n\nA potem jedna prośba, która znaczy dla nas naprawdę wiele. Jesteśmy małym rodzinnym obiektem i opinie to główna rzecz, dzięki której Rudolfa znajdują kolejne grupy i rodziny.\n",
      "reviewAirbnb": "\nJeśli czują Państwo, że zasłużyliśmy na pełne 5 gwiazdek, będziemy bardzo wdzięczni za ich przyznanie na Airbnb — pomaga nam to bardziej, niż się wydaje. A gdyby cokolwiek, choćby drobiazg, nie było w stu procentach w porządku, proszę napisać o tym od razu do mnie, tutaj na WhatsAppie — bo ja mogę to naprawić, recenzja już nie. 🙂\n\nSzczęśliwej drogi do domu — a kiedy tylko zechcą Państwo wrócić w Karkonosze, Rudolf i my będziemy tu na Państwa czekać!\nPavel",
      "reviewBooking": "\nJeśli czują Państwo, że zasłużyliśmy na pełne 10 na 10, będziemy bardzo wdzięczni za ich przyznanie na Bookingu — pomaga nam to bardziej, niż się wydaje. A gdyby cokolwiek, choćby drobiazg, nie było w stu procentach w porządku, proszę napisać o tym od razu do mnie, tutaj na WhatsAppie — bo ja mogę to naprawić, recenzja już nie. 🙂\n\nSzczęśliwej drogi do domu — a kiedy tylko zechcą Państwo wrócić w Karkonosze, Rudolf i my będziemy tu na Państwa czekać!\nPavel",
      "reviewGoogle": "\nJeśli czują Państwo, że zasłużyliśmy na pełną ocenę, będziemy bardzo wdzięczni za opinię w Google — pomaga nam to bardziej, niż się wydaje. A gdyby cokolwiek, choćby drobiazg, nie było w stu procentach w porządku, proszę napisać o tym od razu do mnie, tutaj na WhatsAppie — bo ja mogę to naprawić, recenzja już nie. 🙂\n\nSzczęśliwej drogi do domu — a kiedy tylko zechcą Państwo wrócić w Karkonosze, Rudolf i my będziemy tu na Państwa czekać!\nPavel"
    }
  };
  // Jazyk zprávy = jazyk pobytu; chybí-li, anglicky (Pavlovo pravidlo).
  function msgLang(b) { return (b && b.lang && TPL[b.lang]) ? b.lang : 'en'; }
  function tplFor(lang, key) { return (TPL[lang] || TPL.en)[key]; }
  function reviewVariant(platform, lang) {
    var T = TPL[lang] || TPL.en;
    var p = (platform || '').toLowerCase();
    if (p.indexOf('airbnb') >= 0) return { label: 'Airbnb (5★)', text: T.reviewBody + T.reviewAirbnb };
    if (p.indexOf('booking') >= 0) return { label: 'Booking (10/10)', text: T.reviewBody + T.reviewBooking };
    return { label: 'Google', text: T.reviewBody + T.reviewGoogle };
  }

  // Novinka do první ozvěny. JEDNA konstanta: za rok stačí vyměnit text a data od–do.
  // Odstavec dostane jen host, jehož PŘÍJEZD padne do období (schodiště se dělá
  // 2. 11.–18. 12. 2026, první hosté ho uvidí 19. 12.). Mimo období se vynechá celý.
  // Text říká „teď dům dáváme dohromady" — až bude hotovo, přepiš ho do minulého času.
  var NEWS = {
    from: '2026-12-19', to: '2027-12-31',
    text: {
      cs: 'Mimo sezónu teď dům dáváme dohromady, aby byl ještě lepší než dosud. Největší novinka je nově upravené schodiště, bude to opravdu pěkné.',
      en: "We're using the off-season to get the house into even better shape. The biggest change is the newly redone staircase – it's going to look really good.",
      de: 'In der Nebensaison bringen wir das Haus gerade auf Vordermann, damit es noch schöner wird. Die größte Neuerung ist die neu gestaltete Treppe, das wird richtig schön.',
      pl: 'Poza sezonem doprowadzamy dom do jeszcze lepszego stanu. Największa nowość to odnowione schody – będzie naprawdę ładnie.'
    }
  };
  function newsFor(b, lang) {
    return (b.arrival >= NEWS.from && b.arrival <= NEWS.to) ? (NEWS.text[lang] || NEWS.text.en) : '';
  }

  // Video k domu podle sezóny příjezdu (isWinter). Letní = průvodce domem, zahradou,
  // bazénem a saunou; zimní = prohlídka domu, zápis přes QR, sauna a skibus.
  var VIDEO = { summer: 'https://www.youtube.com/watch?v=ksVpDr-P8ic', winter: 'https://youtu.be/tWCuuovnh2U' };

  function fill(tpl, ctx) {
    return tpl
      .replace(/\{NOVINKA\}/g, ctx.novinka ? ctx.novinka + '\n\n' : '')
      .replace(/\{JAK_SE_PLATI\}/g, ctx.jakSePlati || '')
      .replace(/\{VIDEO_OBSAH\}/g, ctx.videoObsah)
      .replace(/\{VIDEO\}/g, ctx.video)
      .replace(/\{JMENO\}/g, ctx.jmeno)
      .replace(/\{TERMIN\}/g, ctx.termin)
      .replace(/\{CAS\}/g, ctx.cas)
      .replace(/\{KDY\}/g, ctx.kdy)
      .replace(/\{PLATFORMA\}/g, ctx.platforma)
      .replace(/\{KOD_DVERI\}/g, ctx.kod)
      // callback, ne řetězec: heslo obsahující $& nebo $$ by replace jinak rozepsal
      .replace(/\{WIFI_HESLO\}/g, function () { return wifiPassword() || '{WIFI_HESLO}'; })
      .replace(/\{KAUCE\}/g, DEPOSIT_CZK.toLocaleString('cs-CZ'))
      .replace(/\{PRUVODCE_LINK\}/g, ctx.guideLink || '{PRUVODCE_LINK}');
  }
  // Text pro platformu (Airbnb, Booking…): stejný obsah bez WhatsApp hvězdiček (*tučně*).
  function plainText(t) { return String(t || '').replace(/\*([^*\n]+)\*/g, '$1'); }

  /* ============ Sekvence (timeline) ============ */
  // offsetFrom: 'arrival' | 'departure' ; offset ve dnech.
  // asap = krok bez data: je na řadě hned, jak má pobyt hosta s telefonem, a přestává
  // dávat smysl FIRST_MIN_DAYS před příjezdem (pak už jde rovnou uvítací zpráva).
  // legacy = starý klíč ve vr_msglog, který krok taky splní (pobyt, kde už odešlo
  // původní „Potvrzení rezervace", první ozvěnu znovu nedostane). Staré záznamy
  // „registration" a „doorcode" v logu zůstávají, jen už k nim žádný krok není.
  var FIRST_MIN_DAYS = 14;
  var SEQUENCE = [
    { key: 'first', title: 'První ozvěna', asap: true, when: 'hned', legacy: 'confirm' },
    { key: 'welcome', title: 'Uvítací zpráva (adresa, kód, video, Wi-Fi)', from: 'arrival', off: -10, when: 'T−10' },
    { key: 'update', title: 'Update před příjezdem', from: 'arrival', off: -2, when: 'T−2' },
    { key: 'day2', title: 'Kontrola po první noci', from: 'arrival', off: 1, when: 'den 2' },
    { key: 'predeparture', title: 'Prosby před odjezdem', from: 'departure', off: -1, when: 'odjezd −24 h' },
    { key: 'review', title: 'Poděkování + recenze', from: 'departure', off: 0, when: 'ráno odjezdu' }
  ];
  // Volitelné kroky kauce (zapínají se přepínačem v detailu; stav v vr_msglog
  // pod klíčem 'deposit_enabled'). deposit_charge = zpráva hostovi (Revolut),
  // deposit_return = jen připomínka majiteli po odjezdu (bez zprávy hostovi).
  var DEPOSIT_STEPS = [
    { key: 'deposit_charge', title: 'Kauce — výběr (' + DEPOSIT_CZK.toLocaleString('cs-CZ') + ' Kč)', from: 'arrival', off: -7, when: 'T−7 / samostatně', deposit: 'charge', after: 'welcome' },
    { key: 'deposit_return', title: 'Vrátit kauci (' + DEPOSIT_CZK.toLocaleString('cs-CZ') + ' Kč)', from: 'departure', off: 1, when: 'po odjezdu', deposit: 'return', ownerTask: true, after: 'review' }
  ];
  function depositEnabled(b) {
    return (b.msglog || []).some(function (m) { return m.msg_key === 'deposit_enabled'; });
  }
  // Doplatková faktura u přímých rezervací placených na dvě splátky.
  // Storno ve smlouvě (§ 7) přeskočí 50 % na 59. dni před příjezdem — druhá
  // splátka musí být na účtu dřív, jinak držíme míň, než na kolik máme nárok.
  // Splatnost dáváme na T−65, upomínka tedy týden před ní: T−72. Jen pro majitele,
  // hostovi odsud nic nechodí (fakturu vystavuje Pavel v iDokladu).
  var BALANCE_STEPS = [
    { key: 'balance_invoice', title: 'Vystavit doplatkovou fakturu (2. splátka)', from: 'arrival', off: -72, when: 'T−72 · týden před splatností', ownerTask: true, before: 'first' }
  ];
  // Platformy si platbu řeší samy; dvě splátky dává jen přímá rezervace.
  function balanceEnabled(b) { return isDirect(b); }
  // Efektivní sekvence pro daný pobyt: základ + (volitelně) kroky kauce
  // a doplatkové faktury vložené za příslušné kotvy. Klíč 'deposit_enabled'
  // NENÍ zpráva → do sekvence nepatří.
  function sequenceFor(b) {
    var dep = depositEnabled(b), bal = balanceEnabled(b);
    if (!dep && !bal) return SEQUENCE.slice();
    var out = [];
    SEQUENCE.forEach(function (msg) {
      // balance_invoice je T−72, tedy dřív než cokoliv v SEQUENCE → vkládá se PŘED kotvu
      if (bal) BALANCE_STEPS.forEach(function (x) { if (x.before === msg.key) out.push(x); });
      out.push(msg);
      if (dep) DEPOSIT_STEPS.forEach(function (d) { if (d.after === msg.key) out.push(d); });
    });
    return out;
  }
  function schedDate(msg, b) {
    if (msg.asap) return isoToday();
    return addDaysISO(msg.from === 'departure' ? b.departure : b.arrival, msg.off);
  }
  // Co je ve vr_msglog: { klíč: sent_at }. Starý klíč kroku (legacy) se počítá taky.
  function sentMap(b) {
    var sent = {};
    (b.msglog || []).forEach(function (m) { sent[m.msg_key] = m.sent_at || true; });
    SEQUENCE.forEach(function (msg) { if (msg.legacy && sent[msg.legacy] && !sent[msg.key]) sent[msg.key] = sent[msg.legacy]; });
    return sent;
  }
  function hasLog(b, key) { return (b.msglog || []).some(function (m) { return m.msg_key === key; }); }
  // Poslední den, kdy má krok ještě smysl. Krok před příjezdem po příjezdu nikdo
  // nepošle (ani doplatkovou fakturu nevystaví), kontrola po první noci po třech dnech
  // taky ne. Úkol majitele PO odjezdu (vratka kauce) nezastarává — tam jde o peníze.
  function lastUsefulDay(msg, b) {
    if (msg.from === 'departure') return addDaysISO(b.departure, msg.off < 0 ? -1 : 3);
    return msg.off < 0 ? b.arrival : addDaysISO(b.arrival, msg.off + 2);
  }
  // Stav kroku: 'sent' | 'future' | 'due' (dnes) | 'overdue' (po termínu, ale ještě
  // má smysl) | 'stale' (už nemá smysl — NENÍ to dluh, viz „Označit starší").
  function stepState(msg, b, sent, today) {
    if (sent[msg.key]) return 'sent';
    if (msg.asap) return daysBetween(today, b.arrival) > FIRST_MIN_DAYS ? 'due' : 'stale';
    var d = schedDate(msg, b);
    if (d > today) return 'future';
    if (!(msg.ownerTask && msg.from === 'departure') && today > lastUsefulDay(msg, b)) return 'stale';
    return d < today ? 'overdue' : 'due';
  }
  // Vrátí části zprávy. Od 13. 10. 2026 má každý krok jednu část (sezónní modul
  // uvítací zprávy zanikl); pole zůstává, ať se volající nemusí měnit.
  function buildParts(msg, ctx, booking) {
    var L = msgLang(booking);
    if (msg.key === 'welcome') {
      // Nese odkaz /pruvodce/?t=, kód ke dveřím a heslo Wi-Fi — dokud něco z toho
      // chybí, neodesílá se (v textu by zůstala {ZÁSTUPKA}).
      return [{ text: fill(tplFor(L, 'welcomeCore'), ctx),
        needsToken: !ctx.guideLink, needsCode: !doorCodeFor(booking), needsWifi: !wifiPassword() }];
    }
    if (msg.key === 'update') return [{ text: fill(tplFor(L, 'update'), ctx), needsCode: !doorCodeFor(booking) }];
    if (msg.key === 'first') return [{ text: fill(tplFor(L, 'first'), ctx) }];
    if (msg.key === 'day2') return [{ text: fill(tplFor(L, 'day2'), ctx) }];
    if (msg.key === 'deposit_charge') return [{ text: fill(tplFor(L, 'deposit'), ctx) }];
    if (msg.key === 'deposit_return') return [{ text: '', ownerTask: true }];
    if (msg.key === 'balance_invoice') return [{ text: '', ownerTask: true }];
    if (msg.key === 'predeparture') return [{ text: fill(tplFor(L, 'predeparture'), ctx) }];
    if (msg.key === 'review') {
      var rv = reviewVariant(booking.platform, L);
      return [{ text: fill(rv.text, ctx), variantLabel: rv.label }];
    }
    return [{ text: '' }];
  }
  // Hosté z platforem dostávají celý text přes platformu (záznam je tam pojistka při
  // škodě) a na WhatsApp jen krátkou průvodní zprávu. Průvodní má smysl u prvních dvou
  // zpráv; pozdější krátké zprávy jdou WhatsAppem celé. „Přímá" má jen WhatsApp.
  function isPlatform(b) { var p = (b.platform || '').trim(); return !!p && p !== 'Přímá'; }
  function hasCover(msg, b) { return isPlatform(b) && (msg.key === 'first' || msg.key === 'welcome'); }
  function coverText(ctx, b) { return fill(tplFor(msgLang(b), 'cover'), ctx); }

  /* ============ Kontext pobytu ============ */
  function guestName(b) {
    var parts = [b.first_name, b.last_name].filter(function (x) { return x && String(x).trim(); });
    return parts.length ? parts.join(' ') : 'milí hosté';
  }
  // Je počet dospělých opravdu vyplněný? Databáze prázdné pole sama doplní dvojkou
  // (coalesce(p_adults, 2)), takže „2 dospělí, žádné dítě" je podpis NEVYPLNĚNÉHO
  // pobytu — 10. 10. 2026 kvůli tomu zpráva tvrdila „pro vás dva… 350 Kč" skupině
  // 7 dospělých a 6 dětí. Za známý se počet bere, když: hosté jsou zaregistrovaní,
  // majitel ho v editoru výslovně zapsal (značka guests_ok ve vr_msglog), nebo je
  // v pobytu cokoli jiného než výchozí 2+0.
  function adultsKnown(b) {
    if (((b.persons || {}).registered || 0) > 0 || hasLog(b, 'guests_ok')) return true;
    if (b.adults == null || b.adults <= 0) return false;
    return b.adults !== 2 || (b.children || []).length > 0;
  }
  // Věky dětí: editor dřív ukládal každému dítěti věk 10 (znal jen počet). Samé
  // desítky bez značky guests_ok proto znamenají „víme kolik, nevíme jak staré".
  function kidsAgesKnown(b) {
    var k = b.children || [];
    if (!k.length) return true;
    if (((b.persons || {}).registered || 0) > 0 || hasLog(b, 'guests_ok')) return true;
    return k.some(function (a) { return a !== 10; });
  }
  function isDirect(b) { return (b.platform || '') === 'Přímá'; }

  /* ============ Podmínky pobytu: čas příjezdu, placení poplatku, energie ============ */
  // Tři údaje, které se vkládají do uvítací zprávy. Žijí ve vr_msglog jako značky
  // (stejně jako deposit_enabled) — bez migrace, fungují hned:
  //   arrive_HHMM   dohodnutý čas příjezdu, např. arrive_1630 (bez značky 15:00)
  //   fee_onsite | fee_included | fee_deposit   jak host platí poplatek obci
  //   fee_energy    z kauce se účtují i energie (jen u fee_deposit)
  // POZOR: zámek zatím pouští vždy od 15:00 (vr_ha_stay → Home Assistant v jiném repu).
  // Dřívější dohodnutý příjezd se do zámku sám nepropíše — /sprava/ na to upozorní.
  var ARRIVAL_DEFAULT = '15:00';
  var FEE_MODES = { onsite: 'platí na místě', included: 'v ceně rezervace', deposit: 'z kauce podle smlouvy' };
  function arrivalTime(b) {
    var t = null;
    (b.msglog || []).forEach(function (m) { var x = /^arrive_(\d\d)(\d\d)$/.exec(m.msg_key); if (x) t = x[1] + ':' + x[2]; });
    return t || ARRIVAL_DEFAULT;
  }
  function feeModeSet(b) {
    for (var k in FEE_MODES) if (hasLog(b, 'fee_' + k)) return k;
    return null;
  }
  // Přímý prodej bez výslovné volby = z kauce: tak to stojí ve smlouvě (§ 6).
  function feeMode(b) { return feeModeSet(b) || (isDirect(b) ? 'deposit' : null); }
  function feeEnergy(b) { return feeMode(b) === 'deposit' && hasLog(b, 'fee_energy'); }
  function termsLabel(b) {
    var out = ['příjezd od ' + arrivalTime(b)], fm = feeMode(b);
    out.push('poplatek: ' + (fm ? FEE_MODES[fm] + (feeEnergy(b) ? ' + energie' : '') : 'nevyplněno'));
    return out.join(' · ');
  }
  // Zapíše podmínky jednoho pobytu; volá jen RPC, která něco mění (limit 120 za hodinu).
  // t = { time: 'HH:MM' | '', fee: klíč z FEE_MODES | '', energy: bool }
  function saveTerms(id, existing, t) {
    var have = {}, want = {}, ops = [];
    ((existing && existing.msglog) || []).forEach(function (m) { if (/^(arrive_\d{4}|fee_[a-z]+)$/.test(m.msg_key)) have[m.msg_key] = true; });
    if (t.time && t.time !== ARRIVAL_DEFAULT) want['arrive_' + t.time.replace(':', '')] = true;
    if (t.fee) want['fee_' + t.fee] = true;
    if (t.fee === 'deposit' && t.energy) want.fee_energy = true;
    Object.keys(have).forEach(function (k) { if (!want[k]) ops.push([k, false]); });
    Object.keys(want).forEach(function (k) { if (!have[k]) ops.push([k, true]); });
    return ops.reduce(function (p, op) {
      return p.then(function () { return rpc('vr_admin_msg_log', { p_booking_id: id, p_msg_key: op[0], p_sent: op[1] }); });
    }, Promise.resolve());
  }

  function buildCtx(booking) {
    var noci = nights(booking.arrival, booking.departure);
    var p = booking.persons || {};
    var reg = (p.registered || 0) > 0;
    // null = nevíme (jen pro odhad poplatku v detailu; do zpráv se částka nepočítá)
    var dospeli = reg ? (p.adults || 0) : (adultsKnown(booking) ? booking.adults : null);
    var deti = reg ? (p.children || 0) : ((booking.children || []).length);
    var token = tokenFor(booking.id);
    var L = msgLang(booking), T = TPL[L];
    var winter = isWinter(booking.arrival);
    var fm = feeMode(booking);
    var toGo = daysBetween(isoToday(), booking.arrival);
    return {
      jmeno: guestName(booking),
      termin: fmtTermin(booking.arrival, booking.departure, L),
      dospeli: dospeli, deti: deti, noci: noci,
      // Po registraci skutečný poplatek z DB (po dnech, děti a ZTP/P zdarma);
      // do té doby odhad z rezervace. Sazba 25 Kč = OZV Svoboda nad Úpou č. 2/2023.
      castka: (reg && p.fee_czk != null) ? p.fee_czk : (dospeli == null ? null : dospeli * noci * 25),
      // Věta o placení poplatku; bez vyplněného způsobu se nepíše nic (a „Co doplnit" to hlásí).
      jakSePlati: !fm ? '' : (fm === 'onsite' ? T.payOnsite : fm === 'included' ? T.payIncluded
        : T.payDeposit + (feeEnergy(booking) ? T.payEnergy : '')),
      novinka: newsFor(booking, L),
      video: winter ? VIDEO.winter : VIDEO.summer,
      videoObsah: winter ? T.videoWinter : T.videoSummer,
      cas: arrivalTime(booking),
      // „pozítří se uvidíme" platí jen v T−2; den nato má zpráva říkat „zítra"
      kdy: toGo <= 0 ? T.inDays0 : (toGo === 1 ? T.inDays1 : T.inDays2),
      platforma: (booking.platform || '').trim(),
      // Kód je známý i bez uloženého door_code: posledních 5 číslic telefonu, stejně
      // ho bere zámek (Home Assistant) i registrace z lednice.
      kod: doorCodeFor(booking) || '{KOD_DVERI}',
      token: token,
      regLink: token ? (location.origin + '/registrace/?t=' + token + '&lang=' + (booking.lang || 'en')) : null,
      guideLink: token ? (location.origin + '/pruvodce/?t=' + token) : null,
      winter: winter,
      _reg: reg
    };
  }

  /* ============ Telefon → kód dveří (Yale) ============ */
  // Kód ke dveřím = posledních 5 číslic telefonu (návrh; nikdy nepřepíše uložený kód).
  // Předvolba je prefix, takže posledních 5 číslic vyjde stejně z národního
  // i mezinárodního tvaru — normalizace to nerozbije.
  function phoneDigits(phone) { return String(phone == null ? '' : phone).replace(/\D/g, ''); }
  function suggestDoorCode(phone) { var d = phoneDigits(phone); return d.length >= 5 ? d.slice(-5) : null; }
  function doorCodeFor(b) { return b.door_code || suggestDoorCode(b.phone); }

  /* ============ Kód v zámku — stav z Home Assistantu ============ */
  // Od 30. 9. 2026 kódy na klávesnici zakládá HA ve vile sám (Seam, repo „jablotron -
  // topení", zamek_kody.yaml) a každých 30 min sem hlásí, co v zámku je
  // (vr_ha_report_door_codes). Úkol „Nastav v appce Yale Home" se proto ukáže, jen když
  // kód v zámku není, nesedí, hlásí chybu — nebo když HA přes 2 h mlčí.
  function normDoorCode(c) { return String(c || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }
  function lockState(b) {
    var want = normDoorCode(doorCodeFor(b));
    var at = doorCodes && doorCodes.reported_at ? Date.parse(doorCodes.reported_at) : NaN;
    if (isNaN(at)) return { ok: false, known: false, text: 'Home Assistant stav kódů zatím nehlásí' };
    if (Date.now() - at > 2 * 3600 * 1000)
      return { ok: false, known: false, text: 'Home Assistant se neozval od ' + fmtStamp(at) };
    var c = (doorCodes.codes || []).filter(function (x) { return x.uidh === b.uidh; })[0];
    var term = fmtDay(b.arrival) + ' 15:00 – ' + fmtDay(b.departure) + ' 10:00';
    if (!c) return { ok: false, known: true, text: 'kód v zámku není' + (want ? '' : ' (chybí telefon i kód)') };
    if (c.error) return { ok: false, known: true, text: 'zámek hlásí chybu: ' + c.error };
    if (want && normDoorCode(c.code) !== want)
      return { ok: false, known: true, text: 'v zámku je jiný kód (' + c.code + ') – HA ho do 30 min přepíše' };
    if (c.status === 'set') return { ok: true, known: true, text: '✅ kód ' + c.code + ' je v zámku, platí ' + term };
    if (c.status === 'unset' && !(Date.parse(c.starts_at) <= Date.now()))
      return { ok: true, known: true, text: '🕓 kód ' + c.code + ' je v zámku naplánovaný, platí ' + term };
    return { ok: false, known: true, text: 'kód ' + c.code + ' se pořád nastavuje (' + (c.status || '?') + ')' };
  }
  function loadDoorCodes() {
    return rpc('vr_admin_door_codes', {}).then(function (res) {
      return (res.data && res.data.ok) ? res.data : null;
    }).catch(function () { return null; });
  }

  /* ============ Telefon — normalizace na mezinárodní tvar ============ */
  // Ukládáme +49171… a z toho pak vychází wa.me. Dřív se předvolba hádala
  // (9 číslic = Česko) a německé číslo psané národně (0171…) vyrobilo mrtvý
  // odkaz wa.me/01711234567. Teď se předvolba buď přečte z čísla, nebo odvodí
  // z jazyka hosta — a majitel ve formuláři hned vidí, co se uloží.

  // min/max = počet číslic národní části za předvolbou. Delší předvolby první
  // (hledá se nejdelší shoda), jinak by '420' spadlo pod '42'.
  var DIAL = [
    { cc: '351', name: 'Portugalsko', min: 9, max: 9 },
    { cc: '380', name: 'Ukrajina', min: 9, max: 9 },
    { cc: '385', name: 'Chorvatsko', min: 8, max: 9 },
    { cc: '386', name: 'Slovinsko', min: 8, max: 8 },
    { cc: '420', name: 'Česko', min: 9, max: 9 },
    { cc: '421', name: 'Slovensko', min: 9, max: 9 },
    { cc: '31', name: 'Nizozemsko', min: 9, max: 9 },
    { cc: '32', name: 'Belgie', min: 8, max: 9 },
    { cc: '33', name: 'Francie', min: 9, max: 9 },
    { cc: '34', name: 'Španělsko', min: 9, max: 9 },
    { cc: '36', name: 'Maďarsko', min: 8, max: 9 },
    { cc: '39', name: 'Itálie', min: 6, max: 11 },
    { cc: '41', name: 'Švýcarsko', min: 9, max: 9 },
    { cc: '43', name: 'Rakousko', min: 8, max: 13 },
    { cc: '44', name: 'Británie', min: 9, max: 10 },
    { cc: '45', name: 'Dánsko', min: 8, max: 8 },
    { cc: '46', name: 'Švédsko', min: 7, max: 13 },
    { cc: '47', name: 'Norsko', min: 8, max: 8 },
    { cc: '48', name: 'Polsko', min: 9, max: 9 },
    { cc: '49', name: 'Německo', min: 6, max: 11 },
    { cc: '1', name: 'USA/Kanada', min: 10, max: 10 }
  ];
  // Domovská předvolba podle jazyka hosta. 'en' schválně chybí — anglicky
  // píšou hosté odkudkoliv, tam se hádat nedá a radši si řekneme o předvolbu.
  var LANG_CC = { cs: '420', de: '49', pl: '48' };

  function dialInfo(digits) {
    for (var i = 0; i < DIAL.length; i++) if (digits.indexOf(DIAL[i].cc) === 0) return DIAL[i];
    return null;
  }
  function dialFits(info, digits) {
    var n = digits.length - info.cc.length;
    return n >= info.min && n <= info.max;
  }
  function prettyPhone(digits, info) {
    if (!info) return '+' + digits;
    var nat = digits.slice(info.cc.length);
    if (nat.length === 9) nat = nat.replace(/(\d{3})(\d{3})(\d{3})/, '$1 $2 $3');
    else if (nat.length === 10) nat = nat.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3');
    return '+' + info.cc + ' ' + nat;
  }

  // Vrací { empty } | { error } | { ok, e164, pretty, country, guessed }.
  // guessed = předvolbu jsme doplnili podle jazyka, ne z toho, co bylo napsané.
  function normPhone(raw, lang) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return { empty: true };
    var intl = /^\+/.test(s);
    var d = s.replace(/\D/g, '');
    if (!d) return { error: 'V políčku není žádná číslice.' };
    if (!intl && d.indexOf('00') === 0) { d = d.slice(2); intl = true; } // 00420… = mezinárodní

    var guessed = false;
    if (!intl) {
      var home = LANG_CC[lang] || null;
      var info = dialInfo(d);
      if (d.charAt(0) === '0') {
        // národní tvar s nulou (0171…) — nula se do mezinárodního tvaru nedává
        if (!home) return { error: 'Číslo začíná nulou, ale nevím ze které země. Napiš ho s předvolbou, např. +49 171 1234567.' };
        d = home + d.replace(/^0+/, '');
        guessed = true;
      } else if (info && dialFits(info, d)) {
        // předvolba tam je, jen bez plusu — bereme jak je
      } else if (home) {
        d = home + d;
        guessed = true;
      } else {
        return { error: 'Nepoznám předvolbu. Napiš číslo mezinárodně, např. +49 171 1234567.' };
      }
    }

    if (d.length < 8) return { error: 'Číslo má jen ' + d.length + ' číslic — na telefonní číslo je to málo.' };
    if (d.length > 15) return { error: 'Číslo má ' + d.length + ' číslic — víc než 15 telefonní číslo mít nemůže.' };
    var fin = dialInfo(d);
    if (fin && !dialFits(fin, d)) {
      var have = d.length - fin.cc.length;
      var want = fin.min === fin.max ? fin.min : (fin.min + '–' + fin.max);
      return { error: fin.name + ' (+' + fin.cc + ') má za předvolbou ' + want + ' číslic, tohle jich má ' + have + '.' };
    }
    return { ok: true, e164: '+' + d, pretty: prettyPhone(d, fin), country: fin ? fin.name : null, guessed: guessed };
  }

  /* ============ wa.me ============ */
  // wa.me chce holé číslice v mezinárodním tvaru. Bere se booking (ne string),
  // protože jazyk hosta je záložní zdroj předvolby u starších záznamů.
  function waPhone(b) {
    var n = normPhone(b && b.phone, b && b.lang);
    return n.ok ? n.e164.slice(1) : '';
  }
  function waLink(b, text) {
    return 'https://wa.me/' + waPhone(b) + '?text=' + encodeURIComponent(text);
  }
  // Použitelný telefon = takový, ze kterého vznikne funkční wa.me odkaz.
  function phoneUsable(b) { return !!waPhone(b); }

  /* ============ Data load ============ */
  function loadCalendar() {
    return fetch(CFG.CALENDAR_URL + '?_=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (d) { return Array.isArray(d) ? d : []; })
      .catch(function () { return []; });
  }
  // verified.json = ruční ověření majitele u zdroje (confirmed / unconfirmed / service).
  // Servisní blok a nepotvrzený termín nemají hosta, takže se nehlásí jako nespárovaný pobyt.
  function loadVerified() {
    return fetch(CFG.CALENDAR_URL.replace('history.json', 'verified.json') + '?_=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (d) { return (d && d.stays && typeof d.stays === 'object') ? d.stays : {}; })
      .catch(function () { return {}; });
  }
  function verifiedStatus(s) { var e = verified[s.start + '..' + s.end]; return (e && e.status) || null; }
  function loadBookings() {
    return rpc('vr_admin_list_bookings', {}).then(function (res) {
      if (res.data && res.data.ok) return res.data.bookings || [];
      if (res.status === 401 || (res.data && res.data.message === 'unauthorized')) throw new Error('unauthorized');
      throw new Error((res.data && res.data.message) || 'load_failed');
    });
  }
  function loadConfig() {
    return rpc('vr_admin_get_config', {}).then(function (res) {
      return (res.data && res.data.ok && res.data.config) ? res.data.config : {};
    }).catch(function () { return {}; });
  }
  function loadConflicts() {
    // stav hlídače (vr_conflicts) — pro „✅ vyřešeno" a evidenci. Aktivní překryvy
    // banner detekuje i sám z history.json, takže výpadek RPC banner nezhasne.
    return rpc('vr_admin_conflicts', {}).then(function (res) {
      return (res.data && res.data.ok && res.data.conflicts) ? res.data.conflicts : [];
    }).catch(function () { return []; });
  }

  function loadRequests() {
    // Selhání nesmí shodit celý panel — pobyty jsou důležitější než žádosti,
    // proto tady (stejně jako u konfliktů) chyba končí prázdným polem.
    return rpc('vr_admin_list_requests', {}).then(function (res) {
      return (res.data && res.data.ok && res.data.requests) ? res.data.requests : [];
    }).catch(function () { return []; });
  }

  // Stornované na platformě: uidh, které kalendář nese JEN jako nepotvrzený záznam
  // (stale, pobyt teprve má proběhnout) — pobyt z feedu vypadl. history.json si ho
  // pamatuje dál, takže „je uidh v kalendáři?" nestačí: host by zůstal v přehledu jako
  // běžný pobyt a DNES by mu nabízelo zprávy. Stejné pravidlo jako VrDailyTasks
  // a VrConflictWatch.detect.js.
  function cancelledOnPlatform(today) {
    var ghost = {}, live = {};
    calendar.forEach(function (c) {
      if (!c.uidh) return;
      if (c.stale === true && c.end > today) ghost[c.uidh] = 1; else live[c.uidh] = 1;
    });
    var res = {};
    Object.keys(ghost).forEach(function (u) { if (!live[u]) res[u] = true; });
    return res;
  }

  function buildStays() {
    var today = isoToday();
    var cutoff = addDaysISO(today, -14);
    var byUidh = {}, byId = {};
    bookings.forEach(function (b) { if (b.uidh) byUidh[b.uidh] = b; byId[b.id] = b; });
    var cancelled = cancelledOnPlatform(today);

    // Host k předrezervaci. Přímý prodej je v history.json pod uidh SVÉ předrezervace
    // (vr_hold_uidh), ne pod uidh pobytu — pobyt ve vr_bookings ho má prázdný. Párovat
    // jen přes byUidh proto nestačí: kalendářní řádek by zůstal bez hosta a pobyt
    // s hostem by se přidal podruhé jako ruční. Primárně vazba booking_id; když chybí,
    // JEDINÝ ruční PŘÍMÝ pobyt (bez uidh, platforma „Přímá") na přesně tentýž termín.
    // Víc kandidátů = nehádat; ruční rezervace z jiné platformy je jiný nárok, ne host
    // přímého prodeje. Ve všech případech musí pobyt nést TÝŽ termín jako předrezervace:
    // po přesunu jen jedné z nich by karta ukazovala nové datum a zprávy a úkoly by
    // běžely podle starého. Nesoulad radši ukázat jako dva řádky.
    // Pobyt, na který už odkazuje NĚJAKÁ předrezervace, patří jí — i když s ní právě
    // nesedí termínem. Náhradní párování podle data ho jiné předrezervaci nedá.
    // A párování podle data musí být jedna ku jedné: dvě nepropojené předrezervace
    // na tentýž termín by si jinak obě vzaly téhož hosta (a úkoly by se zdvojily).
    var linkedToHold = {}, unlinkedHoldsBySpan = {};
    holds.forEach(function (h) {
      if (h.booking_id) { linkedToHold[h.booking_id] = true; return; }
      if (!holdOpen(h) || holdExpired(h)) return;
      var k = h.arrival + '|' + h.departure;
      unlinkedHoldsBySpan[k] = (unlinkedHoldsBySpan[k] || 0) + 1;
    });
    function bookingOfHold(h) {
      if (!h) return null;
      var sameSpan = function (b) { return b && b.arrival === h.arrival && b.departure === h.departure; };
      if (h.booking_id) { var lb = byId[h.booking_id]; return sameSpan(lb) ? lb : null; }
      if ((unlinkedHoldsBySpan[h.arrival + '|' + h.departure] || 0) > 1) return null;
      var same = bookings.filter(function (b) {
        return !b.uidh && !linkedToHold[b.id] && (b.platform || 'Přímá') === 'Přímá' && sameSpan(b);
      });
      return same.length === 1 ? same[0] : null;
    }

    // Předrezervace, které právě drží termín. Do kalendáře je Action dostane až při
    // dalším běhu (každé 3 h), takže se tady berou rovnou z databáze — čerstvě
    // založená předrezervace musí být vidět hned, ne až za tři hodiny.
    var holdByUidh = {}, holdBySpan = {}, usedHoldIds = {};
    holds.forEach(function (h) {
      if (!holdOpen(h) || holdExpired(h)) return;
      if (h.uidh) holdByUidh[h.uidh] = h;
      // Klíč přes termín zrcadlí pravidlo ze skriptu kalendáře: záznam z feedu se
      // shodným termínem jako přímý prodej je TÝŽ pobyt (ozvěna našeho bloku nebo ruční
      // blokace na platformě), ne druhá rezervace. Bez toho by z každé zablokované
      // přímé rezervace vyskočil červený konflikt sám se sebou.
      holdBySpan[h.arrival + '|' + h.departure] = h;
    });
    // Host, kterého si živá předrezervace drží (bookingOfHold = týž termín). Když se
    // přesunou oba a kalendář do příštího běhu Action nese pod starým platformním
    // uidh pobytu ještě starý termín, nesmí si hosta vzít ten zastaralý řádek —
    // patří k aktuálnímu termínu předrezervace.
    var heldBooking = {};
    holds.forEach(function (h) {
      if (!holdOpen(h) || holdExpired(h)) return;
      var hb = bookingOfHold(h);
      if (hb) heldBooking[hb.id] = true;
    });
    // Které přímé prodeje už kalendář nese pod vlastním uidh (vr_hold_uidh) — od
    // kalendářního #17 platí záznam ze správy a ozvěna z feedu se zahazuje. Dobíhající
    // ozvěnu (v archivu živá ještě STALE_AFTER_DAYS) pak tady přeskočíme stejně.
    // Klíč je uidh + TERMÍN: přesunutá předrezervace má v kalendáři do příštího běhu
    // Action ještě staré datum pod tímtéž uidh, a ten řádek nový termín nenese.
    var calUidh = {};
    calendar.forEach(function (c) { if (c.uidh) calUidh[c.uidh + '|' + c.start + '|' + c.end] = true; });
    // Záznam z feedu je ozvěnou předrezervace jen tehdy, když nemá vlastního hosta —
    // nebo když je jeho host právě host té předrezervace. Rezervace z platformy se
    // spárovaným hostem na tentýž termín je druhý nárok (dvojitá rezervace), ne ozvěna:
    // sloučit ji s předrezervací by konflikt schovalo.
    function echoOfHold(c, h) {
      var cb = byUidh[c.uidh];
      if (!cb) return true;
      var hb = bookingOfHold(h);
      return !!hb && hb.id === cb.id;
    }

    stays = [];
    var usedBookingIds = {};

    // 1) kalendářní pobyty v okně (end >= dnes-14)
    calendar.forEach(function (c) {
      if (c.end < cutoff) return;
      // Nepotvrzený záznam = ve feedu už není, ale pobyt teprve má proběhnout
      // (propadlá předrezervace, storno). Do přehledu ani do hlídače překryvů
      // nepatří — svítilo to jako dvojitá rezervace na termín, kde žádná není.
      // POZOR na datum: feed nese jen dnešek a budoucnost, takže KAŽDÝ proběhlý
      // pobyt je stale — bez té podmínky by zmizel celý archiv.
      // Stejné pravidlo jako isGhost() ve villa-booking-calendar.
      if (c.stale === true && c.end > today) return;
      var h = holdByUidh[c.uidh] || null;
      // Přesunutá předrezervace: kalendář do příštího běhu Action nese pod jejím uidh
      // ještě STARÝ termín. Ten řádek už nic nedrží — přeskočit a předrezervaci nechat
      // na kroku 2, který ji ukáže s aktuálním datem (i pro hlídač překryvů).
      if (h && (h.arrival !== c.start || h.departure !== c.end)) return;
      if (!h) {
        var hs = holdBySpan[c.start + '|' + c.end] || null;
        if (hs && !echoOfHold(c, hs)) hs = null;   // vlastní host = samostatná rezervace
        // Ozvěna přímého prodeje, který má v kalendáři vlastní řádek → ten řádek stačí.
        if (hs && hs.uidh && calUidh[hs.uidh + '|' + hs.arrival + '|' + hs.departure]) return;
        // přímý prodej v kalendáři ještě není (Action po 3 h) → spárovat s blokací.
        // Jen s JEDNÍM řádkem: kryje-li termín víc záznamů z feedu, dostal by každý
        // tutéž předrezervaci i hosta a jeho zprávy a úkoly by se zdvojily.
        h = (hs && !usedHoldIds[hs.id]) ? hs : null;
      }
      if (h) usedHoldIds[h.id] = true;
      var b = byUidh[c.uidh] || null;
      if (b && usedBookingIds[b.id]) b = null;   // host patří jen jednomu řádku
      if (b && heldBooking[b.id] && (b.arrival !== c.start || b.departure !== c.end)) b = null;
      if (!b && h) { var hb0 = bookingOfHold(h); if (hb0 && !usedBookingIds[hb0.id]) b = hb0; }
      if (b) usedBookingIds[b.id] = true;
      stays.push({
        source: 'calendar', uidh: c.uidh,
        start: c.start, end: c.end, platform: c.platform, booking: b, hold: h
      });
    });

    // 2) předrezervace, které v kalendáři ještě nejsou (Action běží po 3 h).
    // PŘED ručními pobyty: host takové předrezervace se jinak přidal ještě jednou
    // jako ruční pobyt, protože o jeho předrezervaci ruční krok nevěděl.
    holds.forEach(function (h) {
      if (usedHoldIds[h.id]) return;
      if (!holdOpen(h) || holdExpired(h)) return;
      if (h.departure < cutoff) return;
      var hb = bookingOfHold(h);
      if (hb && usedBookingIds[hb.id]) hb = null;   // host patří jen jednomu řádku
      if (hb) usedBookingIds[hb.id] = true;
      stays.push({
        source: 'hold', uidh: h.uidh || null,
        start: h.arrival, end: h.departure, platform: 'Přímá',
        booking: hb,
        hold: h
      });
    });

    // 3) ruční pobyty (bez uidh, nebo uidh mimo kalendář) v okně
    bookings.forEach(function (b) {
      if (usedBookingIds[b.id]) return;
      // Storno na platformě: do přehledu ani do DNES nepatří (zprávy by šly zrušenému
      // hostovi). Hlásí ho žlutý banner „Pobyt zmizel z kalendáře", odkud jde smazat.
      if (b.uidh && cancelled[b.uidh]) return;
      if (b.uidh && byUidh[b.uidh] && stays.some(function (s) { return s.booking && s.booking.id === b.id; })) return;
      if (b.departure < cutoff) return;
      stays.push({
        source: 'manual', uidh: b.uidh || null,
        start: b.arrival, end: b.departure, platform: b.platform || 'Přímá', booking: b, hold: null
      });
    });

    stays.sort(function (x, y) { return x.start < y.start ? -1 : x.start > y.start ? 1 : 0; });
  }

  /* ============ Hlídač konfliktů (banner) ============ */
  // Stejná logika jako n8n VrConflictWatch: intervaly [start,end); identické uidh
  // se ignorují. Eskaluje (červeně) různá platforma NEBO oba pobyty se spárovaným
  // hostem. Stejná platforma bez hostů = artefakt kalendáře → tlumeně (žlutě).
  function overlapsRange(a, b) { return a.start < b.end && b.start < a.end; }
  function detectConflictsClient() {
    var today = isoToday();
    var res = { overlaps: [], artifacts: [], vanished: [] };
    for (var i = 0; i < stays.length; i++) {
      for (var j = i + 1; j < stays.length; j++) {
        var A = stays[i], B = stays[j];
        // Kalendářní pobyty (stejně jako VrConflictWatch) plus předrezervace, které
        // v kalendáři ještě nejsou. Ruční záznamy zůstávají venku — bývají to
        // nespárované kopie feedu, ne dvojitá rezervace. Výjimka: ruční rezervace
        // z JINÉ platformy než „Přímá" proti předrezervaci. Kopií přímého prodeje
        // být nemůže a v kalendáři ani ve „zmizelých" (nemá uidh) ji nic jiného nezachytí.
        if (A.source === 'manual' || B.source === 'manual') {
          if (A.source === 'manual' && B.source === 'manual') continue;
          var M = A.source === 'manual' ? A : B, O = M === A ? B : A;
          if (!O.hold || (M.platform || 'Přímá') === 'Přímá') continue;
        }
        if (A.uidh && B.uidh && A.uidh === B.uidh) continue;
        if (!overlapsRange(A, B)) continue;
        var samePlatform = (A.platform || '') === (B.platform || '');
        var bothPaired = !!A.booking && !!B.booking;
        // U předrezervace je vystavená faktura — dva nároky na stejný termín se
        // nesmí schovat mezi „artefakty kalendáře", i když jsou obě „Přímá".
        var withHold = !!A.hold || !!B.hold;
        var item = {
          a: A, b: B,
          overlapStart: (A.start > B.start ? A.start : B.start),
          overlapEnd: (A.end < B.end ? A.end : B.end),
          samePlatform: samePlatform,
          known: !!(A.uidh && B.uidh && KNOWN_UIDH.indexOf(A.uidh) >= 0 && KNOWN_UIDH.indexOf(B.uidh) >= 0)
        };
        if (samePlatform && !bothPaired && !withHold) res.artifacts.push(item);
        else res.overlaps.push(item);
      }
    }
    // Jen platné záznamy: nepotvrzený (storno) si history.json pamatuje dál, a kdyby
    // se počítal, banner „Pobyt zmizel" by u storna nikdy nevyskočil.
    var cancelled = cancelledOnPlatform(today);
    var calUidh = {}; calendar.forEach(function (c) { if (c.uidh && !cancelled[c.uidh]) calUidh[c.uidh] = 1; });
    // Host předrezervace je v přehledu pod jejím řádkem; jeho starý uidh (třeba ozvěna
    // z e-chalup, kterou kalendář od zapsání přímého prodeje zahazuje) nic neznamená.
    var heldIds = {};
    stays.forEach(function (s) { if (s.hold && s.booking) heldIds[s.booking.id] = true; });
    var horizon = addMonthsISO(today, 12); // feed má 13měsíční cutoff dopředu → jen do 12 měsíců
    bookings.forEach(function (b) {
      if (!b.uidh || calUidh[b.uidh] || heldIds[b.id]) return;
      if (b.departure < today) return;
      // Horizont platí jen pro pobyt, který ve feedu nikdy nebyl. Storno je doložené
      // (záznam z feedu vypadl) i za 12 měsíci.
      if (b.arrival > horizon && !cancelled[b.uidh]) return;
      res.vanished.push({ booking: b });
    });
    return res;
  }

  function cbSide(s) {
    var nm = s.booking ? guestName(s.booking) : 'neznámý host (jen v kalendáři)';
    return '<div class="cb-side"><b>' + esc(s.platform || '—') + '</b> · ' + esc(fmtShort(s.start, s.end)) + ' · ' + esc(nm) + '</div>';
  }
  function renderConflicts() {
    var host = $('conflict-banner');
    if (!host) return;
    var det = detectConflictsClient();
    lastDetect = det;
    var resolved = (serverConflicts || []).filter(function (c) { return c && c.resolved_at; });

    if (!det.overlaps.length && !det.vanished.length && !det.artifacts.length && !resolved.length) {
      host.hidden = true; host.innerHTML = ''; return;
    }
    var html = '';

    det.overlaps.forEach(function (o, i) {
      var known = o.known ? '<div class="cb-note">✔ Známý konflikt — majitel ho už řeší.</div>' : '';
      var art = o.samePlatform ? '<div class="cb-note dim">Stejná platforma — prověřte, zda nejde o blok/úpravu.</div>' : '';
      html +=
        '<div class="cb cb-red">' +
        '<div class="cb-h">🔴 Dvojitá rezervace — ' + esc(fmtTermin(o.overlapStart, o.overlapEnd)) + '</div>' +
        cbSide(o.a) + cbSide(o.b) + known + art +
        '<div class="cb-actions">' +
        '<button type="button" class="btn btn-sm btn-outline" data-open data-grp="overlap" data-i="' + i + '" data-side="a">Detail pobytu A</button>' +
        '<button type="button" class="btn btn-sm btn-outline" data-open data-grp="overlap" data-i="' + i + '" data-side="b">Detail pobytu B</button>' +
        '</div></div>';
    });

    det.vanished.forEach(function (v, i) {
      var b = v.booking;
      html +=
        '<div class="cb cb-yellow">' +
        '<div class="cb-h">🟡 Pobyt zmizel z kalendáře — ' + esc(fmtTermin(b.arrival, b.departure)) + '</div>' +
        '<div class="cb-side"><b>' + esc(b.platform || '—') + '</b> · ' + esc(guestName(b)) + '</div>' +
        '<div class="cb-note dim">Není už ve feedu kalendáře — pravděpodobně storno na platformě. Ověřte a případně smažte ve správě.</div>' +
        '<div class="cb-actions"><button type="button" class="btn btn-sm btn-outline" data-open data-grp="vanished" data-i="' + i + '">Detail pobytu</button></div>' +
        '</div>';
    });

    resolved.forEach(function (c) {
      var d = c.detail || {};
      var termin = d.type === 'overlap'
        ? fmtTermin(d.overlap_start, d.overlap_end)
        : fmtTermin(d.start || '', d.end || '');
      html +=
        '<div class="cb cb-green">' +
        '<div class="cb-h">✅ Vyřešeno — ' + (d.type === 'overlap' ? 'dvojitá rezervace ' : 'zmizelý pobyt ') + esc(termin) + '</div>' +
        '<div class="cb-note dim">Konflikt už v kalendáři není. Hlídač ho uzavřel.</div>' +
        '</div>';
    });

    det.artifacts.forEach(function (o) {
      html +=
        '<div class="cb cb-muted">' +
        '<div class="cb-h dim">⚙︎ Možný artefakt kalendáře — ' + esc(fmtTermin(o.overlapStart, o.overlapEnd)) + ' (' + esc(o.a.platform || '—') + ')</div>' +
        '<div class="cb-note dim">Překryv na stejné platformě bez hosta — nejspíš blok/duplicita, ne dvojitá rezervace. Neupozorňujeme e-mailem.</div>' +
        '</div>';
    });

    host.innerHTML = html;
    host.hidden = false;
    Array.prototype.forEach.call(host.querySelectorAll('[data-open]'), function (btn) {
      btn.addEventListener('click', function () {
        var grp = btn.getAttribute('data-grp'), i = +btn.getAttribute('data-i'), side = btn.getAttribute('data-side');
        var stay;
        if (grp === 'overlap') { var o = lastDetect.overlaps[i]; stay = side === 'b' ? o.b : o.a; }
        else if (grp === 'vanished') {
          var b = lastDetect.vanished[i].booking;
          stay = { booking: b, uidh: b.uidh || null, start: b.arrival, end: b.departure, platform: b.platform || 'Přímá', source: 'manual' };
        }
        if (!stay) return;
        if (stay.booking) openDetail(stay); else openEditor({ stay: stay });
      });
    });
  }

  /* ============ Render: PROBLÉMY (to, co hoří) ============ */
  // Pod konfliktním bannerem, nad DNES. Řazeno podle data. Jen věci s termínem:
  // předrezervace, platby, hlášení cizinců, odvod poplatku, a příjezd do 7 dnů, ke
  // kterému NEJDE odvodit kód dveří. Co u pobytu jen chybí vyplnit (host, telefon,
  // počty, odkaz), je od 11. 10. 2026 na jednom místě v tabulce „Co doplnit".
  function refreshBoards() { renderRequests(); renderHolds(); renderPayments(); renderProblems(); renderToday(); renderTodo(); renderStays(); }

  /* ============ Render: ŽÁDOSTI Z WEBU ============ */
  // Formulář na homepage zapisuje do vr_requests přes RPC vr_request. Do 12. 8. 2026
  // tabulku nečetl NIKDO — žádost od hosta v ní ležela devět dní, než se ozval
  // podruhé přes platformu. Tahle sekce je jedna ze dvou cest ven; druhá je
  // e-mail z n8n (VrWebRequest, kontrola po 5 minutách).
  var REQ_FLAG = { cs: '🇨🇿', de: '🇩🇪', en: '🇬🇧', pl: '🇵🇱', nl: '🇳🇱', fr: '🇫🇷' };   // nl/fr: /nl/ a /fr/ od 10/2026

  function fmtWhen(iso) {
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return d.getDate() + '. ' + MONTH_GEN[d.getMonth()] + ' ' + d.getFullYear()
      + ' v ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  }
  function nightWord(n) { return n === 1 ? 'noc' : (n <= 4 ? 'noci' : 'nocí'); }

  function requestCard(r, idx) {
    var n = daysBetween(r.arrival, r.departure);
    var done = r.status === 'done';
    // waPhone bere celý objekt kvůli jazyku hosta — řádek žádosti má .phone i .lang,
    // takže se sem normalizace telefonu z pobytů dá použít beze změny.
    var wa = waPhone(r);

    var hoste = r.adults + ' dosp.';
    if (r.children) hoste += ' · ' + r.children + ' dět.';
    if (r.pets) hoste += ' · ' + r.pets + '× pes';

    var links = '<a class="req-lnk" href="mailto:' + esc(r.email) + '">' + esc(r.email) + '</a>';
    if (wa) {
      links += '<a class="req-lnk" href="tel:+' + esc(wa) + '">+' + esc(wa) + '</a>'
        + '<a class="req-lnk" href="https://wa.me/' + esc(wa) + '" target="_blank" rel="noopener">WhatsApp ↗</a>';
    } else if (r.phone) {
      links += '<span class="req-bad">telefon „' + esc(r.phone) + '“ nejde použít</span>';
    }

    // Prázdné notified_at = e-mail ještě neodešel. Buď je žádost čerstvá (n8n běží
    // po 5 minutách), nebo vázne pošta — obojí je lepší vidět než neřešit.
    var tag = r.notified_at ? '' : '<span class="req-tag">e-mail zatím neodešel</span>';
    var msg = r.message ? '<div class="req-msg">' + esc(r.message) + '</div>' : '';

    return '<div class="req' + (done ? ' req-done' : '') + '">'
      + '<div class="req-main">'
      + '<div class="req-t">' + (REQ_FLAG[r.lang] || '🏳️') + ' ' + esc(r.name) + tag + '</div>'
      + '<div class="req-d">' + esc(fmtShort(r.arrival, r.departure)) + ' · ' + n + ' ' + nightWord(n)
      + ' · ' + esc(hoste) + ' · <b>' + esc(Number(r.total || 0).toLocaleString('cs-CZ')) + ' Kč</b></div>'
      + '<div class="req-c">' + links + '</div>' + msg
      + '<div class="req-when">Přišla ' + esc(fmtWhen(r.created_at)) + '</div>'
      + '</div>'
      + '<button type="button" class="btn btn-sm ' + (done ? 'btn-ghost' : 'btn-outline')
      + '" data-req="' + idx + '">' + (done ? 'Vrátit' : 'Vyřízeno') + '</button>'
      + '</div>';
  }

  function renderRequests() {
    var panel = $('requests-panel'), host = $('requests'), toggle = $('btn-req-done');
    if (!panel || !host) return;
    if (!requests.length) { panel.hidden = true; return; }  // žádná žádost = žádná sekce
    panel.hidden = false;

    var open = [], done = [];
    requests.forEach(function (r) { (r.status === 'done' ? done : open).push(r); });
    if (toggle) {
      toggle.hidden = !done.length;
      toggle.textContent = requestsShowDone ? 'Skrýt vyřízené' : 'Vyřízené (' + done.length + ')';
    }

    lastRequests = requestsShowDone ? open.concat(done) : open;
    if (!lastRequests.length) {
      host.innerHTML = '<div class="prob prob-ok"><span class="prob-ok-i">✓</span> '
        + 'Všechny žádosti z webu jsou vyřízené.</div>';
      return;
    }
    host.innerHTML = lastRequests.map(requestCard).join('');

    Array.prototype.forEach.call(host.querySelectorAll('[data-req]'), function (btn) {
      btn.addEventListener('click', function () {
        var r = lastRequests[+btn.getAttribute('data-req')];
        if (!r) return;
        var next = r.status === 'done' ? 'open' : 'done';
        btn.disabled = true;
        rpc('vr_admin_set_request_status', { p_id: r.id, p_status: next }).then(function (res) {
          if (res.data && res.data.ok) {
            r.status = next;
            toast(next === 'done' ? 'Žádost vyřízena.' : 'Žádost vrácena mezi otevřené.');
            renderRequests();
          } else {
            btn.disabled = false;
            toast('Uložení se nepodařilo.');
          }
        }).catch(function () { btn.disabled = false; toast('Uložení se nepodařilo.'); });
      });
    });
  }

  function probCard(tone, title, desc, idx, btnLabel) {
    return '<div class="prob prob-' + tone + '"><div class="prob-main">' +
      '<div class="prob-t">' + title + '</div><div class="prob-d">' + desc + '</div></div>' +
      '<button type="button" class="btn btn-sm btn-outline" data-prob="' + idx + '">' + esc(btnLabel) + '</button></div>';
  }
  function renderProblems() {
    var panel = $('problems-panel');
    var host = $('problems');
    if (!panel || !host) return;
    var today = isoToday();
    var probs = [];
    // (e) předrezervace: špatný účet na faktuře, propadlá splatnost, nezablokovaný
    //     termín. Všechny tři jsou časově citlivé — fakturu jde levně opravit jen
    //     dokud ji host nezaplatil, a nezablokovaný termín může kdykoli prodat
    //     kterákoli platforma.
    holds.forEach(function (h) {
      if (h.departure < today) return;
      if (h.account_mismatch && holdOpen(h)) probs.push({ kind: 'holdacc', hold: h, date: h.arrival });
      if (h.paid_mismatch) probs.push({ kind: 'holdpaid', hold: h, date: h.arrival });
      if (holdExpired(h)) probs.push({ kind: 'holdexp', hold: h, date: h.arrival });
      else if (holdOpen(h) && !blockedOnPlatform(h)) probs.push({ kind: 'holdblock', hold: h, date: h.arrival });
    });

    // (f) platba, ke které se nenašla faktura. Přesně tím tenhle modul začal:
    //     peníze v bance viděné, ale rezervace z nich nevznikla.
    payments.forEach(function (p) {
      if (p.ignored_at || p.matched_hold) return;
      probs.push({ kind: 'payopen', pay: p, date: p.booked_on });
    });

    stays.forEach(function (s) {
      var b = s.booking;
      if (!b) return;   // pobyt bez hosta → „Co doplnit"
      // (b) příjezd do 7 dnů (nebo pobyt běží) a kód dveří NEJDE odvodit: není uložený
      //     a telefon nemá ani 5 číslic. Uložený být nemusí — zámek (Home Assistant)
      //     i registrace z lednice (vr_fridge_open) si ho berou z telefonu samy.
      if (!doorCodeFor(b) && s.end >= today && daysBetween(today, s.start) <= 7)
        probs.push({ kind: 'nocode', stay: s, date: s.start });
      // (g) nenahlášení cizinci — lhůta 3 pracovních dnů od ubytování (§ 102 zák.
      //     326/1999 Sb.). Pracovní dny a svátky počítá DB, tady se jen řadí podle lhůty.
      var ps = b.persons || {};
      if (ps.foreign_unreported > 0 && ps.uby_deadline)
        probs.push({ kind: 'ubydue', stay: s, date: ps.uby_deadline });
      // (h) pobyt běží a zaregistrovaných je méně, než kolik má rezervace osob.
      //     Kdo chybí, může být cizinec — a jeho lhůta běží od příjezdu.
      var expected = (b.adults || 0) + (b.children || []).length;
      if (b.arrival <= today && today <= b.departure && (ps.registered || 0) < expected)
        probs.push({ kind: 'ubyreg', stay: s, date: ps.arrival_deadline || b.arrival });
    });
    // (i) odvod poplatku z pobytu městu za uplynulé pololetí do 20. 1. / 20. 7.
    //     (OZV č. 2/2023, čl. 6). Hlásí se celý leden / červenec, dokud není označeno.
    var fd = feeDuePeriod(today);
    if (fd && !(adminConfig || {})[fd.key]) probs.push({ kind: 'feedue', fee: fd, date: fd.deadline });
    probs.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    lastProblems = probs;

    // aktivní konflikty — jen odkaz na banner (logika hlídače se neduplikuje)
    var det = lastDetect || detectConflictsClient();
    var activeConfl = (det.overlaps.length + det.vanished.length) > 0;

    panel.hidden = false;
    if (!probs.length && !activeConfl) {
      host.innerHTML = '<div class="prob prob-ok"><span class="prob-ok-i">✓</span> Nic nehoří — žádná lhůta, platba ani předrezervace nečeká.</div>';
      return;
    }
    var html = '';
    probs.forEach(function (p, i) {
      // Problémy předrezervací nesou `hold`, ne `stay` — sáhnout na s.booking by
      // u nich shodilo celé vykreslení (a s ním i sekce pod ním).
      var s = p.stay || null, b = s ? s.booking : null;
      if (p.kind === 'nocode') {
        html += probCard('red', '🔑 ' + esc(guestName(b)) + ' — není z čeho udělat kód dveří',
          (s.start <= today ? 'Pobyt běží' : 'Příjezd za ' + daysBetween(today, s.start) + ' dní') + ' (' + esc(fmtShort(s.start, s.end)) + ') a chybí telefon i uložený kód. '
          + 'Bez něj se hosté nedostanou dovnitř ani k registraci na lednici — doplň telefon, kód se z něj vezme sám.', i, 'Doplnit');
      } else if (p.kind === 'holdacc') {
        html += probCard('red', '🏦 Předrezervace ' + esc(fmtShort(p.hold.arrival, p.hold.departure)) + ' — faktura zní na špatný účet',
          esc(p.hold.account_mismatch) + '. Oprav ji v iDokladu, dokud ji host nezaplatil'
          + (p.hold.invoice_no ? ' (faktura ' + esc(p.hold.invoice_no) + ')' : '') + '.', i, 'Otevřít');
      } else if (p.kind === 'payopen') {
        html += probCard('warn', '❓ Nepřiřazená platba ' + esc(fmtMoney(p.pay.amount, p.pay.currency)),
          esc(fmtDayShort(p.pay.booked_on)) + ' · ' + esc(accountLabel(p.pay.account))
          + (p.pay.vs ? ' · VS ' + esc(p.pay.vs) : ' · bez variabilního symbolu')
          + (p.pay.counterparty ? ' · ' + esc(p.pay.counterparty) : '')
          + '. Nenašla se k ní faktura — přiřaď ji, nebo ji odlož.', i, 'Přiřadit');
      } else if (p.kind === 'holdpaid') {
        html += probCard('warn', '💸 ' + esc(fmtShort(p.hold.arrival, p.hold.departure)) + ' — platba přišla na cizí účet',
          'Peníze dorazily na ' + esc(accountLabel(p.hold.paid_account)) + '. Rezervace platí (host svoje udělal), '
          + 'ale je potřeba přeúčtovat na účet Villa Rudolf.', i, 'Otevřít');
      } else if (p.kind === 'holdexp') {
        html += probCard('warn', '⌛ Předrezervace ' + esc(fmtShort(p.hold.arrival, p.hold.departure)) + ' — propadla splatnost',
          'Termín se už uvolnil. Zaplatit o pár dní později je běžné — buď prodluž, nebo potvrď jako uhrazenou, '
          + 'nebo ji odepiš. <b>Než ji odepíšeš, ověř, jestli platba nedorazila na jiný účet.</b>', i, 'Rozhodnout');
      } else if (p.kind === 'holdblock') {
        html += probCard('soon', '📅 Předrezervace ' + esc(fmtShort(p.hold.arrival, p.hold.departure)) + ' — termín není zablokovaný',
          'Kalendář ho ještě nepublikoval, takže je na platformách pořád volný a může ho kterýkoli kanál prodat znovu. '
          + 'Action ho do výstupních feedů dá při příštím běhu (do 3 h), platformy si ho pak stáhnou samy; '
          + 'když to spěchá, zablokuj ho v e-chalupách ručně.', i, 'Otevřít');
      } else if (p.kind === 'ubydue') {
        var dd = b.persons.uby_deadline, left = daysBetween(today, dd), nf = b.persons.foreign_unreported;
        html += probCard(left <= 0 ? 'red' : 'soon',
          '🛂 ' + esc(guestName(b)) + ' — nahlásit ' + nf + ' ' + (nf === 1 ? 'cizince' : 'cizinců') + ' do UbyPortu',
          (left < 0 ? 'Lhůta uplynula ' + esc(fmtDay(dd)) + ' — nahlas co nejdřív, pozdní hlášení je lepší než žádné.'
            : left === 0 ? '<b>Dnes je poslední den lhůty.</b>'
            : 'Lhůta do ' + esc(fmtDay(dd)) + ' (3 pracovní dny od ubytování).')
          + ' Po odeslání označ v detailu pobytu „Nahlášeno“.', i, 'Nahlásit');
      } else if (p.kind === 'ubyreg') {
        var pr = b.persons || {}, exp = (b.adults || 0) + (b.children || []).length;
        html += probCard('warn', '📝 ' + esc(guestName(b)) + ' — registrace neúplná',
          'Zaregistrováno ' + (pr.registered || 0) + ' z ' + exp + ' osob. Jestli mezi chybějícími jsou cizinci, '
          + 'hlášení je potřeba' + (pr.arrival_deadline ? ' do ' + esc(fmtDay(pr.arrival_deadline)) : ' do 3 pracovních dnů od příjezdu')
          + ' — připomeň hostům registraci. Poplatek se počítá taky z registrací.', i, 'Otevřít');
      } else if (p.kind === 'feedue') {
        var late = today > p.fee.deadline;
        html += probCard(late || daysBetween(today, p.fee.deadline) <= 5 ? 'red' : 'soon',
          '💰 Odvést poplatek z pobytu za ' + esc(p.fee.label),
          (late ? '<b>Termín ' + esc(fmtDay(p.fee.deadline)) + ' uplynul.</b> ' : 'Splatné městu do ' + esc(fmtDay(p.fee.deadline)) + ' ')
          + 'Částku a evidenční knihu najdeš v přehledu poplatku; po zaplacení ho označ „Odvedeno“.', i, 'Přehled');
      }
    });
    if (activeConfl) {
      html += '<div class="prob prob-red"><div class="prob-main"><div class="prob-t">🔴 Aktivní konflikt v kalendáři</div>' +
        '<div class="prob-d">Detaily a řešení viz červený banner nahoře.</div></div></div>';
    }
    host.innerHTML = html;
    Array.prototype.forEach.call(host.querySelectorAll('[data-prob]'), function (btn) {
      btn.addEventListener('click', function () {
        var p = lastProblems[+btn.getAttribute('data-prob')];
        if (!p) return;
        if (p.kind === 'nocode') openEditor({ stay: p.stay, booking: p.stay.booking, focus: 'ed-phone', back: 'board' });
        else if (p.kind === 'feedue') openFeeReport(p.fee);
        else if (p.pay) openPayPicker(p.pay);
        else if (p.hold) openHoldEditor(p.hold);
        else openDetail(p.stay);
      });
    });
  }

  /* ============ PŘEDREZERVACE (vr_holds) ============ */
  // Vystavená zálohová faktura = předrezervace, která drží termín. Platba pak jen
  // rozhoduje, jestli přežije. Spouštěčem NENÍ platba: přesně tak zmizel termín
  // 14.–21. 8. 2027 — faktura vystavená i uhrazená, a v systému po ní nic.
  //
  // Propadnutí je LÍNÉ, bez cronu: vr_public_holds() propadlý hold prostě nevrátí,
  // takže se termín uvolní sám. Řádek zůstane a čeká, až majitel rozhodne —
  // zaplatit o dva dny později je běžné a tiché smazání blokace je ta chyba,
  // kterou tenhle modul řeší, jen obráceně.
  var ACCOUNTS = {
    VR_CZK:  'Villa Rudolf — korunový',
    VR_EUR:  'Villa Rudolf — eurový',
    SINTERA: 'Sintera — hlavní účet',
    JINY:    'jiný účet'
  };
  var HOLD_STATUS = {
    hold:      { label: '⏳ drží termín', tone: 'soon' },
    confirmed: { label: '✅ uhrazeno — rezervace', tone: 'ok' },
    expired:   { label: '⌛ propadlá', tone: 'muted' },
    cancelled: { label: '✕ zrušená', tone: 'muted' }
  };
  function accountLabel(a) { return ACCOUNTS[a] || (a ? String(a) : '—'); }
  function fmtMoney(amount, cur) {
    if (amount == null || amount === '') return '—';
    var n = Number(amount);
    if (isNaN(n)) return '—';
    return n.toLocaleString('cs-CZ', { maximumFractionDigits: 2 }) + ' ' + (cur === 'EUR' ? '€' : 'Kč');
  }
  // Hold, kterému uplynulo hold_until, už termín nedrží (server ho přestal publikovat).
  function holdExpired(h) { return h.status === 'hold' && h.hold_until && h.hold_until < isoToday(); }
  function holdOpen(h) { return h.status === 'hold' || h.status === 'confirmed'; }

  function loadHolds() {
    // Selhání nesmí shodit celý panel (stejně jako u konfliktů a žádostí). Dokud
    // v Supabase neproběhne migrace 20260909_vr_holds.sql, vrátí RPC 404 → [].
    return rpc('vr_admin_list_holds', {}).then(function (res) {
      return (res.data && res.data.ok && res.data.holds) ? res.data.holds : [];
    }).catch(function () { return []; });
  }

  // Je termín zablokovaný i na platformách? Dokud není, může ho kterýkoli kanál
  // prodat znovu — hub nás neochrání. Od 17. 9. 2026 ho blokuje kalendář sám:
  // přímý prodej, který Action publikovala do history.json, jde i do výstupních feedů
  // (data/out/*.ics), a ty si platformy importují. Blokace = přímý prodej je
  // v kalendáři pod svým uidh, NEBO termín kryje živý záznam z platformy (ruční
  // blokace). Ozvěnu z feedu už podle toho hledat nejde — kalendář ji od #17 zahazuje.
  // Archivní duch (stale, pobyt teprve má proběhnout) blokací není: z feedu vypadl.
  // Vlastní řádek musí nést AKTUÁLNÍ termín: po přesunu předrezervace drží kalendář
  // (a tím i výstupní feedy) do příštího běhu Action pořád ten starý.
  function blockedOnPlatform(h) {
    var today = isoToday();
    return calendar.some(function (c) {
      if (c.stale === true && c.end > today) return false;
      if (h.uidh && c.uidh === h.uidh) return c.start === h.arrival && c.end === h.departure;
      return c.platform !== 'Přímá' && c.start < h.departure && h.arrival < c.end;
    });
  }

  function holdCard(h, idx) {
    var st = HOLD_STATUS[h.status] || HOLD_STATUS.hold;
    var expired = holdExpired(h);
    var n = nights(h.arrival, h.departure);

    var tags = '<span class="hold-st hold-st-' + (expired ? 'muted' : st.tone) + '">'
      + (expired ? '⌛ propadla splatností' : st.label) + '</span>';
    if (h.channel) tags += '<span class="pill pill-plat">' + esc(h.channel) + '</span>';

    var lines = [];
    if (h.invoice_no || h.invoice_amount != null) {
      lines.push('🧾 ' + (h.invoice_no ? esc(h.invoice_no) + ' · ' : '')
        + fmtMoney(h.invoice_amount, h.invoice_currency)
        + (h.invoice_due ? ' · splatnost ' + esc(fmtDayShort(h.invoice_due)) : ''));
    }
    if (h.status === 'hold' && h.hold_until) {
      lines.push('⏳ drží do ' + esc(fmtDayShort(h.hold_until))
        + (expired ? ' — termín se už uvolnil' : ' (' + daysBetween(isoToday(), h.hold_until) + ' dní)'));
    }
    if (h.paid_at) {
      lines.push('💰 uhrazeno ' + esc(fmtWhen(h.paid_at))
        + (h.paid_amount != null ? ' · ' + fmtMoney(h.paid_amount, h.invoice_currency) : '')
        + (h.paid_account ? ' · ' + esc(accountLabel(h.paid_account)) : ''));
    }
    if (h.invoice_account) lines.push('🏦 faktura zní na: ' + esc(accountLabel(h.invoice_account)));
    if (h.guest_note) lines.push('👤 ' + esc(h.guest_note));

    // Pojistka na účet — hlásí se u karty i v sekci Problémy, ať se to nepřehlédne
    // v žádném z obou pohledů.
    var warn = '';
    if (h.account_mismatch) {
      warn += '<div class="hold-warn">🏦 ' + esc(h.account_mismatch)
        + ' — oprav fakturu, dokud ji host nezaplatil.</div>';
    }
    // Peníze dorazily jinam, než měly. Rezervaci to nezpochybňuje (host svoje
    // udělal), ale zůstává úkol přeúčtovat — a ten se jinde nikde neobjeví.
    if (h.paid_mismatch) {
      warn += '<div class="hold-warn">💸 Platba dorazila na cizí účet ('
        + esc(accountLabel(h.paid_account)) + ') — je potřeba přeúčtovat.</div>';
    }
    if (holdOpen(h) && !expired && !blockedOnPlatform(h)) {
      warn += '<div class="hold-warn hold-warn-soft">📅 Termín zatím není zablokovaný na platformách '
        + '— dokud nebude, může ho kterýkoli kanál prodat znovu.</div>';
    }

    var btns = '<button type="button" class="btn btn-sm btn-outline" data-hold-edit="' + idx + '">Upravit</button>'
      + '<a class="btn btn-sm btn-ghost" href="../smlouvy/?hold=' + encodeURIComponent(h.id) + '">📄 Smlouva</a>';
    if (h.status === 'hold') {
      btns = '<button type="button" class="btn btn-sm btn-primary" data-hold-paid="' + idx + '">Uhrazeno</button>'
        + (expired
            ? '<button type="button" class="btn btn-sm btn-outline" data-hold-extend="' + idx + '">Prodloužit</button>'
            : '')
        + '<button type="button" class="btn btn-sm btn-ghost" data-hold-drop="' + idx + '">Propadla</button>'
        + btns;
    }

    return '<div class="hold' + (expired ? ' hold-expired' : '')
      + (h.status === 'expired' || h.status === 'cancelled' ? ' hold-closed' : '') + '">'
      + '<div class="hold-main">'
      + '<div class="hold-t">' + esc(fmtShort(h.arrival, h.departure)) + ' <span class="hold-n">' + n + ' ' + nightWord(n) + '</span></div>'
      + '<div class="hold-tags">' + tags + '</div>'
      + (lines.length ? '<div class="hold-d">' + lines.join('<br>') + '</div>' : '')
      + warn
      + '</div><div class="hold-actions">' + btns + '</div></div>';
  }

  function renderHolds() {
    var panel = $('holds-panel'), host = $('holds'), toggle = $('btn-hold-closed');
    if (!panel || !host) return;
    if (!holds.length) { panel.hidden = true; return; }

    var open = [], closed = [];
    holds.forEach(function (h) { (holdOpen(h) ? open : closed).push(h); });
    if (toggle) {
      toggle.hidden = !closed.length;
      toggle.textContent = holdsShowClosed ? 'Skrýt uzavřené' : 'Uzavřené (' + closed.length + ')';
    }
    lastHolds = holdsShowClosed ? open.concat(closed) : open;
    if (!lastHolds.length) { panel.hidden = true; return; }
    panel.hidden = false;
    host.innerHTML = lastHolds.map(holdCard).join('');

    var on = function (attr, fn) {
      Array.prototype.forEach.call(host.querySelectorAll('[' + attr + ']'), function (btn) {
        btn.addEventListener('click', function () {
          var h = lastHolds[+btn.getAttribute(attr)];
          if (h) fn(h, btn);
        });
      });
    };
    on('data-hold-edit', function (h) { openHoldEditor(h); });
    on('data-hold-paid', function (h) { openPaidDialog(h); });
    on('data-hold-drop', function (h, btn) {
      if (!window.confirm('Označit předrezervaci ' + fmtShort(h.arrival, h.departure)
          + ' jako propadlou? Termín se uvolní, ale záznam o vystavené faktuře zůstane.')) return;
      btn.disabled = true;
      setHoldStatus(h, 'expired', null, null, null, 'Předrezervace propadla, termín je volný.');
    });
    on('data-hold-extend', function (h, btn) {
      btn.disabled = true;
      setHoldStatus(h, 'hold', addDaysISO(isoToday(), 14), null, null, 'Prodlouženo o 14 dní.');
    });
  }

  function setHoldStatus(h, status, until, paidAmount, paidAccount, okMsg) {
    return rpc('vr_admin_set_hold_status', {
      p_id: h.id, p_status: status, p_hold_until: until || null,
      p_paid_amount: paidAmount == null ? null : paidAmount,
      p_paid_account: paidAccount || null
    }).then(function (res) {
      if (res.data && res.data.ok) { toast(okMsg || 'Uloženo.'); return reload(); }
      toast('Uložení se nepodařilo.');
    }).catch(function () { toast('Uložení se nepodařilo.'); });
  }

  // „Uhrazeno" se ptá i na to, KAM peníze dorazily. Kvůli tomu, že se faktura dá
  // vystavit na hlavní účet Sintery: platba je pak z pohledu hosta v pořádku,
  // ale musí se přeúčtovat — a to je vidět jen tehdy, když se to někam zapíše.
  function openPaidDialog(h) {
    $('sheet-title').textContent = 'Uhrazeno — potvrdit rezervaci';
    var expect = h.invoice_account || (h.invoice_currency === 'EUR' ? 'VR_EUR' : 'VR_CZK');
    $('sheet-body').innerHTML =
      '<form id="hp-form" autocomplete="off">' +
      '<div class="notice">' + esc(fmtShort(h.arrival, h.departure)) + ' · '
        + esc(fmtMoney(h.invoice_amount, h.invoice_currency))
        + (h.invoice_no ? ' · faktura ' + esc(h.invoice_no) : '') + '</div>' +
      '<div class="row2">' +
      '<div class="field"><label>Přišlo (částka)</label><input id="hp-amount" type="number" step="0.01" min="0" value="'
        + esc(h.invoice_amount == null ? '' : h.invoice_amount) + '"></div>' +
      '<div class="field"><label>Na účet</label><select id="hp-account">' +
      Object.keys(ACCOUNTS).map(function (k) {
        return '<option value="' + k + '"' + (k === expect ? ' selected' : '') + '>' + esc(ACCOUNTS[k]) + '</option>';
      }).join('') + '</select></div>' +
      '</div>' +
      '<p class="hint" id="hp-hint"></p>' +
      '<button type="submit" class="btn btn-primary" id="hp-save" style="width:100%">Potvrdit rezervaci</button>' +
      '</form>';
    openOverlay();

    var accEl = $('hp-account'), hintEl = $('hp-hint');
    function accFeedback() {
      var mism = accountMismatch(h.invoice_currency, accEl.value);
      if (mism) {
        hintEl.className = 'hint phone-bad';
        hintEl.textContent = '⚠︎ Peníze přišly jinam, než měly: ' + mism
          + '. Rezervaci to potvrdí (host svoje udělal), ale bude potřeba přeúčtovat.';
      } else {
        hintEl.className = 'hint phone-ok';
        hintEl.textContent = '✓ Účet sedí s měnou faktury.';
      }
    }
    accEl.addEventListener('change', accFeedback);
    accFeedback();

    $('hp-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var btn = $('hp-save'); btn.disabled = true; btn.textContent = 'Ukládám…';
      var amt = $('hp-amount').value === '' ? null : Number($('hp-amount').value);
      setHoldStatus(h, 'confirmed', null, amt, accEl.value, 'Potvrzeno — z předrezervace je rezervace.')
        .then(closeOverlay);
    });
  }

  // Stejné pravidlo jako vr_hold_account_mismatch() v databázi. Klient ho počítá
  // sám, aby uměl varovat DŘÍV, než se cokoli uloží — server je pak druhá vrstva.
  function accountMismatch(currency, account) {
    if (!currency || !account) return null;
    if (account === 'SINTERA') return 'faktura zní na hlavní účet Sintery, ne na účet Villa Rudolf';
    if (account === 'JINY') return 'faktura zní na jiný než villový účet';
    if (currency === 'CZK' && account !== 'VR_CZK') return 'faktura je v CZK, ale nezní na korunový účet Villa Rudolf';
    if (currency === 'EUR' && account !== 'VR_EUR') return 'faktura je v EUR, ale nezní na eurový účet Villa Rudolf';
    return null;
  }

  function openHoldEditor(h) {
    h = h || null;
    var isEdit = !!h;
    $('sheet-title').textContent = isEdit ? 'Upravit předrezervaci' : 'Nová předrezervace';
    var v = function (k, d) { return h && h[k] != null ? h[k] : (d == null ? '' : d); };
    var sel = function (val, cur) { return val === cur ? ' selected' : ''; };

    $('sheet-body').innerHTML =
      '<form id="hd-form" autocomplete="off">' +
      '<div class="notice">Předrezervaci zakládej ve chvíli, kdy <b>vystavíš zálohovou fakturu</b>. ' +
      'Od té chvíle termín drží — v kalendáři, v majitelském přehledu i ve veřejné dostupnosti na webu.</div>' +
      '<div class="row2">' +
      '<div class="field"><label>Příjezd</label><input id="hd-arrival" type="date" value="' + esc(v('arrival')) + '"></div>' +
      '<div class="field"><label>Odjezd</label><input id="hd-departure" type="date" value="' + esc(v('departure')) + '"></div>' +
      '</div>' +
      '<div class="row2">' +
      '<div class="field"><label>Odkud poptávka</label><select id="hd-channel">' +
      ['Přímá', 'E-chalupy', 'Telefon', 'E-mail', 'Airbnb', 'Booking.com', 'Fewo-direkt'].map(function (c) {
        return '<option value="' + esc(c) + '"' + sel(c, v('channel', 'Přímá')) + '>' + esc(c) + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>Host (interní poznámka)</label><input id="hd-guest" maxlength="120" value="' + esc(v('guest_note')) + '"></div>' +
      '</div>' +
      '<div class="field"><label>Číslo zálohové faktury</label><input id="hd-invno" maxlength="60" placeholder="např. 2026-0142" value="' + esc(v('invoice_no')) + '"></div>' +
      '<div class="row2">' +
      '<div class="field"><label>Částka</label><input id="hd-amount" type="number" step="0.01" min="0" value="' + esc(v('invoice_amount')) + '"></div>' +
      '<div class="field"><label>Měna</label><select id="hd-currency">' +
      ['CZK', 'EUR'].map(function (c) { return '<option value="' + c + '"' + sel(c, v('invoice_currency', 'CZK')) + '>' + c + '</option>'; }).join('') +
      '</select></div>' +
      '</div>' +
      '<div class="row2">' +
      '<div class="field"><label>Vystavena</label><input id="hd-issued" type="date" value="' + esc(v('invoice_issued', isoToday())) + '"></div>' +
      '<div class="field"><label>Splatnost</label><input id="hd-due" type="date" value="' + esc(v('invoice_due')) + '"></div>' +
      '</div>' +
      '<div class="field"><label>Faktura zní na účet</label><select id="hd-account">' +
      Object.keys(ACCOUNTS).map(function (k) {
        return '<option value="' + k + '"' + sel(k, v('invoice_account', 'VR_CZK')) + '>' + esc(ACCOUNTS[k]) + '</option>';
      }).join('') + '</select>' +
      '<p class="hint" id="hd-acc-info"></p></div>' +
      '<div class="field"><label>Drží termín do</label><input id="hd-until" type="date" value="' + esc(v('hold_until')) + '">' +
      '<p class="hint">Nevyplněné = splatnost + 3 dny (převod přes víkend dorazí až v pondělí). Bez splatnosti 14 dní.</p></div>' +
      '<div class="field"><label>Poznámka</label><textarea id="hd-note" maxlength="500">' + esc(v('note')) + '</textarea></div>' +
      '<p class="form-err" id="hd-err" hidden></p>' +
      '<button type="submit" class="btn btn-primary" id="hd-save" style="width:100%">' +
      (isEdit ? 'Uložit změny' : 'Založit předrezervaci') + '</button>' +
      (isEdit ? '<button type="button" class="btn btn-danger" id="hd-del" style="width:100%;margin-top:10px">Smazat záznam</button>' : '') +
      '</form>';
    openOverlay();

    // Pojistka na účet živě při psaní — ne až po uložení. Faktura se opravuje
    // levně jen do chvíle, než ji host dostane.
    var curEl = $('hd-currency'), accEl = $('hd-account'), accInfo = $('hd-acc-info');
    function accFeedback() {
      var mism = accountMismatch(curEl.value, accEl.value);
      if (mism) {
        accInfo.className = 'hint phone-bad';
        accInfo.textContent = '⚠︎ ' + mism + '. Zkontroluj v iDokladu, na jaký účet je faktura vystavená.';
      } else {
        accInfo.className = 'hint phone-ok';
        accInfo.textContent = '✓ Účet sedí s měnou faktury.';
      }
    }
    curEl.addEventListener('change', accFeedback);
    accEl.addEventListener('change', accFeedback);
    accFeedback();

    $('hd-form').addEventListener('submit', function (ev) { ev.preventDefault(); saveHold(h); });
    if (isEdit) {
      $('hd-del').addEventListener('click', function () {
        if (!window.confirm('Smazat záznam úplně? Pro propadlou předrezervaci použij radši „Propadla“ — '
          + 'termín se uvolní a doklad o vystavené faktuře zůstane.')) return;
        rpc('vr_admin_delete_hold', { p_id: h.id }).then(function (res) {
          if (res.data && res.data.ok) { toast('Smazáno.'); reload().then(closeOverlay); }
          else toast('Smazání se nepodařilo.');
        });
      });
    }
  }

  function saveHold(existing) {
    var err = $('hd-err'); err.hidden = true;
    var arrival = $('hd-arrival').value, departure = $('hd-departure').value;
    if (!arrival || !departure) { err.textContent = 'Vyplňte příjezd i odjezd.'; err.hidden = false; return; }
    if (departure <= arrival) { err.textContent = 'Odjezd musí být po příjezdu.'; err.hidden = false; return; }

    var num = function (id) { var x = $(id).value; return x === '' ? null : Number(x); };
    var payload = {
      p_id: existing ? existing.id : null,
      p_arrival: arrival,
      p_departure: departure,
      p_status: existing ? existing.status : 'hold',
      p_hold_until: $('hd-until').value || null,
      p_channel: $('hd-channel').value,
      p_guest_note: $('hd-guest').value.trim(),
      p_invoice_no: $('hd-invno').value.trim(),
      p_invoice_amount: num('hd-amount'),
      p_invoice_currency: $('hd-currency').value,
      p_invoice_issued: $('hd-issued').value || null,
      p_invoice_due: $('hd-due').value || null,
      p_invoice_account: $('hd-account').value,
      p_note: $('hd-note').value.trim(),
      // vr_admin_upsert_hold při úpravě přepíše OBĚ vazby tím, co přijde — bez nich
      // by každé „Upravit" odpojilo předrezervaci od pobytu (hosta) i od poptávky.
      p_booking_id: existing ? (existing.booking_id || null) : null,
      p_request_id: existing ? (existing.request_id || null) : null
    };
    var btn = $('hd-save'); btn.disabled = true; btn.textContent = 'Ukládám…';
    rpc('vr_admin_upsert_hold', payload).then(function (res) {
      var d = res.data || {};
      if (!d.ok) {
        err.textContent = mapErr(d.error || d.message); err.hidden = false;
        btn.disabled = false; btn.textContent = existing ? 'Uložit změny' : 'Založit předrezervaci';
        return;
      }
      toast(existing ? 'Uloženo.' : 'Předrezervace založena — termín drží.');
      reload().then(closeOverlay);
    }).catch(function () {
      err.textContent = 'Uložení se nepodařilo. Zkuste to znovu.'; err.hidden = false;
      btn.disabled = false; btn.textContent = existing ? 'Uložit změny' : 'Založit předrezervaci';
    });
  }

  /* ============ PLATBY (vr_payments) ============ */
  // Pohyby ze tří účtů u Fia (n8n, VrPaymentWatch) spárované na předrezervace.
  // Sem patří jen to, co čeká na člověka:
  //   * NÁVRH — spárováno, ale nepotvrzeno (dokud se párování neusadí, běží
  //     ingest s p_autoconfirm=false a všechno je návrh),
  //   * NEPŘIŘAZENO — platba, ke které se nenašla faktura. Přesně ten původní
  //     případ: peníze v bance viděné, ale rezervace z nich nevznikla.
  var PAY_HOW = {
    vs_exact:          'variabilní symbol i částka sedí',
    ref_exact:         'číslo faktury v textu platby, částka sedí',
    vs_amount_differs: 'variabilní symbol sedí, částka ne',
    amount_window:     'sedí částka i termín, variabilní symbol chybí',
    ruka:              'přiřazeno ručně'
  };

  function loadPayments() {
    // Bez migrace 20260910_vr_payments.sql vrátí RPC 404 → prázdno, sekce se neukáže.
    return rpc('vr_admin_list_payments', {}).then(function (res) {
      return (res.data && res.data.ok && res.data.payments) ? res.data.payments : [];
    }).catch(function () { return []; });
  }

  function payNeedsMe(p) {
    if (p.ignored_at) return false;
    return !p.matched_hold || !p.confirmed;
  }

  function payCard(p, idx) {
    var unmatched = !p.matched_hold;
    var lines = [];
    lines.push('🏦 ' + esc(accountLabel(p.account)) + ' · ' + esc(fmtDayShort(p.booked_on))
      + (p.vs ? ' · VS ' + esc(p.vs) : ' · bez variabilního symbolu'));
    if (p.counterparty) lines.push('👤 ' + esc(p.counterparty));
    if (p.message) lines.push('✉️ ' + esc(p.message));
    if (!unmatched) {
      lines.push('🧾 navrženo k faktuře ' + esc(p.hold_invoice_no || '—')
        + ' · ' + esc(fmtShort(p.hold_arrival, p.hold_departure))
        + ' · ' + esc(PAY_HOW[p.matched_how] || p.matched_how || ''));
    }

    var btns = '';
    if (!unmatched) btns += '<button type="button" class="btn btn-sm btn-primary" data-pay-ok="' + idx + '">Potvrdit</button>';
    btns += '<button type="button" class="btn btn-sm btn-outline" data-pay-pick="' + idx + '">'
      + (unmatched ? 'Přiřadit' : 'Jinam') + '</button>';
    btns += '<button type="button" class="btn btn-sm btn-ghost" data-pay-skip="' + idx + '">Nepatří sem</button>';

    return '<div class="pay' + (unmatched ? ' pay-open' : '') + '">'
      + '<div class="pay-main">'
      + '<div class="pay-t">' + esc(fmtMoney(p.amount, p.currency))
      + '<span class="pay-st">' + (unmatched ? '❓ nepřiřazeno' : '📎 návrh k odklepnutí') + '</span></div>'
      + '<div class="pay-d">' + lines.join('<br>') + '</div>'
      + '</div><div class="pay-actions">' + btns + '</div></div>';
  }

  function renderPayments() {
    var panel = $('pays-panel'), host = $('pays');
    if (!panel || !host) return;
    lastPays = payments.filter(payNeedsMe);
    if (!lastPays.length) { panel.hidden = true; return; }
    panel.hidden = false;
    host.innerHTML = lastPays.map(payCard).join('');

    var on = function (attr, fn) {
      Array.prototype.forEach.call(host.querySelectorAll('[' + attr + ']'), function (btn) {
        btn.addEventListener('click', function () {
          var p = lastPays[+btn.getAttribute(attr)];
          if (p) fn(p, btn);
        });
      });
    };
    on('data-pay-ok', function (p, btn) { btn.disabled = true; assignPayment(p, p.matched_hold, true); });
    on('data-pay-pick', function (p) { openPayPicker(p); });
    on('data-pay-skip', function (p, btn) {
      if (!window.confirm('Označit platbu ' + fmtMoney(p.amount, p.currency)
          + ' jako nesouvisející s vilou? Zůstane uložená, jen zmizí ze seznamu.')) return;
      btn.disabled = true;
      rpc('vr_admin_ignore_payment', { p_id: p.id }).then(function (res) {
        if (res.data && res.data.ok) { toast('Odloženo.'); reload(); }
        else { btn.disabled = false; toast('Uložení se nepodařilo.'); }
      }).catch(function () { btn.disabled = false; toast('Uložení se nepodařilo.'); });
    });
  }

  function assignPayment(p, holdId, confirm) {
    return rpc('vr_admin_assign_payment', { p_id: p.id, p_hold_id: holdId, p_confirm: !!confirm })
      .then(function (res) {
        if (res.data && res.data.ok) {
          toast(confirm ? 'Potvrzeno — z předrezervace je rezervace.' : 'Platba přiřazena.');
          return reload();
        }
        toast('Uložení se nepodařilo.');
      }).catch(function () { toast('Uložení se nepodařilo.'); });
  }

  // Ruční přiřazení: nabídne se jen to, co dává smysl — otevřené předrezervace
  // a přímé rezervace. Řadí se podle příjezdu, ne podle částky: hledá se termín.
  function openPayPicker(p) {
    var open = holds.filter(holdOpen);
    $('sheet-title').textContent = 'Přiřadit platbu';
    $('sheet-body').innerHTML =
      '<div class="notice">' + esc(fmtMoney(p.amount, p.currency)) + ' · '
      + esc(accountLabel(p.account)) + ' · ' + esc(fmtDayShort(p.booked_on))
      + (p.vs ? ' · VS ' + esc(p.vs) : '') + (p.counterparty ? ' · ' + esc(p.counterparty) : '') + '</div>'
      + (open.length
        ? '<div class="picklist">' + open.map(function (h, i) {
            return '<button type="button" class="pick" data-pick="' + i + '">'
              + '<b>' + esc(fmtShort(h.arrival, h.departure)) + '</b>'
              + '<span>' + esc(h.invoice_no || 'bez čísla faktury') + ' · '
              + esc(fmtMoney(h.invoice_amount, h.invoice_currency))
              + ' · ' + esc((HOLD_STATUS[h.status] || {}).label || h.status) + '</span></button>';
          }).join('') + '</div>'
        : '<p class="hint">Žádná otevřená předrezervace. Nejdřív ji založ tlačítkem „+ Předrezervace".</p>')
      + '<p class="hint">Potvrzením se z předrezervace stane rezervace a zapíše se, na který účet '
      + 'platba dorazila — když je to cizí účet, objeví se úkol přeúčtovat.</p>';
    openOverlay();
    Array.prototype.forEach.call($('sheet-body').querySelectorAll('[data-pick]'), function (btn) {
      btn.addEventListener('click', function () {
        var h = open[+btn.getAttribute('data-pick')];
        if (!h) return;
        btn.disabled = true;
        assignPayment(p, h.id, true).then(closeOverlay);
      });
    });
  }

  /* ============ Značky ve vr_msglog (odesláno, přeskočeno, odpověď hosta) ============ */
  // Všechno, co si /sprava/ o zprávách pamatuje, je řádek ve vr_msglog (booking_id,
  // msg_key, sent_at) — RPC bere libovolný klíč, takže nové stavy nepotřebují migraci:
  //   <krok>          zpráva odeslaná            skip_<krok>   krok už nemá smysl, vyřízeno
  //   reply_ok/risk   host odpověděl: jede/váhá  guests_ok     počty osob zapsal majitel
  //   arrive_HHMM, fee_*  podmínky pobytu        deposit_enabled, yale_set  (starší značky)
  function setLog(b, key, on) {
    on = !!on;
    if (on === hasLog(b, key) && !on) return Promise.resolve();
    return rpc('vr_admin_msg_log', { p_booking_id: b.id, p_msg_key: key, p_sent: on }).then(function (res) {
      if (!(res.data && res.data.ok)) throw new Error((res.data && (res.data.error || res.data.message)) || 'save_failed');
      b.msglog = (b.msglog || []).filter(function (m) { return m.msg_key !== key; });
      if (on) b.msglog.push({ msg_key: key, sent_at: new Date().toISOString() });
    });
  }
  // Odškrtnutí kroku smaže i jeho starý klíč (legacy) a případné „přeskočeno".
  function setStepSent(b, msg, on) {
    var p = setLog(b, msg.key, on);
    if (on) return p;
    return p.then(function () { return msg.legacy ? setLog(b, msg.legacy, false) : null; })
      .then(function () { return setLog(b, 'skip_' + msg.key, false); });
  }

  /* ============ Odpověď hosta (ruční v1) ============ */
  // První ozvěna má jediný smysl: zahájit konverzaci a včas poznat, kdo váhá. Zjistit
  // to tři měsíce předem je obrovský rozdíl proti týdnu. Odpovědi chodí WhatsAppem
  // nebo přes platformu a systém je nečte — majitel jedním klikem zapíše, jak to
  // dopadlo. Kdo váhá, svítí v „Dnes na řadě". Mlčícím se systém NEPŘIPOMÍNÁ (Pavel
  // 13. 10. 2026: nic dalšího písemně) — jen je to vidět na značce u pobytu.
  function replyState(b) { return hasLog(b, 'reply_ok') ? 'ok' : (hasLog(b, 'reply_risk') ? 'risk' : 'none'); }
  function setReply(b, state) {
    return setLog(b, 'reply_ok', state === 'ok').then(function () { return setLog(b, 'reply_risk', state === 'risk'); });
  }
  function isoDateOf(ts) {
    var d = new Date(ts);
    if (isNaN(d)) return null;
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // Kolik dní host mlčí od první ozvěny. null = ozvěna neodešla.
  function silentDays(b, today) {
    var first = sentMap(b).first;
    if (!first) return null;
    var from = typeof first === 'string' ? isoDateOf(first) : null;
    return from ? daysBetween(from, today) : null;
  }
  function replyPill(b, today) {
    var st = replyState(b);
    if (st === 'ok') return '<span class="pill pill-ok">✅ jede</span>';
    if (st === 'risk') return '<span class="pill pill-risk">⚠️ váhá</span>';
    var n = silentDays(b, today);
    if (n == null || b.arrival <= today) return '';
    return '<span class="pill pill-wait">💬 bez odpovědi' + (n > 0 ? ' ' + n + ' d' : '') + '</span>';
  }

  /* ============ Render: DNES ============ */
  // Vrací { tasks, stale }. stale = kroky, které už nedávají smysl (první ozvěna pár
  // dní před příjezdem, uvítací zpráva a doplatková faktura u pobytu, který už začal…). Nejsou to dluhy:
  // v seznamu nestraší jeden po druhém, dole je pro ně jedno tlačítko.
  function collectTasks() {
    var today = isoToday();
    var tasks = [], stale = [];
    stays.forEach(function (s) {
      if (!s.booking) return; // pobyt bez hosta řeší „Co doplnit"
      var b = s.booking;
      var sent = sentMap(b);
      // 🔑 Yale: den před příjezdem a v den příjezdu. Kód zakládá HA sám — když ho hlásí
      //    v zámku, je tu jen informace (bez Hotovo); úkol pro majitele jen, když v zámku není.
      if (doorCodeFor(b) && today >= addDaysISO(b.arrival, -1) && today <= b.arrival) {
        var ls = lockState(b);
        if (ls.ok || !sent.yale_set)
          tasks.push({ stay: s, booking: b, yale: true, lock: ls, date: addDaysISO(b.arrival, -1) });
      }
      sequenceFor(b).forEach(function (msg) {
        var st = stepState(msg, b, sent, today);
        if (st === 'sent' || st === 'future') return;
        if (!msg.ownerTask && !phoneUsable(b)) return; // bez použitelného telefonu → „Co doplnit"
        if (st === 'stale') { if (!sent['skip_' + msg.key]) stale.push({ stay: s, booking: b, msg: msg }); return; }
        tasks.push({ stay: s, booking: b, msg: msg, date: schedDate(msg, b), overdue: st === 'overdue' });
      });
      // ⚠️ host váhá — svítí nahoře, dokud se stav nezmění nebo pobyt nezačne.
      if (replyState(b) === 'risk' && b.arrival > today) tasks.push({ stay: s, booking: b, risk: true, date: '' });
    });
    // řazení: váhající nahoře, pak podle data úkolu; při shodě dřívější příjezd napřed
    tasks.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return a.booking.arrival < b.booking.arrival ? -1 : a.booking.arrival > b.booking.arrival ? 1 : 0;
    });
    return { tasks: tasks, stale: stale };
  }

  function taskBtn(cls, label, onclick) {
    var el = document.createElement('button');
    el.type = 'button'; el.className = 'btn btn-sm ' + cls; el.textContent = label;
    el.onclick = function () { onclick(el); };
    return el;
  }
  function waBtn(b, text, label) {
    var a = document.createElement('a');
    a.className = 'btn btn-sm btn-wa'; a.textContent = label || 'WhatsApp';
    a.href = text == null ? 'https://wa.me/' + waPhone(b) : waLink(b, text);
    a.target = '_blank'; a.rel = 'noopener';
    return a;
  }
  // Uloží značku a překreslí přehledy; při chybě vrátí tlačítko do hry.
  function logAndRefresh(btn, promise, okMsg) {
    btn.disabled = true;
    promise.then(function () { toast(okMsg); refreshBoards(); })
      .catch(function () { btn.disabled = false; toast('Nepodařilo se uložit.'); });
  }
  function arrivesIn(b, today) {
    var n = daysBetween(today, b.arrival);
    return n > 0 ? 'příjezd za ' + n + ' dní' : (b.departure >= today ? 'pobyt běží' : 'po odjezdu');
  }

  function renderToday() {
    var wrap = $('today-list');
    var panel = $('today-panel');
    var today = isoToday();
    $('today-date').textContent = (function () {
      var d = new Date(); return d.getDate() + '. ' + MONTH_GEN[d.getMonth()] + ' ' + d.getFullYear();
    })();
    var col = collectTasks(), tasks = col.tasks, stale = col.stale;
    wrap.innerHTML = '';
    panel.hidden = false;
    $('today-empty').hidden = !!(tasks.length || stale.length);

    tasks.forEach(function (t) {
      var row = document.createElement('div');
      var b = t.booking;
      var detailBtn = function () { return taskBtn('btn-outline', 'Detail', function () { openDetail(t.stay); }); };
      if (t.yale) {
        // 🔑 Yale — kód zakládá HA; tady je stav z HA, úkol jen když kód v zámku chybí.
        var code = doorCodeFor(b), ls = t.lock;
        if (ls.ok) {
          row.className = 'task lock-ok';
          row.innerHTML =
            '<div class="task-main"><div class="task-name">' + esc(guestName(b)) + '</div>' +
            '<div class="task-what">🔑 ' + esc(ls.text) + '</div>' +
            '<span class="task-when ok">Zámek</span></div>' +
            '<div class="task-actions"></div>';
          row.querySelector('.task-actions').appendChild(detailBtn());
          wrap.appendChild(row);
          return;
        }
        row.className = 'task owner warn';
        row.innerHTML =
          '<div class="task-main"><div class="task-name">' + esc(guestName(b)) + '</div>' +
          '<div class="task-what">⚠️ ' + esc(ls.known ? 'Kód v zámku: ' + ls.text : ls.text) + '</div>' +
          '<div class="task-what">🔑 Nastav v appce Yale Home: kód <b>' + esc(code) + '</b>, platnost ' +
            esc(fmtDay(b.arrival)) + ' 15:00 – ' + esc(fmtDay(b.departure)) + ' 10:00</div>' +
          '<span class="task-when warn">Yale</span></div>' +
          '<div class="task-actions"></div>';
        var ay = row.querySelector('.task-actions');
        ay.appendChild(taskBtn('btn-primary', 'Hotovo', function (btn) {
          logAndRefresh(btn, setLog(b, 'yale_set', true), 'Yale kód označen jako nastavený.');
        }));
        ay.appendChild(detailBtn());
        wrap.appendChild(row);
        return;
      }
      if (t.risk) {
        // ⚠️ host váhá — zůstává nahoře, dokud se stav nezmění (nebo pobyt nezačne).
        row.className = 'task risk';
        row.innerHTML =
          '<div class="task-main"><div class="task-name">' + esc(guestName(b)) + '</div>' +
          '<div class="task-what">⚠️ Váhá — ozvi se a počítej s možným stornem · ' + esc(fmtShort(b.arrival, b.departure)) + ' · ' + esc(arrivesIn(b, today)) + '</div>' +
          '<span class="task-when risk">váhá</span></div>' +
          '<div class="task-actions"></div>';
        var ar = row.querySelector('.task-actions');
        if (phoneUsable(b)) ar.appendChild(waBtn(b, null));
        ar.appendChild(taskBtn('btn-outline', '✓ Jede', function (btn) {
          logAndRefresh(btn, setReply(b, 'ok'), 'Zapsáno: host jede.');
        }));
        ar.appendChild(detailBtn());
        wrap.appendChild(row);
        return;
      }
      var ctx = buildCtx(b);
      var parts = buildParts(t.msg, ctx, b);
      var ownerTask = !!t.msg.ownerTask;
      var p0 = parts[0], blocked = '';
      if (!ownerTask && p0.needsCode) blocked = 'Chybí telefon i kód dveří — doplň ho v detailu.';
      else if (!ownerTask && p0.needsToken) blocked = 'Chybí trvalý odkaz hosta — vytvoř ho jedním klikem.';
      else if (!ownerTask && p0.needsWifi) blocked = 'V Nastavení chybí heslo Wi-Fi — ve zprávě by zůstalo {WIFI_HESLO}.';
      row.className = 'task' + (t.overdue ? ' overdue' : '') + (ownerTask ? ' owner' : '');
      row.innerHTML =
        '<div class="task-main"><div class="task-name">' + esc(guestName(b)) + '</div>' +
        '<div class="task-what">' + (ownerTask ? '🔁 ' : '') + esc(t.msg.title) + (ownerTask ? '' : ' · ' + esc(msgLang(b).toUpperCase())) +
        ' · ' + esc(arrivesIn(b, today)) + '</div>' +
        (blocked ? '<div class="task-what task-block">' + esc(blocked) + '</div>' : '') +
        '<span class="task-when ' + (t.overdue ? 'overdue' : 'today') + '">' +
        (t.overdue ? 'po termínu' : (t.msg.asap ? 'na řadě' : 'dnes')) + '</span></div>' +
        '<div class="task-actions"></div>';
      var act = row.querySelector('.task-actions');
      if (ownerTask) {
        // Úkol jen pro majitele (vratka kauce, doplatková faktura) — bez zprávy hostovi.
        act.appendChild(taskBtn('btn-primary', 'Hotovo', function (btn) {
          logAndRefresh(btn, setLog(b, t.msg.key, true), 'Označeno jako hotové.');
        }));
      } else if (blocked && p0.needsToken && !p0.needsCode) {
        act.appendChild(taskBtn('btn-primary', '🔗 Vytvořit odkaz', function (btn) {
          logAndRefresh(btn, makeToken(b), 'Trvalý odkaz vytvořen.');
        }));
      } else if (blocked && p0.needsWifi && !p0.needsCode) {
        act.appendChild(taskBtn('btn-primary', '📶 Doplnit Wi-Fi', function () { openSettings('set-wifi_password'); }));
      } else if (!blocked) {
        if (isPlatform(b)) {
          // Celý text patří na platformu (pojistka při škodě), WhatsApp je osobní kanál:
          // u prvních dvou zpráv jen krátká průvodní, pozdější krátké zprávy celé.
          act.appendChild(taskBtn('btn-primary', '📋 Pro ' + ctx.platforma, function () {
            copyText(plainText(p0.text)); toast('Zkopírováno — vlož do zprávy na ' + ctx.platforma + '.');
          }));
          act.appendChild(waBtn(b, hasCover(t.msg, b) ? coverText(ctx, b) : p0.text, hasCover(t.msg, b) ? 'WhatsApp (průvodní)' : 'WhatsApp'));
        } else {
          act.appendChild(waBtn(b, p0.text));
        }
        // Odesláno jde odkliknout rovnou tady — dřív to šlo jen v detailu, a tak se
        // neodklikávalo a v seznamu visely týdny staré „dluhy".
        act.appendChild(taskBtn('btn-outline', '✓ Odesláno', function (btn) {
          logAndRefresh(btn, setStepSent(b, t.msg, true), 'Označeno jako odeslané.');
        }));
      }
      act.appendChild(detailBtn());
      wrap.appendChild(row);
    });

    if (stale.length) {
      var sr = document.createElement('div');
      sr.className = 'task stale';
      var names = stale.slice(0, 4).map(function (x) { return esc(guestName(x.booking)) + ' (' + esc(x.msg.title.replace(/ \(.*$/, '')) + ')'; }).join(', ');
      sr.innerHTML =
        '<div class="task-main"><div class="task-name">' + stale.length + ' ' + (stale.length === 1 ? 'starší úkol už nedává' : (stale.length <= 4 ? 'starší úkoly už nedávají' : 'starších úkolů už nedává')) + ' smysl</div>' +
        '<div class="task-what">' + names + (stale.length > 4 ? ' a další' : '') + '. Pobyt mezitím začal nebo je těsně před příjezdem — není to dluh.</div></div>' +
        '<div class="task-actions"></div>';
      sr.querySelector('.task-actions').appendChild(taskBtn('btn-outline', 'Označit starší jako vyřízené', function (btn) {
        btn.disabled = true; btn.textContent = 'Ukládám…';
        // Po jednom, ne naráz: admin RPC mají limit 120 volání za hodinu.
        stale.reduce(function (p, x) {
          return p.then(function () { return setLog(x.booking, 'skip_' + x.msg.key, true); });
        }, Promise.resolve()).then(function () { toast('Starší úkoly označené jako vyřízené.'); })
          .catch(function () { toast('Část se nepodařila uložit — zkus to znovu.'); })
          .then(refreshBoards);
      }));
      wrap.appendChild(sr);
    }
  }

  /* ============ Render: CO DOPLNIT ============ */
  // Jedna tabulka, řádek = pobyt, sloupec „Chybí" s čipy jen toho, co opravdu chybí;
  // klik na čip otevře rovnou to pole. Pobyt, kterému nic nechybí, se neukáže — jen
  // se započte do souhrnu. Vzniklo 11. 10. 2026 z výtky „systém mě buzeruje": mezery
  // byly rozházené po kartách pobytů a v Problémech a muselo se chodit host po hostovi.
  //
  // Co se NEHLÁSÍ: e-mail (platformy ho nedávají), kód dveří, který jde odvodit
  // z telefonu (zámek i registrace z lednice si ho berou samy), a čas příjezdu
  // (má výchozí 15:00).
  var lastTodo = [];
  // null = pobyt se do přehledu nepočítá (servisní blok, nezaplacená předrezervace).
  function missingFor(s, today) {
    var b = s.booking;
    if (!b) {
      if (s.hold && s.hold.status === 'hold') return null;   // host se doplňuje až po zaplacení
      var vs = verifiedStatus(s);
      if (vs === 'service' || vs === 'unconfirmed') return null;
      return [{ k: 'guest', label: 'host a telefon', title: 'Termín je v kalendáři obsazený, ale nevíme kým.' }];
    }
    var out = [];
    if (!phoneUsable(b)) out.push(phoneDigits(b.phone)
      ? { k: 'phone', label: 'telefon nejde použít', title: 'Z čísla nejde složit mezinárodní tvar — WhatsApp odkaz z něj nevznikne.' }
      : { k: 'phone', label: 'telefon', title: 'Bez telefonu nejde poslat zprávu ani odvodit kód dveří.' });
    if (!adultsKnown(b)) out.push({ k: 'adults', label: 'počet dospělých', title: 'Podle něj se hlídá, jestli se zapsali všichni, a odhaduje poplatek.' });
    if (!kidsAgesKnown(b)) out.push({ k: 'kids', label: 'věky dětí', title: 'Podle věku se řadí tipy na výlety a chystají postýlky.' });
    if (needsToken(s, today)) out.push({ k: 'token', label: 'trvalý odkaz', title: 'Bez něj nejde sestavit uvítací zpráva (odkaz na výlety podle počasí).' });
    // Jak host platí poplatek obci — věta v uvítací zprávě. Dokud zpráva neodešla.
    if (!feeMode(b) && s.start > today && !sentMap(b).welcome)
      out.push({ k: 'fee', label: 'jak se platí poplatek', title: 'Na místě, v ceně rezervace, nebo z kauce? Bez toho uvítací zpráva o placení mlčí.' });
    return out;
  }
  // Trvalý odkaz chybí pobytům založeným před 15. 9. 2026 (token_enc). Nabízí se jen
  // tam, kde nový odkaz nic nerozbije: pobyt ještě nezačal a uvítací zpráva neodešla —
  // regenerace totiž zneplatní odkaz, který by host už měl.
  function needsToken(s, today) {
    var b = s.booking;
    return !!b && !b.token && s.start > today && !sentMap(b).welcome;
  }
  function makeToken(b) {
    return rpc('vr_admin_upsert_booking', bookingPayload(b, { p_regen_token: true })).then(function (res) {
      var d = res.data || {};
      if (!(d.ok && d.token)) throw new Error(d.error || d.message || 'token_failed');
      b.token = d.token; setGuestToken(b.id, d.token);
    });
  }

  function renderTodo() {
    var panel = $('todo-panel'), host = $('todo'), sum = $('todo-sum');
    if (!panel || !host) return;
    var today = isoToday();
    var rows = [], total = 0;
    stays.forEach(function (s) {
      if (s.end < today) return;
      var m = missingFor(s, today);
      if (m === null) return;
      total++;
      if (m.length) rows.push({ stay: s, miss: m });
    });
    var globals = [];
    if (!wifiPassword()) globals.push({ k: 'wifi', label: '📶 heslo Wi-Fi', title: 'Bez něj zůstane v uvítací zprávě {WIFI_HESLO}.' });
    lastTodo = rows;
    if (!total && !globals.length) { panel.hidden = true; return; }
    panel.hidden = false;
    var done = total - rows.length;
    sum.textContent = total ? done + ' z ' + total + ' pobytů kompletních' : '';

    if (!rows.length && !globals.length) {
      host.innerHTML = '<div class="prob prob-ok"><span class="prob-ok-i">✓</span> Všechno vyplněno — u žádného pobytu nic nechybí.</div>';
      return;
    }
    var html = '';
    if (globals.length) {
      html += '<div class="todo-glob"><span>V Nastavení chybí:</span>' + globals.map(function (g) {
        return '<button type="button" class="chip chip-warn" data-glob="' + g.k + '" title="' + esc(g.title) + '">' + esc(g.label) + '</button>';
      }).join('') + '</div>';
    }
    if (rows.length) {
      html += '<table class="todo"><thead><tr><th>Termín</th><th>Host</th><th>Chybí</th></tr></thead><tbody>' +
        rows.map(function (r, i) {
          var s = r.stay, b = s.booking, n = daysBetween(today, s.start);
          var soon = n <= 7;   // do týdne nebo už běží → červeně
          return '<tr' + (soon ? ' class="soon"' : '') + '>' +
            '<td class="todo-when"><b>' + esc(fmtShort(s.start, s.end)) + '</b><span>' + (n > 0 ? 'za ' + n + ' dní' : 'běží') + '</span></td>' +
            '<td class="todo-who">' + (b ? esc(guestName(b)) : '<i>bez hosta</i>') + '<span>' + esc(s.platform || '') + '</span></td>' +
            '<td class="todo-miss">' + r.miss.map(function (m) {
              return '<button type="button" class="chip' + (soon ? ' chip-red' : '') + '" data-row="' + i + '" data-k="' + m.k + '" title="' + esc(m.title) + '">' + esc(m.label) + '</button>';
            }).join('') + '</td></tr>';
        }).join('') + '</tbody></table>';
    }
    var tokenless = stays.filter(function (s) { return needsToken(s, today); });
    if (tokenless.length > 1) {
      html += '<div class="todo-bulk"><button type="button" class="btn btn-sm btn-outline" id="todo-bulk">🔗 Vytvořit trvalé odkazy všem, kdo ho nemají (' + tokenless.length + ')</button>' +
        '<span>Jen pobytům, které ještě nezačaly a nemají odeslanou uvítací zprávu.</span></div>';
    }
    host.innerHTML = html;

    Array.prototype.forEach.call(host.querySelectorAll('[data-glob]'), function (btn) {
      btn.addEventListener('click', function () { openSettings('set-wifi_password'); });
    });
    Array.prototype.forEach.call(host.querySelectorAll('[data-row]'), function (btn) {
      btn.addEventListener('click', function () {
        var r = lastTodo[+btn.getAttribute('data-row')], k = btn.getAttribute('data-k');
        if (!r) return;
        var s = r.stay, b = s.booking;
        if (k === 'guest') openEditor({ stay: s, back: 'board' });
        else if (k === 'token') {
          btn.disabled = true;
          makeToken(b).then(function () { toast('Trvalý odkaz vytvořen.'); refreshBoards(); })
            .catch(function () { btn.disabled = false; toast('Odkaz se nepodařilo vytvořit.'); });
        } else openEditor({ stay: s, booking: b, back: 'board', focus: { phone: 'ed-phone', adults: 'ed-adults', kids: 'ed-kids', fee: 'ed-fee' }[k] });
      });
    });
    var bulk = $('todo-bulk');
    if (bulk) bulk.addEventListener('click', function () { bulkTokens(tokenless, bulk); });
  }
  // Hromadně: 23 pobytů bez odkazu se nemá proklikávat po jednom. Jde to po jednom
  // volání za sebou (limit admin RPC je 120 za hodinu) a po prvním selhání se zastaví.
  function bulkTokens(list, btn) {
    if (!window.confirm('Vytvořit trvalý odkaz ' + list.length + ' pobytům?\n\nTýká se jen pobytů, které ještě nezačaly a nemají odeslanou uvítací zprávu. '
      + 'Pokud jsi některému z nich odkaz na průvodce nebo registraci už poslal a neoznačil to, starý odkaz mu přestane platit.')) return;
    btn.disabled = true;
    var okCount = 0;
    list.reduce(function (p, s) {
      return p.then(function () {
        btn.textContent = 'Vytvářím… ' + (okCount + 1) + ' / ' + list.length;
        return makeToken(s.booking).then(function () { okCount++; });
      });
    }, Promise.resolve()).then(function () {
      toast('Hotovo — ' + okCount + ' odkazů vytvořeno.');
    }).catch(function () {
      toast('Vytvořeno ' + okCount + ' z ' + list.length + '. Zbytek zkus za chvíli znovu.');
    }).then(refreshBoards);
  }

  /* ============ Render: POBYTY ============ */
  function renderStays() {
    var wrap = $('stays');
    var today = isoToday();
    wrap.innerHTML = '';
    if (!stays.length) { $('stays-empty').hidden = false; return; }
    $('stays-empty').hidden = true;

    var LIMIT = 10;
    var list = expandedStays ? stays : stays.slice(0, LIMIT);

    list.forEach(function (s) {
      var running = s.start <= today && s.end >= today;
      var soon = !running && s.start > today && daysBetween(today, s.start) <= 3;
      var card = document.createElement('div');
      card.className = 'stay' + (running ? ' running' : '');
      var b = s.booking;

      var pills = '<span class="pill pill-plat">' + esc(s.platform) + '</span>';
      if (s.hold && s.hold.status === 'hold') {
        pills += '<span class="pill pill-hold">⏳ předrezervace'
          + (s.hold.hold_until ? ' do ' + esc(fmtDayShort(s.hold.hold_until)) : '') + '</span>';
      }
      if (b && s.end >= today) pills += replyPill(b, today);
      if (b && b.cleaning_note) pills += '<span class="pill pill-plat" title="' + esc(b.cleaning_note) + '">📝 úklid</span>';
      if (running) pills += '<span class="pill pill-run">právě probíhá</span>';
      else if (soon) pills += '<span class="pill pill-soon">za ' + daysBetween(today, s.start) + ' dní</span>';

      var head =
        '<div class="stay-top"><div>' +
        '<div class="stay-dates">' + esc(fmtShort(s.start, s.end)) + '</div>' +
        '<div class="stay-sub">' + nights(s.start, s.end) + ' nocí ' + pills + '</div>' +
        '</div></div>';

      var body;
      if (b) {
        var p = b.persons || {};
        var seq = sequenceFor(b), sent = sentMap(b);
        var sentCount = seq.filter(function (msg) { return sent[msg.key]; }).length;
        var progress = seq.map(function (msg) {
          var st = stepState(msg, b, sent, today);
          var cls = st === 'sent' ? 'done' : ((st === 'due' || st === 'overdue') ? 'due' : (st === 'stale' ? 'skip' : ''));
          return '<span class="pdot ' + cls + (msg.deposit ? ' dep' : '') + '" title="' + esc(msg.title) + '"></span>';
        }).join('');
        var meta = [];
        if (b.phone) {
          var np = normPhone(b.phone, b.lang);
          meta.push('📞 ' + (np.ok
            ? esc(np.pretty)
            : esc(b.phone) + ' <span class="phone-bad">⚠︎ nejde použít</span>'));
        }
        meta.push('👤 ' + (p.registered || 0) + ' registr. / ' + (adultsKnown(b) ? b.adults : '?') + '+' + ((b.children || []).length) + ' dle rez.');
        if ((p.foreigners || 0) > 0) meta.push('🌍 ' + p.foreigners + ' cizinci');
        if ((p.missing_doc || 0) > 0) meta.push('⚠️ ' + p.missing_doc + ' bez dokladu');
        body =
          '<div class="stay-guest">' +
          '<div class="stay-guest-nm">' + esc(guestName(b)) + '</div>' +
          '<div class="stay-guest-meta">' + meta.join('<span class="dot"></span>') + '</div>' +
          '<div class="progress">' + progress + '</div>' +
          '<div class="status paired">🔗 spárováno · ' + sentCount + '/' + seq.length + ' zpráv</div>' +
          '<div class="stay-actions"></div></div>';
      } else if (s.hold) {
        // Přímý prodej bez hosta: u nezaplacené předrezervace se host doplňovat
        // nemusí, u uhrazené ano — je to pobyt jako každý jiný.
        body =
          '<div class="stay-guest">' +
          '<div class="status unpaired">' + (s.hold.status === 'hold'
            ? '⏳ zálohová faktura vystavená, zaplacená zatím není'
            : '✅ uhrazená přímá rezervace — doplnit hosta') + '</div>' +
          '<div class="stay-actions"></div></div>';
      } else if (verifiedStatus(s) === 'service') {
        // Servisní blok majitele (verified.json) hosta nemá a mít nebude.
        body = '<div class="stay-guest"><div class="status">🔧 servisní blok — bez hosta</div></div>';
      } else {
        body =
          '<div class="stay-guest">' +
          '<div class="status unpaired">⚠️ bez kontaktu — doplnit hosta</div>' +
          '<div class="stay-actions"></div></div>';
      }
      card.innerHTML = head + body;
      var actions = card.querySelector('.stay-actions');
      if (b) {
        var det = document.createElement('button');
        det.className = 'btn btn-sm btn-primary'; det.textContent = 'Detail a zprávy';
        det.onclick = function () { openDetail(s); };
        actions.appendChild(det);
        // Přímý host dostává ubytovací smlouvu — generuje ji /smlouvy/ (platformy mají svoje podmínky).
        if (b.platform === 'Přímá' || s.hold) {
          var ca = document.createElement('a');
          ca.className = 'btn btn-sm btn-outline'; ca.textContent = '📄 Smlouva';
          ca.href = '../smlouvy/?booking=' + encodeURIComponent(b.id);
          actions.appendChild(ca);
        }
      } else if (s.hold && s.hold.status === 'hold') {
        var hb = document.createElement('button');
        hb.className = 'btn btn-sm btn-primary'; hb.textContent = 'Předrezervace';
        hb.onclick = function () { openHoldEditor(s.hold); };
        actions.appendChild(hb);
        var ha = document.createElement('a');
        ha.className = 'btn btn-sm btn-outline'; ha.textContent = '📄 Smlouva';
        ha.href = '../smlouvy/?hold=' + encodeURIComponent(s.hold.id);
        actions.appendChild(ha);
      } else if (actions) {
        var add = document.createElement('button');
        add.className = 'btn btn-sm btn-primary'; add.textContent = 'Doplnit hosta';
        add.onclick = function () { openEditor({ stay: s }); };
        actions.appendChild(add);
      }
      wrap.appendChild(card);
    });

    if (!expandedStays && stays.length > LIMIT) {
      var more = document.createElement('button');
      more.className = 'btn btn-outline'; more.style.width = '100%'; more.style.marginTop = '4px';
      more.textContent = 'Zobrazit všechny pobyty (' + stays.length + ')';
      more.onclick = function () { expandedStays = true; renderStays(); };
      wrap.appendChild(more);
    }
  }

  /* ============ Overlay ============ */
  function openOverlay() { $('overlay').hidden = false; document.body.style.overflow = 'hidden'; }
  function closeOverlay() { $('overlay').hidden = true; document.body.style.overflow = ''; $('sheet-body').innerHTML = ''; }

  /* ============ Editor (založení / úprava) ============ */
  function openEditor(opts) {
    opts = opts || {};
    var stay = opts.stay || null;
    var b = opts.booking || (stay && stay.booking) || null;
    var isEdit = !!b;
    $('sheet-title').textContent = isEdit ? 'Upravit pobyt' : 'Doplnit hosta';
    var arrival = (b && b.arrival) || (stay && stay.start) || '';
    var departure = (b && b.departure) || (stay && stay.end) || '';
    var platform = (b && b.platform) || (stay && stay.platform) || '';
    var uidh = (b && b.uidh) || (stay && stay.uidh) || '';

    var body = $('sheet-body');
    body.innerHTML =
      '<form id="ed-form" autocomplete="off">' +
      (uidh ? '<div class="notice">🔗 Napojeno na pobyt z kalendáře. Termíny převzaty z rezervace.</div>' : '') +
      '<div class="row2">' +
      '<div class="field"><label>Jméno</label><input id="ed-first" maxlength="100" value="' + esc(b ? (b.first_name || '') : '') + '"></div>' +
      '<div class="field"><label>Příjmení</label><input id="ed-last" maxlength="100" value="' + esc(b ? (b.last_name || '') : '') + '"></div>' +
      '</div>' +
      '<div class="field"><label>Telefon</label><input id="ed-phone" inputmode="tel" maxlength="40" placeholder="+49 171 1234567" value="' + esc(b ? (b.phone || '') : '') + '">' +
      '<p class="hint" id="ed-phone-info"></p></div>' +
      '<div class="field"><label>E-mail</label><input id="ed-email" inputmode="email" maxlength="160" value="' + esc(b ? (b.email || '') : '') + '"></div>' +
      '<div class="row2">' +
      '<div class="field"><label>Jazyk</label><select id="ed-lang">' +
      ['cs', 'en', 'de', 'pl'].map(function (l) {
        var cur = (b && b.lang) || 'cs';
        return '<option value="' + l + '"' + (l === cur ? ' selected' : '') + '>' + l.toUpperCase() + '</option>';
      }).join('') + '</select></div>' +
      '<div class="field"><label>Platforma</label><input id="ed-platform" maxlength="40" value="' + esc(platform) + '"></div>' +
      '</div>' +
      '<div class="row2">' +
      '<div class="field"><label>Dospělí</label><input id="ed-adults" type="number" min="1" max="40" placeholder="zatím nevím" value="' + esc(b && adultsKnown(b) ? b.adults : '') + '"></div>' +
      '<div class="field"><label>Děti — věky</label><input id="ed-kids" maxlength="120" placeholder="např. 4, 7, 12" value="' + esc(b ? kidsText(b) : '') + '"></div>' +
      '</div>' +
      '<div class="row2">' +
      '<div class="field"><label>Příjezd</label><input id="ed-arrival" type="date" value="' + esc(arrival) + '"></div>' +
      '<div class="field"><label>Odjezd</label><input id="ed-departure" type="date" value="' + esc(departure) + '"></div>' +
      '</div>' +
      '<div class="row2">' +
      '<div class="field"><label>Dohodnutý čas příjezdu</label><input id="ed-time" type="time" value="' + esc(b && arrivalTime(b) !== ARRIVAL_DEFAULT ? arrivalTime(b) : '') + '">' +
      '<p class="hint" id="ed-time-info"></p></div>' +
      '<div class="field"><label>Poplatek obci</label><select id="ed-fee">' +
      '<option value="">— nevyplněno —</option>' +
      Object.keys(FEE_MODES).map(function (k) {
        return '<option value="' + k + '"' + (b && feeMode(b) === k ? ' selected' : '') + '>' + esc(FEE_MODES[k]) + '</option>';
      }).join('') + '</select></div>' +
      '</div>' +
      '<label class="check" id="ed-energy-wrap"><input type="checkbox" id="ed-energy"' + (b && feeEnergy(b) ? ' checked' : '') + '> Z kauce se účtují i energie (elektřina a plyn podle odečtu)</label>' +
      '<label class="check" id="ed-fee-all-wrap" hidden><input type="checkbox" id="ed-fee-all"> <span id="ed-fee-all-lbl"></span></label>' +
      '<div class="field"><label>Poznámka</label><textarea id="ed-notes" maxlength="500">' + esc(b ? (b.notes || '') : '') + '</textarea></div>' +
      '<p class="hint">Dospělé nech prázdné, dokud to nevíš. Děti zapiš věkem, oddělené čárkou; když víš jen počet, napiš otazníky (<code>?, ?</code>). Bez dětí nech pole prázdné. Po registraci se všechno přepočítá ze skutečných osob. Čas příjezdu a způsob placení poplatku jdou do uvítací zprávy.</p>' +
      '<p class="form-err" id="ed-err" hidden></p>' +
      '<button type="submit" class="btn btn-primary" id="ed-save" style="width:100%">' + (isEdit ? 'Uložit změny' : 'Založit hosta') + '</button>' +
      (isEdit ? '<button type="button" class="btn btn-danger" id="ed-del" style="width:100%;margin-top:10px">Smazat pobyt</button>' : '') +
      '</form>';

    openOverlay();
    // Otevřeno z čipu v „Co doplnit": rovnou do pole, které chybí.
    if (opts.focus && $(opts.focus)) { $(opts.focus).focus(); $(opts.focus).scrollIntoView({ block: 'center' }); }

    // Telefon: ukázat rovnou při psaní, co se uloží a v jakém tvaru.
    // Reaguje i na změnu jazyka — z něj se bere předvolba, když ji host nenapsal.
    var phoneEl = $('ed-phone'), langEl = $('ed-lang'), infoEl = $('ed-phone-info');
    function phoneFeedback() {
      var n = normPhone(phoneEl.value, langEl.value);
      if (n.empty) {
        infoEl.className = 'hint';
        infoEl.textContent = 'Bez telefonu nejde poslat zprávy ani navrhnout kód dveří.';
      } else if (n.error) {
        infoEl.className = 'hint phone-bad';
        infoEl.textContent = '✕ ' + n.error;
      } else {
        infoEl.className = 'hint ' + (n.guessed ? 'phone-guess' : 'phone-ok');
        infoEl.textContent = (n.guessed ? '⚠︎ Uložím jako ' : '✓ Uložím jako ') + n.pretty +
          (n.country ? ' · ' + n.country : '') +
          (n.guessed ? ' — předvolbu jsem doplnil podle jazyka hosta. Když nesedí, napiš ji do čísla.' : '');
      }
    }
    phoneEl.addEventListener('input', phoneFeedback);
    langEl.addEventListener('change', phoneFeedback);
    phoneFeedback();

    // Podmínky pobytu: čas příjezdu, poplatek, energie. Energie dávají smysl jen
    // u „z kauce"; a stejný způsob placení jde jedním uložením dát všem pobytům
    // z téže platformy, které ho ještě nemají (ať se to nekliká pobyt po pobytu).
    var feeEl = $('ed-fee'), timeEl = $('ed-time');
    var siblings = feeSiblings(b, platform);
    function termsFeedback() {
      $('ed-energy-wrap').hidden = feeEl.value !== 'deposit';
      var t = timeEl.value;
      $('ed-time-info').className = 'hint' + (t && t < ARRIVAL_DEFAULT ? ' phone-guess' : '');
      $('ed-time-info').textContent = !t ? 'Prázdné = od 15:00.'
        : t < ARRIVAL_DEFAULT ? '⚠︎ Zámek pouští až od 15:00 — kód na ' + t + ' nastav ručně v Yale Home.'
        : 'Zprávy hostovi řeknou „od ' + t + '“.';
      var wrap = $('ed-fee-all-wrap');
      wrap.hidden = !(feeEl.value && siblings.length);
      if (!wrap.hidden) $('ed-fee-all-lbl').textContent = 'Stejně nastavit i dalším ' + siblings.length + ' pobytům z ' + platform + ', které to nemají';
    }
    feeEl.addEventListener('change', termsFeedback);
    timeEl.addEventListener('input', termsFeedback);
    $('ed-fee-all').checked = opts.focus === 'ed-fee';
    termsFeedback();

    $('ed-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      saveEditor(b, uidh, opts.back);
    });
    if (isEdit) $('ed-del').addEventListener('click', function () { deleteBooking(b); });
  }

  // Věky dětí do políčka: „4, 7, 12"; neznámé věky (jen počet) jako otazníky.
  function kidsText(b) {
    var k = b.children || [], known = kidsAgesKnown(b);
    return k.map(function (a) { return known ? a : '?'; }).join(', ');
  }
  // „4, 7, ?" → { ages:[4,7,10], unknown:true } | { error }. Neznámý věk se ukládá
  // jako 10 (sloupec je int[], prázdnou hodnotu nemá) a pozná se podle chybějící
  // značky guests_ok — viz kidsAgesKnown().
  function parseKids(raw) {
    var ages = [], unknown = false, bad = null;
    String(raw || '').split(/[\s,;]+/).filter(Boolean).forEach(function (t) {
      if (t === '?') { ages.push(10); unknown = true; return; }
      var n = /^\d{1,2}$/.test(t) ? parseInt(t, 10) : NaN;
      if (isNaN(n) || n > 17) bad = t; else ages.push(n);
    });
    if (bad) return { error: 'Věk dítěte „' + bad + '“ nedává smysl — piš čísla 0–17 oddělená čárkou, neznámý věk otazníkem.' };
    // Neznámý věk se od skutečných deseti let pozná jen u celé skupiny (samé desítky),
    // proto buď všechny věky, nebo samé otazníky.
    if (unknown && ages.some(function (a) { return a !== 10; })) return { error: 'Buď napiš věky všech dětí, nebo samé otazníky (jen počet) — kombinovat to nejde.' };
    if (ages.length > 40) return { error: 'Tolik dětí se do domu nevejde.' };
    return { ages: ages, unknown: unknown };
  }

  // Ostatní budoucí pobyty z téže platformy bez vyplněného způsobu placení poplatku.
  function feeSiblings(b, platform) {
    var today = isoToday(), plat = (platform || '').trim();
    if (!plat || plat === 'Přímá') return [];
    return bookings.filter(function (x) {
      return (!b || x.id !== b.id) && (x.platform || '').trim() === plat && x.arrival > today && !feeModeSet(x) && !sentMap(x).welcome;
    });
  }

  // back: 'board' = po uložení zpět na přehled (voláno z „Co doplnit"), jinak detail.
  function saveEditor(existing, uidh, back) {
    var err = $('ed-err');
    err.hidden = true;
    var arrival = $('ed-arrival').value, departure = $('ed-departure').value;
    if (!arrival || !departure) { err.textContent = 'Vyplňte příjezd i odjezd.'; err.hidden = false; return; }
    if (departure < arrival) { err.textContent = 'Odjezd musí být po příjezdu.'; err.hidden = false; return; }
    // Telefon se ukládá v mezinárodním tvaru; rozbité číslo neprojde,
    // ať se rozbitý wa.me odkaz nezjistí až ve chvíli, kdy má odejít zpráva.
    var ph = normPhone($('ed-phone').value, $('ed-lang').value);
    if (ph.error) { err.textContent = 'Telefon: ' + ph.error; err.hidden = false; $('ed-phone').focus(); return; }
    var kids = parseKids($('ed-kids').value);
    if (kids.error) { err.textContent = kids.error; err.hidden = false; $('ed-kids').focus(); return; }
    // Prázdné pole dospělých = nevím. Databáze si prázdnou hodnotu sama doplní
    // dvojkou, proto se „vím to" ukládá zvlášť značkou guests_ok.
    var adultsRaw = $('ed-adults').value.trim();
    var adults = adultsRaw === '' ? null : parseInt(adultsRaw, 10);
    if (adults !== null && !(adults >= 1 && adults <= 40)) { err.textContent = 'Počet dospělých: 1–40, nebo nech pole prázdné.'; err.hidden = false; $('ed-adults').focus(); return; }
    var guestsOk = adults !== null && !kids.unknown;
    var terms = { time: $('ed-time').value, fee: $('ed-fee').value, energy: $('ed-energy').checked };
    var alsoFor = (terms.fee && $('ed-fee-all').checked) ? feeSiblings(existing, $('ed-platform').value) : [];
    var payload = {
      p_id: existing ? existing.id : null,
      p_uidh: uidh || null,
      p_first: $('ed-first').value.trim(),
      p_last: $('ed-last').value.trim(),
      p_phone: ph.ok ? ph.e164 : '',
      p_email: $('ed-email').value.trim(),
      p_lang: $('ed-lang').value,
      p_arrival: arrival,
      p_departure: departure,
      p_adults: adults !== null ? adults : (existing && existing.adults != null ? existing.adults : 2),
      p_children: kids.ages,
      p_platform: $('ed-platform').value.trim(),
      p_notes: $('ed-notes').value.trim(),
      p_door_code: existing ? (existing.door_code || null) : null
    };
    var btn = $('ed-save'); btn.disabled = true; btn.textContent = 'Ukládám…';
    var fail = function (msg) {
      err.textContent = msg; err.hidden = false;
      btn.disabled = false; btn.textContent = existing ? 'Uložit změny' : 'Založit hosta';
    };
    rpc('vr_admin_upsert_booking', payload).then(function (res) {
      var d = res.data || {};
      if (!d.ok) { fail(mapErr(d.error || d.message)); return; }
      if (d.token) { setGuestToken(d.id, d.token); }
      // značka „počty zapsal majitel" — jen když se mění, ať se neplýtvá voláními
      var had = !!existing && hasLog(existing, 'guests_ok');
      var mark = (guestsOk === had) ? Promise.resolve()
        : rpc('vr_admin_msg_log', { p_booking_id: d.id, p_msg_key: 'guests_ok', p_sent: guestsOk });
      return mark.catch(function () {}).then(function () {
        return saveTerms(d.id, existing, terms);
      }).then(function () {
        // stejný způsob placení i ostatním pobytům z platformy (jen poplatek, ne čas)
        return alsoFor.reduce(function (p, x) {
          return p.then(function () { return saveTerms(x.id, x, { time: arrivalTime(x), fee: terms.fee, energy: terms.energy }); });
        }, Promise.resolve());
      }).catch(function () { toast('Podmínky pobytu se nepodařilo uložit celé — zkontroluj je.'); }).then(function () {
        toast(existing ? (alsoFor.length ? 'Uloženo, poplatek nastaven i ' + alsoFor.length + ' dalším pobytům.' : 'Uloženo.') : 'Host založen.');
        return reload();
      }).then(function () {
        var s = stays.filter(function (x) { return x.booking && x.booking.id === d.id; })[0];
        if (s && back !== 'board') openDetail(s); else closeOverlay();
      });
    }).catch(function () { fail('Uložení se nepodařilo. Zkuste to znovu.'); });
  }

  function deleteBooking(b) {
    if (!window.confirm('Opravdu smazat pobyt „' + guestName(b) + '“? Smažou se i registrované osoby a log zpráv.')) return;
    rpc('vr_admin_delete_booking', { p_booking_id: b.id }).then(function (res) {
      if (res.data && res.data.ok) { toast('Smazáno.'); reload().then(closeOverlay); }
      else toast('Smazání se nepodařilo.');
    });
  }

  function mapErr(code) {
    switch (code) {
      case 'dates_invalid': return 'Zkontrolujte prosím termín pobytu.';
      case 'too_long': return 'Některé pole je příliš dlouhé.';
      case 'uidh_taken': return 'Tento pobyt z kalendáře už má přiřazeného hosta.';
      case 'status_invalid': return 'Neznámý stav předrezervace.';
      case 'currency_invalid': return 'Měna musí být CZK nebo EUR.';
      case 'account_invalid': return 'Neznámý bankovní účet.';
      case 'not_found': return 'Pobyt nebyl nalezen.';
      case 'rate_limited': return 'Příliš mnoho operací. Zkuste to za chvíli.';
      case 'unauthorized': return 'Neplatný přístup.';
      default: return 'Něco se nepovedlo. Zkuste to znovu.';
    }
  }

  /* ============ Detail pobytu ============ */
  function openDetail(stay) {
    var b = stay.booking;
    $('sheet-title').textContent = guestName(b);
    var ctx = buildCtx(b);
    var token = ctx.token;
    var body = $('sheet-body');

    var linksHtml;
    if (token) {
      var pruvodce = location.origin + '/pruvodce/?t=' + token;
      var registrace = location.origin + '/registrace/?t=' + token + '&lang=' + (b.lang || 'en');
      linksHtml =
        '<div class="linkrow">' +
        linkCard('Osobní stránka hosta', pruvodce) +
        linkCard('Registrace hostů', registrace) +
        '</div>';
    } else {
      linksHtml =
        '<div class="notice">Tento pobyt vznikl před 15. 9. 2026, kdy se odkaz hosta neukládal. Vytvoř trvalý odkaz (starý přestane platit) — od té chvíle bude dostupný na všech zařízeních a dosadí se do uvítací zprávy.</div>' +
        '<button type="button" class="btn btn-outline" id="d-regen" style="width:100%">Vytvořit trvalý odkaz hosta</button>';
    }

    body.innerHTML =
      '<div class="block">' +
      '<div class="stay-sub" style="margin-bottom:4px">' + esc(fmtTermin(b.arrival, b.departure)) + ' · ' + nights(b.arrival, b.departure) + ' nocí · ' + esc(stay.platform) + '</div>' +
      '<div class="stay-sub" style="margin-bottom:10px">' + esc(termsLabel(b)) + '</div>' +
      earlyArrivalNote(b) +
      '<button type="button" class="btn btn-sm btn-outline" id="d-edit">Upravit údaje pobytu</button>' +
      '</div>' +

      '<div class="block"><h3 class="block-h">Odkazy pro hosta</h3>' + linksHtml + '</div>' +

      '<div class="block"><h3 class="block-h">Místní poplatek</h3><div id="d-fee"></div></div>' +

      '<div class="block"><h3 class="block-h">Kód ke dveřím</h3>' +
      '<div class="door-row"><div class="field"><label>Kód (jde do uvítací zprávy)</label>' +
      '<input id="d-door" maxlength="40" value="' + esc(b.door_code || suggestDoorCode(b.phone) || '') + '" placeholder="např. 1975"></div>' +
      '<button type="button" class="btn btn-primary" id="d-door-save">Uložit</button></div>' +
      (!b.door_code && suggestDoorCode(b.phone) ? '<p class="hint">Posledních 5 číslic telefonu — stejně ho bere zámek i registrace z lednice. Ukládat ho nemusíš; ulož jen, když má být jiný.</p>' : '') +
      '<p class="hint">Zámek (hlásí Home Assistant): ' + esc(lockState(b).text) + '. Uložený kód HA do zámku sám přepíše do 30 min.</p>' + '</div>' +

      '<div class="block"><h3 class="block-h">Poznámka pro úklid</h3>' +
      '<div class="door-row"><div class="field"><label>Co má úklid připravit (postýlka, dřívější příjezd…)</label>' +
      '<textarea id="d-clean" maxlength="500" placeholder="např. Připravit dětskou postýlku.">' + esc(b.cleaning_note || '') + '</textarea></div>' +
      '<button type="button" class="btn btn-primary" id="d-clean-save">Uložit</button></div>' +
      '<p class="hint">Uvidí ho úklid v kalendáři. Žádná jména ani telefony — je veřejné.</p></div>' +

      '<div class="block"><h3 class="block-h">Kauce</h3>' +
      '<label class="switch"><input type="checkbox" id="d-deposit"' + (depositEnabled(b) ? ' checked' : '') + '>' +
      '<span class="switch-track"></span><span class="switch-lbl">Vybírat vratnou kauci ' + DEPOSIT_CZK.toLocaleString('cs-CZ') + ' Kč u tohoto pobytu</span></label>' +
      '<p class="hint">Zapnutím přibude do sekvence krok „Kauce — výběr" (zpráva hostovi s Revolut linkem) a po odjezdu připomínka „Vrátit kauci" (jen pro tebe, hostovi se nic neposílá).</p>' +
      '</div>' +

      '<div class="block"><h3 class="block-h">Odpověď hosta</h3><div id="d-reply"></div></div>' +

      '<div class="block"><h3 class="block-h">Sekvence zpráv</h3><div class="tl" id="d-tl"></div></div>' +

      '<div class="block"><h3 class="block-h">Registrace — přehled osob</h3><div id="d-persons"><p class="persons-empty">Načítám…</p></div></div>' +

      '<div class="block"><h3 class="block-h">Hlášení cizinců (Ubyport)</h3><div id="d-ubyport"><p class="persons-empty">Načítám…</p></div></div>';

    openOverlay();

    $('d-edit').addEventListener('click', function () { openEditor({ stay: stay, booking: b }); });
    $('d-deposit').addEventListener('click', function () { toggleDeposit(b, stay, $('d-deposit')); });
    if (token) {
      // copy handlers
      Array.prototype.forEach.call(body.querySelectorAll('.copybtn'), function (btn) {
        btn.addEventListener('click', function () {
          copyText(btn.getAttribute('data-copy')); toast('Zkopírováno.');
        });
      });
    } else {
      $('d-regen').addEventListener('click', function () { regenToken(b, stay); });
    }
    $('d-door-save').addEventListener('click', function () { saveDoor(b, stay); });
    $('d-clean-save').addEventListener('click', function () { saveCleaningNote(b); });

    renderFee(b, ctx);
    renderReply(b);
    renderTimeline(stay, b, ctx);
    loadPersons(b);
  }

  // Tři tlačítka: jak host zareagoval na první ozvěnu. Viz „Odpověď hosta (ruční v1)".
  function renderReply(b) {
    var box = $('d-reply'); if (!box) return;
    var st = replyState(b), today = isoToday(), quiet = silentDays(b, today);
    var opt = function (val, label, cls) {
      return '<button type="button" class="btn btn-sm ' + (st === val ? cls + ' on' : 'btn-outline') + '" data-reply="' + val + '">' + label + '</button>';
    };
    box.innerHTML =
      '<div class="reply-row">' + opt('ok', '✅ Odpověděl – jede', 'btn-reply-ok') + opt('risk', '⚠️ Odpověděl – váhá', 'btn-reply-risk') +
      opt('none', 'Neodpověděl', 'btn-reply-none') + '</div>' +
      '<p class="hint">' + (st === 'ok' ? 'Host potvrdil, že jede. Nic dalšího není potřeba.'
        : st === 'risk' ? 'Host váhá — pobyt svítí v „Dnes na řadě“, dokud se stav nezmění. O stornu se v našich zprávách nemluví; stačí se zeptat, co by pomohlo.'
        : quiet == null ? 'První ozvěna zatím neodešla.'
        : 'První ozvěna odešla ' + (quiet === 0 ? 'dnes' : (quiet === 1 ? 'včera' : 'před ' + quiet + ' dny')) + ', odpověď zatím žádná.') + '</p>';
    Array.prototype.forEach.call(box.querySelectorAll('[data-reply]'), function (btn) {
      btn.addEventListener('click', function () {
        btn.disabled = true;
        setReply(b, btn.getAttribute('data-reply')).then(function () { renderReply(b); refreshBoards(); })
          .catch(function () { btn.disabled = false; toast('Nepodařilo se uložit.'); });
      });
    });
  }

  // Dohodnutý příjezd před 15:00: zpráva hostovi slíbí kód od toho času, ale zámek ho
  // pustí až v 15:00 — Home Assistant bere čas z vr_ha_stay a o dohodě zatím neví.
  function earlyArrivalNote(b) {
    return arrivalTime(b) < ARRIVAL_DEFAULT
      ? '<div class="notice">⚠️ Dohodnutý příjezd ' + esc(arrivalTime(b)) + ' je dřív, než pouští zámek (15:00). Zprávy hostovi slíbí kód od ' + esc(arrivalTime(b)) +
        ' — nastav ho na ten čas ručně v appce Yale Home, sám se do zámku zatím nepropíše.</div>'
      : '';
  }

  function linkCard(title, url) {
    return '<div class="linkcard"><div class="linkcard-main">' +
      '<div class="linkcard-t">' + esc(title) + '</div>' +
      '<div class="linkcard-u">' + esc(url) + '</div></div>' +
      '<a class="btn btn-sm btn-outline" href="' + esc(url) + '" target="_blank" rel="noopener">Otevřít</a>' +
      '<button class="btn btn-sm btn-outline copybtn" data-copy="' + esc(url) + '">Kopírovat</button></div>';
  }

  function fmtCzk(n) { return (Number(n) || 0).toLocaleString('cs-CZ') + ' Kč'; }
  // Poplatek z pobytu (OZV Svoboda nad Úpou č. 2/2023): za každý den pobytu kromě
  // dne příjezdu, osvobozeno do 18 let a podle § 3b (ZTP/P…). Počítá DB po osobách
  // a po dnech; tady se jen sčítá. Senioři osvobození NEMAJÍ.
  function renderFee(b, ctx) {
    var box = $('d-fee'); if (!box) return;
    var ps = b._persons, st = b.persons || {};
    var czk, days, exempt, noBirth, reg;
    if (ps) {
      reg = ps.length > 0; czk = 0; days = 0; exempt = 0; noBirth = 0;
      ps.forEach(function (p) {
        var f = p.fee || {};
        czk += f.czk || 0; days += f.paid_days || 0;
        if (f.reason && f.reason !== 'under18_part') exempt++;
        if (!p.birth_date) noBirth++;
      });
    } else {
      reg = (st.registered || 0) > 0; czk = st.fee_czk; days = st.fee_paid_days;
      exempt = st.fee_exempt || 0; noBirth = st.missing_birth || 0;
    }
    if (reg && czk != null) {
      box.innerHTML = '<div class="feebox">' +
        '<div class="feeline"><span>Poplatek podle registrací</span><span class="big">' + fmtCzk(czk) + '</span></div>' +
        '<div class="feenote">' + (days || 0) + ' placených dní · osvobozeno ' + exempt + ' os. (do 18 let, ZTP/P…) · rozpis u osob v Registraci níže.' +
        (noBirth ? ' <b>⚠️ ' + noBirth + '× chybí datum narození</b> — počítá se jako dospělý.' : '') + '</div></div>';
    } else {
      box.innerHTML = '<div class="feebox">' +
        (ctx.dospeli == null
          ? '<div class="feeline"><span>Počet dospělých není vyplněný</span><span>25 Kč × dospělí × ' + ctx.noci + ' nocí</span></div>'
          : '<div class="feeline"><span>Odhad z rezervace: dospělí × noci × 25 Kč</span><span>' + ctx.dospeli + ' × ' + ctx.noci + ' × 25 = ' + fmtCzk(ctx.castka) + '</span></div>') +
        '<div class="feenote">Přesně se spočítá z registrací — po dnech, děti do 18 let a ZTP/P zdarma.</div></div>';
    }
  }

  var currentStay = null;
  function renderTimeline(stay, b, ctx) {
    currentStay = stay;
    var today = isoToday();
    var sent = sentMap(b);
    var tl = $('d-tl');
    tl.innerHTML = '';
    var copies = [];   // texty pro tlačítka „Zkopírovat" (index v data-ci)

    sequenceFor(b).forEach(function (msg) {
      var st = stepState(msg, b, sent, today);
      var isSent = st === 'sent';
      var due = st === 'due' || st === 'overdue';
      var parts = buildParts(msg, ctx, b);
      var ownerTask = !!msg.ownerTask;

      var el = document.createElement('div');
      el.className = 'msg' + (isSent ? ' done' : (due ? ' due' : '')) + (msg.deposit ? ' dep' : '');
      var doneWord = ownerTask ? 'hotovo' : 'odesláno';
      var tag = isSent ? '<span class="msg-tag done">' + doneWord + '</span>'
        : due ? '<span class="msg-tag due">na řadě</span>'
        : st === 'stale' ? '<span class="msg-tag">' + (sent['skip_' + msg.key] ? 'přeskočeno' : 'už nemá smysl') + '</span>'
        : '<span class="msg-tag">' + esc(fmtDay(schedDate(msg, b))) + '</span>';
      var variant = parts[0] && parts[0].variantLabel ? ' · varianta ' + esc(parts[0].variantLabel) : '';
      var langTag = ownerTask ? '' : '<span class="msg-lang">· ' + esc(msgLang(b).toUpperCase()) + '</span>';
      var head =
        '<div class="msg-head">' +
        '<span class="msg-when">' + esc(msg.when) + '</span>' +
        '<span class="msg-title">' + esc(msg.title) + '</span>' + langTag + tag + '</div>';

      var partsHtml;
      if (ownerTask) {
        // deposit_return: úkol jen pro majitele, žádná zpráva hostovi.
        partsHtml = '<div class="notice">Připomínka jen pro tebe — hostovi se nic neposílá. Vratku ' +
          esc(DEPOSIT_CZK.toLocaleString('cs-CZ')) + ' Kč pošli ručně přes Revolut (' + esc(REVOLUT_URL) + ').</div>';
      } else {
        partsHtml = parts.map(function (p) {
          var warn = '';
          if (p.needsToken) warn = '<div class="notice">Zpráva nese odkaz na průvodce výlety, a ten zatím není (pobyt vznikl před ukládáním odkazů). Vytvoř trvalý odkaz výše — do zprávy se doplní sám.</div>';
          if (p.needsCode) warn = '<div class="notice">Zpráva nese kód ke dveřím, a ten není z čeho vzít — doplň telefon (kód = posledních 5 číslic), nebo kód ulož výše.</div>';
          if (p.needsWifi && !warn) warn = '<div class="notice">V Nastavení chybí heslo Wi-Fi — ve zprávě by zůstalo {WIFI_HESLO}. Doplň ho (⚙ Nastavení) a zpráva půjde odeslat.</div>';
          var ready = !!p.text && !p.needsToken && !p.needsCode && !p.needsWifi;
          var canWa = phoneUsable(b) && ready;
          var waTitle = phoneUsable(b) ? 'chybí údaj' : (b.phone ? 'telefon nejde použít — oprav ho v „Upravit pobyt“' : 'chybí telefon');
          var wa = function (text, label, cls) {
            return canWa
              ? '<a class="btn btn-sm ' + cls + '" href="' + esc(waLink(b, text)) + '" target="_blank" rel="noopener">' + label + '</a>'
              : '<button class="btn btn-sm ' + cls + '" disabled title="' + esc(waTitle) + '">' + label + '</button>';
          };
          var copy = function (text, label, cls) {
            copies.push(text);
            return '<button class="btn btn-sm ' + cls + ' copybtn" data-ci="' + (copies.length - 1) + '"' + (ready ? '' : ' disabled title="chybí údaj"') + '>' + label + '</button>';
          };
          // Host z platformy: celý text na platformu (bez WhatsApp hvězdiček), na WhatsApp
          // u prvních dvou zpráv jen průvodní. „Přímá": WhatsApp jako dřív.
          var actions, cover = '';
          if (isPlatform(b)) {
            actions = copy(plainText(p.text), '📋 Zkopírovat pro ' + esc(ctx.platforma), 'btn-primary');
            if (hasCover(msg, b)) {
              actions += wa(coverText(ctx, b), 'WhatsApp · průvodní zpráva', 'btn-wa') + wa(p.text, 'WhatsApp · celý text', 'btn-outline');
              cover = '<p class="hint msg-cover">Průvodní zpráva na WhatsApp: „' + esc(coverText(ctx, b)) + '“</p>';
            } else actions += wa(p.text, 'Otevřít ve WhatsApp', 'btn-wa');
          } else {
            actions = wa(p.text, 'Otevřít ve WhatsApp', 'btn-wa') + copy(p.text, 'Kopírovat text', 'btn-outline');
          }
          return (variant ? '<div class="msg-when" style="margin:6px 0 4px">' + variant.replace(/^ · /, '') + '</div>' : '') +
            warn +
            '<div class="msg-preview">' + esc(p.text) + '</div>' +
            '<div class="msg-actions">' + actions + '</div>' + cover;
        }).join('');
      }

      var footer =
        '<label class="msg-sent"><input type="checkbox" ' + (isSent ? 'checked' : '') + ' data-key="' + esc(msg.key) + '"> ' + doneWord + '</label>';

      el.innerHTML = head + partsHtml + footer;
      tl.appendChild(el);
    });

    // copy handlers
    Array.prototype.forEach.call(tl.querySelectorAll('.copybtn'), function (btn) {
      btn.addEventListener('click', function () {
        copyText(copies[+btn.getAttribute('data-ci')] || ''); toast('Text zkopírován.');
      });
    });
    // checkbox handlers
    Array.prototype.forEach.call(tl.querySelectorAll('.msg-sent input'), function (cb) {
      cb.addEventListener('change', function () {
        var key = cb.getAttribute('data-key');
        var msg = sequenceFor(b).filter(function (m) { return m.key === key; })[0] || { key: key };
        toggleSent(b, msg, cb.checked, cb);
      });
    });
  }

  function fmtDay(iso) {
    var d = parseISO(iso);
    return d.getDate() + '. ' + (d.getMonth() + 1) + '.';
  }

  function toggleSent(b, msg, sent, cb) {
    cb.disabled = true;
    setStepSent(b, msg, sent).then(function () {
      cb.disabled = false;
      // překresli detail (časová osa + odpověď hosta) + přehledy
      renderTimeline(currentStay, b, buildCtx(b));
      renderReply(b);
      refreshBoards();
    }).catch(function () { cb.disabled = false; cb.checked = !sent; toast('Nepodařilo se uložit.'); });
  }

  function saveDoor(b, stay) {
    var val = $('d-door').value.trim();
    var btn = $('d-door-save'); btn.disabled = true; btn.textContent = '…';
    rpc('vr_admin_upsert_booking', bookingPayload(b, { p_door_code: val || null })).then(function (res) {
      btn.disabled = false; btn.textContent = 'Uložit';
      if (res.data && res.data.ok) {
        b.door_code = val || null;
        toast('Kód uložen.');
        renderTimeline(stay, b, buildCtx(b));
      } else toast('Uložení se nepovedlo.');
    }).catch(function () { btn.disabled = false; btn.textContent = 'Uložit'; toast('Uložení se nepovedlo.'); });
  }

  // Poznámka pro úklid — VEŘEJNÁ: kalendář úklidu (villa-booking-calendar) ji čte bez
  // přihlášení přes vr_public_cleaning_notes() a ukáže 📝 u dne příjezdu. Vlastní RPC,
  // ne vr_admin_upsert_booking (ten ji nezná a nepřepíše). Prázdný text = smazat.
  // Funkce při chybě hází výjimku → PostgREST vrátí 4xx s { message }, ne { ok:false }.
  function saveCleaningNote(b) {
    var val = $('d-clean').value.trim();
    var btn = $('d-clean-save'); btn.disabled = true; btn.textContent = '…';
    rpc('vr_admin_set_cleaning_note', { p_id: b.id, p_note: val }).then(function (res) {
      btn.disabled = false; btn.textContent = 'Uložit';
      if (res.ok && res.data) {
        b.cleaning_note = res.data.cleaning_note || null;
        $('d-clean').value = b.cleaning_note || '';
        toast(b.cleaning_note ? 'Poznámka pro úklid uložena.' : 'Poznámka pro úklid smazána.');
        renderStays();
      } else toast((res.data && res.data.message) || 'Uložení se nepovedlo.');
    }).catch(function () { btn.disabled = false; btn.textContent = 'Uložit'; toast('Uložení se nepovedlo.'); });
  }

  function regenToken(b, stay) {
    if (!window.confirm('Vytvořit nový odkaz? Předchozí odkaz hosta přestane platit.')) return;
    makeToken(b).then(function () { toast('Trvalý odkaz vytvořen.'); refreshBoards(); openDetail(stay); })
      .catch(function () { toast('Nepodařilo se.'); });
  }

  // sestaví plný payload z existujícího bookingu + patch (pro dílčí úpravy)
  function bookingPayload(b, patch) {
    var base = {
      p_id: b.id,
      p_uidh: b.uidh || null,
      p_first: b.first_name || '',
      p_last: b.last_name || '',
      p_phone: b.phone || '',
      p_email: b.email || '',
      p_lang: b.lang || 'cs',
      p_arrival: b.arrival,
      p_departure: b.departure,
      p_adults: b.adults == null ? 2 : b.adults,
      p_children: b.children || [],
      p_platform: b.platform || '',
      p_notes: b.notes || '',
      p_door_code: b.door_code || null
    };
    for (var k in patch) base[k] = patch[k];
    return base;
  }

  function loadPersons(b) {
    Promise.all([
      rpc('vr_admin_persons', { p_booking_id: b.id }),
      // Záznamy o odeslání do UbyPortu. Selhání (např. před nasazením migrace)
      // nesmí shodit výpis osob — jen se neukážou.
      rpc('vr_admin_ubyport_reports', { p_booking_id: b.id }).catch(function () { return null; })
    ]).then(function (r) {
      var persons = (r[0].data && r[0].data.persons) || [];
      b._persons = persons;              // uchováme vč. čísel dokladů pro Ubyport export
      b._ubyReports = (r[1] && r[1].data && r[1].data.reports) || [];
      personsBooking = b;
      renderPersons(persons);
      renderUbyport(b);
      renderFee(b, buildCtx(b));
    }).catch(function () { $('d-persons').innerHTML = '<p class="persons-empty">Nepodařilo se načíst.</p>'; });
  }

  function flagEmoji(code) {
    if (!/^[A-Za-z]{2}$/.test(code || '')) return '🏳️';
    return code.toUpperCase().replace(/./g, function (c) { return String.fromCodePoint(0x1F1A5 + c.charCodeAt(0)); });
  }
  var personsBooking = null;   // pobyt, ke kterému patří vykreslené osoby (úprava osvobození)
  var FEE_REASON = {
    under18: 'do 18 let — bez poplatku', under18_part: '18 let během pobytu',
    ztp: 'osvobozen: ZTP/P', resident: 'osvobozen: přihlášen v obci', other: 'osvobozen', over60: 'pobyt nad 60 dní'
  };
  function feeBadge(p) {
    var f = p.fee; if (!f) return '';
    var txt = f.czk ? ('poplatek ' + fmtCzk(f.czk)) : (FEE_REASON[f.reason] || 'bez poplatku');
    if (f.czk && f.reason === 'under18_part') txt += ' · ' + FEE_REASON.under18_part;
    var cls = f.czk ? 'fee' : 'free';
    return ' <button type="button" class="badge ' + cls + ' badge-btn" data-exempt="' + esc(p.id) + '" title="Osvobození od poplatku">' + esc(txt) +
      (p.fee_exempt_note ? ' (' + esc(p.fee_exempt_note) + ')' : '') + '</button>';
  }
  function openExempt(p, row) {
    var old = row.querySelector('.exempt-ed'); if (old) { old.remove(); return; }
    var ed = document.createElement('div'); ed.className = 'exempt-ed';
    ed.innerHTML = '<select>' +
      [['', 'bez osvobození'], ['ztp', 'ZTP/P, nevidomý, závislý na pomoci, průvodce'], ['resident', 'přihlášen v obci Svoboda n. Ú.'], ['other', 'jiný důvod § 3b (napiš)']]
        .map(function (o) { return '<option value="' + o[0] + '"' + ((p.fee_exempt || '') === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>'; }).join('') +
      '</select><input type="text" maxlength="300" placeholder="poznámka / důvod" value="' + esc(p.fee_exempt_note || '') + '">' +
      '<button type="button" class="btn btn-sm btn-primary">Uložit</button>';
    row.appendChild(ed);
    ed.querySelector('button').addEventListener('click', function () {
      var btn = this; btn.disabled = true;
      rpc('vr_admin_person_exempt', { p_person_id: p.id, p_reason: ed.querySelector('select').value || null, p_note: ed.querySelector('input').value || null })
        .then(function (res) {
          var d = res.data || {};
          if (d.ok) { toast('Osvobození uloženo.'); if (personsBooking) loadPersons(personsBooking); reload(); }
          else { btn.disabled = false; toast(d.error === 'note_required' ? 'U jiného důvodu napiš, jaký.' : 'Uložení se nepodařilo.'); }
        }).catch(function () { btn.disabled = false; toast('Uložení se nepodařilo.'); });
    });
  }
  function renderPersons(persons) {
    var wrap = $('d-persons');
    if (!persons.length) { wrap.innerHTML = '<p class="persons-empty">Zatím nikdo neregistroval. Až hosté vyplní registraci, objeví se tu — vč. cizinců a chybějících dokladů (podklad pro Ubyport).</p>'; return; }
    wrap.innerHTML = '<div class="persons">' + persons.map(function (p) {
      var foreign = (p.citizenship || 'CZ') !== 'CZ';
      var docBadge = p.doc_number
        ? '<span class="badge ok">✓ ' + esc({ ID: 'OP', P: 'pas', O: 'doklad' }[p.doc_type] || 'doklad') + '</span> <span class="doc-num">' + esc(p.doc_number) + '</span>'
        : '<span class="badge no">✗ bez dokladu</span>';
      var meta = [fmtShort(p.stay_from, p.stay_to)];
      if (foreign) meta.push('<span class="badge foreign">cizinec</span>');
      if (foreign && p.ubyport_sent_at) meta.push('<span class="badge ok">✓ nahlášeno ' + esc(fmtStamp(p.ubyport_sent_at)) + '</span>');
      else if (foreign && p.ubyport_deadline) meta.push('<span class="badge ' + (p.ubyport_deadline <= isoToday() ? 'no' : 'soon') + '">UbyPort do ' + esc(fmtDay(p.ubyport_deadline)) + '</span>');
      return '<div class="person' + (foreign ? ' foreign' : '') + '">' +
        '<span class="person-flag" title="' + esc(p.citizenship) + '">' + flagEmoji(p.citizenship) + '</span>' +
        '<div class="person-main"><div class="person-nm">' + esc((p.first_name + ' ' + p.last_name).trim()) + '</div>' +
        '<div class="person-meta">' + meta.join(' ') + ' ' + docBadge + feeBadge(p) + '</div></div></div>';
    }).join('') + '</div>';
    Array.prototype.forEach.call(wrap.querySelectorAll('[data-exempt]'), function (btn) {
      btn.addEventListener('click', function () {
        var p = persons.filter(function (x) { return x.id === btn.getAttribute('data-exempt'); })[0];
        if (p) openExempt(p, btn.closest('.person'));
      });
    });
  }

  /* ============ KAUCE: přepínač ============ */
  function toggleDeposit(b, stay, cb) {
    var on = cb.checked;
    cb.disabled = true;
    rpc('vr_admin_msg_log', { p_booking_id: b.id, p_msg_key: 'deposit_enabled', p_sent: on }).then(function (res) {
      cb.disabled = false;
      if (!(res.data && res.data.ok)) { cb.checked = !on; toast('Nepodařilo se uložit.'); return; }
      b.msglog = (b.msglog || []).filter(function (m) { return m.msg_key !== 'deposit_enabled'; });
      if (on) b.msglog.push({ msg_key: 'deposit_enabled', sent_at: new Date().toISOString() });
      toast(on ? 'Kauce zapnuta.' : 'Kauce vypnuta.');
      renderTimeline(stay, b, buildCtx(b)); refreshBoards();
    }).catch(function () { cb.disabled = false; cb.checked = !on; toast('Nepodařilo se uložit.'); });
  }

  /* ============ UBYPORT (hlášení cizinců) ============ */
  // Číselník státního občanství: ISO 3166-1 alpha-2 → alpha-3 (kód dle číselníku
  // Ubyport = ISO alpha-3, viz UNL spec). Pokrývá běžné země hostů; neznámé → warn.
  var ISO2TO3 = {
    CZ:'CZE', SK:'SVK', DE:'DEU', PL:'POL', AT:'AUT', NL:'NLD', GB:'GBR', UK:'GBR', UA:'UKR',
    US:'USA', BE:'BEL', FR:'FRA', ES:'ESP', IT:'ITA', PT:'PRT', IE:'IRL', LU:'LUX', CH:'CHE',
    LI:'LIE', DK:'DNK', SE:'SWE', NO:'NOR', FI:'FIN', IS:'ISL', EE:'EST', LV:'LVA', LT:'LTU',
    HU:'HUN', RO:'ROU', BG:'BGR', GR:'GRC', HR:'HRV', SI:'SVN', RS:'SRB', BA:'BIH', ME:'MNE',
    MK:'MKD', AL:'ALB', MD:'MDA', BY:'BLR', RU:'RUS', TR:'TUR', CY:'CYP', MT:'MLT', CA:'CAN',
    AU:'AUS', NZ:'NZL', JP:'JPN', CN:'CHN', KR:'KOR', IN:'IND', IL:'ISR', ZA:'ZAF', BR:'BRA',
    MX:'MEX', AR:'ARG', AE:'ARE', SA:'SAU', EG:'EGY', MA:'MAR', TH:'THA', VN:'VNM', SG:'SGP',
    HK:'HKG', TW:'TWN', ID:'IDN', PH:'PHL', MY:'MYS', GE:'GEO', AM:'ARM', AZ:'AZE', KZ:'KAZ'
  };
  function ubyCountry(cit) {
    var c = String(cit || '').toUpperCase();
    if (ISO2TO3[c]) return { code: ISO2TO3[c], ok: true };
    if (/^[A-Z]{3}$/.test(c)) return { code: c, ok: true };  // už alpha-3
    return { code: c, ok: false };
  }

  // Windows-1250 (CP1250) enkodér — UNL soubor musí být v CP1250 dle spec.
  // Byte→unicode tabulka: default identita (Latin-1), přepsané jen odlišné sloty.
  var CP1250 = (function () {
    var hi = {}; for (var bb = 0x80; bb <= 0xFF; bb++) hi[bb] = bb;
    var ov = {
      0x80:0x20AC,0x82:0x201A,0x84:0x201E,0x85:0x2026,0x86:0x2020,0x87:0x2021,0x89:0x2030,
      0x8A:0x0160,0x8B:0x2039,0x8C:0x015A,0x8D:0x0164,0x8E:0x017D,0x8F:0x0179,
      0x91:0x2018,0x92:0x2019,0x93:0x201C,0x94:0x201D,0x95:0x2022,0x96:0x2013,0x97:0x2014,
      0x99:0x2122,0x9A:0x0161,0x9B:0x203A,0x9C:0x015B,0x9D:0x0165,0x9E:0x017E,0x9F:0x017A,
      0xA1:0x02C7,0xA2:0x02D8,0xA3:0x0141,0xA5:0x0104,0xAA:0x015E,0xAF:0x017B,
      0xB2:0x02DB,0xB3:0x0142,0xB9:0x0105,0xBA:0x015F,0xBC:0x013D,0xBD:0x02DD,0xBE:0x013E,0xBF:0x017C,
      0xC0:0x0154,0xC3:0x0102,0xC5:0x0139,0xC6:0x0106,0xC8:0x010C,0xCA:0x0118,0xCC:0x011A,0xCF:0x010E,
      0xD0:0x0110,0xD1:0x0143,0xD2:0x0147,0xD5:0x0150,0xD8:0x0158,0xD9:0x016E,0xDB:0x0170,0xDE:0x0162,
      0xE0:0x0155,0xE3:0x0103,0xE5:0x013A,0xE6:0x0107,0xE8:0x010D,0xEA:0x0119,0xEC:0x011B,0xEF:0x010F,
      0xF0:0x0111,0xF1:0x0144,0xF2:0x0148,0xF5:0x0151,0xF8:0x0159,0xF9:0x016F,0xFB:0x0171,0xFE:0x0163,0xFF:0x02D9
    };
    for (var k in ov) hi[k] = ov[k];
    var rev = {};
    for (var bb2 = 0x80; bb2 <= 0xFF; bb2++) rev[hi[bb2]] = bb2;
    return rev;   // unicode codepoint -> CP1250 byte
  })();
  function toCp1250Bytes(str) {
    str = String(str == null ? '' : str);
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c <= 0x7f) { out.push(c); continue; }
      if (CP1250[c] != null) { out.push(CP1250[c]); continue; }
      var ch = str[i].normalize('NFD').replace(/[̀-ͯ]/g, '');
      out.push(ch && ch.charCodeAt(0) <= 0x7f ? ch.charCodeAt(0) : 0x3f); // fallback '?'
    }
    return new Uint8Array(out);
  }

  function ubyField(s) { return String(s == null ? '' : s).replace(/[|\r\n]/g, ' ').trim(); }
  function ubyDate(iso) {
    if (!iso) return '';
    var p = String(iso).slice(0, 10).split('-');
    return p.length === 3 ? (p[2] + '.' + p[1] + '.' + p[0]) : '';
  }
  // Věta A, pole 14 „datum a čas exportu“: yyyy.mm.dd hh:mm:ss (UbyPortPr3, kap. 3.2).
  // Pozor, v U větách je datum obráceně (dd.mm.yyyy) — tak to spec chce.
  function ubyNow() {
    var d = new Date(), z = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '.' + z(d.getMonth() + 1) + '.' + z(d.getDate()) + ' ' +
      z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds());
  }
  // Číslo dokladu: jen A–Z a 0–9, velkými písmeny (UbyPortPr3, „Specifické – Doklad“).
  // Pomlčku z registrace by UbyPort odmítl, mezery vynechává sám.
  function ubyDoc(s) { return String(s == null ? '' : s).toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function foreignersOf(b) {
    return (b._persons || []).filter(function (p) { return (p.citizenship || 'CZ').toUpperCase() !== 'CZ'; });
  }
  function ubyValidate(foreigners) {
    var issues = [];
    foreigners.forEach(function (p) {
      var probs = [];
      if (!p.doc_number) probs.push('chybí číslo dokladu');
      else if (ubyDoc(p.doc_number).length < 6) probs.push('číslo dokladu má méně než 6 znaků (UbyPort ho odmítne)');
      if (!p.birth_date) probs.push('chybí datum narození');
      if (!ubyCountry(p.citizenship).ok) probs.push('neznámý kód země „' + (p.citizenship || '?') + '"');
      if (probs.length) issues.push({ name: (p.first_name + ' ' + p.last_name).trim(), probs: probs });
    });
    return issues;
  }
  function ubyHeaderLine() {
    var c = adminConfig || {};
    return ['A', '2',
      ubyField(c.ubyport_idub), ubyField(c.ubyport_zkratka), ubyField(c.ubyport_name),
      ubyField(c.ubyport_kontakt), ubyField(c.ubyport_okres), ubyField(c.ubyport_obec),
      ubyField(c.ubyport_cast), ubyField(c.ubyport_ulice), ubyField(c.ubyport_cislo_domovni),
      ubyField(c.ubyport_cislo_orientacni), ubyField(c.ubyport_psc), ubyNow(), '', ''
    ].join('|');
  }
  function ubyGuestLine(p) {
    var c = adminConfig || {};
    var ucel = ubyField(c.ubyport_ucel_default) || '10';   // 10 = TURISTIKA
    var bydliste = [ubyField(p.residence_street), ubyField(p.residence_city), (p.residence_country ? ubyCountry(p.residence_country).code : '')]
      .filter(function (x) { return x; }).join(', ');
    return ['U',
      ubyDate(p.stay_from), ubyDate(p.stay_to),
      ubyField(p.last_name), ubyField(p.first_name), '',
      ubyDate(p.birth_date), '', '',
      ubyCountry(p.citizenship).code,
      bydliste, ubyDoc(p.doc_number), '', ucel, '', ''
    ].join('|');
  }
  function unreportedOf(b) {
    return foreignersOf(b).filter(function (p) { return !p.ubyport_report_id; });
  }
  // Do souboru jdou jen dosud nenahlášení — ať se nikdo nehlásí dvakrát.
  // Když jsou nahlášení všichni, soubor obsahuje všechny (kopie pro archiv).
  function ubyTargets(b) {
    var u = unreportedOf(b);
    return u.length ? u : foreignersOf(b);
  }
  function buildUnl(b) {
    var foreigners = ubyTargets(b);
    var lines = [ubyHeaderLine()];
    foreigners.forEach(function (p) { lines.push(ubyGuestLine(p)); });
    // každý záznam včetně posledního končí CRLF (UbyPortPr3, kap. 3.1)
    return toCp1250Bytes(lines.join('\r\n') + '\r\n');
  }
  function unlFilename(b) {
    var idub = ubyField((adminConfig || {}).ubyport_idub) || 'IDUB';
    var d = new Date(), z = function (n) { return String(n).padStart(2, '0'); };
    return idub + '_' + d.getFullYear() + '_' + z(d.getMonth() + 1) + '_' + z(d.getDate()) +
      '_' + z(d.getHours()) + z(d.getMinutes()) + '_villarudolf.unl';
  }
  function downloadUnl(b) {
    if (!ubyField((adminConfig || {}).ubyport_idub)) { toast('Doplňte IDUB v Nastavení.'); return; }
    var bytes = buildUnl(b);
    var blob = new Blob([bytes], { type: 'application/octet-stream' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url; a.download = unlFilename(b);
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    toast('UNL soubor stažen.');
  }
  function ubyPlainText(b) {
    var fs = ubyTargets(b);
    if (!fs.length) return '';
    return fs.map(function (p) {
      return [
        'Příjmení a jméno: ' + (p.last_name || '') + ' ' + (p.first_name || ''),
        'Datum narození: ' + (ubyDate(p.birth_date) || '—'),
        'Státní občanství: ' + ubyCountry(p.citizenship).code + ' (' + (p.citizenship || '?') + ')',
        'Číslo dokladu: ' + (p.doc_number || '—'),
        'Bydliště: ' + [p.residence_city, p.residence_country].filter(Boolean).join(', '),
        'Ubytován od–do: ' + (ubyDate(p.stay_from) || '?') + ' – ' + (ubyDate(p.stay_to) || '?'),
        'Účel pobytu: ' + ((adminConfig || {}).ubyport_ucel_default || '10') + ' (turistika)'
      ].join('\n');
    }).join('\n\n');
  }
  function copyForeigners(b) {
    var t = ubyPlainText(b);
    if (!t) { toast('Žádní cizinci k zkopírování.'); return; }
    copyText(t); toast('Seznam cizinců zkopírován.');
  }
  function renderUbyport(b) {
    var wrap = $('d-ubyport'); if (!wrap) return;
    var fs = foreignersOf(b);
    var hasIdub = !!ubyField((adminConfig || {}).ubyport_idub);
    if (!fs.length) {
      wrap.innerHTML = '<p class="persons-empty">Žádní registrovaní cizinci — hlášení Ubyport se tohoto pobytu netýká. (Hlásí se jen ubytovaní cizinci; občané ČR ne.)</p>';
      return;
    }
    var todo = unreportedOf(b);
    var issues = todo.length ? ubyValidate(todo) : [];   // hotové už nekontrolujeme
    var issuesHtml = '';
    if (issues.length) {
      issuesHtml = '<div class="uby-warn"><b>⚠️ Před odesláním zkontrolujte:</b><ul>' +
        issues.map(function (it) {
          return '<li>' + esc(it.name || 'osoba') + ' — ' + esc(it.probs.join(', ')) + '</li>';
        }).join('') + '</ul></div>';
    }
    var idubHtml = hasIdub ? '' :
      '<div class="uby-warn"><b>Doplňte IDUB v Nastavení</b> — bez identifikátoru ubytovatele (z vašeho účtu Ubyport) nelze soubor vygenerovat. Adresa vily je předvyplněná.</div>';

    // Stav: kolik zbývá nahlásit a do kdy (lhůtu počítá DB i se svátky).
    var today = isoToday();
    var deadline = todo.reduce(function (m, p) {
      return p.ubyport_deadline && (!m || p.ubyport_deadline < m) ? p.ubyport_deadline : m;
    }, null);
    var statusHtml;
    if (!todo.length) {
      statusHtml = '<div class="uby-state ok">✓ Všichni cizinci (' + fs.length + ') jsou nahlášení.</div>';
    } else {
      var late = deadline && deadline < today, last = deadline === today;
      statusHtml = '<div class="uby-state ' + (late || last ? 'late' : 'due') + '">' +
        'K nahlášení: <b>' + todo.length + '</b> z ' + fs.length +
        (deadline ? (late ? ' · <b>lhůta uplynula ' + esc(fmtDay(deadline)) + '</b>'
          : last ? ' · <b>dnes je poslední den lhůty</b>'
          : ' · lhůta do <b>' + esc(fmtDay(deadline)) + '</b>') : '') +
        '</div>';
    }

    var reports = b._ubyReports || [];
    var METHOD = { unl: 'soubor UNL', form: 'ruční formulář', ws: 'webová služba' };
    var reportsHtml = reports.length ? '<div class="uby-reports">' + reports.map(function (r) {
      return '<div class="uby-rep"><div class="uby-rep-main">Odesláno <b>' + esc(fmtStamp(r.sent_at)) + '</b> · ' +
        esc(METHOD[r.method] || r.method) + ' · ' + r.persons + ' ' + (r.persons === 1 ? 'osoba' : (r.persons <= 4 ? 'osoby' : 'osob')) +
        (r.receipt ? ' · potvrzení <code>' + esc(r.receipt) + '</code>' : '') +
        (r.note ? '<div class="uby-rep-note">' + esc(r.note) + '</div>' : '') + '</div>' +
        '<button type="button" class="btn btn-sm btn-ghost" data-uby-undo="' + esc(r.id) + '">Vrátit</button></div>';
    }).join('') + '</div>' : '';

    wrap.innerHTML =
      statusHtml +
      issuesHtml + idubHtml +
      '<div class="uby-actions">' +
      '<button type="button" class="btn btn-sm btn-primary" id="uby-dl"' + (hasIdub ? '' : ' aria-disabled="true"') + '>Stáhnout hlášení Ubyport (UNL)</button>' +
      '<button type="button" class="btn btn-sm btn-outline" id="uby-copy">Zkopírovat seznam cizinců</button>' +
      (todo.length ? '<button type="button" class="btn btn-sm btn-outline" id="uby-mark">✓ Nahlášeno…</button>' : '') +
      '</div>' +
      '<div id="uby-mark-form" hidden></div>' +
      '<p class="hint">Soubor je v oficiálním formátu UNL (CP1250), účel pobytu 10 = turistika, a obsahuje jen dosud nenahlášené. Nahrajete ho ve svém účtu Ubyport (modul UpLoad). '
        + 'Po odeslání klikněte na „Nahlášeno“ — systém pak přestane hlídat lhůtu. Lhůta jsou 3 pracovní dny ode dne ubytování (§ 102 zák. 326/1999 Sb.).</p>' +
      reportsHtml;
    $('uby-dl').addEventListener('click', function () { downloadUnl(b); });
    $('uby-copy').addEventListener('click', function () { copyForeigners(b); });
    if ($('uby-mark')) $('uby-mark').addEventListener('click', function () { openUbyMark(b, todo); });
    Array.prototype.forEach.call(wrap.querySelectorAll('[data-uby-undo]'), function (btn) {
      btn.addEventListener('click', function () { undoUbyReport(b, btn.getAttribute('data-uby-undo'), btn); });
    });
  }

  function localInputNow() {
    var d = new Date(), z = function (n) { return String(n).padStart(2, '0'); };
    return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes());
  }
  function fmtStamp(ts) {
    var d = new Date(ts); if (isNaN(d)) return '';
    return d.getDate() + '. ' + (d.getMonth() + 1) + '. ' + d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0');
  }

  // Záznam, že hlášení odešlo. Nic neodesílá — to zatím dělá majitel v UbyPortu
  // (UNL / formulář). Webová služba WS_UBY se napojí, až policie vydá přístup.
  function openUbyMark(b, todo) {
    var box = $('uby-mark-form');
    if (!box.hidden) { box.hidden = true; return; }
    box.innerHTML =
      '<form id="uby-mf" class="uby-mf" autocomplete="off">' +
      '<div class="field"><span class="field-lbl">Kdo odešel</span>' +
      todo.map(function (p) {
        return '<label class="uby-chk"><input type="checkbox" name="uby-p" value="' + esc(p.id) + '" checked> ' +
          flagEmoji(p.citizenship) + ' ' + esc((p.first_name + ' ' + p.last_name).trim()) + '</label>';
      }).join('') + '</div>' +
      '<div class="field"><label for="uby-m-method">Jak</label><select id="uby-m-method">' +
      '<option value="unl">Soubor UNL (UpLoad)</option><option value="form">Ruční formulář v UbyPortu</option></select></div>' +
      '<div class="field"><label for="uby-m-at">Kdy odešlo</label><input type="datetime-local" id="uby-m-at" value="' + localInputNow() + '" max="' + localInputNow() + '"></div>' +
      '<div class="field"><label for="uby-m-rec">Potvrzení z UbyPortu (nepovinné)</label><input id="uby-m-rec" maxlength="120" placeholder="pseudorazítko / číslo z doručenky"></div>' +
      '<div class="field"><label for="uby-m-note">Poznámka (nepovinné)</label><input id="uby-m-note" maxlength="500"></div>' +
      '<p class="form-err" id="uby-m-err" hidden></p>' +
      '<button type="submit" class="btn btn-primary" id="uby-m-save" style="width:100%">Uložit jako nahlášené</button>' +
      '</form>';
    box.hidden = false;
    $('uby-mf').addEventListener('submit', function (ev) { ev.preventDefault(); saveUbyMark(b); });
  }
  var UBY_ERR = {
    nothing_to_report: 'Vybraní už jsou nahlášení (nebo to nejsou cizinci).',
    sent_in_future: 'Čas odeslání je v budoucnosti.',
    method_invalid: 'Neznámý způsob odeslání.',
    too_long: 'Potvrzení nebo poznámka jsou moc dlouhé.'
  };
  function saveUbyMark(b) {
    var ids = Array.prototype.map.call(document.querySelectorAll('#uby-mf input[name="uby-p"]:checked'), function (x) { return x.value; });
    var err = $('uby-m-err'); err.hidden = true;
    if (!ids.length) { err.textContent = 'Vyber aspoň jednu osobu.'; err.hidden = false; return; }
    var at = $('uby-m-at').value;
    var btn = $('uby-m-save'); btn.disabled = true; btn.textContent = 'Ukládám…';
    rpc('vr_admin_ubyport_mark', {
      p_booking_id: b.id, p_person_ids: ids, p_method: $('uby-m-method').value,
      p_sent_at: at ? new Date(at).toISOString() : null,
      p_receipt: $('uby-m-rec').value.trim() || null, p_note: $('uby-m-note').value.trim() || null
    }).then(function (res) {
      if (res.data && res.data.ok) {
        toast('Uloženo: nahlášeno ' + res.data.persons + '×.');
        loadPersons(b); reload();
      } else {
        btn.disabled = false; btn.textContent = 'Uložit jako nahlášené';
        err.textContent = UBY_ERR[res.data && res.data.error] || 'Uložení se nepodařilo.'; err.hidden = false;
      }
    }).catch(function () {
      btn.disabled = false; btn.textContent = 'Uložit jako nahlášené';
      err.textContent = 'Uložení se nepodařilo.'; err.hidden = false;
    });
  }
  function undoUbyReport(b, id, btn) {
    if (!window.confirm('Vrátit tenhle záznam? Osoby se vrátí mezi nenahlášené a znovu se začne hlídat lhůta. '
      + 'V UbyPortu to nic nezruší — slouží jen k opravě omylu.')) return;
    btn.disabled = true;
    rpc('vr_admin_ubyport_undo', { p_report_id: id }).then(function (res) {
      if (res.data && res.data.ok) { toast('Záznam vrácen.'); loadPersons(b); reload(); }
      else { btn.disabled = false; toast('Nepodařilo se uložit.'); }
    }).catch(function () { btn.disabled = false; toast('Nepodařilo se uložit.'); });
  }

  /* ============ POPLATEK Z POBYTU: pololetí, evidenční kniha, odvod ============ */
  function halfOf(y, h) {
    return { year: y, half: h, key: 'fee_odvod_' + y + '_' + h,
      from: y + (h === 1 ? '-01-01' : '-07-01'), to: y + (h === 1 ? '-06-30' : '-12-31'),
      deadline: (h === 1 ? y : y + 1) + (h === 1 ? '-07-20' : '-01-20'),
      label: (h === 1 ? '1. pololetí ' : '2. pololetí ') + y };
  }
  // V lednu (za 2. pololetí minulého roku) a v červenci (za 1. pololetí) je odvod na řadě.
  function feeDuePeriod(today) {
    var y = +today.slice(0, 4), m = +today.slice(5, 7);
    if (m === 1) return halfOf(y - 1, 2);
    if (m === 7) return halfOf(y, 1);
    return null;
  }
  function currentHalf(today) { var y = +today.slice(0, 4), m = +today.slice(5, 7); return halfOf(y, m <= 6 ? 1 : 2); }
  function prevHalf(h) { return h.half === 1 ? halfOf(h.year - 1, 2) : halfOf(h.year, 1); }

  var DOC_TYPE_TXT = { ID: 'občanský průkaz', P: 'cestovní pas', O: 'jiný doklad' };
  function openFeeReport(period) {
    var today = isoToday();
    var cur = currentHalf(today);
    period = period || feeDuePeriod(today) || cur;
    var opts = [cur, prevHalf(cur), prevHalf(prevHalf(cur)), prevHalf(prevHalf(prevHalf(cur)))];
    $('sheet-title').textContent = 'Poplatek z pobytu';
    $('sheet-body').innerHTML =
      '<div class="fee-periods">' + opts.map(function (o) {
        return '<button type="button" class="btn btn-sm ' + (o.key === period.key ? 'btn-primary' : 'btn-outline') + '" data-fp="' + o.key + '">' + esc(o.label) + '</button>';
      }).join('') + '</div><div id="fee-rep"><p class="persons-empty">Načítám…</p></div>';
    openOverlay();
    Array.prototype.forEach.call($('sheet-body').querySelectorAll('[data-fp]'), function (btn) {
      btn.addEventListener('click', function () {
        openFeeReport(opts.filter(function (o) { return o.key === btn.getAttribute('data-fp'); })[0]);
      });
    });
    rpc('vr_admin_fee_report', { p_from: period.from, p_to: period.to }).then(function (res) {
      var d = res.data || {};
      if (!d.ok) { $('fee-rep').innerHTML = '<p class="form-err">Přehled se nepodařilo načíst.</p>'; return; }
      renderFeeReport(period, d);
    }).catch(function () { $('fee-rep').innerHTML = '<p class="form-err">Přehled se nepodařilo načíst.</p>'; });
  }
  function renderFeeReport(period, d) {
    var rows = d.rows || [], paid = (adminConfig || {})[period.key];
    var missing = rows.filter(function (r) { return !r.birth_date || !r.residence_street || (!r.doc_number && isAdultOn(r.birth_date, r.stay_from)); }).length;
    var html = '<div class="feebox">' +
      '<div class="feeline"><span>Odvést městu za ' + esc(period.label) + '</span><span class="big">' + fmtCzk(d.total_czk) + '</span></div>' +
      '<div class="feenote">' + rows.length + ' osob v evidenci · sazba ' + (d.rate_czk || 25) + ' Kč/den · splatnost do ' + esc(fmtDay(period.deadline)) + ' ' + period.deadline.slice(0, 4) +
      (paid ? ' · <b>✓ odvedeno ' + esc(paid) + '</b>' : '') + '</div>' +
      (missing ? '<div class="uby-warn" style="margin-top:10px"><b>⚠️ ' + missing + '× neúplný záznam</b> (chybí datum narození, adresa nebo doklad dospělého) — evidenční kniha má být úplná (§ 3g).</div>' : '') +
      '</div>' +
      '<div class="uby-actions" style="margin-top:12px">' +
      '<button type="button" class="btn btn-sm btn-primary" id="fee-csv"' + (rows.length ? '' : ' disabled') + '>Stáhnout evidenční knihu (CSV)</button>' +
      '<button type="button" class="btn btn-sm btn-outline" id="fee-paid">' + (paid ? 'Zrušit „odvedeno“' : '✓ Odvedeno městu') + '</button>' +
      '</div>' +
      '<p class="hint">Poplatek platí každý host za každý den pobytu kromě dne příjezdu. Osvobozeni jsou jen lidé do 18 let a podle § 3b zákona (nevidomí, ZTP/P a průvodce, závislí na pomoci…); '
        + 'senioři osvobození nemají (OZV Svoboda nad Úpou č. 2/2023). Pobyt přes přelom pololetí se rozdělí po dnech.</p>';
    if (rows.length) {
      html += '<div class="fee-table"><table><thead><tr><th>Pobyt</th><th>Host</th><th>Narozen</th><th>Doklad</th><th class="num">Poplatek</th></tr></thead><tbody>' +
        rows.map(function (r) {
          return '<tr><td>' + esc(fmtShort(r.stay_from, r.stay_to)) + '</td><td>' + esc((r.first_name + ' ' + r.last_name).trim()) +
            '<div class="fee-sub">' + esc([r.residence_street, r.residence_city, r.residence_country].filter(Boolean).join(', ') || '— chybí adresa') + '</div></td>' +
            '<td>' + (r.birth_date ? esc(ubyDate(r.birth_date)) : '<span class="fee-miss">chybí</span>') + '</td>' +
            '<td>' + (r.doc_number ? esc((DOC_TYPE_TXT[r.doc_type] || 'doklad') + ' ' + r.doc_number) : '—') + '</td>' +
            '<td class="num">' + (r.czk ? fmtCzk(r.czk) : esc(FEE_REASON[r.reason] || 'bez poplatku')) + '</td></tr>';
        }).join('') + '</tbody></table></div>';
    }
    $('fee-rep').innerHTML = html;
    if ($('fee-csv')) $('fee-csv').addEventListener('click', function () { downloadFeeCsv(period, rows); });
    $('fee-paid').addEventListener('click', function () {
      var btn = this; btn.disabled = true;
      var val = paid ? '' : fmtDay(isoToday()) + ' ' + isoToday().slice(0, 4);
      rpc('vr_admin_set_config', { p_key: period.key, p_value: val }).then(function (res) {
        if (res.data && res.data.ok) {
          adminConfig[period.key] = val || undefined;
          toast(val ? 'Označeno jako odvedené.' : 'Označení zrušeno.');
          renderFeeReport(period, d); refreshBoards();
        } else { btn.disabled = false; toast('Uložení se nepodařilo.'); }
      }).catch(function () { btn.disabled = false; toast('Uložení se nepodařilo.'); });
    });
  }
  function isAdultOn(birth, at) {
    if (!birth) return true;
    var b = parseISO(birth); b.setFullYear(b.getFullYear() + 18);
    return b <= parseISO(at);
  }
  // Evidenční kniha podle § 3g zák. 565/1990 Sb. — středník + BOM, ať to Excel otevře česky.
  function downloadFeeCsv(period, rows) {
    var cell = function (v) { v = String(v == null ? '' : v); return /[";\r\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    var head = ['Den počátku pobytu', 'Den konce pobytu', 'Příjmení', 'Jméno', 'Datum narození', 'Adresa (ulice)', 'Město', 'Stát',
      'Druh dokladu', 'Číslo dokladu', 'Dny poplatku v období', 'Vybraný poplatek (Kč)', 'Důvod osvobození'];
    var lines = [head.join(';')].concat(rows.map(function (r) {
      return [ubyDate(r.stay_from), ubyDate(r.stay_to), r.last_name, r.first_name, ubyDate(r.birth_date),
        r.residence_street, r.residence_city, r.residence_country, DOC_TYPE_TXT[r.doc_type] || (r.doc_number ? 'neuvedeno' : ''), r.doc_number,
        r.paid_days, r.czk, r.czk ? '' : ((FEE_REASON[r.reason] || '') + (r.fee_exempt_note ? ' – ' + r.fee_exempt_note : ''))].map(cell).join(';');
    }));
    lines.push(['', '', '', '', '', '', '', '', '', '', 'Celkem', rows.reduce(function (s, r) { return s + (r.czk || 0); }, 0), ''].join(';'));
    var blob = new Blob(['\ufeff' + lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a'); a.href = url;
    a.download = 'evidencni-kniha_' + period.year + '-' + period.half + 'pol_villarudolf.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    toast('Evidenční kniha stažena.');
  }

  /* ============ NASTAVENÍ (heslo Wi-Fi + Ubyport konfigurace ubytovatele) ============ */
  var SETTINGS_FIELDS = [
    ['wifi_password', 'Heslo Wi-Fi (do uvítací zprávy, síť „Rudolf Wi-Fi“)', 'bez něj zůstane ve zprávě {WIFI_HESLO}'],
    ['ubyport_idub', 'IDUB (identifikátor ubytovatele)', 'z vašeho účtu Ubyport'],
    ['ubyport_zkratka', 'Zkratka', 'z Ubyport (nepovinné)'],
    ['ubyport_name', 'Název ubytovacího zařízení', 'Villa Rudolf'],
    ['ubyport_kontakt', 'Kontakt', 'telefon / e-mail'],
    ['ubyport_okres', 'Okres', 'Trutnov'],
    ['ubyport_obec', 'Obec', 'Svoboda nad Úpou'],
    ['ubyport_cast', 'Část obce', 'nepovinné'],
    ['ubyport_ulice', 'Ulice', 'Luční'],
    ['ubyport_cislo_domovni', 'Číslo domovní', '519'],
    ['ubyport_cislo_orientacni', 'Číslo orientační', 'nepovinné'],
    ['ubyport_psc', 'PSČ', '54224'],
    ['ubyport_ucel_default', 'Účel pobytu (kód)', '10 = turistika']
  ];
  function openSettings(focusId) {
    $('sheet-title').textContent = 'Nastavení';
    var c = adminConfig || {};
    $('sheet-body').innerHTML =
      '<form id="set-form" autocomplete="off">' +
      '<p class="hint">Heslo Wi-Fi se vkládá do uvítací zprávy hostovi (v repu není, žije jen tady). Dál údaje ubytovatele do hlavičky hlášení cizinců (Ubyport). <b>IDUB</b> získáte ve svém účtu Ubyport (Služba cizinecké policie); ostatní je předvyplněné adresou vily.</p>' +
      SETTINGS_FIELDS.map(function (f) {
        return '<div class="field"><label>' + esc(f[1]) + '</label>' +
          '<input id="set-' + f[0] + '" maxlength="200" value="' + esc(c[f[0]] || '') + '" placeholder="' + esc(f[2]) + '"></div>';
      }).join('') +
      '<p class="form-err" id="set-err" hidden></p>' +
      '<button type="submit" class="btn btn-primary" id="set-save" style="width:100%">Uložit nastavení</button>' +
      '</form>';
    openOverlay();
    if (focusId && $(focusId)) $(focusId).focus();
    $('set-form').addEventListener('submit', function (ev) { ev.preventDefault(); saveSettings(); });
  }
  function saveSettings() {
    var btn = $('set-save'); btn.disabled = true; btn.textContent = 'Ukládám…';
    var err = $('set-err'); err.hidden = true;
    var ops = SETTINGS_FIELDS.map(function (f) {
      var val = $('set-' + f[0]).value.trim();
      return rpc('vr_admin_set_config', { p_key: f[0], p_value: val }).then(function (res) {
        if (res.data && res.data.ok) adminConfig[f[0]] = val || undefined;
        return res.data && res.data.ok;
      });
    });
    Promise.all(ops).then(function (results) {
      btn.disabled = false; btn.textContent = 'Uložit nastavení';
      if (results.every(Boolean)) { toast('Nastavení uloženo.'); closeOverlay(); refreshBoards(); }
      else { err.textContent = 'Některé pole se nepodařilo uložit.'; err.hidden = false; }
    }).catch(function () {
      btn.disabled = false; btn.textContent = 'Uložit nastavení';
      err.textContent = 'Uložení se nepodařilo.'; err.hidden = false;
    });
  }

  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).catch(function () {}); return; }
    var ta = document.createElement('textarea'); ta.value = t; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {} ta.remove();
  }

  /* ============ Reload ============ */
  function reload() {
    $('loadline').hidden = false; $('loadline').textContent = 'Načítám pobyty a kalendář…';
    return Promise.all([loadCalendar(), loadBookings(), loadConfig(), loadConflicts(), loadRequests(), loadHolds(), loadPayments(), loadVerified(), loadDoorCodes()]).then(function (r) {
      calendar = r[0]; bookings = r[1]; adminConfig = r[2] || {}; serverConflicts = r[3] || [];
      requests = r[4] || []; holds = r[5] || []; payments = r[6] || []; verified = r[7] || {};
      doorCodes = r[8];
      buildStays();
      $('loadline').hidden = true;
      renderConflicts(); refreshBoards();
    }).catch(function (e) {
      if (String(e && e.message) === 'unauthorized') { lockOut('Přístup vypršel. Přihlaste se znovu.'); return; }
      $('loadline').hidden = false; $('loadline').textContent = 'Načtení se nepodařilo. Zkuste Obnovit.';
    });
  }

  /* ============ Brána: unlock / lock ============ */
  function showApp() { $('lock').hidden = true; $('app').hidden = false; }
  function lockOut(msg) {
    adminKey = null; clearKey();
    $('app').hidden = true; $('lock').hidden = false;
    if (msg) { $('lock-err').textContent = msg; $('lock-err').hidden = false; }
  }

  function attemptUnlock(token, remember) {
    token = (token || '').trim();
    if (!token) return Promise.resolve(false);
    return sha256hex(token).then(function (h) {
      if (h !== TOKEN_HASH) return false;
      adminKey = token;
      storeKey(token, remember);
      showApp();
      reload();
      return true;
    });
  }

  function initGate() {
    // 1) uložený klíč
    var stored = readStoredKey();
    // 2) ?key= v URL
    var qs = new URLSearchParams(location.search);
    var keyParam = qs.get('key');

    $('lock-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      $('lock-err').hidden = true;
      var val = $('lock-input').value;
      var rem = $('lock-remember').checked;
      attemptUnlock(val, rem).then(function (ok) {
        if (!ok) { $('lock-err').textContent = 'Neplatný token.'; $('lock-err').hidden = false; }
      });
    });
    $('btn-refresh').addEventListener('click', function () { reload(); });
    $('btn-settings').addEventListener('click', function () { openSettings(); });
    $('btn-fee').addEventListener('click', function () { openFeeReport(); });
    $('btn-lock').addEventListener('click', function () { lockOut(); $('lock-input').value = ''; });
    $('sheet-close').addEventListener('click', closeOverlay);
    $('overlay').addEventListener('click', function (e) { if (e.target === $('overlay')) closeOverlay(); });
    $('btn-manual').addEventListener('click', function () { openEditor({}); });
    $('btn-hold').addEventListener('click', function () { openHoldEditor(null); });
    $('btn-hold-closed').addEventListener('click', function () {
      holdsShowClosed = !holdsShowClosed; renderHolds();
    });
    $('btn-req-done').addEventListener('click', function () {
      requestsShowDone = !requestsShowDone; renderRequests();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('overlay').hidden) closeOverlay(); });

    if (keyParam) {
      attemptUnlock(keyParam, false).finally(function () {
        try { history.replaceState(null, '', location.pathname); } catch (e) {}
      });
    } else if (stored) {
      attemptUnlock(stored, false).then(function (ok) { if (!ok) clearKey(); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initGate);
  else initGate();
})();
