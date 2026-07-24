/* VrConflictWatch — Code node „Detekce konfliktů" (n8n VrConflictWatch001).
 * REFERENČNÍ kopie kódu vloženého do Code node. Vstup = vr_bookings (service-role
 * z předchozího HTTP nodu). Sám si stáhne kalendář (history.json) a spočítá
 * AKTUÁLNĚ eskalovatelné konflikty (desired). Výstup jde do RPC vr_apply_conflicts.
 *
 * DETEKCE PŘEKRYVŮ: dvojice pobytů s a.start < b.end AND b.start < a.end
 *   (intervaly [start,end) → den odjezdu = den příjezdu NENÍ konflikt); identické
 *   uidh se ignorují. ESKALUJE (zápis + e-mail) jen když jde o reálné riziko:
 *   RŮZNÉ platformy (kanály se nesynchronizují — každý prodá stejný termín, přesně
 *   případ z 7/2027) NEBO oba pobyty mají hosta ve vr_bookings. Překryv na STEJNÉ
 *   platformě bez hostů = artefakt kalendáře (blok / úprava / duplicitní iCal) a
 *   nezapisuje se (jedna platforma svůj inventář dvakrát neprodá).
 * DETEKCE ZMIZELÝCH: booking s uidh a departure>=dnes, jehož uidh NENÍ ve feedu =
 *   pravděpodobné storno. Jen pro arrival do 12 měsíců (feed má 13měsíční cutoff
 *   dopředu → vzdálenější pobyty můžou chybět legitimně, žádný false poplach).
 * BEZPEČNOSTNÍ POJISTKA: když feed nejde stáhnout / je prázdný, běh se ZASTAVÍ
 *   (throw) — jinak by se desired=[] vyložilo jako „vše zmizelo/vyřešeno" a poslalo
 *   by to lavinu false e-mailů. Feed se zkusí znovu za hodinu.
 */
const KNOWN = ['44f67225fb4ecfb9', '0dcf556ecb298ab7']; // známý červencový konflikt (acknowledged-ready)
const CAL_URL = 'https://pavelkubiznak.github.io/villa-booking-calendar/data/history.json';

function parseISO(s) { return new Date(s + 'T00:00:00Z'); }
function addMonthsISO(iso, m) { const d = parseISO(iso); d.setUTCMonth(d.getUTCMonth() + m); return d.toISOString().slice(0, 10); }
function isoToday() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Prague', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
function nameOf(b) { if (!b || b.anonymized_at) return null; const p = [b.first_name, b.last_name].filter(x => x && String(x).trim()); return p.length ? p.join(' ') : null; }
function overlaps(a, b) { return a.start < b.end && b.start < a.end; }

const items = $input.all();
let bookings = [];
if (items.length === 1 && Array.isArray(items[0].json)) bookings = items[0].json;
else bookings = items.map(i => i.json).filter(x => x && x.id);

let feed = [];
try {
  const c = await this.helpers.httpRequest({ url: CAL_URL + '?_=' + Date.now(), json: true });
  if (Array.isArray(c)) feed = c;
} catch (e) { /* níže se to vyhodnotí jako feed_unavailable */ }

// POJISTKA: prázdný / nedostupný feed = neprovádět nic (jinak lavina false poplachů).
if (!Array.isArray(feed) || feed.length === 0) {
  throw new Error('feed_unavailable — history.json prázdný/nedostupný; přeskakuji běh (žádný zápis, žádný e-mail).');
}

const today = isoToday();
const byUidh = {};
bookings.forEach(b => { if (b.uidh) byUidh[b.uidh] = b; });

const desired = [];
const seen = {};

// ---- PŘEKRYVY ----
for (let i = 0; i < feed.length; i++) {
  for (let j = i + 1; j < feed.length; j++) {
    const a = feed[i], b = feed[j];
    if (!a.uidh || !b.uidh || a.uidh === b.uidh) continue;
    if (!overlaps(a, b)) continue;
    const ba = byUidh[a.uidh] || null, bb = byUidh[b.uidh] || null;
    const samePlatform = (a.platform || '') === (b.platform || '');
    const bothPaired = !!ba && !!bb;
    if (samePlatform && !bothPaired) continue; // artefakt kalendáře → neeskalovat
    let lo, hi, blo, bhi;
    if (a.uidh < b.uidh) { lo = a; hi = b; blo = ba; bhi = bb; }
    else { lo = b; hi = a; blo = bb; bhi = ba; }
    const key = 'overlap:' + lo.uidh + '|' + hi.uidh + '|' + lo.start + '_' + lo.end + '|' + hi.start + '_' + hi.end;
    if (seen[key]) continue; seen[key] = 1;
    const known = KNOWN.indexOf(lo.uidh) >= 0 && KNOWN.indexOf(hi.uidh) >= 0;
    desired.push({ kind: 'overlap', key, detail: {
      type: 'overlap',
      a: { uidh: lo.uidh, start: lo.start, end: lo.end, platform: lo.platform, name: nameOf(blo), booking_id: blo ? blo.id : null },
      b: { uidh: hi.uidh, start: hi.start, end: hi.end, platform: hi.platform, name: nameOf(bhi), booking_id: bhi ? bhi.id : null },
      overlap_start: (lo.start > hi.start ? lo.start : hi.start),
      overlap_end: (lo.end < hi.end ? lo.end : hi.end),
      same_platform: samePlatform, known: known
    } });
  }
}

// ---- ZMIZELÉ (storno) ----
const feedUidh = {}; feed.forEach(f => { if (f.uidh) feedUidh[f.uidh] = 1; });
const horizon = addMonthsISO(today, 12);
bookings.forEach(b => {
  if (!b.uidh || feedUidh[b.uidh]) return;
  if (b.departure < today) return;   // minulé neřešíme
  if (b.arrival > horizon) return;   // za >12 měsíců legitimně chybí ve feedu
  desired.push({ kind: 'vanished', key: 'vanished:' + b.uidh, detail: {
    type: 'vanished', uidh: b.uidh, start: b.arrival, end: b.departure,
    platform: b.platform || null, name: nameOf(b), booking_id: b.id
  } });
});

return [{ json: { applyBody: { p_conflicts: desired }, desiredCount: desired.length, feedCount: feed.length, today } }];
