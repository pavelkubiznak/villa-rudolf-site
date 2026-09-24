# Villa Rudolf — web a provozní systém

**Tohle repo je živé jádro celého systému Villa Rudolf.** Web na `villarudolf.com` plus
všechny provozní moduly. Statický web na GitHub Pages, bez build kroku.

> 🗺️ **Než začneš cokoli dělat, přečti si [`MAPA-SYSTEMU.md`](MAPA-SYSTEMU.md).**
> Systém je rozdělený do víc repozitářů a bez mapy nepoznáš, které je živé. Už se stalo,
> že se navrhoval modul, který tady dávno běží.
>
> 📋 **Co je rozdělané a co zbývá: [`STAV.md`](STAV.md).**

## Struktura

| Cesta | Co to je | Publikum |
|---|---|---|
| `/` (`index.html`, 80 kB) | homepage, vícejazyčná | hosté, veřejnost |
| `/sprava/` | **admin majitele** — rezervace, předrezervace, platby, kontakty hostů, zprávy, konflikty. `sprava.js` (2 300+ ř.) | jen majitel |
| `/smlouvy/` | **generátor ubytovacích smluv** přímých hostů — šablona cs/de/en, tisk do PDF, archiv v `vr_contracts`, „Vystavit“ zakládá i předrezervaci | jen majitel |
| `/metrika/` | přesměrování na dashboard návštěvnosti (Umami na Hetzneru), bez odkazů z webu | jen majitel |
| `/registrace/` | registrace hostů (evidence + poplatek z pobytu) | hosté |
| `/checkin/` | check-in formulář | hosté |
| `/album/` | fotoalbum pobytu | hosté |
| `/vylety/`, `/pruvodce/` | tipy na výlety (data z repa `villa-rudolf-portal`) | hosté |
| `/info/`, `/podminky/` | informace, podmínky | hosté |
| `/n8n/` | exporty n8n workflow (importovatelné) | provoz |
| `supabase/migrations/` | **schéma databáze — zdroj pravdy** (neúplný, viz `STAV.md`) | vývoj |
| `supabase/functions/album/` | Edge Function `album` — jediná brána ke Storage bucketu `vr-album`, autorizace tokenem pobytu | vývoj |

## Data a databáze

- **Supabase** `fpknbrzbqpalguajskut` (sdílený se SINTERA → prefix `vr_`).
  Migrace v `supabase/migrations/`. **Schéma vždy ověřuj proti živé DB**, ne proti kopiím
  `schema.sql` v jiných repech — ty jsou zastaralé.
- **Rezervace** se do `/sprava/` tahají z kalendáře:
  `https://pavelkubiznak.github.io/villa-booking-calendar/data/history.json`
  (veřejné, anonymizované). Spojka na Supabase je **`uidh`** = `sha256(iCal UID)[:16]`,
  viz `vr_admin_upsert_booking(p_uidh, …)`.
- **Autorizace adminu:** `p_admin_key` (ne ingest secret). Klíč nikdy do repa.

## Předrezervace (`vr_holds`) — přímý prodej, který systému chyběl

**Spouštěčem rezervace není platba, ale vystavení zálohové faktury.** Pobyt prodaný napřímo
(telefon, e-mail, poptávka z e-chalup) není v žádném iCal feedu, takže do 9/2026 pro systém
neexistoval: `/sprava/` o něm nevěděla a **veřejná dostupnost na homepage** (`assets/site.js`
čte `history.json`) ten termín dál nabízela jako volný. Tak zmizel termín **14.–21. 8. 2027** —
faktura vystavená, uhrazená, peníze v bance, a v systému nic.

```
PŘEDREZERVACE ── uhrazeno do splatnosti ──▶ REZERVACE
              ── neuhrazeno do hold_until ─▶ propadlá (termín se uvolní)
```

| | |
|---|---|
| Tabulka | `vr_holds` (migrace `supabase/migrations/20260909_vr_holds.sql`) |
| Veřejně ven | `vr_public_holds()` — **jen** `{uidh,start,end,kind,holdUntil}`, čte to Action kalendáře |
| Admin | `vr_admin_list_holds` / `vr_admin_upsert_hold` / `vr_admin_set_hold_status` / `vr_admin_delete_hold` |
| UI | sekce **Předrezervace** v `/sprava/` + tlačítko „+ Předrezervace" v hlavičce Pobytů |

**Proč vlastní tabulka a ne sloupec ve `vr_bookings`:** `vr_purge_expired` maže bookingy
30+ dní po odjezdu bez zapsaných osob — přímý prodej i s doklady o faktuře by tiše zmizel.
Hold je navíc obchodní záznam (termín, faktura, platba), ne evidence hosta; host se doplní
až po zaplacení, vazbou `booking_id`. A nemuselo se sáhnout na `vr_admin_upsert_booking`,
takže se dá nasadit v libovolném pořadí, aniž by se cokoli rozbilo.

**Propadnutí je líné — žádný cron.** `vr_public_holds()` propadlý hold prostě nevrátí, takže
se termín uvolní sám i kdyby n8n týden neběželo. Řádek zůstane a čeká na rozhodnutí: zaplatit
o dva dny později je běžné a tiché smazání blokace je ta chyba, kterou modul řeší, jen obráceně.

**Pojistka proti špatnému účtu.** Faktura se dá omylem vystavit na hlavní účet Sintery
místo účtu Villa Rudolf. Pravidlo `měna ⇒ účet` (CZK → `VR_CZK`, EUR → `VR_EUR`) hlídá
`vr_hold_account_mismatch()` v databázi **a zároveň** `accountMismatch()` v `sprava.js` —
klient varuje živě při psaní, ať se faktura opraví, dokud ji host nezaplatil; server je
druhá vrstva. Dialog „Uhrazeno" se ptá i na to, **kam** peníze dorazily: platba na cizí účet
rezervaci potvrdí (host svoje udělal), ale zůstane v záznamu, že je potřeba přeúčtovat.

**Sekce Problémy** hlásí tři časově citlivé věci: špatný účet na faktuře, propadlou splatnost
(„než ji odepíšeš, ověř, jestli platba nedorazila na jiný účet") a **termín, který ještě není
zablokovaný na platformách** — dokud není, může ho kterýkoli kanál prodat znovu, hub nás
neochrání.

**Blokace na platformách dělá kalendář sám (od 17. 9. 2026).** Přímý prodej, který Action
publikuje do `history.json`, jde i do výstupních feedů kalendáře (`data/out/*.ics`) a ty si
platformy importují. Termín tedy není potřeba blokovat ručně; „není zablokovaný" hlásí
`/sprava/` jen u předrezervace, kterou kalendář ještě nepublikoval (Action běží po 3 h).

**Párování s kalendářem.** Přímý prodej je v `history.json` pod **`uidh` své předrezervace**
(`vr_hold_uidh(id)`), ne pod `uidh` pobytu — ten mají pobyty z `/smlouvy/` a z tlačítka
„+ Předrezervace" prázdný. `buildStays()` v `sprava.js` proto hosta ke kalendářnímu řádku
hledá přes `vr_holds.booking_id`, a když vazba chybí, bere **jediný** ruční pobyt s platformou
„Přímá" na přesně tentýž termín (dva kandidáti nebo jiná platforma = nehádá). Pobyt i hold
musí nést **stejný termín** — po přesunu jen jednoho z nich se ukážou jako dva řádky, ať je
nesoulad vidět. Po přesunu **obou** jde host s předrezervací na nový termín, i když kalendář
do příštího běhu Action nese pod platformním `uidh` pobytu ještě ten starý. Bez toho byl každý přímý prodej v přehledu dvakrát (zjištěno 23. 9. 2026).

⚠️ **`vr_admin_upsert_hold` při úpravě přepíše `booking_id` i `request_id` tím, co přijde**
(`null` = odpojit). Kdo ho volá s `p_id` existujícího holdu, musí obě vazby poslat zpátky.
Editor v `/sprava/` to do 23. 9. 2026 nedělal, takže každé „Upravit" předrezervaci odpojilo
od pobytu i od poptávky; `/smlouvy/` je posílá správně.

**Ozvěna blokace.** Blok z výstupního feedu (nebo ruční blokace majitele) se vrací zpátky feedem
platformy se **shodným** `(start, end)`. Skript kalendáře takovou událost **zahazuje** a platí
záznam ze správy (do 17. 9. to bylo obráceně — zahazoval se hold). `buildStays()` drží stejné
pravidlo: záznam z feedu na termín přímého prodeje, který už kalendář nese pod vlastním
`uidh`, přeskočí; když ho ještě nenese, spáruje s předrezervací první takový záznam a další ozvěny téhož termínu
(i z jiné platformy) přeskočí. Jeden pobyt, ne dva,
a žádná falešná dvojitá rezervace. **Ozvěna je to ale jen bez vlastního hosta** (nebo s hostem
té předrezervace) — rezervace z platformy se spárovaným hostem na tentýž termín je druhý
nárok a zůstane samostatně, i s červeným konfliktem (`echoOfHold()`). Hlídač překryvů ruční pobyty
jinak ignoruje (bývají to kopie feedu), ale **ruční rezervaci z jiné platformy než „Přímá"
proti předrezervaci počítá** — nic jiného by ji nezachytilo. A host předrezervace se nehlásí
mezi „zmizelými" jen proto, že jeho starý `uidh` (zahozená ozvěna) z kalendáře vypadl. Naopak **částečný** překryv předrezervace s cizí
rezervací je skutečný konflikt a vyskočí červený banner.

Totéž párování má kopii v n8n `VrDailyTasks` (stavba `stays` v `VrDailyTasks.code.js`) — od
23. 9. 2026 i s předrezervacemi. Čte je uzel „Načíst předrezervace (service-role)" (GET
`vr_holds`, jen `id,arrival,departure,status,hold_until,booking_id`); `uidh` tabulka nemá,
kód si ho dopočítá stejně jako `vr_hold_uidh()` — `sha256('vr-hold:' + id)[:16]`, vlastní
implementací SHA-256, protože `require('crypto')` v Code node nemusí být povolený.
Bez toho uzlu páruje jako dřív (jen přes `uidh`). Kdo mění párování v `sprava.js`, mění ho
i tam.

## Ubytovací smlouvy (`/smlouvy/`, `vr_contracts`)

Přímý host dostává **zálohovou fakturu z iDokladu + ubytovací smlouvu**; smlouva se nepodepisuje,
vzniká úhradou faktury. Do 9/2026 se každá psala ručně jako HTML na Disku; od 15. 9. 2026 ji
skládá `/smlouvy/` z dat (`smlouva-sablona.js` = jediné znění, cs/de/en) a ukládá do
`vr_contracts` i s vykresleným HTML. Brána je stejný token jako `/sprava/`.

| | |
|---|---|
| Vstup | pobyt z `vr_bookings` (host, termín, jazyk) → editor doplní cenu z `VR_PRICING` v `assets/site.js` |
| Faktura | ručně v iDokladu; do editoru se opíše číslo, VS, splatnost (a částka v EUR u eurové) |
| Platba | `single` (100 % jednou) nebo `split` (50 % záloha + 50 % doplatek splatný **T−65**) |
| Vystavit | uloží smlouvu jako `issued` **a** založí/aktualizuje hold ve `vr_holds` — teprve ten drží termín |
| Výstup | tisk do PDF z prohlížeče, „Stáhnout .html“ pro Disk, návrh průvodního e-mailu |
| Demo | `/smlouvy/#demo` — bez klíče a bez DB, jen na prohlédnutí UI |

**Proč T−65 u doplatku:** storno je 50 % v 89.–60. dni a **70 % od 59. dne**. Se zálohou 50 %
máme z čeho strhnout jen do 59. dne; doplatek proto musí být na účtu dřív — splatnost T−65,
připomínka majiteli T−72 (`balance_invoice` ve `/sprava/` i `VrDailyTasks`). Když je příjezd
blíž než ~3 týdny před T−65, editor dvě splátky nenabídne.

Znění CS je doslova to, co se posílalo od srpna 2026 (bez počtu osob, bez koupelen, bez
náhradníka — viz rozhodnutí z 29. 8. 2026). Kdo mění text smlouvy, mění **jen** šablonu.

## Párování plateb (`vr_payments`) — etapa 2

Předrezervaci potvrzuje majitel kliknutím na „Uhrazeno". Druhá cesta: bankovní pohyby ze
**tří účtů u Fia** (VR korunový, VR eurový, **a hlavní účet Sintery**) natáhne n8n
(`n8n/VrPaymentWatch`) a `vr_ingest_payments()` je zkusí spárovat s vystavenou fakturou.

Sintera se čte schválně: faktura se dá omylem vystavit na ni, a kdyby se sledovaly jen
villové účty, taková platba by se **ztratila** — předrezervace by propadla, přestože host
zaplatil. Párování jde podle variabilního symbolu bez ohledu na účet; `paid_mismatch` pak
řekne, že je potřeba přeúčtovat.

**Žebříček jistoty — samo se potvrzuje jen nejvyšší stupeň:**

| | Podmínka | Co se stane |
|---|---|---|
| 1 | číslo faktury sedí (z VS, nebo z textu platby u SEPA) **a** měna **a** částka | potvrdí se samo * |
| 2 | číslo faktury sedí, částka ne (záloha / doplatek) | návrh k odklepnutí |
| 3 | bez VS: přesná částka + měna, v okně, a **jediný** kandidát | návrh k odklepnutí |
| 4 | cokoli jiného | **nepřiřazená platba** — vlastní sekce v `/sprava/` |

\* a i ten jen když `p_autoconfirm = true`. **První ostré běhy mají zůstat read-only**
(`AUTOCONFIRM = false` v Code node): pravidla jsou postavená proti dokumentaci Fia, ne proti
skutečnému výpisu tohohle účtu. Stejný postup jako u čtyř feedů v kalendáři — přečíst první
dávku, pak teprve povolit zápis. Přepnutí **nepůsobí zpětně** (pohyb se podruhé nezpracuje).

Nepřiřazená platba **není chyba k zahození** — je to přesně ten případ, kterým celý modul
začal: peníze v bance viděné, ale nikomu nedošlo, že jimi vznikla rezervace.

Dvě věci, na kterých to stojí:
- **Ambiguita se nikdy nehádá.** Když na částku bez VS sedí dvě předrezervace, platba
  zůstane nepřiřazená. Ceny se z ceníku opakují a spárovat platbu k cizí rezervaci je horší
  než nechat ji čekat na kliknutí.
- **Fio se nečte endpointem `last`.** Drží ukazatel na své straně a posouvá ho při stažení —
  pád n8n mezi stažením a zápisem by ty pohyby ztratil natrvalo. Čte se klouzavé okno 30 dní
  a odduplikovává se podle ID pohybu (unikátní index na `(source, account, tx_id)`).

Tokeny Fia patří do prostředí n8n instance (`FIO_TOKEN_VR_CZK` / `_VR_EUR` / `_SINTERA`),
**nikdy do repa** — a vždy **jen ke čtení**, k jednomu účtu. `vr_ingest_payments` má grant
jen pro `service_role` a **žádné sdílené heslo** — přesně ta chyba, kterou u `vr_purge_expired`
zavírá `20260908_vr_purge_lockdown.sql`.

**iDoklad zatím napojený není.** Kontrola, na jaký účet faktura zní, se dnes dělá z toho, co
majitel zapíše v editoru předrezervace — pravidlo `měna ⇒ účet` varuje živě při psaní. Číst
to přímo z iDokladu je další krok; jeho API se sem nepsalo naslepo.

⚠️ **`n8n/VrConflictWatch` je potřeba znovu importovat** — referenční kód byl upraven, aby
překryv dvou přímých prodejů („Přímá" × „Přímá") neschoval mezi artefakty kalendáře.

## Hlášení cizinců (UbyPort) — lhůta a záznam o odeslání

Ubytování cizince se hlásí policii **do 3 pracovních dnů ode dne ubytování** (§ 102 zák.
326/1999 Sb.). Cizinec = každý bez českého občanství, **včetně občanů EU**. Od 23. 9. 2026
(migrace `20260923_vr_ubyport_lhuta.sql`) systém ví, jestli a kdy hlášení odešlo:

| | |
|---|---|
| Lhůta | `vr_ubyport_deadline(stay_from)` = 3. pracovní den po dni ubytování; víkendy a státní svátky vč. Velikonoc počítá `vr_cz_is_workday()`. **Počítá se od `stay_from` každé osoby**, ne od příjezdu rezervace. |
| Záznam | `vr_ubyport_reports` (kdy, jak: `unl`/`form`/`ws`, pseudorazítko z doručenky) + `vr_persons.ubyport_report_id` |
| `/sprava/` | Problémy: 🛂 nenahlášení cizinci (červeně poslední den a po lhůtě), 📝 běžící pobyt s neúplnou registrací. Detail pobytu: stav u každého cizince, UNL jen z dosud nenahlášených, tlačítko „Nahlášeno…“, „Vrátit“ pro omyl. |
| Denní e-mail | sekce 🛂 HLÁŠENÍ CIZINCŮ z `vr_ubyport_due()` (grant jen `service_role`, vrací objekt `{due:[…]}` — pole by n8n rozsekal na položky a „Načíst pobyty“ by běžel víckrát). Uzel přidává `tools/n8n-patch-vrdailytasks.py`. |

Nahlášenou osobu si host v registraci **smazat nemůže** (`already_reported`) — evidence se
uchovává 6 let. „Vrátit“ ve `/sprava/` mění jen náš záznam; v UbyPortu nic nezruší.

**Registrace z lednice = kód od dveří** (migrace `20260923_vr_fridge_code.sql`). Statický QR
na lednici vede na `/registrace/` bez tokenu; host zadá kód, kterým odemyká vchod, a
`vr_fridge_open()` vydá klíč relace (platí do dne odjezdu, `vr_fridge_sessions`). Dál jede
stejně jako osobní odkaz: seznam skupiny, termín z rezervace, `source = 'fridge'`. Kód =
`door_code`, jinak posledních 5 číslic telefonu (stejně jako `doorCodeFor` ve `/sprava/`).
Max 20 neúspěšných pokusů za hodinu. Stará otevřená cesta `vr_persons_add_by_date` je
zavřená (vrací `code_required`) — zapsat k běžícímu pobytu mohl kdokoli z internetu.
**Bez uloženého kódu i telefonu se skupina z lednice nezaregistruje** — Problémy ve `/sprava/`
hlásí chybějící kód 7 dní před příjezdem.

**Odesílá se zatím ručně** (UNL soubor nebo formulář v UbyPortu). Webová služba WS_UBY (SOAP,
NTLM, bez captchy, vrací PDF potvrzení) je další krok — o testovací přístup se žádalo 23. 9. 2026
za Sinteru („TEST WS - Sintera Czech s.r.o.“), podává se datovou schránkou na `ybndqw9`.

## Poplatek z pobytu a evidenční kniha

Svoboda nad Úpou, **OZV č. 2/2023** (účinná od 1. 1. 2024, ověřeno 23. 9. 2026 proti PDF na
musvoboda.cz): **25 Kč za každý den pobytu kromě dne příjezdu**, jen pobyt do 60 dnů,
poplatník = kdo není v obci přihlášený, **osvobození jen podle zákona (§ 3b) — senioři
osvobození nemají**, odvod **za pololetí do 20. 7. a 20. 1.** Migrace `20260923_vr_poplatek.sql`:

| | |
|---|---|
| Sazba | `vr_fee_rates` (platnost od data) — změnu vyhlášky zapiš novým řádkem, stará pololetí se počítají starou sazbou |
| Výpočet | `_vr_person_fee()` po osobách a po dnech: den příjezdu ne, do 18. narozenin ne (i během pobytu), `fee_exempt` ne; bez data narození = dospělý |
| Osvobození | host sám jen `ztp` (nevidomý, ZTP/P a průvodce, závislý na pomoci); `resident` / `other` zapisuje majitel kliknutím na štítek poplatku u osoby |
| `/sprava/` | blok Místní poplatek z registrací, **💰 Poplatek** = přehled za pololetí + CSV evidenční knihy (§ 3g) + „Odvedeno“ (`fee_odvod_RRRR_1/2` v configu); Problémy připomínají odvod v lednu a v červenci |

Evidenční kniha (§ 3g zák. 565/1990 Sb.) chce u **každého** hosta i Čecha: den počátku a konce,
jméno, **adresu**, **datum narození**, **číslo a druh dokladu**, poplatek nebo důvod osvobození;
uchovává se 6 let. Proto `/registrace/` od 9/2026 vyžaduje datum narození a ulici, doklad je
povinný pro cizince **a pro dospělé**, přibyl druh dokladu (`ID`/`P`/`O`). `vr_persons_add` má
nové parametry s DEFAULT — stará stránka v mezipaměti volá dál tutéž funkci.

## Na co si dát pozor

1. **Žádné PII do repa.** Jména, kontakty a doklady hostů patří výhradně do Supabase (EU).
2. **`p_admin_key`, ingest secret ani `SERVICE_ROLE` klíč se do repa nikdy nedostanou.**
3. Repo je **veřejné** a běží na něm ostrý web s vlastní doménou — commituje se opatrně.
4. Než začneš psát „nový modul", ověř `/sprava/` — hodně věcí už existuje.

## Jazyk

Kód, komentáře i dokumentace česky. Uživatelské rozhraní je vícejazyčné (cs/de/en/pl).
