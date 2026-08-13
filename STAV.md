# Villa Rudolf — co je hotové a co ne

**Tady se zjišťuje, na čem se pracuje.** Mapa (`MAPA-SYSTEMU.md`) říká *kde co běží*,
tenhle soubor říká *co zbývá udělat*. Kdo něco dokončí, přepíše to tady ve stejném commitu.

Aktualizováno: 13. 8. 2026

---

## 🗓️ Kalendář rezervací → repo `villa-booking-calendar`

| | Stav |
|---|---|
| Zobrazování překryvů (šrafování + banner) | ✅ nasazeno, ověřeno živě |
| Okno kalendáře +24 měsíců dopředu | ✅ nasazeno |
| Obsazenost v záhlaví měsíce (`29/31 · 94 %`) | ✅ nasazeno |
| Anonymizace veřejných dat | ✅ nasazeno |
| **Šrafování je pro úklid nesrozumitelné** | 🔴 **ROZHODNOUT** |
| **Číst 4 feedy zvlášť místo e-chalupy hubu** | 🔲 hlavní zbývající práce |

**🔴 Šrafování — čeká na rozhodnutí (rychlá výhra, ~30 min).**
Majitel 5. 8.: *„je to těžko pochopitelný… uklízečky se v tom ztratí."* Šrafovaná buňka dnes
znamená „na tuhle noc jsou zapsané dvě rezervace"; oranžová s „?" = jedna strana už není
v živém feedu. Pro úklid je to informace navíc, kterou nepotřebuje — den odjezdu = den úklidu
bez ohledu na kolizi. Varianty: (a) v úklidovém pohledu úplně skrýt a nechat jen majiteli,
(b) nechat drobný puntík, (c) přejmenovat do lidské řeči. **Doporučeno (a).**

**🔲 Čtyři feedy.** Dnes se čte jen e-chalupy hub, který **odmítá uložit rezervaci překrývající
existující** → platné rezervace z jiných kanálů se do feedu nedostanou vůbec
(doloženo 3.–10. 7. 2027, Booking.com). Důsledek sahá dál než do kalendáře: co není ve feedu,
nevidí ani `/sprava/`, ani evidence hostů pro poplatek. Řešení: číst Airbnb / Booking / FeWo /
e-chalupy každý zvlášť a filtrovat na vlastní rezervace kanálu. Detaily v `CLAUDE.md` kalendáře.

---

## 🥾 Výlety pro hosty → data v `villa-rudolf-portal`, zobrazení v `villa-rudolf-site`

| | Stav |
|---|---|
| Katalog 49 výletů + 6 restaurací (`portal/data/trips.json`) | ✅ |
| Překlady výletů cs / de / en (pole `name`, `tagline`, `desc`, `openNote`, `price`) | ✅ kompletní, 0 mezer |
| Stránka `villarudolf.com/vylety/` (index + css + js, ~100 kB) | ✅ běží |
| Počasí (`forecast.json`, cron na Hetzneru) | ✅ běží |
| **Polština u výletů** | 🔴 **CHYBÍ** |

**🔴 Polština.** Web (`site/index.html`) i zprávy hostovi v `/sprava/` umí **4 jazyky
(cs/de/en/pl)**, ale `trips.json` má jen **3 (cs/de/en)**. Polský host tedy dostane web
a zprávu polsky, ale průvodce výlety ne. Doplnit `pl` do pěti vícejazyčných polí u 49 výletů.

---

## 💬 Zprávy hostovi → `villa-rudolf-site/sprava/`

| | Stav |
|---|---|
| Šablony zpráv ve 4 jazycích (cs/de/en/pl) | ✅ v `sprava.js` |
| Log odeslaných zpráv (`vr_admin_msg_log`, `msg_key`) | ✅ |
| Kód od dveří z telefonu | ✅ |
| **Co přesně zbývá dotáhnout** | ❓ **UPŘESNIT** |

V `sprava.js` je kompletní aparát (66× `msg`, `msgLang`, `msglog`) a žádné `TODO`.
Majitel 13. 8. říká, že „zprávu potřebuje dotáhnout" — **není jasné co**. Kandidáti:
odesílání přes WhatsApp (dnes se odkaz vkládá ručně, Booking blokuje boty), nebo jiná zpráva
(denní souhrn / report). **Doplnit, až se upřesní.**

---

## Doporučené pořadí

1. **Šrafování v kalendáři** — 30 minut, uklízečky to mate každý den
2. **Čtyři feedy** — největší kus, ale odblokuje kalendář, `/sprava/` i evidenci pro poplatek
3. **Polština u výletů** — podle toho, jestli chodí polští hosté
4. **Zprávy** — až bude jasné zadání

## Kde pracovat

| Práce | Repo | Klon |
|---|---|---|
| kalendář (šrafování, 4 feedy) | `villa-booking-calendar` | `~/villa-booking-calendar` |
| výlety — data a překlady | `villa-rudolf-portal` | `~/villa-rudolf-portal` |
| výlety — zobrazení, zprávy, `/sprava/` | `villa-rudolf-site` | *(klon zatím není)* |

**Jedna práce = jedna session.** Session začíná přečtením `MAPA-SYSTEMU.md` a tohohle souboru,
ne prohledáváním repozitářů.
