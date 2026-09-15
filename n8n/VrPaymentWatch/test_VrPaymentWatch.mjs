/* Offline test čtečky Fia — bez sítě, bez závislostí.
 *
 *     node n8n/VrPaymentWatch/test_VrPaymentWatch.mjs
 *
 * Code node z n8n se sem načte jako TEXT a spustí uvnitř podvržené obálky, která
 * doplní `this.helpers.httpRequest` a `$env`. Testuje se tedy přesně ten kód, který
 * se vkládá do n8n — ne jeho kopie, která by se mohla rozejít.
 *
 * Co se hlídá: čtení sloupců podle JMÉNA i podle čísla (Fio číslování se dohledává
 * po internetu s rozpory), odfiltrování odchozích plateb, nečitelné pohyby, výpadek
 * jednoho účtu, chybějící tokeny a to, že AUTOCONFIRM je ve verzi v repu vypnutý.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(HERE, 'VrPaymentWatch.code.js'), 'utf8');
const BODY = SRC.replace(/^\/\*[\s\S]*?\*\/\n/, '');   // hlavička se do n8n nevkládá

const FAILS = [];
const check = (name, cond, detail = '') => {
  console.log((cond ? '  ok   ' : '  FAIL ') + name + (!cond && detail ? `  — ${detail}` : ''));
  if (!cond) FAILS.push(name);
};

// pohyb ve tvaru, v jakém ho vrací Fio: {columnN: {value, name, id}}
const col = (value, name) => ({ value, name, id: 0 });
function tx(o) {
  const t = {};
  if (o.amount !== undefined) t.column0 = col(o.amount, 'Objem');
  if (o.date) t.column1 = col(o.date, 'Datum');
  if (o.vs !== undefined) t.column5 = col(o.vs, 'VS');
  if (o.cur) t.column14 = col(o.cur, 'Měna');
  if (o.msg !== undefined) t.column16 = col(o.msg, 'Zpráva pro příjemce');
  if (o.who !== undefined) t.column10 = col(o.who, 'Název protiúčtu');
  if (o.id !== undefined) t.column22 = col(o.id, 'ID pohybu');
  return t;
}
// tentýž pohyb, ale s PŘEHÁZENÝMI čísly sloupců a správnými jmény — musí projít stejně
function txShuffled(o) {
  return {
    column99: col(o.amount, 'Objem'),
    column98: col(o.date, 'Datum'),
    column97: col(o.vs, 'VS'),
    column96: col(o.cur, 'Měna'),
    column95: col(o.id, 'ID pohybu'),
    column94: col(o.msg, 'Zpráva pro příjemce'),
  };
}
const statement = (...txs) => ({ accountStatement: { info: {}, transactionList: { transaction: txs } } });

async function run({ env, responses }) {
  const ctx = { helpers: { httpRequest: async ({ url }) => {
    const which = Object.keys(env).find(k => url.includes(env[k]));
    const r = responses[which];
    if (r instanceof Error) throw r;
    return r === undefined ? statement() : r;
  } } };
  const fn = new Function('$env', `return (async function(){ ${BODY} }).call(this);`);
  return fn.call(ctx, env);
}

const TOKENS = { FIO_TOKEN_VR_CZK: 'tok-czk', FIO_TOKEN_VR_EUR: 'tok-eur', FIO_TOKEN_SINTERA: 'tok-sin' };
const D = new Date().toISOString().slice(0, 10);

console.log('\nČTENÍ POHYBŮ');
let out = await run({ env: TOKENS, responses: {
  FIO_TOKEN_VR_CZK: statement(
    tx({ id: 'T1', date: `${D}+0200`, amount: 48000, cur: 'CZK', vs: '20260142', msg: 'zaloha', who: 'Novák' }),
    tx({ id: 'T2', date: `${D}+0200`, amount: -5000, cur: 'CZK', vs: '1', msg: 'odchozi' }),   // odchozí
    tx({ amount: 100, date: `${D}+0200`, cur: 'CZK' }),                                        // bez ID
    tx({ id: 'T4', amount: 100, cur: 'CZK' }),                                                 // bez data
  ),
  FIO_TOKEN_VR_EUR: statement(txShuffled({ id: 'T5', date: `${D}+0200`, amount: 1800, cur: 'EUR', vs: '20260143', msg: 'Rechnung 2026-0143' })),
} });
let j = out[0].json;
const rows = j.ingestBody.p_rows;
check('projdou jen příchozí platby', rows.length === 2, JSON.stringify(rows.map(r => r.tx_id)));
check('částka, měna a VS se přečtou', rows[0].amount === 48000 && rows[0].currency === 'CZK' && rows[0].vs === '20260142', JSON.stringify(rows[0]));
check('datum se ořízne na YYYY-MM-DD', rows[0].booked_on === D, rows[0].booked_on);
check('účet se zapíše z konfigurace', rows[0].account === 'VR_CZK' && rows[1].account === 'VR_EUR');
check('sloupce se čtou podle JMÉNA, ne podle čísla', rows[1].tx_id === 'T5' && rows[1].amount === 1800 && rows[1].currency === 'EUR', JSON.stringify(rows[1]));
check('nečitelné pohyby se hlásí', j.summary.ucty.some(s => s.includes('nečitelných')), JSON.stringify(j.summary.ucty));
check('nenastavený token = přeskočený účet', j.summary.ucty.some(s => s.includes('SINTERA')));

console.log('\nAUTOCONFIRM');
check('ve verzi v repu je zapisování VYPNUTÉ', j.ingestBody.p_autoconfirm === false);

console.log('\nVÝPADEK BANKY');
out = await run({ env: TOKENS, responses: {
  FIO_TOKEN_VR_CZK: new Error('502 Bad Gateway'),
  FIO_TOKEN_VR_EUR: statement(tx({ id: 'T9', date: `${D}+0200`, amount: 1000, cur: 'EUR', vs: '1' })),
} });
j = out[0].json;
check('výpadek jednoho účtu neshodí běh', j.ingestBody.p_rows.length === 1, JSON.stringify(j.ingestBody.p_rows));
check('a je vidět v souhrnu', j.summary.ucty.some(s => s.includes('banka nedostupná')), JSON.stringify(j.summary.ucty));

console.log('\nPOJISTKA — žádný token');
let threw = null;
try { await run({ env: {}, responses: {} }); } catch (e) { threw = e; }
check('bez tokenů běh skončí chybou, ne prázdnou dávkou', !!threw, String(threw));

console.log('\n' + (FAILS.length ? 'FAILED: ' + FAILS.join(', ') : 'Vše prošlo.'));
process.exit(FAILS.length ? 1 : 0);
