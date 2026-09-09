/* VrPaymentWatch — Code node „Načíst pohyby z Fia" (n8n na Hetzneru sintera-radar).
 * STAV: PŘIPRAVENO, zatím NENASAZENO. Referenční kopie kódu do Code node
 * (bez tohoto úvodního komentáře, jinak 1:1) — stejná konvence jako VrDailyTasks.
 *
 * CO TO DĚLÁ
 * Přečte pohyby ze tří účtů u Fia a pošle je do RPC vr_ingest_payments, které je
 * spáruje s vystavenými zálohovými fakturami (viz supabase/migrations/20260910_vr_payments.sql).
 * Výstup je jedna položka: { ingestBody, summary } — HTTP node za tímhle uzlem ji
 * pošle na Supabase se SERVICE-ROLE credentialem, přesně jako VrConflictWatch.
 *
 * PROČ SE ČTE I HLAVNÍ ÚČET SINTERY
 * Zálohová faktura se dá omylem vystavit na hlavní účet Sintery. Kdyby se sledovaly
 * jen villové účty, taková platba by se ztratila a předrezervace by propadla, přestože
 * host zaplatil. Párování jde podle variabilního symbolu bez ohledu na účet; že je
 * potřeba přeúčtovat, řekne `paid_mismatch` v /sprava/.
 *
 * TOKENY NEJSOU V KÓDU. Repo je veřejné. Tři read-only tokeny Fia se čtou z prostředí
 * n8n instance:  FIO_TOKEN_VR_CZK · FIO_TOKEN_VR_EUR · FIO_TOKEN_SINTERA
 * Token si vytvoř v internetbankingu Fia jako **pouze ke čtení** a vždy k jednomu účtu —
 * plný token umí i posílat platby a do automatu nepatří. Nenastavený token = účet se
 * přeskočí a zaloguje se to; prázdná sada = běh skončí chybou (jinak by „nic nepřišlo"
 * vypadalo stejně jako „banka je nedostupná").
 *
 * PROČ NE ENDPOINT `last`
 * Fio u něj drží ukazatel na SVÉ straně a při každém stažení ho posune. Kdyby n8n
 * spadlo po stažení a před zápisem, ty pohyby už nikdy znovu nedostaneš. Proto se
 * čte klouzavé okno posledních DAYS_BACK dní a odduplikovává se podle ID pohybu
 * (unikátní index v vr_payments) — idempotentní, přežije to jakýkoli výpadek.
 * Limit Fia je 1 dotaz / 30 s na token, proto ta pauza mezi účty.
 *
 * SLOUPCE SE ČTOU PODLE JMÉNA, NE PODLE ČÍSLA. Fio vrací pole „columnN" a číslování
 * se dohledává po internetu s rozpory (hlavně u VS/KS/SS). Každý sloupec ale nese
 * i `name` („Variabilní symbol", „Objem", …), takže se čte podle něj a čísla jsou jen
 * záložní. Co se nepodaří přečíst, se hlásí — radši hlasitě než tiše špatně.
 *
 * ⚠️ PRVNÍ BĚHY NECH READ-ONLY. AUTOCONFIRM = false znamená, že se nic samo nepotvrdí:
 * platby se jen uloží a spárují jako NÁVRHY, které se odklepnou v /sprava/. Pravidla
 * jsou postavená proti dokumentaci Fia, ne proti skutečnému výpisu tohohle účtu —
 * první dávku je potřeba přečíst. Teprve až to bude sedět, přepni na true.
 * (Pozn.: přepnutí nepůsobí zpětně — pohyb už jednou uložený se podruhé nezpracovává,
 * takže staré návrhy zůstanou k odklepnutí. To je záměr, ne chyba.)
 */
const AUTOCONFIRM = false;      // ⚠️ viz výš — nepřepínat, dokud první dávka nesedí
const DAYS_BACK   = 30;         // klouzavé okno; klidně víc, dedup to unese
const FIO_BASE    = 'https://fioapi.fio.cz/v1/rest/periods';

// účet v naší evidenci → název proměnné prostředí s read-only tokenem
const ACCOUNTS = [
  { account: 'VR_CZK',  env: 'FIO_TOKEN_VR_CZK'  },
  { account: 'VR_EUR',  env: 'FIO_TOKEN_VR_EUR'  },
  { account: 'SINTERA', env: 'FIO_TOKEN_SINTERA' },
];

function isoDay(d) { return d.toISOString().slice(0, 10); }
function envToken(name) {
  try { return String(($env && $env[name]) || '').trim(); } catch (e) { return ''; }
}

/* ---------- čtení sloupců Fia ---------- */
// Přednost má shoda podle `name`; čísla sloupců jsou jen záchranná síť.
const FIELDS = {
  amount:       { names: ['objem'],                                  cols: ['column0']  },
  currency:     { names: ['měna', 'mena'],                           cols: ['column14'] },
  txId:         { names: ['id pohybu'],                              cols: ['column22'] },
  booked:       { names: ['datum'],                                  cols: ['column0date', 'column1date'] },
  vs:           { names: ['vs', 'variabilní symbol', 'variabilni symbol'], cols: ['column5'] },
  ks:           { names: ['ks', 'konstantní symbol', 'konstantni symbol'], cols: ['column4'] },
  ss:           { names: ['ss', 'specifický symbol', 'specificky symbol'],  cols: ['column6'] },
  counterparty: { names: ['název protiúčtu', 'nazev protiuctu', 'protiúčet', 'protiucet'], cols: ['column10', 'column1'] },
  message:      { names: ['zpráva pro příjemce', 'zprava pro prijemce', 'uživatelská identifikace', 'komentář'],
                  cols: ['column16', 'column7', 'column25'] },
};
function pick(tx, field) {
  const spec = FIELDS[field];
  for (const k of Object.keys(tx)) {
    const c = tx[k];
    if (!c || c.value === null || c.value === undefined) continue;
    const nm = String(c.name || '').trim().toLowerCase();
    if (spec.names.indexOf(nm) >= 0) return c.value;
  }
  for (const col of spec.cols) {
    const c = tx[col];
    if (c && c.value !== null && c.value !== undefined) return c.value;
  }
  return null;
}
function str(v) { return v === null || v === undefined ? null : String(v).trim() || null; }

/* ---------- běh ---------- */
const to = new Date();
const from = new Date(to.getTime() - DAYS_BACK * 86400000);
const rows = [], notes = [];
let read = 0, skippedAccounts = 0;

for (let i = 0; i < ACCOUNTS.length; i++) {
  const acc = ACCOUNTS[i];
  const token = envToken(acc.env);
  if (!token) {
    skippedAccounts++;
    notes.push(`${acc.account}: přeskočeno — ${acc.env} není nastavené`);
    continue;
  }
  // Fio: 1 dotaz / 30 s na token. Tokeny jsou různé, ale pauza nic nestojí a
  // chrání i před tím, kdyby někdo dal dvěma účtům omylem stejný token.
  if (i > 0) await new Promise(r => setTimeout(r, 1000));

  let data;
  try {
    // POZOR: URL obsahuje token — nikdy ji netiskni do logu (logy se sdílejí).
    data = await this.helpers.httpRequest({
      url: `${FIO_BASE}/${token}/${isoDay(from)}/${isoDay(to)}/transactions.json`,
      json: true,
      timeout: 30000,
    });
  } catch (e) {
    // Výpadek jednoho účtu neshazuje celý běh — ostatní se zpracují a chybějící
    // pohyby doplní další běh (okno je klouzavé). Ale je to vidět v souhrnu.
    notes.push(`${acc.account}: ⚠️ banka nedostupná (${e.message || e})`);
    continue;
  }

  const list = ((data || {}).accountStatement || {}).transactionList;
  const txs = (list && Array.isArray(list.transaction)) ? list.transaction : [];
  let kept = 0, unusable = 0;
  txs.forEach(tx => {
    read++;
    const amount = Number(pick(tx, 'amount'));
    const txId = str(pick(tx, 'txId'));
    const bookedRaw = str(pick(tx, 'booked'));
    // Fio posílá datum jako '2026-09-09+0200' — bereme prvních 10 znaků.
    const booked = bookedRaw && /^\d{4}-\d{2}-\d{2}/.test(bookedRaw) ? bookedRaw.slice(0, 10) : null;
    // Pohyb bez ID, částky nebo data se NEDOSAZUJE odhadem: špatné datum by rozbilo
    // okno pro párování bez VS a špatné ID by pustilo tentýž pohyb podruhé.
    if (!txId || !isFinite(amount) || !booked) { unusable++; return; }
    if (amount <= 0) return;                       // odchozí platby se nepárují

    rows.push({
      source: 'fio',
      account: acc.account,
      tx_id: txId,
      booked_on: booked,
      amount: amount,
      currency: (str(pick(tx, 'currency')) || 'CZK').toUpperCase(),
      vs: str(pick(tx, 'vs')),
      ks: str(pick(tx, 'ks')),
      ss: str(pick(tx, 'ss')),
      counterparty: str(pick(tx, 'counterparty')),
      message: str(pick(tx, 'message')),
    });
    kept++;
  });
  notes.push(`${acc.account}: ${txs.length} pohybů → ${kept} příchozích`
    + (unusable ? `, ${unusable} nečitelných ⚠️` : ''));
}

// POJISTKA: když se nedá přečíst ani jeden účet, neposílej prázdné pole dál.
// Prázdná dávka vypadá úplně stejně jako „nikdo nic neposlal" a tvářila by se,
// že je vše v pořádku — přitom jsme jen neviděli do banky.
if (skippedAccounts === ACCOUNTS.length) {
  throw new Error('Není nastavený ani jeden token Fia (FIO_TOKEN_*) — přeskakuji běh.');
}

return [{ json: {
  ingestBody: { p_rows: rows, p_autoconfirm: AUTOCONFIRM },
  summary: {
    okno: `${isoDay(from)} → ${isoDay(to)}`,
    prectenoPohybu: read,
    kOdeslani: rows.length,
    autoconfirm: AUTOCONFIRM,
    ucty: notes,
  },
} }];
