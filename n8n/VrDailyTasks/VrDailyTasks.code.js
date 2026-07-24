/* VrDailyTasks — Code node „Spočítat úkoly" (n8n na Hetzneru sintera-radar).
 * NASAZENO: n8n workflow id VrDailyTasks001, cron 30 7 * * * (Europe/Prague).
 * Tento soubor je REFERENČNÍ kopie kódu vloženého do Code node (bez tohoto úvodního
 * komentáře, jinak 1:1). Při změně šablon/sekvence v /sprava/sprava.js DRŽ V SYNCU
 * a vlož zpět do Code node (n8n import:workflow / editor).
 * Systém D: šablony ve 4 jazycích (cs/en/de/pl), 🔑 Yale připomínka den před příjezdem,
 * sekce „Problémy" (chybí telefon / chybí kód do 7 dnů / nespárováno). Jazyk = jazyk
 * pobytu, jinak anglicky.
 * Data: vr_bookings přes Supabase service-role (credential VrSupaService01,
 * apikey=anon inline + Authorization=Bearer service-role z credentialu).
 * POZN.: PostgREST vrací vnořený log jako vr_msglog → níže se normalizuje na b.msglog
 * (zrcadlí tvar z RPC vr_admin_list_bookings, který používá /sprava/).
 * E-mail: SMTP credential VrSmtpGmail0001 (Gmail app-password).
 */
// VrDailyTasks — spočítá dnešní úkoly STEJNOU logikou jako sekce DNES v /sprava/
// (časová osa T0/T−7/T−5/příjezd/den2/odjezd−24h/ráno-odjezdu vs. vr_msglog;
// + 🔑 Yale připomínka; + nespárované/chybějící kontakty do sekce „Problémy").
// Když je co, vytvoří 1 položku s předmětem + HTML e-mailem (wa.me odkazy v jazyce
// pobytu). Když není nic, vrátí [] → e-mail se neodešle.

const SUPA = 'https://fpknbrzbqpalguajskut.supabase.co';
const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZwa25icnpicXBhbGd1YWpza3V0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzczMDEyMTAsImV4cCI6MjA5Mjg3NzIxMH0.goat1c7Y1YnpTq7_XyMD3LROElkVI6E27f0B3EG8btA';
const CAL_URL = 'https://pavelkubiznak.github.io/villa-booking-calendar/data/history.json';
const SPRAVA_URL = 'https://villarudolf.com/sprava/';
const WIFI = 'Rudolf519';
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
function fmtTermin(a,b){ const da=parseISO(a),db=parseISO(b); const d1=da.getDate(),m1=da.getMonth(),y1=da.getFullYear(); const d2=db.getDate(),m2=db.getMonth(),y2=db.getFullYear();
  if(y1===y2&&m1===m2) return d1+'.–'+d2+'. '+MONTH_GEN[m2]+' '+y2;
  if(y1===y2) return d1+'. '+MONTH_GEN[m1]+' – '+d2+'. '+MONTH_GEN[m2]+' '+y2;
  return d1+'. '+MONTH_GEN[m1]+' '+y1+' – '+d2+'. '+MONTH_GEN[m2]+' '+y2; }
function fmtShort(a,b){ const da=parseISO(a),db=parseISO(b); return da.getDate()+'. '+(da.getMonth()+1)+'. – '+db.getDate()+'. '+(db.getMonth()+1)+'. '+db.getFullYear(); }
function fmtDay(iso){ const d=parseISO(iso); return d.getDate()+'. '+(d.getMonth()+1)+'.'; }
function isWinter(iso){ const d=parseISO(iso),m=d.getMonth()+1,day=d.getDate(); return (m===1||m===2||m===3)||(m===11||m===12)||(m===10&&day>=15); }

/* ---------- telefon → kód dveří (Yale) ---------- */
function phoneDigits(phone){ return String(phone==null?'':phone).replace(/\D/g,''); }
function suggestDoorCode(phone){ const d=phoneDigits(phone); return d.length>=5?d.slice(-5):null; }
function doorCodeFor(b){ return b.door_code||suggestDoorCode(b.phone); }

/* ---------- šablony 4 jazyky (zrcadlí /sprava/sprava.js) ---------- */
// CS doslovně schváleno 23.7.2026; en/de/pl přeloženy. {REVOLUT_URL} v deposit zapečen.
const TPL = {
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
function msgLang(b){ return (b && b.lang && TPL[b.lang]) ? b.lang : 'en'; }
function tplFor(lang,key){ return (TPL[lang]||TPL.en)[key]; }
function reviewVariant(platform,lang){ const T=TPL[lang]||TPL.en; const p=(platform||'').toLowerCase();
  if(p.indexOf('airbnb')>=0) return {label:'Airbnb (5★)', text:T.reviewBody+T.reviewAirbnb};
  if(p.indexOf('booking')>=0) return {label:'Booking (10/10)', text:T.reviewBody+T.reviewBooking};
  return {label:'Google', text:T.reviewBody+T.reviewGoogle}; }
function fill(tpl,ctx){ return tpl
  .replace(/\{JMENO\}/g,ctx.jmeno).replace(/\{TERMIN\}/g,ctx.termin)
  .replace(/\{DOSPELI\}/g,ctx.dospeli).replace(/\{DETI\}/g,ctx.deti).replace(/\{NOCI\}/g,ctx.noci)
  .replace(/\{CASTKA\}/g,ctx.castka).replace(/\{KOD_DVERI\}/g,ctx.kod).replace(/\{WIFI_HESLO\}/g,WIFI)
  .replace(/\{KAUCE\}/g,DEPOSIT_CZK.toLocaleString('cs-CZ'))
  .replace(/\{REGISTRACNI_LINK\}/g,ctx.regLink||'{REGISTRACNI_LINK}'); }

/* ---------- sekvence ---------- */
const SEQUENCE=[
  {key:'confirm',title:'Potvrzení rezervace',from:'arrival',off:-30,when:'po potvrzení'},
  {key:'welcome',title:'Velká uvítací zpráva',from:'arrival',off:-7,when:'T−7'},
  {key:'registration',title:'Odkaz na registraci',from:'arrival',off:-5,when:'T−5'},
  {key:'doorcode',title:'Kód ke dveřím',from:'arrival',off:0,when:'den příjezdu'},
  {key:'day2',title:'Kontrola po první noci',from:'arrival',off:1,when:'den 2'},
  {key:'predeparture',title:'Prosby před odjezdem',from:'departure',off:-1,when:'odjezd −24 h'},
  {key:'review',title:'Poděkování + recenze',from:'departure',off:0,when:'ráno odjezdu'}
];
const DEPOSIT_STEPS=[
  {key:'deposit_charge',title:'Kauce — výběr ('+DEPOSIT_CZK.toLocaleString('cs-CZ')+' Kč)',from:'arrival',off:-7,when:'T−7 / samostatně',deposit:'charge',after:'welcome'},
  {key:'deposit_return',title:'Vrátit kauci ('+DEPOSIT_CZK.toLocaleString('cs-CZ')+' Kč)',from:'departure',off:1,when:'po odjezdu',deposit:'return',ownerTask:true,after:'review'}
];
function depositEnabled(b){ return (b.msglog||[]).some(m=>m.msg_key==='deposit_enabled'); }
function sequenceFor(b){ if(!depositEnabled(b)) return SEQUENCE.slice(); const out=[];
  SEQUENCE.forEach(msg=>{ out.push(msg); DEPOSIT_STEPS.forEach(d=>{ if(d.after===msg.key) out.push(d); }); }); return out; }
function schedDate(msg,b){ return addDaysISO(msg.from==='departure'?b.departure:b.arrival, msg.off); }

function guestName(b){ const parts=[b.first_name,b.last_name].filter(x=>x&&String(x).trim()); return parts.length?parts.join(' '):'milí hosté'; }
function personStats(persons, arrival){ let reg=persons.length,adults=0,children=0;
  persons.forEach(p=>{ const isAdult=!p.birth_date||(daysBetween(p.birth_date,arrival)>=18*365.25-1); if(isAdult)adults++; else children++; });
  return {registered:reg,adults:adults,children:children}; }
function buildCtx(b){ const noci=nights(b.arrival,b.departure); const persons=b.vr_persons||[]; const stat=personStats(persons,b.arrival);
  const reg=stat.registered>0; const dospeli=reg?stat.adults:(b.adults==null?2:b.adults); const deti=reg?stat.children:((b.children||[]).length);
  return { jmeno:guestName(b), termin:fmtTermin(b.arrival,b.departure), dospeli:dospeli, deti:deti, noci:noci,
    castka:dospeli*noci*25, kod:b.door_code||'{KOD_DVERI}', regLink:null, winter:isWinter(b.arrival) }; }
function buildParts(msg,ctx,b){
  const L=msgLang(b), lt=L.toUpperCase();
  if(msg.key==='welcome') return [{label:'Uvítací zpráva (jádro) · '+lt,text:fill(tplFor(L,'welcomeCore'),ctx)},{label:(ctx.winter?'Zimní modul':'Letní modul')+' · '+lt,text:fill(tplFor(L,ctx.winter?'winter':'summer'),ctx)}];
  if(msg.key==='confirm') return [{text:fill(tplFor(L,'confirm'),ctx)}];
  if(msg.key==='registration') return [{text:fill(tplFor(L,'registration'),ctx),needsToken:true}]; // token není server-side
  if(msg.key==='deposit_charge') return [{text:fill(tplFor(L,'deposit'),ctx)}];
  if(msg.key==='deposit_return') return [{text:'',ownerTask:true}];
  if(msg.key==='doorcode') return [{text:fill(tplFor(L,'doorcode'),ctx),needsCode:!b.door_code}];
  if(msg.key==='day2') return [{text:fill(tplFor(L,'day2'),ctx)}];
  if(msg.key==='predeparture') return [{text:fill(tplFor(L,'predeparture'),ctx)}];
  if(msg.key==='review'){ const rv=reviewVariant(b.platform,L); return [{text:fill(rv.text,ctx),variantLabel:rv.label}]; }
  return [{text:''}];
}
function waPhone(phone){ if(!phone) return ''; let d=String(phone).replace(/[^\d]/g,''); if(d.indexOf('00')===0)d=d.slice(2); else if(d.length===9)d='420'+d; return d; }
function waLink(phone,text){ return 'https://wa.me/'+waPhone(phone)+'?text='+encodeURIComponent(text); }
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

/* ---------- hlídač konfliktů (shrnutí; okamžitý e-mail posílá VrConflictWatch) ---------- */
const KNOWN_UIDH = ['44f67225fb4ecfb9','0dcf556ecb298ab7']; // známý červencový konflikt (majitel řeší)
function addMonthsISO(iso,m){ const d=parseISO(iso); d.setMonth(d.getMonth()+m);
  return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate()); }
function overlapsRange(a,b){ return a.start<b.end && b.start<a.end; } // [start,end)
// Stejná eskalační logika jako VrConflictWatch: různá platforma NEBO oba se hostem
// = reálný konflikt; stejná platforma bez hostů = artefakt (přeskočit).
function detectConflicts(stays, calendar, bookings, today){
  const overlaps=[], vanished=[];
  for(let i=0;i<stays.length;i++){ for(let j=i+1;j<stays.length;j++){
    const A=stays[i], B=stays[j];
    if(A.source!=='calendar' || B.source!=='calendar') continue; // jen feed (jako VrConflictWatch)
    if(A.uidh && B.uidh && A.uidh===B.uidh) continue;
    if(!overlapsRange(A,B)) continue;
    const samePlatform=(A.platform||'')===(B.platform||'');
    const bothPaired=!!A.booking && !!B.booking;
    if(samePlatform && !bothPaired) continue;
    overlaps.push({ a:A, b:B,
      os:(A.start>B.start?A.start:B.start), oe:(A.end<B.end?A.end:B.end),
      known:!!(A.uidh&&B.uidh&&KNOWN_UIDH.indexOf(A.uidh)>=0&&KNOWN_UIDH.indexOf(B.uidh)>=0) });
  }}
  const cal={}; calendar.forEach(c=>{ if(c.uidh) cal[c.uidh]=1; });
  const horizon=addMonthsISO(today,12);
  bookings.forEach(b=>{ if(!b.uidh||cal[b.uidh]) return; if(b.departure<today) return; if(b.arrival>horizon) return;
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

const today = isoToday();
const cutoff = addDaysISO(today, -14);
const byUidh = {}; bookings.forEach(b => { if (b.uidh) byUidh[b.uidh] = b; });

// sloučené pobyty (kalendář + ruční), stejně jako buildStays()
const stays = []; const usedIds = {};
calendar.forEach(c => { if (c.end < cutoff) return; const b = byUidh[c.uidh] || null; if (b) usedIds[b.id] = true;
  stays.push({ source:'calendar', uidh:c.uidh, start:c.start, end:c.end, platform:c.platform, booking:b }); });
bookings.forEach(b => { if (usedIds[b.id]) return; if (b.departure < cutoff) return;
  stays.push({ source:'manual', uidh:b.uidh||null, start:b.arrival, end:b.departure, platform:b.platform||'Přímá', booking:b }); });
stays.sort((x,y)=> x.start<y.start?-1:x.start>y.start?1:0);

// hlídač konfliktů (nevyřešené — jen shrnutí; detailní e-mail už poslal VrConflictWatch)
const conflicts = detectConflicts(stays, calendar, bookings, today);
const hasConflicts = conflicts.overlaps.length > 0 || conflicts.vanished.length > 0;

// collectTasks() — dnešní/po termínu zprávy (v jazyce pobytu) + 🔑 Yale připomínka.
// Nespárované / chybějící telefon → sekce Problémy (bez duplicit).
const tasks = [];
stays.forEach(s => {
  if (!s.booking) return; // → Problémy
  const b = s.booking; const sent = {}; (b.msglog||[]).forEach(m=>sent[m.msg_key]=true);
  // 🔑 Yale: den před příjezdem (a v den příjezdu, pokud nesplněno), jen když je z čeho kód připravit
  if (!sent.yale_set && doorCodeFor(b) && today >= addDaysISO(b.arrival,-1) && today <= b.arrival)
    tasks.push({ stay:s, booking:b, yale:true, date: addDaysISO(b.arrival,-1) });
  sequenceFor(b).forEach(msg => { if (sent[msg.key]) return; const d = schedDate(msg,b); if (d>today) return;
    if (!msg.ownerTask && !b.phone) return; // guest zpráva bez telefonu → řeší Problémy
    tasks.push({ stay:s, booking:b, msg:msg, date:d, overdue:d<today }); });
});
tasks.sort((a,b)=> a.date<b.date?-1:a.date>b.date?1:0);

// Problémy — konfigurační díry napříč pobyty, řazené podle blízkosti příjezdu
const problems = [];
stays.forEach(s => {
  const b = s.booking;
  if (!b) { // nespárovaný pobyt z kalendáře — jen near-term (zrcadlí původní warn): start v [dnes−14, dnes+21]
    if (s.end >= today && s.start <= addDaysISO(today,21) && s.start >= addDaysISO(today,-14))
      problems.push({ kind:'unpaired', stay:s, date:s.start });
    return; }
  const hasPhone = !!phoneDigits(b.phone);
  if (!hasPhone && s.end >= today && s.start <= addDaysISO(today,30)) problems.push({ kind:'nophone', stay:s, date:s.start }); // 30denní pipeline / běžící
  if (hasPhone && !b.door_code && s.start >= today && daysBetween(today, s.start) <= 7)
    problems.push({ kind:'nocode', stay:s, date:s.start });
});
problems.sort((a,b)=> a.date<b.date?-1:a.date>b.date?1:0);

if (!tasks.length && !problems.length && !hasConflicts) return []; // nic → žádný e-mail

/* ---------- HTML e-mail ---------- */
function card(inner){ return '<div style="background:#fff;border:1px solid #e6e8e7;border-radius:12px;padding:14px 16px;margin:10px 0">'+inner+'</div>'; }
function waBtn(href){ return '<a href="'+esc(href)+'" style="display:inline-block;background:#25D366;color:#06280F;font-weight:700;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:14px">Otevřít ve WhatsApp ↗</a>'; }
const rows = tasks.map(t => {
  if (t.yale) {
    const by = t.booking, code = doorCodeFor(by);
    return card('<div style="font-weight:700;color:#182019;font-size:15px">'+esc(guestName(by))+'</div>'+
      '<div style="color:#6b736f;font-size:13px;margin:2px 0 10px">🔑 Yale Home — nastav kód · <span style="color:#0E7A46;font-weight:700">den před příjezdem</span></div>'+
      '<div style="font-size:14px;color:#1f2422;margin-bottom:8px">Kód <b>'+esc(code)+'</b>, platnost '+esc(fmtDay(by.arrival))+' 15:00 – '+esc(fmtDay(by.departure))+' 10:00</div>'+
      '<div style="color:#6b736f;font-size:13px">Nastav ručně v appce Yale Home (Temporary kód). Označ jako hotové v <a href="'+esc(SPRAVA_URL)+'">/sprava/</a>.</div>');
  }
  const b = t.booking, ctx = buildCtx(b), parts = buildParts(t.msg, ctx, b);
  const when = t.overdue ? '<span style="color:#c47b1a;font-weight:700">po termínu</span>' : '<span style="color:#0E7A46;font-weight:700">dnes</span>';
  const variant = parts[0] && parts[0].variantLabel ? ' · '+esc(parts[0].variantLabel) : '';
  const langTag = t.msg.ownerTask ? '' : ' · '+esc(msgLang(b).toUpperCase());
  let action;
  if (t.msg.ownerTask) {
    action = '<div style="color:#6b736f;font-size:13px">🔁 Připomínka jen pro tebe — vratku '+DEPOSIT_CZK.toLocaleString('cs-CZ')+' Kč pošli přes <a href="'+esc(REVOLUT_URL)+'">Revolut</a>.</div>';
  } else if (parts[0].needsToken) {
    action = '<div style="color:#6b736f;font-size:13px">Registrační odkaz je vázán na tvé zařízení — odešli krok z <a href="'+esc(SPRAVA_URL)+'">/sprava/</a>.</div>';
  } else if (parts[0].needsCode) {
    action = '<div style="color:#c47b1a;font-size:13px">Chybí kód ke dveřím — doplň ho v <a href="'+esc(SPRAVA_URL)+'">/sprava/</a> a odešli odtud.</div>';
  } else {
    // welcome má 2 části → 2 tlačítka
    action = parts.filter(p=>p.text).map((p,i)=> (p.label?'<div style="font-size:12px;color:#8a918d;margin:8px 0 4px">'+esc(p.label)+'</div>':'') + waBtn(waLink(b.phone, p.text))).join(' ');
  }
  return card('<div style="font-weight:700;color:#182019;font-size:15px">'+esc(guestName(b))+'</div>'+
    '<div style="color:#6b736f;font-size:13px;margin:2px 0 10px">'+esc(t.msg.title)+langTag+variant+' · '+when+'</div>'+ action);
}).join('');

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

// sekce Problémy — konfigurační díry (chybí telefon / kód do 7 dnů / nespárováno)
function probCard(inner){ return '<div style="background:#fff;border:1px solid #f0e2cf;border-left:4px solid #c47b1a;border-radius:12px;padding:12px 15px;margin:8px 0">'+inner+'</div>'; }
let problemsHtml = '';
if (problems.length) {
  const pParts = problems.map(p => {
    const s = p.stay, b = s.booking;
    if (p.kind === 'unpaired')
      return probCard('<div style="font-weight:700;color:#8a5a11;font-size:15px">⚠️ '+esc(fmtShort(s.start,s.end))+'</div>'+
        '<div style="color:#555;font-size:13px;margin-top:3px">Pobyt z kalendáře bez kontaktu — doplnit hosta ('+esc(s.platform)+') v <a href="'+esc(SPRAVA_URL)+'">/sprava/</a>.</div>');
    if (p.kind === 'nophone')
      return probCard('<div style="font-weight:700;color:#8a5a11;font-size:15px">📞 '+esc(guestName(b))+' — chybí telefon</div>'+
        '<div style="color:#555;font-size:13px;margin-top:3px">'+esc(fmtShort(s.start,s.end))+' · bez telefonu nejde poslat zprávy ani připravit kód dveří.</div>');
    return probCard('<div style="font-weight:700;color:#8a5a11;font-size:15px">🔑 '+esc(guestName(b))+' — chybí kód dveří</div>'+
      '<div style="color:#555;font-size:13px;margin-top:3px">Příjezd za '+daysBetween(today,s.start)+' dní ('+esc(fmtShort(s.start,s.end))+') — není uložený kód dveří.</div>');
  });
  problemsHtml = '<div style="margin:2px 0 6px"><span style="display:inline-block;background:#c47b1a;color:#fff;font-weight:700;font-size:12px;letter-spacing:.05em;padding:4px 10px;border-radius:6px">⚙️ PROBLÉMY</span></div>'+
    pParts.join('')+
    '<p style="color:#6b736f;font-size:13px;margin:2px 0 18px">Konfigurační mezery — doplň v <a href="'+esc(SPRAVA_URL)+'">/sprava/</a>.</p>';
}

const pn = problems.length;
const subject = hasConflicts
  ? ('🔴 Villa Rudolf — konflikt v kalendáři' + (n>0 ? (' + '+n+' '+word) : ''))
  : (n>0)
    ? ('Villa Rudolf — dnes: '+n+' '+word)
    : ('Villa Rudolf — '+pn+' '+(pn===1?'problém':(pn>=2&&pn<=4?'problémy':'problémů'))+' ke kontrole');
const heading = (n>0) ? ('Dnes na řadě: '+n+' '+word)
  : hasConflicts ? 'Konflikt v kalendáři'
  : 'Problémy ke kontrole';
const html = '<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'+
  '<body style="margin:0;background:#f4f5f4"><div style="max-width:640px;margin:0 auto;padding:22px 14px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2422">'+
  '<p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#D68A4C;font-weight:700;margin:0 0 2px">Villa Rudolf · správa pobytů</p>'+
  '<h1 style="font-size:21px;margin:0 0 2px">'+esc(heading)+'</h1>'+
  '<p style="color:#6b736f;font-size:14px;margin:0 0 14px">'+esc(dnes)+' · přehled a odeslání také v <a href="'+esc(SPRAVA_URL)+'">/sprava/</a></p>'+
  conflHtml +
  problemsHtml +
  rows +
  '<p style="color:#8a918d;font-size:12px;margin-top:22px;border-top:1px solid #e6e8e7;padding-top:12px">Automatická denní připomínka (n8n · VrDailyTasks). Šablony a wa.me odkazy jsou v jazyce pobytu a zrcadlí sekci DNES v /sprava/. Odkazy odesílají zprávu ručně z tvého WhatsAppu — nic se neposílá samo.</p>'+
  '</div></body></html>';

return [{ json: { subject, html, to: 'pavel.kubiznak@gmail.com', count: n, problems: pn, conflicts: cn } }];
