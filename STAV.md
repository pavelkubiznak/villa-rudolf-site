# Villa Rudolf — co je hotové a co ne

**Tady se zjišťuje, na čem se pracuje.** Mapa (`MAPA-SYSTEMU.md`) říká *kde co běží*,
tenhle soubor říká *co zbývá udělat*. Kdo něco dokončí, přepíše to tady ve stejném commitu.

Aktualizováno: 13. 10. 2026

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
| Stejná falešná hláška v `/sprava/` a v hlídači n8n | ✅ **vyřešeno 12. 9. na všech třech místech** (po #8 hlídač znovu čeká na re-import, viz Předrezervace) |
| Číst feedy zvlášť místo e-chalupy hubu | 🟡 **kód hotov, čeká na secrety** (Airbnb, Booking, FeWo, nově i Megaubytko) |
| Nálezy Codexu na publikaci předrezervací | 🟡 **opraveno, kalendář PR #14 čeká na merge** — 23. 9. srovnaný s `main`, poslední kolo revize čisté (viz Předrezervace) |
| Výstupní feedy `data/out/*.ics` — platformy zrcadlí náš kalendář | ✅ **kód 17. 9., importy zapojené 17. 9.** (Airbnb, Booking, FeWo, e-chalupy); v hub módu jde ven jen přímý prodej |
| Přímý prodej má přednost před ozvěnou vlastního bloku | ✅ **17. 9.** — do `history.json` jde přímý prodej, ozvěna z platformy se zahodí (dřív obráceně) |
| Megaubytko.cz jako pátý kanál | 🟡 **kód 17. 9., čeká na secret `ICAL_URL_MEGAUBYTKO` + import `megaubytko.ics` u Megaubytka** |
| **Bezpečnost: `vr_purge_expired` jde spustit zvenku** | ✅ **zamčeno 15. 9. 2026** — `execute` jen `service_role`. ⚠️ Tím ale retence 26 dní **neběžela** (Hetzner ji dál volal anon klíčem, denně 401) |
| **Retence běží** — pg_cron job `vr-purge-expired` uvnitř DB | ✅ **od 11. 10. 2026** (`20261011_vr_purge_cron.sql`, varianta „anonymizovat, nemazat"); na Hetzneru purge cron, skript i hlídač `vr-purge` zrušeny 11. 10. 2026 (zálohy v `/root/*.bak-2026-10-11`) |

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
(do té doby byl jen lokální a kalendář ho četl jako 404). **Pozor:** `/sprava/` ten soubor nečte
vůbec — pracuje jen s `history.json`. Kdo by chtěl ručně ověřené duchy vyřazovat i v adminu,
musí to teprve dopsat.

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

**✅ `vr_purge_expired` — zamčeno 15. 9. 2026, vlastní secret nastaven 16. 9. 2026.**
Do té doby bylo heslo té mazací funkce napsané otevřeně v `20260724_vr_retention.sql` (repo je
veřejné) a funkce měla `grant execute … to anon`, takže ji mohl spustit kdokoli. Nasazeno přes
konektor Supabase: `20260915_vr_purge_secret.sql` (založí klíč hashem náhodného secretu
vygenerovaného přímo v DB) a `20260908_vr_purge_lockdown.sql` (heslo z těla funkce pryč, ověřuje
se proti `vr_admin_config.purge_secret_sha256`, `execute` jen `service_role` + vlastník).

**Secret si majitel od 16. 9. drží.** Původní stav „secret nikdo nezná" byl bezpečný, ale funkce
se pak nedala spustit ani oprávněně. Vygenerován nový (48 znaků `[A-Za-z0-9]`, vznikl mimo DB
i mimo repo, do databáze šel **jen jeho sha256**) a předán majiteli do správce hesel. Migrace
`20260915_vr_purge_secret.sql` je idempotentní (`where not exists`), takže tenhle klíč nepřepíše.

Ověřeno dotazem 16. 9.: `proacl` funkce = `postgres` + `service_role` a nic jiného; staré heslo
z git historie vrací `unauthorized` (SQLSTATE 28000), stejně jako krátké heslo a `null`; data
netknutá (31 bookingů, 0 anonymizovaných).

**🔴 Co se tím ale rozbilo — zjistil až audit portálu 11. 10. 2026.** Věta „funkci dnes nic
nevolá", která tu stála od 16. 9., **nebyla pravda**: na Hetzneru běžel cron
`40 4 * * * /opt/vr-portal/purge-expired.sh` a volal `vr_purge_expired` **anon klíčem**
(krok (d) z hlavičky `20260908_vr_purge_lockdown.sql` — přepnout volajícího na `service_role` —
nikdo neudělal). Od 15. 9. tedy každý den HTTP 401 `permission denied for function
vr_purge_expired`, skript končil chybou, hlídač běhů `hlidac-pip vr-purge` se neodpíchl a od
2. 10. chodil denně e-mail „3 nedoběhlo" — bez reakce. Výsledek: **26 dní bez retence**; 11. 10.
v DB 5 rezervací s prošlým `expires_at`, 3 s odjezdem před víc než 30 dny, 0 anonymizovaných,
všech 30 řádků s telefonem nebo e-mailem. Paradoxně to byla jediná ochrana dat: funkční cron by
podle tehdejší logiky (krok 2 purge) smazal každý proběhlý pobyt bez evidovaných osob.

**✅ Od 11. 10. 2026 retence běží — pg_cron uvnitř databáze** (migrace
`20261011_vr_purge_cron.sql`, nasazena konektorem Supabase 11. 10. 2026; soubor je ve větvi
`claude/portal-audit`, do `main` jde PR z auditu). Job `vr-purge-expired` běží denně 04:40 UTC
jako vlastník DB a volá `vr_purge_expired_cron()` bez parametru — **žádný secret mimo DB,
žádný klíč na serveru, nic k rotaci, nic k hlídání na Hetzneru**; na wrapper nemá EXECUTE
`anon`, `authenticated` ani `service_role`. Co dělá:

- **30+ dní po odjezdu — anonymizovat, ne mazat:** pryč `phone`, `email`, `door_code`, `notes`,
  `cleaning_note`, `token_enc`; `token_hash` nahrazen náhodným (starý odkaz hosta přestane
  platit), `anonymized_at = now()`. Jméno, termín, platforma a počty osob **zůstávají** (historie
  pobytů, ceník, účetnictví); evidence osob (`vr_persons`) zůstává 6 let ze zákona.
- **6+ let po odjezdu:** smazat celý pobyt (cascade `vr_persons` — evidenční povinnost skončila).
- **Pobyty bez evidovaných osob se už 30 dní po odjezdu NEMAŽOU** — jen anonymizují. Tím má bod
  „Retence pobytů" z Doporučeného pořadí rozhodnutí: **udělal ho audit 11. 10. 2026** (varianta
  „anonymizovat, nemazat"; odpovídá tomu, co tenhle soubor od 16. 9. chtěl; `vr_admin_list_bookings`
  anonymizované řádky dál vrací, jen bez tokenu — `/sprava/` je ukáže jako pobyt bez kontaktu,
  zvláštní označení v UI zatím nemá). **Pavel ho může změnit** — pak se přepíše `vr_purge_expired_cron()`
  novou migrací, job zůstane. Stará `vr_purge_expired(p_secret)` v DB zůstala (jen `service_role`);
  volá ji už jen rozbitý cron na Hetzneru (anon klíč → 401, ruší se, viz níž), takže její mazání
  pobytů bez osob (krok 2) neběží. Ověřeno v živé DB 11. 10. 2026 večer: `pg_cron` nainstalován,
  job `vr-purge-expired` aktivní, zatím 0 běhů (první 12. 10. 04:40 UTC), 3 pobyty čekají na
  anonymizaci.

Kontrola běhů (SQL editor nebo konektor):

```sql
select jobid, schedule, command, active from cron.job where jobname = 'vr-purge-expired';
select status, return_message, start_time from cron.job_run_details
 where jobid = (select jobid from cron.job where jobname = 'vr-purge-expired')
 order by start_time desc limit 5;
select count(*) filter (where anonymized_at is not null) as anonymizovano,
       count(*) filter (where departure < current_date - 30 and anonymized_at is null) as ceka
  from public.vr_bookings;
```

**Hotovo na velínu 11. 10. 2026:** řádek `40 4 * * * /opt/vr-portal/purge-expired.sh` z crontabu root
odstraněn (záloha `/root/crontab.bak-2026-10-11`), soubor přesunut do `/root/vr-portal-purge-expired.sh.bak-2026-10-11`
(600), úloha `vr-purge` v `/etc/hlidac/ulohy.conf` zakomentována, pip smazán; `hlidac-kontrola --dry-run` hlásí
vše v pořádku. Navíc `/etc/logrotate.d/vr-portal` pro `/var/log/vr-weather.log` a `vr-backup.log`.
Po provedení sem doplnit datum.

**✅ Ve stejný den nasazeno i zpevnění DB `20261011_vr_portal_hardening.sql`** (stejná větev,
vratné, nic nemaže):
1. `vr_create_booking(…)` — mrtvá cesta (n8n webhook „VR – nový host" nikdy neběžel), ale anon
   ji směl volat a ingest secret byl literál v těle funkce s hodnotou v historii veřejného repa →
   `revoke execute` pro `public`, `anon`, `authenticated`; volat smí jen vlastník DB.
2. Tabulkové granty `anon`/`authenticated` pryč z `vr_bookings`, `vr_requests`, `vr_album_photos`
   (RLS bez policy je blokovalo, ale jedna omylem přidaná policy `using (true)` by zveřejnila
   30 rezervací s telefony; SECURITY DEFINER RPC běží dál).
3. `vr_verify_token` **už nevrací `notes`** (interní poznámka majitele šla hostovi do
   localStorage, nikdo ji nezobrazoval) — jen jméno, jazyk, termín a party.
4. Tříparametrová `vr_update_party(text, integer, integer[])` smazána (zůstává čtyřparametrová).
5. **SINTERA views** `crm_open_actions`, `urgence_pipeline`, `hook_training_data` běžely
   s právy vlastníka a anon je směl číst → veřejný anon klíč z portálu četl CRM kontakty SINTERA.
   Teď `security_invoker = on` + `revoke` pro `anon`/`authenticated` (sdílený projekt = sdílený
   dosah každého úniku; oddělení projektu je otevřený bod v `MAPA-SYSTEMU.md`).

**🟡 Další dvě migrace z auditu 8. 9. (čekají na spuštění — Actions „DB migrace" nebo SQL editor):**
`20260908100100_vr_album_bucket.sql` — limit 15 MB a whitelist MIME typů přímo na bucketu
`vr-album` (Edge Function kontrolovala jen `size`, které pošle klient);
`20260908100200_vr_msglog_idx_cleanup.sql` — drop nadbytečného indexu `vr_msglog_booking_idx`
(unique constraint nad stejným prefixem už index má). Obě jsou idempotentní.

*Souvislost s evidencí pobytů:* stará `vr_purge_expired(p_secret)` mazala bookingy 30+ dní po
odjezdu, které **nemají zapsané osoby** — proběhlé pobyty bez evidence osob by se tiše ztrácely.
Od 11. 10. 2026 to pg_cron job nedělá (viz výš: jen anonymizace). Co zbývá: v repu kalendáře
18měsíční prune `history.json`.

---

## 💳 Předrezervace a přímý prodej → `vr_holds` + `/sprava/` + kalendář

| | Stav |
|---|---|
| Tabulka `vr_holds` + admin/veřejné RPC (`20260909_vr_holds.sql`) | ✅ **migrace v živé DB 15. 9. 2026** |
| Sekce „Předrezervace" v `/sprava/`, editor faktury, dialog „Uhrazeno" | ✅ hotovo, ověřeno v prohlížeči |
| Pojistka měna ⇒ účet (klient i databáze) | ✅ hotovo |
| Publikace do kalendáře (`vr_public_holds()` → `history.json`) | ✅ hotovo v `villa-booking-calendar` |
| Zobrazení v úklidovém kalendáři i v `owner.html` | ✅ hotovo, ověřeno v Chromiu |
| Nálezy revize na té publikaci (kalendář PR #14) | 🟡 **opraveno, čeká na merge** — 7 kol, po srovnání s `main` 23. 9. dalších 5, poslední čisté (`55770d2`) |
| Přímý prodej v přehledu `/sprava/` dvakrát + falešné „nezablokováno" | ✅ **opraveno 23. 9.** (PR #22, živé po merge) |
| Totéž v denním e-mailu `n8n/VrDailyTasks` | 🟡 **kód v PR #22, čeká na merge + nasazení na server** (patch skript přidá uzel „Načíst předrezervace") |
| `n8n/VrConflictWatch` — „Přímá" × „Přímá" eskaluje | 🟡 **referenční kód v `main` od 15. 9. (i s filtrem duchů z 12. 9.), čeká na re-import** |
| Párování plateb z Fia (`vr_payments`, `vr_ingest_payments`) | 🟡 **migrace v DB 15. 9., čeká na 3 tokeny Fia** |
| Sekce „Platby k vyřízení" v `/sprava/` | ✅ hotovo, ověřeno v prohlížeči |
| Čtečka Fia pro n8n (`n8n/VrPaymentWatch`) | 🟡 **kód hotov + offline testy, čeká na složení workflow** |
| Napojení na iDoklad (kontrola účtu na faktuře přímo ze zdroje) | ⏭️ **nezačato** — API se nepsalo naslepo |
| Přenos ověřených přímých prodejů z `verified.json` (`supabase/seed/`) | ✅ **spuštěno v živé DB 23. 9. 2026** |

**Proč to vzniklo.** Pobyt prodaný napřímo nebyl v žádném feedu, takže pro systém neexistoval —
`/sprava/` o něm nevěděla a homepage ten termín dál nabízela jako volný. Tak zmizel termín
**14.–21. 8. 2027**: zálohová faktura vystavená i uhrazená, peníze v bance, a v systému nic.
Spouštěčem proto **není platba, ale vystavení zálohové faktury**.

**🔴 Termín 21.–28. 8. 2027 propadá 25. 9.** Předrezervace s fakturou vystavenou 15. 9.,
splatnou **22. 9.**; platba k 23. 9. zapsaná není. Když se do `hold_until` (25. 9.) nic nezmění,
`vr_public_holds()` ji přestane vracet a termín se sám uvolní — na webu i na platformách
(výstupní feedy). Než se to stane: ověřit, jestli platba nedorazila (i na jiný účet), a buď
kliknout „Uhrazeno", nebo posunout `hold_until`.

Stav přímých prodejů v srpnu 2027 (živá DB + `history.json` 23. 9.): **7.–14. 8.** potvrzený
(bez čísla faktury a bez zapsané platby), **14.–21. 8.** potvrzený a uhrazený, **21.–28. 8.**
předrezervace výš. Všechny tři jsou v `history.json` i ve výstupních feedech.

**✅ `/sprava/` srovnaná s kalendářním #17 — opraveno 23. 9.** Od #17 nese přímý prodej
v `history.json` **`uidh` své předrezervace** (`vr_hold_uidh(id)`), jenže `buildStays()`
párovalo pobyt z `vr_bookings` jen přes `vr_bookings.uidh`. Pobyty 14.–21. a 21.–28. 8. ho
mají prázdný; pobyt 7.–14. 8. je přes `uidh` navázaný na **záznam z e-chalupy** na tentýž
termín (`a86a13…`, ve feedu od 22. 8.), který kalendář od zapsání přímého prodeje (23. 9.)
zahazuje jako ozvěnu. Nad živými daty 23. 9. to dělalo v srpnu 2027 **7 řádků místo 3**
(přímý prodej bez hosta + týž pobyt s hostem jako ruční, u 7.–14. 8. jako záznam z e-chalupy).
K tomu dvě chyby stejného původu:
- **falešná červená dvojitá rezervace na 7.–14. 8.** — záznam z e-chalupy `a86a13…` je
  v archivu ještě živý (lastSeen 23. 9.) a přímý prodej leží přes něj; zestárne sám do 25. 9.;
- **„termín není zablokovaný"** u 21.–28. 8. — `blockedOnPlatform()` hledala blokaci podle
  ozvěny z feedu, kterou #17 zahazuje; u 7.–14. a 14.–21. 8. „vycházela" jen díky archivním
  duchům. Blokaci teď dělá kalendář sám přes výstupní feedy.

Oprava v `sprava.js`: host přes `hold.booking_id`, jinak **jediný** ruční pobyt „Přímá" na
tentýž termín (dva nebo jiná platforma = nehádat), a pobyt i hold musí nést týž termín; ozvěna přímého prodeje, který už kalendář nese, se přeskočí; blokace =
přímý prodej je v kalendáři pod svým `uidh`, nebo termín kryje živý (ne archivní) záznam
platformy. Při tom opravená i starší duplicita: čerstvá předrezervace s hostem (do 3 h, než ji
Action publikuje) byla v přehledu taky dvakrát. Ověřeno v Node nad živým `history.json`
(7 → 3 řádky, všechny s hostem, 0 červených, 3/3 zablokované — i po zestárnutí `a86a13…`) i nad podvrženými daty
(skutečná kolize pořád červeně; nepublikovaná předrezervace bez blokace pořád hlásí
„nezablokováno"). V prohlížeči zatím ne — `/sprava/` je za tokenem.

**🔴 Editor předrezervace v `/sprava/` mazal vazbu na pobyt a poptávku — opraveno 23. 9.**
`vr_admin_upsert_hold` při úpravě přepíše `booking_id` i `request_id` tím, co přijde, a editor
je neposílal — každé „Upravit" tedy předrezervaci odpojilo od hosta. Teď je posílá zpátky.
Jestli tím přišla o vazbu i předrezervace 7.–14. 8., se z dat určit nedá — **propojená
ručně v DB 23. 9.** (`vr_holds.booking_id` → pobyt se stejným termínem; jediný kandidát).

*Zbývá z toho:*
- **Editor předrezervace vazbu na pobyt nastavit neumí** — jen ji teď nezahodí. Nová vazba
  vzniká přes `/smlouvy/` (smlouva z pobytu → Vystavit); jinak jen v DB.
- **`n8n/VrDailyTasks`** — ✅ kód opravený 23. 9. (PR #22): načítá `vr_holds` a páruje stejně
  jako `/sprava/`, včetně přeskočení ozvěny a eskalace „Přímá" × „Přímá". Ověřeno spuštěním
  celého Code node nad živým `history.json`: srpen 2027 ze 7 řádků + falešného konfliktu
  7.–14. 8. na 3 pobyty s hosty a 0 konfliktů; skutečný částečný překryv hlásí dál; bez nového
  uzlu vyjdou pobyty i konflikty stejně jako dřív. `uidh` z vlastního SHA-256 sedí s `vr_hold_uidh()` (ověřeno
  na reálné předrezervaci 7.–14. 8.). **Zbývá nasadit na server:** po merge
  `python3 tools/n8n-patch-vrdailytasks.py <export> <patched>` (přidá a zapojí uzel
  „Načíst předrezervace (service-role)"), import, publish, restart — viz `__jak_nasadit__`.
- **Kalendářní stránky** (úklid i `owner.html`) ukazují na 7.–14. 8. 2027 do 25. 9. taky
  červenou dvojitou rezervaci — týž dobíhající záznam `a86a13…`. Samo zmizí; trvale by to
  chtělo, aby skript kalendáře při zahození ozvěny rovnou zestárnul i její archivní záznam.
  Stejně tak `n8n/VrConflictWatch` může do té doby poslat e-mail o konfliktu 7.–14. 8.

**🟡 Revize kalendářní části: opravené, čeká na merge.** Codex review nad PR #9
v kalendáři se rozběhlo přechodem z draftu na „ready", jenže merge o čtrnáct vteřin později ho
utnul — nálezy tak dorazily až nad živý kód. Dohnáno v kalendářním PR #14: sedm kol do 15. 9.,
pak 23. 9. srovnání s `main` (kalendářní #16–#18) a dalších pět kol, poslední čisté (`55770d2`, mergeable;
každý nález reprodukovaný proti tehdejší hlavě). Při srovnání s kalendářním #17 zrušeno stěhování ceny
na blokaci — po #17 už nemá co řešit a u propadlé předrezervace by její cenu započítalo
do tržeb. **Poučení: nech review doběhnout, než mergneš** — trvá 4–7 minut, a push sám další kolo
nespustí, musí se napsat `@codex review`.

Pro tenhle repo jsou z toho podstatné tři věci:

- **Rozbitá odpověď z `vr_public_holds()` nesmí uvolnit prodaný termín.** `valid_holds()` v repu
  kalendáře vracela prázdný seznam i tehdy, když řádky přišly a jen neprošly validací — a prázdný
  seznam je pro `apply_holds()` rozkaz „žádné předrezervace neexistují": z archivu by zmizel
  všechen přímý prodej a ty termíny by se začaly nabízet jako volné. Nově je nepoužitelná odpověď
  `None` (nedostupný zdroj) a **částečně** rozbitá jen přidává, nemaže. Prázdné pole dál znamená
  „nic nedržíme", takže propadlý hold se pořád uvolní sám.
- **Cache prohlížeče v kalendáři držela zrušený hold** až do 18měsíčního prune a proti blokaci
  z platformy z něj dělala červenou dvojitou rezervaci. Srovnává se teď jen podle **úplného**
  `history.json` — řádek s chybějícím/nesmyslným `uidh`, nemožným datem (`2027-02-30`) nebo
  `end ≤ start` snapshot znehodnotí a cache pak jen přidává. Skript pobyt bez jediné noci
  z feedu do `history.json` nepustí vůbec. **`/sprava/` tuhle past nemá:**
  `history.json` si tahá načisto při každém načtení (`cache: 'no-store'`), v `localStorage` drží
  jen admin token. Kdyby se sem někdy cache doplňovala, tohle je přesně to místo, kde se to zvrtne.
- **Hold se do čísel nepočítá jako pobyt** — ani do obsazenosti, ani do tržeb, dokud není
  potvrzený. V kalendáři je to teď sjednocené napříč oběma stránkami; `/sprava/` to nemění, ale
  při porovnávání čísel s owner KPI je dobré s tím počítat.

*Zbývá:*
1. ~~Spustit migraci `20260909_vr_holds.sql`~~ — **hotovo 15. 9. 2026** (i `20260910_vr_payments.sql`
   a `20260915_vr_contracts.sql`; po každé `notify pgrst, 'reload schema'`).
2. **Znovu importovat `n8n/VrConflictWatch`** (Code node „Detekce konfliktů").
3. ~~Zapsat termín 14.–21. 8. 2027~~ — **hotovo 17. 9.**: potvrzený a uhrazený přímý prodej,
   v `history.json` i ve výstupních feedech (platformy ho importují od 17. 9.).
4. ~~Předrezervace 21.–28. 8. a 7.–14. 8. 2027~~ — **obě založené**: 7.–14. 8. potvrzená
   (23. 9.), 21.–28. 8. předrezervace s fakturou i smlouvou — **splatnost 22. 9. prošla,
   propadá 25. 9.**, viz výš. 7.–14. 8. s pobytem propojená 23. 9. Její hold založil 23. 9. přenos z `verified.json` (PR #13)
   **bez čísla faktury a částky** — doplnit v `/sprava/` → Předrezervace.
5. **Založit tři read-only tokeny Fia** (VR korunový, VR eurový, hlavní účet Sintery),
   vložit je do prostředí n8n jako `FIO_TOKEN_VR_CZK` / `_VR_EUR` / `_SINTERA` a poskládat
   workflow podle `n8n/VrPaymentWatch/README.md`. **První běhy nech read-only**
   (`AUTOCONFIRM = false`) a přečti, co párování navrhlo — teprve pak povol zápis.
6. Až bude párování usazené: napojit **iDoklad** a číst z něj, na jaký účet je faktura
   opravdu vystavená (dnes se to bere z toho, co se zapíše ručně v `/sprava/`).

---

## 📄 Ubytovací smlouvy → `/smlouvy/` + `vr_contracts`

| | Stav |
|---|---|
| Tabulka `vr_contracts` + admin RPC (`20260915_vr_contracts.sql`) | ✅ **migrace v živé DB 15. 9. 2026** |
| Stránka `/smlouvy/` (seznam, editor, živý náhled, tisk/PDF, průvodní e-mail) | 🟡 **kód hotov, ověřeno v `#demo`; ostrý běh s klíčem čeká na majitele** |
| Šablona cs / de / en (`smlouva-sablona.js`) | ✅ CS doslova = smlouvy od 8/2026; DE/EN podle Rohrberg + dotaženo |
| Dvě splátky 50/50 s doplatkem T−65 (před skokem storna na 70 %) | ✅ v šabloně i v editoru; u blízkého termínu se vynutí jedna platba |
| QR platba (SPD) v § 5 | ✅ generuje se z IBAN + VS (`vendor/qrcode.min.js`) |
| „Vystavit“ zakládá/aktualizuje předrezervaci (`vr_holds`) | ✅ — smlouva sama termín nedrží, hold ano |
| Odkazy ze `/sprava/` (karta pobytu, karta předrezervace, topbar) | ✅ |
| Doplatková faktura T−72 jako úkol majitele ve `/sprava/` + `VrDailyTasks` | 🟡 **v pracovní kopii z 12. 9., necommitnuté** |
| Zálohová faktura z iDokladu | ⏭️ ručně; číslo, VS a splatnost se opisují do editoru. API iDokladu nenapojené |
| Vlastní doména `smlouvy.villarudolf.com` | ⏭️ zatím `villarudolf.com/smlouvy/`; subdoména = DNS CNAME + druhý Pages web, nic v kódu |

**Proč to vzniklo.** Smlouvy od srpna 2026 vznikaly jako ručně psané HTML na Disku (podle té
předchozí) a PDF z nich dělal headless Chrome — bez šablony, bez dat, bez hlídání. 15. 9. 2026
se ukázalo, že smlouva Sabáčkové ležela 3 dny na Disku s `[DOPLNIT č. zálohové faktury]` a nikdo
ji neposlal. Teď je smlouva záznam v DB s vykresleným HTML, svázaný s pobytem a předrezervací.

*Zbývá:*
1. **Nasadit** (push z Macu) a **projít naostro**: `/smlouvy/` → pobyt Sabáčková → doplnit číslo
   faktury z iDokladu → Vystavit → Tisk/PDF → průvodní e-mail.
2. Archiv na Disk: „Stáhnout .html“ + PDF z tisku uložit do `UBYTOVACÍ SMLOUVA/<rok>/<Jméno termín>/`
   jako dosud (DB je zdroj pravdy, Disk je záloha pro účetní).
3. Až bude párování plateb: po „Uhrazeno“ u holdu přepnout smlouvu na potvrzenou (dnes ručně).

---

## 🥾 Výlety pro hosty → data v `villa-rudolf-portal`, zobrazení v `villa-rudolf-site`

| | Stav |
|---|---|
| Katalog **53 výletů + 7 restaurací** (`villa-rudolf-portal/data/trips.json`, spočítáno 11. 10. 2026) | ✅ |
| Překlady výletů **cs / de / en / pl** (pole `name`, `tagline`, `desc`, `openNote`, `price`, i `links[].label` a `warn`) | ✅ kompletní, 0 mezer |
| Stránka `villarudolf.com/vylety/` (index + css + js, ~100 kB) | ✅ běží |
| Počasí (`forecast.json`, cron na Hetzneru) | ✅ běží |
| Polština u výletů | ✅ **hotovo dávno** — `trips.json` má `pl` u všech textů od 17. 7. 2026 (commit `98ae4e9` portálu), rozhraní portálu od 13. 8. 2026 (`d9f583f`); řádek „🔴 CHYBÍ" tu stál omylem až do 11. 10. 2026 |
| Portál `pavelkubiznak.github.io/villa-rudolf-portal/` pro hosty | ✅ **od 11. 10. 2026 jen demo** — hosta s `?t=` přesměruje na `villarudolf.com/pruvodce/?t=`; `index.html` rozdělen na `index.html` + `app.js` |
| Sezóna výletů v jádru portálu | ✅ **od 11. 10. 2026:** zima 1. 12.–31. 3., léto 1. 4.–14. 10., 15. 10.–30. 11. jen celoroční výlety (do té doby lyže od 15. 10. — marketingová hranice webu v `assets/season.js` zůstává 15. 10., to je jiná věc). ⚠️ `/pruvodce/` (`assets/planner.js`) a `tv/tv.js` na `main` filtrují výlety ještě podle marketingové sezóny 15. 10.; stejná hranice 1. 12. pro ně je ve větvi `claude/portal-audit-planner`, dokud se nesloučí, host na webu vidí lyže od 15. 10. |

**Počty výletů se do dokumentace nepíšou natvrdo** — kdo je potřebuje, spočítá je:
`node -e 'const j=require("./data/trips.json");console.log(j.trips.length,j.food.length)'`
v klonu portálu (nebo `loadTripCounts()` v `assets/site.js`). Hodnoty výš platily 11. 10. 2026.

**Odkaz na průvodce hosta platí 14 dní po odjezdu** — `expires_at = departure + 14 dní`
(`20260915_vr_token_enc.sql`, ř. 138), ne 30. Kdo kde píše „30 dní", píše špatně (portál to
hostovi tvrdil do 11. 10. 2026; `README.md` a `schema.sql` portálu opravuje audit). V živé DB
má k 11. 10. 2026 ještě 10 starších řádků (založených před 15. 9.) `expires_at = departure + 30`,
20 už +14 — přepočítá se při každé úpravě pobytu ve `/sprava/`. Po vypršení
`vr_verify_token` vrátí prázdno a `/pruvodce/` běží ve veřejném režimu. Od 11. 10. 2026 funkce
hostovi **nevrací `notes`** (viz zpevnění DB v sekci Kalendář).

---

## 💬 Zprávy hostovi → `villa-rudolf-site/sprava/`

| | Stav |
|---|---|
| Šablony zpráv ve 4 jazycích (cs/de/en/pl), **všechny vykají** | ✅ v `sprava.js` + kopie v `n8n/VrDailyTasks` (hlídá `tools/test-zpravy.mjs`) |
| Sekvence: první ozvěna → uvítací (T−10) → update (T−2) → den 2 → před odjezdem → recenze | ✅ 13. 10. 2026 |
| Log ve `vr_msglog` (`vr_admin_msg_log`, libovolný `msg_key`) | ✅ — nese i odpověď hosta, „přeskočeno" a podmínky pobytu |
| Kód od dveří z telefonu, v uvítací zprávě i v updatu | ✅ |
| Hosté z platforem: „Zkopírovat pro platformu" + krátká průvodní zpráva na WhatsApp | ✅ 13. 10. 2026 |
| Přehled „Co doplnit" (jedna tabulka, čipy) | ✅ |
| Odpověď hosta: jede / váhá / neodpověděl | ✅ ruční v1 — WhatsApp ani platformy se nečtou; mlčícím se nepřipomíná |
| **Nasadit `VrDailyTasks` do n8n** (`tools/n8n-patch-vrdailytasks.py`) | ⏳ ručně po merge |
| **Vyplnit heslo Wi-Fi v Nastavení** (bez něj uvítací zpráva nejde odeslat) | ⏳ Pavel |
| **Kliknout „Vytvořit trvalé odkazy všem"** (pobyty bez `token_enc`) | ⏳ Pavel |
| **Vyplnit, jak se platí poplatek** — jednou za platformu (zaškrtávátko „stejně i dalším pobytům z …") | ⏳ Pavel |
| **Přečíst překlady z češtiny** (de/en/pl): první ozvěna, uvítací zpráva, update, průvodní zpráva | ⏳ Pavel |
| **Dohodnutý čas příjezdu → platnost kódu v zámku** (`vr_ha_stay` → Home Assistant, jiné repo) | ⏳ další krok — do té doby `/sprava/` u dřívějšího příjezdu varuje |

**✅ Systém, který práci ubírá — 11. a 13. 10. 2026.** Pavlova výtka: „vytvořil jsem si systém, který
mě buzeruje, místo aby mi pomáhal" — musel chodit host po hostovi a doplňovat tabulky, a sekvence
zpráv neodpovídala tomu, co doopravdy posílá. Češtinu textů Pavel schválil 13. 10. 2026; de/en/pl
jsou z ní přeložené.

- **První ozvěna místo „Potvrzení rezervace" v T−30.** Na řadě je hned, jak má pobyt hosta
  s telefonem, i když je příjezd za rok — smysl je zahájit konverzaci a včas poznat, kdo váhá.
  Říká, že je pobyt potvrzený, vede na web v jazyce hosta (`#interier`, `#loznice`, video podle sezóny —
  **ne na keypano**), zve naplánovat si výlety už teď (veřejný plánovač `/vylety/`, pro de/en/pl
  s `?lang=` — osobní průvodce `/pruvodce/?t=` je až v uvítací zprávě) a vysvětlí doklady: cizincům celý odstavec o knize hostů a cizinecké policii,
  **českým hostům kratší verzi bez cizinecké policie**. Žádná otázka na počty, žádné postýlky,
  žádná registrace, o stornu se nemluví. 14 dní před příjezdem už nemá smysl a nenabízí se.
  Odstavec o novince (schodiště) dostanou jen příjezdy 19. 12. 2026 – 31. 12. 2027 — je to **jedna
  konstanta `NEWS`** v `sprava.js` a ve `VrDailyTasks.code.js`.
  ⚠️ Text říká „teď dům dáváme dohromady": **po 18. 12. 2026 ho přepiš do minulého času**, za rok vyměň.
- **Uvítací zpráva odchází T−10** a nese adresu, kód ke dveřím, video, odkaz na výlety podle počasí,
  Wi-Fi, knihu hostů a poplatek, noční klid a kontakty. **Bez odkazu na registraci** — zapisuje se až
  na místě přes QR na lednici (kdo se zapíše předem a nepřijede, za toho se pak platí poplatek).
  Letní a zimní modul jako druhá část zanikl („je to ve videu"); video se vybírá podle `isWinter(příjezd)`:
  letní `ksVpDr-P8ic` (průvodce domem, zahradou, bazénem a saunou), zimní `tWCuuovnh2U` (prohlídka domu,
  zápis přes QR, sauna, skibus). Neodešle se, dokud chybí trvalý odkaz, kód (= telefon) nebo heslo Wi-Fi.
- **Update T−2** — krátká zpráva s kódem a časem. Slovo „pozítří / zítra / dnes" se bere podle
  skutečného počtu dní do příjezdu, takže zpráva odeslaná o den později nelže.
- **Tři údaje u pobytu** (editor „Upravit údaje pobytu"): dohodnutý čas příjezdu (jinak 15:00; zprávy
  pak říkají ten čas i u platnosti kódu), jak se platí poplatek (na místě / v ceně rezervace / z kauce
  podle smlouvy) a jestli se z kauce účtují i energie. Podle toho se do uvítací zprávy vloží jedna ze
  čtyř vět; nevyplněno = žádná věta a čip v „Co doplnit". Přímý prodej bez volby = z kauce (smlouva § 6).
  Částka za konkrétní počet osob se do zprávy **nepočítá**. Úložiště: značky ve `vr_msglog`
  (`arrive_HHMM`, `fee_onsite` / `fee_included` / `fee_deposit`, `fee_energy`) — bez migrace.
  ⚠️ **Zámek pouští vždy až od 15:00**: dřívější dohodnutý příjezd se do něj sám nepropíše
  (`vr_ha_stay` → Home Assistant). `/sprava/` na to v editoru i v detailu upozorní; propsání je další krok
  a tehdy bude lepší dát času vlastní sloupec ve `vr_bookings`.
- **Hosté z platforem** (Airbnb, Booking.com, Fewo-direkt, E-chalupy) mají u každé zprávy dvě tlačítka:
  „Zkopírovat pro platformu" (stejný text bez WhatsApp hvězdiček) a WhatsApp. U první ozvěny a uvítací
  zprávy jde na WhatsApp jen krátká průvodní zpráva („informace jsem vám poslal přes …"), celý text
  zůstává jako druhá možnost. Důvod: záznam na platformě je pojistka při škodě, WhatsApp je osobní kanál.
  U „Přímá" zůstává jen WhatsApp.
- **„Co doplnit"** — jedna tabulka pod „Dnes na řadě": řádek = pobyt, čipy = co chybí (host,
  telefon, počet dospělých, věky dětí, trvalý odkaz, jak se platí poplatek), nahoře heslo Wi-Fi. Klik
  na čip otevře rovnou to pole a po uložení vrátí zpět na přehled. Kompletní pobyt se neukáže, jen se
  započte do souhrnu. Způsob placení jde jedním uložením nastavit všem pobytům z téže platformy.
  **Nehlásí se** e-mail (platformy ho nedávají), kód dveří, který jde odvodit z telefonu, ani čas
  příjezdu (má výchozí hodnotu). Sekce Problémy zůstala jen pro věci s termínem.
- **Odpověď hosta** — v detailu tři tlačítka (jede / váhá / neodpověděl), v přehledu barevná značka.
  Kdo váhá, svítí nahoře v „Dnes na řadě" i v denním e-mailu, dokud se stav nezmění. **Mlčícím se
  nepřipomíná** (Pavel: „nic dalšího písemně nechávat nechci") — jen je to vidět na značce „bez odpovědi".
- **Méně šumu.** V řádku úkolu jde rovnou odkliknout „✓ Odesláno". Úkoly, které už nedávají smysl
  (první ozvěna těsně před příjezdem, kroky před příjezdem u pobytu, který začal), se nezobrazují jako
  dluh — dole je jedno tlačítko „Označit starší jako vyřízené" (značka `skip_<krok>`, ne „odesláno").
- **Počty osob.** Databáze prázdný počet dospělých sama doplní dvojkou (`coalesce(p_adults, 2)`),
  takže „2 dospělí, žádné dítě" bez značky `guests_ok` se bere jako **nevyplněno** (čip, odhad poplatku
  v detailu). Do zpráv hostům se počty už nepropisují.

**Jazyk zpráv:** čeština, němčina i polština **vykají** („Sie", „Guten Tag", „Państwo") — Pavel
13. 10. 2026: „v němčině nebudeme nikomu tykat". Pozor na rozdíl proti webu a inzerátům, kde němčina
tyká v množném čísle (`villa-rudolf-portal/docs/text-villa-rudolf.md`); pro zprávy to neplatí.

**Značky ve `vr_msglog`** (bez migrace, RPC bere libovolný klíč): `first`, `welcome`, `update`, `day2`,
`predeparture`, `review`, `deposit_charge`, `deposit_return`, `balance_invoice` = kroky;
`skip_<krok>` = vyřízeno bez odeslání; `reply_ok` / `reply_risk` = host jede / váhá; `guests_ok` = počty
osob zapsal majitel; `arrive_HHMM`, `fee_*` = podmínky pobytu; `deposit_enabled`, `yale_set` = starší.
Staré klíče `confirm` (počítá se jako `first`), `registration` a `doorcode` v logu zůstávají a nic nerozbijí.

**Lokální zkoušení bez klíče a bez databáze:** `node tools/sprava-harness.mjs` →
`http://localhost:4173/sprava/` s vymyšlenými pobyty (`tools/sprava-harness-data.mjs`), „dnešek"
zamrazený na 11. 10. 2026. `node tools/test-zpravy.mjs` hlídá shodu šablon mezi `/sprava/` a n8n,
zástupky, vykání, zákaz keypano a odkazu na registraci a obsah denního e-mailu nad týmiž daty.

**Zbývá (mimo tenhle krok):**
- Dohodnutý čas příjezdu propsat do platnosti kódu v zámku (`vr_ha_stay`, repo `jablotron - topení`).
- Odpovědi hostů se zapisují ručně. Napojení WhatsAppu / platforem je další etapa.
- Úkol „Vystavit doplatkovou fakturu" (T−72) se nabízí každé přímé rezervaci, i té zaplacené
  najednou — vědět by se to dalo z `vr_contracts` (`single` / `split`).
- Počty osob: „nevím" se pozná jen podle výchozího 2 + 0 bez značky. Čistší by byl `adults`
  jako `null` — chce to migraci `vr_admin_upsert_booking` (dnes `coalesce(p_adults, 2)`).

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

## 🪪 Registrace hostů → `/registrace/` (kontrola data narození a čísla dokladu)

Za správnost údajů v knize hostů ručí ubytovatel. Pokuta 500 Kč přišla za číslo polského
dokladu, které neodpovídalo polskému formátu; hosté taky zadávali správný den a měsíc
narození s rokem 2026 (kolečko v telefonu začíná dneškem).

| | Stav |
|---|---|
| Datum narození jako tři políčka (den, měsíc, rok – rok se píše celý, nic není předvyplněné) | ✅ **13. 10. 2026** (PR, čeká na merge) |
| Budoucnost a věk nad 110 let formulář odmítne; u miminka a letošního/loňského roku se zeptá „Opravdu je hostovi X měsíců?“ | ✅ 13. 10. 2026 |
| Stejná mez (110 let) v databázi – `_vr_persons_insert` | 🟡 **migrace `20261013_vr_persons_birth_limit.sql` připravená, neaplikovaná** (živá DB odmítá jen budoucnost a rok < 1900) |
| Číslo dokladu podle státu a druhu (pas / průkaz), tabulka v `registrace/doklady.js` | ✅ 13. 10. 2026 – DE, CZ, PL, NL, BE, AT, SK; jen pas u UK a IT |
| Kontrolní číslice: polský dowód a pas (tvrdě), belgická eID (jen varuje), německé doklady (jen když host opíše 10 znaků ze strojové zóny) | ✅ 13. 10. 2026 |
| Stát bez pravidla nebo „Jiný doklad“: obecná kontrola + zaškrtnutí „opsal(a) jsem přesně“ | ✅ 13. 10. 2026 |
| Čtečka dokladu foťákem (strojově čitelná zóna, celé v prohlížeči) | 🟡 **prototyp, vypnutý** – vidět je jen s `?ctecka=1`; čte, ale v simulaci jednou přijal špatně přečtené číslo (viz níž) |

**Kde co je.** `registrace/doklady.js` = čisté funkce bez DOM (meze data narození, tabulka `RULES`
se zdrojem u každého státu, kontrolní číslice). `registrace/registrace.js` = formulář a texty
(cs/en/de/pl). Test: `node tools/test-doklady.mjs` (350 kontrol – úřední vzory z PRADO a ministerstev,
překlepy, texty ve všech jazycích). Zkoušení bez živé DB: `node tools/registrace-harness.mjs`
→ `http://localhost:4174/registrace/?t=demo` (lednicová cesta: bez `?t=`, kód 12345).

**Tvrdé pravidlo je jen tam, kde je formát doložený úředně** (zákon, ministerstvo, PRADO).
Číslo, které na něj nesedí, formulář nepřijme, ukáže vzor a kde na dokladu číslo je. Pojistka
pro doklad, který do pravidla nepatří (povolení k pobytu, starší vzor): druh „Jiný doklad“.
Co doložit nešlo a proč:
- **Polsko:** váhy kontrolní číslice nejsou v žádném předpisu; drží na všech 7 úředních vzorech
  z PRADO a u dowodu je potvrzuje školicí materiál policie. Kdyby se ozval Polák s platným
  dokladem, který neprojde, je to první místo, kam se podívat (`RULES.PL` v `doklady.js`).
- **Belgie:** kontrola mod 97 u eID nesedí na dvou úředních vzorech → jen se ptá, neblokuje.
- **Rakousko:** zdroj je Město Vídeň + vzory PRADO, spolkový předpis formát neurčuje → pravidlo
  je schválně volnější.
- **Francie, USA, Dánsko, Švýcarsko, Maďarsko, Ukrajina, italský průkaz:** formát jen ze vzorů
  v PRADO, bez textového zdroje → zůstávají v obecné kontrole.

**Čtečka dokladu – prototyp (13. 10. 2026), pro hosty vypnutý.** `registrace/ctecka.js` +
`registrace/mrz.js` + `vendor/tesseract/` (Tesseract.js 5.1.1 a model na písmo OCR-B, obojí v repu,
žádné CDN). Host namíří foťák na řádky se znaky `<<<`, čte se celé v prohlížeči, obraz se nikam
neodesílá ani neukládá, do formuláře jde jen text. Tlačítko je vidět jen s `?ctecka=1`
(`SCAN_ON` v `registrace.js`) a jen na telefonu s WebAssembly SIMD.
- **Velikost:** asi 2,8 MB, stáhne se až po klepnutí na tlačítko (v repu 5,6 MB).
- **Rychlost:** 0,15–0,25 s na snímek na Macu, na telefonu odhadem 0,5–1 s; průměrně 3–4 snímky.
- **Úspěšnost v simulaci** (vymyšlené doklady v písmu OCR-B, snímky zhoršené jako z ruky: náklon,
  rozmazání, šum, odlesk; 96 pokusů): 87 přečteno správně, 8 nepřečteno do 8 snímků,
  **1 přijat se špatným číslem dokladu**. Pět úředních vzorů (DE průkaz a pas, PL a NL průkaz)
  přečetl správně. **Na skutečném telefonu se skutečným dokladem neměřeno.**
- **Proč není zapnutá:** kontrolní číslice strojové zóny (váhy 7-3-1, mod 10) nepozná záměnu
  znaků, jejichž hodnoty se liší o 10 – a právě ty si OCR plete (Q↔G, G↔6, P↔F, S↔8). Ze 518
  snímků, kde seděly všechny kontrolní číslice, bylo 11 špatně (6× číslo dokladu, 5× jméno –
  jméno kontrolní číslici nemá vůbec). Pojistka „dva shodné snímky + jistota OCR ≥ 75“ jich většinu
  odfiltruje, ale ne všechny. Špatné číslo, které vypadá věrohodně, je horší než ruční opis.
- **Co by ji mohlo pustit:** rozhodovat podle jistoty jednotlivých znaků (Tesseract ji vrací),
  u států s pravidlem křížová kontrola s `doklady.js`, jméno nepředvyplňovat, a hlavně zkouška
  na několika skutečných telefonech a dokladech. Test rozboru: `node tools/test-mrz.mjs`.
- Chybové stavy ověřené: foťák nepovolený („vyplňte ručně“), telefon bez podpory (tlačítko není).

**Po merge ručně:**
1. Aplikovat migraci `20261013_vr_persons_birth_limit.sql`: přes konektor Supabase / `supabase db query --linked --file …`,
   nebo vložit obsah souboru do SQL editoru v Supabase. Workflow „DB migrace“ zatím nejde použít –
   repo nemá secret `SUPABASE_DB_URL` (ověřeno 13. 10. 2026, workflow ještě nikdy neběžel).
2. Na vlastním telefonu projít `/registrace/` z QR na lednici: datum narození, český průkaz a pas.
3. V živé DB je k 13. 10. 2026 **jeden** záznam s rokem narození v roce pobytu nebo o rok dřív
   (z 14 osob) – ve `/sprava/` ověřit, jestli je to opravdu miminko.

**Otevřené:** `/sprava/` nedovolí opravit číslo dokladu ani datum narození u zapsané osoby
(host ji musí smazat a zapsat znovu, nahlášenou smazat nejde). V hlavičce formuláře se na
šířce 375 px v němčině překrývá štítek „Gästeregistrierung“ s přepínačem jazyků.

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

Všechno v repu je napsané a zmergované; **co zbývá, jsou ruční kroky mimo repo** (n8n, extranety,
router, Nastavení). **Živá DB je od 15. 9. 2026 srovnaná s migracemi v repu** (holds, payments,
contracts, purge lockdown, wifi config); **11. 10. 2026 přibyly `20261011_vr_portal_hardening.sql`
a `20261011_vr_purge_cron.sql`** (nasazeny konektorem, soubory ve větvi `claude/portal-audit` —
než se sloučí, je živá DB o tyhle dvě napřed před `main`). Další migrace jdou nasadit z GitHubu: fronta
`supabase/DEPLOY.txt` (workflow „DB nasazení z fronty" běží po merge do `main`) nebo ruční
Actions „DB migrace (Supabase)"; obě potřebují repo secret `SUPABASE_DB_URL` (dosud chybí,
postup v hlavičce `.github/workflows/db-migrate.yml`). Třetí cesta je konektor Supabase
v Claude Code, kterým proběhlo nasazení 15. 9.

1. ~~Zablokovat 14.–21. 8. a 21.–28. 8. 2027 na platformách~~ — **není potřeba**: všechny tři
   srpnové přímé prodeje (7.–14., 14.–21., 21.–28. 8.) jsou ve všech čtyřech výstupních feedech
   kalendáře (`data/out/*.ics`, ověřeno 23. 9. večer) a platformy je importují od 17. 9.
   U 21.–28. 8. zbývá **ověřit platbu**, než předrezervace 25. 9. propadne (viz Předrezervace, bod 4).
2. ~~`vr_purge_expired`~~ — **zamčeno 15. 9.**, ale pak 26 dní neběžela; **od 11. 10. retence
   běží přes pg_cron** (viz sekce Kalendář). Cron, skript i hlídač `vr-purge` na velínu zrušeny 11. 10. 2026
3. **Heslo Wi-Fi** — ~~migrace `20260915_vr_admin_config_wifi.sql`~~ nasazena 15. 9.; zbývá vyplnit
   v `/sprava/` → Nastavení, **změnit heslo na routeru** (staré je v git historii veřejného repa) a přidat
   uzel „Načíst konfiguraci" do n8n `VrDailyTasks` — na serveru to udělá
   `python3 tools/n8n-patch-vrdailytasks.py <export.json> <patched.json>` (postup v jeho hlavičce)
4. ~~Spustit migrace `20260909_vr_holds.sql` a `20260910_vr_payments.sql`~~ — **hotovo 15. 9.**
   (i `20260915_vr_contracts.sql`). Faktura + smlouva na 21.–28. 8. vystavené 15. 9.; přenos
   z `verified.json` do `vr_holds` spuštěn 23. 9. (PR #13);
   teď **ověřit platbu před 25. 9.** a **re-import `VrConflictWatch`**
5. **Ověřit `supabase functions deploy album`** — oprava uploadu bez tokenu je v repu od 8. 9.,
   ale že nasazení proběhlo, není nikde zapsáno
6. **Secrety pro feedy jednotlivých kanálů** (Airbnb, Booking, FeWo, Megaubytko) — kód čeká nasazený, stačí URL z extranetů + zkušební běh
7. **Retence pobytů** — ~~30denní mazání bookingů bez osob~~ **rozhodnuto auditem 11. 10. 2026:
   anonymizovat, nemazat** (pg_cron `vr-purge-expired`, viz sekce Kalendář; Pavel může změnit).
   Zbývá 18měsíční prune `history.json` v repu kalendáře
8. **Etapa 2 předrezervací** — párování plateb z iDokladu a Fia (viz sekce výš)
9. ~~**Polština u výletů**~~ — **hotovo už 17. 7. 2026** (`trips.json`, všech 53 výletů cs/de/en/pl; rozhraní portálu 13. 8.) — bod tu byl omylem
10. ~~**Zprávy** — až bude jasné zadání~~ — hotovo 13. 10. 2026 (první ozvěna, „Co doplnit", odpověď hosta); zbývá nasazení do n8n
11. **Rozhodnutí Pavla z auditu portálu 11. 10. 2026** — seznam v `MAPA-SYSTEMU.md` → Otevřené
    (oddělení Supabase od SINTERA, zálohy Supabase na free plánu, přepis git historie portálu,
    šifrování záloh z Hetzneru na Drive, Google Fonts)

~~Šrafování v kalendáři~~ — hotovo 13. 8. · ~~Nepotvrzené záznamy v kalendáři~~ — hotovo 9. 9. ·
~~Import `VrConflictWatch` do n8n~~ — nahráno 12. 9. · ~~Úklid PR~~ — 15. 9.

---

## 🧹 Stav repa 15. 9. 2026

Průchod celého repa proti tomuhle souboru. Kód sedí s tím, co tu stojí: filtr duchů je
opravdu na všech třech místech, testy v `tools/` procházejí, žádné `TODO`, žádné rozbité
odkazy, žádné otevřené issue. Uděláno v ten den:

- **PR #4** (adresa není v jednom zdroji pravdy) zmergován — `MAPA-SYSTEMU.md` do té doby
  tvrdila opak.
- **PR #5** zavřen jako překonaný — jeho jediná změna už byla v `main` přes #6.
- **PR #8** (předrezervace + platby) byl založený **před** opravou duchů (#7): jeho verze
  `detect.js` a `sprava.js` filtr `stale` neměly a jeho export `VrConflictWatch.workflow.json`
  by po nahrání do n8n vrátil tři falešné konflikty. Do větve zamergován `main`, konflikt
  v exportu vyřešen znovuvložením sloučeného `detect.js` (konvence: embedded == celý soubor),
  ověřeno na všech třech místech, pak zmergováno.
- **Heslo Wi-Fi ven z repa** — viz audit níž, položka „Opraveno 15. 9.".
- Migrace `20260915_vr_interests.sql` (zájmy party, z portálu) je v `main` a **aplikovaná
  v živé DB 15. 9.** — tím je v migracích konečně i `vr_verify_token`.
- **Živá DB srovnaná s repem** (15. 9. odpoledne, přes konektor Supabase): purge secret + purge
  lockdown + wifi config nasazeny a ověřeny dotazem. Cestou vzniklo workflow „DB nasazení
  z fronty" (`supabase/DEPLOY.txt`, běží jen po merge do `main`; nález Codexu: nikdy nad PR,
  psql umí shell a log veřejného repa je veřejný) — pro příště, až bude secret `SUPABASE_DB_URL`.

---

## 🔍 Audit repa 8. 9. 2026 → `villa-rudolf-site`

Průchod celého repa: 32 hledačů (oblast × lens), 187 nálezů, skeptické ověření doběhlo
jen u části (limit účtu), zbytek ověřen ručně. Opravené je níž, neopravené pod tím.

**Opraveno (druhý commit, ostatní oblasti):**
- **Edge Function `album`: akce `upload` vydávala podepsanou upload URL bez ověření tokenu**
  — kdokoli s libovolným řetězcem mohl plnit bucket `vr-album` (cizí album ne, úložiště ano).
  Teď se před podpisem volá `vr_album_open`. **Nasadit:** `supabase functions deploy album`
  — *15. 9.: že nasazení proběhlo, není nikde zapsáno; ověřit a doplnit sem datum.*
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

**Opraveno 15. 9. (heslo Wi-Fi):** konstanta `WIFI` zmizela ze `sprava/sprava.js` i z n8n
`VrDailyTasks.code.js`. `/sprava/` čte `wifi_password` z `vr_admin_config` (pole v Nastavení),
n8n ho čte novým uzlem „Načíst konfiguraci (service-role)" (definice a zapojení v exportu).
Když hodnota chybí, zůstane ve zprávě viditelně `{WIFI_HESLO}` — nic nespadne, jen to
připomene chybějící krok. Migrace `20260915_vr_admin_config_wifi.sql` **nasazena 15. 9.** (whitelist
`ubyport_*` + `wifi_*` ověřen v živé DB). **Zbývá ručně:** vyplnit Nastavení, změnit heslo na routeru
(staré je v git historii), uzel do n8n.

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
  stejný prefix `20260724` — abecední pořadí neodpovídá pořadí nasazení. *15. 9.:* `vr_verify_token`
  už v migracích je (`20260915_vr_interests.sql`), zbytek dál chybí. *11. 10.:* `vr_verify_token`
  znovu definuje `20261011_vr_portal_hardening.sql` (bez `notes`).
- `_vr_admin_auth`: rate-limit nepočítá neúspěšné pokusy (insert stopy se s výjimkou
  odrolluje) — online brute-force není throttlovaný. Řešení: stopu zapisovat mimo transakci
  nebo vracet boolean místo výjimky.
- ~~`vr_persons_add_by_date` (lednicový QR): kdokoli na internetu může zapisovat osoby do zákonné
  evidence — chybí druhý faktor (kód pobytu na QR).~~ **Vyřešeno 23. 9. 2026:** lednice vyžaduje
  kód od dveří (`vr_fridge_open`, migrace `20260923_vr_fridge_code.sql`), stará cesta vrací `code_required`.
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
| výlety — zobrazení, zprávy, `/sprava/` | `villa-rudolf-site` | `~/villa-rudolf-site` |

**Jedna práce = jedna session.** Session začíná přečtením `MAPA-SYSTEMU.md` a tohohle souboru,
ne prohledáváním repozitářů.
