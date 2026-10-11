// Vymyšlené pobyty pro tools/sprava-harness.mjs a tools/test-zpravy.mjs.
//
// VŠECHNA DATA JSOU VYMYŠLENÁ. Žádná jména, telefony ani termíny skutečných hostů
// sem nepatří — repo je veřejné. Telefony jsou z rozsahů, které operátoři nepřidělují.
//
// „Dnešek" je zamrazený na 11. 10. 2026 a pobyty jsou poskládané tak, aby bylo vidět
// všechno, co se ten den měnilo: první ozvěna s novinkou i bez, uvítací zpráva s kódem
// pro platformu i pro „Přímá", tabulka „Co doplnit" (host, telefon, počty, věky dětí,
// trvalý odkaz, Wi-Fi), odpověď hosta (jede / váhá / mlčí), starší úkoly a staré klíče
// ve vr_msglog (confirm, registration, doorcode), které nesmí nic rozbít.

export const TODAY = '2026-10-11';

export const ago = (days) => new Date(Date.parse(TODAY + 'T09:00:00') - days * 86400000).toISOString();
export const persons0 = { registered: 0, adults: 0, children: 0, foreigners: 0, missing_doc: 0 };
const tok = (n) => 'harness' + String(n).padStart(2, '0') + 'a'.repeat(39);
function booking(n, o) {
  return Object.assign({ id: 'b' + n, uidh: 'cal' + String(n).padStart(13, '0'), email: null, notes: null, door_code: null,
    children: [], persons: persons0, msglog: [], token: null, created_at: ago(40), expires_at: null }, o);
}
export const BOOKINGS = [
  // běží, přímý prodej bez označených zpráv → 2 „starší zprávy", uvítací s „z kauce"
  booking(1, { uidh: null, first_name: 'Testovací', last_name: 'Skupina', phone: '+4915550100101', lang: 'de', platform: 'Přímá',
    arrival: '2026-10-10', departure: '2026-10-17', adults: 7, children: [3, 5, 8, 9, 12, 14], token: tok(1) }),
  // příjezd za 6 dní, platforma, výchozí 2+0 → uvítací po termínu, poplatek bez částky
  booking(2, { first_name: 'Jana', last_name: 'Vzorová', phone: '+420600100102', lang: 'cs', platform: 'Airbnb',
    arrival: '2026-10-17', departure: '2026-10-24', adults: 2, token: tok(2) }),
  // příjezd za 13 dní, bez telefonu → jen čip, žádný úkol
  booking(3, { first_name: 'Max', last_name: 'Mustermann', phone: null, lang: 'de', platform: 'Booking.com',
    arrival: '2026-10-24', departure: '2026-10-31', adults: 9, children: [6, 11], token: tok(3) }),
  // první příjezd po rekonstrukci schodiště → první ozvěna DE s novinkou; chybí trvalý odkaz
  booking(5, { first_name: 'Erika', last_name: 'Beispiel', phone: '+4915550100105', lang: 'de', platform: 'Booking.com',
    arrival: '2026-12-19', departure: '2026-12-26', adults: 8, children: [4, 7] }),
  // výchozí 2+0 a bez odkazu → dva čipy
  booking(6, { first_name: 'Hans', last_name: 'Probe', phone: '+4915550100106', lang: 'de', platform: 'Airbnb',
    arrival: '2026-12-26', departure: '2027-01-02', adults: 2 }),
  // přímý prodej s uhrazenou předrezervací, věky dětí neznámé (samé desítky), česky
  booking(8, { uidh: null, first_name: 'Petr', last_name: 'Ukázka', phone: '+420600100108', lang: 'cs', platform: 'Přímá',
    arrival: '2027-02-06', departure: '2027-02-13', adults: 11, children: [10, 10, 10, 10], token: tok(8) }),
  // první ozvěna odešla před 12 dny, host mlčí → „připomenout se"
  booking(9, { first_name: 'Sample', last_name: 'Guest', phone: '+447700900109', lang: 'en', platform: 'Airbnb',
    arrival: '2027-07-10', departure: '2027-07-17', adults: 6, children: [2], token: tok(9),
    msglog: [{ msg_key: 'first', sent_at: ago(12) }] }),
  // host váhá
  booking(10, { first_name: 'Jan', last_name: 'Przykładowy', phone: '+48500100110', lang: 'pl', platform: 'Booking.com',
    arrival: '2027-08-14', departure: '2027-08-21', adults: 10, children: [8, 13], token: tok(10),
    msglog: [{ msg_key: 'first', sent_at: ago(20) }, { msg_key: 'reply_risk', sent_at: ago(2) }] }),
  // staré klíče v logu (confirm = dřívější „Potvrzení rezervace") + host jede → kompletní
  booking(11, { first_name: 'Eva', last_name: 'Příkladná', phone: '+420600100111', lang: 'cs', platform: 'E-chalupy',
    arrival: '2027-08-21', departure: '2027-08-28', adults: 14, token: tok(11),
    msglog: [{ msg_key: 'confirm', sent_at: ago(3) }, { msg_key: 'registration', sent_at: ago(3) },
      { msg_key: 'doorcode', sent_at: ago(3) }, { msg_key: 'reply_ok', sent_at: ago(1) }] }),
  // příjezd až 2028 → první ozvěna DE bez novinky
  booking(12, { first_name: 'Greta', last_name: 'Muster', phone: '+4915550100112', lang: 'de', platform: 'Airbnb',
    arrival: '2028-01-08', departure: '2028-01-15', adults: 10, token: tok(12) })
];
export const HOLDS = [{ id: 'h8', uidh: 'hold000000000008', arrival: '2027-02-06', departure: '2027-02-13', status: 'confirmed',
  booking_id: 'b8', request_id: null, channel: 'telefon', invoice_no: 'ZF-TEST-001', invoice_amount: 98000, invoice_currency: 'CZK',
  invoice_account: 'VR_CZK', invoice_due: '2026-10-01', paid_at: ago(8), paid_amount: 98000, paid_account: 'VR_CZK',
  hold_until: null, guest_note: null, account_mismatch: null, paid_mismatch: false }];
const cal = (uidh, start, end, platform) => ({ uidh, start, end, platform, lastSeen: TODAY });
export const CALENDAR = [
  ...BOOKINGS.filter(b => b.uidh).map(b => cal(b.uidh, b.arrival, b.departure, b.platform)),
  cal('hold000000000008', '2027-02-06', '2027-02-13', 'Přímá'),
  cal('svc0000000000001', '2026-11-02', '2026-12-18', 'Blokace'),       // servisní blok (schodiště)
  cal('cal0000000000007', '2027-01-09', '2027-01-16', 'Fewo-direkt')    // obsazeno, hosta neznáme
];
export const VERIFIED = { stays: { '2026-11-02..2026-12-18': { status: 'service' } } };
export const DOOR_CODES = [{ uidh: null, code: '00101', status: 'set', starts_at: '2026-10-10T13:00:00Z' }];

