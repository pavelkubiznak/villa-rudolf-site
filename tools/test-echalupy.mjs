#!/usr/bin/env node
// Test parseru poptávek z e-chalupy.cz. Spusť: node tools/test-echalupy.mjs
//
// Vzorky jsou VYMYŠLENÉ — struktura odpovídá reálné poptávce, jména, čísla
// a e-maily jsou smyšlené. Do repa nepatří PII (viz CLAUDE.md).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'n8n/VrEchalupyInquiry/VrEchalupyInquiry.code.js'), 'utf8');
// Uřízne se n8n obal (používá $input, mimo n8n by spadl).
const a = src.indexOf('const DIAL=['), b = src.indexOf('/* ---------- n8n obal');
if (a < 0 || b < 0) throw new Error('blok nenalezen — změnily se kotvy v souboru?');
const parseEchalupy = new Function(src.slice(a, b) + '\n return parseEchalupy;')();

// Tělo tak, jak chodí z e-chalup: zalomení uvnitř <strong>, hodnoty tučně.
const htmlVzorek = (vzkaz, odeslal, telefon, termin, osoby, email) =>
  `<!DOCTYPE html><head></head><body><br /><div style="font-size:15px;"><span>${vzkaz}<br /><br />odeslal: <strong>${odeslal}</strong>,\r\ntelefon: <strong>${telefon}</strong> <br />požadovaný termín:\r\n<strong>${termin}</strong> <br />počet osob: <strong>${osoby}</strong><br />email:\r\n<strong>${email}</strong></span></div><br /><hr />Email\r\nbyl zaslán prostřednictvím kontaktního formuláře z <b><a href="https://www.e-chalupy.cz/">www.e-chalupy.cz</a></b>.<br /><br />ID zprávy: 3999001<br />ID objektu: 18852<br /></body></html>`;

let fail = 0;
const check = (jmeno, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fail++; console.log('FAIL  ' + jmeno + '\n        čekal: ' + JSON.stringify(want) + '\n        dostal: ' + JSON.stringify(got)); }
  else console.log('  ok  ' + jmeno);
};

// ---------- 1) běžná poptávka ----------
{
  const r = parseEchalupy(htmlVzorek(
    'Bez vzkazu - viz upřesnění termínu a\r\npočtu osob.',
    'Jana Nováková', '728111222', '24.7.2027 - 31.7.2027', '14\r\ndospělých  + 6 dětí', 'jana.novakova@example.cz'));
  console.log('\n— běžná poptávka —');
  check('jméno rozdělené', [r.first, r.last], ['Jana', 'Nováková']);
  check('telefon mezinárodně', r.telefon, '+420728111222');
  check('termín na ISO', [r.arrival, r.departure], ['2027-07-24', '2027-07-31']);
  check('počty osob', [r.adults, r.children], [14, 6]);
  check('e-mail', r.email, 'jana.novakova@example.cz');
  check('vzkaz je zástupka → prázdný', r.vzkaz, null);
  check('kompletní', r.uplne, true);
  check('ID zprávy', r.idZpravy, '3999001');
  check('payload dětí = pole věků', r.payload.p_children.length, 6);
  check('payload platforma', r.payload.p_platform, 'e-chalupy');
}

// ---------- 2) plaintext z Gmailu (tučné → VELKÁ PÍSMENA) ----------
{
  const txt = `Bez vzkazu - viz upřesnění termínu a počtu osob.

odeslal: JANA NOVÁKOVÁ, telefon: 728111222
požadovaný termín: 24.7.2027 - 31.7.2027
počet osob: 14 DOSPĚLÝCH + 6 DĚTÍ
email: JANA.NOVAKOVA@EXAMPLE.CZ

-------------------------
ID zprávy: 3999001
ID objektu: 18852`;
  const r = parseEchalupy(txt);
  console.log('\n— plaintext varianta (proto se parsuje HTML) —');
  check('termín i z textu', [r.arrival, r.departure], ['2027-07-24', '2027-07-31']);
  check('počty i z textu', [r.adults, r.children], [14, 6]);
  check('jméno ale přijde rozřvané', [r.first, r.last], ['JANA', 'NOVÁKOVÁ']);
}

// ---------- 3) bez dětí ----------
{
  const r = parseEchalupy(htmlVzorek('Bez vzkazu - viz upřesnění termínu a počtu osob.',
    'Petr Svoboda', '605 987 654', '5. 9. 2027 - 12. 9. 2027', '4 dospělí', 'petr@example.cz'));
  console.log('\n— bez dětí, mezery v čísle, tečky s mezerou v datu —');
  check('děti = 0', [r.adults, r.children], [4, 0]);
  check('telefon s mezerami', r.telefon, '+420605987654');
  check('datum s mezerami', [r.arrival, r.departure], ['2027-09-05', '2027-09-12']);
  check('kompletní', r.uplne, true);
}

// ---------- 4) host napsal vzkaz ----------
{
  const r = parseEchalupy(htmlVzorek('Dobrý den, je bazén v září ještě v provozu?',
    'Eva Malá', '777123456', '1.8.2027 - 8.8.2027', '10 dospělých + 2 děti', 'eva@example.cz'));
  console.log('\n— vzkaz od hosta —');
  check('vzkaz do poznámky', r.vzkaz, 'Dobrý den, je bazén v září ještě v provozu?');
  check('vzkaz i v payloadu', r.payload.p_notes, 'Dobrý den, je bazén v září ještě v provozu?');
}

// ---------- 5) rozbité vstupy nesmí shodit parser ----------
{
  console.log('\n— vadné vstupy —');
  const bezTel = parseEchalupy(
    `odeslal: <strong>Karel Dvořák</strong>, <br />požadovaný termín: <strong>1.8.2027 - 8.8.2027</strong> <br />počet osob: <strong>6 dospělých</strong><br />email: <strong>karel@example.cz</strong>`);
  check('chybějící telefon → uplne:false', bezTel.uplne, false);
  check('a je pojmenovaný v chybi', bezTel.chybi.includes('telefon'), true);
  check('ostatní se přesto přečetlo', [bezTel.adults, bezTel.arrival], [6, '2027-08-01']);

  const spatneDatum = parseEchalupy(htmlVzorek('Bez vzkazu.', 'Anna Krátká', '601222333',
    '31.2.2027 - 8.8.2027', '3 dospělí', 'anna@example.cz'));
  check('neexistující datum → null', spatneDatum.arrival, null);
  check('a poptávka je označená jako neúplná', spatneDatum.uplne, false);

  for (const nesmysl of ['', null, undefined, '<html></html>', 'úplně jiný e-mail']) {
    let r;
    try { r = parseEchalupy(nesmysl); }
    catch (e) { fail++; console.log('FAIL  parser spadl na ' + JSON.stringify(nesmysl) + ': ' + e.message); continue; }
    if (r.uplne) { fail++; console.log('FAIL  ' + JSON.stringify(nesmysl) + ' označeno jako kompletní'); }
  }
  console.log('  ok  prázdný/cizí vstup parser nepoloží');
}

console.log(fail ? '\n' + fail + ' selhání' : '\nvše prošlo');
process.exit(fail ? 1 : 0);
