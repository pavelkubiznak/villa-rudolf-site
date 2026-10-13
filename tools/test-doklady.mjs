#!/usr/bin/env node
// Test kontroly data narození a čísel dokladů v /registrace/. Spusť: node tools/test-doklady.mjs
//
// Zkouší registrace/doklady.js (pravidla podle států, kontrolní číslice, meze data narození)
// a hlídá, že registrace.js má ke každému pravidlu texty ve všech čtyřech jazycích.
// Čísla dokladů jsou úřední VZORY (specimeny z PRADO a ministerstev) nebo vymyšlená —
// žádný skutečný doklad sem nepatří.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const D = createRequire(import.meta.url)(join(root, 'registrace/doklady.js'));

let fails = 0, n = 0;
function eq(got, want, what) {
  n++;
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    fails++; console.error('✗ ' + what + '\n    čekáno ' + JSON.stringify(want) + '\n    vyšlo  ' + JSON.stringify(got));
  }
}
const code = (v, c, t) => D.checkDoc(v, c, t).code;
const value = (v, c, t) => D.checkDoc(v, c, t).value;

/* ---------- datum narození ---------- */
const DNES = '2026-10-13';
eq(D.birthFromParts('15', '3', '1985'), '1985-03-15', 'datum z políček');
eq(D.birthFromParts('05', '03', '1985'), '1985-03-05', 'datum s nulami');
eq(D.birthFromParts('29', '2', '2024'), '2024-02-29', 'přestupný rok');
eq(D.birthFromParts('29', '2', '2023'), null, '29. 2. v nepřestupném roce');
eq(D.birthFromParts('31', '4', '1990'), null, '31. 4. neexistuje');
eq(D.birthFromParts('0', '4', '1990'), null, 'den 0');
eq(D.birthFromParts('5', '13', '1990'), null, 'měsíc 13');
eq(D.birthFromParts('5', '3', '85'), null, 'dvouciferný rok se nebere');
eq(D.birthFromParts('5', '3', ''), null, 'bez roku');

eq(D.checkBirth('1985-03-15', DNES).code, 'ok', 'běžný dospělý');
eq(D.checkBirth('2026-10-14', DNES).code, 'future', 'zítra = budoucnost');
eq(D.checkBirth('2026-12-15', DNES).code, 'future', 'letos, ale ještě nenastalo');
eq(D.checkBirth(DNES, DNES), { code: 'confirm', months: 0 }, 'narozen dnes → zeptat se');
// typický překlep: správný den a měsíc, rok letošní
eq(D.checkBirth('2026-03-15', DNES), { code: 'confirm', months: 6 }, 'rok 2026 místo 1985 → „opravdu 6 měsíců?“');
eq(D.checkBirth('2025-11-20', DNES), { code: 'confirm', months: 10 }, 'mladší než rok');
eq(D.checkBirth('2025-01-15', DNES), { code: 'confirm', months: 20 }, 'loňský rok, i když je mu přes rok');
eq(D.checkBirth('2024-12-31', DNES).code, 'ok', 'předloňský rok už bez dotazu');
eq(D.checkBirth('1916-10-13', DNES).code, 'ok', 'přesně 110 let');
eq(D.checkBirth('1916-10-12', DNES).code, 'old', 'přes 110 let');
eq(D.checkBirth('1900-01-01', DNES).code, 'old', 'rok 1900');

/* ---------- každé pravidlo: vzor sedí, sousední tvary ne ---------- */
for (const [c, types] of Object.entries(D.RULES)) {
  for (const [t, rule] of Object.entries(types)) {
    for (const f of rule.forms) {
      eq(code(f.ex, c, t), 'ok', `${c}/${t}: vlastní vzor ${f.ex} projde`);
      eq(D.shape(f).reduce((a, r) => a + r[0], 0), D.normalize(f.ex).length, `${c}/${t}: maska má délku vzoru ${f.ex}`);
    }
    eq(code('12', c, t) !== 'ok', true, `${c}/${t}: dva znaky neprojdou`);
    eq(code('ÁB123456', c, t), 'chars', `${c}/${t}: diakritika`);
  }
}

/* ---------- Německo ---------- */
eq(code('L01XPVM8J', 'DE', 'ID'), 'ok', 'DE průkaz – vzor PRADO');
eq(code('T22000129', 'DE', 'ID'), 'ok', 'DE průkaz – vzor BMI');
eq(code('C01X00T47', 'DE', 'P'), 'ok', 'DE pas – vzor PRADO 2017');
eq(code('CZ63351X7', 'DE', 'P'), 'ok', 'DE pas – vzor PRADO 2024');
eq(value('l01x pvm8j', 'DE', 'ID'), 'L01XPVM8J', 'DE: malá písmena a mezera se srovnají');
eq(value('LO1XPVM8J', 'DE', 'ID'), 'L01XPVM8J', 'DE: písmeno O se nepoužívá → nula');
eq(value('L01XPVM8J2', 'DE', 'ID'), 'L01XPVM8J', 'DE: 10 znaků ze strojové zóny, kontrolní číslice 2 sedí → odřízne se');
eq(code('L01XPVM8J3', 'DE', 'ID'), 'format', 'DE: 10 znaků se špatnou kontrolní číslicí');
eq(value('T220001293', 'DE', 'ID'), 'T22000129', 'DE: vzor BMI i s kontrolní číslicí 3');
eq(code('123456', 'DE', 'ID'), 'format', 'DE: šestimístné CAN není číslo dokladu');
eq(code('123456789', 'DE', 'ID'), 'format', 'DE: musí začínat písmenem');
eq(code('L01XPVM8A', 'DE', 'ID'), 'format', 'DE: písmeno A se nepoužívá');
eq(code('L01XPVM8S', 'DE', 'P'), 'format', 'DE: písmeno S se nepoužívá');
eq(code('A0000000', 'DE', 'P'), 'ok', 'DE: prozatímní pas 1 písmeno + 7 číslic');
eq(code('G0000000', 'DE', 'P'), 'ok', 'DE: dětský pas');
eq(D.icaoCheckDigit('C01X00T47'), '8', 'ICAO 7-3-1: vzor pasu 2017');
eq(D.icaoCheckDigit('C01X0006H'), '1', 'ICAO 7-3-1: vzor pasu 2007');

/* ---------- Polsko: kontrolní číslice na všech úředních vzorech ---------- */
for (const s of ['ZZC708926', 'ZZC301730', 'ZZC900146', 'ZZA002204']) eq(code(s, 'PL', 'ID'), 'ok', 'PL dowód – vzor ' + s);
for (const s of ['ZF6000482', 'ZE3012230', 'ZE8010075']) eq(code(s, 'PL', 'P'), 'ok', 'PL pas – vzor ' + s);
eq(value('ZZC 708926', 'PL', 'ID'), 'ZZC708926', 'PL: mezera jako na průkazu');
// překlep v jedné číslici kontrolní číslice vždy odhalí (váhy 1, 3, 7, 9 jsou s 10 nesoudělné)
for (let i = 3; i < 9; i++) {
  for (let d = 0; d < 10; d++) {
    const s = 'ZZC708926', t = s.slice(0, i) + d + s.slice(i + 1);
    if (t !== s) eq(code(t, 'PL', 'ID'), 'checksum', 'PL dowód: překlep ' + t);
  }
}
for (let i = 2; i < 9; i++) {
  const s = 'ZF6000482', d = (+s[i] + 1) % 10, t = s.slice(0, i) + d + s.slice(i + 1);
  eq(code(t, 'PL', 'P'), 'checksum', 'PL pas: překlep ' + t);
}
eq(code('ZZC70892', 'PL', 'ID'), 'format', 'PL dowód: chybí číslice');
eq(code('ZC7089260', 'PL', 'ID') !== 'ok', true, 'PL dowód: 2 písmena + 7 číslic není dowód');
eq(D.checkDoc('ZF6000482', 'PL', 'ID').other, 'P', 'PL: číslo pasu zadané jako průkaz → nabídnout pas');
eq(D.checkDoc('ZZC708926', 'PL', 'P').other, 'ID', 'PL: číslo průkazu zadané jako pas → nabídnout průkaz');
eq(code('123456', 'PL', 'ID'), 'format', 'PL: šestimístné CAN');

/* ---------- Česko, Slovensko ---------- */
eq(code('123456789', 'CZ', 'ID'), 'ok', 'CZ průkaz 9 číslic');
eq(code('012345678', 'CZ', 'ID'), 'format', 'CZ průkaz nezačíná nulou');
eq(D.checkDoc('12345678', 'CZ', 'ID').other, 'P', 'CZ: 8 číslic je pas');
eq(code('12345678', 'CZ', 'P'), 'ok', 'CZ pas 8 číslic');
eq(D.checkDoc('123456789', 'CZ', 'P').other, 'ID', 'CZ: 9 číslic je průkaz');
eq(code('AB123456', 'CZ', 'ID'), 'format', 'CZ: průkaz se sérií už neplatí');
eq(code('XX123456', 'SK', 'ID'), 'ok', 'SK průkaz');
eq(code('XX1234567', 'SK', 'P'), 'ok', 'SK pas');
eq(D.checkDoc('XX1234567', 'SK', 'ID').other, 'P', 'SK: 7 číslic je pas');
eq(code('X1234567', 'SK', 'ID'), 'format', 'SK: jedno písmeno');

/* ---------- Nizozemsko, Belgie, Rakousko, UK, Itálie ---------- */
eq(code('SPECI2014', 'NL', 'P'), 'ok', 'NL vzor 2014');
eq(code('SPECI2021', 'NL', 'ID'), 'ok', 'NL vzor 2021');
eq(value('SPECI2O14', 'NL', 'ID'), 'SPECI2014', 'NL: písmeno O se nepoužívá → nula');
eq(code('SPECI201A', 'NL', 'ID'), 'format', 'NL: poslední znak musí být číslice');
eq(code('S1ECI2014', 'NL', 'ID'), 'format', 'NL: první dva znaky písmena');
eq(code('999999990', 'NL', 'ID'), 'format', 'NL: devítimístné BSN není číslo dokladu');
for (const s of ['000-0010900-36', '506-4329177-14', '600-0014769-35', '600-0017950-15']) eq(code(s, 'BE', 'ID'), 'ok', 'BE eID – vzor ' + s);
eq(value('000-0010900-36', 'BE', 'ID'), '000001090036', 'BE: pomlčky se odstraní');
eq(code('000-0010900-37', 'BE', 'ID'), 'checksoft', 'BE: nesedící mod 97 jen varuje');
eq(code('000-5907007-01', 'BE', 'ID'), 'checksoft', 'BE: úřední vzor, který na mod 97 nesedí – proto jen varování');
eq(code('00000109003', 'BE', 'ID'), 'format', 'BE: 11 číslic');
eq(code('EP000000', 'BE', 'P'), 'ok', 'BE pas do 2022');
eq(code('GA0000000', 'BE', 'P'), 'ok', 'BE pas od 2022');
eq(code('U6740967', 'AT', 'P'), 'ok', 'AT pas starý');
eq(code('AP1234567', 'AT', 'P'), 'ok', 'AT pas nový');
eq(code('PA1234567', 'AT', 'ID'), 'ok', 'AT průkaz nový');
eq(code('10001001', 'AT', 'ID'), 'ok', 'AT průkaz starý, 8 číslic');
eq(code('X0001001', 'AT', 'ID'), 'ok', 'AT průkaz starý – vzor PRADO s písmenem');
eq(code('123456', 'AT', 'ID'), 'format', 'AT: šestimístné CAN');
eq(code('999313765', 'GB', 'P'), 'ok', 'UK pas');
eq(code('99931376', 'GB', 'P'), 'format', 'UK pas 8 číslic');
eq(D.checkDoc('999313765', 'GB', 'ID').other, 'P', 'UK: průkaz neexistuje, číslo sedí na pas');
eq(code('YA0000000', 'IT', 'P'), 'ok', 'IT pas');
eq(code('CA00000AA', 'IT', 'ID'), 'generic', 'IT průkaz pravidlo nemá → obecná kontrola');

/* ---------- stát bez pravidla, jiný doklad ---------- */
eq(code('', 'DE', 'ID'), 'empty', 'prázdné');
eq(code('   ', 'US', 'P'), 'empty', 'jen mezery');
eq(code('E00007813', 'US', 'P'), 'generic', 'USA: obecná kontrola + potvrzení hosta');
eq(code('AB12', 'US', 'P'), 'short', 'krátké');
eq(code('A'.repeat(21), 'US', 'P'), 'long', 'dlouhé');
eq(code('TR-A 123.456', 'TR', 'P'), 'generic', 'oddělovače se odstraní');
eq(value('tr-a 123.456', 'TR', 'P'), 'TRA123456', 'ukládá se velkými písmeny bez oddělovačů');
eq(code('ČÍSLO123', 'TR', 'P'), 'chars', 'diakritika');
eq(code('Y12345678', 'DE', 'O'), 'generic', '„Jiný doklad“ pravidlo nemá ani u Němce');
eq(code('constructor', 'constructor', 'ID'), 'generic', 'stát mimo tabulku nespadne');
eq(code('L01XPVM8J', 'DE', 'toString'), 'generic', 'druh mimo tabulku nespadne');

/* ---------- texty: každý jazyk má všechno, co pravidla potřebují ---------- */
const src = readFileSync(join(root, 'registrace/registrace.js'), 'utf8');
const a = src.indexOf('  var T = {'), b = src.indexOf('  /* ===================== země');
if (a < 0 || b < 0) throw new Error('slovník T v registrace.js nenalezen — změnily se kotvy?');
const T = new Function(src.slice(a, b) + '\n return T;')();
const langs = Object.keys(T);
eq(langs, ['cs', 'en', 'de', 'pl'], 'jazyky formuláře');
const keys = Object.keys(T.cs);
for (const l of langs) {
  eq(Object.keys(T[l]).filter(k => !keys.includes(k)), [], l + ': klíče navíc proti cs');
  eq(keys.filter(k => !(k in T[l])), [], l + ': chybějící klíče proti cs');
  for (const types of Object.values(D.RULES)) for (const rule of Object.values(types)) {
    eq(typeof T[l]['where_' + rule.where], 'string', l + ': text „kde na dokladu“ pro ' + rule.where);
  }
  for (const k of ['shapeL', 'shapeD', 'shapeA', 'ageMonths']) eq(T[l][k].length, 3, l + ': tři tvary množného čísla u ' + k);
  for (const k of ['errDocFormat', 'docShape']) for (const ph of ['{shape}', '{ex}', '{where}']) {
    eq(T[l][k].includes(ph), true, `${l}: ${k} obsahuje ${ph}`);
  }
  eq(T[l].birthAsk.includes('{age}'), true, l + ': birthAsk obsahuje {age}');
}

if (fails) { console.error(`\n${fails} z ${n} kontrol selhalo`); process.exit(1); }
console.log(`OK — ${n} kontrol`);
