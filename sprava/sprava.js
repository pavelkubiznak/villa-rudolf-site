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
  var serverConflicts = []; // stav hlídače z vr_admin_conflicts (resolved/known)
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

  /* ============ ŠABLONY ZPRÁV — 4 jazyky cs/en/de/pl ============ */
  // CS doslovně schváleno 23.7.2026; en/de/pl přeloženy (vr-sablony-preklady-full.json).
  // {REVOLUT_URL} v deposit zapečen při buildu. Přístup TPL[lang][key].
  var TPL = {
    "cs": {
      "confirm": "Dobrý den, {JMENO},\n\nděkujeme za rezervaci — {TERMIN} je Villa Rudolf vaše a my s vámi počítáme! 🙂\n\nDo pobytu je ještě čas, tak jen tři věci, které se hodí vědět už teď:\n\n🛂 *Doklady — hlavně pro děti*\nPři příjezdu registrujeme všechny ubytované včetně dětí (evidence pro město). Zkontrolujte prosím včas, že **každý ve skupině má vlastní cestovní doklad — i děti**. Spousta rodin zjistí až na místě, že děti pas nebo občanku vůbec nemají, a vyřízení trvá i pár týdnů. Teď je na to ideální čas.\n\n🥾 *Co se u nás dá podniknout*\nVýlety, sjezdovky i tipy s mapou najdete na https://villarudolf.com/vylety/ — klidně si začněte plánovat. Před příjezdem od nás dostanete i osobní stránku s doporučeními na míru vaší skupině.\n\n📬 *Co bude dál*\nTýden před příjezdem vám pošlu jednu velkou zprávu se vším důležitým (adresa, vstup, dům) a pár dní nato odkaz na pohodlnou registraci předem — na místě už pak nemusíte řešit nic.\n\nKdybyste cokoli potřebovali už teď, napište nebo zavolejte: +420 775 220 785.\n\nTěšíme se na vás!\nPavel Kubizňák, Villa Rudolf",
      "welcomeCore": "Dobrý den, {JMENO},\n\nmoc se na vás těšíme — {TERMIN} bude Villa Rudolf jen vaše! Posílám všechno důležité v jedné zprávě, ať ji máte po ruce.\n\n📍 *Kam jedete*\nVilla Rudolf, Luční 519, Svoboda nad Úpou. Parkujete přímo na pozemku u domu.\n\n🕒 *Dům je váš od 15:00*\nDopoledne ho po předchozí partě chystáme do plné parády — proto prosím nejezděte dřív, ať vás nevítáme s vysavačem v ruce. 🙂\n\n🔑 *Vstup bez klíčů*\nDveře otevřete kódem, který vám pošlu zvlášť v den příjezdu. Nechte si ho prosím jen ve své skupině a při odchodu vždy mrkněte, že jsou dveře zavřené — dům je po celý pobyt jen váš.\n\n🏠 *Prohlédněte si dům už teď*\nVirtuální prohlídka: https://www.keypano.com/v/569g7v8_96ci86-1770715560.html\nVideo k domu: https://youtu.be/tWCuuovnh2U\n\n📝 *Registrace po příjezdu*\nQR kód najdete na lednici — vyplňte prosím co nejdřív za všechny, tedy {DOSPELI} dospělých i {DETI} dětí. Není to náš výmysl, město vede evidenci k místnímu poplatku; zabere to pár minut a máte to z krku.\n\n💳 *Místní poplatek (jde městu, ne nám)*\n25 Kč / 1 € za dospělého a noc. U vás: {DOSPELI} dospělých × {NOCI} nocí = {CASTKA} Kč. Nejjednodušší kartou přes https://revolut.me/pavelhuqh, klidně ale i hotově na místě.\n\n🌙 *Večery*\nJsme v horském údolí, které nese zvuk dál, než byste čekali — a sousedé kolem tu žijí celý rok, ne jen na víkend. Hudba proto u nás hraje jen uvnitř domu: reproduktory na pozemek prosíme vůbec, ani přes den. Večer u ohně to bohatě vynahradí praskání dřeva a ticho, jaké ve městě neuslyšíte. Po desáté večer buďte prosím venku úplně potichu — lidé okolo ráno vstávají do práce a v létě spí při otevřených oknech, a hluk je bohužel rychle přiměje volat policii. Večer u ohně je krásný i potichu, uvidíte. Uvnitř si poseďte, jak dlouho chcete.\n\n📶 *Wi-Fi všude*\nSíť „Rudolf Wi-Fi\", heslo: {WIFI_HESLO}. Chytá v celém domě i po celém pozemku — od ohniště přes pergolu až po dětské hřiště.\n\n📞 *Kdyby cokoliv*\nPavel: +420 775 220 785 — pište, volejte, jsem tu pro vás.\nNemocnice Trutnov: +420 499 866 111 (Maxima Gorkého 77, Trutnov)\nTíseň: 112 · záchranka 155 · policie 158 · hasiči 150 · městská policie 156\nHorská služba: +420 602 448 338\n\nTěšíme se na vás!\nPavel",
      "summer": "☀️ *Léto u Rudolfa — pár věcí navíc*\n\n🏊 *Bazén* (v provozu zhruba květen–září, vyhřívaný na ~27 °C — trochu podle počasí)\nPředáváme ho vždy zamčený — klíče jsou v kuchyni v levé horní skříňce (při pohledu na linku úplně nahoře vlevo). Zamčený je kvůli bezpečí dětí: k vodě prosím vždy jen pod dohledem dospělého, nikdy samy — stačí okamžik nepozornosti. Po koupání bazén zase zavřete a zamkněte, krásně tak drží teplotu i čistotu. A skleničky nechte prosím na terase — kdyby se sklo v bazénu rozbilo, museli bychom ho celý vypustit, vyčistit a znovu napouštět a ohřívat, a to je pro vás den i víc bez koupání.\n\n🔥 *Ohniště, gril, dřevo*\nVelké ohniště, pergola-altán i elektrické grily čekají na vás. Dřevo je pod dvěma smrky u parkoviště — v přístřešku najdete sekeru, pilu i opékací jehly, zámek otevřete kódem *0519*. Jedno upozornění s péčí: když se oheň protáhne do noci, uhlíky bývají ráno pořád horké — ohlídejte prosím malé zvědavce, ohniště je ráno láká.\n\n🧖 *Sauna*\nPřipravená pro vás — návod je v letním videu i přímo u sauny. Dovnitř s ručníkem, prosím.\n\n🎬 *Všechno pohromadě v letním videu* (přivítání, bazén, sauna, dřevo, registrace):\nhttps://www.youtube.com/watch?v=ksVpDr-P8ic\n\nAť vám léto u Rudolfa chutná!\nPavel",
      "winter": "❄️ *Zima u Rudolfa — ať jste na svahu dřív než fronty*\n\n🚌 *Skibus kousek od domu*\nJak na zastávku, ukazuje krátké video: https://youtu.be/ZX8HJqZ1YBQ\nJízdní řády: https://drive.google.com/drive/folders/1HPJI7XydWwljBq_V19QwJGuBQWn73dZe\nPřed cestou si prosím ověřte aktuální jízdní řád — v sezóně se občas mění.\n\n🎿 *Lyžárna přímo v domě*\nLyže i boty tam přes noc krásně oschnou a ráno vyrážíte v suchém a teplém.\n\n🧖 *Sauna*\nPo dni na svahu to nejlepší zakončení. Návod najdete ve videu k domu i přímo u sauny — jen ručník s sebou.\n\nKdyby cokoliv, jsem na telefonu. Užijte si hory!\nPavel",
      "registration": "Dobrý den, {JMENO}, posílám slíbený odkaz na registraci — vyřídíte ji za pár minut už teď: {REGISTRACNI_LINK} — ať po příjezdu jen odpočíváte. Kdyby cokoliv, jsem na telefonu.\nPavel",
      "deposit": "Dobrý den, {JMENO}, ještě jedna praktická věc k pobytu {TERMIN}. Vybíráme vratnou kauci {KAUCE} Kč — je to jen jistota pro případ škody, po odjezdu a rychlé kontrole domu vám ji obratem vracíme zpět v plné výši. Pošlete ji prosím pohodlně kartou přes Revolut: https://revolut.me/pavelhuqh ({KAUCE} Kč). Díky moc a těšíme se na vás!\nPavel",
      "doorcode": "Dobrý den {JMENO}, dům je připravený a od 15:00 jen váš! 🔑 Kód ke dveřím: {KOD_DVERI} — nechte ho prosím jen ve vaší skupině. Šťastnou cestu, a kdybyste cokoliv potřebovali, jsem na telefonu. Pavel",
      "day2": "Dobrý den, {JMENO}, jen se hlásím po první noci — máte všechno, jak má být? 🙂 Kdyby cokoliv drhlo nebo jste něco nemohli najít, napište mi nebo rovnou zavolejte (+420 775 220 785) — vyřeším to hned. Užívejte hory!\nPavel",
      "predeparture": "Dobrý den, {JMENO}, zítra se budeme loučit — snad vám bylo u Rudolfa dobře! Než vyrazíte, poprosím o pár drobností (dohromady tak 10 minut) — o všechno ostatní se postará úklidová služba:\n\n🍽 nádobí do myčky a zapnout ji\n🗑 odpadky do označených nádob — díky za základní roztřídění\n🛏 povlečení svléknout a spolu s ručníky nechat na určeném místě\n🧺 půjčené vybavení vrátit tam, kde jste ho našli\n🔍 mrknout na zavřená okna a dveře, vypnuté spotřebiče (v létě i zamčený bazén)\n\nDům prosím předejte do 10:00 — v deset nastupuje úklid, aby v 15:00 přebírala další parta dům stejně nachystaný, jako jste ho přebírali vy.\n\nDíky moc, že to s námi dotáhnete do konce. Šťastnou cestu!\nPavel",
      "reviewBody": "Dobrý den, {JMENO}, dnes se loučíme — a moc rádi jsme vás u Rudolfa měli. Snad si z hor odvážíte přesně to, pro co jste jeli.\n\nJen drobná připomínka: dům prosím předejte do 10:00. Nechceme vás vyhánět, slibuju 🙂 — jen v deset nastupuje úklidová služba, aby v 15:00 mohla vítat další hosty.\n\nA pak jedna prosba, která pro nás znamená opravdu hodně. Jsme malý rodinný pronájem a hodnocení jsou to hlavní, podle čeho si Rudolfa najdou další party a rodiny.\n",
      "reviewAirbnb": "\nPokud cítíte, že si zasloužíme plných 5 hvězdiček, budeme moc vděční, když nám je na Airbnb dáte — pomáhá nám to víc, než se zdá. A kdyby cokoliv, byť maličkost, nebylo stoprocentní, napište to prosím rovnou mně sem na WhatsApp — já to totiž můžu napravit, recenze už ne. 🙂\n\nŠťastnou cestu domů — a kdykoli se budete chtít do Krkonoš vrátit, Rudolf i my tu budeme!\nPavel",
      "reviewBooking": "\nPokud cítíte, že si zasloužíme plných 10 z 10, budeme moc vděční, když nám je na Bookingu dáte — pomáhá nám to víc, než se zdá. A kdyby cokoliv, byť maličkost, nebylo stoprocentní, napište to prosím rovnou mně sem na WhatsApp — já to totiž můžu napravit, recenze už ne. 🙂\n\nŠťastnou cestu domů — a kdykoli se budete chtít do Krkonoš vrátit, Rudolf i my tu budeme!\nPavel",
      "reviewGoogle": "\nPokud cítíte, že si zasloužíme plné hodnocení, budeme moc vděční za recenzi na Googlu — pomáhá nám to víc, než se zdá. A kdyby cokoliv, byť maličkost, nebylo stoprocentní, napište to prosím rovnou mně sem na WhatsApp — já to totiž můžu napravit, recenze už ne. 🙂\n\nŠťastnou cestu domů — a kdykoli se budete chtít do Krkonoš vrátit, Rudolf i my tu budeme!\nPavel"
    },
    "en": {
      "confirm": "Hello {JMENO},\n\nThank you for your booking — for {TERMIN}, Villa Rudolf is all yours, and we're already looking forward to it! 🙂\n\nThere's still plenty of time before your stay, so just three things worth knowing now:\n\n🛂 *Travel documents — especially for the children*\nOn arrival we register everyone staying, children included (it's a record kept for the town). Please check in good time that **everyone in your group has their own travel document — children too**. Many families only discover on the spot that their kids don't have a passport or ID card at all, and getting one can take a few weeks. Now is the perfect time to sort it out.\n\n🥾 *What there is to do around here*\nTrips, ski slopes and tips with a map are at https://villarudolf.com/vylety/ — feel free to start planning. Before your arrival you'll also get a personal page from us with recommendations tailored to your group.\n\n📬 *What happens next*\nA week before your arrival I'll send you one big message with everything important (address, entry, the house), and a few days after that a link for easy pre-registration — so once you're here, there's nothing left to deal with.\n\nIf you need anything in the meantime, just write or call: +420 775 220 785.\n\nWe can't wait to welcome you!\nPavel Kubizňák, Villa Rudolf",
      "welcomeCore": "Hello {JMENO},\n\nWe're really looking forward to having you — for {TERMIN}, Villa Rudolf will be all yours! Here's everything important in one message, so you have it handy.\n\n📍 *Where you're headed*\nVilla Rudolf, Luční 519, Svoboda nad Úpou. You park right on the property, next to the house.\n\n🕒 *The house is yours from 15:00*\nIn the morning we're getting it back into perfect shape after the previous group — so please don't arrive early, or we'll be welcoming you with a vacuum cleaner in hand. 🙂\n\n🔑 *Keyless entry*\nThe door opens with a code, which I'll send you separately on the day of arrival. Please keep it within your group only, and whenever you head out, just check the door is closed — the house is yours alone for the whole stay.\n\n🏠 *Have a look around the house right now*\nVirtual tour: https://www.keypano.com/v/569g7v8_96ci86-1770715560.html\nHouse video: https://youtu.be/tWCuuovnh2U\n\n📝 *Registration after arrival*\nYou'll find a QR code on the fridge — please fill it in as soon as you can for everyone, that's {DOSPELI} adults and {DETI} children. It's not something we invented — the town keeps a register for the local fee; it takes a few minutes and then it's off your plate.\n\n💳 *Local fee (goes to the town, not to us)*\n25 Kč / 1 € per adult per night. For your group: {DOSPELI} adults × {NOCI} nights = {CASTKA} Kč. Easiest by card via https://revolut.me/pavelhuqh, though cash on the spot is absolutely fine too.\n\n🌙 *Evenings*\nWe're in a mountain valley that carries sound further than you'd expect — and the neighbours around us live here all year round, not just at weekends. That's why music at our place plays only inside the house: please no speakers out on the grounds at all, not even during the day. An evening by the fire more than makes up for it — crackling wood and a kind of quiet you won't hear in the city. After ten in the evening, please keep completely quiet outdoors — people around here get up early for work and sleep with their windows open in summer, and noise sadly gets them calling the police quickly. An evening by the fire is beautiful even when it's quiet — you'll see. And inside, sit up as long as you like.\n\n📶 *Wi-Fi everywhere*\nNetwork \"Rudolf Wi-Fi\", password: {WIFI_HESLO}. You'll get signal throughout the house and across the whole property — from the fire pit to the pergola to the children's playground.\n\n📞 *If you need anything at all*\nPavel: +420 775 220 785 — message me, call me, I'm here for you.\nTrutnov Hospital: +420 499 866 111 (Maxima Gorkého 77, Trutnov)\nEmergency: 112 · ambulance 155 · police 158 · fire brigade 150 · municipal police 156\nMountain Rescue: +420 602 448 338\n\nWe can't wait to see you!\nPavel",
      "summer": "☀️ *Summer at Rudolf's — a few extra things*\n\n🏊 *Pool* (open roughly May–September, heated to ~27 °C — depending a little on the weather)\nWe always hand it over locked — the keys are in the kitchen, in the upper left cupboard (facing the kitchen counter, top row, far left). It's locked for the children's safety: please make sure kids only ever go near the water under adult supervision, never on their own — a single moment of inattention is all it takes. After swimming, close and lock the pool again — that way it keeps its temperature and stays lovely and clean. And please keep glasses on the terrace — if glass ever broke in the pool, we'd have to drain it completely, clean it, then refill and reheat it, and that means a day or more without swimming for you.\n\n🔥 *Fire pit, grill, firewood*\nThe big fire pit, the pergola gazebo and the electric grills are all waiting for you. Firewood is under the two spruces by the car park — in the shelter you'll find an axe, a saw and roasting skewers; the lock opens with the code *0519*. One note, said with care: when the fire runs late into the night, the embers are often still hot in the morning — please keep an eye on your little explorers, the fire pit tempts them first thing in the morning.\n\n🧖 *Sauna*\nReady and waiting for you — instructions are in the summer video and right by the sauna. Please take a towel in with you.\n\n🎬 *Everything in one place in the summer video* (welcome, pool, sauna, firewood, registration):\nhttps://www.youtube.com/watch?v=ksVpDr-P8ic\n\nEnjoy every bit of summer at Rudolf's!\nPavel",
      "winter": "❄️ *Winter at Rudolf's — so you're on the slopes before the queues*\n\n🚌 *Ski bus a short walk from the house*\nThis short video shows the way to the stop: https://youtu.be/ZX8HJqZ1YBQ\nTimetables: https://drive.google.com/drive/folders/1HPJI7XydWwljBq_V19QwJGuBQWn73dZe\nPlease check the current timetable before you set out — it changes now and then during the season.\n\n🎿 *Ski room right in the house*\nSkis and boots dry out beautifully there overnight, so in the morning you head out with everything dry and warm.\n\n🧖 *Sauna*\nThe best way to end a day on the slopes. You'll find instructions in the house video and right by the sauna — just bring a towel.\n\nIf you need anything at all, I'm just a call away. Enjoy the mountains!\nPavel",
      "registration": "Hello {JMENO}, here is the promised registration link — it takes just a few minutes and you can do it right now: {REGISTRACNI_LINK} — so that after you arrive, all that's left is to relax. If you need anything, I'm just a call away.\nPavel",
      "deposit": "Hello {JMENO}, one more practical thing about your stay {TERMIN}. We collect a refundable security deposit of {KAUCE} CZK — it is simply a safeguard in case of damage; after your departure and a quick check of the house, we return it to you in full right away. The easiest way to send it is by card via Revolut: https://revolut.me/pavelhuqh ({KAUCE} CZK). Thank you so much — we're looking forward to having you!\nPavel",
      "doorcode": "Hello {JMENO}, the house is ready and from 15:00 it is all yours! 🔑 Door code: {KOD_DVERI} — please keep it within your group only. Safe travels — and if you need anything, I'm just a call away. Pavel",
      "day2": "Hello {JMENO}, just checking in after your first night — is everything just as it should be? 🙂 If anything's not quite right or you can't find something, message me or simply call (+420 775 220 785) — I'll sort it out straight away. Enjoy the mountains!\nPavel",
      "predeparture": "Hello {JMENO}, tomorrow it's time to say goodbye — we hope you've felt at home at Rudolf's! Before you set off, could I ask for a few small things (about 10 minutes all together)? The cleaning team will take care of everything else:\n\n🍽 dishes into the dishwasher and switch it on\n🗑 rubbish into the marked bins — thanks for a bit of basic sorting\n🛏 strip the bed linen and leave it, together with the towels, in the designated spot\n🧺 return any borrowed equipment to where you found it\n🔍 a quick check that windows and doors are closed and appliances switched off (and in summer, the pool locked)\n\nPlease hand the house over by 10:00 — the cleaners start at ten, so that at 15:00 the next group can take over the house just as ready as you found it.\n\nThank you so much for seeing it through with us. Safe travels!\nPavel",
      "reviewBody": "Hello {JMENO}, today we say goodbye — and we've truly loved having you at Rudolf's. We hope you're taking home from the mountains exactly what you came for.\n\nJust a gentle reminder: please hand the house over by 10:00. We're not chasing you out, I promise 🙂 — it's just that the cleaning team arrives at ten so they can welcome the next guests at 15:00.\n\nAnd then one request that means a great deal to us. We're a small family-run rental, and reviews are the main way new groups and families find Rudolf.\n",
      "reviewAirbnb": "\nIf you feel we've earned the full 5 stars, we'd be so grateful if you gave them to us on Airbnb — it helps us more than you might think. And if anything at all, even the smallest thing, wasn't quite one hundred percent, please write it straight to me here on WhatsApp — because that I can put right; a review, I can't. 🙂\n\nSafe travels home — and whenever you feel like coming back to the Krkonoše, Rudolf will be here, and so will we!\nPavel",
      "reviewBooking": "\nIf you feel we've earned the full 10 out of 10, we'd be so grateful if you gave it to us on Booking — it helps us more than you might think. And if anything at all, even the smallest thing, wasn't quite one hundred percent, please write it straight to me here on WhatsApp — because that I can put right; a review, I can't. 🙂\n\nSafe travels home — and whenever you feel like coming back to the Krkonoše, Rudolf will be here, and so will we!\nPavel",
      "reviewGoogle": "\nIf you feel we've earned the full rating, we'd be so grateful for a review on Google — it helps us more than you might think. And if anything at all, even the smallest thing, wasn't quite one hundred percent, please write it straight to me here on WhatsApp — because that I can put right; a review, I can't. 🙂\n\nSafe travels home — and whenever you feel like coming back to the Krkonoše, Rudolf will be here, and so will we!\nPavel"
    },
    "de": {
      "confirm": "Guten Tag, {JMENO},\n\nvielen Dank für Ihre Reservierung — {TERMIN} gehört die Villa Rudolf ganz Ihnen, und wir haben Sie fest eingeplant! 🙂\n\nBis zu Ihrem Aufenthalt ist noch etwas Zeit, daher nur drei Dinge, die schon jetzt gut zu wissen sind:\n\n🛂 *Reisedokumente — vor allem für die Kinder*\nBei der Anreise registrieren wir alle Gäste einschließlich der Kinder (Meldepflicht gegenüber der Stadt). Prüfen Sie bitte rechtzeitig, dass **jeder in Ihrer Gruppe ein eigenes Reisedokument hat — auch die Kinder**. Viele Familien stellen erst vor Ort fest, dass die Kinder gar keinen Reisepass oder Personalausweis besitzen — und die Ausstellung kann mehrere Wochen dauern. Jetzt ist der ideale Zeitpunkt dafür.\n\n🥾 *Was Sie bei uns unternehmen können*\nAusflüge, Skipisten und Tipps mit Karte finden Sie unter https://villarudolf.com/vylety/ — beginnen Sie gerne schon mit der Planung. Vor der Anreise erhalten Sie von uns zusätzlich eine persönliche Seite mit Empfehlungen, zugeschnitten auf Ihre Gruppe.\n\n📬 *Wie es weitergeht*\nEine Woche vor der Anreise schicke ich Ihnen eine große Nachricht mit allem Wichtigen (Adresse, Zugang, Haus) und ein paar Tage danach einen Link zur bequemen Vorab-Registrierung — vor Ort müssen Sie sich dann um nichts mehr kümmern.\n\nSollten Sie schon jetzt etwas brauchen, schreiben Sie mir oder rufen Sie an: +420 775 220 785.\n\nWir freuen uns auf Sie!\nPavel Kubizňák, Villa Rudolf",
      "welcomeCore": "Guten Tag, {JMENO},\n\nwir freuen uns sehr auf Sie — {TERMIN} gehört die Villa Rudolf nur Ihnen! Hier kommt alles Wichtige in einer Nachricht, damit Sie alles griffbereit haben.\n\n📍 *Wohin Sie fahren*\nVilla Rudolf, Luční 519, Svoboda nad Úpou. Geparkt wird direkt auf dem Grundstück am Haus.\n\n🕒 *Das Haus gehört Ihnen ab 15:00 Uhr*\nAm Vormittag bringen wir es nach der vorherigen Gruppe auf Hochglanz — reisen Sie daher bitte nicht früher an, damit wir Sie nicht mit dem Staubsauger in der Hand begrüßen. 🙂\n\n🔑 *Zutritt ohne Schlüssel*\nDie Tür öffnen Sie mit einem Code, den ich Ihnen am Anreisetag separat schicke. Behalten Sie ihn bitte nur innerhalb Ihrer Gruppe, und werfen Sie beim Verlassen des Hauses immer kurz einen Blick darauf, dass die Tür geschlossen ist — das Haus gehört während des gesamten Aufenthalts nur Ihnen.\n\n🏠 *Sehen Sie sich das Haus schon jetzt an*\nVirtueller Rundgang: https://www.keypano.com/v/569g7v8_96ci86-1770715560.html\nVideo zum Haus: https://youtu.be/tWCuuovnh2U\n\n📝 *Registrierung nach der Anreise*\nDen QR-Code finden Sie am Kühlschrank — füllen Sie das Formular bitte möglichst bald für alle aus, also {DOSPELI} Erwachsene und {DETI} Kinder. Das ist keine Idee von uns: Die Stadt führt die Meldeliste zur Kurtaxe. Es dauert nur ein paar Minuten, und Sie haben es hinter sich.\n\n💳 *Kurtaxe (geht an die Stadt, nicht an uns)*\n25 Kč / 1 € pro Erwachsenen und Nacht. Bei Ihnen: {DOSPELI} Erwachsene × {NOCI} Nächte = {CASTKA} Kč. Am einfachsten per Karte über https://revolut.me/pavelhuqh, gerne aber auch bar vor Ort.\n\n🌙 *Die Abende*\nWir liegen in einem Bergtal, das den Schall weiter trägt, als man erwarten würde — und die Nachbarn ringsum wohnen hier das ganze Jahr, nicht nur am Wochenende. Musik läuft bei uns deshalb nur im Haus: Lautsprecher nehmen Sie bitte gar nicht erst mit aufs Grundstück, auch tagsüber nicht. Am Abend am Feuer entschädigen dafür das Knistern des Holzes und eine Stille, wie man sie in der Stadt nicht hört, mehr als genug. Nach zehn Uhr abends seien Sie draußen bitte ganz leise — die Menschen in der Nachbarschaft stehen morgens zur Arbeit auf und schlafen im Sommer bei offenen Fenstern, und Lärm bringt sie leider schnell dazu, die Polizei zu rufen. Ein Abend am Feuer ist auch leise wunderschön, Sie werden sehen. Drinnen sitzen Sie gerne zusammen, so lange Sie möchten.\n\n📶 *WLAN überall*\nNetz „Rudolf Wi-Fi\", Passwort: {WIFI_HESLO}. Der Empfang reicht durchs ganze Haus und über das gesamte Grundstück — von der Feuerstelle über die Pergola bis zum Kinderspielplatz.\n\n📞 *Falls irgendetwas ist*\nPavel: +420 775 220 785 — schreiben Sie, rufen Sie an, ich bin für Sie da.\nKrankenhaus Trutnov: +420 499 866 111 (Maxima Gorkého 77, Trutnov)\nNotruf: 112 · Rettungsdienst 155 · Polizei 158 · Feuerwehr 150 · Stadtpolizei 156\nBergwacht: +420 602 448 338\n\nWir freuen uns auf Sie!\nPavel",
      "summer": "☀️ *Sommer bei Rudolf — ein paar Dinge zusätzlich*\n\n🏊 *Pool* (in Betrieb etwa Mai–September, beheizt auf ~27 °C — ein wenig wetterabhängig)\nWir übergeben ihn immer abgeschlossen — die Schlüssel liegen in der Küche im linken oberen Schrank (mit Blick auf die Küchenzeile ganz oben links). Abgeschlossen ist er zur Sicherheit der Kinder: ans Wasser bitte immer nur unter Aufsicht eines Erwachsenen, nie allein — ein Moment der Unachtsamkeit genügt. Nach dem Baden machen Sie den Pool bitte wieder zu und schließen ihn ab — so hält er Temperatur und Sauberkeit wunderbar. Und die Gläser lassen Sie bitte auf der Terrasse: Sollte im Pool Glas zerbrechen, müssten wir ihn komplett ablassen, reinigen, neu befüllen und wieder aufheizen — und das bedeutet für Sie einen Tag oder mehr ohne Baden.\n\n🔥 *Feuerstelle, Grill, Holz*\nDie große Feuerstelle, der Pergola-Pavillon und die Elektrogrills warten auf Sie. Das Holz liegt unter den zwei Fichten am Parkplatz — im Unterstand finden Sie Axt, Säge und Grillspieße, das Schloss öffnen Sie mit dem Code *0519*. Ein Hinweis aus Fürsorge: Wenn das Feuer bis in die Nacht brennt, ist die Glut am Morgen oft noch heiß — behalten Sie bitte die kleinen Entdecker im Auge, die Feuerstelle lockt sie morgens besonders.\n\n🧖 *Sauna*\nFür Sie vorbereitet — die Anleitung finden Sie im Sommervideo und direkt an der Sauna. Hinein bitte nur mit Handtuch.\n\n🎬 *Alles auf einen Blick im Sommervideo* (Begrüßung, Pool, Sauna, Holz, Registrierung):\nhttps://www.youtube.com/watch?v=ksVpDr-P8ic\n\nGenießen Sie den Sommer bei Rudolf!\nPavel",
      "winter": "❄️ *Winter bei Rudolf — damit Sie eher auf der Piste sind als die Warteschlangen*\n\n🚌 *Skibus ein kurzes Stück vom Haus entfernt*\nWie Sie zur Haltestelle kommen, zeigt ein kurzes Video: https://youtu.be/ZX8HJqZ1YBQ\nFahrpläne: https://drive.google.com/drive/folders/1HPJI7XydWwljBq_V19QwJGuBQWn73dZe\nPrüfen Sie vor der Fahrt bitte den aktuellen Fahrplan — in der Saison ändert er sich gelegentlich.\n\n🎿 *Skiraum direkt im Haus*\nSki und Schuhe trocknen dort über Nacht wunderbar, und am Morgen starten Sie in trockener, warmer Ausrüstung.\n\n🧖 *Sauna*\nNach einem Tag auf der Piste der schönste Abschluss. Die Anleitung finden Sie im Video zum Haus und direkt an der Sauna — nur ein Handtuch mitnehmen.\n\nFalls irgendetwas ist, bin ich telefonisch für Sie da. Genießen Sie die Berge!\nPavel",
      "registration": "Guten Tag, {JMENO}, hier der versprochene Link zur Registrierung — sie ist in ein paar Minuten erledigt, gern gleich jetzt: {REGISTRACNI_LINK} — damit Sie nach der Ankunft nur noch entspannen. Falls Sie etwas brauchen, bin ich telefonisch für Sie da.\nPavel",
      "deposit": "Guten Tag, {JMENO}, noch eine praktische Sache zu Ihrem Aufenthalt {TERMIN}. Wir erheben eine rückzahlbare Kaution von {KAUCE} CZK — sie ist lediglich eine Sicherheit für den Fall eines Schadens; nach Ihrer Abreise und einer kurzen Kontrolle des Hauses erhalten Sie sie umgehend in voller Höhe zurück. Am einfachsten senden Sie sie per Karte über Revolut: https://revolut.me/pavelhuqh ({KAUCE} CZK). Vielen Dank — wir freuen uns auf Sie!\nPavel",
      "doorcode": "Guten Tag, {JMENO}, das Haus ist bereit und ab 15:00 Uhr ganz Ihres! 🔑 Türcode: {KOD_DVERI} — bitte behalten Sie ihn nur innerhalb Ihrer Gruppe. Gute Anreise — und falls Sie etwas brauchen, bin ich telefonisch für Sie da. Pavel",
      "day2": "Guten Tag, {JMENO}, ich melde mich kurz nach der ersten Nacht — ist alles so, wie es sein soll? 🙂 Falls irgendetwas hakt oder Sie etwas nicht finden konnten, schreiben Sie mir oder rufen Sie einfach direkt an (+420 775 220 785) — ich kümmere mich sofort darum. Genießen Sie die Berge!\nPavel",
      "predeparture": "Guten Tag, {JMENO}, morgen heißt es Abschied nehmen — hoffentlich haben Sie sich bei Rudolf wohlgefühlt! Bevor Sie aufbrechen, bitte ich Sie noch um ein paar Kleinigkeiten (insgesamt etwa 10 Minuten) — um alles andere kümmert sich der Reinigungsservice:\n\n🍽 Geschirr in die Spülmaschine räumen und sie einschalten\n🗑 Müll in die gekennzeichneten Behälter bringen — danke fürs grobe Vorsortieren\n🛏 Bettwäsche abziehen und zusammen mit den Handtüchern am vorgesehenen Platz ablegen\n🧺 ausgeliehene Ausstattung dorthin zurücklegen, wo Sie sie gefunden haben\n🔍 kurz prüfen: Fenster und Türen geschlossen, Geräte ausgeschaltet (im Sommer auch der Pool abgeschlossen)\n\nÜbergeben Sie das Haus bitte bis 10:00 Uhr — um zehn beginnt die Reinigung, damit die nächste Gruppe das Haus um 15:00 Uhr genauso vorbereitet übernimmt, wie Sie es übernommen haben.\n\nVielen Dank, dass Sie das mit uns gemeinsam zu Ende bringen. Gute Reise!\nPavel",
      "reviewBody": "Guten Tag, {JMENO}, heute heißt es Abschied nehmen — und wir hatten Sie sehr gerne bei Rudolf zu Gast. Hoffentlich nehmen Sie aus den Bergen genau das mit, wofür Sie gekommen sind.\n\nNur eine kleine Erinnerung: Übergeben Sie das Haus bitte bis 10:00 Uhr. Wir wollen Sie nicht hinausdrängen, versprochen 🙂 — nur beginnt um zehn der Reinigungsservice, damit um 15:00 Uhr schon die nächsten Gäste begrüßt werden können.\n\nUnd dann noch eine Bitte, die uns wirklich viel bedeutet. Wir sind eine kleine Familienvermietung, und die Bewertungen sind das Wichtigste, wodurch andere Gruppen und Familien Rudolf finden.\n",
      "reviewAirbnb": "\nWenn Sie das Gefühl haben, dass wir die vollen 5 Sterne verdienen, wären wir sehr dankbar, wenn Sie sie uns auf Airbnb geben — das hilft uns mehr, als man denkt. Und sollte irgendetwas, und sei es nur eine Kleinigkeit, nicht hundertprozentig gewesen sein, schreiben Sie es bitte direkt mir hier auf WhatsApp — denn ich kann es noch in Ordnung bringen, eine Bewertung nicht mehr. 🙂\n\nGute Heimreise — und wann immer Sie ins Riesengebirge zurückkehren möchten: Rudolf und wir sind für Sie da!\nPavel",
      "reviewBooking": "\nWenn Sie das Gefühl haben, dass wir die vollen 10 von 10 verdienen, wären wir sehr dankbar, wenn Sie sie uns auf Booking geben — das hilft uns mehr, als man denkt. Und sollte irgendetwas, und sei es nur eine Kleinigkeit, nicht hundertprozentig gewesen sein, schreiben Sie es bitte direkt mir hier auf WhatsApp — denn ich kann es noch in Ordnung bringen, eine Bewertung nicht mehr. 🙂\n\nGute Heimreise — und wann immer Sie ins Riesengebirge zurückkehren möchten: Rudolf und wir sind für Sie da!\nPavel",
      "reviewGoogle": "\nWenn Sie das Gefühl haben, dass wir die volle Bewertung verdienen, wären wir für eine Rezension auf Google sehr dankbar — das hilft uns mehr, als man denkt. Und sollte irgendetwas, und sei es nur eine Kleinigkeit, nicht hundertprozentig gewesen sein, schreiben Sie es bitte direkt mir hier auf WhatsApp — denn ich kann es noch in Ordnung bringen, eine Bewertung nicht mehr. 🙂\n\nGute Heimreise — und wann immer Sie ins Riesengebirge zurückkehren möchten: Rudolf und wir sind für Sie da!\nPavel"
    },
    "pl": {
      "confirm": "Dzień dobry, {JMENO},\n\ndziękujemy za rezerwację — w terminie {TERMIN} Villa Rudolf jest cała dla Państwa i już na Państwa czekamy! 🙂\n\nDo pobytu jeszcze trochę czasu, więc na razie tylko trzy rzeczy, które warto wiedzieć już teraz:\n\n🛂 *Dokumenty — zwłaszcza dla dzieci*\nPrzy przyjeździe rejestrujemy wszystkich gości, także dzieci (ewidencja dla miasta). Prosimy odpowiednio wcześnie sprawdzić, czy **każdy w grupie ma własny dokument podróży — również dzieci**. Wiele rodzin dopiero na miejscu odkrywa, że dzieci w ogóle nie mają paszportu ani dowodu osobistego, a wyrobienie dokumentu potrafi potrwać nawet kilka tygodni. Teraz jest na to idealny moment.\n\n🥾 *Co można u nas robić*\nWycieczki, stoki i wskazówki z mapą znajdą Państwo na https://villarudolf.com/vylety/ — śmiało można już zacząć planować. Przed przyjazdem dostaną Państwo od nas także osobistą stronę z rekomendacjami szytymi na miarę Państwa grupy.\n\n📬 *Co dalej*\nTydzień przed przyjazdem wyślę Państwu jedną dużą wiadomość ze wszystkimi ważnymi informacjami (adres, wejście, dom), a kilka dni później link do wygodnej wcześniejszej rejestracji — na miejscu nie będą już Państwo musieli niczym się zajmować.\n\nGdyby już teraz czegokolwiek Państwo potrzebowali, proszę śmiało napisać lub zadzwonić: +420 775 220 785.\n\nNie możemy się doczekać Państwa wizyty!\nPavel Kubizňák, Villa Rudolf",
      "welcomeCore": "Dzień dobry, {JMENO},\n\nnie możemy się już doczekać Państwa przyjazdu — w terminie {TERMIN} Villa Rudolf będzie tylko dla Państwa! Przesyłam wszystko, co ważne, w jednej wiadomości, żeby mieli ją Państwo zawsze pod ręką.\n\n📍 *Dokąd Państwo jadą*\nVilla Rudolf, Luční 519, Svoboda nad Úpou. Parkują Państwo bezpośrednio na posesji przy domu.\n\n🕒 *Dom jest Państwa od 15:00*\nPrzed południem, po poprzedniej grupie, doprowadzamy go do pełnego blasku — dlatego prosimy nie przyjeżdżać wcześniej, żebyśmy nie musieli witać Państwa z odkurzaczem w ręku. 🙂\n\n🔑 *Wejście bez kluczy*\nDrzwi otworzą Państwo kodem, który wyślę osobno w dniu przyjazdu. Prosimy zachować go wyłącznie w swojej grupie, a wychodząc zawsze sprawdzić, czy drzwi są zamknięte — dom przez cały pobyt jest tylko Państwa.\n\n🏠 *Dom można obejrzeć już teraz*\nWirtualny spacer: https://www.keypano.com/v/569g7v8_96ci86-1770715560.html\nFilm o domu: https://youtu.be/tWCuuovnh2U\n\n📝 *Rejestracja po przyjeździe*\nKod QR znajdą Państwo na lodówce — prosimy wypełnić jak najszybciej za wszystkich, czyli {DOSPELI} dorosłych i {DETI} dzieci. To nie nasz wymysł — miasto prowadzi ewidencję związaną z opłatą miejscową; zajmie to kilka minut i będą to Państwo mieli z głowy.\n\n💳 *Opłata miejscowa (trafia do miasta, nie do nas)*\n25 Kč / 1 € od osoby dorosłej za noc. U Państwa: {DOSPELI} dorosłych × {NOCI} nocy = {CASTKA} Kč. Najprościej kartą przez https://revolut.me/pavelhuqh, ale można też gotówką na miejscu.\n\n🌙 *Wieczory*\nJesteśmy w górskiej dolinie, która niesie dźwięk dalej, niż można by się spodziewać — a sąsiedzi wokół mieszkają tu cały rok, nie tylko w weekendy. Muzyka gra więc u nas tylko wewnątrz domu: głośników na posesji prosimy nie używać wcale, nawet w ciągu dnia. Wieczorem przy ognisku z nawiązką wynagrodzi to trzask drewna i cisza, jakiej w mieście się nie usłyszy. Po dziesiątej wieczorem prosimy zachować na zewnątrz zupełną ciszę — okoliczni mieszkańcy rano wstają do pracy, a latem śpią przy otwartych oknach i hałas niestety szybko skłania ich do telefonu na policję. Wieczór przy ognisku jest piękny także po cichu, sami Państwo zobaczą. W środku mogą Państwo posiedzieć, jak długo tylko zechcą.\n\n📶 *Wi-Fi wszędzie*\nSieć „Rudolf Wi-Fi\", hasło: {WIFI_HESLO}. Zasięg jest w całym domu i na całej posesji — od ogniska przez pergolę aż po plac zabaw.\n\n📞 *Gdyby cokolwiek*\nPavel: +420 775 220 785 — proszę śmiało pisać lub dzwonić, jestem do Państwa dyspozycji.\nSzpital Trutnov: +420 499 866 111 (Maxima Gorkého 77, Trutnov)\nNumer alarmowy: 112 · pogotowie ratunkowe 155 · policja 158 · straż pożarna 150 · straż miejska 156\nPogotowie górskie (Horská služba): +420 602 448 338\n\nCzekamy na Państwa!\nPavel",
      "summer": "☀️ *Lato u Rudolfa — kilka rzeczy dodatkowo*\n\n🏊 *Basen* (czynny mniej więcej od maja do września, podgrzewany do ~27 °C — trochę w zależności od pogody)\nPrzekazujemy go zawsze zamknięty na klucz — klucze są w kuchni, w lewej górnej szafce (patrząc na zabudowę kuchenną — całkiem u góry po lewej). Zamknięty jest ze względu na bezpieczeństwo dzieci: do wody prosimy zawsze wyłącznie pod okiem dorosłego, nigdy same — wystarczy chwila nieuwagi. Po kąpieli prosimy basen znowu zamknąć i przekręcić klucz — pięknie trzyma wtedy temperaturę i czystość. A kieliszki prosimy zostawiać na tarasie — gdyby w basenie stłukło się szkło, musielibyśmy spuścić całą wodę, wyczyścić basen, ponownie go napełnić i podgrzać, a to oznacza dla Państwa dzień lub dłużej bez kąpieli.\n\n🔥 *Ognisko, grill, drewno*\nDuże ognisko, pergola-altana i grille elektryczne czekają na Państwa. Drewno jest pod dwoma świerkami przy parkingu — w wiacie znajdą Państwo siekierę, piłę i szpikulce do opiekania, kłódkę otworzą Państwo kodem *0519*. Jedna uwaga podyktowana troską: kiedy ognisko przeciągnie się do nocy, węgielki rano potrafią być wciąż gorące — prosimy mieć oko na małych ciekawskich, ognisko rano ich przyciąga.\n\n🧖 *Sauna*\nPrzygotowana dla Państwa — instrukcja jest w letnim filmie i bezpośrednio przy saunie. Do środka prosimy wchodzić z ręcznikiem.\n\n🎬 *Wszystko w jednym miejscu w letnim filmie* (powitanie, basen, sauna, drewno, rejestracja):\nhttps://www.youtube.com/watch?v=ksVpDr-P8ic\n\nNiech lato u Rudolfa smakuje Państwu jak najlepiej!\nPavel",
      "winter": "❄️ *Zima u Rudolfa — żeby byli Państwo na stoku wcześniej niż kolejki*\n\n🚌 *Skibus niedaleko domu*\nJak dojść na przystanek, pokazuje krótki film: https://youtu.be/ZX8HJqZ1YBQ\nRozkłady jazdy: https://drive.google.com/drive/folders/1HPJI7XydWwljBq_V19QwJGuBQWn73dZe\nPrzed wyjazdem prosimy sprawdzić aktualny rozkład — w sezonie czasem się zmienia.\n\n🎿 *Narciarnia bezpośrednio w domu*\nNarty i buty pięknie tam przez noc wyschną, a rano ruszają Państwo w suchym i ciepłym sprzęcie.\n\n🧖 *Sauna*\nPo dniu na stoku najlepsze możliwe zwieńczenie. Instrukcję znajdą Państwo w filmie o domu i bezpośrednio przy saunie — wystarczy zabrać ręcznik.\n\nGdyby cokolwiek — jestem pod telefonem. Udanego pobytu w górach!\nPavel",
      "registration": "Dzień dobry, {JMENO}, przesyłam obiecany link do rejestracji — zajmie tylko kilka minut i można ją załatwić już teraz: {REGISTRACNI_LINK} — żeby po przyjeździe mogli Państwo już tylko odpoczywać. Gdyby cokolwiek, jestem pod telefonem.\nPavel",
      "deposit": "Dzień dobry, {JMENO}, jeszcze jedna praktyczna sprawa dotycząca pobytu {TERMIN}. Pobieramy zwrotną kaucję {KAUCE} CZK — to wyłącznie zabezpieczenie na wypadek szkody; po wyjeździe i szybkim sprawdzeniu domu od razu zwracamy ją Państwu w całości. Najwygodniej przesłać ją kartą przez Revolut: https://revolut.me/pavelhuqh ({KAUCE} CZK). Bardzo dziękujemy — czekamy na Państwa!\nPavel",
      "doorcode": "Dzień dobry, {JMENO}, dom jest gotowy i od 15:00 należy tylko do Państwa! 🔑 Kod do drzwi: {KOD_DVERI} — prosimy zachować go wyłącznie w Państwa grupie. Szczęśliwej podróży — a gdyby cokolwiek, jestem pod telefonem. Pavel",
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
    var L = msgLang(booking);
    var lt = L.toUpperCase();
    if (msg.key === 'welcome') {
      return [
        { label: 'Uvítací zpráva (jádro) · ' + lt, text: fill(tplFor(L, 'welcomeCore'), ctx) },
        { label: (ctx.winter ? 'Zimní modul' : 'Letní modul') + ' · ' + lt, text: fill(tplFor(L, ctx.winter ? 'winter' : 'summer'), ctx) }
      ];
    }
    if (msg.key === 'confirm') return [{ text: fill(tplFor(L, 'confirm'), ctx) }];
    if (msg.key === 'registration') {
      return [{ text: fill(tplFor(L, 'registration'), ctx), needsToken: !ctx.regLink }];
    }
    if (msg.key === 'doorcode') return [{ text: fill(tplFor(L, 'doorcode'), ctx), needsCode: !booking.door_code }];
    if (msg.key === 'day2') return [{ text: fill(tplFor(L, 'day2'), ctx) }];
    if (msg.key === 'deposit_charge') return [{ text: fill(tplFor(L, 'deposit'), ctx) }];
    if (msg.key === 'deposit_return') return [{ text: '', ownerTask: true }];
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
      regLink: token ? (location.origin + '/registrace/?t=' + token + '&lang=' + (booking.lang || 'en')) : null,
      winter: isWinter(booking.arrival),
      _reg: reg
    };
  }

  /* ============ Telefon → kód dveří (Yale) ============ */
  // Kód ke dveřím = posledních 5 číslic telefonu (návrh; nikdy nepřepíše uložený kód).
  function phoneDigits(phone) { return String(phone == null ? '' : phone).replace(/\D/g, ''); }
  function suggestDoorCode(phone) { var d = phoneDigits(phone); return d.length >= 5 ? d.slice(-5) : null; }
  function doorCodeFor(b) { return b.door_code || suggestDoorCode(b.phone); }

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
  function loadConflicts() {
    // stav hlídače (vr_conflicts) — pro „✅ vyřešeno" a evidenci. Aktivní překryvy
    // banner detekuje i sám z history.json, takže výpadek RPC banner nezhasne.
    return rpc('vr_admin_conflicts', {}).then(function (res) {
      return (res.data && res.data.ok && res.data.conflicts) ? res.data.conflicts : [];
    }).catch(function () { return []; });
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
        // jen kalendářní pobyty (stejně jako VrConflictWatch) — ruční „Přímá"
        // záznamy bývají nespárovaná kopie feedu, ne dvojitá rezervace.
        if (A.source !== 'calendar' || B.source !== 'calendar') continue;
        if (A.uidh && B.uidh && A.uidh === B.uidh) continue;
        if (!overlapsRange(A, B)) continue;
        var samePlatform = (A.platform || '') === (B.platform || '');
        var bothPaired = !!A.booking && !!B.booking;
        var item = {
          a: A, b: B,
          overlapStart: (A.start > B.start ? A.start : B.start),
          overlapEnd: (A.end < B.end ? A.end : B.end),
          samePlatform: samePlatform,
          known: !!(A.uidh && B.uidh && KNOWN_UIDH.indexOf(A.uidh) >= 0 && KNOWN_UIDH.indexOf(B.uidh) >= 0)
        };
        if (samePlatform && !bothPaired) res.artifacts.push(item);
        else res.overlaps.push(item);
      }
    }
    var calUidh = {}; calendar.forEach(function (c) { if (c.uidh) calUidh[c.uidh] = 1; });
    var horizon = addMonthsISO(today, 12); // feed má 13měsíční cutoff dopředu → jen do 12 měsíců
    bookings.forEach(function (b) {
      if (!b.uidh || calUidh[b.uidh]) return;
      if (b.departure < today) return;
      if (b.arrival > horizon) return;
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

  /* ============ Render: PROBLÉMY (konfigurační díry napříč pobyty) ============ */
  // Pod konfliktním bannerem, nad DNES. Řazeno podle blízkosti příjezdu.
  //  (a) pobyt bez telefonu  (b) příjezd do 7 dnů bez kódu dveří
  //  (c) nespárovaný pobyt z kalendáře  (d) odkaz na aktivní konflikt (jen link na banner)
  function refreshBoards() { renderProblems(); renderToday(); renderStays(); }

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
    stays.forEach(function (s) {
      var b = s.booking;
      if (!b) {
        // (c) nespárovaný pobyt z kalendáře — jen near-term (zrcadlí původní ⚠️ logiku): start v [dnes−14, dnes+14]
        if (s.end >= today && s.start <= addDaysISO(today, 14) && s.start >= addDaysISO(today, -14))
          probs.push({ kind: 'unpaired', stay: s, date: s.start });
        return;
      }
      var hasPhone = !!phoneDigits(b.phone);
      // (a) bez telefonu — v 30denním pipeline (od T−30 začínají zprávy) nebo běžící
      if (!hasPhone && s.end >= today && s.start <= addDaysISO(today, 30)) probs.push({ kind: 'nophone', stay: s, date: s.start });
      // (b) příjezd do 7 dnů bez uloženého kódu dveří
      if (hasPhone && !b.door_code && s.start >= today && daysBetween(today, s.start) <= 7)
        probs.push({ kind: 'nocode', stay: s, date: s.start });
    });
    probs.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    lastProblems = probs;

    // aktivní konflikty — jen odkaz na banner (logika hlídače se neduplikuje)
    var det = lastDetect || detectConflictsClient();
    var activeConfl = (det.overlaps.length + det.vanished.length) > 0;

    panel.hidden = false;
    if (!probs.length && !activeConfl) {
      host.innerHTML = '<div class="prob prob-ok"><span class="prob-ok-i">✓</span> Vše nastaveno — žádné mezery v konfiguraci pobytů.</div>';
      return;
    }
    var html = '';
    probs.forEach(function (p, i) {
      var s = p.stay, b = s.booking;
      if (p.kind === 'unpaired') {
        html += probCard('warn', '⚠️ ' + esc(fmtShort(s.start, s.end)),
          'Pobyt z kalendáře bez kontaktu — doplnit hosta (' + esc(s.platform) + ').', i, 'Doplnit hosta');
      } else if (p.kind === 'nophone') {
        html += probCard('warn', '📞 ' + esc(guestName(b)) + ' — chybí telefon',
          esc(fmtShort(s.start, s.end)) + ' · bez telefonu nejde poslat zprávy ani připravit kód dveří.', i, 'Doplnit');
      } else if (p.kind === 'nocode') {
        html += probCard('soon', '🔑 ' + esc(guestName(b)) + ' — chybí kód dveří',
          'Příjezd za ' + daysBetween(today, s.start) + ' dní (' + esc(fmtShort(s.start, s.end)) + ') — není uložený kód dveří.', i, 'Doplnit kód');
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
        if (p.kind === 'unpaired') openEditor({ stay: p.stay });
        else openDetail(p.stay);
      });
    });
  }

  /* ============ Render: DNES ============ */
  function collectTasks() {
    var today = isoToday();
    var tasks = [];
    stays.forEach(function (s) {
      if (!s.booking) return; // nespárované pobyty řeší sekce „Problémy"
      var b = s.booking;
      var sent = {};
      (b.msglog || []).forEach(function (m) { sent[m.msg_key] = true; });
      // 🔑 Yale: den před příjezdem (a v den příjezdu, pokud nesplněno) — jen když je z čeho kód připravit
      if (!sent.yale_set && doorCodeFor(b) && today >= addDaysISO(b.arrival, -1) && today <= b.arrival) {
        tasks.push({ stay: s, booking: b, yale: true, date: addDaysISO(b.arrival, -1) });
      }
      sequenceFor(b).forEach(function (msg) {
        if (sent[msg.key]) return;
        var d = schedDate(msg, b);
        if (d > today) return; // budoucí
        tasks.push({ stay: s, booking: b, msg: msg, date: d, overdue: d < today });
      });
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
      if (t.yale) {
        // 🔑 Yale připomínka — poloautomat: systém připraví kód, Pavel naklape v Yale Home.
        var by = t.booking, code = doorCodeFor(by);
        row.className = 'task owner';
        row.innerHTML =
          '<div class="task-main"><div class="task-name">' + esc(guestName(by)) + '</div>' +
          '<div class="task-what">🔑 Nastav v appce Yale Home: kód <b>' + esc(code) + '</b>, platnost ' +
            esc(fmtDay(by.arrival)) + ' 15:00 – ' + esc(fmtDay(by.departure)) + ' 10:00</div>' +
          '<span class="task-when today">Yale</span></div>' +
          '<div class="task-actions"></div>';
        var ay = row.querySelector('.task-actions');
        var doneY = document.createElement('button');
        doneY.className = 'btn btn-sm btn-primary'; doneY.textContent = 'Hotovo';
        doneY.onclick = function () {
          doneY.disabled = true;
          rpc('vr_admin_msg_log', { p_booking_id: by.id, p_msg_key: 'yale_set', p_sent: true }).then(function (res) {
            if (res.data && res.data.ok) {
              by.msglog = (by.msglog || []).filter(function (m) { return m.msg_key !== 'yale_set'; });
              by.msglog.push({ msg_key: 'yale_set', sent_at: new Date().toISOString() });
              toast('Yale kód označen jako nastavený.'); refreshBoards();
            } else { doneY.disabled = false; toast('Nepodařilo se uložit.'); }
          }).catch(function () { doneY.disabled = false; toast('Nepodařilo se uložit.'); });
        };
        ay.appendChild(doneY);
        var openY = document.createElement('button');
        openY.className = 'btn btn-sm btn-outline'; openY.textContent = 'Detail';
        openY.onclick = function () { openDetail(t.stay); };
        ay.appendChild(openY);
        wrap.appendChild(row);
        return;
      }
      var b = t.booking, ctx = buildCtx(b);
      var parts = buildParts(t.msg, ctx, b);
      var ownerTask = !!t.msg.ownerTask;
      row.className = 'task' + (t.overdue ? ' overdue' : '') + (ownerTask ? ' owner' : '');
      row.innerHTML =
        '<div class="task-main"><div class="task-name">' + esc(guestName(b)) + '</div>' +
        '<div class="task-what">' + (ownerTask ? '🔁 ' : '') + esc(t.msg.title) + (ownerTask ? '' : ' · ' + esc(msgLang(b).toUpperCase())) + '</div>' +
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
              toast('Označeno jako hotové.'); refreshBoards();
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
      var registrace = location.origin + '/registrace/?t=' + token + '&lang=' + (b.lang || 'en');
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
      '<input id="d-door" maxlength="40" value="' + esc(b.door_code || suggestDoorCode(b.phone) || '') + '" placeholder="např. 1975"></div>' +
      '<button type="button" class="btn btn-primary" id="d-door-save">Uložit</button></div>' +
      (!b.door_code && suggestDoorCode(b.phone) ? '<p class="hint">Návrh: posledních 5 číslic telefonu — uprav podle potřeby a ulož.</p>' : '') + '</div>' +

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
      // překresli detail timeline (stav) + DNES + Problémy
      renderTimeline(currentStay, b, buildCtx(b));
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
    return Promise.all([loadCalendar(), loadBookings(), loadConfig(), loadConflicts()]).then(function (r) {
      calendar = r[0]; bookings = r[1]; adminConfig = r[2] || {}; serverConflicts = r[3] || [];
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
