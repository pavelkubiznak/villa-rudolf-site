// VrDailyTasks — spočítá dnešní úkoly STEJNOU logikou jako sekce DNES v /sprava/
// (první ozvěna hned / uvítací T−10 / update T−2 / den 2 / odjezd −24 h / ráno odjezdu
// vs. vr_msglog; + ⚠️ host, který váhá; + 🔑 Yale připomínka;
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
// tools/test-zpravy.mjs. Znění schválil Pavel 13. 10. 2026; všechny jazyky vykají
// (i němčina), uvítací zpráva je bez odkazu na registraci a bez sezónního modulu.
const TPL = {
  "cs": {
    "first": "Dobrý den, {JMENO},\n\ntady Pavel z Villy Rudolf. Váš pobyt {TERMIN} je potvrzený a už se na vás těšíme.\n\n{NOVINKA}🏠 *Podívejte se, kde budete bydlet*\nDům si můžete projít už teď a v klidu si rozdělit pokoje:\n360° prohlídka: https://villarudolf.com/#interier\nPokoje a lůžka: https://villarudolf.com/#loznice\nVideo: {VIDEO}\n\n🥾 *Naplánujte si výlety už teď*\nNa našem webu najdete výlety v okolí s mapou. Vyberete si podle toho, kolik máte času a s kým jedete: https://villarudolf.com/vylety/\n\n🛂 *Doklady*\nStejně jako v každém hotelu se u nás všichni hosté po příjezdu zapisují do knihy hostů, město ji vyžaduje kvůli místnímu poplatku. Vezměte si proto prosím doklady.\n\nVšechno praktické (adresa, kód ke dveřím, Wi-Fi) vám pošlu asi deset dní před příjezdem. Kdybyste se chtěli na cokoliv zeptat už teď nebo se u vás něco měnilo, napište nebo zavolejte, rád poradím.\n\nPavel",
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
    "first": "Hello {JMENO},\n\nthis is Pavel from Villa Rudolf. Your stay for {TERMIN} is confirmed and we're already looking forward to having you.\n\n{NOVINKA}🏠 *See where you'll be staying*\nYou can walk through the house right now and sort out the rooms at your leisure:\n360° tour: https://villarudolf.com/en/#interier\nRooms and beds: https://villarudolf.com/en/#loznice\nVideo: {VIDEO}\n\n🥾 *Plan your trips right now*\nOn our website you'll find trips in the area, with a map. You choose by how much time you have and who you're travelling with: https://villarudolf.com/vylety/?lang=en\n\n🛂 *Travel documents – for the children too*\nOne practical thing, so nothing catches you out on arrival. As in any hotel, all our guests sign the guest book when they arrive. For guests from abroad we are then required by law to pass the details on to the foreign police. Every accommodation provider in Czechia does this, from a guesthouse to a five-star hotel – there it is usually just handled by reception with your passport in hand. That is why everyone travelling with you needs their own travel document, children included. Children entered in a parent's passport are no longer accepted. If anyone is missing a document, there is still plenty of time to sort it out.\n\nI'll send you everything practical (address, door code, Wi-Fi) about ten days before you arrive. If you'd like to ask anything now, or if something changes on your side, just message or call me – happy to help.\n\nPavel",
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
    "first": "Guten Tag, {JMENO},\n\nhier ist Pavel von der Villa Rudolf. Ihr Aufenthalt {TERMIN} ist bestätigt und wir freuen uns schon auf Sie.\n\n{NOVINKA}🏠 *Schauen Sie sich an, wo Sie wohnen werden*\nSie können das Haus schon jetzt erkunden und in Ruhe die Zimmer aufteilen:\n360°-Rundgang: https://villarudolf.com/de/#interier\nZimmer und Betten: https://villarudolf.com/de/#loznice\nVideo: {VIDEO}\n\n🥾 *Planen Sie Ihre Ausflüge schon jetzt*\nAuf unserer Website finden Sie Ausflüge in der Umgebung mit Karte. Sie wählen danach aus, wie viel Zeit Sie haben und mit wem Sie unterwegs sind: https://villarudolf.com/vylety/?lang=de\n\n🛂 *Ausweise – auch für die Kinder*\nEine praktische Sache, damit Sie bei der Anreise nichts überrascht. Wie in jedem Hotel tragen sich bei uns alle Gäste nach der Ankunft ins Gästebuch ein. Die Angaben der Gäste aus dem Ausland leiten wir dann, wie gesetzlich vorgeschrieben, an die Fremdenpolizei weiter. Das macht jeder Gastgeber in Tschechien, von der Pension bis zum Fünf-Sterne-Hotel, nur erledigt es dort meist die Rezeption mit Ihrem Pass in der Hand. Deshalb braucht jeder, der mit Ihnen anreist, ein eigenes Reisedokument, auch die Kinder. Ein Eintrag der Kinder im Pass der Eltern gilt heute nicht mehr. Sollte jemandem ein Ausweis fehlen, ist jetzt noch genug Zeit, ihn in Ruhe zu beantragen.\n\nAlles Praktische (Adresse, Türcode, WLAN) schicke ich Ihnen etwa zehn Tage vor der Anreise. Wenn Sie schon jetzt etwas fragen möchten oder sich bei Ihnen etwas ändert, schreiben Sie mir oder rufen Sie an, ich helfe gern.\n\nPavel",
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
    "first": "Dzień dobry, {JMENO},\n\ntu Pavel z Villa Rudolf. Państwa pobyt w terminie {TERMIN} jest potwierdzony i już na Państwa czekamy.\n\n{NOVINKA}🏠 *Proszę zobaczyć, gdzie będą Państwo mieszkać*\nDom można obejrzeć już teraz i spokojnie podzielić pokoje:\nSpacer 360°: https://villarudolf.com/pl/#interier\nPokoje i łóżka: https://villarudolf.com/pl/#loznice\nFilm: {VIDEO}\n\n🥾 *Wycieczki można zaplanować już teraz*\nNa naszej stronie znajdą Państwo wycieczki w okolicy z mapą. Wybiera się według tego, ile mają Państwo czasu i z kim Państwo jadą: https://villarudolf.com/vylety/?lang=pl\n\n🛂 *Dokumenty – także dla dzieci*\nJedna praktyczna sprawa, żeby przy przyjeździe nic Państwa nie zaskoczyło. Tak jak w każdym hotelu, wszyscy goście po przyjeździe wpisują się u nas do księgi gości. Dane gości z zagranicy przekazujemy następnie, zgodnie z prawem, policji ds. cudzoziemców. Robi to każdy obiekt noclegowy w Czechach, od pensjonatu po pięciogwiazdkowy hotel, tylko tam zwykle załatwia to recepcja z Państwa paszportem w ręku. Dlatego każdy, kto z Państwem przyjedzie, potrzebuje własnego dokumentu podróży, także dzieci. Wpis dziecka w paszporcie rodzica nie jest już ważny. Gdyby komuś brakowało dokumentu, jest teraz dość czasu, żeby go spokojnie wyrobić.\n\nWszystko, co praktyczne (adres, kod do drzwi, Wi-Fi), wyślę około dziesięciu dni przed przyjazdem. Gdyby chcieli Państwo o coś zapytać już teraz albo gdyby coś się u Państwa zmieniało, proszę napisać lub zadzwonić, chętnie pomogę.\n\nPavel",
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
// Video k domu podle sezóny příjezdu (stejně jako VIDEO v sprava.js).
const VIDEO = { summer: 'https://www.youtube.com/watch?v=ksVpDr-P8ic', winter: 'https://youtu.be/tWCuuovnh2U' };
function fill(tpl,ctx){ return tpl
  .replace(/\{NOVINKA\}/g,ctx.novinka?ctx.novinka+'\n\n':'').replace(/\{JAK_SE_PLATI\}/g,ctx.jakSePlati||'')
  .replace(/\{VIDEO_OBSAH\}/g,ctx.videoObsah).replace(/\{VIDEO\}/g,ctx.video)
  .replace(/\{JMENO\}/g,ctx.jmeno).replace(/\{TERMIN\}/g,ctx.termin)
  .replace(/\{CAS\}/g,ctx.cas).replace(/\{KDY\}/g,ctx.kdy).replace(/\{PLATFORMA\}/g,ctx.platforma)
  .replace(/\{KOD_DVERI\}/g,ctx.kod).replace(/\{WIFI_HESLO\}/g,()=>WIFI||'{WIFI_HESLO}')
  .replace(/\{KAUCE\}/g,DEPOSIT_CZK.toLocaleString('cs-CZ'))
  .replace(/\{PRUVODCE_LINK\}/g,ctx.guideLink||'{PRUVODCE_LINK}'); }

/* ---------- sekvence ---------- */
// asap = krok bez data: na řadě hned, jak má pobyt hosta s telefonem; FIRST_MIN_DAYS
// před příjezdem už nemá smysl (jde rovnou uvítací zpráva). legacy = starý klíč ve
// vr_msglog, který krok taky splní. Staré „registration" a „doorcode" už krok nemají.
const FIRST_MIN_DAYS = 14;
const SEQUENCE=[
  {key:'first',title:'První ozvěna',asap:true,when:'hned',legacy:'confirm'},
  {key:'welcome',title:'Uvítací zpráva (adresa, kód, video, Wi-Fi)',from:'arrival',off:-10,when:'T−10'},
  {key:'update',title:'Update před příjezdem',from:'arrival',off:-2,when:'T−2'},
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
// Podmínky pobytu ze značek ve vr_msglog (stejně jako v sprava.js): arrive_HHMM = dohodnutý
// čas příjezdu (jinak 15:00), fee_onsite | fee_included | fee_deposit = jak se platí poplatek
// (přímý prodej bez volby = z kauce podle smlouvy), fee_energy = z kauce i energie.
const ARRIVAL_DEFAULT = '15:00';
function arrivalTime(b){ let t=null; (b.msglog||[]).forEach(m=>{ const x=/^arrive_(\d\d)(\d\d)$/.exec(m.msg_key); if(x) t=x[1]+':'+x[2]; }); return t||ARRIVAL_DEFAULT; }
function feeMode(b){ for(const k of ['onsite','included','deposit']) if(hasLog(b,'fee_'+k)) return k; return isDirect(b)?'deposit':null; }
function isPlatform(b){ const p=(b.platform||'').trim(); return !!p && p!=='Přímá'; }
function hasCover(msg,b){ return isPlatform(b) && (msg.key==='first'||msg.key==='welcome'); }
function buildCtx(b){ const L=msgLang(b), T=TPL[L], winter=isWinter(b.arrival), fm=feeMode(b), toGo=daysBetween(isoToday(),b.arrival);
  return { jmeno:guestName(b), termin:fmtTermin(b.arrival,b.departure,L),
    jakSePlati:!fm?'':(fm==='onsite'?T.payOnsite:fm==='included'?T.payIncluded:T.payDeposit+(hasLog(b,'fee_energy')?T.payEnergy:'')),
    novinka:newsFor(b,L), video:winter?VIDEO.winter:VIDEO.summer, videoObsah:winter?T.videoWinter:T.videoSummer,
    cas:arrivalTime(b), kdy:toGo<=0?T.inDays0:(toGo===1?T.inDays1:T.inDays2), platforma:(b.platform||'').trim(),
    kod:doorCodeFor(b)||'{KOD_DVERI}', guideLink:null, winter:winter }; } // odkaz s tokenem doplní /sprava/
function coverText(ctx,b){ return fill(tplFor(msgLang(b),'cover'),ctx); }
function buildParts(msg,ctx,b){
  const L=msgLang(b);
  // uvítací zpráva nese odkaz s tokenem hosta (průvodce) → server-side ji složit nejde, posílá se ze /sprava/
  if(msg.key==='welcome') return [{text:fill(tplFor(L,'welcomeCore'),ctx),needsToken:true,needsCode:!doorCodeFor(b)}];
  if(msg.key==='update') return [{text:fill(tplFor(L,'update'),ctx),needsCode:!doorCodeFor(b)}];
  if(msg.key==='first') return [{text:fill(tplFor(L,'first'),ctx)}];
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
// + ⚠️ host, který váhá. Stejná pravidla jako collectTasks() v sprava.js:
//  • krok, který už nedává smysl (stale), není dluh — do e-mailu jde jen jejich počet,
//  • „váhá" (reply_risk) se hlásí každý den, dokud pobyt nezačne nebo se stav nezmění.
// Mlčícím hostům se nepřipomíná (Pavel 13. 10. 2026: nic dalšího písemně).
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
  if (hasLog(b,'reply_risk') && !hasLog(b,'reply_ok') && b.arrival > today) tasks.push({ stay:s, booking:b, risk:true, date:'' });
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
// Hostům z platforem jde celý text přes platformu (záznam je tam pojistka při škodě) —
// z e-mailu ho zkopírovat nejde, proto tu mají jen krátkou průvodní zprávu na WhatsApp.
const PLATFORM_NOTE = '<div style="color:#6b736f;font-size:13px;margin-top:8px">Host z platformy: celý text pošli přes platformu — ve <a href="'+esc(SPRAVA_URL)+'">/sprava/</a> ho zkopíruješ jedním tlačítkem.</div>';
const firstHtml = !firstTasks.length ? '' : card(
  '<div style="font-weight:700;color:#182019;font-size:15px">💬 První ozvěna — '+firstTasks.length+'× na řadě</div>'+
  '<div style="color:#6b736f;font-size:13px;margin:2px 0 10px">Ozvat se hned, i když je příjezd za měsíce: kdo váhá, pozná se včas. Hostům z platforem pošli celý text přes platformu (zkopíruješ ho ve <a href="'+esc(SPRAVA_URL)+'">/sprava/</a>), tady je pro ně jen průvodní zpráva na WhatsApp. Po odeslání odklikni „Odesláno".</div>'+
  '<table style="width:100%;border-collapse:collapse;font-size:14px">'+firstTasks.map(t => { const b=t.booking, ctx=buildCtx(b), cover=hasCover(t.msg,b);
    return '<tr><td style="padding:6px 8px 6px 0;border-top:1px solid #eef0ef">'+esc(guestName(b))+'<div style="color:#8a918d;font-size:12px">'+esc(fmtShort(b.arrival,b.departure))+' · '+esc(msgLang(b).toUpperCase())+' · '+esc(b.platform||'Přímá')+'</div></td>'+
      '<td style="padding:6px 0;border-top:1px solid #eef0ef;text-align:right">'+waLinkSmall(waLink(b, cover?coverText(ctx,b):buildParts(t.msg,ctx,b)[0].text), cover?'WhatsApp (průvodní)':'WhatsApp')+'</td></tr>'; }).join('')+'</table>');

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
    action = '<div style="color:#6b736f;font-size:13px">Zpráva nese kód ke dveřím a odkaz s tokenem hosta (výlety podle počasí) — otevři ji ve <a href="'+esc(SPRAVA_URL)+'">/sprava/</a> a odešli odtud, všechno se tam doplní samo.</div>';
  } else {
    action = waBtn(waLink(b, parts[0].text)) + (isPlatform(b) ? PLATFORM_NOTE : '');
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
