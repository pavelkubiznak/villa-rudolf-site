/* VrConflictWatch — Code node „Sestavit e-maily" (n8n VrConflictWatch001).
 * REFERENČNÍ kopie. Vstup = odpověď RPC vr_apply_conflicts:
 *   { ok, to_notify_new:[{kind,key,detail}], to_notify_resolved:[…] }
 * Výstup = 0–2 položky, každá {subject, html} pro jediný emailSend node
 *   (0 položek → node se neprovede → žádný e-mail; přesně to chceme, když nic není).
 * NEODESÍLÁ nic samo — jen připraví předmět + HTML. Znovu už neupozorňuje
 * (notified_at / resolved_notified řeší RPC).
 */
const SPRAVA_URL = 'https://villarudolf.com/sprava/';
const MONTH_GEN = ['ledna','února','března','dubna','května','června','července','srpna','září','října','listopadu','prosince'];
function parseISO(s) { return new Date(s + 'T00:00:00Z'); }
function fmtTermin(a, b) {
  const da = parseISO(a), db = parseISO(b);
  const d1 = da.getUTCDate(), m1 = da.getUTCMonth(), y1 = da.getUTCFullYear();
  const d2 = db.getUTCDate(), m2 = db.getUTCMonth(), y2 = db.getUTCFullYear();
  if (y1 === y2 && m1 === m2) return d1 + '.–' + d2 + '. ' + MONTH_GEN[m2] + ' ' + y2;
  if (y1 === y2) return d1 + '. ' + MONTH_GEN[m1] + ' – ' + d2 + '. ' + MONTH_GEN[m2] + ' ' + y2;
  return d1 + '. ' + MONTH_GEN[m1] + ' ' + y1 + ' – ' + d2 + '. ' + MONTH_GEN[m2] + ' ' + y2;
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function card(inner, color) { return '<div style="background:#fff;border:1px solid #e6e8e7;border-left:4px solid ' + color + ';border-radius:10px;padding:14px 16px;margin:10px 0">' + inner + '</div>'; }
function sideRow(x) {
  const nm = x.name ? esc(x.name) : '<span style="color:#9aa0a0">neznámý host (jen v kalendáři)</span>';
  return '<div style="margin:2px 0;font-size:14px"><b>' + esc(x.platform || '—') + '</b> · ' + esc(fmtTermin(x.start, x.end)) + ' · ' + nm + '</div>';
}
function overlapCard(d) {
  const known = d.known ? '<div style="color:#0E7A46;font-size:13px;margin-top:8px">✔ Známý konflikt — už ho řešíš. Tato zpráva je jen evidence.</div>' : '';
  const art = d.same_platform ? '<div style="color:#8a918d;font-size:12px;margin-top:6px">(stejná platforma — prověř, zda nejde o blok/úpravu)</div>' : '';
  return card('<div style="font-weight:700;color:#8a1111;font-size:15px">🔴 Dvojitá rezervace — ' + esc(fmtTermin(d.overlap_start, d.overlap_end)) + '</div>' +
    '<div style="color:#333;font-size:14px;margin:8px 0 2px">Překrývají se dva pobyty:</div>' + sideRow(d.a) + sideRow(d.b) + known + art, '#c0392b');
}
function vanishedCard(d) {
  return card('<div style="font-weight:700;color:#8a5a11;font-size:15px">🟡 Pobyt zmizel z kalendáře — ' + esc(fmtTermin(d.start, d.end)) + '</div>' +
    '<div style="color:#333;font-size:14px;margin:8px 0 2px">' + esc(d.platform || '—') + (d.name ? ' · ' + esc(d.name) : '') + '</div>' +
    '<div style="color:#6b736f;font-size:13px;margin-top:6px">Pobyt s hostem ve správě už není ve feedu kalendáře — pravděpodobně <b>storno na platformě</b>. Ověř a případně smaž ve správě.</div>', '#c48a1a');
}
function resolvedCard(d) {
  const t = d.type === 'overlap' ? ('Dvojitá rezervace ' + esc(fmtTermin(d.overlap_start, d.overlap_end)))
                                 : ('Zmizelý pobyt ' + esc(fmtTermin(d.start, d.end)));
  return card('<div style="font-weight:700;color:#0E7A46;font-size:15px">✅ Vyřešeno — ' + t + '</div>' +
    '<div style="color:#6b736f;font-size:13px;margin-top:6px">Konflikt už v kalendáři není. Hlídač ho uzavřel.</div>', '#0E7A46');
}
function wrap(title, sub, rows) {
  return '<!doctype html><html lang="cs"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;background:#f4f5f4"><div style="max-width:640px;margin:0 auto;padding:22px 14px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1f2422">' +
    '<p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#D68A4C;font-weight:700;margin:0 0 2px">Villa Rudolf · hlídač kalendáře</p>' +
    '<h1 style="font-size:21px;margin:0 0 2px">' + title + '</h1>' +
    '<p style="color:#6b736f;font-size:14px;margin:0 0 14px">' + sub + '</p>' + rows +
    '<p style="margin:18px 0 6px"><a href="' + esc(SPRAVA_URL) + '" style="display:inline-block;background:#D68A4C;color:#20140A;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:14px">Otevřít správu pobytů ↗</a></p>' +
    '<p style="color:#8a918d;font-size:12px;margin-top:20px;border-top:1px solid #e6e8e7;padding-top:12px">Automatická kontrola každou hodinu (n8n · VrConflictWatch). Řeš to hned — čím dřív, tím levnější.</p>' +
    '</div></body></html>';
}

const applyResp = ($input.first() && $input.first().json) || {};
const nw = applyResp.to_notify_new || [];
const rs = applyResp.to_notify_resolved || [];
const out = [];

if (nw.length) {
  const rows = nw.map(c => c.kind === 'overlap' ? overlapCard(c.detail) : vanishedCard(c.detail)).join('');
  const n = nw.length, word = n === 1 ? 'konflikt' : (n <= 4 ? 'konflikty' : 'konfliktů');
  out.push({ json: { kind: 'new', count: n, subject: '🔴 Villa Rudolf — KONFLIKT v kalendáři',
    html: wrap('Nalezen ' + (n === 1 ? '' : n + ' ') + word + ' v kalendáři', 'Zkontroluj a vyřeš co nejdřív.', rows) } });
}
if (rs.length) {
  const rows = rs.map(c => resolvedCard(c.detail)).join('');
  out.push({ json: { kind: 'resolved', count: rs.length, subject: '✅ Villa Rudolf — konflikt vyřešen',
    html: wrap('Konflikt vyřešen', 'Situace v kalendáři se srovnala.', rows) } });
}
return out;
