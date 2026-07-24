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

  var WIFI = 'Rudolf519';
  var STORE_KEY = 'vr_sprava_key';   // admin token (session nebo local)
  var STORE_GT = 'vr_sprava_gt';     // guest tokeny (jen sessionStorage, per-zařízení)

  var adminKey = null;
  var calendar = [];   // [{uidh,start,end,platform}]
  var bookings = [];   // z vr_admin_list_bookings
  var stays = [];       // sloučený pohled
  var expandedStays = false;
  var adminConfig = {}; // ubyport_* konfigurace ubytovatele (Nastavení)

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
  function nights(a, b) { return Math.max(0, Math.round((parseISO(b) - parseISO(a)) / 86400000)); }
  function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
  function fmtTermin(a, b) {
    var da = parseISO(a), db = parseISO(b);
    var d1 = da.getDate(), m1 = da.getMonth(), y1 = da.getFullYear();
    var d2 = db.getDate(), m2 = db.getMonth(), y2 = db.getFullYear();
    if (y1 === y2 && m1 === m2) return d1 + '.–' + d2 + '. ' + MONTH_GEN[m2] + ' ' + y2;
    if (y1 === y2) return d1 + '. ' + MONTH_GEN[m1] + ' – ' + d2 + '. ' + MONTH_GEN[m2] + ' ' + y2;
    return d1 + '. ' + MONTH_GEN[m1] + ' ' + y1 + ' – ' + d2 + '. ' + MONTH_GEN[m2] + ' ' + y2;
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
  function tokenFor(id) { return guestTokens()[id] || null; }

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

  /* ============ ŠABLONY ZPRÁV (doslova, schváleno 23.7.2026) ============ */
  var TPL = {};
  TPL.confirm =
'Dobrý den, {JMENO},\n\n' +
'děkujeme za rezervaci — {TERMIN} je Villa Rudolf vaše a my s vámi počítáme! 🙂\n\n' +
'Do pobytu je ještě čas, tak jen tři věci, které se hodí vědět už teď:\n\n' +
'🛂 *Doklady — hlavně pro děti*\n' +
'Při příjezdu registrujeme všechny ubytované včetně dětí (evidence pro město). Zkontrolujte prosím včas, že **každý ve skupině má vlastní cestovní doklad — i děti**. Spousta rodin zjistí až na místě, že děti pas nebo občanku vůbec nemají, a vyřízení trvá i pár týdnů. Teď je na to ideální čas.\n\n' +
'🥾 *Co se u nás dá podniknout*\n' +
'Výlety, sjezdovky i tipy s mapou najdete na https://villarudolf.com/vylety/ — klidně si začněte plánovat. Před příjezdem od nás dostanete i osobní stránku s doporučeními na míru vaší skupině.\n\n' +
'📬 *Co bude dál*\n' +
'Týden před příjezdem vám pošlu jednu velkou zprávu se vším důležitým (adresa, vstup, dům) a pár dní nato odkaz na pohodlnou registraci předem — na místě už pak nemusíte řešit nic.\n\n' +
'Kdybyste cokoli potřebovali už teď, napište nebo zavolejte: +420 775 220 785.\n\n' +
'Těšíme se na vás!\n' +
'Pavel Kubizňák, Villa Rudolf';

  TPL.welcomeCore =
'Dobrý den, {JMENO},\n\n' +
'moc se na vás těšíme — {TERMIN} bude Villa Rudolf jen vaše! Posílám všechno důležité v jedné zprávě, ať ji máte po ruce.\n\n' +
'📍 *Kam jedete*\n' +
'Villa Rudolf, Luční 519, Svoboda nad Úpou. Parkujete přímo na pozemku u domu.\n\n' +
'🕒 *Dům je váš od 15:00*\n' +
'Dopoledne ho po předchozí partě chystáme do plné parády — proto prosím nejezděte dřív, ať vás nevítáme s vysavačem v ruce. 🙂\n\n' +
'🔑 *Vstup bez klíčů*\n' +
'Dveře otevřete kódem, který vám pošlu zvlášť v den příjezdu. Nechte si ho prosím jen ve své skupině a při odchodu vždy mrkněte, že jsou dveře zavřené — dům je po celý pobyt jen váš.\n\n' +
'🏠 *Prohlédněte si dům už teď*\n' +
'Virtuální prohlídka: https://www.keypano.com/v/569g7v8_96ci86-1770715560.html\n' +
'Video k domu: https://youtu.be/tWCuuovnh2U\n\n' +
'📝 *Registrace po příjezdu*\n' +
'QR kód najdete na lednici — vyplňte prosím co nejdřív za všechny, tedy {DOSPELI} dospělých i {DETI} dětí. Není to náš výmysl, město vede evidenci k místnímu poplatku; zabere to pár minut a máte to z krku.\n\n' +
'💳 *Místní poplatek (jde městu, ne nám)*\n' +
'25 Kč / 1 € za dospělého a noc. U vás: {DOSPELI} dospělých × {NOCI} nocí = {CASTKA} Kč. Nejjednodušší kartou přes https://revolut.me/pavelhuqh, klidně ale i hotově na místě.\n\n' +
'🌙 *Večery*\n' +
'Jsme v horském údolí, které nese zvuk dál, než byste čekali — a sousedé kolem tu žijí celý rok, ne jen na víkend. Hudba proto u nás hraje jen uvnitř domu: reproduktory na pozemek prosíme vůbec, ani přes den. Večer u ohně to bohatě vynahradí praskání dřeva a ticho, jaké ve městě neuslyšíte. Po desáté večer buďte prosím venku úplně potichu — lidé okolo ráno vstávají do práce a v létě spí při otevřených oknech, a hluk je bohužel rychle přiměje volat policii. Večer u ohně je krásný i potichu, uvidíte. Uvnitř si poseďte, jak dlouho chcete.\n\n' +
'📶 *Wi-Fi všude*\n' +
'Síť „Rudolf Wi-Fi", heslo: {WIFI_HESLO}. Chytá v celém domě i po celém pozemku — od ohniště přes pergolu až po dětské hřiště.\n\n' +
'📞 *Kdyby cokoliv*\n' +
'Pavel: +420 775 220 785 — pište, volejte, jsem tu pro vás.\n' +
'Nemocnice Trutnov: +420 499 866 111 (Maxima Gorkého 77, Trutnov)\n' +
'Tíseň: 112 · záchranka 155 · policie 158 · hasiči 150 · městská policie 156\n' +
'Horská služba: +420 602 448 338\n\n' +
'Těšíme se na vás!\n' +
'Pavel';

  TPL.summer =
'☀️ *Léto u Rudolfa — pár věcí navíc*\n\n' +
'🏊 *Bazén* (v provozu zhruba květen–září, vyhřívaný na ~27 °C — trochu podle počasí)\n' +
'Předáváme ho vždy zamčený — klíče jsou v kuchyni v levé horní skříňce (při pohledu na linku úplně nahoře vlevo). Zamčený je kvůli bezpečí dětí: k vodě prosím vždy jen pod dohledem dospělého, nikdy samy — stačí okamžik nepozornosti. Po koupání bazén zase zavřete a zamkněte, krásně tak drží teplotu i čistotu. A skleničky nechte prosím na terase — kdyby se sklo v bazénu rozbilo, museli bychom ho celý vypustit, vyčistit a znovu napouštět a ohřívat, a to je pro vás den i víc bez koupání.\n\n' +
'🔥 *Ohniště, gril, dřevo*\n' +
'Velké ohniště, pergola-altán i elektrické grily čekají na vás. Dřevo je pod dvěma smrky u parkoviště — v přístřešku najdete sekeru, pilu i opékací jehly, zámek otevřete kódem *0519*. Jedno upozornění s péčí: když se oheň protáhne do noci, uhlíky bývají ráno pořád horké — ohlídejte prosím malé zvědavce, ohniště je ráno láká.\n\n' +
'🧖 *Sauna*\n' +
'Připravená pro vás — návod je v letním videu i přímo u sauny. Dovnitř s ručníkem, prosím.\n\n' +
'🎬 *Všechno pohromadě v letním videu* (přivítání, bazén, sauna, dřevo, registrace):\n' +
'https://www.youtube.com/watch?v=ksVpDr-P8ic\n\n' +
'Ať vám léto u Rudolfa chutná!\n' +
'Pavel';

  TPL.winter =
'❄️ *Zima u Rudolfa — ať jste na svahu dřív než fronty*\n\n' +
'🚌 *Skibus kousek od domu*\n' +
'Jak na zastávku, ukazuje krátké video: https://youtu.be/ZX8HJqZ1YBQ\n' +
'Jízdní řády: https://drive.google.com/drive/folders/1HPJI7XydWwljBq_V19QwJGuBQWn73dZe\n' +
'Před cestou si prosím ověřte aktuální jízdní řád — v sezóně se občas mění.\n\n' +
'🎿 *Lyžárna přímo v domě*\n' +
'Lyže i boty tam přes noc krásně oschnou a ráno vyrážíte v suchém a teplém.\n\n' +
'🧖 *Sauna*\n' +
'Po dni na svahu to nejlepší zakončení. Návod najdete ve videu k domu i přímo u sauny — jen ručník s sebou.\n\n' +
'Kdyby cokoliv, jsem na telefonu. Užijte si hory!\n' +
'Pavel';

  // registrační zpráva (jádro řádku ze schválených šablon, sekce „registrační link předem")
  TPL.registration =
'Dobrý den, {JMENO}, posílám slíbený odkaz na registraci — vyřídíte ji za pár minut už teď: {REGISTRACNI_LINK} — ať po příjezdu jen odpočíváte. Kdyby cokoliv, jsem na telefonu.\nPavel';

  // KAUCE — vratná jistota (volitelný krok, zapíná se přepínačem v detailu)
  TPL.deposit =
'Dobrý den, {JMENO}, ještě jedna praktická věc k pobytu {TERMIN}. Vybíráme vratnou kauci {KAUCE} Kč — je to jen jistota pro případ škody, po odjezdu a rychlé kontrole domu vám ji obratem vracíme zpět v plné výši. Pošlete ji prosím pohodlně kartou přes Revolut: ' + REVOLUT_URL + ' ({KAUCE} Kč). Díky moc a těšíme se na vás!\nPavel';

  // BONUS (den příjezdu) — doslova
  TPL.doorcode =
'Dobrý den {JMENO}, dům je připravený a od 15:00 jen váš! 🔑 Kód ke dveřím: {KOD_DVERI} — nechte ho prosím jen ve vaší skupině. Šťastnou cestu, a kdybyste cokoliv potřebovali, jsem na telefonu. Pavel';

  TPL.day2 =
'Dobrý den, {JMENO}, jen se hlásím po první noci — máte všechno, jak má být? 🙂 Kdyby cokoliv drhlo nebo jste něco nemohli najít, napište mi nebo rovnou zavolejte (+420 775 220 785) — vyřeším to hned. Užívejte hory!\nPavel';

  TPL.predeparture =
'Dobrý den, {JMENO}, zítra se budeme loučit — snad vám bylo u Rudolfa dobře! Než vyrazíte, poprosím o pár drobností (dohromady tak 10 minut) — o všechno ostatní se postará úklidová služba:\n\n' +
'🍽 nádobí do myčky a zapnout ji\n' +
'🗑 odpadky do označených nádob — díky za základní roztřídění\n' +
'🛏 povlečení svléknout a spolu s ručníky nechat na určeném místě\n' +
'🧺 půjčené vybavení vrátit tam, kde jste ho našli\n' +
'🔍 mrknout na zavřená okna a dveře, vypnuté spotřebiče (v létě i zamčený bazén)\n\n' +
'Dům prosím předejte do 10:00 — v deset nastupuje úklid, aby v 15:00 přebírala další parta dům stejně nachystaný, jako jste ho přebírali vy.\n\n' +
'Díky moc, že to s námi dotáhnete do konce. Šťastnou cestu!\n' +
'Pavel';

  TPL.reviewBody =
'Dobrý den, {JMENO}, dnes se loučíme — a moc rádi jsme vás u Rudolfa měli. Snad si z hor odvážíte přesně to, pro co jste jeli.\n\n' +
'Jen drobná připomínka: dům prosím předejte do 10:00. Nechceme vás vyhánět, slibuju 🙂 — jen v deset nastupuje úklidová služba, aby v 15:00 mohla vítat další hosty.\n\n' +
'A pak jedna prosba, která pro nás znamená opravdu hodně. Jsme malý rodinný pronájem a hodnocení jsou to hlavní, podle čeho si Rudolfa najdou další party a rodiny.\n';

  TPL.reviewAirbnb =
'\nPokud cítíte, že si zasloužíme plných 5 hvězdiček, budeme moc vděční, když nám je na Airbnb dáte — pomáhá nám to víc, než se zdá. A kdyby cokoliv, byť maličkost, nebylo stoprocentní, napište to prosím rovnou mně sem na WhatsApp — já to totiž můžu napravit, recenze už ne. 🙂\n\n' +
'Šťastnou cestu domů — a kdykoli se budete chtít do Krkonoš vrátit, Rudolf i my tu budeme!\n' +
'Pavel';

  TPL.reviewBooking =
'\nPokud cítíte, že si zasloužíme plných 10 z 10, budeme moc vděční, když nám je na Bookingu dáte — pomáhá nám to víc, než se zdá. A kdyby cokoliv, byť maličkost, nebylo stoprocentní, napište to prosím rovnou mně sem na WhatsApp — já to totiž můžu napravit, recenze už ne. 🙂\n\n' +
'Šťastnou cestu domů — a kdykoli se budete chtít do Krkonoš vrátit, Rudolf i my tu budeme!\n' +
'Pavel';

  TPL.reviewGoogle =
'\nPokud cítíte, že si zasloužíme plné hodnocení, budeme moc vděční za recenzi na Googlu — pomáhá nám to víc, než se zdá. A kdyby cokoliv, byť maličkost, nebylo stoprocentní, napište to prosím rovnou mně sem na WhatsApp — já to totiž můžu napravit, recenze už ne. 🙂\n\n' +
'Šťastnou cestu domů — a kdykoli se budete chtít do Krkonoš vrátit, Rudolf i my tu budeme!\n' +
'Pavel';

  function reviewVariant(platform) {
    var p = (platform || '').toLowerCase();
    if (p.indexOf('airbnb') >= 0) return { label: 'Airbnb (5★)', text: TPL.reviewBody + TPL.reviewAirbnb };
    if (p.indexOf('booking') >= 0) return { label: 'Booking (10/10)', text: TPL.reviewBody + TPL.reviewBooking };
    return { label: 'Google', text: TPL.reviewBody + TPL.reviewGoogle };
  }

  function fill(tpl, ctx) {
    return tpl
      .replace(/\{JMENO\}/g, ctx.jmeno)
      .replace(/\{TERMIN\}/g, ctx.termin)
      .replace(/\{DOSPELI\}/g, ctx.dospeli)
      .replace(/\{DETI\}/g, ctx.deti)
      .replace(/\{NOCI\}/g, ctx.noci)
      .replace(/\{CASTKA\}/g, ctx.castka)
      .replace(/\{KOD_DVERI\}/g, ctx.kod)
      .replace(/\{WIFI_HESLO\}/g, WIFI)
      .replace(/\{KAUCE\}/g, DEPOSIT_CZK.toLocaleString('cs-CZ'))
      .replace(/\{REGISTRACNI_LINK\}/g, ctx.regLink || '{REGISTRACNI_LINK}');
  }

  /* ============ Sekvence (timeline) ============ */
  // offsetFrom: 'arrival' | 'departure' ; offset ve dnech
  var SEQUENCE = [
    { key: 'confirm', title: 'Potvrzení rezervace', from: 'arrival', off: -30, when: 'po potvrzení' },
    { key: 'welcome', title: 'Velká uvítací zpráva', from: 'arrival', off: -7, when: 'T−7' },
    { key: 'registration', title: 'Odkaz na registraci', from: 'arrival', off: -5, when: 'T−5' },
    { key: 'doorcode', title: 'Kód ke dveřím', from: 'arrival', off: 0, when: 'den příjezdu' },
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
  // Efektivní sekvence pro daný pobyt: základ + (volitelně) kroky kauce vložené
  // za příslušné kotvy. Klíč 'deposit_enabled' NENÍ zpráva → do sekvence nepatří.
  function sequenceFor(b) {
    if (!depositEnabled(b)) return SEQUENCE.slice();
    var out = [];
    SEQUENCE.forEach(function (msg) {
      out.push(msg);
      DEPOSIT_STEPS.forEach(function (d) { if (d.after === msg.key) out.push(d); });
    });
    return out;
  }
  function schedDate(msg, b) {
    return addDaysISO(msg.from === 'departure' ? b.departure : b.arrival, msg.off);
  }
  // Vrátí části zprávy (většinou 1; welcome má 2: jádro + sezónní modul)
  function buildParts(msg, ctx, booking) {
    if (msg.key === 'welcome') {
      return [
        { label: 'Uvítací zpráva (jádro)', text: fill(TPL.welcomeCore, ctx) },
        { label: ctx.winter ? 'Zimní modul' : 'Letní modul', text: fill(ctx.winter ? TPL.winter : TPL.summer, ctx) }
      ];
    }
    if (msg.key === 'confirm') return [{ text: fill(TPL.confirm, ctx) }];
    if (msg.key === 'registration') {
      return [{ text: fill(TPL.registration, ctx), needsToken: !ctx.regLink }];
    }
    if (msg.key === 'doorcode') return [{ text: fill(TPL.doorcode, ctx), needsCode: !booking.door_code }];
    if (msg.key === 'day2') return [{ text: fill(TPL.day2, ctx) }];
    if (msg.key === 'deposit_charge') return [{ text: fill(TPL.deposit, ctx) }];
    if (msg.key === 'deposit_return') return [{ text: '', ownerTask: true }];
    if (msg.key === 'predeparture') return [{ text: fill(TPL.predeparture, ctx) }];
    if (msg.key === 'review') {
      var rv = reviewVariant(booking.platform);
      return [{ text: fill(rv.text, ctx), variantLabel: rv.label }];
    }
    return [{ text: '' }];
  }

  /* ============ Kontext pobytu ============ */
  function guestName(b) {
    var parts = [b.first_name, b.last_name].filter(function (x) { return x && String(x).trim(); });
    return parts.length ? parts.join(' ') : 'milí hosté';
  }
  function buildCtx(booking) {
    var noci = nights(booking.arrival, booking.departure);
    var p = booking.persons || {};
    var reg = (p.registered || 0) > 0;
    var dospeli = reg ? (p.adults || 0) : (booking.adults == null ? 2 : booking.adults);
    var deti = reg ? (p.children || 0) : ((booking.children || []).length);
    var token = tokenFor(booking.id);
    return {
      jmeno: guestName(booking),
      termin: fmtTermin(booking.arrival, booking.departure),
      dospeli: dospeli, deti: deti, noci: noci,
      castka: dospeli * noci * 25,
      kod: booking.door_code || '{KOD_DVERI}',
      token: token,
      regLink: token ? (location.origin + '/registrace/?t=' + token + '&lang=' + (booking.lang || 'cs')) : null,
      winter: isWinter(booking.arrival),
      _reg: reg
    };
  }

  /* ============ wa.me ============ */
  function waPhone(phone) {
    if (!phone) return '';
    var d = String(phone).replace(/[^\d]/g, '');
    if (d.indexOf('00') === 0) d = d.slice(2);
    else if (d.length === 9) d = '420' + d; // CZ bez předvolby
    return d;
  }
  function waLink(phone, text) {
    var p = waPhone(phone);
    return 'https://wa.me/' + p + '?text=' + encodeURIComponent(text);
  }

  /* ============ Data load ============ */
  function loadCalendar() {
    return fetch(CFG.CALENDAR_URL + '?_=' + Date.now(), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (d) { return Array.isArray(d) ? d : []; })
      .catch(function () { return []; });
  }
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

  function buildStays() {
    var today = isoToday();
    var cutoff = addDaysISO(today, -14);
    var byUidh = {};
    bookings.forEach(function (b) { if (b.uidh) byUidh[b.uidh] = b; });

    stays = [];
    var usedBookingIds = {};

    // 1) kalendářní pobyty v okně (end >= dnes-14)
    calendar.forEach(function (c) {
      if (c.end < cutoff) return;
      var b = byUidh[c.uidh] || null;
      if (b) usedBookingIds[b.id] = true;
      stays.push({
        source: 'calendar', uidh: c.uidh,
        start: c.start, end: c.end, platform: c.platform, booking: b
      });
    });

    // 2) ruční pobyty (bez uidh, nebo uidh mimo kalendář) v okně
    bookings.forEach(function (b) {
      if (usedBookingIds[b.id]) return;
      if (b.uidh && byUidh[b.uidh] && stays.some(function (s) { return s.booking && s.booking.id === b.id; })) return;
      if (b.departure < cutoff) return;
      stays.push({
        source: 'manual', uidh: b.uidh || null,
        start: b.arrival, end: b.departure, platform: b.platform || 'Přímá', booking: b
      });
    });

    stays.sort(function (x, y) { return x.start < y.start ? -1 : x.start > y.start ? 1 : 0; });
  }

  /* ============ Render: DNES ============ */
  function collectTasks() {
    var today = isoToday();
    var tasks = [];
    stays.forEach(function (s) {
      if (s.booking) {
        var b = s.booking;
        var sent = {};
        (b.msglog || []).forEach(function (m) { sent[m.msg_key] = true; });
        sequenceFor(b).forEach(function (msg) {
          if (sent[msg.key]) return;
          var d = schedDate(msg, b);
          if (d > today) return; // budoucí
          tasks.push({ stay: s, booking: b, msg: msg, date: d, overdue: d < today });
        });
      } else {
        // nespárováno — upozornění, jen když je blízko (do 14 dní) nebo běží
        if ((s.start <= addDaysISO(today, 14) && s.end >= today) || (s.start <= today && s.end >= today)) {
          if (s.start >= addDaysISO(today, -14))
            tasks.push({ stay: s, warn: true, date: s.start });
        }
      }
    });
    // řazení: dnešní úkoly, pak podle data
    tasks.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return tasks;
  }

  function renderToday() {
    var wrap = $('today-list');
    var panel = $('today-panel');
    var today = isoToday();
    $('today-date').textContent = (function () {
      var d = new Date(); return d.getDate() + '. ' + MONTH_GEN[d.getMonth()] + ' ' + d.getFullYear();
    })();
    var tasks = collectTasks();
    wrap.innerHTML = '';
    panel.hidden = false;
    if (!tasks.length) { $('today-empty').hidden = false; return; }
    $('today-empty').hidden = true;

    tasks.forEach(function (t) {
      var row = document.createElement('div');
      if (t.warn) {
        row.className = 'task warn';
        row.innerHTML =
          '<div class="task-main"><div class="task-name">⚠️ ' + esc(fmtShort(t.stay.start, t.stay.end)) + '</div>' +
          '<div class="task-what">Bez kontaktu — ' + esc(t.stay.platform) + '</div>' +
          '<span class="task-when warn">doplnit hosta</span></div>' +
          '<div class="task-actions"></div>';
        var a = row.querySelector('.task-actions');
        var btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-primary'; btn.textContent = 'Doplnit';
        btn.onclick = function () { openEditor({ stay: t.stay }); };
        a.appendChild(btn);
        wrap.appendChild(row);
        return;
      }
      var b = t.booking, ctx = buildCtx(b);
      var parts = buildParts(t.msg, ctx, b);
      var ownerTask = !!t.msg.ownerTask;
      row.className = 'task' + (t.overdue ? ' overdue' : '') + (ownerTask ? ' owner' : '');
      row.innerHTML =
        '<div class="task-main"><div class="task-name">' + esc(guestName(b)) + '</div>' +
        '<div class="task-what">' + (ownerTask ? '🔁 ' : '') + esc(t.msg.title) + '</div>' +
        '<span class="task-when ' + (t.overdue ? 'overdue' : 'today') + '">' +
        (t.overdue ? 'po termínu' : 'dnes') + '</span></div>' +
        '<div class="task-actions"></div>';
      var act = row.querySelector('.task-actions');
      if (ownerTask) {
        // Úkol jen pro majitele (vratka kauce) — bez zprávy hostovi.
        var done = document.createElement('button');
        done.className = 'btn btn-sm btn-primary'; done.textContent = 'Hotovo';
        done.onclick = function () {
          done.disabled = true;
          rpc('vr_admin_msg_log', { p_booking_id: b.id, p_msg_key: t.msg.key, p_sent: true }).then(function (res) {
            if (res.data && res.data.ok) {
              b.msglog = (b.msglog || []).filter(function (m) { return m.msg_key !== t.msg.key; });
              b.msglog.push({ msg_key: t.msg.key, sent_at: new Date().toISOString() });
              toast('Označeno jako hotové.'); renderToday(); renderStays();
            } else { done.disabled = false; toast('Nepodařilo se uložit.'); }
          }).catch(function () { done.disabled = false; toast('Nepodařilo se uložit.'); });
        };
        act.appendChild(done);
      } else {
        var canWa = b.phone && parts[0].text && !parts[0].needsToken && !parts[0].needsCode;
        var wa = document.createElement('a');
        wa.className = 'btn btn-sm btn-wa';
        wa.textContent = 'WhatsApp';
        if (canWa) { wa.href = waLink(b.phone, parts[0].text); wa.target = '_blank'; wa.rel = 'noopener'; }
        else { wa.setAttribute('aria-disabled', 'true'); wa.classList.add('btn'); wa.style.opacity = '.45'; wa.style.pointerEvents = 'none'; }
        act.appendChild(wa);
      }
      var open = document.createElement('button');
      open.className = 'btn btn-sm btn-outline'; open.textContent = 'Detail';
      open.onclick = function () { openDetail(t.stay); };
      act.appendChild(open);
      wrap.appendChild(row);
    });
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
        var seq = sequenceFor(b);
        var sentCount = seq.filter(function (msg) {
          return (b.msglog || []).some(function (m) { return m.msg_key === msg.key; });
        }).length;
        var progress = seq.map(function (msg) {
          var isSent = (b.msglog || []).some(function (m) { return m.msg_key === msg.key; });
          var due = !isSent && schedDate(msg, b) <= today;
          return '<span class="pdot ' + (isSent ? 'done' : (due ? 'due' : '')) + (msg.deposit ? ' dep' : '') + '" title="' + esc(msg.title) + '"></span>';
        }).join('');
        var meta = [];
        if (b.phone) meta.push('📞 ' + esc(b.phone));
        meta.push('👤 ' + (p.registered || 0) + ' registr. / ' + (b.adults == null ? '?' : b.adults) + '+' + ((b.children || []).length) + ' dle rez.');
        if ((p.foreigners || 0) > 0) meta.push('🌍 ' + p.foreigners + ' cizinci');
        if ((p.missing_doc || 0) > 0) meta.push('⚠️ ' + p.missing_doc + ' bez dokladu');
        body =
          '<div class="stay-guest">' +
          '<div class="stay-guest-nm">' + esc(guestName(b)) + '</div>' +
          '<div class="stay-guest-meta">' + meta.join('<span class="dot"></span>') + '</div>' +
          '<div class="progress">' + progress + '</div>' +
          '<div class="status paired">🔗 spárováno · ' + sentCount + '/' + seq.length + ' zpráv</div>' +
          '<div class="stay-actions"></div></div>';
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
      } else {
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
      '<div class="field"><label>Telefon (mezinárodně, např. +420 775…)</label><input id="ed-phone" inputmode="tel" maxlength="40" value="' + esc(b ? (b.phone || '') : '') + '"></div>' +
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
      '<div class="field"><label>Dospělí (odhad)</label><input id="ed-adults" type="number" min="0" max="40" value="' + esc(b ? (b.adults == null ? 2 : b.adults) : 2) + '"></div>' +
      '<div class="field"><label>Děti (počet)</label><input id="ed-children" type="number" min="0" max="40" value="' + esc(b ? (b.children || []).length : 0) + '"></div>' +
      '</div>' +
      '<div class="row2">' +
      '<div class="field"><label>Příjezd</label><input id="ed-arrival" type="date" value="' + esc(arrival) + '"></div>' +
      '<div class="field"><label>Odjezd</label><input id="ed-departure" type="date" value="' + esc(departure) + '"></div>' +
      '</div>' +
      '<div class="field"><label>Poznámka</label><textarea id="ed-notes" maxlength="500">' + esc(b ? (b.notes || '') : '') + '</textarea></div>' +
      '<p class="hint">Počty dospělých/dětí jsou jen odhad pro výpočet poplatku, než hosté vyplní registraci. Přesná částka se pak přepočítá z registrovaných osob.</p>' +
      '<p class="form-err" id="ed-err" hidden></p>' +
      '<button type="submit" class="btn btn-primary" id="ed-save" style="width:100%">' + (isEdit ? 'Uložit změny' : 'Založit hosta') + '</button>' +
      (isEdit ? '<button type="button" class="btn btn-danger" id="ed-del" style="width:100%;margin-top:10px">Smazat pobyt</button>' : '') +
      '</form>';

    openOverlay();

    $('ed-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      saveEditor(b, uidh);
    });
    if (isEdit) $('ed-del').addEventListener('click', function () { deleteBooking(b); });
  }

  function saveEditor(existing, uidh) {
    var err = $('ed-err');
    err.hidden = true;
    var arrival = $('ed-arrival').value, departure = $('ed-departure').value;
    if (!arrival || !departure) { err.textContent = 'Vyplňte příjezd i odjezd.'; err.hidden = false; return; }
    if (departure < arrival) { err.textContent = 'Odjezd musí být po příjezdu.'; err.hidden = false; return; }
    var kids = parseInt($('ed-children').value, 10) || 0;
    var childrenArr = [];
    for (var i = 0; i < kids; i++) childrenArr.push(10);
    var payload = {
      p_id: existing ? existing.id : null,
      p_uidh: uidh || null,
      p_first: $('ed-first').value.trim(),
      p_last: $('ed-last').value.trim(),
      p_phone: $('ed-phone').value.trim(),
      p_email: $('ed-email').value.trim(),
      p_lang: $('ed-lang').value,
      p_arrival: arrival,
      p_departure: departure,
      p_adults: parseInt($('ed-adults').value, 10) || 0,
      p_children: childrenArr,
      p_platform: $('ed-platform').value.trim(),
      p_notes: $('ed-notes').value.trim(),
      p_door_code: existing ? (existing.door_code || null) : null
    };
    var btn = $('ed-save'); btn.disabled = true; btn.textContent = 'Ukládám…';
    rpc('vr_admin_upsert_booking', payload).then(function (res) {
      var d = res.data || {};
      if (!d.ok) {
        err.textContent = mapErr(d.error || d.message); err.hidden = false;
        btn.disabled = false; btn.textContent = existing ? 'Uložit změny' : 'Založit hosta';
        return;
      }
      if (d.token) { setGuestToken(d.id, d.token); }
      toast(existing ? 'Uloženo.' : 'Host založen.');
      reload().then(function () {
        var s = stays.filter(function (x) { return x.booking && x.booking.id === d.id; })[0];
        if (s) openDetail(s); else closeOverlay();
      });
    }).catch(function () {
      err.textContent = 'Uložení se nepodařilo. Zkuste to znovu.'; err.hidden = false;
      btn.disabled = false; btn.textContent = existing ? 'Uložit změny' : 'Založit hosta';
    });
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
      var registrace = location.origin + '/registrace/?t=' + token + '&lang=' + (b.lang || 'cs');
      linksHtml =
        '<div class="linkrow">' +
        linkCard('Osobní stránka hosta', pruvodce) +
        linkCard('Registrace hostů', registrace) +
        '</div>';
    } else {
      linksHtml =
        '<div class="notice">Odkazy s tokenem hosta jsou k dispozici jen na zařízení, kde byl host založen. Zde token není. Můžete vygenerovat nový odkaz (starý přestane platit).</div>' +
        '<button type="button" class="btn btn-outline" id="d-regen" style="width:100%">Vygenerovat nový odkaz hosta</button>';
    }

    body.innerHTML =
      '<div class="block">' +
      '<div class="stay-sub" style="margin-bottom:10px">' + esc(fmtTermin(b.arrival, b.departure)) + ' · ' + nights(b.arrival, b.departure) + ' nocí · ' + esc(stay.platform) + '</div>' +
      '<button type="button" class="btn btn-sm btn-outline" id="d-edit">Upravit údaje pobytu</button>' +
      '</div>' +

      '<div class="block"><h3 class="block-h">Odkazy pro hosta</h3>' + linksHtml + '</div>' +

      '<div class="block"><h3 class="block-h">Místní poplatek</h3><div id="d-fee"></div></div>' +

      '<div class="block"><h3 class="block-h">Kód ke dveřím</h3>' +
      '<div class="door-row"><div class="field"><label>Kód (doplní se do zprávy „den příjezdu")</label>' +
      '<input id="d-door" maxlength="40" value="' + esc(b.door_code || '') + '" placeholder="např. 1975"></div>' +
      '<button type="button" class="btn btn-primary" id="d-door-save">Uložit</button></div></div>' +

      '<div class="block"><h3 class="block-h">Kauce</h3>' +
      '<label class="switch"><input type="checkbox" id="d-deposit"' + (depositEnabled(b) ? ' checked' : '') + '>' +
      '<span class="switch-track"></span><span class="switch-lbl">Vybírat vratnou kauci ' + DEPOSIT_CZK.toLocaleString('cs-CZ') + ' Kč u tohoto pobytu</span></label>' +
      '<p class="hint">Zapnutím přibude do sekvence krok „Kauce — výběr" (zpráva hostovi s Revolut linkem) a po odjezdu připomínka „Vrátit kauci" (jen pro tebe, hostovi se nic neposílá).</p>' +
      '</div>' +

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

    renderFee(b, ctx);
    renderTimeline(stay, b, ctx);
    loadPersons(b);
  }

  function linkCard(title, url) {
    return '<div class="linkcard"><div class="linkcard-main">' +
      '<div class="linkcard-t">' + esc(title) + '</div>' +
      '<div class="linkcard-u">' + esc(url) + '</div></div>' +
      '<a class="btn btn-sm btn-outline" href="' + esc(url) + '" target="_blank" rel="noopener">Otevřít</a>' +
      '<button class="btn btn-sm btn-outline copybtn" data-copy="' + esc(url) + '">Kopírovat</button></div>';
  }

  function renderFee(b, ctx) {
    var box = $('d-fee');
    box.innerHTML =
      '<div class="feebox">' +
      '<div class="feeline"><span>Dospělí × noci × 25 Kč</span><span>' + ctx.dospeli + ' × ' + ctx.noci + ' × 25</span></div>' +
      '<div class="feeline"><span>Poplatek celkem</span><span class="big">' + ctx.castka + ' Kč</span></div>' +
      '<div class="feenote">Dospělí: ' + (ctx._reg ? 'z registrovaných osob (18+).' : 'odhad z rezervace — přesně se spočítá po registraci.') + '</div>' +
      '<button type="button" class="btn btn-sm btn-outline" id="d-recalc" style="margin-top:10px">Přepočítat z registrací</button>' +
      '</div>';
    $('d-recalc').addEventListener('click', function () {
      var btn = $('d-recalc'); btn.disabled = true; btn.textContent = 'Počítám…';
      rpc('vr_admin_persons', { p_booking_id: b.id }).then(function (res) {
        var persons = (res.data && res.data.persons) || [];
        var stat = statsFromPersons(persons, b.arrival);
        b.persons = stat;               // aktualizuj lokálně
        var ctx2 = buildCtx(b);
        renderFee(b, ctx2);
        renderTimeline(currentStay, b, ctx2);
        toast('Přepočítáno z ' + stat.registered + ' registrací.');
      }).catch(function () { btn.disabled = false; btn.textContent = 'Přepočítat z registrací'; });
    });
  }

  function statsFromPersons(persons, arrival) {
    var reg = persons.length, adults = 0, children = 0, foreigners = 0, missing = 0;
    var cutoff = addDaysISO(arrival, 0);
    persons.forEach(function (p) {
      var isAdult = !p.birth_date || (daysBetween(p.birth_date, cutoff) >= 18 * 365.25 - 1);
      if (isAdult) adults++; else children++;
      if ((p.citizenship || 'CZ') !== 'CZ') foreigners++;
      if (!p.doc_number) missing++;
    });
    return { registered: reg, adults: adults, children: children, foreigners: foreigners, missing_doc: missing };
  }

  var currentStay = null;
  function renderTimeline(stay, b, ctx) {
    currentStay = stay;
    var today = isoToday();
    var sent = {};
    (b.msglog || []).forEach(function (m) { sent[m.msg_key] = true; });
    var tl = $('d-tl');
    tl.innerHTML = '';

    sequenceFor(b).forEach(function (msg) {
      var d = schedDate(msg, b);
      var isSent = !!sent[msg.key];
      var due = !isSent && d <= today;
      var parts = buildParts(msg, ctx, b);
      var ownerTask = !!msg.ownerTask;

      var el = document.createElement('div');
      el.className = 'msg' + (isSent ? ' done' : (due ? ' due' : '')) + (msg.deposit ? ' dep' : '');
      var doneWord = ownerTask ? 'hotovo' : 'odesláno';
      var tag = isSent ? '<span class="msg-tag done">' + doneWord + '</span>' : (due ? '<span class="msg-tag due">na řadě</span>' : '<span class="msg-tag">' + esc(fmtDay(d)) + '</span>');
      var variant = parts[0] && parts[0].variantLabel ? ' · varianta ' + esc(parts[0].variantLabel) : '';
      var head =
        '<div class="msg-head">' +
        '<span class="msg-when">' + esc(msg.when) + '</span>' +
        '<span class="msg-title">' + esc(msg.title) + '</span>' + tag + '</div>';

      var partsHtml;
      if (ownerTask) {
        // deposit_return: úkol jen pro majitele, žádná zpráva hostovi.
        partsHtml = '<div class="notice">Připomínka jen pro tebe — hostovi se nic neposílá. Vratku ' +
          esc(DEPOSIT_CZK.toLocaleString('cs-CZ')) + ' Kč pošli ručně přes Revolut (' + esc(REVOLUT_URL) + ').</div>';
      } else {
        partsHtml = parts.map(function (p, idx) {
          var warn = '';
          if (p.needsToken) warn = '<div class="notice">Odkaz na registraci není k dispozici (token hosta chybí na tomto zařízení). Vygenerujte nový odkaz výše.</div>';
          if (p.needsCode) warn = '<div class="notice">Zatím není vyplněný kód ke dveřím — doplňte ho výše, ať se dosadí do zprávy.</div>';
          var canWa = b.phone && p.text && !p.needsToken && !p.needsCode;
          var waHtml = canWa
            ? '<a class="btn btn-sm btn-wa" href="' + esc(waLink(b.phone, p.text)) + '" target="_blank" rel="noopener">Otevřít ve WhatsApp</a>'
            : '<button class="btn btn-sm btn-wa" disabled title="' + (b.phone ? 'chybí údaj' : 'chybí telefon') + '">Otevřít ve WhatsApp</button>';
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
      cb.addEventListener('change', function () { toggleSent(b, cb.getAttribute('data-key'), cb.checked, cb); });
    });
  }

  function fmtDay(iso) {
    var d = parseISO(iso);
    return d.getDate() + '. ' + (d.getMonth() + 1) + '.';
  }

  function toggleSent(b, key, sent, cb) {
    cb.disabled = true;
    rpc('vr_admin_msg_log', { p_booking_id: b.id, p_msg_key: key, p_sent: sent }).then(function (res) {
      cb.disabled = false;
      if (!(res.data && res.data.ok)) { cb.checked = !sent; toast('Nepodařilo se uložit.'); return; }
      // aktualizuj lokální msglog
      b.msglog = (b.msglog || []).filter(function (m) { return m.msg_key !== key; });
      if (sent) b.msglog.push({ msg_key: key, sent_at: new Date().toISOString() });
      // překresli detail timeline (stav) + DNES
      renderTimeline(currentStay, b, buildCtx(b));
      renderToday(); renderStays();
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

  function regenToken(b, stay) {
    if (!window.confirm('Vygenerovat nový odkaz? Předchozí odkaz hosta přestane platit.')) return;
    rpc('vr_admin_upsert_booking', bookingPayload(b, { p_regen_token: true })).then(function (res) {
      var d = res.data || {};
      if (d.ok && d.token) { setGuestToken(b.id, d.token); toast('Nový odkaz vytvořen.'); openDetail(stay); }
      else toast('Nepodařilo se.');
    });
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
    rpc('vr_admin_persons', { p_booking_id: b.id }).then(function (res) {
      var persons = (res.data && res.data.persons) || [];
      b._persons = persons;              // uchováme vč. čísel dokladů pro Ubyport export
      renderPersons(persons);
      renderUbyport(b);
    }).catch(function () { $('d-persons').innerHTML = '<p class="persons-empty">Nepodařilo se načíst.</p>'; });
  }

  function flagEmoji(code) {
    if (!/^[A-Za-z]{2}$/.test(code || '')) return '🏳️';
    return code.toUpperCase().replace(/./g, function (c) { return String.fromCodePoint(0x1F1A5 + c.charCodeAt(0)); });
  }
  function renderPersons(persons) {
    var wrap = $('d-persons');
    if (!persons.length) { wrap.innerHTML = '<p class="persons-empty">Zatím nikdo neregistroval. Až hosté vyplní registraci, objeví se tu — vč. cizinců a chybějících dokladů (podklad pro Ubyport).</p>'; return; }
    wrap.innerHTML = '<div class="persons">' + persons.map(function (p) {
      var foreign = (p.citizenship || 'CZ') !== 'CZ';
      var docBadge = p.doc_number
        ? '<span class="badge ok">✓ doklad</span> <span class="doc-num">' + esc(p.doc_number) + '</span>'
        : '<span class="badge no">✗ bez dokladu</span>';
      var meta = [fmtShort(p.stay_from, p.stay_to)];
      if (foreign) meta.push('<span class="badge foreign">cizinec</span>');
      return '<div class="person' + (foreign ? ' foreign' : '') + '">' +
        '<span class="person-flag" title="' + esc(p.citizenship) + '">' + flagEmoji(p.citizenship) + '</span>' +
        '<div class="person-main"><div class="person-nm">' + esc((p.first_name + ' ' + p.last_name).trim()) + '</div>' +
        '<div class="person-meta">' + meta.join(' ') + ' ' + docBadge + '</div></div></div>';
    }).join('') + '</div>';
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
      renderTimeline(stay, b, buildCtx(b)); renderToday(); renderStays();
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
  function ubyNow() {
    var d = new Date(), z = function (n) { return String(n).padStart(2, '0'); };
    return z(d.getDate()) + '.' + z(d.getMonth() + 1) + '.' + d.getFullYear() + ' ' +
      z(d.getHours()) + ':' + z(d.getMinutes()) + ':' + z(d.getSeconds());
  }
  function foreignersOf(b) {
    return (b._persons || []).filter(function (p) { return (p.citizenship || 'CZ').toUpperCase() !== 'CZ'; });
  }
  function ubyValidate(foreigners) {
    var issues = [];
    foreigners.forEach(function (p) {
      var probs = [];
      if (!p.doc_number) probs.push('chybí číslo dokladu');
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
    var bydliste = [ubyField(p.residence_city), (p.residence_country ? ubyCountry(p.residence_country).code : '')]
      .filter(function (x) { return x; }).join(', ');
    return ['U',
      ubyDate(p.stay_from), ubyDate(p.stay_to),
      ubyField(p.last_name), ubyField(p.first_name), '',
      ubyDate(p.birth_date), '', '',
      ubyCountry(p.citizenship).code,
      bydliste, ubyField(p.doc_number), '', ucel, '', ''
    ].join('|');
  }
  function buildUnl(b) {
    var foreigners = foreignersOf(b);
    var lines = [ubyHeaderLine()];
    foreigners.forEach(function (p) { lines.push(ubyGuestLine(p)); });
    return toCp1250Bytes(lines.join('\r\n'));
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
    var fs = foreignersOf(b);
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
    var issues = ubyValidate(fs);
    var issuesHtml = '';
    if (issues.length) {
      issuesHtml = '<div class="uby-warn"><b>⚠️ Před odesláním zkontrolujte:</b><ul>' +
        issues.map(function (it) {
          return '<li>' + esc(it.name || 'osoba') + ' — ' + esc(it.probs.join(', ')) + '</li>';
        }).join('') + '</ul></div>';
    }
    var idubHtml = hasIdub ? '' :
      '<div class="uby-warn"><b>Doplňte IDUB v Nastavení</b> — bez identifikátoru ubytovatele (z vašeho účtu Ubyport) nelze soubor vygenerovat. Adresa vily je předvyplněná.</div>';
    wrap.innerHTML =
      '<p class="uby-count">Registrovaní cizinci k nahlášení: <b>' + fs.length + '</b></p>' +
      issuesHtml + idubHtml +
      '<div class="uby-actions">' +
      '<button type="button" class="btn btn-sm btn-primary" id="uby-dl"' + (hasIdub ? '' : ' aria-disabled="true"') + '>Stáhnout hlášení Ubyport (UNL)</button>' +
      '<button type="button" class="btn btn-sm btn-outline" id="uby-copy">Zkopírovat seznam cizinců</button>' +
      '</div>' +
      '<p class="hint">Soubor je v oficiálním formátu UNL (CP1250), účel pobytu 10 = turistika. Nahrajete ho ve svém účtu Ubyport (modul UpLoad). Kopie jako text slouží pro ruční zadání.</p>';
    $('uby-dl').addEventListener('click', function () { downloadUnl(b); });
    $('uby-copy').addEventListener('click', function () { copyForeigners(b); });
  }

  /* ============ NASTAVENÍ (Ubyport konfigurace ubytovatele) ============ */
  var SETTINGS_FIELDS = [
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
  function openSettings() {
    $('sheet-title').textContent = 'Nastavení — Ubyport';
    var c = adminConfig || {};
    $('sheet-body').innerHTML =
      '<form id="set-form" autocomplete="off">' +
      '<p class="hint">Údaje ubytovatele do hlavičky hlášení cizinců (Ubyport). <b>IDUB</b> získáte ve svém účtu Ubyport (Služba cizinecké policie); ostatní je předvyplněné adresou vily.</p>' +
      SETTINGS_FIELDS.map(function (f) {
        return '<div class="field"><label>' + esc(f[1]) + '</label>' +
          '<input id="set-' + f[0] + '" maxlength="200" value="' + esc(c[f[0]] || '') + '" placeholder="' + esc(f[2]) + '"></div>';
      }).join('') +
      '<p class="form-err" id="set-err" hidden></p>' +
      '<button type="submit" class="btn btn-primary" id="set-save" style="width:100%">Uložit nastavení</button>' +
      '</form>';
    openOverlay();
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
      if (results.every(Boolean)) { toast('Nastavení uloženo.'); closeOverlay(); }
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
    return Promise.all([loadCalendar(), loadBookings(), loadConfig()]).then(function (r) {
      calendar = r[0]; bookings = r[1]; adminConfig = r[2] || {};
      buildStays();
      $('loadline').hidden = true;
      renderToday(); renderStays();
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
    $('btn-lock').addEventListener('click', function () { lockOut(); $('lock-input').value = ''; });
    $('sheet-close').addEventListener('click', closeOverlay);
    $('overlay').addEventListener('click', function (e) { if (e.target === $('overlay')) closeOverlay(); });
    $('btn-manual').addEventListener('click', function () { openEditor({}); });
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
