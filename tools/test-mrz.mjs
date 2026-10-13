#!/usr/bin/env node
// Test rozboru strojově čitelné zóny dokladu (registrace/mrz.js). Spusť: node tools/test-mrz.mjs
//
// Řádky jsou z úředních VZORŮ (Erika Mustermann, Jan Kowalski, Willeke De Bruijn – specimeny
// BMI, gov.pl a RvIG) nebo vymyšlené s dopočítanou kontrolní číslicí. Žádný skutečný doklad.
// Samotné čtení z obrazu (Tesseract) tenhle test nezkouší – to je měřené v prohlížeči.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { parseMrz, checkDigit } = createRequire(import.meta.url)(join(root, 'registrace/mrz.js'));
const DNES = '2026-10-13';

let fails = 0, n = 0;
function eq(got, want, what) {
  n++;
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fails++; console.error('✗ ' + what + '\n    čekáno ' + JSON.stringify(want) + '\n    vyšlo  ' + JSON.stringify(got));
  }
}
const p = (lines) => parseMrz(lines, DNES);

/* ---------- kontrolní číslice (ICAO 9303-3, odd. 4.9) ---------- */
eq(checkDigit('520727'), '3', 'příklad z ICAO 9303: datum 520727 → 3');
eq(checkDigit('AB2134<<<'), '5', 'příklad z ICAO 9303: AB2134 → 5');
eq(checkDigit('T22000129'), '3', 'vzor německého průkazu');

/* ---------- průkazy (3 × 30) ---------- */
const DE_ID = ['IDD<<T220001293<<<<<<<<<<<<<<<', '6408125<2010315D<<<<<<<<<<<<<4', 'MUSTERMANN<<ERIKA<<<<<<<<<<<<<'];
eq(p(DE_ID), { docType: 'ID', docNumber: 'T22000129', birth: '1964-08-12', citizenship: 'DE', firstName: 'Erika', lastName: 'Mustermann' },
  'německý průkaz – vzor BMI');
const NL_ID = ['I<NLDSPECI20212<<<<<<<<<<<<<<<', '6503101F3108022NLD<<<<<<<<<<<8', 'DE<BRUIJN<<WILLEKE<LISELOTTE<<'];
eq(p(NL_ID), { docType: 'ID', docNumber: 'SPECI2021', birth: '1965-03-10', citizenship: 'NL', firstName: 'Willeke Liselotte', lastName: 'De Bruijn' },
  'nizozemský průkaz – vzor RvIG');
eq(p(['Burg. van Stad en Dorp', 'SPECIMEN'].concat(NL_ID)).docNumber, 'SPECI2021', 'okolní text z průkazu nevadí');
eq(p(NL_ID.map(l => l.replace(/</g, '< ').toLowerCase())).docNumber, 'SPECI2021', 'mezery a malá písmena z OCR');
eq(p([NL_ID[0], NL_ID[1].slice(0, 18) + '<<<<<<<<<<<<8', NL_ID[2]]).docNumber, 'SPECI2021', 'o jednu výplň víc ve volitelném poli se srovná');
eq(p([NL_ID[0] + '<', NL_ID[1], NL_ID[2] + '<<']).docNumber, 'SPECI2021', 'o výplň víc na konci 1. a 3. řádku');

// jedna špatně přečtená číslice → nic (čtečka zkusí další snímek)
eq(p(['IDD<<T220001283<<<<<<<<<<<<<<<', DE_ID[1], DE_ID[2]]), null, 'chyba v čísle dokladu');
eq(p([DE_ID[0], '6408135<2010315D<<<<<<<<<<<<<4', DE_ID[2]]), null, 'chyba v datu narození');
eq(p([DE_ID[0], '6408125<2010316D<<<<<<<<<<<<<4', DE_ID[2]]), null, 'chyba v platnosti');
eq(p([DE_ID[0], '6408125<2010315D<<<<<<<<<<<<<5', DE_ID[2]]), null, 'chyba v souhrnné číslici');
eq(p(DE_ID.slice(0, 1)), null, 'jen jeden řádek');
eq(p([]), null, 'nic');
eq(p(['Lorem ipsum dolor sit amet, consectetur', 'adipiscing elit sed do eiusmod tempor']), null, 'obyčejný text');

// OCR plete O/0 a podobné v číselných polích – tam se opravuje, kontrolní číslice rozhodne
eq(p([DE_ID[0], '64O8I25<2OIO3I5D<<<<<<<<<<<<<4', DE_ID[2]]).birth, '1964-08-12', 'O a I místo 0 a 1 v datech');

// číslo delší než 9 znaků (belgický průkaz): pokračuje ve volitelném poli
(function () {
  const doc = '000001090036', l1 = 'IDBEL' + doc.slice(0, 9) + '<' + doc.slice(9) + checkDigit(doc);
  const L1 = l1 + '<'.repeat(30 - l1.length);
  let l2 = '850101' + checkDigit('850101') + 'F' + '300101' + checkDigit('300101') + 'BEL' + '<'.repeat(11);
  l2 += checkDigit(L1.slice(5) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29));
  eq(p([L1, l2, 'VZOROVA<<ANNA<<<<<<<<<<<<<<<<<']), { docType: 'ID', docNumber: doc, birth: '1985-01-01', citizenship: 'BE', firstName: 'Anna', lastName: 'Vzorova' },
    'belgický průkaz – dvanáctimístné číslo');
})();

// povolení k pobytu (první znak A) → „Jiný doklad“
(function () {
  const doc = 'Y12345678', L1 = 'ARD<<' + doc + checkDigit(doc) + '<'.repeat(15);
  let l2 = '900507' + checkDigit('900507') + 'F' + '300101' + checkDigit('300101') + 'TUR' + '<'.repeat(11);
  l2 += checkDigit(L1.slice(5) + l2.slice(0, 7) + l2.slice(8, 15) + l2.slice(18, 29));
  eq(p([L1, l2, 'VZOROVA<<AYSE<<<<<<<<<<<<<<<<<']), { docType: 'O', docNumber: doc, birth: '1990-05-07', citizenship: 'TR', firstName: 'Ayse', lastName: 'Vzorova' },
    'německé povolení k pobytu turecké občanky → jiný doklad, občanství TR');
})();

/* ---------- pasy (2 × 44) ---------- */
const DE_P = ['P<D<<MUSTERMANN<<ERIKA<<<<<<<<<<<<<<<<<<<<<<', 'C01X00T478D<<6408125F2702283<<<<<<<<<<<<<<<4'];
eq(p(DE_P), { docType: 'P', docNumber: 'C01X00T47', birth: '1964-08-12', citizenship: 'DE', firstName: 'Erika', lastName: 'Mustermann' },
  'německý pas – vzor 2017');
eq(p([DE_P[0], DE_P[1].slice(0, 28) + '<<<<<<<<<<<<<' + DE_P[1].slice(-2)]).docNumber, 'C01X00T47', 'o výplň míň v osobním čísle se srovná');
eq(p([DE_P[0].slice(0, 41), DE_P[1]]).lastName, 'Mustermann', 'kratší řádek se jménem nevadí');
eq(p([DE_P[0], 'C01X00T479D<<6408125F2702283<<<<<<<<<<<<<<<4']), null, 'pas: chyba v kontrolní číslici čísla');
eq(p(['I' + DE_P[0].slice(1), DE_P[1]]), null, 'pas musí začínat písmenem P');

/* ---------- století u data narození ---------- */
(function () {
  function td3(dob) {
    const doc = 'XX1234567', exp = '300101';
    let b = doc + checkDigit(doc) + 'CZE' + dob + checkDigit(dob) + 'M' + exp + checkDigit(exp) + '<'.repeat(14) + '0';
    b += checkDigit(b.slice(0, 10) + b.slice(13, 20) + b.slice(21, 43));
    return p(['P<CZEVZOROVY<<JAN<<<<<<<<<<<<<<<<<<<<<<<<<<<<', b]);
  }
  eq(td3('850315').birth, '1985-03-15', 'RR = 85 → 1985');
  eq(td3('200315').birth, '2020-03-15', 'RR = 20 → 2020 (dítě)');
  eq(td3('261013').birth, '2026-10-13', 'narozen dnes');
  eq(td3('261014').birth, '1926-10-14', 'zítřek by byl v budoucnosti → 1926');
  eq(td3('851340'), null, 'měsíc 13');
  eq(td3('850315').citizenship, 'CZ', 'CZE → CZ');
})();

/* ---------- čtečka nesmí sahat mimo vlastní repo ---------- */
const cteckaSrc = readFileSync(join(root, 'registrace/ctecka.js'), 'utf8');
const ctecka = cteckaSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');     // bez komentářů
for (const opt of ['workerPath:', 'corePath:', 'langPath:']) eq(ctecka.includes(opt), true, 'ctecka.js předává ' + opt + ' (jinak by Tesseract sáhl na CDN)');
eq(/https?:\/\//.test(ctecka), false, 'ctecka.js nemá v kódu žádnou cizí adresu');
eq(/localStorage|sessionStorage|indexedDB|fetch\(|XMLHttpRequest|toDataURL|toBlob/.test(ctecka), false, 'ctecka.js obraz neukládá ani neodesílá');

if (fails) { console.error(`\n${fails} z ${n} kontrol selhalo`); process.exit(1); }
console.log(`OK — ${n} kontrol`);
