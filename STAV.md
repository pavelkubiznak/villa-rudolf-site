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
| Šrafování matoucí pro úklid | ✅ **vyřešeno 13. 8.** |
| Číst 4 feedy zvlášť místo e-chalupy hubu | 🟡 **kód hotov, čeká na 3 secrety** |
| **Bezpečnost: `vr_purge_expired` jde spustit zvenku** | 🔴 **OPRAVIT** |

**✅ Šrafování — hotovo a nasazeno 13. 8.** Šrafuje se **jen skutečná dvojitá rezervace**
(oba pobyty živé ve feedu). Data dala majiteli za pravdu dvakrát: z 15 šrafovaných buněk
nebyla **ani jedna** skutečný konflikt — všech 5 překryvů mělo aspoň jednu stranu už mimo
živý feed. Oranžový čárkovaný rámeček s „?" zrušen; překryv se starým záznamem zůstal
v tooltipu a v banneru. Živě ověřeno: 15 → 0 šrafovaných buněk, červená větev ověřená
podvrženými daty. Detaily v `CLAUDE.md` kalendáře.

**🟡 Čtyři feedy — kód hotový a nasazený 13. 8., zatím ale běží v hub módu.**
`update_history.py` umí číst čtyři feedy zvlášť a filtrovat na vlastní rezervace kanálu.
Přepíná se sám: nastavený jen e-chalupy feed → **hub mode**, chová se přesně jako dřív
(ověřeno regresním testem na bajtovou shodu). Dva a víc feedů → **multi mode**.

*Zbývá:* přidat do repo secrets `ICAL_URL_AIRBNB`, `ICAL_URL_BOOKING`, `ICAL_URL_FEWO`
(URL exportu iCal z extranetu každé platformy) a pustit workflow ručně, nejdřív s `--dry-run`.
Filtrovací pravidla jsou odvozená z toho, jak vypadá **hub** feed — ostré feedy jednotlivých
kanálů zatím nikdo neviděl, takže první běh je potřeba přečíst v logu. Skript proto loguje
každý zahozený záznam i s důvodem.

Pro `/sprava/` je podstatné, že skript drží **kontinuitu `uidh`**: pobyt má ve feedu svého
kanálu jiné UID než v hubu, takže bez ošetření by každá živá rezervace dostala nový `uidh`
a vazba `vr_bookings.uidh` by se utrhla. Skript při shodě `(start, end, platform)` převezme
archivní klíč. **Kvůli přepnutí se v `/sprava/` nemusí měnit nic.**

**🔴 `vr_purge_expired` jde spustit zvenku.** Heslo té mazací funkce je napsané otevřeně
v `supabase/migrations/20260724_vr_retention.sql:43` (repo je veřejné) a funkce má
`grant execute … to anon` (řádek 81). Adresa Supabase je taky veřejná — je v `MAPA-SYSTEMU.md`.
Spustit ji tedy může kdokoli. Nesmaže nic, co by nezmizelo samo časem, ale destruktivní
funkci na produkční DB nemá držet v ruce cizí člověk. Oprava: heslo do vaultu / config,
`revoke execute … from anon`. Ostatní admin funkce tuhle díru nemají (jdou přes
`_vr_admin_auth`).

*Souvislost s evidencí pobytů:* stejná funkce maže bookingy 30+ dní po odjezdu, které
**nemají zapsané osoby** (řádek 57). Pro majitelovo interní účetnictví („kdo tam byl, jak
dlouho, kolik hostů") to znamená, že proběhlé pobyty bez evidence osob se tiše ztrácejí.
Než se z `vr_bookings` začne dělat dlouhodobá evidence, je potřeba tohle vyřešit — a v repu
kalendáře taky 18měsíční prune `history.json`.

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

1. **`vr_purge_expired`** — heslo ve veřejném repu + `grant to anon`, spustit to může kdokoli
2. **Tři secrety pro čtyři feedy** — kód čeká nasazený, stačí URL z extranetů + zkušební běh
3. **Retence pobytů** — 30denní mazání bookingů bez osob a 18měsíční prune `history.json`
   ukusují podklady pro evidenci dřív, než z nich evidence vznikne
4. **Polština u výletů** — podle toho, jestli chodí polští hosté
5. **Zprávy** — až bude jasné zadání

~~Šrafování v kalendáři~~ — hotovo 13. 8.

## Kde pracovat

| Práce | Repo | Klon |
|---|---|---|
| kalendář (šrafování, 4 feedy) | `villa-booking-calendar` | `~/villa-booking-calendar` |
| výlety — data a překlady | `villa-rudolf-portal` | `~/villa-rudolf-portal` |
| výlety — zobrazení, zprávy, `/sprava/` | `villa-rudolf-site` | *(klon zatím není)* |

**Jedna práce = jedna session.** Session začíná přečtením `MAPA-SYSTEMU.md` a tohohle souboru,
ne prohledáváním repozitářů.
