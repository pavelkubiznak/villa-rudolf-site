/* VrDailyTasks — Code node „Spočítat úkoly" (n8n na Hetzneru sintera-radar).
 * NASAZENO: n8n workflow id VrDailyTasks001, cron 30 7 * * * (Europe/Prague).
 * Tento soubor je REFERENČNÍ kopie kódu vloženého do Code node; slouží k revizi
 * a verzování. Při změně šablon/sekvence v /sprava/sprava.js DRŽ TENTO SOUBOR
 * V SYNCU a vlož ho zpět do Code node (import:workflow nebo editor n8n).
 * Data: vr_bookings přes Supabase service-role (credential VrSupaService01,
 * apikey=anon inline + Authorization=Bearer service-role z credentialu).
 * E-mail: SMTP credential VrSmtpGmail0001 (Gmail app-password).
 */
// VrDailyTasks — spočítá dnešní úkoly STEJNOU logikou jako sekce DNES v /sprava/
// (časová osa T0/T−7/T−5/příjezd/den2/odjezd−24h/ráno-odjezdu vs. vr_msglog;
// + nespárované pobyty z kalendáře do 21 dní = „doplnit kontakt"). Když je co,
// vytvoří 1 položku s předmětem + HTML e-mailem (wa.me odkazy s dosazenými
// šablonami). Když není nic, vrátí [] → e-mail se neodešle.

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
function isWinter(iso){ const d=parseISO(iso),m=d.getMonth()+1,day=d.getDate(); return (m===1||m===2||m===3)||(m===11||m===12)||(m===10&&day>=15); }

/* ---------- šablony (zrcadlí /sprava/sprava.js) ---------- */
const TPL = {};
TPL.confirm='Dobrý den, {JMENO},\n\nděkujeme za rezervaci — {TERMIN} je Villa Rudolf vaše a my s vámi počítáme! 🙂\n\nDo pobytu je ještě čas, tak jen tři věci, které se hodí vědět už teď:\n\n🛂 *Doklady — hlavně pro děti*\nPři příjezdu registrujeme všechny ubytované včetně dětí (evidence pro město). Zkontrolujte prosím včas, že **každý ve skupině má vlastní cestovní doklad — i děti**. Spousta rodin zjistí až na místě, že děti pas nebo občanku vůbec nemají, a vyřízení trvá i pár týdnů. Teď je na to ideální čas.\n\n🥾 *Co se u nás dá podniknout*\nVýlety, sjezdovky i tipy s mapou najdete na https://villarudolf.com/vylety/ — klidně si začněte plánovat. Před příjezdem od nás dostanete i osobní stránku s doporučeními na míru vaší skupině.\n\n📬 *Co bude dál*\nTýden před příjezdem vám pošlu jednu velkou zprávu se vším důležitým (adresa, vstup, dům) a pár dní nato odkaz na pohodlnou registraci předem — na místě už pak nemusíte řešit nic.\n\nKdybyste cokoli potřebovali už teď, napište nebo zavolejte: +420 775 220 785.\n\nTěšíme se na vás!\nPavel Kubizňák, Villa Rudolf';
TPL.welcomeCore='Dobrý den, {JMENO},\n\nmoc se na vás těšíme — {TERMIN} bude Villa Rudolf jen vaše! Posílám všechno důležité v jedné zprávě, ať ji máte po ruce.\n\n📍 *Kam jedete*\nVilla Rudolf, Luční 519, Svoboda nad Úpou. Parkujete přímo na pozemku u domu.\n\n🕒 *Dům je váš od 15:00*\nDopoledne ho po předchozí partě chystáme do plné parády — proto prosím nejezděte dřív, ať vás nevítáme s vysavačem v ruce. 🙂\n\n🔑 *Vstup bez klíčů*\nDveře otevřete kódem, který vám pošlu zvlášť v den příjezdu. Nechte si ho prosím jen ve své skupině a při odchodu vždy mrkněte, že jsou dveře zavřené — dům je po celý pobyt jen váš.\n\n🏠 *Prohlédněte si dům už teď*\nVirtuální prohlídka: https://www.keypano.com/v/569g7v8_96ci86-1770715560.html\nVideo k domu: https://youtu.be/tWCuuovnh2U\n\n📝 *Registrace po příjezdu*\nQR kód najdete na lednici — vyplňte prosím co nejdřív za všechny, tedy {DOSPELI} dospělých i {DETI} dětí. Není to náš výmysl, město vede evidenci k místnímu poplatku; zabere to pár minut a máte to z krku.\n\n💳 *Místní poplatek (jde městu, ne nám)*\n25 Kč / 1 € za dospělého a noc. U vás: {DOSPELI} dospělých × {NOCI} nocí = {CASTKA} Kč. Nejjednodušší kartou přes https://revolut.me/pavelhuqh, klidně ale i hotově na místě.\n\n🌙 *Večery*\nJsme v horském údolí, které nese zvuk dál, než byste čekali — a sousedé kolem tu žijí celý rok, ne jen na víkend. Hudba proto u nás hraje jen uvnitř domu: reproduktory na pozemek prosíme vůbec, ani přes den. Večer u ohně to bohatě vynahradí praskání dřeva a ticho, jaké ve městě neuslyšíte. Po desáté večer buďte prosím venku úplně potichu — lidé okolo ráno vstávají do práce a v létě spí při otevřených oknech, a hluk je bohužel rychle přiměje volat policii. Večer u ohně je krásný i potichu, uvidíte. Uvnitř si poseďte, jak dlouho chcete.\n\n📶 *Wi-Fi všude*\nSíť „Rudolf Wi-Fi", heslo: {WIFI_HESLO}. Chytá v celém domě i po celém pozemku — od ohniště přes pergolu až po dětské hřiště.\n\n📞 *Kdyby cokoliv*\nPavel: +420 775 220 785 — pište, volejte, jsem tu pro vás.\nNemocnice Trutnov: +420 499 866 111 (Maxima Gorkého 77, Trutnov)\nTíseň: 112 · záchranka 155 · policie 158 · hasiči 150 · městská policie 156\nHorská služba: +420 602 448 338\n\nTěšíme se na vás!\nPavel';
TPL.summer='☀️ *Léto u Rudolfa — pár věcí navíc*\n\n🏊 *Bazén* (v provozu zhruba květen–září, vyhřívaný na ~27 °C — trochu podle počasí)\nPředáváme ho vždy zamčený — klíče jsou v kuchyni v levé horní skříňce (při pohledu na linku úplně nahoře vlevo). Zamčený je kvůli bezpečí dětí: k vodě prosím vždy jen pod dohledem dospělého, nikdy samy — stačí okamžik nepozornosti. Po koupání bazén zase zavřete a zamkněte, krásně tak drží teplotu i čistotu. A skleničky nechte prosím na terase — kdyby se sklo v bazénu rozbilo, museli bychom ho celý vypustit, vyčistit a znovu napouštět a ohřívat, a to je pro vás den i víc bez koupání.\n\n🔥 *Ohniště, gril, dřevo*\nVelké ohniště, pergola-altán i elektrické grily čekají na vás. Dřevo je pod dvěma smrky u parkoviště — v přístřešku najdete sekeru, pilu i opékací jehly, zámek otevřete kódem *0519*. Jedno upozornění s péčí: když se oheň protáhne do noci, uhlíky bývají ráno pořád horké — ohlídejte prosím malé zvědavce, ohniště je ráno láká.\n\n🧖 *Sauna*\nPřipravená pro vás — návod je v letním videu i přímo u sauny. Dovnitř s ručníkem, prosím.\n\n🎬 *Všechno pohromadě v letním videu* (přivítání, bazén, sauna, dřevo, registrace):\nhttps://www.youtube.com/watch?v=ksVpDr-P8ic\n\nAť vám léto u Rudolfa chutná!\nPavel';
TPL.winter='❄️ *Zima u Rudolfa — ať jste na svahu dřív než fronty*\n\n🚌 *Skibus kousek od domu*\nJak na zastávku, ukazuje krátké video: https://youtu.be/ZX8HJqZ1YBQ\nJízdní řády: https://drive.google.com/drive/folders/1HPJI7XydWwljBq_V19QwJGuBQWn73dZe\nPřed cestou si prosím ověřte aktuální jízdní řád — v sezóně se občas mění.\n\n🎿 *Lyžárna přímo v domě*\nLyže i boty tam přes noc krásně oschnou a ráno vyrážíte v suchém a teplém.\n\n🧖 *Sauna*\nPo dni na svahu to nejlepší zakončení. Návod najdete ve videu k domu i přímo u sauny — jen ručník s sebou.\n\nKdyby cokoliv, jsem na telefonu. Užijte si hory!\nPavel';
TPL.registration='Dobrý den, {JMENO}, posílám slíbený odkaz na registraci — vyřídíte ji za pár minut už teď: {REGISTRACNI_LINK} — ať po příjezdu jen odpočíváte. Kdyby cokoliv, jsem na telefonu.\nPavel';
TPL.deposit='Dobrý den, {JMENO}, ještě jedna praktická věc k pobytu {TERMIN}. Vybíráme vratnou kauci {KAUCE} Kč — je to jen jistota pro případ škody, po odjezdu a rychlé kontrole domu vám ji obratem vracíme zpět v plné výši. Pošlete ji prosím pohodlně kartou přes Revolut: '+REVOLUT_URL+' ({KAUCE} Kč). Díky moc a těšíme se na vás!\nPavel';
TPL.doorcode='Dobrý den {JMENO}, dům je připravený a od 15:00 jen váš! 🔑 Kód ke dveřím: {KOD_DVERI} — nechte ho prosím jen ve vaší skupině. Šťastnou cestu, a kdybyste cokoliv potřebovali, jsem na telefonu. Pavel';
TPL.day2='Dobrý den, {JMENO}, jen se hlásím po první noci — máte všechno, jak má být? 🙂 Kdyby cokoliv drhlo nebo jste něco nemohli najít, napište mi nebo rovnou zavolejte (+420 775 220 785) — vyřeším to hned. Užívejte hory!\nPavel';
TPL.predeparture='Dobrý den, {JMENO}, zítra se budeme loučit — snad vám bylo u Rudolfa dobře! Než vyrazíte, poprosím o pár drobností (dohromady tak 10 minut) — o všechno ostatní se postará úklidová služba:\n\n🍽 nádobí do myčky a zapnout ji\n🗑 odpadky do označených nádob — díky za základní roztřídění\n🛏 povlečení svléknout a spolu s ručníky nechat na určeném místě\n🧺 půjčené vybavení vrátit tam, kde jste ho našli\n🔍 mrknout na zavřená okna a dveře, vypnuté spotřebiče (v létě i zamčený bazén)\n\nDům prosím předejte do 10:00 — v deset nastupuje úklid, aby v 15:00 přebírala další parta dům stejně nachystaný, jako jste ho přebírali vy.\n\nDíky moc, že to s námi dotáhnete do konce. Šťastnou cestu!\nPavel';
TPL.reviewBody='Dobrý den, {JMENO}, dnes se loučíme — a moc rádi jsme vás u Rudolfa měli. Snad si z hor odvážíte přesně to, pro co jste jeli.\n\nJen drobná připomínka: dům prosím předejte do 10:00. Nechceme vás vyhánět, slibuju 🙂 — jen v deset nastupuje úklidová služba, aby v 15:00 mohla vítat další hosty.\n\nA pak jedna prosba, která pro nás znamená opravdu hodně. Jsme malý rodinný pronájem a hodnocení jsou to hlavní, podle čeho si Rudolfa najdou další party a rodiny.\n';
TPL.reviewAirbnb='\nPokud cítíte, že si zasloužíme plných 5 hvězdiček, budeme moc vděční, když nám je na Airbnb dáte — pomáhá nám to víc, než se zdá. A kdyby cokoliv, byť maličkost, nebylo stoprocentní, napište to prosím rovnou mně sem na WhatsApp — já to totiž můžu napravit, recenze už ne. 🙂\n\nŠťastnou cestu domů — a kdykoli se budete chtít do Krkonoš vrátit, Rudolf i my tu budeme!\nPavel';
TPL.reviewBooking='\nPokud cítíte, že si zasloužíme plných 10 z 10, budeme moc vděční, když nám je na Bookingu dáte — pomáhá nám to víc, než se zdá. A kdyby cokoliv, byť maličkost, nebylo stoprocentní, napište to prosím rovnou mně sem na WhatsApp — já to totiž můžu napravit, recenze už ne. 🙂\n\nŠťastnou cestu domů — a kdykoli se budete chtít do Krkonoš vrátit, Rudolf i my tu budeme!\nPavel';
TPL.reviewGoogle='\nPokud cítíte, že si zasloužíme plné hodnocení, budeme moc vděční za recenzi na Googlu — pomáhá nám to víc, než se zdá. A kdyby cokoliv, byť maličkost, nebylo stoprocentní, napište to prosím rovnou mně sem na WhatsApp — já to totiž můžu napravit, recenze už ne. 🙂\n\nŠťastnou cestu domů — a kdykoli se budete chtít do Krkonoš vrátit, Rudolf i my tu budeme!\nPavel';
function reviewVariant(platform){ const p=(platform||'').toLowerCase();
  if(p.indexOf('airbnb')>=0) return {label:'Airbnb (5★)', text:TPL.reviewBody+TPL.reviewAirbnb};
  if(p.indexOf('booking')>=0) return {label:'Booking (10/10)', text:TPL.reviewBody+TPL.reviewBooking};
  return {label:'Google', text:TPL.reviewBody+TPL.reviewGoogle}; }
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
  if(msg.key==='welcome') return [{label:'Uvítací zpráva (jádro)',text:fill(TPL.welcomeCore,ctx)},{label:ctx.winter?'Zimní modul':'Letní modul',text:fill(ctx.winter?TPL.winter:TPL.summer,ctx)}];
  if(msg.key==='confirm') return [{text:fill(TPL.confirm,ctx)}];
  if(msg.key==='registration') return [{text:fill(TPL.registration,ctx),needsToken:true}]; // token není server-side
  if(msg.key==='deposit_charge') return [{text:fill(TPL.deposit,ctx)}];
  if(msg.key==='deposit_return') return [{text:'',ownerTask:true}];
  if(msg.key==='doorcode') return [{text:fill(TPL.doorcode,ctx),needsCode:!b.door_code}];
  if(msg.key==='day2') return [{text:fill(TPL.day2,ctx)}];
  if(msg.key==='predeparture') return [{text:fill(TPL.predeparture,ctx)}];
  if(msg.key==='review'){ const rv=reviewVariant(b.platform); return [{text:fill(rv.text,ctx),variantLabel:rv.label}]; }
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

// collectTasks() — dnešní/po termínu zprávy + nespárované do 21 dní
const tasks = [];
stays.forEach(s => {
  if (s.booking) {
    const b = s.booking; const sent = {}; (b.msglog||[]).forEach(m=>sent[m.msg_key]=true);
    sequenceFor(b).forEach(msg => { if (sent[msg.key]) return; const d = schedDate(msg,b); if (d>today) return;
      tasks.push({ stay:s, booking:b, msg:msg, date:d, overdue:d<today }); });
  } else {
    // nespárováno — „doplnit kontakt", pokud začíná do 21 dní (a je v okně)
    if (s.start <= addDaysISO(today,21) && s.end >= today && s.start >= addDaysISO(today,-14))
      tasks.push({ stay:s, warn:true, date:s.start });
  }
});
tasks.sort((a,b)=> a.date<b.date?-1:a.date>b.date?1:0);

if (!tasks.length && !hasConflicts) return []; // nic → žádný e-mail

/* ---------- HTML e-mail ---------- */
function card(inner){ return '<div style="background:#fff;border:1px solid #e6e8e7;border-radius:12px;padding:14px 16px;margin:10px 0">'+inner+'</div>'; }
function waBtn(href){ return '<a href="'+esc(href)+'" style="display:inline-block;background:#25D366;color:#06280F;font-weight:700;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:14px">Otevřít ve WhatsApp ↗</a>'; }
const rows = tasks.map(t => {
  if (t.warn) {
    return card('<div style="font-weight:700;color:#182019">⚠️ '+esc(fmtShort(t.stay.start,t.stay.end))+' — '+esc(t.stay.platform)+'</div>'+
      '<div style="color:#6b736f;font-size:13px;margin:4px 0 10px">Pobyt z kalendáře bez kontaktu — <b>doplnit hosta</b> (do 21 dní).</div>'+
      '<a href="'+esc(SPRAVA_URL)+'" style="display:inline-block;background:#D68A4C;color:#20140A;font-weight:700;text-decoration:none;padding:9px 16px;border-radius:8px;font-size:14px">Doplnit v /sprava/ ↗</a>');
  }
  const b = t.booking, ctx = buildCtx(b), parts = buildParts(t.msg, ctx, b);
  const when = t.overdue ? '<span style="color:#c47b1a;font-weight:700">po termínu</span>' : '<span style="color:#0E7A46;font-weight:700">dnes</span>';
  const variant = parts[0] && parts[0].variantLabel ? ' · '+esc(parts[0].variantLabel) : '';
  let action;
  if (t.msg.ownerTask) {
    action = '<div style="color:#6b736f;font-size:13px">🔁 Připomínka jen pro tebe — vratku '+DEPOSIT_CZK.toLocaleString('cs-CZ')+' Kč pošli přes <a href="'+esc(REVOLUT_URL)+'">Revolut</a>.</div>';
  } else if (parts[0].needsToken) {
    action = '<div style="color:#6b736f;font-size:13px">Registrační odkaz je vázán na tvé zařízení — odešli krok z <a href="'+esc(SPRAVA_URL)+'">/sprava/</a>.</div>';
  } else if (parts[0].needsCode) {
    action = '<div style="color:#c47b1a;font-size:13px">Chybí kód ke dveřím — doplň ho v <a href="'+esc(SPRAVA_URL)+'">/sprava/</a> a odešli odtud.</div>';
  } else if (!b.phone) {
    action = '<div style="color:#c47b1a;font-size:13px">Chybí telefon — doplň v <a href="'+esc(SPRAVA_URL)+'">/sprava/</a>.</div>';
  } else {
    // welcome má 2 části → 2 tlačítka
    action = parts.filter(p=>p.text).map((p,i)=> (p.label?'<div style="font-size:12px;color:#8a918d;margin:8px 0 4px">'+esc(p.label)+'</div>':'') + waBtn(waLink(b.phone, p.text))).join(' ');
  }
  return card('<div style="font-weight:700;color:#182019;font-size:15px">'+esc(guestName(b))+'</div>'+
    '<div style="color:#6b736f;font-size:13px;margin:2px 0 10px">'+esc(t.msg.title)+variant+' · '+when+'</div>'+ action);
}).join('');

const n = tasks.length;
const word = n===1?'úkol':(n>=2&&n<=4?'úkoly':'úkolů');
const dnes = (function(){ const d=parseISO(today); return d.getDate()+'. '+MONTH_GEN[d.getMonth()]+' '+d.getFullYear(); })();

// sekce konfliktů (nahoře, jen shrnutí + odkaz — detailní e-mail poslal VrConflictWatch)
const cn = conflicts.overlaps.length + conflicts.vanished.length;
function conflCard(inner){ return '<div style="background:#fff;border:1px solid #efd0d0;border-left:4px solid #c0392b;border-radius:12px;padding:12px 15px;margin:8px 0">'+inner+'</div>'; }
let conflHtml = '';
if (hasConflicts) {
  const parts = [];
  conflicts.overlaps.forEach(o => {
    const an = o.a.booking?guestName(o.a.booking):'—', bn = o.b.booking?guestName(o.b.booking):'—';
    parts.push(conflCard('<div style="font-weight:700;color:#8a1111;font-size:15px">🔴 Dvojitá rezervace — '+esc(fmtTermin(o.os,o.oe))+'</div>'+
      '<div style="color:#333;font-size:14px;margin:6px 0 2px">'+esc(o.a.platform||'—')+' · '+esc(an)+' &nbsp;×&nbsp; '+esc(o.b.platform||'—')+' · '+esc(bn)+'</div>'+
      (o.known?'<div style="color:#0E7A46;font-size:13px;margin-top:6px">✔ Známý — už se řeší.</div>':'')));
  });
  conflicts.vanished.forEach(v => { const b=v.booking;
    parts.push(conflCard('<div style="font-weight:700;color:#8a5a11;font-size:15px">🟡 Pobyt zmizel z kalendáře — '+esc(fmtTermin(b.arrival,b.departure))+'</div>'+
      '<div style="color:#333;font-size:14px;margin:6px 0 2px">'+esc(b.platform||'—')+' · '+esc(guestName(b))+' — storno? Ověř a případně smaž ve správě.</div>'));
  });
  conflHtml = '<div style="margin:2px 0 6px"><span style="display:inline-block;background:#c0392b;color:#fff;font-weight:700;font-size:12px;letter-spacing:.05em;padding:4px 10px;border-radius:6px">🔴 HLÍDAČ KALENDÁŘE</span></div>'+
    parts.join('')+
    '<p style="color:#6b736f;font-size:13px;margin:2px 0 18px">Řeš to hned — čím dřív, tím levnější. Detaily a řešení v <a href="'+esc(SPRAVA_URL)+'">/sprava/</a>.</p>';
}

const subject = hasConflicts
  ? ('🔴 Villa Rudolf — konflikt v kalendáři' + (n>0 ? (' + '+n+' '+word) : ''))
  : ('Villa Rudolf — dnes: '+n+' '+word);
const heading = (n>0) ? ('Dnes na řadě: '+n+' '+word) : 'Konflikt v kalendáři';
const html = '<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>'+
  '<body style="margin:0;background:#f4f5f4"><div style="max-width:640px;margin:0 auto;padding:22px 14px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2422">'+
  '<p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#D68A4C;font-weight:700;margin:0 0 2px">Villa Rudolf · správa pobytů</p>'+
  '<h1 style="font-size:21px;margin:0 0 2px">'+esc(heading)+'</h1>'+
  '<p style="color:#6b736f;font-size:14px;margin:0 0 14px">'+esc(dnes)+' · přehled a odeslání také v <a href="'+esc(SPRAVA_URL)+'">/sprava/</a></p>'+
  conflHtml +
  rows +
  '<p style="color:#8a918d;font-size:12px;margin-top:22px;border-top:1px solid #e6e8e7;padding-top:12px">Automatická denní připomínka (n8n · VrDailyTasks). Šablony a wa.me odkazy zrcadlí sekci DNES v /sprava/. Odkazy odesílají zprávu ručně z tvého WhatsAppu — nic se neposílá samo.</p>'+
  '</div></body></html>';

return [{ json: { subject, html, to: 'pavel.kubiznak@gmail.com', count: n, conflicts: cn } }];
