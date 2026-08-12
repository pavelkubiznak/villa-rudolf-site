/* VrWebRequest — Code node „Sestavit e-mail" (n8n VrWebRequest001).
 * REFERENČNÍ kopie. Ostrá verze běží v n8n na Hetzneru; změna tady se nikam
 * sama nepropíše (stejně jako u VrDailyTasks a VrConflictWatch).
 *
 * Vstup  = odpověď PostgREST GET /rest/v1/vr_requests?notified_at=is.null
 *          (pole řádků; při prázdné tabulce jedna položka s prázdným polem)
 * Výstup = jedna položka NA KAŽDOU žádost: { id, subject, html }
 *          → emailSend pošle jeden e-mail za žádost (lépe se na ně odpovídá
 *            než na jeden souhrn) → PATCH označí řádek jako odeslaný.
 *          Nula žádostí → nula položek → emailSend se vůbec neprovede.
 *
 * POZOR: notified_at se zapisuje AŽ ZA odesláním e-mailu. Když SMTP spadne,
 * řádek zůstane s notified_at = NULL a příští běh (za 5 minut) to zkusí znovu.
 * Opačné pořadí by při výpadku pošty žádost tiše ztratilo — přesně to, co
 * tenhle workflow má odstranit.
 */
const SPRAVA_URL = 'https://villarudolf.com/sprava/';
const MONTH_GEN = ['ledna', 'února', 'března', 'dubna', 'května', 'června',
  'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];

/* Jazyk hosta rozhoduje, v jakém jazyce mu máš odepsat — proto je to v e-mailu
   vidět jako první, ne schované mezi údaji. */
const LANG = {
  cs: { flag: '🇨🇿', name: 'česky' },
  de: { flag: '🇩🇪', name: 'německy' },
  en: { flag: '🇬🇧', name: 'anglicky' },
  pl: { flag: '🇵🇱', name: 'polsky' },
};

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function parseISO(s) { return new Date(s + 'T00:00:00Z'); }
function fmtTermin(a, b) {
  const da = parseISO(a), db = parseISO(b);
  const d1 = da.getUTCDate(), m1 = da.getUTCMonth(), y1 = da.getUTCFullYear();
  const d2 = db.getUTCDate(), m2 = db.getUTCMonth(), y2 = db.getUTCFullYear();
  if (y1 === y2 && m1 === m2) return d1 + '.–' + d2 + '. ' + MONTH_GEN[m2] + ' ' + y2;
  if (y1 === y2) return d1 + '. ' + MONTH_GEN[m1] + ' – ' + d2 + '. ' + MONTH_GEN[m2] + ' ' + y2;
  return d1 + '. ' + MONTH_GEN[m1] + ' ' + y1 + ' – ' + d2 + '. ' + MONTH_GEN[m2] + ' ' + y2;
}
function nights(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
function nightWord(n) { return n === 1 ? 'noc' : (n <= 4 ? 'noci' : 'nocí'); }
function fmtM(v) { return new Intl.NumberFormat('cs-CZ').format(Math.round(v || 0)) + ' Kč'; }

/* Telefon v DB je uložený tak, jak ho host napsal — někdy s +, někdy bez.
   Pro tel: chceme mezinárodní tvar s +, pro wa.me holé číslice. */
function phoneDigits(p) { return String(p || '').replace(/\D+/g, ''); }

function row(k, v) {
  return '<tr>'
    + '<td style="padding:5px 12px 5px 0;color:#6b736f;font-size:13px;vertical-align:top;white-space:nowrap">' + k + '</td>'
    + '<td style="padding:5px 0;color:#1f2422;font-size:14px;font-weight:600">' + v + '</td>'
    + '</tr>';
}

function buildHtml(r) {
  const n = nights(r.arrival, r.departure);
  const lang = LANG[r.lang] || { flag: '🏳️', name: r.lang || 'neznámý jazyk' };
  const digits = phoneDigits(r.phone);

  let hosti = r.adults + ' dosp.';
  if (r.children) hosti += ' · ' + r.children + ' dět.';
  if (r.pets) hosti += ' · ' + r.pets + '× pes';

  const kontakt = []
    .concat('<a href="mailto:' + esc(r.email) + '" style="color:#B35C1E;text-decoration:none">' + esc(r.email) + '</a>')
    .concat(digits ? '<a href="tel:+' + digits + '" style="color:#B35C1E;text-decoration:none">+' + esc(digits) + '</a>' : [])
    .join(' · ');

  const zprava = r.message
    ? '<div style="background:#fbf7f3;border:1px solid #ecdcc9;border-radius:8px;padding:12px 14px;margin:12px 0;'
      + 'color:#33291f;font-size:14px;line-height:1.5;white-space:pre-wrap">' + esc(r.message) + '</div>'
    : '<div style="color:#8a918d;font-size:13px;margin:12px 0">Host nenapsal žádnou zprávu.</div>';

  const waBtn = digits
    ? '<a href="https://wa.me/' + digits + '" style="display:inline-block;background:#f4f5f4;color:#1f2422;'
      + 'font-weight:600;text-decoration:none;padding:10px 16px;border-radius:8px;font-size:14px;'
      + 'border:1px solid #e6e8e7;margin-left:6px">WhatsApp ↗</a>'
    : '';

  return '<!doctype html><html lang="cs"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1"></head>'
    + '<body style="margin:0;background:#f4f5f4"><div style="max-width:640px;margin:0 auto;padding:22px 14px;'
    + 'font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2422">'
    + '<p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#D68A4C;font-weight:700;margin:0 0 2px">'
    + 'Villa Rudolf · žádost z webu</p>'
    + '<h1 style="font-size:21px;margin:0 0 2px">' + esc(r.name) + '</h1>'
    + '<p style="color:#6b736f;font-size:14px;margin:0 0 14px">'
    + lang.flag + ' Formulář vyplnil ' + lang.name + ' — odpověz ve stejném jazyce.</p>'
    + '<div style="background:#fff;border:1px solid #e6e8e7;border-left:4px solid #D68A4C;border-radius:10px;padding:14px 16px;margin:10px 0">'
    + '<table style="border-collapse:collapse;width:100%">'
    + row('Termín', esc(fmtTermin(r.arrival, r.departure)) + ' <span style="color:#8a918d;font-weight:400">· ' + n + ' ' + nightWord(n) + '</span>')
    + row('Hosté', esc(hosti))
    + row('Cena', fmtM(r.total))
    + row('Kontakt', kontakt)
    + '</table>' + zprava + '</div>'
    + '<p style="margin:18px 0 6px">'
    + '<a href="mailto:' + esc(r.email) + '?subject=' + encodeURIComponent('Villa Rudolf — ' + fmtTermin(r.arrival, r.departure))
    + '" style="display:inline-block;background:#D68A4C;color:#20140A;font-weight:700;text-decoration:none;'
    + 'padding:10px 18px;border-radius:8px;font-size:14px">Odpovědět hostovi ↗</a>' + waBtn + '</p>'
    + '<p style="margin:14px 0 6px"><a href="' + esc(SPRAVA_URL) + '" style="color:#6b736f;font-size:13px">'
    + 'Všechny žádosti ve správě ↗</a></p>'
    + '<p style="color:#8a918d;font-size:12px;margin-top:20px;border-top:1px solid #e6e8e7;padding-top:12px">'
    + 'Kontrola každých 5 minut (n8n · VrWebRequest). Žádost čeká ve stavu „Nová", '
    + 'dokud ji ve správě neoznačíš za vyřízenou.</p>'
    + '</div></body></html>';
}

/* PostgREST vrací pole; n8n ho podle nastavení podá buď jako jednu položku
   s polem, nebo jako N položek. Zvládneme obojí. */
const items = $input.all();
const reqs = [];
for (const it of items) {
  const j = it.json;
  if (Array.isArray(j)) reqs.push(...j);
  else if (Array.isArray(j.data)) reqs.push(...j.data);
  else if (j && j.id) reqs.push(j);
}

return reqs.map((r) => ({
  json: {
    id: r.id,
    subject: '🏔️ Villa Rudolf — nová žádost: ' + r.name + ' (' + fmtTermin(r.arrival, r.departure) + ')',
    html: buildHtml(r),
  },
}));
