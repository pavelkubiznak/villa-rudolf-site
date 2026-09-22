/* VrMailIngest — Code node „Naparsovat poštu" (n8n na Hetzneru).
 * STAV: PŘIPRAVENO, NENASAZENO. Referenční kopie kódu do Code node (bez tohoto
 * úvodního komentáře, jinak 1:1) — stejná konvence jako VrPaymentWatch. Jak workflow
 * poskládat, je v README.md vedle.
 *
 * Vstup: položky z Gmail node („Get Many", Simplify VYPNUTÉ — potřebujeme HTML tělo
 * a hlavičky). Výstup: JEDNA položka { ingestBody, summary }; HTTP node za tímhle
 * uzlem pošle ingestBody na RPC vr_ingest_mail. O tom, ke kterému pobytu e-mail patří
 * a co se doplní, rozhoduje DATABÁZE (20260917_vr_mail.sql), ne tenhle kód.
 *
 * OBSAH E-MAILU JE NEDŮVĚRYHODNÝ VSTUP. Čtou se z něj jen pole pevného tvaru (datum,
 * číslo, jméno omezené délky); nic se z něj neprovádí a tělo se nikam neukládá.
 * `summary` jde do logu n8n a majiteli e-mailem — proto v něm NEJSOU jména ani kontakty,
 * jen počty a typy.
 *
 * WRITE = false je ZKUŠEBNÍ REŽIM: databáze spáruje a zapíše, co BY doplnila, ale na
 * pobyty nesáhne. Parsery stojí na JEDNOM skutečném vzorku z každé platformy
 * (17. 9. 2026) — první dávku je potřeba přečíst v /sprava/ → „Z pošty", pak teprve
 * přepnout. Test hlídá, že verze v repu má WRITE vypnuté.
 *
 * Co která platforma opravdu posílá (ověřeno 17. 9. 2026):
 *   Booking „Nová rezervace!"  číslo + den příjezdu (jen v předmětu)
 *   Booking zpráva hosta        jméno, příjezd, odjezd, číslo, zástupný e-mail
 *   FeWo/Vrbo                   jméno, termín, osoby, HA-číslo, u žádosti cena a výplata;
 *                               telefon „Verfügbar nach Buchung". Z e-mailu NEJDE poznat,
 *                               jestli jde o dotaz, nebo potvrzenou rezervaci → databáze
 *                               FeWo nikdy nedoplňuje sama, jen navrhne k odklepnutí.
 *   e-chalupy poptávka          jméno, telefon, e-mail, POPTANÝ termín (sjednaný bývá jiný)
 *   Airbnb                      potvrzení rezervací do schránky nechodí → neparsuje se
 */
const WRITE = false;

// ---------- Telefon → mezinárodní tvar ----------
// Shodná logika s /sprava/ (normPhone) a VrDailyTasks (intlPhone).
// Když měníš jednu kopii, spusť tools/test-telefon.mjs — hlídá, že se nerozejdou.
const DIAL=[['351',9,9],['380',9,9],['385',8,9],['386',8,8],['420',9,9],['421',9,9],
  ['31',9,9],['32',8,9],['33',9,9],['34',9,9],['36',8,9],['39',6,11],['41',9,9],['43',8,13],
  ['44',9,10],['45',8,8],['46',7,13],['47',8,8],['48',9,9],['49',6,11],['1',10,10]];
const LANG_CC={cs:'420',de:'49',pl:'48'};
function dialInfo(d){ for(const x of DIAL) if(d.indexOf(x[0])===0) return x; return null; }
function dialFits(x,d){ const n=d.length-x[0].length; return n>=x[1]&&n<=x[2]; }
function intlPhone(phone,lang){
  const s=String(phone==null?'':phone).trim(); if(!s) return '';
  let intl=/^\+/.test(s), d=s.replace(/\D/g,''); if(!d) return '';
  if(!intl && d.indexOf('00')===0){ d=d.slice(2); intl=true; }
  if(!intl){
    const home=LANG_CC[lang]||null, x=dialInfo(d);
    if(d.charAt(0)==='0'){ if(!home) return ''; d=home+d.replace(/^0+/,''); }
    else if(x && dialFits(x,d)){ /* předvolba tam je, jen bez plusu */ }
    else if(home){ d=home+d; }
    else return '';
  }
  if(d.length<8||d.length>15) return '';
  const fin=dialInfo(d);
  return (fin && !dialFits(fin,d)) ? '' : d;
}

// ---------- Pomocné ----------
function htmlToText(html){
  return String(html==null?'':html)
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|tr|td|th|li|h\d)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
}
function squash(s){ return String(s==null?'':s).replace(/\s+/g, ' ').trim(); }
function pad2(n){ return (n<10?'0':'')+n; }
function iso(y,mo,d){
  if(!(y>2000&&y<2100)||mo<1||mo>12||d<1||d>31) return null;
  const dt=new Date(Date.UTC(y,mo-1,d));
  if(dt.getUTCDate()!==d||dt.getUTCMonth()!==mo-1) return null;
  return y+'-'+pad2(mo)+'-'+pad2(d);
}
// Jméno smí být jen jméno: písmena, mezery, pomlčka, apostrof, tečka. Cokoli jiného
// (odkaz, zavináč, číslice) znamená, že parser chytil něco, co jméno není.
function cleanName(s){
  const v=squash(s);
  if(!v || v.length>80 || !/^[\p{L}][\p{L}\s.'’-]*$/u.test(v)) return null;
  return v;
}
function splitName(full){
  const parts=squash(full).split(' ').filter(Boolean);
  if(!parts.length) return { first:null, last:null };
  if(parts.length===1) return { first:null, last:parts[0] };
  return { first:parts.slice(0,-1).join(' '), last:parts[parts.length-1] };
}
function money(s){ // „4.528,00“ → 4528
  const v=parseFloat(String(s||'').replace(/\./g,'').replace(',','.'));
  return isFinite(v) ? v : null;
}
const CZ_MONTHS={ledna:1,'února':2,'března':3,dubna:4,'května':5,'června':6,'července':7,
  srpna:8,'září':9,'října':10,listopadu:11,prosince:12};
const DE_MONTHS={jan:1,feb:2,'mär':3,mar:3,apr:4,mai:5,jun:6,jul:7,aug:8,sep:9,okt:10,nov:11,dez:12};
// „středa 2. června 2027“ → 2027-06-02
function czLongDate(s){
  const m=squash(s).toLowerCase().match(/(\d{1,2})\.\s*([a-záčďéěíňóřšťúůýž]+)\s+(\d{4})/);
  return m && CZ_MONTHS[m[2]] ? iso(+m[3], CZ_MONTHS[m[2]], +m[1]) : null;
}
function czDateToISO(s){
  const m=squash(s).match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  return m ? iso(+m[3], +m[2], +m[1]) : null;
}
// „7. Aug. - 14. Aug. 2027“ i „27. Dez. 2027 - 3. Jan. 2028“
function deRange(s){
  const m=squash(s).toLowerCase().match(/(\d{1,2})\.\s*([a-zä]{3})[a-zä]*\.?\s*(\d{4})?\s*[-–—]\s*(\d{1,2})\.\s*([a-zä]{3})[a-zä]*\.?\s*(\d{4})/);
  if(!m) return [null,null];
  const mo1=DE_MONTHS[m[2]], mo2=DE_MONTHS[m[5]], y2=+m[6];
  if(!mo1||!mo2) return [null,null];
  const y1=m[3] ? +m[3] : (mo1>mo2 ? y2-1 : y2);
  return [iso(y1,mo1,+m[1]), iso(y2,mo2,+m[4])];
}

// ---------- Booking.com ----------
function parseBookingNew(subject){
  const m=squash(subject).match(/Nová rezervace!\s*\((\d{8,12}),\s*([^)]+)\)/i);
  if(!m) return null;
  const arrival=czLongDate(m[2]);
  return { platform:'Booking.com', kind:'new_booking', booking_ref:m[1], arrival,
           incomplete: arrival ? null : 'příjezd' };
}
function parseBookingMessage(fromAddr, text){
  const a=String(fromAddr||'').toLowerCase().match(/^(\d{8,12})-[a-z0-9.\-_]+@guest\.booking\.com$/);
  if(!a) return null;
  const chybi=[];
  const nm=cleanName((text.match(/Jméno hosta:\s*(.+?)\s*Příjezd:/i)||[])[1]);
  const arrival=czLongDate((text.match(/Příjezd:\s*(.+?)\s*Odjezd:/i)||[])[1]);
  const departure=czLongDate((text.match(/Odjezd:\s*(.+?)\s*(?:Název ubytování|Číslo rezervace|$)/i)||[])[1]);
  if(!nm) chybi.push('jméno'); if(!arrival) chybi.push('příjezd'); if(!departure) chybi.push('odjezd');
  const n=splitName(nm||'');
  return { platform:'Booking.com', kind:'guest_message', booking_ref:a[1],
           first_name:n.first, last_name:n.last, email:a[0], arrival, departure,
           incomplete: chybi.join(', ')||null };
}

// ---------- FeWo-direkt / Vrbo ----------
function parseFewo(subject, text){
  if(!/FeWo-direkt\.de\s+#\d+/i.test(subject) ||
     !/^(?:(?:AW|WG|RE|FW):\s*)*(Anfrage von|Reservierungsanfrage von|Reservierung für)\s/i.test(squash(subject))) return null;
  const chybi=[];
  const ref=(text.match(/Reservierungsnr\.?\s*(HA-[A-Z0-9]{4,12})/i)||[])[1]||null;
  const [arrival,departure]=deRange((text.match(/Zeitraum\s*(.+?),\s*\d+\s*N[äa]chte?/i)||[])[1]
                                   || (squash(subject).match(/:\s*(.+?)\s+-\s+FeWo-direkt/i)||[])[1] || '');
  const g=text.match(/Gäste\s*(\d+)\s*Erwachsene?(?:,\s*(\d+)\s*Kind)?/i);
  const nm=cleanName((text.match(/Name Urlauber\s*(.+?)\s*Telefonnummer Urlauber/i)||[])[1]);
  const telRaw=(text.match(/Telefonnummer Urlauber\s*([+0-9][0-9 ()\/.-]{5,20})/i)||[])[1]||null;
  const tel=telRaw ? intlPhone(telRaw,'de') : '';
  const price=money((text.match(/Buchungsbetrag\s*([\d.]+,\d{2})\s*€/i)||[])[1]);
  const payout=money((text.match(/Auszahlung\*{0,2}\s*([\d.]+,\d{2})\s*€/i)||[])[1]);
  if(!nm) chybi.push('jméno'); if(!arrival||!departure) chybi.push('termín'); if(!ref) chybi.push('číslo rezervace');
  const n=splitName(nm||'');
  return { platform:'Fewo-direkt', kind:'booking_request', booking_ref:ref,
           first_name:n.first, last_name:n.last, phone: tel ? '+'+tel : null,
           arrival, departure, adults: g ? +g[1] : null, children: g && g[2] ? +g[2] : (g ? 0 : null),
           price, payout, currency: (price!=null||payout!=null) ? 'EUR' : null,
           incomplete: chybi.join(', ')||null };
}

// ---------- e-chalupy ----------
// Tvar těla (vymyšlené údaje): „… odeslal: Jana Nováková, telefon: 728111222
// požadovaný termín: 24.7.2027 - 31.7.2027 počet osob: 14 dospělých + 6 dětí
// email: jana.novakova@example.cz … ID zprávy: 3999001 / ID objektu: 18852“
function parseEchalupy(subject, text){
  if(!/Poptávka z e-chalupy\.cz/i.test(subject)) return null;
  const chybi=[];
  const NEXT='(?=,?\\s*(?:telefon|požadovaný termín|počet osob|email|e-mail|Email byl zaslán|ID zprávy)\\b|$)';
  // Čte se jen část od „odeslal:“ — před ní je volný vzkaz hosta, ve kterém může stát cokoli.
  const i0=text.search(/odeslal:/i); const form=i0<0 ? '' : text.slice(i0);
  const pick=(re)=>{ const m=form.match(re); return m ? squash(m[1]) : null; };
  const nm=cleanName(pick(new RegExp('odeslal:\\s*(.+?)'+NEXT,'i')));
  const telRaw=pick(new RegExp('telefon:\\s*([+0-9 ()/.-]{6,})'+NEXT,'i'));
  const termin=pick(new RegExp('požadovaný termín:\\s*(.+?)'+NEXT,'i'));
  const osoby=pick(new RegExp('počet osob:\\s*(.+?)'+NEXT,'i'));
  const email=pick(/e-?mail:\s*([^\s,;<>"]+@[^\s,;<>"]+\.[a-z]{2,})/i);
  let arrival=null, departure=null;
  const t=termin && termin.match(/^(.+?)\s*[-–—]\s*(.+)$/);
  if(t){ arrival=czDateToISO(t[1]); departure=czDateToISO(t[2]); }
  const a=osoby && osoby.match(/(\d+)\s*dosp/i), d=osoby && osoby.match(/(\d+)\s*(?:d[ěe]t|dít)/i);
  const tel=telRaw ? intlPhone(telRaw,'cs') : '';
  if(!nm) chybi.push('jméno'); if(!tel) chybi.push('telefon'); if(!email) chybi.push('e-mail');
  if(!arrival||!departure) chybi.push('termín');
  const n=splitName(nm||'');
  return { platform:'E-chalupy', kind:'inquiry',
           booking_ref:(text.match(/ID zprávy:\s*(\d+)/i)||[])[1]||null,
           first_name:n.first, last_name:n.last, phone: tel ? '+'+tel : null, email,
           arrival, departure, adults: a ? +a[1] : null, children: d ? +d[1] : (a ? 0 : null),
           incomplete: chybi.join(', ')||null };
}

// ---------- Rozpoznání odesílatele ----------
// Adresa odesílatele se dá podvrhnout; Gmail ale do hlaviček píše výsledek ověření.
// Když hlavička je a DKIM neprošel, e-mail se zahodí. (Dopad podvrhu je i tak malý:
// doplňují se jen prázdná pole a majitel to vidí v /sprava/.)
function fromAddress(j){
  const f=j.from;
  if(f && f.value && f.value[0] && f.value[0].address) return String(f.value[0].address).toLowerCase();
  const s=String((f && f.text) || f || (j.headers && j.headers.from) || '');
  const m=s.match(/<([^>]+)>/) || s.match(/([^\s<>]+@[^\s<>]+)/);
  return m ? m[1].toLowerCase() : '';
}
function dkimFailed(j){
  const h=j.headers||{};
  const ar=String(h['authentication-results']||h['Authentication-Results']||'');
  return ar !== '' && !/dkim=pass/i.test(ar);
}
function parseMail(j){
  const from=fromAddress(j), subject=String(j.subject||(j.headers&&j.headers.subject)||'');
  const raw=j.html||j.textHtml||j.textAsHtml||j.text||j.textPlain||j.snippet||'';
  const text=squash(/<[a-z][\s\S]*>/i.test(raw) ? htmlToText(raw) : raw);
  if(from==='noreply@booking.com') return parseBookingNew(subject);
  if(/@guest\.booking\.com$/.test(from)) return parseBookingMessage(from, text);
  if(from==='sender@messages.homeaway.com') return parseFewo(subject, text);
  if(from==='info@e-chalupy.cz') return parseEchalupy(subject, text);
  return null;
}

/* ---------- n8n obal ---------- */
const rows=[]; const counts={}; let skipped=0, spoofed=0;
for(const item of $input.all()){
  const j=item.json||{};
  if(!j.id){ skipped++; continue; }
  if(dkimFailed(j)){ spoofed++; continue; }
  let p=null;
  try{ p=parseMail(j); }catch(e){ p=null; }   // parser nesmí shodit běh
  if(!p){ skipped++; continue; }
  p.gmail_id=String(j.id);
  const dt=new Date(j.date || (j.internalDate ? +j.internalDate : NaN));
  p.received_at=isNaN(dt) ? null : dt.toISOString();
  rows.push(p);
  const k=p.platform+' / '+p.kind+(p.incomplete ? ' (neúplné)' : '');
  counts[k]=(counts[k]||0)+1;
}
return [{ json: {
  ingestBody: { p_rows: rows, p_write: WRITE },
  summary: { write: WRITE, parsed: rows.length, skipped, spoofed, counts }
} }];
