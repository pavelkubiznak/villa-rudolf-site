/* VrEchalupyInquiry — Code node „Naparsovat poptávku" (n8n na Hetzneru sintera-radar).
 * STAV: PŘIPRAVENO, zatím NENASAZENO. Referenční kopie kódu do Code node
 * (bez tohoto úvodního komentáře, jinak 1:1) — stejná konvence jako VrDailyTasks.
 *
 * DRUHÁ KOPIE: VrEchalupyInquiry.workflow.json má tenhle kód vložený (taky bez
 * úvodního komentáře) — ten soubor je na rozdíl od VrDailyTasks.workflow.json
 * importovatelný. Když měníš kód tady, přegeneruj i jeho, ať se nerozejdou.
 *
 * K NASAZENÍ CHYBÍ: (1) credential gmailOAuth2 — na instanci žádný pro čtení
 * pošty není (Gmail SMTP umí jen odesílat, Google Drive SA je Sintery), musí ho
 * v editoru vytvořit majitel účtu; (2) rozhodnutí, co s naparsovanou poptávkou
 * dál — viz „Co dál" na konci souboru. Proto je workflow v JSONu active:false.
 *
 * Trigger: Gmail, filtr `from:info@e-chalupy.cz subject:"Poptávka z e-chalupy.cz"`.
 * Vstup: položka z Gmail node. Bere se HTML tělo — Gmail API v plaintextu převádí
 * tučné části na VELKÁ PÍSMENA, takže z textu vyjde „LUCIE PAPCUNOVÁ" a
 * „LUCKABARBIE@ATLAS.CZ". Z HTML se čte původní zápis.
 *
 * Výstup: 1 položka s naparsovanými poli + hotovým payloadem pro RPC
 * vr_admin_upsert_booking. ZÁMĚRNĚ NIC NEZAKLÁDÁ — poptávka není rezervace
 * a většina se jich nepromění v pobyt; zakládat pobyt z každé by zanesla
 * databázi lidmi, co nikdy nepřijedou. Napojení na Supabase je až další krok
 * (viz „Co dál" na konci souboru).
 *
 * POZOR: postaveno na JEDNOM reálném vzorku (červenec 2026) —
 * e-chalupy posílají poptávku zhruba jednou za rok. Odchylky ve formátu proto
 * nejsou vyloučené; parser nikdy nespadne, chybějící pole vrátí jako null
 * a označí `uplne:false`, ať se pozná, že to chce lidské oko.
 */
// ---------- Telefon → mezinárodní tvar ----------
// Shodná logika s /sprava/ (normPhone v sprava.js) a VrDailyTasks (intlPhone).
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
// HTML → text. <br> a </p> na zlom řádku, zbytek pryč, entity zpět.
function htmlToText(html){
  return String(html==null?'':html)
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|tr|li)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
}
// Hodnoty v e-mailu jsou rozlámané zalomením uvnitř <strong> („14\ndospělých“),
// takže se před hledáním všechny bílé znaky srazí na jednu mezeru.
function squash(s){ return String(s==null?'':s).replace(/\s+/g, ' ').trim(); }

function pad2(n){ return (n<10?'0':'')+n; }
// „24.7.2027“ i „24. 7. 2027“ → „2027-07-24“. Nesmysl vrátí null.
function czDateToISO(s){
  const m = squash(s).match(/^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})$/);
  if(!m) return null;
  const d=+m[1], mo=+m[2], y=+m[3];
  if(mo<1||mo>12||d<1||d>31) return null;
  const dt=new Date(Date.UTC(y,mo-1,d));
  if(dt.getUTCDate()!==d||dt.getUTCMonth()!==mo-1) return null; // 31.2. apod.
  return y+'-'+pad2(mo)+'-'+pad2(d);
}
// „Jana Nováková“ → {first:'Jana', last:'Nováková'}. Poslední slovo = příjmení.
function splitName(full){
  const parts = squash(full).split(' ').filter(Boolean);
  if(!parts.length) return { first:'', last:'' };
  if(parts.length===1) return { first:'', last:parts[0] };
  return { first: parts.slice(0,-1).join(' '), last: parts[parts.length-1] };
}

/* ---------- Vlastní parser ----------
 * Tvar těla (ukázka s vymyšlenými údaji — reálná poptávka do repa nepatří):
 *   Bez vzkazu - viz upřesnění termínu a počtu osob.
 *   odeslal: Jana Nováková, telefon: 728111222
 *   požadovaný termín: 24.7.2027 - 31.7.2027
 *   počet osob: 14 dospělých + 6 dětí
 *   email: jana.novakova@example.cz
 *   ... ID zprávy: 3999001 / ID objektu: 18852
 * Popisky se hledají bez ohledu na velikost písmen a na to, kde končí řádek.
 */
function parseEchalupy(rawHtmlOrText){
  const looksHtml = /<[a-z][\s\S]*>/i.test(String(rawHtmlOrText||''));
  const text = squash(looksHtml ? htmlToText(rawHtmlOrText) : rawHtmlOrText);
  const chybi = [];

  const pick = (re, label) => {
    const m = text.match(re);
    if(!m) { chybi.push(label); return null; }
    return squash(m[1]) || (chybi.push(label), null);
  };

  // Hodnota končí tam, kde začíná další popisek — proto ty lookaheady.
  const NEXT = '(?=,?\\s*(?:telefon|požadovaný termín|počet osob|email|e-mail|Email byl zaslán|ID zprávy)\\b|$)';
  const jmeno  = pick(new RegExp('odeslal:\\s*(.+?)' + NEXT, 'i'), 'jméno');
  const tel    = pick(new RegExp('telefon:\\s*([+0-9 ()/.-]{6,})' + NEXT, 'i'), 'telefon');
  const termin = pick(new RegExp('požadovaný termín:\\s*(.+?)' + NEXT, 'i'), 'termín');
  const osoby  = pick(new RegExp('počet osob:\\s*(.+?)' + NEXT, 'i'), 'počet osob');
  const email  = pick(new RegExp('e-?mail:\\s*([^\\s,;]+@[^\\s,;]+)' + NEXT, 'i'), 'e-mail');

  // termín „24.7.2027 - 31.7.2027“ (pomlčka i en-dash)
  let arrival=null, departure=null;
  if(termin){
    const m = termin.match(/^(.+?)\s*[-–—]\s*(.+)$/);
    if(m){ arrival = czDateToISO(m[1]); departure = czDateToISO(m[2]); }
    if(!arrival || !departure) chybi.push('termín');
  }

  // „14 dospělých + 6 dětí“; „4 dospělí“ bez dětí; české tvary dosp*/dít*/dět*
  let adults=null, children=0;
  if(osoby){
    const a = osoby.match(/(\d+)\s*dosp\w*/i);
    const d = osoby.match(/(\d+)\s*(?:d[ěe]t\w*|dít\w*)/i);
    if(a) adults = +a[1]; else chybi.push('počet dospělých');
    if(d) children = +d[1];
  }

  const nm = splitName(jmeno || '');
  const telIntl = intlPhone(tel, 'cs');
  if(tel && !telIntl) chybi.push('telefon (nejde převést na mezinárodní tvar)');

  const idZpravy = (text.match(/ID zprávy:\s*(\d+)/i) || [])[1] || null;
  const idObjektu = (text.match(/ID objektu:\s*(\d+)/i) || [])[1] || null;

  // Vzkaz hosta = text před „odeslal:“. „Bez vzkazu…“ je zástupka e-chalup.
  let vzkaz = squash((text.split(/odeslal:/i)[0] || ''));
  if(/^Bez vzkazu/i.test(vzkaz)) vzkaz = '';

  const uplne = chybi.length === 0;
  return {
    zdroj: 'e-chalupy',
    idZpravy, idObjektu,
    jmeno: jmeno || null, first: nm.first || null, last: nm.last || null,
    telefon: telIntl ? '+'+telIntl : null, telefonPuvodni: tel || null,
    email: email || null,
    arrival, departure,
    adults, children,
    vzkaz: vzkaz || null,
    uplne, chybi,
    // Payload pro RPC vr_admin_upsert_booking — beze změny tvaru z /sprava/.
    // p_children je pole věků; z poptávky známe jen počet, takže 10 jako odhad
    // (stejně to dělá formulář v /sprava/ — přesné věky přijdou z registrace).
    payload: {
      p_id: null,
      p_uidh: null,
      p_first: nm.first || '',
      p_last: nm.last || '',
      p_phone: telIntl ? '+'+telIntl : '',
      p_email: email || '',
      p_lang: 'cs',
      p_arrival: arrival,
      p_departure: departure,
      p_adults: adults == null ? 0 : adults,
      p_children: Array.from({ length: children || 0 }, () => 10),
      p_platform: 'e-chalupy',
      p_notes: vzkaz || '',
      p_door_code: null
    }
  };
}

/* ---------- n8n obal ----------
 * Gmail node vrací tělo pod různými klíči podle nastavení, proto se zkouší
 * několik variant a přednost má HTML (viz komentář v hlavičce).
 */
const out = [];
for (const item of $input.all()) {
  const j = item.json || {};
  const raw = j.html || j.textHtml || j.bodyHtml || j.textAsHtml
           || j.text || j.textPlain || j.body || j.snippet || '';
  const parsed = parseEchalupy(raw);
  parsed.subject = j.subject || (j.headers && j.headers.subject) || null;
  parsed.gmailId = j.id || null;
  out.push({ json: parsed });
}
return out;

/* ---------- Co dál (až se to bude zapojovat) ----------
 * 1) IF uzel na `uplne` — když false, poslat si e-mail „poptávka došla, ale
 *    nepovedlo se přečíst: {{chybi}}“ a dál needitovat.
 * 2) Dedup na `idZpravy` (e-chalupy ho posílají v každé zprávě), ať opakované
 *    doručení nezaloží druhý záznam.
 * 3) Teprve po potvrzení pobytu volat vr_admin_upsert_booking s `payload`
 *    (HTTP Request na Supabase RPC, hlavička s admin klíčem — stejně jako
 *    to dělá /sprava/). Automatické zakládání z poptávky nedoporučuju.
 */
