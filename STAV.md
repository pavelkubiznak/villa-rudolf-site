# Villa Rudolf — co je hotové a co ne

**Tady se zjišťuje, na čem se pracuje.** Mapa (`MAPA-SYSTEMU.md`) říká *kde co běží*,
tenhle soubor říká *co zbývá udělat*. Kdo něco dokončí, přepíše to tady ve stejném commitu.

Aktualizováno: 9. 9. 2026

---

## 🗓️ Kalendář rezervací → repo `villa-booking-calendar`

| | Stav |
|---|---|
| Zobrazování překryvů (šrafování + banner) | ✅ nasazeno, ověřeno živě |
| Okno kalendáře +24 měsíců dopředu | ✅ nasazeno |
| Obsazenost v záhlaví měsíce (`29/31 · 94 %`) | ✅ nasazeno |
| Anonymizace veřejných dat | ✅ nasazeno |
| Šrafování matoucí pro úklid | ✅ **vyřešeno 13. 8.** |
| Nepotvrzené záznamy strašily jako dvojitá rezervace | ✅ **vyřešeno 9. 9.** |
| Stejná falešná hláška v `/sprava/` a v hlídači n8n | 🟡 **opraveno v repu, hlídač čeká na import do n8n** |
| Číst 4 feedy zvlášť místo e-chalupy hubu | 🟡 **kód hotov, čeká na 3 secrety** |
| **Bezpečnost: `vr_purge_expired` jde spustit zvenku** | 🟡 **migrace napsaná 8. 9., čeká na nasazení** |

**✅ Šrafování — hotovo a nasazeno 13. 8.** Šrafuje se **jen skutečná dvojitá rezervace**
(oba pobyty živé ve feedu). Data dala majiteli za pravdu dvakrát: z 15 šrafovaných buněk
nebyla **ani jedna** skutečný konflikt — všech 5 překryvů mělo aspoň jednu stranu už mimo
živý feed. Oranžový čárkovaný rámeček s „?" zrušen; překryv se starým záznamem zůstal
v tooltipu a v banneru. Živě ověřeno: 15 → 0 šrafovaných buněk, červená větev ověřená
podvrženými daty. Detaily v `CLAUDE.md` kalendáře.

**✅ Nepotvrzené záznamy — hotovo 9. 9.** Majitel: *„najedu na termín, je tam napsané dvě
rezervace a booking není ve feedu — vždycky se leknu, že mám dvojitou rezervaci."* Záznam,
který v živém feedu není a přitom pobyt teprve má proběhnout (propadlá předrezervace, storno),
se nově nezobrazuje nikde: v kalendáři, tooltipu, banneru, obsazenosti, owner tabulce ani
v tržbách. **Pozor na to, co `stale` znamená:** feed nese jen dnešek a budoucnost, takže
každý proběhlý pobyt zestárne na `stale` sám (21 z 30) — rozhoduje proto `stale && end > dnes`,
jinak by zmizel celý archiv. Skryté záznamy jsou vypsané v panelu historie (úklid) a v sekci
„Nepotvrzené záznamy mimo kalendář" (majitel); `history.json` se nemění. Detaily v `CLAUDE.md`
kalendáře.

**✅ Stejná falešná hláška byla i tady — vyřešeno 12. 9.** Ani `/sprava/` (`sprava.js`), ani hlídač
`n8n/VrConflictWatch` `stale` nefiltrovaly, takže eskalovaly **3 překryvy — a všechny tři
měly aspoň jednu stranu mimo živý feed** (6/2027 Fewo, 8/2027 Booking, 12/2027 Fewo).
`/sprava/` nasazeno pushem 9. 9.; **hlídač nahrán do živého n8n 12. 9. 2026** (přesně kód
z `n8n/VrConflictWatch/VrConflictWatch.detect.js`, živé == reference). První běh po nasazení:
`desiredCount` 3 → 0, všechny čtyři řádky ve `vr_conflicts` mají `resolved_at`, banner zhasl.
Všechny tři duchy navíc ověřeny přímo v extranetech (Booking do 31. 3. 2028, Airbnb, FeWo)
a vyřazeny ve `verified.json` kalendáře — ten je od 12. 9. konečně commitnutý a živý na Pages
(do té doby byl jen lokální a `/sprava/` i kalendář ho četly jako 404).

**✅ Třetí místo: denní e-mail `VrDailyTasks` — vyřešeno 12. 9.** Hlídač už mlčel, ale denní
souhrn v 7:30 poslal ty **stejné tři „dvojité rezervace"** ještě jednou — jeho `buildStays()`
byl třetí kopií téže smyčky a `stale` neznal. Doplněn týž filtr (`stale === true && end > dnes`),
ověřeno proti živému `history.json`: 3 překryvy → 0. Nasazeno do ostrého n8n (`import:workflow`
+ `update:workflow --active=true` + `docker restart`), záloha původního workflow leží
v `/root/vrdt_backup_20260912.json` na `sintera-velin`. **Poučení:** ta smyčka existuje na
**třech** místech (`sprava.js`, `VrConflictWatch.detect.js`, `VrDailyTasks.code.js`) — když se
mění pravidlo pro duchy, sáhni na všechny tři, jinak jedno z nich hlásí staré konflikty dál.

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
funkci na produkční DB nemá držet v ruce cizí člověk. Ostatní admin funkce tuhle díru nemají
(jdou přes `_vr_admin_auth`).

**🟡 Oprava napsaná 8. 9.:** `supabase/migrations/20260908_vr_purge_lockdown.sql` — hash secretu
se čte z `vr_admin_config` (klíč `purge_secret_sha256`), `revoke execute … from public, anon,
authenticated`, zůstává jen `service_role`. Postup nasazení je v hlavičce migrace: nový secret →
jeho sha256 do configu → aplikovat migraci → přepnout volajícího (pg_cron / n8n) na service klíč.
Staré heslo je v git historii, takže **rotace je povinná**, ne volitelná.

*Souvislost s evidencí pobytů:* stejná funkce maže bookingy 30+ dní po odjezdu, které
**nemají zapsané osoby** (řádek 57). Pro majitelovo interní účetnictví („kdo tam byl, jak
dlouho, kolik hostů") to znamená, že proběhlé pobyty bez evidence osob se tiše ztrácejí.
Než se z `vr_bookings` začne dělat dlouhodobá evidence, je potřeba tohle vyřešit — a v repu
kalendáře taky 18měsíční prune `history.json`.

---

## 💳 Předrezervace a přímý prodej → `vr_holds` + `/sprava/` + kalendář

| | Stav |
|---|---|
| Tabulka `vr_holds` + admin/veřejné RPC (`20260909_vr_holds.sql`) | 🟡 **kód hotov, čeká na spuštění migrace** |
| Sekce „Předrezervace" v `/sprava/`, editor faktury, dialog „Uhrazeno" | ✅ hotovo, ověřeno v prohlížeči |
| Pojistka měna ⇒ účet (klient i databáze) | ✅ hotovo |
| Publikace do kalendáře (`vr_public_holds()` → `history.json`) | ✅ hotovo v `villa-booking-calendar` |
| Zobrazení v úklidovém kalendáři i v `owner.html` | ✅ hotovo, ověřeno v Chromiu |
| `n8n/VrConflictWatch` — „Přímá" × „Přímá" eskaluje | 🟡 **referenční kód upraven, čeká na re-import** |
| Párování plateb z Fia (`vr_payments`, `vr_ingest_payments`) | 🟡 **kód hotov + otestován, čeká na 3 tokeny a migraci** |
| Sekce „Platby k vyřízení" v `/sprava/` | ✅ hotovo, ověřeno v prohlížeči |
| Čtečka Fia pro n8n (`n8n/VrPaymentWatch`) | 🟡 **kód hotov + offline testy, čeká na složení workflow** |
| Napojení na iDoklad (kontrola účtu na faktuře přímo ze zdroje) | ⏭️ **nezačato** — API se nepsalo naslepo |

**Proč to vzniklo.** Pobyt prodaný napřímo nebyl v žádném feedu, takže pro systém neexistoval —
`/sprava/` o něm nevěděla a homepage ten termín dál nabízela jako volný. Tak zmizel termín
**14.–21. 8. 2027**: zálohová faktura vystavená i uhrazená, peníze v bance, a v systému nic.
Spouštěčem proto **není platba, ale vystavení zálohové faktury**.

*Zbývá:*
1. **Spustit migraci** `supabase/migrations/20260909_vr_holds.sql` proti živé DB. Do té doby
   vrací RPC 404, `/sprava/` to spolkne (sekce se neukáže) a Action kalendáře to zaloguje
   jako `::warning::` a jede beze změny. Nasadit se to tedy dá v libovolném pořadí.
2. **Znovu importovat `n8n/VrConflictWatch`** (Code node „Detekce konfliktů").
3. **Zapsat termín 14.–21. 8. 2027** jako uhrazenou přímou rezervaci a **zablokovat ho na
   platformách** — dneska je v očích všech kanálů volný.
4. **Spustit migraci** `supabase/migrations/20260910_vr_payments.sql`.
5. **Založit tři read-only tokeny Fia** (VR korunový, VR eurový, hlavní účet Sintery),
   vložit je do prostředí n8n jako `FIO_TOKEN_VR_CZK` / `_VR_EUR` / `_SINTERA` a poskládat
   workflow podle `n8n/VrPaymentWatch/README.md`. **První běhy nech read-only**
   (`AUTOCONFIRM = false`) a přečti, co párování navrhlo — teprve pak povol zápis.
6. Až bude párování usazené: napojit **iDoklad** a číst z něj, na jaký účet je faktura
   opravdu vystavená (dnes se to bere z toho, co se zapíše ručně v `/sprava/`).

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

**✅ Odkaz na průvodce se hostovi konečně posílá — 15. 9. 2026.** Potvrzení (T−30) slibovalo
„osobní stránku s doporučeními", ale žádný krok sekvence ji neposílal; odkaz `/pruvodce/?t=`
byl jen v detailu pobytu k ručnímu kopírování. Teď je v jádru uvítací zprávy (T−7) ve všech
čtyřech jazycích (`{PRUVODCE_LINK}`, `sprava.js` i `VrDailyTasks`). Souvisí druhá díra: token hosta
žil jen v `sessionStorage` jedné karty, po zavření zbývalo „Vygenerovat nový odkaz" — a to
zneplatnilo odkaz, který už host dostal. Migrace `20260915_vr_token_enc.sql` (nasazena) ukládá token
zašifrovaný admin klíčem (`pgp_sym_encrypt`), `vr_admin_list_bookings` ho vrací dešifrovaný →
odkazy fungují na každém zařízení a bez regenerace. Pobyty založené před 15. 9. `token_enc` nemají:
u nich se odkaz vygeneruje jednou tlačítkem v detailu a dál už drží. Denní e-mail (nasazen do n8n
15. 9., záloha `/root/vrdt_backup_20260915.json`) navíc u nespárovaných pobytů čte `verified.json`
kalendáře: servisní blok (`service`) a nepotvrzený termín (`unconfirmed`) hosta nemají, takže se nehlásí —
jinak by od 12. 10. sedm týdnů denně strašila „rekonstrukce schodů". Okno nespárovaných rozšířeno na
T+35, protože první zpráva sekvence je T−30 (v `sprava.js` i v e-mailu stejně).


---

## 📈 Návštěvnost webu → Umami na Hetzneru

| | Stav |
|---|---|
| Umami (self-hosted, cookieless), dashboard `https://178-104-207-97.sslip.io` | ✅ běží nejpozději od 23. 7. |
| Skript na `/`, `/vylety/`, `/pruvodce/`, `/podminky/` | ✅ nasazeno od začátku |
| Skript na `/info/`, `/album/`, `/checkin/`, `/registrace/` | ✅ **doplněno 26. 8.** |
| Vlastní eventy plánovače (`planner_open`, `planner_filter`, `Detail-výlet`, …) | ✅ v `planner.js` |
| Hostovské tokeny `?t=…` netečou do analytiky (`data-exclude-search`) | ✅ **utěsněno 26. 8.** |
| Odkaz „📈 Návštěvnost" v liště `/sprava/` | ✅ **přidáno 26. 8.** |
| Zapamatovatelný vchod `villarudolf.com/metrika` (přesměrování, noindex, bez odkazů) | ✅ **přidáno 26. 8.** |
| Subdoména `metrika.villarudolf.com` | 💤 volitelné — kroky níže |
| Ověřit v dashboardu, že data od července opravdu tečou | ❓ **NA MAJITELI** — jedno otevření |

Měří se: návštěvy, zobrazení stránek, doba návštěvy, zdroje (referrer), země, jazyk,
prohlížeč a zařízení. Bez cookies a bez PII — `/podminky/` to deklarují ve 4 jazycích.
`/sprava/` se **záměrně neměří**: majitelovy vlastní návštěvy by kazily čísla
a v URL bývá `?key=…`.

*Zpětně:* do 26. 8. zapisovalo `/pruvodce/` adresy včetně `?t=<token hosta>` — staré
záznamy v datech Umami tedy tokeny obsahují (vidí je jen přihlášený do dashboardu).
Kdo chce úklid, smaže v Umami stará data webu; jinak s tím netřeba nic dělat.

*Subdoména `metrika.villarudolf.com`, kdyby byla chuť (z repa to udělat nejde — je to
DNS + server):* (1) v DNS domény přidat A záznam `metrika` → `178.104.207.97`;
(2) na Hetzneru přidat tenhle hostname k aplikaci Umami v reverse proxy, která dnes
obsluhuje `178-104-207-97.sslip.io`, a nechat vystavit certifikát; (3) přepsat cíl
přesměrování v `/metrika/index.html` — jediné místo, `/sprava/` odkazuje přes něj;
(4) volitelně přepnout na nový hostname i `src` měřicího skriptu na stránkách,
ať měření nestojí na IP adrese v názvu.

*Další krok, až bude chuť:* UTM parametry do odkazů, které sami rozdáváme (profily na
Booking/Airbnb/e-chalupy, příspěvky, zprávy hostům) — pak jde rozlišit, který kanál
lidi přivádí, i když prohlížeč referrer nepošle.

---

## Doporučené pořadí

1. **Zapsat 14.–21. 8. 2027 a zablokovat ho na platformách** — zaplacený termín je dneska
   v očích všech kanálů volný. Do jednoho z nich může kdykoli spadnout druhá rezervace.
2. **`vr_purge_expired`** — migrace `20260908_vr_purge_lockdown.sql` je napsaná, zbývá nasadit
   podle postupu v její hlavičce (nový secret, hash do configu, service klíč u volajícího)
3. **Spustit migrace `20260909_vr_holds.sql` a `20260910_vr_payments.sql`** — bez nich nemají
   sekce Předrezervace a Platby kam ukládat
4. **Tři secrety pro čtyři feedy** — kód čeká nasazený, stačí URL z extranetů + zkušební běh
5. **Retence pobytů** — 30denní mazání bookingů bez osob a 18měsíční prune `history.json`
   ukusují podklady pro evidenci dřív, než z nich evidence vznikne
6. **Etapa 2 předrezervací** — párování plateb z iDokladu a Fia (viz sekce výš)
7. **Polština u výletů** — podle toho, jestli chodí polští hosté
8. **Zprávy** — až bude jasné zadání

~~Šrafování v kalendáři~~ — hotovo 13. 8. · ~~Nepotvrzené záznamy v kalendáři~~ — hotovo 9. 9. ·
~~Import `VrConflictWatch` do n8n~~ — nahráno 12. 9.

---

## 🔍 Audit repa 8. 9. 2026 → `villa-rudolf-site`

Průchod celého repa: 32 hledačů (oblast × lens), 187 nálezů, skeptické ověření doběhlo
jen u části (limit účtu), zbytek ověřen ručně. Opravené je níž, neopravené pod tím.

**Opraveno (druhý commit, ostatní oblasti):**
- **Edge Function `album`: akce `upload` vydávala podepsanou upload URL bez ověření tokenu**
  — kdokoli s libovolným řetězcem mohl plnit bucket `vr-album` (cizí album ne, úložiště ano).
  Teď se před podpisem volá `vr_album_open`. **Nasadit:** `supabase functions deploy album`.
- `?lang=constructor` stejnou chybou shazoval i `/podminky/`, `/info/`, `/vylety/`, plánovač,
  `/registrace/` a `/checkin/` → whitelist `isLang()` všude; `/registrace/` a `/checkin/` navíc
  čtou jazyk zvolený jinde na webu (`localStorage vrLang`).
- `/podminky/`: navigace odkazovala na zrušenou sekci `#recenze` → `#loznice` (Interiér);
  storno tabulka: česká první řádka „Do 60 dnů" říkala opak ostatních jazyků („60 or more")
  → „60 a více dní"; den 10 před příjezdem neměl sazbu → „10 a méně dní = 100 %" ve 4 jazycích
  i v noscriptu. **Majitel potvrdí, že den 10 je 100 %, ne 70 %.**
- `/checkin/`: hvězdičky povinných polí mizely po prvním překladu (textContent přepsal `<em>`).
- `/registrace/`: tlačítko „odebrat osobu" mělo aria-label „Opravit" → `delLabel` ve 4 jazycích.
- `/vylety/`: DE karta bobové dráhy 15 min (ostatní 20) → 20; selhání `trips.json` nechalo
  plánovač navždy v shimmeru → `.catch` uvolní tlačítko; preload hero podle sezóny.
- `/sprava/`: `{TERMIN}` ve zprávách EN/DE/PL byl česky (genitiv měsíce) → `fmtTermin` podle
  jazyka pobytu (admin UI zůstává česky).
- n8n: PII hosta (jméno + e-mail) v komentáři parseru e-chalupy → smyšlený příklad; návod
  k nasazení VrDailyTasks říkal „uřízni 14 řádků" (uřízl by konstanty) → 5; doplněno varování,
  že kód čte uzel „Načíst žádosti (service-role)", který v exportu není.
- `sitemap.xml` lastmod, `README.md` (popisoval jen `/` a `/pruvodce/`), Edge Function `album`
  doplněna do `CLAUDE.md` a mapy.

**Opraveno (první commit, homepage):**
- `?lang=constructor` (a další zděděné vlastnosti) prošel kontrolou jazyka, uložil se do
  `localStorage` a shodil vykreslení při každé další návštěvě → whitelist přes `hasOwnProperty`.
- Vadné `?season=%E0` vyhodilo `URIError` v synchronním skriptu v `<head>` a zastavilo JS
  celého webu → `try/catch` v `season.js`.
- Když se nestáhl `vendor/three.min.js`, sekce 360° zůstala jako prázdný rám a `initPano`
  čekal na `THREE` donekonečna → `onerror` skryje prohlídku a zastaví polling.
- Termín naklikaný v kalendáři dřív, než dorazila obsazenost, se po jejím načtení
  nepřeměřil → `revalidateSelection()`.
- `<title>` v DE a PL neuváděl počet ložnic (CS a EN ano).
- V zimě se přednostně předstahovalo neviditelné letní hero → preload podle sezóny.
- Homepage neměla `hreflang` ani JSON-LD (`/vylety/` má obojí) → doplněno
  (`LodgingBusiness`, adresa/telefon/e-mail stejné jako v patičce a `/info/`).
- Aria-labely lightboxu, karuselu, kalendáře a menu byly natvrdo česky ve všech jazycích
  → `data-t-aria` + klíče `aria.*` ve 4 jazycích.
- Celé jméno hosta v komentáři migrace `20260812_vr_requests_admin.sql` ve veřejném repu
  → odstraněno (v git historii zůstává).
- Zastaralý komentář v `index.html` odkazoval na neexistující `VR_SEASON_SLOTS`.

**Zjištěno, neopraveno — na rozhodnutí majitele:**
- **`vr_request` a tabulka `vr_requests` nejsou v migracích.** Formulář homepage na nich stojí
  (jediné backendové volání) a přijímá PII, ale „zdroj pravdy" je neobsahuje — nejde je z repa
  auditovat. Vytáhnout definici z živé DB do migrace.
- **Hash admin klíče je veřejný** (`sprava/sprava.js` `TOKEN_HASH` a
  `20260724_vr_admin.sql:37`). Umožňuje offline brute-force; při dlouhém náhodném klíči
  neprůchodné, při „lidském" heslu ne. Doporučení: klíč rotovat a hash z migrace vyndat
  (do configu ručně, jako u `purge_secret_sha256`).
- Vzdálenost do Pece pod Sněžkou se na homepage liší: mapa 10 km, tabulka lyžování ≈ 13 km
  (`site.js` kolem ř. 433). Které číslo platí, ví jen majitel.
- Mrtvá větev „Přímá rezervace = nejlepší cena" (`site.js` kolem ř. 3672) a nepoužité
  překladové bloky (`mail`, `skupina`, ikona `guestsIcon`) — úklid, ne chyba.
- **Schéma v migracích je neúplné:** kromě `vr_request`/`vr_requests` chybí i `vr_bookings`,
  `vr_verify_token`, `vr_checkin`, `vr_album_*`, tabulka `vr_album_photos` a bucket `vr-album`
  (policies, `file_size_limit`). Vytáhnout z živé DB jednou baseline migrací. Pět souborů má
  stejný prefix `20260724` — abecední pořadí neodpovídá pořadí nasazení.
- **Heslo Wi-Fi natvrdo** v `sprava/sprava.js` (`WIFI`) i v n8n `VrDailyTasks.code.js` — veřejné
  repo. Přesunout do `vr_admin_config` (čte se přes `vr_admin_get_config`, whitelist rozšířit).
- `_vr_admin_auth`: rate-limit nepočítá neúspěšné pokusy (insert stopy se s výjimkou
  odrolluje) — online brute-force není throttlovaný. Řešení: stopu zapisovat mimo transakci
  nebo vracet boolean místo výjimky.
- `vr_persons_add_by_date` (lednicový QR): kdokoli na internetu může zapisovat osoby do zákonné
  evidence — chybí druhý faktor (kód pobytu na QR).
- Edge Function `album`: limit 15 MB a whitelist typů vynucuje jen klient — nastavit
  `file_size_limit` a `allowed_mime_types` na bucketu `vr-album`.
- `/sprava/`: výpadek `history.json` hlásí falešné „storno" u všech spárovaných pobytů
  (`loadCalendar` nerozlišuje selhání od prázdného feedu); šablona `welcomeCore` popisuje
  registraci jinak než `confirm`; token hosta je v `sessionStorage`, UI tvrdí „na tomto
  zařízení"; labely formulářů bez `for`.
- n8n `VrWebRequest.code.js`: `tel:`/`wa.me` odkaz z nenormalizovaného čísla (chybí `intlPhone`).
- Plánovač (`planner.js`): karty katalogu nejdou otevřít z klávesnice, detail je `role=dialog`
  bez zavíracího tlačítka a správy fokusu.

## Kde pracovat

| Práce | Repo | Klon |
|---|---|---|
| kalendář (šrafování, 4 feedy, předrezervace) | `villa-booking-calendar` | `~/villa-booking-calendar` |
| výlety — data a překlady | `villa-rudolf-portal` | `~/villa-rudolf-portal` |
| výlety — zobrazení, zprávy, `/sprava/` | `villa-rudolf-site` | *(klon zatím není)* |

**Jedna práce = jedna session.** Session začíná přečtením `MAPA-SYSTEMU.md` a tohohle souboru,
ne prohledáváním repozitářů.
