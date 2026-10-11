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
  // Od 11. 10. 2026: sekvence má 5 kroků místo 7. „first" = první ozvěna hned po
  // rezervaci (dřív „confirm" v T−30); uvítací zpráva nese i kód ke dveřím a odkaz na
  // registraci, takže samostatné „registration" a „doorcode" zanikly. Němčina tyká
  // v množném čísle („ihr/euch") jako německý web — zdroj pravdy pro hlas je
  // villa-rudolf-portal/docs/text-villa-rudolf.md, kap. 1.
  // fee* = stavebnice odstavce o poplatku ({POPLATEK}), viz buildCtx().
  var TPL = {
    "cs": {
      "first": "Dobrý den, {JMENO},\n\ntady Pavel z Villy Rudolf. Do vašeho pobytu ({TERMIN}) je ještě čas, ale už se na vás těšíme a chtěl jsem se ozvat.\n\n{NOVINKA}Dvě věci, ať máte klid:\n\n🛂 Při příjezdu zapisujeme všechny hosty včetně dětí. Mrkněte prosím včas, že má každý platný doklad, i děti – vyřízení trvá pár týdnů.\n\n👨‍👩‍👧 Víte už zhruba, v kolika lidech pojedete a kolik bude dětí? Rád vám podle toho připravím postýlky a tipy na výlety.\n\nVšechno praktické (adresa, kód ke dveřím, Wi-Fi) pošlu týden před příjezdem. Kdyby se u vás cokoliv měnilo, klidně napište hned, vždycky se nějak domluvíme.\n\nPavel",
      "nudge": "Dobrý den, {JMENO}, jen se připomínám – dorazila vám moje zpráva k pobytu ({TERMIN})? Stačí krátká odpověď, ať vím, že je u vás všechno při starém. Díky!\nPavel",
      "welcomeCore": "Dobrý den, {JMENO},\n\nmoc se na vás těšíme — {TERMIN} bude Villa Rudolf jen vaše! Posílám všechno důležité v jedné zprávě, ať ji máte po ruce.\n\n📍 *Kam jedete*\nVilla Rudolf, Luční 519, Svoboda nad Úpou. Parkujete přímo na pozemku u domu.\n\n🕒 *Dům je váš od 15:00*\nDopoledne ho po předchozí partě chystáme do plné parády — proto prosím nejezděte dřív, ať vás nevítáme s vysavačem v ruce. 🙂\n\n🔑 *Vstup bez klíčů*\nKód ke dveřím: *{KOD_DVERI}*. Platí od 15:00 v den příjezdu do 10:00 v den odjezdu. Nechte si ho prosím jen ve své skupině a při odchodu vždy mrkněte, že jsou dveře zavřené — dům je po celý pobyt jen váš.\n\n🏠 *Prohlédněte si dům už teď*\nVirtuální prohlídka: https://www.keypano.com/v/569g7v8_96ci86-1770715560.html\nVideo k domu: https://youtu.be/tWCuuovnh2U\n\n🥾 *Váš osobní průvodce výlety*\nPřipravili jsme vám stránku s tipy na výlety seřazenými podle počasí, věku dětí a velikosti vaší skupiny: {PRUVODCE_LINK}\nKlidně ji otevřete už teď — před příjezdem se hodí na plánování.\n\n📝 *Registrace hostů*\nVyřídíte ji za pár minut už teď z domova: {REGISTRACNI_LINK}\nZapište prosím všechny, i děti. Kdo to nestihne předem, najde QR kód na lednici. Není to náš výmysl, město vede evidenci k místnímu poplatku — a máte to z krku.\n\n💳 *Místní poplatek (jde městu, ne nám)*\n{POPLATEK}\n\n🌙 *Večery*\nJsme v horském údolí, které nese zvuk dál, než byste čekali — a sousedé kolem tu žijí celý rok, ne jen na víkend. Hudba proto u nás hraje jen uvnitř domu: reproduktory na pozemek prosíme vůbec, ani přes den. Večer u ohně to bohatě vynahradí praskání dřeva a ticho, jaké ve městě neuslyšíte. Po desáté večer buďte prosím venku úplně potichu — lidé okolo ráno vstávají do práce a v létě spí při otevřených oknech, a hluk je bohužel rychle přiměje volat policii. Večer u ohně je krásný i potichu, uvidíte. Uvnitř si poseďte, jak dlouho chcete.\n\n📶 *Wi-Fi všude*\nSíť „Rudolf Wi-Fi\", heslo: {WIFI_HESLO}. Chytá v celém domě i po celém pozemku — od ohniště přes pergolu až po dětské hřiště.\n\n📞 *Kdyby cokoliv*\nPavel: +420 775 220 785 — pište, volejte, jsem tu pro vás.\nNemocnice Trutnov: +420 499 866 111 (Maxima Gorkého 77, Trutnov)\nTíseň: 112 · záchranka 155 · policie 158 · hasiči 150 · městská policie 156\nHorská služba: +420 602 448 338\n\nTěšíme se na vás!\nPavel",
      "feeRate": "25 Kč / 1 € za dospělého a noc.",
      "feeAmount": " U vás: {DOSPELI} dospělých × {NOCI} nocí = {CASTKA} Kč.",
      "feeUnknown": " Děti do 18 let neplatí; přesnou částku spočítáme podle registrace.",
      "feePay": " Nejjednodušší kartou přes https://revolut.me/pavelhuqh, klidně ale i hotově na místě.",
      "feeDeposit": " Nic neplatíte zvlášť — poplatek vyúčtujeme z kauce podle smlouvy.",
      "summer": "☀️ *Léto u Rudolfa — pár věcí navíc*\n\n🏊 *Bazén* (v provozu zhruba květen–září, vyhřívaný na ~27 °C — trochu podle počasí)\nPředáváme ho vždy zamčený — klíče jsou v kuchyni v levé horní skříňce (při pohledu na linku úplně nahoře vlevo). Zamčený je kvůli bezpečí dětí: k vodě prosím vždy jen pod dohledem dospělého, nikdy samy — stačí okamžik nepozornosti. Po koupání bazén zase zavřete a zamkněte, krásně tak drží teplotu i čistotu. A skleničky nechte prosím na terase — kdyby se sklo v bazénu rozbilo, museli bychom ho celý vypustit, vyčistit a znovu napouštět a ohřívat, a to je pro vás den i víc bez koupání.\n\n🔥 *Ohniště, gril, dřevo*\nVelké ohniště, pergola-altán i elektrické grily čekají na vás. Dřevo je pod dvěma smrky u parkoviště — v přístřešku najdete sekeru, pilu i opékací jehly, zámek otevřete kódem *0519*. Jedno upozornění s péčí: když se oheň protáhne do noci, uhlíky bývají ráno pořád horké — ohlídejte prosím malé zvědavce, ohniště je ráno láká.\n\n🧖 *Sauna*\nPřipravená pro vás — návod je v letním videu i přímo u sauny. Dovnitř s ručníkem, prosím.\n\n🎬 *Všechno pohromadě v letním videu* (přivítání, bazén, sauna, dřevo, registrace):\nhttps://www.youtube.com/watch?v=ksVpDr-P8ic\n\nAť vám léto u Rudolfa chutná!\nPavel",
      "winter": "❄️ *Zima u Rudolfa — ať jste na svahu dřív než fronty*\n\n🚌 *Skibus kousek od domu*\nJak na zastávku, ukazuje krátké video: https://youtu.be/ZX8HJqZ1YBQ\nJízdní řády: https://drive.google.com/drive/folders/1HPJI7XydWwljBq_V19QwJGuBQWn73dZe\nPřed cestou si prosím ověřte aktuální jízdní řád — v sezóně se občas mění.\n\n🎿 *Lyžárna přímo v domě*\nLyže i boty tam přes noc krásně oschnou a ráno vyrážíte v suchém a teplém.\n\n🧖 *Sauna*\nPo dni na svahu to nejlepší zakončení. Návod najdete ve videu k domu i přímo u sauny — jen ručník s sebou.\n\nKdyby cokoliv, jsem na telefonu. Užijte si hory!\nPavel",
      "deposit": "Dobrý den, {JMENO}, ještě jedna praktická věc k pobytu {TERMIN}. Vybíráme vratnou kauci {KAUCE} Kč — je to jen jistota pro případ škody, po odjezdu a rychlé kontrole domu vám ji obratem vracíme zpět v plné výši. Pošlete ji prosím pohodlně kartou přes Revolut: https://revolut.me/pavelhuqh ({KAUCE} Kč). Díky moc a těšíme se na vás!\nPavel",
      "day2": "Dobrý den, {JMENO}, jen se hlásím po první noci — máte všechno, jak má být? 🙂 Kdyby cokoliv drhlo nebo jste něco nemohli najít, napište mi nebo rovnou zavolejte (+420 775 220 785) — vyřeším to hned. Užívejte hory!\nPavel",
      "predeparture": "Dobrý den, {JMENO}, zítra se budeme loučit — snad vám bylo u Rudolfa dobře! Než vyrazíte, poprosím o pár drobností (dohromady tak 10 minut) — o všechno ostatní se postará úklidová služba:\n\n🍽 nádobí do myčky a zapnout ji\n🗑 odpadky do označených nádob — díky za základní roztřídění\n🛏 povlečení svléknout a spolu s ručníky nechat na určeném místě\n🧺 půjčené vybavení vrátit tam, kde jste ho našli\n🔍 mrknout na zavřená okna a dveře, vypnuté spotřebiče (v létě i zamčený bazén)\n\nDům prosím předejte do 10:00 — v deset nastupuje úklid, aby v 15:00 přebírala další parta dům stejně nachystaný, jako jste ho přebírali vy.\n\nDíky moc, že to s námi dotáhnete do konce. Šťastnou cestu!\nPavel",
      "reviewBody": "Dobrý den, {JMENO}, dnes se loučíme — a moc rádi jsme vás u Rudolfa měli. Snad si z hor odvážíte přesně to, pro co jste jeli.\n\nJen drobná připomínka: dům prosím předejte do 10:00. Nechceme vás vyhánět, slibuju 🙂 — jen v deset nastupuje úklidová služba, aby v 15:00 mohla vítat další hosty.\n\nA pak jedna prosba, která pro nás znamená opravdu hodně. Jsme malý rodinný pronájem a hodnocení jsou to hlavní, podle čeho si Rudolfa najdou další party a rodiny.\n",
      "reviewAirbnb": "\nPokud cítíte, že si zasloužíme plných 5 hvězdiček, budeme moc vděční, když nám je na Airbnb dáte — pomáhá nám to víc, než se zdá. A kdyby cokoliv, byť maličkost, nebylo stoprocentní, napište to prosím rovnou mně sem na WhatsApp — já to totiž můžu napravit, recenze už ne. 🙂\n\nŠťastnou cestu domů — a kdykoli se budete chtít do Krkonoš vrátit, Rudolf i my tu budeme!\nPavel",
      "reviewBooking": "\nPokud cítíte, že si zasloužíme plných 10 z 10, budeme moc vděční, když nám je na Bookingu dáte — pomáhá nám to víc, než se zdá. A kdyby cokoliv, byť maličkost, nebylo stoprocentní, napište to prosím rovnou mně sem na WhatsApp — já to totiž můžu napravit, recenze už ne. 🙂\n\nŠťastnou cestu domů — a kdykoli se budete chtít do Krkonoš vrátit, Rudolf i my tu budeme!\nPavel",
      "reviewGoogle": "\nPokud cítíte, že si zasloužíme plné hodnocení, budeme moc vděční za recenzi na Googlu — pomáhá nám to víc, než se zdá. A kdyby cokoliv, byť maličkost, nebylo stoprocentní, napište to prosím rovnou mně sem na WhatsApp — já to totiž můžu napravit, recenze už ne. 🙂\n\nŠťastnou cestu domů — a kdykoli se budete chtít do Krkonoš vrátit, Rudolf i my tu budeme!\nPavel"
    },
    "en": {
      "first": "Hello {JMENO},\n\nthis is Pavel from Villa Rudolf. There's still some time until your stay ({TERMIN}), but we're already looking forward to having you and I wanted to get in touch.\n\n{NOVINKA}Two things, so you can relax:\n\n🛂 On arrival we register all guests, children included. Please check in good time that everyone has a valid ID or passport, the children too – getting one issued can take a few weeks.\n\n👨‍👩‍👧 Do you already know roughly how many adults and children will be coming? Then I can get the cots ready and pick trip tips that fit your group.\n\nI'll send everything practical (address, door code, Wi-Fi) a week before you arrive. If anything changes on your side, just message me straight away – we'll always find a way.\n\nBest wishes from the Krkonoše mountains\nPavel",
      "nudge": "Hello {JMENO}, just a quick follow-up – did my message about your stay ({TERMIN}) reach you? A short reply is enough, so I know everything is still on track. Thank you!\nPavel",
      "welcomeCore": "Hello {JMENO},\n\nWe're really looking forward to having you — for {TERMIN}, Villa Rudolf will be all yours! Here's everything important in one message, so you have it handy.\n\n📍 *Where you're headed*\nVilla Rudolf, Luční 519, Svoboda nad Úpou. You park right on the property, next to the house.\n\n🕒 *The house is yours from 15:00*\nIn the morning we're getting it back into perfect shape after the previous group — so please don't arrive early, or we'll be welcoming you with a vacuum cleaner in hand. 🙂\n\n🔑 *Keyless entry*\nYour door code: *{KOD_DVERI}*. It works from 15:00 on your arrival day until 10:00 on the day you leave. Please keep it within your group only, and whenever you head out, just check the door is closed — the house is yours alone for the whole stay.\n\n🏠 *Have a look around the house right now*\nVirtual tour: https://www.keypano.com/v/569g7v8_96ci86-1770715560.html\nHouse video: https://youtu.be/tWCuuovnh2U\n\n🥾 *Your personal trip guide*\nWe've put together a page with trip tips sorted by the weather, your children's ages and the size of your group: {PRUVODCE_LINK}\nFeel free to open it now — it's handy for planning before you arrive.\n\n📝 *Guest registration*\nIt takes a few minutes and you can do it right now from home: {REGISTRACNI_LINK}\nPlease enter everyone, children included. If you don't get to it beforehand, you'll find a QR code on the fridge. It's not something we invented — the town keeps a register for the local fee, and then it's off your plate.\n\n💳 *Local fee (goes to the town, not to us)*\n{POPLATEK}\n\n🌙 *Evenings*\nWe're in a mountain valley that carries sound further than you'd expect — and the neighbours around us live here all year round, not just at weekends. That's why music at our place plays only inside the house: please no speakers out on the grounds at all, not even during the day. An evening by the fire more than makes up for it — crackling wood and a kind of quiet you won't hear in the city. After ten in the evening, please keep completely quiet outdoors — people around here get up early for work and sleep with their windows open in summer, and noise sadly gets them calling the police quickly. An evening by the fire is beautiful even when it's quiet — you'll see. And inside, sit up as long as you like.\n\n📶 *Wi-Fi everywhere*\nNetwork \"Rudolf Wi-Fi\", password: {WIFI_HESLO}. You'll get signal throughout the house and across the whole property — from the fire pit to the pergola to the children's playground.\n\n📞 *If you need anything at all*\nPavel: +420 775 220 785 — message me, call me, I'm here for you.\nTrutnov Hospital: +420 499 866 111 (Maxima Gorkého 77, Trutnov)\nEmergency: 112 · ambulance 155 · police 158 · fire brigade 150 · municipal police 156\nMountain Rescue: +420 602 448 338\n\nWe can't wait to see you!\nPavel",
      "feeRate": "25 Kč / 1 € per adult per night.",
      "feeAmount": " For your group: {DOSPELI} adults × {NOCI} nights = {CASTKA} Kč.",
      "feeUnknown": " Children under 18 don't pay; we'll work out the exact amount from the registration.",
      "feePay": " Easiest by card via https://revolut.me/pavelhuqh, though cash on the spot is absolutely fine too.",
      "feeDeposit": " There's nothing to pay separately — we settle the fee from your deposit, as set out in the contract.",
      "summer": "☀️ *Summer at Rudolf's — a few extra things*\n\n🏊 *Pool* (open roughly May–September, heated to ~27 °C — depending a little on the weather)\nWe always hand it over locked — the keys are in the kitchen, in the upper left cupboard (facing the kitchen counter, top row, far left). It's locked for the children's safety: please make sure kids only ever go near the water under adult supervision, never on their own — a single moment of inattention is all it takes. After swimming, close and lock the pool again — that way it keeps its temperature and stays lovely and clean. And please keep glasses on the terrace — if glass ever broke in the pool, we'd have to drain it completely, clean it, then refill and reheat it, and that means a day or more without swimming for you.\n\n🔥 *Fire pit, grill, firewood*\nThe big fire pit, the pergola gazebo and the electric grills are all waiting for you. Firewood is under the two spruces by the car park — in the shelter you'll find an axe, a saw and roasting skewers; the lock opens with the code *0519*. One note, said with care: when the fire runs late into the night, the embers are often still hot in the morning — please keep an eye on your little explorers, the fire pit tempts them first thing in the morning.\n\n🧖 *Sauna*\nReady and waiting for you — instructions are in the summer video and right by the sauna. Please take a towel in with you.\n\n🎬 *Everything in one place in the summer video* (welcome, pool, sauna, firewood, registration):\nhttps://www.youtube.com/watch?v=ksVpDr-P8ic\n\nEnjoy every bit of summer at Rudolf's!\nPavel",
      "winter": "❄️ *Winter at Rudolf's — so you're on the slopes before the queues*\n\n🚌 *Ski bus a short walk from the house*\nThis short video shows the way to the stop: https://youtu.be/ZX8HJqZ1YBQ\nTimetables: https://drive.google.com/drive/folders/1HPJI7XydWwljBq_V19QwJGuBQWn73dZe\nPlease check the current timetable before you set out — it changes now and then during the season.\n\n🎿 *Ski room right in the house*\nSkis and boots dry out beautifully there overnight, so in the morning you head out with everything dry and warm.\n\n🧖 *Sauna*\nThe best way to end a day on the slopes. You'll find instructions in the house video and right by the sauna — just bring a towel.\n\nIf you need anything at all, I'm just a call away. Enjoy the mountains!\nPavel",
      "deposit": "Hello {JMENO}, one more practical thing about your stay {TERMIN}. We collect a refundable security deposit of {KAUCE} CZK — it is simply a safeguard in case of damage; after your departure and a quick check of the house, we return it to you in full right away. The easiest way to send it is by card via Revolut: https://revolut.me/pavelhuqh ({KAUCE} CZK). Thank you so much — we're looking forward to having you!\nPavel",
      "day2": "Hello {JMENO}, just checking in after your first night — is everything just as it should be? 🙂 If anything's not quite right or you can't find something, message me or simply call (+420 775 220 785) — I'll sort it out straight away. Enjoy the mountains!\nPavel",
      "predeparture": "Hello {JMENO}, tomorrow it's time to say goodbye — we hope you've felt at home at Rudolf's! Before you set off, could I ask for a few small things (about 10 minutes all together)? The cleaning team will take care of everything else:\n\n🍽 dishes into the dishwasher and switch it on\n🗑 rubbish into the marked bins — thanks for a bit of basic sorting\n🛏 strip the bed linen and leave it, together with the towels, in the designated spot\n🧺 return any borrowed equipment to where you found it\n🔍 a quick check that windows and doors are closed and appliances switched off (and in summer, the pool locked)\n\nPlease hand the house over by 10:00 — the cleaners start at ten, so that at 15:00 the next group can take over the house just as ready as you found it.\n\nThank you so much for seeing it through with us. Safe travels!\nPavel",
      "reviewBody": "Hello {JMENO}, today we say goodbye — and we've truly loved having you at Rudolf's. We hope you're taking home from the mountains exactly what you came for.\n\nJust a gentle reminder: please hand the house over by 10:00. We're not chasing you out, I promise 🙂 — it's just that the cleaning team arrives at ten so they can welcome the next guests at 15:00.\n\nAnd then one request that means a great deal to us. We're a small family-run rental, and reviews are the main way new groups and families find Rudolf.\n",
      "reviewAirbnb": "\nIf you feel we've earned the full 5 stars, we'd be so grateful if you gave them to us on Airbnb — it helps us more than you might think. And if anything at all, even the smallest thing, wasn't quite one hundred percent, please write it straight to me here on WhatsApp — because that I can put right; a review, I can't. 🙂\n\nSafe travels home — and whenever you feel like coming back to the Krkonoše, Rudolf will be here, and so will we!\nPavel",
      "reviewBooking": "\nIf you feel we've earned the full 10 out of 10, we'd be so grateful if you gave it to us on Booking — it helps us more than you might think. And if anything at all, even the smallest thing, wasn't quite one hundred percent, please write it straight to me here on WhatsApp — because that I can put right; a review, I can't. 🙂\n\nSafe travels home — and whenever you feel like coming back to the Krkonoše, Rudolf will be here, and so will we!\nPavel",
      "reviewGoogle": "\nIf you feel we've earned the full rating, we'd be so grateful for a review on Google — it helps us more than you might think. And if anything at all, even the smallest thing, wasn't quite one hundred percent, please write it straight to me here on WhatsApp — because that I can put right; a review, I can't. 🙂\n\nSafe travels home — and whenever you feel like coming back to the Krkonoše, Rudolf will be here, and so will we!\nPavel"
    },
    "de": {
      "first": "Hallo {JMENO},\n\nhier ist Pavel von der Villa Rudolf. Bis zu eurem Aufenthalt ({TERMIN}) ist noch etwas Zeit, aber wir freuen uns schon auf euch und ich wollte mich kurz melden.\n\n{NOVINKA}Zwei Dinge vorab:\n\n🛂 Bei der Anreise tragen wir alle Gäste ins Gästebuch ein, auch die Kinder. Schaut bitte rechtzeitig, dass jeder einen gültigen Ausweis hat, auch die Kinder – die Ausstellung dauert oft ein paar Wochen.\n\n👨‍👩‍👧 Wisst ihr schon ungefähr, mit wie vielen Erwachsenen und Kindern ihr kommt? Dann bereite ich Kinderbetten und passende Ausflugstipps vor.\n\nAlles Praktische (Adresse, Türcode, WLAN) schicke ich euch eine Woche vor der Anreise. Falls sich bei euch etwas ändert, schreibt mir einfach gleich, wir finden immer eine Lösung.\n\nLiebe Grüße aus dem Riesengebirge\nPavel",
      "nudge": "Hallo {JMENO}, ich wollte nur kurz nachhaken – ist meine Nachricht zu eurem Aufenthalt ({TERMIN}) bei euch angekommen? Eine kurze Antwort genügt, dann weiß ich, dass bei euch alles beim Alten ist. Danke!\nPavel",
      "welcomeCore": "Hallo {JMENO},\n\nwir freuen uns sehr auf euch — {TERMIN} gehört die Villa Rudolf nur euch! Hier kommt alles Wichtige in einer Nachricht, damit ihr alles griffbereit habt.\n\n📍 *Wohin ihr fahrt*\nVilla Rudolf, Luční 519, Svoboda nad Úpou. Geparkt wird direkt auf dem Grundstück am Haus.\n\n🕒 *Das Haus gehört euch ab 15:00 Uhr*\nAm Vormittag bringen wir es nach der vorherigen Gruppe auf Hochglanz — reist daher bitte nicht früher an, damit wir euch nicht mit dem Staubsauger in der Hand begrüßen. 🙂\n\n🔑 *Zutritt ohne Schlüssel*\nEuer Türcode: *{KOD_DVERI}*. Er gilt ab 15:00 Uhr am Anreisetag bis 10:00 Uhr am Abreisetag. Behaltet ihn bitte nur innerhalb eurer Gruppe, und werft beim Verlassen des Hauses immer kurz einen Blick darauf, dass die Tür geschlossen ist — das Haus gehört während des gesamten Aufenthalts nur euch.\n\n🏠 *Seht euch das Haus schon jetzt an*\nVirtueller Rundgang: https://www.keypano.com/v/569g7v8_96ci86-1770715560.html\nVideo zum Haus: https://youtu.be/tWCuuovnh2U\n\n🥾 *Euer persönlicher Ausflugsführer*\nWir haben für euch eine Seite mit Ausflugstipps zusammengestellt — sortiert nach Wetter, Alter der Kinder und Größe eurer Gruppe: {PRUVODCE_LINK}\nÖffnet sie gerne schon jetzt — zum Planen vor der Anreise ist sie praktisch.\n\n📝 *Registrierung der Gäste*\nDas dauert nur ein paar Minuten und geht schon jetzt von zu Hause: {REGISTRACNI_LINK}\nTragt bitte alle ein, auch die Kinder. Wer es vorher nicht schafft, findet den QR-Code am Kühlschrank. Das ist keine Idee von uns: Die Stadt führt die Meldeliste zur Kurtaxe — und ihr habt es hinter euch.\n\n💳 *Kurtaxe (geht an die Stadt, nicht an uns)*\n{POPLATEK}\n\n🌙 *Die Abende*\nWir liegen in einem Bergtal, das den Schall weiter trägt, als man erwarten würde — und die Nachbarn ringsum wohnen hier das ganze Jahr, nicht nur am Wochenende. Musik läuft bei uns deshalb nur im Haus: Lautsprecher nehmt bitte gar nicht erst mit aufs Grundstück, auch tagsüber nicht. Am Abend am Feuer entschädigen dafür das Knistern des Holzes und eine Stille, wie man sie in der Stadt nicht hört, mehr als genug. Nach zehn Uhr abends seid draußen bitte ganz leise — die Menschen in der Nachbarschaft stehen morgens zur Arbeit auf und schlafen im Sommer bei offenen Fenstern, und Lärm bringt sie leider schnell dazu, die Polizei zu rufen. Ein Abend am Feuer ist auch leise wunderschön, ihr werdet sehen. Drinnen könnt ihr gerne zusammensitzen, so lange ihr möchtet.\n\n📶 *WLAN überall*\nNetz „Rudolf Wi-Fi\", Passwort: {WIFI_HESLO}. Der Empfang reicht durchs ganze Haus und über das gesamte Grundstück — von der Feuerstelle über die Pergola bis zum Kinderspielplatz.\n\n📞 *Falls irgendetwas ist*\nPavel: +420 775 220 785 — schreibt, ruft an, ich bin für euch da.\nKrankenhaus Trutnov: +420 499 866 111 (Maxima Gorkého 77, Trutnov)\nNotruf: 112 · Rettungsdienst 155 · Polizei 158 · Feuerwehr 150 · Stadtpolizei 156\nBergwacht: +420 602 448 338\n\nWir freuen uns auf euch!\nPavel",
      "feeRate": "25 Kč / 1 € pro Erwachsenen und Nacht.",
      "feeAmount": " Bei euch: {DOSPELI} Erwachsene × {NOCI} Nächte = {CASTKA} Kč.",
      "feeUnknown": " Kinder unter 18 Jahren zahlen nichts; den genauen Betrag berechnen wir nach der Registrierung.",
      "feePay": " Am einfachsten per Karte über https://revolut.me/pavelhuqh, gerne aber auch bar vor Ort.",
      "feeDeposit": " Ihr müsst nichts extra bezahlen — die Kurtaxe verrechnen wir laut Vertrag mit der Kaution.",
      "summer": "☀️ *Sommer bei Rudolf — ein paar Dinge zusätzlich*\n\n🏊 *Pool* (in Betrieb etwa Mai–September, beheizt auf ~27 °C — ein wenig wetterabhängig)\nWir übergeben ihn immer abgeschlossen — die Schlüssel liegen in der Küche im linken oberen Schrank (mit Blick auf die Küchenzeile ganz oben links). Abgeschlossen ist er zur Sicherheit der Kinder: ans Wasser bitte immer nur unter Aufsicht eines Erwachsenen, nie allein — ein Moment der Unachtsamkeit genügt. Nach dem Baden macht den Pool bitte wieder zu und schließt ihn ab — so hält er Temperatur und Sauberkeit wunderbar. Und die Gläser lasst bitte auf der Terrasse: Sollte im Pool Glas zerbrechen, müssten wir ihn komplett ablassen, reinigen, neu befüllen und wieder aufheizen — und das bedeutet für euch einen Tag oder mehr ohne Baden.\n\n🔥 *Feuerstelle, Grill, Holz*\nDie große Feuerstelle, der Pergola-Pavillon und die Elektrogrills warten auf euch. Das Holz liegt unter den zwei Fichten am Parkplatz — im Unterstand findet ihr Axt, Säge und Grillspieße, das Schloss öffnet ihr mit dem Code *0519*. Ein Hinweis aus Fürsorge: Wenn das Feuer bis in die Nacht brennt, ist die Glut am Morgen oft noch heiß — behaltet bitte die kleinen Entdecker im Auge, die Feuerstelle lockt sie morgens besonders.\n\n🧖 *Sauna*\nFür euch vorbereitet — die Anleitung findet ihr im Sommervideo und direkt an der Sauna. Hinein bitte nur mit Handtuch.\n\n🎬 *Alles auf einen Blick im Sommervideo* (Begrüßung, Pool, Sauna, Holz, Registrierung):\nhttps://www.youtube.com/watch?v=ksVpDr-P8ic\n\nGenießt den Sommer bei Rudolf!\nPavel",
      "winter": "❄️ *Winter bei Rudolf — damit ihr eher auf der Piste seid als die Warteschlangen*\n\n🚌 *Skibus ein kurzes Stück vom Haus entfernt*\nWie ihr zur Haltestelle kommt, zeigt ein kurzes Video: https://youtu.be/ZX8HJqZ1YBQ\nFahrpläne: https://drive.google.com/drive/folders/1HPJI7XydWwljBq_V19QwJGuBQWn73dZe\nPrüft vor der Fahrt bitte den aktuellen Fahrplan — in der Saison ändert er sich gelegentlich.\n\n🎿 *Skiraum direkt im Haus*\nSki und Schuhe trocknen dort über Nacht wunderbar, und am Morgen startet ihr in trockener, warmer Ausrüstung.\n\n🧖 *Sauna*\nNach einem Tag auf der Piste der schönste Abschluss. Die Anleitung findet ihr im Video zum Haus und direkt an der Sauna — nur ein Handtuch mitnehmen.\n\nFalls irgendetwas ist, bin ich telefonisch für euch da. Genießt die Berge!\nPavel",
      "deposit": "Hallo {JMENO}, noch eine praktische Sache zu eurem Aufenthalt {TERMIN}. Wir erheben eine rückzahlbare Kaution von {KAUCE} CZK — sie ist lediglich eine Sicherheit für den Fall eines Schadens; nach eurer Abreise und einer kurzen Kontrolle des Hauses erhaltet ihr sie umgehend in voller Höhe zurück. Am einfachsten sendet ihr sie per Karte über Revolut: https://revolut.me/pavelhuqh ({KAUCE} CZK). Vielen Dank — wir freuen uns auf euch!\nPavel",
      "day2": "Hallo {JMENO}, ich melde mich kurz nach der ersten Nacht — ist alles so, wie es sein soll? 🙂 Falls irgendetwas hakt oder ihr etwas nicht finden konntet, schreibt mir oder ruft einfach direkt an (+420 775 220 785) — ich kümmere mich sofort darum. Genießt die Berge!\nPavel",
      "predeparture": "Hallo {JMENO}, morgen heißt es Abschied nehmen — hoffentlich habt ihr euch bei Rudolf wohlgefühlt! Bevor ihr aufbrecht, bitte ich euch noch um ein paar Kleinigkeiten (insgesamt etwa 10 Minuten) — um alles andere kümmert sich der Reinigungsservice:\n\n🍽 Geschirr in die Spülmaschine räumen und sie einschalten\n🗑 Müll in die gekennzeichneten Behälter bringen — danke fürs grobe Vorsortieren\n🛏 Bettwäsche abziehen und zusammen mit den Handtüchern am vorgesehenen Platz ablegen\n🧺 ausgeliehene Ausstattung dorthin zurücklegen, wo ihr sie gefunden habt\n🔍 kurz prüfen: Fenster und Türen geschlossen, Geräte ausgeschaltet (im Sommer auch der Pool abgeschlossen)\n\nÜbergebt das Haus bitte bis 10:00 Uhr — um zehn beginnt die Reinigung, damit die nächste Gruppe das Haus um 15:00 Uhr genauso vorbereitet übernimmt, wie ihr es übernommen habt.\n\nVielen Dank, dass ihr das mit uns gemeinsam zu Ende bringt. Gute Reise!\nPavel",
      "reviewBody": "Hallo {JMENO}, heute heißt es Abschied nehmen — und wir hatten euch sehr gerne bei Rudolf zu Gast. Hoffentlich nehmt ihr aus den Bergen genau das mit, wofür ihr gekommen seid.\n\nNur eine kleine Erinnerung: Übergebt das Haus bitte bis 10:00 Uhr. Wir wollen euch nicht hinausdrängen, versprochen 🙂 — nur beginnt um zehn der Reinigungsservice, damit um 15:00 Uhr schon die nächsten Gäste begrüßt werden können.\n\nUnd dann noch eine Bitte, die uns wirklich viel bedeutet. Wir sind eine kleine Familienvermietung, und die Bewertungen sind das Wichtigste, wodurch andere Gruppen und Familien Rudolf finden.\n",
      "reviewAirbnb": "\nWenn ihr das Gefühl habt, dass wir die vollen 5 Sterne verdienen, wären wir sehr dankbar, wenn ihr sie uns auf Airbnb gebt — das hilft uns mehr, als man denkt. Und sollte irgendetwas, und sei es nur eine Kleinigkeit, nicht hundertprozentig gewesen sein, schreibt es bitte direkt mir hier auf WhatsApp — denn ich kann es noch in Ordnung bringen, eine Bewertung nicht mehr. 🙂\n\nGute Heimreise — und wann immer ihr ins Riesengebirge zurückkehren möchtet: Rudolf und wir sind für euch da!\nPavel",
      "reviewBooking": "\nWenn ihr das Gefühl habt, dass wir die vollen 10 von 10 verdienen, wären wir sehr dankbar, wenn ihr sie uns auf Booking gebt — das hilft uns mehr, als man denkt. Und sollte irgendetwas, und sei es nur eine Kleinigkeit, nicht hundertprozentig gewesen sein, schreibt es bitte direkt mir hier auf WhatsApp — denn ich kann es noch in Ordnung bringen, eine Bewertung nicht mehr. 🙂\n\nGute Heimreise — und wann immer ihr ins Riesengebirge zurückkehren möchtet: Rudolf und wir sind für euch da!\nPavel",
      "reviewGoogle": "\nWenn ihr das Gefühl habt, dass wir die volle Bewertung verdienen, wären wir für eine Rezension auf Google sehr dankbar — das hilft uns mehr, als man denkt. Und sollte irgendetwas, und sei es nur eine Kleinigkeit, nicht hundertprozentig gewesen sein, schreibt es bitte direkt mir hier auf WhatsApp — denn ich kann es noch in Ordnung bringen, eine Bewertung nicht mehr. 🙂\n\nGute Heimreise — und wann immer ihr ins Riesengebirge zurückkehren möchtet: Rudolf und wir sind für euch da!\nPavel"
    },
    "pl": {
      "first": "Dzień dobry, {JMENO},\n\ntu Pavel z Villa Rudolf. Do Państwa pobytu ({TERMIN}) jest jeszcze trochę czasu, ale już na Państwa czekamy i chciałem się odezwać.\n\n{NOVINKA}Dwie sprawy, żeby mieli Państwo spokój:\n\n🛂 Przy przyjeździe wpisujemy do księgi gości wszystkie osoby, także dzieci. Prosimy z wyprzedzeniem sprawdzić, czy każdy ma ważny dokument, również dzieci – wyrobienie trwa zwykle kilka tygodni.\n\n👨‍👩‍👧 Czy wiedzą już Państwo mniej więcej, ile osób dorosłych i ile dzieci przyjedzie? Przygotuję wtedy łóżeczka i dopasuję propozycje wycieczek.\n\nWszystko, co praktyczne (adres, kod do drzwi, Wi-Fi), wyślę tydzień przed przyjazdem. Gdyby coś się u Państwa zmieniało, proszę od razu napisać – zawsze się jakoś dogadamy.\n\nPozdrawiam z Karkonoszy\nPavel",
      "nudge": "Dzień dobry, {JMENO}, tylko się przypominam – czy dotarła do Państwa moja wiadomość w sprawie pobytu ({TERMIN})? Wystarczy krótka odpowiedź, żebym wiedział, że wszystko jest bez zmian. Dziękuję!\nPavel",
      "welcomeCore": "Dzień dobry, {JMENO},\n\nnie możemy się już doczekać Państwa przyjazdu — w terminie {TERMIN} Villa Rudolf będzie tylko dla Państwa! Przesyłam wszystko, co ważne, w jednej wiadomości, żeby mieli ją Państwo zawsze pod ręką.\n\n📍 *Dokąd Państwo jadą*\nVilla Rudolf, Luční 519, Svoboda nad Úpou. Parkują Państwo bezpośrednio na posesji przy domu.\n\n🕒 *Dom jest Państwa od 15:00*\nPrzed południem, po poprzedniej grupie, doprowadzamy go do pełnego blasku — dlatego prosimy nie przyjeżdżać wcześniej, żebyśmy nie musieli witać Państwa z odkurzaczem w ręku. 🙂\n\n🔑 *Wejście bez kluczy*\nKod do drzwi: *{KOD_DVERI}*. Działa od 15:00 w dniu przyjazdu do 10:00 w dniu wyjazdu. Prosimy zachować go wyłącznie w swojej grupie, a wychodząc zawsze sprawdzić, czy drzwi są zamknięte — dom przez cały pobyt jest tylko Państwa.\n\n🏠 *Dom można obejrzeć już teraz*\nWirtualny spacer: https://www.keypano.com/v/569g7v8_96ci86-1770715560.html\nFilm o domu: https://youtu.be/tWCuuovnh2U\n\n🥾 *Państwa osobisty przewodnik po wycieczkach*\nPrzygotowaliśmy dla Państwa stronę z propozycjami wycieczek uszeregowanymi według pogody, wieku dzieci i wielkości grupy: {PRUVODCE_LINK}\nMożna ją otworzyć już teraz — przyda się do planowania przed przyjazdem.\n\n📝 *Rejestracja gości*\nZajmie kilka minut i można ją załatwić już teraz, z domu: {REGISTRACNI_LINK}\nProsimy wpisać wszystkich, także dzieci. Kto nie zdąży wcześniej, znajdzie kod QR na lodówce. To nie nasz wymysł — miasto prowadzi ewidencję związaną z opłatą miejscową, a Państwo będą to mieli z głowy.\n\n💳 *Opłata miejscowa (trafia do miasta, nie do nas)*\n{POPLATEK}\n\n🌙 *Wieczory*\nJesteśmy w górskiej dolinie, która niesie dźwięk dalej, niż można by się spodziewać — a sąsiedzi wokół mieszkają tu cały rok, nie tylko w weekendy. Muzyka gra więc u nas tylko wewnątrz domu: głośników na posesji prosimy nie używać wcale, nawet w ciągu dnia. Wieczorem przy ognisku z nawiązką wynagrodzi to trzask drewna i cisza, jakiej w mieście się nie usłyszy. Po dziesiątej wieczorem prosimy zachować na zewnątrz zupełną ciszę — okoliczni mieszkańcy rano wstają do pracy, a latem śpią przy otwartych oknach i hałas niestety szybko skłania ich do telefonu na policję. Wieczór przy ognisku jest piękny także po cichu, sami Państwo zobaczą. W środku mogą Państwo posiedzieć, jak długo tylko zechcą.\n\n📶 *Wi-Fi wszędzie*\nSieć „Rudolf Wi-Fi\", hasło: {WIFI_HESLO}. Zasięg jest w całym domu i na całej posesji — od ogniska przez pergolę aż po plac zabaw.\n\n📞 *Gdyby cokolwiek*\nPavel: +420 775 220 785 — proszę śmiało pisać lub dzwonić, jestem do Państwa dyspozycji.\nSzpital Trutnov: +420 499 866 111 (Maxima Gorkého 77, Trutnov)\nNumer alarmowy: 112 · pogotowie ratunkowe 155 · policja 158 · straż pożarna 150 · straż miejska 156\nPogotowie górskie (Horská služba): +420 602 448 338\n\nCzekamy na Państwa!\nPavel",
      "feeRate": "25 Kč / 1 € od osoby dorosłej za noc.",
      "feeAmount": " U Państwa: {DOSPELI} dorosłych × {NOCI} nocy = {CASTKA} Kč.",
      "feeUnknown": " Dzieci do 18 lat nie płacą; dokładną kwotę wyliczymy na podstawie rejestracji.",
      "feePay": " Najprościej kartą przez https://revolut.me/pavelhuqh, ale można też gotówką na miejscu.",
      "feeDeposit": " Nie trzeba nic płacić osobno — opłatę rozliczymy z kaucji zgodnie z umową.",
      "summer": "☀️ *Lato u Rudolfa — kilka rzeczy dodatkowo*\n\n🏊 *Basen* (czynny mniej więcej od maja do września, podgrzewany do ~27 °C — trochę w zależności od pogody)\nPrzekazujemy go zawsze zamknięty na klucz — klucze są w kuchni, w lewej górnej szafce (patrząc na zabudowę kuchenną — całkiem u góry po lewej). Zamknięty jest ze względu na bezpieczeństwo dzieci: do wody prosimy zawsze wyłącznie pod okiem dorosłego, nigdy same — wystarczy chwila nieuwagi. Po kąpieli prosimy basen znowu zamknąć i przekręcić klucz — pięknie trzyma wtedy temperaturę i czystość. A kieliszki prosimy zostawiać na tarasie — gdyby w basenie stłukło się szkło, musielibyśmy spuścić całą wodę, wyczyścić basen, ponownie go napełnić i podgrzać, a to oznacza dla Państwa dzień lub dłużej bez kąpieli.\n\n🔥 *Ognisko, grill, drewno*\nDuże ognisko, pergola-altana i grille elektryczne czekają na Państwa. Drewno jest pod dwoma świerkami przy parkingu — w wiacie znajdą Państwo siekierę, piłę i szpikulce do opiekania, kłódkę otworzą Państwo kodem *0519*. Jedna uwaga podyktowana troską: kiedy ognisko przeciągnie się do nocy, węgielki rano potrafią być wciąż gorące — prosimy mieć oko na małych ciekawskich, ognisko rano ich przyciąga.\n\n🧖 *Sauna*\nPrzygotowana dla Państwa — instrukcja jest w letnim filmie i bezpośrednio przy saunie. Do środka prosimy wchodzić z ręcznikiem.\n\n🎬 *Wszystko w jednym miejscu w letnim filmie* (powitanie, basen, sauna, drewno, rejestracja):\nhttps://www.youtube.com/watch?v=ksVpDr-P8ic\n\nNiech lato u Rudolfa smakuje Państwu jak najlepiej!\nPavel",
      "winter": "❄️ *Zima u Rudolfa — żeby byli Państwo na stoku wcześniej niż kolejki*\n\n🚌 *Skibus niedaleko domu*\nJak dojść na przystanek, pokazuje krótki film: https://youtu.be/ZX8HJqZ1YBQ\nRozkłady jazdy: https://drive.google.com/drive/folders/1HPJI7XydWwljBq_V19QwJGuBQWn73dZe\nPrzed wyjazdem prosimy sprawdzić aktualny rozkład — w sezonie czasem się zmienia.\n\n🎿 *Narciarnia bezpośrednio w domu*\nNarty i buty pięknie tam przez noc wyschną, a rano ruszają Państwo w suchym i ciepłym sprzęcie.\n\n🧖 *Sauna*\nPo dniu na stoku najlepsze możliwe zwieńczenie. Instrukcję znajdą Państwo w filmie o domu i bezpośrednio przy saunie — wystarczy zabrać ręcznik.\n\nGdyby cokolwiek — jestem pod telefonem. Udanego pobytu w górach!\nPavel",
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

  function fill(tpl, ctx) {
    return tpl
      // {POPLATEK} a {NOVINKA} první — poplatek v sobě nese {DOSPELI}, {NOCI}, {CASTKA}
      .replace(/\{POPLATEK\}/g, ctx.poplatek || '')
      .replace(/\{NOVINKA\}/g, ctx.novinka ? ctx.novinka + '\n\n' : '')
      .replace(/\{JMENO\}/g, ctx.jmeno)
      .replace(/\{TERMIN\}/g, ctx.termin)
      .replace(/\{DOSPELI\}/g, ctx.dospeli)
      .replace(/\{DETI\}/g, ctx.deti)
      .replace(/\{NOCI\}/g, ctx.noci)
      .replace(/\{CASTKA\}/g, ctx.castka)
      .replace(/\{KOD_DVERI\}/g, ctx.kod)
      // callback, ne řetězec: heslo obsahující $& nebo $$ by replace jinak rozepsal
      .replace(/\{WIFI_HESLO\}/g, function () { return wifiPassword() || '{WIFI_HESLO}'; })
      .replace(/\{KAUCE\}/g, DEPOSIT_CZK.toLocaleString('cs-CZ'))
      .replace(/\{REGISTRACNI_LINK\}/g, ctx.regLink || '{REGISTRACNI_LINK}')
      .replace(/\{PRUVODCE_LINK\}/g, ctx.guideLink || '{PRUVODCE_LINK}');
  }

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
    { key: 'welcome', title: 'Uvítací zpráva (kód, registrace, Wi-Fi)', from: 'arrival', off: -7, when: 'T−7' },
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
  // Vrátí části zprávy (většinou 1; welcome má 2: jádro + sezónní modul)
  function buildParts(msg, ctx, booking) {
    var L = msgLang(booking);
    var lt = L.toUpperCase();
    if (msg.key === 'welcome') {
      return [
        // Jádro nese odkazy /pruvodce/?t= a /registrace/?t=, kód ke dveřím a heslo
        // Wi-Fi — dokud něco z toho chybí, neodesílá se (v textu by zůstala {ZÁSTUPKA}).
        { label: 'Uvítací zpráva (jádro) · ' + lt, text: fill(tplFor(L, 'welcomeCore'), ctx),
          needsToken: !ctx.guideLink || !ctx.regLink, needsCode: !doorCodeFor(booking), needsWifi: !wifiPassword() },
        { label: (ctx.winter ? 'Zimní modul' : 'Letní modul') + ' · ' + lt, text: fill(tplFor(L, ctx.winter ? 'winter' : 'summer'), ctx) }
      ];
    }
    if (msg.key === 'first') return [{ text: fill(tplFor(L, 'first'), ctx) }];
    if (msg.key === 'nudge') return [{ text: fill(tplFor(L, 'nudge'), ctx) }];
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
  function buildCtx(booking) {
    var noci = nights(booking.arrival, booking.departure);
    var p = booking.persons || {};
    var reg = (p.registered || 0) > 0;
    // null = nevíme. S dvojkou se NEPOČÍTÁ: zpráva pak vypíše jen sazbu bez částky.
    var dospeli = reg ? (p.adults || 0) : (adultsKnown(booking) ? booking.adults : null);
    var deti = reg ? (p.children || 0) : ((booking.children || []).length);
    var token = tokenFor(booking.id);
    var L = msgLang(booking), T = TPL[L];
    return {
      jmeno: guestName(booking),
      termin: fmtTermin(booking.arrival, booking.departure, L),
      dospeli: dospeli, deti: deti, noci: noci,
      // Po registraci skutečný poplatek z DB (po dnech, děti a ZTP/P zdarma);
      // do té doby odhad z rezervace. Sazba 25 Kč = OZV Svoboda nad Úpou č. 2/2023.
      castka: (reg && p.fee_czk != null) ? p.fee_czk : (dospeli == null ? null : dospeli * noci * 25),
      // Odstavec o poplatku: sazba + (částka | „spočítáme podle registrace") +
      // (Revolut | u přímého prodeje „vyúčtujeme z kauce" — smlouva § 6).
      poplatek: T.feeRate + (dospeli ? T.feeAmount : T.feeUnknown) + (isDirect(booking) ? T.feeDeposit : T.feePay),
      novinka: newsFor(booking, L),
      // Kód je známý i bez uloženého door_code: posledních 5 číslic telefonu, stejně
      // ho bere zámek (Home Assistant) i registrace z lednice.
      kod: doorCodeFor(booking) || '{KOD_DVERI}',
      token: token,
      regLink: token ? (location.origin + '/registrace/?t=' + token + '&lang=' + (booking.lang || 'en')) : null,
      guideLink: token ? (location.origin + '/pruvodce/?t=' + token) : null,
      winter: isWinter(booking.arrival),
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
  //   reply_ok/risk   host odpověděl: jede/váhá  reply_nudge   kdy jsem se naposledy připomněl
  //   guests_ok       počty osob zapsal majitel  deposit_enabled, yale_set  (starší značky)
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
  // a systém je nečte — majitel jedním klikem zapíše, jak to dopadlo. Kdo NUDGE_DAYS
  // dní mlčí, objeví se v „Dnes na řadě" s připomenutím; kdo váhá, svítí tam pořád.
  var NUDGE_DAYS = 10;
  function replyState(b) { return hasLog(b, 'reply_ok') ? 'ok' : (hasLog(b, 'reply_risk') ? 'risk' : 'none'); }
  function setReply(b, state) {
    return setLog(b, 'reply_ok', state === 'ok').then(function () { return setLog(b, 'reply_risk', state === 'risk'); });
  }
  function isoDateOf(ts) {
    var d = new Date(ts);
    if (isNaN(d)) return null;
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  // Kolik dní host mlčí od první ozvěny (nebo od posledního připomenutí). null = ozvěna neodešla.
  function silentDays(b, today) {
    var sent = sentMap(b);
    if (!sent.first) return null;
    var from = [sent.first, sent.reply_nudge].map(function (ts) { return typeof ts === 'string' ? isoDateOf(ts) : null; })
      .filter(Boolean).sort().pop();
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
      // 💬 odpověď hosta: „váhá" svítí pořád, mlčícímu se po NUDGE_DAYS dnech připomenout.
      // Týden před příjezdem už jde uvítací zpráva — připomínat první ozvěnu pak nemá cenu.
      var rs = replyState(b);
      if (rs === 'risk' && b.arrival > today) tasks.push({ stay: s, booking: b, risk: true, date: '' });
      else if (rs === 'none' && phoneUsable(b) && daysBetween(today, b.arrival) > 7) {
        var quiet = silentDays(b, today);
        if (quiet != null && quiet >= NUDGE_DAYS) tasks.push({ stay: s, booking: b, nudge: true, days: quiet, date: today });
      }
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
      if (t.nudge) {
        // 💬 host na první ozvěnu neodpověděl — připomenout se, nebo zapsat, že odpověděl.
        row.className = 'task';
        row.innerHTML =
          '<div class="task-main"><div class="task-name">' + esc(guestName(b)) + '</div>' +
          '<div class="task-what">💬 ' + t.days + ' dní bez odpovědi — připomenout se · ' + esc(msgLang(b).toUpperCase()) + ' · ' + esc(arrivesIn(b, today)) + '</div>' +
          '<span class="task-when today">bez odpovědi</span></div>' +
          '<div class="task-actions"></div>';
        var an = row.querySelector('.task-actions');
        an.appendChild(waBtn(b, buildParts({ key: 'nudge' }, ctx, b)[0].text));
        an.appendChild(taskBtn('btn-outline', '✓ Připomenuto', function (btn) {
          logAndRefresh(btn, setLog(b, 'reply_nudge', true), 'Zapsáno — ozvu se znovu za ' + NUDGE_DAYS + ' dní.');
        }));
        an.appendChild(taskBtn('btn-outline', 'Odpověděl…', function () { openDetail(t.stay); }));
        wrap.appendChild(row);
        return;
      }
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
        // Uvítací zpráva má dvě části (jádro + sezónní modul) → dvě tlačítka.
        var texts = parts.filter(function (p) { return p.text; });
        texts.forEach(function (p, i) {
          act.appendChild(waBtn(b, p.text, texts.length > 1 ? 'WhatsApp ' + (i + 1) + '/' + texts.length : 'WhatsApp'));
        });
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
  // Co se NEHLÁSÍ: e-mail (platformy ho nedávají) a kód dveří, který jde odvodit
  // z telefonu (zámek i registrace z lednice si ho berou samy).
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
    if (!adultsKnown(b)) out.push({ k: 'adults', label: 'počet dospělých', title: 'Bez něj uvítací zpráva neřekne částku poplatku.' });
    if (!kidsAgesKnown(b)) out.push({ k: 'kids', label: 'věky dětí', title: 'Podle věku se řadí tipy na výlety a chystají postýlky.' });
    if (needsToken(s, today)) out.push({ k: 'token', label: 'trvalý odkaz', title: 'Bez něj nejde sestavit uvítací zpráva (průvodce a registrace).' });
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
        } else openEditor({ stay: s, booking: b, back: 'board', focus: k === 'phone' ? 'ed-phone' : (k === 'adults' ? 'ed-adults' : 'ed-kids') });
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
      '<div class="field"><label>Poznámka</label><textarea id="ed-notes" maxlength="500">' + esc(b ? (b.notes || '') : '') + '</textarea></div>' +
      '<p class="hint">Dospělé nech prázdné, dokud to nevíš — uvítací zpráva pak řekne jen sazbu poplatku, ne vymyšlenou částku. Děti zapiš věkem, oddělené čárkou; když víš jen počet, napiš otazníky (<code>?, ?</code>). Bez dětí nech pole prázdné. Po registraci se všechno přepočítá ze skutečných osob.</p>' +
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
        toast(existing ? 'Uloženo.' : 'Host založen.');
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
      '<div class="stay-sub" style="margin-bottom:10px">' + esc(fmtTermin(b.arrival, b.departure)) + ' · ' + nights(b.arrival, b.departure) + ' nocí · ' + esc(stay.platform) + '</div>' +
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
        : quiet == null ? 'První ozvěna zatím neodešla. Až odejde a host ' + NUDGE_DAYS + ' dní neodpoví, připomene se v „Dnes na řadě“.'
        : 'První ozvěna odešla ' + (quiet === 0 ? 'dnes' : (quiet === 1 ? 'včera' : 'před ' + quiet + ' dny')) + ', odpověď zatím žádná.' + (quiet >= NUDGE_DAYS ? ' Je čas se připomenout.' : '')) + '</p>';
    Array.prototype.forEach.call(box.querySelectorAll('[data-reply]'), function (btn) {
      btn.addEventListener('click', function () {
        btn.disabled = true;
        setReply(b, btn.getAttribute('data-reply')).then(function () { renderReply(b); refreshBoards(); })
          .catch(function () { btn.disabled = false; toast('Nepodařilo se uložit.'); });
      });
    });
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
        partsHtml = parts.map(function (p, idx) {
          var warn = '';
          if (p.needsToken) warn = '<div class="notice">Zpráva nese odkaz na průvodce a na registraci, a ten zatím není (pobyt vznikl před ukládáním odkazů). Vytvoř trvalý odkaz výše — do zprávy se doplní sám.</div>';
          if (p.needsCode) warn = '<div class="notice">Zpráva nese kód ke dveřím, a ten není z čeho vzít — doplň telefon (kód = posledních 5 číslic), nebo kód ulož výše.</div>';
          if (p.needsWifi && !warn) warn = '<div class="notice">V Nastavení chybí heslo Wi-Fi — ve zprávě by zůstalo {WIFI_HESLO}. Doplň ho (⚙ Nastavení) a zpráva půjde odeslat.</div>';
          var canWa = phoneUsable(b) && p.text && !p.needsToken && !p.needsCode && !p.needsWifi;
          var waTitle = phoneUsable(b) ? 'chybí údaj' : (b.phone ? 'telefon nejde použít — oprav ho v „Upravit pobyt“' : 'chybí telefon');
          var waHtml = canWa
            ? '<a class="btn btn-sm btn-wa" href="' + esc(waLink(b, p.text)) + '" target="_blank" rel="noopener">Otevřít ve WhatsApp</a>'
            : '<button class="btn btn-sm btn-wa" disabled title="' + esc(waTitle) + '">Otevřít ve WhatsApp</button>';
          return (p.label ? '<div class="msg-when" style="margin:6px 0 4px">' + esc(p.label) + variant + '</div>' : (variant ? '<div class="msg-when" style="margin:6px 0 4px">' + variant.replace(/^ · /, '') + '</div>' : '')) +
            warn +
            '<div class="msg-preview">' + esc(p.text) + '</div>' +
            '<div class="msg-actions">' + waHtml +
            '<button class="btn btn-sm btn-outline copybtn" data-copy="' + esc(p.text).replace(/"/g, '&quot;') + '">Kopírovat text</button></div>';
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
        var el = document.createElement('textarea'); el.innerHTML = btn.getAttribute('data-copy');
        copyText(el.value); toast('Text zkopírován.');
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
