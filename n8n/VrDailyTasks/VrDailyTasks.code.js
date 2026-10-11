// VrDailyTasks — spočítá dnešní úkoly STEJNOU logikou jako sekce DNES v /sprava/
// (první ozvěna hned / uvítací T−7 / den 2 / odjezd −24 h / ráno odjezdu vs. vr_msglog;
// + 💬 odpověď hosta: kdo váhá a komu se připomenout; + 🔑 Yale připomínka;
// + nespárované/chybějící kontakty do sekce „Problémy");
// + 🛡️ zamrzlý kalendář rezervací a propadající/propadlé předrezervace (od 6. 10. 2026).
// Když je co, vytvoří 1 položku s předmětem + HTML e-mailem (wa.me odkazy v jazyce
// pobytu). Když není nic, vrátí [] → e-mail se neodešle.

const SUPA = 'https://fpknbrzbqpalguajskut.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwa25icnpicXBhbGd1YWpza3V0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDEyMTAsImV4cCI6MjA5Mjg3NzIxMH0.goat1c7Y1YnpTq7_XyMD3LROElkVI6E27f0B3EG8btA';
const CAL_URL = 'https://pavelkubiznak.github.io/villa-booking-calendar/data/history.json';
const VER_URL = 'https://pavelkubiznak.github.io/villa-booking-calendar/data/verified.json'; // ruční ověření majitele: service / unconfirmed / confirmed
const SPRAVA_URL = 'https://villarudolf.com/sprava/';
// Heslo Wi-Fi se sem NEPÍŠE (repo je veřejné) — čte se z vr_admin_config, klíč
// wifi_password, uzlem „Načíst konfiguraci (service-role)“ (jménem uzlu, jako žádosti).
// Když uzel chybí nebo klíč není vyplněný, zůstane v textu viditelně {WIFI_HESLO}:
// e-mail odejde dál, jen připomene, že krok nasazení chybí.
let WIFI = '';
try {
  const cfgItems = $('Načíst konfiguraci (service-role)').all();
  const cfgRaw = (cfgItems.length === 1 && Array.isArray(cfgItems[0].json)) ? cfgItems[0].json : cfgItems.map(i => i.json);
  const cfgRow = cfgRaw.find(r => r && r.k === 'wifi_password');
  WIFI = cfgRow && cfgRow.v ? String(cfgRow.v).trim() : '';
} catch (e) { WIFI = ''; }
const DEPOSIT_CZK = 5000;
const REVOLUT_URL = 'https://revolut.me/pavelhuqh';

/* ---------- datum ---------- */
const MONTH_GEN = ['ledna','února','března','dubna','května','června','července','srpna','září','října','listopadu','prosince'];
function isoToday() {
  const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' });
  return f.format(new Date()); // YYYY-MM-DD (Praha)
}
function parseISO(s){ return new Date(s + 'T00:00:00'); }
function pad(n){ return String(n).padStart(2,'0'); }
function addDaysISO(iso,n){ const d=parseISO(iso); d.setDate(d.getDate()+n); return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function nights(a,b){ return Math.max(0, Math.round((parseISO(b)-parseISO(a))/86400000)); }
function daysBetween(a,b){ return Math.round((parseISO(b)-parseISO(a))/86400000); }
// Měsíce pro {TERMIN} ve zprávách hostům — v jazyce pobytu (jako fmtTermin v sprava.js).
// Bez jazyka česky: tak se termín píše v e-mailu majiteli (konflikty, předrezervace).
const MONTH_BY_LANG = {
  en:['January','February','March','April','May','June','July','August','September','October','November','December'],
  de:['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'],
  pl:['stycznia','lutego','marca','kwietnia','maja','czerwca','lipca','sierpnia','września','października','listopada','grudnia'] };
function fmtTermin(a,b,lang){ const da=parseISO(a),db=parseISO(b); const d1=da.getDate(),m1=da.getMonth(),y1=da.getFullYear(); const d2=db.getDate(),m2=db.getMonth(),y2=db.getFullYear();
  const M=MONTH_BY_LANG[lang]||MONTH_GEN, dot=(lang==='en'||lang==='pl')?'':'.';
  if(y1===y2&&m1===m2) return d1+dot+'–'+d2+dot+' '+M[m2]+' '+y2;
  if(y1===y2) return d1+dot+' '+M[m1]+' – '+d2+dot+' '+M[m2]+' '+y2;
  return d1+dot+' '+M[m1]+' '+y1+' – '+d2+dot+' '+M[m2]+' '+y2; }
function fmtShort(a,b){ const da=parseISO(a),db=parseISO(b); return da.getDate()+'. '+(da.getMonth()+1)+'. – '+db.getDate()+'. '+(db.getMonth()+1)+'. '+db.getFullYear(); }
function fmtDay(iso){ const d=parseISO(iso); return d.getDate()+'. '+(d.getMonth()+1)+'.'; }
function isWinter(iso){ const d=parseISO(iso),m=d.getMonth()+1,day=d.getDate(); return (m===1||m===2||m===3)||(m===11||m===12)||(m===10&&day>=15); }

/* ---------- telefon → kód dveří (Yale) ---------- */
function phoneDigits(phone){ return String(phone==null?'':phone).replace(/\D/g,''); }
function suggestDoorCode(phone){ const d=phoneDigits(phone); return d.length>=5?d.slice(-5):null; }
function doorCodeFor(b){ return b.door_code||suggestDoorCode(b.phone); }

/* ---------- šablony 4 jazyky (zrcadlí /sprava/sprava.js) ---------- */
// TPL, NEWS a SEQUENCE musí být do písmene stejné jako v sprava.js — hlídá to
// tools/test-zpravy.mjs. Od 11. 10. 2026: 5 kroků místo 7, němčina tyká („ihr/euch").
const TPL = {
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
function msgLang(b){ return (b && b.lang && TPL[b.lang]) ? b.lang : 'en'; }
function tplFor(lang,key){ return (TPL[lang]||TPL.en)[key]; }
function reviewVariant(platform,lang){ const T=TPL[lang]||TPL.en; const p=(platform||'').toLowerCase();
  if(p.indexOf('airbnb')>=0) return {label:'Airbnb (5★)', text:T.reviewBody+T.reviewAirbnb};
  if(p.indexOf('booking')>=0) return {label:'Booking (10/10)', text:T.reviewBody+T.reviewBooking};
  return {label:'Google', text:T.reviewBody+T.reviewGoogle}; }
// Novinka do první ozvěny — JEDNA konstanta, jen pro příjezdy v období od–do (viz sprava.js).
const NEWS = {
  from: '2026-12-19', to: '2027-12-31',
  text: {
    cs: 'Mimo sezónu teď dům dáváme dohromady, aby byl ještě lepší než dosud. Největší novinka je nově upravené schodiště, bude to opravdu pěkné.',
    en: "We're using the off-season to get the house into even better shape. The biggest change is the newly redone staircase – it's going to look really good.",
    de: 'In der Nebensaison bringen wir das Haus gerade auf Vordermann, damit es noch schöner wird. Die größte Neuerung ist die neu gestaltete Treppe, das wird richtig schön.',
    pl: 'Poza sezonem doprowadzamy dom do jeszcze lepszego stanu. Największa nowość to odnowione schody – będzie naprawdę ładnie.'
  }
};
function newsFor(b,lang){ return (b.arrival>=NEWS.from && b.arrival<=NEWS.to) ? (NEWS.text[lang]||NEWS.text.en) : ''; }
function fill(tpl,ctx){ return tpl
  .replace(/\{POPLATEK\}/g,ctx.poplatek||'').replace(/\{NOVINKA\}/g,ctx.novinka?ctx.novinka+'\n\n':'') // první: poplatek nese {DOSPELI}, {NOCI}, {CASTKA}
  .replace(/\{JMENO\}/g,ctx.jmeno).replace(/\{TERMIN\}/g,ctx.termin)
  .replace(/\{DOSPELI\}/g,ctx.dospeli).replace(/\{DETI\}/g,ctx.deti).replace(/\{NOCI\}/g,ctx.noci)
  .replace(/\{CASTKA\}/g,ctx.castka).replace(/\{KOD_DVERI\}/g,ctx.kod).replace(/\{WIFI_HESLO\}/g,()=>WIFI||'{WIFI_HESLO}')
  .replace(/\{KAUCE\}/g,DEPOSIT_CZK.toLocaleString('cs-CZ'))
  .replace(/\{REGISTRACNI_LINK\}/g,ctx.regLink||'{REGISTRACNI_LINK}')
  .replace(/\{PRUVODCE_LINK\}/g,ctx.guideLink||'{PRUVODCE_LINK}'); }

/* ---------- sekvence ---------- */
// asap = krok bez data: na řadě hned, jak má pobyt hosta s telefonem; FIRST_MIN_DAYS
// před příjezdem už nemá smysl (jde rovnou uvítací zpráva). legacy = starý klíč ve
// vr_msglog, který krok taky splní. Staré „registration" a „doorcode" už krok nemají.
const FIRST_MIN_DAYS = 14;
const SEQUENCE=[
  {key:'first',title:'První ozvěna',asap:true,when:'hned',legacy:'confirm'},
  {key:'welcome',title:'Uvítací zpráva (kód, registrace, Wi-Fi)',from:'arrival',off:-7,when:'T−7'},
  {key:'day2',title:'Kontrola po první noci',from:'arrival',off:1,when:'den 2'},
  {key:'predeparture',title:'Prosby před odjezdem',from:'departure',off:-1,when:'odjezd −24 h'},
  {key:'review',title:'Poděkování + recenze',from:'departure',off:0,when:'ráno odjezdu'}
];
const DEPOSIT_STEPS=[
  {key:'deposit_charge',title:'Kauce — výběr ('+DEPOSIT_CZK.toLocaleString('cs-CZ')+' Kč)',from:'arrival',off:-7,when:'T−7 / samostatně',deposit:'charge',after:'welcome'},
  {key:'deposit_return',title:'Vrátit kauci ('+DEPOSIT_CZK.toLocaleString('cs-CZ')+' Kč)',from:'departure',off:1,when:'po odjezdu',deposit:'return',ownerTask:true,after:'review'}
];
// Doplatková faktura u přímých rezervací na dvě splátky. Storno ve smlouvě (§ 7)
// přeskočí 50 % na 59. dni před příjezdem; splatnost 2. splátky je T−65, upomínka
// tedy týden před ní (T−72). Jen pro majitele — hostovi odsud nic nechodí.
const BALANCE_STEPS=[
  {key:'balance_invoice',title:'Vystavit doplatkovou fakturu (2. splátka)',from:'arrival',off:-72,when:'T−72 · týden před splatností',ownerTask:true,before:'first'}
];
function depositEnabled(b){ return (b.msglog||[]).some(m=>m.msg_key==='deposit_enabled'); }
// Platformy si platbu řeší samy; dvě splátky dává jen přímá rezervace.
function isDirect(b){ return (b.platform||'')==='Přímá'; }
function balanceEnabled(b){ return isDirect(b); }
function sequenceFor(b){ const dep=depositEnabled(b), bal=balanceEnabled(b);
  if(!dep&&!bal) return SEQUENCE.slice(); const out=[];
  SEQUENCE.forEach(msg=>{
    if(bal) BALANCE_STEPS.forEach(x=>{ if(x.before===msg.key) out.push(x); });
    out.push(msg);
    if(dep) DEPOSIT_STEPS.forEach(d=>{ if(d.after===msg.key) out.push(d); });
  }); return out; }
function schedDate(msg,b){ if(msg.asap) return isoToday(); return addDaysISO(msg.from==='departure'?b.departure:b.arrival, msg.off); }
// Co je ve vr_msglog: { klíč: sent_at }. Starý klíč kroku (legacy) se počítá taky.
function sentMap(b){ const sent={}; (b.msglog||[]).forEach(m=>{ sent[m.msg_key]=m.sent_at||true; });
  SEQUENCE.forEach(msg=>{ if(msg.legacy && sent[msg.legacy] && !sent[msg.key]) sent[msg.key]=sent[msg.legacy]; }); return sent; }
function hasLog(b,key){ return (b.msglog||[]).some(m=>m.msg_key===key); }
// Poslední den, kdy má krok ještě smysl (stejně jako lastUsefulDay v sprava.js).
function lastUsefulDay(msg,b){
  if(msg.from==='departure') return addDaysISO(b.departure, msg.off<0?-1:3);
  return msg.off<0 ? b.arrival : addDaysISO(b.arrival, msg.off+2); }
// 'sent' | 'future' | 'due' | 'overdue' | 'stale' (už nemá smysl — není to dluh)
function stepState(msg,b,sent,today){
  if(sent[msg.key]) return 'sent';
  if(msg.asap) return daysBetween(today,b.arrival)>FIRST_MIN_DAYS ? 'due' : 'stale';
  const d=schedDate(msg,b);
  if(d>today) return 'future';
  if(!(msg.ownerTask && msg.from==='departure') && today>lastUsefulDay(msg,b)) return 'stale';
  return d<today ? 'overdue' : 'due'; }

function guestName(b){ const parts=[b.first_name,b.last_name].filter(x=>x&&String(x).trim()); return parts.length?parts.join(' '):'milí hosté'; }
function personStats(persons, arrival){ let reg=persons.length,adults=0,children=0;
  persons.forEach(p=>{ const isAdult=!p.birth_date||(daysBetween(p.birth_date,arrival)>=18*365.25-1); if(isAdult)adults++; else children++; });
  return {registered:reg,adults:adults,children:children}; }
// Je počet dospělých opravdu vyplněný? DB si prázdné pole doplní dvojkou, takže „2 dospělí,
// žádné dítě" bez značky guests_ok je podpis NEVYPLNĚNÉHO pobytu (viz adultsKnown v sprava.js).
function adultsKnown(b){
  if((b.vr_persons||[]).length>0 || hasLog(b,'guests_ok')) return true;
  if(b.adults==null || b.adults<=0) return false;
  return b.adults!==2 || (b.children||[]).length>0; }
function buildCtx(b){ const noci=nights(b.arrival,b.departure); const persons=b.vr_persons||[]; const stat=personStats(persons,b.arrival);
  const reg=stat.registered>0; const dospeli=reg?stat.adults:(adultsKnown(b)?b.adults:null); const deti=reg?stat.children:((b.children||[]).length);
  const L=msgLang(b), T=TPL[L];
  return { jmeno:guestName(b), termin:fmtTermin(b.arrival,b.departure,L), dospeli:dospeli, deti:deti, noci:noci,
    castka:dospeli==null?null:dospeli*noci*25,
    // sazba + (částka | „spočítáme podle registrace") + (Revolut | přímý prodej: z kauce podle smlouvy)
    poplatek:T.feeRate+(dospeli?T.feeAmount:T.feeUnknown)+(isDirect(b)?T.feeDeposit:T.feePay),
    novinka:newsFor(b,L), kod:doorCodeFor(b)||'{KOD_DVERI}',
    regLink:null, guideLink:null, winter:isWinter(b.arrival) }; } // odkazy s tokenem doplní /sprava/
function buildParts(msg,ctx,b){
  const L=msgLang(b), lt=L.toUpperCase();
  // uvítací zpráva nese odkazy s tokenem hosta → server-side ji složit nejde, posílá se ze /sprava/
  if(msg.key==='welcome') return [{label:'Uvítací zpráva (jádro) · '+lt,text:fill(tplFor(L,'welcomeCore'),ctx),needsToken:true,needsCode:!doorCodeFor(b)},{label:(ctx.winter?'Zimní modul':'Letní modul')+' · '+lt,text:fill(tplFor(L,ctx.winter?'winter':'summer'),ctx)}];
  if(msg.key==='first') return [{text:fill(tplFor(L,'first'),ctx)}];
  if(msg.key==='nudge') return [{text:fill(tplFor(L,'nudge'),ctx)}];
  if(msg.key==='deposit_charge') return [{text:fill(tplFor(L,'deposit'),ctx)}];
  if(msg.key==='deposit_return') return [{text:'',ownerTask:true}];
  if(msg.key==='balance_invoice') return [{text:'',ownerTask:true}];
  if(msg.key==='day2') return [{text:fill(tplFor(L,'day2'),ctx)}];
  if(msg.key==='predeparture') return [{text:fill(tplFor(L,'predeparture'),ctx)}];
  if(msg.key==='review'){ const rv=reviewVariant(b.platform,L); return [{text:fill(rv.text,ctx),variantLabel:rv.label}]; }
  return [{text:''}];
}
/* Telefon → mezinárodní tvar. Shodná logika s /sprava/ (normPhone v sprava.js) —
   když se mění tady, musí se změnit i tam. Dřív se hádalo „9 číslic = Česko“ a
   německé číslo psané národně (0171…) dalo mrtvý odkaz wa.me/01711234567.
   Položka = [předvolba, min, max] číslic národní části; delší předvolby první. */
const DIAL=[['351',9,9],['380',9,9],['385',8,9],['386',8,8],['420',9,9],['421',9,9],
  ['31',9,9],['32',8,9],['33',9,9],['34',9,9],['36',8,9],['39',6,11],['41',9,9],['43',8,13],
  ['44',9,10],['45',8,8],['46',7,13],['47',8,8],['48',9,9],['49',6,11],['1',10,10]];
const LANG_CC={cs:'420',de:'49',pl:'48'}; // 'en' schválně chybí — nedá se uhodnout
function dialInfo(d){ for(const x of DIAL) if(d.indexOf(x[0])===0) return x; return null; }
function dialFits(x,d){ const n=d.length-x[0].length; return n>=x[1]&&n<=x[2]; }
// Vrací holé číslice v mezinárodním tvaru, nebo '' když číslo nejde použít.
function intlPhone(phone,lang){
  const s=String(phone==null?'':phone).trim(); if(!s) return '';
  let intl=/^\+/.test(s), d=s.replace(/\D/g,''); if(!d) return '';
  if(!intl && d.indexOf('00')===0){ d=d.slice(2); intl=true; }
  if(!intl){
    const home=LANG_CC[lang]||null, x=dialInfo(d);
    if(d.charAt(0)==='0'){ if(!home) return ''; d=home+d.replace(/^0+/,''); } // národní nula se zahazuje
    else if(x && dialFits(x,d)){ /* předvolba tam je, jen bez plusu */ }
    else if(home){ d=home+d; }
    else return '';
  }
  if(d.length<8||d.length>15) return '';
  const fin=dialInfo(d);
  return (fin && !dialFits(fin,d)) ? '' : d;
}
function waPhone(b){ return intlPhone(b&&b.phone, b&&b.lang); }
function waLink(b,text){ return 'https://wa.me/'+waPhone(b)+'?text='+encodeURIComponent(text); }
function phoneUsable(b){ return !!waPhone(b); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

/* ---------- hlídač konfliktů (shrnutí; okamžitý e-mail posílá VrConflictWatch) ---------- */
const KNOWN_UIDH = ['44f67225fb4ecfb9','0dcf556ecb298ab7']; // známý červencový konflikt (majitel řeší)
function addMonthsISO(iso,m){ const d=parseISO(iso); d.setMonth(d.getMonth()+m);
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function overlapsRange(a,b){ return a.start<b.end && b.start<a.end; } // [start,end)
// Stornované na platformě: uidh, které kalendář nese JEN jako nepotvrzený záznam
// (stale, pobyt teprve má proběhnout). history.json si ho pamatuje dál, takže bez
// tohohle by host zůstal jako ruční pobyt s úkoly a „zmizel z kalendáře" by nevyskočil.
// Stejné pravidlo jako cancelledOnPlatform() v sprava.js a VrConflictWatch.detect.js.
function cancelledOnPlatform(calendar, today){
  const ghost={}, live={};
  calendar.forEach(c=>{ if(!c.uidh) return; if(c.stale===true && c.end>today) ghost[c.uidh]=1; else live[c.uidh]=1; });
  const res={}; Object.keys(ghost).forEach(u=>{ if(!live[u]) res[u]=true; }); return res;
}
// Stejná eskalační logika jako VrConflictWatch: různá platforma NEBO oba se hostem
// = reálný konflikt; stejná platforma bez hostů = artefakt (přeskočit).
function detectConflicts(stays, calendar, bookings, today){
  const overlaps=[], vanished=[];
  for(let i=0;i<stays.length;i++){ for(let j=i+1;j<stays.length;j++){
    const A=stays[i], B=stays[j];
    // kalendář + předrezervace, které v něm ještě nejsou; ruční „Přímá" bývají
    // nespárované kopie feedu, ne dvojitá rezervace (stejně jako sprava.js)
    // Výjimka: ruční rezervace z jiné platformy než „Přímá" proti předrezervaci —
    // kopií přímého prodeje být nemůže a nic jiného ji nezachytí (nemá uidh).
    if(A.source==='manual' || B.source==='manual'){
      if(A.source==='manual' && B.source==='manual') continue;
      const M=A.source==='manual'?A:B, O=M===A?B:A;
      if(!O.hold || (M.platform||'Přímá')==='Přímá') continue;
    }
    if(A.uidh && B.uidh && A.uidh===B.uidh) continue;
    if(!overlapsRange(A,B)) continue;
    const samePlatform=(A.platform||'')===(B.platform||'');
    const bothPaired=!!A.booking && !!B.booking;
    // u předrezervace je vystavená faktura — „Přímá" × „Přímá" není artefakt kalendáře
    if(samePlatform && !bothPaired && !A.hold && !B.hold) continue;
    overlaps.push({ a:A, b:B,
      os:(A.start>B.start?A.start:B.start), oe:(A.end<B.end?A.end:B.end),
      known:!!(A.uidh&&B.uidh&&KNOWN_UIDH.indexOf(A.uidh)>=0&&KNOWN_UIDH.indexOf(B.uidh)>=0) });
  }}
  const cancelled=cancelledOnPlatform(calendar, today);
  const cal={}; calendar.forEach(c=>{ if(c.uidh && !cancelled[c.uidh]) cal[c.uidh]=1; });
  // host předrezervace je pod jejím řádkem — jeho starý uidh (zahozená ozvěna) nic neznamená
  const held={}; stays.forEach(s=>{ if(s.hold && s.booking) held[s.booking.id]=1; });
  const horizon=addMonthsISO(today,12);
  bookings.forEach(b=>{ if(!b.uidh||cal[b.uidh]||held[b.id]) return; if(b.departure<today) return;
    if(b.arrival>horizon && !cancelled[b.uidh]) return; // horizont jen pro pobyt, který ve feedu nikdy nebyl
    vanished.push({ booking:b }); });
  return { overlaps, vanished };
}

/* ---------- hlavní běh ---------- */
const items = $input.all();
let bookings = [];
if (items.length === 1 && Array.isArray(items[0].json)) bookings = items[0].json;
else bookings = items.map(i => i.json).filter(x => x && x.id);
// PostgREST vrací vnořený log jako vr_msglog → sjednotit na b.msglog (tvar z RPC v /sprava/)
bookings.forEach(b => { b.msglog = b.vr_msglog || b.msglog || []; });

let calendar = [];
try { const c = await this.helpers.httpRequest({ url: CAL_URL + '?_=' + Date.now(), json: true }); if (Array.isArray(c)) calendar = c; } catch(e) {}
let verified = {};
try { const v = await this.helpers.httpRequest({ url: VER_URL + '?_=' + Date.now(), json: true }); if (v && v.stays && typeof v.stays === 'object') verified = v.stays; } catch(e) {}
const verifiedStatus = s => { const e = verified[s.start + '..' + s.end]; return (e && e.status) || null; };

const today = isoToday();
const cutoff = addDaysISO(today, -14);
const byUidh = {}, byId = {}; bookings.forEach(b => { if (b.uidh) byUidh[b.uidh] = b; byId[b.id] = b; });
const cancelledUidh = cancelledOnPlatform(calendar, today);

/* ---------- předrezervace (vr_holds) ---------- */
// Přímý prodej je v history.json pod uidh SVÉ předrezervace (vr_hold_uidh), ne pod
// uidh pobytu — pobyt z /smlouvy/ nebo z „+ Předrezervace" ho má prázdný. Bez
// předrezervací by kalendářní řádek zůstal bez hosta (→ „nespárovaný pobyt") a host
// by šel podruhé jako ruční pobyt. Čte se JMÉNEM uzlu, jako žádosti a UbyPort.
// Chybějící uzel / chyba dotazu = prázdný seznam: párování jede jako dřív (jen přes
// uidh) a denní e-mail se kvůli tomu nezastaví.
let holds = [];
try {
  const hItems = $('Načíst předrezervace (service-role)').all();
  const raw = (hItems.length === 1 && Array.isArray(hItems[0].json))
    ? hItems[0].json
    : hItems.map(i => i.json);
  holds = raw.filter(h => h && h.id && h.arrival && h.departure);
} catch (e) { holds = []; }
// uidh = vr_hold_uidh(id) = sha256('vr-hold:' + id)[:16] — tabulka ho jako sloupec
// nemá a require('crypto') v Code node nemusí být povolený, proto vlastní SHA-256.
// Vstup je vždy ASCII (uuid), víc tahle implementace neumí.
function sha256hex(ascii){
  const rot=(v,n)=>(v>>>n)|(v<<(32-n)), frac=x=>((x-Math.floor(x))*4294967296)|0;
  const H=[], K=[];
  for(let n=2,c=0;c<64;n++){ let prime=true; for(let d=2;d*d<=n;d++) if(n%d===0){ prime=false; break; }
    if(!prime) continue; if(c<8) H[c]=frac(Math.sqrt(n)); K[c++]=frac(Math.cbrt(n)); }
  const bytes=[]; for(let i=0;i<ascii.length;i++) bytes.push(ascii.charCodeAt(i)&0xff);
  const bits=bytes.length*8; bytes.push(0x80); while(bytes.length%64!==56) bytes.push(0);
  bytes.push(0,0,0,0,(bits>>>24)&0xff,(bits>>>16)&0xff,(bits>>>8)&0xff,bits&0xff);
  for(let o=0;o<bytes.length;o+=64){ const W=[];
    for(let i=0;i<16;i++) W[i]=(bytes[o+4*i]<<24)|(bytes[o+4*i+1]<<16)|(bytes[o+4*i+2]<<8)|bytes[o+4*i+3];
    for(let i=16;i<64;i++){ const x=W[i-15], y=W[i-2];
      W[i]=(W[i-16]+(rot(x,7)^rot(x,18)^(x>>>3))+W[i-7]+(rot(y,17)^rot(y,19)^(y>>>10)))|0; }
    let [a,b,c,d,e,f,g,h]=H;
    for(let i=0;i<64;i++){
      const t1=(h+(rot(e,6)^rot(e,11)^rot(e,25))+((e&f)^(~e&g))+K[i]+W[i])|0;
      const t2=((rot(a,2)^rot(a,13)^rot(a,22))+((a&b)^(a&c)^(b&c)))|0;
      h=g; g=f; f=e; e=(d+t1)|0; d=c; c=b; b=a; a=(t1+t2)|0; }
    H[0]=(H[0]+a)|0; H[1]=(H[1]+b)|0; H[2]=(H[2]+c)|0; H[3]=(H[3]+d)|0;
    H[4]=(H[4]+e)|0; H[5]=(H[5]+f)|0; H[6]=(H[6]+g)|0; H[7]=(H[7]+h)|0; }
  return H.map(v=>(v>>>0).toString(16).padStart(8,'0')).join('');
}
holds.forEach(h => { h.uidh = sha256hex('vr-hold:' + String(h.id).toLowerCase()).slice(0,16); });
const holdOpen = h => h.status === 'hold' || h.status === 'confirmed';
const holdExpired = h => h.status === 'hold' && h.hold_until && h.hold_until < today;

// Host k předrezervaci — stejně jako bookingOfHold() v sprava.js: primárně vazba
// booking_id, jinak JEDINÝ ruční pobyt „Přímá" bez uidh na přesně tentýž termín.
// Pobyt musí nést TÝŽ termín jako předrezervace (po přesunu jen jedné z nich radši
// dva řádky než úkoly podle starého data). Pobyt, na který už odkazuje nějaká
// předrezervace, patří jí; dvě nepropojené předrezervace na tentýž termín = nehádat.
const linkedToHold = {}, unlinkedHoldsBySpan = {};
holds.forEach(h => {
  if (h.booking_id) { linkedToHold[h.booking_id] = true; return; }
  if (!holdOpen(h) || holdExpired(h)) return;
  const k = h.arrival + '|' + h.departure;
  unlinkedHoldsBySpan[k] = (unlinkedHoldsBySpan[k] || 0) + 1;
});
function bookingOfHold(h){
  if (!h) return null;
  const sameSpan = b => b && b.arrival === h.arrival && b.departure === h.departure;
  if (h.booking_id) { const lb = byId[h.booking_id]; return sameSpan(lb) ? lb : null; }
  if ((unlinkedHoldsBySpan[h.arrival + '|' + h.departure] || 0) > 1) return null;
  const same = bookings.filter(b => !b.uidh && !linkedToHold[b.id] && (b.platform || 'Přímá') === 'Přímá' && sameSpan(b));
  return same.length === 1 ? same[0] : null;
}
const holdByUidh = {}, holdBySpan = {}, usedHoldIds = {};
holds.forEach(h => { if (!holdOpen(h) || holdExpired(h)) return;
  holdByUidh[h.uidh] = h; holdBySpan[h.arrival + '|' + h.departure] = h; });
// Host, kterého si živá předrezervace drží (týž termín). Přesunou-li se oba a kalendář
// nese pod starým platformním uidh pobytu ještě starý termín, hosta si nevezme ten řádek.
const heldBooking = {};
holds.forEach(h => { if (!holdOpen(h) || holdExpired(h)) return; const hb = bookingOfHold(h); if (hb) heldBooking[hb.id] = true; });
// Které přímé prodeje kalendář už nese pod vlastním uidh — i s termínem, protože
// přesunutá předrezervace má pod tímtéž uidh do příštího běhu Action staré datum.
const calUidh = {}; calendar.forEach(c => { if (c.uidh) calUidh[c.uidh + '|' + c.start + '|' + c.end] = true; });
// Záznam z feedu je ozvěnou předrezervace, jen když nemá vlastního hosta (nebo je to
// host té předrezervace). Rezervace se spárovaným hostem na tentýž termín je druhý
// nárok — sloučit ji s předrezervací by dvojitou rezervaci schovalo.
function echoOfHold(c, h){ const cb = byUidh[c.uidh]; if (!cb) return true; const hb = bookingOfHold(h); return !!hb && hb.id === cb.id; }

// sloučené pobyty (kalendář + předrezervace + ruční), stejně jako buildStays()
const stays = []; const usedIds = {};
calendar.forEach(c => { if (c.end < cutoff) return;
  // Nepotvrzený záznam (duch) = ve feedu už není, ale pobyt teprve má proběhnout —
  // propadlá předrezervace nebo storno. Do úkolů ani do hlídače překryvů nepatří.
  // POZOR na `end > today`: feed nese jen dnešek a budoucnost, takže KAŽDÝ proběhlý
  // pobyt je stale; bez té podmínky by zmizel celý archiv.
  // Stejné pravidlo jako sprava.js (buildStays) a VrConflictWatch.detect.js.
  if (c.stale === true && c.end > today) return;
  let h = holdByUidh[c.uidh] || null;
  // přesunutá předrezervace: starý termín pod jejím uidh už nic nedrží (krok 2 ji vezme s novým)
  if (h && (h.arrival !== c.start || h.departure !== c.end)) return;
  if (!h) {
    let hs = holdBySpan[c.start + '|' + c.end] || null;
    if (hs && !echoOfHold(c, hs)) hs = null; // vlastní host = samostatná rezervace
    // Ozvěna přímého prodeje (blok z data/out/*.ics nebo ruční blokace se shodným
    // termínem), který má v kalendáři vlastní řádek → ten stačí. Jinak by šel dvakrát
    // a hlídač by z něj udělal konflikt sám se sebou.
    if (hs && calUidh[hs.uidh + '|' + hs.arrival + '|' + hs.departure]) return;
    h = (hs && !usedHoldIds[hs.id]) ? hs : null; // přímý prodej v kalendáři ještě není → spárovat s blokací
  }
  if (h) usedHoldIds[h.id] = true;
  let b = byUidh[c.uidh] || null;
  if (b && usedIds[b.id]) b = null; // host patří jen jednomu řádku
  if (b && heldBooking[b.id] && (b.arrival !== c.start || b.departure !== c.end)) b = null;
  if (!b && h) { const hb = bookingOfHold(h); if (hb && !usedIds[hb.id]) b = hb; }
  if (b) usedIds[b.id] = true;
  stays.push({ source:'calendar', uidh:c.uidh, start:c.start, end:c.end, platform:c.platform, booking:b, hold:h }); });
// předrezervace, které v kalendáři ještě nejsou (Action po 3 h) — PŘED ručními pobyty,
// jinak by se jejich host přidal ještě jednou jako ruční pobyt
holds.forEach(h => { if (usedHoldIds[h.id] || !holdOpen(h) || holdExpired(h) || h.departure < cutoff) return;
  let b = bookingOfHold(h); if (b && usedIds[b.id]) b = null; // host patří jen jednomu řádku
  if (b) usedIds[b.id] = true;
  stays.push({ source:'hold', uidh:h.uidh, start:h.arrival, end:h.departure, platform:'Přímá', booking:b, hold:h }); });
bookings.forEach(b => { if (usedIds[b.id]) return; if (b.departure < cutoff) return;
  if (b.uidh && cancelledUidh[b.uidh]) return; // storno na platformě → jen sekce „zmizel z kalendáře", žádné zprávy
  stays.push({ source:'manual', uidh:b.uidh||null, start:b.arrival, end:b.departure, platform:b.platform||'Přímá', booking:b, hold:null }); });
stays.sort((x,y)=> x.start<y.start?-1:x.start>y.start?1:0);

// hlídač konfliktů (nevyřešené — jen shrnutí; detailní e-mail už poslal VrConflictWatch)
const conflicts = detectConflicts(stays, calendar, bookings, today);
const hasConflicts = conflicts.overlaps.length > 0 || conflicts.vanished.length > 0;

/* ---------- hlídač zamrzlého kalendáře rezervací ---------- */
// history.json píše GitHub Action každé ~3 h a každý zapisující běh razítkuje lastSeen
// živých pobytů i přímých prodejů datem běhu (UTC). Nejnovější lastSeen starší než
// včerejšek = kalendář nezapisuje. Přesně tak 28. 9.–6. 10. 2026 zůstal zapnutý zkušební
// běh (CALENDAR_DRY_RUN): běhy zelené, nic se nezapsalo — úklid, /sprava/ i blokace
// přímých prodejů na platformách stály 8 dní a nikdo to nevěděl. Práh je včerejšek, ne
// dnešek: cron GitHubu se zpožďuje o hodiny, ranní e-mail ještě nemusí mít dnešní běh.
// Bez jediného budoucího záznamu nemá běh co orazítkovat a lastSeen nic neříká — pak
// se zamrznutí neposuzuje, jinak by to byl planý poplach každý den (Codex na #33).
// Proti zamrzlému souboru to nevadí: ten budoucí záznamy má, jen je přestal obnovovat.
const calLastSeen = calendar.reduce((m, c) => (c && c.lastSeen && c.lastSeen > m) ? c.lastSeen : m, '');
const calRefreshable = calendar.some(c => c && c.end > today && c.stale !== true); // zrušený budoucí řádek (stale) běh neobnoví (Codex na #33)
const calFrozen = !calendar.length ? { why: 'nenačetl' }
  : (calRefreshable && calLastSeen < addDaysISO(today, -1) ? { why: 'stojí', since: calLastSeen } : null);

/* ---------- předrezervace, které propadají / propadly ---------- */
// Propadlou předrezervaci vr_public_holds() nevrátí → kalendář ji pustí → termín se
// uvolní na VŠECH kanálech. Je to záměr (nezaplaceno = volno), ale nesmí se to stát
// potichu: Sabáčková 2026 měla hold do 25. 9., zaplatila 6. 10. a týden 21.–28. 8. 2027
// byl mezitím ~10 dní k mání na Airbnb a FeWo. Hlásí se 3 dny předem a 14 dní poté —
// rozhodnutí (potvrdit platbu / prodloužit / nechat propadnout) je na majiteli.
const holdAlerts = [];
holds.forEach(h => {
  if (h.status !== 'hold' || !h.hold_until || h.departure <= today) return;
  if (h.hold_until >= today && h.hold_until <= addDaysISO(today, 3)) holdAlerts.push({ kind: 'expiring', hold: h });
  else if (h.hold_until < today && h.hold_until >= addDaysISO(today, -14)) holdAlerts.push({ kind: 'expired', hold: h });
});
holdAlerts.sort((a, b) => a.hold.hold_until < b.hold.hold_until ? -1 : a.hold.hold_until > b.hold.hold_until ? 1 : 0);
const hasSafety = !!calFrozen || holdAlerts.length > 0;

// collectTasks() — dnešní/po termínu zprávy (v jazyce pobytu) + 🔑 Yale připomínka
// + 💬 odpověď hosta. Stejná pravidla jako collectTasks() v sprava.js:
//  • krok, který už nedává smysl (stale), není dluh — do e-mailu jde jen jejich počet,
//  • „váhá" (reply_risk) se hlásí každý den, dokud pobyt nezačne nebo se stav nezmění,
//  • kdo NUDGE_DAYS dní po první ozvěně mlčí, tomu se připomenout (do týdne před příjezdem).
const NUDGE_DAYS = 10;
function isoDateOf(ts){ const d=new Date(ts); if(isNaN(d)) return null;
  return new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Prague',year:'numeric',month:'2-digit',day:'2-digit'}).format(d); }
function silentDays(b,sent){ if(!sent.first) return null;
  const from=[sent.first,sent.reply_nudge].map(ts=>typeof ts==='string'?isoDateOf(ts):null).filter(Boolean).sort().pop();
  return from ? daysBetween(from,today) : null; }
const tasks = []; let staleCount = 0;
stays.forEach(s => {
  if (!s.booking) return; // → Problémy
  const b = s.booking; const sent = sentMap(b);
  // 🔑 Yale: den před příjezdem (a v den příjezdu, pokud nesplněno), jen když je z čeho kód připravit
  if (!sent.yale_set && doorCodeFor(b) && today >= addDaysISO(b.arrival,-1) && today <= b.arrival)
    tasks.push({ stay:s, booking:b, yale:true, date: addDaysISO(b.arrival,-1) });
  sequenceFor(b).forEach(msg => { const st = stepState(msg,b,sent,today);
    if (st==='sent' || st==='future') return;
    if (!msg.ownerTask && !phoneUsable(b)) return; // bez použitelného telefonu → řeší Problémy
    if (st==='stale') { if (!sent['skip_'+msg.key]) staleCount++; return; }
    tasks.push({ stay:s, booking:b, msg:msg, date:schedDate(msg,b), overdue:st==='overdue' }); });
  if (hasLog(b,'reply_ok')) return;
  if (hasLog(b,'reply_risk')) { if (b.arrival > today) tasks.push({ stay:s, booking:b, risk:true, date:'' }); return; }
  if (phoneUsable(b) && daysBetween(today,b.arrival) > 7) { const quiet = silentDays(b,sent);
    if (quiet != null && quiet >= NUDGE_DAYS) tasks.push({ stay:s, booking:b, nudge:true, days:quiet, date:today }); }
});
tasks.sort((a,b)=> a.date!==b.date ? (a.date<b.date?-1:1) : (a.booking.arrival<b.booking.arrival?-1:a.booking.arrival>b.booking.arrival?1:0));

// Problémy — konfigurační díry napříč pobyty, řazené podle blízkosti příjezdu
const problems = [];
stays.forEach(s => {
  const b = s.booking;
  // Nezaplacená předrezervace bez hosta: host se doplňuje až po zaplacení, do
  // „nespárovaných" nepatří. Uhrazená (confirmed) ale je pobyt jako každý jiný — bez
  // hosta nedostane zprávy ani kód a e-mail je jediné místo, kde se to dozví.
  if (!b && s.hold && s.hold.status === 'hold') return;
  if (!b) { // nespárovaný pobyt z kalendáře: start v [dnes−14, dnes+35] — potvrzení je T−30, hlásit dřív.
    // Servisní blok majitele a nepotvrzený termín (verified.json) hosta nemají → nehlásit. Stejně jako sprava.js.
    const vs = verifiedStatus(s);
    if (vs === 'service' || vs === 'unconfirmed') return;
    if (s.end >= today && s.start <= addDaysISO(today,35) && s.start >= addDaysISO(today,-14))
      problems.push({ kind:'unpaired', stay:s, date:s.start });
    return; }
  const hasPhone = phoneUsable(b); // použitelný = vznikne z něj wa.me odkaz
  if (!hasPhone && s.end >= today && s.start <= addDaysISO(today,30)) problems.push({ kind:'nophone', stay:s, date:s.start }); // 30denní pipeline / běžící
  // kód dveří NEJDE odvodit (není uložený a telefon nemá 5 číslic) → hosté se nedostanou dovnitř ani
  // k registraci z lednice. Uložený být nemusí: zámek i lednice si ho berou z telefonu (jako sprava.js).
  if (!doorCodeFor(b) && s.end >= today && daysBetween(today, s.start) <= 7)
    problems.push({ kind:'nocode', stay:s, date:s.start });
});
problems.sort((a,b)=> a.date<b.date?-1:a.date>b.date?1:0);

/* ---------- žádosti z webu (vr_requests) ---------- */
// Čte se JMÉNEM uzlu, ne z $input — uzel „Spočítat úkoly" tak dál dostává na
// vstupu pobyty a zbytek téhle 1400řádkové funkce se nemusel sahat.
// Selhání dotazu = prázdný seznam: kvůli žádostem se denní e-mail nikdy nezastaví.
let rqOpen = [];
try {
  const rqItems = $('Načíst žádosti (service-role)').all();
  const raw = (rqItems.length === 1 && Array.isArray(rqItems[0].json))
    ? rqItems[0].json
    : rqItems.map(i => i.json).filter(x => x && x.id);
  rqOpen = raw.filter(r => r && r.id && r.status !== 'done');
} catch (e) { rqOpen = []; }

/* ---------- hlášení cizinců (UbyPort) ---------- */
// Lhůta 3 pracovních dnů od ubytování (§ 102 zák. 326/1999 Sb.). Pracovní dny
// i svátky počítá DB (vr_ubyport_due), tady se nic nepřepočítává — stejná
// pravda jako sekce Problémy v /sprava/. Uzel vrací objekt {due:[…]}.
// Chybějící uzel / chyba dotazu = prázdný seznam: denní e-mail se kvůli tomu nezastaví.
let ubyDue = [];
try {
  const u = $('Načíst hlášení cizinců (service-role)').first().json;
  ubyDue = (u && Array.isArray(u.due)) ? u.due : [];
} catch (e) { ubyDue = []; }
const ubyUrgent = ubyDue.filter(u => (u.foreign_unreported > 0 && u.deadline && u.deadline <= today)).length;

// Nevyřízená žádost je sama o sobě důvod e-mail poslat — bez rqOpen v téhle
// podmínce by v klidný den (0 úkolů, 0 problémů) zůstala zase neviditelná.
if (!tasks.length && !problems.length && !hasConflicts && !hasSafety && !rqOpen.length && !ubyDue.length) return []; // nic → žádný e-mail

/* ---------- HTML e-mail ---------- */
function card(inner){ return '<div style="background:#fff;border:1px solid #e6e8e7;border-radius:12px;padding:14px 16px;margin:10px 0">'+inner+'</div>'; }
function waBtn(href){ return '<a href="'+esc(href)+'" style="display:inline-block;background:#25D366;color:#06280F;font-weight:700;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:14px">Otevřít ve WhatsApp ↗</a>'; }
// První ozvěna čeká typicky u desítek pobytů naráz (ozývá se hned po rezervaci) —
// v e-mailu proto jedna karta se seznamem, ne dvacet karet pod sebou.
const firstTasks = tasks.filter(t => t.msg && t.msg.asap);
function arrivesIn(b){ const d=daysBetween(today,b.arrival); return d>0 ? 'příjezd za '+d+' dní' : (b.departure>=today?'pobyt běží':'po odjezdu'); }
function waLinkSmall(href,label){ return '<a href="'+esc(href)+'" style="color:#0E7A46;font-weight:700;text-decoration:none;white-space:nowrap">'+label+' ↗</a>'; }
const firstHtml = !firstTasks.length ? '' : card(
  '<div style="font-weight:700;color:#182019;font-size:15px">💬 První ozvěna — '+firstTasks.length+'× na řadě</div>'+
  '<div style="color:#6b736f;font-size:13px;margin:2px 0 10px">Ozvat se hned, i když je příjezd za měsíce: kdo váhá, pozná se včas. Po odeslání odklikni „Odesláno" v <a href="'+esc(SPRAVA_URL)+'">/sprava/</a>.</div>'+
  '<table style="width:100%;border-collapse:collapse;font-size:14px">'+firstTasks.map(t => { const b=t.booking, ctx=buildCtx(b);
    return '<tr><td style="padding:6px 8px 6px 0;border-top:1px solid #eef0ef">'+esc(guestName(b))+'<div style="color:#8a918d;font-size:12px">'+esc(fmtShort(b.arrival,b.departure))+' · '+esc(msgLang(b).toUpperCase())+'</div></td>'+
      '<td style="padding:6px 0;border-top:1px solid #eef0ef;text-align:right">'+waLinkSmall(waLink(b, buildParts(t.msg,ctx,b)[0].text),'WhatsApp')+'</td></tr>'; }).join('')+'</table>');

const rows = tasks.filter(t => !(t.msg && t.msg.asap)).map(t => {
  if (t.yale) {
    const by = t.booking, code = doorCodeFor(by);
    return card('<div style="font-weight:700;color:#182019;font-size:15px">'+esc(guestName(by))+'</div>'+
      '<div style="color:#6b736f;font-size:13px;margin:2px 0 10px">🔑 Yale Home — nastav kód · <span style="color:#0E7A46;font-weight:700">den před příjezdem</span></div>'+
      '<div style="font-size:14px;color:#1f2422;margin-bottom:8px">Kód <b>'+esc(code)+'</b>, platnost '+esc(fmtDay(by.arrival))+' 15:00 – '+esc(fmtDay(by.departure))+' 10:00</div>'+
      '<div style="color:#6b736f;font-size:13px">Nastav ručně v appce Yale Home (Temporary kód). Označ jako hotové v <a href="'+esc(SPRAVA_URL)+'">/sprava/</a>.</div>');
  }
  if (t.risk) { const b = t.booking;
    return '<div style="background:#fff;border:1px solid #efd0d0;border-left:4px solid #c0392b;border-radius:12px;padding:12px 15px;margin:10px 0">'+
      '<div style="font-weight:700;color:#8a1111;font-size:15px">⚠️ '+esc(guestName(b))+' — váhá</div>'+
      '<div style="color:#333;font-size:14px;margin:4px 0 8px">'+esc(fmtShort(b.arrival,b.departure))+' · '+esc(arrivesIn(b))+'. Ozvi se a počítej s možným stornem; až bude jasno, změň stav v <a href="'+esc(SPRAVA_URL)+'">/sprava/</a>.</div>'+
      (phoneUsable(b) ? waBtn('https://wa.me/'+waPhone(b)) : '')+'</div>'; }
  if (t.nudge) { const b = t.booking, ctx = buildCtx(b);
    return card('<div style="font-weight:700;color:#182019;font-size:15px">'+esc(guestName(b))+'</div>'+
      '<div style="color:#6b736f;font-size:13px;margin:2px 0 10px">💬 '+t.days+' dní bez odpovědi na první ozvěnu — připomenout se · '+esc(msgLang(b).toUpperCase())+' · '+esc(arrivesIn(b))+'</div>'+
      waBtn(waLink(b, buildParts({key:'nudge'},ctx,b)[0].text))+
      '<div style="color:#6b736f;font-size:13px;margin-top:8px">Odpověděl mezitím? Zapiš to v <a href="'+esc(SPRAVA_URL)+'">/sprava/</a> (jede / váhá).</div>'); }
  const b = t.booking, ctx = buildCtx(b), parts = buildParts(t.msg, ctx, b);
  const when = t.overdue ? '<span style="color:#c47b1a;font-weight:700">po termínu</span>' : '<span style="color:#0E7A46;font-weight:700">dnes</span>';
  const variant = parts[0] && parts[0].variantLabel ? ' · '+esc(parts[0].variantLabel) : '';
  const langTag = t.msg.ownerTask ? '' : ' · '+esc(msgLang(b).toUpperCase());
  let action;
  if (t.msg.ownerTask) {
    action = '<div style="color:#6b736f;font-size:13px">🔁 Připomínka jen pro tebe — vratku '+DEPOSIT_CZK.toLocaleString('cs-CZ')+' Kč pošli přes <a href="'+esc(REVOLUT_URL)+'">Revolut</a>.</div>';
  } else if (parts[0].needsCode) {
    action = '<div style="color:#c47b1a;font-size:13px">Chybí telefon i kód ke dveřím — doplň ho v <a href="'+esc(SPRAVA_URL)+'">/sprava/</a> a odešli odtud.</div>';
  } else if (parts[0].needsToken) {
    action = '<div style="color:#6b736f;font-size:13px">Zpráva nese kód ke dveřím a odkazy s tokenem hosta (průvodce, registrace) — otevři ji ve <a href="'+esc(SPRAVA_URL)+'">/sprava/</a> a odešli odtud, všechno se tam doplní samo.</div>';
  } else {
    action = parts.filter(p=>p.text).map((p,i)=> (p.label?'<div style="font-size:12px;color:#8a918d;margin:8px 0 4px">'+esc(p.label)+'</div>':'') + waBtn(waLink(b, p.text))).join(' ');
  }
  return card('<div style="font-weight:700;color:#182019;font-size:15px">'+esc(guestName(b))+'</div>'+
    '<div style="color:#6b736f;font-size:13px;margin:2px 0 10px">'+esc(t.msg.title)+langTag+variant+' · '+when+'</div>'+ action);
}).join('') + firstHtml + (staleCount
  ? '<p style="color:#8a918d;font-size:13px;margin:10px 2px">'+staleCount+'× starší úkol už nedává smysl (pobyt začal nebo je těsně před příjezdem) — není to dluh. V <a href="'+esc(SPRAVA_URL)+'">/sprava/</a> je odklikneš jedním tlačítkem.</p>'
  : '');

const n = tasks.length;
const word = n===1?'úkol':(n>=2&&n<=4?'úkoly':'úkolů');
const dnes = (function(){ const d=parseISO(today); return d.getDate()+'. '+MONTH_GEN[d.getMonth()]+' '+d.getFullYear(); })();

// sekce konfliktů (nahoře, jen shrnutí + odkaz — detailní e-mail poslal VrConflictWatch)
const cn = conflicts.overlaps.length + conflicts.vanished.length;
function conflCard(inner){ return '<div style="background:#fff;border:1px solid #efd0d0;border-left:4px solid #c0392b;border-radius:12px;padding:12px 15px;margin:8px 0">'+inner+'</div>'; }
let conflHtml = '';
if (hasConflicts) {
  const cParts = [];
  conflicts.overlaps.forEach(o => {
    const an = o.a.booking?guestName(o.a.booking):'—', bn = o.b.booking?guestName(o.b.booking):'—';
    cParts.push(conflCard('<div style="font-weight:700;color:#8a1111;font-size:15px">🔴 Dvojitá rezervace — '+esc(fmtTermin(o.os,o.oe))+'</div>'+
      '<div style="color:#333;font-size:14px;margin:6px 0 2px">'+esc(o.a.platform||'—')+' · '+esc(an)+' &nbsp;×&nbsp; '+esc(o.b.platform||'—')+' · '+esc(bn)+'</div>'+
      (o.known?'<div style="color:#0E7A46;font-size:13px;margin-top:6px">✔ Známý — už se řeší.</div>':'')));
  });
  conflicts.vanished.forEach(v => { const b=v.booking;
    cParts.push(conflCard('<div style="font-weight:700;color:#8a5a11;font-size:15px">🟡 Pobyt zmizel z kalendáře — '+esc(fmtTermin(b.arrival,b.departure))+'</div>'+
      '<div style="color:#333;font-size:14px;margin:6px 0 2px">'+esc(b.platform||'—')+' · '+esc(guestName(b))+' — storno? Ověř a případně smaž ve správě.</div>'));
  });
  conflHtml = '<div style="margin:2px 0 6px"><span style="display:inline-block;background:#c0392b;color:#fff;font-weight:700;font-size:12px;letter-spacing:.05em;padding:4px 10px;border-radius:6px">🔴 HLÍDAČ KALENDÁŘE</span></div>'+
    cParts.join('')+
    '<p style="color:#6b736f;font-size:13px;margin:2px 0 18px">Řeš to hned — čím dřív, tím levnější. Detaily a řešení v <a href="'+esc(SPRAVA_URL)+'">/sprava/</a>.</p>';
}

// sekce BEZPEČNOST KALENDÁŘE — zamrzlý kalendář a propadající předrezervace (nahoře,
// hned pod konflikty: obojí znamená, že termín může jít prodat dvakrát)
let safetyHtml = '';
if (hasSafety) {
  const sParts = [];
  if (calFrozen) {
    sParts.push(conflCard('<div style="font-weight:700;color:#8a1111;font-size:15px">🧊 Kalendář rezervací '+
      (calFrozen.why === 'nenačetl' ? 'se nepodařilo načíst' : 'nezapisuje od '+esc(fmtDay(calFrozen.since)))+'</div>'+
      '<div style="color:#333;font-size:14px;margin:6px 0 2px">Úklid, /sprava/ ani blokace přímých prodejů na platformách se neobnovují. '+
      'Zkontroluj běhy „Update booking history" na GitHubu a proměnnou <code>CALENDAR_DRY_RUN</code> (zkušební běh nic nezapisuje).</div>'));
  }
  holdAlerts.forEach(a => {
    const h = a.hold, hb = bookingOfHold(h), who = hb ? guestName(hb) : 'přímý prodej bez hosta';
    const head = a.kind === 'expired'
      ? '⏳ Předrezervace propadla '+esc(fmtDay(h.hold_until))+' — '+esc(fmtTermin(h.arrival, h.departure))
      : '⏳ Předrezervace propadne '+esc(fmtDay(h.hold_until))+' — '+esc(fmtTermin(h.arrival, h.departure));
    const body = a.kind === 'expired'
      ? 'Termín se uvolnil na všech kanálech. Zaplatil host? Potvrď platbu v /sprava/ — termín se při dalším běhu kalendáře znovu zablokuje. Jinak předrezervaci zruš.'
      : 'Nepřijde-li platba, termín se po tomhle dni uvolní na všech kanálech. Prodluž ji v /sprava/, pokud host platit bude.';
    sParts.push((a.kind === 'expired' ? conflCard : probCard)(
      '<div style="font-weight:700;color:'+(a.kind === 'expired' ? '#8a1111' : '#8a5a11')+';font-size:15px">'+head+'</div>'+
      '<div style="color:#333;font-size:14px;margin:6px 0 2px">'+esc(who)+' · '+body+'</div>'));
  });
  safetyHtml = '<div style="margin:2px 0 6px"><span style="display:inline-block;background:#8a1111;color:#fff;font-weight:700;font-size:12px;letter-spacing:.05em;padding:4px 10px;border-radius:6px">🛡️ BEZPEČNOST KALENDÁŘE</span></div>'+
    sParts.join('')+
    '<p style="color:#6b736f;font-size:13px;margin:2px 0 18px">Obojí znamená riziko dvojí rezervace — řeš to dnes. <a href="'+esc(SPRAVA_URL)+'">/sprava/</a></p>';
}

// sekce Problémy — konfigurační díry (chybí telefon / nejde odvodit kód do 7 dnů / nespárováno)
function probCard(inner){ return '<div style="background:#fff;border:1px solid #f0e2cf;border-left:4px solid #c47b1a;border-radius:12px;padding:12px 15px;margin:8px 0">'+inner+'</div>'; }
let problemsHtml = '';
if (problems.length) {
  const pParts = problems.map(p => {
    const s = p.stay, b = s.booking;
    if (p.kind === 'unpaired')
      return probCard('<div style="font-weight:700;color:#8a5a11;font-size:15px">⚠️ '+esc(fmtShort(s.start,s.end))+'</div>'+
        '<div style="color:#555;font-size:13px;margin-top:3px">Pobyt z kalendáře bez kontaktu — doplnit hosta ('+esc(s.platform)+') v <a href="'+esc(SPRAVA_URL)+'">/sprava/</a>.</div>');
    if (p.kind === 'nophone') {
      const junk = !!phoneDigits(b.phone); // číslo tam je, jen se nedá použít
      return probCard('<div style="font-weight:700;color:#8a5a11;font-size:15px">📞 '+esc(guestName(b))+(junk?' — telefon nejde použít':' — chybí telefon')+'</div>'+
        '<div style="color:#555;font-size:13px;margin-top:3px">'+esc(fmtShort(s.start,s.end))+' · '+(junk
          ? 'z čísla „'+esc(b.phone)+'“ nejde složit mezinárodní tvar — WhatsApp odkaz z něj nevznikne.'
          : 'bez telefonu nejde poslat zprávy ani připravit kód dveří.')+'</div>');
    }
    return probCard('<div style="font-weight:700;color:#8a5a11;font-size:15px">🔑 '+esc(guestName(b))+' — není z čeho udělat kód dveří</div>'+
      '<div style="color:#555;font-size:13px;margin-top:3px">'+(s.start<=today?'Pobyt běží':'Příjezd za '+daysBetween(today,s.start)+' dní')+' ('+esc(fmtShort(s.start,s.end))+') a chybí telefon i uložený kód. Doplň telefon v /sprava/ — kód se z něj vezme sám.</div>');
  });
  problemsHtml = '<div style="margin:2px 0 6px"><span style="display:inline-block;background:#c47b1a;color:#fff;font-weight:700;font-size:12px;letter-spacing:.05em;padding:4px 10px;border-radius:6px">⚙️ PROBLÉMY</span></div>'+
    pParts.join('')+
    '<p style="color:#6b736f;font-size:13px;margin:2px 0 18px">Konfigurační mezery — doplň v <a href="'+esc(SPRAVA_URL)+'">/sprava/</a>.</p>';
}

// sekce HLÁŠENÍ CIZINCŮ — červeně po lhůtě / poslední den, jinak ember
let ubyHtml = '';
if (ubyDue.length) {
  const uParts = ubyDue.map(u => {
    const who = esc(u.guest || 'pobyt') + ' · ' + esc(fmtShort(u.arrival, u.departure));
    if (u.foreign_unreported > 0) {
      const left = daysBetween(today, u.deadline);
      const col = left <= 0 ? '#c0392b' : '#D68A4C';
      const when = left < 0 ? ('lhůta uplynula ' + esc(fmtDay(u.deadline)) + ' — nahlas co nejdřív')
        : left === 0 ? '<b>dnes je poslední den lhůty</b>'
        : ('lhůta do ' + esc(fmtDay(u.deadline)));
      return '<div style="background:#fff;border:1px solid #efd0d0;border-left:4px solid '+col+';border-radius:12px;padding:12px 15px;margin:8px 0">'+
        '<div style="font-weight:700;color:#182019;font-size:15px">🛂 '+who+'</div>'+
        '<div style="color:#555;font-size:13px;margin-top:3px">Nenahlášení cizinci: <b>'+u.foreign_unreported+'</b> · '+when+
        (u.missing_data ? ' · <span style="color:#c0392b">'+u.missing_data+'× chybí doklad nebo datum narození</span>' : '')+'</div></div>';
    }
    return '<div style="background:#fff;border:1px solid #f0e2cf;border-left:4px solid #c47b1a;border-radius:12px;padding:12px 15px;margin:8px 0">'+
      '<div style="font-weight:700;color:#8a5a11;font-size:15px">📝 '+who+' — registrace neúplná</div>'+
      '<div style="color:#555;font-size:13px;margin-top:3px">Zaregistrováno '+u.registered+' z '+u.expected+' osob. Jestli mezi chybějícími jsou cizinci, hlášení je potřeba do '+
      esc(fmtDay(u.arrival_deadline))+' — připomeň hostům registraci.</div></div>';
  });
  ubyHtml = '<div style="margin:2px 0 6px"><span style="display:inline-block;background:#c0392b;color:#fff;font-weight:700;font-size:12px;letter-spacing:.05em;padding:4px 10px;border-radius:6px">🛂 HLÁŠENÍ CIZINCŮ</span></div>'+
    uParts.join('')+
    '<p style="color:#6b736f;font-size:13px;margin:2px 0 18px">Lhůta 3 pracovní dny od ubytování. UNL soubor stáhneš a po odeslání označíš „Nahlášeno" v detailu pobytu v <a href="'+esc(SPRAVA_URL)+'">/sprava/</a>.</p>';
}

const pn = problems.length;
// sekce ŽÁDOSTI Z WEBU — ember rámeček (příležitost, ne chyba)
function reqCard(inner){ return '<div style="background:#fff;border:1px solid #f0dfc9;border-left:4px solid #D68A4C;border-radius:12px;padding:12px 15px;margin:8px 0">'+inner+'</div>'; }
let reqHtml = '';
if (rqOpen.length) {
  const RQ_FLAG = { cs:'🇨🇿', de:'🇩🇪', en:'🇬🇧', pl:'🇵🇱' };
  const rParts = rqOpen.map(r => {
    const hoste = [ r.adults+' dosp.', r.children ? (r.children+' dět.') : null, r.pets ? (r.pets+'× pes') : null ]
      .filter(Boolean).join(' · ');
    const wait = r.notified_at ? '' : ' <span style="color:#c47b1a;font-weight:700">· e-mail zatím neodešel</span>';
    const dig = String(r.phone == null ? '' : r.phone).replace(/\D/g, '');
    const tel = dig ? (' · <a href="tel:+'+dig+'">+'+esc(dig)+'</a>') : '';
    return reqCard('<div style="font-weight:700;color:#182019;font-size:15px">'+(RQ_FLAG[r.lang]||'🏳️')+' '+esc(r.name)+'</div>'+
      '<div style="color:#6b736f;font-size:13px;margin:3px 0 8px">'+esc(fmtTermin(r.arrival, r.departure))+' · '+esc(hoste)+
      ' · <b style="color:#1f2422">'+esc(Number(r.total||0).toLocaleString('cs-CZ'))+' Kč</b>'+wait+'</div>'+
      '<div style="font-size:13.5px"><a href="mailto:'+esc(r.email)+'">'+esc(r.email)+'</a>'+tel+'</div>');
  });
  reqHtml = '<div style="margin:2px 0 6px"><span style="display:inline-block;background:#D68A4C;color:#20140A;font-weight:700;font-size:12px;letter-spacing:.05em;padding:4px 10px;border-radius:6px">🏔️ ŽÁDOSTI Z WEBU</span></div>'+
    rParts.join('')+
    '<p style="color:#6b736f;font-size:13px;margin:2px 0 18px">Neodpovězené žádosti z formuláře na webu. Odbav a označ „Vyřízeno" v <a href="'+esc(SPRAVA_URL)+'">/sprava/</a>.</p>';
}

const subjectBase = hasConflicts
  ? ('🔴 Villa Rudolf — konflikt v kalendáři' + (n>0 ? (' + '+n+' '+word) : ''))
  : (n>0)
    ? ('Villa Rudolf — dnes: '+n+' '+word)
    : (pn>0)
      ? ('Villa Rudolf — '+pn+' '+(pn===1?'problém':(pn>=2&&pn<=4?'problémy':'problémů'))+' ke kontrole')
      : rqOpen.length
        ? ('Villa Rudolf — '+rqOpen.length+'× žádost z webu')
        : ubyDue.length
          ? 'Villa Rudolf — hlášení cizinců'
          : 'Villa Rudolf — bezpečnost kalendáře';
// Žádost patří do předmětu, ne až do těla — jinak se e-mail v mobilu tváří
// jako běžná denní připomínka a otevře se až večer.
// Prefix jen tehdy, když v předmětu už něco jiného je — jinak by v klidný den
// vyšlo „1× žádost z webu · Villa Rudolf — 1× žádost z webu".
const subject0 = (rqOpen.length && (n>0 || hasConflicts || pn>0))
  ? ('🏔️ ' + rqOpen.length + '× žádost z webu · ' + subjectBase)
  : subjectBase;
// Lhůta pro policii dnes nebo prošlá → musí být vidět už v předmětu.
const subject1 = ubyUrgent ? ('🛂 UbyPort: '+ubyUrgent+'× lhůta dnes/prošlá · ' + subject0) : subject0;
// Zamrzlý kalendář a propadlá předrezervace = riziko dvojí rezervace → úplně na začátek.
const holdsExpired = holdAlerts.filter(a => a.kind === 'expired').length;
const safetyPrefix = calFrozen ? (calFrozen.why === 'nenačetl' ? '🧊 Kalendář rezervací nejde načíst · ' : '🧊 Kalendář rezervací nezapisuje · ')
  : holdsExpired ? ('⏳ '+holdsExpired+'× propadlá předrezervace · ')
  : holdAlerts.length ? ('⏳ '+holdAlerts.length+'× předrezervace propadá · ') : '';
const subject = (safetyPrefix && subject1 !== 'Villa Rudolf — bezpečnost kalendáře') ? safetyPrefix + subject1
  : safetyPrefix ? safetyPrefix + 'Villa Rudolf' : subject1;
const heading = (n>0) ? ('Dnes na řadě: '+n+' '+word)
  : hasConflicts ? 'Konflikt v kalendáři'
  : hasSafety ? 'Bezpečnost kalendáře'
  : (pn>0) ? 'Problémy ke kontrole'
  : rqOpen.length ? (rqOpen.length===1 ? 'Nová žádost z webu' : rqOpen.length+' žádosti z webu')
  : 'Hlášení cizinců';
const html = '<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'+
  '<body style="margin:0;background:#f4f5f4"><div style="max-width:640px;margin:0 auto;padding:22px 14px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2422">'+
  '<p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#D68A4C;font-weight:700;margin:0 0 2px">Villa Rudolf · správa pobytů</p>'+
  '<h1 style="font-size:21px;margin:0 0 2px">'+esc(heading)+'</h1>'+
  '<p style="color:#6b736f;font-size:14px;margin:0 0 14px">'+esc(dnes)+' · přehled a odeslání také v <a href="'+esc(SPRAVA_URL)+'">/sprava/</a></p>'+
  conflHtml +
  safetyHtml +
  ubyHtml +
  reqHtml +
  problemsHtml +
  rows +
  '<p style="color:#8a918d;font-size:12px;margin-top:22px;border-top:1px solid #e6e8e7;padding-top:12px">Automatická denní připomínka (n8n · VrDailyTasks). Šablony a wa.me odkazy jsou v jazyce pobytu a zrcadlí sekci DNES v /sprava/. Odkazy odesílají zprávu ručně z tvého WhatsAppu — nic se neposílá samo.</p>'+
  '</div></body></html>';

return [{ json: { subject, html, to: 'pavel.kubiznak@gmail.com', count: n, problems: pn, conflicts: cn, ubyport: ubyDue.length,
  calendarFrozen: !!calFrozen, holdAlerts: holdAlerts.length } }];
